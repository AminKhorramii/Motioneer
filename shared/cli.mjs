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
 * Run it, optionally handing back every delta as it arrives.
 *
 * Streaming matters more here than it looks. Designing eight worlds takes about fifty seconds,
 * and roughly half of that is the model thinking before it writes a character. The rest is
 * generation, and a caller that can see worlds finish one at a time can start writing the page
 * for world one while world eight is still being drawn.
 *
 * The streamed shape is the vendor's own frames wrapped one level deep, so the same delta
 * extraction works: type stream_event, event.type content_block_delta, event.delta.text.
 */
export function runClaude(system, user, { model = CLI_MODEL(), bin = 'claude', onDelta } = {}) {
  const streaming = typeof onDelta === 'function'
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
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
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
        const delta = j?.type === 'stream_event' && j.event?.type === 'content_block_delta'
          ? j.event.delta?.text
          : ''
        if (delta) {
          text += delta
          onDelta(delta)
        }
      }
    })
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) =>
      resolve({
        error:
          e.code === 'ENOENT'
            ? 'the claude command was not found on this machine'
            : String(e.message ?? e).slice(0, 160),
      }),
    )
    child.on('close', () => {
      if (streaming) {
        return resolve(text ? { text } : { error: (err || 'no reply').slice(0, 200) })
      }
      try {
        const j = JSON.parse(out)
        if (j.is_error) return resolve({ error: String(j.result ?? 'the session returned an error').slice(0, 200) })
        return resolve({ text: String(j.result ?? '') })
      } catch {
        return resolve({ error: (err || out || 'no reply').slice(0, 200) })
      }
    })
    child.stdin.end(user)
  })
}
