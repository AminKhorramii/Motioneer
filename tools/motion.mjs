/**
 * A wall of moving marks: the drawing and its movement written together, then captured.
 *
 *   node tools/motion.mjs "a status badge for a service that is holding steady"
 *
 * The drawing and the motion come from one call because only whoever wrote the markup can move what
 * it is made of. Animating a finished mark from outside can slide it or fade it, which is a
 * transition, and a transition is what everything already does. Rows turning one after another, a
 * leader line extending to the label it names, a second ink closing onto the first: those need the
 * parts, and the parts only exist inside the reply.
 *
 * That is also the part a video model cannot reach. It can make something move and it cannot move
 * this drawing, in these tokens, at any size, without artefacts, and hand back a source file
 * somebody edits afterwards.
 *
 * Each hand is dealt a ground, a depiction and a motion, for the reason the wall keeps relearning:
 * eight independent calls each pick the most obvious answer and the obvious answer is the same one.
 * Nine of twelve marks were once the same watch dial. Left alone, eight of eight would fade up.
 *
 * A still cannot show movement, so every hand is captured twice: a webm, and a filmstrip of frames
 * across the cycle. The filmstrip is what makes a claim about motion checkable in a transcript.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, renameSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { runClaude } from '../shared/cli.mjs'
import {
  DIRECTIONS, MARK_SYSTEM, MOTION, PRESETS, dealDepictions, dealMotions, directionSeed,
  grabJson, madeMark, renderPage, starterPage, tasteOf,
} from '../dist-core/core.js'

const SUBJECT = process.argv.slice(2).join(' ') || 'a status badge for a service that is holding steady'
const HANDS = Number(process.env.WALL_HANDS || 6)
const FRAMES = 6

const out = 'motion'
const previous = 'motion.last'
if (existsSync(out)) {
  if (existsSync(previous)) rmSync(previous, { recursive: true })
  renameSync(out, previous)
}
mkdirSync(out, { recursive: true })

// grounds that carry a look bring their own palette and type; the rest borrow from the deck
const dressed = DIRECTIONS.filter((d) => d.look)
const pool = [...dressed].sort(() => Math.random() - 0.5)
const grounds = Array.from({ length: HANDS }, (_, i) => pool[i % pool.length])
const depictions = dealDepictions(HANDS)
const motions = dealMotions(HANDS)

console.log(`\n  ${SUBJECT}\n`)
const started = Date.now()

const made = await Promise.all(grounds.map(async (ground, i) => {
  const brief =
    `Draw: ${SUBJECT}\n\nBuild it from ${directionSeed(ground)}\n\n` +
    `Draw it ${depictions[i]}, unless the subject genuinely refuses it.\n\n` +
    `Move it by ${motions[i]}. Take that from the object your ground names: it is how that thing ` +
    `behaves, and it is why this one will not move like the others.`
  const text = await runClaude(`${MARK_SYSTEM}\n\n${MOTION}`, brief).catch(() => null)
  if (!text) return { i, ground, motion: motions[i], why: 'no reply' }
  const raw = grabJson(typeof text === 'string' ? text : text.text ?? '')
  const mark = raw ? madeMark(raw) : null
  return { i, ground, motion: motions[i], mark, why: mark ? null : 'reply was not a drawing' }
}))
const seconds = Math.round((Date.now() - started) / 1000)

const browser = await chromium.launch()
const rows = []

for (const m of made) {
  if (!m.mark) { rows.push(m); continue }
  const taste = m.ground.look ? tasteOf(m.ground.look, m.ground.name) : PRESETS[(m.i * 3) % PRESETS.length]
  const stage = { ...starterPage(taste, 'Mark'), taste, written: m.mark }
  const html = renderPage(stage, { title: m.mark.note || 'Mark', still: false })
  const slug = `${m.i + 1}-${m.ground.name.replace(/\W+/g, '-')}`
  writeFileSync(path.join(out, `${slug}.html`), html)

  // the clip, recorded by the browser itself so no encoder is needed
  const dir = path.join(out, `_${slug}`)
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({
    viewport: { width: 720, height: 720 }, deviceScaleFactor: 2,
    recordVideo: { dir, size: { width: 720, height: 720 } },
  })
  const tab = await ctx.newPage()
  await tab.setContent(html, { waitUntil: 'load' })
  await tab.waitForTimeout(4600)
  await ctx.close()
  const clip = readdirSync(dir).find((f) => f.endsWith('.webm'))
  if (clip) renameSync(path.join(dir, clip), path.join(out, `${slug}.webm`))
  rmSync(dir, { recursive: true, force: true })

  /**
   * And frames across the cycle, because a claim that something moves cannot be checked against a
   * single picture, and the whole point of this run is that the claim is checkable.
   */
  const shot = await browser.newContext({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 1 })
  const st = await shot.newPage()
  await st.setContent(html, { waitUntil: 'load' })
  const frames = []
  for (let f = 0; f < FRAMES; f++) {
    await st.waitForTimeout(f === 0 ? 90 : 480)
    const file = `${slug}-f${f}.png`
    await st.screenshot({ path: path.join(out, file) }).catch(() => {})
    frames.push(file)
  }
  await shot.close()

  const kb = existsSync(path.join(out, `${slug}.webm`))
    ? Math.round(readFileSync(path.join(out, `${slug}.webm`)).length / 1024) : 0
  // does it actually animate, or did it come back a still calling itself moving
  const keyframes = (m.mark.css.match(/@keyframes/gi) ?? []).length
  const delays = (m.mark.css.match(/animation-delay/gi) ?? []).length
  rows.push({ ...m, slug, frames, kb, keyframes, delays })
  console.log(`  ${m.ground.name.padEnd(20)} ${String(keyframes).padStart(2)} keyframes, ${String(delays).padStart(2)} staggered  ${String(kb).padStart(4)} KB`)
  console.log(`     ${m.motion.slice(0, 74)}`)
}
await browser.close()

const shown = rows.filter((r) => r.mark)
const strips = shown.map((r) => `<section>
  <h2>${r.ground.name} · ${(r.mark.note || '').slice(0, 44)}</h2>
  <p>${r.motion} · ${r.keyframes} keyframes, ${r.delays} staggered</p>
  <div class="strip">${r.frames.map((f) => `<img src="${f}">`).join('')}</div>
  <video src="${r.slug}.webm" autoplay loop muted playsinline></video>
</section>`).join('')
const sheet = path.resolve(out, 'sheet.html')
writeFileSync(sheet, `<html><body style="margin:0;background:#101010;font:11px ui-monospace,monospace;color:#8b8b8b">
<div style="padding:16px;display:grid;gap:22px">${strips}</div>
<style>section{display:grid;gap:8px}h2{font-size:12px;color:#ddd;margin:0;font-weight:500}
p{margin:0;color:#777}.strip{display:grid;grid-template-columns:repeat(${FRAMES},1fr);gap:5px}
.strip img{width:100%;display:block;background:#1a1a1a}
video{width:320px;display:block;background:#1a1a1a;border-radius:3px}</style></body></html>`)

console.log(`\n  ${shown.length} of ${rows.length} moved, in ${Math.floor(seconds / 60)}m ${seconds % 60}s`)
console.log(`  ${sheet}\n`)
if (!shown.length) console.log('  nothing drew, so there is nothing to open\n')
else if (process.env.WALL_NO_OPEN) console.log('  not opening it: WALL_NO_OPEN is set\n')
else {
  console.log('  opening it now\n')
  const [cmd, args] = process.platform === 'darwin' ? ['open', [sheet]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', sheet]] : ['xdg-open', [sheet]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}
