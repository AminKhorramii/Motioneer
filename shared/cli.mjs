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
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Is there a claude on this machine to run.
 *
 * The server used to answer this question with the word true, which is the one answer it is
 * never allowed to guess: a machine with no key and no CLI then showed eight arranged drafts
 * that look like finished pages until you read them, and said nothing. The search is the same
 * one spawn does with a bare command name, so what this reports and what a call would find
 * cannot disagree.
 */
export function hasClaude(bin = 'claude') {
  const env = (typeof process !== 'undefined' ? process.env : null) ?? {}
  // a name with a separator in it is a path, and spawn looks there rather than along PATH
  if (bin.includes('/') || bin.includes('\\')) return existsSync(bin)
  const suffixes =
    process.platform === 'win32'
      ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  return (env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => suffixes.some((ext) => existsSync(path.join(dir, bin + ext))))
}

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
 * The model that reads a brief into fields.
 *
 * This call is neither design nor writing. It pulls a name, a sentence, an audience and a button
 * label out of a paragraph somebody already wrote, and it is the only thing standing between
 * describing a product and seeing a wall, so what it costs is paid in the wait.
 *
 * The obvious saving was to send it to the small model, and measured on the same brief that is
 * wrong by a wide margin: sonnet took 10.1, 17.3, 13.5 and 14.8 seconds, haiku took 70.1, 67.5,
 * 86.3 and 64.6. Haiku is not slower at reading a brief, it is slower at deciding it has read
 * one, and the same runs with thinking turned off finished in 5.6 and 5.3 seconds respectively.
 * The wait was never the model. So this stays on the writing model, which also wrote the better
 * one liner every time, and the saving is taken by not thinking about it: see runClaude.
 */
export const INTAKE_MODEL = () =>
  (typeof process !== 'undefined' ? process.env?.WALL_INTAKE_MODEL : '') || CLI_MODEL()

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
 *
 * Eight, because that is now the wall. It was five when a wall was five design calls and eight
 * shorter copy calls arriving at staggered times; every place is a page written whole now, so a
 * wall is eight calls that all start together and a cap of five makes that two waves of one long
 * call each. Measured on the bench: 610 seconds for six papers. Thirteen at once was the number
 * that produced contention, a straggler and a lost page, and eight is well under it while making
 * a wall one wave instead of two.
 */
const MAX_AT_ONCE = Number(
  (typeof process !== 'undefined' ? process.env?.WALL_MAX_CALLS : '') || 8,
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
export async function runClaude(system, user, { model = CLI_MODEL(), bin = 'claude', onDelta, onThink, thinking, callMs, env } = {}) {
  const streaming = typeof onDelta === 'function'
  /**
   * How much this call may think, in tokens, or null to leave the model's own budget alone.
   *
   * A caller that passes a number is describing the job rather than tuning the app: reading a
   * brief into five fields has nothing to weigh up, and measured on the same brief, thinking
   * about it anyway cost 14.8 seconds against 5.6. WALL_THINKING and WALL_FAST are the dials for
   * everything that did not say, so a job that knows what it is wins over them.
   */
  const budget =
    thinking !== undefined
      ? String(thinking)
      : process.env.WALL_FAST
        ? '0'
        : process.env.WALL_THINKING
          ? String(process.env.WALL_THINKING)
          : null
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
        /**
         * The environment, which a caller may need to change.
         *
         * The one case that exists is an ANTHROPIC_API_KEY gone stale. The CLI picks it up and then
         * does not fail: measured, it simply never answers, and the only sign is this call hitting
         * its ceiling. 25 seconds and a timeout with the bad key present, 2.5 seconds and a reply
         * without it. So a caller falling back from a refused key to the command has to be able to
         * take the key away first, or the fallback inherits the exact thing it fell back from.
         */
        env: budget === null ? (env ?? process.env) : { ...(env ?? process.env), MAX_THINKING_TOKENS: budget },
      },
    )
    /**
     * A ceiling, because a session that never answers used to hang the whole wall.
     *
     * There was no timeout here at all. Every other failure was handled: a missing binary, a bad
     * key, a reply that is not JSON, a stream that stops. The one case nothing covered was the
     * process that simply never closes, and it is the worst of them, because the promise never
     * settles, Promise.all never resolves, the busy line never clears and the wall sits at seven
     * of eight for as long as the window is open. Measured on the bench three times: the wall
     * never finished, and the number being reported was the harness giving up.
     *
     * Generous rather than tight. A page written whole spends minutes thinking before it writes a
     * character, and killing real work would be a worse bug than the one this fixes.
     */
    // a caller that knows its own job may set a tighter one: a studio option is somebody waiting at
    // a screen, where four minutes of silence is indistinguishable from a broken button, while a page
    // written whole is worth waiting out
    const ceiling = Number(callMs || process.env.WALL_CALL_MS || 420_000)
    const bell = setTimeout(() => {
      child.kill('SIGKILL')
      done({ error: `the session did not answer within ${Math.round(ceiling / 1000)}s` })
    }, ceiling)
    // whichever way this ends, the next call in the queue gets the slot
    let ended = false
    const done = (result) => {
      if (ended) return
      ended = true
      clearTimeout(bell)
      give()
      resolve(result)
    }
    let out = ''
    let err = ''
    let text = ''
    let line = ''
    /**
     * What the session itself said went wrong.
     *
     * The CLI reports a failure as a frame on stdout, not as anything on stderr, and the streaming
     * reader only ever looked for content deltas: every other frame hit the continue below and was
     * gone. So a call that failed had no text and no error either, and the reason handed back was
     * whatever happened to be on stderr instead. Measured against a bad key, the CLI wrote
     * "Failed to authenticate. API Error: 401 API key is invalid." on stdout and one unrelated
     * warning about connectors on stderr, and the warning is what reached the wall. The
     * non-streaming path below has always read this frame; this is the same reading, on the path
     * that a wall actually uses.
     */
    let said = ''
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
        // the session's own verdict, kept whichever way the call ends
        if (j?.type === 'result' && j.is_error && j.result) said = String(j.result)
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
        /**
         * The session's reason first, and stderr last.
         *
         * A warning is not a failure, and the CLI writes both to the same place. It prefixes its
         * warnings, so they are dropped rather than reported: told that a call failed because
         * connectors are disabled, a person goes and looks at connectors, and the call had
         * actually failed on a bad key. Naming the wrong cause is worse than naming none.
         */
        const warned = err
          .split('\n')
          .filter((l) => l.trim() && !l.trimStart().startsWith('⚠'))
          .join(' ')
          .trim()
        return done(text ? { text } : { error: (said || warned || 'no reply').slice(0, 200) })
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
