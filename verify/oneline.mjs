/**
 * The route a first time user takes: no desktop app, no toolchain, no download.
 *
 * WALL_APP is pointed at nothing and the desktop binaries are hidden from the search, so the
 * MCP server must fall back to starting the local server and opening a browser. Playwright
 * stands in for the browser, and drives it the way a person would. What is being proven is that
 * someone with only the one line can get from a brief to a spec in their project.
 *
 * design answers while they are still choosing, so the spec is asserted on collect's reply
 * rather than on design's. What design has to prove here is that it says where the wall is and
 * does not call a working wall a failure.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { fakeAnthropic } from './fake-upstream.mjs'
import { listening } from './harness.mjs'

const { server: upstream, url: upstreamUrl } = await fakeAnthropic()
const work = mkdtempSync(join(tmpdir(), 'wall-first-'))
const at = join(work, '.wall')
/** how long the server this run starts waits before deciding the tab is gone */
const IDLE_MS = 25_000

// no desktop shell exists as far as this run is concerned
const mcp = spawn('node', ['mcp/index.mjs'], {
  env: {
    ...process.env,
    WALL_API_BASE: upstreamUrl,
    // Long enough that the choice always lands inside it, which is the branch this suite owns:
    // design hands back the spec itself when someone chooses while it is still holding. The
    // other branch, where it answers that the wall is open, is verify/mcp.mjs, which sets this
    // to two seconds. Between them both replies are covered and neither is a race.
    WALL_WAIT_MS: '150000',
    WALL_NO_DESKTOP: '1',
    WALL_IDLE_MS: String(IDLE_MS),
    // no key anywhere: the route under test is the one that asks the local Claude instead, and
    // the stand-in for it is in the repository so a suite cannot quietly start calling the real
    // one and reading its failures as a pass
    PATH: join(process.cwd(), 'verify', 'fakebin') + ':' + process.env.PATH,
    HOME: work,
    // This run has no one liner, so the brief has to be read before anything can be written, and
    // that read is the only moment where what the person is shown is in question. Making it take
    // a few real seconds is what turns "is the wall up yet" from a race into a question.
    WALL_FAKE_INTAKE_MS: '5000',
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
await page.waitForSelector('.paper.here', { timeout: 20000 })
console.log('greeted with:', JSON.stringify(await page.evaluate(() => ({
  onboarding: !!document.querySelector('.onboard'),
  working: !!document.querySelector('.building') || !!document.querySelector('.paper.here'),
}))))

// The brief is still being read at this point, and what is on screen is a whole wall arranged
// from it rather than a placeholder. The wait is the same length either way; this is the
// difference between spending it looking at pages and spending it looking at a skeleton.
const during = await page.evaluate(() => ({
  papers: document.querySelectorAll('.paper').length,
  line: document.querySelector('.busy')?.textContent,
  placeholder: !!document.querySelector('.building'),
}))
console.log('while the brief is being read:', JSON.stringify(during))
if (during.placeholder) throw new Error('the wait for the brief is still spent in front of a placeholder')
if (during.line !== 'reading the brief') throw new Error(`the wait says "${during.line}" rather than what it is waiting for`)

await page.waitForSelector('.paper.here', { timeout: 120000 })
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 180000 })
// eight pages, each written for its own world, each arguing its own angle
console.log('wall written:', JSON.stringify(await page.evaluate(async () => {
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
// The point of this route: nothing was configured and no key exists anywhere. It used to only be
// narrated, so a run where a key had leaked in would have printed the same line and passed.
const bare = await page.evaluate(() => ({
  model: localStorage.getItem('wall-model'),
  keysInBrowser: Object.keys(localStorage).filter((k) => k.startsWith('wall-key')).length,
}))
console.log('nothing configured:', JSON.stringify(bare))
if (bare.model !== 'claude-code') throw new Error(`a first run should default to the local Claude, not ${bare.model}`)
if (bare.keysInBrowser) throw new Error('this route ran with a key in the browser, so it proved the wrong path')

// someone chose while design was still holding the call, so it answers with the spec itself
const done = await waitFor(1, 30000)
const text = done?.result?.content?.[0]?.text ?? ''
console.log('design returned:', JSON.stringify({
  isError: !!done?.result?.isError,
  hasTokens: text.includes('## Tokens'),
  namesTheDirectory: text.includes(at),
}))
if (done?.result?.isError) throw new Error('design called a working wall an error')
if (!text.includes('## Tokens')) throw new Error('a choice made while design was waiting did not come back from it')

// the spec is collect's to hand over now, so that is where it is asserted
rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'collect', arguments: { dir: work } } })
const spec = (await waitFor(2, 30000))?.result?.content?.[0]?.text ?? ''
console.log('collected:', JSON.stringify({
  hasTokens: spec.includes('## Tokens'),
  namesTheDirectory: spec.includes(at),
}))
if (!spec.includes('## Tokens')) throw new Error('collect did not hand back a spec')
console.log('files in the project:', JSON.stringify(['chosen.md', 'chosen.html', 'chosen.json'].filter((f) => existsSync(join(at, f)))))
// both sides of the handoff say which shape they speak, because npx keeps the writer current
// while whatever reads the directory can be any age
console.log('format stamped:', JSON.stringify({
  request: JSON.parse(readFileSync(join(at, 'request.json'), 'utf8')).format,
  chosen: JSON.parse(readFileSync(join(at, 'chosen.json'), 'utf8')).format,
}))
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none')

await browser.close()
// The server was started by a tool call that has already returned, so nothing is left to kill it
// but itself. With the tab closed there is nobody to serve and it holds keys, so it has to stop.
// It is watched by opening a socket rather than by asking it for anything, because a request is
// the very activity being waited out and polling with fetch would keep it alive.
const closed = Date.now()
let alive = true
while (alive && Date.now() - closed < IDLE_MS + 30_000) {
  await new Promise((r) => setTimeout(r, 1000))
  alive = await listening(url)
}
console.log('stopped itself once the tab closed:', JSON.stringify({ stopped: !alive, seconds: Math.round((Date.now() - closed) / 1000) }))
if (alive) throw new Error('the server it started is still running with nobody using it')

mcp.kill()
upstream.close()
