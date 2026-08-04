/**
 * The web build, driven in a plain browser. It runs the same assertions as the desktop suite
 * because the web version is the desktop version, so a difference here means the host
 * boundary leaked rather than that the web build is allowed to be smaller.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.join(process.cwd(), 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }

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
await new Promise((r) => server.listen(4178, r))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

await page.goto('http://localhost:4178/')
await page.waitForSelector('.onboard .card', { timeout: 20000 })
console.log('onboarding:', JSON.stringify(await page.evaluate(() => ({
  heading: document.querySelector('.onboard h2')?.textContent,
  points: document.querySelectorAll('.onboard .how li').length,
}))))

const REAL = (process.env.WALL_KEY ?? '').trim()
console.log('model:', REAL ? 'live Claude' : 'mock')
await page.evaluate((key) => {
  localStorage.setItem('wall-key-anthropic', key || 'test-key')
  if (key) return
  window.__wall.setMock((instruction, shape) => instruction === 'worlds' ? {
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
      css: `section#hero .wrap{border:1px solid var(--line)}`,
    })),
  } : ({
    sections: shape.map((s) => ({
      id: s.id,
      content: Object.fromEntries(
        Object.entries(s.content).map(([k, v]) => [k, typeof v === 'string' ? `${instruction.match(/"([^"]+)"/)?.[1] ?? instruction.slice(0, 14)} | ${v}` : v]),
      ),
    })),
  }))
}, REAL)

// setup is two steps now: the model, then the brief where the sample lives
await page.evaluate(() => document.querySelector('.onboard .pick')?.click())
await page.click('.onboard .primary')
await page.waitForSelector('.sample', { timeout: 10000 })
await page.click('.sample')
await page.waitForSelector('.paper.here', { timeout: 20000 })
await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: REAL ? 180000 : 40000 })
console.log('counter:', await page.evaluate(() => document.querySelector('.filmbar .count')?.textContent))
console.log('written wall:', JSON.stringify(await page.evaluate(async () => {
  const seen = new Set()
  for (let i = 0; i < 9; i++) {
    document.querySelectorAll('.filmbar .nav button')[1]?.click()
    await new Promise((r) => setTimeout(r, 300))
    seen.add(document.querySelector('.paper.here iframe')?.contentDocument?.querySelector('h1')?.innerText ?? '')
  }
  return { counter: document.querySelector('.filmbar span')?.textContent, distinctHeadlines: seen.size }
})))

// direct manipulation has to survive the host swap, since it runs entirely in the page
await page.evaluate(() => {
  const doc = document.querySelector('.paper.here iframe').contentDocument
  const h = doc.querySelector('h1[data-edit]')
  h.innerText = 'Edited in the browser.'
  h.dispatchEvent(new Event('blur', { bubbles: true }))
})
await page.waitForTimeout(400)
console.log('direct edit:', JSON.stringify(await page.evaluate(() => ({
  headlineNow: document.querySelector('.paper.here iframe').contentDocument.querySelector('h1')?.innerText,
}))))

// state must survive a reload, which on the web means localStorage rather than a file
await page.reload()
await page.waitForSelector('.paper.here', { timeout: 20000 })
console.log('state kept:', JSON.stringify(await page.evaluate(() => ({
  onboardingSkipped: document.querySelectorAll('.onboard').length === 0,
  papers: document.querySelectorAll('.paper').length > 0,
}))))

// ship, which on the web is a download rather than a file write
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.evaluate(() => [...document.querySelectorAll('.filmbar button')].find((b) => b.textContent.includes('download')).click()),
])
const shipped = await readFile(await download.path(), 'utf8')
console.log('shipped:', JSON.stringify({
  file: download.suggestedFilename(),
  bytes: shipped.length,
  selfContained: !/src="http|href="http/.test(shipped),
  noEditScript: !shipped.includes('contenteditable'),
}))

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')
await browser.close()
server.close()
