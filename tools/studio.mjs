#!/usr/bin/env node
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

import { editorRoutes } from './editor/routes.mjs'
import { createServer } from 'node:http'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasClaude } from '../shared/cli.mjs'
import { isLocal, allowed } from '../shared/guard.mjs'
import { page } from '../shared/page.mjs'
import { PROVIDERS, write as askProvider, check as checkProvider, publicly, missing, resolve }
  from '../shared/model.mjs'
import { streamText } from '../shared/providers.mjs'
import { listenNear, movedFrom } from '../shared/port.mjs'
import {
  MOTION_SYSTEM, dealMotions, dealErrands, grabJson, safeStyle, unmoved, brittle, janky, scopeOf, retimed,
  tempo, unstill, leaks, grounded, namespaced, typefaces, faceList, unfaced,
  PRESETS, themeOf, themeCss, motionBrief, motionDirection, judgeMotion,
} from '../dist-core/core.js'

const args = process.argv.slice(2)
const appAt = args.indexOf('--app')
let TARGET = appAt > -1 ? String(args[appAt + 1] ?? '').replace(/\/$/, '') : null
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
/**
 * How careful the proxy is about where it is pointed.
 *
 * A laptop wants none of it: aiming at localhost:3000 is the whole feature. Anywhere reachable by
 * somebody else wants all of it, because the same code is then an open proxy that will fetch
 * whatever it is told and serve it from your origin, and the list of things worth fetching from
 * inside a datacentre begins with the address that hands out credentials. The rules and the reasons
 * are in shared/guard.mjs, since a worker needs the same answers and has no dns to ask with.
 */
const MODE = process.env.MOTIONEER_PUBLIC ? 'public' : 'local'
const ALLOW = (process.env.MOTIONEER_ALLOW || '').split(',').map((h) => h.trim()).filter(Boolean)
const DENY = (process.env.MOTIONEER_DENY || '').split(',').map((h) => h.trim()).filter(Boolean)
const GUARD = { mode: MODE, allow: ALLOW, deny: DENY }

/** a bare host is http only when it is this machine: everywhere else redirects to https, and the
    redirect leaves the proxy, which puts the real site in the frame and closes its dom again */
const localish = (host) => isLocal(String(host).split(':')[0])

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
/**
 * With no folder given, the components in this repo, and nothing at all when there is no repo.
 *
 * This read `examples/components` relative to wherever it was started, which is right for a clean
 * checkout and wrong everywhere else: installed from npm and run in somebody's own project it went
 * looking for a folder of that name under their app, did not find one, and threw on the way up. The
 * examples are not published either, so the honest default off npm is no folder, which the room
 * already knows how to be: an address bar and nothing in the sidebar.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHIPPED = path.resolve(HERE, '..', 'examples', 'components')
const asked = args.find((a, i) => !a.startsWith('--')
  && !(cssAt > -1 && i === cssAt + 1) && !(appAt > -1 && i === appAt + 1))
/**
 * A bare address means aim there, the way anybody would expect it to.
 *
 * The one positional argument was always a folder, so `motioneer localhost:3000` set the components
 * directory to a string that is not a directory and opened an empty room saying to type an address
 * into the sidebar. That is the exact thing they had just typed. An address and a path are not
 * ambiguous in practice: a scheme, or a host with a port, or a dotted host, is not a folder anybody
 * has, and a folder that does exist wins anyway because it is checked first.
 */
const looksLikeAddress = (v) => !!v && !existsSync(v)
  && (/^https?:\/\//i.test(v) || /^[\w.-]+:\d+(\/|$)/.test(v) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v))
const aimed = !TARGET && looksLikeAddress(asked) ? asked : null
if (aimed) TARGET = aimed
const ROOT = aimed ? null : (asked ?? (existsSync(SHIPPED) ? SHIPPED : null))
const PORT = Number(process.env.MOTIONEER_PORT || 4321)
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

const HAS_FOLDER = !!ROOT && existsSync(ROOT)

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
 * The colours come from Motioneer's own presets by way of themeOf, which already knows how to turn a
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
 * Nine moves rather than one, because they answer different questions, and they come in pairs so the
 * opposite of a choice is also a choice: in and out, left and right, up and down, held and breathing.
 *
 * The first of them is the one that was missing for a long time. Every shot here used to be tilted,
 * which is the look a component wants on a landing page and exactly the wrong one for a demo of
 * software: text on a plane rotated eleven degrees is text somebody has to lean in to read, and a
 * film of a pipeline board is worth nothing if the column headings are illegible. Flat on is a real
 * answer and it is first, with the angled hold kept beside it under its own name.
 *
 * Scales stay near where they start rather than sweeping across the frame, because the subject is
 * already fitted to the stage before a camera touches it: a move from 1.34 to 1.92 is not a push,
 * it is a crop, and everything at the edge of the component leaves the picture.
 */
const SHOTS = {
  /* the one shot that asks the plate to fit the frame rather than overflow it. Every other move
     scales past the edges on purpose, which is what makes them read as a camera rather than as a
     screenshot; doing that to the shot whose whole job is legibility would crop the thing somebody
     chose it to be able to read. */
  flat: {
    from: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1) translate3d(0,0,0)',
    to: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1) translate3d(0,0,0)',
    ease: 'linear',
    plate: 'min(1000px,100%)',
  },
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
  /* the reveal, and the one shot that ends wider than it starts: a detail first and the thing it
     belongs to second, which is the order an explanation goes in */
  pull: {
    from: 'rotateX(4deg) rotateY(-5deg) rotateZ(-1deg) scale(1.9) translate3d(0,-2%,0)',
    to: 'rotateX(8deg) rotateY(-10deg) rotateZ(-2deg) scale(1.22) translate3d(0,2%,0)',
    ease: 'cubic-bezier(.25,0,.2,1)',
  },
  /* across at a constant size, because a pan that also scales is a drift, and having both means
     neither is available on its own */
  pan: {
    from: 'rotateX(7deg) rotateY(-18deg) rotateZ(-2deg) scale(1.55) translate3d(7%,0,0)',
    to: 'rotateX(7deg) rotateY(-2deg) rotateZ(-2deg) scale(1.55) translate3d(-7%,0,0)',
    ease: 'cubic-bezier(.4,0,.3,1)',
  },
  crane: {
    from: 'rotateX(14deg) rotateY(-8deg) rotateZ(-1deg) scale(1.5) translate3d(0,7%,0)',
    to: 'rotateX(2deg) rotateY(-8deg) rotateZ(-1deg) scale(1.5) translate3d(0,-6%,0)',
    ease: 'cubic-bezier(.4,0,.3,1)',
  },
  orbit: {
    from: 'rotateX(11deg) rotateY(-30deg) rotateZ(-4deg) scale(1.66) translate3d(4%,0,0)',
    to: 'rotateX(11deg) rotateY(12deg) rotateZ(2deg) scale(1.66) translate3d(-4%,0,0)',
    ease: 'cubic-bezier(.45,0,.55,1)',
  },
  drift: {
    from: 'rotateX(15deg) rotateY(-24deg) rotateZ(-9deg) scale(2.15) translate3d(6%,4%,0)',
    to: 'rotateX(9deg) rotateY(-13deg) rotateZ(-5deg) scale(1.72) translate3d(-5%,-3%,0)',
    ease: 'cubic-bezier(.4,0,.55,1)',
  },
  /* barely anything, on purpose. A held shot that is perfectly still reads as a screenshot, and the
     smallest amount of breathing is what tells somebody they are watching footage */
  sway: {
    from: 'rotateX(6deg) rotateY(-8deg) rotateZ(-1.5deg) scale(1.56) translate3d(-1.2%,.8%,0)',
    to: 'rotateX(8deg) rotateY(-11deg) rotateZ(-2.5deg) scale(1.62) translate3d(1.2%,-.8%,0)',
    ease: 'cubic-bezier(.45,0,.55,1)',
  },
}

/**
 * How long a camera runs, in one place because it is one number.
 *
 * The camera runs at least as long as the motion and never so briefly that it whips. Tied to the
 * motion so the two share a ruler, floored at two and a half seconds because a component whose
 * motion lasts 400ms would otherwise get a camera move that reads as a flinch, and capped so a slow
 * ambient loop does not drag the shot out to nothing.
 *
 * It was computed here for the preview and written as a flat 3000ms in the rail and in the export,
 * which meant the shot somebody approved was not the shot that got filmed: any motion longer than
 * about 1.9 seconds was previewed with a camera that ran longer than the one in the file. Nothing
 * looked broken at either end, which is the shape of every timing fault this studio has had.
 */
const shotLength = (css) => Math.max(2500, Math.min(6000, Math.round((tempo(css).span || 1200) * 1.6)))

/**
 * @param shot which of the nine
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
    .plate{position:relative;width:${move.plate || '1000px'};transform-style:preserve-3d;filter:brightness(1.18) contrast(1.06)}
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
addEventListener('message',function(e){var d=e.data||{};if(d.motioneer!=='hold')return;
var a=document.getAnimations(),end=0;
a.forEach(function(x){try{x.pause();x.currentTime=d.t;
  var t=x.effect&&x.effect.getComputedTiming?x.effect.getComputedTiming().endTime:0;
  if(typeof t==='number'&&isFinite(t)&&t>end)end=t}catch(_){}});
(e.source||parent).postMessage({motioneer:'held',n:a.length,i:d.i,end:Math.round(end)},'*');});<\/script>`

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
  const tw = o.tw ? `<script src="/__motioneer/tailwind.js"></script>
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
  const shotMs = shotLength(o.css)
  const chrome = camera ? STAGE(camera, shotMs, depth) : `html,body{margin:0;height:100%;overflow:hidden;
    background:var(--background,#0b0c0d);color:var(--foreground,#e6e6e6);font:14px ui-sans-serif,system-ui}
    #fit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center center;
      width:${o.wide ? o.wide + 'px' : 'max-content'}}`
  // chrome first, then the ground the element was standing on, or ours would overrule the page's
  // own background and a light site would be previewed on black with black text. A snapshot carries
  // the rest of that ground inline and is trusted over the sheet, but it cannot carry a typeface,
  // so the face rules come back on their own rather than riding a sheet we chose not to keep
  const ground = o.shot ? typefaces(o.base) : o.base
  const head = `<meta charset="utf-8">${tw}${vars}<style>${chrome}\n${ground}\n${o.css}</style>`
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
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
const HOPS = new Set([301, 302, 303, 307, 308])

async function settleEntry() {
  try {
    /**
     * Redirects followed by hand rather than by fetch, so every hop is checked before it is taken.
     *
     * With redirect set to follow, a public host that answers 302 to 169.254.169.254 has already
     * been fetched by the time anything here could refuse it: the request left, whatever it did
     * happened, and refusing to display the answer is not the same as not having asked. Checking
     * each hop first is the only version of this that actually declines.
     */
    let here = HOST + ENTRY
    let r
    for (let hop = 0; ; hop++) {
      if (hop > 8) return { error: 'that address redirects in a loop' }
      const may = await allowed(here, GUARD)
      if (!may.ok) {
        return { error: hop ? `it redirected somewhere this will not follow: ${may.why}` : may.why }
      }
      r = await fetch(here, { redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { 'user-agent': UA } })
      if (!HOPS.has(r.status)) break
      const loc = r.headers.get('location')
      if (!loc) break
      here = new URL(loc, here).href
    }
    if (r.status === 403 || r.status === 429) {
      const body = (await r.text()).slice(0, 4000)
      const wall = /just a moment|cf-browser-verification|cloudflare|captcha|are you a robot/i.test(body)
      return { error: wall
        ? 'that site is behind a bot check, which a proxy cannot pass. Nothing here can fix that.'
        : `that site answered ${r.status} to this request` }
    }
    // where it landed, which the loop above has already been allowed to reach
    const at = new URL(here)
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
      return `href="/__motioneer/asset?u=${encodeURIComponent(href)}"`
    })
  })
  const at = html.search(/<\/body>/i)
  /* the aimed host is substituted here rather than baked into the constant, which is built once at
     startup when nothing has been aimed at yet and would carry an empty string for the session */
  const picker = PICKER.replace('__MOTIONEER_HOME__',
    String(HOST || '').replace(/^https?:\/\//, '').split('/')[0])
  html = at === -1 ? html + picker : html.slice(0, at) + picker + html.slice(at)
  /**
   * Some sites navigate their own frame back to their canonical host.
   *
   * vercel.com and nextjs.org both do it: a script reads location.host, finds it is not theirs, and
   * sets it, which keeps the path and lands the frame on vercel.com/__motioneer/app. window.location
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
/**
 * An app whose own api refuses it, said out loud.
 *
 * Proxying puts somebody's application on this origin, which is the whole trick and is also a thing
 * the application can notice. One that talks to its own api on another host, api.theirs.com from
 * theirs.com, is making a cross origin call the moment it runs here, and that api allows its own
 * site and not localhost. So the fetch is refused, the app never authenticates, and it sits on its
 * loading shell for good.
 *
 * There is nothing to fix in the page: it is behaving correctly and so is the browser. What was
 * wrong is that the studio showed a dark empty box and said nothing, leaving somebody to wonder
 * whether they had picked badly or the tool was broken. This counts the refusals and names the host,
 * which is enough to know it is an authentication wall rather than a bad address.
 */
var refused={},toldAt=0;
/* the app's own back end rather than anybody's. A blocked tracker is somebody's ad blocker doing its
   job and says nothing about whether this app can run here; an api on the same registrable domain
   as the site being proxied is the app talking to itself and being told no */
var HOME="__MOTIONEER_HOME__";
function ours(host){
  var a=String(host).split('.'), b=String(HOME).split('.');
  if(a.length<2||b.length<2)return false;
  return a.slice(-2).join('.')===b.slice(-2).join('.');
}
function refusing(url){
  try{
    var host=new URL(url, location.href).host;
    if(!host||host===location.host||!ours(host))return;
    refused[host]=(refused[host]||0)+1;
    /* twice, so one flaky request on a page that is otherwise fine says nothing */
    if(refused[host]<2)return;
    if(Date.now()-toldAt<1500)return; toldAt=Date.now();
    /* the first one refused rather than the one refused most. An app asks whether it is signed in
       before it does anything else and gives up once; its telemetry keeps retrying and would win a
       count while having nothing to do with why the page is empty */
    var first=Object.keys(refused)[0];
    parent.postMessage({motioneer:'refused',host:first,n:refused[first]},'*');
  }catch(_){}
}
var realFetch=window.fetch;
if(realFetch) window.fetch=function(){
  var url=arguments[0]&&arguments[0].url?arguments[0].url:String(arguments[0]||'');
  return realFetch.apply(this,arguments).catch(function(e){ refusing(url); throw e });
};
var openXHR=window.XMLHttpRequest&&window.XMLHttpRequest.prototype.open;
if(openXHR) window.XMLHttpRequest.prototype.open=function(m,u){
  try{ this.addEventListener('error',function(){ refusing(u) }) }catch(_){}
  return openXHR.apply(this,arguments);
};
var on=false,box=null,last=null;
/**
 * Where a capture goes, which depends on where this is running.
 *
 * Proxied into the studio's own frame, it goes up to the parent, which is what it has always done.
 * Run on the page itself, as a bookmarklet, there is no parent to talk to and no way to reach the
 * studio either: an application that needs a session sends a content security policy with it, and
 * connect-src self forbids a request to localhost as firmly as it forbids anything else.
 *
 * The clipboard is the one road out that a policy does not govern, and it is enough, because a
 * capture is already self contained. Everything picked in a visit is copied together, so clicking
 * four things is four clicks and one paste rather than four of each.
 */
var framed=false; try{ framed = window.parent !== window }catch(_){ framed = true }
var mine=[];
function tell(n,sent){
  var t=document.getElementById('motioneer-said');
  if(!t){ t=document.createElement('div'); t.id='motioneer-said';
    t.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;'
      +'background:#141516;color:#e6e6e6;border:1px solid rgba(255,255,255,.14);border-radius:8px;'
      +'padding:9px 14px;font:13px ui-sans-serif,system-ui;box-shadow:0 6px 24px rgba(0,0,0,.5);'
      +'pointer-events:none';
    document.documentElement.appendChild(t) }
  t.textContent = n===0 ? 'That could not be copied. The page may not allow it.'
    : sent ? n+(n===1?' element sent':' elements sent')+' to the studio.'
    : n+(n===1?' element copied':' elements copied')+'. Paste it into the studio.';
  clearTimeout(tell.go); tell.go=setTimeout(function(){ if(t&&t.parentNode) t.parentNode.removeChild(t) },2600)
}
function toClipboard(text,then){
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext)
      return navigator.clipboard.writeText(text).then(function(){then(true)},function(){older(text,then)});
  }catch(_){}
  older(text,then);
}
/* a page served over plain http has no clipboard api at all, and the old way still works there */
function older(text,then){
  try{
    var a=document.createElement('textarea');
    a.value=text; a.setAttribute('readonly','');
    a.style.cssText='position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(a); a.select(); a.setSelectionRange(0,text.length);
    var won=document.execCommand('copy'); document.body.removeChild(a); then(won);
  }catch(_){ then(false) }
}
/**
 * Straight to the studio when the page allows it, and the clipboard when it does not.
 *
 * The clipboard is the road that always works, and it costs a paste. A site whose policy does not
 * forbid it can be handed the capture directly instead, and then picking on your own page feels the
 * same as picking in the studio: click, and it is there. Both are kept because which one is possible
 * is the site's decision rather than ours, and finding out is one request.
 */
var STUDIO="__MOTIONEER_STUDIO__";
function toStudio(text,then){
  try{
    var r=new XMLHttpRequest();
    r.open('POST',STUDIO+'/__motioneer/picked',true);
    r.setRequestHeader('content-type','text/plain');
    r.timeout=4000;
    r.onload=function(){ then(r.status>=200&&r.status<300) };
    r.onerror=function(){ then(false) };
    r.ontimeout=function(){ then(false) };
    r.send(text);
  }catch(_){ then(false) }
}
function deliver(m){
  if(framed){ parent.postMessage(m,'*'); return }
  mine.push(m);
  var n=mine.length;
  /* the one just picked when it is handed straight over, since it arrives at once and there is
     nothing to accumulate for; all of them when it goes by clipboard, since one paste should bring
     everything rather than the last thing clicked */
  toStudio(JSON.stringify({motioneer:'motioneer-capture',v:1,picks:[m]}),function(sent){
    if(sent){ tell(n,true); return }
    toClipboard(JSON.stringify({motioneer:'motioneer-capture',v:1,picks:mine}),function(won){
      tell(won?n:0,false) });
  });
}
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
function collect(rs,el,roots,out,keys,cond,faces){
  for(var j=0;j<rs.length;j++){var r=rs[j];
    if(r.selectorText){
      var t=r.selectorText.trim();
      var text=cond?cond+'{'+r.cssText+'}':r.cssText;
      if(ground(t))roots.push(text); else if(hits(el,t))out.push(text)}
    else if(r.cssRules){
      var head=r.cssText.slice(0,r.cssText.indexOf('{')).trim();
      if(head.indexOf('@keyframes')===0){keys.push(r.cssText);continue}
      collect(r.cssRules,el,roots,out,keys,head.indexOf('@layer')===0?cond:(head||cond),faces)}
    else if(r.cssText&&r.cssText.indexOf('@font-face')===0)faces.push(r.cssText)}}
/* The typefaces this element actually asks for, read off what the browser computed.
   A face rule is only reachable through the name it declares, so the used names are the whole test.
   Pseudo elements are asked too, because an icon font is normally mounted on a ::before and is the
   case where a missing face is most obvious: the glyph becomes a letter. */
function families(el){
  var want={},all=[el],kids=el.querySelectorAll('*'),i,j;
  for(i=0;i<kids.length&&all.length<400;i++)all.push(kids[i]);
  var spots=[null,'::before','::after'];
  for(i=0;i<all.length;i++)for(j=0;j<spots.length;j++){
    var cs;try{cs=getComputedStyle(all[i],spots[j])}catch(_){continue}
    var stack=(cs&&cs.fontFamily||'').split(',');
    for(var k=0;k<stack.length;k++){var n=bare(stack[k]);if(n)want[n]=1}}
  return want}
function bare(s){
  var v=(s||'').trim().toLowerCase();
  if(v.charAt(0)==='"'||v.charAt(0)==="'")v=v.slice(1,-1);
  return v.trim()}
/* Keeping the faces whose family is named, in the order they were declared.
   A page of this era ships every weight of every typeface it might use, and on the app this was
   measured against that is thirty-nine rules and eight kilobytes competing with :root for fifteen
   hundred characters, so the survivors were whichever sheet happened to be parsed first. Which is
   worse than it sounds: the families are cut into unicode ranges, so the seven that fitted could be
   the cyrillic of a typeface whose latin never arrived, and the component renders in the fallback
   with no sign anything was dropped. A component names one or two families, so asking which ones is
   most of the saving. If the names do not line up with any rule the whole set is kept, because a
   filter that matches nothing must not be the reason a capture has no typeface at all. */
function facing(faces,want){
  var keep=[],i;
  for(i=0;i<faces.length;i++)if(asked(want,named(faces[i])))keep.push(faces[i]);
  return keep.length?keep:faces}
/* A face may declare a longer name than the stack asks for. "Inter var" and "Inter" are the same
   typeface to everyone but a string compare, so a name that begins with a wanted one counts. */
function asked(want,name){
  if(!name)return false;
  if(want[name])return true;
  for(var u in want)if(u&&(name.indexOf(u+' ')===0||u.indexOf(name+' ')===0))return true;
  return false}
function named(rule){
  var at=rule.indexOf('font-family:');
  if(at<0)return '';
  var from=at+12,stop=from;
  while(stop<rule.length&&rule.charAt(stop)!==';'&&rule.charAt(stop)!=='}')stop++;
  return bare(rule.slice(from,stop))}
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
var opaque=0,shut=[];
function rules(el){
  var roots=[],out=[],keys=[],faces=[];opaque=0;shut=[];
  for(var i=0;i<document.styleSheets.length;i++){var rs;
    /* a sheet served from another origin without cors cannot be read at all. Skipping it quietly
       would hand over a component with a third of its styling missing and no way to tell */
    try{rs=document.styleSheets[i].cssRules}catch(_){opaque++
      /* the address as well as the count. Read from here it is nothing, but the studio has no origin
         to be refused by and can fetch it afterwards, which is the difference between a component
         that lost its typeface and one that kept it */
      var href=document.styleSheets[i].href
      if(href&&shut.indexOf(href)<0)shut.push(href)
      continue}
    collect(rs,el,roots,out,keys,'',faces)}
  var body=pack(out,13000);
  var base=pack(roots,1500);
  /* a budget of its own, because a face crowded out by a :root is a component in the wrong typeface */
  var type=pack(facing(faces,families(el)),6000);
  /* keyframes only matter here if something kept actually names them */
  var used=pack(keys.filter(function(k){var n=k.slice(10,k.indexOf('{')).trim();
    return n&&body.indexOf(n)>-1}),2000);
  return needed(body+base,el)+context(el)+type+base+used+body}
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
    if(to[i].tagName==='IMG'){to[i].setAttribute('src',from[i].currentSrc||from[i].src);to[i].removeAttribute('srcset')}
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
  deliver({motioneer:'picked',name:el.getAttribute('aria-label')||(el.querySelector('h1,h2,h3')||{}).textContent||label(el),html:h,css:css,shot:shot,label:label(el),opaque:opaque,shut:shut,weak:weak,
    n:el.querySelectorAll('*').length+1,
    cut:h.length<el.outerHTML.length,w:Math.round(r.width),h:Math.round(r.height)})}
function arm(v){on=v;
  document.documentElement.style.cursor=v?'crosshair':'';
  if(!v&&box)box.style.display='none';
  if(framed) parent.postMessage({motioneer:v?'armed':'disarmed'},'*');
  else if(v) tell(mine.length)}
addEventListener('mousemove',move,true);addEventListener('click',pick,true);
/* a framework that acts on mousedown would fire before the click is stopped */
addEventListener('mousedown',function(e){if(on){e.preventDefault();e.stopPropagation()}},true);
addEventListener('keydown',function(e){if(on&&e.key==='Escape'){e.preventDefault();arm(false)}},true);
addEventListener('message',function(e){var d=e.data||{};
  if(d.motioneer==='pick')arm(true);
  if(d.motioneer==='nopick')arm(false);
  if(d.motioneer==='pick-parent'&&last&&last.parentElement){last=last.parentElement;move({target:last})}
  if(d.motioneer==='pick-child'&&last&&last.firstElementChild){last=last.firstElementChild;move({target:last})}
  if(d.motioneer==='pick-current'&&last){arm(true);pick({target:last,preventDefault:function(){},stopPropagation:function(){}})}});
/* on the page itself there is nobody to ask it to start, and being run at all is the asking. Escape
   still disarms, which is how you get the page back without reloading it */
if(framed) parent.postMessage({motioneer:'ready'},'*'); else arm(true);
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

/**
 * @param freeze hold every animation at its first frame from the moment the page exists.
 *
 * An animation with no fill is removed from the timeline the instant it finishes, and a removed
 * animation is indistinguishable from one that was never created. This page is loaded and then
 * inspected over a round trip, so a 400ms sweep could be gone before anything asked about it, and
 * the answer that came back was that the component has no animation on it at all. Frozen at the
 * first frame nothing can finish, so counting them is a question about the sheet rather than a race
 * against it.
 */
const restPage = (o, css, freeze) => `<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  #r{position:absolute;left:0;top:0;width:${o.wide ? o.wide + 'px' : 'max-content'}}
  ${o.base}
  ${css}
  ${freeze ? '*,*::before,*::after{animation-play-state:paused !important}' : ''}</style></head>`
  + `<body><div id="r">${o.scope ? o.markup.replace(/<(\w+)/, `<$1 ${o.scope}`) : o.markup}</div></body></html>`

async function drifts(o) {
  const eye = await eyes()
  if (!eye.browser) return { skipped: eye.why }
  let page
  try {
    page = await eye.browser.newPage({ viewport: { width: 1280, height: 900 } })
    const measure = async (css, settle) => {
      await page.setContent(restPage(o, css, settle), { waitUntil: 'load' })
      let running = 0
      if (settle) {
        /* counted first, while everything is still held at its first frame. Seeking to the end is
           what makes an unfilled animation finish and leave the timeline, so counting after the
           seek counts nothing and reports a working sheet as one that animates nothing at all */
        running = await page.evaluate(() => document.getAnimations().length)
        // then held well past the end, which is where the component comes to rest and stays
        await page.evaluate(() => {
          for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 60_000 } catch {} }
        })
      }
      await page.waitForTimeout(70)
      // every element, because a transform on a child never moves its parent's box and the drift
      // this is looking for is almost always in the parts rather than in the whole
      const got = await page.evaluate(() => ({
        boxes: [...document.querySelectorAll('#r, #r *')].slice(0, 400).map((e) => {
          const b = e.getBoundingClientRect(), c = getComputedStyle(e)
          return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height),
            Math.round(parseFloat(c.opacity) * 100)]
        }),
      }))
      return { ...got, running }
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
    /* which of the four it was, and not only how much. The message said "sits Npx from where it
       started" whatever moved, so a component that ends the right place at the wrong size was
       reported as displaced, and the cause it named was always a keyframe ending on a transform
       even when the sheet had simply added a property that changes layout */
    const AXES = ['sideways', 'up or down', 'wider or narrower', 'taller or shorter']
    let off = 0, ghost = 0, offAxis = null
    still.boxes.forEach((a, i) => {
      const b = after.boxes[i] || a
      const gaps = [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3])]
      const worst = Math.max(...gaps)
      if (worst > off) { off = worst; offAxis = AXES[gaps.indexOf(worst)] }
      ghost = Math.max(ghost, a[4] - b[4])
    })
    return { off, offAxis, ghost, running: after.running,
      travel: Math.round(travel), reach: Math.round(travel / size * 100),
      stir: Math.round(stirred.size / Math.max(1, frames[0].filter(Boolean).length) * 100),
      escape: Math.round(Math.max(0, escape)), blank: Math.round(blank * 100) }
  } catch (e) {
    return { skipped: String(e && e.message ? e.message : e).slice(0, 90) }
  } finally { if (page) await page.close().catch(() => {}) }
}

/** the two ways a sheet can pass every reading and still be wrong once it stops */
function resting({ off, offAxis, ghost, running, skipped }) {
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
  /**
   * What differs, said as what it is.
   *
   * This used to read "sits Npx from where it started" whichever of the four had changed, so a
   * component that ends in the right place at the wrong size was described as displaced, and the
   * cause it offered was always a keyframe ending on a transform. That is one of two causes and
   * often not the one: a sheet that adds overflow, position, display or padding to make its
   * technique work changes the resting layout without any keyframe being involved, which is just as
   * permanent and needs a different fix. Naming both is the difference between a refusal somebody
   * can act on and one they can only try again against.
   */
  const size = offAxis === 'wider or narrower' || offAxis === 'taller or shorter'
  if (off > 2) {
    out.push((size
      ? `when the animation is over the component is ${off}px ${offAxis} than it was`
      : `when the animation is over the component sits ${off}px ${offAxis || 'away'} from where it started`)
      + ', permanently. Either a keyframe ends on a transform rather than returning to none, or the '
      + 'sheet adds a property that changes layout, like overflow or position or display, to make '
      + 'its technique work. Both nudge the layout of whatever ships it for good.')
  }
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

const CALL_MS = Number(process.env.MOTIONEER_STUDIO_CALL_MS || 150_000)
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
 * fails was paying that minute twice. MOTIONEER_STUDIO_THINKING turns it back on for anyone who wants to
 * measure it again on their own components rather than take this on faith.
 */
const THINK = process.env.MOTIONEER_STUDIO_THINKING ? Number(process.env.MOTIONEER_STUDIO_THINKING) : 0

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
/**
 * The command already signed in on this machine, whenever there is one.
 *
 * This used to prefer ANTHROPIC_API_KEY the moment it was set, because an http request skips the
 * 2.74 seconds a CLI session spends booting and authenticating before the model reads a word. That
 * is a real saving and it is still there for anybody who wants it, but it is the wrong default: a
 * key in the environment is usually left over from something else, it is often stale, and it spends
 * money on an account the person may not have meant to use. The command needs nothing pasted, needs
 * no key to go wrong, and is what most people running this already have.
 *
 * The key is still picked up when there is no command to run, so a machine without one is not left
 * with nothing.
 */
const fromEnv = () => (CAN_CLI
  ? { provider: 'claude-cli', model: process.env.MOTIONEER_STUDIO_MODEL || '' }
  : (process.env.ANTHROPIC_API_KEY
    ? { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: process.env.MOTIONEER_STUDIO_MODEL || '' }
    : { provider: 'claude-cli', model: process.env.MOTIONEER_STUDIO_MODEL || '' }))
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

async function askModel(brief, tries = 4, signal) {
  let last = 'no usable reply came back'
  for (let n = 0; n < tries; n++) {
    if (signal?.aborted) return { why: 'Cancelled', terminal: true }
    let reply = await askProvider(MOTION_SYSTEM, brief, MODEL,
      { callMs: CALL_MS, thinking: THINK, env: CLEAN_ENV, maxTokens: 4000, signal })
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
  return judgeMotion(raw, fallbackScope, parts)
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
  saveSoon()
}

/**
 * What survives the studio restarting under you.
 *
 * Editing this file restarts the process, which used to mean losing the site you had aimed at, the
 * elements you had picked and every option you had just spent two minutes generating. So the work in
 * flight is written next to the other local state and read back if the restart was recent.
 *
 * Recent is the whole test. A session file from yesterday is somebody opening the studio again, and
 * restoring an aim and forty options into that would be baffling. A session file from four seconds
 * ago is node's watcher having bounced the process while a browser tab is still sitting there open.
 *
 * Only the last forty options are kept. The store holds up to two hundred and forty and each one
 * carries markup and a computed style snapshot, so writing all of them on every change would put
 * megabytes through the disk for the sake of previews nobody is going to scroll back to.
 */
const SESSION_AT = path.join(work, 'session.json')
const WARM = 20_000
const BOOT = Date.now()
const streams = new Set()   // open event streams, which have to be let go of before the process can
let saving = null
const saveSoon = () => {
  if (saving) return
  // debounced, because five options landing together is five writes of the same megabyte
  saving = setTimeout(() => {
    saving = null
    try {
      /* eighty rather than forty, because a car keeps every motion judged for it now: eight cars at
         two each is sixteen before anybody asks for a variation, and a restore that drops one leaves
         a row offering an alternative the store can no longer serve */
      const recent = [...made.entries()].slice(-80)
      writeFileSync(SESSION_AT,
        JSON.stringify({ at: Date.now(), aim: AIM, nextId, made: recent, bench }))
    } catch { /* a session that cannot be written is not a reason to stop working */ }
  }, 400)
}
/**
 * What the page had on screen, held for it across a restart.
 *
 * The options survived a restart and the composition did not, which is the wrong way round: the
 * options are a few model calls and the arrangement is those plus every decision made about them.
 * This is opaque here on purpose. The server is a shelf for it, not a second opinion about it, and
 * the page is the only thing that knows what an arrangement means.
 */
let bench = null
/* the last set of captures handed in from a page the studio could not reach itself */
let inbox = null
const resumed = (() => {
  try {
    const was = JSON.parse(readFileSync(SESSION_AT, 'utf8'))
    if (!was || Date.now() - was.at > WARM) return null
    for (const [id, o] of was.made ?? []) made.set(id, o)
    nextId = Math.max(nextId, Number(was.nextId) || 0)
    bench = was.bench ?? null
    if (was.aim) aimAt(was.aim)
    return was
  } catch { return null }
})()

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

/**
 * One motion, from a sentence somebody typed rather than from a deck.
 *
 * The two decks exist so nobody has to know what they want: ask, and five answers arrive to choose
 * between. Somebody who does know what they want had no way to say it. They could shoot another five
 * and keep whichever landed nearest, which is a slow way of being ignored, and the studio had a
 * hundred ways of describing a movement and no way at all of being told one.
 *
 * Held to the same gates as a dealt motion, deliberately: a movement asked for by name is not a
 * reason to accept one that never comes back to rest or that blanks its own first frame. When a gate
 * turns it down the reason goes back to the field, because "it did not work" is not something
 * anybody can rewrite a sentence from.
 */
async function described(from, words) {
  const about = 'This element was picked out of a running app. It is the rendered dom, so it is '
    + 'exactly what a user sees, and the css below is the rules that actually matched it.\n\n'
    + `${String(from.markup || '').slice(0, 6000)}\n\n`
    + (from.base ? `Its stylesheet:\n${from.base.slice(0, 3000)}\n\n` : '')
  const ask = `${about}Move it so that ${words}\n\nTake the timing from that description: it is how `
    + 'the thing behaves. Do what it asks and not more than it asks.'
  const got = await askModel(ask)
  if (!got.raw) return { why: got.why }
  const ok = judge(got.raw, undefined, true)
  if (!ok.css) return { why: ok.why }
  const rest = await drifts({ markup: from.markup, base: from.base, css: ok.css, scope: ok.scope, wide: from.wide })
  const settled = resting(rest)
  if (settled.length) return { why: settled[0] }
  const id = String(nextId++)
  keep(id, { ...from, id, css: ok.css, scope: ok.scope, note: ok.note, verb: words })
  return { id, verb: words, scope: ok.scope, note: ok.note, css: ok.css, tempo: tempo(ok.css),
    seen: { reach: rest.reach, stir: rest.stir, escape: rest.escape, blank: rest.blank } }
}

/**
 * The same motion, changed the way somebody asked.
 *
 * Next to described rather than folded into it, because the two are asking for different things and
 * the brief is most of the difference. Described starts from the element and gets a motion; this
 * starts from a motion that already works and is told what about it is wrong, which is why the sheet
 * goes in and why it is asked to stay recognisably the same rather than to have another go.
 *
 * It keeps the scope it was given, the way refine does, so a change is a version of a motion rather
 * than a new one wearing its name.
 */
async function altered(from, words) {
  const ask = `This motion works. Here is its sheet:\n\n${from.css}\n\n`
    + `It was described as: ${from.note}\n\nThe markup it moves:\n${String(from.markup || '').slice(0, 5000)}\n\n`
    + `Change it so that ${words}\n\nKeep the same scope attribute, ${from.scope || 'the one it already uses'}, `
    + 'and keep it recognisably the same motion rather than a new one. Change what was asked for and '
    + 'leave the rest of it alone.'
  const got = await askModel(ask)
  if (!got.raw) return { why: got.why }
  const ok = judge(got.raw, from.scope)
  if (!ok.css) return { why: ok.why }
  const rest = await drifts({ markup: from.markup, base: from.base, css: ok.css, scope: ok.scope, wide: from.wide })
  const settled = resting(rest)
  if (settled.length) return { why: settled[0] }
  const id = String(nextId++)
  keep(id, { ...from, id, css: ok.css, scope: ok.scope, note: ok.note, verb: words })
  return { id, verb: words, scope: ok.scope, note: ok.note, css: ok.css, tempo: tempo(ok.css),
    seen: { reach: rest.reach, stir: rest.stir, escape: rest.escape, blank: rest.blank } }
}

/**
 * One motion put on other elements, without asking for it again.
 *
 * A launch film is the same movement on many things at different times: eight cards that all rise,
 * a beat apart. Today every one of those is its own ask, so eight elements is eight model calls and
 * eight sets of five to choose between, and the thing somebody wanted was to say "that one, on these
 * too". Nothing has to be generated for that: the sheet already exists.
 *
 * A motion id names a sheet and the element it was written for together, so this cannot simply hand
 * a car somebody else's id: railview would look it up and draw the source's markup twice. What it
 * mints instead is the target's own capture wearing the source's sheet. The scope goes across with
 * it, which is safe because railview already gives every car its own tag and rewrites the sheet into
 * it, so two cars sharing a scope was always the ordinary case rather than a collision.
 *
 * The sheet was written against the source's markup, so on an element built differently some of it
 * will match nothing. That is worth allowing rather than preventing: it costs a click to find out,
 * the row says what it is playing, and the alternative it had is still in its list.
 */
function sameAs(from, to) {
  const source = made.get(from)
  if (!source) return null
  return (to || []).map((id) => {
    const target = made.get(id)
    if (!target || id === from) return null
    const next = String(nextId++)
    keep(next, { ...target, id: next, css: source.css, scope: source.scope,
      note: source.note, verb: source.verb })
    return { was: id, id: next, verb: source.verb, scope: source.scope, note: source.note,
      css: source.css, tempo: tempo(source.css) }
  }).filter(Boolean)
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
    : tw ? 'tailwind and a Motioneer palette'
      : base ? `${SHEET ? path.basename(SHEET) : 'its own <style>'}`
        : (await getTailwind()).why ? `nothing: ${(await getTailwind()).why}` : 'nothing, and it needs nothing'
  return { kept: tried.filter((t) => t.id), dropped: tried.filter((t) => !t.id), styled }
}

/**
 * One file, every option, no requests.
 *
 * Playing with motion in a studio is only half of it; the other half is showing somebody. A link to
 * localhost is not showing somebody, and a screenshot cannot carry motion, so the artifact is a single
 * html file that opens anywhere with the transport built in. That is Motioneer's existing promise about
 * shipped pages applied to motion, and it is the thing you attach to a pull request.
 *
 * The options share one document rather than sitting in iframes, which is what makes it one file. They
 * can only do that because each sheet is already scoped to an attribute, so giving option two the
 * attribute data-motion-fold-2 and rewriting its selectors to match keeps four sheets from colliding
 * in the same page. The transport then drives document.getAnimations() directly, with no postMessage
 * at all, because there is nothing to talk to.
 *
 * Two things are exported through here and they are not the same artifact. Several motions for one
 * component is a comparison: a grid of captioned cards, every one held at the same instant, because
 * the whole point is to see them do the same thing at the same time. A rail is a composition: one
 * stage, the cars in the order they were arranged, each held at t minus its own offset. Exporting a
 * composition as a comparison is what this did to every rail, and it arrived as a stack of components
 * all starting together with the sequencing, the one decision a rail records, silently dropped.
 */
const exportable = async (ids, palette, offsets = [], shots = [], places = []) => {
  const picked = ids.map((id) => made.get(id)).filter(Boolean)
  if (!picked.length) return null
  /* offsets are what tells the two apart, because they are what a rail has and a set of options for
     one component does not */
  const rail = offsets.length > 0
  const tw = picked.some((o) => o.tw) ? (await getTailwind()).js : null
  const parts = picked.map((o, i) => {
    // one sheet per option in one document, so each is renamed apart from the others
    const tag = o.scope ? `${o.scope}-${i + 1}` : ''
    const css = o.scope ? o.css.replaceAll(`[${o.scope}]`, `[${tag}]`) : o.css
    const markup = tag ? o.markup.replace(/<(\w+)/, `<$1 ${tag}`) : o.markup
    /* where it was put on the stage, if it was put anywhere, so the file shows the composition that
       was arranged rather than the stack it started as */
    const said = String(places[i] ?? '').split('_').map(Number)
    const place = rail && said.length === 3 && said.every((v) => Number.isFinite(v))
      ? { x: said[0], y: said[1], w: said[2] } : null
    return { ...o, css, markup, tag, place, shot: rail ? (shots[i] || '') : '',
      at: rail ? Math.max(0, Math.round(Number(offsets[i]) || 0)) : 0 }
  })
  const width = picked[0].wide ? `${picked[0].wide}px` : 'max-content'
  return `<!doctype html><html class="dark"><head><meta charset="utf-8">
<title>${picked[0].file} motion</title>
${tw ? `<script>${tw}</script><style type="text/tailwindcss">${themeMap}</style>` : ''}
<style>${picked.some((o) => o.tw) ? themeFor(palette) : ''}
/* every car's sheet, not just the first, and each walked into the car it belongs to. Two pages'
   rules in one document are two sites arguing: whichever came last won body and repainted this
   frame, and a .title written for one component restyled the other */
/* the typefaces once, ahead of the cars, because a face rule is not scoped to a car the way a
   selector is and every car was carrying its own copy of the same three fonts */
${[...new Set(parts.flatMap((p) => faceList(p.base)))].join('\n')}
${parts.map((p) => grounded(unfaced(p.base), p.tag)).join('\n')}
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
/* a composition is one stage rather than a wall of cards, and it is laid out the way the studio was
   showing it, so what you send somebody is what you were looking at when you decided to send it */
.wrap.rail{display:flex;flex-direction:column;justify-content:center;gap:10px;
  height:calc(100vh - 48px);padding:14px}
.wrap.rail figure{flex:1 1 0;min-height:0;background:none;border:0;border-radius:0;position:relative}
.wrap.rail .stage{height:100%}
/* a component that was put somewhere keeps where it was put, in per cent, so the file is the
   composition that was arranged rather than the stack it started out as */
.wrap.rail.staged{display:block;position:relative}
.wrap.rail.staged figure.put{position:absolute}
.wrap.rail.staged figure.put .inner{position:static;transform:none;width:100%}
.wrap.rail.staged .loose{position:absolute;inset:14px;display:flex;flex-direction:column;
  justify-content:center;gap:10px}
/**
 * The cameras, carried out with everything else.
 *
 * A camera is a perspective, a moving plate and two blurred copies of the subject, and the export
 * had none of that, so a car filmed with a slow push arrived locked off. The page said so, which is
 * better than pretending, but an export that drops a decision is the same fault as the one that
 * dropped the offsets and then the placement. This is the rail frame's rig, in the file.
 */
.rig{position:absolute;inset:0;display:grid;place-items:center;perspective:1400px;
  perspective-origin:50% 45%}
.dolly{transform-style:preserve-3d}
.plate{position:relative;width:100%;transform-style:preserve-3d;filter:brightness(1.16) contrast(1.05)}
.layer{position:absolute;inset:0;display:grid;place-items:center}.layer>*{width:100%}
.sharp{position:relative}
.blur{filter:blur(8px) saturate(1.1);
  -webkit-mask-image:linear-gradient(168deg,#000 0%,transparent 32%,transparent 68%,#000 100%);
  mask-image:linear-gradient(168deg,#000 0%,transparent 32%,transparent 68%,#000 100%)}
.bloom{filter:blur(20px) saturate(2.1) brightness(1.3);mix-blend-mode:screen;opacity:.5;
  pointer-events:none}
figure.filmed .stage{background:#050506;border-radius:8px;overflow:hidden}
${parts.filter((p) => p.shot).map((p, k) => {
  const move = SHOTS[p.shot] || SHOTS.drift
  return `.d${k}{transform:${move.from};animation:dolly${k} ${shotLength(p.css)}ms ${move.ease} both}
@keyframes dolly${k}{from{transform:${move.from}}to{transform:${move.to}}}`
}).join('\n')}
</style></head><body>
<header><button id="play">Pause</button><span class="clock" id="at">0.00 s</span>
  <input id="scrub" type="range" min="0" max="4000" value="0" step="10">
  <span class="clock" style="min-width:auto">${picked[0].file}</span></header>
<div class="wrap${rail ? ' rail' : ''}${parts.some((p) => p.place) ? ' staged' : ''}">${
  parts.some((p) => p.place) && parts.some((p) => !p.place) ? '<div class="loose"></div>' : ''
}${parts.map((p, i) => {
  const rigged = parts.filter((q) => q.shot).indexOf(p)
  const inner = `<div class="inner">${p.markup}</div>`
  /* a car with a camera gets its own rig, for the reason the rail frame gives: a perspective and its
     blurred copies are per subject, so one shared rig could only film them all as a flat picture */
  const body = p.shot
    ? `<div class="rig"><div class="dolly d${rigged}"><div class="plate">
         <div class="layer bloom" data-copy></div>
         <div class="layer sharp">${inner}</div>
         <div class="layer blur" data-copy></div></div></div></div>`
    : inner
  const at = p.place ? ` style="left:${p.place.x}%;top:${p.place.y}%;width:${p.place.w}%"` : ''
  return `<figure data-rail="${i}" class="${p.place ? 'put ' : ''}${p.shot ? 'filmed' : ''}"${at}>`
    + `<div class="stage">${body}</div>`
    + `${rail ? '' : `<figcaption><b>${p.note || 'untitled'}</b><span>timing from ${p.verb}</span></figcaption>`}`
    + '</figure>'
}).join('')}
</div>
<script>
var running=true,t=0,last=performance.now(),span=4000
var at=document.getElementById('at'),scrub=document.getElementById('scrub'),play=document.getElementById('play')
for (var el of document.querySelectorAll('.inner')){
  var r=el.getBoundingClientRect(), box=el.parentElement.getBoundingClientRect()
  var s=Math.min(1,(box.width-24)/r.width,(box.height-24)/r.height)
  el.style.transform='translate(-50%,-50%) scale('+s.toFixed(4)+')'
}
/* which figure an animation belongs to, walked up from whatever it is animating, exactly as the
   studio's own rail frame does it. An offset of zero for every one leaves a grid of options behaving
   as it always did, so there is one transport here rather than two */
var AT=${JSON.stringify(parts.map((p) => p.at))}
/* the defocus and the bloom are copies of the subject, cloned here so no component is written twice */
for (var slot of document.querySelectorAll('[data-copy]')){
  var lit=slot.parentElement.querySelector('.sharp > *')
  if(lit) slot.appendChild(lit.cloneNode(true))
}
function seat(a){try{var n=a.effect&&a.effect.target
  while(n&&n!==document.body){if(n.dataset&&n.dataset.rail!==undefined)return Number(n.dataset.rail)
    n=n.parentElement}}catch(_){}
  return 0}
function hold(ms){var end=0
  for (var a of document.getAnimations()){try{var off=AT[seat(a)]||0
    a.pause();a.currentTime=Math.max(0,ms-off)
    var e=a.effect&&a.effect.getComputedTiming?a.effect.getComputedTiming().endTime:0
    if(typeof e==='number'&&isFinite(e)&&e+off>end)end=e+off}catch(_){}}
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
   * whichever passes turns one gate rejection from a missing car into a shrug. Both are now kept and
   * offered, so the second go is a choice as well as an insurance.
   *
   * The cars run together, but not all of them at once: the command line provider allows eight
   * sessions at a time, so a rail of eight at two goes each is sixteen calls and two waves rather
   * than the one this used to claim. That is the argument against asking for a third.
   */
  return Promise.all(picks.map(async (pick, i) => {
    const src = { html: pick.html, css: pick.css ?? '', label: pick.label, w: pick.w }
    const got = await options(src, 2).catch((e) => ({ kept: [], dropped: [{ why: String(e && e.message || e) }] }))
    /**
     * All of them, not the first.
     *
     * Both goes are judged, both are already stored under their own ids, and both are already in the
     * session file. Returning one of them was the whole of what made a rail the one place in a tool
     * about choosing where you could not choose, and it cost a field rather than a model call.
     *
     * The count stays at two. A third is not free: the command line provider runs eight sessions at
     * once, so an eight car rail is already two waves rather than the one the note above assumes,
     * and a third go would make it three for an option most cars never need. More like this asks for
     * variations on the one that landed, per car, when you want them, which is also a better question
     * than a third unrelated verb from the deck.
     */
    if (got.kept.length) {
      const alts = got.kept.map((k) => ({ ...k, ms: tempo(k.css).span || 600 }))
      return { ...alts[0], label: pick.label, i, ms: alts[0].ms, alts }
    }
    // every reason, not just the first, because two attempts failing the same way says something
    // different from two failing differently
    const why = [...new Set((got.dropped || []).map((d) => String(d.why || '')).filter(Boolean))].join('; ')
    return { label: pick.label, i, why: why || 'nothing came back' }
  }))
}

/**
 * The offsets and the cameras are read at the position the car was asked for, not the position it
 * ended up in. An id the store has evicted drops out of `parts` and every car after it moves up one,
 * so looking up `shots[i]` and `AT[i]` by the new position hands each remaining car the timing and
 * the camera belonging to its neighbour. The rail still plays, in the wrong order, which is the kind
 * of wrong nobody reports because it looks like a composition somebody chose.
 */
/** at_ms_x_y_scale_ease steps joined by a pipe, which is how both a component and the camera travel */
const journeyOf = (said) => String(said ?? '').split('|').filter(Boolean).map((one) => {
  const bit = one.split('_')
  return { at: Number(bit[0]) || 0, ms: Number(bit[1]) || 400, x: Number(bit[2]) || 0,
    y: Number(bit[3]) || 0, scale: Number(bit[4]) || 1, ease: bit[5] || 'ease' }
}).filter((m) => Number.isFinite(m.at)).sort((a, b) => a.at - b.at)

/**
 * A journey as one keyframe track rather than one animation per leg.
 *
 * Several animations on one element fight: a later one held before its own start still applies its
 * first frame and overrides whatever the leg before it finished at, so a thing that moved twice
 * would snap back in between. One track with a stop at each end of each leg composes by
 * construction, and css allows a timing function per stop so the easing survives.
 */
const trackOf = (name, moves, span, offset) => {
  const at = (ms) => `${Math.max(0, Math.min(100, (ms / span) * 100)).toFixed(3)}%`
  const put = (x, y, k) => `transform:translate(${x}%, ${y}%) scale(${k})`
  const stops = [`0%{${put(0, 0, 1)};animation-timing-function:linear}`]
  let x = 0, y = 0, k = 1
  for (const m of moves) {
    stops.push(`${at(m.at)}{${put(x, y, k)};animation-timing-function:${m.ease}}`)
    x = m.x; y = m.y; k = m.scale
    stops.push(`${at(m.at + m.ms)}{${put(x, y, k)};animation-timing-function:linear}`)
  }
  stops.push(`100%{${put(x, y, k)}}`)
  return { rule: `animation:${name} ${span}ms linear both;animation-delay:${-Math.round(offset)}ms`,
    frames: `@keyframes ${name}{${stops.join('')}}` }
}

const railView = (ids, palette, offsets = [], shots = [], places = [], lives = [], goes = [], cam = '', papers = [], offs = []) => {
  const parts = ids.map((id, asked) => ({ o: made.get(id), asked })).filter((x) => x.o)
    .map(({ o, asked }, i) => {
      const tag = o.scope ? `${o.scope}-r${i + 1}` : ''
      const css = o.scope ? o.css.replaceAll(`[${o.scope}]`, `[${tag}]`) : o.css
      const from = o.shot || o.markup
      const markup = tag ? from.replace(/<(\w+)/, `<$1 ${tag}`) : from
      /* x_y_w in per cent of the stage, or nothing where this car has never been moved */
      const said = String(places[asked] ?? '').split('_').map(Number)
      const place = said.length === 3 && said.every((v) => Number.isFinite(v))
        ? { x: said[0], y: said[1], w: said[2] } : null
      /* from_until in milliseconds, empty where this car keeps the default life */
      const told = String(lives[asked] ?? '').split('_')
      const life = told.length === 2 && told[0] !== ''
        ? { from: Number(told[0]) || 0, until: told[1] === '' ? null : Number(told[1]) }
        : null
      const moves = journeyOf(goes[asked])
      return { ...o, css, markup, tag, i, at: offsets[asked] ?? i * 420, shot: shots[asked] || '',
        place, life, moves, paper: String(papers[asked] || ''), off: String(offs[asked] || '') === '1' }
    })
  if (!parts.length) return null
  const tw = parts.some((o) => o.tw)
  return `<html class="dark"><head><meta charset="utf-8">
${tw ? `<script src="/__motioneer/tailwind.js"></script><style type="text/tailwindcss">${themeMap}</style>` : ''}
${tw ? `<style>${themeFor(palette)}</style>` : ''}
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0c0d;color:#e6e6e6;
  font:13px ui-sans-serif,system-ui}
.rail{height:100%;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:14px}
.car{flex:1 1 0;display:grid;place-items:center;min-height:0;position:relative}
/* taken out of the picture but not out of the arrangement, so the row it belongs to keeps its place
   and its timing. display rather than visibility, or a stack holds a gap where nothing is */
.car.off{display:none !important}
/**
 * A stage rather than a stack.
 *
 * Evenly divided rows in the order the picks happened is not what any of these compositions looks
 * like: a header sits above a row of cards and a chart sits beside them. A car that has been put
 * somewhere is taken out of the flow and placed, in per cent, so the arrangement survives the frame
 * being resized and a film at 1080 square shows what was arranged in whatever the window was. Cars
 * nobody has moved keep sharing what is left, so the stack is what this opens on and the stage is
 * what a hand makes.
 */
.rail.staged{display:block;position:relative}
.rail.staged .car.put{position:absolute;display:block;place-items:initial}
/* a descendant rather than a child: a camera wraps the component in a rig, so the direct child of a
   placed car is the rig and the component is three levels down still carrying its own inline width */
.rail.staged .car.put .in{width:100%!important}
/**
 * A camera on a component that has been put somewhere.
 *
 * A rig is absolutely positioned, which is right for a car sharing the stack because that car has a
 * height of its own from the row it fills. A placed car has no height except what its contents give
 * it, and a rig gives it none, so applying a camera to one collapsed it to nothing and the plate
 * kept the fixed width it was sized to for a full width stage. The camera applied and there was
 * simply nothing to see, which reads as the camera not working.
 */
.rail.staged .car.put .rig{position:relative;inset:auto}
/* the dolly is a grid item and shrinks to its contents, so a plate asking for all of it got all of
   nothing. Both have to be told, or the rig has a height and no width */
.rail.staged .car.put .dolly,.rail.staged .car.put .plate{width:100%}
/**
 * What a component is shown against, when its own page's answer is not the one you want.
 *
 * The rules that matched it arrive with the page it was on, so a component lifted off a light site
 * carries a white box onto a dark stage. Important, because that background is one of those matched
 * rules and it is sitting on the component's own root; this has to win against a page rather than
 * against nothing.
 */
.car.paper-light,.car.paper-light .in > *{background:#fff !important}
.car.paper-dark,.car.paper-dark .in > *{background:#0b0c0d !important}
.car.paper-none,.car.paper-none .in > *{background:transparent !important}
.car.paper-light{border-radius:8px}
.car.paper-dark{border-radius:8px}
.rail.staged .loose{position:absolute;inset:14px;display:flex;flex-direction:column;
  justify-content:center;gap:10px}
.grab{position:absolute;inset:-6px;cursor:move;z-index:5}
.car.put:hover .grab{outline:1px dashed rgba(94,106,210,.55);outline-offset:-4px;border-radius:6px}
.wide{position:absolute;right:-5px;top:50%;width:10px;height:26px;margin-top:-13px;cursor:ew-resize;
  z-index:6;border-radius:3px;background:rgba(94,106,210,.75);opacity:0;transition:opacity 90ms ease}
.car.put:hover .wide{opacity:1}
.car.lifted{z-index:9}
/* the component the timeline is pointed at, said on the stage as well, because a selection that is
   only true in one of the two places somebody is looking is not a selection */
.car.chosen::after{content:'';position:absolute;inset:-5px;border-radius:7px;pointer-events:none;
  outline:1px solid rgba(94,106,210,.75);outline-offset:0}
.car.lifted .grab{outline:1px solid var(--pin,#5e6ad2);outline-offset:-4px}
/* every car's sheet, not just the first, and each walked into the car it belongs to. Two pages'
   rules in one document are two sites arguing: whichever came last won body and repainted this
   frame, and a .title written for one component restyled the other */
/* the typefaces once, ahead of the cars, because a face rule is not scoped to a car the way a
   selector is and every car was carrying its own copy of the same three fonts */
${[...new Set(parts.flatMap((p) => faceList(p.base)))].join('\n')}
${parts.map((p) => grounded(unfaced(p.base), p.tag)).join('\n')}
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
  return `.d${p.i}{transform:${move.from};animation:dolly${p.i} ${shotLength(p.css)}ms ${move.ease} both}
@keyframes dolly${p.i}{from{transform:${move.from}}to{transform:${move.to}}}`
}).join('\n')}
/**
 * Each component's journey, as one animation rather than one per leg.
 *
 * Several animations on the same element fight: a later one held before its own start still applies
 * its first frame, so it overrides whatever the leg before it finished at, and a component that
 * moved twice would snap back between them. One track spanning the whole composition, with a stop at
 * each end of each leg, composes by construction and takes its easing per stop, which css allows.
 *
 * The delay is minus the car's own offset. Everything in a car runs on the car's clock, t minus when
 * it starts, and a journey is written in the composition's time; this is what puts the two back on
 * the same footing, for the transport and for the film alike.
 */
${(() => {
  const eye = journeyOf(cam)
  const span = Math.max(1, ...parts.flatMap((q) => (q.moves || []).map((m) => m.at + m.ms)),
    ...eye.map((m) => m.at + m.ms))
  const out = parts.filter((p) => p.moves && p.moves.length).map((p) => {
    const t = trackOf(`go${p.i}`, p.moves, span, p.at)
    return `.car[data-rail="${p.i}"]{${t.rule}}\n${t.frames}`
  })
  /* the camera is the same journey applied to everything at once. It sits on the stage rather than
     inside a car, so it runs on the document's clock and its offset is nothing */
  if (eye.length) {
    const t = trackOf('eye', eye, span, 0)
    out.push(`.rail{${t.rule};transform-origin:center center}\n${t.frames}`)
  }
  return out.join('\n')
})()}
.tag{position:absolute;left:0;top:0;font:10px ui-monospace,monospace;color:#5c6068;letter-spacing:.04em}
</style></head><body>
<div class="rail${parts.some((p) => p.place) ? ' staged' : ''}">${
  parts.some((p) => p.place) && parts.some((p) => !p.place)
    ? '<div class="loose"></div>' : ''}${parts.map((p) => {
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
  /* data-motioneer-at says which clock this car runs on. The transport holds it at t minus its offset,
     which is a live animation and is invisible to anything that draws the document instead of
     watching it: filming walked every element and wrote one instant into all of them, so a rail came
     out with every car starting together and the sequencing, the thing being filmed, was gone */
  const put = p.place
    ? ` style="left:${p.place.x}%;top:${p.place.y}%;width:${p.place.w}%"` : ''
  return `<div class="car${p.shot ? ' shot' : ''}${p.place ? ' put' : ''}${p.off ? ' off' : ''}${
    p.paper ? ` paper-${p.paper}` : ''}" data-rail="${p.i}"${put}
    data-motioneer-at="${Math.round(p.at)}"${p.life
      ? ` data-motioneer-from="${Math.round(p.life.from)}"${p.life.until === null ? '' : ` data-motioneer-until="${Math.round(p.life.until)}"`}`
      : ` data-motioneer-from="${Math.round(p.at)}"`}>
    ${body}<i class="grab" data-grab="${p.i}"></i><i class="wide" data-wide="${p.i}"></i></div>`
}).join('')}</div>
<script>
/* one entry per car actually on the page, in the order they are drawn, so data-rail indexes it */
var AT=${JSON.stringify(parts.map((p) => Math.round(p.at)))}
for (var car of document.querySelectorAll('.car')){
  var el=car.querySelector('.in'); if(!el) continue
  if(car.classList.contains('shot')) continue   // a rig does its own framing
  if(car.classList.contains('put')) continue    // a placed car is the width it was given
  var r=el.getBoundingClientRect(), box=car.getBoundingClientRect()
  var s=Math.min(1,(box.width-20)/r.width,(box.height-8)/r.height)
  if(s<1) el.style.transform='scale('+s.toFixed(4)+')'
}
/**
 * Moving a component to where it belongs, by dragging it.
 *
 * The composition is arranged here rather than through a panel of numbers beside it, because where a
 * header sits relative to a row of cards is a thing you judge by looking. Everything is reported to
 * the parent in per cent of the stage and nothing is decided here: this frame is rebuilt from the
 * arrangement on every change, so a placement it kept to itself would be lost on the next render and
 * would disagree with undo in the meantime.
 */
function pct(e, box){
  return { x:Math.max(0,Math.min(100,(e.clientX-box.left)/box.width*100)),
           y:Math.max(0,Math.min(100,(e.clientY-box.top)/box.height*100)) }
}
function tell(i, at, done){
  parent.postMessage({motioneer:'placed', i:i, x:at.x, y:at.y, w:at.w, done:!!done}, '*')
}
for (var handle of document.querySelectorAll('[data-grab]')){
  handle.addEventListener('pointerdown', function(e){
    e.preventDefault(); e.stopPropagation()
    var i=Number(this.dataset.grab)
    var car=this.closest('.car'), stage=document.querySelector('.rail')
    var box=stage.getBoundingClientRect(), spot=car.getBoundingClientRect()
    /* the grab point inside the car, so it does not jump to the cursor on the first pixel */
    var hold={ x:(e.clientX-spot.left)/box.width*100, y:(e.clientY-spot.top)/box.height*100 }
    var wide=spot.width/box.width*100
    var moved=false
    car.classList.add('lifted')
    function move(ev){
      moved=true
      var p=pct(ev, box)
      tell(i, { x:Math.max(0,p.x-hold.x), y:Math.max(0,p.y-hold.y), w:wide }, false)
    }
    function up(ev){
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
      car.classList.remove('lifted')
      /* a press that never moved is a click, and a click on a component means that component. The
         stage had no selection at all, so you dragged whatever you happened to grab and the row it
         belonged to was somewhere else entirely */
      if(!moved){ parent.postMessage({motioneer:'chose', i:i}, '*'); return }
      var p=pct(ev, box)
      /* alt says this is a journey rather than a placement: the component travels to here by the
         instant the clock is at, instead of simply being here from the start */
      if(ev.altKey){
        parent.postMessage({motioneer:'travelled', i:i,
          x:Math.max(0,p.x-hold.x), y:Math.max(0,p.y-hold.y)}, '*')
        return
      }
      tell(i, { x:Math.max(0,p.x-hold.x), y:Math.max(0,p.y-hold.y), w:wide }, true)
    }
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
  })
}
/**
 * The camera, moved by dragging the stage itself.
 *
 * On the background rather than on a component, which is the one place a drag could not already
 * mean something. Alt says it is a move in time, exactly as it does on a component, so the two
 * gestures are the same gesture at two levels.
 */
var floor=document.querySelector('.rail')
if(floor) floor.addEventListener('pointerdown', function(e){
  if(e.target.closest('.car')) return
  e.preventDefault()
  var box=floor.getBoundingClientRect()
  var was=pct(e, box), moved=false
  function move(ev){ moved=true }
  function up(ev){
    window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
    if(!moved) return
    var now=pct(ev, box)
    parent.postMessage({motioneer:'panned', x:now.x-was.x, y:now.y-was.y, keep:!ev.altKey}, '*')
  }
  window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
})
for (var edge of document.querySelectorAll('[data-wide]')){
  edge.addEventListener('pointerdown', function(e){
    e.preventDefault(); e.stopPropagation()
    var i=Number(this.dataset.wide)
    var car=this.closest('.car'), stage=document.querySelector('.rail')
    var box=stage.getBoundingClientRect(), spot=car.getBoundingClientRect()
    var left=(spot.left-box.left)/box.width*100, top=(spot.top-box.top)/box.height*100
    function move(ev){
      var p=pct(ev, box)
      tell(i, { x:left, y:top, w:Math.max(4,p.x-left) }, false)
    }
    function up(ev){
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
      var p=pct(ev, box)
      tell(i, { x:left, y:top, w:Math.max(4,p.x-left) }, true)
    }
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
  })
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
/**
 * Whether each car is on the stage at this instant.
 *
 * A car used to be in the document from the first frame and stay for good, so a rail of three opened
 * as three boxes and only their contents arrived in order. Hidden rather than removed, because taking
 * it out of the flow would move everything else and the composition would rearrange itself as it
 * played. holdAt does the same thing in css for the film, since a copy carries declarations and not
 * whatever this listener last set.
 */
function alive(t){
  for (var car of document.querySelectorAll('.car')){
    var from=Number(car.dataset.wallFrom||0)
    var until=car.dataset.wallUntil===undefined?null:Number(car.dataset.wallUntil)
    var on=t>=from&&(until===null||t<until)
    car.style.visibility=on?'':'hidden'
  }
}
addEventListener('message',function(e){var d=e.data||{};if(d.motioneer!=='hold')return
  alive(d.t)
  var a=document.getAnimations(),end=0
  a.forEach(function(x){try{
    var off=delay(x)
    var at=Math.max(0,d.t-off); x.pause(); x.currentTime=at
    var t=x.effect&&x.effect.getComputedTiming?x.effect.getComputedTiming().endTime:0
    if(typeof t==='number'&&isFinite(t)&&t+off>end)end=t+off
  }catch(_){}})
  ;(e.source||parent).postMessage({motioneer:'held',n:a.length,i:d.i,end:Math.round(end)},'*')})
<\/script></body></html>`
}


/* ── the room ─────────────────────────────────────────────────────────────────────────────────── */
const PAGE = () => page({ AIM, CAN_WRITE, HAS_FOLDER, PRESETS })

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
  /**
   * A backslash that will not survive being written here.
   *
   * The page is a template literal, so a regex written inside it loses its escapes before the
   * browser ever sees it: /[^\\w-]+/ arrives as /[^w-]+/ and quietly replaces every character that
   * is not a w, and /\\.[^.]+$/ arrives as /.[^.]+$/ and eats one character too many. Both shipped.
   * Neither is a syntax error, so `new Function` above is blind to them, and the only tell is a
   * filename made of dashes. This reads the source rather than the output, because by the time it is
   * output the evidence is gone.
   */
  // the template moved to its own file, so the whole file is the region to scan
  const src = readFileSync(new URL('../shared/page.mjs', import.meta.url), 'utf8')
  const from = 0, to = src.length
  // comments first, or this reports the paragraph above that describes the bug it looks for
  const code = src.slice(from, to)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  const suspect = []
  for (const m of code.matchAll(/\/[^/\n ][^\n]*?\\[wsdbWSDB.][^\n]*?\/[gimsuy]*/g)) {
    if (!m[0].includes('\\\\')) suspect.push(m[0].slice(0, 44))
  }
  if (suspect.length) {
    return `a regex in the studio page loses its escapes before the browser reads it: ${suspect[0]}`
      + ` (double the backslash, or write the class out in full)`
  }
  // the picker is assembled separately and injected into somebody else's document
  const inner = PICKER.replace(/^<script>/, '').replace(/<\/script>$/, '').replace(/<\\\/script>/g, '')
  try { new Function(inner) } catch (e) { return `the picker does not parse: ${e.message}` }
  return ''
}

const editor = editorRoutes({
  work,
  config: () => ({ source: AIM, files: HAS_FOLDER ? list() : [], canWrite: CAN_WRITE }),
  legacy: async () => { try { const was = JSON.parse(readFileSync(SESSION_AT, 'utf8')); return { bench: was.bench, motions: was.made || [] } } catch { return { motions: [] } } },
  source: async (file) => {
    const want = path.resolve(file || ''), root = path.resolve(ROOT)
    if (!HAS_FOLDER || !want.startsWith(root + path.sep) || !KIND.test(want)) throw new Error('Choose a component from this studio’s folder.')
    const read = markupOf(want), base = rawSheet ? relevant(rawSheet, read.markup) : read.own
    const tw = wantsTailwind(read.markup, base) && !!(await getTailwind()).js
    return preview({ markup: read.markup, base, css: '', scope: '', tw }).replace('</body>', PICKER + '</body>')
  },
  generate: async ({ subject, brief: rawBrief, treatment, previous }, signal) => {
    if (!subject || typeof subject.html !== 'string' || !subject.html.trim()) throw new Error('Pick a component before generating motion.')
    const brief = motionBrief(rawBrief), direction = motionDirection(brief, treatment)
    const about = `The captured component:\n${subject.html.slice(0, 14000)}\nIts CSS:\n${String(subject.css || '').slice(0, 6000)}\n${direction}`
      + (previous ? `\nRefine this existing motion, preserving its idea unless the direction requests otherwise:\n${String(previous.css).slice(0, 10000)}` : '')
    let why = ''
    for (let i = 0; i < 2; i++) {
      const got = await askModel(about + (why ? `\nThe last attempt failed: ${why}. Correct that.` : ''), 2, signal)
      if (signal.aborted) throw new Error('Cancelled')
      if (!got.raw) throw new Error(got.why)
      const judged = judgeMotion(got.raw, previous?.scope, false)
      if (!judged.css) { why = judged.why; continue }
      const rest = await drifts({ markup: subject.html, base: subject.css, css: judged.css, scope: judged.scope, wide: subject.w })
      const faults = brief.purpose === 'idle' ? (rest.running === 0 ? ['No visible animation was found.'] : []) : resting(rest)
      if (faults.length) { why = faults[0]; continue }
      return { id: randomUUID(), subjectId: subject.id, ...judged, treatment, brief, duration: tempo(judged.css).span || brief.duration, parentId: previous?.id,
        seen: { blank: rest.blank || 0, escape: rest.escape || 0, stir: rest.stir || 0 }, checked: !rest.skipped }
    }
    throw new Error(why || 'No usable motion came back. Try a more specific direction.')
  },
})

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (await editor(req, res, url)) return
    if (url.pathname === '/__motioneer/legacy') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE()) }
    /**
     * The root belongs to the studio, except when the frame is the one asking for it.
     *
     * Most sites are entered at their root, so sending the frame to the path the app expects sends
     * it here, and here answered with the studio: the studio loaded inside its own frame, a hundred
     * and eighty five nodes of it, on nearly every site there is. Four of nineteen survived that.
     *
     * The mark the entry redirect leaves is what tells the two apart. A query this side writes
     * rather than a header a browser decides, because the whole point is being certain which of them
     * is asking, and sec-fetch-dest is right until something does not send it.
     */
    if (url.pathname === '/' && !(HOST && url.searchParams.has('__wall'))) {
      res.writeHead(302, { location: '/__motioneer/editor/' }); return res.end()
    }
    if (url.pathname === '/__motioneer/list') return json(res, HAS_FOLDER ? list() : [])
    if (url.pathname === '/__motioneer/recent') return json(res, recent)
    if (url.pathname === '/__motioneer/tailwind.js') {
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
    if (url.pathname === '/__motioneer/peek') {
      const want = path.resolve(url.searchParams.get('file') ?? '')
      const under = HAS_FOLDER ? path.resolve(ROOT) : '\u0000'
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
    if (url.pathname.startsWith('/__motioneer/preview/')) {
      const o = made.get(url.pathname.split('/')[3])
      if (!o) { res.writeHead(404); return res.end('gone') }
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(preview(o, url.searchParams.get('camera'), url.searchParams.get('palette'),
        Number(url.searchParams.get('depth')) || 1))
    }
    if (url.pathname === '/__motioneer/motion' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const src = body.html ? { html: body.html, css: body.css ?? '', shot: body.shot ?? '',
        label: body.label ?? 'element', w: Number(body.w) || 0 }
        : { file: body.file }
      console.log(`  ${src.label ?? path.basename(src.file)}: asking for ${body.count}`)
      const got = await options(src, Math.max(1, Math.min(6, body.count || 3)))
      console.log(`    ${got.kept.length} kept, ${got.dropped.length} dropped`)
      return json(res, got)
    }
    if (url.pathname === '/__motioneer/refine' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const base = made.get(body.id)
      if (!base) { res.writeHead(404); return res.end('gone') }
      console.log(`  refining "${base.note}"`)
      const got = await refine(base, Math.max(1, Math.min(4, body.count || 3)))
      console.log(`    ${got.kept.length} kept, ${got.dropped.length} dropped`)
      return json(res, got)
    }
    if (url.pathname === '/__motioneer/described' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const from = made.get(body.id)
      if (!from) { res.writeHead(404); return res.end('gone') }
      /* trimmed and bounded here rather than trusted, since this is the one thing in the studio a
         person types straight into a prompt */
      const words = String(body.words ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
      if (!words) return json(res, { why: 'nothing was asked for' })
      console.log(`  asked for "${words}"`)
      const got = await described(from, words)
      console.log(got.id ? `    kept as ${got.id}` : `    dropped: ${got.why}`)
      return json(res, got)
    }
    if (url.pathname === '/__motioneer/changed' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const from = made.get(body.id)
      if (!from) { res.writeHead(404); return res.end('gone') }
      const words = String(body.words ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
      if (!words) return json(res, { why: 'nothing was asked for' })
      console.log(`  changing "${from.note}" so that ${words}`)
      const got = await altered(from, words)
      console.log(got.id ? `    kept as ${got.id}` : `    dropped: ${got.why}`)
      return json(res, got)
    }
    if (url.pathname === '/__motioneer/sameas' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const got = sameAs(String(body.from ?? ''), (body.to ?? []).map(String))
      if (!got) { res.writeHead(404); return res.end('gone') }
      console.log(`  putting "${made.get(String(body.from)).note}" on ${got.length} more`)
      return json(res, { kept: got })
    }
    if (url.pathname === '/__motioneer/export' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const html = await exportable(body.ids ?? [], body.palette, body.at ?? [], body.shots ?? [], body.place ?? [])
      if (!html) { res.writeHead(404); return res.end('nothing to export') }
      const stem = String(body.name ?? 'motion').replace(/[^-\w]/g, '-') || 'motion'
      const at = path.resolve(work, `${stem}.html`)
      writeFileSync(at, html)
      console.log(`    exported ${at} (${Math.round(html.length / 1024)}kb)`)
      return json(res, { at, kb: Math.round(html.length / 1024) })
    }
    if (url.pathname === '/__motioneer/rail' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const picks = (body.picks ?? []).slice(0, 8)
      console.log(`  rail of ${picks.length}: ${picks.map((p) => p.label).join(', ').slice(0, 90)}`)
      const cars = await railOf(picks, body.palette)
      console.log(`    ${cars.filter((c) => c.id).length} of ${picks.length} moved`)
      for (const c of cars.filter((c) => !c.id)) console.log(`      ${c.label}: ${String(c.why).slice(0, 120)}`)
      return json(res, { cars })
    }
    if (url.pathname === '/__motioneer/railview') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const at = (url.searchParams.get('at') ?? '').split(',').map(Number).filter((n) => !Number.isNaN(n))
      const shots = (url.searchParams.get('shots') ?? '').split(',')
      const places = (url.searchParams.get('place') ?? '').split(',')
      const lives = (url.searchParams.get('life') ?? '').split(',')
      const goes = (url.searchParams.get('go') ?? '').split(',')
      const offs = (url.searchParams.get('off') ?? '').split(',')
      const html = railView(ids, url.searchParams.get('palette'), at, shots, places, lives, goes,
        url.searchParams.get('cam') ?? '', (url.searchParams.get('paper') ?? '').split(','), offs)
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
    if (url.pathname === '/__motioneer/tune' && req.method === 'POST') {
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
    /**
     * The two halves of filming, served rather than inlined.
     *
     * They are ordinary modules that run in a browser, and the page loads them with a dynamic import
     * the first time somebody presses Film. Inlining them into this template would put another two
     * thousand lines through the escaping that has already cost this file six bugs, and would make
     * every page load carry an encoder almost nobody presses.
     */
    if (url.pathname === '/__motioneer/raster.mjs' || url.pathname === '/__motioneer/mp4.mjs'
      || url.pathname === '/__motioneer/arrange.mjs') {
      /* next to this file rather than next to wherever it was started from. Resolving against the
         working directory meant these only existed when the studio was run from the repository root,
         which is what npm run studio does and so nobody met it; started anywhere else, and the agent
         tool starts it wherever the agent happens to be, Film simply could not load its encoder */
      const at = new URL(`../shared/${url.pathname.split('/').pop()}`, import.meta.url)
      if (!existsSync(at)) { res.writeHead(404); return res.end('') }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' })
      return res.end(readFileSync(at))
    }
    /**
     * A stream whose only content is which process is answering.
     *
     * EventSource reconnects by itself, so the page does not have to poll or guess. When the number
     * changes it is talking to a different process than the one that served it, which is the only
     * reliable signal that the code under it moved.
     */
    /**
     * The page's own work, left with the server so a restart does not cost it.
     *
     * npm run studio watches its sources, so editing one bounces the process in about half a second
     * while the browser tab carries on with the javascript it already has. Anything the page is
     * holding in variables is only there until it reloads, and it has to reload, because a tab
     * running the code from before the edit is a tab that disagrees with the studio serving it.
     */
    if (url.pathname === '/__motioneer/work') {
      if (req.method === 'POST') {
        const body = await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) })
        try { bench = JSON.parse(body) } catch { bench = null }
        saveSoon()
        return json(res, { kept: !!bench })
      }
      // only while it is warm, so opening the studio tomorrow is a fresh start rather than a haunting
      const warm = bench && Date.now() - BOOT < WARM
      return json(res, warm || resumed ? (bench ?? {}) : {})
    }
    /**
     * The picker as a thing you keep in your bookmarks bar.
     *
     * An application you have to sign into cannot be proxied: on this origin its own api is a
     * different site, so it is refused, never authenticates, and shows a loading shell for good.
     * The way round it is not to proxy at all. The page is already open in your browser with your
     * session on it, so the picker goes there instead and the capture comes back on the clipboard,
     * which is the one road out that a content security policy does not govern.
     *
     * The whole picker travels in the url. It cannot be fetched once it is there, because a site
     * strict enough to need this sends connect-src self and script-src self, and localhost is
     * neither. Seventeen kilobytes of bookmark is inelegant and it is the only shape that works.
     */
    if (url.pathname === '/__motioneer/bookmarklet') {
      // the paste key is one of two things and saying the wrong one is worse than saying neither
      const MAC = /mac/i.test(String(req.headers['user-agent'] ?? ''))
      const inner = PICKER.replace(/^<script>/, '').replace(/<\/script>$/, '')
        .replace(/<\\\/script>/g, '</script>').replace('__MOTIONEER_HOME__', '')
        /* the studio's own address, known here because this is the studio serving it */
        .replace('__MOTIONEER_STUDIO__', `http://localhost:${PORT}`)
      const href = `javascript:${encodeURIComponent(inner)}`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Pick anywhere</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08090a;color:#e6e6e6;
  font:14px/1.7 ui-sans-serif,-apple-system,system-ui;padding:40px}
main{max-width:560px}h1{font-size:19px;font-weight:500;margin:0 0 14px}
p{color:#8a8f98;margin:0 0 14px}b{color:#e6e6e6;font-weight:500}
a.bm{display:inline-block;margin:8px 0 18px;padding:9px 16px;background:#5e6ad2;color:#fff;
  border-radius:8px;text-decoration:none;font-weight:500;cursor:grab}
ol{color:#8a8f98;padding-left:20px;margin:0}li{margin:0 0 8px}
code{background:#141516;border:1px solid rgba(255,255,255,.11);border-radius:4px;padding:1px 5px;
  font:12px ui-monospace,monospace;color:#e6e6e6}</style></head><body><main>
<h1>Pick from a page you are signed into</h1>
<p>An app that signs in against its own api on another host cannot be proxied: here that api is a
different site, so it refuses the call and the app never gets past its loading screen. Pick on the
real page instead, in the browser you are already signed into.</p>
<a class="bm" href="${href}">Pick for Motioneer</a>
<ol>
<li>Drag that button to your bookmarks bar. It holds the picker rather than an address.</li>
<li>Open your app and sign in as usual.</li>
<li>Click the bookmark. A crosshair cursor means it is listening; the page still works.</li>
<li>Click the elements you want. A line at the bottom counts them.</li>
<li>Press escape to stop and give the page back.</li>
</ol>
<p>They arrive in the studio on their own. A site that refuses to talk to your machine puts them on
your clipboard instead, and the line says which, so paste with <code>${MAC ? '⌘V' : 'ctrl V'}</code>
anywhere on the studio. Nothing is installed and nothing leaves this machine.</p>
</main></body></html>`)
    }
    /**
     * A capture arriving from a page the studio never saw.
     *
     * Open to any origin, deliberately and narrowly: this accepts captures and answers nothing, and
     * the picker running on somebody's signed in page is by definition on an origin this cannot know
     * in advance. It holds what arrives until the page asks, which it does the moment it is told
     * something is waiting.
     */
    if (url.pathname === '/__motioneer/picked') {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type' })
        return res.end()
      }
      if (req.method === 'POST') {
        const body = await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) })
        let got = null
        try { got = JSON.parse(body) } catch { got = null }
        const some = got && Array.isArray(got.picks) ? got.picks.filter((k) => k && k.html) : []
        if (some.length) {
          inbox = some
          for (const s of streams) {
            try { s.write(`data: ${JSON.stringify({ boot: BOOT, caught: some.length, at: Date.now() })}\n\n`) } catch { /* gone */ }
          }
        }
        res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' })
        return res.end(JSON.stringify({ took: some.length }))
      }
      res.writeHead(405, { 'access-control-allow-origin': '*' }); return res.end('')
    }
    if (url.pathname === '/__motioneer/inbox') {
      const had = inbox
      return json(res, { picks: had || [] })
    }
    if (url.pathname === '/__motioneer/live') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache',
        connection: 'keep-alive' })
      res.write(`data: ${JSON.stringify({ boot: BOOT })}\n\n`)
      const beat = setInterval(() => { try { res.write(': still here\n\n') } catch { /* gone */ } }, 15_000)
      streams.add(res)
      req.on('close', () => { clearInterval(beat); streams.delete(res) })
      return
    }
    if (url.pathname === '/__motioneer/model' && req.method === 'GET') {
      return json(res, { providers: PROVIDERS, current: publicly(MODEL), canCli: CAN_CLI })
    }
    if (url.pathname === '/__motioneer/model' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      const next = {
        provider: String(body.provider || MODEL.provider),
        model: String(body.model ?? ''),
        base: String(body.base ?? ''),
        /**
         * An empty box means leave it alone, or changing the model name would wipe the key. Only an
         * explicit null clears it, which is what the button marked forget sends.
         *
         * Falling back to the environment last: the key there is no longer good enough to pick a
         * provider on its own, but somebody who has set it and then deliberately chose Anthropic in
         * the panel has already said what they want, and asking them to paste what is sitting in
         * their shell would be pedantry rather than care.
         */
        key: body.key === null ? '' : (body.key ? String(body.key)
          : (MODEL.key || (String(body.provider) === 'anthropic' ? process.env.ANTHROPIC_API_KEY || '' : ''))),
        chosen: true,
      }
      const gap = missing(next)
      if (gap.length) return json(res, { error: `${resolve(next).label} needs ${gap.join(' and ')}` })
      MODEL = next
      saveModel()
      console.log(`  writing with ${resolve(MODEL).label}${MODEL.model ? `, ${MODEL.model}` : ''}`)
      return json(res, { current: publicly(MODEL) })
    }
    if (url.pathname === '/__motioneer/model/check' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      // tested as typed rather than as saved, so a wrong key is caught before it is kept
      const trying = body.provider
        ? { ...body, key: body.key || (body.provider === MODEL.provider ? MODEL.key : '') || '' }
        : MODEL
      return json(res, await checkProvider(trying, { callMs: 30_000, env: CLEAN_ENV }))
    }
    if (url.pathname === '/__motioneer/save' && req.method === 'POST') {
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
    if (url.pathname === '/__motioneer/app') {
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
      /**
       * Handed on to the path the app thinks it is at, rather than served here.
       *
       * This served the entry page's content while the frame's address stayed /__motioneer/app, which is
       * invisible to anything rendered on a server and fatal to anything routed in the browser: an
       * application reads location.pathname, finds /__motioneer/app among its routes, and renders the one
       * it keeps for addresses that do not exist. Measured on a real app, its own not found page at
       * a hundred and nineteen nodes where the page itself is a hundred and thirty seven.
       *
       * So the entry is resolved here, where the redirects are followed, and the frame is then sent
       * to that path. Everything below already treats an unclaimed path as the app's own, injects
       * the picker and pulls the stylesheets back onto this origin, so what arrives is the same page
       * it was serving, at the address the app is expecting to be asked for.
       */
      const going = new URL(ENTRY, 'http://x')
      if (url.searchParams.has('n')) going.searchParams.set('__wall', url.searchParams.get('n'))
      if (quiet) going.searchParams.set('__wallquiet', '1')
      res.writeHead(302, { location: going.pathname + going.search, 'cache-control': 'no-store' })
      return res.end('')
    }
    if (url.pathname === '/__motioneer/target' && req.method === 'POST') {
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b)) }))
      try {
        /**
         * Checked before it is aimed, not after.
         *
         * aimAt sets HOST and ENTRY as it parses, so refusing afterwards would leave the studio
         * pointed at the address it just refused, and the next request through the catch all forward
         * would fetch it anyway. The order is the whole protection.
         */
        const want = /^https?:\/\//i.test(String(body.url ?? '').trim())
          ? String(body.url).trim()
          : (isLocal(String(body.url ?? '').trim().split('/')[0]) ? 'http://' : 'https://') + String(body.url ?? '').trim()
        const may = await allowed(want, GUARD)
        if (!may.ok) return json(res, { error: may.why })
        aimAt(body.url)
        const bad = await settleEntry()
        if (bad) return json(res, { error: bad.error })
        console.log(`  aimed at ${AIM}`)
        remember(AIM)
        saveSoon()
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
    if (url.pathname === '/__motioneer/asset') {
      const want = url.searchParams.get('u') ?? ''
      const may = await allowed(want, GUARD)
      if (!may.ok) { res.writeHead(400); return res.end(may.why) }
      try {
        const r = await fetch(want, { signal: AbortSignal.timeout(12000) })
        const body = Buffer.from(await r.arrayBuffer())
        res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'text/css',
          'cache-control': 'max-age=600' })
        return res.end(body)
      } catch (e) { res.writeHead(502); return res.end('') }
    }
    if (url.pathname === '/__motioneer/favicon') {
      const from = url.searchParams.get('host') || HOST
      if (!from) { res.writeHead(404); return res.end('') }
      if (!(await allowed(from, GUARD)).ok) { res.writeHead(404); return res.end('') }
      try {
        const r = await fetch(`${new URL(from).origin}/favicon.ico`, { signal: AbortSignal.timeout(4000) })
        if (!r.ok || !/image|icon/i.test(r.headers.get('content-type') ?? '')) throw new Error('none')
        res.writeHead(200, { 'content-type': r.headers.get('content-type'), 'cache-control': 'max-age=600' })
        return res.end(Buffer.from(await r.arrayBuffer()))
      } catch { res.writeHead(404); return res.end('') }
    }
    // anything not ours belongs to the app being proxied, which is how its root-relative assets
    // resolve without a single url being rewritten
    /**
     * Anything not ours belongs to the app, and the root is ours only when nobody framed it.
     *
     * OURS claims the root, which is right for the studio and wrong for the frame standing on it: a
     * site entered at its root sends the frame to / and this refused to forward it, so the app got
     * two bytes of no. Five nodes on nearly every site there is, which is emptier than the studio it
     * was serving before and just as wrong.
     *
     * The marks the redirect leaves are stripped before anything is forwarded, since an app that
     * reads its own query would otherwise be handed one it never wrote.
     */
    const asFrame = url.searchParams.has('__wall')
    if (HOST && (!OURS.test(url.pathname) || (asFrame && url.pathname === '/'))) {
      const quiet = url.searchParams.has('__wallquiet')
      const clean = new URL(url.href)
      clean.searchParams.delete('__wall'); clean.searchParams.delete('__wallquiet')
      return proxy(req, res, clean, quiet)
    }
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
/**
 * Letting go quickly when the watcher asks.
 *
 * Node's watcher sends a signal and then waits ten seconds for the process to leave before it
 * insists. An open event stream uses every one of those seconds, which turns a one second restart
 * into eleven and makes the thing built to save time cost it instead. Nothing here is worth a
 * graceful drain: the session is already on disk, so the sockets can go immediately.
 */
const letGo = () => {
  for (const r of streams) { try { r.end() } catch { /* already gone */ } }
  streams.clear()
  try { server.closeAllConnections?.() } catch { /* an older node without it */ }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 200).unref()
}
process.on('SIGTERM', letGo)
process.on('SIGINT', letGo)

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
else if (HAS_FOLDER) {
  const files = list().length
  console.log(`  ${files} component${files === 1 ? '' : 's'} under ${path.resolve(ROOT)}`)
} else console.log('  type where your app is running in the sidebar, or give a folder of components')
console.log(TARGET ? '  picked elements bring their own css, so nothing is guessed'
  : rawSheet ? `  styled with ${SHEET}`
    : '  no --css given: utility classes are compiled here and coloured from a Motioneer palette')
/* named from the config rather than from a key that no longer exists. This line read `KEY ?` for
   several commits after the variable behind it was removed, and threw every boot into the catch all
   handler, which is exactly the kind of thing you never see by reading the first two lines */
const writing = resolve(MODEL)
console.log(CAN_WRITE || MODEL.provider !== 'claude-cli'
  ? `  writing with ${writing.label}${writing.model ? `, ${writing.model}` : ''}`
    + `, changeable in settings\n`
  : '  no claude command on PATH, so nothing can be written. Install it, or pick another service\n'
    + '  in settings, and the button will have something to call.\n')
if (resumed) {
  console.log(`  picked up where it left off: ${made.size} option${made.size === 1 ? '' : 's'}`
    + `${resumed.aim ? `, still aimed at ${new URL(resumed.aim).host}` : ''}`)
}
// a restart every time a file is saved must not open a tab every time a file is saved
if (!process.env.MOTIONEER_NO_OPEN && !resumed) {
  const [cmd, a] = process.platform === 'darwin' ? ['open', [where]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', where]]
      : ['xdg-open', [where]]
  spawn(cmd, a, { stdio: 'ignore', detached: true }).unref()
}
