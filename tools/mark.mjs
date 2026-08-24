/**
 * A wall of eight marks: one drawn thing per hand, no page around it.
 *
 *   node tools/mark.mjs                       the default subject
 *   node tools/mark.mjs "a pressure gauge"    yours
 *
 * The argument for the smaller unit is a measurement rather than a preference. Across four real
 * walls the drawing was between two and thirty one percent of a page's styles, and it tracked
 * quality: the page carrying one drawing rule in fifty seven was the emptiest thing on any wall and
 * the two carrying around thirty were the best. So most of a twelve thousand token call goes on the
 * page around the mark, and the mark is the part nobody else makes.
 *
 * Everything opinionated is reused rather than rewritten, which is the whole reason this is a small
 * file. The deck deals the grounds, because a ground is a way of drawing and not a page layout. The
 * depictions deal how each hand looks at its subject, which is the axis that stopped eight calls
 * drawing one watch dial. The mark is drawn in its ground's own direction, and that direction is
 * handed back beside it, because a set of tokens cannot be judged as a set of tokens and a picture
 * can. The allowlist, the
 * clamp and the shell are the page path's, unchanged.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { runClaude } from '../shared/cli.mjs'
import {
  DIRECTIONS, PRESETS, MARK_SYSTEM, dealDirections, dealDepictions, directionSeed,
  grabJson, madeMark, renderPage, slop, starterPage, tasteOf, themeOf, themeCss, swatches, unreadable,
} from '../dist-core/core.js'

const SUBJECT = process.argv.slice(2).join(' ')
  || 'the empty state for a board that has no cards on it yet'
const HANDS = Number(process.env.WALL_MARKS || 8)
/**
 * The last wall is kept until this one exists, rather than cleared to make room for it.
 *
 * This used to empty the directory on the way in, which is destructive before it is useful: eight
 * calls can fail, and then the previous run is gone and nothing has replaced it. The old wall moves
 * aside to marks.last instead, so a failed run costs nothing and the two can be compared.
 */
const out = 'marks'
const previous = 'marks.last'
if (existsSync(out)) {
  if (existsSync(previous)) rmSync(previous, { recursive: true })
  renameSync(out, previous)
}
mkdirSync(out, { recursive: true })

const grounds = dealDirections(HANDS)
const looks = dealDepictions(HANDS)

console.log(`\n  ${SUBJECT}\n`)
const started = Date.now()

const asked = grounds.map(async (ground, i) => {
  const depiction = looks[i]
  const brief =
    `Draw: ${SUBJECT}\n\n` +
    `Build it from ${directionSeed(ground)}\n\n` +
    `Draw it ${depiction}, unless the subject genuinely refuses it. This is how this one is ` +
    `depicted and not what it is: the other marks beside it are drawing the same subject other ` +
    `ways, so the picture here has to be the one nobody else will arrive at on their own.`
  const text = await runClaude(MARK_SYSTEM, brief).catch((e) => ({ error: String(e).slice(0, 120) }))
  if (!text || text.error) return { i, ground, depiction, error: text?.error ?? 'no reply' }
  const raw = grabJson(typeof text === 'string' ? text : text.text ?? '')
  const mark = raw ? madeMark(raw) : null
  return { i, ground, depiction, mark, why: mark ? null : 'reply was not a drawing' }
})

const made = await Promise.all(asked)
const seconds = Math.round((Date.now() - started) / 1000)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const rows = []

for (const m of made) {
  if (!m.mark) { rows.push(m); continue }
  /**
   * The mark is drawn in its ground's own direction, which is the argument for both of these.
   *
   * A direction is twenty values and cannot be judged as twenty values: nobody compares eight token
   * sets by reading them, which is why every theme picker in existence is a swatch strip and a
   * dropdown. A mark drawn in one is a picture, and eight pictures can be compared at a glance. So
   * the mark is the interface to the direction and the direction is what you take away.
   *
   * A ground that has no look yet falls back to the deck by stride, which keeps eight marks
   * disagreeing about colour even while thirty nine of the fifty one are still only prose.
   */
  const taste = m.ground.look
    ? tasteOf(m.ground.look, m.ground.name)
    : PRESETS[(m.i * 3) % PRESETS.length]
  const stage = { ...starterPage(taste, 'Mark'), taste, written: m.mark }
  const html = renderPage(stage, { title: m.mark.note || 'Mark', still: true })
  // and the direction travels with it, in the token names it will be pasted into
  const theme = themeOf(taste)
  writeFileSync(path.join(out, `mark-${m.i + 1}.css`), themeCss(theme))
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  const file = `mark-${m.i + 1}.png`
  await page.screenshot({ path: path.join(out, file) }).catch(() => {})
  writeFileSync(path.join(out, `mark-${m.i + 1}.html`), html)
  const flags = slop(stage, html).filter((f) => f.kind === 'design').map((f) => f.id)
  rows.push({ ...m, file, flags, bytes: html.length, taste, theme, faults: unreadable(theme) })
}
await browser.close()

const drew = rows.filter((r) => r.mark)
console.log(`  ${drew.length} of ${rows.length} hands drew, in ${Math.floor(seconds / 60)}m ${seconds % 60}s\n`)
for (const r of rows) {
  const head = `  ${String(r.i + 1).padStart(2)}  ${r.ground.name.padEnd(21)}`
  if (!r.mark) { console.log(`${head} ${r.error ?? r.why}`); continue }
  console.log(`${head} ${(r.mark.note || '').slice(0, 44).padEnd(46)}${r.flags.length ? r.flags.join(',') : 'clean'}`)
  console.log(`      ${r.depiction.slice(0, 76)}`)
}

const swatch = (r) => swatches(r.theme.light)
  .map((c) => `<i style="background:${c}"></i>`).join('')
const cells = drew.map((r) =>
  `<figure><img src="${r.file}"><div class="ink">${swatch(r)}</div>` +
  `<figcaption>${r.ground.name} · ${(r.mark.note || '').slice(0, 38)}` +
  `<br><a href="mark-${r.i + 1}.css">the direction</a>${r.faults.length ? ' · ' + r.faults.length + ' faults' : ''}</figcaption></figure>`).join('')
writeFileSync(path.join(out, 'sheet.html'), `<html><body style="margin:0;background:#141414;font:10px ui-monospace,monospace;color:#8a8a8a">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px">${cells}</div>
<style>figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:cover;object-position:center;background:#1e1e1e;display:block}
.ink{display:flex;height:9px}.ink i{flex:1}
figcaption{padding:5px 2px;text-align:center;line-height:1.5}
a{color:#8a8a8a}</style></body></html>`)
/**
 * And it opens, because a tool that draws eight things and then prints a file path has not shown
 * you anything. The browser it used to take the photographs is headless and closes, so nothing
 * appeared on screen and the wall looked like it had not run.
 */
const sheet = path.resolve(out, 'sheet.html')
console.log(`\n  ${path.join(out, 'sheet.html')}\n`)
if (drew.length && !process.env.WALL_NO_OPEN) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [sheet]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', sheet]]
        : ['xdg-open', [sheet]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}
