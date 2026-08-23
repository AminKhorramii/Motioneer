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
 * drawing one watch dial. The inks come from the ground when it carries them. The allowlist, the
 * clamp and the shell are the page path's, unchanged.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { runClaude } from '../shared/cli.mjs'
import {
  DIRECTIONS, PRESETS, MARK_SYSTEM, dealDirections, dealDepictions, directionSeed,
  grabJson, madeMark, renderPage, slop, starterPage,
} from '../dist-core/core.js'

const SUBJECT = process.argv.slice(2).join(' ')
  || 'the empty state for a board that has no cards on it yet'
const HANDS = Number(process.env.WALL_MARKS || 8)
const out = 'marks'
if (existsSync(out)) rmSync(out, { recursive: true })
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
  // the ground's own inks when it carries them, and the look deck by stride when it does not, so
  // eight marks disagree about colour the way eight papers do
  const look = PRESETS[(m.i * 3) % PRESETS.length]
  const taste = m.mark.ground || DIRECTIONS.find((d) => d.name === m.ground.name)?.inks
    ? { ...look, ...(m.ground.inks ?? {}) }
    : look
  const stage = { ...starterPage(taste, 'Mark'), taste, written: m.mark }
  const html = renderPage(stage, { title: m.mark.note || 'Mark', still: true })
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  const file = `mark-${m.i + 1}.png`
  await page.screenshot({ path: path.join(out, file) }).catch(() => {})
  writeFileSync(path.join(out, `mark-${m.i + 1}.html`), html)
  const flags = slop(stage, html).filter((f) => f.kind === 'design').map((f) => f.id)
  rows.push({ ...m, file, flags, bytes: html.length })
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

const cells = drew.map((r) =>
  `<figure><img src="${r.file}"><figcaption>${r.ground.name} · ${(r.mark.note || '').slice(0, 40)}</figcaption></figure>`).join('')
writeFileSync(path.join(out, 'sheet.html'), `<html><body style="margin:0;background:#141414;font:10px ui-monospace,monospace;color:#8a8a8a">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px">${cells}</div>
<style>figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:cover;object-position:center;background:#1e1e1e;display:block}
figcaption{padding:5px 2px;text-align:center;line-height:1.4}</style></body></html>`)
console.log(`\n  ${path.join(out, 'sheet.html')}\n`)
