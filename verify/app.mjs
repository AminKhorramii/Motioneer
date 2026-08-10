/**
 * The app, driven end to end in a real browser.
 *
 * It used to launch Electron, which made the one shell that could be driven also the only shell
 * under test. It now opens the built dist the way any visitor does, so the suite proves the app
 * rather than a shell, and the desktop shells are checked for agreement with it separately:
 * verify/tauri.mjs statically, and the Rust suite for the commands only a desktop can answer.
 */
import { readFile } from 'node:fs/promises'
import { openApp, useMock } from './harness.mjs'
import { checkLayout } from './layout.mjs'

const OUT = process.env.OUT ?? '/tmp'
const REAL = (process.env.WALL_KEY ?? '').trim()

// ——— 0. the house obeys its own detector ———
// Every built-in world on every preset look, rendered with the defaults and checked. The
// detector polices model output everywhere else, so the pages Wall itself designs must pass
// it, or the suite fails before a browser opens. This is the only intervention shown to
// reduce slop: written guidance increases it, mechanical gates reverse it.
const core = await import('../dist-core/core.js')
const houseFlags = []
for (const w of core.WORLDS) {
  for (const look of core.PRESETS) {
    const t = w.taste(look)
    const base = core.starterPage(t, 'Spoor')
    const pool = new Map()
    for (const s of base.sections) pool.set(s.role, [...(pool.get(s.role) ?? []), s])
    const ordered = w.compose?.length
      ? w.compose.map((r) => pool.get(r)?.shift() ?? {
          id: r, role: r, form: core.ROLE_FORMS[r][0], on: true, content: core.defaultContent(r, 'Spoor'),
        })
      : base.sections
    const page = {
      ...base, world: w.id, backdrop: w.backdrop, taste: t,
      sections: core.dressSections(ordered, w),
    }
    const flags = core.slop(page, core.renderPage(page, { title: 'Spoor' }))
    if (flags.length) houseFlags.push(`${w.id} on ${look.name}: ${flags.map((f) => f.label).join(', ')}`)
  }
}
console.log('house pages:', JSON.stringify(houseFlags.length ? houseFlags.slice(0, 8) : 'clean, every world on every look'))
if (houseFlags.length) throw new Error(`the house trips its own detector on ${houseFlags.length} pages`)

// ——— 0b. nothing a model writes into a section can become markup ———
// Copy lands in text nodes, where escaping covers it, and verify/hard.mjs drives that in a real
// browser. One field does not: a section's image is an attribute value, and a model reply
// replaces a section's content whole, so a string that closes the quote it sits in used to write
// its own tag inside an iframe that shares this app's origin and its stored keys.
{
  const page = core.starterPage(core.PRESETS[0], 'Spoor')
  const escapes = [
    'data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="alert(1)" x="',
    'data:image/svg+xml,<svg onload="alert(1)">',
    'data:image/png;base64,AAAA" onload="alert(1)',
    "data:image/png;base64,AAAA' onload='alert(1)",
  ]
  const broke = []
  for (const attempt of escapes) {
    for (const s of page.sections) s.content = { ...s.content, image: attempt }
    const html = core.renderPage(page, { title: 'Spoor' })
    if (/<img[^>]*\son(error|load)\s*=/i.test(html) || /<svg/i.test(html)) broke.push(attempt.slice(0, 40))
  }
  console.log('a section cannot write its own markup:', JSON.stringify(broke.length ? broke : 'none of the four got out'))
  if (broke.length) throw new Error(`${broke.length} of ${escapes.length} image strings escaped their attribute`)
}

// ——— 0a. the block library reaches the page, and the geometry holds ———
// Both gates live in verify/layout.mjs, because they measure rendered pages rather than drive
// the app, and they are worth running alone while a block is being changed.
await checkLayout(core)

const { page, errors, close } = await openApp()

// ——— 1. brief → a page with sections, alternatives either side ———
// onboarding is the first thing a new user sees, so assert it before anything else
await page.waitForSelector('.onboard .card', { timeout: 20000 })
console.log('model:', REAL ? 'live Claude' : 'mock')
if (REAL) await page.evaluate((k) => localStorage.setItem('wall-key-anthropic', k), REAL)
else await useMock(page)
const onboard = await page.evaluate(() => ({
  steps: [...document.querySelectorAll('.onboard .steps button')].map((b) => b.textContent.trim()),
  heading: document.querySelector('.onboard h2')?.textContent,
  activeStep: [...document.querySelectorAll('.onboard .steps button')].findIndex((b) => b.classList.contains('on')),
  h2count: document.querySelectorAll('.onboard h2').length,
  words: document.querySelector('.onboard .pane')?.innerText?.split(/\s+/).length,
  models: [...document.querySelectorAll('.onboard .pick')].map((b) => b.getAttribute('aria-label')),
  fieldsBeforePicking: document.querySelectorAll('.onboard .fields').length,
  caps: document.querySelector('.onboard .card').innerText.replace(/\b(AI|HTML|CSS|URL|API|GPT|GLM)\b/g, '').match(/\b[A-Z]{2,}\b/g) ?? 'none',
  dashes: document.querySelector('.onboard .card').innerText.includes('\u2014'),
}))
console.log('onboarding:', JSON.stringify(onboard))

// two steps: pick a model, which is what reveals the key fields, then describe the product
await page.evaluate(() => document.querySelector('.onboard .pick')?.click())
await page.waitForTimeout(200)
await page.click('.onboard .primary')
await page.waitForSelector('.onboard .tell', { timeout: 10000 })
await page.fill('.onboard .tell', 'Spoor makes every AI session you ever ran searchable, locally.')
await page.click('.onboard .primary')
await page.waitForSelector('.onboard .fields label span', { timeout: 15000 })
// a prompt, plus only what the description did not carry, and no form echoing it back.
// The mock leaves the name empty and never asks for it, so a question for it has to be
// synthesised and shown first, and the button has to stay shut until the name arrives:
// the regression here was a button waiting on a field no visible input could fill.
const intake = await page.evaluate(() => ({
  asked: [...document.querySelectorAll('.onboard .fields label span')].map((s) => s.textContent),
  textInputs: document.querySelectorAll('.onboard .pane input:not([type=password])').length,
  boxes: document.querySelectorAll('.onboard .tell').length,
  shutWithoutName: document.querySelector('.onboard .primary')?.disabled === true,
}))
console.log('intake:', JSON.stringify(intake))
await page.fill('.onboard .fields label:nth-of-type(1) input', 'Spoor')
const gate = await page.evaluate(() => ({
  openWithName: document.querySelector('.onboard .primary')?.disabled === false,
}))
await page.fill('.onboard .fields label:nth-of-type(2) input', 'people who build with agents')
console.log('intake gate:', JSON.stringify(gate))
await page.click('.onboard .primary')
await page.waitForSelector('.paper.here', { timeout: 20000 })
console.log('onboarding closed:', JSON.stringify({ gone: (await page.locator('.onboard').count()) === 0 }))
// papers must appear while the models are still writing, so sample the wall mid-flight
const growth = []
const watch = setInterval(async () => {
  try {
    growth.push(await page.evaluate(() => document.querySelectorAll('.paper').length && document.querySelector('.filmbar span')?.textContent))
  } catch { /* window closed */ }
}, REAL ? 900 : 60)
await page.waitForFunction(() => /of 9$/.test(document.querySelector('.filmbar span')?.textContent ?? ''), null, { timeout: REAL ? 180000 : 20000 })
clearInterval(watch)
// A mock answers faster than this can sample, so an empty result here means the sampler missed
// rather than that nothing arrived progressively. Say which, because a check that reports
// nothing and reads as a pass is worse than no check. verify/stream.mjs proves arrival properly,
// against a real stream replayed at its recorded pace.
const samples = [...new Set(growth.filter(Boolean))]
console.log('streamed in:', JSON.stringify(
  samples.length ? { samples } : { samples: [], note: 'too fast to sample under the mock, see verify/stream' },
))
// every paper must be its own written page, so headlines have to differ across the wall
const wall = await page.evaluate(async () => {
  const seen = new Set(), angles = []
  const total = document.querySelectorAll('.paper').length
  for (let i = 0; i < 9; i++) {
    document.querySelector('.filmbar button:last-of-type')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await new Promise((r) => setTimeout(r, 300))
    const doc = document.querySelector('.paper.here iframe')?.contentDocument
    seen.add(doc?.querySelector('h1')?.innerText ?? '')
    const a = document.querySelector('.filmbar .angle')?.textContent
    if (a) angles.push(a)
  }
  return { papersMounted: total, distinctHeadlines: seen.size, angles: [...new Set(angles)] }
})
console.log('written wall:', JSON.stringify(wall))
await page.evaluate(() => { for (let i = 0; i < 9; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })) })
await page.waitForTimeout(300)
await page.waitForTimeout(1500)

const studio = await page.evaluate(() => ({
  papers: document.querySelectorAll('.paper').length,
  sections: [...document.querySelectorAll('.sec .secline b')].map((b) => b.textContent),
  counter: document.querySelector('.filmbar span')?.textContent,
  writingWith: document.querySelector('.barwrap .model')?.textContent?.trim(),
}))
console.log('studio:', JSON.stringify(studio))
await page.screenshot({ path: `${OUT}/wall-studio.png` })

// ——— 2. left/right moves the centre paper ———
const before = await page.evaluate(() => document.querySelector('.paper.here')?.getAttribute('title'))
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(700)
const after = await page.evaluate(() => ({
  id: document.querySelector('.paper.here iframe')?.getAttribute('title'),
  counter: document.querySelector('.filmbar span')?.textContent,
}))
console.log('navigate:', JSON.stringify({ moved: before !== after.id, counter: after.counter }))

// ——— 2b. triage: p pins, x removes, z brings back, and a pinned page cannot be lost ———
const triage = await page.evaluate(async () => {
  const count = () => document.querySelector('.filmbar .count')?.textContent
  const press = async (key) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    await new Promise((r) => setTimeout(r, 250))
  }
  const start = count()
  await press('p') // pin, which steps on to the next paper
  const advanced = count() !== start
  await press('ArrowLeft')
  const pinShown = !!document.querySelector('.filmbar .pin.on')
  await press('x') // pinned, so the wall must not shrink
  const pinnedSurvived = count() === start
  await press('p') // release, which steps on again
  await press('ArrowLeft')
  await press('x') // unpinned now, so it goes
  const afterKill = count()
  await press('z') // and comes back where it was
  return { start, advanced, pinShown, pinnedSurvived, afterKill, restored: count() === start }
})
console.log('triage:', JSON.stringify(triage))

// ——— 2c. the slop verdict rides with every paper, so generic announces itself to triage ———
await page.click('header .views button:nth-child(2)')
await page.waitForTimeout(400)
const verdicts = await page.evaluate(() => ({
  cells: document.querySelectorAll('.grid .cell').length,
  chips: document.querySelectorAll('.grid .cellbar .flags').length,
  withReasons: [...document.querySelectorAll('.grid .cellbar .flags')]
    .every((el) => (el.getAttribute('title') ?? '').length > 10),
  sample: document.querySelector('.grid .cellbar .flags')?.textContent,
}))
console.log('slop chips:', JSON.stringify(verdicts))
await page.click('header .views button:nth-child(1)')
await page.waitForTimeout(300)
const dockVerdict = await page.evaluate(() => ({
  shown: !!document.querySelector('.filmbar .flags'),
  text: document.querySelector('.filmbar .flags')?.textContent,
}))
console.log('dock verdict:', JSON.stringify(dockVerdict))

// ——— 3. direct manipulation: edit text on the paper itself ———
const edited = await page.evaluate(async () => {
  const f = document.querySelector('.paper.here iframe')
  const d = f.contentDocument
  const h = d.querySelector('h1[data-edit]')
  const path = h.getAttribute('data-edit')
  h.focus()
  h.innerText = 'Edited straight on the paper.'
  h.dispatchEvent(new Event('blur'))
  await new Promise((r) => setTimeout(r, 500))
  const now = document.querySelector('.paper.here iframe').contentDocument.querySelector('h1[data-edit]')?.innerText
  return { path, headlineNow: now }
})
console.log('direct edit:', JSON.stringify(edited))

// ——— 4. per-section layout + brief copy ———
await page.click('.sec:nth-child(3)')
await page.waitForTimeout(300)
const secUi = await page.evaluate(() => ({
  noSectionChat: !document.querySelector('.sec.sel .prow'),
  actions: [...document.querySelectorAll('.sec.sel .srow button')].map((b) => b.textContent.trim()),
}))
console.log('section panel:', JSON.stringify(secUi))
await page.evaluate(() => document.querySelector('.sec.sel .secline button').click()) // next layout
await page.waitForTimeout(500)

// the page brief is the only brief now, so it has to carry every section
// copying the brief now lives with the brief, so the rail has to be open to reach it
await page.evaluate(() => [...document.querySelectorAll('.hactions button')]
  .find((b) => b.textContent.trim() === 'brief')?.click())
await page.waitForSelector('.copybrief', { timeout: 10000 })
await page.click('.copybrief')
await page.waitForTimeout(400)
const pgBrief = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
console.log('brief:', JSON.stringify({
  coversEverySection: pgBrief.split('\n').filter((l) => l.startsWith('### ')).length,
  // tokens belong once: repeating them under every section was most of the old brief
  tokenBlocks: pgBrief.split('\n').filter((l) => l.startsWith('bg #')).length,
  lines: pgBrief.split('\n').length,
  chars: pgBrief.length,
}))


// ——— 5. the prompt bar makes variants (mocked model) ———
if (!REAL) await useMock(page)
const countBefore = await page.evaluate(() => document.querySelector('.filmbar span').textContent)
await page.fill('.bar', 'punchier')
await page.press('.bar', 'Enter')
await page.waitForTimeout(1600)
const variants = await page.evaluate(() => ({
  counter: document.querySelector('.filmbar span')?.textContent,
  headline: document.querySelector('.paper.here iframe')?.contentDocument?.querySelector('h1')?.innerText?.slice(-12),
}))
console.log('prompt bar:', JSON.stringify({ before: countBefore, ...variants }))
await page.screenshot({ path: `${OUT}/wall-variants.png` })

// ——— 6. ship ———
// a browser hands the page over as a download rather than writing where it was told, which is
// the one place the shells genuinely differ. What is asserted about the file is the same.
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.evaluate(() => [...document.querySelectorAll('.filmbar button')].find((b) => b.getAttribute('aria-label') === 'download').click()),
])
const html = await readFile(await download.path(), 'utf8')
const shipped = html.length > 0
const shippedAs = download.suggestedFilename()
// direct manipulation: the paper reports a drop, the app owns the reorder
const drag = await page.evaluate(async () => {
  const names = () => [...document.querySelectorAll('.sec b')].map((b) => b.textContent)
  const before = names()
  const ids = [...document.querySelectorAll('.paper.here iframe')][0].contentDocument
    .querySelectorAll('[data-section]')
  const first = ids[0].getAttribute('data-section')
  const last = ids[ids.length - 1].getAttribute('data-section')
  window.postMessage({ wall: 'move', id: first, onto: last, after: true }, '*')
  await new Promise((r) => setTimeout(r, 400))
  const doc = document.querySelector('.paper.here iframe').contentDocument
  return {
    before: before.slice(0, 3),
    after: names().slice(0, 3),
    movedToEnd: names()[names().length - 1] === before[0],
    gripsOnPaper: doc.querySelectorAll('.wall-grip').length,
  }
})
console.log('drag reorder:', JSON.stringify(drag))

console.log('dock:', JSON.stringify(await page.evaluate(() => ({
  controls: [...document.querySelectorAll('.filmbar button')].map((b) => b.textContent.trim()).filter(Boolean),
}))))
console.log('header:', JSON.stringify(await page.evaluate(() => ({
  views: [...document.querySelectorAll('header .views button')].map((b) => b.textContent),
  actions: [...document.querySelectorAll('.hactions button')].map((b) => b.textContent.trim() || 'help'),
}))))
console.log('shipped:', JSON.stringify({
  ok: shipped,
  file: shippedAs,
  bytes: html.length,
  selfContained: shipped && !/(src|href)=["']https?:/.test(html),
  noGrips: !html.includes('wall-grip'),
  noEditScript: shipped && !html.includes('contenteditable'),
  sections: (html.match(/<section/g) ?? []).length,
}))

// state has to survive a reload. On the desktop that was a file, here it is localStorage, and
// the assertion is the same either way: come back and the wall is still there.
await page.reload()
await page.waitForSelector('.paper.here', { timeout: 20000 })
console.log('state kept:', JSON.stringify(await page.evaluate(() => ({
  onboardingSkipped: document.querySelectorAll('.onboard').length === 0,
  papers: document.querySelectorAll('.paper').length > 0,
}))))

// start over throws the wall away, so it must ask once and only then reset
const over = await page.evaluate(async () => {
  const btn = () => [...document.querySelectorAll('.hactions button')].find((b) => /start over|discard/.test(b.textContent))
  btn().click()
  await new Promise((r) => setTimeout(r, 150))
  const asked = btn().textContent.includes('discard')
  btn().click()
  await new Promise((r) => setTimeout(r, 400))
  return { asked, onboardingBack: !!document.querySelector('.onboard .card'), papers: document.querySelectorAll('.paper').length }
})
console.log('start over:', JSON.stringify(over))

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')
await close()
