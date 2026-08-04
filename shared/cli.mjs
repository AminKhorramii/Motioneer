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

export function runClaude(system, user, { model = CLI_MODEL(), bin = 'claude' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      bin,
      [
        '-p',
        '--output-format', 'json',
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
    child.stdout.on('data', (d) => (out += d))
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
