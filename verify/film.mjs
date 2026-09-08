/**
 * The autonomous film path, from a url to an MP4, with no network and a fake model.
 *
 * It drives the real thing: a real studio proxying a local site, the real editor headless, the
 * real gates, and the real renderer. Only the site and the model are stand-ins, so what this
 * proves is the orchestration in tools/editor/autofilm.mjs rather than a fixture of it. It needs
 * the renderer installed, the same as an export does, and it is not part of verify:all for that
 * reason; run it with `node verify/film.mjs`.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { autofilm } from '../tools/editor/autofilm.mjs'
import { loadChromium } from '../tools/editor/render.mjs'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
if (!(await loadChromium())) { console.log('skip: the local renderer is not installed, so the film path cannot be exercised here'); process.exit(0) }

const port = Number(process.env.MOTIONEER_PORT || 4397), at = `http://localhost:${port}`
const temp = await mkdtemp(path.join(tmpdir(), 'motioneer-film-'))
await mkdir(path.join(temp, '.studio'), { recursive: true })

const model = createServer(async (req, res) => {
  let body = ''; for await (const b of req) body += b
  const prompt = JSON.parse(body).messages.at(-1).content
  const kind = /Treatment: bold/.test(prompt) ? 'bold' : /Treatment: subtle/.test(prompt) ? 'subtle' : 'expressive'
  const css = '@media (prefers-reduced-motion: no-preference){[data-mn] > *{animation:rise 900ms ease-out both}'
    + '[data-mn] > :nth-child(2){animation-delay:80ms}@keyframes rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}}'
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ css, scope: 'data-mn', note: kind + ' rise' }) } }] }) + '\n\ndata: [DONE]\n\n')
})
await new Promise((r) => model.listen(0, '127.0.0.1', r))
const modelAt = `http://127.0.0.1:${model.address().port}`

const site = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><body style="margin:0;padding:40px;background:#eef1f6;font:16px system-ui;color:#1a2233">
    <h1 style="font-size:44px;margin:0 0 24px">Ship it with confidence</h1>
    <article style="width:520px;padding:28px;background:#fff;border-radius:16px;box-shadow:0 20px 60px #0002;margin-bottom:24px">
      <h2 style="margin:0 0 10px">Everything in one place</h2><p style="color:#5b6472">Your team's work, on one board.</p>
      <button style="margin-top:12px;background:#4f56d6;color:#fff;border:0;padding:12px 22px;border-radius:10px">Get started</button>
    </article>
    <div style="width:520px;height:220px;border-radius:16px;background:linear-gradient(135deg,#6b73e6,#c98bb0)"></div>
  </body></html>`)
})
await new Promise((r) => site.listen(0, '127.0.0.1', r))
const siteAt = `http://127.0.0.1:${site.address().port}`

await writeFile(path.join(temp, '.studio/model.json'), JSON.stringify({ provider: 'openai', base: modelAt + '/v1', model: 'fixture', key: 'fixture', chosen: true }))
// started on nothing on purpose: a studio left open on a folder is the state that once made a film time out
const studio = spawn(process.execPath, [path.join(root, 'tools', 'studio.mjs')],
  { cwd: temp, env: { ...process.env, MOTIONEER_PORT: String(port), MOTIONEER_NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; studio.stdout.on('data', (b) => log += b); studio.stderr.on('data', (b) => log += b)

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${at}/__motioneer/model`)).ok) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
  await fetch(`${at}/__motioneer/renderer`, { method: 'POST' })
  for (let i = 0; i < 120; i++) { const s = await (await fetch(`${at}/__motioneer/renderer`)).json(); if (s.state === 'ready') break; assert.notEqual(s.state, 'error', s.message); await new Promise((r) => setTimeout(r, 2000)) }

  const steps = []
  const before = await (await fetch(`${at}/__motioneer/editor-config`)).json()
  assert.equal(before.source, null, 'the studio should start aimed at nothing, so the aim is what is being proved')
  const result = await autofilm({ at, url: siteAt, seconds: 8, look: 'subtle', max: 2,
    choose: async (cands) => { assert.ok(cands.length >= 3, 'the page should offer several candidates'); return cands.slice(0, 2).map((c) => c.i) },
    onStep: (m) => steps.push(m) })
  assert.equal(result.captured, 2, 'both chosen elements should be captured')
  const buf = Buffer.from(await (await fetch(result.url)).arrayBuffer())
  assert.ok(buf.length > 20000, `the film should be a real mp4, got ${buf.length} bytes`)
  assert.equal(buf.slice(4, 8).toString(), 'ftyp', 'the file should start with an mp4 box')
  assert.ok(result.components >= 1, 'the film should carry a captured component, not just titles')
  console.log(`ok: url to mp4, ${result.captured} elements, ${result.components} in the cut, ${Math.round(result.seconds)}s, ${(buf.length / 1e6).toFixed(1)}MB`)

  // the film must not be blank: decode two frames with the renderer's own ffmpeg and require that
  // something is actually on screen. this is the check that would have caught an empty first cut.
  const mp4 = path.join(temp, 'out.mp4'); await writeFile(mp4, buf)
  const ffPath = (await import(pathToFileURL(path.join(process.env.MOTIONEER_RENDER_CACHE || path.join(process.env.HOME, '.cache/motioneer/renderer-1'), 'node_modules/ffmpeg-static/index.js')).href)).default
  const grab = (sec) => new Promise((res, rej) => {
    const rgb = path.join(temp, `f${sec}.rgb`)
    const p = spawn(ffPath, ['-y', '-ss', String(sec), '-i', mp4, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', rgb], { stdio: 'ignore' })
    p.on('error', rej); p.on('exit', () => readFileFn(rgb).then(res).catch(rej))
  })
  const { readFile: readFileFn } = await import('node:fs/promises')
  const lit = (frame) => { let on = 0; for (let i = 0; i < frame.length; i += 3) { if (frame[i] > 40 || frame[i + 1] > 40 || frame[i + 2] > 40) on++ } return on / (frame.length / 3) }
  const [a, b] = [await grab(1.5), await grab(Math.max(2.5, result.seconds / 2))]
  assert.ok(lit(a) > 0.002, `the opening title should be on screen, only ${(lit(a) * 100).toFixed(2)}% of it was lit`)
  assert.ok(lit(b) > 0.002, `a component should be on screen mid-film, only ${(lit(b) * 100).toFixed(2)}% of it was lit`)
  console.log(`ok: the film is not blank (opening ${(lit(a) * 100).toFixed(1)}% lit, middle ${(lit(b) * 100).toFixed(1)}% lit)`)
  console.log('ok: it reported each step:', steps.length, 'steps')
  console.log('film verification passed')
} catch (e) {
  console.error(log.slice(-3000)); throw e
} finally {
  studio.kill('SIGTERM'); model.close(); site.close()
}
