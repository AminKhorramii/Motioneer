/**
 * The agent path, end to end, in the three pieces it actually has.
 *
 * The protocol is spoken to the real MCP server. The app is opened with a request in hand and
 * driven the way a person drives it. The handoff is then read back through the MCP server's own
 * collect tool. Nothing is stubbed but the model.
 *
 * The app is served rather than launched as a desktop window, because Tauri has no WebDriver on
 * macOS and Electron is gone. The served host answers request and handoff over /api, so the same
 * flow runs: a brief arrives from outside, the page skips setup, and choosing writes the three
 * files where the agent will look. What is not covered here is the desktop shell's own commands,
 * which are tested in Rust, in src-tauri/src/main.rs.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { fakeAnthropic } from './fake-upstream.mjs'

const { server, url } = await fakeAnthropic()
const work = mkdtempSync(join(tmpdir(), 'wall-agent-'))
const at = join(work, '.wall')
mkdirSync(at, { recursive: true })

// ——— 1. the protocol ———
const mcp = spawn('node', ['mcp/index.mjs'], { env: { ...process.env, WALL_API_BASE: url }, stdio: ['pipe', 'pipe', 'pipe'] })
const replies = []
let buf = ''
mcp.stdout.on('data', (d) => {
  buf += d
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const l of lines) if (l.trim()) replies.push(JSON.parse(l))
})
mcp.stderr.on('data', (d) => process.stdout.write('  mcp: ' + d))
const rpc = (msg) => mcp.stdin.write(JSON.stringify(msg) + '\n')
const waitFor = async (id, ms = 30000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const hit = replies.find((r) => r.id === id)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 150))
  }
  return null
}

rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
console.log('initialize:', JSON.stringify((await waitFor(1))?.result?.serverInfo))
rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
console.log('tools:', JSON.stringify((await waitFor(2))?.result?.tools?.map((t) => t.name)))
rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check', arguments: { html: '<style>p{font-size:11px}h1{backdrop-filter:blur(4px)}</style>' } } })
console.log('check:', JSON.stringify((await waitFor(3))?.result?.content?.[0]?.text?.split('\n')))
rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'collect', arguments: { dir: work } } })
console.log('collect before choosing:', JSON.stringify({ isError: !!(await waitFor(4))?.result?.isError }))

// ——— 2. the desktop, launched the way the server launches it ———
const request = join(at, 'request.json')
writeFileSync(request, JSON.stringify({ brief: 'Spoor makes every AI session searchable, locally.', name: 'Spoor' }), 'utf8')

const wall = spawn('node', ['server/index.mjs'], {
  env: { ...process.env, PORT: '0', ANTHROPIC_API_KEY: 'server-held-key', WALL_API_BASE: url, WALL_REQUEST: request, WALL_HANDOFF_DIR: at },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const PORT = await new Promise((resolve, reject) => {
  wall.stdout.on('data', (d) => {
    const m = String(d).match(/localhost:(\d+)/)
    if (m) resolve(Number(m[1]))
  })
  wall.stderr.on('data', (d) => reject(new Error('server failed: ' + d)))
})

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await page.goto(`http://127.0.0.1:${PORT}/`)

// a brief handed in from outside must skip setup entirely
await page.waitForTimeout(1200)
console.log('greeted with:', JSON.stringify(await page.evaluate(() => ({
  onboarding: !!document.querySelector('.onboard'),
  buildingOrPaper: !!document.querySelector('.building') || !!document.querySelector('.paper.here'),
}))))

await page.waitForSelector('.paper.here', { timeout: 120000 })
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 180000 })

const sent = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('.filmbar button')].find((x) => x.textContent.includes('send back'))
  b?.click()
  await new Promise((r) => setTimeout(r, 1200))
  return { hadButton: !!b, toast: document.querySelector('.toast')?.textContent ?? null }
})
console.log('sent back:', JSON.stringify(sent))
console.log('files written:', JSON.stringify(['chosen.md', 'chosen.html', 'chosen.json'].filter((f) => existsSync(join(at, f)))))
await browser.close()
wall.kill()

// ——— 3. the agent picks it up ———
rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'collect', arguments: { dir: work } } })
const spec = (await waitFor(5))?.result?.content?.[0]?.text ?? ''
console.log('collected:', JSON.stringify({
  hasTokens: spec.includes('## Tokens'),
  hasSections: spec.includes('## Sections'),
  lines: spec.split('\n').length,
}))
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none')

mcp.kill()
server.close()
