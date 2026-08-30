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
  {
    name: 'studio',
    description:
      'Open the motion studio, so the person can point at a running site or a component, pick '
      + 'elements off it, and compare several motions for them on one timeline. Use this when '
      + 'somebody wants motion for something they already have and would rather choose than '
      + 'describe, or when they say the words motion studio. Prefer the motion tool instead when '
      + 'they want the stylesheet written straight into their code without looking at it first. '
      + 'This returns as soon as the studio is open, which is the normal outcome and not a '
      + 'failure: picking and comparing takes minutes. If one is already open it says so rather '
      + 'than starting a second, because a second would take the port and roam elsewhere.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'A running site or dev server to aim it at, like http://localhost:3000. Its elements '
            + 'become pickable. Leave it out to open on a folder of components instead.',
        },
        dir: {
          type: 'string',
          description:
            'Absolute path of the project, so the studio opens on its components when no url is '
            + 'given. Always pass it. This server runs as its own process and its working '
            + 'directory is not necessarily the project you are in.',
        },
      },
    },
  },
  {
    name: 'motion',
    description:
      'Give a component you already have motion that is not a 300ms fade. Send the markup and get '
      + 'back stylesheets to append: keyframes scoped to one data attribute you add to the root, '
      + 'reaching the parts by structure so they survive a class edit, staggering them so the '
      + 'parts so the thing assembles itself rather than sliding in whole. Each option takes its '
      + 'timing from a real object, a split flap turning, paper leaving a printer, a stamp landing, '
      + 'so several of them disagree rather than all easing the same way. Your markup is never '
      + 'changed and never returned, everything is wrapped in prefers-reduced-motion, and options '
      + 'that only move it as one piece, or that pin their selectors to utility classes, are '
      + 'rejected before you see them.',
    inputSchema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description:
            'The component markup as it stands, so the motion can reach its parts by structure. '
            + 'Send the real thing rather than a summary.',
        },
        css: {
          type: 'string',
          description: 'Its stylesheet, if you have it. Optional, and it makes the timing fit better.',
        },
        options: {
          type: 'number',
          description: 'How many different motions to write. Three by default, six at most.',
        },
      },
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
 * Open the motion studio, or say that one is already open.
 *
 * A second studio does not replace the first, it finds the port busy and roams to 4322, which is
 * right for a person reading the terminal and wrong for an agent that has just told somebody to
 * look at 4321. So this asks first.
 *
 * It waits for the server to actually answer rather than reporting success on spawn. A studio that
 * failed to start looks exactly like one that started, right up until the person opens the address
 * and finds nothing there, and by then the agent has already said it worked.
 */
async function studio({ url, dir }) {
  const port = Number(process.env.WALL_PORT || 4321)
  const at = `http://localhost:${port}`
  const answering = async () => {
    try {
      const r = await fetch(`${at}/__wall/model`, { signal: AbortSignal.timeout(700) })
      return r.ok
    } catch { return false }
  }
  if (await answering()) {
    return `A motion studio is already open at ${at}. Tell them to use that one rather than `
      + 'opening another, and if they want it pointed somewhere else there is an address bar in '
      + 'the top left of it.'
  }
  const args = [path.join(ROOT, 'tools', 'studio.mjs')]
  if (url) args.push('--app', String(url))
  else if (dir) args.push(String(dir))
  // process.execPath for the same reason openInBrowser gives: an agent launched from a desktop
  // icon has a login shell's PATH, which on any machine using nvm has no node on it
  const child = spawn(process.execPath, args, { stdio: 'ignore', detached: true, cwd: dir || ROOT })
  const started = await new Promise((done) => {
    child.on('error', () => done(false))
    child.on('spawn', () => { child.unref(); done(true) })
  })
  if (!started) return 'The studio could not be started from here. `npm run studio` in the project will do it.'
  for (let n = 0; n < 40; n++) {
    if (await answering()) {
      return `The motion studio is open at ${at}.${url ? ` It is aimed at ${url}.` : ''} Tell them `
        + 'to pick one or more elements and press Give it motion, and that several motions come '
        + 'back to compare on one timeline. Choosing takes minutes, so do not wait on it: they can '
        + 'save what they like from the studio itself.'
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return `The studio was started but has not answered at ${at} within ten seconds. Ask them to `
    + 'check the terminal, or run `npm run studio` themselves.'
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

/**
 * Motion for a component somebody else built, handed back as a stylesheet and nothing else.
 *
 * Several at once for the reason the wall exists: asked once, every call reaches for the same
 * easing, and measured on this repository's own output eight independent calls drew one watch dial
 * and would fade one way. Each option is dealt a different motion from the deck, taken from what a
 * real object does, so they disagree by construction rather than by being asked to.
 *
 * The gate is the point of returning anything at all. unmoved reads whether the parts arrive at
 * different times, which is the whole difference between a mechanism and a slideshow, and an option
 * that only slides the finished component is dropped rather than shown: a caller handed four
 * options where one is a fade has to do the judging this tool exists to have already done.
 */
async function motion(args) {
  const html = String(args?.html ?? '')
  if (!html.trim()) throw new Error('motion needs the component markup, so the keyframes can name its parts.')
  const want = Math.max(1, Math.min(6, Number(args?.options) || 3))
  const core = await import(pathToFileURL(path.join(ROOT, 'dist-core', 'core.js')).href)
  const { runClaude } = await import(pathToFileURL(path.join(ROOT, 'shared', 'cli.mjs')).href)
  const motions = core.dealMotions(want)
  // the markup is what the selectors have to name, so it goes over whole rather than summarised
  const seen = html.slice(0, 6000)
  const styles = args?.css ? `\n\nIts stylesheet, for the timing to fit:\n${String(args.css).slice(0, 4000)}` : ''

  /**
   * How many distinct frames a component shows over four seconds with a stylesheet applied.
   *
   * Distinct rather than merely different: a screenshot is compared by its bytes, so a frame that
   * differs by one antialiased pixel counts as a change, and that is the honest reading. What is
   * being asked is whether anything at all is happening on screen, which is the question the css
   * cannot answer about itself.
   */
  async function frames(markup, scope, css) {
    /**
     * Only when a browser is actually here.
     *
     * playwright is a development dependency and this package ships mcp/ without it, so on a normal
     * install this import throws and the whole tool would fail on a check rather than on the work.
     * Missing is not failing: the source gates still ran, and the reply says plainly which options
     * were watched and which were only read, because a check reported as done when it was skipped
     * is the one kind of green this repository refuses to print.
     */
    const pw = await import('playwright').catch(() => null)
    if (!pw) return null
    const { chromium } = pw
    const browser = await chromium.launch()
    try {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 420 } })
      const tab = await ctx.newPage()
      const scoped = scope ? markup.replace(/<(\w+)/, `<$1 ${scope}`) : markup
      await tab.setContent(`<style>${css}</style>${scoped}`, { waitUntil: 'load' })
      const shots = new Set()
      for (let i = 0; i < 8; i++) {
        await tab.waitForTimeout(i === 0 ? 60 : 480)
        shots.add((await tab.screenshot()).toString('base64'))
      }
      return { distinct: shots.size }
    } finally {
      await browser.close()
    }
  }

  const tried = await Promise.all(motions.map(async (m) => {
    const brief = `The component:\n${seen}${styles}\n\nMove it by ${m} Take the timing from that `
      + `object: it is how the thing behaves, and it is why this one will not move like the others.`
    /**
     * One retry, because a dropped reply is not an opinion about the component.
     *
     * Run over eight real components, the only outright failure was a reply that came back
     * unparseable, and a caller told "no option moved the parts" for that reason has been given a
     * verdict where there was only a hiccup. The second attempt is allowed to think, since the
     * first was probably running under the fast dial, and thinking is the thing that was skipped.
     */
    let reply = await runClaude(core.MOTION_SYSTEM, brief).catch(() => null)
    let raw = reply ? core.grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    if (!raw) {
      reply = await runClaude(core.MOTION_SYSTEM, brief, { thinking: undefined }).catch(() => null)
      raw = reply ? core.grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    }
    const css = raw ? core.safeStyle(raw.css) : ''
    if (!css) return null
    // does it move the parts, and will its selectors still match after somebody edits the markup
    const faults = [...core.unmoved({ html: '', css, note: '' }), ...core.brittle(css)]
    const scope = core.scopeOf(css, raw.scope)
    return { m, css, scope, note: String(raw.note ?? '').slice(0, 90), faults }
  }))

  /**
   * And then watch each one, because reading the css cannot tell you whether anything moved.
   *
   * Every gate that has ever gone wrong in this repository went wrong by reading source. An option
   * with six keyframes and staggered delays reads perfectly and can still be a four hundred
   * millisecond entrance that is over before anybody looks, or a set of rules whose selectors match
   * nothing in the component they were written for. Frames settle both questions: the component is
   * rendered with the stylesheet appended, sampled across four seconds, and an option whose frames
   * are all identical did not move whatever its css says.
   */
  const watched = await Promise.all(tried.map(async (t) => {
    if (!t || t.faults.length) return t
    const seen = await frames(html, t.scope, t.css).catch(() => null)
    if (seen === null) return { ...t, unwatched: true }
    if (seen.distinct < 2) {
      return { ...t, faults: [...t.faults, 'rendered, nothing on it changed. Either the selectors match '
        + 'nothing in this component, or the movement is over before anybody could see it.'] }
    }
    return { ...t, distinct: seen.distinct }
  }))

  const kept = watched.filter((t) => t && !t.faults.length)
  const dropped = tried.filter((t) => t && t.faults.length)
  if (!kept.length) {
    /**
     * A component with one part cannot have a mechanism, and saying otherwise is unhelpful.
     *
     * Run over eight real shadcn components, six got staggered motion and the button did not: it is
     * an icon and a label, so there is nothing to arrive in sequence and every option correctly came
     * back as a transition. The gate was right and the message was wrong, because it blamed the
     * options for a property of the component. Counting the elements separates "this did not work"
     * from "there is nothing here to stagger", and only the first is worth retrying.
     */
    const parts = (html.match(/<(?!\/)(?!br|hr|img|input|meta|link)[a-zA-Z]/g) ?? []).length
    const why = dropped[0]?.faults[0] ?? 'no usable reply came back'
    if (parts < 5 && dropped.some((d) => d.faults.some((f) => f.includes('at once')))) {
      throw new Error(
        `This component has ${parts} element${parts === 1 ? '' : 's'}, so there is nothing to `
        + 'stagger: motion on it can only be the whole thing moving, which is the transition you '
        + 'already have. Send a component with parts that can arrive in sequence, rows, cards, '
        + 'fields, cells, and the motion has something to be made of.')
    }
    throw new Error(`No option moved the parts. ${why}`)
  }
  const why = [...new Set(dropped.flatMap((d) => d.faults.map((f) => f.split('.')[0])))]
  // said out loud, because an option that was only read is a weaker claim than one that was watched
  const unwatched = kept.some((k) => k.unwatched)
  return kept.map((k, i) =>
    `## ${i + 1}. ${k.note || 'untitled'}\n\n`
    + `Takes its timing from ${k.m}\n\n`
    + (k.scope ? `Put \`${k.scope}\` on the component's outermost element, then append:\n\n` : 'Append:\n\n')
    + `\`\`\`css\n${k.css}\n\`\`\``,
  ).join('\n\n') + (dropped.length
    ? `\n\n---\n\n${dropped.length} other option${dropped.length === 1 ? ' was' : 's were'} written and dropped: `
      + `${why.join('; ')}.`
    : '')
    + (unwatched
      ? '\n\nThese were checked by reading the css rather than by watching them, because no browser '
        + 'is installed here. Selectors that match nothing, and movement that is over before anybody '
        + 'sees it, both read as correct and are only visible when rendered.'
      : '\n\nEach of these was rendered on your component and watched for four seconds, so the '
        + 'selectors are known to match and the movement is known to be visible.')
}

async function call(name, args, id) {
  if (name === 'studio') return ok(id, await studio(args ?? {}))
  if (name === 'motion') {
    return ok(id, await motion(args ?? {}))
  }
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
