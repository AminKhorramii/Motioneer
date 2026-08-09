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
import path from 'node:path'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const WAIT_MS = Number(process.env.WALL_WAIT_MS ?? 900_000)
// the one version this package has, told to clients instead of a number nobody bumps
const VERSION = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  .then((raw) => JSON.parse(raw).version)
  .catch(() => '0.0.0')

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
        oneLiner: {
          type: 'string',
          description:
            'One sentence a stranger would understand, saying what this is. Fill this in: you ' +
            'have already read the project and know it, and supplying it here saves a whole ' +
            'model call that would otherwise re-read your own brief to work it out.',
        },
        what: { type: 'string', description: 'What it is, in at most two sentences.' },
        audience: { type: 'string', description: 'Who it is for, in a few words.' },
        cta: {
          type: 'string',
          description: 'The words on the main button, naming the action: "Download for macOS" rather than "Get started".',
        },
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

/**
 * The three files a choice leaves behind, read as one answer.
 *
 * chosen.md is the marker as well as the spec, because it is written last, so finding it means
 * the other two are already there. The structured page is only offered once it parses and says
 * which shape it is: a reader that hands an agent a half written file, or one from a version
 * that meant something else by it, is worse than one that says nothing.
 */
async function readChosen(dir) {
  const at = handoffDir(dir)
  const spec = path.join(at, 'chosen.md')
  if (!existsSync(spec)) return null
  const page = path.join(at, 'chosen.json')
  const structured = await readFile(page, 'utf8')
    .then((raw) => (JSON.parse(raw).format === 2 ? page : null))
    .catch(() => null)
  return {
    at,
    spec: await readFile(spec, 'utf8'),
    html: existsSync(path.join(at, 'chosen.html')) ? path.join(at, 'chosen.html') : null,
    structured,
  }
}

/**
 * How a chosen design is told to an agent.
 *
 * The spec is the thing to implement, and the two files beside it are there to be read rather
 * than copied: one is what the page looked like, the other is the page as data, for anything
 * that would rather walk the sections than parse prose.
 */
const chosenText = (got) =>
  [
    `A design was chosen and written to ${got.at}. Implement it in this project's own stack ` +
      `rather than copying the reference file: the spec below carries the tokens, the structure ` +
      `and every word.`,
    // a file that is not there is not named, so nothing sends a reader to a path that fails
    [got.html && `Reference render: ${got.html}`, got.structured && `Structured page: ${got.structured}`]
      .filter(Boolean)
      .join('\n'),
    got.spec,
  ]
    .filter(Boolean)
    .join('\n\n')

/**
 * Which desktop to open.
 *
 * One shell now, looked for where a build leaves it. The binary is spawned rather than opened by
 * bundle, because `open` does not carry environment through and the request path travels that
 * way. Nothing found means the browser route, which needs no build at all.
 */
function findShell() {
  // set when a run should take the browser route regardless of what is installed
  if (process.env.WALL_NO_DESKTOP) return null
  const tries = [
    process.env.WALL_APP,
    path.join(ROOT, 'src-tauri/target/release/bundle/macos/Wall.app/Contents/MacOS/wall'),
    path.join(ROOT, 'src-tauri/target/release/wall'),
    path.join(ROOT, 'src-tauri/target/debug/wall'),
  ].filter(Boolean)
  for (const at of tries) if (existsSync(at)) return { cmd: at, args: [], shell: 'tauri' }
  return null
}

/**
 * The route that needs nothing installed.
 *
 * Starts the local server, which holds the keys and writes the handoff, then opens whatever
 * browser is already there. No download, no toolchain, and nothing for the operating system to
 * refuse to open, which matters because the install is the part of a first run that leaks most.
 */
function openInBrowser(request, at) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(ROOT, 'server', 'index.mjs')], {
      env: { ...process.env, PORT: '0', WALL_REQUEST: request, WALL_HANDOFF_DIR: at },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    const give = async (url) => {
      // written down as well as opened, so a browser that did not launch is still reachable
      await writeFile(path.join(at, 'open.txt'), url, 'utf8').catch(() => {})
      // start is a shell builtin rather than a program, so on Windows it has to be run by one
      const [cmd, args] =
        process.platform === 'darwin'
          ? ['open', [url]]
          : process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '', url]]
            : ['xdg-open', [url]]
      spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
      resolve({ child, url })
    }
    child.stdout.on('data', (d) => {
      out += d
      const m = out.match(/http:\/\/localhost:(\d+)/)
      if (m) give(m[0])
    })
    // if it never says where it is, there is nothing to open and nothing to wait for
    setTimeout(() => resolve({ child, url: null }), 8000)
  })
}

/** Launch the desktop app with the brief in hand, and wait for a design to appear on disk. */
async function design({ brief, name, oneLiner, what, audience, cta, dir }) {
  const at = handoffDir(dir)
  await mkdir(at, { recursive: true })
  // a stale answer from a previous run would resolve instantly and look like this one
  await rm(path.join(at, 'chosen.md'), { force: true })
  const request = path.join(at, 'request.json')
  // this file crosses versions: npx keeps this writer current while an installed reader can be
  // any age, so the shape carries its own number for a reader to refuse rather than misread.
  // Every field the schema asks for travels: the caller has already read the project and said
  // what this is, and dropping those here made the app spend a model call re-reading the brief
  // to work out what it had just been told. JSON.stringify leaves out whatever was not supplied.
  await writeFile(
    request,
    JSON.stringify({ format: 1, brief, name, oneLiner, what, audience, cta }, null, 2),
    'utf8',
  )

  const found = findShell()
  let server = null
  let where = 'the Wall window'
  if (found) {
    spawn(found.cmd, found.args, { env: { ...process.env, WALL_REQUEST: request }, stdio: 'ignore', detached: true }).unref()
  } else {
    const opened = await openInBrowser(request, at)
    server = opened.child
    if (!opened.url) return { noShell: true, at }
    where = opened.url
  }

  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    const got = await readChosen(dir)
    if (got) {
      server?.kill()
      return got
    }
    await new Promise((r) => setTimeout(r, 700))
  }
  return { waiting: true, at, where }
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
      return fail(id, `Wall could not open a window or a browser. The brief is written to ${got.at}.`)
    }
    if (got?.waiting) {
      return fail(
        id,
        `Wall is open at ${got.where} and waiting for a choice. Nothing has been picked yet.\n` +
          `Call collect with dir "${args?.dir ?? process.cwd()}" once they have, or read ` +
          `${path.join(got.at, 'chosen.md')} directly.`,
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
    return ok(id, chosenText(got))
  }
  if (name === 'collect') {
    const got = await readChosen(args?.dir)
    return got
      ? ok(id, chosenText(got))
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
          serverInfo: { name: 'wall', version: VERSION },
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
