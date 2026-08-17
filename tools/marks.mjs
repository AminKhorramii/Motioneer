/**
 * What each paper on a wall actually drew, pulled out and looked at together.
 *
 *   node tools/marks.mjs                 the newest bench
 *   node tools/marks.mjs bench/2026-...  a named one
 *
 * The wall is judged on counts that cannot see a picture: eight papers can all be clean, all be
 * drawn, and all be the same drawing. Pulling the marks off three real walls and putting them side
 * by side is how that was found, and of twelve marks nine were one watch dial seen face on.
 *
 * The first version of this looked for a single box of at least ninety pixels carrying a gradient,
 * which is the shape of a dial, so it could only ever confirm what it was built from. An exploded
 * view is twenty small parts and a labelled diagram is a column of them, and both came back either
 * missed or reported as the section around them. It follows the drawing now: every element that
 * draws, clustered by where they sit, and the cluster is the mark.
 *
 * The fingerprint is the point of the whole file. It is not a judgement of a mark, which no number
 * here could make; it is a description of its shape, so two papers drawing the same picture in
 * different palettes collide and two drawing genuinely differently do not. Distinct fingerprints
 * across a wall is a number that goes up when the wall gets more varied, which is the one direction
 * every other measurement in this repository cannot express.
 */

import { chromium } from 'playwright'
import { readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'

const latest = () => {
  const dirs = readdirSync('bench').filter((d) => /^\d{4}-/.test(d)).sort()
  if (!dirs.length) throw new Error('no benches in bench/, run npm run bench first')
  return path.join('bench', dirs[dirs.length - 1])
}
const dir = process.argv[2] ? process.argv[2].replace(/\/$/, '') : latest()
const out = path.join(dir, 'marks')
if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(out, { recursive: true })

/**
 * Runs inside the page, so it closes over nothing and reaches everything through the document.
 *
 * A drawn element is one whose own rules or whose pseudo elements make a shape rather than arrange
 * one: a gradient with stops, a cut edge, two inks overprinting. Boxes are then merged while any
 * two are near enough to be parts of one picture, because the parts of an exploded view are
 * separate elements and the gaps between them are the drawing.
 */
const FIND = () => {
  const DRAW = /(?:repeating-)?(?:linear|radial|conic)-gradient/i
  const techniques = (el) => {
    const found = new Set()
    for (const p of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, p)
      const bg = cs.backgroundImage || ''
      for (const t of ['conic', 'radial', 'linear']) if (new RegExp(t + '-gradient', 'i').test(bg)) found.add(t)
      if (/repeating-/i.test(bg)) found.add('repeat')
      if (cs.clipPath && cs.clipPath !== 'none') found.add('clip')
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') found.add('blend')
      if (cs.transform && cs.transform !== 'none' && /matrix|rotate/.test(cs.transform)) found.add('turn')
    }
    return found
  }
  const drawn = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 12 || r.height < 12) continue
    // the page itself is not a mark: a full bleed backdrop is the ground, not the subject
    if (r.width > 1240 && r.height > 1100) continue
    const t = techniques(el)
    if (!t.size) continue
    if (t.size === 1 && t.has('linear') && r.width > 900) continue   // a full width wash is a band
    drawn.push({ x: r.x, y: r.y, w: r.width, h: r.height, t: [...t] })
  }
  // merge while anything overlaps or nearly touches: the parts of one picture become one box
  const boxes = drawn.map((d) => ({ ...d, t: new Set(d.t), n: 1 }))
  const near = (a, b) => a.x < b.x + b.w + 40 && b.x < a.x + a.w + 40 && a.y < b.y + b.h + 40 && b.y < a.y + a.h + 40
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (!near(boxes[i], boxes[j])) continue
        const a = boxes[i], b = boxes[j]
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
        boxes[i] = {
          x, y,
          w: Math.max(a.x + a.w, b.x + b.w) - x,
          h: Math.max(a.y + a.h, b.y + b.h) - y,
          t: new Set([...a.t, ...b.t]), n: a.n + b.n,
        }
        boxes.splice(j, 1)
        merged = true
        break outer
      }
    }
  }
  // does type sit inside the mark, which is the difference between a picture beside the words and
  // one the words are set over
  for (const b of boxes) {
    b.overType = [...document.querySelectorAll('h1,h2,h3,p')].some((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.x > b.x - 8 && r.y > b.y - 8 && r.x + r.width < b.x + b.w + 8 && r.y + r.height < b.y + b.h + 8
    })
    b.t = [...b.t].sort()
  }
  boxes.sort((a, b) => b.w * b.h - a.w * a.h)
  return boxes.filter((b) => b.w >= 60 && b.h >= 60).slice(0, 3)
}

/**
 * The shape of a mark, coarse on purpose.
 *
 * The first version of this included the technique mix and a pixel size bucket, and it reported
 * six distinct marks on a wall where four of them were visibly the same watch dial: two dials at
 * 260 and 380 pixels, one reaching for a radial gradient the other did not, scored as different
 * pictures. Composition mechanics vary freely while the picture stays put, so keying on them
 * counts repaints as redraws and the number goes up while the wall stands still.
 *
 * What is left is what a person actually sorts by across a wall: the proportion of the thing, how
 * many parts it is made of, and whether the words are set over it or beside it. It is still only a
 * description of a shape and it cannot tell a good mark from a bad one. It undercounts too, since
 * two unrelated square pictures collide, and that is the right direction for the error to run: a
 * number meant to prove variety should be hard to raise.
 */
const fingerprint = (b) => {
  const ratio = b.w / b.h
  const shape = ratio > 1.6 ? 'wide' : ratio < 0.62 ? 'tall' : 'square'
  const parts = b.n >= 8 ? 'many' : b.n >= 3 ? 'few' : 'one'
  return [shape, parts, b.overType ? 'behind-type' : 'beside-type'].join(' ')
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const rows = []

for (const f of readdirSync(dir).filter((x) => x.endsWith('.html')).sort()) {
  await page.goto('file://' + path.resolve(dir, f), { waitUntil: 'load' })
  await page.waitForTimeout(350)
  const boxes = await page.evaluate(FIND).catch(() => [])
  const paper = f.replace('.html', '')
  if (!boxes.length) { rows.push({ paper, mark: null }); continue }
  const b = boxes[0]
  const pad = 16
  const clip = {
    x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
    width: Math.min(1280 - Math.max(0, b.x - pad), b.w + pad * 2),
    height: Math.min(1400 - Math.max(0, b.y - pad), b.h + pad * 2),
  }
  await page.screenshot({ path: path.join(out, `${paper}.png`), clip }).catch(() => {})
  rows.push({ paper, mark: b, print: fingerprint(b) })
}
await browser.close()

const drew = rows.filter((r) => r.mark)
const prints = new Set(drew.map((r) => r.print))
console.log(`\n  ${dir}\n`)
for (const r of rows) {
  if (!r.mark) { console.log(`  ${r.paper.padEnd(9)} nothing drawn that this can see`); continue }
  console.log(`  ${r.paper.padEnd(9)} ${String(Math.round(r.mark.w)).padStart(4)}x${String(Math.round(r.mark.h)).padEnd(5)} ${String(r.mark.n).padStart(2)} parts  ${r.print}`)
}
console.log(`\n  ${drew.length} of ${rows.length} papers drew something this can find`)
console.log(`  ${prints.size} distinct marks out of ${drew.length}   <- the number that should go up\n`)

const cells = drew.map((r) => `<figure><img src="${r.paper}.png"><figcaption>${r.paper} · ${r.print}</figcaption></figure>`).join('')
writeFileSync(path.join(out, 'sheet.html'), `<html><body style="margin:0;background:#141414;font:10px ui-monospace,monospace;color:#8a8a8a">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:16px">${cells}</div>
<style>figure{margin:0}img{width:100%;height:220px;object-fit:contain;background:#1e1e1e;display:block}
figcaption{padding:5px 2px;text-align:center;line-height:1.4}</style></body></html>`)
console.log(`  ${path.join(out, 'sheet.html')}\n`)
