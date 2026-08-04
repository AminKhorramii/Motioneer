/**
 * One real end to end run against Anthropic, recorded.
 *
 * It drives the actual app in Electron with a real key, records every byte of every SSE
 * stream into fixtures/, and reports what the model really returned. The recording is the
 * point: once captured, `npm run verify:stream` replays it forever without a key and without
 * spending tokens, so the streaming path stays covered on every change.
 *
 * Run: WALL_KEY=$(cat ~/.wall-test-key) node capture.mjs
 */
import { openApp } from './harness.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const KEY = (process.env.WALL_KEY ?? '').trim()
if (!KEY) {
  console.error('WALL_KEY is required. Put the key in a file and pass it as WALL_KEY=$(cat that-file).')
  process.exit(1)
}

const captured = []
let requests = 0

// A recording proxy in front of the real API. It sits in the same place the app already
// expects an endpoint, so the app runs completely unmodified and what gets recorded is
// exactly what the app received.
const proxy = createServer(async (req, res) => {
  const body = await new Promise((r) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => r(b))
  })
  const started = Date.now()
  const nth = ++requests
  console.log(`  request ${nth} out`)
  const upstream = await fetch('https://api.anthropic.com' + req.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
  })
  res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream' })

  // the page shape is embedded in a JSON body, so its quotes arrive escaped
    const ids = [...body.matchAll(/\\?"id\\?":\s*\\?"([a-z0-9]{5,})\\?"/g)].map((m) => m[1])
  // record when each chunk arrived, so a replay reproduces the real pace. Pace is the whole
  // point of streaming, and a replay that dumps everything at once would prove nothing about
  // whether papers visibly fill in.
  const chunks = []
  const reader = upstream.body.getReader()
  const dec = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const text = dec.decode(value, { stream: true })
    chunks.push({ at: Date.now() - started, text })
    res.write(text)
  }
  res.end()
  const raw = chunks.map((c) => c.text).join('')
  captured.push({ status: upstream.status, ms: Date.now() - started, ids, chunks, raw })
  console.log(`  captured ${captured.length}: ${upstream.status}, ${raw.length} bytes, ${chunks.length} chunks, ${Date.now() - started}ms`)
})
await new Promise((r) => proxy.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${proxy.address().port}`
console.log('recording proxy at', url)

// a fresh directory per run, because this is the app's localStorage and a kept one would
// make the second run skip onboarding and test something else
const DATA = mkdtempSync(join(tmpdir(), 'wall-'))

const { page, errors, close } = await openApp({ env: { WALL_API_BASE: url } })

await page.waitForSelector('.onboard .card', { timeout: 20000 })
await page.evaluate((key) => localStorage.setItem('wall-key-anthropic', key), KEY)
// setup is two steps now: pick the model, then the brief where the sample lives
await page.evaluate(() => [...document.querySelectorAll('.onboard .pick')]
  .find((b) => b.getAttribute('aria-label') === 'Claude')?.click())
await page.click('.onboard .primary')
await page.waitForSelector('.sample', { timeout: 10000 })
await page.click('.sample')
await page.waitForSelector('.paper.here', { timeout: 20000 })

// sample the wall while the models are writing, because the claim being tested is that
// papers appear and fill in during the run rather than all at the end
const timeline = []
const watch = setInterval(async () => {
  try {
    timeline.push(await page.evaluate(() => ({
      t: Math.round(performance.now() / 100) / 10,
      papers: document.querySelectorAll('.paper').length,
      counter: document.querySelector('.filmbar span')?.textContent,
      busy: document.querySelector('.busy')?.textContent ?? '',
      headline: document.querySelector('.paper.here iframe')?.contentDocument?.querySelector('h1')?.innerText?.slice(0, 40),
    })))
  } catch { /* window busy */ }
}, 700)

const ok = await page
  .waitForFunction(() => /of 9$/.test(document.querySelector('.filmbar span')?.textContent ?? ''), null, { timeout: 240000 })
  .then(() => true)
  .catch(() => false)
// a page appears on its first section, so the wall reaching nine does not mean the streams
// have finished. The busy line clears only when the fan-out resolves, which is the real end.
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 240000 }).catch(() => {})
clearInterval(watch)

const wall = await page.evaluate(async () => {
  const pages = []
  for (let i = 0; i < 9; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await new Promise((r) => setTimeout(r, 320))
    const doc = document.querySelector('.paper.here iframe')?.contentDocument
    pages.push({
      angle: document.querySelector('.filmbar .angle')?.textContent ?? null,
      headline: doc?.querySelector('h1')?.innerText ?? '',
      sub: doc?.querySelector('h1 + p')?.innerText?.slice(0, 90) ?? '',
    })
  }
  return { counter: document.querySelector('.filmbar span')?.textContent, pages }
})

await mkdir('fixtures', { recursive: true })
await Promise.all(captured.map((c, i) =>
  writeFile(path.join('fixtures', `anthropic-page-${String(i + 1).padStart(2, '0')}.json`), JSON.stringify(c, null, 2)),
))

console.log('\nreached full wall:', ok)
console.log('calls:', JSON.stringify({
  sent: requests,
  recorded: captured.length,
  statuses: [...new Set(captured.map((c) => c.status))],
  bytes: captured.reduce((a, c) => a + c.raw.length, 0),
  slowestMs: Math.max(...captured.map((c) => c.ms)),
}))
console.log('fill timeline:', JSON.stringify(timeline.slice(0, 14)))
const cleanliness = await page.evaluate(async () => {
  const out = []
  for (let i = 0; i < 9; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await new Promise((r) => setTimeout(r, 200))
  }
  for (let i = 0; i < 9; i++) {
    out.push(document.querySelector('.filmbar .flags')?.textContent ?? '?')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await new Promise((r) => setTimeout(r, 200))
  }
  return out
})
console.log('slop per paper:', JSON.stringify(cleanliness))
const worlds = await page.evaluate(async () => {
  const out = []
  for (let i = 0; i < 9; i++) {
    document.querySelectorAll('.filmbar .nav button')[0]?.click()
    await new Promise((r) => setTimeout(r, 120))
  }
  for (let i = 0; i < 9; i++) {
    const w = document.querySelector('.filmbar .world')?.textContent
    const d = document.querySelector('.paper.here iframe')?.contentDocument
    const b = d && getComputedStyle(d.body)
    const h = d && d.querySelector('h1') && getComputedStyle(d.querySelector('h1'))
    out.push(`${w} | ${b?.fontFamily?.split(',')[0]} | ${h?.fontSize} | ${b?.backgroundColor}`)
    document.querySelectorAll('.filmbar .nav button')[1]?.click()
    await new Promise((r) => setTimeout(r, 260))
  }
  return out
})
console.log('\nworlds Claude designed:')
for (const w of worlds) console.log('  ' + w)

console.log('\nwhat Claude actually wrote:')
for (const p of wall.pages) console.log(`  [${p.angle ?? 'base'}] ${p.headline}`)
console.log('\nerrors:', errors.length ? errors.slice(0, 5) : 'none')
console.log('fixtures written:', captured.length)

await close()
proxy.close()
