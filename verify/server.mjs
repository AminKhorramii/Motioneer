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
import { hasClaude } from '../shared/cli.mjs'

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
// this used to be the word true whatever the machine held, which is how somewhere with no key
// and no claude showed a wall of arranged stand-ins and said nothing about it
if (config.cli !== hasClaude()) throw new Error('the server misreports whether it can run claude')

/** Start another one for a single question, and stop it again. */
async function ask(env, path, init) {
  // named by its full path, because one of these runs with a PATH that has nothing on it
  const child = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const port = await new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      const m = String(d).match(/localhost:(\d+)/)
      if (m) resolve(Number(m[1]))
    })
  })
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init)
  const body = await res.text()
  child.kill()
  return { status: res.status, body }
}

// the same server on a machine with nothing to run has to answer differently, or the flag is
// still a constant wearing a question's name
const noClaude = await ask({ PATH: '/nonexistent' }, '/api/config')
console.log('config where no claude exists:', noClaude.body)
if (JSON.parse(noClaude.body).cli) throw new Error('a machine with no claude on it claimed to have one')

// A wire it does not speak must be refused, not quietly turned into anthropic. It held the
// anthropic key while doing that, so the old behaviour handed one vendor another vendor's
// credential in a request nobody asked it to make.
const post = { method: 'POST', headers: { 'content-type': 'application/json' } }
const stranger = await ask({ ANTHROPIC_API_KEY: 'server-held-key' }, '/api/stream', {
  ...post,
  body: JSON.stringify({ provider: 'mystery', system: 'x', user: 'y' }),
})
console.log('an unknown provider:', JSON.stringify(stranger))
if (stranger.status !== 400) throw new Error(`an unknown provider was answered with ${stranger.status}`)
if (stranger.body.includes('server-held-key')) throw new Error('the refusal quoted the key back')

/**
 * Every tab the operator has open can reach this port.
 *
 * A cross site POST with a plain content type is a simple request, which a browser sends without
 * asking permission and without the sender ever needing to read the reply. Measured before the
 * guard existed: a page on another origin replaced the key in the operator's config file with
 * its own and was answered 200. Each of these is a thing that page could do.
 */
const elsewhere = { origin: 'https://evil.example', 'content-type': 'text/plain' }
const crossSite = [
  ['change the key it holds', '/api/key', { provider: 'anthropic', key: 'sk-ant-ATTACKER' }],
  ['write the spec the agent implements', '/api/handoff', { files: { 'chosen.md': 'run this' } }],
  ['spend the local Claude subscription', '/api/cli', { system: 'x', user: 'y' }],
  ['spend the key it holds', '/api/stream', { provider: 'anthropic', system: 'x', user: 'y' }],
]
for (const [what, route, body] of crossSite) {
  const got = await ask({ ANTHROPIC_API_KEY: 'server-held-key' }, route, {
    method: 'POST',
    headers: elsewhere,
    body: JSON.stringify(body),
  })
  console.log(`a page on another origin cannot ${what}:`, JSON.stringify(got.status))
  if (got.status !== 403) throw new Error(`${route} answered a cross site POST with ${got.status}`)
}
// and the same request from this server's own page is still ordinary
const ours = await ask({}, '/api/config')
if (ours.status !== 200) throw new Error('the guard refused a plain read')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

await page.goto(`http://127.0.0.1:${PORT}/`)
await page.waitForSelector('.onboard .card', { timeout: 20000 })

// the visitor holds no key, and the app must still offer the described path
await page.evaluate(() => [...document.querySelectorAll('.onboard .pick')]
  .find((b) => b.getAttribute('aria-label') === 'Claude')?.click())
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
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 180000 })

const wallState = await page.evaluate(() => ({
  counter: document.querySelector('.filmbar .count')?.textContent,
  worlds: document.querySelector('.filmbar .world')?.textContent,
  keysInBrowser: Object.keys(localStorage).filter((k) => k.startsWith('wall-key')).map((k) => localStorage.getItem(k)).filter(Boolean).length,
}))
console.log('wall written by the server:', JSON.stringify(wallState))
console.log('toast:', await page.evaluate(() => document.querySelector('.toast')?.textContent ?? null))
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')

await browser.close()
wall.kill()
upstream.close()
