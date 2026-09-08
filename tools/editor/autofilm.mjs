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
      const r = el.getBoundingClientRect()
      el.setAttribute('data-mn-cand', String(i))
      out.push({ el, i, tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height),
        top: Math.round(r.top + window.scrollY), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) })
      i++
    }
    return out.map(({ el, ...rest }) => rest)
  })
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
 * @param choose    async (candidates) => number[]  the indices to film, in order
 * @param seconds   film length; the first cut spaces the picks across it
 * @param look      'subtle' | 'expressive' | 'bold', the single treatment written per element
 * @param max       cap on how many elements to capture
 * @param onStep    (message) => void  progress, surfaced to the agent's caller
 */
export async function autofilm({ at, url, choose, seconds = 20, look = 'subtle', max = 3, onStep = () => {} }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('The renderer is not installed. Open the studio once and set up the local renderer, then try again.')
  /**
   * Aim first, every time. A studio that is already up may be pointed at another site or at a
   * folder, and reusing it as found is how a film of linear.app timed out waiting for a frame that
   * was never going to show anything: the room was open, but on nothing. Aiming is cheap and idempotent.
   */
  if (url) {
    const aimed = await fetch(`${at}/__motioneer/target`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      .then((r) => r.json()).catch((e) => ({ error: e.message }))
    if (aimed.error) throw new Error(`The studio could not open ${url}: ${aimed.error}`)
  }
  const config = await fetch(`${at}/__motioneer/editor-config`).then((r) => r.json()).catch(() => ({}))
  if (!config.source) throw new Error('The studio is not aimed at a site, so there is nothing to film. Pass a url.')
  // channel:'chromium' to use the full build the renderer installed, since it omits the headless shell
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    onStep('Opening the editor on the site.')
    await page.goto(at, { waitUntil: 'domcontentloaded' })
    const frame = page.frameLocator('iframe[title="Source page"]')
    try { await frame.locator('body').waitFor({ timeout: 45000 }) }
    catch { throw new Error(`${config.source} did not render inside the studio in 45 seconds. Either it is slow to load, or it refuses to be proxied, which is what a site that signs in against its own api does; the bookmarklet in the studio picks from your own browser instead.`) }
    await page.waitForTimeout(4000)

    const cands = await candidates(frame)
    if (!cands.length) throw new Error('Nothing on the page looked worth filming. It may still be loading, or it may need a sign in.')
    onStep(`Found ${cands.length} things on the page. Choosing what to film.`)
    let picks = (await choose(cands)).filter((n) => cands.some((c) => c.i === n)).slice(0, max)
    if (!picks.length) picks = cands.slice(0, Math.min(max, 3)).map((c) => c.i)

    const captured = []
    for (const n of picks) {
      onStep(`Capturing ${cands.find((c) => c.i === n)?.text || 'an element'}.`)
      if (await capture(page, frame, n)) captured.push(n); else onStep('That one could not be captured, skipping it.')
      await label(page, 'Source').click().catch(() => {})
    }
    if (!captured.length) throw new Error('None of the chosen elements could be captured from this page.')

    // one treatment per element, kept as we go, so the first cut has something to place
    for (let k = 0; k < captured.length; k++) {
      await page.locator('.subject-item').nth(k).click()
      const treat = page.getByLabel('Treatments', { exact: true })
      if (await treat.count()) await treat.selectOption(look).catch(() => {})
      const dur = page.getByLabel('Target duration (s)', { exact: true })
      if (await dur.count()) { await dur.fill('0.6') }
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
    if (!components) throw new Error('The first cut did not land: the film had no component to show.')

    onStep('Rendering. This runs a real browser for every frame and takes about a minute for a short film.')
    const start = await (await fetch(`${at}/__motioneer/projects/${id}/renders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
    if (start.error) throw new Error(start.error)
    for (let n = 0; n < 600; n++) {
      await new Promise((r) => setTimeout(r, 2000))
      const jobs = await (await fetch(`${at}/__motioneer/projects/${id}/renders`)).json()
      const job = jobs.find((j) => j.id === start.id)
      if (!job) continue
      if (job.state === 'error') throw new Error(job.message || 'The render failed.')
      if (job.state === 'complete') return { projectId: id, at, jobId: job.id, url: `${at}${job.url}`, captured: captured.length, components, seconds: ms / 1000 }
    }
    throw new Error('The render did not finish in time.')
  } finally {
    await browser.close()
  }
}
