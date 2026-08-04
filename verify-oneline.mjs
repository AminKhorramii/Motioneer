/**
 * The route a first time user takes: no desktop app, no toolchain, no download.
 *
 * WALL_APP is pointed at nothing and the desktop binaries are hidden from the search, so the
 * MCP server must fall back to starting the local server and opening a browser. Playwright
 * stands in for the browser, and drives it the way a person would. What is being proven is that
 * someone with only the one line can get from a brief to a spec in their project.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { fakeAnthropic } from './fake-upstream.mjs'

const { server: upstream, url: upstreamUrl } = await fakeAnthropic()
const work = mkdtempSync(join(tmpdir(), 'wall-first-'))
const at = join(work, '.wall')

// no desktop shell exists as far as this run is concerned
const mcp = spawn('node', ['mcp/index.mjs'], {
  env: {
    ...process.env,
    WALL_API_BASE: upstreamUrl,
    WALL_WAIT_MS: '150000',
    WALL_NO_DESKTOP: '1',
    // no key anywhere: the route under test is the one that asks the local Claude instead
    PATH: '/tmp/fakebin:' + process.env.PATH,
    HOME: work,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})
const replies = []
let buf = ''
mcp.stdout.on('data', (d) => {
  buf += d
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const l of lines) if (l.trim()) replies.push(JSON.parse(l))
})
mcp.stderr.on('data', (d) => process.stdout.write('  mcp: ' + d))
const rpc = (m) => mcp.stdin.write(JSON.stringify(m) + '\n')
const waitFor = async (id, ms) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const hit = replies.find((r) => r.id === id)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
  name: 'design',
  arguments: { brief: 'Spoor makes every AI session searchable, locally.', name: 'Spoor', dir: work },
} })

// the model is the one already on the machine, which is what a first run should default to
// the server prints where it is; find it the way the person's browser was pointed at it
let url = null
const until = Date.now() + 20000
while (!url && Date.now() < until) {
  await new Promise((r) => setTimeout(r, 400))
  if (existsSync(join(at, 'open.txt'))) url = readFileSync(join(at, 'open.txt'), 'utf8').trim()
}
console.log('opened at:', JSON.stringify(url))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await page.goto(url)

// a brief handed in from outside means no setup at all, even in a browser
await page.waitForTimeout(1500)
console.log('greeted with:', JSON.stringify(await page.evaluate(() => ({
  onboarding: !!document.querySelector('.onboard'),
  working: !!document.querySelector('.building') || !!document.querySelector('.paper.here'),
}))))

await page.waitForSelector('.paper.here', { timeout: 120000 })
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 180000 })
// the wall is written in one reply on this path, so check it still came out as eight pages
console.log('batched wall:', JSON.stringify(await page.evaluate(async () => {
  const heads = new Set()
  const angles = new Set()
  for (let i = 0; i < 9; i++) {
    document.querySelectorAll('.filmbar .nav button')[1]?.click()
    await new Promise((r) => setTimeout(r, 260))
    const d = document.querySelector('.paper.here iframe')?.contentDocument
    heads.add(d?.querySelector('h1, h2')?.innerText ?? '')
    const a = document.querySelector('.filmbar .angle')?.textContent
    if (a) angles.add(a)
  }
  for (let i = 0; i < 9; i++) {
    document.querySelectorAll('.filmbar .nav button')[0]?.click()
    await new Promise((r) => setTimeout(r, 90))
  }
  return { papers: document.querySelector('.filmbar .count')?.textContent, distinctHeadlines: heads.size, angles: angles.size }
})))

const sent = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('.filmbar button')].find((x) => x.textContent.includes('to Claude'))
  b?.click()
  await new Promise((r) => setTimeout(r, 1500))
  return { hadButton: !!b, toast: document.querySelector('.toast')?.textContent ?? null }
})
console.log('sent back:', JSON.stringify(sent))
// the point of this route: nothing was configured and no key exists anywhere
console.log('nothing configured:', JSON.stringify(await page.evaluate(() => ({
  model: localStorage.getItem('wall-model'),
  keysInBrowser: Object.keys(localStorage).filter((k) => k.startsWith('wall-key')).length,
}))))

const done = await waitFor(1, 30000)
const text = done?.result?.content?.[0]?.text ?? ''
console.log('design returned:', JSON.stringify({
  isError: !!done?.result?.isError,
  hasTokens: text.includes('## Tokens'),
  namesTheDirectory: text.includes(at),
}))
console.log('files in the project:', JSON.stringify(['chosen.md', 'chosen.html', 'chosen.json'].filter((f) => existsSync(join(at, f)))))
// both sides of the handoff say which shape they speak, because npx keeps the writer current
// while whatever reads the directory can be any age
console.log('format stamped:', JSON.stringify({
  request: JSON.parse(readFileSync(join(at, 'request.json'), 'utf8')).format,
  chosen: JSON.parse(readFileSync(join(at, 'chosen.json'), 'utf8')).format,
}))
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none')

await browser.close()
mcp.kill()
upstream.close()
