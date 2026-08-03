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
 *   PORT                                                  default 8080
 *   WALL_WALLS_PER_HOUR                                   per address ceiling, unset means none
 *   WALL_DAILY_OUTPUT_TOKENS                              whole deployment ceiling, unset means none
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { generateImage, streamText } from '../shared/providers.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT ?? 8080)

const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY ?? '',
  openai: process.env.OPENAI_API_KEY ?? '',
  gemini: process.env.GEMINI_API_KEY ?? '',
}
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
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const address = req.socket.remoteAddress ?? 'unknown'

  if (url.pathname === '/api/config') {
    // the app hides its key fields when the server already holds one
    return json(res, 200, { providers: Object.keys(KEYS).filter((k) => KEYS[k]) })
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
server.listen(PORT, () => {
  const held = Object.keys(KEYS).filter((k) => KEYS[k])
  console.log(`wall on http://localhost:${server.address().port}`)
  console.log(held.length ? `holding keys for ${held.join(', ')}` : 'holding no keys, so visitors bring their own')
  if (PER_HOUR) console.log(`limit ${PER_HOUR} walls per address per hour`)
  if (DAILY_TOKENS) console.log(`limit ${DAILY_TOKENS} output tokens per day`)
})
