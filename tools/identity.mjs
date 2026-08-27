/**
 * Eight identities for one name, each grounded in a real printed object.
 *
 *   node tools/identity.mjs "Meridian" "a coffee roaster that publishes its roast curves"
 *
 * An identity is a palette, a type pairing, a device and the rules, and the reason to make all four
 * from one ground is that they then agree with each other by construction rather than by luck. A
 * thermal receipt identity is mono and monochrome and tight; a wine label identity is Fraunces in
 * caps on cream with an oxblood. Neither of those is a decision anybody had to take twice.
 *
 * There is no logo here and that is deliberate. A logo has to survive at sixteen pixels, work in one
 * colour and be remembered, and the marks this repository is good at are large, detailed and
 * multi coloured: three of those four properties are the wrong way round. So the name is set rather
 * than drawn, which is what a great many good identities actually are, and the drawn thing is a
 * device, used at the size where its detail is the point.
 *
 * The device is rendered on its own and then placed as an image. Its css is the model's and uses
 * whatever class names it chose, so letting it share a document with the sheet would let it restyle
 * the sheet. A picture cannot do that.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { runClaude } from '../shared/cli.mjs'
import {
  DIRECTIONS, MARK_SYSTEM, directionSeed, dealDepictions,
  grabJson, madeMark, renderPage, starterPage, tasteOf, themeOf, themeCss, unreadable,
} from '../dist-core/core.js'

const NAME = process.argv[2] || 'Meridian'
const ABOUT = process.argv.slice(3).join(' ') || 'a small maker of a made thing'
const out = 'identity'
const previous = 'identity.last'
if (existsSync(out)) {
  if (existsSync(previous)) rmSync(previous, { recursive: true })
  renameSync(out, previous)
}
mkdirSync(out, { recursive: true })

/**
 * Only the grounds that carry a full look can furnish an identity.
 *
 * A ground with just a chain is prose, and prose cannot set type. Twelve of the fifty one are
 * written out as values so far, so the deal comes from those rather than from the whole deck, and
 * it says how many there were rather than quietly handing back fewer.
 */
const dressed = DIRECTIONS.filter((d) => d.look)
const shuffled = [...dressed].sort(() => Math.random() - 0.5)
const HANDS = Math.min(Number(process.env.WALL_HANDS || 8), shuffled.length)
const grounds = shuffled.slice(0, HANDS)
const depictions = dealDepictions(HANDS)

console.log(`\n  ${NAME} — ${ABOUT}`)
console.log(`  ${HANDS} identities from ${dressed.length} dressed grounds\n`)
const started = Date.now()

// the device: one drawn thing that belongs to this name, in this ground's own way of looking
const devices = await Promise.all(grounds.map(async (g, i) => {
  const brief =
    `Draw: a device for ${NAME}, ${ABOUT}. Not a logo and not a symbol standing in for the thing: ` +
    `an emblem this maker would print on the object itself, the way a seal, a rosette, a stamp or a ` +
    `plate belongs to what carries it.\n\nBuild it from ${directionSeed(g)}\n\n` +
    `Draw it ${depictions[i]}, unless the subject genuinely refuses it.`
  const text = await runClaude(MARK_SYSTEM, brief).catch(() => null)
  if (!text) return null
  const raw = grabJson(typeof text === 'string' ? text : text.text ?? '')
  return raw ? madeMark(raw) : null
}))
const seconds = Math.round((Date.now() - started) / 1000)

/** the sheet, written as a page so the shell hands it the embedded faces and the tokens */
const sheet = (t, theme, deviceSrc) => {
  const swatch = ([name, value]) =>
    `<div class="sw"><i style="background:${value}"></i><b>${name}</b><code>${value}</code></div>`
  const named = [
    ['background', theme.light.background], ['foreground', theme.light.foreground],
    ['primary', theme.light.primary], ['accent', theme.light.accent],
    ['muted', theme.light.muted], ['border', theme.light.border],
  ]
  const dark = [
    ['background', theme.dark.background], ['foreground', theme.dark.foreground],
    ['primary', theme.dark.primary], ['accent', theme.dark.accent],
  ]
  const css = `
.id{padding:52px 56px;display:grid;gap:34px;font-family:${t.body}}
.word{font-family:${t.display};font-weight:${t.weight};letter-spacing:-.02em;line-height:1;
  font-size:${(30 * t.scale ** 1.9).toFixed(0)}px;${t.caps ? 'text-transform:uppercase;' : ''}color:var(--ink)}
.name{display:grid;gap:10px}
.about{color:var(--dim);max-width:46ch;margin:0;font-size:13px;line-height:1.5}
.rule{height:1px;background:var(--line)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:start}
.lab{font-family:${t.body};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:12px}
.sws{display:grid;gap:7px}
.sw{display:flex;align-items:center;gap:10px;font-size:11px}
.sw i{width:26px;height:26px;border-radius:${Math.min(t.radius, 6)}px;border:1px solid var(--line);flex:none}
.sw b{font-weight:600;min-width:88px;color:var(--ink)}
.sw code{color:var(--dim);font-size:10px}
.spec{display:grid;gap:9px}
.spec i{font-style:normal;font-family:${t.display};font-weight:${t.weight};color:var(--ink);line-height:1.05}
.s1{font-size:${(34 * t.scale).toFixed(0)}px}.s2{font-size:${(21 * t.scale).toFixed(0)}px}
.s3{font-size:${(14 * t.scale).toFixed(0)}px}
.body{color:var(--ink);max-width:52ch;line-height:1.6;font-size:14px}
.dev{border:1px solid var(--line);border-radius:${Math.min(t.radius, 8)}px;overflow:hidden;background:var(--surface)}
.dev img{width:100%;display:block;aspect-ratio:1;object-fit:cover}
.strip{display:flex;height:34px;border-radius:${Math.min(t.radius, 6)}px;overflow:hidden;border:1px solid var(--line)}
.strip i{flex:1}
.foot{display:flex;justify-content:space-between;font-size:10px;color:var(--dim);letter-spacing:.08em;text-transform:uppercase}`
  const html = `<div class="id">
  <div class="name">
    <div class="word">${NAME}</div>
    <p class="about">${ABOUT}</p>
  </div>
  <div class="rule"></div>
  <div class="two">
    <div>
      <div class="lab">the device</div>
      <div class="dev"><img src="${deviceSrc}"></div>
    </div>
    <div>
      <div class="lab">the type</div>
      <div class="spec">
        <i class="s1">${NAME}</i><i class="s2">Handsome type at a middle size</i>
        <i class="s3">And the same face set small, for labels</i>
      </div>
      <p class="body">This is the body face, set at the measure the ground asks for, so the two can
      be judged together rather than one at a time.</p>
    </div>
  </div>
  <div class="rule"></div>
  <div class="two">
    <div><div class="lab">light</div><div class="sws">${named.map(swatch).join('')}</div></div>
    <div><div class="lab">dark</div><div class="sws">${dark.map(swatch).join('')}</div></div>
  </div>
  <div class="strip">${theme.light.chart.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
  <div class="foot"><span>${NAME}</span><span>identity</span></div>
</div>`
  return { html, css, note: NAME }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 })
const tab = await ctx.newPage()
const rows = []

for (let i = 0; i < grounds.length; i++) {
  const g = grounds[i]
  const device = devices[i]
  const taste = tasteOf(g.look, g.name)
  const theme = themeOf(taste)
  const slug = g.name.replace(/\W+/g, '-')
  if (!device) { rows.push({ g, slug, failed: true }); continue }

  // the device alone, so its own css cannot reach the sheet
  const stage = { ...starterPage(taste, NAME), taste, written: device }
  await tab.setContent(renderPage(stage, { title: NAME, still: true }), { waitUntil: 'load' })
  await tab.waitForTimeout(220)
  await tab.screenshot({ path: path.join(out, `${slug}-device.png`) }).catch(() => {})

  // then the sheet, with the device placed as a picture
  // read back the photograph and carry it inline, because setContent has no base url to resolve against
  const src = 'data:image/png;base64,' + readFileSync(path.join(out, `${slug}-device.png`)).toString('base64')
  const page = { ...starterPage(taste, NAME), taste, written: sheet(taste, theme, src) }
  await tab.setViewportSize({ width: 900, height: 1180 })
  await tab.setContent(renderPage(page, { title: NAME, still: true }), { waitUntil: 'load' })
  await tab.waitForTimeout(260)
  await tab.screenshot({ path: path.join(out, `${slug}.png`), fullPage: true }).catch(() => {})
  await tab.setViewportSize({ width: 900, height: 900 })

  writeFileSync(path.join(out, `${slug}.css`), themeCss(theme))
  const faults = unreadable(theme)
  rows.push({ g, slug, device, faults })
  console.log(`  ${g.name.padEnd(21)} ${(device.note || '').slice(0, 40).padEnd(42)}${faults.length ? faults.length + ' faults' : 'reads both modes'}`)
}
await browser.close()

const made = rows.filter((r) => !r.failed)
const cells = made.map((r) =>
  `<figure><img src="${r.slug}.png"><figcaption>${r.g.name}<br><a href="${r.slug}.css">tokens</a></figcaption></figure>`).join('')
writeFileSync(path.join(out, 'sheet.html'), `<html><body style="margin:0;background:#131313;font:11px ui-monospace,monospace;color:#8a8a8a">
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:16px">${cells}</div>
<style>figure{margin:0}img{width:100%;display:block;border-radius:3px}
figcaption{padding:7px 2px;text-align:center;line-height:1.6}a{color:#8a8a8a}</style></body></html>`)

console.log(`\n  ${made.length} of ${rows.length} identities, in ${Math.floor(seconds / 60)}m ${seconds % 60}s`)
console.log(`  ${path.resolve(out, 'sheet.html')}\n`)
if (!made.length) console.log('  nothing drew, so there is nothing to open\n')
else if (process.env.WALL_NO_OPEN) console.log('  not opening it: WALL_NO_OPEN is set\n')
else {
  console.log('  opening it now\n')
  const s = path.resolve(out, 'sheet.html')
  const [cmd, args] = process.platform === 'darwin' ? ['open', [s]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', s]] : ['xdg-open', [s]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}
