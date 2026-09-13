/**
 * From a running site to a rendered film with no clicks, for the MCP `film` tool.
 *
 * This drives the real editor in a headless browser rather than reimplementing any of it, because
 * the capture, the gates, the first cut and the render are the parts that took the longest to get
 * right and a second copy of them would drift. The one thing it adds is choosing what to film: it
 * tags the visible elements of the page, hands that list to the caller's `choose` function, and
 * films whichever it names. Every selector it clicks is one this file wrote onto the page, so a
 * chosen element always resolves. The editor's own aria labels are the contract, the same ones
 * verify/editor.mjs drives, so this stays in step with the room a person uses.
 */
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadChromium } from './render.mjs'
import { lit, proveFilm } from './proof.mjs'
import { firstCut, createProject, compositionDocument, contrastInk } from '../../dist-core/core.js'

import { candidates, aim, freshProject, openPage, contactSheet, dropDecoration, describe, reveal } from './survey.mjs'
import { withSoundtrack, scoreStyle } from './soundtrack.mjs'
export { inspectSite, describe, contactSheet } from './survey.mjs'
const label = (page, name) => page.getByRole('button', { name, exact: true })
const name = (c) => c ? (c.text || `the ${c.role} in the ${c.section}`) : 'an element'
const validColour=(value,label)=>{if(value!==undefined&&!/^#[0-9a-f]{6}$/i.test(value))throw new Error(`Cannot film: ${label} must be a six-digit hex color. Next: pass a color such as #101319.`);return value}
const titleScale=cut=>({...cut,tracks:cut.tracks.map(t=>t.kind==='title'?{...t,fontSize:(t.text||'').length>32?96:128}:t)})

export async function planFilm({ at, title, source, cands, pick, max, pace = 'brisk', direction = '', sheet = null }) {
  // A general product film should first explain the product. When complete interfaces exist,
  // their tiny labels and account switchers are details inside those shots, not rival captures.
  // An explicit pick still sees the entire inventory, including buttons the person names.
  if (!pick && cands.filter(c=>c.scene).length >= 3) cands=cands.filter(c=>c.scene || c.role==='image' || (c.role==='heading'&&c.section==='hero'))
  const system = 'You plan short motion films of product pages. Reply with one JSON object and nothing else.'
  const many = max >= 6
  const prompt = `Page: ${title || source}\nElements on it, one per line:\n${cands.map(describe).join('\n')}\n\n`
    + (sheet ? `The picture is a contact sheet of these elements, each tile labelled with its index in the corner. Judge by what you see: choose what looks strong and specific to this product, and skip tiles that are empty, cropped, or plain decoration.\n` : '')
    + (pick ? `The person asked to film: "${pick}". Choose what matches that first.\n` : '')
    + (direction ? `The person's direction for the whole film, which shapes the product line, the titles and every element's direction: "${direction}"\n` : '')
    + (many
      ? `Choose up to ${Math.min(max, cands.length)} distinct substantive elements from across the whole page in reading order: the hero heading and complete product interfaces first, then feature cards and images from further down. Choose fewer when the alternatives are navigation, account switchers, minor labels or repeats. Never spend a capture on a logo already represented by the opening title. Avoid nav and footer links. `
      : `Choose up to ${max} elements that make the best short film of this product: prefer a hero heading, a primary button or feature card, and one strong image; avoid nav, footer, and repeats. `)
    + `Then write the film's words from the page itself, not from imagination: "product" is what this product is in under ten words; "opening" should identify the actual brand, preferably just its name rather than repeating the hero's promise; "closing" should be the site's domain or a specific invitation found on the page. Respect any exact titles requested. `
    + `For each chosen element write "direction", one sentence on how it should arrive that names its parts, like "the price lands last" or "the headline settles before the subline".\n`
    + `Then cut it into "scenes", an ordered list of shots. Each scene has "elements", one or two chosen indices; "layout", one of full, detail, pair, stack; and "hold", one of long, normal, short. Use pair for two cards or images side by side, stack for a heading or label above the visual it introduces on the page, detail for one screenshot or image pushed in close, full otherwise. A label, a one-line h3, is never a scene on its own; use it only as the top of a stack, or leave it out. A button is never a scene on its own either: pair it with the card or heading it belongs to, or leave it out. Hold the hero long and small details short. `
    + (many ? `Aim for ${Math.min(max, cands.length)} to ${Math.min(max + 3, cands.length + 2)} scenes; an element may appear in two scenes if the second is a different layout.\n` : `One or two scenes per element.\n`)
    + `Reply exactly: {"indices":[...],"product":"...","opening":"...","closing":"...","directions":{"<index>":"..."},"scenes":[{"elements":[i,j],"layout":"pair","hold":"normal"}]}`
  const r = await fetch(`${at}/__motioneer/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt, json: true, images: sheet ? [{ mime: sheet.mime, data: sheet.data }] : [] }) })
    .then((x) => x.json()).catch((e) => ({ error: e.message }))
  const plan = r && r.json && typeof r.json === 'object' ? r.json : null
  const valid = plan && Array.isArray(plan.indices) ? plan.indices.map(Number).filter((n) => cands.some((c) => c.i === n)).slice(0, max) : []
  const layouts = ['full', 'detail', 'pair', 'stack'], holds = ['long', 'normal', 'short']
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes.map((sc) => ({ elements: (Array.isArray(sc?.elements) ? sc.elements : [sc?.element]).map(Number).filter((n) => valid.includes(n)).slice(0, 2), layout: layouts.includes(sc?.layout) ? sc.layout : 'full', hold: holds.includes(sc?.hold) ? sc.hold : 'normal' })).filter((sc) => sc.elements.length) : []
  if (valid.length) return { indices: valid, scenes, product: String(plan.product || '').slice(0, 120), opening: String(plan.opening || '').slice(0, 60), closing: String(plan.closing || '').slice(0, 60), directions: plan.directions && typeof plan.directions === 'object' ? plan.directions : {}, byModel: true }
  // prominence, when the model could not be asked: near the top, large, headings and cards ahead of bare images
  const byProminence = [...cands].filter((c) => c.section !== 'nav' && c.section !== 'footer').sort((a, b) => (b.w * b.h) / (b.top + 400) - (a.w * a.h) / (a.top + 400))
  return { indices: byProminence.slice(0, max).map((c) => c.i), scenes: [], product: '', opening: '', closing: '', directions: {}, byModel: false, why: r && r.error ? r.error : 'no plan came back' }
}

/**
 * Render a project through the studio and hand back the file's url. Every frame is a real
 * browser, so a short film takes about a minute; twenty minutes is the ceiling.
 */
async function renderProject(at, id, onStep) {
  onStep('Rendering. This runs a real browser for every frame and takes about a minute for a short film.')
  const start = await (await fetch(`${at}/__motioneer/projects/${id}/renders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
  if (start.error) throw new Error(`Cannot render: ${start.error} Next: wait for the running export to finish, or cancel it in the studio.`)
  let reported = -1
  for (let n = 0; n < 600; n++) {
    await new Promise((r) => setTimeout(r, 2000))
    const jobs = await (await fetch(`${at}/__motioneer/projects/${id}/renders`)).json()
    const job = jobs.find((j) => j.id === start.id)
    if (!job) continue
    const percent = job.total ? Math.floor(10 * job.done / job.total) * 10 : 0
    if (percent > reported) {reported=percent;onStep(`Exporting ${percent} percent.`)}
    if (job.state === 'error') throw new Error(`Cannot render: ${job.message || 'the render failed'}. Next: open the studio and export from there to see the frame it stopped on.`)
    if (job.state === 'complete') return { jobId: job.id, url: `${at}${job.url}` }
  }
  throw new Error('Cannot render: it did not finish in twenty minutes. Next: open the studio, the export is still listed there.')
}

/** The rendered file fetched to a temporary path and measured off its frames. */
export async function proveRender(url, { pace, seconds, cuts }) {
  const file = path.join(tmpdir(), `motioneer-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`)
  await writeFile(file, Buffer.from(await (await fetch(url)).arrayBuffer()))
  const proof = await proveFilm({ file, pace, seconds, cuts }).catch((e) => ({ ok: false, notes: [`it could not be measured: ${e.message}`], late: [], missing: [] }))
  return { file, proof }
}

/** Every boundary in a cut: each shot's start and the closing title's, for the proof to check in place. */
const boundariesOf = (cut) => [...new Set(cut.tracks.filter((t) => !t.hidden && t.kind !== 'audio' && (t.kind !== 'title' || t.start > 0)).map((t) => Math.round(t.start)))].sort((a, b) => a - b)

/** The shots of a cut as a list an agent can read: when, how long, which elements, which layout. */
export function shotList(cut) {
  const byStart = new Map()
  for (const t of cut.tracks.filter((t) => t.kind === 'component' && !t.hidden)) { if (!byStart.has(t.start)) byStart.set(t.start, []); byStart.get(t.start).push(t) }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, tracks], i) => {
    const names = [...new Set(tracks.map((t) => cut.subjects.find((s) => s.id === t.subjectId)?.name || t.name))]
    const layout = tracks.length > 1 ? (Math.abs(tracks[0].y - tracks[1].y) > Math.abs(tracks[0].x - tracks[1].x) ? 'stack' : 'pair') : tracks[0].width > 82 || tracks[0].width < 55 ? 'detail' : 'full'
    return { shot: i + 1, at: Math.round(start) / 1000, seconds: Math.round(Math.max(...tracks.map((t) => t.duration))) / 1000, elements: names, layout, ids: [...new Set(tracks.map((t) => t.subjectId))] }
  })
}

/** The shape of a cut read back from its tracks, so a revision keeps what the plan decided. */
function scenesOf(project) {
  const shots = shotList(project)
  const median = [...shots.map((s) => s.seconds)].sort((a, b) => a - b)[Math.floor(shots.length / 2)] || 1
  return shots.map((s) => ({ ids: s.ids, layout: s.layout, hold: s.seconds > median * 1.3 ? 'long' : s.seconds < median * 0.8 ? 'short' : 'normal' }))
}

/**
 * Drive one capture through the real picker. The element already wears data-mn-cand from
 * candidates(), so the click lands on exactly what was chosen.
 */
async function capture(page, frame, cand, about, pixels) {
  const before = await page.locator('.subject-item').count()
  if (!(await label(page, 'Done picking').count())) await label(page, 'Pick element').click()
  await page.waitForTimeout(250)
  const el = frame.locator(`[data-mn-cand="${cand}"]`).first()
  // a page that re-rendered since the scan lost its marks: the element is found again by what it said and how big it was
  if (!(await el.count()) && about) await frame.locator('body').evaluate((body, a) => {
    const words = (n) => (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120), expected = a.matchText ?? a.text
    for (const n of body.querySelectorAll(a.tag || '*')) { const r = n.getBoundingClientRect(); if (Math.abs(r.width - a.w) <= 8 && Math.abs(r.height - a.h) <= 8 && (!expected || words(n) === expected)) { n.setAttribute('data-mn-cand', String(a.i)); return } }
  }, about).catch(() => {})
  if (!(await el.count())) return -1
  await reveal(el)
  if(pixels){
    // Picker highlights and editor notifications must never become source pixels.
    if(await label(page,'Done picking').count())await label(page,'Done picking').click()
    const box=await el.boundingBox(),data=await el.screenshot({type:'png',animations:'disabled',style:'.studio > .toast{visibility:hidden!important}',timeout:5000}).catch(()=>null)
    if(!box||!data)return -1
    await label(page,'Pick element').click()
    pixels.set(before,{data:'data:image/png;base64,'+data.toString('base64'),w:Math.round(box.width),h:Math.round(box.height)})
  }
  /**
   * Handed to the picker, not clicked. The picker takes whatever the pointer is over, and on
   * notion.so the pointer over a card lands on the invisible anchor stretched across it, so five
   * of eight picks came back as a non-breaking space. A synthetic mousemove dispatched on the
   * element itself is not hit-tested: the picker records exactly that element, and "Capture
   * selection" takes it. The click stays as the fallback for a page where the event does not land.
   */
  await el.evaluate((node) => node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window }))).catch(() => {})
  await page.waitForTimeout(120)
  await label(page, 'Capture selection').click().catch(() => {})
  /**
   * Waited for generously, and for at least one rather than exactly one. Freezing a capture on
   * mongodb.com takes over eight seconds, a megabyte of stylesheet and two fonts, so the pointer
   * fallback fired while the first capture was still landing, one element became two subjects, and
   * every element after it was matched to the wrong subject. The index of the subject that arrived
   * is what the caller keeps, so a stray second one shifts nothing.
   */
  const landed = async (timeout) => { try { await page.waitForFunction((n) => document.querySelectorAll('.subject-item').length > n, before, { timeout }); return true } catch { return false } }
  if (await landed(25000)) return await page.locator('.subject-item').count() - 1
  const box = await el.boundingBox()
  if (!box) return -1
  await el.click({ position: { x: Math.min(8, box.width / 2), y: Math.min(8, box.height / 2) }, force: true }).catch(() => {})
  if (await landed(20000)) return await page.locator('.subject-item').count() - 1
  return -1
}

/**
 * @param at        the studio origin, http://localhost:4321
 * @param url       the site to film; the studio is aimed at it first, every time
 * @param pick      what the person asked to film, in their words, which outranks the defaults
 * @param plan      async ({ at, title, source, cands, pick, max }) => plan; planFilm asks the studio's model
 * @param prove     async (url, { pace, seconds, cuts }) => { file, proof }; proveRender measures the rendered file, and a suite can hand in a verdict
 * @param seconds   film length; the first cut spaces the picks across it
 * @param look      'subtle' | 'expressive' | 'bold', the single treatment written per element
 * @param max       cap on how many elements to capture
 * @param onStep    (message) => void  progress, surfaced to the agent's caller
 */
export async function autofilm({ at, url, language = 'en', theme, background, ink, captureMode = 'dom', pick = '', direction = '', plan = planFilm, prove = proveRender, seconds = 20, fps = 30, soundtrack = 'none', look = 'subtle', pace = 'brisk', max = 3, onStep = () => {} }) {
  if (![30,60].includes(fps)) throw new Error('Cannot film: frame rate must be 30 or 60. Next: choose one of those frame rates.')
  validColour(background,'background');validColour(ink,'ink')
  if(!['dom','pixels'].includes(captureMode))throw new Error('Cannot film: captureMode must be dom or pixels. Next: choose dom for layered motion or pixels for faithful flat captures.')
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot film: the renderer is not installed. Next: open the studio once and set up the local renderer, then ask again.')
  // aim first, every time: a studio already up may be on another site or a folder, and reusing it
  // as found is how a film once timed out on an empty frame
  let source = await aim(at, url)
  // channel:'chromium' to use the full build the renderer installed, since it omits the headless shell
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    onStep('Opening the editor on the site.')
    const projectId = await freshProject(at, `Film of ${source.replace(/^https?:\/\//, '').replace(/\/$/, '')}`)
    const opened=await openPage(browser,at,source,projectId,language,theme),{page,frame,title,colours}=opened;source=opened.source
    // a block page answers 200 and reads as a page of headings: replit.com's was filmed and verified
    if (/attention required|just a moment|access denied|been blocked|verify you are human|are you a robot|security check/i.test(title || '')) throw new Error(`Cannot open ${source}: that site is behind a bot check, which a proxy cannot pass. Nothing here can fix that. Next: open the studio and pick from your own browser with the bookmarklet.`)
    let cands = await dropDecoration(page, await candidates(frame), onStep)
    // a page still drawing itself is scanned again rather than declared empty
    for (let n = 0; n < 2 && !cands.length; n++) { await page.waitForTimeout(3000); cands = await dropDecoration(page, await candidates(frame), onStep) }
    if (!cands.length) {
      const words = await frame.locator('body').evaluate((b) => (b.innerText || '').trim().length).catch(() => 0)
      throw new Error(words > 200
        ? `Cannot film ${source}: the page rendered but nothing on it matched a heading, a card, a button or an image. Next: say what to film with pick, or open the studio and pick by hand.`
        : `Cannot film ${source}: the page stayed empty inside the studio, which is what a bot check or a sign in looks like from here. Next: open the studio and pick from your own browser with the bookmarklet.`)
    }
    onStep(`Found ${cands.length} things on ${title || source}. Preparing their visual references.`)
    const sheet = await contactSheet(page, frame, cands, onStep)
    onStep('Asking the model what to film and what to say.')
    const chosen = await plan({ at, title, source, cands, pick, max, pace, direction, sheet })
    onStep(chosen.byModel ? `The model chose ${chosen.indices.length}${chosen.product ? ` for "${chosen.product}"` : ''}.` : `The model could not be asked (${chosen.why}), so the most prominent elements were chosen.`)

    // what became of each chosen element, for a reply that says so rather than a count
    const fate = new Map(chosen.indices.map((n) => [n, 'not captured']))
    const captured = [], subjectAt = [], pixels = captureMode==='pixels'?new Map():null
    for (const n of chosen.indices) {
      onStep(`Capturing ${name(cands.find((c) => c.i === n))}.`)
      const at_ = await capture(page, frame, n, cands.find((c) => c.i === n), pixels)
      if (at_ >= 0) {
        captured.push(n); subjectAt.push(at_); fate.set(n, 'captured')
        // named after what it is rather than its tag, so a shot list and the editor's rail say "the image in the hero", not "div"
        await page.locator('.subject-item').nth(at_).click().catch(() => {})
        const field = page.getByLabel('Element name', { exact: true })
        if (await field.count()) await field.fill(name(cands.find((c) => c.i === n)).slice(0, 60)).catch(() => {})
      } else onStep('That one could not be captured, skipping it.')
      await label(page, 'Source').click().catch(() => {})
    }
    if (!captured.length) throw new Error(`Cannot film ${source}: none of the chosen elements could be captured. Next: ask for different elements with pick, or open the studio and pick by hand.`)
    if(pixels){
      // The last picked subject is still inside the editor's autosave debounce.
      // Wait for its save before replacing captures, or a reload drops that subject.
      await page.locator('.save-status[title="Saved locally"]').waitFor({timeout:15000})
      const saved=await(await fetch(`${at}/__motioneer/projects/${projectId}`)).json()
      saved.subjects=saved.subjects.map((sub,i)=>{
        const shot=pixels.get(i);if(!shot)return sub
        return {...sub,w:shot.w,h:shot.h,shot:shot.data,css:'',html:`<div style="width:${shot.w}px;height:${shot.h}px"><img src="${shot.data}" width="${shot.w}" height="${shot.h}" style="display:block;width:100%;height:100%" alt=""></div>`,warnings:['Captured as pixels to preserve source fidelity. Motion moves the whole image; its internal layers are not editable.']}
      })
      const put=await fetch(`${at}/__motioneer/projects/${projectId}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(saved)}).then(r=>r.json())
      if(put.error)throw new Error(`Cannot preserve the visual capture: ${put.error}. Next: try again.`)
      await page.reload({waitUntil:'domcontentloaded'})
      await page.locator('.subject-item').first().waitFor({timeout:20000})
      onStep('Preserved source pixels for faithful flat motion; internal layers stay flattened.')
    }


    /**
     * Each capture is drawn once through the film's own composition before a motion is written for
     * it, and one that comes up empty is left out. On webflow.com two of eight captures rendered as
     * white frames, images that never resolved, and cost two model calls and two blank shots. The
     * check is the proof's own content measure on a small screenshot, against the frame's ground.
     */
    const emptyOnes = new Set()
    {
      const saved = await (await fetch(`${at}/__motioneer/projects/${projectId}`)).json()
      const probe = await browser.newPage({ viewport: { width: 320, height: 180 } })
      try {
        for (let k = 0; k < captured.length; k++) {
          const sub = saved.subjects[subjectAt[k]]
          if (!sub) continue
          const one = createProject('probe'); one.settings.width = 320; one.settings.height = 180; one.settings.background = colours.background; one.subjects = [sub]
          one.tracks = [{ ...firstCut({ ...one, motions: [{ id: 'm', subjectId: sub.id, css: '', scope: 'x', note: '', brief: one.brief, treatment: 'subtle', duration: 1, saved: true }] }).tracks[1], x: 5, y: 5, width: 90, height: 90, start: 0, duration: 5000 }]
          await probe.setContent(compositionDocument(one), { waitUntil: 'load' }).catch(() => {})
          await probe.waitForTimeout(700)
          const shot = await probe.screenshot({ type: 'png' }).catch(() => null)
          if (!shot) continue
          const share = await probe.evaluate(async (b64) => {
            const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
            const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.drawImage(img, 0, 0)
            return Array.from(g.getImageData(0, 0, 320, 180).data).filter((_, i) => i % 4 !== 3)
          }, shot.toString('base64')).catch(() => null)
          if (process.env.MOTIONEER_DEBUG) onStep(`probe ${k} subject ${subjectAt[k]} ${sub.name} ${sub.w}x${sub.h} html ${sub.html.length} lit ${share ? lit(Uint8Array.from(share)).toFixed(4) : 'none'} bg ${colours.background}`)
          if (share && lit(Uint8Array.from(share)) < 0.003) emptyOnes.add(k)
        }
      } finally { await probe.close() }
      for (const k of emptyOnes) fate.set(captured[k], 'rendered empty')
      if (emptyOnes.size) onStep(`Left out ${emptyOnes.size} element${emptyOnes.size === 1 ? '' : 's'} that rendered empty.`)
    }

    /**
     * One treatment per element, all written at once. Each subject is briefed and its motion
     * started before the next is touched, so eight elements cost one model round rather than
     * eight in a row; then each is waited for and kept. The motion should fill most of its shot:
     * measured on a fast film, a 450ms motion with the model's usual ease-out was visibly over in
     * 135ms and the element then sat still for over a second, which reads as a pop. So a fast
     * shot of 1.3s gets a 0.9s motion, a brisk one 1.2s, and the direction asks for all of it.
     */
    // the whole duration, but from the first frame: asked for a slow arrival, a model once held the
    // root invisible for 850ms of a 1200ms shot and revealed it in the last third, which is a blank shot
    const paceNote = pace === 'calm' ? '' : ' Use the whole duration for the arrival, with the parts staggered across it, rather than an easing that is finished in the first third. Every part is visible and already moving from the very first frame; never hold the root or any part invisible, and keep every delay under 150ms. The last part should still be settling at seventy percent of the duration, so spread the stagger across it and use an ease that is not over in its first third.'
    // the element's own direction first, then the film's, so a detailed brief reaches every motion rather than only the plan
    const filmNote = direction ? ` The film's direction: ${direction}` : ''
    // a refused attempt is retried with its refusal in the brief: the same element failed the same gate twice on railway.com when asked again blind
    // the outline of what the selectors have to reach: the root and its first two levels, tags and classes, since a sheet that names parts the markup lacks animates nothing
    const outlineOf = async (k) => {
      const html = (await (await fetch(`${at}/__motioneer/projects/${projectId}`)).json()).subjects[subjectAt[k]]?.html || ''
      return page.evaluate((html) => {
        const root = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild
        if (!root) return ''
        const tag = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
        return tag(root) + ' > ' + [...root.children].slice(0, 8).map((c) => tag(c) + (c.children.length ? ' > (' + [...c.children].slice(0, 4).map(tag).join(', ') + ')' : '')).join(', ')
      }, html).catch(() => '')
    }
    const briefFor = (k, why = '', outline = '') => (String(chosen.directions[String(captured[k])] || '') + paceNote + filmNote
      + (why ? ` A previous attempt was refused: ${why.slice(0, 160)}. ${/nothing on the component is animating/.test(why) ? `So write selectors that reach this markup${outline ? `, which is ${outline.slice(0, 400)}` : ''}: animate the root itself and its direct children as [data-mn] > *, not classes you assume are there.` : 'Preserve captured transform matrices. Prefer independent translate and scale, ending at zero and one. Never change padding, margin, gap, display, position, overflow, width or height.'}` : '')).trim().slice(0, 1400)
    for (let k = 0; k < captured.length; k++) {
      if (emptyOnes.has(k)) continue
      await page.locator('.subject-item').nth(subjectAt[k]).click()
      const treat = page.getByLabel('Treatments', { exact: true })
      if (await treat.count()) await treat.selectOption(look).catch(() => {})
      const dur = page.getByLabel('Target duration (s)', { exact: true })
      if (await dur.count()) { await dur.fill(pace === 'fast' ? '1.0' : pace === 'brisk' ? '1.2' : '1.0') }
      const directionField = page.getByLabel('Creative direction', { exact: true })
      if (await directionField.count()) await directionField.fill(briefFor(k))
      await label(page, 'Explore motion').click()
      await page.waitForTimeout(150)
    }
    onStep(`Writing ${captured.length} ${look} motions at once.`)
    // a motion that failed is an answer too: waiting only for a finished card sat five minutes on
    // every element whose write failed, which read as a hang. a failed card names its reason and
    // gets one more try, since a model refusal is often a passing one
    let kept = 0
    const failures = []
    for (let k = 0; k < captured.length; k++) {
      if (emptyOnes.has(k)) continue
      await page.locator('.subject-item').nth(subjectAt[k]).click()
      const done = page.locator('.motion-card:not(.pending)')
      const settled = page.locator('.motion-card:not(:has(.spinner))')
      let why = ''
      for (let attempt = 0; attempt < 2 && !(await done.count()); attempt++) {
        try { await settled.first().waitFor({ timeout: attempt ? 150000 : 300000 }) } catch { why = 'no answer in time'; break }
        if (await done.count()) break
        why = ((await page.locator('.motion-card.pending p').first().textContent().catch(() => '')) || '').trim() || 'the write failed'
        if (!attempt && (await label(page, 'Retry treatment').count())) {
          onStep(`Element ${k + 1} got no motion (${why.slice(0, 80)}), asking once more with the reason.`)
          const directionField = page.getByLabel('Creative direction', { exact: true })
          if (await directionField.count()) await directionField.fill(briefFor(k, why, /nothing on the component is animating/.test(why) ? await outlineOf(k) : ''))
          // Explore appends another task and leaves the old failure in place. Waiting on the
          // first settled card then read that old failure immediately and discarded the retry.
          const oldTask = await page.locator('.motion-card.pending:has(button[aria-label="Retry treatment"])').first().getAttribute('data-task')
          await label(page, 'Retry treatment').first().click()
          if (oldTask) await page.locator(`[data-task="${oldTask}"]`).waitFor({state:'detached',timeout:5000})
        }
      }
      if (await label(page, 'Keep motion').count()) { await label(page, 'Keep motion').first().click(); kept++; fate.set(captured[k], 'filmed') }
      else { failures.push(why); fate.set(captured[k], `no motion: ${why.slice(0, 120)}`); onStep(`Element ${k + 1} got no motion (${why.slice(0, 80)}), leaving it out.`) }
    }
    if (!kept) throw new Error(`Cannot film: no motion came back for any element${failures[0] ? ` (${failures[0].slice(0, 120)})` : ''}. Next: check the model in the studio settings and try again.`)

    // the cut is assembled with the same function the editor's button calls, over http rather than
    // by clicking, so pace, length and the model's words all pass through one place. it waits for
    // the editor to have saved every kept motion first, since the cut is made from what is saved.
    const id = projectId
    let project
    for (let n = 0; n < 60; n++) {
      const saveError = await page.locator('.error-banner span').first().textContent({timeout:50}).catch(() => '')
      if (saveError) throw new Error(`Cannot save the film: ${saveError} Next: resolve the save error in the editor before cutting.`)
      project = await (await fetch(`${at}/__motioneer/projects/${id}`)).json()
      if ((project.motions || []).filter((m) => m.saved).length >= kept) break
      await new Promise((r) => setTimeout(r, 300))
    }
    // the editor saves on its own clock, and a cut sent over a save still on its way was refused as
    // changed in another tab; its own status line says when it has nothing left to write
    const settled = async () => {
      try { await page.waitForFunction(() => /Saved locally/.test(document.querySelector('.save-status')?.textContent || '') || document.querySelector('.error-banner'), null, { timeout: 12000 }) }
      catch {throw new Error('Cannot save the film: the editor still has unsaved changes. Next: wait for the editor to save before trying again.')}
      const saveError=await page.locator('.error-banner span').first().textContent({timeout:50}).catch(()=>'')
      if(saveError)throw new Error(`Cannot save the film: ${saveError} Next: resolve the save error in the editor before cutting.`)
      await new Promise((r) => setTimeout(r, 300))
      return (await fetch(`${at}/__motioneer/projects/${id}`)).json()
    }
    project = await settled()

    /**
     * Each kept motion is played once through the film's own composition and looked at where the
     * proof will look, 300ms in. On railway.com and supabase.com the model hid the root for most
     * of a one second shot and revealed it at the end, which the proof reads as a blank shot; the
     * brief asks against it and the model still does it about one film in five. So a motion whose
     * element shows nothing at that instant is refined once with the fault named, and the
     * refinement is kept when it passes, else the first stays. The same step mends a shot the
     * proof finds empty after the render.
     */
    const probe = await browser.newPage({ viewport: { width: 320, height: 180 } })
    const litAt = async (ms) => {
      await probe.evaluate((t) => window.__composition.seek(t), ms).catch(() => {})
      await probe.waitForTimeout(80)
      const shot = await probe.screenshot({ type: 'png' }).catch(() => null)
      if (!shot) return 0
      const share = await probe.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
        const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.drawImage(img, 0, 0)
        return Array.from(g.getImageData(0, 0, 320, 180).data).filter((_, i) => i % 4 !== 3)
      }, shot.toString('base64')).catch(() => null)
      return share ? lit(Uint8Array.from(share)) : 0
    }
    const hides = async (sub, motion) => {
      const one = createProject('probe'); one.settings.width = 320; one.settings.height = 180; one.settings.background = colours.background; one.subjects = [sub]; one.motions = [motion]
      const track = firstCut(one).tracks.find((t) => t.kind === 'component')
      if (!track) return false
      one.tracks = [{ ...track, x: 5, y: 5, width: 90, height: 90, start: 0, duration: 5000 }]
      await probe.setContent(compositionDocument(one), { waitUntil: 'load' }).catch(() => {})
      await probe.evaluate(() => window.__composition.ready()).catch(() => {})
      // the instant the proof reads, whatever the motion's length
      const third = await litAt(track.entrance + Math.min(300, motion.duration / 3)), end = await litAt(track.entrance + motion.duration + 200)
      return end > 0.003 && third < 0.002
    }
    /**
     * Once the driver has saved a cut, the editor page holds an older revision and every save it
     * makes after that is refused as changed in another tab, so a motion refined after the render
     * was written and never kept. Before such a refine the page is reloaded, which reopens the
     * project at the revision the server has.
     */
    let editorStale = false
    const freshenEditor = async () => {
      if (!editorStale) return
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.subject-item').first().waitFor({ timeout: 20000 }).catch(() => {})
      await page.getByRole('button', { name: /^Motions/ }).first().click().catch(() => {})
      editorStale = false
    }
    /** Ask once more for element k's motion with the fault named; true when a better one was kept. */
    const refineStart = async (k) => {
      const sub = project.subjects[subjectAt[k]], motion = sub && (project.motions || []).find((m) => m.subjectId === sub.id && m.saved)
      if (!motion) { if (process.env.MOTIONEER_DEBUG) onStep('refine: no saved motion'); return false }
      await freshenEditor()
      await page.locator('.subject-item').nth(subjectAt[k]).click()
      const directionField = page.getByLabel('Creative direction', { exact: true })
      if (await directionField.count()) await directionField.fill(((await directionField.inputValue()) + ' The previous version kept the whole element invisible for the first third; this one shows the element from its very first frame, with no opacity, clip or transform that hides all of it, and only its parts move into place.').slice(0, 1400))
      const before = await page.locator('.motion-card:not(.pending)').count()
      if (!(await label(page, 'Refine').count())) { if (process.env.MOTIONEER_DEBUG) onStep('refine: no refine button'); return false }
      await label(page, 'Refine').first().click()
      try { await page.waitForFunction((n) => document.querySelectorAll('.motion-card:not(.pending)').length > n, before, { timeout: 150000 }) } catch { if (process.env.MOTIONEER_DEBUG) onStep('refine: no new card'); return false }
      if (process.env.MOTIONEER_DEBUG) onStep('refine: cards ' + JSON.stringify(await page.locator('.motion-card').evaluateAll((cards) => cards.map((c) => c.className + ' ' + [...c.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).join('/')))))
      await page.locator('.motion-card:not(.pending)').last().getByRole('button', { name: 'Keep motion', exact: true }).click()
      let fresh, next
      for (let n = 0; n < 20 && !next; n++) { await new Promise((r) => setTimeout(r, 300)); fresh = await (await fetch(`${at}/__motioneer/projects/${id}`)).json(); next = (fresh.motions || []).find((m) => m.subjectId === sub.id && m.saved && m.id !== motion.id) }
      if (next && (await hides(sub, next))) { if (process.env.MOTIONEER_DEBUG) onStep('refine: the new one hides too'); await page.locator('.motion-card:not(.pending)').first().getByRole('button', { name: 'Keep motion', exact: true }).click().catch(() => {}); await page.waitForTimeout(600); project = await settled(); return false }
      project = await settled()
      if (!next && process.env.MOTIONEER_DEBUG) onStep(`refine: no new saved motion; motions ${JSON.stringify((fresh?.motions || []).map((m) => [m.subjectId === sub.id, m.saved, m.id === motion.id]))}`)
      return !!next
    }
    const repairs = []
    for (let k = 0; k < captured.length; k++) {
      const sub = project.subjects[subjectAt[k]], motion = sub && (project.motions || []).find((m) => m.subjectId === sub.id && m.saved)
      if (!motion || !(await hides(sub, motion))) continue
      onStep(`Element ${k + 1} stays hidden for a third of its motion, asking for one that shows from the first frame.`)
      if (await refineStart(k)) repairs.push(`rewrote the motion of ${sub.name} so it shows from its first frame`)
    }

    // scenes name candidates; the project's subjects sit in capture order, so a captured index maps to its subject
    const subjectOf = new Map(captured.map((cand, k) => [cand, emptyOnes.has(k) ? null : project.subjects[subjectAt[k]]?.id]).filter(([, id]) => id))
    // a button or a label is never a shot on its own, whatever the plan said: asked twice in the prompt, the model still filmed a lone button
    const minor = new Set(cands.filter((c) => c.role === 'button' || c.role === 'label').map((c) => c.i))
    let scenes = (chosen.scenes || []).map((sc) => ({ ids: sc.elements.filter((n) => !(sc.elements.length === 1 && minor.has(n))).map((n) => subjectOf.get(n)).filter(Boolean), layout: sc.layout, hold: sc.hold })).filter((sc) => sc.ids.length)
    // every captured element earns a shot before any comes round again: a plan of five scenes for eight captures once left three unused while the hero played twice
    const placed = new Set(scenes.flatMap((sc) => sc.ids))
    for (const [cand, id] of subjectOf) if (!placed.has(id) && !minor.has(cand)) scenes.push({ ids: [id], layout: 'full', hold: 'normal' })

    /** Cut the project with these scenes, save it, and say what the cut is. */
    const assemble = async (scenes) => {
      let cut = titleScale(firstCut(project, { pace, seconds, opening: chosen.opening, closing: chosen.closing, background: background ?? colours.background, ink, scenes }))
      cut.settings.fps = fps
      cut.source = source
      if(soundtrack!=='none')cut=await withSoundtrack(cut,{at,style:soundtrack,onStep})
      const components = cut.tracks.filter((t) => t.kind === 'component').length
      if (!components) throw new Error('Cannot cut: no kept motion was saved, so there was nothing to place. Next: try again; if it repeats, open the studio and keep a motion by hand.')
      const put = await fetch(`${at}/__motioneer/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cut) }).then((r) => r.json()).catch((e) => ({ error: e.message }))
      if (put.error) throw new Error(`Cannot cut: ${put.error} Next: try again.`)
      // read back rather than trusting the save's echo, since the repair below looks subjects and motions up on it
      project = await (await fetch(`${at}/__motioneer/projects/${id}`)).json()
      editorStale = true
      const shots = shotList(cut)
      return { cut, shots, shotsMade: shots.length, distinct: new Set(cut.tracks.filter((t) => t.kind === 'component').map((t) => t.subjectId)).size, layoutsUsed: new Set(scenes.map((sc) => sc.layout || 'full')).size || 1, cutTimes: boundariesOf(cut) }
    }
    onStep(`Cutting it ${pace}.`)
    let made = await assemble(scenes)
    onStep(`${made.shotsMade} shots of ${made.distinct} elements in ${made.layoutsUsed} layout${made.layoutsUsed === 1 ? '' : 's'} on the site's own ${colours.background} background${chosen.opening ? `, titled "${chosen.opening}"` : ''}${chosen.closing ? ` and "${chosen.closing}"` : ''}.`)
    let rendered = await renderProject(at, id, onStep)
    let proved = await prove(rendered.url, { pace, seconds, cuts: made.cutTimes })

    /**
     * One round of repair from the verdict, since the proof names what is wrong: a shot still
     * empty a third of a second in is a motion that hides its element, so that motion is asked
     * for again, and if the model will not show it the element is dropped; a planned cut that did
     * not show is two shots too alike to read as a cut, so the second is dropped. Then the film is
     * cut and rendered once more. Measured over forty sites, every failed verdict was one such
     * item, and a render is twenty seconds against two minutes for a film.
     */
    if (!proved.proof.ok && (proved.proof.late?.length || proved.proof.missing?.length)) {
      const kOf = (subjectId) => captured.findIndex((_, k) => project.subjects[subjectAt[k]]?.id === subjectId)
      const nameOf = (subjectId) => project.subjects.find((s) => s.id === subjectId)?.name || 'an element'
      let next = [...scenes]
      const dropShot = (ms, why) => {
        const shot = made.shots.find((sh) => Math.abs(sh.at * 1000 - ms) <= 260)
        if (!shot) return
        // the scene list cycles when short, so drop by content: the first scene made of exactly these elements
        const idx = next.findIndex((sc) => sc.ids.join() === shot.ids.join())
        if (idx < 0 || next.length < 2) return
        next.splice(idx, 1); repairs.push(`dropped the shot of ${shot.elements.join(' and ')} ${why}`)
      }
      for (const ms of (proved.proof.late || []).slice(0, 2)) {
        const shot = made.shots.find((sh) => Math.abs(sh.at * 1000 - ms) <= 260)
        const k = shot ? kOf(shot.ids[0]) : -1
        if (process.env.MOTIONEER_DEBUG) onStep(`repair: late ${ms} shot ${JSON.stringify(shot)} k ${k} subjects ${JSON.stringify(project.subjects.map((s) => s.id))} subjectAt ${JSON.stringify(subjectAt)}`)
        if (k >= 0) { onStep(`Shot ${shot.shot} starts empty, asking for a motion of ${nameOf(shot.ids[0])} that shows from the first frame.`); if (await refineStart(k)) { repairs.push(`rewrote the motion of ${nameOf(shot.ids[0])} because its shot started empty`); continue } }
        dropShot(ms, 'because it started empty')
      }
      for (const ms of (proved.proof.missing || []).slice(0, 2)) dropShot(ms, 'because the cut into it did not read')
      if (repairs.length) {
        onStep(`Mending the film: ${repairs.join('; ')}. Cutting and rendering it again.`)
        scenes = next
        project = await settled()
        made = await assemble(scenes)
        rendered = await renderProject(at, id, onStep)
        proved = await prove(rendered.url, { pace, seconds, cuts: made.cutTimes })
      }
    }
    const elements = chosen.indices.map((n) => {
      const k = captured.indexOf(n), sub = k >= 0 ? project.subjects[subjectAt[k]] : null
      const filmed = sub && made.cut.tracks.some(t => t.kind === 'component' && t.subjectId === sub.id)
      return { index: n, subjectId: sub?.id || null, name: name(cands.find((c) => c.i === n)), status: filmed ? 'filmed' : fate.get(n) === 'filmed' ? 'not used in final cut' : fate.get(n) || 'not captured', warnings: sub?.warnings || [] }
    })
    return { projectId: id, at, fps: made.cut.settings.fps, soundtrack: scoreStyle(made.cut) || 'none', jobId: rendered.jobId, url: rendered.url, file: proved.file, proof: proved.proof, repairs, elements, shotList: made.shots, captured: captured.length, components: made.cut.tracks.filter((t) => t.kind === 'component').length, shots: made.shotsMade, distinct: made.distinct, layouts: made.layoutsUsed, cutTimes: made.cutTimes, background: made.cut.settings.background, seconds: made.cut.settings.duration / 1000, product: chosen.product, opening: chosen.opening, closing: chosen.closing, byModel: chosen.byModel, source, title }
  } finally {
    await browser.close()
  }
}

/**
 * Change a film that exists without filming it again. The captures and the motions are the
 * expensive part, a minute of browser and model each; the cut and the render are seconds. So a
 * revision reads the shape of the cut back from the project, applies what was asked, cuts again
 * with the same function the editor's button calls, renders and measures. "Make it slower", "drop
 * the footer shot", "put the hero last", "call it something else" are all this.
 */
export async function revise({ at, projectId, pace, seconds, opening, closing, drop = [], order = [], motionDirection = '', motionElements = [], fps, soundtrack, background, ink, onStep = () => {} }) {
  validColour(background,'background');validColour(ink,'ink')
  if(fps!==undefined&&![30,60].includes(fps))throw new Error('Cannot revise: frame rate must be 30 or 60. Next: choose one of those frame rates.')
  let project = await (await fetch(`${at}/__motioneer/projects/${projectId}`)).json()
  if (!project || project.error || !Array.isArray(project.tracks)) throw new Error(`Cannot revise: no project ${projectId} in this studio. Next: film again, or pass the projectId a film returned.`)
  const was = shotList(project)
  if (!was.length) throw new Error('Cannot revise: this project has no shots yet. Next: film first, then revise the result.')
  const avg = was.reduce((a, s) => a + s.seconds, 0) / was.length
  const wasPace = avg < 1.8 ? 'fast' : avg < 3.4 ? 'brisk' : 'calm'
  const titles = project.tracks.filter((t) => t.kind === 'title').sort((a, b) => a.start - b.start)
  const want = { pace: ['calm', 'brisk', 'fast'].includes(pace) ? pace : wasPace, seconds: Number(seconds) || Math.round(project.settings.duration / 1000), opening: opening != null ? String(opening).slice(0, 60) : titles[0]?.text || '', closing: closing != null ? String(closing).slice(0, 60) : titles[titles.length - 1]?.text || '', background: background ?? project.settings.background, ink:ink??(background===undefined?titles[0]?.color:undefined) }
  let scenes = scenesOf(project).map((scene,i)=>({...scene,number:i+1}))
  const changes = []
  const previous = {id:crypto.randomUUID(),name:'Before revision',tracks:structuredClone(project.tracks),camera:structuredClone(project.camera),settings:{...project.settings}}
  if (motionDirection.trim()) {
    const visible = project.tracks.filter(t => t.kind === 'component' && !t.hidden)
    const active = new Set(visible.map(t => t.subjectId))
    const subjects = project.subjects.filter(s => active.has(s.id) && (!motionElements.length || motionElements.some(v => s.id === v || s.name.toLowerCase().includes(v.toLowerCase()))))
    if (!subjects.length) throw new Error('Cannot revise: none of those elements is used in the film. Next: use an element name or subjectId from the last film reply.')
    // A capture can use several treatments in the same film. Refine each used version once,
    // preserving that distinction instead of replacing every instance with its first treatment.
    const targets = subjects.flatMap(subject => [...new Set(visible.filter(t=>t.subjectId===subject.id).map(t=>t.motionId))].map(id=>{
      const original=project.motions.find(m=>m.id===id&&m.subjectId===subject.id)
      if(!original)throw new Error(`Cannot revise: ${subject.name} has no motion to refine. Next: keep a motion for it in the editor.`)
      return {subject,original}
    }))
    const versions = await Promise.all(targets.map(async ({subject,original}) => {
      onStep(`Refining ${subject.name}.`)
      const brief = {...original.brief,direction:motionDirection.slice(0,1400)}
      const motion = await fetch(`${at}/__motioneer/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subject,brief,treatment:original.treatment,previous:original})}).then(r=>r.json())
      if (motion.error) throw new Error(`Cannot revise: ${subject.name}: ${motion.error}. Next: adjust the motion direction and try again; the saved film is unchanged.`)
      return {...motion,parentId:original.id,saved:true}
    }))
    const byOriginal = new Map(versions.map(m=>[m.parentId,m]))
    project = {...project,motions:[...project.motions.map(m=>byOriginal.has(m.id)?{...m,saved:false}:m),...versions],tracks:project.tracks.map(t=>t.kind==='component'&&!t.hidden&&byOriginal.has(t.motionId)?{...t,motionId:byOriginal.get(t.motionId).id}:t)}
    changes.push(`refined ${subjects.map(s=>s.name).join(', ')}`)
  } else if (motionElements.length) throw new Error('Cannot revise: motionElements needs motionDirection. Next: describe how those elements should move.')
  for (const d of [].concat(drop).map((v) => String(v).trim()).filter(Boolean)) {
    if (/^\d+$/.test(d)) { const number = Number(d); if (scenes.some(s=>s.number===number)) { changes.push(`dropped shot ${d}`); scenes=scenes.filter(s=>s.number!==number) } ; continue }
    const hit = project.subjects.filter((s) => s.id===d || s.name.toLowerCase().includes(d.toLowerCase()))
    if (!hit.length) { changes.push(`no element called "${d}"`); continue }
    const ids = new Set(hit.map((s) => s.id))
    const before = scenes.length
    scenes = scenes.map((sc) => ({ ...sc, ids: sc.ids.filter((id) => !ids.has(id)) })).filter((sc) => sc.ids.length)
    changes.push(before === scenes.length ? `took ${hit.map((s) => s.name).join(', ')} out of its shots` : `dropped ${hit.map((s) => s.name).join(', ')}`)
  }
  if (Array.isArray(order) && order.length) {
    const wanted = [...new Set(order.map(Number))].filter((n) => Number.isInteger(n) && scenes.some(s=>s.number===n))
    if (wanted.length) { const rest = scenes.filter(s => !wanted.includes(s.number)); scenes = [...wanted.map(n => scenes.find(s=>s.number===n)), ...rest]; changes.push(`reordered the shots to ${wanted.join(', ')} first`) }
  }
  if (!scenes.length) throw new Error('Cannot revise: every shot was dropped. Next: drop fewer, or film again.')
  if (want.pace !== wasPace) changes.push(`cut ${want.pace}`)
  if (want.seconds !== Math.round(project.settings.duration / 1000)) changes.push(`${want.seconds} seconds long`)
  if(background!=null||ink!=null)changes.push('new film colors')
  if (opening != null || closing != null) changes.push('new titles')
  onStep(`Revising: ${changes.join('; ') || 'nothing asked, cutting it again as it was'}.`)
  // A note about movement changes references only. Recutting here would lose hand placement,
  // audio, camera, and linked timing even though none of them was part of the request.
  const recut = pace != null || seconds != null || opening != null || closing != null || drop.length || order.length
  let cut = recut ? titleScale(firstCut(project, { ...want, scenes })) : project
  if(background!==undefined)cut={...cut,settings:{...cut.settings,background}}
  if(ink!==undefined||background!==undefined)cut={...cut,tracks:cut.tracks.map(t=>t.kind==='title'?{...t,color:ink??contrastInk(background)}:t)}
  if(recut)cut.tracks.push(...project.tracks.filter(t=>t.kind==='audio'))
  if(fps!==undefined){cut.settings={...cut.settings,fps};changes.push(`${fps} fps`)}
  const score=soundtrack??(recut?scoreStyle(project):undefined)
  if(score!==undefined){cut=await withSoundtrack(cut,{at,style:score,onStep});changes.push(score==='none'?'removed the generated soundtrack':`${score} soundtrack`)}
  cut.arrangements = [...cut.arrangements,previous]
  const put = await fetch(`${at}/__motioneer/projects/${projectId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cut) }).then((r) => r.json()).catch((e) => ({ error: e.message }))
  if (put.error) throw new Error(`Cannot revise: ${put.error} Next: try again.`)
  const shots = shotList(cut), cutTimes = boundariesOf(cut)
  const rendered = await renderProject(at, projectId, onStep)
  const proved = await proveRender(rendered.url, { pace: want.pace, seconds: want.seconds, cuts: cutTimes })
  const distinct = new Set(cut.tracks.filter((t) => t.kind === 'component').map((t) => t.subjectId)).size
  return { projectId, at, fps: cut.settings.fps, soundtrack: scoreStyle(cut) || 'none', jobId: rendered.jobId, url: rendered.url, file: proved.file, proof: proved.proof, changes, shotList: shots, shots: shots.length, distinct, layouts: new Set(shots.map((s) => s.layout)).size, cutTimes, seconds: cut.settings.duration / 1000, pace: want.pace, opening: want.opening, closing: want.closing, background: want.background, source: project.source, elements: project.subjects.map((s) => ({ subjectId:s.id,name: s.name,warnings:s.warnings, status: cut.tracks.some((t) => t.subjectId === s.id) ? 'filmed' : 'left out' })) }
}
