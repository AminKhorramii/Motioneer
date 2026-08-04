/**
 * The streaming suite. It runs the real app against a server speaking Anthropic's wire
 * format, with no mock anywhere in the path, so the reader loop, the SSE framing, the partial
 * JSON walk and the progressive repaint are all exercised. Replays captured fixtures when
 * they exist, which is what makes this repeatable: capture once with a key, run forever
 * without one.
 */
import { _electron } from 'playwright'
import electronPath from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeAnthropic } from './fake-upstream.mjs'

// an argument points at a different corpus, so the truncated captures can be replayed as a
// recovery test: those replies were cut off mid-object by a token limit that is now raised
const corpus = process.argv[2]
const { server, url, fixtures } = await fakeAnthropic(corpus)

// both wire formats, before anything else: the anthropic frames and the openai frames differ
// in shape and in how they end, and every open weight vendor speaks the second one
globalThis.WALL_API_BASE = url
const { streamText } = await import('./shared/providers.mjs')
const shapes = {}
for (const provider of ['anthropic', 'openai']) {
  let deltas = 0
  const r = await streamText(provider, 'sys', JSON.stringify({ id: 'abc1234' }), 'k', () => deltas++)
  shapes[provider] = { deltas, ok: !r.error && (r.text ?? '').includes('sections') }
}
console.log('wire formats:', JSON.stringify(shapes))
delete globalThis.WALL_API_BASE
console.log('upstream:', corpus ?? 'fixtures', fixtures ? `${fixtures} captured fixtures` : 'synthetic (no capture yet)', 'at', url)

// a fresh directory per run, because this is the app's localStorage and a kept one would
// make the second run skip onboarding and test something else
const DATA = mkdtempSync(join(tmpdir(), 'wall-'))

const app = await _electron.launch({
  args: ['.'],
  executablePath: electronPath,
  env: { ...process.env, WALL_TEST: '1', WALL_DATA: DATA, WALL_API_BASE: url },
})
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))

await page.waitForSelector('.onboard .card', { timeout: 20000 })
await page.evaluate(() => localStorage.setItem('wall-key-anthropic', 'test-key-not-used-upstream'))
// setup is two steps now: the model, then the brief where the sample lives
await page.evaluate(() => document.querySelector('.onboard .pick')?.click())
await page.click('.onboard .primary')
await page.waitForSelector('.sample', { timeout: 10000 })
await page.click('.sample')
await page.waitForSelector('.paper.here', { timeout: 20000 })

// the claim under test: papers arrive during the run, not all at the end
const seen = []
const watch = setInterval(async () => {
  try {
    seen.push(await page.evaluate(() => document.querySelectorAll('.paper').length))
  } catch (e) { if (!errors.length) errors.push('sampler: ' + String(e).slice(0, 160)) }
}, 25)
// wait for the fan-out itself to finish rather than for a paper count, because a truncated
// corpus legitimately produces fewer pages and should still be asserted, not time out
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 120000 })
clearInterval(watch)
// let the last papers commit before walking them, or the walk reads one paper nine times
await page.waitForTimeout(600)

const counts = [...new Set(seen)].sort((a, b) => a - b)
console.log('wall filled progressively:', JSON.stringify({
  distinctPaperCounts: counts,
  grewOverTime: counts.length > 1,
  neverExceededNine: Math.max(...seen) <= 9,
}))

const wall = await page.evaluate(async () => {
  const heads = new Set()
  const angles = []
  const worlds = new Set()
  const shapes = new Set()
  const looks = new Set()
  for (let i = 0; i < 9; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await new Promise((r) => setTimeout(r, 450))
    const doc = document.querySelector('.paper.here iframe')?.contentDocument
    // a world may compose a page with no hero at all, so read whatever heading leads it
    heads.add(doc?.querySelector('h1, h2')?.innerText ?? `missing-${i}`)
    const a = document.querySelector('.filmbar .angle')?.textContent
    if (a) angles.push(a)
    worlds.add(document.querySelector('.filmbar .world')?.textContent ?? '')
    shapes.add(document.querySelectorAll('.sec').length + ':' + [...document.querySelectorAll('.sec b')].map((b) => b.textContent).join(','))
    // a page's look is its type, its scale and its ground: if two papers share all three
    // they are the same design wearing different words
    const d = document.querySelector('.paper.here iframe')?.contentDocument
    const b = d && getComputedStyle(d.body)
    const h = d && d.querySelector('h1') && getComputedStyle(d.querySelector('h1'))
    looks.add([b?.fontFamily?.slice(0, 18), h?.fontSize, b?.backgroundColor].join('|'))
  }
  return {
    counter: document.querySelector('.filmbar span')?.textContent,
    distinctHeadlines: heads.size,
    angles: [...new Set(angles)].length,
    worlds: [...worlds].filter(Boolean),
    distinctShapes: shapes.size,
    distinctLooks: looks.size,
    headlines: [...heads].map((h) => h.slice(0, 46)),
  }
})
console.log('written wall:', JSON.stringify(wall))

// a world brings CSS with it, and that CSS must not be able to make the page fetch anything
const worldCss = await page.evaluate(async () => {
  const found = { styled: 0, imports: 0, remote: 0 }
  for (let i = 0; i < 9; i++) {
    const html = document.querySelector('.paper.here iframe')?.contentDocument?.documentElement?.outerHTML ?? ''
    if (html.includes('/* world */')) found.styled++
    if (/@import/i.test(html)) found.imports++
    if (/url\(\s*['"]?https?:/i.test(html)) found.remote++
    document.querySelectorAll('.filmbar .nav button')[1]?.click()
    await new Promise((r) => setTimeout(r, 260))
  }
  return found
})
console.log('world css:', JSON.stringify(worldCss))
// images: one response rather than a stream, and the promise is that it ships inside the file
await page.evaluate(() => localStorage.setItem('wall-key-gemini', 'test-key'))
// go back to the first paper, so the assertion is not at the mercy of which world is centred
await page.evaluate(async () => {
  for (let i = 0; i < 9; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await new Promise((r) => setTimeout(r, 90))
  }
})
await page.evaluate(() => document.querySelectorAll('.sec')[0].click())
await page.waitForTimeout(300)
await page.evaluate(() => [...document.querySelectorAll('.srow button')].find((b) => b.textContent.includes('draw'))?.click())
await page.waitForFunction(
  () => document.querySelector('.paper.here iframe')?.contentDocument?.querySelector('img[src^="data:image"]'),
  null,
  { timeout: 30000 },
)
const image = await page.evaluate(() => {
  const img = document.querySelector('.paper.here iframe').contentDocument.querySelector('img[src^="data:image"]')
  return { mime: img.src.slice(5, img.src.indexOf(';')), base64Chars: img.src.length }
})
console.log('image drawn:', JSON.stringify(image))

const shipped = await page.evaluate(() => {
  const html = document.querySelector('.paper.here iframe').contentDocument.documentElement.outerHTML
  const m = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)
  return { bytes: html.length, external: /src="http|href="http/.test(html), b64: m?.[1]?.slice(0, 64) ?? null }
})
const raw = shipped.b64 ? Buffer.from(shipped.b64, 'base64') : Buffer.alloc(0)
console.log('image in page:', JSON.stringify({
  pageBytes: shipped.bytes,
  noExternalRefs: !shipped.external,
  decodesAsPng: raw.slice(1, 4).toString() === 'PNG',
}))

console.log('written wall toast:', JSON.stringify(await page.evaluate(() => document.querySelector('.toast')?.textContent ?? null)))
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')

await app.close()
server.close()
