#!/usr/bin/env node
/**
 * Wall as a tool an agent can call.
 *
 * The flow it exists for: you ask Claude Code for a landing page, it calls `design`, the
 * desktop opens with your brief already in it, you browse a wall of real pages and pick one,
 * and the choice comes back as a spec your agent implements in your actual codebase. The point
 * is that choosing happens where choosing is easy, and building happens where the code lives.
 *
 * The handoff is files in a directory rather than a return value, because a person browsing
 * takes longer than any sensible tool timeout. `design` waits, and if it gives up the answer
 * is still written to disk for `collect` to pick up later, or for the agent to simply read.
 *
 * JSON-RPC over stdio, spoken directly, so this stays dependency free like the rest.
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const WAIT_MS = Number(process.env.WALL_WAIT_MS ?? 900_000)

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const ok = (id, text) => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } })
const fail = (id, text) => send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text }] } })

const TOOLS = [
  {
    name: 'design',
    description:
      'Open Wall with a brief, let the person choose a landing page from eight, and return the ' +
      'chosen design as a spec to implement. Blocks while they choose. Use this when someone ' +
      'asks for a landing page, a marketing page, or a set of design directions to pick from.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description: 'What is being launched, in whatever shape it already exists. A README, a note, two sentences.',
        },
        name: { type: 'string', description: 'Product name, if it is known.' },
        dir: {
          type: 'string',
          description:
            'Absolute path of the project this design is for. Always pass it. This server runs ' +
            'as its own process and its working directory is not necessarily the project you ' +
            'are in, so leaving it out can write the handoff somewhere nobody looks.',
        },
      },
      required: ['brief'],
    },
  },
  {
    name: 'collect',
    description:
      'Read a design that was chosen after design() stopped waiting. Use this if design() timed ' +
      'out and the person has since picked one.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'The absolute project path design() was given.' },
      },
    },
  },
  {
    name: 'check',
    description:
      'Check a page for the patterns that make a design look generated rather than designed, ' +
      'and get the reason each one matters. Accepts raw HTML.',
    inputSchema: {
      type: 'object',
      properties: { html: { type: 'string', description: 'The page HTML to check.' } },
      required: ['html'],
    },
  },
]

const handoffDir = (dir) => path.join(path.resolve(dir ?? process.cwd()), '.wall')

async function readChosen(dir) {
  const at = handoffDir(dir)
  const spec = path.join(at, 'chosen.md')
  if (!existsSync(spec)) return null
  return {
    at,
    spec: await readFile(spec, 'utf8'),
    html: existsSync(path.join(at, 'chosen.html')) ? path.join(at, 'chosen.html') : null,
  }
}

/**
 * Which desktop to open.
 *
 * The Tauri build is the product, so it comes first; the Electron one is what the suites can
 * drive and stays as a fallback. The binary is spawned rather than opened by bundle, because
 * `open` does not carry environment through and the request path travels that way.
 */
function findShell() {
  const tries = [
    process.env.WALL_APP,
    path.join(ROOT, 'src-tauri/target/release/bundle/macos/Wall.app/Contents/MacOS/wall'),
    path.join(ROOT, 'src-tauri/target/release/wall'),
    path.join(ROOT, 'src-tauri/target/debug/wall'),
  ].filter(Boolean)
  for (const at of tries) if (existsSync(at)) return { cmd: at, args: [], shell: 'tauri' }
  try {
    return { cmd: require('electron'), args: [ROOT], shell: 'electron' }
  } catch {
    return null
  }
}

/** Launch the desktop app with the brief in hand, and wait for a design to appear on disk. */
async function design({ brief, name, dir }) {
  const at = handoffDir(dir)
  await mkdir(at, { recursive: true })
  // a stale answer from a previous run would resolve instantly and look like this one
  await rm(path.join(at, 'chosen.md'), { force: true })
  const request = path.join(at, 'request.json')
  await writeFile(request, JSON.stringify({ brief, name }, null, 2), 'utf8')

  const found = findShell()
  if (!found) return { noShell: true, at }
  const child = spawn(found.cmd, found.args, {
    env: { ...process.env, WALL_REQUEST: request },
    stdio: 'ignore',
    detached: true,
  })
  child.unref()

  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    const got = await readChosen(dir)
    if (got) return got
    await new Promise((r) => setTimeout(r, 700))
  }
  return null
}

async function check(html) {
  const { slop } = await import(path.join(ROOT, 'dist-core', 'core.js'))
  // the checks that read markup and CSS need no page model, so an empty one is honest here
  const flags = slop({ id: '', taste: {}, sections: [] }, html)
  return flags.length
    ? flags.map((f) => `- ${f.label}. ${f.why}`).join('\n')
    : 'Nothing generic found.'
}

async function call(name, args, id) {
  if (name === 'design') {
    const got = await design(args ?? {})
    if (got?.noShell) {
      return fail(
        id,
        'No Wall desktop app was found. Build one with `npm run app:bundle` for the packaged ' +
          'app, or `npm run app` to run it from source, then call design again. The brief is ' +
          `already written to ${path.join(got.at, 'request.json')} and will be picked up.`,
      )
    }
    if (!got) {
      return fail(
        id,
        `Wall is open and waiting for a choice. Nothing has been picked yet.\n` +
          `Call collect with dir "${args?.dir ?? process.cwd()}" once they have, or read ` +
          `${path.join(handoffDir(args?.dir), 'chosen.md')} directly.`,
      )
    }
    return ok(
      id,
      `A design was chosen and written to ${got.at}. Implement it in this project's own stack ` +
        `rather than copying the reference file: the spec below carries the tokens, the ` +
        `structure and every word.\n\nReference render: ${got.html}\n\n${got.spec}`,
    )
  }
  if (name === 'collect') {
    const got = await readChosen(args?.dir)
    return got
      ? ok(id, `Chosen design, from ${got.at}.\n\n${got.spec}`)
      : fail(id, `Nothing has been chosen yet in ${handoffDir(args?.dir)}.`)
  }
  if (name === 'check') return ok(id, await check(String(args?.html ?? '')))
  return fail(id, `unknown tool: ${name}`)
}

let buffer = ''
process.stdin.on('data', async (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'wall', version: '1.0.0' },
        },
      })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      await call(msg.params?.name, msg.params?.arguments, msg.id).catch((e) =>
        fail(msg.id, String(e instanceof Error ? e.message : e).slice(0, 300)),
      )
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
