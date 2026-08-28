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
  grabJson, madeMark, renderPage, starterPage, tasteOf, unmoved,
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
  /**
   * The page carries a transport listener, because the sheet cannot reach in.
   *
   * A file:// document loaded in a file:// iframe is an opaque origin, so contentDocument throws
   * and getAnimations is unreachable. Driven that way the scrubber moved its own readout and
   * nothing else: a control that looks connected and is not, which is the exact kind of signal this
   * repository refuses to print. postMessage crosses the boundary, and the page answers with how
   * many animations it is holding so the sheet can say whether it is really driving anything.
   */
  const listener = `<script>addEventListener('message',function(e){
  var d=e.data||{}; if(d.wall!=='hold')return;
  var a=document.getAnimations();
  a.forEach(function(x){try{x.pause();x.currentTime=d.t}catch(_){}});
  (e.source||parent).postMessage({wall:'held',n:a.length,i:d.i},'*');
});<\/script>`
  writeFileSync(path.join(out, `${slug}.html`), html.replace('</body>', listener + '</body>'))

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
  // and the gate's own verdict, which reads the shorthand spelling too
  const faults = unmoved(m.mark)
  rows.push({ ...m, slug, frames, kb, keyframes, delays, faults })
  console.log(`  ${m.ground.name.padEnd(20)} ${String(keyframes).padStart(2)} keyframes  ${String(kb).padStart(4)} KB  ${faults.length ? faults[0].split('.')[0] : 'moves as a mechanism'}`)
  console.log(`     ${m.motion.slice(0, 74)}`)
}
await browser.close()

const shown = rows.filter((r) => r.mark)

/**
 * A wall of moving marks needs a transport, which a wall of still ones does not.
 *
 * Eight animations left to themselves start whenever their iframe finishes loading, so a contact
 * sheet of them is eight clocks disagreeing: you can never see the same instant twice and you
 * cannot compare a moment across options, which is the only comparison that matters when the thing
 * being judged is timing. Scrubbing them together is the whole instrument.
 *
 * Driven through the Web Animations API rather than by overriding css. Forcing animation-delay to a
 * common value would scrub them, and it would also flatten every stagger to zero, which destroys
 * the exact property being compared. Animation.currentTime already counts from each animation's own
 * start and has its delay folded in, so setting the same currentTime on all of them holds a single
 * global moment while every offset stays intact.
 *
 * This is a picker and deliberately not an editor. There is no curve to drag and no keyframe to
 * move, because the answer to a motion you do not like here is a different motion, not a nudged
 * one: eight were written and the good one is chosen rather than repaired.
 */
const CYCLE = 4200
const cells = shown.map((r, i) => `<figure>
  <iframe src="${r.slug}.html" loading="eager" data-i="${i}"></iframe>
  <figcaption>
    <b>${r.ground.name}</b>
    <span class="note">${(r.mark.note || '').slice(0, 46)}</span>
    <span class="verdict">${r.faults.length ? r.faults[0].split('.')[0] : 'moves as a mechanism'}</span>
    <span><a href="${r.slug}.webm">clip</a> &nbsp;<a href="${r.slug}.html">page</a></span>
  </figcaption>
</figure>`).join('')

const sheet = path.resolve(out, 'sheet.html')
writeFileSync(sheet, `<html><head><meta charset="utf-8"><title>${SUBJECT}</title></head>
<body>
<header>
  <div class="left">
    <button id="play" class="btn primary"><span id="glyph">❚❚</span><span id="word">Pause</span></button>
    <span class="sep"></span>
    <span id="at" class="clock">0.00</span><span class="unit">s</span>
  </div>
  <input id="scrub" type="range" min="0" max="${CYCLE}" value="0" step="10">
  <div class="right">
    <label class="field">Speed
      <select id="rate"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select>
    </label>
    <span class="sep"></span>
    <span id="driven" class="status">connecting</span>
    <span class="keys"><kbd>Space</kbd><kbd>←</kbd><kbd>→</kbd></span>
  </div>
</header>
<div class="grid">${cells}</div>
<style>
  /**
   * Restraint, borrowed from the tools this sits beside all day.
   *
   * Near black rather than black, borders at seven percent white rather than a visible grey, one
   * muted indigo used on the single control that matters, and thirteen pixel type with tabular
   * figures so the clock does not shuffle as it counts. Nothing here should pull the eye: the panel
   * is furniture and the six moving things above it are the work.
   */
  :root{
    --bg:#08090a; --panel:#0f1011; --raised:#141516;
    --line:rgba(255,255,255,.07); --line-strong:rgba(255,255,255,.11);
    --ink:#e6e6e6; --dim:#8a8f98; --faint:#5c6068; --accent:#5e6ad2;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:13px/1.5 ui-sans-serif,-apple-system,"Inter","Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased}
  header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:16px;
    height:48px;padding:0 14px;background:var(--panel);
    border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
  .left,.right{display:flex;align-items:center;gap:10px;flex:none}
  .sep{width:1px;height:18px;background:var(--line)}
  .btn{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;
    background:var(--raised);color:var(--ink);border:1px solid var(--line-strong);
    border-radius:6px;font:inherit;font-size:12.5px;cursor:pointer;
    transition:background 100ms ease,border-color 100ms ease}
  .btn:hover{background:#1a1b1d;border-color:rgba(255,255,255,.16)}
  .btn:active{background:#111213}
  .btn.primary{border-color:rgba(94,106,210,.5)}
  #glyph{font-size:9px;color:var(--accent);letter-spacing:1px}
  .clock{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";
    font-size:12.5px;color:var(--ink);min-width:38px;text-align:right}
  .unit{color:var(--faint);font-size:11px;margin-left:-4px}
  #scrub{flex:1;height:3px;-webkit-appearance:none;appearance:none;
    background:var(--line-strong);border-radius:2px;cursor:pointer}
  #scrub::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;
    background:var(--accent);border:2px solid var(--panel);
    box-shadow:0 0 0 1px rgba(94,106,210,.35);transition:transform 100ms ease}
  #scrub:hover::-webkit-slider-thumb{transform:scale(1.15)}
  .field{display:inline-flex;align-items:center;gap:7px;color:var(--dim);font-size:12px}
  select{height:28px;padding:0 7px;background:var(--raised);color:var(--ink);
    border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:12.5px;cursor:pointer}
  .status{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
  .keys{display:inline-flex;gap:4px}
  kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;
    padding:0 5px;background:var(--raised);border:1px solid var(--line-strong);
    border-radius:4px;font-size:10.5px;color:var(--faint);font-family:inherit}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px}
  figure{margin:0;display:grid;gap:0;background:var(--panel);border:1px solid var(--line);
    border-radius:8px;overflow:hidden;transition:border-color 100ms ease}
  figure:hover{border-color:var(--line-strong)}
  iframe{width:100%;aspect-ratio:1;border:0;background:#0b0c0d;display:block}
  figcaption{padding:10px 12px;border-top:1px solid var(--line);line-height:1.6;
    display:grid;gap:3px;font-size:12px}
  figcaption b{color:var(--ink);font-weight:500}
  figcaption .note{color:var(--dim)}
  figcaption .verdict{color:var(--faint);font-size:11px}
  figcaption a{color:var(--faint);text-decoration:none;font-size:11px}
  figcaption a:hover{color:var(--dim)}
</style>
<script>
  const frames = [...document.querySelectorAll('iframe')]
  const scrub = document.getElementById('scrub')
  const play = document.getElementById('play')
  const at = document.getElementById('at')
  const rate = document.getElementById('rate')
  const link = document.getElementById('driven')
  let running = true, t = 0, last = performance.now()

  // every animation in every frame, re-read each tick because a frame can still be loading
  const held = new Map()
  addEventListener('message', (e) => {
    const d = e.data || {}
    if (d.wall === 'held') { held.set(d.i, d.n); paint() }
  })
  const paint = () => {
    const live = [...held.values()].filter((n) => n > 0).length
    link.textContent = live + '/' + frames.length + ' driven'
    link.style.color = live === frames.length ? '#8a8f98' : '#d29d6b'
  }
  const hold = (ms) => {
    frames.forEach((f, i) => {
      try { f.contentWindow.postMessage({ wall: 'hold', t: ms, i }, '*') } catch {}
    })
    scrub.value = ms
    at.textContent = (ms / 1000).toFixed(2)
  }
  const tick = (now) => {
    const step = now - last
    last = now
    if (running) { t = (t + step * Number(rate.value)) % ${CYCLE}; hold(t) }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const face = () => {
    document.getElementById('glyph').textContent = running ? '❚❚' : '▶'
    document.getElementById('word').textContent = running ? 'Pause' : 'Play'
  }
  play.onclick = () => { running = !running; face() }
  scrub.oninput = () => { running = false; face(); t = Number(scrub.value); hold(t) }
  rate.onchange = () => { last = performance.now() }
  addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); play.click() }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); running = false; face()
      t = Math.max(0, Math.min(${CYCLE}, t + (e.key === 'ArrowRight' ? 100 : -100))); hold(t)
    }
  })
</script>
</body></html>`)

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
