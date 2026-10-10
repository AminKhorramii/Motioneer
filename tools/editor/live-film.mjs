/**
 * A film made of the product rather than a picture of it: one HTML file that plays the real captures.
 *
 * An MP4 is pixels at one size. This file is the product's own DOM and SVG on the film's timeline,
 * so its text stays sharp at any size and can be selected, it fits whatever frame it is put in, and
 * it can sit on the product's own landing page. It starts with the sound off, because browsers
 * refuse to start a page with sound on. A viewer who asked their machine for less motion gets the
 * cuts and the settled parts, with no camera moving and no autoplay.
 *
 * The weight was mostly the score, an uncompressed WAV, so it is compressed; after that it is fonts
 * and images, which a capture repeats in every shot, so each one is stored once.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compositionDocument } from '../../dist-core/core.js'
import { loadFfmpeg } from './render.mjs'

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c')
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** A score compressed to AAC for the page, or left as it was when no encoder is installed. */
async function compressed(data, mime) {
  if (!/^audio\/(x-)?wav$/.test(mime)) return { data, mime }
  const ffmpeg = await loadFfmpeg().catch(() => null)
  if (!ffmpeg) return { data, mime }
  const dir = await mkdtemp(path.join(tmpdir(), 'motioneer-live-'))
  try {
    const from = path.join(dir, 'score.wav'), to = path.join(dir, 'score.m4a')
    await writeFile(from, data)
    await new Promise((done, fail) => {
      const p = spawn(ffmpeg, ['-v', 'error', '-y', '-i', from, '-c:a', 'aac', '-b:a', '128k', to], { stdio: 'ignore' })
      p.on('error', fail); p.on('exit', (code) => code ? fail(new Error(`ffmpeg exited ${code}`)) : done())
    })
    return { data: await readFile(to), mime: 'audio/mp4' }
  } catch { return { data, mime } } finally { await rm(dir, { recursive: true, force: true }) }
}

/** Where a viewer who asked for stillness first sees the film: its first element, settled. */
function settledAt(project) {
  const first = project.tracks.filter((t) => t.kind === 'component' && !t.hidden).sort((a, b) => a.start - b.start)[0]
  return first ? first.start + Math.min(1200, first.duration * 0.7) : 0
}

/**
 * The live film for a project.
 *
 * @param asset  (assetId) => Promise<{data, mime}>, the project's own bytes for each asset
 * @returns the document, and what it weighs and holds
 */
export async function liveFilm(project, asset) {
  const sources = {}
  for (const a of project.assets) {
    const got = await asset(a.id), small = await compressed(got.data, got.mime)
    sources[a.id] = `data:${small.mime};base64,${small.data.toString('base64')}`
  }
  let html = compositionDocument(project, '')
  for (const a of project.assets) html = html.split(`/__motioneer/projects/${project.id}/assets/${a.id}`).join(sources[a.id])
  const shared = [], seen = new Map()
  html = html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{1024,}/gi, (url) => {
    if (!seen.has(url)) { seen.set(url, shared.length); shared.push(url) }
    return `motioneer-shared:${seen.get(url)}`
  })
  const { width: W, height: H, duration: D, background } = project.settings
  // the charset stays first, ahead of the inlined data, and the page's own styles come after the document's
  if (!html.includes('<meta charset="utf-8">') || !html.includes('</head>') || html.indexOf('</head>') > html.indexOf('<script')) throw new Error('Cannot build the live film: the composition document changed shape. Next: update live-film.mjs to match it.')
  html = html.replace('<meta charset="utf-8">', () => `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="Motioneer"><title>${escape(project.name)}</title>`
    + `<script>window.__assetSources=${json(sources)};window.__shared=${json(shared)};window.__live={still:matchMedia('(prefers-reduced-motion: reduce)').matches}</script>`)
  html = html.replace('</head>', () => `<style>html,body{height:100%;background:${background}}#stage{transform-origin:0 0}`
    + `.film-controls{position:fixed;left:16px;bottom:16px;display:flex;gap:8px;opacity:0;transition:opacity .2s}body:hover .film-controls,.film-controls:focus-within,.film-controls[data-still]{opacity:1}`
    + `.film-controls button{font:500 13px/1 ui-sans-serif,system-ui,sans-serif;padding:8px 12px;border-radius:999px;border:1px solid #ffffff40;background:#0b0c0fcc;color:#f4f4f5;cursor:pointer}`
    + `.film-controls button:focus-visible{outline:2px solid #f4f4f5;outline-offset:2px}</style></head>`)
  // the document's own closing body is its last: the runtime builds each capture's frame from a string that holds one too
  const end = html.lastIndexOf('</body>')
  html = html.slice(0, end) + `<div class="film-controls" role="group" aria-label="Film controls"><button type="button" data-play></button><button type="button" data-sound></button></div>`
    + `<script>(()=>{const D=${D},W=${W},H=${H},stage=document.getElementById('stage'),still=window.__live.still,play=document.querySelector('[data-play]'),sound=document.querySelector('[data-sound]');`
    + `let t=still?${settledAt(project)}:0,last=performance.now(),playing=!still,muted=true;`
    + `const fit=()=>{const s=Math.min(innerWidth/W,innerHeight/H);stage.style.transform='translate('+(innerWidth-W*s)/2+'px,'+(innerHeight-H*s)/2+'px) scale('+s+')'};addEventListener('resize',fit);fit();`
    + `const show=()=>{play.textContent=playing?'Pause':'Play';sound.textContent=muted?'Sound off':'Sound on';sound.setAttribute('aria-pressed',String(!muted));if(still)play.parentElement.toggleAttribute('data-still',!playing);for(const a of document.querySelectorAll('audio'))a.muted=muted};`
    + `play.onclick=()=>{playing=!playing;last=performance.now();show()};sound.onclick=()=>{muted=!muted;show()};`
    + `addEventListener('keydown',e=>{if(e.key===' '||e.key==='k'){e.preventDefault();play.click()}else if(e.key==='m')sound.click()});`
    + `document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){playing=false;show()}});show();`
    + `requestAnimationFrame(function tick(n){if(playing)t=(t+n-last)%D;last=n;window.__composition.seek(t,playing&&!muted);requestAnimationFrame(tick)})})()</script>` + html.slice(end)
  return { html, bytes: Buffer.byteLength(html), shared: shared.length }
}
