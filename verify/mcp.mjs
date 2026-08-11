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
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { fakeAnthropic } from './fake-upstream.mjs'
import { listening } from './harness.mjs'

const { server, url } = await fakeAnthropic()
const work = mkdtempSync(join(tmpdir(), 'wall-agent-'))
const at = join(work, '.wall')
mkdirSync(at, { recursive: true })

/**
 * A project that has already made walls, so this run is a second wall rather than a first.
 *
 * Everything about the memory was proved at the node level and nothing proved it survived the
 * whole path: read off disk by the server, carried on the request, turned into a lean by the app
 * and appended to the prompt of a real design call. Each of those could stop happening without a
 * single existing check going red, because a suite sees the wall that came back and not the
 * prompt that produced it. WALL_PROMPT_LOG makes the stand-in model write down what it was asked.
 */
const LIKED = ['thermal receipt', 'boarding pass']
const trait = { layout: 'column', display: 'mono', scale: 1.2, density: 0.8, caps: true, dark: true }
const promptLog = join(work, 'prompts.jsonl')
writeFileSync(join(at, 'taste.json'), JSON.stringify({
  format: 1,
  walls: Array.from({ length: 3 }, (_, n) => ({
    at: `2026-08-0${n + 1}`,
    kind: 'software',
    kept: LIKED.map((ground, i) => ({ ...trait, world: ground, ground, chosen: i === 0 })),
    killed: [{ ...trait, world: 'glass atrium', ground: 'museum vitrine', flags: ['glassmorphism'] }],
    asked: [],
  })),
}, null, 2))

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
    // inherited down to the stand-in model, which the server spawns
    WALL_PROMPT_LOG: promptLog,
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

// ——— 3a. the memory reached the model that designed this wall ———
const prompts = readFileSync(promptLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const designs = prompts.filter((p) => p.sys.includes('"worlds"'))
const pages = prompts.filter((p) => !p.sys.includes('"worlds"') && !p.sys.includes('"product"'))
const kills = 'taken pages off the wall for glassmorphism'
const keeps = 'The pages they keep are'
console.log('the memory reached the model:', JSON.stringify({
  designCalls: designs.length,
  toldWhatWasCulled: designs.filter((p) => p.sys.includes(kills)).length,
  toldWhatIsKept: designs.filter((p) => p.sys.includes(keeps)).length,
  copyCallsToldWhatWasCulled: pages.filter((p) => p.body.includes('have been taken off')).length,
  // the note goes after the whole shared system prompt, so the long prefix in front of it caches
  noteSitsAtTheTail: designs.every((p) => !p.sys.includes(kills) || p.sys.indexOf(kills) > p.sys.length - 600),
}))
if (!designs.length) throw new Error('no design call was recorded, so this check proves nothing')
if (designs.some((p) => !p.sys.includes(kills))) {
  throw new Error('a design call was not told what this person culls, and pruning goes to every hand')
}
// the half that could converge a wall is quarantined to the hands dealt from what they like
if (designs.filter((p) => p.sys.includes(keeps)).length > 2) {
  throw new Error(`${designs.filter((p) => p.sys.includes(keeps)).length} of ${designs.length} hands were told what this person likes, and the cap is two`)
}
if (!designs.some((p) => p.sys.includes(keeps))) {
  throw new Error('no hand was told what this person keeps, so the favoured half of the memory never arrives')
}
if (!pages.some((p) => p.body.includes('have been taken off'))) {
  throw new Error('the copy calls were never told what this person culls')
}

// ——— 3b. the wall is triaged before anything is chosen ———
// A choice with no reasoning behind it says only which page won, and the reasoning is the half
// an agent can act on. Two of the three judgements leave no mark on the page itself: a paper
// taken off the wall, and an instruction typed into the bar. Both are driven here, so section 4
// can read them back out of the handoff.
const culledTo = await page.evaluate(async () => {
  const cells = [...document.querySelectorAll('.cell')]
  const cull = cells[cells.length - 1]?.querySelector('button.cull')
  cull?.click()
  await new Promise((r) => setTimeout(r, 400))
  return { hadCull: !!cull, cells: document.querySelectorAll('.cell').length }
})
console.log('culled a page:', JSON.stringify(culledTo))
if (culledTo.cells !== 8) throw new Error(`culling left ${culledTo.cells} papers on the wall`)

// the first paper is the page as it arrived, kept there to compare against, so a choice that
// stands for the agent path has to be one of the eight the model wrote
await page.evaluate(() => document.querySelectorAll('.cell')[1]?.click())
await page.waitForSelector('.paper.here', { timeout: 30000 })

const INSTRUCTION = 'tighter spacing, and name the pain in the headline'
await page.fill('.dock input.bar', INSTRUCTION)
await page.press('.dock input.bar', 'Enter')
await page.waitForFunction(() => !document.querySelector('[data-busy]'), null, { timeout: 120000 })
console.log('asked the bar for something:', JSON.stringify({
  said: INSTRUCTION,
  toast: await page.evaluate(() => document.querySelector('.toast')?.textContent ?? null),
}))

const sent = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('.filmbar button')].find((x) => x.textContent.includes('to Claude'))
  b?.click()
  await new Promise((r) => setTimeout(r, 1200))
  return { hadButton: !!b, toast: document.querySelector('.toast')?.textContent ?? null }
})
console.log('sent back:', JSON.stringify(sent))
const files = ['chosen.md', 'chosen.html', 'chosen.json', 'taste.json'].filter((f) => existsSync(join(at, f)))
console.log('files written:', JSON.stringify(files))
if (files.length !== 4) throw new Error(`choosing left ${files.length} of the four files behind`)
// both sides of the handoff say which shape they speak, because npx keeps the writer current
// while whatever reads the directory can be any age
const structured = JSON.parse(readFileSync(join(at, 'chosen.json'), 'utf8'))
console.log('chosen format:', structured.format)
// The why, not only the what. The story is additive under the same format on purpose: bumping
// it would make every installed reader refuse the whole file to protect it from a field it can
// ignore, so the number staying at 2 is the assertion rather than an oversight.
console.log('the cull story travelled:', JSON.stringify({
  of: structured.story?.of,
  kills: structured.story?.kills?.length,
  killNamesItsGround: Boolean(structured.story?.kills?.[0]?.ground),
  asked: structured.story?.asked,
}))
if (structured.format !== 2) throw new Error('the story arrived by bumping the format, so every installed reader now refuses the file')
if (!structured.story?.kills?.length) throw new Error('a page was taken off the wall and the handoff says nothing about it')
if (!structured.story?.asked?.some((a) => a.said === INSTRUCTION && a.chosen)) {
  throw new Error('what was asked of the chosen page did not travel with it')
}

// ——— 4. the agent picks it up ———
rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'collect', arguments: { dir: work } } })
const spec = (await waitFor(6))?.result?.content?.[0]?.text ?? ''
console.log('collected:', JSON.stringify({
  hasTokens: spec.includes('## Tokens'),
  hasSections: spec.includes('## Sections'),
  namesTheRender: spec.includes(`Reference render: ${join(at, 'chosen.html')}`),
  namesTheStructuredPage: spec.includes(`Structured page: ${join(at, 'chosen.json')}`),
  saysWhyThisOne: spec.includes('## Why this one'),
  lines: spec.split('\n').length,
}))
if (!spec.includes('## Tokens')) throw new Error('collect returned something that is not a spec')
if (!spec.includes('Structured page:')) throw new Error('collect did not name the structured page')
// the spec is what an agent implements from, so the reasoning has to reach it as prose rather
// than sitting in a field beside it that nothing reads
if (!spec.includes('## Why this one')) throw new Error('the spec carries the winner without the reasoning behind it')
if (!spec.includes(INSTRUCTION)) throw new Error('the spec does not say what was asked of the page it describes')
// The stand-in writes "<angle> headline <n>", so this is the difference between a page a model
// wrote and the local arrangement that stands in until one arrives. Without it the whole suite
// would pass on a wall of eight unwritten drafts.
if (!/ headline \d/.test(spec)) throw new Error('the chosen page was never written, only arranged')

// ——— 4b. what the project now remembers, and a second wall reading it ———
// The file is the product's rather than the browser's, so it has to be on disk beside the chosen
// files and it has to reach the next window through the same call that carries the brief. An
// endpoint of its own would be a second round trip to learn that most projects have nothing yet.
const taste = JSON.parse(readFileSync(join(at, 'taste.json'), 'utf8'))
const wall = taste.walls?.[0]
console.log('what the project remembers:', JSON.stringify({
  format: taste.format,
  walls: taste.walls?.length,
  kind: wall?.kind,
  chosenIsFirst: wall?.kept?.[0]?.chosen,
  killed: wall?.killed?.length,
  // the culled page was designed from a direction, so the memory can name what to stop dealing.
  // The chosen one here is a built-in world, which grew from nobody's direction and says so by
  // leaving this out rather than by inventing a name for itself
  killNamesItsGround: wall?.killed?.[0]?.ground,
  asked: wall?.asked?.length,
}))
if (taste.format !== 1) throw new Error('the memory file says nothing about which shape it is')
if (!wall?.kept?.[0]?.chosen) throw new Error('the page that was chosen is not marked as chosen, so it counts the same as one nobody picked')
if (!wall?.killed?.length) throw new Error('a culled page left no trace in the memory, so the next wall deals it again')
if (!wall.killed[0].ground) throw new Error('the memory cannot say which direction the culled page grew from, so nothing can be shunned')

const second = await (await fetch(`${where}/api/request`)).json()
console.log('a second wall is handed the memory:', JSON.stringify({
  carriesTaste: Boolean(second?.taste),
  walls: second?.taste?.walls?.length,
  sameWall: JSON.stringify(second?.taste?.walls?.[0]) === JSON.stringify(wall),
}))
if (!second?.taste?.walls?.length) throw new Error('the next window opened in this project would start with no memory of this one')
if (JSON.stringify(second.taste.walls[0]) !== JSON.stringify(wall)) {
  throw new Error('the memory handed to the next wall is not the memory this one wrote')
}

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

// ——— 6. a machine with nothing to write with says so ———
// PATH holds node and nothing else, so there is no claude to run and no opener to launch, which
// is also the shape that used to take this server down with an unhandled spawn error.
const bareWork = mkdtempSync(join(tmpdir(), 'wall-bare-'))
const bare = spawn(process.execPath, ['mcp/index.mjs'], {
  env: {
    ...process.env,
    WALL_NO_DESKTOP: '1',
    WALL_WAIT_MS: '1000',
    WALL_IDLE_MS: '4000',
    PATH: dirname(process.execPath),
    HOME: bareWork,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})
let bareBuf = ''
const bareReplies = []
bare.stdout.on('data', (d) => {
  bareBuf += d
  const lines = bareBuf.split('\n')
  bareBuf = lines.pop() ?? ''
  for (const l of lines) if (l.trim()) bareReplies.push(JSON.parse(l))
})
bare.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name: 'design', arguments: { brief: 'a thing', name: 'Thing', oneLiner: 'It is a thing.', dir: bareWork } },
}) + '\n')
const bareUntil = Date.now() + 30_000
while (!bareReplies.length && Date.now() < bareUntil) await new Promise((r) => setTimeout(r, 200))
const bareText = bareReplies[0]?.result?.content?.[0]?.text ?? ''
console.log('with no key and no claude:', JSON.stringify({
  answered: Boolean(bareText),
  saysTheyAreArranged: /arranged from the built in designs/.test(bareText),
}))
if (!bareText) throw new Error('design answered nothing on a machine with no opener, so it died opening one')
if (!/arranged from the built in designs/.test(bareText)) {
  throw new Error('a wall nothing can write was handed over as though it had been written')
}
bare.kill()

server.close()
