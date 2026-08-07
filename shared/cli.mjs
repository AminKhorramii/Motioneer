/**
 * The model a Claude Code user already has.
 *
 * Someone who reached Wall through their agent has a working Claude session on the machine
 * already, and asking them for an API key to use a second one is a step that buys nothing. This
 * runs the local CLI headlessly instead, so the first run has nothing to configure and nothing
 * to sign up for.
 *
 * Two things make it affordable. The system prompt is identical across every call in a wall, so
 * the first call pays to build the cache and the eight after it read from it: measured, $0.144
 * then $0.0073 each. And the dynamic parts of the CLI's own prompt are excluded, along with any
 * MCP servers the user has configured, because none of it is relevant to writing a page and all
 * of it would be paid for.
 *
 * It is a subprocess rather than a request, which is the only reason it does not live in
 * providers.mjs beside the others.
 */

import { spawn } from 'node:child_process'

/** good enough to write with, and named here so a deployment can say otherwise */
export const CLI_MODEL = () =>
  (typeof process !== 'undefined' ? process.env?.WALL_CLI_MODEL : '') || 'sonnet'

/**
 * The model that designs the worlds, which need not be the one that writes the words.
 *
 * Measured on the same prompt, alternating: haiku reached the first world in 10.7s against
 * sonnet's 23.3s, and finished all eight in 45s against 74s. Both returned eight valid worlds.
 * Sonnet reached for the more particular object though, a nursery stake where haiku said
 * greenhouse, so this defaults to leaving it alone and exists to be tried.
 */
export const DESIGN_MODEL = () =>
  (typeof process !== 'undefined' ? process.env?.WALL_DESIGN_MODEL : '') || CLI_MODEL()

/**
 * How many of these may run at once.
 *
 * Every call is a whole CLI session, not a request, and a wall wants eleven or more of them
 * within a few seconds: the designs, then a page for each world as it lands. Measured with no
 * limit, a wall peaked at thirteen concurrent sessions, took 373s, left one straggler running
 * alone for two minutes after everything else had finished, and lost a page to a session that
 * exited without a reply. The work was not the problem. The contention was.
 *
 * So they queue. A call that has to wait its turn starts later and finishes sooner than one that
 * starts immediately and then fights for the machine.
 */
const MAX_AT_ONCE = Number(
  (typeof process !== 'undefined' ? process.env?.WALL_MAX_CALLS : '') || 5,
)
let running = 0
const waiting = []
function take() {
  if (running < MAX_AT_ONCE) {
    running += 1
    return Promise.resolve()
  }
  return new Promise((go) => waiting.push(go))
}
function give() {
  const next = waiting.shift()
  // the slot passes straight to whoever is next rather than being released and retaken
  if (!next) running -= 1
  else next()
}

/**
 * Run it, optionally handing back every delta as it arrives.
 *
 * Streaming matters more here than it looks. Designing eight worlds takes about fifty seconds,
 * and roughly half of that is the model thinking before it writes a character. The rest is
 * generation, and a caller that can see worlds finish one at a time can start writing the page
 * for world one while world eight is still being drawn.
 *
 * The streamed shape is the vendor's own frames wrapped one level deep, so the same delta
 * extraction works: type stream_event, event.type content_block_delta, event.delta.text.
 *
 * onThink is the other half of that stream and the reason the wait used to look like a hang.
 * Thinking arrives as its own kind of delta, and dropping it left the connection open with
 * nothing crossing it for over a minute, which reads as broken rather than busy. The text is not
 * ours to show, but the fact of it is, so it goes to a separate callback that never touches the
 * reply.
 */
export async function runClaude(system, user, { model = CLI_MODEL(), bin = 'claude', onDelta, onThink } = {}) {
  const streaming = typeof onDelta === 'function'
  await take()
  return new Promise((resolve) => {
    const child = spawn(
      bin,
      [
        '-p',
        ...(streaming
          ? ['--output-format', 'stream-json', '--include-partial-messages', '--verbose']
          : ['--output-format', 'json']),
        '--model', model,
        '--system-prompt', system,
        // the CLI's own context is about editing code, and this is about writing a page
        '--exclude-dynamic-system-prompt-sections',
        '--strict-mcp-config',
        // Nothing here is a task with steps. The reply is one JSON object, and a session that can
        // read and write files will sometimes go and do that instead of answering: measured, the
        // design call spent a whole round trip on a tool before writing a character. Handing it no
        // tools removes the detour and the definitions that described them.
        '--tools', '',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        // Thinking is most of the wait and also most of the design, which is why it stays on.
        //
        // Measured on the same eight-world prompt: with thinking the first character arrives at
        // 72.7s and the call takes 167s; without it, 2.3s and 69s. But the worlds that arrive
        // quickly are thinner ones. Each came back with fifteen to nineteen lines of CSS against
        // a floor of thirty, and described itself as "a wagering-ticket confidence for performance
        // media people" where the thinking run wrote "paid media pitched as a betting slip:
        // stakes, odds, blunt payout math". Same objects, half the design.
        //
        // So it is offered rather than taken. Turning it on is for the iteration loop, where
        // waiting three minutes to see whether a prompt change landed is its own kind of expensive.
        // Thinking is a dial and was wired as a switch. The two measurements above are its ends,
        // and nothing in between had been tried: WALL_THINKING sets the budget directly, so a
        // run can buy back most of the speed without giving up the whole of the design. Unset
        // leaves the model's own budget alone, which is what every measurement above was taken
        // with, and WALL_FAST still means none at all.
        env: process.env.WALL_THINKING || process.env.WALL_FAST
          ? { ...process.env, MAX_THINKING_TOKENS: process.env.WALL_FAST ? '0' : String(process.env.WALL_THINKING) }
          : process.env,
      },
    )
    // whichever way this ends, the next call in the queue gets the slot
    let ended = false
    const done = (result) => {
      if (ended) return
      ended = true
      give()
      resolve(result)
    }
    let out = ''
    let err = ''
    let text = ''
    let line = ''
    child.stdout.on('data', (d) => {
      if (!streaming) {
        out += d
        return
      }
      line += d
      const lines = line.split('\n')
      line = lines.pop() ?? ''
      for (const l of lines) {
        if (!l.trim()) continue
        let j
        try {
          j = JSON.parse(l)
        } catch {
          continue
        }
        const d = j?.type === 'stream_event' && j.event?.type === 'content_block_delta' ? j.event.delta : null
        if (!d) continue
        if (d.text) {
          text += d.text
          onDelta(d.text)
        } else if (d.type === 'thinking_delta') {
          // The CLI sends these with the words already taken out and a running token estimate in
          // their place, so there is nothing here to leak and nothing to test for truthiness: an
          // empty thinking field is the normal case, and the type is what says it happened.
          onThink?.(d.estimated_tokens ?? 0)
        }
      }
    })
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) =>
      done({
        error:
          e.code === 'ENOENT'
            ? 'the claude command was not found on this machine'
            : String(e.message ?? e).slice(0, 160),
      }),
    )
    child.on('close', () => {
      if (streaming) {
        return done(text ? { text } : { error: (err || 'no reply').slice(0, 200) })
      }
      try {
        const j = JSON.parse(out)
        if (j.is_error) return done({ error: String(j.result ?? 'the session returned an error').slice(0, 200) })
        return done({ text: String(j.result ?? '') })
      } catch {
        return done({ error: (err || out || 'no reply').slice(0, 200) })
      }
    })
    child.stdin.end(user)
  })
}
