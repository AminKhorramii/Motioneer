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
import { lit } from './proof.mjs'
import { firstCut, createProject, compositionDocument } from '../../dist-core/core.js'

const label = (page, name) => page.getByRole('button', { name, exact: true })

/** A compact, stable description of what is worth filming on the page inside the source frame. */
async function candidates(frame) {
  return frame.locator('body').evaluate((body) => {
    const out = []
    /**
     * A veiled page: slack.com holds all 41 of its headings at opacity zero for a reveal script
     * that never runs under the proxy, and shows fifteen characters. When almost nothing is
     * visible but headings are there, hidden elements count as candidates; the composition lifts
     * the hiding when it draws them, and their text is read from the markup rather than the screen.
     */
    /**
     * A gated page: slack.com keeps its whole content under an ancestor with display none until a
     * script confirms, and shows a no-script link; nextjs.org shows its hero and keeps every section
     * below it under a hidden attribute until its scripts arrive, which under the proxy they never
     * do, so it read as three things. When most of the headings sit under hidden containers, every
     * such container is shown, since a page that would otherwise yield nothing is better read than
     * left empty. A menu or a dialog hides a heading or two, never most of the page, so those stay.
     */
    {
      // every hidden ancestor, not only the outermost: slack nests one gate inside another
      const gates = new Set(), heads = [...body.querySelectorAll('h1,h2,h3')]
      let gated = 0
      for (const h of heads) { let under = false; for (let a = h.parentElement; a && a !== body; a = a.parentElement) if (getComputedStyle(a).display === 'none') { gates.add(a); under = true }; if (under) gated++ }
      if (gates.size && gated >= 3 && gated * 2 >= heads.length) for (const g of gates) { g.style.setProperty('display', 'block', 'important'); g.removeAttribute('hidden'); g.style.setProperty('visibility', 'visible', 'important'); g.style.setProperty('opacity', '1', 'important') }
    }
    const hiddenHeads = [...body.querySelectorAll('h1,h2,h3')].filter((h) => { const cs = getComputedStyle(h); return cs.opacity === '0' || cs.visibility === 'hidden' }).length
    const veiled = (body.innerText || '').trim().length < 200 && hiddenHeads >= 3
    const worth = (el) => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el)
      if (r.width < 90 || r.height < 24 || r.width > 1300 || r.height > 900) return false
      if (style.display === 'none') return false
      if (!veiled && (style.visibility === 'hidden' || Number(style.opacity) < 0.2)) return false
      if (r.top + window.scrollY > 7000 || r.bottom + window.scrollY < 0) return false
      // decoration is not a shot: a blurred glow behind a hero filmed as a grey cloud on linear.app,
      // and a placeholder image a few pixels wide is not the picture it stands in for
      if (/blur\(/.test(style.filter) || el.getAttribute('aria-hidden') === 'true') return false
      if (el.tagName === 'IMG' && el.naturalWidth > 0 && el.naturalWidth < 64) return false
      return true
    }
    // a link that carries an image or a heading is a card whatever it is called: anthropic.com builds every product and research card as a plain anchor
    const wanted = 'h1,h2,h3,button,a[role=button],a:has(> img),a:has(h2),a:has(h3),article,[class*=card],[class*=Card],[class*=hero],[class*=Hero],figure,img,video,[class*=cta],[class*=CTA]'
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
    const words = (el) => ((veiled ? el.textContent : el.innerText) || '').replace(/\s+/g, ' ').trim()
    const visible = (el) => words(el).length > 0 || !!el.querySelector('img,picture,video,svg,canvas') || el.tagName === 'IMG' || backed(el)
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
    /**
     * Tiles first: a row of equal blocks that each carry a heading is a row of cards whatever the
     * class names say. anthropic.com lays its three release banners as plain columns, and read by
     * class alone the page was five things, three of them the small headings inside those columns.
     * They go before the matched list so the card is taken and its heading folds into it, rather
     * than the heading taken first and the card refused for containing it.
     */
    const tiles = []
    const boxOf = (el) => el.getBoundingClientRect()
    for (const h of body.querySelectorAll('h2,h3,h4')) {
      let cur = h.parentElement
      for (let n = 0; n < 5 && cur && cur !== body; n++, cur = cur.parentElement) {
        const r = boxOf(cur)
        if (r.width < 200 || r.width > 720 || r.height < 110 || r.height > 900) continue
        const kin = [...(cur.parentElement ? cur.parentElement.children : [])].filter((k) => k !== cur && k.tagName === cur.tagName && Math.abs(boxOf(k).width - r.width) <= 8 && Math.abs(boxOf(k).height - r.height) <= 40)
        if (kin.length >= 1 && !tiles.includes(cur)) { tiles.push(cur); break }
      }
    }
    let i = 0
    for (const matched of [...tiles, ...body.querySelectorAll(wanted)]) {
      if (out.length >= 40) break
      const el = visualRoot(matched)
      if (!el || !worth(el)) continue
      // do not nest a candidate inside one already taken: a card and its own heading are one pick
      if (out.some((o) => o.el.contains(el) || el.contains(o.el))) continue
      const r = el.getBoundingClientRect(), top = Math.round(r.top + window.scrollY), page = document.documentElement.scrollHeight, style = getComputedStyle(el)
      el.setAttribute('data-mn-cand', String(i))
      const image = !!el.querySelector('img,picture,video,svg') || /url\(/.test(style.backgroundImage) || el.tagName === 'IMG' || el.tagName === 'VIDEO'
      // nav is high and short; a hero section that starts at the top of the page is not nav
      const section = top < 90 && r.height < 160 ? 'nav' : top < 900 ? 'hero' : top > page - 700 ? 'footer' : 'body'
      const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase()
      // a one-line h3 under 32px is a label, not a heading: alone in a frame it is a stray word
      // a button is small: a link called a button that stands 700px tall with an image in it is a card, and was read as a minor thing never filmed alone
      const cardish = r.width >= 200 && r.height >= 110 && !!el.querySelector('img,video,h2,h3,picture,svg')
      const role = el.tagName === 'IMG' || el.tagName === 'VIDEO' ? 'image' : /^h[1-3]$/i.test(el.tagName) ? (el.tagName === 'H3' && r.height < 32 ? 'label' : 'heading') : (/button/i.test(el.tagName) || /cta|button/.test(cls)) && !cardish ? 'button' : /card/.test(cls) || cardish || el.tagName === 'ARTICLE' ? 'card' : /hero/.test(cls) ? 'hero' : el.tagName.toLowerCase()
      const media = el.tagName === 'IMG' || el.tagName === 'VIDEO' ? el : el.querySelector('img,video')
      out.push({ el, i, tag: el.tagName.toLowerCase(), role, section, image, painted: !image && backed(el), src: media ? (media.currentSrc || media.src || '') : '', w: Math.round(r.width), h: Math.round(r.height), top,
        // innerText, not textContent: a section with its own <style> tag reads back as a
        // keyframes block, and the model then plans a film about css instead of the product
        text: words(el).slice(0, 80) })
      i++
    }
    /**
     * Collapse look-alikes. A page that mocks its own app in html offers a dozen identical
     * sidebar buttons, and twelve lines that differ only in their label cost the model and the
     * agent attention for nothing: one of them stands for the run, and says how many it stands for.
     */
    const kept = []
    for (const c of out) {
      // an exact duplicate folds whatever its size: a carousel or a responsive layout carries the
      // same screenshot twice, and framer.com filmed the same picture as two of eight elements
      const same = kept.find((k) => Math.abs(k.w - c.w) <= 2 && Math.abs(k.h - c.h) <= 2 && ((c.src && k.src === c.src) || (c.text && k.text === c.text)))
      // only small look-alikes fold otherwise: a row of sidebar buttons is one thing, three feature cards are three shots
      const twin = same || (c.w * c.h < 20000 && kept.find((k) => k.role === c.role && k.section === c.section && Math.abs(k.w - c.w) <= 4 && Math.abs(k.h - c.h) <= 4 && k.image === c.image))
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
  catch {
    // a frame whose document cannot be read left the proxy: the page sent itself to its own origin, whose policy forbids framing
    const escaped = await page.evaluate(() => { const f = document.querySelector('iframe[title="Source page"]'); try { return !!f && !f.contentDocument } catch { return true } }).catch(() => false)
    throw new Error(escaped
      ? `Cannot film ${source}: the page navigated the frame back to its own address, which refuses to be framed, so the studio cannot read it. Next: open the studio and pick from your own browser with the bookmarklet.`
      : `Cannot film ${source}: it did not render inside the studio in 45 seconds. It is slow, or it refuses to be proxied, which is what a site that signs in against its own api does. Next: try again once if it was slow; otherwise open the studio and pick from your own browser with the bookmarklet.`)
  }
  /**
   * Wait for the page to be a page. A landing rendered on the client, vercel.com among them,
   * has a body within a second and its words several seconds later, and read at seven seconds it
   * offered nothing to film. So the frame is given up to fifteen seconds to carry real text, then
   * walked once to wake what renders on scroll, and returned to the top.
   */
  const hydrated = await frame.locator('body').evaluate(async (body) => {
    for (let n = 0; n < 30; n++) { if ((body.innerText || '').trim().length > 200 || body.querySelectorAll('img,video').length > 2) return true; await new Promise((r) => setTimeout(r, 500)) }
    return false
  }).catch(() => false)
  await page.waitForTimeout(hydrated ? 1500 : 500)
  // then until the tree holds still: railway.com re-rendered after the scan, every marked element was replaced, and five of eight could not be captured
  await frame.locator('body').evaluate((body) => new Promise((res) => { let t; const done = () => { o.disconnect(); res() }; const o = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 1200) }); o.observe(body, { subtree: true, childList: true }); t = setTimeout(done, 1200); setTimeout(done, 10000) })).catch(() => {})
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
/**
 * Is an image a picture or decoration? Linear's hero glow is a real PNG that is itself a soft
 * blob, so no style rule catches it, and filmed it was a grey cloud for two shots. A picture has
 * edges; a glow has almost none. Measured on a 48 by 27 downscale, the mean difference between
 * neighbouring pixels was 3.3 for the glow and 12 to 28 for every real screenshot and photo, so
 * anything under 6 is decoration. Read through the studio's asset proxy from the editor page,
 * because inside the proxied frame a cross-origin image taints the canvas and cannot be read at
 * all; an image that will not decode is let through, since not knowing is not a verdict.
 */
async function dropDecoration(page, cands, onStep) {
  const srcs = cands.filter((c) => c.src && (c.role === 'image' || !c.text)).map((c) => c.src)
  if (!srcs.length) return cands
  const edges = await page.evaluate(async (list) => {
    const out = {}
    for (const src of list) {
      try {
        const url = src.startsWith('data:') ? src : '/__motioneer/asset?u=' + encodeURIComponent(src)
        const bmp = await createImageBitmap(await (await fetch(url)).blob())
        const c = document.createElement('canvas'); c.width = 48; c.height = 27
        const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 48, 27)
        const d = g.getImageData(0, 0, 48, 27).data
        let sum = 0, n = 0
        for (let y = 0; y < 27; y++) for (let x = 1; x < 48; x++) { const a = (y * 48 + x) * 4, b = a - 4; sum += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]); n++ }
        out[src] = sum / n / 3
      } catch { out[src] = null }
    }
    return out
  }, srcs).catch(() => ({}))
  const kept = cands.filter((c) => !(c.src && typeof edges[c.src] === 'number' && edges[c.src] < 6))
  if (kept.length < cands.length) onStep(`Left out ${cands.length - kept.length} decorative image${cands.length - kept.length === 1 ? '' : 's'} with no detail in it.`)
  return kept
}
export async function inspectSite({ at, url }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot inspect: the renderer is not installed. Next: open the studio once and set up the local renderer.')
  const source = await aim(at, url)
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const { page, frame, title, colours } = await openPage(browser, at, source)
    if (/attention required|just a moment|access denied|been blocked|verify you are human|are you a robot|security check/i.test(title || '')) throw new Error(`Cannot open ${source}: that site is behind a bot check, which a proxy cannot pass. Nothing here can fix that. Next: open the studio and pick from your own browser with the bookmarklet.`)
    let cands = await dropDecoration(page, await candidates(frame), () => {})
    for (let n = 0; n < 2 && !cands.length; n++) { await page.waitForTimeout(3000); cands = await dropDecoration(page, await candidates(frame), () => {}) }
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
    + `Then cut it into "scenes", an ordered list of shots. Each scene has "elements", one or two chosen indices; "layout", one of full, detail, pair, stack; and "hold", one of long, normal, short. Use pair for two cards or images side by side, stack for a heading or label above the visual it introduces on the page, detail for one screenshot or image pushed in close, full otherwise. A label, a one-line h3, is never a scene on its own; use it only as the top of a stack, or leave it out. A button is never a scene on its own either: pair it with the card or heading it belongs to, or leave it out. Hold the hero long and small details short. `
    + (many ? `Aim for ${Math.min(max, cands.length)} to ${Math.min(max + 3, cands.length + 2)} scenes; an element may appear in two scenes if the second is a different layout.\n` : `One or two scenes per element.\n`)
    + `Reply exactly: {"indices":[...],"product":"...","opening":"...","closing":"...","directions":{"<index>":"..."},"scenes":[{"elements":[i,j],"layout":"pair","hold":"normal"}]}`
  const r = await fetch(`${at}/__motioneer/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt, json: true }) })
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
 * Drive one capture through the real picker. The element already wears data-mn-cand from
 * candidates(), so the click lands on exactly what was chosen.
 */
async function capture(page, frame, cand, about) {
  const before = await page.locator('.subject-item').count()
  if (!(await label(page, 'Done picking').count())) await label(page, 'Pick element').click()
  await page.waitForTimeout(250)
  const el = frame.locator(`[data-mn-cand="${cand}"]`).first()
  // a page that re-rendered since the scan lost its marks: the element is found again by what it said and how big it was
  if (!(await el.count()) && about) await frame.locator('body').evaluate((body, a) => {
    const words = (n) => (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    for (const n of body.querySelectorAll(a.tag || '*')) { const r = n.getBoundingClientRect(); if (Math.abs(r.width - a.w) <= 8 && Math.abs(r.height - a.h) <= 8 && (!a.text || words(n) === a.text)) { n.setAttribute('data-mn-cand', String(a.i)); return } }
  }, about).catch(() => {})
  if (!(await el.count())) return -1
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
    onStep(`Found ${cands.length} things on ${title || source}. Asking the model what to film and what to say.`)
    const chosen = await plan({ at, title, source, cands, pick, max, pace, direction })
    onStep(chosen.byModel ? `The model chose ${chosen.indices.length}${chosen.product ? ` for "${chosen.product}"` : ''}.` : `The model could not be asked (${chosen.why}), so the most prominent elements were chosen.`)

    const captured = [], subjectAt = []
    for (const n of chosen.indices) {
      onStep(`Capturing ${name(cands.find((c) => c.i === n))}.`)
      const at_ = await capture(page, frame, n, cands.find((c) => c.i === n)); if (at_ >= 0) { captured.push(n); subjectAt.push(at_) } else onStep('That one could not be captured, skipping it.')
      await label(page, 'Source').click().catch(() => {})
    }
    if (!captured.length) throw new Error(`Cannot film ${source}: none of the chosen elements could be captured. Next: ask for different elements with pick, or open the studio and pick by hand.`)

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
    const briefFor = (k, why = '') => (String(chosen.directions[String(captured[k])] || '') + paceNote + filmNote
      + (why ? ` A previous attempt was refused: ${why.slice(0, 160)}. ${/nothing on the component is animating/.test(why) ? 'So write selectors that reach this markup: animate the root itself and its direct children as [data-mn] > *, not classes you assume are there.' : 'So animate only transform, opacity, clip-path and filter, and never add or change padding, margin, gap, display, position, overflow, width or height, so the element ends exactly as it was.'}` : '')).trim().slice(0, 980)
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
          if (await directionField.count()) await directionField.fill(briefFor(k, why))
          await label(page, 'Explore motion').click(); await page.waitForTimeout(300)
        }
      }
      if (await label(page, 'Keep motion').count()) { await label(page, 'Keep motion').first().click(); kept++ }
      else { failures.push(why); onStep(`Element ${k + 1} got no motion (${why.slice(0, 80)}), leaving it out.`) }
    }
    if (!kept) throw new Error(`Cannot film: no motion came back for any element${failures[0] ? ` (${failures[0].slice(0, 120)})` : ''}. Next: check the model in the studio settings and try again.`)

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
    // the editor saves on its own clock, and a cut sent over a save still on its way was refused as
    // changed in another tab; its own status line says when it has nothing left to write
    const settled = async () => {
      try { await page.waitForFunction(() => /Saved locally/.test(document.querySelector('.save-status')?.textContent || ''), null, { timeout: 12000 }) } catch {}
      await new Promise((r) => setTimeout(r, 300))
      return (await fetch(`${at}/__motioneer/projects/${id}`)).json()
    }
    project = await settled()

    /**
     * Each kept motion is played once through the film's own composition and looked at a third of
     * the way in. On railway.com and supabase.com the model hid the root for most of a one second
     * shot and revealed it at the end, which the proof reads as a blank shot; the brief asks
     * against it and the model still does it about one film in five. So a motion whose element
     * shows under a quarter of its final content a third of the way in is refined once with the
     * fault named, and the refinement is kept when it passes, else the first stays.
     */
    {
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
        const third = await litAt(track.entrance + motion.duration / 3), end = await litAt(track.entrance + motion.duration + 200)
        // the proof's own rule for a shot still empty a third in, so the check and the verdict agree
        return end > 0.003 && third < 0.002
      }
      let touched = false
      try {
        for (let k = 0; k < captured.length; k++) {
          const sub = project.subjects[subjectAt[k]], motion = sub && (project.motions || []).find((m) => m.subjectId === sub.id && m.saved)
          if (!motion || !(await hides(sub, motion))) continue
          onStep(`Element ${k + 1} stays hidden for a third of its motion, asking for one that shows from the first frame.`)
          await page.locator('.subject-item').nth(subjectAt[k]).click()
          const directionField = page.getByLabel('Creative direction', { exact: true })
          if (await directionField.count()) await directionField.fill(((await directionField.inputValue()) + ' The previous version kept the whole element invisible for the first third; this one shows the element from its very first frame, with no opacity, clip or transform that hides all of it, and only its parts move into place.').slice(0, 980))
          const before = await page.locator('.motion-card:not(.pending)').count()
          if (!(await label(page, 'Refine').count())) continue
          touched = true
          await label(page, 'Refine').first().click()
          try { await page.waitForFunction((n) => document.querySelectorAll('.motion-card:not(.pending)').length > n, before, { timeout: 150000 }) } catch { continue }
          await page.locator('.motion-card:not(.pending)').last().getByRole('button', { name: 'Keep motion', exact: true }).click()
          let fresh, next
          for (let n = 0; n < 20 && !next; n++) { await new Promise((r) => setTimeout(r, 300)); fresh = await (await fetch(`${at}/__motioneer/projects/${id}`)).json(); next = (fresh.motions || []).find((m) => m.subjectId === sub.id && m.saved && m.id !== motion.id) }
          if (next && (await hides(sub, next))) { await page.locator('.motion-card:not(.pending)').first().getByRole('button', { name: 'Keep motion', exact: true }).click().catch(() => {}); await page.waitForTimeout(600) }
        }
      } finally { await probe.close() }
      // anything kept here moved the revision on, and a cut sent with the old one is refused
      if (touched) project = await settled()
    }
    // scenes name candidates; the project's subjects sit in capture order, so a captured index maps to its subject
    const subjectOf = new Map(captured.map((cand, k) => [cand, emptyOnes.has(k) ? null : project.subjects[subjectAt[k]]?.id]).filter(([, id]) => id))
    // a button or a label is never a shot on its own, whatever the plan said: asked twice in the prompt, the model still filmed a lone button
    const minor = new Set(cands.filter((c) => c.role === 'button' || c.role === 'label').map((c) => c.i))
    const scenes = (chosen.scenes || []).map((sc) => ({ ids: sc.elements.filter((n) => !(sc.elements.length === 1 && minor.has(n))).map((n) => subjectOf.get(n)).filter(Boolean), layout: sc.layout, hold: sc.hold })).filter((sc) => sc.ids.length)
    // every captured element earns a shot before any comes round again: a plan of five scenes for eight captures once left three unused while the hero played twice
    const placed = new Set(scenes.flatMap((sc) => sc.ids))
    for (const [cand, id] of subjectOf) if (!placed.has(id) && !minor.has(cand)) scenes.push({ ids: [id], layout: 'full', hold: 'normal' })
    const cut = firstCut(project, { pace, seconds, opening: chosen.opening, closing: chosen.closing, background: colours.background, scenes })
    const components = cut.tracks.filter((t) => t.kind === 'component').length
    const shotsMade = new Set(cut.tracks.filter((t) => t.kind === 'component').map((t) => t.start)).size
    const distinct = new Set(cut.tracks.filter((t) => t.kind === 'component').map((t) => t.subjectId)).size
    const layoutsUsed = new Set((scenes.length ? scenes : []).map((sc) => sc.layout || 'full')).size || 1
    if (!components) throw new Error('Cannot cut: no kept motion was saved, so there was nothing to place. Next: try again; if it repeats, open the studio and keep a motion by hand.')
    const put = await fetch(`${at}/__motioneer/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cut) }).then((r) => r.json()).catch((e) => ({ error: e.message }))
    if (put.error) throw new Error(`Cannot cut: ${put.error} Next: try again.`)
    const ms = cut.settings.duration
    // every boundary in the cut: each shot's start and the closing title's, for the proof to check in place
    const cutTimes = [...new Set(cut.tracks.filter((t) => t.kind !== 'title' || t.start > 0).map((t) => Math.round(t.start)))].sort((a, b) => a - b)
    onStep(`${shotsMade} shots of ${distinct} elements in ${layoutsUsed} layout${layoutsUsed === 1 ? '' : 's'} on the site's own ${colours.background} background${chosen.opening ? `, titled "${chosen.opening}"` : ''}${chosen.closing ? ` and "${chosen.closing}"` : ''}.`)

    onStep('Rendering. This runs a real browser for every frame and takes about a minute for a short film.')
    const start = await (await fetch(`${at}/__motioneer/projects/${id}/renders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
    if (start.error) throw new Error(`Cannot render: ${start.error} Next: wait for the running export to finish, or cancel it in the studio.`)
    for (let n = 0; n < 600; n++) {
      await new Promise((r) => setTimeout(r, 2000))
      const jobs = await (await fetch(`${at}/__motioneer/projects/${id}/renders`)).json()
      const job = jobs.find((j) => j.id === start.id)
      if (!job) continue
      if (job.state === 'error') throw new Error(`Cannot render: ${job.message || 'the render failed'}. Next: open the studio and export from there to see the frame it stopped on.`)
      if (job.state === 'complete') return { projectId: id, at, jobId: job.id, url: `${at}${job.url}`, captured: captured.length, components, shots: shotsMade, distinct, layouts: layoutsUsed, cutTimes, background: colours.background, seconds: ms / 1000, product: chosen.product, opening: chosen.opening, closing: chosen.closing, byModel: chosen.byModel }
    }
    throw new Error('Cannot render: it did not finish in twenty minutes. Next: open the studio, the export is still listed there.')
  } finally {
    await browser.close()
  }
}
