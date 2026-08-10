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
 * takes longer than any sensible tool timeout. So `design` opens the wall, waits a few seconds
 * in case the choice is instant, and otherwise answers that the wall is open. That is not a
 * failure and is not reported as one: it is what happens almost every time, and an agent told
 * it failed will try again and throw away the wall the person is reading. `collect` is the
 * pickup, and the files stay on disk for it however long choosing takes.
 *
 * JSON-RPC over stdio, spoken directly, so this stays dependency free like the rest.
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

/**
 * Where this package was installed.
 *
 * Through fileURLToPath rather than the URL's own pathname, because a pathname is percent
 * encoded and is not a path: installed under a directory with a space in it, the space came
 * back as %20, so the package version read as 0.0.0 and the server this file spawns was looked
 * for at a path that does not exist, which reported itself as "could not open a browser". On
 * Windows the same pathname carries a leading slash before the drive letter and is not a path
 * at all. Both are ordinary places to install something.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
/**
 * How long to hold the call open before answering that the wall is open.
 *
 * This used to be fifteen minutes, on the theory that a person might choose inside it. No MCP
 * client waits that long, so the only thing the wait reliably produced was a tool error under a
 * window that was working perfectly. Seconds are enough to catch a choice that was already made,
 * and everything longer belongs to collect.
 */
const WAIT_MS = Number(process.env.WALL_WAIT_MS ?? 25_000)
/**
 * How long the server this process starts should outlive it.
 *
 * The call returns in seconds and the person browses for minutes, so the server cannot be killed
 * on the way out. The open tab beats every twenty seconds, so ten minutes of silence means the
 * tab is closed and there is nobody left to serve.
 */
const IDLE_MS = process.env.WALL_IDLE_MS ?? '600000'
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
      'Open Wall with a brief, so the person can compare eight complete landing pages and pick ' +
      'one. Use this when someone asks for a landing page, a marketing page, or a set of design ' +
      'directions to choose between. It returns as soon as the wall is open, usually in seconds, ' +
      'and returning without a choice is the normal outcome rather than an error: reading eight ' +
      'pages takes minutes. Tell them the wall is open, then call collect when they say they ' +
      'have chosen. Do not call this twice for the same brief, because a second wall replaces ' +
      'the one they are looking at.',
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
      'Read the design the person chose in Wall, as a spec to implement. This is the pickup for ' +
      'every design() call, because design returns while they are still looking. Call it when ' +
      'they say they have chosen. Nothing chosen yet is not a dead end: the wall is still open, ' +
      'so ask them and call this again rather than starting over.',
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
 * Start the desktop shell, and say whether it actually started.
 *
 * Node reports an exec failure asynchronously, so the answer is one tick away rather than
 * immediate. Waiting for it is what lets a shell that will not run fall back to the browser
 * instead of leaving somebody watching for a window that is never going to appear.
 */
function launchShell(found, request) {
  return new Promise((resolve) => {
    const child = spawn(found.cmd, found.args, {
      env: { ...process.env, WALL_REQUEST: request },
      stdio: 'ignore',
      detached: true,
    })
    child.on('error', () => resolve(false))
    child.on('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
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
    // The node running this file, by its full path, rather than the word node. An MCP server is
    // launched by whatever launched the client, and a client started from a desktop icon has the
    // login shell's PATH rather than a terminal's, which on any machine using nvm or fnm or
    // volta has no node on it at all. Asking for the interpreter that is already running this
    // line cannot miss.
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs')], {
      // This process leaves long before the browsing does, so the server is told to watch its own
      // traffic and stop when the tab stops beating. Nothing else is in a position to end it.
      env: { ...process.env, PORT: '0', WALL_REQUEST: request, WALL_HANDOFF_DIR: at, WALL_IDLE_MS: IDLE_MS },
      stdio: ['ignore', 'pipe', 'ignore'],
      // Its own process group, so that reaping this server reaps only this server. A client that
      // ends a stdio server kills the group, and ctrl-C in a terminal does the same, which would
      // take down the wall somebody is in the middle of choosing from.
      detached: true,
    })
    // a spawn that fails arrives as an error event, and an error event with no listener is an
    // uncaught exception that ends this process without ever answering the call
    child.on('error', () => resolve({ child: null, url: null }))
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
      // A machine with no opener is not a failure, it is a machine with no opener: the URL has
      // just been written down and the reply names it. Without a listener the failure to spawn
      // arrives as an unhandled error event, which takes this whole server down with it.
      spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
      // Nothing here needs the server any more: it has said where it is. Holding its pipe and
      // its handle would keep this process alive after its client had closed stdin, so an agent
      // session would leave an MCP server behind for as long as somebody kept browsing.
      child.stdout.destroy()
      child.unref()
      clearTimeout(giveUp)
      resolve({ child, url })
    }
    child.stdout.on('data', (d) => {
      out += d
      const m = out.match(/http:\/\/localhost:(\d+)/)
      if (m) give(m[0])
    })
    // If it never says where it is, there is nothing to open and nothing to wait for. Cleared on
    // the way out rather than left to expire, because a pending timer is a reason for a process
    // to stay up, and this one outlived everything it was waiting for by eight seconds.
    const giveUp = setTimeout(() => resolve({ child, url: null }), 8000)
  })
}

/**
 * What the machine that just opened can write with.
 *
 * A wall with no key and no local claude still paints eight arranged drafts, and a draft looks
 * finished until you read it. The person cannot tell, and the server can, so the agent asks and
 * says so rather than letting them choose between eight unwritten pages.
 */
async function canWriteThere(url) {
  try {
    const cfg = await fetch(`${url}/api/config`).then((r) => r.json())
    return Boolean(cfg.cli) || Boolean(cfg.providers?.length)
  } catch {
    // an unreachable server is a different problem, and guessing at this one would only add noise
    return true
  }
}

/** Open the wall with the brief in hand, and give a choice already made a few seconds to arrive. */
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
  let where = 'the Wall window'
  let drafting = false
  // A binary that is there is not the same as a binary that runs: a build left half written, or
  // one without its executable bit, passes the search and fails to exec. That arrives as an error
  // event, which used to end this process, and the browser route is right there, so a shell that
  // will not start is treated the same as one that is not installed.
  const started = found ? await launchShell(found, request) : false
  if (!started) {
    const opened = await openInBrowser(request, at)
    if (!opened.url) {
      // it holds the keys and answers to nobody, so a server that never said where it is has to
      // be stopped here rather than left running for the rest of the session
      opened.child?.kill()
      return { noShell: true, at }
    }
    where = opened.url
    drafting = !(await canWriteThere(opened.url))
  }

  // The server is deliberately not killed on the way out of either branch: the window is the
  // thing being used, and it outlives this call. Its own idle timer decides when it is over.
  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    const got = await readChosen(dir)
    if (got) return got
    // often enough that a choice made during the short wait is answered rather than missed
    await new Promise((r) => setTimeout(r, 250))
  }
  return { waiting: true, at, where, drafting }
}

async function check(html) {
  // As a file URL, because an import specifier is a URL and not a path: a # starts a fragment,
  // a ? starts a query, %xx decodes, and on Windows a drive letter reads as a scheme, which
  // fails outright. Any of those in the install path broke this tool and nothing else.
  const { slop } = await import(pathToFileURL(path.join(ROOT, 'dist-core', 'core.js')).href)
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
    // Not an error. The wall is open and eight pages are being written on it, which is exactly
    // what was asked for, and an agent told this failed will call design again and replace the
    // wall the person is halfway through reading.
    if (got?.waiting) {
      return ok(
        id,
        [
          `Wall is open at ${got.where}, writing eight pages to choose between.`,
          got.drafting &&
            'It found no API key and no claude command on this machine, so those eight are ' +
              'arranged from the built in designs rather than written. Say so: they are worth ' +
              'choosing between, but the words on them are placeholders.',
          `Nothing has been chosen yet, which is normal: reading eight pages takes minutes and ` +
            `this call returns in seconds so you are not left waiting. Tell them the wall is ` +
            `open, then call collect with dir "${args?.dir ?? process.cwd()}" when they say they ` +
            `have picked one. The choice is written to ${path.join(got.at, 'chosen.md')} and ` +
            `stays there, so there is no hurry and nothing to poll.`,
        ]
          .filter(Boolean)
          .join('\n\n'),
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
