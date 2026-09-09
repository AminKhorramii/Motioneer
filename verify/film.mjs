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
import { autofilm, inspectSite } from '../tools/editor/autofilm.mjs'
import { loadChromium } from '../tools/editor/render.mjs'
import { proveFilm } from '../tools/editor/proof.mjs'
import { firstCut, createProject, compositionDocument } from '../dist-core/core.js'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
if (!(await loadChromium())) { console.log('skip: the local renderer is not installed, so the film path cannot be exercised here'); process.exit(0) }

// the cut's rhythm, before any browser: fast means many short shots and short titles
{
  const p = createProject('pace'); p.subjects = [{ id: 'a', name: 'A', html: '<b>a</b>', css: '', w: 100, h: 50, warnings: [] }, { id: 'b', name: 'B', html: '<b>b</b>', css: '', w: 100, h: 50, warnings: [] }]
  p.motions = [{ id: 'ma', subjectId: 'a', css: '', scope: 'x', note: '', brief: p.brief, treatment: 'subtle', duration: 500, saved: true }, { id: 'mb', subjectId: 'b', css: '', scope: 'x', note: '', brief: p.brief, treatment: 'subtle', duration: 500, saved: true }]
  const calm = firstCut(p), fast = firstCut(p, { pace: 'fast', seconds: 12, opening: 'Hello', closing: 'Bye' })
  const light = firstCut(p, { background: '#f7f7f8' }), dark = firstCut(p, { background: '#0b0c10' })
  assert.equal(light.settings.background, '#f7f7f8'); assert.equal(light.tracks[0].color, '#111318', 'dark ink on a light ground')
  assert.equal(dark.tracks[0].color, '#f4f4f5', 'light ink on a dark ground'); assert.equal(calm.settings.background, p.settings.background, 'no background given leaves the project\'s own')
  const shotsOf = (c) => c.tracks.filter((t) => t.kind === 'component')
  assert.equal(shotsOf(calm).length, 2, 'calm places each kept motion once')
  assert.ok(shotsOf(fast).length >= 7, `fast fills 12 seconds with short shots, got ${shotsOf(fast).length}`)
  assert.ok(shotsOf(fast).every((t) => t.duration <= 1800), 'every fast shot is under 1.8 seconds')
  assert.equal(fast.tracks[0].text, 'Hello'); assert.equal(fast.tracks.at(-1).text, 'Bye')
  assert.ok(fast.tracks[0].duration <= 1200 && fast.settings.duration === 12000, 'fast titles are short and the length is what was asked')
  assert.notDeepEqual([shotsOf(fast)[0].x, shotsOf(fast)[0].width], [shotsOf(fast)[2].x, shotsOf(fast)[2].width], 'a repeated element is framed differently so it cuts rather than freezes')
  assert.ok(shotsOf(fast).every((t) => t.moves.length === 1 && t.moves[0].duration === t.duration), 'every fast shot keeps moving across its whole length')
  assert.ok(shotsOf(calm).every((t) => t.moves.length === 0), 'a calm shot holds still, the way the editor\'s button always did')
  console.log('ok: the cut is paced: calm places each motion once, fast fills the length with short shots and short titles')
}

const port = Number(process.env.MOTIONEER_PORT || 4397), at = `http://localhost:${port}`
const temp = await mkdtemp(path.join(tmpdir(), 'motioneer-film-'))
await mkdir(path.join(temp, '.studio'), { recursive: true })

const prompts = []
const model = createServer(async (req, res) => {
  let body = ''; for await (const b of req) body += b
  const prompt = JSON.parse(body).messages.at(-1).content
  prompts.push(prompt)
  if (/"opening"/.test(prompt)) {
    // the plan: the second and first candidates, words taken from the page, a direction for each
    // the card and the block, which is what a real page offers: things with area, not thin lines of text
    // chosen by what the lines say rather than by position, since the page's order is not the point being tested
    const lines = prompt.split('\n').map((l) => /^(\d+): (.*)$/.exec(l)).filter(Boolean)
    const card = Number(lines.find((m) => /Everything in one place/.test(m[2]))?.[1]), block = Number(lines.find((m) => /hero in/.test(m[2]) && /520x220/.test(m[2]))?.[1])
    const plan = { indices: [card, block], product: 'a board for shipping teams', opening: 'Ship it with confidence', closing: 'Get started today', directions: { [card]: 'the heading lands, then the button settles last', [block]: 'the block rises as one piece' } }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    return res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(plan) } }] }) + '\n\ndata: [DONE]\n\n')
  }
  const kind = /Treatment: bold/.test(prompt) ? 'bold' : /Treatment: subtle/.test(prompt) ? 'subtle' : 'expressive'
  // the root arrives and its parts follow, the way a gated motion does; a sheet that moved only children would leave a childless block popping in
  const css = '@media (prefers-reduced-motion: no-preference){[data-mn]{animation:rise 900ms ease-out both}[data-mn] > *{animation:rise 900ms ease-out both}'
    + '[data-mn] > :nth-child(2){animation-delay:120ms}[data-mn] > :nth-child(3){animation-delay:240ms}@keyframes rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}}'
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ css, scope: 'data-mn', note: kind + ' rise' }) } }] }) + '\n\ndata: [DONE]\n\n')
})
await new Promise((r) => model.listen(0, '127.0.0.1', r))
const modelAt = `http://127.0.0.1:${model.address().port}`

const site = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><body style="margin:0;padding:40px;background:#eef1f6;font:16px system-ui;color:#1a2233">
    <h1 style="font-size:44px;margin:0 0 24px">Ship it with confidence</h1>
    <article class="card" style="width:520px;padding:28px;background:#fff;border-radius:16px;box-shadow:0 20px 60px #0002;margin-bottom:24px">
      <style>@keyframes card-surface-in { from { opacity: 1; transform: scale(0.98); } }</style>
      <h2 style="margin:0 0 10px">Everything in one place</h2><p style="color:#5b6472">Your team's work, on one board.</p>
      <button style="margin-top:12px;background:#4f56d6;color:#fff;border:0;padding:12px 22px;border-radius:10px">Get started</button>
    </article>
    <div class="hero-image" style="width:520px;height:220px;margin:18px 0 0;border-radius:16px;background:linear-gradient(135deg,#6b73e6,#c98bb0)"></div>
    <article class="card" style="position:relative;width:520px;margin-top:24px;padding:24px;background:#fff;border-radius:12px"><h3 style="margin:0">Triage feedback</h3><a class="cardAnchor" aria-label="Open" href="#" style="position:absolute;inset:0">&nbsp;</a></article>
    <div style="width:300px;margin-top:24px;padding:24px;background:#151821;border-radius:12px"><div class="cardContent" style="color:#fff"><h3 style="margin:0">White on dark</h3><p style="margin:8px 0 0;color:#cfd3dc">Reads only on its ground.</p></div></div>
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
  const result = await autofilm({ at, url: siteAt, seconds: 12, look: 'subtle', pace: 'fast', max: 2, pick: 'the card and the headline', direction: 'calm confidence, every arrival settles like paper on a desk', onStep: (m) => steps.push(m) })
  assert.equal(result.captured, 2, 'both chosen elements should be captured')
  assert.ok(result.byModel, 'the plan should have come from the model through the studio, not the fallback')
  assert.equal(result.opening, 'Ship it with confidence', 'the opening title should be the model\'s words')
  const planPrompt = prompts.find((p) => /"opening"/.test(p))
  assert.ok(planPrompt && /the card and the headline/.test(planPrompt), 'the person\'s pick should reach the model')
  assert.ok(planPrompt && /card in (hero|body|nav)/.test(planPrompt), 'candidates should be described by role and section')
  {
    // every candidate is something a viewer would see: an invisible stretched link stands for its card, a content box for its dark container
    const lines = planPrompt.split('\n').filter((l) => /^\d+: /.test(l))
    assert.ok(lines.every((l) => /with an image|a painted block|"[^"]+"/.test(l)), `no candidate should be an invisible box: ${lines.filter((l) => !/with an image|a painted block|"[^"]+"/.test(l)).join(' | ')}`)
    assert.ok(lines.filter((l) => /Triage feedback/.test(l)).length === 1, 'the overlay anchor should resolve to its card once, not twice')
    const dark = lines.find((l) => /White on dark/.test(l))
    assert.ok(dark && /div in/.test(dark), `the white-on-dark content box should resolve to its dark container: ${dark}`)
  }
  /**
   * A candidate's text is what a reader sees, not what the node contains. The card carries its
   * own <style>, and read with textContent it described itself to the model as a keyframes block,
   * so the model named the product after css and wrote titles about it. Read with innerText the
   * style tag is not rendered and does not count.
   */
  assert.ok(planPrompt && !/@keyframes/.test(planPrompt), 'a candidate\'s own <style> must not be read as its text')
  assert.ok(planPrompt && /Everything in one place/.test(planPrompt), 'the card should describe itself by its heading')
  assert.ok(prompts.some((p) => /settles last|rises as one piece/.test(p)), 'the model\'s direction should reach the motion prompt')
  assert.ok(planPrompt && /settles like paper/.test(planPrompt), 'the film\'s direction should reach the plan')
  assert.ok(prompts.filter((p) => /settles like paper/.test(p) && !/"opening"/.test(p)).length >= 2, 'the film\'s direction should reach every motion prompt')
  const saved = await (await fetch(`${at}/__motioneer/projects/${result.projectId}`)).json()
  /**
   * A captured root sits flush in its frame. The block was captured with an 18px top margin, and a
   * frame sized to its box once rendered it 18px down and clipped its foot. Rendered through the
   * same composition the film uses, its top must be at 0.
   */
  {
    const block = saved.subjects.find((x) => /margin:18px/.test(x.html)) || saved.subjects.find((x) => /hero-image/.test(x.html))
    assert.ok(block, 'the block with the top margin should have been captured')
    const one = createProject('flush'); one.settings.width = block.w; one.settings.height = block.h; one.subjects = [block]
    one.tracks = [{ ...firstCut(one).tracks[0], kind: 'component', name: 'b', subjectId: block.id, motionId: undefined, x: 0, y: 0, width: 100, height: 100, start: 0, duration: 5000 }]
    const chromium = await loadChromium(); const browser = await chromium.launch({ channel: 'chromium' })
    try {
      const page = await browser.newPage({ viewport: { width: block.w + 20, height: block.h + 20 } })
      await page.setContent(compositionDocument(one), { waitUntil: 'load' }); await page.waitForTimeout(800)
      const top = await page.evaluate(() => { const f = document.querySelector('iframe'); const root = f.contentDocument.body.firstElementChild; return root.getBoundingClientRect().top })
      assert.ok(Math.abs(top) < 1, `a captured root should sit flush at the top of its frame, it sat at ${top}px`)
      console.log('ok: a captured root sits flush in its frame, its page margin dropped')
    } finally { await browser.close() }
  }
  const titles = saved.tracks.filter((t) => t.kind === 'title').map((t) => t.text)
  assert.deepEqual(titles, ['Ship it with confidence', 'Get started today'], 'both title tracks should carry the model\'s words')
  assert.equal(saved.settings.background, '#eef1f6', 'the film should stand on the site\'s own background')
  assert.ok(saved.tracks.filter((t) => t.kind === 'title').every((t) => t.color === '#111318'), 'titles on a light ground should be dark')
  assert.equal(result.background, '#eef1f6', 'the driver should report the background it matched')
  assert.ok(saved.tracks.filter((t) => t.kind === 'component').length >= 7, 'a fast cut should carry many shots, not one per element')
  console.log('ok: the model planned it: chose by the person\'s pick, wrote the titles, and directed each motion')
  /**
   * Inspect reads the same page without filming it. It went out referring to a name it never
   * bound and threw on every call, which nothing here noticed because nothing here called it.
   */
  {
    const seen = await inspectSite({ at, url: siteAt })
    assert.ok(seen.candidates.length >= 2, `inspect should list what is filmable, got ${seen.candidates.length}`)
    assert.equal(seen.colours.background, '#eef1f6', 'inspect should report the page\'s own ground')
    assert.ok(seen.candidates.some((c) => /Everything in one place/.test(c.text)), 'inspect should carry each candidate\'s rendered text')
    assert.ok(!seen.candidates.some((c) => /@keyframes/.test(c.text)), 'inspect should not read a <style> as an element\'s text')
    console.log(`ok: inspect lists ${seen.candidates.length} candidates on ${seen.colours.background} without filming`)
  }
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
  // the verifier, on the real file: a fast film must measure as fast off its own frames
  assert.ok(Array.isArray(result.cutTimes) && result.cutTimes.length >= 7, `the driver should hand back where it cut, got ${JSON.stringify(result.cutTimes)}`)
  const proof = await proveFilm({ file: mp4, pace: 'fast', seconds: 12, cuts: result.cutTimes })
  assert.equal(proof.cuts, result.cutTimes.length, `every planned cut should show in the frames: ${proof.notes.join('; ')}`)
  assert.ok(proof.ok, `the proof should pass for a fast film: ${proof.notes.join('; ')}`)
  assert.ok(proof.cuts >= 6, `a fast 12 second film should show at least 6 cuts, measured ${proof.cuts}`)
  assert.ok(proof.arriveMs >= 200, `elements should visibly arrive rather than pop, measured ${proof.arriveMs}ms`)
  const calmVerdict = await proveFilm({ file: mp4, pace: 'calm', seconds: 12, cuts: result.cutTimes })
  assert.ok(calmVerdict.ok, 'the same film passes a calm verdict, which asks less')
  console.log(`ok: measured off the frames: ${proof.cuts} cuts, shots ${(proof.avgShotMs / 1000).toFixed(1)}s on average, elements arriving over ${proof.arriveMs}ms, ${Math.round(proof.blank * 100)}% blank`)
  console.log('ok: it reported each step:', steps.length, 'steps')
  console.log('film verification passed')
} catch (e) {
  console.error(log.slice(-3000)); throw e
} finally {
  studio.kill('SIGTERM'); model.close(); site.close()
}
