/**
 * A mark, moving the way its object moves, captured as video.
 *
 *   node tools/motion.mjs marks.last/mark-1.html
 *   node tools/motion.mjs marks.last/mark-1.html print
 *
 * The motions here are written by hand rather than asked for, on purpose: this file exists to prove
 * the pipeline before anything is spent on generating movement, and a hand written keyframe is the
 * only way to tell a capture problem from a taste problem. Nothing about the plumbing needs a model.
 *
 * They are also the argument for doing this at all. A departures board flips, a till roll prints a
 * line at a time, a riso lays two inks in two passes and misregisters where they cross, a terminal
 * types. That is a motion vocabulary the deck already carries inside its objects, and it is the part
 * a video model cannot reach: Sora can make something move, and it cannot make your mark move in
 * your palette at your dimensions without artefacts. Css can, exactly, and re-renders at any size.
 *
 * No encoder is added for this. Playwright records webm itself, which keeps a promise this
 * repository takes seriously about what it is allowed to depend on.
 */

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync, renameSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const SOURCE = process.argv[2] || 'marks.last/mark-1.html'
const ONLY = process.argv[3]
if (!existsSync(SOURCE)) throw new Error(`no such mark: ${SOURCE}`)

/**
 * Each motion is written against the outermost element and nothing inside it.
 *
 * A mark's markup is the model's and its class names are its own, so a motion that reached for the
 * parts would only work on the one mark it was written for. Wrapping is the only thing that
 * generalises, which limits what can be expressed here and is the honest boundary of this test: it
 * shows the plumbing works and that a whole mark can be moved, not that a stamp can be cancelled.
 */
const MOTIONS = {
  // the till roll: paper feeds out of the machine a band at a time rather than fading in
  print: `@keyframes m{
    0%{clip-path:inset(0 0 100% 0)}
    12%{clip-path:inset(0 0 88% 0)}28%{clip-path:inset(0 0 71% 0)}
    46%{clip-path:inset(0 0 54% 0)}64%{clip-path:inset(0 0 33% 0)}
    82%{clip-path:inset(0 0 14% 0)}100%{clip-path:inset(0 0 0 0)}}
  .m{animation:m 2.4s steps(1,end) infinite}`,
  // the split flap: the whole card turns over on its own axis and settles
  flip: `@keyframes m{
    0%{transform:perspective(900px) rotateX(-92deg);opacity:0}
    38%{transform:perspective(900px) rotateX(12deg);opacity:1}
    58%{transform:perspective(900px) rotateX(-5deg)}
    76%{transform:perspective(900px) rotateX(2deg)}
    100%{transform:perspective(900px) rotateX(0)}}
  .m{animation:m 2.2s cubic-bezier(.2,.8,.2,1) infinite;transform-origin:50% 0}`,
  // two passes on a riso drum: the second ink arrives offset and comes into register
  register: `@keyframes m{
    0%{transform:translate(9px,-7px) }
    45%{transform:translate(-4px,3px)}
    70%{transform:translate(2px,-1px)}
    100%{transform:translate(0,0)}}
  @keyframes g{0%{opacity:.55}70%{opacity:.9}100%{opacity:1}}
  .m{animation:m 2.6s cubic-bezier(.3,.7,.2,1) infinite,g 2.6s ease-out infinite}`,
  // a light bar crossing the plate, the way a scanner or a press roller reads across it
  scan: `@keyframes m{0%{--x:-40%}100%{--x:140%}}
  .m{position:relative}
  .m::after{content:"";position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(100deg,transparent 40%,rgba(255,255,255,.16) 50%,transparent 60%);
    background-size:260% 100%;animation:sweep 2.4s linear infinite}
  @keyframes sweep{0%{background-position:180% 0}100%{background-position:-80% 0}}`,
}

const out = 'motion'
const previous = 'motion.last'
if (existsSync(out)) {
  if (existsSync(previous)) rmSync(previous, { recursive: true })
  renameSync(out, previous)
}
mkdirSync(out, { recursive: true })

const source = readFileSync(SOURCE, 'utf8')
const names = ONLY ? [ONLY] : Object.keys(MOTIONS)
if (ONLY && !MOTIONS[ONLY]) throw new Error(`no such motion: ${ONLY}. try ${Object.keys(MOTIONS).join(', ')}`)

console.log(`\n  ${SOURCE}\n`)
const rows = []

for (const name of names) {
  /**
   * The motion goes on last so it wins, and it is carried by a class added to the outermost
   * element rather than by a selector guessing at the markup.
   */
  const moved = source.replace(
    '</head>',
    `<style>${MOTIONS[name]}</style></head>`,
  ).replace(/<body([^>]*)>/i, '<body$1>')
  const withClass = moved.replace(
    /(<body[^>]*>)([\s\S]*)(<\/body>)/i,
    (_, open, body, close) => `${open}<div class="m" style="display:contents">${body}</div>${close}`,
  )
  // display:contents keeps the wrapper out of the layout, but a transform needs a box, so the
  // motions that move the whole thing get a real wrapper instead
  const needsBox = name !== 'print'
  const html = needsBox
    ? moved.replace(/(<body[^>]*>)([\s\S]*)(<\/body>)/i,
        (_, open, body, close) => `${open}<div class="m">${body}</div>${close}`)
    : withClass

  const dir = path.join(out, name)
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 800 }, deviceScaleFactor: 2,
    recordVideo: { dir, size: { width: 800, height: 800 } },
  })
  const tab = await ctx.newPage()
  await tab.setContent(html, { waitUntil: 'load' })
  await tab.waitForTimeout(300)
  // one poster frame from the middle of the movement, so a still can be looked at too
  await tab.waitForTimeout(900)
  await tab.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {})
  await tab.waitForTimeout(3200)
  await ctx.close()
  await browser.close()

  const clip = readdirSync(dir).find((f) => f.endsWith('.webm'))
  if (clip) renameSync(path.join(dir, clip), path.join(out, `${name}.webm`))
  rmSync(dir, { recursive: true, force: true })
  const kb = clip ? Math.round(readFileSync(path.join(out, `${name}.webm`)).length / 1024) : 0
  rows.push({ name, kb })
  console.log(`  ${name.padEnd(10)} ${String(kb).padStart(4)} KB`)
}

const cells = rows.map((r) =>
  `<figure><video src="${r.name}.webm" autoplay loop muted playsinline></video>
   <figcaption>${r.name} · ${r.kb} KB</figcaption></figure>`).join('')
const sheet = path.resolve(out, 'sheet.html')
mkdirSync(out, { recursive: true })
readFileSync
const fs = await import('node:fs')
fs.writeFileSync(sheet, `<html><body style="margin:0;background:#111;font:11px ui-monospace,monospace;color:#8a8a8a">
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:14px">${cells}</div>
<style>figure{margin:0}video{width:100%;display:block;background:#1a1a1a}
figcaption{padding:6px 2px;text-align:center}</style></body></html>`)

console.log(`\n  ${sheet}\n`)
if (process.env.WALL_NO_OPEN) console.log('  not opening it: WALL_NO_OPEN is set\n')
else {
  console.log('  opening it now\n')
  const [cmd, args] = process.platform === 'darwin' ? ['open', [sheet]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', sheet]] : ['xdg-open', [sheet]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}
