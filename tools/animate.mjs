/**
 * Point it at your own components and it writes the motion for them.
 *
 *   node tools/animate.mjs src/components/Card.tsx
 *   node tools/animate.mjs src/components            every component in a directory
 *   node tools/animate.mjs Card.tsx --css src/app.css   so the timing fits what it already looks like
 *
 * The motion tool inside the MCP server does this for an agent. This is the same thing for a person
 * with a repository, and the difference is only where the markup comes from and where the answer
 * goes: a file beside yours, named for it, that you include or delete in one line.
 *
 * Nothing you own is edited. The reply is a stylesheet and one attribute to add, so the worst case
 * is a file you throw away, and there is no version of this that leaves your component broken.
 *
 * Your file is sent as it stands, JSX and all, because a model reads className and a template
 * literal perfectly well and rewriting it first would only lose the structure the motion needs. The
 * rough conversion below is for the preview and the gate, which need something a browser can parse.
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { runClaude } from '../shared/cli.mjs'
import { MOTION_SYSTEM, dealMotions, grabJson, safeStyle, unmoved, brittle } from '../dist-core/core.js'

const args = process.argv.slice(2)
const cssAt = args.indexOf('--css')
const SHEET = cssAt > -1 ? args[cssAt + 1] : null
// the guard matters: with no --css, cssAt is -1 and cssAt + 1 is 0, which silently dropped the
// first argument, and the first argument is usually the only one
const targets = args.filter((a, i) => !a.startsWith('--') && !(cssAt > -1 && i === cssAt + 1))
const OPTIONS = Number(process.env.WALL_OPTIONS || 3)
if (!targets.length) {
  console.log('\n  node tools/animate.mjs <file or directory> [--css your.css]\n')
  process.exit(1)
}

const KIND = /\.(tsx|jsx|ts|js|html|htm|vue|svelte|astro)$/i
const files = targets.flatMap((t) => {
  if (!existsSync(t)) { console.log(`  no such path: ${t}`); return [] }
  if (!statSync(t).isDirectory()) return [t]
  return readdirSync(t).filter((f) => KIND.test(f)).map((f) => path.join(t, f))
}).filter((f) => KIND.test(f))
if (!files.length) { console.log('  nothing to animate there'); process.exit(1) }

/**
 * A rough parse into something a browser will render.
 *
 * Only for the preview and for the gate that watches it: the model gets the file untouched. JSX is
 * close enough to html that swapping className and dropping the expressions leaves the structure
 * intact, which is all either of those needs. It will mangle a component that builds its markup in
 * a loop, and that is a real limit rather than a bug to fix here, because the answer to it is to
 * paste the rendered output instead.
 */
/**
 * A rough parse into something a browser will render, with the braces matched properly.
 *
 * Only for the preview and the gate: the model gets the file untouched. The first version of this
 * was regexes, and regexes cannot count braces, so a component with a nested expression leaked its
 * own source into the preview as visible text. Pointed at this repository's Dock, the preview read
 * "{flags.length ? [ flags.filter((f) => f.kind === 'design')..." across the panel, which is
 * unjudgeable: nobody can assess motion on a component busy rendering its implementation.
 *
 * So the braces are walked rather than matched. Class expressions keep their string literals, since
 * that is where the class names are and the selectors are written against them; every other
 * expression is dropped whole. A component that builds markup in a loop still comes out thin, and
 * the honest answer there is to paste the rendered html instead of the source.
 */
const matching = (src, open) => {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (!depth) return i }
  }
  return -1
}

const stripBraces = (src, inAttribute) => {
  let out = '', i = 0
  while (i < src.length) {
    const at = src.indexOf('{', i)
    if (at === -1) { out += src.slice(i); break }
    const close = matching(src, at)
    if (close === -1) { out += src.slice(i); break }
    const inner = src.slice(at + 1, close)
    out += src.slice(i, at)
    // a class expression is worth mining: the literals in it are the names selectors will use
    if (inAttribute) {
      const literals = [...inner.matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]).join(' ')
      out += literals.trim()
    }
    i = close + 1
  }
  return out
}

/**
 * The outermost element and everything inside it, matched rather than sliced.
 *
 * Cutting the return block with a regex ended it at the first line that looked like a close, which
 * on a real component is somewhere in the middle: the markup came out with unclosed tags, and an
 * unclosed tree swallows whatever follows it, so the preview rendered the transport script as body
 * text and the scrubber connected to nothing. Counting the tags is the only way to know where the
 * element actually ends.
 */
const balanced = (src) => {
  const open = src.search(/<[a-zA-Z][\w.-]*/)
  if (open === -1) return src
  const tag = (src.slice(open + 1).match(/^[\w.-]+/) ?? [''])[0]
  if (!tag) return src.slice(open)
  let depth = 0, i = open
  const step = new RegExp(`<(/?)${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])|/>`, 'g')
  step.lastIndex = open
  for (let m = step.exec(src); m; m = step.exec(src)) {
    if (m[0] === '/>') { if (depth === 1) return src.slice(open, m.index + 2) ; continue }
    depth += m[1] ? -1 : 1
    if (!depth) {
      const close = src.indexOf('>', m.index)
      return src.slice(open, close === -1 ? src.length : close + 1)
    }
    i = m.index
  }
  return src.slice(open, i)
}

const asHtml = (src) => {
  let body = balanced(src.replace(/^[\s\S]*?return\s*\(/m, ''))
    .replace(/className=/g, 'class=')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  // attribute expressions first, so class={...} keeps its literals before the general strip
  body = body.replace(/=\{/g, '=\u0001{')
  const parts = body.split('\u0001')
  body = parts.map((chunk, i) => (i === 0 ? chunk : (() => {
    const close = matching(chunk, 0)
    if (close === -1) return chunk
    const lits = [...chunk.slice(1, close).matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]).join(' ')
    return `"${lits.trim()}"` + chunk.slice(close + 1)
  })())).join('')
  return stripBraces(body, false).replace(/<>|<\/>/g, '').trim()
}

/**
 * The rules that are actually about this component, rather than the first few thousand characters.
 *
 * This used to take a flat slice off the front of the stylesheet, and a real one is 32KB: pointed at
 * this repository's own Dock, the slice ended at character four thousand and the rules for .dock
 * begin at line one hundred and fifty seven. So the model and the preview both got the variables and
 * the reset and nothing about the component, which then rendered as an unpositioned nothing and had
 * every option rejected for not moving. The gate was right and it was being fed a lie.
 *
 * Custom properties come whole because everything depends on them, and after that only the blocks
 * whose selector names a class the markup actually uses. That is both smaller and more relevant than
 * any slice, which is the usual shape of this kind of fix.
 */
const relevant = (css, markup) => {
  const used = new Set([...markup.matchAll(/class="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
  const roots = [...css.matchAll(/(:root|@media[^{]*\{\s*:root)[^{]*\{[^}]*\}/g)].map((m) => m[0])
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel]) => [...used].some((c) => sel.includes('.' + c)))
    .map(([whole]) => whole.trim())
  return [...roots, ...blocks].join('\n').slice(0, 12000)
}
const rawSheet = SHEET && existsSync(SHEET) ? readFileSync(SHEET, 'utf8') : ''
const out = 'animated'
if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
/** does anything actually change on screen, which the css cannot say about itself */
async function watch(markup, scope, css, base) {
  const ctx = await browser.newContext({ viewport: { width: 460, height: 460 } })
  try {
    const tab = await ctx.newPage()
    const scoped = scope ? markup.replace(/<(\w+)/, `<$1 ${scope}`) : markup
    await tab.setContent(`<style>${base}${css}</style>${scoped}`, { waitUntil: 'load' })
    const shots = new Set()
    for (let i = 0; i < 7; i++) {
      await tab.waitForTimeout(i === 0 ? 60 : 500)
      shots.add((await tab.screenshot()).toString('base64'))
    }
    return shots.size
  } finally { await ctx.close() }
}

console.log(`\n  ${files.length} file${files.length === 1 ? '' : 's'}, ${OPTIONS} options each\n`)
const made = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const markup = asHtml(src)
  const base = rawSheet ? relevant(rawSheet, markup) : ''
  const name = path.basename(file).replace(KIND, '')
  const motions = dealMotions(OPTIONS)

  const tried = await Promise.all(motions.map(async (m) => {
    const brief = `The component, as it is written in ${path.basename(file)}:\n${src.slice(0, 6000)}\n\n`
      + (base ? `Its stylesheet, for the timing to fit:\n${base}\n\n` : '')
      + `Move it by ${m} Take the timing from that object: it is how the thing behaves.`
    let reply = await runClaude(MOTION_SYSTEM, brief).catch(() => null)
    let raw = reply ? grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    // a dropped reply is a hiccup rather than a verdict, so it is asked once more, with thinking
    if (!raw) {
      reply = await runClaude(MOTION_SYSTEM, brief, { thinking: undefined }).catch(() => null)
      raw = reply ? grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    }
    const css = raw ? safeStyle(raw.css) : ''
    if (!css) return null
    const scope = String(raw.scope ?? '').replace(/[^-\w]/g, '').slice(0, 40)
    const faults = [...unmoved({ html: '', css, note: '' }), ...brittle(css)]
    if (faults.length) return { faults, m }
    const seen = await watch(markup, scope, css, base).catch(() => null)
    if (seen !== null && seen < 2) {
      return { m, faults: ['rendered, nothing on it changed: either the selectors match nothing here '
        + 'or the movement is over before anybody sees it'] }
    }
    return { m, css, scope, note: String(raw.note ?? '').slice(0, 80), frames: seen }
  }))

  const kept = tried.filter((t) => t && t.css)
  const lost = tried.filter((t) => t && !t.css)
  console.log(`  ${name}`)
  if (!kept.length) {
    console.log(`    nothing usable: ${lost[0]?.faults[0]?.split('.')[0] ?? 'no reply came back'}\n`)
    continue
  }
  // every option in one file, the chosen one uncommented and the rest ready to swap in
  const body = kept.map((k, i) =>
    `/* ${i + 1}. ${k.note || 'untitled'}\n   timing from ${k.m}\n   add ${k.scope} to the root element */\n`
    + (i === 0 ? k.css : k.css.split('\n').map((l) => `/* ${l} */`).join('\n'))).join('\n\n')
  const cssFile = path.join(out, `${name}.motion.css`)
  writeFileSync(cssFile, `/* Motion for ${path.basename(file)}\n   ${kept.length} options. The first is live; `
    + `the rest are commented out below it.\n   Add the named attribute to the component's root element, `
    + `then import this file. */\n\n${body}\n`)
  for (const [i, k] of kept.entries()) {
    console.log(`    ${i + 1}. ${(k.note || '').padEnd(46)} ${k.scope}  ${k.frames ?? '?'} frames`)
  }
  if (lost.length) console.log(`    ${lost.length} dropped: ${lost[0].faults[0].split('.')[0]}`)
  console.log(`    -> ${cssFile}\n`)
  made.push({ name, file, markup, kept, base })
}
await browser.close()

if (!made.length) { console.log('  nothing to preview\n'); process.exit(0) }

// a preview per option, scrubbable together, so they are compared at the same instant
const listener = `<script>addEventListener('message',function(e){var d=e.data||{};if(d.wall!=='hold')return;
var a=document.getAnimations();a.forEach(function(x){try{x.pause();x.currentTime=d.t}catch(_){}});
(e.source||parent).postMessage({wall:'held',n:a.length,i:d.i},'*');});<\/script>`
let n = 0
const cells = made.flatMap((f) => f.kept.map((k) => {
  const slug = `${f.name}-${n++}`
  const scoped = k.scope ? f.markup.replace(/<(\w+)/, `<$1 ${k.scope}`) : f.markup
  writeFileSync(path.join(out, `${slug}.html`), `<html><head><style>
    body{margin:0;background:#0b0c0d;color:#e6e6e6;font:14px ui-sans-serif,system-ui;
      display:grid;place-items:center;min-height:100vh;padding:24px}
    ${f.base}${k.css}</style></head><body>${scoped}${listener}</body></html>`)
  return `<figure><iframe src="${slug}.html" data-i="${n - 1}"></iframe><figcaption>
    <b>${f.name}</b><span class="note">${k.note}</span>
    <span class="verdict">${k.scope} · ${k.frames ?? '?'} distinct frames</span></figcaption></figure>`
}))

const sheet = path.resolve(out, 'sheet.html')
writeFileSync(sheet, `<html><head><meta charset="utf-8"><title>motion</title></head><body>
<header>
  <button id="play" class="btn"><span id="glyph">❚❚</span><span id="word">Pause</span></button>
  <span class="sep"></span><span id="at" class="clock">0.00</span><span class="unit">s</span>
  <input id="scrub" type="range" min="0" max="4200" value="0" step="10">
  <span id="driven" class="status">connecting</span>
  <span class="keys"><kbd>Space</kbd><kbd>←</kbd><kbd>→</kbd></span>
</header>
<div class="grid">${cells.join('')}</div>
<style>
  :root{--bg:#08090a;--panel:#0f1011;--raised:#141516;--line:rgba(255,255,255,.07);
    --line-strong:rgba(255,255,255,.11);--ink:#e6e6e6;--dim:#8a8f98;--faint:#5c6068;--accent:#5e6ad2}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 ui-sans-serif,-apple-system,"Inter",sans-serif}
  header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px;height:48px;
    padding:0 14px;background:var(--panel);border-bottom:1px solid var(--line)}
  .sep{width:1px;height:18px;background:var(--line)}
  .btn{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;background:var(--raised);
    color:var(--ink);border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:12.5px;cursor:pointer}
  .btn:hover{background:#1a1b1d}
  #glyph{font-size:9px;color:var(--accent)}
  .clock{font-variant-numeric:tabular-nums;min-width:38px;text-align:right}
  .unit{color:var(--faint);font-size:11px;margin-left:-4px}
  #scrub{flex:1;height:3px;-webkit-appearance:none;background:var(--line-strong);border-radius:2px;cursor:pointer}
  #scrub::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;
    background:var(--accent);border:2px solid var(--panel)}
  .status{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
  .keys{display:inline-flex;gap:4px}
  kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;padding:0 5px;
    background:var(--raised);border:1px solid var(--line-strong);border-radius:4px;font-size:10.5px;color:var(--faint)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;padding:14px}
  figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
  iframe{width:100%;height:300px;border:0;background:#0b0c0d;display:block}
  figcaption{padding:10px 12px;border-top:1px solid var(--line);display:grid;gap:3px;font-size:12px}
  figcaption b{color:var(--ink);font-weight:500}
  .note{color:var(--dim)}.verdict{color:var(--faint);font-size:11px}
</style>
<script>
  const frames=[...document.querySelectorAll('iframe')],scrub=document.getElementById('scrub')
  const play=document.getElementById('play'),at=document.getElementById('at'),link=document.getElementById('driven')
  let running=true,t=0,last=performance.now()
  const held=new Map()
  addEventListener('message',e=>{const d=e.data||{};if(d.wall==='held'){held.set(d.i,d.n);paint()}})
  const paint=()=>{const live=[...held.values()].filter(n=>n>0).length
    link.textContent=live+'/'+frames.length+' driven';link.style.color=live===frames.length?'#8a8f98':'#d29d6b'}
  const hold=ms=>{frames.forEach((f,i)=>{try{f.contentWindow.postMessage({wall:'hold',t:ms,i},'*')}catch(_){}})
    scrub.value=ms;at.textContent=(ms/1000).toFixed(2)}
  const face=()=>{document.getElementById('glyph').textContent=running?'❚❚':'▶'
    document.getElementById('word').textContent=running?'Pause':'Play'}
  const tick=now=>{const step=now-last;last=now;if(running){t=(t+step)%4200;hold(t)}requestAnimationFrame(tick)}
  requestAnimationFrame(tick)
  play.onclick=()=>{running=!running;face()}
  scrub.oninput=()=>{running=false;face();t=Number(scrub.value);hold(t)}
  addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();play.click()}
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();running=false;face()
      t=Math.max(0,Math.min(4200,t+(e.key==='ArrowRight'?100:-100)));hold(t)}})
</script></body></html>`)

console.log(`  ${cells.length} option${cells.length === 1 ? '' : 's'} across ${made.length} component${made.length === 1 ? '' : 's'}`)
console.log(`  ${sheet}\n`)
if (process.env.WALL_NO_OPEN) console.log('  not opening it: WALL_NO_OPEN is set\n')
else {
  console.log('  opening it now\n')
  const [cmd, a] = process.platform === 'darwin' ? ['open', [sheet]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', sheet]] : ['xdg-open', [sheet]]
  spawn(cmd, a, { stdio: 'ignore', detached: true }).unref()
}
