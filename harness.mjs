/**
 * One way to open the app for a suite.
 *
 * Every suite used to launch Electron itself, which meant six copies of a launcher and a hard
 * dependency on the one shell that could be driven. The app is now opened the way any visitor
 * opens it: a static server over the built dist, and a real browser. That is the same dist the
 * desktop shell loads, so what is proved here is proved for the app rather than for a harness.
 *
 * Values in `env` are put on globalThis before any page script runs, because providers.mjs reads
 * its configuration from globalThis first and process.env second, so a browser can be pointed at
 * a local upstream exactly as a Node process can.
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.join(process.cwd(), 'dist')
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/** Serve the built app. Port 0 lets the machine choose, so two suites can run at once. */
export async function serveDist(port = 0) {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0])
    const file = path.join(DIST, rel === '/' ? 'index.html' : rel)
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((r) => server.listen(port, r))
  return { server, url: `http://localhost:${server.address().port}/` }
}

/**
 * Open the app and hand back the page, plus the one call that closes everything.
 *
 * `errors` collects page errors and console errors for the whole session, because a suite that
 * passes every assertion while the console fills with exceptions has not proved much.
 */
export async function openApp({ env = {}, viewport = { width: 1440, height: 900 }, headless = true } = {}) {
  const { server, url } = await serveDist()
  const browser = await chromium.launch({ headless })
  const ctx = await browser.newContext({ viewport, acceptDownloads: true })
  // copying a brief is a feature, so the suite has to be allowed to read what it copied.
  // Electron granted this implicitly and a browser does not, which is a difference in the
  // harness rather than in the app.
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

  if (Object.keys(env).length) {
    await page.addInitScript((vars) => Object.assign(globalThis, vars), env)
  }

  await page.goto(url)
  return {
    page,
    browser,
    ctx,
    server,
    url,
    errors,
    close: async () => {
      await browser.close().catch(() => {})
      server.close()
    },
  }
}

/**
 * The mock model, shared by every suite that does not want to spend tokens.
 *
 * It answers the three shapes the app asks for: a set of worlds, an intake, and a page of
 * copy. Written once here because a mock that drifts between suites makes them disagree about
 * what the app does.
 */
export const MOCK = `(instruction, shape) => instruction === 'worlds' ? {
  worlds: Array.from({ length: 8 }, (_, i) => ({
    name: ['wall label', 'field manual', 'night edition', 'receipt', 'broadsheet', 'sign system', 'zine', 'gallery card'][i],
    note: 'a made world', voice: 'Write plainly.',
    display: ['sans', 'grotesk', 'serif', 'mono'][i % 4], body: ['sans', 'grotesk', 'serif', 'mono'][(i + 2) % 4],
    scale: 1.15 + i * 0.06, weight: 300 + i * 60, radius: i * 3, density: 0.3 + i * 0.07,
    caps: i % 3 === 0, palette: ['as-is', 'mono', 'tinted', 'contrast'][i % 4],
    backdrop: ['none', 'contours', 'grain', 'ridge'][i % 4],
    structure: { rules: i % 2 === 0, numbered: i % 3 === 0, bleed: i % 4 === 0, measure: 46 + i * 4, figure: ['framed', 'bleed', 'plain'][i % 3] },
    prefer: { hero: i % 4, features: i % 3 },
    sections: [['hero', 'features', 'cta', 'footer'], ['hero', 'quote', 'pricing', 'footer'], ['features', 'faq', 'footer'],
      ['hero', 'logos', 'showcase', 'cta', 'footer'], ['hero', 'features', 'features', 'footer'], ['hero', 'pricing', 'faq', 'cta', 'footer'],
      ['quote', 'features', 'footer'], ['hero', 'logos', 'features', 'showcase', 'quote', 'pricing', 'faq', 'cta', 'footer']][i],
    css: 'section#hero .wrap{border:1px solid var(--line)} .eyebrow{letter-spacing:.' + i + 'em}',
  })),
} : instruction === 'intake' ? {
  product: {
    name: 'Spoor',
    oneLiner: 'Every session you ever ran, findable in one keystroke.',
    what: String(shape).slice(0, 80),
    audience: '',
    cta: 'Download for macOS',
  },
  questions: [{ key: 'audience', question: 'Who specifically is this for?', why: 'the page needs a reader' }],
} : ({
  sections: shape.map((s) => ({
    id: s.id,
    content: Object.fromEntries(
      Object.entries(s.content).map(([k, v]) => [
        k, typeof v === 'string' ? (instruction.match(/"([^"]+)"/)?.[1] ?? instruction.slice(0, 14)) + ' | ' + v : v,
      ]),
    ),
  })),
})`

/** Install the mock and a key, so the app believes it can write. */
export async function useMock(page, key = 'test-key') {
  await page.evaluate(
    ([mock, k]) => {
      localStorage.setItem('wall-key-anthropic', k)
      // eslint-disable-next-line no-eval
      window.__wall.setMock(eval(mock))
    },
    [MOCK, key],
  )
}
