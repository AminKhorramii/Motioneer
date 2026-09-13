import { loadChromium } from "./render.mjs"

/** A compact, stable description of what is worth filming on the page inside the source frame. */
export async function candidates(frame) {
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
      if (r.top + window.scrollY > 24000 || r.bottom + window.scrollY < 0) return false
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
    // A product UI is usually a section's illustration or a window around several controls.
    // Taking its cards first hid the complete scene, and forty small cards hid every later section.
    const scenes = new Map()
    for (const section of body.querySelectorAll('section')) {
      const heading = section.querySelector('h2,h3')
      if (!heading) continue
      for (const child of section.querySelectorAll(':scope > *, :scope > * > *')) {
        const r = boxOf(child), cls = typeof child.className === 'string' ? child.className : ''
        if (r.width >= 420 && r.height >= 240 && r.height <= 900 && /illustration|preview|mockup|screenshot|stage|demo/i.test(cls)
          && child.querySelectorAll('svg,img,canvas,button,p').length >= 3 && !child.contains(heading)) {
          scenes.set(child, words(heading) + ' product interface'); break
        }
      }
    }
    for (const heading of body.querySelectorAll('h2,h3')) {
      for (let p = heading.parentElement, n = 0; p && p !== body && n < 5; p = p.parentElement, n++) {
        const r = boxOf(p), cls = typeof p.className === 'string' ? p.className : ''
        if (r.width >= 450 && r.height >= 240 && r.height <= 900 && /panel|window|workspace/i.test(cls) && p.querySelectorAll('button,svg,p').length >= 5) {
          scenes.set(p, words(heading) + ' workspace'); break
        }
      }
    }
    let i = 0
    for (const matched of [...scenes.keys(), ...tiles, ...body.querySelectorAll(wanted)]) {
      if (out.length >= 240) break
      const el = scenes.has(matched) ? matched : visualRoot(matched)
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
        text: (scenes.get(el) || words(el)).slice(0, 120), matchText: words(el).slice(0, 120), ...(scenes.has(el) ? { scene: true } : {}) })
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
      const same = kept.find((k) => Math.abs(k.w - c.w) <= 2 && Math.abs(k.h - c.h) <= 2 && ((c.role === 'image' && c.src && k.src === c.src) || (c.text && k.text === c.text)))
      // only small look-alikes fold otherwise: a row of sidebar buttons is one thing, three feature cards are three shots
      const twin = same || (c.w * c.h < 20000 && kept.find((k) => k.role === c.role && k.section === c.section && Math.abs(k.w - c.w) <= 4 && Math.abs(k.h - c.h) <= 4 && k.image === c.image))
      if (twin) twin.alike = (twin.alike || 0) + 1; else kept.push(c)
    }
    // Keep complete scenes and headings, then spread the remaining attention over the page.
    const important = kept.filter(c => c.scene || c.role === 'heading')
    const rest = kept.filter(c => !important.includes(c) && c.section !== 'nav' && c.section !== 'footer')
    const room = Math.max(0, 32 - important.length), sampled = rest.length <= room ? rest : Array.from({length:room}, (_, n) => rest[Math.floor(n * rest.length / room)])
    return [...important.slice(0, 32), ...sampled].sort((a,b) => a.top - b.top || a.i - b.i).map(({ el, ...rest }) => rest)
  })
}

/** One line per candidate, the way both the model and an agent read it. */
export const describe = (c) => `${c.i}: ${c.role} in ${c.section}, ${c.w}x${c.h}${c.image ? ', with an image' : c.painted && !c.text ? ', a painted block' : ''}${c.text ? `, "${c.text}"` : ''}${c.alike ? ` (and ${c.alike} more like it)` : ''}`

/**
 * Aim the studio and read the page without filming, for the inspect tool and for a film's plan.
 * Returns the page title and the candidates, each already tagged on the page.
 */
export async function aim(at, url) {
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
export async function freshProject(at, name) {
  const made = await fetch(`${at}/__motioneer/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
    .then((r) => r.json()).catch((e) => ({ error: e.message }))
  if (!made || !made.id) throw new Error(`Cannot film: a project could not be created${made && made.error ? `: ${made.error}` : ''}. Next: try again.`)
  return made.id
}
export async function openPage(browser, at, source, projectId, language = 'en', theme) {
  if(theme!==undefined&&!['light','dark'].includes(theme))throw new Error('Cannot film: theme must be light or dark. Next: choose one of those appearances.')
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, ...(theme ? {colorScheme:theme} : {}) })
  if(process.env.MOTIONEER_DEBUG)page.on('response',async response=>{
    if(response.url().endsWith('/__motioneer/generate')){const m=await response.json().catch(()=>({}));console.error('motion reply',JSON.stringify({subjectId:m.subjectId,scope:m.scope,id:m.id,error:m.error}))}
  })
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
  await frame.locator('body').evaluate(async (body) => { const h = document.documentElement.scrollHeight; for (let y = 0; y < Math.min(h, 24000); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } window.scrollTo(0, 0) }).catch(() => {})
  await page.waitForTimeout(600)
  const title = await frame.locator('title').first().textContent().catch(() => '') || ''
  const heading=await frame.locator('h1').first().textContent({timeout:1000}).catch(()=>'')
  if(/\b404\b|page not found|page doesn.t exist|page could not be found/i.test(title+' '+heading))throw new Error('Cannot film: this address returned a page-not-found screen. Next: use the correct homepage or a working product URL instead of filming the error page.')
  // Follow only a locale the site links to. Guessing /en filmed Stripe's 404 page.
  if(language&&/^[a-z]{2}$/i.test(language)){
    const alternate=await frame.locator('html').evaluate((html,{language,source,at})=>{
      const lang=html.lang.toLowerCase(),wanted=language.toLowerCase();if(!lang||lang.split('-')[0]===wanted)return null
      const region=lang.split('-')[1],links=[...html.querySelectorAll('a[href],link[hreflang][href]')].map(el=>{
        const u=new URL(el.getAttribute('href'),source);if(u.origin===new URL(at).origin)u.host=new URL(source).host,u.protocol=new URL(source).protocol
        if(u.origin!==new URL(source).origin)return null
        const code=el.getAttribute('hreflang')?.toLowerCase()||u.pathname.split('/')[1].toLowerCase()
        return code===wanted||code.startsWith(wanted+'-')?{url:u.href,score:code===wanted+'-'+region?2:code===wanted?1:0}:null
      }).filter(Boolean).sort((a,b)=>b.score-a.score)
      return links[0]?.url||null
    },{language,source,at}).catch(()=>null)
    if(alternate&&alternate!==source){const localized=await aim(at,alternate);await page.close();return {...await openPage(browser,at,localized,projectId,null,theme),source:localized}}
  }
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
  return { page, frame, title: title.trim(), colours, source }
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
export async function dropDecoration(page, cands, onStep) {
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
export async function inspectSite({ at, url, language = 'en', theme }) {
  const chromium = await loadChromium()
  if (!chromium) throw new Error('Cannot inspect: the renderer is not installed. Next: open the studio once and set up the local renderer.')
  let source = await aim(at, url)
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const opened=await openPage(browser,at,source,undefined,language,theme),{page,frame,title,colours}=opened;source=opened.source
    if (/attention required|just a moment|access denied|been blocked|verify you are human|are you a robot|security check/i.test(title || '')) throw new Error(`Cannot open ${source}: that site is behind a bot check, which a proxy cannot pass. Nothing here can fix that. Next: open the studio and pick from your own browser with the bookmarklet.`)
    let cands = await dropDecoration(page, await candidates(frame), () => {})
    for (let n = 0; n < 2 && !cands.length; n++) { await page.waitForTimeout(3000); cands = await dropDecoration(page, await candidates(frame), () => {}) }
    const sheet = await contactSheet(page, frame, cands)
    return { source, title, colours, candidates: cands, sheet }
  } finally { await browser.close() }
}

/**
 * A contact sheet of the candidates, so a planner that can see chooses by what a tile looks like
 * rather than by "card in body, 339x145". Each element is screenshotted where it stands in the
 * proxied page and laid on a grid with its index in the corner, as one jpeg a few hundred
 * kilobytes large. Every surveyed candidate is included, up to thirty-two tiles.
 */
export async function contactSheet(page, frame, cands, onStep = () => {}) {
  const tiles = []
  for (const c of cands) {
    const el = frame.locator(`[data-mn-cand="${c.i}"]`).first()
    if(!await el.count())continue
    await reveal(el)
    const shot = await el.screenshot({ type: 'jpeg', quality: 65, animations:'disabled', timeout: 2500 }).catch(() => null)
    if (shot) tiles.push({ i: c.i, data: shot.toString('base64') })
    if(tiles.length&&tiles.length%8===0)onStep(`Prepared ${tiles.length} visual references for the film plan.`)
  }
  if (!tiles.length) return null
  const data = await page.evaluate(async (tiles) => {
    const W = 240, H = 160, cols = 4, rows = Math.ceil(tiles.length / cols)
    const c = document.createElement('canvas'); c.width = cols * W; c.height = rows * H
    const g = c.getContext('2d'); g.fillStyle = '#e4e4ea'; g.fillRect(0, 0, c.width, c.height)
    for (let n = 0; n < tiles.length; n++) {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + tiles[n].data
      try { await img.decode() } catch { continue }
      const x = (n % cols) * W, y = Math.floor(n / cols) * H
      const s = Math.min((W - 14) / img.width, (H - 32) / img.height, 2), w = img.width * s, h = img.height * s
      g.fillStyle = '#ffffff'; g.fillRect(x + 3, y + 3, W - 6, H - 6)
      g.drawImage(img, x + (W - w) / 2, y + 24 + (H - 30 - h) / 2, w, h)
      g.fillStyle = '#111111'; g.font = 'bold 14px system-ui, sans-serif'; g.fillText(String(tiles[n].i), x + 10, y + 19)
    }
    return c.toDataURL('image/jpeg', 0.72).split(',')[1]
  }, tiles).catch(() => null)
  return data ? { mime: 'image/jpeg', data, tiles: tiles.length } : null
}

/** Scroll reveals must finish before either the planner or the picker freezes the component. */
export async function reveal(el) {
  if(!await el.count())return
  await el.scrollIntoViewIfNeeded({timeout:4000}).catch(() => {})
  await el.evaluate(async node => {
    await new Promise(r => setTimeout(r, 450))
    // Freeze finite entrance effects at their resting state before taking computed styles.
    // Capturing halfway through a reveal baked its offset into the next generated motion.
    for(const a of node.getAnimations({subtree:true})){
      const timing=a.effect?.getComputedTiming()
      if(timing&&Number.isFinite(timing.endTime)&&timing.endTime>0)try{a.finish()}catch{}
    }
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
    for (let p = node; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.display !== 'none' && Number(cs.opacity) === 0) p.style.setProperty('opacity','1','important')
      if (cs.visibility === 'hidden') p.style.setProperty('visibility','visible','important')
    }
  },null,{timeout:4000}).catch(() => {})
}
