/**
 * The studio: point it at components you already have and play with their motion.
 *
 *   npm run studio                                  the components in examples/
 *   npm run studio -- ~/app/src/ui --css ~/app/src/globals.css
 *   npm run studio -- --app http://localhost:3000   your dev server, elements picked by hand
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
import net from 'node:net'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { hasClaude, runClaude } from '../shared/cli.mjs'
import { listenNear, movedFrom } from '../shared/port.mjs'
import {
  MOTION_SYSTEM, dealMotions, grabJson, safeStyle, unmoved, brittle, janky, scopeOf,
  PRESETS, themeOf, themeCss,
} from '../dist-core/core.js'

const args = process.argv.slice(2)
const appAt = args.indexOf('--app')
const TARGET = appAt > -1 ? String(args[appAt + 1] ?? '').replace(/\/$/, '') : null
/**
 * An origin and a page, kept apart.
 *
 * `--app http://localhost:3000` and `--app https://host/projects/abc/preview` are both reasonable
 * things to type, and they need different handling. The page to open is the whole url, but the assets
 * underneath it are root relative to the origin: a bundle at /assets/app.js belongs to the host, not
 * to the folder the page happens to sit in. Appending every request to the full url turns that into
 * /projects/abc/preview/assets/app.js, which is a 404 and a blank frame.
 */
const HOST = TARGET ? new URL(TARGET).origin : null
const ENTRY = TARGET ? (new URL(TARGET).pathname + new URL(TARGET).search) : '/'
const cssAt = args.indexOf('--css')
const SHEET = cssAt > -1 ? args[cssAt + 1] : null
// with no folder given it opens on the components in this repo, so `npm run studio` is a thing you
// can run on a clean checkout and immediately have something to animate
const ROOT = args.find((a, i) => !a.startsWith('--')
  && !(cssAt > -1 && i === cssAt + 1) && !(appAt > -1 && i === appAt + 1)) ?? 'examples/components'
const PORT = Number(process.env.WALL_PORT || 4321)
const KIND = /\.(tsx|jsx|vue|svelte|astro|html|htm)$/i
/**
 * Whether there is anything here that can write.
 *
 * Every option in this studio comes from a model call, and the call goes through the claude command.
 * Without it on PATH every attempt returns nothing, all of them are dropped, and the grid quietly goes
 * back to showing the component exactly as it was before the button was pressed. That reads as "the
 * button does nothing" after forty seconds of waiting, when the real answer is one sentence long and
 * could have been said before any waiting happened.
 */
const CAN_WRITE = hasClaude()

const work = '.studio'
mkdirSync(work, { recursive: true })

if (!TARGET && !existsSync(ROOT)) { console.log(`\n  no such folder: ${ROOT}\n`); process.exit(1) }

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
// no `@import "tailwindcss"` here: the browser build injects it, and asking for it by name makes the
// page fetch a file called tailwindcss next to itself, which fails. Measured identical either way, and
// the exported file is supposed to make no requests at all
const themeMap = `@theme inline {\n`
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
var a=document.getAnimations(),end=0;
a.forEach(function(x){try{x.pause();x.currentTime=d.t;
  var t=x.effect&&x.effect.getComputedTiming?x.effect.getComputedTiming().endTime:0;
  if(typeof t==='number'&&isFinite(t)&&t>end)end=t}catch(_){}});
(e.source||parent).postMessage({wall:'held',n:a.length,i:d.i,end:Math.round(end)},'*');});<\/script>`

const preview = (o, camera, palette) => {
  const scoped = o.scope ? o.markup.replace(/<(\w+)/, `<$1 ${o.scope}`) : o.markup
  // Tailwind's compiler and the motion sheet both go in head, but the motion sheet is written last so
  // that a keyframe never loses to a utility that happens to set the same property
  const tw = o.tw ? `<script src="/__wall/tailwind.js"></script>
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
    #fit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center center;
      width:${o.wide ? o.wide + 'px' : 'max-content'}}`
  const head = `<meta charset="utf-8">${tw}${vars}<style>${o.base}\n${chrome}\n${o.css}</style>`
  /**
   * A dashboard component is eight hundred pixels wide and the card it is being compared in is three
   * hundred. Left alone you see the first tier of a pricing table and a sliver of the second, which is
   * no basis for choosing between four motions. Scaling the whole thing down to fit is the only honest
   * way to show it: a transform does not touch layout, so the component still believes it has its full
   * width and the motion plays at the timing it was written for, just smaller.
   */
  /**
   * An element picked out of a running app is often positioned: a dialog is fixed, a card in a grid is
   * absolute, a panel is pinned to an edge. Positioned children give their parent no size, so the
   * wrapper measures zero, there is nothing to scale, and the preview is an empty rectangle. Standing
   * it back down into normal flow is what previewing something out of its page means, and it is done
   * on the element rather than in the sheet so that nothing needs !important and the motion's own
   * transforms are left alone.
   */
  const FIT = `<script>(function(){var el=document.getElementById('fit');if(!el)return;
    var kid=el.firstElementChild;
    if(kid){var cs=getComputedStyle(kid);
      if(cs.position==='fixed'||cs.position==='absolute'||cs.position==='sticky'){
        kid.style.position='relative';kid.style.top='auto';kid.style.left='auto';
        kid.style.right='auto';kid.style.bottom='auto'}
      if(cs.width==='0px'||parseFloat(cs.height)<2)kid.style.display='inline-block'}
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

/* ── pointing at a running app instead of at files ─────────────────────────────────────────────── *
 *
 * Reading a component out of a .tsx is guesswork. markupOf strips braces with a brace counter, finds
 * the outermost tag by counting tags, and hopes there is one `return (`. It survives the components in
 * this repo because they were written to survive it; a real one with props, a map, and a conditional
 * class comes out as something the model then writes motion against. Every wrong thing downstream
 * starts there.
 *
 * A running app has no such problem, because the DOM is the answer. Point the studio at a dev server
 * and it can hand the model the rendered subtree and the rules that actually matched it, after the
 * framework, after Tailwind, after every conditional resolved. That is not an approximation of the
 * component, it is the component, and it works the same for React, Svelte, Rails or anything else
 * that ends up as elements.
 *
 * The only difficulty is the browser's, not ours: an iframe on another port is another origin and its
 * DOM is closed to us. So the app is served through this server rather than linked to. Everything the
 * studio does not own is forwarded, which means a root-relative asset like /src/main.tsx or
 * /@vite/client resolves here and gets passed along with no url rewriting at all, and the app believes
 * it is being served from its own root. Studio routes all sit under /__wall so an app with its own
 * /api can never collide with ours.
 */
const OURS = /^\/(__wall\/|$)/

const hop = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailer'])

async function proxy(req, res, url) {
  const to = HOST + url.pathname + url.search
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (hop.has(k) || k === 'host' || k === 'accept-encoding') continue
    headers[k] = v
  }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined
    : await new Promise((ok) => { const b = []; req.on('data', (d) => b.push(d)); req.on('end', () => ok(Buffer.concat(b))) })
  let r
  try { r = await fetch(to, { method: req.method, headers, body, redirect: 'manual' }) } catch (e) {
    res.writeHead(502, { 'content-type': 'text/html' })
    return res.end(`<body style="font:14px ui-monospace;color:#8a8f98;background:#0f1011;padding:24px">`
      + `Cannot reach ${TARGET}. Is the dev server running?<br><br>${String(e.message || e)}</body>`)
  }
  const out = {}
  r.headers.forEach((v, k) => {
    // fetch has already decompressed, so the original encoding and length would both be lies
    if (hop.has(k) || k === 'content-encoding' || k === 'content-length') return
    if (k === 'content-security-policy' || k === 'x-frame-options') return  // we are the frame
    // a Location back to the target's own origin has to stay inside the proxy, or the browser
    // navigates to the real site and the frame is cross origin again with nothing to say why
    if (k === 'location' && v.startsWith(HOST)) { out[k] = v.slice(HOST.length) || '/'; return }
    out[k] = v
  })
  const type = r.headers.get('content-type') ?? ''
  if (!/text\/html/i.test(type)) {
    res.writeHead(r.status, out)
    return res.end(Buffer.from(await r.arrayBuffer()))
  }
  let html = await r.text()
  const at = html.search(/<\/body>/i)
  html = at === -1 ? html + PICKER : html.slice(0, at) + PICKER + html.slice(at)
  res.writeHead(r.status, { ...out, 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
}

/**
 * The picker, injected into the app's own page.
 *
 * Hovering outlines what is under the cursor and clicking sends it up. What goes up is the rendered
 * subtree and the rules that matched it, gathered by walking the live stylesheets and asking each rule
 * whether it applies here. That is the real cascade rather than a guess at which file was relevant,
 * which is the entire reason for doing this against a running app.
 *
 * Clicks are taken on the capture phase and stopped, so picking a button does not also press it.
 */
const PICKER = `<script>(function(){
var on=false,box=null,last=null;
function ensure(){if(box)return box;box=document.createElement('div');
  box.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #5e6ad2;'+
  'background:rgba(94,106,210,.13);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.4)';
  document.documentElement.appendChild(box);return box}
function move(e){if(!on)return;var el=e.target;if(!el||el===document.body||el===document.documentElement)return;
  last=el;var r=el.getBoundingClientRect(),b=ensure();b.style.display='block';
  b.style.left=r.left+'px';b.style.top=r.top+'px';b.style.width=r.width+'px';b.style.height=r.height+'px'}
function hits(el,sel){try{return el.matches(sel)||!!el.querySelector(sel)}catch(_){return false}}
function ground(t){return t===':root'||t==='html'||t==='body'||t==='*'||t===':host'}
/* Walking into the grouping rules, which is where nearly all of the css now lives.
   Tailwind v4 puts its entire utility set inside @layer, and a @layer block has cssRules but no
   conditionText, so a walk that only knows about media queries steps straight over it. On a real
   shadcn site that is four and a half thousand rules skipped against a hundred and forty seen, which
   reads as "this element has almost no styling" and is completely wrong. Layers are flattened, since
   a preview has nothing to order against; media and supports keep their wrapper because dropping it
   would apply a narrow-screen rule unconditionally. */
function collect(rs,el,roots,out,keys,cond){
  for(var j=0;j<rs.length;j++){var r=rs[j];
    if(r.selectorText){
      var t=r.selectorText.trim();
      var text=cond?cond+'{'+r.cssText+'}':r.cssText;
      if(ground(t))roots.push(text); else if(hits(el,t))out.push(text)}
    else if(r.cssRules){
      var head=r.cssText.slice(0,r.cssText.indexOf('{')).trim();
      if(head.indexOf('@keyframes')===0){keys.push(r.cssText);continue}
      collect(r.cssRules,el,roots,out,keys,head.indexOf('@layer')===0?cond:(head||cond))}
    else if(r.cssText&&r.cssText.indexOf('@font-face')===0)roots.push(r.cssText)}}
/* Only the custom properties the captured rules actually reach for.
   An app of this era declares hundreds on :root, and shipping all of them ate the whole budget and
   left no room for the rules that lay the component out. Two passes: gather the rules, then keep the
   variables they name, following one level of indirection because a token usually points at a token. */
function needed(css,el){
  var cs=getComputedStyle(el),want={},out=[],pass;
  for(pass=0;pass<2;pass++){
    var from=pass===0?css:out.join(';'),at=0;
    while(true){at=from.indexOf('var(--',at);if(at<0)break;
      var stop=at+4,ch;
      while(stop<from.length){ch=from.charAt(stop);
        if(ch===')'||ch===','||ch===' ')break;stop++}
      var name=from.slice(at+4,stop);
      if(name&&!want[name]){want[name]=1;
        var v=cs.getPropertyValue(name);if(v&&v.length<300)out.push(name+':'+v)}
      at=stop}}
  return out.length?':root{'+out.join(';')+'}':''}
/* Filling a budget with whole rules, never half of one.
   Slicing a stylesheet at a character count lands in the middle of a declaration, and the browser
   responds by discarding everything from there to the end of the sheet. In the studio that meant the
   motion's own @keyframes, appended after the captured css, silently never existed and every option
   rendered still. The other half of the problem is what fills the budget: a preflight reset matching
   the universal selector is one rule several thousand characters long, so two of those crowd out the
   hundred utility rules that are the reason for doing any of this. Oversized rules are left behind. */
function pack(list,cap){
  var out=[],n=0;
  for(var i=0;i<list.length;i++){var r=list[i];
    if(r.length>2200)continue;
    if(n+r.length>cap)break;
    out.push(r);n+=r.length}
  return out.join('')}
var opaque=0;
function rules(el){
  var roots=[],out=[],keys=[];opaque=0;
  for(var i=0;i<document.styleSheets.length;i++){var rs;
    /* a sheet served from another origin without cors cannot be read at all. Skipping it quietly
       would hand over a component with a third of its styling missing and no way to tell */
    try{rs=document.styleSheets[i].cssRules}catch(_){opaque++;continue}
    collect(rs,el,roots,out,keys,'')}
  var body=pack(out,13000);
  var base=pack(roots,1500);
  /* keyframes only matter here if something kept actually names them */
  var used=pack(keys.filter(function(k){var n=k.slice(10,k.indexOf('{')).trim();
    return n&&body.indexOf(n)>-1}),2000);
  return needed(body+base,el)+context(el)+base+used+body}
function label(el){var c=typeof el.className==='string'?el.className.trim().split(/\\s+/).filter(Boolean):[];
  return el.tagName.toLowerCase()+(c.length?'.'+c.slice(0,3).join('.'):'')}
/* and the ground it was standing on, so it is previewed against its own background and not ours */
function context(el){var n=el.parentElement,bg='';
  while(n&&!bg){var c=getComputedStyle(n).backgroundColor;
    if(c&&c!=='transparent'&&c.indexOf('rgba(0, 0, 0, 0)')!==0)bg=c;n=n.parentElement}
  var cs=getComputedStyle(el);
  return 'body{background:'+(bg||'#0b0c0d')+';color:'+cs.color+';font-family:'+cs.fontFamily+'}'}
/* Cutting the markup at a character count cuts it in the middle of a tag.
   The tail of the last pick was the string "</span></span><input", which the browser's parser then
   recovers from by inventing whatever it likes, so the model is handed a component missing a third of
   itself and a selector written against the missing part matches nothing. Dropping whole elements off
   the end instead always leaves valid html, and what goes is the bottom of the component rather than
   an arbitrary byte. */
function trimmed(el,cap){
  if(el.outerHTML.length<=cap)return el.outerHTML;
  var c=el.cloneNode(true),guard=0;
  while(c.outerHTML.length>cap&&guard++<400){
    var all=c.querySelectorAll('*');if(all.length<2)break;
    var drop=Math.max(1,Math.floor(all.length*0.08));
    for(var i=0;i<drop;i++){var n=c.querySelectorAll('*');if(n.length<2)break;n[n.length-1].remove()}}
  return c.outerHTML}
function pick(e){if(!on)return;e.preventDefault();e.stopPropagation();
  var el=last||e.target;on=false;if(box)box.style.display='none';
  var r=el.getBoundingClientRect(),h=trimmed(el,14000);
  var css=rules(el);
  /* Stagger is the whole difference between motion somebody notices and motion somebody ignores, and
     stagger needs sibling parts to move at different times. A 1140 by 44 strip has none, so every
     option written for it comes back a variation on "slide in". Worth saying at the moment of the
     pick rather than sixty seconds later when five weak options are already on screen. */
  var kids=el.children.length, thin=r.height<60||r.width<60;
  var weak = thin ? 'a strip this thin has no room for parts to arrive separately'
    : kids<3 ? 'this has fewer than three children, so there is little to stagger' : '';
  parent.postMessage({wall:'picked',html:h,css:css,label:label(el),opaque:opaque,weak:weak,
    cut:h.length<el.outerHTML.length,w:Math.round(r.width),h:Math.round(r.height)},'*')}
addEventListener('mousemove',move,true);addEventListener('click',pick,true);
addEventListener('message',function(e){var d=e.data||{};
  if(d.wall==='pick'){on=true}
  if(d.wall==='nopick'){on=false;if(box)box.style.display='none'}});
parent.postMessage({wall:'ready'},'*');
})();<\/script>`

/* ── asking for motion, with every gate the other tools use ───────────────────────────────────── */

/**
 * One place where a model call is made, judged, and if it is worth it, made again.
 *
 * Three things were wrong with doing this inline at each call site. runClaude resolves with
 * {error} rather than throwing, so reading reply.text and finding it undefined threw the reason
 * away: "the claude command was not found on this machine" arrived and was reported as the
 * uninformative "no usable reply came back". Every failure was retried identically, including the
 * ones no amount of retrying will fix and the ones that need a pause first. And the retry was
 * immediate, which for a rate limit is the one thing guaranteed not to work.
 *
 * The ceiling is tighter here than the four minutes a whole page is allowed. Somebody is watching a
 * button, and silence past a minute or so is indistinguishable from a broken one.
 */
const TERMINAL = /not found on this machine|not authenticated|no such file|invalid api key|unauthorized/i
const BUSY = /rate limit|overloaded|429|503|too many requests|temporarily/i

const CALL_MS = Number(process.env.WALL_STUDIO_CALL_MS || 150_000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * These calls do not think, and that is a measurement rather than a preference.
 *
 * Writing a motion sheet is a narrow job with a fixed answer shape, which is the kind of work
 * extended thinking helps least. Measured on one picked chart, four calls each way at once:
 *
 *   thinking on    slowest 73.9s, median 72.0s, 2 of 4 passed the gates
 *   thinking off   slowest  9.2s, median  8.3s, 4 of 4 passed the gates
 *
 * Eight times faster and, on this payload, better: both failures were unmoved reporting that
 * everything moved at once, which is the fault a longer deliberation is supposed to prevent. The cost
 * compounds, because a gated attempt is asked again with a fresh verb, so a batch where anything
 * fails was paying that minute twice. WALL_STUDIO_THINKING turns it back on for anyone who wants to
 * measure it again on their own components rather than take this on faith.
 */
const THINK = process.env.WALL_STUDIO_THINKING ? Number(process.env.WALL_STUDIO_THINKING) : 0

async function askModel(brief, tries = 3) {
  let last = 'no usable reply came back'
  for (let n = 0; n < tries; n++) {
    const reply = await runClaude(MOTION_SYSTEM, brief, {
      callMs: CALL_MS, thinking: THINK,
    }).catch((e) => ({ error: String(e && e.message ? e.message : e).slice(0, 160) }))

    if (reply && reply.error) {
      last = reply.error
      if (TERMINAL.test(last)) return { why: last, terminal: true }
      // a busy upstream needs a pause, not another immediate identical request
      if (n < tries - 1) await sleep(BUSY.test(last) ? 1500 * (n + 1) : 400)
      continue
    }
    const raw = grabJson(typeof reply === 'string' ? reply : (reply && reply.text) || '')
    if (raw) return { raw }
    last = 'the reply was not the json this asks for'
    if (n < tries - 1) await sleep(300)
  }
  return { why: last }
}

/** the gates, in one place, so refine and options cannot drift apart on what they accept */
function judge(raw, fallbackScope) {
  const css = safeStyle(raw.css)
  if (!css) return { why: 'the reply carried no css that is allowed in a sheet' }
  const faults = [...unmoved({ html: '', css, note: '' }), ...brittle(css), ...janky(css)]
  if (faults.length) return { why: faults[0] }
  return { css, scope: scopeOf(css, raw.scope ?? fallbackScope), note: String(raw.note ?? '').slice(0, 90) }
}

/**
 * Nothing one attempt does may cost the others.
 *
 * These run together, and Promise.all rejects the whole batch the moment any single one throws. A
 * malformed reply that trips safeStyle would therefore lose three good options alongside the bad
 * one, and the caller would see a 500 rather than the three that worked.
 */
const settle = async (jobs) => (await Promise.allSettled(jobs)).map((r) =>
  (r.status === 'fulfilled' ? r.value
    : { why: `attempt failed: ${String(r.reason).slice(0, 120)}`, kind: 'model' }))

const made = new Map()   // id -> { file, markup, base, css, scope, note, verb }
let nextId = 0

/**
 * Options are remembered so a preview can be re-rendered and an export can gather them, which means
 * this map only ever grows. A long session on a folder of components, asking four at a time and
 * refining the good ones, puts markup and css in here a few hundred times over, and nothing ever
 * takes any of it out. The oldest are dropped once there are more than a session could plausibly be
 * looking at; a preview for one of those answers honestly that it is gone.
 */
const KEEP = 240
const keep = (id, option) => {
  made.set(id, option)
  while (made.size > KEEP) made.delete(made.keys().next().value)
}

/**
 * Variations on one that nearly worked.
 *
 * The deck deals a different verb to every option so they disagree, which is the right way to start
 * and the wrong way to finish. Once one of them is close, what you want is not four more unrelated
 * ideas, it is that one with the stagger opened up, or landing harder, or half the speed. Generating a
 * fresh batch throws away the thing you liked and rolls the dice again.
 *
 * So the motion that works is handed back as the brief, with an instruction to keep its idea and
 * change how it is carried out. The gates are the same ones: a variation that stops moving its parts,
 * or that pins itself to utility classes, is dropped exactly like a first attempt.
 */
const TURNS = [
  'the same idea, but the parts should arrive further apart, so the order is unmistakable',
  'the same idea at about half the speed, with the weight at the end of each move rather than the start',
  'the same idea, but one element should lead and the rest follow it rather than all being equal',
  'the same idea, tightened to about two thirds the duration, with nothing overlapping',
]

async function refine(base, count) {
  const brief = `This motion works and is being kept. Here is its sheet:\n\n${base.css}\n\n`
    + `It was described as: ${base.note}\n\nThe markup it moves:\n${base.markup.slice(0, 5000)}\n\n`
  const turns = TURNS.slice(0, count)
  const tried = await settle(turns.map(async (turn) => {
    const ask = brief + `Rewrite it as ${turn} Keep the same scope attribute, ${base.scope || 'the one it already uses'}, `
      + 'and keep it recognisably the same motion rather than a new one.'
    const got = await askModel(ask)
    if (!got.raw) return { verb: turn, why: got.why, kind: 'model', terminal: got.terminal }
    const ok = judge(got.raw, base.scope)
    if (!ok.css) return { verb: turn, why: ok.why, kind: 'gate' }
    const id = String(nextId++)
    keep(id, { ...base, id, css: ok.css, scope: ok.scope, note: ok.note, verb: turn })
    return { id, verb: turn, scope: ok.scope, note: ok.note, css: ok.css }
  }))
  return { kept: tried.filter((t) => t.id), dropped: tried.filter((t) => !t.id), styled: 'the same as before' }
}

async function options(src, count) {
  // a picked element arrives already rendered and already carrying the rules that matched it, so
  // there is nothing to parse and nothing to guess
  const picked = !!src.html
  const markup = picked ? src.html : markupOf(src.file).markup
  const source = picked ? src.html : markupOf(src.file).source
  const base = picked ? src.css : (rawSheet ? relevant(rawSheet, markup) : markupOf(src.file).own)
  const name = picked ? src.label : path.basename(src.file)
  const wide = picked ? src.w : 0
  const tw = !picked && wantsTailwind(markup, base) && !!(await getTailwind()).js
  const about = (picked
    ? `This element was picked out of a running app. It is the rendered dom, so it is exactly what a
user sees, and the css below is the rules that actually matched it.\n\n${source.slice(0, 6000)}\n\n`
    : `The component, as written in ${name}:\n${source.slice(0, 6000)}\n\n`)
    + (base ? `Its stylesheet:\n${base.slice(0, 3000)}\n\n` : '')

  const attempt = async (verb, told) => {
    const brief = about + `Move it by ${verb} Take the timing from that object: it is how the thing behaves.`
      + (told ? `\n\nA previous attempt at this was rejected because ${told} Do not repeat that.` : '')
    const got = await askModel(brief)
    if (!got.raw) return { verb, why: got.why, kind: 'model', terminal: got.terminal }
    const ok = judge(got.raw)
    if (!ok.css) return { verb, why: ok.why, kind: 'gate' }
    const id = String(nextId++)
    keep(id, { file: name, markup, base, css: ok.css, scope: ok.scope, tw, wide, note: ok.note, verb })
    return { id, verb, scope: ok.scope, note: ok.note, css: ok.css }
  }

  const first = await settle(dealMotions(count).map((verb) => attempt(verb)))
  /**
   * One more go at the slots a gate turned down, and this time it is told why.
   *
   * Asking for four and being handed one is a bad trade for thirty seconds of waiting, and the
   * rejections are not mysterious: almost all of them are unmoved saying everything moved at once. That
   * is a specific, fixable complaint, so it goes back with a fresh verb rather than being counted as a
   * loss. Only one extra round, because a motion that fails twice is telling you the component has
   * nothing in it that wants to move separately.
   */
  const missed = first.filter((t) => !t.id)
  // a terminal fault is the same answer however many times it is asked, so it is not asked again
  const worth = missed.filter((m) => !m.terminal && m.kind !== 'model')
  const again = worth.length
    ? await settle(dealMotions(worth.length).map((verb, i) => attempt(verb, worth[i].why)))
    : []
  // the ones deliberately not asked again are still failures, and leaving them out of the tally
  // reported nothing dropped at all, which sent the page to the wrong explanation
  const settled = missed.filter((m) => !worth.includes(m))
  const tried = first.filter((t) => t.id).concat(again).concat(settled)
  if (worth.length) console.log(`    retried ${worth.length}, recovered ${again.filter((t) => t.id).length}`)
  const styled = picked ? 'the rules that matched it in your app'
    : tw ? 'tailwind and a Wall palette'
      : base ? `${SHEET ? path.basename(SHEET) : 'its own <style>'}`
        : (await getTailwind()).why ? `nothing: ${(await getTailwind()).why}` : 'nothing, and it needs nothing'
  return { kept: tried.filter((t) => t.id), dropped: tried.filter((t) => !t.id), styled }
}

/**
 * One file, every option, no requests.
 *
 * Playing with motion in a studio is only half of it; the other half is showing somebody. A link to
 * localhost is not showing somebody, and a screenshot cannot carry motion, so the artifact is a single
 * html file that opens anywhere with the transport built in. That is Wall's existing promise about
 * shipped pages applied to motion, and it is the thing you attach to a pull request.
 *
 * The options share one document rather than sitting in iframes, which is what makes it one file. They
 * can only do that because each sheet is already scoped to an attribute, so giving option two the
 * attribute data-motion-fold-2 and rewriting its selectors to match keeps four sheets from colliding
 * in the same page. The transport then drives document.getAnimations() directly, with no postMessage
 * at all, because there is nothing to talk to.
 */
const exportable = async (ids, palette) => {
  const picked = ids.map((id) => made.get(id)).filter(Boolean)
  if (!picked.length) return null
  const tw = picked.some((o) => o.tw) ? (await getTailwind()).js : null
  const parts = picked.map((o, i) => {
    // one sheet per option in one document, so each is renamed apart from the others
    const tag = o.scope ? `${o.scope}-${i + 1}` : ''
    const css = o.scope ? o.css.replaceAll(`[${o.scope}]`, `[${tag}]`) : o.css
    const markup = tag ? o.markup.replace(/<(\w+)/, `<$1 ${tag}`) : o.markup
    return { ...o, css, markup, tag }
  })
  const width = picked[0].wide ? `${picked[0].wide}px` : 'max-content'
  return `<!doctype html><html class="dark"><head><meta charset="utf-8">
<title>${picked[0].file} motion</title>
${tw ? `<script>${tw}</script><style type="text/tailwindcss">${themeMap}</style>` : ''}
<style>${picked.some((o) => o.tw) ? themeFor(palette) : ''}
${parts[0].base}
${parts.map((p) => p.css).join('\n')}
:root{--bg:#08090a;--panel:#0f1011;--raised:#141516;--line:rgba(255,255,255,.07);
  --line2:rgba(255,255,255,.11);--ink:#e6e6e6;--dim:#8a8f98;--faint:#5c6068;--accent:#5e6ad2}
body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 ui-sans-serif,-apple-system,sans-serif}
header{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:12px;height:48px;padding:0 16px;
  border-bottom:1px solid var(--line);background:var(--panel)}
button{height:28px;padding:0 11px;background:var(--raised);color:var(--ink);border:1px solid var(--line2);
  border-radius:6px;font:inherit;font-size:12.5px;cursor:pointer}
#scrub{flex:1;height:3px;-webkit-appearance:none;background:var(--line2);border-radius:2px}
#scrub::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;
  background:var(--accent);border:2px solid var(--panel)}
.clock{font-variant-numeric:tabular-nums;min-width:76px;color:var(--dim);font-size:12.5px}
.wrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;padding:16px}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.stage{height:300px;display:grid;place-items:center;overflow:hidden;position:relative}
.inner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${width}}
figcaption{padding:11px 13px;border-top:1px solid var(--line);font-size:12px}
figcaption b{display:block;font-weight:500;margin-bottom:3px}
figcaption span{color:var(--faint);font-size:11px}
</style></head><body>
<header><button id="play">Pause</button><span class="clock" id="at">0.00 s</span>
  <input id="scrub" type="range" min="0" max="4000" value="0" step="10">
  <span class="clock" style="min-width:auto">${picked[0].file}</span></header>
<div class="wrap">${parts.map((p) => `<figure><div class="stage"><div class="inner">${p.markup}</div></div>
  <figcaption><b>${p.note || 'untitled'}</b><span>timing from ${p.verb}</span></figcaption></figure>`).join('')}
</div>
<script>
var running=true,t=0,last=performance.now(),span=4000
var at=document.getElementById('at'),scrub=document.getElementById('scrub'),play=document.getElementById('play')
for (var el of document.querySelectorAll('.inner')){
  var r=el.getBoundingClientRect(), box=el.parentElement.getBoundingClientRect()
  var s=Math.min(1,(box.width-24)/r.width,(box.height-24)/r.height)
  el.style.transform='translate(-50%,-50%) scale('+s.toFixed(4)+')'
}
function hold(ms){var end=0
  for (var a of document.getAnimations()){try{a.pause();a.currentTime=ms
    var e=a.effect&&a.effect.getComputedTiming?a.effect.getComputedTiming().endTime:0
    if(typeof e==='number'&&isFinite(e)&&e>end)end=e}catch(_){}}
  if(end>0){var want=Math.max(1200,Math.min(20000,Math.round(end)+300))
    if(Math.abs(want-span)>60){span=want;scrub.max=span}}
  scrub.value=ms;at.textContent=(ms/1000).toFixed(2)+' / '+(span/1000).toFixed(1)+' s'}
requestAnimationFrame(function tick(now){var d=now-last;last=now
  if(running){t=(t+d)%span;hold(t)} requestAnimationFrame(tick)})
play.onclick=function(){running=!running;play.textContent=running?'Pause':'Play'}
scrub.oninput=function(){running=false;play.textContent='Play';t=Number(scrub.value);hold(t)}
addEventListener('keydown',function(e){if(e.key===' '){e.preventDefault();play.click()}})
<\/script></body></html>`
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
.unit{color:var(--faint);font-size:11px;margin-left:1px}.unit b{font-weight:400}
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
.mini.keep{border-color:rgba(94,106,210,.5);color:var(--ink)}
.empty{padding:40px;color:var(--faint);text-align:center;grid-column:1/-1;line-height:1.8}
.hint{margin:4px 10px;font-size:12px;color:var(--faint);line-height:1.7}
.hint b{color:var(--dim);font-weight:500}
.appwrap{grid-column:1/-1;height:calc(100vh - 116px);border:1px solid var(--line);border-radius:8px;
  overflow:hidden;background:#fff}
.appwrap iframe{width:100%;height:100%}
#pick[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.chip{display:block;margin:10px;padding:8px 10px;background:var(--raised);border:1px solid var(--line2);
  border-radius:6px;font-size:11.5px;color:var(--ink);word-break:break-all}
.chip span{color:var(--faint)}
.drops{padding:0 14px 14px;color:var(--faint);font-size:11.5px;line-height:1.7}
</style></head><body>
<aside>
  <div class="head"><b>${TARGET ? 'your app' : path.basename(path.resolve(ROOT))}</b>
    <span>${TARGET ?? path.resolve(ROOT)}</span></div>
  ${TARGET ? `<div class="files"><p class="hint">Press <b>Pick element</b>, then click anything in your
    app. The studio reads the rendered element and the rules that actually matched it, so there is
    nothing to parse and nothing to guess.</p><div id="chosen"></div></div>`
    : '<div class="files" id="files"></div>'}
</aside>
<main>
  <header>
    ${TARGET ? '<button class="btn" id="pick">Pick element</button>' : ''}
    <button class="btn go" id="ask">Give it motion</button>
    <select id="count"><option>3</option><option>4</option><option selected>5</option><option>6</option></select>
    <span class="sep"></span>
    <button class="btn" id="play"><span id="glyph">❚❚</span><span id="word">Pause</span></button>
    <span class="clock" id="at">0.00</span><span class="unit">/ <b id="span">4.2s</b></span>
    <input id="scrub" type="range" min="0" max="4200" value="0" step="10">
    <select id="rate" title="playback speed"><option>0.25x</option><option>0.5x</option>
      <option selected>1x</option><option>2x</option></select>
    <select id="palette" title="the palette the component is rendered in">
      ${PRESETS.map((p, i) => `<option${i === 1 ? ' selected' : ''}>${p.name}</option>`).join('')}
    </select>
    <label class="f"><input type="checkbox" id="cam"> Camera</label>
    <button class="btn" id="save">Export</button>
    <span class="sep"></span>
    <span class="status" id="driven">—</span>
    <span><kbd>Space</kbd><kbd>←</kbd><kbd>→</kbd></span>
  </header>
  <div class="grid" id="grid"><div class="empty">${CAN_WRITE
    ? 'Pick a component on the left, then press <b>Give it motion</b>.'
    : 'No <b>claude</b> command on PATH, so nothing can be written here.<br>'
      + 'Start the studio from a shell where <b>claude</b> runs.'}</div></div>
  <div class="drops" id="drops"></div>
</main>
<script>
const grid=document.getElementById('grid'),drops=document.getElementById('drops')
const scrub=document.getElementById('scrub'),at=document.getElementById('at'),link=document.getElementById('driven')
const play=document.getElementById('play'),ask=document.getElementById('ask'),cam=document.getElementById('cam')
const palette=document.getElementById('palette')
let file=null, opts=[], running=true, t=0, last=performance.now(), held=new Map()
let ends=new Map(), span=4200, rate=1
const APP=${TARGET ? 'true' : 'false'}, CAN_WRITE=${CAN_WRITE ? 'true' : 'false'}
let chosen=null   // {html,css,label} picked out of the running app
let verdict=null  // why the last ask produced nothing, so the grid can say so

if(APP){
  render()
  const pickBtn=document.getElementById('pick')
  pickBtn.onclick=()=>{
    const want=pickBtn.getAttribute('aria-pressed')!=='true'
    pickBtn.setAttribute('aria-pressed',want)
    const f=document.querySelector('.appwrap iframe')
    if(f) f.contentWindow.postMessage({wall:want?'pick':'nopick'},'*')
  }
}
fetch('/__wall/list').then(r=>r.json()).then(fs=>{
  document.getElementById('files').innerHTML=fs.map(f=>
    '<button class="file" data-f="'+f+'">'+f.split('/').slice(-2).join('/')+'</button>').join('')
  document.querySelectorAll('.file').forEach(b=>b.onclick=()=>{
    file=b.dataset.f
    document.querySelectorAll('.file').forEach(x=>x.setAttribute('aria-current',x===b))
    opts=[]; verdict=null; held.clear(); drops.textContent=''; render()
  })
})

/**
 * Why nothing came back.
 *
 * Falling back to the untouched preview is the worst thing this could do, because it looks exactly
 * like the state before the button was pressed. The two reasons are entirely different problems: a
 * model that never answered is usually the claude command missing, which no amount of trying again
 * will fix, while a gate rejecting every attempt is about this particular component and is worth
 * another go with a different verb.
 */
function explain(){
  const d=verdict.dropped||[]
  const silent=d.length&&d.every(x=>x.kind==='model')
  let body
  if(verdict.error) body='<b>The studio errored.</b><br>'+verdict.error
  else if(!CAN_WRITE||silent) body='<b>The model did not answer.</b><br>'
    +(CAN_WRITE
      ? 'Each attempt was made three times with a pause between, and every one came back with:<br><br>'
        +d.slice(0,3).map(x=>'&middot; '+x.why).join('<br>')
        +'<br><br>That is upstream rather than about this component. Worth pressing again in a moment.'
      : 'There is no claude command on PATH, so there is nothing for the button to call. '
        +'Start the studio from a shell where <b>claude</b> runs.')
  else body='<b>Every option was turned down by a gate.</b><br>'
    +d.map(x=>'&middot; '+x.why).join('<br>')
    +'<br><br>That is usually a component with nothing in it that wants to move separately. '
    +'Try one with repeated parts, or press again for different verbs.'
  grid.innerHTML='<div class="empty" style="text-align:left;max-width:640px;margin:24px auto">'+body+'</div>'
  paint()
}

/** the component as it is, so the left rail is a thing you browse rather than a thing you submit */
function peek(){
  const q='?file='+encodeURIComponent(file)+'&palette='+encodeURIComponent(palette.value)+(cam.checked?'&camera=1':'')
  grid.innerHTML='<figure class="solo"><iframe data-i="0" src="/__wall/peek'+q+'"></iframe><figcaption>'
    +'<b>'+file.split('/').pop()+'</b><span class="verb">as written, nothing added yet. '
    +'Press <b>Give it motion</b> for options.</span></figcaption></figure>'
}

/* a request that never comes back would leave the button reading Writing for as long as the tab is
   open, so every ask carries its own deadline and says so if it runs out */
let inflight=null
async function post(where, body, ms){
  if(inflight) inflight.abort()
  const c=new AbortController(); inflight=c
  const bell=setTimeout(()=>c.abort(), ms)
  try{
    const r=await fetch(where,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(body),signal:c.signal})
    if(!r.ok) throw new Error('the studio answered '+r.status)
    return await r.json()
  }finally{ clearTimeout(bell); if(inflight===c) inflight=null }
}
ask.onclick=async()=>{
  if(APP && !chosen) return alert('Press Pick element, then click something in your app.')
  if(!APP && !file) return alert('Pick a component first.')
  if(ask.disabled) return
  verdict=null
  ask.disabled=true; ask.textContent='Writing…'
  grid.innerHTML='<div class="empty">Asking for '+document.getElementById('count').value+' motions.<br>About thirty seconds.</div>'
  drops.textContent=''
  try{
    const r=await post('/__wall/motion',
      Object.assign({count:Number(document.getElementById('count').value)}, APP?chosen:{file}), 360000)
    opts=r.kept||[]; held.clear(); ends.clear()
    verdict = opts.length ? null : {dropped:r.dropped||[], error:r.error}
    render()
    drops.textContent=(r.dropped&&r.dropped.length&&opts.length? r.dropped.length+' dropped: '
      +r.dropped.map(d=>d.why.split('.')[0]).join('; ')+'. ' : '')
      +(r.styled?'Styled with '+r.styled+'.':'')
  }catch(e){
    verdict={dropped:[],error: e && e.name==='AbortError'
      ? 'The studio did not answer within six minutes. It may still be working: the terminal says what it is doing.'
      : String(e && e.message ? e.message : e)}
    opts=[]; render() }
  ask.disabled=false; ask.innerHTML='Give it motion'
}
cam.onchange=render
palette.onchange=render
document.getElementById('save').onclick=async()=>{
  if(!opts.length) return
  const btn=document.getElementById('save'); btn.textContent='Writing…'
  const r=await fetch('/__wall/export',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({ids:opts.map(o=>o.id),palette:palette.value,
      name:(APP?(chosen&&chosen.label):file||'').split('/').pop().replace(/\.[^.]+$/,'')})}).then(r=>r.json())
  btn.textContent='Export'
  drops.textContent='Wrote '+r.at+', '+r.kb+'kb. One file, opens anywhere, no requests.'
}
document.getElementById('rate').onchange=e=>{rate=parseFloat(e.target.value)}

function render(){
  if(!opts.length && verdict) return explain()
  if(!opts.length && APP){
    grid.innerHTML='<div class="appwrap"><iframe src="/__wall/app"></iframe></div>'; return }
  if(!opts.length){ if(file) return peek()
    grid.innerHTML='<div class="empty">Pick a component on the left.</div>'; return }
  const q='?palette='+encodeURIComponent(palette.value)+(cam.checked?'&camera=1':'')
  grid.innerHTML=opts.map((o,i)=>
    '<figure><iframe data-i="'+i+'" src="/__wall/preview/'+o.id+q+'"></iframe>'+
    '<figcaption><b>'+(o.note||'untitled')+'</b>'+
    '<span class="verb">timing from '+o.verb+'</span>'+
    '<span class="note">'+o.scope+'</span>'+
    '<span class="row"><button class="mini keep" data-more="'+o.id+'">More like this</button>'+
    '<button class="mini" data-copy="'+o.id+'">Copy CSS</button>'+
    '<button class="mini" data-save="'+o.id+'">Save file</button></span></figcaption></figure>').join('')
  document.querySelectorAll('[data-more]').forEach(b=>b.onclick=async()=>{
    const keep=opts.find(x=>x.id===b.dataset.more)
    b.textContent='Varying…'; ask.disabled=true
    try{
      const r=await post('/__wall/refine',{id:keep.id,count:3},360000)
      // the one you liked stays on screen, with its variations beside it, so the comparison is real
      opts=[keep].concat(r.kept); held.clear(); ends.clear(); render()
      drops.textContent=r.dropped.length? r.dropped.length+' variation'+(r.dropped.length>1?'s':'')
        +' dropped: '+r.dropped.map(d=>d.why.split('.')[0]).join('; ') : 'Variations of the kept motion.'
    }catch(e){ drops.textContent = e && e.name==='AbortError'
      ? 'That took too long and was given up on. The terminal says what it was doing.'
      : String(e && e.message ? e.message : e) }
    ask.disabled=false
  })
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
    const o=opts.find(x=>x.id===b.dataset.copy)
    await navigator.clipboard.writeText('/* add '+o.scope+' to the root element */\\n'+o.css)
    b.textContent='Copied'; setTimeout(()=>b.textContent='Copy CSS',1200)
  })
  document.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{
    const r=await fetch('/__wall/save',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({id:b.dataset.save})}).then(r=>r.json())
    b.textContent=r.at.split('/').pop(); setTimeout(()=>b.textContent='Save file',2200)
  })
}

addEventListener('message',e=>{const d=e.data||{}
  if(d.wall==='held'){held.set(d.i,d.n)
    // a motion that runs six seconds cannot be scrubbed to its end on a four second ruler, and the
    // only thing that knows how long it runs is the animation itself
    if(d.end>0){ends.set(d.i,d.end); const want=Math.max(1200,Math.min(20000,Math.max(...ends.values())+300))
      if(Math.abs(want-span)>60){span=want;scrub.max=span;document.getElementById('span').textContent=(span/1000).toFixed(1)+'s'}}
    paint()}
  if(d.wall==='picked'){
    chosen={html:d.html,css:d.css,label:d.label,w:d.w,h:d.h}
    document.getElementById('pick').setAttribute('aria-pressed','false')
    document.getElementById('chosen').innerHTML='<b class="chip">'+d.label
      +'<br><span>'+(d.css.length/1000).toFixed(1)+'kb of matched css, '
      +(d.html.length/1000).toFixed(1)+'kb of markup'+(d.cut?' (trimmed to fit)':'')
      +', '+d.w+'x'+d.h
      +(d.weak?'<br><b style="color:#d29d6b">Weak pick:</b> '+d.weak
        +'. Try a container with several sibling parts, like a row of cards or a list.':'')
      +(d.opaque?'<br>'+d.opaque+' stylesheet'+(d.opaque>1?'s':'')+' could not be read: '
        +'served from another origin without cors, so some styling is missing':'')+'</span></b>'
    paint()
  }})
function paint(){
  const frames=document.querySelectorAll('iframe')
  if(!opts.length){link.textContent=(APP?chosen&&chosen.label:file)?'no motion yet':'—';
    link.style.color='var(--faint)';return}
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
  if(running){t=(t+s*rate)%span;hold(t)} requestAnimationFrame(tick)})
play.onclick=()=>{running=!running;face()}
scrub.oninput=()=>{running=false;face();t=Number(scrub.value);hold(t)}
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'&&e.target.type==='range')return
  if(e.key===' '){e.preventDefault();play.click()}
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();running=false;face()
    t=Math.max(0,Math.min(span,t+(e.key==='ArrowRight'?100:-100)));hold(t)}})
<\/script></body></html>`

const json = (res, v) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)) }

/**
 * The process stays up whatever one request does.
 *
 * Node's default for an unhandled rejection is to end the process, and this one spawns model calls,
 * proxies somebody else's dev server and parses whatever a page hands back. Ending on the first
 * surprise would throw away every option in memory and drop the tab, for a fault that was almost
 * always confined to one request. Logged rather than swallowed, so the terminal still shows it.
 */
process.on('unhandledRejection', (e) => {
  console.log(`  a promise failed and was not caught: ${String(e && e.message ? e.message : e).slice(0, 200)}`)
})
process.on('uncaughtException', (e) => {
  console.log(`  something threw where nothing was catching: ${String(e && e.message ? e.message : e).slice(0, 200)}`)
})
// a proxied app that dies mid response is an ECONNRESET on a socket, not a reason to stop serving
process.on('SIGPIPE', () => {})

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE()) }
    if (url.pathname === '/__wall/list') return json(res, TARGET ? [] : list())
    if (url.pathname === '/__wall/tailwind.js') {
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
    if (url.pathname === '/__wall/peek') {
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
    if (url.pathname.startsWith('/__wall/preview/')) {
      const o = made.get(url.pathname.split('/')[3])
      if (!o) { res.writeHead(404); return res.end('gone') }
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(preview(o, url.searchParams.has('camera'), url.searchParams.get('palette')))
    }
    if (url.pathname === '/__wall/motion' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const src = body.html ? { html: body.html, css: body.css ?? '', label: body.label ?? 'element',
        w: Number(body.w) || 0 }
        : { file: body.file }
      console.log(`  ${src.label ?? path.basename(src.file)}: asking for ${body.count}`)
      const got = await options(src, Math.max(1, Math.min(6, body.count || 3)))
      console.log(`    ${got.kept.length} kept, ${got.dropped.length} dropped`)
      return json(res, got)
    }
    if (url.pathname === '/__wall/refine' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const base = made.get(body.id)
      if (!base) { res.writeHead(404); return res.end('gone') }
      console.log(`  refining "${base.note}"`)
      const got = await refine(base, Math.max(1, Math.min(4, body.count || 3)))
      console.log(`    ${got.kept.length} kept, ${got.dropped.length} dropped`)
      return json(res, got)
    }
    if (url.pathname === '/__wall/export' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const html = await exportable(body.ids ?? [], body.palette)
      if (!html) { res.writeHead(404); return res.end('nothing to export') }
      const stem = String(body.name ?? 'motion').replace(/[^-\w]/g, '-') || 'motion'
      const at = path.resolve(work, `${stem}.html`)
      writeFileSync(at, html)
      console.log(`    exported ${at} (${Math.round(html.length / 1024)}kb)`)
      return json(res, { at, kb: Math.round(html.length / 1024) })
    }
    if (url.pathname === '/__wall/save' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const o = made.get(body.id)
      if (!o) { res.writeHead(404); return res.end('gone') }
      const name = path.basename(o.file).replace(/\.[^.]+$/, '').replace(/[^-\w]/g, '-') || 'element'
      const at = path.resolve(work, `${name}.motion.css`)
      writeFileSync(at, `/* Motion for ${o.file}\n   ${o.note}\n   timing from ${o.verb}\n`
        + `   add ${o.scope} to the component's root element, then import this file. */\n\n${o.css}\n`)
      console.log(`    saved ${at}`)
      return json(res, { at })
    }
    if (url.pathname === '/__wall/app') {
      if (!TARGET) { res.writeHead(404); return res.end('no app: start the studio with --app') }
      return proxy(req, res, new URL(ENTRY, 'http://x'))
    }
    // anything not ours belongs to the app being proxied, which is how its root-relative assets
    // resolve without a single url being rewritten
    if (TARGET && !OURS.test(url.pathname)) return proxy(req, res, url)
    res.writeHead(404); res.end('no')
  } catch (e) {
    const why = String(e && e.message ? e.message : e).slice(0, 300)
    console.log(`  ${req.method} ${url.pathname} failed: ${why}`)
    // headersSent means something already started answering, and writing a second head throws
    if (res.headersSent) return res.end()
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: why }))
  }
})

/**
 * Hot reload, passed through as raw bytes.
 *
 * Vite and Next both keep a websocket open for hot updates, and a proxy that only forwards http
 * leaves the app working but frozen: you edit a component, nothing happens, and you conclude the
 * studio broke your dev server. Forwarding the upgrade is a socket to the target, the original request
 * line written back out verbatim, and then two pipes. Nothing here understands websocket framing,
 * which is the point, since it does not have to.
 */
if (TARGET) {
  const at = new URL(TARGET)
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(Number(at.port || 80), at.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i]
        lines.push(`${k}: ${k.toLowerCase() === 'host' ? at.host : req.rawHeaders[i + 1]}`)
      }
      up.write(lines.join('\r\n') + '\r\n\r\n')
      if (head && head.length) up.write(head)
      up.pipe(socket); socket.pipe(up)
    })
    up.on('error', () => socket.destroy())
    socket.on('error', () => up.destroy())
  })
}

// a studio pointed at a folder and another pointed at a running app is a reasonable pair to want
// open at once, so a busy port moves along rather than ending the process
const live = await listenNear(server, PORT).catch((e) => {
  console.log(`\n  cannot listen: ${e.message}\n`)
  process.exit(1)
})
const where = `http://localhost:${live}`
console.log(`\n  motion studio  ${where}`)
const moved = movedFrom(live, PORT)
if (moved) console.log(moved)
if (TARGET) console.log(`  proxying ${TARGET}\n  its dom is readable here, so its elements can be picked`)
else {
  const files = list().length
  console.log(`  ${files} component${files === 1 ? '' : 's'} under ${path.resolve(ROOT)}`)
}
console.log(TARGET ? '  picked elements bring their own css, so nothing is guessed'
  : rawSheet ? `  styled with ${SHEET}`
    : '  no --css given: utility classes are compiled here and coloured from a Wall palette')
console.log(CAN_WRITE ? '  the claude command is here, so motion can be written\n'
  : '  no claude command on PATH, so nothing can be written. Install it, or start the studio\n'
    + '  from a shell where `claude` runs, and the button will have something to call.\n')
if (!process.env.WALL_NO_OPEN) {
  const [cmd, a] = process.platform === 'darwin' ? ['open', [where]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', where]]
      : ['xdg-open', [where]]
  spawn(cmd, a, { stdio: 'ignore', detached: true }).unref()
}
