/**
 * The studio: point it at a folder of components and play with their motion.
 *
 *   node tools/studio.mjs ~/your-app/src/components --css ~/your-app/src/app.css
 *   node tools/studio.mjs examples
 *
 * Everything up to here has been a command that runs once and prints a path. That is the wrong shape
 * for the actual job, which is not "generate motion" but "try several and keep one": you want the
 * component list in front of you, you want to ask for more options when none of them land, and you
 * want to hold every option at the same instant and look. That is an application, so this is one.
 *
 * No build step and no framework. The server is node's own http, the page is html and a script tag,
 * and the model calls go through the same runClaude every other tool here uses. Adding a bundler to
 * a repository whose entire promise is a single file with no requests would be an odd way to spend
 * the dependency budget.
 *
 * The pieces are all reused. dealMotions gives each option a different verb from the deck so they
 * disagree by construction, unmoved and brittle reject the ones that only slide or that pin their
 * selectors to utility classes, the rendered watch throws away anything that does not actually move,
 * and the camera is the stage out of shot.mjs. What is new is only the room they are used in.
 */

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { runClaude } from '../shared/cli.mjs'
import {
  MOTION_SYSTEM, dealMotions, grabJson, safeStyle, unmoved, brittle, scopeOf,
  PRESETS, themeOf, themeCss,
} from '../dist-core/core.js'

const args = process.argv.slice(2)
const cssAt = args.indexOf('--css')
const SHEET = cssAt > -1 ? args[cssAt + 1] : null
// with no folder given it opens on the components in this repo, so `npm run studio` is a thing you
// can run on a clean checkout and immediately have something to animate
const ROOT = args.find((a, i) => !a.startsWith('--') && !(cssAt > -1 && i === cssAt + 1)) ?? 'examples/components'
const PORT = Number(process.env.WALL_PORT || 4321)
const KIND = /\.(tsx|jsx|vue|svelte|astro|html|htm)$/i
const work = '.studio'
mkdirSync(work, { recursive: true })

if (!existsSync(ROOT)) { console.log(`\n  no such folder: ${ROOT}\n`); process.exit(1) }

/* ── reading a component out of a file, the same way animate.mjs does ─────────────────────────── */
const matching = (s, open) => {
  let d = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') d++
    else if (s[i] === '}') { d--; if (!d) return i }
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
const markupOf = (file) => {
  const raw = readFileSync(file, 'utf8')
  if (/\.html?$/i.test(file)) {
    const body = (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) ?? [, raw])[1]
    return { markup: body.replace(/<script[\s\S]*?<\/script>/gi, ''), source: raw,
      own: [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') }
  }
  let body = balanced(raw.replace(/^[\s\S]*?return\s*\(/m, '')).replace(/className=/g, 'class=')
  body = body.replace(/=\{/g, '={')
  body = body.split('').map((chunk, i) => (i === 0 ? chunk : (() => {
    const close = matching(chunk, 0)
    if (close === -1) return chunk
    const lits = [...chunk.slice(1, close).matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]).join(' ')
    return `"${lits.trim()}"` + chunk.slice(close + 1)
  })())).join('')
  return { markup: stripBraces(body).replace(/<>|<\/>/g, '').trim(), source: raw, own: '' }
}
/** only the rules naming a class this markup uses, because a flat slice cuts off the component */
const relevant = (css, markup) => {
  const used = new Set([...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
  const roots = [...css.matchAll(/(:root|@media[^{]*\{\s*:root)[^{]*\{[^}]*\}/g)].map((m) => m[0])
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel]) => [...used].some((c) => sel.includes('.' + c)))
    .map(([w]) => w.trim())
  return [...roots, ...blocks].join('\n').slice(0, 14000)
}
const rawSheet = SHEET && existsSync(SHEET) ? readFileSync(SHEET, 'utf8') : ''

/* ── making a shadcn component look like itself ───────────────────────────────────────────────── *
 *
 * A shadcn component is Tailwind classes and nothing else. Rendered without Tailwind it is a column
 * of unstyled text, which matters more than it sounds: motion is written against what the model can
 * see, so "each card flips down" written against a component with no cards is motion for a layout
 * that does not exist. The first run of this studio did exactly that.
 *
 * So the utilities have to resolve. Tailwind's browser build compiles them in the page with no build
 * step, and it is fetched once and cached in .studio rather than linked, so every preview after the
 * first makes no network request and the whole thing keeps working on a plane. If the fetch fails the
 * studio says so in the header instead of quietly showing naked text again.
 *
 * The colours come from Wall's own presets by way of themeOf, which already knows how to turn a
 * direction into the token set shadcn reads and has already been measured for contrast in both modes.
 * That is a better answer than defaulting to slate: you get to see your component in eight palettes
 * that have passed a readability gate, and the motion is judged against the one you will ship.
 */
const TOKENS = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring']

const themeFor = (name) => themeCss(themeOf(PRESETS.find((p) => p.name === name) ?? PRESETS[0]))
const themeMap = `@import "tailwindcss";\n@theme inline {\n`
  + TOKENS.map((t) => `  --color-${t}: var(--${t});`).join('\n')
  + `\n  --radius-lg: var(--radius);\n}\n`

/** utility-shaped classes the given sheet has no rule for: the sign that Tailwind has to run */
const wantsTailwind = (markup, covered) => {
  const used = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean)
  const utility = used.filter((c) => /^(grid|flex|hidden|block|inline|absolute|relative|sticky)$/.test(c)
    || /^(p|m|w|h|gap|text|bg|border|rounded|font|grid-cols|space|items|justify|shadow|max|min|leading|tracking|col|row|opacity|z|top|left|right|bottom|px|py|mx|my|pt|pb|pl|pr|mt|mb|ml|mr)(-|$)/.test(c))
  return utility.length >= 3 && !utility.some((c) => covered.includes('.' + c))
}

let tailwind = null   // the cached browser build, or an honest reason it is missing
const cached = path.join(work, 'tailwind.js')
async function getTailwind() {
  if (tailwind) return tailwind
  if (existsSync(cached)) return (tailwind = { js: readFileSync(cached, 'utf8') })
  try {
    const r = await fetch('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4')
    if (!r.ok) throw new Error(`the CDN answered ${r.status}`)
    const js = await r.text()
    writeFileSync(cached, js)
    console.log(`  cached tailwind (${Math.round(js.length / 1024)}kb) in ${cached}, no network from here on`)
    return (tailwind = { js })
  } catch (e) {
    return (tailwind = { why: String(e.message || e).slice(0, 120) })
  }
}

const list = () => {
  const walk = (dir, depth = 0) => (depth > 2 ? [] : readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      if (e.name.startsWith('.') || e.name === 'node_modules') return []
      const full = path.join(dir, e.name)
      return e.isDirectory() ? walk(full, depth + 1) : (KIND.test(e.name) ? [full] : [])
    }))
  return (statSync(ROOT).isDirectory() ? walk(ROOT) : [ROOT]).slice(0, 200)
}

/* ── the camera, lifted from shot.mjs so both agree about what a shot looks like ──────────────── */
const STAGE = `
  html,body{margin:0;height:100%;background:#050506;overflow:hidden}
  .rig{position:fixed;inset:0;display:grid;place-items:center;perspective:1500px;perspective-origin:50% 45%}
  .dolly{transform-style:preserve-3d;animation:dolly 12s cubic-bezier(.4,0,.55,1) infinite alternate}
  .plate{position:relative;width:1000px;transform-style:preserve-3d;filter:brightness(1.18) contrast(1.06)}
  .layer{position:absolute;inset:0;display:grid;place-items:center}.layer>*{width:100%}
  .sharp{position:relative}
  .blur{filter:blur(9px) saturate(1.1);
    -webkit-mask-image:linear-gradient(168deg,#000 0%,rgba(0,0,0,.9) 14%,transparent 34%,transparent 66%,rgba(0,0,0,.9) 86%,#000 100%);
    mask-image:linear-gradient(168deg,#000 0%,rgba(0,0,0,.9) 14%,transparent 34%,transparent 66%,rgba(0,0,0,.9) 86%,#000 100%)}
  .bloom{filter:blur(22px) saturate(2.2) brightness(1.35);mix-blend-mode:screen;opacity:.6;pointer-events:none}
  @keyframes dolly{
    0%{transform:rotateX(15deg) rotateY(-24deg) rotateZ(-9deg) scale(2.15) translate3d(6%,4%,0)}
    100%{transform:rotateX(9deg) rotateY(-13deg) rotateZ(-5deg) scale(1.72) translate3d(-5%,-3%,0)}}
  .vignette{position:fixed;inset:0;pointer-events:none;z-index:5;
    background:radial-gradient(135% 105% at 50% 46%,transparent 48%,rgba(5,5,6,.55) 82%,rgba(5,5,6,.92) 100%)}
  .grain{position:fixed;inset:-50%;pointer-events:none;z-index:6;opacity:.055;
    background-image:repeating-conic-gradient(#fff 0% 0.0009%,transparent 0% 0.0018%);
    animation:grain 1.2s steps(6) infinite}
  @keyframes grain{0%{transform:translate3d(0,0,0)}20%{transform:translate3d(-1.5%,1%,0)}
    40%{transform:translate3d(1%,-1.5%,0)}60%{transform:translate3d(-1%,-1%,0)}
    80%{transform:translate3d(1.5%,1.5%,0)}100%{transform:translate3d(0,0,0)}}`

/**
 * The transport, plus the one line that makes it reliable.
 *
 * A finished css animation with no fill leaves the document timeline, so getAnimations returns
 * nothing for it. An entrance of 900ms is therefore invisible to the scrubber if the iframe happened
 * to load a second before the studio first asked it to hold, and the option reads as "did not move"
 * when it moved perfectly well and is simply over. Catching them at the first frame and parking them
 * at zero costs nothing and means the count in the header is about the motion rather than about how
 * busy the machine was.
 */
const LISTENER = `<script>
requestAnimationFrame(function(){document.getAnimations().forEach(function(a){
  try{a.pause();a.currentTime=0}catch(_){}})});
addEventListener('message',function(e){var d=e.data||{};if(d.wall!=='hold')return;
var a=document.getAnimations();a.forEach(function(x){try{x.pause();x.currentTime=d.t}catch(_){}});
(e.source||parent).postMessage({wall:'held',n:a.length,i:d.i},'*');});<\/script>`

const preview = (o, camera, palette) => {
  const scoped = o.scope ? o.markup.replace(/<(\w+)/, `<$1 ${o.scope}`) : o.markup
  // Tailwind's compiler and the motion sheet both go in head, but the motion sheet is written last so
  // that a keyframe never loses to a utility that happens to set the same property
  const tw = o.tw ? `<script src="/tailwind.js"></script>
    <style type="text/tailwindcss">${themeMap}</style>` : ''
  const vars = o.tw ? `<style>${themeFor(palette)}</style>` : ''
  /**
   * Centring by hand rather than with place-items.
   *
   * A grid centres an item it is narrower than by overflowing it equally on both sides, which is not
   * what you want when the item is eight hundred pixels and the frame is three hundred: the component
   * ends up mostly off to one side and you are looking at a corner of it. Positioning a wrapper at the
   * midpoint and pulling it back by half its own size lands the centre on the centre at any size.
   *
   * The wrapper also keeps the fit transform off the component itself, so a motion that animates
   * transform on the root element is no longer fighting the thing that makes it visible.
   */
  const chrome = camera ? STAGE : `html,body{margin:0;height:100%;overflow:hidden;
    background:var(--background,#0b0c0d);color:var(--foreground,#e6e6e6);font:14px ui-sans-serif,system-ui}
    #fit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center center}`
  const head = `<meta charset="utf-8">${tw}${vars}<style>${o.base}\n${chrome}\n${o.css}</style>`
  /**
   * A dashboard component is eight hundred pixels wide and the card it is being compared in is three
   * hundred. Left alone you see the first tier of a pricing table and a sliver of the second, which is
   * no basis for choosing between four motions. Scaling the whole thing down to fit is the only honest
   * way to show it: a transform does not touch layout, so the component still believes it has its full
   * width and the motion plays at the timing it was written for, just smaller.
   */
  const FIT = `<script>(function(){var el=document.getElementById('fit');if(!el)return;
    function fit(){el.style.transform='translate(-50%,-50%)';
      var r=el.getBoundingClientRect();if(!r.width||!r.height)return;
      var s=Math.min(1,(innerWidth-28)/r.width,(innerHeight-28)/r.height);
      el.style.transform='translate(-50%,-50%) scale('+s.toFixed(4)+')'}
    fit();addEventListener('resize',fit);setTimeout(fit,120);setTimeout(fit,600)})();<\/script>`
  if (!camera) return `<html class="dark"><head>${head}</head><body>`
    + `<div id="fit">${scoped}</div>${FIT}${LISTENER}</body></html>`
  return `<html class="dark"><head>${head}</head><body>
    <div class="rig"><div class="dolly"><div class="plate">
      <div class="layer bloom" data-copy></div>
      <div class="layer sharp">${scoped}</div>
      <div class="layer blur" data-copy></div>
    </div></div></div><div class="vignette"></div><div class="grain"></div>
    <script>var src=document.querySelector('.sharp');
    for (var s of document.querySelectorAll('[data-copy]')) s.append(src.firstElementChild.cloneNode(true));<\/script>
    ${LISTENER}</body></html>`
}

/* ── asking for motion, with every gate the other tools use ───────────────────────────────────── */
const made = new Map()   // id -> { file, markup, base, css, scope, note, verb }
let nextId = 0

async function options(file, count) {
  const read = markupOf(file)
  const { markup, source } = read
  const base = rawSheet ? relevant(rawSheet, markup) : read.own
  const tw = wantsTailwind(markup, base) && !!(await getTailwind()).js
  const verbs = dealMotions(count)
  const tried = await Promise.all(verbs.map(async (verb) => {
    const brief = `The component, as written in ${path.basename(file)}:\n${source.slice(0, 6000)}\n\n`
      + (base ? `Its stylesheet:\n${base.slice(0, 3000)}\n\n` : '')
      + `Move it by ${verb} Take the timing from that object: it is how the thing behaves.`
    let reply = await runClaude(MOTION_SYSTEM, brief).catch(() => null)
    let raw = reply ? grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    if (!raw) {
      reply = await runClaude(MOTION_SYSTEM, brief, { thinking: undefined }).catch(() => null)
      raw = reply ? grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    }
    const css = raw ? safeStyle(raw.css) : ''
    if (!css) return { verb, why: 'no usable reply came back' }
    const faults = [...unmoved({ html: '', css, note: '' }), ...brittle(css)]
    if (faults.length) return { verb, why: faults[0] }
    const id = String(nextId++)
    const scope = scopeOf(css, raw.scope)
    made.set(id, { file, markup, base, css, scope, tw, note: String(raw.note ?? '').slice(0, 90), verb })
    return { id, verb, scope, note: String(raw.note ?? '').slice(0, 90), css }
  }))
  const styled = tw ? 'tailwind and a Wall palette'
    : base ? `${SHEET ? path.basename(SHEET) : 'its own <style>'}`
      : (await getTailwind()).why ? `nothing: ${(await getTailwind()).why}` : 'nothing, and it needs nothing'
  return { kept: tried.filter((t) => t.id), dropped: tried.filter((t) => !t.id), styled }
}

/* ── the room ─────────────────────────────────────────────────────────────────────────────────── */
const PAGE = () => `<html><head><meta charset="utf-8"><title>motion studio</title><style>
:root{--bg:#08090a;--panel:#0f1011;--raised:#141516;--line:rgba(255,255,255,.07);
  --line2:rgba(255,255,255,.11);--ink:#e6e6e6;--dim:#8a8f98;--faint:#5c6068;--accent:#5e6ad2}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:grid;grid-template-columns:250px 1fr;background:var(--bg);
  color:var(--ink);font:13px/1.5 ui-sans-serif,-apple-system,"Inter",sans-serif}
aside{border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.head{padding:13px 14px;border-bottom:1px solid var(--line);display:grid;gap:3px}
.head b{font-weight:500}.head span{color:var(--faint);font-size:11px;word-break:break-all}
.files{overflow:auto;padding:6px;flex:1}
.file{display:block;width:100%;text-align:left;background:none;border:0;color:var(--dim);
  padding:6px 9px;border-radius:5px;font:inherit;font-size:12px;cursor:pointer;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file:hover{background:var(--raised);color:var(--ink)}
.file[aria-current=true]{background:var(--raised);color:var(--ink)}
main{display:flex;flex-direction:column;min-width:0;min-height:0}
header{display:flex;align-items:center;gap:12px;height:48px;padding:0 14px;
  border-bottom:1px solid var(--line);background:var(--panel);flex:none}
.btn{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;background:var(--raised);
  color:var(--ink);border:1px solid var(--line2);border-radius:6px;font:inherit;font-size:12.5px;
  cursor:pointer;transition:background 100ms ease}
.btn:hover{background:#1a1b1d}.btn:disabled{opacity:.45;cursor:default}
.btn.go{border-color:rgba(94,106,210,.55)}
.sep{width:1px;height:18px;background:var(--line)}
.clock{font-variant-numeric:tabular-nums;min-width:38px;text-align:right;font-size:12.5px}
.unit{color:var(--faint);font-size:11px;margin-left:-3px}
#scrub{flex:1;height:3px;-webkit-appearance:none;background:var(--line2);border-radius:2px;cursor:pointer}
#scrub::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;
  background:var(--accent);border:2px solid var(--panel)}
select,label.f{color:var(--dim);font-size:12px;display:inline-flex;align-items:center;gap:6px}
select{height:28px;background:var(--raised);color:var(--ink);border:1px solid var(--line2);
  border-radius:6px;font:inherit;font-size:12.5px;padding:0 6px}
.status{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;padding:0 5px;
  background:var(--raised);border:1px solid var(--line2);border-radius:4px;font-size:10.5px;color:var(--faint)}
.grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));
  gap:12px;padding:14px;align-content:start}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;
  display:flex;flex-direction:column}
iframe{width:100%;height:280px;border:0;background:#0b0c0d;display:block}
.solo{grid-column:1/-1}.solo iframe{height:min(58vh,460px)}
figcaption{padding:10px 12px;border-top:1px solid var(--line);display:grid;gap:4px;font-size:12px}
figcaption b{font-weight:500}.note{color:var(--dim)}.verb{color:var(--faint);font-size:11px;line-height:1.5}
.row{display:flex;gap:6px;margin-top:4px}
.mini{height:24px;padding:0 9px;font-size:11.5px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:5px;cursor:pointer;font-family:inherit}
.mini:hover{color:var(--ink)}
.empty{padding:40px;color:var(--faint);text-align:center;grid-column:1/-1;line-height:1.8}
.drops{padding:0 14px 14px;color:var(--faint);font-size:11.5px;line-height:1.7}
</style></head><body>
<aside>
  <div class="head"><b>${path.basename(path.resolve(ROOT))}</b><span>${path.resolve(ROOT)}</span></div>
  <div class="files" id="files"></div>
</aside>
<main>
  <header>
    <button class="btn go" id="ask">Give it motion</button>
    <select id="count"><option>2</option><option selected>3</option><option>4</option><option>6</option></select>
    <span class="sep"></span>
    <button class="btn" id="play"><span id="glyph">❚❚</span><span id="word">Pause</span></button>
    <span class="clock" id="at">0.00</span><span class="unit">s</span>
    <input id="scrub" type="range" min="0" max="4200" value="0" step="10">
    <select id="palette" title="the palette the component is rendered in">
      ${PRESETS.map((p, i) => `<option${i === 1 ? ' selected' : ''}>${p.name}</option>`).join('')}
    </select>
    <label class="f"><input type="checkbox" id="cam"> Camera</label>
    <span class="sep"></span>
    <span class="status" id="driven">—</span>
    <span><kbd>Space</kbd><kbd>←</kbd><kbd>→</kbd></span>
  </header>
  <div class="grid" id="grid"><div class="empty">Pick a component on the left, then press <b>Give it motion</b>.</div></div>
  <div class="drops" id="drops"></div>
</main>
<script>
const grid=document.getElementById('grid'),drops=document.getElementById('drops')
const scrub=document.getElementById('scrub'),at=document.getElementById('at'),link=document.getElementById('driven')
const play=document.getElementById('play'),ask=document.getElementById('ask'),cam=document.getElementById('cam')
const palette=document.getElementById('palette')
let file=null, opts=[], running=true, t=0, last=performance.now(), held=new Map()

fetch('/api/list').then(r=>r.json()).then(fs=>{
  document.getElementById('files').innerHTML=fs.map(f=>
    '<button class="file" data-f="'+f+'">'+f.split('/').slice(-2).join('/')+'</button>').join('')
  document.querySelectorAll('.file').forEach(b=>b.onclick=()=>{
    file=b.dataset.f
    document.querySelectorAll('.file').forEach(x=>x.setAttribute('aria-current',x===b))
    opts=[]; held.clear(); drops.textContent=''; render()
  })
})

/** the component as it is, so the left rail is a thing you browse rather than a thing you submit */
function peek(){
  const q='?file='+encodeURIComponent(file)+'&palette='+encodeURIComponent(palette.value)+(cam.checked?'&camera=1':'')
  grid.innerHTML='<figure class="solo"><iframe data-i="0" src="/peek'+q+'"></iframe><figcaption>'
    +'<b>'+file.split('/').pop()+'</b><span class="verb">as written, nothing added yet. '
    +'Press <b>Give it motion</b> for options.</span></figcaption></figure>'
}

ask.onclick=async()=>{
  if(!file) return alert('Pick a component first.')
  ask.disabled=true; ask.textContent='Writing…'
  grid.innerHTML='<div class="empty">Asking for '+document.getElementById('count').value+' motions.<br>About thirty seconds.</div>'
  drops.textContent=''
  try{
    const r=await fetch('/api/motion',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({file,count:Number(document.getElementById('count').value)})}).then(r=>r.json())
    opts=r.kept; held.clear(); render()
    drops.textContent=(r.dropped.length? r.dropped.length+' dropped: '
      +r.dropped.map(d=>d.why.split('.')[0]).join('; ')+'. ' : '')+'Styled with '+r.styled+'.'
  }catch(e){ grid.innerHTML='<div class="empty">'+e+'</div>' }
  ask.disabled=false; ask.innerHTML='Give it motion'
}
cam.onchange=render
palette.onchange=render

function render(){
  if(!opts.length){ if(file) return peek()
    grid.innerHTML='<div class="empty">Pick a component on the left.</div>'; return }
  const q='?palette='+encodeURIComponent(palette.value)+(cam.checked?'&camera=1':'')
  grid.innerHTML=opts.map((o,i)=>
    '<figure><iframe data-i="'+i+'" src="/preview/'+o.id+q+'"></iframe>'+
    '<figcaption><b>'+(o.note||'untitled')+'</b>'+
    '<span class="verb">timing from '+o.verb+'</span>'+
    '<span class="note">'+o.scope+'</span>'+
    '<span class="row"><button class="mini" data-copy="'+o.id+'">Copy CSS</button>'+
    '<button class="mini" data-save="'+o.id+'">Save file</button></span></figcaption></figure>').join('')
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
    const o=opts.find(x=>x.id===b.dataset.copy)
    await navigator.clipboard.writeText('/* add '+o.scope+' to the root element */\\n'+o.css)
    b.textContent='Copied'; setTimeout(()=>b.textContent='Copy CSS',1200)
  })
  document.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{
    const r=await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({id:b.dataset.save})}).then(r=>r.json())
    b.textContent=r.at.split('/').pop(); setTimeout(()=>b.textContent='Save file',2200)
  })
}

addEventListener('message',e=>{const d=e.data||{}; if(d.wall==='held'){held.set(d.i,d.n); paint()}})
function paint(){
  const frames=document.querySelectorAll('iframe')
  if(!opts.length){link.textContent=file?'no motion yet':'—';link.style.color='var(--faint)';return}
  const live=[...held.values()].filter(n=>n>0).length
  link.textContent=live+'/'+frames.length+' driven'
  link.style.color=live===frames.length?'var(--dim)':'#d29d6b'
}
function hold(ms){
  document.querySelectorAll('iframe').forEach((f,i)=>{
    try{f.contentWindow.postMessage({wall:'hold',t:ms,i},'*')}catch(_){}
  })
  scrub.value=ms; at.textContent=(ms/1000).toFixed(2)
}
function face(){document.getElementById('glyph').textContent=running?'❚❚':'▶'
  document.getElementById('word').textContent=running?'Pause':'Play'}
requestAnimationFrame(function tick(now){const s=now-last;last=now
  if(running){t=(t+s)%4200;hold(t)} requestAnimationFrame(tick)})
play.onclick=()=>{running=!running;face()}
scrub.oninput=()=>{running=false;face();t=Number(scrub.value);hold(t)}
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'&&e.target.type==='range')return
  if(e.key===' '){e.preventDefault();play.click()}
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();running=false;face()
    t=Math.max(0,Math.min(4200,t+(e.key==='ArrowRight'?100:-100)));hold(t)}})
<\/script></body></html>`

const json = (res, v) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)) }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE()) }
    if (url.pathname === '/api/list') return json(res, list())
    if (url.pathname === '/tailwind.js') {
      const t = await getTailwind()
      if (!t.js) { res.writeHead(503); return res.end(`// ${t.why}`) }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'max-age=86400' })
      return res.end(t.js)
    }
    /**
     * The component as it stands, before anything has been asked of the model.
     *
     * Clicking a file should show it, not an empty panel with a button on it. This is also the only
     * honest way to find out whether the studio can read your component at all: a jsx reader that
     * loses the tree gives you a preview of nothing, and you want to know that before you spend
     * thirty seconds and four model calls animating it.
     */
    if (url.pathname === '/peek') {
      const want = path.resolve(url.searchParams.get('file') ?? '')
      const under = path.resolve(ROOT)
      if (!want.startsWith(under) || !KIND.test(want) || !existsSync(want)) {
        res.writeHead(403); return res.end('not a component under the folder this studio was opened on')
      }
      const read = markupOf(want)
      const base = rawSheet ? relevant(rawSheet, read.markup) : read.own
      const tw = wantsTailwind(read.markup, base) && !!(await getTailwind()).js
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(preview({ markup: read.markup, base, css: '', scope: '', tw },
        url.searchParams.has('camera'), url.searchParams.get('palette')))
    }
    if (url.pathname.startsWith('/preview/')) {
      const o = made.get(url.pathname.split('/')[2])
      if (!o) { res.writeHead(404); return res.end('gone') }
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(preview(o, url.searchParams.has('camera'), url.searchParams.get('palette')))
    }
    if (url.pathname === '/api/motion' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      console.log(`  ${path.basename(body.file)}: asking for ${body.count}`)
      const got = await options(body.file, Math.max(1, Math.min(6, body.count || 3)))
      console.log(`    ${got.kept.length} kept, ${got.dropped.length} dropped`)
      return json(res, got)
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const o = made.get(body.id)
      if (!o) { res.writeHead(404); return res.end('gone') }
      const name = path.basename(o.file).replace(/\.[^.]+$/, '')
      const at = path.resolve(work, `${name}.motion.css`)
      writeFileSync(at, `/* Motion for ${path.basename(o.file)}\n   ${o.note}\n   timing from ${o.verb}\n`
        + `   add ${o.scope} to the component's root element, then import this file. */\n\n${o.css}\n`)
      console.log(`    saved ${at}`)
      return json(res, { at })
    }
    res.writeHead(404); res.end('no')
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(e && e.message ? e.message : e).slice(0, 300) }))
  }
}).listen(PORT, () => {
  const files = list().length
  console.log(`\n  motion studio  http://localhost:${PORT}`)
  console.log(`  ${files} component${files === 1 ? '' : 's'} under ${path.resolve(ROOT)}`)
  console.log(rawSheet ? `  styled with ${SHEET}\n`
    : '  no --css given: utility classes are compiled here and coloured from a Wall palette\n')
  if (!process.env.WALL_NO_OPEN) {
    const [cmd, a] = process.platform === 'darwin' ? ['open', [`http://localhost:${PORT}`]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', `http://localhost:${PORT}`]]
        : ['xdg-open', [`http://localhost:${PORT}`]]
    spawn(cmd, a, { stdio: 'ignore', detached: true }).unref()
  }
})
