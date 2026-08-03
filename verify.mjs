import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const electronPath = createRequire(import.meta.url)('electron')
const OUT = process.env.OUT ?? '/private/tmp/claude-501/-Users-developer-Documents-code-side/1b19a499-5192-4808-9d84-e84eb6269c88/scratchpad'
const dataDir = mkdtempSync(join(tmpdir(), 'wall-'))
const exportDir = mkdtempSync(join(tmpdir(), 'wall-out-'))

const app = await _electron.launch({
  executablePath: electronPath,
  args: ['.'],
  env: { ...process.env, WALL_DATA: dataDir, WALL_TEST: '1', WALL_EXPORT_DIR: exportDir },
})
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
await page.waitForTimeout(1800)

// ——— 1. brief → a page with sections, alternatives either side ———
// onboarding is the first thing a new user sees, so assert it before anything else
await page.waitForSelector('.onboard .card', { timeout: 20000 })
// With WALL_KEY set this drives the real streaming API. Without it a mock stands in, fed
// through the same partial parser, so the suite runs offline and in CI either way.
const REAL = (process.env.WALL_KEY ?? '').trim()
console.log('model:', REAL ? 'live Claude' : 'mock')
await page.evaluate((key) => {
  localStorage.setItem('wall-key-anthropic', key || 'test-key')
  if (key) return
  window.__wall.setMock((instruction, shape) => ({
    sections: shape.map((s) => ({
      id: s.id,
      content: Object.fromEntries(
        Object.entries(s.content).map(([k, v]) => [
          k, typeof v === 'string' ? `${instruction.slice(0, 18)} | ${v}` : v,
        ]),
      ),
    })),
  }))
}, REAL)
const onboard = await page.evaluate(() => ({
  steps: [...document.querySelectorAll('.onboard .steps button')].map((b) => b.textContent.trim()),
  heading: document.querySelector('.onboard h2')?.textContent,
  activeStep: [...document.querySelectorAll('.onboard .steps button')].findIndex((b) => b.classList.contains('on')),
  h2count: document.querySelectorAll('.onboard h2').length,
  points: document.querySelectorAll('.onboard .how li').length,
  caps: document.querySelector('.onboard .card').innerText.replace(/\b(AI|HTML|CSS|URL|API)\b/g, '').match(/\b[A-Z]{2,}\b/g) ?? 'none',
  dashes: document.querySelector('.onboard .card').innerText.includes('\u2014'),
}))
console.log('onboarding:', JSON.stringify(onboard))

await page.click('.sample')
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
console.log('streamed in:', JSON.stringify({ samples: [...new Set(growth.filter(Boolean))] }))
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
  models: [...document.querySelectorAll('.models button')].map((b) => b.textContent.trim()),
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
  hasPrompt: Boolean(document.querySelector('.sec.sel .prow input')),
  actions: [...document.querySelectorAll('.sec.sel .srow button')].map((b) => b.textContent.trim()),
}))
console.log('section panel:', JSON.stringify(secUi))
await page.evaluate(() => document.querySelector('.sec.sel .secline button').click()) // next layout
await page.waitForTimeout(500)

// the page brief is the only brief now, so it has to carry every section
await page.click('.hactions button:nth-child(3)')
await page.waitForTimeout(400)
const pgBrief = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
console.log('briefs:', JSON.stringify({
  pageBriefStarts: pgBrief.slice(0, 40),
  coversEverySection: pgBrief.split('\n').filter((l) => l.startsWith('## ')).length,
  pageBriefHasTokens: pgBrief.includes('Design tokens'),
  pageBriefLines: pgBrief.split('\n').length,
}))

// ——— 5. the prompt bar makes variants (mocked model) ———
await page.evaluate(() => {
  localStorage.setItem('wall-key-anthropic', 'test-key')
  window.__wall.setMock((instruction, shape) => ({
    sections: shape.map((s) => ({
      id: s.id,
      content: Object.fromEntries(
        Object.entries(s.content).map(([k, v]) => [k, typeof v === 'string' ? `${v} [${instruction}]` : v]),
      ),
    })),
  }))
})
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
await page.evaluate(() => [...document.querySelectorAll('.filmbar button')].find((b) => b.textContent.includes('ship')).click())
await page.waitForTimeout(1400)
const file = join(exportDir, 'pers-impressions')
const shipped = existsSync(join(exportDir, 'spoor', 'index.html'))
const html = shipped ? readFileSync(join(exportDir, 'spoor', 'index.html'), 'utf8') : ''
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

const back = await page.evaluate(async () => {
  const seen = []
  for (let i = 0; i < 4; i++) {
    const b = [...document.querySelectorAll('.filmbar button')].find((x) => /backdrop|contours|grain|ridge/.test(x.textContent))
    seen.push(b?.textContent)
    b?.click()
    await new Promise((r) => setTimeout(r, 350))
  }
  // land on a backdrop that draws, so the canvas assertion means something
  while (!/contours|ridge/.test(document.querySelector('.filmbar button')?.textContent ?? '')) {
    const b = [...document.querySelectorAll('.filmbar button')].find((x) => /backdrop|contours|grain|ridge/.test(x.textContent))
    b?.click()
    await new Promise((r) => setTimeout(r, 300))
    if (seen.length > 12) break
    seen.push('.')
  }
  const doc = document.querySelector('.paper.here iframe')?.contentDocument
  return {
    cycled: seen.filter((s) => s !== '.'),
    canvasInPage: !!doc?.querySelector('#bd'),
    webgl: !!doc?.querySelector('#bd')?.getContext?.('webgl2'),
  }
})
console.log('backdrop:', JSON.stringify(back))
console.log('slop:', JSON.stringify(await page.evaluate(() => ({
  badge: document.querySelector('.filmbar .flags')?.textContent,
  detail: document.querySelector('.filmbar .flags')?.getAttribute('title')?.split('\n').map((s) => s.split('.')[0]),
}))))
console.log('shipped:', JSON.stringify({
  ok: shipped,
  bytes: html.length,
  selfContained: shipped && !/(src|href)=["']https?:/.test(html),
  noGrips: !html.includes('wall-grip'),
  noEditScript: shipped && !html.includes('contenteditable'),
  sections: (html.match(/<section/g) ?? []).length,
}))
void file

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')
await app.close()
rmSync(dataDir, { recursive: true, force: true })
rmSync(exportDir, { recursive: true, force: true })
