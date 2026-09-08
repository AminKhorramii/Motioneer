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

const label = (page, name) => page.getByRole('button', { name, exact: true })

/** A compact, stable description of what is worth filming on the page inside the source frame. */
async function candidates(frame) {
  return frame.locator('body').evaluate((body) => {
    const out = []
    const worth = (el) => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el)
      if (r.width < 90 || r.height < 24 || r.width > 1300 || r.height > 900) return false
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.2) return false
      if (r.top > 2600 || r.bottom < 0) return false
      return true
    }
    const wanted = 'h1,h2,h3,button,a[role=button],[class*=card],[class*=Card],[class*=hero],[class*=Hero],figure,img,[class*=cta],[class*=CTA]'
    let i = 0
    for (const el of body.querySelectorAll(wanted)) {
      if (out.length >= 40 || !worth(el)) continue
      // do not nest a candidate inside one already taken: a card and its own heading are one pick
      if (out.some((o) => o.el.contains(el) || el.contains(o.el))) continue
      const r = el.getBoundingClientRect(), top = Math.round(r.top + window.scrollY), page = document.documentElement.scrollHeight, style = getComputedStyle(el)
      el.setAttribute('data-mn-cand', String(i))
      const image = !!el.querySelector('img,picture,video,svg') || /url\(/.test(style.backgroundImage) || el.tagName === 'IMG'
      const section = top < 120 ? 'nav' : top < 900 ? 'hero' : top > page - 700 ? 'footer' : 'body'
      const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase()
      const role = el.tagName === 'IMG' ? 'image' : /^h[1-3]$/i.test(el.tagName) ? 'heading' : /button/i.test(el.tagName) || /cta|button/.test(cls) ? 'button' : /card/.test(cls) ? 'card' : /hero/.test(cls) ? 'hero' : el.tagName.toLowerCase()
      out.push({ el, i, tag: el.tagName.toLowerCase(), role, section, image, w: Math.round(r.width), h: Math.round(r.height), top,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) })
      i++
    }
    /**
     * Collapse look-alikes. A page that mocks its own app in html offers a dozen identical
     * sidebar buttons, and twelve lines that differ only in their label cost the model and the
     * agent attention for nothing: one of them stands for the run, and says how many it stands for.
     */
    const kept = []
    for (const c of out) {
      const twin = kept.find((k) => k.role === c.role && k.section === c.section && Math.abs(k.w - c.w) <= 4 && Math.abs(k.h - c.h) <= 4 && k.image === c.image)
      if (twin) twin.alike = (twin.alike || 0) + 1; else kept.push(c)
    }
    return kept.map(({ el, ...rest }) => rest)
  })
}

/** One line per candidate, the way both the model and an agent read it. */
export const describe = (c) => `${c.i}: ${c.role} in ${c.section}, ${c.w}x${c.h}${c.image ? ', with an image' : ''}${c.text ? `, "${c.text}"` : ''}${c.alike ? ` (and ${c.alike} more like it)` : ''}`
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
async function openPage(browser, at, source) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(at, { waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('iframe[title="Source page"]')
  try { await frame.locator('body').waitFor({ timeout: 45000 }) }
  catch { throw new Error(`Cannot film ${source}: it did not render inside the studio in 45 seconds. It is slow, or it refuses to be proxied, which is what a site that signs in against its own api does. Next: try again once if it was slow; otherwise open the studio and pick from your own browser with the bookmarklet.`) }
  await page.waitForTimeout(4000)
  const title = await frame.locator('title').first().textContent().catch(() => '') || ''
  return { page, frame, title: title.trim() }
}
export async function inspectSite({ at, url }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot inspect: the renderer is not installed. Next: open the studio once and set up the local renderer.')
  const source = await aim(at, url)
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const { frame, title } = await openPage(browser, at, source)
    const cands = await candidates(frame)
    return { source, title, candidates: cands }
  } finally { await browser.close() }
}

/**
 * The model's plan for a film: which elements, what the product is, what the titles say, and how
 * each element should move. One call, so the pieces agree with each other. `pick` is what the
 * person asked for in their own words, and it outranks the default preferences.
 */
export async function planFilm({ at, title, source, cands, pick, max }) {
  const system = 'You plan short motion films of product pages. Reply with one JSON object and nothing else.'
  const prompt = `Page: ${title || source}\nElements on it, one per line:\n${cands.map(describe).join('\n')}\n\n`
    + (pick ? `The person asked to film: "${pick}". Choose what matches that first.\n` : '')
    + `Choose up to ${max} elements that make the best short film of this product: prefer a hero heading, a primary button or feature card, and one strong image; avoid nav, footer, and repeats. `
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
  const box = await el.boundingBox()
  if (!box) return false
  await el.click({ position: { x: Math.min(8, box.width / 2), y: Math.min(8, box.height / 2) }, force: true }).catch(() => {})
  try { await page.waitForFunction((n) => document.querySelectorAll('.subject-item').length === n, before + 1, { timeout: 20000 }) }
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
export async function autofilm({ at, url, pick = '', plan = planFilm, seconds = 20, look = 'subtle', max = 3, onStep = () => {} }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot film: the renderer is not installed. Next: open the studio once and set up the local renderer, then ask again.')
  // aim first, every time: a studio already up may be on another site or a folder, and reusing it
  // as found is how a film once timed out on an empty frame
  const source = await aim(at, url)
  // channel:'chromium' to use the full build the renderer installed, since it omits the headless shell
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    onStep('Opening the editor on the site.')
    const { page, frame, title } = await openPage(browser, at, source)
    const cands = await candidates(frame)
    if (!cands.length) throw new Error(`Cannot film ${source}: nothing on the page looked worth filming. It may still be loading or need a sign in. Next: try once more; if it needs a sign in, pick from your own browser with the bookmarklet in the studio.`)
    onStep(`Found ${cands.length} things on ${title || source}. Asking the model what to film and what to say.`)
    const chosen = await plan({ at, title, source, cands, pick, max })
    onStep(chosen.byModel ? `The model chose ${chosen.indices.length}${chosen.product ? ` for "${chosen.product}"` : ''}.` : `The model could not be asked (${chosen.why}), so the most prominent elements were chosen.`)

    const captured = []
    for (const n of chosen.indices) {
      onStep(`Capturing ${name(cands.find((c) => c.i === n))}.`)
      if (await capture(page, frame, n)) captured.push(n); else onStep('That one could not be captured, skipping it.')
      await label(page, 'Source').click().catch(() => {})
    }
    if (!captured.length) throw new Error(`Cannot film ${source}: none of the chosen elements could be captured. Next: ask for different elements with pick, or open the studio and pick by hand.`)

    // one treatment per element, with the model's direction for it, kept as we go so the first cut has something to place
    for (let k = 0; k < captured.length; k++) {
      await page.locator('.subject-item').nth(k).click()
      const treat = page.getByLabel('Treatments', { exact: true })
      if (await treat.count()) await treat.selectOption(look).catch(() => {})
      const dur = page.getByLabel('Target duration (s)', { exact: true })
      if (await dur.count()) { await dur.fill('0.6') }
      const direction = page.getByLabel('Creative direction', { exact: true })
      if (await direction.count()) await direction.fill(String(chosen.directions[String(captured[k])] || '').slice(0, 300))
      onStep(`Writing a ${look} motion for element ${k + 1} of ${captured.length}.`)
      await label(page, 'Explore motion').click()
      await page.locator('.motion-card:not(.pending)').first().waitFor({ timeout: 300000 })
      if (await label(page, 'Keep motion').count()) await label(page, 'Keep motion').first().click()
    }

    onStep('Cutting the first cut.')
    await label(page, 'Film').click()
    // set the length before cutting, so the first cut spaces the picks across it; done in the editor
    // rather than over http, so there is no race with the editor's own autosave and its revisions
    const ms = Math.max(6000, Math.round(seconds * 1000))
    const lengthField = page.getByLabel('Film length (s)', { exact: true })
    if (await lengthField.count()) { await lengthField.fill(String(Math.round(ms / 1000))) }
    const cut = label(page, 'Create first cut')
    await cut.waitFor()
    if (await cut.isEnabled()) await cut.click()

    const id = await page.evaluate(() => localStorage.getItem('motioneer-project'))
    if (!id) throw new Error('The film was assembled but its project could not be found to render.')
    // wait for the editor to persist the cut: a render fired before the save lands draws an empty film
    let project
    for (let n = 0; n < 60; n++) {
      project = await (await fetch(`${at}/__motioneer/projects/${id}`)).json()
      if (project.tracks?.some((t) => t.kind === 'component') && project.tracks.some((t) => t.kind === 'title')) break
      await new Promise((r) => setTimeout(r, 300))
    }
    const components = (project.tracks || []).filter((t) => t.kind === 'component').length
    if (!components) throw new Error('Cannot render: the first cut did not land, so the film had no component to show. Next: try again; if it repeats, open the studio and press Create first cut by hand.')
    // the model's words on the title tracks, put on the saved project once the cut has landed; the
    // revision is the one just read, and the editor has nothing left to save, so this cannot race it
    if (chosen.opening || chosen.closing) {
      const titles = project.tracks.filter((t) => t.kind === 'title')
      if (titles[0] && chosen.opening) titles[0].text = chosen.opening
      if (titles[titles.length - 1] && chosen.closing && titles.length > 1) titles[titles.length - 1].text = chosen.closing
      await fetch(`${at}/__motioneer/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(project) }).catch(() => {})
      onStep(`Titled it "${chosen.opening || ''}"${chosen.closing ? ` and "${chosen.closing}"` : ''}.`)
    }

    onStep('Rendering. This runs a real browser for every frame and takes about a minute for a short film.')
    const start = await (await fetch(`${at}/__motioneer/projects/${id}/renders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
    if (start.error) throw new Error(`Cannot render: ${start.error} Next: wait for the running export to finish, or cancel it in the studio.`)
    for (let n = 0; n < 600; n++) {
      await new Promise((r) => setTimeout(r, 2000))
      const jobs = await (await fetch(`${at}/__motioneer/projects/${id}/renders`)).json()
      const job = jobs.find((j) => j.id === start.id)
      if (!job) continue
      if (job.state === 'error') throw new Error(`Cannot render: ${job.message || 'the render failed'}. Next: open the studio and export from there to see the frame it stopped on.`)
      if (job.state === 'complete') return { projectId: id, at, jobId: job.id, url: `${at}${job.url}`, captured: captured.length, components, seconds: ms / 1000, product: chosen.product, opening: chosen.opening, closing: chosen.closing, byModel: chosen.byModel }
    }
    throw new Error('Cannot render: it did not finish in twenty minutes. Next: open the studio, the export is still listed there.')
  } finally {
    await browser.close()
  }
}
