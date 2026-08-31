/**
 * Whether a frame drawn in the browser is the frame somebody was looking at.
 *
 * Every failure this file exists for looks like success from the outside. A hold that sets one
 * global delay produces three canvases that differ, so "the pictures are not the same" proves
 * nothing; it takes reading the computed styles of three children under the hold to see that the
 * stagger collapsed. A serialized page with one attribute xml will not accept produces an Image
 * error with an empty message and a black canvas, which is a film that encodes, plays, and shows
 * nothing. A hold that does not undo cleanly produces frames that are each individually right and
 * a film that jitters. So this drives a real chromium against a real server and checks the three
 * of those directly, rather than checking that nothing threw.
 *
 *   node verify/raster.mjs          the whole thing
 *   node verify/raster.mjs --head   with a window, to look at what it drew
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const PORT = Number(process.env.WALL_PORT || 4471)
const AWAY = PORT + 1

const problems = []
const check = (ok, said) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${said}`)
  if (!ok) problems.push(said)
}
const near = (a, b, slack) => Math.abs(Number(a) - Number(b)) <= slack
/* a computed animation-delay comes back in seconds however it was written, so 100ms reads as 0.1s */
const millis = (t) => (String(t).trim().endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000)

/** a real woff2, because a fake one is inlined happily and never proves the font loader took it */
const FONT = readFileSync(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))

/** one red pixel, stretched by css, so the bytes are a real png and the frame has something in it */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

/* ── the pages under test ─────────────────────────────────────────────────────────────────────── */

const shell = (style, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:400px;height:300px;background:#101216;color:#e6e6e6;
  font:14px ui-sans-serif,system-ui;overflow:hidden}
${style}</style></head><body>${body}</body></html>`

const CASES = {
  /* one long move over a background that is always there, so a blank frame cannot pass as a change */
  motion: shell(`
    .bg{position:absolute;inset:0;background:linear-gradient(160deg,#1b2030,#101216)}
    .card{position:absolute;top:40px;left:20px;width:120px;height:120px;border-radius:14px;
      background:#5e6ad2;animation:sweep 600ms linear both}
    .label{position:absolute;bottom:16px;left:20px;color:#8a8f98}
    @keyframes sweep{from{transform:translateX(0) scale(.4)}to{transform:translateX(240px) scale(1)}}`,
    `<div class="bg"></div><div class="card"></div><div class="label">a card that moves</div>`),

  /**
   * The one that catches a global delay.
   *
   * A hundred millisecond move at nought, one hundred and two hundred, read at one fifty: the first
   * is over, the second is exactly halfway, the third has not begun. One shared delay puts all three
   * in the same place and the picture still changes frame to frame, so only the numbers show it.
   */
  stagger: shell(`
    .row{display:flex;gap:10px;padding:40px}
    .bar{width:80px;height:120px;background:#5e6ad2;opacity:0;animation:rise 100ms linear both}
    .bar:nth-child(1){animation-delay:0ms}
    .bar:nth-child(2){animation-delay:100ms}
    .bar:nth-child(3){animation-delay:200ms}
    @keyframes rise{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}`,
    `<div class="row"><div class="bar" id="a"></div><div class="bar" id="b"></div><div class="bar" id="c"></div></div>`),

  /* a pseudo element cannot take an inline style, which is the whole reason holdAt writes a sheet */
  pseudo: shell(`
    .p{position:relative;margin:60px 0 0 40px;width:260px;height:80px;background:#1b2030}
    .p::before{content:'';position:absolute;left:0;top:20px;width:40px;height:40px;
      background:#d25e6a;animation:slide 200ms linear both}
    .p::after{content:'later';position:absolute;right:8px;top:30px;color:#8a8f98;
      animation:dim 400ms linear both}
    @keyframes slide{from{transform:translateX(0)}to{transform:translateX(200px)}}
    @keyframes dim{from{opacity:0}to{opacity:1}}`,
    `<div class="p"></div>`),

  /* a font that is really fetched and really used, and a picture in both of the places one lives.
     Probe is declared at three weights and the page sets only one of them, which is what an app of
     this era looks like: it ships every weight it might use and draws with two. A frame that carries
     the weights nobody asked for is a frame several megabytes larger for no visible difference. */
  assets: shell(`
    @font-face{font-family:'Probe';src:url(/font.woff2) format('woff2');font-weight:400;font-display:block}
    @font-face{font-family:'Probe';src:url(/font-600.woff2) format('woff2');font-weight:600;font-display:block}
    @font-face{font-family:'Probe';src:url(/font-700.woff2) format('woff2');font-weight:700;font-display:block}
    body{font-family:'Probe',serif;font-weight:400}
    h1{font-size:34px;margin:20px}
    .tile{width:80px;height:80px;margin:0 20px;background-image:url(/pic.png);background-size:cover}`,
    `<h1>Probed</h1><img src="/pic.png" width="80" height="80" alt=""><div class="tile"></div>`),

  /* one that answers 403 and one that answers with no cors header, which fail in different places */
  dead: shell(`
    .keep{position:absolute;inset:0;background:#1b2030}
    img{position:relative;width:90px;height:90px;margin:20px}`,
    `<div class="keep"></div><img src="http://127.0.0.1:${AWAY}/403.png" alt="">`
    + `<img src="http://127.0.0.1:${AWAY}/nocors.png" alt="">`),

  /**
   * Everything the xml serializer is allowed to emit and no xml parser will read back.
   *
   * The attribute names are the ones three popular frameworks put in the dom, the ampersand is the
   * classic, and the child combinator matters because a style element's text is escaped on the way
   * out and has to survive being unescaped on the way back in.
   */
  /**
   * A page whose content runs out before the frame does, with the colour on the body.
   *
   * The browser lifts that background off the body and paints the whole canvas with it, which is
   * why a short body still fills a viewport. An image has no canvas, so without help the copy is
   * right down to the last row of content and transparent under it, and on the first real studio
   * page this was pointed at that was 39 percent of the frame.
   */
  short: `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#2a1b3d;font:14px system-ui;color:#fff}
    .strip{height:60px;background:#5e6ad2;animation:wipe 300ms linear both}
    @keyframes wipe{from{width:10%}to{width:90%}}
    </style></head><body><div class="strip"></div><p>short</p></body></html>`,

  /**
   * A sheet the copy cannot go and get, referring to a picture by a path only it knows.
   *
   * An external stylesheet is a request, and an image is not allowed to make one, so a page that
   * keeps its looks in a link arrives naked. The url inside it is relative to the sheet and not to
   * the page, which is why the sheet lives one directory down: resolving it against the document
   * would ask for /pic.png and get a 404, and the tile would come back empty with a note that reads
   * like a server problem.
   */
  linked: `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="/css/outside.css">
    <style>html,body{margin:0;width:400px;height:300px;background:#101216}</style>
    </head><body><div class="tile"></div><div class="mark"></div></body></html>`,

  /* pixels a script painted, which the script will not run again to repaint inside an image */
  painted: shell(`canvas{margin:40px;background:#222}`,
    `<canvas id="c" width="200" height="120"></canvas>`
    + `<script>var g=document.getElementById('c').getContext('2d');`
    + `g.fillStyle='#1ec98a';g.fillRect(10,10,180,100)<\/script>`),

  nasty: shell(`
    .box > .in{color:#5ed2a0}
    .box{padding:30px}`,
    `<!-- a -- comment -- with dashes -->`
    + `<div class="box" @click="go()" :class="{on:true}" [ngIf]="yes" v-bind:x="1">`
    + `<span class="in">Tom &amp; Jerry &lt; 5 &gt; 4</span><br><hr>`
    + `<input value="typed" id="typed"><input type="checkbox" checked></div>`),
}

/* ── the harness the module runs inside ───────────────────────────────────────────────────────── */

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>raster</title>
<style>body{margin:0;background:#08090a}iframe{border:0;display:block}</style></head><body>
<script type="module">
import * as R from '/shared/raster.mjs'
window.R = R
window.load = (name) => new Promise((done) => {
  const old = document.getElementById('f')
  if (old) old.remove()
  const f = document.createElement('iframe')
  f.id = 'f'; f.width = 400; f.height = 300; f.src = '/case/' + name
  f.onload = async () => {
    try { await f.contentDocument.fonts.ready } catch (_) {}
    requestAnimationFrame(() => requestAnimationFrame(() => done(f)))
  }
  document.body.appendChild(f)
})
/* a fingerprint of a canvas, plus enough to tell a picture from an empty rectangle */
window.pix = (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let sum = 0, lit = 0, ink = 0
  const colours = new Set()
  /* how much of the frame is not the colour it starts out as, which is the only one of these that
     can tell a bar that has faded in from a bar that has not, since the page behind both is opaque */
  const [br, bg, bb] = [d[0], d[1], d[2]]
  for (let i = 0; i < d.length; i += 4) {
    sum = (sum + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + d[i + 3] * 11) % 4294967296
    if (d[i + 3] > 8) lit++
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 24) ink++
    colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
  }
  return { sum, lit, ink, colours: colours.size, w: c.width, h: c.height }
}
/* every animatable value that a hold touches, for every element and both of its pseudo children */
window.snap = (doc) => [...doc.querySelectorAll('*')].map((el) => [null, '::before', '::after']
  .map((p) => {
    const s = getComputedStyle(el, p)
    return [s.animationName, s.animationDelay, s.animationPlayState, s.transform, s.opacity].join('|')
  }).join('//')).join('\\n')
window.tx = (doc, sel, part) => {
  const m = getComputedStyle(doc.querySelector(sel), part || null).transform
  const bits = String(m).match(/matrix\\(([^)]*)\\)/)
  return bits ? Number(bits[1].split(',')[4]) : 0
}
window.ready = true
<\/script></body></html>`

/* ── the two servers ──────────────────────────────────────────────────────────────────────────── */

const send = (res, code, type, body, headers = {}) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...headers })
  res.end(body)
}

const here = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', HARNESS)
  if (url.pathname === '/shared/raster.mjs')
    return send(res, 200, 'text/javascript; charset=utf-8', readFileSync(path.join(root, 'shared/raster.mjs')))
  /* the same bytes at three addresses, so a face that is carried can be told apart from a face that
     is merely declared. Sharing one url would let the fetch pool fold them into a single want and
     the count would read as correct however many faces had been kept */
  if (url.pathname === '/font.woff2' || url.pathname === '/font-600.woff2' || url.pathname === '/font-700.woff2') {
    return send(res, 200, 'font/woff2', FONT)
  }
  if (url.pathname === '/pic.png' || url.pathname === '/css/pic.png') return send(res, 200, 'image/png', PNG)
  if (url.pathname === '/css/outside.css')
    return send(res, 200, 'text/css', `.tile{width:120px;height:120px;margin:30px;`
      + `background-image:url(pic.png);background-size:cover}\n`
      + `.mark{width:60px;height:60px;margin:0 30px;background:#c94f1e}`)
  if (url.pathname.startsWith('/case/')) {
    const page = CASES[url.pathname.slice(6)]
    return page ? send(res, 200, 'text/html; charset=utf-8', page) : send(res, 404, 'text/plain', 'no such case')
  }
  send(res, 404, 'text/plain', 'nothing here')
})

const away = createServer((req, res) => {
  // the two ways an asset is lost: a server that says no, and a server that will not say who may ask
  if (req.url.startsWith('/403')) return send(res, 403, 'text/plain', 'no', { 'access-control-allow-origin': '*' })
  send(res, 200, 'image/png', PNG)
})

await new Promise((r) => here.listen(PORT, r))
await new Promise((r) => away.listen(AWAY, r))

const browser = await chromium.launch({ headless: !process.argv.includes('--head') })
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
const spoke = []
/* the dead case asks for two images that are supposed to fail, and the browser logs both. Counting
   those as a fault makes the one leg that proves failures are survivable the leg that reports one */
const expected = (text) => text.includes(String(AWAY)) || text.includes('403')
page.on('console', (m) => m.type() === 'error' && !expected(`${m.text()} ${m.location()?.url || ''}`) && spoke.push(m.text()))
page.on('pageerror', (e) => !expected(String(e.message)) && spoke.push(String(e.message)))

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.ready === true, null, { timeout: 10000 })
  check(true, 'the module loads in a browser as plain esm, with nothing built and nothing installed')

  const caveats = await page.evaluate(() => R.CAVEATS)
  check(Array.isArray(caveats) && caveats.length >= 8 && caveats.every((c) => typeof c === 'string' && c.length > 30),
    `CAVEATS names ${caveats.length} things that do not survive, in sentences the studio can show`)

  /* ── three instants, three pictures ─────────────────────────────────────────────────────────── */

  const moved = await page.evaluate(async () => {
    const doc = (await load('motion')).contentDocument
    const inlined = await R.inline(doc, {})
    const out = []
    for (const ms of [0, 300, 600]) {
      const canvas = await R.rasterize(doc, { width: 400, height: 300, ms, inlined })
      out.push(pix(canvas))
    }
    return out
  })
  const [zero, mid, end] = moved
  check(zero.sum !== mid.sum && mid.sum !== end.sum && zero.sum !== end.sum,
    `t=0, t=300 and t=600 give three different pictures (${zero.sum}, ${mid.sum}, ${end.sum})`)
  check(zero.lit > 100000 && zero.colours > 20,
    `the frame is a rendered page and not an empty rectangle (${zero.colours} colours over ${zero.lit} opaque pixels)`)
  check(zero.w === 400 && zero.h === 300, `the canvas is the size that was asked for (${zero.w} by ${zero.h})`)

  const scaled = await page.evaluate(async () => {
    const doc = document.getElementById('f').contentDocument
    return pix(await R.rasterize(doc, { width: 400, height: 300, ms: 300, scale: 2 }))
  })
  check(scaled.w === 800 && scaled.h === 600, `scale 2 draws the same frame at ${scaled.w} by ${scaled.h}`)

  /* ── the stagger, read as numbers ───────────────────────────────────────────────────────────── */

  const held = await page.evaluate(async () => {
    const doc = (await load('stagger')).contentDocument
    const read = () => ['#a', '#b', '#c'].map((s) => ({
      opacity: Number(getComputedStyle(doc.querySelector(s)).opacity),
      delay: getComputedStyle(doc.querySelector(s)).animationDelay,
      state: getComputedStyle(doc.querySelector(s)).animationPlayState,
    }))
    const undo = R.holdAt(doc, 150)
    const during = read()
    const xml = await R.serialize(doc, {})
    undo()
    return { during, xml }
  })
  const [one, two, three] = held.during
  check(near(one.opacity, 1, 0.02), `the child delayed 0ms has finished at t=150 (opacity ${one.opacity})`)
  check(near(two.opacity, 0.5, 0.06), `the child delayed 100ms is exactly mid flight at t=150 (opacity ${two.opacity})`)
  check(near(three.opacity, 0, 0.02), `the child delayed 200ms has not started at t=150 (opacity ${three.opacity})`)
  check(one.delay !== two.delay && two.delay !== three.delay,
    `each child kept its own delay rather than one global one (${one.delay}, ${two.delay}, ${three.delay})`)
  check([one, two, three].every((c) => c.state === 'paused'), 'every held animation is paused')
  const spacing = [one, two, three].map((c) => millis(c.delay))
  check(near(spacing[1] - spacing[0], 100, 0.5) && near(spacing[2] - spacing[1], 100, 0.5),
    `the three are still 100ms apart under the hold (${spacing.join('ms, ')}ms)`)
  check(/animation-delay:\s*-150ms/.test(held.xml) && /animation-delay:\s*-50ms/.test(held.xml) && /animation-delay:\s*50ms/.test(held.xml),
    'the copy carries the three shifted delays, so the picture staggers and not just the live page')

  const shot = await page.evaluate(async () => {
    const doc = document.getElementById('f').contentDocument
    const out = []
    for (const ms of [0, 150, 320]) out.push(pix(await R.rasterize(doc, { width: 400, height: 300, ms })))
    return out
  })
  check(shot[0].ink === 0 && shot[0].ink < shot[1].ink && shot[1].ink < shot[2].ink,
    `the drawn frames fill in one bar at a time (${shot.map((s) => s.ink).join(' then ')} pixels of bar)`)

  /* ── the undo ───────────────────────────────────────────────────────────────────────────────── */

  const restored = await page.evaluate(async () => {
    const doc = (await load('stagger')).contentDocument
    // parked at a known instant first, which is what the studio's own transport does, so that
    // "the same as before" is a claim about the hold and not about how long the call took
    for (const a of doc.getAnimations()) { a.pause(); a.currentTime = 320 }
    const before = snap(doc)
    const undo = R.holdAt(doc, 40)
    const during = snap(doc)
    undo()
    const after = snap(doc)
    let again = null
    for (let i = 0; i < 12; i++) R.holdAt(doc, i * 25)()
    again = snap(doc)
    return {
      same: before === after, moved: before !== during, steady: before === again,
      left: doc.querySelectorAll('[data-wall-held], style[data-wall-hold]').length,
      shows: before.slice(0, 0),
    }
  })
  check(restored.moved, 'the hold actually changed the computed styles it claims to change')
  check(restored.same, 'the undo puts every computed style back exactly as it was')
  check(restored.steady, 'twelve holds in a row leave the document where they found it, so frames cannot drift')
  check(restored.left === 0, 'the undo takes its marker attribute and its stylesheet back out of the document')

  const running = await page.evaluate(async () => {
    const doc = (await load('motion')).contentDocument
    const before = [...doc.getAnimations()].map((a) => a.playState)
    const undo = R.holdAt(doc, 200)
    const during = [...doc.getAnimations()].map((a) => a.playState)
    undo()
    return { before, during, after: [...doc.getAnimations()].map((a) => a.playState) }
  })
  check(running.before.length > 0 && running.before.join() === running.after.join() && running.during.every((s) => s === 'paused'),
    `an animation the studio was not driving is left as it was found (${running.before.join()} then ${running.during.join()} then ${running.after.join()})`)

  /* ── the pseudo elements ────────────────────────────────────────────────────────────────────── */

  const pseudo = await page.evaluate(async () => {
    const doc = (await load('pseudo')).contentDocument
    const undo = R.holdAt(doc, 100)
    const at = tx(doc, '.p', '::before')
    const after = Number(getComputedStyle(doc.querySelector('.p'), '::after').opacity)
    const xml = await R.serialize(doc, {})
    undo()
    const clean = tx(doc, '.p', '::before')
    const shots = []
    for (const ms of [0, 100, 200]) shots.push(pix(await R.rasterize(doc, { width: 400, height: 300, ms })))
    return { at, after, xml, clean, shots }
  })
  check(near(pseudo.at, 100, 3), `a ::before with its own animation is held mid flight at t=100 (translated ${pseudo.at}px of 200)`)
  check(near(pseudo.after, 0.25, 0.03), `a ::after on the same element is held on its own clock (opacity ${pseudo.after})`)
  check(/::before\{animation-delay:\s*-100ms/.test(pseudo.xml.replace(/\s*\{\s*/g, '{')),
    'the copy names the pseudo element in a rule, because no inline style can reach one')
  check(pseudo.shots[0].sum !== pseudo.shots[1].sum && pseudo.shots[1].sum !== pseudo.shots[2].sum,
    'the drawn frames of the pseudo element differ across the three instants')

  /* ── the inlining ───────────────────────────────────────────────────────────────────────────── */

  const assets = await page.evaluate(async () => {
    const doc = (await load('assets')).contentDocument
    let asked = 0
    const inlined = await R.inline(doc, { fetchVia: (u) => { asked++; return fetch(u) } })
    const xml = await R.serialize(doc, { inlined })
    const plain = await R.serialize(doc, {})
    return {
      asked, fonts: inlined.fonts.size, images: inlined.images.size, notes: inlined.notes,
      faces: [...inlined.fonts.keys()].map((u) => u.split('/').pop()).sort(),
      font: /data:font\/woff2;base64,[A-Za-z0-9+/]{200}/.test(xml),
      image: (xml.match(/data:image\/png;base64,/g) || []).length,
      bare: /data:image\/png;base64,/.test(plain),
      big: xml.length,
    }
  })
  check(assets.asked > 0, `fetchVia is used for every resource, so the studio can route one through its proxy (${assets.asked} calls)`)
  /* Measured on a real capture before this was written: twenty-three faces carried where three were
     ever loaded, and the twenty nobody asked for were ninety-nine point seven per cent of every
     frame. Asking the loader for families rather than for faces is what let a family in use carry
     every weight it declares. */
  check(assets.faces.join(',') === 'font-700.woff2,font.woff2',
    `only the weights the page draws with are inlined: body at 400 and the h1 at its default bold, `
    + `while the 600 nobody asked for is left behind (${assets.faces.join(' ') || 'none'})`)
  check(assets.images >= 1, `the images are inlined (${assets.images})`)
  check(assets.font, 'the serialized page carries the font as a data uri')
  check(assets.image >= 2, `both the img src and the background-image are data uris in the output (${assets.image} of them)`)
  check(!assets.bare, 'without inlined resources the same page has no data uris, so the check above is testing the inlining')
  check(assets.notes.length === 0, `nothing was skipped on a page where everything loads (${assets.notes.join('; ') || 'no notes'})`)

  /* ── the dead resources ─────────────────────────────────────────────────────────────────────── */

  const dead = await page.evaluate(async () => {
    const doc = (await load('dead')).contentDocument
    const inlined = await R.inline(doc, {})
    const frame = pix(await R.rasterize(doc, { width: 400, height: 300, ms: 0, inlined }))
    return { notes: inlined.notes, failed: inlined.failed.size, images: inlined.images.size, frame }
  })
  check(dead.notes.length === 2 && dead.failed === 2,
    `both cross origin images are skipped with a note rather than thrown (${dead.notes.join(' / ')})`)
  check(dead.notes.some((n) => n.includes('403')), 'the note for the refused one says what the server answered')
  check(dead.frame.lit > 100000, `a frame with two dead images still rasterizes (${dead.frame.lit} opaque pixels)`)

  /* ── the colour behind the page ─────────────────────────────────────────────────────────────── */

  const backdrop = await page.evaluate(async () => {
    const doc = (await load('short')).contentDocument
    const c = await R.rasterize(doc, { width: 400, height: 300, ms: 150 })
    const d = c.getContext('2d').getImageData(0, 0, 400, 300).data
    const at = (x, y) => [...d.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 4)]
    return { top: at(200, 10), bottom: at(200, 280), corner: at(395, 295) }
  })
  const purple = (p) => p[0] === 0x2a && p[1] === 0x1b && p[2] === 0x3d && p[3] === 255
  check(purple(backdrop.bottom) && purple(backdrop.corner),
    `a background declared on the body fills the whole frame and not just the body's own box (bottom ${backdrop.bottom.join()})`)

  const linked = await page.evaluate(async () => {
    const doc = (await load('linked')).contentDocument
    const inlined = await R.inline(doc, {})
    const xml = await R.serialize(doc, { inlined })
    const c = await R.rasterize(doc, { width: 400, height: 300, ms: 0, inlined })
    const d = c.getContext('2d').getImageData(0, 0, 400, 300).data
    const at = (x, y) => [...d.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 3)]
    return {
      css: inlined.css.length, images: inlined.images.size, notes: inlined.notes,
      link: /<link[^>]*stylesheet/.test(xml),
      data: /\.tile\{[^}]*data:image\/png/.test(inlined.css.replace(/\s*\{\s*/g, '{')),
      tile: at(90, 90), mark: at(60, 210),
    }
  })
  check(linked.notes.length === 0 && linked.images === 1,
    `a url inside a linked sheet resolves against the sheet and not the page (${linked.notes.join('; ') || 'nothing skipped'})`)
  check(linked.css > 50 && linked.data, `the rules of a linked stylesheet are carried as text with the url folded in (${linked.css} characters)`)
  check(!linked.link, 'the dead link element is taken out, since an image may not go and fetch it')
  check(linked.mark.join() === '201,79,30', `a colour that only the linked sheet knows about is painted (${linked.mark.join()})`)
  check(linked.tile[0] > 90 && linked.tile[0] > linked.tile[1] * 4 && linked.tile[0] > linked.tile[2] * 4,
    `a picture that only the linked sheet knows about is painted, and it is the red one (${linked.tile.join()})`)

  const painted = await page.evaluate(async () => {
    const doc = (await load('painted')).contentDocument
    const c = await R.rasterize(doc, { width: 400, height: 300, ms: 0 })
    const d = c.getContext('2d').getImageData(0, 0, 400, 300).data
    let green = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] > 180 && d[i + 2] > 120 && d[i + 2] < 180) green++
    return green
  })
  check(painted > 15000, `what a script painted into a 2d canvas is carried as a picture (${painted} pixels of it)`)

  /* ── the xml ────────────────────────────────────────────────────────────────────────────────── */

  const nasty = await page.evaluate(async () => {
    const doc = (await load('nasty')).contentDocument
    doc.getElementById('typed').value = 'typed later'
    const xml = await R.serialize(doc, {})
    const frame = pix(await R.rasterize(doc, { width: 400, height: 300, ms: 0 }))
    let parsed = 'no parser error'
    const bad = new DOMParser().parseFromString(xml, 'application/xhtml+xml').querySelector('parsererror')
    if (bad) parsed = bad.textContent.slice(0, 90)
    return {
      xml, parsed, frame,
      amp: xml.includes('Tom &amp; Jerry'),
      framework: /@click|:class=|\[ngIf\]/.test(xml),
      voids: /<br ?\/>/.test(xml) && /<hr ?\/>/.test(xml),
      ns: xml.startsWith(`<html xmlns="http://www.w3.org/1999/xhtml"`),
      combinator: xml.includes('.box &gt; .in') || xml.includes('.box > .in'),
      value: xml.includes('typed later'),
    }
  })
  check(nasty.parsed === 'no parser error', `the serialized page parses as xhtml (${nasty.parsed})`)
  check(nasty.ns, 'the root carries the xhtml namespace exactly once')
  check(nasty.amp, 'an ampersand in the text is escaped rather than left to end the parse')
  check(!nasty.framework, 'attribute names xml will not accept are dropped, which is what a vue or angular page is full of')
  check(nasty.voids, 'void elements are closed')
  check(nasty.combinator, 'a child combinator inside a style element survives the trip through xml')
  check(nasty.value, 'a value typed into an input is carried, because it lives on the property and not in the markup')
  check(nasty.frame.lit > 100000 && nasty.frame.colours > 2, `the awkward page draws (${nasty.frame.colours} colours)`)

  const broken = await page.evaluate(async () => {
    const doc = (await load('motion')).contentDocument
    /* a frame the browser refuses has to say so, because the alternative is a black frame in the
       middle of a film and an onerror event that carries no message at all */
    const real = R.serialize
    try {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><foreignObject><b xmlns="x">&broken;</b></foreignObject></svg>`
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      const why = await new Promise((done) => {
        const img = new Image()
        img.onload = () => done('it loaded')
        img.onerror = () => done('refused')
        img.src = url
      })
      return { why, real: typeof real }
    } catch (e) {
      return { why: String(e.message) }
    }
  })
  check(broken.why === 'refused', 'the browser really does refuse malformed svg silently, which is the failure serialize guards')

  let thrown = 'nothing'
  try {
    await page.evaluate(async () => {
      const doc = (await load('motion')).contentDocument
      doc.body.setAttribute('@onlyinhtml', 'x')
      await R.rasterize(doc, { width: 10, height: 10, ms: 0 })
    })
  } catch (e) {
    thrown = String(e.message)
  }
  check(thrown === 'nothing', `an attribute no xml parser accepts is cleaned rather than left to blank the frame (${thrown.slice(0, 60)})`)

  /* ── the whole sequence ─────────────────────────────────────────────────────────────────────── */

  const film = await page.evaluate(async () => {
    const doc = (await load('motion')).contentDocument
    const seen = []
    const started = performance.now()
    const count = await R.frames(doc, {
      fps: 30, ms: 1000, width: 1280, height: 720,
      onFrame: (canvas, i) => { seen.push({ i, ...pix(canvas) }) },
    })
    const took = performance.now() - started
    return { count, took, seen, per: took / count }
  })
  check(film.count === 30, `a second at 30fps is 30 frames (${film.count})`)
  check(film.seen.length === 30 && film.seen.every((f, i) => f.i === i), 'onFrame is called once a frame with the canvas and the index, in order')
  check(new Set(film.seen.map((f) => f.sum)).size >= 18 && film.seen.every((f) => f.ink > 0),
    `${new Set(film.seen.map((f) => f.sum)).size} of the 30 frames are distinct pictures, and none of them is blank`)
  check(film.seen.every((f) => f.w === 1280 && f.h === 720), 'every frame is the size the film asked for')
  console.log(`     ${Math.round(film.took)}ms for 30 frames of 1280 by 720, ${film.per.toFixed(1)}ms a frame`)

  const once = await page.evaluate(async () => {
    const doc = (await load('assets')).contentDocument
    let asked = 0
    await R.frames(doc, { fps: 10, ms: 500, width: 200, height: 150, fetchVia: (u) => { asked++; return fetch(u) } })
    return asked
  })
  check(once <= 3, `the resources are fetched once for the whole film and not once a frame (${once} fetches for 5 frames)`)

  check(spoke.length === 0, `the page logged no errors (${spoke.slice(0, 2).join(' / ') || 'silent'})`)
} catch (e) {
  check(false, `the run did not finish: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' ')}`)
} finally {
  await browser.close().catch(() => {})
  here.close()
  away.close()
}

console.log(`\nerrors: ${problems.length ? problems.join('; ') : 'none'}`)
process.exit(problems.length ? 1 : 0)
