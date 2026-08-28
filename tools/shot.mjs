/**
 * A camera pass over a component: macro, tilted, shallow focus, and the accents blooming.
 *
 *   node tools/shot.mjs src/Dock.tsx --css src/wall.css
 *   node tools/shot.mjs motion/1-thermal-receipt.html
 *   node tools/shot.mjs src/Dock.tsx --css src/wall.css --wide
 *
 * This is a different thing from the motion tools and worth saying why. Those move what a component
 * is made of: rows arrive, a seal lands, a line draws itself. This does not touch the component at
 * all. It puts it on a stage, points a lens at it, and moves the lens, which is the entire look of
 * every product film made in the last three years: the interface is barely legible, one band is in
 * focus, and what you actually read is a glow.
 *
 * The pieces are all plain CSS and none of them are new. Perspective and a rotation give the tilt.
 * A second copy of the component, blurred and masked to everything outside a diagonal band, gives
 * depth of field, because css cannot sample what is behind it and the only honest way to defocus
 * part of a thing is to have two of it. A third copy, blurred hard and blended to screen, is the
 * bloom, which is why the accents look emissive rather than merely bright. The camera then drifts
 * across six seconds and the film tool photographs it.
 *
 * The copies are made in the page rather than in the markup, so nothing here asks a component to be
 * written differently to be filmed.
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
const cssAt = args.indexOf('--css')
const SHEET = cssAt > -1 ? args[cssAt + 1] : null
const target = args.find((a, i) => !a.startsWith('--') && !(cssAt > -1 && i === cssAt + 1))
const SIZE = args.includes('--wide') ? { width: 1280, height: 720 }
  : args.includes('--tall') ? { width: 864, height: 1080 }
    : { width: 1080, height: 1080 }
if (!target || !existsSync(target)) {
  console.log('\n  node tools/shot.mjs <component or .html> [--css your.css] [--wide|--tall]\n')
  process.exit(1)
}

/** the same rough JSX read the animate tool uses, so a .tsx can be pointed at directly */
const matching = (src, open) => {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (!depth) return i }
  }
  return -1
}
const balanced = (src) => {
  const open = src.search(/<[a-zA-Z][\w.-]*/)
  if (open === -1) return src
  const tag = (src.slice(open + 1).match(/^[\w.-]+/) ?? [''])[0]
  if (!tag) return src.slice(open)
  let depth = 0, last = open
  const step = new RegExp(`<(/?)${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])|/>`, 'g')
  step.lastIndex = open
  for (let m = step.exec(src); m; m = step.exec(src)) {
    if (m[0] === '/>') { if (depth === 1) return src.slice(open, m.index + 2); continue }
    depth += m[1] ? -1 : 1
    if (!depth) { const c = src.indexOf('>', m.index); return src.slice(open, c === -1 ? src.length : c + 1) }
    last = m.index
  }
  return src.slice(open, last)
}
const stripBraces = (src) => {
  let out = '', i = 0
  while (i < src.length) {
    const at = src.indexOf('{', i)
    if (at === -1) { out += src.slice(i); break }
    const close = matching(src, at)
    if (close === -1) { out += src.slice(i); break }
    out += src.slice(i, at); i = close + 1
  }
  return out
}
const fromSource = (src) => {
  let body = balanced(src.replace(/^[\s\S]*?return\s*\(/m, '')).replace(/className=/g, 'class=')
  body = body.replace(/=\{/g, '={')
  body = body.split('').map((chunk, i) => (i === 0 ? chunk : (() => {
    const close = matching(chunk, 0)
    if (close === -1) return chunk
    const lits = [...chunk.slice(1, close).matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]).join(' ')
    return `"${lits.trim()}"` + chunk.slice(close + 1)
  })())).join('')
  return stripBraces(body).replace(/<>|<\/>/g, '').trim()
}

const raw = readFileSync(target, 'utf8')
const isPage = /\.html?$/i.test(target)
// an html page written by the motion tools is already a whole document, so its body is lifted out
const markup = isPage
  ? (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) ?? [, raw])[1].replace(/<script[\s\S]*?<\/script>/gi, '')
  : fromSource(raw)
const pageStyles = isPage
  ? [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  : ''

/** only the rules that name a class this markup uses, plus the custom properties everything needs */
const relevant = (css) => {
  const used = new Set([...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
  const roots = [...css.matchAll(/(:root|@media[^{]*\{\s*:root)[^{]*\{[^}]*\}/g)].map((m) => m[0])
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel]) => [...used].some((c) => sel.includes('.' + c)))
    .map(([whole]) => whole.trim())
  return [...roots, ...blocks].join('\n').slice(0, 14000)
}
const base = pageStyles || (SHEET && existsSync(SHEET) ? relevant(readFileSync(SHEET, 'utf8')) : '')

/**
 * The lens.
 *
 * Numbers rather than adjectives, because every one of these is visible in the references and
 * guessing at them produces the flat tilted screenshot that everybody makes instead. The rotation
 * is a dutch angle with real perspective and not a 2d skew; the scale is macro, so three or four
 * elements fill the frame rather than a whole dashboard; and the focus band is narrow and diagonal,
 * which is what makes it read as a lens rather than as a vignette.
 */
const STAGE = `
  :root{ --push: 0; }
  html,body{margin:0;height:100%;background:#050506;overflow:hidden}
  .rig{position:fixed;inset:0;display:grid;place-items:center;perspective:1500px;perspective-origin:50% 45%}
  .dolly{transform-style:preserve-3d;animation:dolly 12s cubic-bezier(.4,0,.55,1) infinite alternate}
  .plate{position:relative;width:1000px;transform-style:preserve-3d;filter:brightness(1.18) contrast(1.06)}
  .layer{position:absolute;inset:0;display:grid;place-items:center}
  .layer > *{width:100%}
  /* sharp, then the same thing defocused everywhere except a narrow diagonal band */
  .sharp{position:relative}
  .blur{filter:blur(9px) saturate(1.1);
    -webkit-mask-image:linear-gradient(168deg,#000 0%,rgba(0,0,0,.9) 14%,transparent 34%,transparent 66%,rgba(0,0,0,.9) 86%,#000 100%);
    mask-image:linear-gradient(168deg,#000 0%,rgba(0,0,0,.9) 14%,transparent 34%,transparent 66%,rgba(0,0,0,.9) 86%,#000 100%)}
  /* a third copy blurred hard and screened underneath, which is what makes light look emitted rather
     than merely bright. It sits below the sharp layer on purpose: over it, it fogs the whole frame */
  .bloom{filter:blur(22px) saturate(2.2) brightness(1.35);mix-blend-mode:screen;opacity:.6;pointer-events:none}
  @keyframes dolly{
    0%   {transform:rotateX(15deg) rotateY(-24deg) rotateZ(-9deg) scale(2.15) translate3d(6%,4%,0)}
    100% {transform:rotateX(9deg)  rotateY(-13deg) rotateZ(-5deg) scale(1.72) translate3d(-5%,-3%,0)}
  }
  /* the corners fall away, which is the lens and not a filter over the picture */
  .vignette{position:fixed;inset:0;pointer-events:none;z-index:5;
    background:radial-gradient(135% 105% at 50% 46%,transparent 48%,rgba(5,5,6,.55) 82%,rgba(5,5,6,.92) 100%)}
  /* a little grain, because a perfectly clean gradient is the one thing that reads as rendered */
  .grain{position:fixed;inset:-50%;pointer-events:none;z-index:6;opacity:.055;
    background-image:repeating-conic-gradient(#fff 0% 0.0009%,transparent 0% 0.0018%);
    animation:grain 1.2s steps(6) infinite}
  @keyframes grain{
    0%{transform:translate3d(0,0,0)}20%{transform:translate3d(-1.5%,1%,0)}
    40%{transform:translate3d(1%,-1.5%,0)}60%{transform:translate3d(-1%,-1%,0)}
    80%{transform:translate3d(1.5%,1.5%,0)}100%{transform:translate3d(0,0,0)}}
`

const out = 'shot'
if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(out, { recursive: true })

const page = `<html><head><meta charset="utf-8"><style>${base}\n${STAGE}</style></head><body>
<div class="rig"><div class="dolly"><div class="plate">
  <div class="layer bloom" data-copy></div>
  <div class="layer sharp">${markup}</div>
  <div class="layer blur" data-copy></div>
</div></div></div>
<div class="vignette"></div><div class="grain"></div>
<script>
  // the defocus and the bloom are copies of the real thing, cloned here so the component never has
  // to be written twice or know it is being filmed
  const source = document.querySelector('.sharp')
  for (const slot of document.querySelectorAll('[data-copy]')) slot.append(source.firstElementChild.cloneNode(true))
  // the same transport the rest of the tools use, so film.mjs can step this frame by frame
  addEventListener('message', function (e) {
    const d = e.data || {}
    if (d.wall !== 'hold') return
    const a = document.getAnimations()
    a.forEach(function (x) { try { x.pause(); x.currentTime = d.t } catch (_) {} })
    ;(e.source || parent).postMessage({ wall: 'held', n: a.length, i: d.i }, '*')
  })
<\/script></body></html>`

const name = path.basename(target).replace(/\.[^.]+$/, '')
writeFileSync(path.join(out, `${name}.html`), page)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 })
const tab = await ctx.newPage()
await tab.goto('file://' + path.resolve(out, `${name}.html`), { waitUntil: 'load' })
await tab.waitForTimeout(400)
const anims = await tab.evaluate(() => document.getAnimations().length)
const copies = await tab.evaluate(() => document.querySelectorAll('[data-copy] > *').length)

// six stills across the move, so the shot can be judged before anything is filmed
const stills = []
for (let i = 0; i < 6; i++) {
  const at = Math.round((i / 5) * 11000)
  await tab.evaluate((t) => {
    for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = t } catch {} }
  }, at)
  const f = `${name}-${i}.png`
  await tab.screenshot({ path: path.join(out, f) })
  stills.push(f)
}
await browser.close()

writeFileSync(path.join(out, 'sheet.html'), `<html><body style="margin:0;background:#08090a;
  font:11px ui-monospace,monospace;color:#8a8f98">
<div style="padding:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
${stills.map((f, i) => `<figure style="margin:0"><img src="${f}" style="width:100%;display:block;border-radius:6px">
<figcaption style="padding:6px 2px;text-align:center">${((i / 5) * 11).toFixed(1)}s</figcaption></figure>`).join('')}
</div></body></html>`)

console.log(`\n  ${name}: ${anims} animations, ${copies} copies for defocus and bloom`)
console.log(`  ${path.resolve(out, 'sheet.html')}`)
console.log(`  node tools/film.mjs shot     to render the move as frames\n`)
if (!process.env.WALL_NO_OPEN) {
  const s = path.resolve(out, 'sheet.html')
  const [cmd, a] = process.platform === 'darwin' ? ['open', [s]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', s]] : ['xdg-open', [s]]
  spawn(cmd, a, { stdio: 'ignore', detached: true }).unref()
}
