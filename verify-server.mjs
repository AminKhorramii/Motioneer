/**
 * The served deployment: the same build, with the keys behind the server.
 *
 * It runs the real server against the fake upstream, so nothing is mocked in the browser at
 * all: the page is fetched over HTTP, the model call goes to the server, and the server calls
 * a provider. The point being tested is that the visitor needs no key and never sees one.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fakeAnthropic } from './fake-upstream.mjs'

const { server: upstream, url: upstreamUrl } = await fakeAnthropic()

const wall = spawn('node', ['server/index.mjs'], {
  env: {
    ...process.env,
    PORT: '0',
    ANTHROPIC_API_KEY: 'server-held-key',
    GEMINI_API_KEY: 'server-held-key',
    WALL_API_BASE: upstreamUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const PORT = await new Promise((resolve, reject) => {
  wall.stdout.on('data', (d) => {
    process.stdout.write('  server: ' + d)
    const m = String(d).match(/localhost:(\d+)/)
    if (m) resolve(Number(m[1]))
  })
  wall.stderr.on('data', (d) => {
    process.stdout.write('  server error: ' + d)
    reject(new Error('server failed to start'))
  })
})

const config = await (await fetch(`http://127.0.0.1:${PORT}/api/config`)).json()
console.log('config:', JSON.stringify(config))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

await page.goto(`http://127.0.0.1:${PORT}/`)
await page.waitForSelector('.onboard .card', { timeout: 20000 })

// the visitor holds no key, and the app must still offer the described path
await page.evaluate(() => document.querySelector('.onboard .pick')?.click())
await page.click('.onboard .primary')
await page.waitForSelector('.onboard .tell', { timeout: 10000 })
const offered = await page.evaluate(() => ({
  served: !!window.__wallServed,
  keysInBrowser: Object.keys(localStorage).filter((k) => k.startsWith('wall-key')).length,
  describeBox: !!document.querySelector('.onboard .tell'),
}))
console.log('served app:', JSON.stringify(offered))

await page.fill('.onboard .tell', 'Spoor makes every AI session searchable, locally.')
await page.click('.onboard .primary')

// every call here is a real streamed request through the server to a provider, replayed at the
// pace it was recorded at, so the waits are measured in tens of seconds rather than hundreds
// of milliseconds
await page.waitForFunction(
  () => document.querySelector('.onboard .primary')?.textContent?.trim() !== 'reading',
  null,
  { timeout: 90000 },
)
for (let i = 0; i < 8 && !(await page.locator('.paper.here').count()); i++) {
  await page.evaluate(() => {
    const gap = document.querySelector('.onboard .fields input:not([type=password])')
    if (gap && !gap.value) {
      const set = Object.getOwnPropertyDescriptor(gap.constructor.prototype, 'value').set
      set.call(gap, 'people who build with agents')
      gap.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.querySelector('.onboard .primary')?.click()
  })
  await page.waitForTimeout(800)
}
await page.waitForSelector('.paper.here', { timeout: 60000 })
await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 180000 })

const wallState = await page.evaluate(() => ({
  counter: document.querySelector('.filmbar .count')?.textContent,
  worlds: document.querySelector('.filmbar .world')?.textContent,
  keysInBrowser: Object.keys(localStorage).filter((k) => k.startsWith('wall-key')).map((k) => localStorage.getItem(k)).filter(Boolean).length,
}))
console.log('wall written by the server:', JSON.stringify(wallState))
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')

await browser.close()
wall.kill()
upstream.close()
