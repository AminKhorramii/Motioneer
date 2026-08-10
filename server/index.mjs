/**
 * The Wall server. One file, no dependencies, two jobs.
 *
 * It serves the built app, and it holds the model keys so they never reach a browser. That is
 * the whole difference between the static build and a deployment: the same dist works either
 * way, and the server declares itself by injecting a flag into the page it serves, so the app
 * knows to call the server rather than a provider.
 *
 * The model path is `shared/providers.mjs`, the same module the desktop app's main process
 * imports, so there is one place where a request is built and one place where a reply is read.
 *
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY   the keys it holds
 *   WALL_REQUEST                                          a brief to open with
 *   WALL_HANDOFF_DIR                                      where a chosen design is written
 *   PORT                                                  default 8080
 *   WALL_HOST                                             default 127.0.0.1, loopback only
 *   WALL_WALLS_PER_HOUR                                   per address ceiling, unset means none
 *   WALL_DAILY_OUTPUT_TOKENS                              whole deployment ceiling, unset means none
 *   WALL_IDLE_MS                                          stop after this much silence, unset means never
 */

import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { REQUESTS, generateImage, streamText } from '../shared/providers.mjs'
import { DESIGN_MODEL, INTAKE_MODEL, hasClaude, runClaude } from '../shared/cli.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT ?? 8080)
/**
 * Loopback unless told otherwise.
 *
 * This process holds API keys, so binding every interface would put them behind nothing but a
 * port number for anyone on the same network. A deployment that genuinely wants to serve others
 * sets WALL_HOST and means it.
 */
const HOST = process.env.WALL_HOST ?? '127.0.0.1'

/**
 * Keys live in a file rather than in the page.
 *
 * A browser tab keeps them in localStorage, which is per origin, so a server on a different
 * port every run would lose them and ask again. Held here they survive restarts, work across
 * every project, and never reach a page at all.
 */
const CONFIG = path.join(os.homedir(), '.wall', 'config.json')
let saved = {}
try {
  saved = JSON.parse(await readFile(CONFIG, 'utf8'))
} catch {
  saved = {}
}
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || saved.anthropic || '',
  openai: process.env.OPENAI_API_KEY || saved.openai || '',
  gemini: process.env.GEMINI_API_KEY || saved.gemini || '',
}

/** Only ever the directory this server was started for, never one a page asks for. */
const HANDOFF = process.env.WALL_HANDOFF_DIR ?? ''
/** asked once: PATH does not change under a running process, and every page load would ask */
const CLI = hasClaude()
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/**
 * When to stop, for the copy of this server an agent started.
 *
 * That one is nobody's to kill. The tool call that spawned it returns in seconds while the person
 * browses for minutes, so killing it on the way out would close the window mid-choice, and not
 * killing it leaves a process holding API keys for the rest of the login session. So it watches
 * its own traffic: an open tab says so every twenty seconds, and silence for this long means the
 * tab is gone. Unset means run forever, which is what `npm run serve` and any deployment want.
 */
const IDLE_MS = Number(process.env.WALL_IDLE_MS ?? 0)
let lastSeen = Date.now()

/**
 * Ceilings. A wall is eight calls and about sixteen thousand output tokens, so the unit that
 * matters is the wall rather than the request, and the cost that matters is output tokens
 * rather than either. Both are off unless configured, because a self-hosted instance paying
 * with its own key does not need protecting from itself.
 */
const PER_HOUR = Number(process.env.WALL_WALLS_PER_HOUR ?? 0)
const DAILY_TOKENS = Number(process.env.WALL_DAILY_OUTPUT_TOKENS ?? 0)
const CALLS_PER_WALL = 8
const seen = new Map()
let day = { at: 0, tokens: 0 }

function overLimit(address) {
  const now = Date.now()
  if (DAILY_TOKENS) {
    const today = Math.floor(now / 86_400_000)
    if (day.at !== today) day = { at: today, tokens: 0 }
    if (day.tokens >= DAILY_TOKENS) return 'this deployment has reached its daily budget'
  }
  if (!PER_HOUR) return ''
  const hits = (seen.get(address) ?? []).filter((t) => now - t < 3_600_000)
  if (hits.length >= PER_HOUR * CALLS_PER_WALL) return 'too many pages from this address in the last hour'
  hits.push(now)
  seen.set(address, hits)
  return ''
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'))
      } catch {
        resolve({})
      }
    })
  })

async function serveFile(res, file, injectFlag) {
  try {
    let body = await readFile(file)
    if (injectFlag) {
      // the server announces itself in the page, so one build works both served and static
      body = Buffer.from(
        body.toString('utf8').replace('</head>', '<script>window.__wallServed=1</script></head>'),
      )
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      // hashed assets never change under the same name; everything else must revalidate, or a
      // redeploy leaves a cached index.html pointing at assets that no longer exist
      'cache-control': file.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const address = req.socket.remoteAddress ?? 'unknown'
  // anything at all counts, including the heartbeat, because the question is whether a tab is
  // still there rather than whether it is doing anything interesting
  lastSeen = Date.now()

  // A name that resolves to this machine is not the same as this machine. Rejecting any other
  // Host closes rebinding, where a page a person visits is pointed at their own loopback and
  // then counts as same origin.
  const host = (req.headers.host ?? '').split(':')[0]
  if (HOST === '127.0.0.1' && !['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(host)) {
    return json(res, 403, { error: 'this server answers on loopback only' })
  }

  /**
   * Being on loopback is not the same as being private.
   *
   * Every tab the operator has open can reach this port, and a cross site POST carrying a plain
   * content type is a simple request: the browser sends it without asking permission first, and
   * the attacker never needs to read the reply for the damage to be done. Measured against this
   * server before the guard: a page on another origin replaced the key in ~/.wall/config.json
   * with its own and got a 200, which is a key destroyed, a key substituted so the operator's
   * work runs through somebody else's account, a local Claude subscription to spend, and an
   * authored chosen.md that the agent collects and implements as a specification.
   *
   * So the two things a simple request cannot do are required of anything that changes state:
   * a JSON content type, which forces a preflight this server answers to nobody, and an Origin
   * of this server's own if one is sent at all. A caller with no Origin is not a browser, and a
   * program already running on this machine has easier ways to do all of the above.
   */
  if (req.method === 'POST') {
    const origin = req.headers.origin
    const mine = !origin || (() => {
      try {
        return new URL(origin).host === req.headers.host
      } catch {
        return false
      }
    })()
    if (!mine) return json(res, 403, { error: 'this server answers its own page only' })
    if (!(req.headers['content-type'] ?? '').includes('application/json')) {
      return json(res, 415, { error: 'this server reads JSON, so say so in the content type' })
    }
  }

  if (url.pathname === '/api/config') {
    // the app hides its key fields when the server already holds one, and offers the local
    // Claude only where there is one, which is a question only this side can answer
    return json(res, 200, {
      providers: Object.keys(KEYS).filter((k) => KEYS[k]),
      handoff: Boolean(HANDOFF),
      cli: CLI,
    })
  }

  if (url.pathname === '/api/key' && req.method === 'POST') {
    const { provider, key } = await readBody(req)
    if (!(provider in KEYS)) return json(res, 400, { error: 'unknown provider' })
    KEYS[provider] = String(key ?? '').trim()
    saved[provider] = KEYS[provider]
    await mkdir(path.dirname(CONFIG), { recursive: true })
    await writeFile(CONFIG, JSON.stringify(saved, null, 2), { mode: 0o600 })
    return json(res, 200, { providers: Object.keys(KEYS).filter((k) => KEYS[k]) })
  }

  if (url.pathname === '/api/request') {
    if (!process.env.WALL_REQUEST) return json(res, 200, null)
    try {
      const raw = JSON.parse(await readFile(process.env.WALL_REQUEST, 'utf8'))
      return json(res, 200, { ...raw, dir: HANDOFF })
    } catch {
      return json(res, 200, null)
    }
  }

  if (url.pathname === '/api/handoff' && req.method === 'POST') {
    // the directory comes from how this server was started, not from the page: a local server
    // is reachable by anything running in the browser, and a caller supplied path would let any
    // of it write wherever it liked
    if (!HANDOFF) return json(res, 400, { error: 'this server was not started for a handoff' })
    const { files } = await readBody(req)
    try {
      await mkdir(HANDOFF, { recursive: true })
      // Sorted, which puts chosen.md last, and last is what matters: chosen.md is the file the
      // agent polls for, so writing it before its neighbours hands back a design whose render
      // and structured page are still empty or absent. The desktop shell takes a BTreeMap and
      // gets this ordering for free, so sorting here makes both shells write the same way.
      for (const [name, body] of Object.entries(files ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
        // a name is a name, never a path
        if (name.includes('/') || name.includes('\\') || name.includes('..')) continue
        await writeFile(path.join(HANDOFF, name), String(body), 'utf8')
      }
      return json(res, 200, { dir: HANDOFF })
    } catch (e) {
      return json(res, 500, { error: String(e).slice(0, 200) })
    }
  }

  if (url.pathname === '/api/stream' && req.method === 'POST') {
    const { provider, system, user } = await readBody(req)
    // A wire this endpoint does not speak is refused rather than quietly turned into one it
    // does. Everything that was not openai used to go to the anthropic endpoint carrying the
    // anthropic key, so a typo, an older page or a new wire name would hand one vendor another
    // vendor's credential in a request that vendor never agreed to receive. There are two wires
    // here and gemini is not one of them: its key is for images, and /api/image is where it goes.
    if (!(provider in REQUESTS)) return json(res, 400, { error: `this server does not speak ${provider}` })
    const key = KEYS[provider]
    if (!key) return json(res, 501, { error: `this server holds no ${provider} key` })
    const denied = overLimit(address)
    if (denied) return json(res, 429, { error: denied })

    // plain chunked text: every chunk is a delta, and the whole body is the reply. There is no
    // framing to invent because the client already treats the concatenation as the answer.
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    const out = await streamText(provider, system, user, key, (delta) => res.write(delta))
    if (DAILY_TOKENS) day.tokens += Math.ceil((out.text?.length ?? 0) / 4)
    if (out.error) console.error('stream failed:', out.error)
    return res.end()
  }

  if (url.pathname === '/api/cli' && req.method === 'POST') {
    // no key is involved, so there is nothing to hold and nothing to check beyond the ceiling
    const denied = overLimit(address)
    if (denied) return json(res, 429, { error: denied })
    const { system, user, kind } = await readBody(req)
    // plain chunked text, the same shape /api/stream uses: every chunk is a delta and the whole
    // body is the reply, so a caller that wants to act on partial output can
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    // A beat while it thinks, so the connection carries something during the minute before the
    // first word. NUL is the one byte that cannot appear in the reply, which is JSON the model
    // wrote, so the reader can take these out without knowing anything about what it is reading.
    // Once a second is plenty to prove life and few enough to ignore.
    let beat = 0
    const out = await runClaude(String(system ?? ''), String(user ?? ''), {
      // Designing the worlds, reading a brief and writing the words are three jobs, and the
      // caller says which one this is so each can be spent on separately. Reading a brief is
      // pulling five fields out of a paragraph, which is the one of the three with nothing to
      // weigh up, and it is the only call a person waits in front of before anything is on
      // screen, so it is told not to think and takes about a third of the time.
      ...(kind === 'design'
        ? { model: DESIGN_MODEL() }
        : kind === 'intake'
          ? { model: INTAKE_MODEL(), thinking: 0 }
          : {}),
      onDelta: (d) => res.write(d),
      onThink: () => {
        const now = Date.now()
        if (now - beat < 1000) return
        beat = now
        res.write('\0')
      },
    })
    if (out.error) console.error('cli failed:', out.error)
    return res.end()
  }

  if (url.pathname === '/api/image' && req.method === 'POST') {
    const { prompt } = await readBody(req)
    if (!KEYS.gemini) return json(res, 501, { error: 'this server holds no gemini key' })
    const denied = overLimit(address)
    if (denied) return json(res, 429, { error: denied })
    return json(res, 200, await generateImage('gemini', prompt, KEYS.gemini))
  }

  const wanted = url.pathname === '/' ? '/index.html' : url.pathname
  const file = path.join(DIST, path.normalize(wanted).replace(/^(\.\.[/\\])+/, ''))
  await serveFile(res, file, wanted === '/index.html')
})

// PORT=0 binds whatever is free and reports it, which is what tests use so a leftover process
// from an earlier run cannot quietly answer in this one
server.listen(PORT, HOST, () => {
  const held = Object.keys(KEYS).filter((k) => KEYS[k])
  console.log(`wall on http://localhost:${server.address().port}`)
  console.log(held.length ? `holding keys for ${held.join(', ')}` : 'holding no keys, so visitors bring their own')
  // said out loud, because the alternative to a model is a wall of stand-ins that reads as real
  console.log(
    CLI
      ? 'the claude command is here, so a visitor with no key can still write'
      : held.length
        ? 'no claude command here, so writing goes through the keys above'
        : 'no claude command and no key, so a wall here is arranged rather than written',
  )
  if (PER_HOUR) console.log(`limit ${PER_HOUR} walls per address per hour`)
  if (DAILY_TOKENS) console.log(`limit ${DAILY_TOKENS} output tokens per day`)
  if (IDLE_MS) console.log(`stopping after ${Math.round(IDLE_MS / 1000)}s with nobody asking`)
})

if (IDLE_MS) {
  /**
   * Referenced, where this used to be unref'd.
   *
   * Two servers started by an agent run were found still listening eleven minutes in with a
   * sixty second idle, and one of them was still there eighty seconds after a request I made to
   * restart its clock, so the check was not running. I could not reproduce that in a harness:
   * the unref'd version stops correctly every time I start one deliberately, which fits, because
   * an unref'd timer does not get to set the event loop's poll timeout and only fires once
   * something else has woken the process. Every harness wakes it; a server nobody is asking
   * anything is the one case where nothing does.
   *
   * So this is the fix that matches the observation rather than a proven cause. Keeping the
   * timer referenced costs nothing, because the listening socket holds this process open anyway,
   * and it makes the one thing here that ever decides to stop independent of who else is awake.
   */
  setInterval(() => {
    if (Date.now() - lastSeen < IDLE_MS) return
    console.log('nobody has asked for anything, so this server is done')
    process.exit(0)
  }, Math.min(IDLE_MS, 5_000))
}
