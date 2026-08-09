/**
 * The agent path, end to end, driven the way an agent drives it.
 *
 * The protocol is spoken to the real MCP server, and design() is called over it with the whole
 * argument set, so what opens the window is Wall's own code rather than a harness imitating it.
 * The app is then driven the way a person drives it, and the handoff is read back through the
 * same server's collect tool. Nothing is stubbed but the model.
 *
 * The app is served rather than launched as a desktop window, because Tauri has no WebDriver on
 * macOS and Electron is gone. The served host answers request and handoff over /api, so the same
 * flow runs: a brief arrives from outside, the page skips setup, and choosing writes the three
 * files where the agent will look. What is not covered here is the desktop shell's own commands,
 * which are tested in Rust, in src-tauri/src/main.rs.
 *
 * What it asserts, beyond the flow running: design answers quickly and without an error, because
 * an agent told the call failed will call it again and replace the wall being read; the brief it
 * writes carries every field it was given, because dropping them cost a model call and about
 * forty seconds; and the server it started outlives the call and then stops on its own, because
 * a process holding API keys should end with the window rather than with the login session.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { fakeAnthropic } from './fake-upstream.mjs'
import { listening } from './harness.mjs'

const { server, url } = await fakeAnthropic()
const work = mkdtempSync(join(tmpdir(), 'wall-agent-'))
const at = join(work, '.wall')
mkdirSync(at, { recursive: true })

/** how long the server this run starts waits before deciding the tab is gone */
const IDLE_MS = 25_000

// ——— 1. the protocol ———
const mcp = spawn('node', ['mcp/index.mjs'], {
  env: {
    ...process.env,
    WALL_API_BASE: url,
    // no desktop shell as far as this run is concerned, so design takes the browser route
    WALL_NO_DESKTOP: '1',
    // long enough to catch a choice already made, short enough that the suite is not the thing
    // proving a fifteen minute wait works
    WALL_WAIT_MS: '2000',
    WALL_IDLE_MS: String(IDLE_MS),
    // the model already on the machine, standing in, so this costs no session and no key
    PATH: join(process.cwd(), 'verify', 'fakebin') + ':' + process.env.PATH,
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
const tools = (await waitFor(2))?.result?.tools ?? []
console.log('tools:', JSON.stringify(tools.map((t) => t.name)))
// the two step is the whole shape of this tool, and the only place an agent can learn it is here
console.log('descriptions teach the two step:', JSON.stringify({
  designSaysItReturnsEarly: /returns as soon|returns in seconds/i.test(tools.find((t) => t.name === 'design')?.description ?? ''),
  collectNamedByDesign: (tools.find((t) => t.name === 'design')?.description ?? '').includes('collect'),
}))
rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check', arguments: { html: '<style>p{font-size:11px}h1{backdrop-filter:blur(4px)}.hero{background:linear-gradient(135deg,#6366f1,#a78bfa)}*{transition:all .3s}.dot1{background:#ff5f56}.dot2{background:#ffbd2e}</style>' } } })
console.log('check:', JSON.stringify((await waitFor(3))?.result?.content?.[0]?.text?.split('\n')))
rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'collect', arguments: { dir: work } } })
console.log('collect before choosing:', JSON.stringify({ isError: !!(await waitFor(4))?.result?.isError }))

// ——— 2. design, called the way an agent that has read the project calls it ———
const ARGS = {
  brief: 'Spoor makes every AI session searchable, locally.',
  name: 'Spoor',
  oneLiner: 'Spoor makes 900MB of agent history searchable in under a second.',
  what: 'It reads the transcripts your AI tools already write to disk and indexes them.',
  audience: 'people who build with agents',
  cta: 'Download for macOS',
  dir: work,
}
const started = Date.now()
rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'design', arguments: ARGS } })
const opened = await waitFor(5, 30000)
const openedText = opened?.result?.content?.[0]?.text ?? ''
const took = Date.now() - started
console.log('design returned:', JSON.stringify({
  seconds: Math.round(took / 1000),
  isError: !!opened?.result?.isError,
  saysWhereItIs: /http:\/\/localhost:\d+/.test(openedText),
  namesCollect: openedText.includes('collect'),
  saysNothingChosenIsNormal: openedText.includes('normal'),
}))
// a tool error here is the bug this suite exists for: the agent is told a working wall failed
if (opened?.result?.isError) throw new Error('design reported an error while the wall was open')
if (took > 25_000) throw new Error(`design held the call for ${Math.round(took / 1000)}s`)

// the regression for the forty second bug: everything the caller was asked to supply is on disk,
// so the app has nothing left to work out with a model call
const written = JSON.parse(readFileSync(join(at, 'request.json'), 'utf8'))
console.log('brief written for the app:', JSON.stringify(written))
for (const key of ['brief', 'name', 'oneLiner', 'what', 'audience', 'cta']) {
  if (written[key] !== ARGS[key]) throw new Error(`design dropped ${key} on the way to the app`)
}
if (written.format !== 1) throw new Error('the request carries no format stamp for the app to check')

// ——— 3. the wall, opened where the person was sent ———
const where = readFileSync(join(at, 'open.txt'), 'utf8').trim()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await page.goto(where)

// a brief handed in from outside must skip setup entirely
await page.waitForTimeout(1200)
console.log('greeted with:', JSON.stringify(await page.evaluate(() => ({
  onboarding: !!document.querySelector('.onboard'),
  buildingOrPaper: !!document.querySelector('.building') || !!document.querySelector('.paper.here'),
}))))

await page.waitForSelector('.paper.here', { timeout: 120000 })
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 180000 })
// The wall is finished when no place on it is still a stand-in. Waiting on the busy line alone
// is a race in both directions: it is not up yet in the first half second, and it is down again
// before a fast model has finished, so either way a suite can end up reading eight drafts.
await page.click('.views button:nth-child(2)')
await page.waitForFunction(() => {
  const marks = [...document.querySelectorAll('.cellbar .flags')]
  return marks.length >= 9 && marks.every((m) => m.textContent !== 'drafting')
}, null, { timeout: 180000 })
console.log('wall written:', JSON.stringify(await page.evaluate(() => ({
  papers: document.querySelectorAll('.cell').length,
  stillDrafting: [...document.querySelectorAll('.cellbar .flags')].filter((m) => m.textContent === 'drafting').length,
}))))

// The agent said what this is, so the app used it. Anything else here means the brief was read
// back through a model, which is the call the arguments above exist to skip.
const usedBrief = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('wall-state') ?? 'null')?.product ?? null
  } catch {
    return null
  }
})
console.log('intake skipped:', JSON.stringify({
  oneLiner: usedBrief?.oneLiner,
  cta: usedBrief?.cta,
  matchesWhatTheAgentSaid: usedBrief?.oneLiner === ARGS.oneLiner && usedBrief?.cta === ARGS.cta,
}))
if (usedBrief?.oneLiner !== ARGS.oneLiner) {
  throw new Error('the app did not use the one liner it was handed, so it read the brief again')
}

// the first paper is the page as it arrived, kept there to compare against, so a choice that
// stands for the agent path has to be one of the eight the model wrote
await page.evaluate(() => document.querySelectorAll('.cell')[1]?.click())
await page.waitForSelector('.paper.here', { timeout: 30000 })

const sent = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('.filmbar button')].find((x) => x.textContent.includes('to Claude'))
  b?.click()
  await new Promise((r) => setTimeout(r, 1200))
  return { hadButton: !!b, toast: document.querySelector('.toast')?.textContent ?? null }
})
console.log('sent back:', JSON.stringify(sent))
const files = ['chosen.md', 'chosen.html', 'chosen.json'].filter((f) => existsSync(join(at, f)))
console.log('files written:', JSON.stringify(files))
if (files.length !== 3) throw new Error(`choosing left ${files.length} of the three files behind`)
// both sides of the handoff say which shape they speak, because npx keeps the writer current
// while whatever reads the directory can be any age
console.log('chosen format:', JSON.parse(readFileSync(join(at, 'chosen.json'), 'utf8')).format)

// ——— 4. the agent picks it up ———
rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'collect', arguments: { dir: work } } })
const spec = (await waitFor(6))?.result?.content?.[0]?.text ?? ''
console.log('collected:', JSON.stringify({
  hasTokens: spec.includes('## Tokens'),
  hasSections: spec.includes('## Sections'),
  namesTheRender: spec.includes(`Reference render: ${join(at, 'chosen.html')}`),
  namesTheStructuredPage: spec.includes(`Structured page: ${join(at, 'chosen.json')}`),
  lines: spec.split('\n').length,
}))
if (!spec.includes('## Tokens')) throw new Error('collect returned something that is not a spec')
if (!spec.includes('Structured page:')) throw new Error('collect did not name the structured page')
// The stand-in writes "<angle> headline <n>", so this is the difference between a page a model
// wrote and the local arrangement that stands in until one arrives. Without it the whole suite
// would pass on a wall of eight unwritten drafts.
if (!/ headline \d/.test(spec)) throw new Error('the chosen page was never written, only arranged')

// ——— 5. the server outlives the call, then ends with the window ———
console.log('still serving after the choice:', JSON.stringify((await fetch(`${where}/api/config`)).ok))

await browser.close()
// Nothing is beating now, so the idle timer is the only thing left. It is watched by opening a
// socket and closing it rather than by asking for anything, because a request is exactly the
// activity being waited out: polling with fetch keeps the server alive and then reports that it
// would not die.
const closed = Date.now()
let alive = true
while (alive && Date.now() - closed < IDLE_MS + 30_000) {
  await new Promise((r) => setTimeout(r, 1000))
  alive = await listening(where)
}
console.log('stopped itself once the tab closed:', JSON.stringify({
  stopped: !alive,
  seconds: Math.round((Date.now() - closed) / 1000),
}))
if (alive) throw new Error('the server it started is still running with nobody using it')

console.log('errors:', errors.length ? errors.slice(0, 3) : 'none')

mcp.kill()
server.close()
