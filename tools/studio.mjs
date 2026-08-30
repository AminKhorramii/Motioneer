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
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { hasClaude } from '../shared/cli.mjs'
import { PROVIDERS, write as askProvider, check as checkProvider, publicly, missing, resolve }
  from '../shared/model.mjs'
import { streamText } from '../shared/providers.mjs'
import { listenNear, movedFrom } from '../shared/port.mjs'
import {
  MOTION_SYSTEM, dealMotions, dealErrands, grabJson, safeStyle, unmoved, brittle, janky, scopeOf, retimed,
  tempo, unstill, leaks, namespaced,
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
let HOST = null
let ENTRY = '/'
let AIM = null   // the address as typed, for the sidebar to show

/**
 * Where the studio is pointed, changed while it runs.
 *
 * This began as a flag, which meant every new site was a restart: kill it, retype the command, wait
 * for the port, find the tab again. An address bar is the obvious shape for "what am I looking at",
 * and having one means `npm run studio` is the entire command and the flag is only a shortcut for
 * starting somewhere particular.
 *
 * A bare host is allowed because that is what people type. localhost:3000 is not a url and every
 * browser has forgiven that for twenty years, so this does too.
 */
/** a bare host is http only when it is this machine: everywhere else redirects to https, and the
    redirect leaves the proxy, which puts the real site in the frame and closes its dom again */
const localish = (host) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local)(:\d+)?$/i.test(host)

function aimAt(raw) {
  const said = String(raw ?? '').trim()
  if (!said) return null
  const scheme = /^https?:\/\//i.test(said) ? '' : (localish(said.split('/')[0]) ? 'http://' : 'https://')
  const url = new URL(scheme + said)
  HOST = url.origin
  ENTRY = url.pathname + url.search
  AIM = url.href
  return AIM
}
if (TARGET) aimAt(TARGET)
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
const CAN_CLI = hasClaude()
const CAN_WRITE = CAN_CLI || !!process.env.ANTHROPIC_API_KEY || existsSync('.studio/model.json')

const work = '.studio'
mkdirSync(work, { recursive: true })

const HAS_FOLDER = existsSync(ROOT)

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
/**
 * The camera, as four shots on the same clock as the motion.
 *
 * It used to be one move, twelve seconds long, and infinite. Infinite is the part that mattered: an
 * animation with no end has an endTime of Infinity, the transport filters that out when it sizes the
 * scrubber, and the ruler therefore measured only the motion. A component whose motion lasts 1.5
 * seconds gave a 1.5 second scrubber, so dragging it end to end played the first eighth of the camera
 * move and no more. The camera could not be composed, only watched.
 *
 * So every move is finite and long enough to read, and the transport sizes itself to whichever of the
 * two runs longer. Scrubbing now walks the camera and the motion together, which is what composing a
 * shot means.
 *
 * Four moves rather than one, because they answer different questions. Locked off asks what the
 * motion looks like; the other three ask what it looks like in a film.
 */
const SHOTS = {
  locked: {
    from: 'rotateX(6deg) rotateY(-9deg) rotateZ(-2deg) scale(1.6) translate3d(0,0,0)',
    to: 'rotateX(6deg) rotateY(-9deg) rotateZ(-2deg) scale(1.6) translate3d(0,0,0)',
    ease: 'linear',
  },
  push: {
    from: 'rotateX(9deg) rotateY(-11deg) rotateZ(-3deg) scale(1.34) translate3d(0,2%,0)',
    to: 'rotateX(6deg) rotateY(-7deg) rotateZ(-2deg) scale(1.92) translate3d(0,-2%,0)',
    ease: 'cubic-bezier(.33,0,.2,1)',
  },
  drift: {
    from: 'rotateX(15deg) rotateY(-24deg) rotateZ(-9deg) scale(2.15) translate3d(6%,4%,0)',
    to: 'rotateX(9deg) rotateY(-13deg) rotateZ(-5deg) scale(1.72) translate3d(-5%,-3%,0)',
    ease: 'cubic-bezier(.4,0,.55,1)',
  },
  orbit: {
    from: 'rotateX(11deg) rotateY(-30deg) rotateZ(-4deg) scale(1.66) translate3d(4%,0,0)',
    to: 'rotateX(11deg) rotateY(12deg) rotateZ(2deg) scale(1.66) translate3d(-4%,0,0)',
    ease: 'cubic-bezier(.45,0,.55,1)',
  },
}

/**
 * @param shot which of the four
 * @param ms   how long the move runs, taken from the motion so the two share a ruler
 * @param depth how much lens: the blur, the bloom and the vignette move together, because a shallow
 *              lens and a strong bloom are the same decision about how much this is a photograph
 */
const STAGE = (shot = 'drift', ms = 3200, depth = 1) => {
  const move = SHOTS[shot] || SHOTS.drift
  const blur = (7 * depth).toFixed(1)
  const bloom = (0.5 * depth).toFixed(2)
  const band = 34 - 10 * depth
  return `
    html,body{margin:0;height:100%;background:#050506;overflow:hidden}
    .rig{position:fixed;inset:0;display:grid;place-items:center;perspective:1500px;perspective-origin:50% 45%}
    .dolly{transform-style:preserve-3d;transform:${move.from};
      animation:dolly ${ms}ms ${move.ease} both}
    .plate{position:relative;width:1000px;transform-style:preserve-3d;filter:brightness(1.18) contrast(1.06)}
    .layer{position:absolute;inset:0;display:grid;place-items:center}.layer>*{width:100%}
    .sharp{position:relative}
    .blur{filter:blur(${blur}px) saturate(1.1);
      -webkit-mask-image:linear-gradient(168deg,#000 0%,rgba(0,0,0,.9) ${band - 20}%,transparent ${band}%,transparent ${100 - band}%,rgba(0,0,0,.9) ${120 - band}%,#000 100%);
      mask-image:linear-gradient(168deg,#000 0%,rgba(0,0,0,.9) ${band - 20}%,transparent ${band}%,transparent ${100 - band}%,rgba(0,0,0,.9) ${120 - band}%,#000 100%)}
    .bloom{filter:blur(22px) saturate(2.2) brightness(1.35);mix-blend-mode:screen;opacity:${bloom};pointer-events:none}
    @keyframes dolly{from{transform:${move.from}}to{transform:${move.to}}}
    .vignette{position:fixed;inset:0;pointer-events:none;z-index:5;
      background:radial-gradient(135% 105% at 50% 46%,transparent ${52 - 8 * depth}%,rgba(5,5,6,${(0.5 * depth).toFixed(2)}) 82%,rgba(5,5,6,${(0.86 * depth).toFixed(2)}) 100%)}
    .grain{position:fixed;inset:-50%;pointer-events:none;z-index:6;opacity:${(0.05 * depth).toFixed(3)};
      background-image:repeating-conic-gradient(#fff 0% 0.0009%,transparent 0% 0.0018%);
      animation:grain 1.2s steps(6) infinite}
    @keyframes grain{0%{transform:translate3d(0,0,0)}20%{transform:translate3d(-1.5%,1%,0)}
      40%{transform:translate3d(1%,-1.5%,0)}60%{transform:translate3d(-1%,-1%,0)}
      80%{transform:translate3d(1.5%,1.5%,0)}100%{transform:translate3d(0,0,0)}}`
}

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

const preview = (o, camera, palette, depth = 1) => {
  /**
   * A snapshot carries every computed value on the element itself, so it needs none of the collected
   * rules and cannot be let down by one I failed to collect. Measured against the reconstruction on
   * four sites: a heading that laid out at 31 percent of its height came back at 100, a button at 57
   * came back at 100, a list at 62 came back at 100, and nothing got worse. It costs a kilobyte or
   * three. The markup and the rules are still what the model reads, because a selector written
   * against real class names still means something after somebody edits the component.
   */
  const body = o.shot || o.markup
  const scoped = o.scope ? body.replace(/<(\w+)/, `<$1 ${o.scope}`) : body
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
  /**
   * The camera runs at least as long as the motion and never so briefly that it whips.
   *
   * Tied to the motion so the two share a ruler, floored at two and a half seconds because a
   * component whose motion lasts 400ms would otherwise get a camera move that reads as a flinch, and
   * capped so a slow ambient loop does not drag the shot out to nothing.
   */
  const span = tempo(o.css).span || 1200
  const shotMs = Math.max(2500, Math.min(6000, Math.round(span * 1.6)))
  const chrome = camera ? STAGE(camera, shotMs, depth) : `html,body{margin:0;height:100%;overflow:hidden;
    background:var(--background,#0b0c0d);color:var(--foreground,#e6e6e6);font:14px ui-sans-serif,system-ui}
    #fit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center center;
      width:${o.wide ? o.wide + 'px' : 'max-content'}}`
  // chrome first, then the ground the element was standing on, or ours would overrule the page's
  // own background and a light site would be previewed on black with black text
  const head = `<meta charset="utf-8">${tw}${vars}<style>${chrome}\n${o.shot ? '' : o.base}\n${o.css}</style>`
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

/** ask for the entry once, following redirects, and move HOST to wherever it actually ended up */
async function settleEntry() {
  try {
    const r = await fetch(HOST + ENTRY, { redirect: 'follow', signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
        + '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36' } })
    if (r.status === 403 || r.status === 429) {
      const body = (await r.text()).slice(0, 4000)
      const wall = /just a moment|cf-browser-verification|cloudflare|captcha|are you a robot/i.test(body)
      return { error: wall
        ? 'that site is behind a bot check, which a proxy cannot pass. Nothing here can fix that.'
        : `that site answered ${r.status} to this request` }
    }
    const at = new URL(r.url)
    if (at.origin !== HOST || at.pathname + at.search !== ENTRY) {
      HOST = at.origin
      ENTRY = at.pathname + at.search
      AIM = at.href
      console.log(`  it redirected, so now aimed at ${AIM}`)
    }
    return null
  } catch (e) { return { error: String(e && e.message ? e.message : e).slice(0, 200) } }
}

async function proxy(req, res, url, quiet) {
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
  /**
   * Stylesheets on another host, pulled back onto this one.
   *
   * The proxy catches root relative urls, which covers a site that serves its own assets. It does not
   * catch a link that names a cdn outright, and that sheet then loads straight from the cdn, stays
   * cross origin, and cannot be read: measured on linear, 24 sheets readable and 54 not, every one of
   * them from the same static.linear.app, the difference being only whether the tag happened to ask
   * for cors. A picked element there came back missing most of its styling.
   *
   * Only stylesheets are moved. Scripts and images are fine where they are, and fetching a site's
   * whole asset tree through here would make this a mirror rather than a lens.
   */
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) return tag
    return tag.replace(/href\s*=\s*["']([^"']+)["']/i, (whole, href) => {
      if (!/^https?:\/\//i.test(href) || href.startsWith(HOST)) return whole
      return `href="/__wall/asset?u=${encodeURIComponent(href)}"`
    })
  })
  const at = html.search(/<\/body>/i)
  html = at === -1 ? html + PICKER : html.slice(0, at) + PICKER + html.slice(at)
  /**
   * Some sites navigate their own frame back to their canonical host.
   *
   * vercel.com and nextjs.org both do it: a script reads location.host, finds it is not theirs, and
   * sets it, which keeps the path and lands the frame on vercel.com/__wall/app. window.location
   * cannot be overridden, so there is no shim that beats it from inside the page.
   *
   * But their javascript is not what any of this needs. The picker wants the rendered dom and the
   * rules that matched it, and a server rendered page has both before a line of script runs. So the
   * second attempt serves the same html with scripts refused, which leaves the markup and the
   * stylesheets and takes away the one line that was throwing us out. A page that draws itself
   * entirely on the client will come back empty, and that is said rather than hidden.
   */
  const head = { ...out, 'content-type': 'text/html; charset=utf-8' }
  if (quiet) {
    // a nonce rather than 'none', because refusing every script refused the picker too and left a
    // page that renders perfectly and cannot be clicked. This lets exactly one script run: ours
    const nonce = randomUUID().replace(/-/g, '')
    html = html.replace('<script>(function(){', `<script nonce="${nonce}">(function(){`)
    head['content-security-policy'] = `script-src 'nonce-${nonce}'`
  }
  res.writeHead(r.status, head)
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
/**
 * A second capture that does not reconstruct anything.
 *
 * The first one is a reconstruction: the markup, plus the rules I judged relevant, plus the inherited
 * values read off the computed style. Reconstructions leak, and the leak is measurable. Across twenty
 * sites and ten kinds of element, 67 of 89 captures kept both their tree and their shape, and svg was
 * the worst at 5 of 11: one node whose drawing is styled by fill and stroke that no matched rule
 * necessarily mentions.
 *
 * So this one asks the browser what it computed and writes the answer onto a clone. Nothing is
 * inferred, nothing is matched, and a rule I failed to collect cannot cost anything. It is verbose,
 * which is why it is not what the model reads: the model wants the real classes so its selectors mean
 * something a month from now, while a preview only has to look right. Two captures, two jobs.
 *
 * Only properties that differ from the usual default are written, which is most of the saving: a div
 * with no border and no shadow says nothing about either.
 */
var PROPS=['display','position','top','right','bottom','left','width','height','min-width','min-height',
'max-width','max-height','margin','padding','box-sizing','overflow','overflow-x','overflow-y',
'flex','flex-direction','flex-wrap','align-items','align-self','justify-content','gap','order',
'grid-template-columns','grid-template-rows','grid-column','grid-row','place-items',
'background-color','background-image','background-size','background-position','background-repeat',
'color','opacity','box-shadow','filter','mix-blend-mode','border-radius','border-width','border-style',
'border-color','outline','font-family','font-size','font-weight','font-style','line-height',
'letter-spacing','text-align','text-transform','text-decoration','white-space','word-break',
'text-overflow','vertical-align','transform','transform-origin','list-style','object-fit','z-index',
'fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','vector-effect']
var DULL={'display':'block','position':'static','top':'auto','right':'auto','bottom':'auto','left':'auto',
'width':'auto','height':'auto','min-width':'0px','min-height':'0px','max-width':'none','max-height':'none',
'margin':'0px','padding':'0px','overflow':'visible','overflow-x':'visible','overflow-y':'visible',
'flex':'0 1 auto','flex-direction':'row','flex-wrap':'nowrap','align-items':'normal','align-self':'auto',
'justify-content':'normal','gap':'normal','order':'0','grid-template-columns':'none',
'grid-template-rows':'none','grid-column':'auto','grid-row':'auto','place-items':'normal',
'background-color':'rgba(0, 0, 0, 0)','background-image':'none','background-size':'auto',
'background-position':'0% 0%','background-repeat':'repeat','opacity':'1','box-shadow':'none','filter':'none',
'mix-blend-mode':'normal','border-radius':'0px','border-width':'0px','border-style':'none',
'outline':'rgb(0, 0, 0) none 0px','text-transform':'none','text-decoration':'none solid rgb(0, 0, 0)',
'white-space':'normal','word-break':'normal','text-overflow':'clip','vertical-align':'baseline',
'transform':'none','list-style':'outside none disc','object-fit':'fill','z-index':'auto',
'stroke':'none','stroke-width':'1px','stroke-linecap':'butt','stroke-linejoin':'miter',
'stroke-dasharray':'none','vector-effect':'none'}

function inked(el){
  var cs=getComputedStyle(el),bits=[]
  /* A border is three properties that only mean anything together.
     Tailwind's preflight sets a zero width solid border on every element, so everything computes
     border-style solid with border-width 0px. Writing down the style and skipping the width as a
     default leaves border-style solid with nothing to size it, and an undeclared border-width
     falls back to medium, which is three pixels. That is the box that appeared around every
     element. If there is no width there is no border, so none of the three is worth writing. */
  var noBorder=parseFloat(cs.getPropertyValue('border-width'))===0
  for(var i=0;i<PROPS.length;i++){var k=PROPS[i],v=cs.getPropertyValue(k)
    if(!v||v===DULL[k])continue
    if(noBorder&&k.indexOf('border-')===0&&k!=='border-radius')continue
    bits.push(k+':'+v)}
  return bits.join(';')
}
function snapshot(el,cap){
  var clone=el.cloneNode(true)
  var from=[el].concat([].slice.call(el.querySelectorAll('*')))
  var to=[clone].concat([].slice.call(clone.querySelectorAll('*')))
  var n=Math.min(from.length,to.length,cap||300)
  for(var i=0;i<n;i++){
    var st=inked(from[i])
    if(st)to[i].setAttribute('style',st)
    /* an input keeps what is typed in a property rather than in the markup, so a clone of a filled
       field comes back empty unless the value is written down */
    if(to[i].tagName==='INPUT'&&from[i].value!==undefined)to[i].setAttribute('value',from[i].value)
    if(to[i].tagName==='TEXTAREA')to[i].textContent=from[i].value||to[i].textContent
    if(to[i].tagName==='OPTION'&&from[i].selected)to[i].setAttribute('selected','')
  }
  return clone.outerHTML
}

function label(el){var c=typeof el.className==='string'?el.className.trim().split(/\\s+/).filter(Boolean):[];
  return el.tagName.toLowerCase()+(c.length?'.'+c.slice(0,3).join('.'):'')}
/* The ground it stood on, and the typography it was given rather than the typography it declared.
   Font size, line height, weight and tracking are inherited, so they usually live on an ancestor and
   none of the rules that matched this element mention them. Lifted out, a heading falls back to the
   browser default and lays out at a fraction of its real height: measured, stripe's h1 came back at
   18 percent and linear's at 31. Reading them off the computed style takes what the browser actually
   arrived at, which is the only place the answer exists. */
var INHERIT=['font-family','font-size','font-weight','font-style','line-height','letter-spacing',
  'text-transform','text-align','white-space','word-spacing','font-variant','text-indent'];
function context(el){var n=el.parentElement,bg='';
  while(n&&!bg){var c=getComputedStyle(n).backgroundColor;
    if(c&&c!=='transparent'&&c.indexOf('rgba(0, 0, 0, 0)')!==0)bg=c;n=n.parentElement}
  var cs=getComputedStyle(el),out=[];
  for(var i=0;i<INHERIT.length;i++){var v=cs.getPropertyValue(INHERIT[i]);
    if(v)out.push(INHERIT[i]+':'+v)}
  return 'body{background:'+(bg||'#0b0c0d')+';color:'+cs.color+';'+out.join(';')+'}'}
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
/* Picking stays armed until it is turned off.
   It used to disarm itself after one element, which was fine when a pick replaced the last one and is
   broken now that several of them make a rail: you click the second thing, nothing happens, and the
   button is the only place that says why. Measured before the change, three clicks in a row produced
   one selection. Escape leaves, and so does pressing the button again. */
function pick(e){if(!on)return;e.preventDefault();e.stopPropagation();
  var el=last||e.target;
  var r=el.getBoundingClientRect(),h=trimmed(el,14000);
  var css=rules(el);
  var shot='';
  try{ shot=snapshot(el,300) }catch(_){}
  if(shot.length>260000)shot='';
  /* Stagger is the whole difference between motion somebody notices and motion somebody ignores, and
     stagger needs sibling parts to move at different times. A 1140 by 44 strip has none, so every
     option written for it comes back a variation on "slide in". Worth saying at the moment of the
     pick rather than sixty seconds later when five weak options are already on screen. */
  var kids=el.children.length, thin=r.height<60||r.width<60;
  var huge=r.height>innerHeight*1.5;
  var svg=el.tagName.toLowerCase()==='svg';
  /* Short, because this is read on a pill beside a picture of the element. Which fault it is matters,
     and there are four worth telling apart. A page taller than one and a half screens is the whole
     document rather than a component, and clicking a link or an outer div on a long marketing page
     catches one every time: measured on linear, both came back 1160 by 9084. An svg that had to be
     trimmed has lost part of its own drawing, which no other element does when it loses a child. */
  var weak = huge ? 'most of the page, not a component'
    : svg && h.length < el.outerHTML.length ? 'an svg cut short is a broken drawing'
    : thin ? 'too thin to stagger'
    : kids === 0 ? 'nothing inside it to move separately'
    : kids < 3 ? 'only ' + kids + ' part' + (kids === 1 ? '' : 's') : '';
  parent.postMessage({wall:'picked',html:h,css:css,shot:shot,label:label(el),opaque:opaque,weak:weak,
    n:el.querySelectorAll('*').length+1,
    cut:h.length<el.outerHTML.length,w:Math.round(r.width),h:Math.round(r.height)},'*')}
function arm(v){on=v;
  document.documentElement.style.cursor=v?'crosshair':'';
  if(!v&&box)box.style.display='none';
  parent.postMessage({wall:v?'armed':'disarmed'},'*')}
addEventListener('mousemove',move,true);addEventListener('click',pick,true);
/* a framework that acts on mousedown would fire before the click is stopped */
addEventListener('mousedown',function(e){if(on){e.preventDefault();e.stopPropagation()}},true);
addEventListener('keydown',function(e){if(on&&e.key==='Escape'){e.preventDefault();arm(false)}},true);
addEventListener('message',function(e){var d=e.data||{};
  if(d.wall==='pick')arm(true);
  if(d.wall==='nopick')arm(false)});
parent.postMessage({wall:'ready'},'*');
})();<\/script>`

/**
 * The gate that looks instead of reading.
 *
 * unmoved, brittle, janky and scopeOf all take a css string. Not one of them renders anything, which
 * means the hardest promise in the prompt is unchecked: "anything that moves the component to a
 * different place on the page when the animation is not running is a bug rather than a design".
 * A sheet can satisfy every textual rule and still leave the component eight pixels down forever,
 * because a keyframe ended on a transform instead of returning to none, or because `both` held the
 * last frame. That ships into somebody's product and nudges their layout for good.
 *
 * So it is rendered twice: once with the motion and held past its end, once with the motion absent.
 * The two resting boxes have to agree. Nothing else in here can catch that, because the fault is not
 * in the text, it is in where the text leaves things.
 *
 * playwright is a devDependency of this repo and absent from the published package, so it is imported
 * only when reached and its absence is a skipped check rather than a crash.
 */
let lens = null
async function eyes() {
  if (lens !== null) return lens
  try {
    const { chromium } = await import('playwright')
    lens = { browser: await chromium.launch() }
  } catch { lens = { why: 'playwright is not installed here, so the rendered check did not run' } }
  // said once, because a check that quietly does not run is worse than one that is not there
  console.log(lens.browser ? '  rendering each option once to check it comes to rest where it started'
    : `  ${lens.why}`)
  return lens
}

const restPage = (o, css) => `<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  #r{position:absolute;left:0;top:0;width:${o.wide ? o.wide + 'px' : 'max-content'}}
  ${o.base}
  ${css}</style></head><body><div id="r">${o.scope ? o.markup.replace(/<(\w+)/, `<$1 ${o.scope}`) : o.markup}</div></body></html>`

async function drifts(o) {
  const eye = await eyes()
  if (!eye.browser) return { skipped: eye.why }
  let page
  try {
    page = await eye.browser.newPage({ viewport: { width: 1280, height: 900 } })
    const measure = async (css, settle) => {
      await page.setContent(restPage(o, css), { waitUntil: 'load' })
      if (settle) {
        // held well past the end, which is where the component comes to rest and stays
        await page.evaluate(() => {
          for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 60_000 } catch {} }
        })
      }
      await page.waitForTimeout(70)
      // every element, because a transform on a child never moves its parent's box and the drift
      // this is looking for is almost always in the parts rather than in the whole
      return page.evaluate(() => ({
        boxes: [...document.querySelectorAll('#r, #r *')].slice(0, 400).map((e) => {
          const b = e.getBoundingClientRect(), c = getComputedStyle(e)
          return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height),
            Math.round(parseFloat(c.opacity) * 100)]
        }),
        running: document.getAnimations().length,
      }))
    }
    const still = await measure('', false)
    const after = await measure(o.css, true)

    /**
     * How much this actually moves, and whether it is watchable, which no gate has ever asked.
     *
     * Everything up to here answers "is this wrong". Legality has a floor and no ceiling: a motion
     * that nudges one element two pixels passes every check and nobody sees it, and one that throws a
     * card four hundred pixels across the screen passes the same checks. Both are legal. Neither is
     * good.
     *
     * So the sheet is walked across its own span and three things are measured. Travel is the largest
     * distance any part covers, as a fraction of the component, which separates the imperceptible from
     * the violent. Escape is how far anything strays outside the component's own box, which is where
     * clipping and collisions with neighbours come from. Blank is how much of the component is
     * invisible at the very first frame, because the prompt asks for no blank frame and this will be
     * watched from the middle.
     */
    const span = Math.max(400, Math.min(6000, tempo(o.css).span || 800))
    const frames = []
    for (const at of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate((t) => {
        for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = t } catch {} }
      }, Math.round(span * at))
      await page.waitForTimeout(24)
      /**
       * Every way a thing can look different, not only where its box is.
       *
       * The first version of this measured x and y and reported that fifteen of twenty one motions
       * barely moved, including one described as rows typing onto the page and another as a
       * strikethrough landing. Both plainly move. Neither translates: one is a clip-path opening and
       * the other is a scaleX from nothing, and a bounding box notices neither. Measuring displacement
       * and calling it motion would have ranked a slide above a beautifully drawn reveal.
       */
      /**
       * The pseudo elements are sampled too, because a great deal of this motion lives there.
       *
       * A scan line, a strike, an underline drawing itself: every one of those is a ::before or an
       * ::after, and querySelectorAll cannot see any of them. Measured without them, a motion
       * described as a border tracing its own outline reported that nothing at all took part, and
       * ranking on that would have quietly buried an entire technique.
       */
      frames.push(await page.evaluate(() => {
        const read = (e, pseudo) => {
          const c = getComputedStyle(e, pseudo)
          if (pseudo && (c.content === 'none' || !c.content)) return null
          const b = pseudo ? null : e.getBoundingClientRect()
          return [b ? b.x : 0, b ? b.y : 0, b ? b.width : 0, b ? b.height : 0,
            parseFloat(c.opacity), c.visibility === 'visible' ? 1 : 0,
            c.transform, c.clipPath, c.filter,
            pseudo ? c.width + ' ' + c.height + ' ' + c.inset : '']
        }
        const out = []
        for (const e of [...document.querySelectorAll('#r, #r *')].slice(0, 240)) {
          out.push(read(e, null))
          out.push(read(e, '::before'))
          out.push(read(e, '::after'))
        }
        return out
      }))
    }
    const root = after.boxes[0] || [0, 0, 1, 1, 1]
    const size = Math.max(1, Math.hypot(root[2], root[3]))
    let travel = 0, escape = 0
    // how much of the component takes part, which is the question "one part or ten" asked of the
    // rendering rather than of the delays in the sheet
    const stirred = new Set()
    for (let i = 1; i < frames.length; i++) {
      frames[i].forEach((b, j) => {
        const a = frames[0][j]
        if (!a || !b) return
        travel = Math.max(travel, Math.hypot(b[0] - a[0], b[1] - a[1]))
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5 || Math.abs(b[4] - a[4]) > 0.04
          || b[6] !== a[6] || b[7] !== a[7] || b[8] !== a[8] || b[9] !== a[9]
          || Math.abs(b[2] - a[2]) > 0.5 || Math.abs(b[3] - a[3]) > 0.5) stirred.add(j)
      })
    }
    // the resting box of the whole thing, which is what anything straying outside is measured against
    const rest = { x: still.boxes[0][0], y: still.boxes[0][1], w: still.boxes[0][2], h: still.boxes[0][3] }
    for (const f of frames) {
      for (const b of f) {
        if (!b || b[4] < 0.05 || !b[2]) continue
        escape = Math.max(escape,
          rest.x - b[0], rest.y - b[1],
          (b[0] + b[2]) - (rest.x + rest.w), (b[1] + b[3]) - (rest.y + rest.h))
      }
    }
    const inkAt = (f) => f.reduce((n, b) => n + (b && b[4] > 0.05 && b[5] && b[2] > 0 ? 1 : 0), 0)
    const atRest = Math.max(1, inkAt(frames[frames.length - 1]))
    const blank = Math.max(0, 1 - inkAt(frames[0]) / atRest)
    if (!still.boxes.length || !after.boxes.length) return { skipped: 'nothing rendered to measure' }
    let off = 0, ghost = 0
    still.boxes.forEach((a, i) => {
      const b = after.boxes[i] || a
      off = Math.max(off, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]))
      ghost = Math.max(ghost, a[4] - b[4])
    })
    return { off, ghost, running: after.running,
      travel: Math.round(travel), reach: Math.round(travel / size * 100),
      stir: Math.round(stirred.size / Math.max(1, frames[0].filter(Boolean).length) * 100),
      escape: Math.round(Math.max(0, escape)), blank: Math.round(blank * 100) }
  } catch (e) {
    return { skipped: String(e && e.message ? e.message : e).slice(0, 90) }
  } finally { if (page) await page.close().catch(() => {}) }
}

/** the two ways a sheet can pass every reading and still be wrong once it stops */
function resting({ off, ghost, running, skipped }) {
  if (skipped) return []
  const out = []
  /**
   * Rendered and nothing is animating.
   *
   * unmoved reads the sheet and asks whether it contains keyframes and delays, which a sheet can do
   * while its selectors reach for a part this component does not have. Rendered, that is a preview
   * that sits perfectly still with the scope attribute correctly in place and every textual gate
   * satisfied. Counting what the browser is actually running is the only version of this question
   * that cannot be fooled.
   */
  if (running === 0) out.push('rendered, nothing on the component is animating. The sheet is valid and '
    + 'its selectors reach for parts this markup does not have, so it applies to nothing.')
  if (off > 2) out.push(`when the animation is over the component sits ${off}px from where it started, `
    + 'permanently. A keyframe that ends on a transform rather than returning to none does this, and '
    + 'it nudges the layout of whatever ships it for good.')
  if (ghost > 8) out.push(`when the animation is over the component is ${ghost}% more transparent than `
    + 'it was, so it stays faded or invisible. An entrance has to end at the component, not at a ghost '
    + 'of it.')
  return out
}

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
// word order matters and mine was wrong: the api says "API key is invalid", not "invalid api key",
// so a dead key was retried three times with pauses before reporting the same thing three ways
const TERMINAL = /not found on this machine|not authenticated|no such file|api key|unauthorized|401|403/i
const AUTH = /401|403|api key|authentication|unauthorized/i
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

/**
 * A key skips a process, which is a third of every call.
 *
 * runClaude spawns a whole CLI session per option: node boots, the session authenticates, and only
 * then does any generating start. Measured on one motion call, twice, against a trivial one that only
 * says "ok":
 *
 *   boot only            2.74s
 *   the real motion call 8.40s
 *
 * So 2.74 seconds of every call, a third of it, happens before the model has read a word. An http
 * request has none of that. The CLI is still the default because it needs no key and that is what
 * most people running this will have, but a key present means the fast path, and the two produce the
 * same shape so nothing downstream knows which one answered.
 */
/* the environment the command is given, with a refused key taken out of it rather than inherited */
const CLEAN_ENV = (() => { const e = { ...process.env }; delete e.ANTHROPIC_API_KEY; return e })()

/**
 * Which model writes the motion, kept between runs and changeable while it is running.
 *
 * This used to be two branches and an environment variable: a key meant the http path, no key meant
 * the command, and the vendor was written into the call. Choosing anything else meant editing the
 * file. The catalogue and the dispatch live in shared/model.mjs so that a worker, which has no shell
 * to run a command in and no disk to keep a file on, can use the same seven providers by handing it
 * a config from somewhere else.
 *
 * The key is written to .studio, which is already where the tailwind cache and the recent list live,
 * and is not committed. It is never sent back to the browser: the panel is told whether a key is set,
 * which is the only part of it a person needs to see.
 */
const MODEL_AT = path.join(work, 'model.json')
const fromEnv = () => (process.env.ANTHROPIC_API_KEY
  ? { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: process.env.WALL_STUDIO_MODEL || '' }
  : { provider: 'claude-cli', model: process.env.WALL_STUDIO_MODEL || '' })
let MODEL = (() => {
  try { return { ...fromEnv(), ...JSON.parse(readFileSync(MODEL_AT, 'utf8')) } }
  catch { return fromEnv() }
})()
const saveModel = () => {
  try { writeFileSync(MODEL_AT, JSON.stringify(MODEL, null, 2)) }
  catch (e) { console.log(`  could not keep the model choice: ${e.message}`) }
}

/**
 * Where this has been pointed, kept between runs.
 *
 * The sidebar listed the components in this repository, which is the right thing to see for about
 * one minute and then never again: once you are aiming at your own app, a folder of examples is
 * somebody else's furniture taking up the whole rail. What you actually return to is the last few
 * addresses, and retyping localhost:3000 every restart is the sort of small tax a tool should not
 * charge. Kept in .studio next to the tailwind cache, since it is the same kind of thing: local, not
 * worth committing, and harmless to delete.
 */
const RECENT_AT = path.join(work, 'recent.json')
let recent = []
try { recent = JSON.parse(readFileSync(RECENT_AT, 'utf8')) } catch { recent = [] }

const remember = (href) => {
  try {
    const at = new URL(href)
    recent = [{ href: at.href, host: at.host, path: at.pathname === '/' ? '' : at.pathname },
      // five, because the rail is for the handful you are moving between rather than a history
      ...recent.filter((r) => r.href !== at.href)].slice(0, 5)
    writeFileSync(RECENT_AT, JSON.stringify(recent))
  } catch { /* an address that will not parse is not worth remembering */ }
}
let refused = false   // said once, however many calls discover it at the same moment

async function askModel(brief, tries = 4) {
  let last = 'no usable reply came back'
  for (let n = 0; n < tries; n++) {
    let reply = await askProvider(MOTION_SYSTEM, brief, MODEL,
      { callMs: CALL_MS, thinking: THINK, env: CLEAN_ENV, maxTokens: 4000 })
      .catch((e) => ({ error: String(e && e.message ? e.message : e).slice(0, 160) }))

    if (reply && reply.error) {
      last = reply.error
      /**
       * A key that does not work is worse than no key at all.
       *
       * ANTHROPIC_API_KEY is often set to something stale, and preferring it over a claude command
       * that works turns a studio that was fine into one that answers 401 and gives up. The key is
       * only a shortcut around a process spawn, so a refusal drops the shortcut for the rest of the
       * session and the loop goes round again on the path that works.
       *
       * Going round again rather than retrying inline is what makes this survive five options at
       * once. They all reach for the key together and all get the same 401, so an inline retry
       * rescues whichever call noticed first and leaves the others holding a terminal error. Every
       * one of them continues here, and by their next turn the key is already gone.
       */
      /**
       * Only when nobody chose this on purpose.
       *
       * The fallback exists because ANTHROPIC_API_KEY is so often set to something stale, and a
       * studio that answers 401 when a working command is right there is worse than useless. But a
       * provider picked by hand in the panel is a decision, and quietly using a different one than
       * the person selected would hide exactly the mistake they need to see. So a config that came
       * from the environment falls back, and one that was chosen reports.
       */
      // not a key test: whichever call notices first switches, and the rest would then fail this
      // test and fall through to the terminal branch holding the same 401. Measured, that kept one
      // option out of five. What matters is that the fault was authentication and there is a command
      if (AUTH.test(last) && CAN_CLI && !MODEL.chosen && MODEL.provider !== 'claude-cli' && n < tries - 1) {
        if (!refused) {
          refused = true
          console.log(`  the api key was refused (${String(last).slice(0, 56)})`)
          console.log('  falling back to the claude command for the rest of this session')
        }
        MODEL = { provider: 'claude-cli', model: '' }
        continue
      }
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
function judge(raw, fallbackScope, parts = true) {
  const clean = safeStyle(raw.css)
  if (!clean) return { why: 'the reply carried no css that is allowed in a sheet' }
  const scope = scopeOf(clean, raw.scope ?? fallbackScope)
  /**
   * Keyframe names are renamed before anything judges the sheet, because the name is private to it
   * and only has to be unique. There is one flat namespace for @keyframes across every stylesheet on
   * a page, so a sheet defining `rise` replaces whatever the host application already called `rise`,
   * and the thing that breaks is somewhere else entirely. Measured over 18 real options, none used a
   * name plain enough to be obvious about it, which is exactly why it would not be found by reading.
   */
  const css = namespaced(clean, scope)
  /**
   * unstill is enforced and the tempo is not, which is a distinction the measurements made rather than
   * a preference. Across 23 real options every single one already wrapped itself in a reduced-motion
   * query, so requiring it costs nothing and catches the day the model forgets. The stated timings are
   * a different matter: only 70 to 74 percent land inside them, and the long tail is the errands that
   * are supposed to be slow, since a motion whose job is to keep something alive has no business
   * finishing in 400ms. Enforcing those numbers would reject a third of the good work for failing to
   * be an entrance. So they are reported on the card and left to a person.
   */
  const faults = [...unmoved({ html: '', css, note: '' }, { parts }), ...brittle(css), ...janky(css),
    ...unstill(css), ...leaks(css, scope)]
  if (faults.length) return { why: faults[0] }
  return { css, scope, note: String(raw.note ?? '').slice(0, 90) }
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
    return { id, verb: turn, scope: ok.scope, note: ok.note, css: ok.css, tempo: tempo(ok.css) }
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
  // what the model reads and what a preview shows are two different captures
  const shot = picked ? (src.shot || '') : ''
  const tw = !picked && wantsTailwind(markup, base) && !!(await getTailwind()).js
  const about = (picked
    ? `This element was picked out of a running app. It is the rendered dom, so it is exactly what a
user sees, and the css below is the rules that actually matched it.\n\n${source.slice(0, 6000)}\n\n`
    : `The component, as written in ${name}:\n${source.slice(0, 6000)}\n\n`)
    + (base ? `Its stylesheet:\n${base.slice(0, 3000)}\n\n` : '')

  const attempt = async (verb, told, errand) => {
    const brief = about + `Move it by ${verb} Take the timing from that object: it is how the thing behaves.`
      + (errand ? `\n\nAnd do it ${errand.does} That is what this movement is for, so if the manner and `
        + 'the errand pull in different directions, the errand wins.'
        + (errand.parts ? '' : ' This errand is about one thing rather than many, so there is nothing '
          + 'to stagger: one movement, done well, and the rest of the component holds still.') : '')
      + (told ? `\n\nA previous attempt at this was rejected because ${told} Do not repeat that.` : '')
    const got = await askModel(brief)
    if (!got.raw) return { verb, why: got.why, kind: 'model', terminal: got.terminal }
    const ok = judge(got.raw, undefined, errand ? errand.parts : true)
    if (!ok.css) return { verb, why: ok.why, kind: 'gate' }
    const rest = await drifts({ markup, base, css: ok.css, scope: ok.scope, wide })
    const settled = resting(rest)
    if (settled.length) return { verb, why: settled[0], kind: 'gate' }
    const seen = { reach: rest.reach, stir: rest.stir, escape: rest.escape, blank: rest.blank }
    const id = String(nextId++)
    keep(id, { file: name, markup, base, shot, css: ok.css, scope: ok.scope, tw, wide, note: ok.note,
      verb: errand ? `${verb.replace(/,.*/, '')}, ${errand.does.replace(/^to /, '')}` : verb })
    return { id, verb, scope: ok.scope, note: ok.note, css: ok.css, tempo: tempo(ok.css), seen }
  }

  // a manner and an errand each, so two options sharing a verb still have different jobs
  const errands = dealErrands(count)
  const first = await settle(dealMotions(count).map((verb, i) => attempt(verb, null, errands[i])))
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
    ? await settle(dealMotions(worth.length).map((verb, i) => attempt(verb, worth[i].why, dealErrands(worth.length)[i])))
    : []
  // the ones deliberately not asked again are still failures, and leaving them out of the tally
  // reported nothing dropped at all, which sent the page to the wrong explanation
  const notAsked = missed.filter((m) => !worth.includes(m))
  const tried = first.filter((t) => t.id).concat(again).concat(notAsked)
  /**
   * Ordered on the two things that are defensibly better or worse, and on nothing else.
   *
   * A component that is invisible at the first frame is worse than one that is legible, because this
   * is watched from the middle and the prompt asks for no blank frame. A part that strays outside the
   * component's own box risks being clipped or landing on a neighbour. Both are faults of degree
   * rather than kind, which is what makes them worth ordering by rather than rejecting on.
   *
   * How much of the component takes part is deliberately not in here. An emphasis motion stirs three
   * percent because it is about one thing, and an entrance stirs ninety because it is about all of
   * them, and neither is better. It is shown on the card as a description, not scored.
   */
  const cost = (t) => (t.seen ? t.seen.blank + t.seen.escape * 0.6 : 0)
  tried.sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || cost(a) - cost(b))
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

/**
 * Several elements, each with its own motion, on one timeline.
 *
 * Picking replaced the last pick, which makes the studio a tool for one component at a time. That is
 * not how a page is experienced: a dashboard has a header, a row of figures and a chart, and the
 * question worth answering is what happens when they all move, in what order. So picks accumulate
 * and a rail is what they turn into.
 *
 * The sequencing costs nothing because the transport already exists. Rather than rewriting anybody's
 * delays, each element is held at t minus its own offset, so the second element is still at zero
 * while the first is half a second in. One scrubber, several clocks, no css touched.
 */
async function railOf(picks, palette) {
  /**
   * Two goes per car, not one.
   *
   * A car is a single element and it either moves or the rail has a hole in it, which is a harsher
   * standard than the options grid where four of five surviving is fine. Asking for two and keeping
   * whichever passes turns one gate rejection from a missing car into a shrug. They still run
   * together, so the wall clock is unchanged; it is the number of calls that doubles.
   */
  return Promise.all(picks.map(async (pick, i) => {
    const src = { html: pick.html, css: pick.css ?? '', label: pick.label, w: pick.w }
    const got = await options(src, 2).catch((e) => ({ kept: [], dropped: [{ why: String(e && e.message || e) }] }))
    if (got.kept.length) return { ...got.kept[0], label: pick.label, i, ms: tempo(got.kept[0].css).span || 600 }
    // every reason, not just the first, because two attempts failing the same way says something
    // different from two failing differently
    const why = [...new Set((got.dropped || []).map((d) => String(d.why || '')).filter(Boolean))].join('; ')
    return { label: pick.label, i, why: why || 'nothing came back' }
  }))
}

const railView = (ids, palette, offsets = [], shots = []) => {
  const parts = ids.map((id, i) => made.get(id)).filter(Boolean).map((o, i) => {
    const tag = o.scope ? `${o.scope}-r${i + 1}` : ''
    const css = o.scope ? o.css.replaceAll(`[${o.scope}]`, `[${tag}]`) : o.css
    const from = o.shot || o.markup
    const markup = tag ? from.replace(/<(\w+)/, `<$1 ${tag}`) : from
    return { ...o, css, markup, tag, i, shot: shots[i] || '' }
  })
  if (!parts.length) return null
  const tw = parts.some((o) => o.tw)
  return `<html class="dark"><head><meta charset="utf-8">
${tw ? `<script src="/__wall/tailwind.js"></script><style type="text/tailwindcss">${themeMap}</style>` : ''}
${tw ? `<style>${themeFor(palette)}</style>` : ''}
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0c0d;color:#e6e6e6;
  font:13px ui-sans-serif,system-ui}
.rail{height:100%;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:14px}
.car{flex:1 1 0;display:grid;place-items:center;min-height:0;position:relative}
${parts[0].base}
${parts.map((p) => p.css).join('\n')}
.car > .in{transform-origin:center center}
.car.shot{background:#050506;border-radius:8px;overflow:hidden}
.rig{position:absolute;inset:0;display:grid;place-items:center;perspective:1400px;
  perspective-origin:50% 45%}
.dolly{transform-style:preserve-3d}
.plate{position:relative;width:${Math.max(...parts.map((p) => p.wide || 800))}px;
  transform-style:preserve-3d;filter:brightness(1.16) contrast(1.05)}
.layer{position:absolute;inset:0;display:grid;place-items:center}.layer>*{width:100%}
.sharp{position:relative}
.blur{filter:blur(8px) saturate(1.1);
  -webkit-mask-image:linear-gradient(168deg,#000 0%,transparent 32%,transparent 68%,#000 100%);
  mask-image:linear-gradient(168deg,#000 0%,transparent 32%,transparent 68%,#000 100%)}
.bloom{filter:blur(20px) saturate(2.1) brightness(1.3);mix-blend-mode:screen;opacity:.5;
  pointer-events:none}
${parts.filter((p) => p.shot).map((p) => {
  const move = SHOTS[p.shot] || SHOTS.drift
  return `.d${p.i}{transform:${move.from};animation:dolly${p.i} 3000ms ${move.ease} both}
@keyframes dolly${p.i}{from{transform:${move.from}}to{transform:${move.to}}}`
}).join('\n')}
.tag{position:absolute;left:0;top:0;font:10px ui-monospace,monospace;color:#5c6068;letter-spacing:.04em}
</style></head><body>
<div class="rail">${parts.map((p) => {
  const inner = `<div class="in" style="width:${p.wide ? p.wide + 'px' : 'max-content'}">${p.markup}</div>`
  /**
   * A car with a camera gets its own rig.
   *
   * The camera is a perspective, a moving plate and two blurred copies of the subject, and every one
   * of those is per subject. A rail is several subjects, so one shared rig could only ever film all
   * of them together as a single flat picture. Giving each car its own means one can sit locked off
   * while the one below it pushes in, which is what asking for a camera per item means.
   */
  const body = p.shot
    ? `<div class="rig"><div class="dolly d${p.i}"><div class="plate">
         <div class="layer bloom" data-copy></div>
         <div class="layer sharp">${inner}</div>
         <div class="layer blur" data-copy></div></div></div></div>`
    : inner
  return `<div class="car${p.shot ? ' shot' : ''}" data-rail="${p.i}">
    <span class="tag">${p.i + 1}. ${String(p.file || p.note || '').slice(0, 44)}</span>
    ${body}</div>`
}).join('')}</div>
<script>
var AT=${JSON.stringify(ids.map((_, i) => offsets[i] ?? i * 420))}
for (var car of document.querySelectorAll('.car')){
  var el=car.querySelector('.in'); if(!el) continue
  if(car.classList.contains('shot')) continue   // a rig does its own framing
  var r=el.getBoundingClientRect(), box=car.getBoundingClientRect()
  var s=Math.min(1,(box.width-20)/r.width,(box.height-8)/r.height)
  if(s<1) el.style.transform='scale('+s.toFixed(4)+')'
}
/* the defocus and the bloom are copies, cloned here so no component is written twice */
for (var slot of document.querySelectorAll('[data-copy]')){
  var from=slot.parentElement.querySelector('.sharp > *')
  if(from) slot.appendChild(from.cloneNode(true))
}
/* which element an animation belongs to decides which clock it is on */
/* which car an animation belongs to decides which clock it is on, and each car now carries its own
   offset rather than being spaced by its position, so the sequence can be composed rather than
   assumed */
function seat(a){ try{ var n=a.effect&&a.effect.target; while(n&&n!==document.body){
  if(n.dataset&&n.dataset.rail!==undefined) return Number(n.dataset.rail); n=n.parentElement } }catch(_){}
  return 0 }
function delay(a){ var i=seat(a); return AT[i]||0 }
requestAnimationFrame(function(){document.getAnimations().forEach(function(a){
  try{a.pause();a.currentTime=0}catch(_){}})})
addEventListener('message',function(e){var d=e.data||{};if(d.wall!=='hold')return
  var a=document.getAnimations(),end=0
  a.forEach(function(x){try{
    var off=delay(x)
    var at=Math.max(0,d.t-off); x.pause(); x.currentTime=at
    var t=x.effect&&x.effect.getComputedTiming?x.effect.getComputedTiming().endTime:0
    if(typeof t==='number'&&isFinite(t)&&t+off>end)end=t+off
  }catch(_){}})
  ;(e.source||parent).postMessage({wall:'held',n:a.length,i:d.i,end:Math.round(end)},'*')})
<\/script></body></html>`
}

/**
 * A film of whatever is on screen, rendered rather than recorded.
 *
 * film.mjs already does this from the command line, and asking somebody to leave the room they are
 * composing in, run a second tool and hope it picks up the same arrangement is the wrong shape. The
 * arrangement lives here: which options, in what order, at what offsets, under which camera. So the
 * frames are taken here too.
 *
 * Stepped rather than recorded, for the same reason film.mjs gives: a recording hopes the machine
 * keeps up and produces a different file every run, while setting the clock by hand produces the same
 * film every time at whatever frame rate is asked for. The transport that scrubs the studio is exactly
 * the mechanism for it.
 *
 * mp4 only if ffmpeg is on the machine. It is a thing somebody may have rather than something this
 * depends on, and the frames are the deliverable either way, which is said rather than skipped.
 */
async function film(url, { fps = 30, ms = 3000, size = { width: 1280, height: 720 }, name = 'film' }) {
  const eye = await eyes()
  if (!eye.browser) return { error: eye.why }
  /* every take kept: it overwrote the last one, so filming a second time to compare it with the
     first destroyed the first, which is the one thing a second take is for */
  let take = name, out = path.resolve(work, take)
  for (let n = 2; existsSync(out); n++) { take = `${name}-${n}`; out = path.resolve(work, take) }
  mkdirSync(path.join(out, 'frames'), { recursive: true })
  const page = await eye.browser.newPage({ viewport: size })
  const total = Math.max(1, Math.min(600, Math.round((ms / 1000) * fps)))
  try {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    for (let f = 0; f < total; f++) {
      const at = Math.round((f / fps) * 1000)
      // the same hold the scrubber uses, so a frame here is the frame you were looking at
      await page.evaluate((t) => {
        window.postMessage({ wall: 'hold', t, i: 0 }, '*')
        for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = t } catch {} }
      }, at).catch(() => {})
      await page.screenshot({ path: path.join(out, 'frames', String(f).padStart(5, '0') + '.png') })
    }
  } finally { await page.close().catch(() => {}) }

  const ff = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' }).stdout.trim()
  if (!ff) {
    writeFileSync(path.join(out, 'make-mp4.sh'),
      `#!/bin/sh\n# X takes mp4 and not webm, and macOS has no transcoder that reads webm.\n`
      + `#   brew install ffmpeg\n\nffmpeg -y -framerate ${fps} -i frames/%05d.png \\\n`
      + `  -c:v libx264 -pix_fmt yuv420p -preset slow -crf 18 \\\n`
      + `  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -movflags +faststart film.mp4\n`)
    return { at: out, frames: total, mp4: null, name: take,
      size: `${size.width} by ${size.height}`,
      why: 'ffmpeg is not installed, so the frames are the deliverable. brew install ffmpeg, then sh make-mp4.sh' }
  }
  const mp4 = path.join(out, 'film.mp4')
  const r = spawnSync(ff, ['-y', '-framerate', String(fps), '-i', path.join(out, 'frames', '%05d.png'),
    // yuv420p and even dimensions, or half the players in the world show a green frame
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', mp4], { encoding: 'utf8' })
  return r.status === 0
    ? { at: out, frames: total, mp4, name: take, size: `${size.width} by ${size.height}` }
    : { at: out, frames: total, mp4: null, name: take, size: `${size.width} by ${size.height}`, why: String(r.stderr).split('\n').slice(-3).join(' ').slice(0, 140) }
}

/* ── the room ─────────────────────────────────────────────────────────────────────────────────── */
const PAGE = () => `<html><head><meta charset="utf-8"><title>motion studio</title><style>
:root{--bg:#08090a;--panel:#0f1011;--raised:#141516;--line:rgba(255,255,255,.07);
  --line2:rgba(255,255,255,.11);--ink:#e6e6e6;--dim:#8a8f98;--faint:#5c6068;--accent:#5e6ad2}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:grid;grid-template-columns:250px 1fr;background:var(--bg);
  color:var(--ink);font:13px/1.5 ui-sans-serif,-apple-system,"Inter",sans-serif}
aside{border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.head{padding:11px 11px 12px;border-bottom:1px solid var(--line);display:grid;gap:7px}
.head span{color:var(--faint);font-size:11px;word-break:break-all;padding:0 3px;line-height:1.5}
.aim{display:flex;align-items:center;gap:6px;height:30px;padding:0 4px 0 8px;background:var(--bg);
  border:1px solid var(--line2);border-radius:7px;transition:border-color 120ms ease,box-shadow 120ms ease}
.aim:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(94,106,210,.18)}
.aim img{width:14px;height:14px;border-radius:3px;flex:none;display:none}
.aim img[src]{display:block}
.aim input{flex:1;min-width:0;background:none;border:0;outline:none;color:var(--ink);
  font:inherit;font-size:12.5px;padding:0}
.aim input::placeholder{color:var(--faint)}
.enter{display:grid;place-items:center;width:22px;height:22px;flex:none;background:var(--raised);
  color:var(--dim);border:1px solid var(--line2);border-radius:5px;font-size:12px;cursor:pointer;
  padding:0;line-height:1;transition:color 120ms ease,background 120ms ease}
.enter:hover{color:var(--ink);background:#1a1b1d}
.aim:focus-within .enter{border-color:rgba(94,106,210,.5);color:var(--ink)}
.files{overflow:auto;padding:6px;flex:0 1 auto}.files:empty{padding:0}
#sel{overflow:auto;padding-bottom:10px}
.file{display:block;width:100%;text-align:left;background:none;border:0;color:var(--dim);
  padding:6px 9px;border-radius:5px;font:inherit;font-size:12px;cursor:pointer;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.railhead{margin:10px 9px 4px;font-size:10.5px;letter-spacing:.06em;color:var(--faint)}
.railhead:first-child{margin-top:4px}
.site{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:0;
  color:var(--dim);padding:6px 9px;border-radius:5px;font:inherit;cursor:pointer;min-width:0}
.site:hover{background:var(--raised);color:var(--ink)}
.site img{width:13px;height:13px;border-radius:3px;flex:none;opacity:0}
.site img[src]{opacity:1}
.site span{display:grid;min-width:0;gap:1px}
.site b{font-weight:400;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.site i{font-style:normal;font-size:10.5px;color:var(--faint);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
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
.clock{display:inline-flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums;font-size:12.5px}
.clock b{font-weight:400;min-width:34px;text-align:right}
.clock i{font-style:normal;color:var(--faint);font-size:11px}
.clock em{font-style:normal;width:5px;height:5px;border-radius:50%;background:var(--line2);
  align-self:center;transition:background 160ms ease}
.clock em[data-ok=yes]{background:#4f9d69}.clock em[data-ok=no]{background:#d29d6b}
.icon{display:grid;place-items:center;width:28px;height:28px;padding:0;background:var(--raised);
  color:var(--dim);border:1px solid var(--line2);border-radius:6px;font:inherit;font-size:11px;
  cursor:pointer;transition:color 120ms ease,background 120ms ease}
.icon:hover{color:var(--ink);background:#1a1b1d}
.split{display:inline-flex;align-items:stretch}
.split .go{border-radius:6px 0 0 6px;border-right:0}
.split select{border-radius:0 6px 6px 0;padding:0 4px 0 7px;color:var(--dim)}
.menu[hidden]{display:none}
.menu{position:absolute;top:44px;right:14px;z-index:20;display:grid;gap:9px;padding:12px;width:214px;
  background:var(--panel);border:1px solid var(--line2);border-radius:9px;
  box-shadow:0 12px 34px rgba(0,0,0,.5)}
.menu label{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:12px;color:var(--dim)}
.menu label.row{justify-content:flex-start;gap:8px}
.menu select{flex:1;max-width:118px}
.menu input{flex:1;max-width:150px;min-width:0;height:24px;padding:0 7px;background:var(--bg);
  color:var(--ink);border:1px solid var(--line);border-radius:5px;font:inherit;font-size:11.5px}
.menu input:focus{outline:none;border-color:var(--accent)}
.menu .btn{width:100%}
.mrow{display:flex;gap:5px}.mrow .btn{flex:1}
.menu .keys{margin:2px 0 0;padding-top:9px;border-top:1px solid var(--line);
  font-size:10.5px;color:var(--faint);line-height:1.7}
.menu.wide{width:262px}
.menu.reel{width:340px;gap:8px}
.menu.reel video{width:100%;border-radius:6px;background:#000;display:block}
#reelget{width:100%;justify-content:center;text-decoration:none;text-align:center}
.ihead{margin:0;font-size:12px;color:var(--dim)}
.ihead em{font-style:normal;color:var(--ink)}
.ifacts{margin:-3px 0 3px;font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;line-height:1.6}
#tapply{width:100%;justify-content:center;margin-top:2px}
figure.chosen{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
figure{cursor:pointer}
figure .row button{cursor:pointer}
header{position:relative}
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
.facts{color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.seen{color:var(--faint);font-size:11px;font-variant-numeric:tabular-nums}
.grid.solo{grid-template-columns:1fr}
.grid.solo figure:not(.up){display:none}
.grid.solo figure.up iframe{height:calc(100vh - 210px)}
.backer{grid-column:1/-1;display:flex;justify-content:flex-end;margin:-4px 2px 0}
.row{display:flex;gap:6px;margin-top:4px}
.mini{height:24px;padding:0 9px;font-size:11.5px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:5px;cursor:pointer;font-family:inherit}
.mini:hover{color:var(--ink)}
.mini.keep{border-color:rgba(94,106,210,.5);color:var(--ink)}
.empty{padding:40px;color:var(--faint);text-align:center;grid-column:1/-1;line-height:1.8}
.wait{grid-column:1/-1;display:grid;place-items:center;padding:16vh 0 0}
.field{font:11px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);
  letter-spacing:3px;user-select:none;white-space:nowrap}
.field i{font-style:normal;opacity:0}

.hint{margin:4px 10px;font-size:12px;color:var(--faint);line-height:1.7}
.selhead{margin:12px 12px 6px;font-size:10.5px;text-transform:none;letter-spacing:.06em;color:var(--faint)}
.pill{display:flex;align-items:center;gap:8px;margin:5px 10px;padding:6px 6px 6px 7px;background:var(--raised);
  border:1px solid var(--line);border-radius:7px;font-size:11.5px;color:var(--dim)}
.shot{flex:none;width:86px;height:52px;border-radius:4px;overflow:hidden;background:#0b0c0d;
  border:1px solid var(--line);position:relative}
.shot iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}
.pill .who em{font-style:normal;color:var(--ink);font-size:11.5px}
.pill .who u{text-decoration:none;color:#d29d6b;font-size:10px;line-height:1.35}
.pill b{display:grid;place-items:center;width:15px;height:15px;flex:none;border-radius:4px;
  background:var(--accent);color:#fff;font-size:9.5px;font-weight:500}
.pill .who{display:grid;gap:2px;min-width:0;overflow:hidden;flex:1}
.pill .who i{font-style:normal;color:var(--faint);font-size:10px;font-variant-numeric:tabular-nums}
.pill button{margin-left:auto;background:none;border:0;color:var(--faint);cursor:pointer;
  font-size:14px;line-height:1;padding:0 2px}
.pill button:hover{color:var(--ink)}
.hint b{color:var(--dim);font-weight:500}
.appwrap{grid-column:1/-1;height:calc(100vh - 116px);border:1px solid var(--line);border-radius:8px;
  overflow:hidden;background:#fff}
/* the rail and its sequence share the height: the timeline used to be laid out below the frame and
   therefore below the fold, which is a poor place for the one thing that explains what you are
   watching */
.grid.railed .appwrap{height:calc(100vh - 116px - var(--tl, 170px))}
.appwrap iframe{width:100%;height:100%}
.tl{grid-column:1/-1;margin:10px 0 0;padding:11px 12px 9px;background:var(--panel);
  border:1px solid var(--line);border-radius:8px;position:relative}
.tlhead{font-size:10.5px;color:var(--faint);letter-spacing:.06em;margin-bottom:8px}
.tlrow{display:flex;align-items:center;gap:10px;margin:5px 0}
.tlname{display:flex;align-items:center;gap:7px;width:150px;flex:none;font-size:11.5px;
  color:var(--dim);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tlcam{flex:none;width:74px;font-size:10px;color:var(--faint);text-align:right;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlcam.on{color:var(--accent)}
.tlshot{height:20px;flex:none;width:88px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:5px;font:inherit;font-size:10.5px;padding:0 3px}
.grip{width:14px;flex:none;color:var(--faint);font-size:9px;letter-spacing:-2px;cursor:grab;
  user-select:none;touch-action:none;line-height:1}
.grip:active{cursor:grabbing;color:var(--ink)}
.tlrow.lifting{opacity:.55}
.tlrow{border-radius:6px;padding:2px 4px;cursor:pointer}
.tlrow.on{background:rgba(94,106,210,.13);outline:1px solid rgba(94,106,210,.4)}
/* a camera move is a motion and a dropdown of five words cannot show one, so each choice performs
   a miniature of itself and you read it in a glance instead of applying it to find out */
.cams{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:1px 0 4px}
.camchip{background:var(--raised);border:1px solid var(--line);border-radius:7px;padding:5px 3px 4px;
  display:grid;gap:4px;justify-items:center;cursor:pointer;color:var(--dim);font-family:inherit}
.camchip:hover{border-color:var(--line2);color:var(--ink)}
.camchip.on{border-color:var(--accent);color:var(--ink);background:rgba(94,106,210,.14)}
.camchip em{font-style:normal;font-size:9.5px;line-height:1.15;text-align:center}
.cambox{width:100%;height:24px;border-radius:4px;background:#000;overflow:hidden;position:relative;
  display:block;perspective:60px}
.cambox i{position:absolute;left:50%;top:50%;width:17px;height:10px;margin:-5px 0 0 -8.5px;
  border-radius:2px;background:linear-gradient(120deg,#7079ea,#3a3f8f)}
.cam-none i{opacity:.3}
.cam-push i{animation:cpush 2.4s ease-in-out infinite alternate}
.cam-drift i{animation:cdrift 2.8s ease-in-out infinite alternate}
.cam-orbit i{animation:corbit 2.8s ease-in-out infinite alternate}
@keyframes cpush{from{transform:scale(.7)}to{transform:scale(1.4)}}
@keyframes cdrift{from{transform:translate(-4px,2px) scale(1.18)}to{transform:translate(4px,-2px) scale(.88)}}
@keyframes corbit{from{transform:rotateY(-34deg) scale(1.05)}to{transform:rotateY(34deg) scale(1.05)}}
@media (prefers-reduced-motion:reduce){.cambox i{animation:none}}
.takes{display:flex;flex-wrap:wrap;gap:4px;margin:0}
.take{background:var(--raised);border:1px solid var(--line);color:var(--dim);border-radius:5px;
  padding:2px 7px;font-size:10.5px;cursor:pointer;font-family:inherit}
.take.on{border-color:var(--accent);color:var(--ink)}
.tltrack{position:relative;flex:1;height:20px;background:var(--bg);border-radius:5px;
  border:1px solid var(--line)}
.tlbar{position:absolute;top:2px;bottom:2px;background:rgba(94,106,210,.5);
  border:1px solid var(--accent);border-radius:4px;cursor:grab;display:flex;align-items:center;
  padding:0 5px;touch-action:none}
.tlbar:active{cursor:grabbing;background:rgba(94,106,210,.72)}
.tlbar i{font-style:normal;font-size:9.5px;color:#fff;font-variant-numeric:tabular-nums;
  white-space:nowrap;pointer-events:none}
.tlfoot{display:flex;justify-content:space-between;font-size:10px;color:var(--faint);
  margin:6px 0 0;padding-left:270px;font-variant-numeric:tabular-nums}
#pick[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.chip{display:block;margin:10px;padding:8px 10px;background:var(--raised);border:1px solid var(--line2);
  border-radius:6px;font-size:11.5px;color:var(--ink);word-break:break-all}
.chip span{color:var(--faint)}
.drops{padding:0 14px 14px;color:var(--faint);font-size:11.5px;line-height:1.7}
</style></head><body>
<aside>
  <div class="head">
    <form class="aim" id="aimform" autocomplete="off">
      <img id="fav" alt="" width="14" height="14">
      <input id="url" spellcheck="false" placeholder="localhost:3000" value="${AIM ?? ''}">
      <button class="enter" id="go" title="Aim the studio here" type="submit">&#9166;</button>
    </form>
    <span id="aimnote">${AIM ? 'proxied here, so its elements can be picked'
      : HAS_FOLDER ? 'or pick a component below' : 'type where your app is running'}</span>
  </div>
  <div class="files" id="files"></div>
  <div id="sel"></div>
</aside>
<main>
  <!--
    Four things, grouped by what they act on: the source on the left, the transport in the middle,
    everything occasional behind one button on the right.

    It held eleven controls in a row before, three of them dropdowns, and a diagnostic readout and a
    permanent row of keyboard hints. Scrubbing is what this tool does all day and it was competing
    with a palette picker for attention. The occasional settings are still one click away, and the
    keyboard hints moved in there with them, where they are read once rather than looked past
    constantly.
  -->
  <header>
    <button class="btn" id="pick">Pick</button>
    <span class="split">
      <button class="btn go" id="ask">Give it motion</button>
      <select id="count" title="how many to ask for"><option>3</option><option>4</option><option selected>5</option><option>6</option></select>
    </span>
    <span class="sep"></span>
    <button class="icon" id="play" title="Play or pause (space)"><span id="glyph">❚❚</span><span id="word" hidden></span></button>
    <span class="clock"><b id="at">0.00</b><i id="span">4.2s</i><em id="driven" title="how many previews the scrubber is driving"></em></span>
    <input id="scrub" type="range" min="0" max="4200" value="0" step="10">
    <span class="sep"></span>
    <button class="icon" id="undo" disabled title="Nothing to undo">&#8630;</button>
    <button class="icon" id="redo" disabled title="Nothing to redo">&#8631;</button>
    <button class="icon" id="inspect" title="Inspect and adjust the chosen option">&#9707;</button>
    <button class="icon" id="more" title="Speed, palette, camera">&#183;&#183;&#183;</button>
    <button class="btn" id="film" title="Render what is on screen frame by frame">Film</button>
    <button class="btn" id="save">Export</button>
    <div class="menu reel" id="reel" hidden>
      <p class="ihead">Film <em id="reeltag"></em></p>
      <video id="reelvid" controls loop muted playsinline></video>
      <p class="ifacts" id="reelfacts"></p>
      <a class="btn go" id="reelget" download>Download the mp4</a>
      <div class="takes" id="takes"></div>
      <p class="keys" id="reelnote"></p>
    </div>
    <div class="menu wide" id="inspector" hidden>
      <p class="ihead">Adjust <em id="itag">nothing chosen</em></p>
      <p class="ifacts" id="ifacts">Click an option below to choose it.</p>
      <label>Speed<select id="tdur">
        <option value="0.5">twice as fast</option><option value="0.75">a little faster</option>
        <option value="1" selected>as written</option><option value="1.5">a little slower</option>
        <option value="2">half speed</option></select></label>
      <label>Spacing<select id="tstag">
        <option value="0.5">tighter</option><option value="1" selected>as written</option>
        <option value="1.5">looser</option><option value="2">twice as far apart</option></select></label>
      <label>Easing<select id="tease">
        <option value="">as written</option>
        <option value="cubic-bezier(.16,1,.3,1)">arrive and settle</option>
        <option value="cubic-bezier(.34,1.56,.64,1)">overshoot</option>
        <option value="steps(6,end)">stepped</option>
        <option value="cubic-bezier(.4,0,1,1)">leave</option></select></label>
      <div id="icam" hidden><p class="ihead">Camera</p><div class="cams" id="cams"></div></div>
      <button class="btn go" id="tapply">Add as a new option</button>
      <p class="keys" id="inote">The original stays. Adjusting makes another one beside it.</p>
    </div>
    <div class="menu wide" id="models" hidden>
      <p class="ihead">Writing with <em id="mtag">the default</em></p>
      <label>Service<select id="mprov"></select></label>
      <p class="ifacts" id="mnote"></p>
      <label>Model<input id="mmodel" list="mlist" spellcheck="false" placeholder="default"></label>
      <datalist id="mlist"></datalist>
      <label id="mbaserow">Endpoint<input id="mbase" spellcheck="false" placeholder="default"></label>
      <label id="mkeyrow">Key<input id="mkey" type="password" spellcheck="false" placeholder="not set"></label>
      <span class="mrow"><button class="btn go" id="msave">Use this</button>
        <button class="btn" id="mtest">Test it</button>
        <button class="btn" id="mforget" title="Remove the stored key">Forget key</button></span>
      <p class="keys" id="mout">The key is kept in .studio on this machine and never sent to the page.</p>
    </div>
    <div class="menu" id="menu" hidden>
      <label>Speed<select id="rate"><option>0.25x</option><option>0.5x</option>
        <option selected>1x</option><option>2x</option></select></label>
      <label>Palette<select id="palette">
        ${PRESETS.map((p, i) => `<option${i === 1 ? ' selected' : ''}>${p.name}</option>`).join('')}
      </select></label>
      <label>Shot<select id="cam">
        <option value="">no camera</option>
        <option value="locked">locked off</option>
        <option value="push">slow push</option>
        <option value="drift">drift</option>
        <option value="orbit">orbit</option></select></label>
      <label>Film<select id="shape">
        <option value="wide" selected>wide 1280</option>
        <option value="square">square 1080</option>
        <option value="tall">tall 1080</option></select></label>
      <label>Lens<select id="depth">
        <option value="0.4">shallow</option><option value="1" selected>as shot</option>
        <option value="1.6">heavy</option></select></label>
      <button class="btn" id="modelbtn">Model and service</button>
      <p class="keys"><kbd>Space</kbd> play <kbd>&larr;</kbd><kbd>&rarr;</kbd> step <kbd>Esc</kbd> stop picking
        <kbd>&#8984;Z</kbd> undo <kbd>&#8984;&#8679;Z</kbd> redo</p>
    </div>
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
let opened=null   // the option filling the room, or null for the grid
let aimN=0   // bumped on every aim so the frame refetches instead of reusing the last page
let quietMode=false
/* a frame that has navigated to somebody else's origin is one we can no longer read, and the only
   answer that works is to load it again with its scripts refused */
function watchFrame(){
  const f=grid.querySelector('.appwrap iframe'); if(!f) return
  let tries=0
  const check=()=>{
    if(!document.contains(f)) return
    let ours=true, alive=0
    try{ ours = f.contentWindow.location.host===location.host
      const d=f.contentWindow.document
      alive = d && d.documentElement ? d.querySelectorAll('*').length : 0
    }catch(_){ ours=false }
    /* two ways a page refuses to be looked at: it takes the frame somewhere else, or it destroys its
       own document where it stands. railway does the second, deciding it has hit a server error and
       emptying itself, which leaves the frame ours and completely blank. Both want the same answer */
    if((!ours || (tries>2 && alive<20)) && !quietMode){
      quietMode=true; aimN++
      document.getElementById('aimnote').innerHTML=(ours
        ? 'that page emptied itself when its own scripts ran, '
        : 'that site moves its own frame back to its origin, ')
        +'so it is loaded again with <b>scripts refused</b>: the markup and styles are still there'
      render(); return
    }
    if(++tries<14) setTimeout(check,700)
  }
  setTimeout(check,1400)
}
let APP=${AIM ? 'true' : 'false'}
const CAN_WRITE=${CAN_WRITE ? 'true' : 'false'}
let chosen=null   // the most recent pick
let picks=[]      // everything selected, in the order it was picked
let cars=null     // the rail, once each element has been given a motion
let verdict=null  // why the last ask produced nothing, so the grid can say so

/**
 * Undo, kept over the composition rather than over the dom.
 *
 * Everything here a hand can change is a handful of small fields: which elements are picked, which
 * options exist, which one is chosen, and for a rail, the order of the cars and when each one starts
 * and what films it. So a step is a snapshot of those fields rather than a description of an edit.
 * A snapshot cannot fall out of step with the thing it describes, and there is no inverse operation
 * to write once per action and get wrong in one of them.
 *
 * The heavy fields are shared rather than copied. An option's markup and css never change after it is
 * written, so copying them into every step would spend megabytes preserving something already
 * immutable. Cars are copied, because their offset and their camera are precisely what a step is
 * usually about.
 */
const HIST=60
let past=[], ahead=[]
const snap=()=>({ picks:picks.slice(), opts:opts.slice(), chosen,
  cars: cars && cars.map(c=>({...c})), opened, chosenOpt })
function restore(st){
  picks=st.picks.slice(); opts=st.opts.slice(); chosen=st.chosen
  cars=st.cars && st.cars.map(c=>({...c})); opened=st.opened; chosenOpt=st.chosenOpt
  held.clear(); ends.clear(); drawSel(); render(); drawInspector(); drawHistory()
}
/* called before the change, so what lands on the stack is the state to come back to */
function mark(what){
  past.push({ ...snap(), what }); if(past.length>HIST) past.shift()
  ahead=[]; drawHistory()
}
function undo(){
  if(!past.length) return
  const step=past.pop(); ahead.push({ ...snap(), what:step.what })
  restore(step); drops.textContent='Undid '+step.what+'.'
}
function redo(){
  if(!ahead.length) return
  const step=ahead.pop(); past.push({ ...snap(), what:step.what })
  restore(step); drops.textContent='Redid '+step.what+'.'
}
function drawHistory(){
  const u=document.getElementById('undo'), r=document.getElementById('redo')
  if(!u||!r) return
  u.disabled=!past.length; r.disabled=!ahead.length
  u.title=past.length?'Undo '+past[past.length-1].what:'Nothing to undo'
  r.title=ahead.length?'Redo '+ahead[ahead.length-1].what:'Nothing to redo'
}
addEventListener('keydown',e=>{
  /* a field with a cursor in it has an undo of its own and the browser's is the better one there,
     so this only answers when the keystroke was aimed at the room rather than at a control */
  const t=e.target, tag=t&&t.tagName
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return
  if(!(e.metaKey||e.ctrlKey)) return
  const k=String(e.key).toLowerCase()
  if(k==='z'&&!e.shiftKey){ e.preventDefault(); undo() }
  else if((k==='z'&&e.shiftKey)||k==='y'){ e.preventDefault(); redo() }
})

const pickBtn=document.getElementById('pick')
pickBtn.onclick=()=>{
  const want=pickBtn.getAttribute('aria-pressed')!=='true'
  pickBtn.setAttribute('aria-pressed',want)
  const f=document.querySelector('.appwrap iframe')
  if(f) f.contentWindow.postMessage({wall:want?'pick':'nopick'},'*')
}
/* aiming somewhere new: the frame reloads, the selection is somebody else's page now, and the
   favicon is asked for once the target has actually changed rather than optimistically */
const aimform=document.getElementById('aimform'), urlbox=document.getElementById('url')
aimform.onsubmit=async e=>{
  e.preventDefault()
  const said=urlbox.value.trim(); if(!said) return
  document.getElementById('aimnote').textContent='reaching it…'
  const r=await fetch('/__wall/target',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({url:said})}).then(x=>x.json()).catch(e=>({error:String(e)}))
  if(r.error){ document.getElementById('aimnote').textContent=r.error; return }
  urlbox.value=r.at; APP=true; aimN++; quietMode=false; picks=[]; opts=[]; verdict=null; chosen=null; cars=null
  // the folder list is about somewhere else now
  drawRail(r.recent||[])
  document.getElementById('aimnote').textContent='proxied here, so its elements can be picked'
  document.getElementById('fav').src='/__wall/favicon?t='+Date.now()
  pickBtn.style.display=''
  drawSel(); render()
}
if(APP){ document.getElementById('fav').src='/__wall/favicon' } else { pickBtn.style.display='none' }
render()
/**
 * The rail lists where this has been, and falls back to the components in the repo when it has been
 * nowhere yet. Both are labelled, because a list of addresses and a list of files are different
 * things and an unlabelled mixture of the two would be worse than either.
 */
let files=[]
function drawRail(recent){
  const rail=document.getElementById('files')
  const rows=[]
  if(recent.length) rows.push('<p class="railhead">Recent</p>'
    +recent.map(r=>'<button class="site" data-go="'+r.href+'">'
      +'<img src="/__wall/favicon?host='+encodeURIComponent(r.href)+'" alt="" width="13" height="13">'
      +'<span><b>'+r.host+'</b>'+(r.path?'<i>'+r.path.slice(0,26)+'</i>':'')+'</span></button>').join(''))
  if(files.length && !recent.length) rows.push('<p class="railhead">In this repo</p>'
    +files.map(f=>'<button class="file" data-f="'+f+'">'+f.split('/').slice(-2).join('/')+'</button>').join(''))
  rail.innerHTML=rows.join('')
  rail.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
    urlbox.value=b.dataset.go; aimform.requestSubmit()
  })
  rail.querySelectorAll('.file').forEach(b=>b.onclick=()=>{
    file=b.dataset.f
    rail.querySelectorAll('.file').forEach(x=>x.setAttribute('aria-current',x===b))
    opts=[]; verdict=null; cars=null; held.clear(); drops.textContent=''; render()
  })
}
Promise.all([fetch('/__wall/list').then(r=>r.json()), fetch('/__wall/recent').then(r=>r.json())])
  .then(([fs,rs])=>{ files=fs; drawRail(rs) })

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

/**
 * The waiting state, which is the one piece of motion in here the studio wrote itself.
 *
 * "Asking for 5 motions. About thirty seconds." was a sentence in a large empty room, and it broke
 * two of the rules this tool enforces on everything else: nothing moved, and what little it said was
 * a guess at a duration rather than a report of anything. A tool about motion showing a still while
 * it works is the wrong advertisement.
 *
 * So it is a stepped wave and a braille turn, and it obeys the same craft the gates demand: only
 * transform and opacity, delays forty milliseconds apart, a steps() timing that jerks the way a
 * mechanism does rather than easing the way a default does. The glyph is animated through the content
 * property, which is the only honest way to do ascii in css.
 */
const WAITER = () => '<div class="wait"><div class="field" id="field"></div></div>'

/**
 * The waiting state is a small shader written in characters.
 *
 * Two sine fields crossing at different rates, sampled per cell, mapped onto a ramp that runs from
 * nothing to a full block. It is the oldest trick in graphics and it still reads better than a
 * spinner, because a spinner says only that something is happening while a field says the thing
 * happening is continuous and has a shape.
 *
 * Sparse on purpose. The ramp starts with two blank steps so most of the grid is empty at any moment
 * and what remains is a drifting suggestion rather than a wall of glyphs, which is the difference
 * between this and every terminal loading animation.
 */
const SHADER = [
  '(function(){',
  "var host=document.getElementById('field'); if(!host) return",
  'var COLS=64, ROWS=16, N=COLS*ROWS',
  /* Built once and then only its opacity changes.
     A ramp of glyphs steps between characters, and steps are what made the last one read as a
     terminal animation rather than a field. One glyph everywhere with a continuous brightness is the
     smooth version of the same idea, and opacity is the one property that costs nothing to change. */
  "var frag=document.createDocumentFragment(), cells=[]",
  'for(var i=0;i<N;i++){',
  "  var c=document.createElement('i')",
  "  c.textContent='\u00b7'",
  '  frag.appendChild(c); cells.push(c)',
  "  if(i%COLS===COLS-1) frag.appendChild(document.createElement('br'))",
  '}',
  'host.appendChild(frag)',
  'var t=0',
  'function frame(){',
  '  if(!document.body.contains(host)) return',
  '  t+=0.055',
  '  for(var y=0;y<ROWS;y++){',
  '    for(var x=0;x<COLS;x++){',
  /* one field folded into the next, which is what stops it looking like a grid of sine waves */
  '      var q=Math.sin(x*0.13+t*0.9)+Math.cos(y*0.21-t*0.6)',
  '      var r=Math.sin((x*0.07+y*0.11)+q*0.8+t*0.5)',
  '      var v=Math.sin(x*0.05-y*0.08+r*1.6+t*0.35)',
  '      var a=(v+1)/2',
  '      a=a*a*(3-2*a)',
  /* raised to a power so most of the grid falls away and only the crests are lit: a field where
     every cell is half on reads as a grey rectangle rather than as something moving through */
  '      a=a*a*a',
  /* and a soft round falloff, because the edge of the grid is not part of the picture */
  '      var dx=(x/COLS-0.5)*2.05, dy=(y/ROWS-0.5)*2.05',
  '      var d=Math.sqrt(dx*dx+dy*dy)',
  '      var m=1-Math.min(1,Math.max(0,(d-0.25)/0.85))',
  '      m=m*m*(3-2*m)',
  '      cells[y*COLS+x].style.opacity=(a*m).toFixed(3)',
  '    }',
  '  }',
  '  requestAnimationFrame(frame)',
  '}',
  'frame()',
  '})()',
].join(String.fromCharCode(10))

/**
 * What a motion is actually made of, read off its own stylesheet.
 *
 * The note names the idea and the card showed nothing else, so choosing between five of them meant
 * watching each in turn and holding the differences in your head. Every fact worth knowing is already
 * in the css: how many parts move, how far apart they start, how long one takes, and which properties
 * are touched. That last one is the difference between motion that holds sixty frames and motion that
 * does not, and it is the first thing anybody experienced would ask.
 */
/**
 * The facts come from the server, which computes them with the same tested function the gates use.
 *
 * There were two implementations of this: tempo() in typescript and a regex copy in this page. The
 * copy shipped two bugs on its own, reading 3.2s as 2s because its pattern could not see a decimal
 * point, and throwing on load because a backslash in a template literal is eaten before the browser
 * sees it. One implementation, measured once.
 */
/* what the rendering saw, beside what the sheet says: the two answer different questions */
const seenLine = (o)=>{
  const v=o.seen; if(!v) return ''
  const bits=[v.stir+'% of it moves']
  if(v.blank) bits.push(v.blank+'% blank at the first frame')
  if(v.escape) bits.push('strays '+v.escape+'px outside')
  return bits.join(' &middot; ')
}
const factLine = (o)=>{
  const t=o.tempo; if(!t) return ''
  const bits=[]
  const parts=(t.gaps?t.gaps.length:0)+1
  bits.push(parts>1?parts+' parts':'one part')
  if(t.gaps&&t.gaps.length) bits.push(Math.round(t.gaps.reduce((a,b)=>a+b,0)/t.gaps.length)+'ms apart')
  if(t.durations&&t.durations.length) bits.push(Math.round(Math.max.apply(null,t.durations))+'ms each')
  if(t.span) bits.push('over in '+(t.span/1000).toFixed(1)+'s')
  if(t.paints&&t.paints.length) bits.push(t.paints.slice(0,3).join(', '))
  return bits.join(' &middot; ')
}


/** the component as it is, so the left rail is a thing you browse rather than a thing you submit */
function peek(){
  const lens=document.getElementById('depth').value
  const q='?file='+encodeURIComponent(file)+'&palette='+encodeURIComponent(palette.value)
    +(cam.value?'&camera='+cam.value+'&depth='+lens:'')
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
  if(APP && !picks.length) return alert('Press Pick element, then click something in your app.')
  if(!APP && !file) return alert('Pick a component first.')
  if(ask.disabled) return
  verdict=null
  ask.disabled=true; ask.textContent='Writing…'
  if(APP && picks.length>1){
    grid.innerHTML=WAITER(); runShader()
    drops.textContent=''
    try{
      const r=await post('/__wall/rail',{picks,palette:palette.value},420000)
      cars=(r.cars||[]).map((c,i)=>({...c, at: i*420}))
      opts=[]; held.clear(); ends.clear(); render()
      const moved=cars.filter(c=>c.id).length
      const lost=cars.filter(c=>!c.id)
      drops.innerHTML=moved+' of '+cars.length+' moved.'
        +(moved?' They begin a beat apart, and the sequence below can be dragged.':'')
        +(lost.length?'<br>'+lost.map(c=>'<b>'+c.label+'</b> did not: '+String(c.why||'')).join('<br>'):'')
    }catch(e){ verdict={dropped:[],error:String(e && e.message||e)}; render() }
    ask.disabled=false; drawSel(); return
  }
  chosen=picks[picks.length-1]||chosen
  grid.innerHTML=WAITER(); runShader()
  drops.textContent=''
  try{
    const r=await post('/__wall/motion',
      Object.assign({count:Number(document.getElementById('count').value)}, APP?chosen:{file}), 360000)
    opts=r.kept||[]; cars=null; opened=null; held.clear(); ends.clear()
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
document.getElementById('depth').onchange=render
palette.onchange=render
const menu=document.getElementById('menu'), moreBtn=document.getElementById('more')
const insp=document.getElementById('inspector'), inspBtn=document.getElementById('inspect')
let chosenOpt=null   // the option the inspector is pointed at
const reel=document.getElementById('reel'), models=document.getElementById('models')
const PANELS=[menu,insp,reel,models]
const pop=(panel)=>{ for(const q of PANELS) q.hidden = q!==panel || !q.hidden }
const shut=()=>{ for(const q of PANELS) q.hidden=true }
document.getElementById('undo').onclick=e=>{ e.stopPropagation(); undo() }
document.getElementById('redo').onclick=e=>{ e.stopPropagation(); redo() }
moreBtn.onclick=e=>{ e.stopPropagation(); pop(menu) }

/**
 * The model panel.
 *
 * The catalogue is fetched rather than written into this page, because the list of places a request
 * can go is knowledge and belongs with the rest of it, and because a worker serving this same page
 * would offer a different list: no command line there, and no localhost either.
 */
const byId=(id)=>document.getElementById(id)
let CAT=[], CUR=null
async function loadModels(){
  const r=await fetch('/__wall/model').then(r=>r.json()).catch(()=>null)
  if(!r) return
  CAT=r.providers||[]; CUR=r.current||null
  byId('mprov').innerHTML=CAT.map(p=>'<option value="'+p.id+'"'
    +(CUR&&p.id===CUR.provider?' selected':'')+'>'+p.label+'</option>').join('')
  drawModelForm(true)
}
function drawModelForm(saved){
  const p=CAT.find(x=>x.id===byId('mprov').value)||CAT[0]; if(!p) return
  const same=!!CUR&&CUR.provider===p.id
  byId('mtag').textContent=CUR?(CUR.label+(CUR.model?', '+CUR.model:'')):'the default'
  byId('mnote').textContent=(p.note||'')
    +(p.browser?' A page is allowed to call it directly, so on a deployment the key can stay in the browser.':'')
  byId('mlist').innerHTML=(p.models||[]).map(m=>'<option value="'+m+'">').join('')
  byId('mmodel').placeholder=(p.models&&p.models[0])||'model name'
  byId('mbase').placeholder=p.base||'https://your endpoint'
  /* offered by every provider that talks over http, not only the ones that demand it: a gateway or
     a self hosted endpoint usually wants a key even though nothing here can know that it does */
  byId('mkeyrow').hidden=p.shape==='cli'
  byId('mkey').title=(p.needs||[]).includes('key')?'required':'optional for this one'
  byId('mforget').hidden=!same||!CUR.hasKey
  byId('mkey').placeholder=(same&&CUR.hasKey)?'set, leave blank to keep it'
    :((p.needs||[]).includes('key')?'required':'optional')
  if(saved&&same){ byId('mmodel').value=CUR.model||''; byId('mbase').value=CUR.base||'' }
  if(!same){ byId('mmodel').value=''; byId('mbase').value=''; byId('mkey').value='' }
}
const modelForm=()=>({ provider:byId('mprov').value, model:byId('mmodel').value.trim(),
  base:byId('mbase').value.trim(), key:byId('mkey').value||undefined })
byId('modelbtn').onclick=e=>{ e.stopPropagation(); pop(models); loadModels() }
byId('mprov').onchange=()=>drawModelForm(false)
byId('msave').onclick=async()=>{
  const b=byId('msave'); b.disabled=true; b.textContent='Saving'
  const r=await fetch('/__wall/model',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(modelForm())}).then(r=>r.json()).catch(e=>({error:String(e.message||e)}))
  b.disabled=false; b.textContent='Use this'
  if(r.error){ byId('mout').textContent=r.error; return }
  CUR=r.current; byId('mkey').value=''
  byId('mout').textContent='Saved. Motion is written with '+CUR.label
    +(CUR.model?', '+CUR.model:'')+' from now on.'
  drawModelForm(true)
}
byId('mtest').onclick=async()=>{
  const b=byId('mtest'); b.disabled=true; b.textContent='Testing'
  byId('mout').textContent='Asking it for one word.'
  const r=await fetch('/__wall/model/check',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(modelForm())}).then(r=>r.json()).catch(e=>({ok:false,why:String(e.message||e)}))
  b.disabled=false; b.textContent='Test it'
  byId('mout').textContent=r.ok
    ? 'Answered in '+(r.ms/1000).toFixed(1)+' seconds, saying: '+r.said
    : 'It did not answer. '+r.why
}
byId('mforget').onclick=async()=>{
  const r=await fetch('/__wall/model',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({ ...modelForm(), key:null })}).then(r=>r.json()).catch(e=>({error:String(e.message||e)}))
  if(r.error){ byId('mout').textContent=r.error; return }
  CUR=r.current; byId('mkey').value=''
  byId('mout').textContent='The stored key is gone.'
  drawModelForm(true)
}
inspBtn.onclick=e=>{ e.stopPropagation(); pop(insp); drawInspector() }
menu.onclick=e=>e.stopPropagation()
insp.onclick=e=>e.stopPropagation()
reel.onclick=e=>e.stopPropagation()
models.onclick=e=>e.stopPropagation()
addEventListener('click',shut)
addEventListener('keydown',e=>{ if(e.key==='Escape') shut() })

/**
 * What the inspector is looking at.
 *
 * There were two rooms for this and they did not know about each other. The inspector adjusted an
 * option's speed and spacing and easing; the timeline row set a car's offset and its camera. So on a
 * rail you could say when a car started and what filmed it but not how fast it moved, and the
 * inspector sat there still showing whichever option you had opened before you built the rail. The
 * controls were never missing. They were in a room you had left.
 *
 * So a row on the timeline is a selection, and the inspector points at whatever is selected, car or
 * option. One subject at a time, one place that edits it, and the timeline stays a timeline instead
 * of growing a control panel on every row.
 */
function subject(){
  if(cars){ const c=cars.find(x=>x.id&&x.id===chosenOpt); if(c) return { kind:'car', o:c } }
  const o=opts.find(x=>x.id===chosenOpt)
  return o ? { kind:'opt', o } : null
}
const nameOf = (o) => String(o.note||o.label||'untitled').split(',')[0].slice(0,28)

const CAMS=[['','none'],['locked','locked off'],['push','slow push'],['drift','drift'],['orbit','orbit']]
function drawCams(now){
  const box=document.getElementById('cams')
  box.innerHTML=CAMS.map(c=>'<button class="camchip'+(c[0]===now?' on':'')+'" data-campick="'+c[0]+'">'
    +'<span class="cambox cam-'+(c[0]||'none')+'"><i></i></span><em>'+c[1]+'</em></button>').join('')
  box.querySelectorAll('[data-campick]').forEach(b=>b.onclick=()=>{
    const s=subject(); if(!s||s.kind!=='car') return
    if((s.o.shot||'')===b.dataset.campick) return
    mark('the camera on '+nameOf(s.o))
    s.o.shot=b.dataset.campick
    held.clear(); ends.clear(); render(); drawInspector()
  })
}
function drawInspector(){
  const s=subject()
  const tag=document.getElementById('itag'), facts=document.getElementById('ifacts')
  const btn=document.getElementById('tapply'), camrow=document.getElementById('icam')
  const note=document.getElementById('inote')
  if(!s){
    tag.textContent='nothing chosen'
    facts.innerHTML = cars && cars.some(c=>c.id)
      ? 'Click a row in the sequence below to adjust that one.'
      : 'Click an option below to choose it.'
    btn.disabled=true; camrow.hidden=true; return
  }
  const o=s.o
  tag.textContent=nameOf(o)
  btn.disabled=false
  if(s.kind==='car'){
    facts.innerHTML='Starts at '+(o.at/1000).toFixed(2)+'s and runs '+((o.ms||600)/1000).toFixed(2)+'s.'
    btn.textContent='Apply to this one'
    note.textContent='Changes this car where it sits. The others are left alone.'
    camrow.hidden=false; drawCams(o.shot||'')
  } else {
    facts.innerHTML=factLine(o)
    btn.textContent='Add as a new option'
    note.textContent='The original stays. Adjusting makes another one beside it.'
    camrow.hidden=true
  }
}
document.getElementById('tapply').onclick=async()=>{
  const s=subject(); if(!s) return
  const o=s.o, was=document.getElementById('tapply').textContent
  const btn=document.getElementById('tapply'); btn.disabled=true; btn.textContent='Adjusting…'
  const r = await post('/__wall/tune',{ id:o.id,
    duration:Number(document.getElementById('tdur').value),
    stagger:Number(document.getElementById('tstag').value),
    ease:document.getElementById('tease').value }, 20000).catch(e=>({error:String(e.message||e)}))
  btn.disabled=false; btn.textContent=was
  if(r.error){ document.getElementById('inote').textContent=r.error.slice(0,120); return }
  if(s.kind==='car'){
    /* a car is one voice in a composition, so retiming it replaces it where it stands. Adding a
       sixth car nobody asked for would be answering a different question */
    mark('adjusting '+nameOf(o))
    o.id=r.id; o.ms=(r.tempo && r.tempo.span) || o.ms; chosenOpt=r.id
    held.clear(); ends.clear(); render(); drawInspector()
    document.getElementById('inote').textContent='Applied. Undo puts it back the way it was.'
    return
  }
  // beside the one it came from, so the two can be held at the same instant and compared
  mark('adjusting '+nameOf(o))
  const at = opts.findIndex(x=>x.id===o.id)
  opts.splice(at+1, 0, { ...o, id:r.id, css:r.css, note:o.note+' (adjusted)' })
  chosenOpt=r.id; held.clear(); ends.clear(); render(); drawInspector()
  document.getElementById('inote').textContent='Added beside the original, which is untouched.'
}
/**
 * What Film is pointed at, said out loud rather than guessed.
 *
 * It used to take the first iframe in the grid. On a rail that is the rail, which is right, but on a
 * grid of five options that is option one, and it filmed it without ever saying so: you pressed Film
 * on a wall of five and got a film of whichever happened to be first. A wrong result delivered
 * confidently is worse than a refusal, so a grid of several asks you to open one first.
 */
function filmable(){
  if(cars && cars.some(c=>c.id)){
    const f=grid.querySelector('.appwrap iframe')
    return f ? { frame:f, what:'the rail' } : { why:'the rail is not on screen yet' }
  }
  if(!opts.length){
    const f=grid.querySelector('.appwrap iframe')
    return f ? { frame:f, what:'the page' } : { why:'Nothing on screen to film.' }
  }
  if(opts.length>1 && !opened)
    return { why:'Open one option first. Film takes one thing at a time, and from the grid it would '
      +'quietly take the first of '+opts.length+'.' }
  const o = opened ? opts.find(x=>x.id===opened) : opts[0]
  if(!o) return { why:'That option is gone.' }
  const f=grid.querySelector('iframe[data-i="'+opts.indexOf(o)+'"]')
  return f ? { frame:f, what:nameOf(o) } : { why:'That option is not on screen.' }
}
document.getElementById('film').onclick=async()=>{
  const aim=filmable()
  if(aim.why){ drops.textContent=aim.why; return }
  const frame=aim.frame
  const btn=document.getElementById('film'); btn.disabled=true; btn.textContent='Filming…'
  const name=(APP?(chosen&&chosen.label)||'element':(file||'film')).split('/').pop().replace(/\.[^.]+$/,'')
  try{
    const r=await post('/__wall/film',{ path:new URL(frame.src).pathname+new URL(frame.src).search,
      ms:Math.max(1200, span+400), fps:30, shape:document.getElementById('shape').value, name }, 600000)
    if(r.error){ drops.textContent=r.error }
    else if(r.mp4){
      /* shown rather than written away: a path in a status line is a thing you have to go and find,
         and the point of filming here was to stay in the room */
      document.getElementById('reeltag').textContent=r.name||name
      document.getElementById('reelfacts').textContent=
        r.frames+' frames at 30fps, '+(r.frames/30).toFixed(1)+'s, '+r.size+', of '+aim.what
      const src='/__wall/reel?name='+encodeURIComponent(r.name||name)+'&t='+Date.now()
      document.getElementById('reelvid').src=src
      const get=document.getElementById('reelget')
      get.href=src; get.setAttribute('download', name+'.mp4')
      document.getElementById('reelnote').textContent=r.mp4
      shut(); reel.hidden=false
      drops.textContent=''
    } else {
      drops.textContent='Filmed '+r.frames+' frames into '+r.at+'. '+(r.why||'')
    }
  }catch(e){ drops.textContent=String(e && e.message||e) }
  btn.disabled=false; btn.textContent='Film'
}
document.getElementById('save').onclick=async()=>{
  // a rail is a thing worth handing over too, and it was the one result you could not export
  const ids = opts.length ? opts.map(o=>o.id) : (cars||[]).filter(c=>c.id).map(c=>c.id)
  if(!ids.length) return
  const btn=document.getElementById('save'); btn.textContent='Writing…'
  const r=await fetch('/__wall/export',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({ids,palette:palette.value,
      name:(APP?(chosen&&chosen.label):file||'').split('/').pop().replace(/\.[^.]+$/,'')})}).then(r=>r.json())
  btn.textContent='Export'
  drops.textContent='Wrote '+r.at+', '+r.kb+'kb. One file, opens anywhere, no requests.'
}
document.getElementById('rate').onchange=e=>{rate=parseFloat(e.target.value)}

function render(){
  if(cars && cars.some(c=>c.id)){
    const live=cars.filter(c=>c.id)
    const ids=live.map(c=>c.id).join(',')
    const at=live.map(c=>Math.round(c.at)).join(',')
    const shots=live.map(c=>c.shot||'').join(',')
    grid.innerHTML='<div class="appwrap"><iframe data-i="0" src="/__wall/railview?ids='+ids
      +'&at='+at+'&shots='+shots+'&palette='+encodeURIComponent(palette.value)+'"></iframe></div>'
      + timeline(live)
    grid.classList.add('railed')
    // the strip is as tall as it needs to be, and the frame gives up exactly that much
    const strip=document.getElementById('tl')
    if(strip) grid.style.setProperty('--tl', (strip.getBoundingClientRect().height+14)+'px')
    wireTimeline(live)
    return
  }
  if(!opts.length && verdict) return explain()
  if(!opts.length && APP){
    /* Rebuilding this markup restarts the navigation, and a heavy site loading two hundred assets
       responds to that by aborting all of them: measured on vercel, three navigations in a row left
       the frame on chrome's error page. So the frame is only replaced when the aim has actually
       changed, and every other render leaves it loading in peace. */
    const have=grid.querySelector('.appwrap iframe')
    if(have && have.dataset.n===String(aimN)) return
    grid.innerHTML='<div class="appwrap"><iframe data-n="'+aimN+'" src="/__wall/app?n='+aimN
      +(quietMode?'&quiet=1':'')+'"></iframe></div>'
    watchFrame()
    return }
  if(!opts.length){ if(file) return peek()
    grid.innerHTML='<div class="empty">Pick a component on the left.</div>'; return }
  const lens=document.getElementById('depth').value
  const q='?palette='+encodeURIComponent(palette.value)
    +(cam.value?'&camera='+cam.value+'&depth='+lens:'')
  grid.innerHTML=opts.map((o,i)=>
    '<figure><iframe data-i="'+i+'" src="/__wall/preview/'+o.id+q+'"></iframe>'+
    '<figcaption><b>'+(o.note||'untitled')+'</b>'+
    '<span class="facts">'+factLine(o)+'</span>'+
    '<span class="seen">'+seenLine(o)+'</span>'+
    '<span class="verb">timing from '+o.verb+'</span>'+
    '<span class="note">'+o.scope+'</span>'+
    '<span class="row"><button class="mini" data-open="'+o.id+'">'+(opened===o.id?'Close':'Open')+'</button>'+
    '<button class="mini keep" data-more="'+o.id+'">More like this</button>'+
    '<button class="mini" data-copy="'+o.id+'">Copy CSS</button>'+
    '<button class="mini" data-save="'+o.id+'">Save file</button></span></figcaption></figure>').join('')
  grid.classList.remove('railed')
  grid.classList.toggle('solo', !!opened)
  if(opened && !opts.some(o=>o.id===opened)) opened=null
  document.querySelectorAll('figure').forEach((f,i)=>{
    if(opts[i] && opts[i].id===opened) f.classList.add('up')
    if(opts[i] && opts[i].id===chosenOpt) f.classList.add('chosen')
    f.onclick=e=>{
      if(e.target.closest('button')) return
      chosenOpt = opts[i] ? opts[i].id : null
      document.querySelectorAll('figure').forEach(x=>x.classList.remove('chosen'))
      f.classList.add('chosen')
      drawInspector()
    }
  })
  /* one option filling the room, because a card three hundred pixels wide is a thumbnail of a
     decision rather than the decision. Escape comes back, and the transport keeps driving it */
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{
    opened = opened===b.dataset.open ? null : b.dataset.open
    held.clear(); ends.clear(); render()
  })
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
  if(d.wall==='armed'||d.wall==='disarmed'){
    document.getElementById('pick').setAttribute('aria-pressed',d.wall==='armed')
    document.getElementById('pick').textContent=d.wall==='armed'?'Picking… (esc)':'Pick element'
  }
  if(d.wall==='picked'){
    chosen={html:d.html,css:d.css,shot:d.shot,label:d.label,w:d.w,h:d.h,n:d.n,
      cut:d.cut,opaque:d.opaque,weak:d.weak}
    picks.push(chosen)
    drawSel()
    paint()
  }})

/**
 * The pill shows the element rather than naming it.
 *
 * A generated class name is not a description of anything: div.MwJdiW_container.qM tells you which
 * element the studio thinks you meant only if you happen to know that hash, and on a site built with
 * css modules or styled components every name looks like that. The element itself is unambiguous, it
 * is already here with the rules that matched it, and it costs one small frame each.
 *
 * Written into the frame rather than handed over as srcdoc, because the markup is full of quotes and
 * escaping it into an attribute is a bug waiting for the first component with a data attribute in it.
 */
const tagOf = (label) => String(label || '').split('.')[0] || 'element'

/* innerHTML does not run a script tag, so the field is driven by a function the page already has */
function runShader(){ try { eval(SHADER) } catch(e) { /* the wait is cosmetic, never fatal */ } }

function paintShots(){
  for (const f of document.querySelectorAll('[data-shot]')){
    const p = picks[Number(f.dataset.shot)]; if(!p) continue
    const d = f.contentDocument; if(!d) continue
    d.open()
    d.write('<html><head><meta charset="utf-8"><style>'
      + 'html,body{margin:0;height:100%;overflow:hidden}'
      + '#s{position:absolute;left:50%;top:50%;transform-origin:center center;width:'
      + (p.w||600) + 'px}'
      + (p.shot ? '' : p.css)
      + '</style></head><body><div id="s">' + (p.shot || p.html) + '</div><scr' + 'ipt>'
      + 'var el=document.getElementById("s");'
      + 'var k=el.firstElementChild;'
      + 'if(k){var c=getComputedStyle(k);'
      + 'if(c.position==="fixed"||c.position==="absolute"||c.position==="sticky"){'
      + 'k.style.position="relative";k.style.inset="auto"}}'
      + 'var r=el.getBoundingClientRect();'
      + 'var s=Math.min(1,(innerWidth-4)/Math.max(r.width,1),(innerHeight-4)/Math.max(r.height,1));'
      + 'el.style.transform="translate(-50%,-50%) scale("+s.toFixed(4)+")";'
      + '</scr' + 'ipt></body></html>')
    d.close()
  }
}

/**
 * The sequence, drawn.
 *
 * A rail is a composition and it was being presented as a stack of boxes, with the order encoded in
 * an invisible constant: every car started 420ms after the one above it and nothing said so or let
 * you change it. Which is to say the one thing a rail is actually for, deciding what happens when,
 * was the one thing you could not see or touch.
 *
 * So each car is a bar, placed where it starts and as long as it runs. Drag one and that car moves in
 * time. The playhead is the same scrubber that drives the previews, so what you read here and what
 * you watch above it are the same clock.
 */
function railSpan(live){
  return Math.max(1200, ...live.map(c=>c.at + (c.ms||600))) * 1.04
}
function timeline(live){
  const total=railSpan(live)
  return '<div class="tl" id="tl"><div class="tlhead">Sequence &middot; click a row to adjust it, '
    + 'drag a bar to move it in time</div>'
    + live.map((c,i)=>'<div class="tlrow'+(c.id===chosenOpt?' on':'')+'" data-row="'+i+'">'
        +'<span class="grip" data-grip="'+i+'" title="drag to reorder">&#8942;&#8942;</span>'
        +'<span class="tlname" title="'+(c.note||'')+'">'
        +((c.note||c.label||'').split(',')[0]).slice(0,24)+'</span>'
        +'<span class="tlcam'+(c.shot?' on':'')+'">'
        +(CAMS.find(x=>x[0]===(c.shot||''))||CAMS[0])[1]+'</span>'
        +'<span class="tltrack" data-track="'+i+'">'
        +'<span class="tlbar" data-bar="'+i+'" style="left:'+(c.at/total*100).toFixed(2)+'%;'
        +'width:'+Math.max(2,(c.ms||600)/total*100).toFixed(2)+'%">'
        +'<i>'+(c.at/1000).toFixed(2)+'s</i></span></span></div>').join('')
    + '<div class="tlfoot"><span>0s</span><span>'+(total/1000).toFixed(1)+'s</span></div>'
    + '<div class="tlhead" id="tlplay"></div></div>'
}
function selectRow(i, live){
  const c=live[i]; if(!c) return
  chosenOpt=c.id
  document.querySelectorAll('.tlrow').forEach((r,j)=>r.classList.toggle('on', j===i))
  shut(); insp.hidden=false
  drawInspector()
}
function wireTimeline(live){
  const total=railSpan(live)
  /**
   * Order, dragged.
   *
   * Offsets say when a car starts and order says where it sits in the film, and they are not the same
   * decision: two cars can begin together and still need one above the other. Reordering swaps their
   * places in the rail and leaves each one's offset alone, so moving a car does not silently retime it.
   */
  /**
   * Clicking a row aims the inspector at that car, which is where its camera and its timing both
   * live now.
   *
   * The bar is not excluded from this even though the bar is also the drag handle. It is the most
   * obvious thing in the row to click, it sits across the middle of it, and a first version that
   * ignored clicks landing on it meant aiming at the centre of a row did nothing at all. A press
   * that never moves is a click and selects; one that moves is a drag and retimes.
   */
  for (const row of document.querySelectorAll('.tlrow')){
    row.onclick=e=>{
      // always, or the document listener below closes the panel this just opened
      e.stopPropagation()
      if(e.target.closest('[data-grip]')) return
      selectRow(Number(row.dataset.row), live)
    }
  }
  for (const grip of document.querySelectorAll('[data-grip]')){
    grip.onpointerdown=e=>{
      e.preventDefault()
      const from=Number(grip.dataset.grip)
      const rows=[...document.querySelectorAll('.tlrow')]
      const tops=rows.map(r=>r.getBoundingClientRect().top+r.getBoundingClientRect().height/2)
      rows[from].classList.add('lifting')
      let to=from
      const move=ev=>{
        to=tops.reduce((best,t,i)=>Math.abs(ev.clientY-t)<Math.abs(ev.clientY-tops[best])?i:best,from)
        rows.forEach((r,i)=>r.style.outline = i===to&&i!==from ? '1px solid var(--accent)' : '')
      }
      const up=()=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        rows[from].classList.remove('lifting'); rows.forEach(r=>r.style.outline='')
        if(to!==from){
          mark('reordering the rail')
          const order=cars.filter(c=>c.id)
          order.splice(to,0,order.splice(from,1)[0])
          const rest=cars.filter(c=>!c.id)
          cars=order.concat(rest)
          held.clear(); ends.clear(); render()
        }
      }
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
  for (const bar of document.querySelectorAll('[data-bar]')){
    bar.onpointerdown=e=>{
      e.preventDefault()
      const i=Number(bar.dataset.bar), track=bar.parentElement
      const w=track.getBoundingClientRect().width, from=e.clientX, was=live[i].at
      let stepped=false
      const move=ev=>{
        if(!stepped){ stepped=true; mark('moving '+nameOf(live[i])+' in time') }
        const at=Math.max(0, was + (ev.clientX-from)/w*total)
        live[i].at=at
        bar.style.left=(at/total*100).toFixed(2)+'%'
        bar.querySelector('i').textContent=(at/1000).toFixed(2)+'s'
      }
      const up=()=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        if(!stepped) return selectRow(i, live)
        // only reload the frame when the drag ends, or every pixel would restart the page
        held.clear(); ends.clear(); render()
      }
      /* on the window rather than on the bar with a pointer capture: the cursor leaves a twelve
         pixel bar within one frame of any real drag, and capture was not holding it. Synthetic
         events fired straight at the bar worked, which is exactly the shape of bug that passes a
         unit test and fails a hand */
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
}

/* the selection, which is the thing a rail is built out of */
function drawSel(){
  const el=document.getElementById('sel')
  if(!picks.length){ el.innerHTML=''; ask.textContent='Give it motion'; return }
  el.innerHTML='<p class="selhead">Selection'+(picks.length>1?' &middot; '+picks.length:'')+'</p>'
    +picks.map((p,i)=>'<span class="pill"><b>'+(i+1)+'</b>'
      +'<span class="shot"><iframe data-shot="'+i+'" scrolling="no" tabindex="-1"></iframe></span>'
      +'<span class="who"><em>'+tagOf(p.label)+'</em><i>'+p.w+'&times;'+p.h
      +(p.cut?' &middot; trimmed':'')+'</i>'
      +(p.weak?'<u>'+p.weak+'</u>':'')
      +(p.opaque?'<u>'+p.opaque+' sheet'+(p.opaque>1?'s':'')+' unreadable</u>':'')+'</span>'
      +'<button data-drop="'+i+'" title="remove">&times;</button></span>').join('')
    +(picks.length>1?'<p class="hint">These will be given one motion each and played on one '
      +'timeline, each starting a beat after the one above it.</p>':'')
    +(picks.some(x=>x.weak)?'<p class="hint">A pick with little inside it has nothing to stagger. '
      +'A container with several sibling parts, like a row of cards or a list, gives motion more to '
      +'work with.</p>':'')
  // after the markup exists, not in the middle of building it
  paintShots()
  el.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>{
    mark('removing '+tagOf(picks[Number(b.dataset.drop)].label))
    picks.splice(Number(b.dataset.drop),1); chosen=picks[picks.length-1]||null
    cars=null; opts=[]; drawSel(); render() })
  ask.textContent=picks.length>1?'Give them motion':'Give it motion'
}
function paint(){
  /* only the previews in the grid: the sidebar thumbnails and the proxied app are iframes too, and
     counting them made the readout say 3 of 5 driven when all five were fine. That is the wandering
     number I could not pin down all session, and it was this */
  /* a preview inside a hidden figure stops running and stops replying, so counting it says one of
     two are driven when the one you are looking at is fine */
  const frames=[...document.querySelectorAll('.grid iframe')].filter(f=>f.offsetParent!==null)
  if(!opts.length&&!(cars&&cars.some(c=>c.id))){
    link.removeAttribute('data-ok'); link.title='nothing to drive yet'; return }
  /* counted over the frames that are actually on screen rather than over everything the map still
     remembers, or closing an opened option reports five of one */
  const live=frames.filter((f,i)=>(held.get(i)||0)>0).length
  const all=live===frames.length
  link.setAttribute('data-ok', all?'yes':'no')
  link.title=live+' of '+frames.length+' previews are being driven by the scrubber'
}
function hold(ms){
  ;[...document.querySelectorAll('.grid iframe')].filter(f=>f.offsetParent!==null).forEach((f,i)=>{
    try{f.contentWindow.postMessage({wall:'hold',t:ms,i},'*')}catch(_){}
  })
  scrub.value=ms; at.textContent=(ms/1000).toFixed(2)
}
function face(){document.getElementById('glyph').textContent=running?'❚❚':'▶'
  play.title=running?'Pause (space)':'Play (space)'}
requestAnimationFrame(function tick(now){const s=now-last;last=now
  if(running){t=(t+s*rate)%span;hold(t)} requestAnimationFrame(tick)})
play.onclick=()=>{running=!running;face()}
scrub.oninput=()=>{running=false;face();t=Number(scrub.value);hold(t)}
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'&&e.target.type!=='range')return
  // escape leaves pick mode from either side: the frame has its own handler, but the pointer being
  // over the frame does not mean the frame has focus, and a key that works only sometimes reads broken
  if(e.key==='Escape'&&opened){ opened=null; held.clear(); ends.clear(); render(); return }
  if(e.key==='Escape'&&document.getElementById('pick').getAttribute('aria-pressed')==='true'){
    const f=document.querySelector('.appwrap iframe')
    if(f) f.contentWindow.postMessage({wall:'nopick'},'*')
    return
  }
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

/**
 * The page and the picker are both built inside template literals, and a backtick or a stray brace in
 * a comment ends one silently. It has happened five times: a comment mentioning a css shorthand in
 * backticks terminated the picker, a duplicated block declared SHADER twice, and each time the studio
 * started, served, and answered every request while the page itself was broken in the browser.
 *
 * new Function is the cheapest parser there is. It compiles the script and throws on a syntax error
 * without running a line of it, so a page that cannot parse is caught here rather than by a person
 * wondering why the sidebar is empty.
 */
function scriptsParse() {
  const page = PAGE()
  const blocks = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  for (const [i, code] of blocks.entries()) {
    if (!code.trim()) continue
    try { new Function(code) } catch (e) {
      return `script ${i + 1} of ${blocks.length} in the studio page does not parse: ${e.message}`
    }
  }
  // the picker is assembled separately and injected into somebody else's document
  const inner = PICKER.replace(/^<script>/, '').replace(/<\/script>$/, '').replace(/<\\\/script>/g, '')
  try { new Function(inner) } catch (e) { return `the picker does not parse: ${e.message}` }
  return ''
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE()) }
    if (url.pathname === '/__wall/list') return json(res, HAS_FOLDER ? list() : [])
    if (url.pathname === '/__wall/recent') return json(res, recent)
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
        url.searchParams.get('camera'), url.searchParams.get('palette'),
        Number(url.searchParams.get('depth')) || 1))
    }
    if (url.pathname.startsWith('/__wall/preview/')) {
      const o = made.get(url.pathname.split('/')[3])
      if (!o) { res.writeHead(404); return res.end('gone') }
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(preview(o, url.searchParams.get('camera'), url.searchParams.get('palette'),
        Number(url.searchParams.get('depth')) || 1))
    }
    if (url.pathname === '/__wall/motion' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const src = body.html ? { html: body.html, css: body.css ?? '', shot: body.shot ?? '',
        label: body.label ?? 'element', w: Number(body.w) || 0 }
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
    if (url.pathname === '/__wall/rail' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const picks = (body.picks ?? []).slice(0, 8)
      console.log(`  rail of ${picks.length}: ${picks.map((p) => p.label).join(', ').slice(0, 90)}`)
      const cars = await railOf(picks, body.palette)
      console.log(`    ${cars.filter((c) => c.id).length} of ${picks.length} moved`)
      for (const c of cars.filter((c) => !c.id)) console.log(`      ${c.label}: ${String(c.why).slice(0, 120)}`)
      return json(res, { cars })
    }
    if (url.pathname === '/__wall/railview') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const at = (url.searchParams.get('at') ?? '').split(',').map(Number).filter((n) => !Number.isNaN(n))
      const shots = (url.searchParams.get('shots') ?? '').split(',')
      const html = railView(ids, url.searchParams.get('palette'), at, shots)
      if (!html) { res.writeHead(404); return res.end('gone') }
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(html)
    }
    /**
     * Changing an option that already works, without asking for another one.
     *
     * Slower, further apart, land harder: every one of those is arithmetic on numbers already in the
     * sheet. Going back to the model costs ten seconds and returns something that is not quite the
     * thing you liked, so this rewrites the times in place and hands back a new option beside the
     * original. The original stays, because an adjustment you cannot undo is not an adjustment.
     */
    if (url.pathname === '/__wall/tune' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const base = made.get(body.id)
      if (!base) { res.writeHead(404); return res.end('gone') }
      const css = retimed(base.css, {
        duration: Number(body.duration) || 1,
        stagger: Number(body.stagger) || 1,
        ease: body.ease || undefined,
      })
      // the gates still apply: a retime that flattens a stagger to nothing is not an improvement
      const faults = [...unmoved({ html: '', css, note: '' }, { parts: false }), ...brittle(css), ...janky(css)]
      if (faults.length) return json(res, { error: faults[0] })
      const id = String(nextId++)
      keep(id, { ...base, id, css, note: base.note })
      return json(res, { id, css, tempo: tempo(css) })
    }
    /**
     * The model, read and changed while the studio is running.
     *
     * The key never travels back out. A panel needs to know whether one is set so it can say so, and
     * nothing more, and a settings screen that helpfully shows you your own secret is how it ends up
     * in a screenshot.
     */
    if (url.pathname === '/__wall/model' && req.method === 'GET') {
      return json(res, { providers: PROVIDERS, current: publicly(MODEL), canCli: CAN_CLI })
    }
    if (url.pathname === '/__wall/model' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const next = {
        provider: String(body.provider || MODEL.provider),
        model: String(body.model ?? ''),
        base: String(body.base ?? ''),
        // an empty box means "leave it alone", or changing the model name would wipe the key. Only
        // an explicit null clears it, which is what the button marked forget sends
        key: body.key === null ? '' : (body.key ? String(body.key) : (MODEL.key || '')),
        chosen: true,
      }
      const gap = missing(next)
      if (gap.length) return json(res, { error: `${resolve(next).label} needs ${gap.join(' and ')}` })
      MODEL = next
      saveModel()
      console.log(`  writing with ${resolve(MODEL).label}${MODEL.model ? `, ${MODEL.model}` : ''}`)
      return json(res, { current: publicly(MODEL) })
    }
    if (url.pathname === '/__wall/model/check' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      // tested as typed rather than as saved, so a wrong key is caught before it is kept
      const trying = body.provider
        ? { ...body, key: body.key || (body.provider === MODEL.provider ? MODEL.key : '') || '' }
        : MODEL
      return json(res, await checkProvider(trying, { callMs: 30_000, env: CLEAN_ENV }))
    }
    if (url.pathname === '/__wall/film' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      // asked of the server rather than of a const declared two hundred lines below this handler
      const on = server.address() && server.address().port
      const where = `http://localhost:${on}${body.path || '/'}`
      console.log(`  filming ${body.path} for ${Math.round((body.ms || 3000) / 1000)}s`)
      const made = await film(where, {
        fps: Number(body.fps) || 30,
        ms: Math.max(500, Math.min(20000, Number(body.ms) || 3000)),
        size: { wide: { width: 1280, height: 720 }, square: { width: 1080, height: 1080 },
          tall: { width: 1080, height: 1350 } }[body.shape] ?? { width: 1280, height: 720 },
        name: String(body.name ?? 'film').replace(/[^-\w]/g, '-') || 'film',
      })
      if (made.mp4) console.log(`    ${made.mp4}`)
      else if (made.why) console.log(`    ${made.why}`)
      return json(res, made)
    }
    /** the film itself, so it plays in the room it was composed in */
    if (url.pathname === '/__wall/reel') {
      const name = String(url.searchParams.get('name') ?? '').replace(/[^-\w]/g, '')
      const at = path.resolve(work, name, 'film.mp4')
      if (!name || !existsSync(at)) { res.writeHead(404); return res.end('no film by that name') }
      const body = readFileSync(at)
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': body.length,
        'accept-ranges': 'none', 'cache-control': 'no-store' })
      return res.end(body)
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
      if (!HOST) { res.writeHead(404); return res.end('nothing aimed at yet: type an address') }
      /**
       * The entry page follows its redirects here rather than in the browser.
       *
       * google.com answers 301 to www.google.com, which is a different host, so rewriting the
       * Location to a path would point at the wrong site and passing it through sends the browser to
       * the real one. Either way the frame stops being ours and its dom closes. Following it on this
       * side and re-aiming at wherever it landed keeps everything inside the proxy, and apex to www is
       * the single most common thing an address a person types will do.
       */
      const quiet = url.searchParams.has('quiet')
      const landed = await settleEntry()
      if (landed && landed.error) {
        res.writeHead(502, { 'content-type': 'text/html' })
        return res.end(`<body style="font:14px ui-monospace;color:#8a8f98;background:#0f1011;padding:24px">`
          + `Cannot reach ${HOST}.<br><br>${landed.error}</body>`)
      }
      return proxy(req, res, new URL(ENTRY, 'http://x'), quiet)
    }
    if (url.pathname === '/__wall/target' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      try {
        aimAt(body.url)
        const bad = await settleEntry()
        if (bad) return json(res, { error: bad.error })
        console.log(`  aimed at ${AIM}`)
        remember(AIM)
        return json(res, { at: AIM, host: HOST, recent })
      } catch (e) { return json(res, { error: `that is not an address I can reach: ${e.message}` }) }
    }
    /**
     * The site's own mark, fetched through here rather than linked.
     *
     * A favicon from a third party service would be a request the studio makes about a page you are
     * looking at, which is somebody else learning what you are working on. The site already serves
     * one, and this is already proxying that site, so it costs nothing to ask it directly. A site
     * with no icon gets nothing rather than a placeholder that pretends.
     */
    /** a stylesheet from somewhere else, served from here so the page can read its own rules */
    if (url.pathname === '/__wall/asset') {
      const want = url.searchParams.get('u') ?? ''
      if (!/^https?:\/\//i.test(want)) { res.writeHead(400); return res.end('') }
      try {
        const r = await fetch(want, { signal: AbortSignal.timeout(12000) })
        const body = Buffer.from(await r.arrayBuffer())
        res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'text/css',
          'cache-control': 'max-age=600' })
        return res.end(body)
      } catch (e) { res.writeHead(502); return res.end('') }
    }
    if (url.pathname === '/__wall/favicon') {
      const from = url.searchParams.get('host') || HOST
      if (!from) { res.writeHead(404); return res.end('') }
      try {
        const r = await fetch(`${new URL(from).origin}/favicon.ico`, { signal: AbortSignal.timeout(4000) })
        if (!r.ok || !/image|icon/i.test(r.headers.get('content-type') ?? '')) throw new Error('none')
        res.writeHead(200, { 'content-type': r.headers.get('content-type'), 'cache-control': 'max-age=600' })
        return res.end(Buffer.from(await r.arrayBuffer()))
      } catch { res.writeHead(404); return res.end('') }
    }
    // anything not ours belongs to the app being proxied, which is how its root-relative assets
    // resolve without a single url being rewritten
    if (HOST && !OURS.test(url.pathname)) return proxy(req, res, url)
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
const broke = scriptsParse()
if (broke) {
  console.log(`\n  ${broke}`)
  console.log('  the server would run and every page it served would be dead, so it stops here\n')
  process.exit(1)
}
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
console.log(KEY ? '  a key is set, so calls go straight to the api and skip a process per option.'
    + (CAN_CLI ? ' If it is refused, the claude command takes over\n' : '\n')
  : CAN_WRITE ? '  the claude command is here, so motion can be written\n'
  : '  no claude command on PATH, so nothing can be written. Install it, or start the studio\n'
    + '  from a shell where `claude` runs, and the button will have something to call.\n')
if (!process.env.WALL_NO_OPEN) {
  const [cmd, a] = process.platform === 'darwin' ? ['open', [where]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', where]]
      : ['xdg-open', [where]]
  spawn(cmd, a, { stdio: 'ignore', detached: true }).unref()
}
