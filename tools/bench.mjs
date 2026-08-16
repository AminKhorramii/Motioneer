/**
 * A real wall, measured and photographed, so a change to taste can be judged rather than guessed.
 *
 * Everything in verify/ runs against a mock or a recorded fixture, which is what makes it fast and
 * free and is also its ceiling: it proves the machinery does what it was told, never that what came
 * out is any good. Every gate in this repository was written against a prediction about model
 * output and checked against a hand written example of that prediction. That is a closed loop with
 * nothing real in it.
 *
 * This opens it. One wall, the real model, and two artefacts at the end:
 *
 *   score.json   numbers that can be diffed against the last run, so a prompt change shows up as a
 *                delta rather than as a feeling
 *   *.png        the papers themselves, so the half of quality no number reaches can be looked at
 *
 * It costs a real wall of model calls, so it lives in tools/ and is never part of verify:all. It
 * asserts nothing and fails nothing: it reports, and the reading is the point.
 *
 *   npm run bench                    one wall on the default brief
 *   npm run bench "your brief here"  one wall on yours
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const core = await import(path.join(ROOT, 'dist-core', 'core.js'))

/**
 * A fixed brief by default, because a bench with a different question every run measures the
 * question. This one is a made thing with numbers, a date and an opinion in it, which is the shape
 * the product is now pointed at.
 */
const BRIEF = process.argv.slice(2).join(' ') ||
  'Field Mark One is a mechanical dive watch with a ceramic bezel, rated to 300 metres, made in '
  + 'runs of 200 and numbered on the caseback. 38mm, which is the size dive watches were before '
  + 'they got big. Swiss automatic, 70 hour reserve, lume applied by hand. The next 200 open on '
  + 'the fourteenth of March at nine in the morning.'

const OUT = path.join(ROOT, 'bench')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const here = path.join(OUT, stamp)
mkdirSync(here, { recursive: true })

const server = spawn('node', [path.join(ROOT, 'server', 'index.mjs')], {
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
})
let browser = null
process.on('exit', () => {
  browser?.close().catch(() => {})
  server.kill()
})
process.on('SIGINT', () => process.exit(130))

const url = await new Promise((resolve) => {
  let out = ''
  server.stdout.on('data', (d) => {
    out += d
    const m = out.match(/http:\/\/localhost:\d+/)
    if (m) resolve(m[0])
  })
})

browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(url)
await page.evaluate(() => localStorage.setItem('wall-model', 'claude-code'))
await page.reload()

await page.waitForSelector('.onboard', { timeout: 20000 })
await page.evaluate(() => document.querySelector('.onboard .picks button[aria-label="Claude Code"]')?.click())
await page.waitForTimeout(300)
await page.evaluate(() => document.querySelector('.onboard .primary')?.click())
await page.waitForSelector('.onboard .tell', { timeout: 20000 })
await page.evaluate((brief) => {
  const box = document.querySelector('.onboard .tell')
  const set = Object.getOwnPropertyDescriptor(box.constructor.prototype, 'value').set
  set.call(box, brief)
  box.dispatchEvent(new Event('input', { bubbles: true }))
}, BRIEF)

const t0 = Date.now()
await page.evaluate(() => document.querySelector('.onboard .primary')?.click())
// reading the brief is a model call of its own and may come back wanting a gap filled
for (let i = 0; i < 20 && (await page.locator('.onboard').count()); i++) {
  await page.evaluate(() => {
    const gap = document.querySelector('.onboard .fields input:not([type=password])')
    if (gap && !gap.value) {
      const set = Object.getOwnPropertyDescriptor(gap.constructor.prototype, 'value').set
      set.call(gap, 'people who wear one watch')
      gap.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.querySelector('.onboard .primary')?.click()
  })
  await page.waitForTimeout(1500)
}
console.log(`asked at ${((Date.now() - t0) / 1000).toFixed(0)}s, waiting for the wall`)

// papers arrive one at a time now, so this waits for the work to stop rather than for a count
for (let i = 0; i < 400; i++) {
  const now = await page.evaluate(() => ({
    papers: document.querySelectorAll('.paper, .cell').length,
    busy: Boolean(document.querySelector('[data-busy]')),
  }))
  if (!now.busy && now.papers) break
  await page.waitForTimeout(1500)
}
const took = Math.round((Date.now() - t0) / 1000)

await page.click('.views button:nth-child(2)')
/**
 * Every cell, including the ones below the fold.
 *
 * A paper's frame is marked lazy, so a cell the viewport has not reached has no document to read
 * and the bench counted seven papers on a wall of eight. The wall was right and the measurement
 * was short, which is the second time this instrument has reported its own limitation as a
 * finding. Scrolling to the end mounts them before anything is read.
 */
await page.evaluate(async () => {
  for (const cell of document.querySelectorAll('.cell')) {
    cell.scrollIntoView({ block: 'center' })
    await new Promise((r) => setTimeout(r, 120))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(here, 'wall.png'), fullPage: true })

/**
 * Each paper, as it actually rendered.
 *
 * Read out of the frame rather than out of the model, because what is being judged is the page
 * somebody would ship, after the filter, the repair and the renderer have all had their turn.
 */
const papers = await page.evaluate(() =>
  [...document.querySelectorAll('.cell')].map((c) => c.querySelector('iframe')?.contentDocument?.documentElement?.outerHTML ?? ''))

papers.forEach((html, i) => writeFileSync(path.join(here, `paper-${i + 1}.html`), html))

const cells = await page.locator('.cell').all()
for (const [i, cell] of cells.entries()) {
  await cell.screenshot({ path: path.join(here, `paper-${i + 1}.png`) }).catch(() => {})
}

const styleOf = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
/**
 * The body, without the head.
 *
 * The first run of this bench reported a hollow word on every single paper, and the pages did not
 * have one: the whole document was being handed over as the markup, so the detector walked the
 * style block as if it were copy, and "transform" is on the hollow word list. A measurement that
 * reads the CSS as prose is a measurement of itself. Found by looking at a page and asking where
 * the word was, which is the argument for the screenshots existing at all.
 */
const bodyOf = (html) => (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
const scored = papers.map((html, i) => {
  const css = styleOf(html)
  // the design half reads the rendered page, so a stub page carries it honestly; the copy half is
  // read from the markup the same way the app reads a written page
  // a cell whose frame never mounted is reported rather than scored, so a hole in the measurement
  // never reads as a clean page
  if (!html) return { paper: i + 1, design: [], copy: [], drew: false, kb: 0, requests: 0, unread: true }
  const body = bodyOf(html)
  const stub = { id: `p${i}`, taste: core.PRESETS[0], sections: [], written: { html: body, css, note: '' } }
  // the design half reads the rendered document, the copy half reads only what a reader sees
  const flags = core.slop(stub, html)
  return {
    paper: i + 1,
    design: flags.filter((f) => f.kind === 'design').map((f) => f.id),
    copy: flags.filter((f) => f.kind === 'copy').map((f) => f.id),
    drew: core.undrawn({ html: body, css, note: '' }).length === 0,
    kb: Math.round(html.length / 1024),
    // the promise the whole product rests on, checked on the artefact rather than on the intent
    requests: (html.match(/(?:src|href)=["']https?:/g) ?? []).length,
  }
})

const score = {
  at: stamp,
  seconds: took,
  papers: scored.length,
  drew: scored.filter((p) => p.drew).length,
  unread: scored.filter((p) => p.unread).length,
  clean: scored.filter((p) => !p.design.length && !p.copy.length).length,
  designFlags: scored.reduce((n, p) => n + p.design.length, 0),
  copyFlags: scored.reduce((n, p) => n + p.copy.length, 0),
  makesRequests: scored.filter((p) => p.requests).length,
  medianKb: scored.map((p) => p.kb).sort((a, b) => a - b)[Math.floor(scored.length / 2)] ?? 0,
  pages: scored,
}
writeFileSync(path.join(here, 'score.json'), JSON.stringify(score, null, 2))

const prevPath = path.join(OUT, 'last.json')
const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : null
writeFileSync(prevPath, JSON.stringify(score, null, 2))

const delta = (now, was) => (was === undefined ? '' : now === was ? ' (=)' : ` (${now > was ? '+' : ''}${now - was})`)
console.log(`\n  ${here}\n`)
console.log(`  papers        ${score.papers}${delta(score.papers, prev?.papers)}`)
console.log(`  drew          ${score.drew} of ${score.papers}${delta(score.drew, prev?.drew)}`)
console.log(`  clean         ${score.clean} of ${score.papers}${delta(score.clean, prev?.clean)}`)
console.log(`  design flags  ${score.designFlags}${delta(score.designFlags, prev?.designFlags)}`)
console.log(`  copy flags    ${score.copyFlags}${delta(score.copyFlags, prev?.copyFlags)}`)
console.log(`  makes requests ${score.makesRequests}${delta(score.makesRequests, prev?.makesRequests)}`)
console.log(`  median size   ${score.medianKb}KB${delta(score.medianKb, prev?.medianKb)}`)
console.log(`  took          ${score.seconds}s${delta(score.seconds, prev?.seconds)}`)
for (const p of scored) {
  const tells = [...p.design, ...p.copy]
  console.log(`   ${p.paper}. ${p.unread ? 'not read' : p.drew ? 'drew' : 'NO DRAWING'}  ${tells.length ? tells.join(', ') : 'clean'}`)
}
console.log(`\n  wall.png and paper-1..${scored.length}.png are in that directory.`)
await browser.close()
server.kill()
