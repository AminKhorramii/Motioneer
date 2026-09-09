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
import { loadChromium } from './render.mjs'
import { firstCut } from '../../dist-core/core.js'

const label = (page, name) => page.getByRole('button', { name, exact: true })

/** A compact, stable description of what is worth filming on the page inside the source frame. */
async function candidates(frame) {
  return frame.locator('body').evaluate((body) => {
    const out = []
    const worth = (el) => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el)
      if (r.width < 90 || r.height < 24 || r.width > 1300 || r.height > 900) return false
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.2) return false
      if (r.top + window.scrollY > 7000 || r.bottom + window.scrollY < 0) return false
      return true
    }
    const wanted = 'h1,h2,h3,button,a[role=button],[class*=card],[class*=Card],[class*=hero],[class*=Hero],figure,img,[class*=cta],[class*=CTA]'
    /**
     * What a pick resolves to, which is not always the element that matched. Measured on
     * notion.so, five of eight picks rendered blank: two were stretched links, an anchor with
     * position absolute and inset zero laid over a card as its click target, holding one
     * non-breaking space; one was a card's content box whose white text only reads on the dark
     * background of its parent. An overlay stands for what it covers, and a content box takes
     * the container that carries its look, when that container is not much bigger than itself.
     */
    // a painted background counts as something to see: a gradient block with no text is a shot, an empty transparent box is not
    const backed = (el) => { const cs = getComputedStyle(el); return (cs.backgroundColor && cs.backgroundColor !== 'transparent' && !/rgba\(\d+, \d+, \d+, 0\)/.test(cs.backgroundColor)) || cs.backgroundImage !== 'none' }
    const visible = (el) => (el.innerText || '').trim().length > 0 || !!el.querySelector('img,picture,video,svg,canvas') || el.tagName === 'IMG' || backed(el)
    const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height }
    const visualRoot = (el) => {
      if (!visible(el)) { const p = el.parentElement; return p && p !== body && getComputedStyle(el).position === 'absolute' && visible(p) ? p : null }
      let cur = el
      for (let n = 0; n < 3; n++) {
        if (backed(cur) || /^(h[1-3]|img|figure|button)$/i.test(cur.tagName)) return cur
        const p = cur.parentElement
        if (!p || p === body || area(p) > area(cur) * 2.5) break
        cur = p
      }
      return cur
    }
    let i = 0
    for (const matched of body.querySelectorAll(wanted)) {
      if (out.length >= 40) break
      const el = visualRoot(matched)
      if (!el || !worth(el)) continue
      // do not nest a candidate inside one already taken: a card and its own heading are one pick
      if (out.some((o) => o.el.contains(el) || el.contains(o.el))) continue
      const r = el.getBoundingClientRect(), top = Math.round(r.top + window.scrollY), page = document.documentElement.scrollHeight, style = getComputedStyle(el)
      el.setAttribute('data-mn-cand', String(i))
      const image = !!el.querySelector('img,picture,video,svg') || /url\(/.test(style.backgroundImage) || el.tagName === 'IMG'
      const section = top < 90 ? 'nav' : top < 900 ? 'hero' : top > page - 700 ? 'footer' : 'body'
      const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase()
      const role = el.tagName === 'IMG' ? 'image' : /^h[1-3]$/i.test(el.tagName) ? 'heading' : /button/i.test(el.tagName) || /cta|button/.test(cls) ? 'button' : /card/.test(cls) ? 'card' : /hero/.test(cls) ? 'hero' : el.tagName.toLowerCase()
      out.push({ el, i, tag: el.tagName.toLowerCase(), role, section, image, painted: !image && backed(el), w: Math.round(r.width), h: Math.round(r.height), top,
        // innerText, not textContent: a section with its own <style> tag reads back as a
        // keyframes block, and the model then plans a film about css instead of the product
        text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) })
      i++
    }
    /**
     * Collapse look-alikes. A page that mocks its own app in html offers a dozen identical
     * sidebar buttons, and twelve lines that differ only in their label cost the model and the
     * agent attention for nothing: one of them stands for the run, and says how many it stands for.
     */
    const kept = []
    for (const c of out) {
      // only small look-alikes fold: a row of sidebar buttons is one thing, three feature cards are three shots
      const twin = c.w * c.h < 20000 && kept.find((k) => k.role === c.role && k.section === c.section && Math.abs(k.w - c.w) <= 4 && Math.abs(k.h - c.h) <= 4 && k.image === c.image)
      if (twin) twin.alike = (twin.alike || 0) + 1; else kept.push(c)
    }
    return kept.map(({ el, ...rest }) => rest)
  })
}

/** One line per candidate, the way both the model and an agent read it. */
export const describe = (c) => `${c.i}: ${c.role} in ${c.section}, ${c.w}x${c.h}${c.image ? ', with an image' : c.painted && !c.text ? ', a painted block' : ''}${c.text ? `, "${c.text}"` : ''}${c.alike ? ` (and ${c.alike} more like it)` : ''}`
const name = (c) => c ? (c.text || `the ${c.role} in the ${c.section}`) : 'an element'

/**
 * Aim the studio and read the page without filming, for the inspect tool and for a film's plan.
 * Returns the page title and the candidates, each already tagged on the page.
 */
async function aim(at, url) {
  if (url) {
    const aimed = await fetch(`${at}/__motioneer/target`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      .then((r) => r.json()).catch((e) => ({ error: e.message }))
    if (aimed.error) throw new Error(`Cannot open ${url}: ${aimed.error} Next: check the address is running and reachable from this machine.`)
  }
  const config = await fetch(`${at}/__motioneer/editor-config`).then((r) => r.json()).catch(() => ({}))
  if (!config.source) throw new Error('Cannot film: the studio is not aimed at a site. Next: pass a url.')
  return config.source
}
/**
 * Every film gets a project of its own. The editor opens whichever project it last had, and a
 * film that lands in the person's own project adds elements to it and replaces its cut with
 * the film's, which is how a fast film once came out portrait: it had inherited somebody's
 * settings. A fresh project is created first and the editor is told to open that one.
 */
async function freshProject(at, name) {
  const made = await fetch(`${at}/__motioneer/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
    .then((r) => r.json()).catch((e) => ({ error: e.message }))
  if (!made || !made.id) throw new Error(`Cannot film: a project could not be created${made && made.error ? `: ${made.error}` : ''}. Next: try again.`)
  return made.id
}
async function openPage(browser, at, source, projectId) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  if (projectId) await page.addInitScript((id) => { try { localStorage.setItem('motioneer-project', id) } catch {} }, projectId)
  await page.goto(at, { waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('iframe[title="Source page"]')
  try { await frame.locator('body').waitFor({ timeout: 45000 }) }
  catch { throw new Error(`Cannot film ${source}: it did not render inside the studio in 45 seconds. It is slow, or it refuses to be proxied, which is what a site that signs in against its own api does. Next: try again once if it was slow; otherwise open the studio and pick from your own browser with the bookmarklet.`) }
  await page.waitForTimeout(3000)
  // a landing page renders below the fold only as it is scrolled, so it is walked once to wake it, then returned to the top
  await frame.locator('body').evaluate(async (body) => { const h = document.documentElement.scrollHeight; for (let y = 0; y < Math.min(h, 7000); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } window.scrollTo(0, 0) }).catch(() => {})
  await page.waitForTimeout(600)
  const title = await frame.locator('title').first().textContent().catch(() => '') || ''
  /**
   * The page's own ground and ink, read off the rendered document rather than guessed. A body
   * with no background falls through to the html element, then to white, because that is what a
   * browser paints; the ink is whatever the body's text is. These become the film's background
   * and its title colour, so the film stands on the site's colours instead of a dark stage of
   * its own, and a dark headline off a light page stays visible.
   */
  const colours = await frame.locator('body').evaluate((body) => {
    const hex = (rgb) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb || ''); if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null; return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('') }
    const ground = hex(getComputedStyle(body).backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || '#ffffff'
    return { background: ground, color: hex(getComputedStyle(body).color) || null }
  }).catch(() => ({ background: '#101319', color: null }))
  return { page, frame, title: title.trim(), colours }
}
export async function inspectSite({ at, url }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot inspect: the renderer is not installed. Next: open the studio once and set up the local renderer.')
  const source = await aim(at, url)
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const { frame, title, colours } = await openPage(browser, at, source)
    const cands = await candidates(frame)
    return { source, title, colours, candidates: cands }
  } finally { await browser.close() }
}

/**
 * The model's plan for a film: which elements, what the product is, what the titles say, and how
 * each element should move. One call, so the pieces agree with each other. `pick` is what the
 * person asked for in their own words, and it outranks the default preferences.
 */
export async function planFilm({ at, title, source, cands, pick, max, pace = 'brisk', direction = '' }) {
  const system = 'You plan short motion films of product pages. Reply with one JSON object and nothing else.'
  const many = max >= 6
  const prompt = `Page: ${title || source}\nElements on it, one per line:\n${cands.map(describe).join('\n')}\n\n`
    + (pick ? `The person asked to film: "${pick}". Choose what matches that first.\n` : '')
    + (direction ? `The person's direction for the whole film, which shapes the product line, the titles and every element's direction: "${direction}"\n` : '')
    + (many
      ? `Choose ${Math.min(max, cands.length)} distinct elements, as many as that, from across the whole page in reading order: the hero heading and image first, then feature cards, images and headings from further down, so the film shows the product's range. This is a fast film of many short shots; more distinct things beat fewer. Avoid nav and footer. `
      : `Choose up to ${max} elements that make the best short film of this product: prefer a hero heading, a primary button or feature card, and one strong image; avoid nav, footer, and repeats. `)
    + `Then write the film's words from the page itself, not from imagination: "product" is what this product is in under ten words; "opening" is a title of two to five words that names the product or its promise; "closing" is a title of two to five words that invites the next step. `
    + `For each chosen element write "direction", one sentence on how it should arrive that names its parts, like "the price lands last" or "the headline settles before the subline".\n`
    + `Reply exactly: {"indices":[...],"product":"...","opening":"...","closing":"...","directions":{"<index>":"..."}}`
  const r = await fetch(`${at}/__motioneer/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt, json: true }) })
    .then((x) => x.json()).catch((e) => ({ error: e.message }))
  const plan = r && r.json && typeof r.json === 'object' ? r.json : null
  const valid = plan && Array.isArray(plan.indices) ? plan.indices.map(Number).filter((n) => cands.some((c) => c.i === n)).slice(0, max) : []
  if (valid.length) return { indices: valid, product: String(plan.product || '').slice(0, 120), opening: String(plan.opening || '').slice(0, 60), closing: String(plan.closing || '').slice(0, 60), directions: plan.directions && typeof plan.directions === 'object' ? plan.directions : {}, byModel: true }
  // prominence, when the model could not be asked: near the top, large, headings and cards ahead of bare images
  const byProminence = [...cands].filter((c) => c.section !== 'nav' && c.section !== 'footer').sort((a, b) => (b.w * b.h) / (b.top + 400) - (a.w * a.h) / (a.top + 400))
  return { indices: byProminence.slice(0, max).map((c) => c.i), product: '', opening: '', closing: '', directions: {}, byModel: false, why: r && r.error ? r.error : 'no plan came back' }
}

/**
 * Drive one capture through the real picker. The element already wears data-mn-cand from
 * candidates(), so the click lands on exactly what was chosen.
 */
async function capture(page, frame, cand) {
  const before = await page.locator('.subject-item').count()
  if (!(await label(page, 'Done picking').count())) await label(page, 'Pick element').click()
  await page.waitForTimeout(250)
  const el = frame.locator(`[data-mn-cand="${cand}"]`).first()
  if (!(await el.count())) return false
  await el.scrollIntoViewIfNeeded().catch(() => {})
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
  try { await page.waitForFunction((n) => document.querySelectorAll('.subject-item').length === n, before + 1, { timeout: 8000 }); return true }
  catch { /* fall through to the pointer */ }
  const box = await el.boundingBox()
  if (!box) return false
  await el.click({ position: { x: Math.min(8, box.width / 2), y: Math.min(8, box.height / 2) }, force: true }).catch(() => {})
  try { await page.waitForFunction((n) => document.querySelectorAll('.subject-item').length === n, before + 1, { timeout: 15000 }) }
  catch { return false }
  return true
}

/**
 * @param at        the studio origin, http://localhost:4321
 * @param url       the site to film; the studio is aimed at it first, every time
 * @param pick      what the person asked to film, in their words, which outranks the defaults
 * @param plan      async ({ at, title, source, cands, pick, max }) => plan; planFilm asks the studio's model
 * @param seconds   film length; the first cut spaces the picks across it
 * @param look      'subtle' | 'expressive' | 'bold', the single treatment written per element
 * @param max       cap on how many elements to capture
 * @param onStep    (message) => void  progress, surfaced to the agent's caller
 */
export async function autofilm({ at, url, pick = '', direction = '', plan = planFilm, seconds = 20, look = 'subtle', pace = 'brisk', max = 3, onStep = () => {} }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot film: the renderer is not installed. Next: open the studio once and set up the local renderer, then ask again.')
  // aim first, every time: a studio already up may be on another site or a folder, and reusing it
  // as found is how a film once timed out on an empty frame
  const source = await aim(at, url)
  // channel:'chromium' to use the full build the renderer installed, since it omits the headless shell
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    onStep('Opening the editor on the site.')
    const projectId = await freshProject(at, `Film of ${source.replace(/^https?:\/\//, '').replace(/\/$/, '')}`)
    const { page, frame, title, colours } = await openPage(browser, at, source, projectId)
    const cands = await candidates(frame)
    if (!cands.length) throw new Error(`Cannot film ${source}: nothing on the page looked worth filming. It may still be loading or need a sign in. Next: try once more; if it needs a sign in, pick from your own browser with the bookmarklet in the studio.`)
    onStep(`Found ${cands.length} things on ${title || source}. Asking the model what to film and what to say.`)
    const chosen = await plan({ at, title, source, cands, pick, max, pace, direction })
    onStep(chosen.byModel ? `The model chose ${chosen.indices.length}${chosen.product ? ` for "${chosen.product}"` : ''}.` : `The model could not be asked (${chosen.why}), so the most prominent elements were chosen.`)

    const captured = []
    for (const n of chosen.indices) {
      onStep(`Capturing ${name(cands.find((c) => c.i === n))}.`)
      if (await capture(page, frame, n)) captured.push(n); else onStep('That one could not be captured, skipping it.')
      await label(page, 'Source').click().catch(() => {})
    }
    if (!captured.length) throw new Error(`Cannot film ${source}: none of the chosen elements could be captured. Next: ask for different elements with pick, or open the studio and pick by hand.`)

    /**
     * One treatment per element, all written at once. Each subject is briefed and its motion
     * started before the next is touched, so eight elements cost one model round rather than
     * eight in a row; then each is waited for and kept. The motion should fill most of its shot:
     * measured on a fast film, a 450ms motion with the model's usual ease-out was visibly over in
     * 135ms and the element then sat still for over a second, which reads as a pop. So a fast
     * shot of 1.3s gets a 0.9s motion, a brisk one 1.2s, and the direction asks for all of it.
     */
    const paceNote = pace === 'calm' ? '' : ' Use the whole duration for the arrival, with the parts staggered across it, rather than an easing that is finished in the first third.'
    for (let k = 0; k < captured.length; k++) {
      await page.locator('.subject-item').nth(k).click()
      const treat = page.getByLabel('Treatments', { exact: true })
      if (await treat.count()) await treat.selectOption(look).catch(() => {})
      const dur = page.getByLabel('Target duration (s)', { exact: true })
      if (await dur.count()) { await dur.fill(pace === 'fast' ? '0.9' : pace === 'brisk' ? '1.2' : '1.0') }
      const directionField = page.getByLabel('Creative direction', { exact: true })
      // the element's own direction first, then the film's, so a detailed brief reaches every motion rather than only the plan
      const filmNote = direction ? ` The film's direction: ${direction}` : ''
      if (await directionField.count()) await directionField.fill((String(chosen.directions[String(captured[k])] || '') + paceNote + filmNote).trim().slice(0, 760))
      await label(page, 'Explore motion').click()
      await page.waitForTimeout(150)
    }
    onStep(`Writing ${captured.length} ${look} motions at once.`)
    let kept = 0
    for (let k = 0; k < captured.length; k++) {
      await page.locator('.subject-item').nth(k).click()
      try { await page.locator('.motion-card:not(.pending)').first().waitFor({ timeout: 300000 }) } catch { onStep(`Element ${k + 1} got no motion in time, leaving it out.`); continue }
      if (await label(page, 'Keep motion').count()) { await label(page, 'Keep motion').first().click(); kept++ }
    }
    if (!kept) throw new Error('Cannot film: no motion came back for any element. Next: check the model in the studio settings and try again.')

    // the cut is assembled with the same function the editor's button calls, over http rather than
    // by clicking, so pace, length and the model's words all pass through one place. it waits for
    // the editor to have saved every kept motion first, since the cut is made from what is saved.
    onStep(`Cutting it ${pace}.`)
    const id = projectId
    let project
    for (let n = 0; n < 60; n++) {
      project = await (await fetch(`${at}/__motioneer/projects/${id}`)).json()
      if ((project.motions || []).filter((m) => m.saved).length >= captured.length) break
      await new Promise((r) => setTimeout(r, 300))
    }
    await new Promise((r) => setTimeout(r, 900))
    project = await (await fetch(`${at}/__motioneer/projects/${id}`)).json()
    const cut = firstCut(project, { pace, seconds, opening: chosen.opening, closing: chosen.closing, background: colours.background })
    const components = cut.tracks.filter((t) => t.kind === 'component').length
    if (!components) throw new Error('Cannot cut: no kept motion was saved, so there was nothing to place. Next: try again; if it repeats, open the studio and keep a motion by hand.')
    const put = await fetch(`${at}/__motioneer/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cut) }).then((r) => r.json()).catch((e) => ({ error: e.message }))
    if (put.error) throw new Error(`Cannot cut: ${put.error} Next: try again.`)
    const ms = cut.settings.duration
    // every boundary in the cut: each shot's start and the closing title's, for the proof to check in place
    const cutTimes = [...new Set(cut.tracks.filter((t) => t.kind !== 'title' || t.start > 0).map((t) => Math.round(t.start)))].sort((a, b) => a - b)
    onStep(`${components} shots on the site's own ${colours.background} background${chosen.opening ? `, titled "${chosen.opening}"` : ''}${chosen.closing ? ` and "${chosen.closing}"` : ''}.`)

    onStep('Rendering. This runs a real browser for every frame and takes about a minute for a short film.')
    const start = await (await fetch(`${at}/__motioneer/projects/${id}/renders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
    if (start.error) throw new Error(`Cannot render: ${start.error} Next: wait for the running export to finish, or cancel it in the studio.`)
    for (let n = 0; n < 600; n++) {
      await new Promise((r) => setTimeout(r, 2000))
      const jobs = await (await fetch(`${at}/__motioneer/projects/${id}/renders`)).json()
      const job = jobs.find((j) => j.id === start.id)
      if (!job) continue
      if (job.state === 'error') throw new Error(`Cannot render: ${job.message || 'the render failed'}. Next: open the studio and export from there to see the frame it stopped on.`)
      if (job.state === 'complete') return { projectId: id, at, jobId: job.id, url: `${at}${job.url}`, captured: captured.length, components, cutTimes, background: colours.background, seconds: ms / 1000, product: chosen.product, opening: chosen.opening, closing: chosen.closing, byModel: chosen.byModel }
    }
    throw new Error('Cannot render: it did not finish in twenty minutes. Next: open the studio, the export is still listed there.')
  } finally {
    await browser.close()
  }
}
