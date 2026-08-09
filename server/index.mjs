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
 */

import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { generateImage, streamText } from '../shared/providers.mjs'
import { DESIGN_MODEL, runClaude } from '../shared/cli.mjs'

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
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

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

  // A name that resolves to this machine is not the same as this machine. Rejecting any other
  // Host closes rebinding, where a page a person visits is pointed at their own loopback and
  // then counts as same origin.
  const host = (req.headers.host ?? '').split(':')[0]
  if (HOST === '127.0.0.1' && !['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(host)) {
    return json(res, 403, { error: 'this server answers on loopback only' })
  }

  if (url.pathname === '/api/config') {
    // the app hides its key fields when the server already holds one
    return json(res, 200, {
      providers: Object.keys(KEYS).filter((k) => KEYS[k]),
      handoff: Boolean(HANDOFF),
      cli: true,
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
    const key = KEYS[provider === 'openai' ? 'openai' : 'anthropic']
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
      ...(kind === 'design' ? { model: DESIGN_MODEL() } : {}),
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
  if (PER_HOUR) console.log(`limit ${PER_HOUR} walls per address per hour`)
  if (DAILY_TOKENS) console.log(`limit ${DAILY_TOKENS} output tokens per day`)
})
