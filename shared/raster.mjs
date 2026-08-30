/**
 * A frame of a live page, drawn in the page's own browser.
 *
 * The studio films by driving a headless chromium to screenshot every frame and then shelling out
 * to ffmpeg, so the two things somebody is least likely to have installed stand between them and a
 * file they can post, and the studio can only run where there is a filesystem and a package
 * manager. The page is already open in a browser that draws it sixty times a second, so this draws
 * it there instead: the dom of a same origin iframe goes into an svg foreignObject, the svg goes
 * through an Image onto a canvas, and shared/mp4.mjs turns the canvases into a film. Nothing is
 * installed, nothing is uploaded, and the same code runs from a worker.
 *
 * What this is not is a screenshot. foreignObject rasterization renders a copy of the dom inside an
 * image, and an image may not fetch anything or run anything, so a list of real things is simply
 * absent from the picture. A wrong frame nobody was warned about is worse than a missing feature,
 * so every one of them is named in CAVEATS for the studio to show, and the short version is:
 *
 *   nested iframes           an empty box, because the child document is not ours to copy
 *   webgl canvases           blank unless the context kept its drawing buffer
 *   backdrop-filter          nothing, because inside the copy there is no backdrop to sample
 *   mix-blend-mode           blends against the copy and not against what is behind the frame
 *   shadow dom               cloneNode does not copy shadow trees, so those subtrees go missing
 *   constructed stylesheets  rules added by insertRule or adopted by a shadow root are not text
 *   a font or image that 403s  dropped with a note, because one dead asset must not lose the film
 *   cross origin stylesheets a sheet whose cssRules throw cannot be read, so its rules are lost
 *   scroll position          every scroller in the copy starts at the top
 *   caret, selection, focus  none of the three are painted
 *
 * The one thing here that is subtle is holdAt. A serialized copy carries css and not clocks, so
 * pausing the live animations through getAnimations freezes what a person sees and changes nothing
 * about what gets drawn. The instant has to be written into the css itself, per element, or the
 * stagger that the whole studio exists to compare collapses into one flat pose.
 */

/** what does not survive, in the words the studio can put in front of somebody */
export const CAVEATS = [
  'A nested iframe draws as an empty box. Its document belongs to another browsing context and cannot be copied into the frame.',
  'A canvas is swapped for a still picture of its pixels, because chromium paints no canvas at all inside a frame. It keeps its id, its classes and its inline style, so a rule written against the canvas element itself stops matching it.',
  'A webgl canvas comes back blank unless its context was made with preserveDrawingBuffer, since there is nothing left to read otherwise.',
  'backdrop-filter does nothing. The copy has no backdrop to sample, so a frosted panel renders flat.',
  'mix-blend-mode and filters that reach outside their element blend against the copy rather than against the page behind it.',
  'Shadow dom is missing. cloneNode does not copy shadow trees, so a component that renders into one draws as its host element.',
  'Rules added by insertRule, and stylesheets adopted by a shadow root, are not text anywhere and are not carried over.',
  'A font or an image that will not fetch is dropped and the frame is drawn without it, with a note saying which.',
  'A cross origin stylesheet whose cssRules cannot be read is lost entirely. Serve it with cors, or inline it, to keep it.',
  'Every scroller in the copy starts at the top, so a frame of a page scrolled halfway shows the first screen of it.',
  'A css transition in flight is seeked in the live page but not written into the copy, so only animations are truly held.',
  'The caret, the text selection and the focus ring are not painted.',
  'A frame is one image decode of the whole page, so a document with thousands of nodes costs tens of milliseconds a frame.',
  'Chromium taints a canvas drawn from a blob url, so the copy travels as a base64 data uri and a very large page makes a very large string.',
]

const XHTML = 'http://www.w3.org/1999/xhtml'
const SVGNS = 'http://www.w3.org/2000/svg'

/** the attribute a held element wears, so a pseudo element can be named by a rule */
const HELD = 'data-wall-held'

/** an element, and the two children css can give it that no inline style can reach */
const PARTS = [null, '::before', '::after']

/**
 * A ceiling on one resource, not on the page.
 *
 * A single asset over this is nearly always a video poster or an uncompressed hero that was never
 * meant to be in a font sized budget, and turning it into base64 costs a third again on top. The
 * frame is better off without it and with a note than three seconds slower per film.
 */
const TOO_BIG = 8 * 1024 * 1024

/** every quoting style an author actually writes a css url in */
const URL_IN_CSS = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g

/** the declarations that can carry a url worth having in the picture */
const PAINTED = [
  'background-image', 'background', 'mask-image', '-webkit-mask-image', 'mask',
  'border-image-source', 'border-image', 'list-style-image', 'content', 'cursor', 'src',
]

/**
 * What a name has to look like before xml will accept it, which is stricter than the dom twice over.
 *
 * An html attribute has no namespace, so a colon in its name is part of the name and not a prefix,
 * and xml reads it as a prefix that was never declared. Vue writes both halves of that: `:class` is
 * a name starting with a colon, which is a legal xml Name and not a legal QName, and `v-bind:x` is a
 * perfectly formed QName announcing a namespace nobody declared. Both take the whole frame down, so
 * an attribute the dom gave no namespace has to be a plain name with no colon anywhere in it.
 */
const NC_NAME = /^[A-Za-z_][-A-Za-z0-9_.\u00b7\u00c0-\ufffd]*$/
const Q_NAME = /^[A-Za-z_][-A-Za-z0-9_.\u00b7\u00c0-\ufffd]*(:[A-Za-z_][-A-Za-z0-9_.\u00b7\u00c0-\ufffd]*)?$/

/** characters xml 1.0 has no way to represent, escaped or otherwise */
const NOT_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g

/** a half of a surrogate pair with nothing to pair with, which is a parse error and not a character */
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

const clean = (s) => String(s).replace(NOT_XML, '').replace(LONE, '')

const absolute = (raw, base) => {
  const s = String(raw ?? '').trim()
  if (!s || s.startsWith('#') || s.startsWith('data:') || s.startsWith('about:')) return null
  try {
    return new URL(s, base).href
  } catch {
    return null
  }
}

/**
 * Bytes to base64 without a dependency and without blowing the stack.
 *
 * String.fromCharCode is variadic and a font is a hundred thousand bytes, which is well past the
 * argument limit and fails as a range error rather than as anything that names the problem.
 */
const base64 = (bytes) => {
  let out = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) out += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(out)
}

/**
 * What to call the bytes when the server would not say.
 *
 * A font served as application/octet-stream is the common case and a data uri that claims that is
 * one the font loader refuses, so the extension gets the last word when the header is unhelpful.
 */
const GUESS = {
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
}

const typeOf = (url, header, kind) => {
  const said = String(header || '').split(';')[0].trim().toLowerCase()
  if (said && said !== 'application/octet-stream' && said !== 'binary/octet-stream') return said
  const ext = (url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1]
  return GUESS[String(ext).toLowerCase()] || (kind === 'font' ? 'font/woff2' : 'application/octet-stream')
}

/** a few at a time, because a page with sixty images should not open sixty sockets to inline them */
const pool = async (jobs, width = 6) => {
  const queue = jobs.slice()
  const run = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await job()
  }
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, run))
}

const eachRule = (rules, fn) => {
  for (const rule of rules) {
    fn(rule)
    let kids = null
    try {
      kids = rule.cssRules || (rule.styleSheet && rule.styleSheet.cssRules) || null
    } catch {
      kids = null
    }
    if (kids) eachRule(kids, fn)
  }
}

/**
 * A stylesheet as text, with each imported sheet spliced in where its @import was.
 *
 * An @import inside the copy is a request, and the copy is not allowed to make requests, so a sheet
 * that imports its real content would arrive empty. Each level keeps its own href as the base
 * because a url in an imported sheet is relative to that sheet and not to the one importing it.
 */
const chunksOf = (sheet, base, seen, out) => {
  if (seen.has(sheet)) return
  seen.add(sheet)
  let rules = null
  try {
    rules = sheet.cssRules
  } catch (e) {
    out.push({ text: '', base, blocked: String(e && e.message) || 'cross origin' })
    return
  }
  let text = ''
  for (const rule of rules) {
    if (rule.styleSheet) {
      if (text) out.push({ text, base })
      text = ''
      chunksOf(rule.styleSheet, rule.styleSheet.href || base, seen, out)
      continue
    }
    text += rule.cssText + '\n'
  }
  if (text) out.push({ text, base })
}

/**
 * Collect what a serialized copy of this document would lose, as data uris.
 *
 * Web fonts, img sources, and the urls inside background, mask and border-image. fetchVia lets the
 * studio route a cross origin asset through its own proxy, which is the only way to get one at all
 * from a page that is not allowed to read it. Nothing here throws: one 403 font must cost the film
 * that font and nothing else, so every failure is a note and the caller decides whether to say so.
 */
export async function inline(doc, { fetchVia } = {}) {
  const get = typeof fetchVia === 'function' ? fetchVia : (url) => fetch(url)
  const notes = []
  const fonts = new Map()
  const images = new Map()
  const failed = new Set()
  const wanted = new Map()
  const fontUrls = new Set()
  const chunks = []
  const base = doc.baseURI || (doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) || ''

  /**
   * Only the families the page actually used.
   *
   * A variable font from fontsource declares one @font-face per unicode range and there are a dozen
   * of them, so inlining every declared face fetches four hundred kilobytes to draw latin text. The
   * font loader already knows which ones it went and got.
   */
  let used = null
  try {
    const loaded = [...doc.fonts].filter((f) => f.status === 'loaded')
    if (loaded.length) used = new Set(loaded.map((f) => String(f.family).replace(/^["']|["']$/g, '').toLowerCase()))
  } catch {}

  const want = (raw, from, kind) => {
    const abs = absolute(raw, from)
    if (!abs) return
    if (kind === 'font') fontUrls.add(abs)
    if (!wanted.has(abs)) wanted.set(abs, kind)
  }

  const collect = (sheet) => {
    let rules = null
    try {
      rules = sheet.cssRules
    } catch {
      notes.push(`the stylesheet at ${String(sheet.href).slice(0, 90)} refused to be read, so its rules are not in the frame`)
      return
    }
    eachRule(rules, (rule) => {
      if (!rule.style) return
      /* by its text rather than by CSSRule.FONT_FACE_RULE, which is deprecated, or by constructor
         name, which a minifier is free to rename out from under this */
      const isFont = String(rule.cssText || '').startsWith('@font-face')
      const from = (rule.parentStyleSheet && rule.parentStyleSheet.href) || base
      if (isFont) {
        const family = String(rule.style.fontFamily || '').replace(/^["']|["']$/g, '').toLowerCase()
        if (used && family && !used.has(family)) return
        for (const hit of String(rule.style.getPropertyValue('src') || '').matchAll(URL_IN_CSS)) {
          want(hit[1] ?? hit[2] ?? hit[3], from, 'font')
        }
        return
      }
      for (const prop of PAINTED) {
        const value = rule.style.getPropertyValue(prop)
        if (!value || !value.includes('url(')) continue
        for (const hit of value.matchAll(URL_IN_CSS)) want(hit[1] ?? hit[2] ?? hit[3], from, 'image')
      }
    })
  }

  const seen = new Set()
  for (const sheet of doc.styleSheets || []) {
    chunksOf(sheet, sheet.href || base, seen, chunks)
    /* a sheet the copy can still read for itself needs no carrying: a style element clones with its
       text. A link cannot be fetched from inside an image, and neither can anything it imported,
       which is what a chunk with a base of its own is */
    const external = !!sheet.href
    for (const chunk of chunks) {
      if (chunk.claimed) continue
      chunk.claimed = true
      chunk.keep = external || chunk.base !== base
    }
    collect(sheet)
  }

  /* rules held only in the cssom have no text in the document, so they have to be carried as text */
  try {
    for (const sheet of doc.adoptedStyleSheets || []) {
      const before = chunks.length
      chunksOf(sheet, base, seen, chunks)
      for (let i = before; i < chunks.length; i++) chunks[i].keep = true
      collect(sheet)
    }
  } catch {}

  for (const el of doc.querySelectorAll('img')) {
    const src = el.currentSrc || el.getAttribute('src')
    want(src, base, 'image')
    want(el.getAttribute('src'), base, 'image')
  }
  for (const el of doc.querySelectorAll('image')) want(el.getAttribute('href') || el.getAttribute('xlink:href'), base, 'image')
  for (const el of doc.querySelectorAll('video[poster]')) want(el.getAttribute('poster'), base, 'image')
  for (const el of doc.querySelectorAll('[style*="url("]')) {
    for (const hit of String(el.getAttribute('style')).matchAll(URL_IN_CSS)) want(hit[1] ?? hit[2] ?? hit[3], base, 'image')
  }

  await pool([...wanted].map(([url, kind]) => async () => {
    const short = url.length > 90 ? `${url.slice(0, 88)}...` : url
    try {
      const res = await get(url)
      if (!res || !res.ok) {
        failed.add(url)
        notes.push(`${kind} ${short} answered ${res ? res.status : 'nothing'}, so the frame is drawn without it`)
        return
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length > TOO_BIG) {
        failed.add(url)
        notes.push(`${kind} ${short} is ${Math.round(bytes.length / 1024)}kb, over the ${TOO_BIG / 1024 / 1024}mb one asset gets, so it is left out`)
        return
      }
      const uri = `data:${typeOf(url, res.headers && res.headers.get('content-type'), kind)};base64,${base64(bytes)}`
      ;(fontUrls.has(url) ? fonts : images).set(url, uri)
    } catch (e) {
      failed.add(url)
      notes.push(`${kind} ${short} could not be fetched (${String(e && e.message || e).slice(0, 60)}), so the frame is drawn without it`)
    }
  }))

  const found = new Map([...fonts, ...images])
  const css = chunks.filter((c) => c.keep && c.text).map((c) => rewriteCss(c.text, c.base, found)).join('\n')
  return { css, fonts, images, failed, notes }
}

const rewriteCss = (text, base, found) => String(text).replace(URL_IN_CSS, (whole, dq, sq, bare) => {
  const abs = absolute(dq ?? sq ?? bare, base)
  const data = abs && found.get(abs)
  return data ? `url("${data}")` : whole
})

/**
 * Freeze every css animation in the document at one instant, and hand back the way out.
 *
 * The instant is written into each element's own animation-delay rather than set on the clock,
 * because a serialized copy carries declarations and not clocks: the copy's animations start over
 * from nothing, so whatever getAnimations was told is not in the picture. An element already
 * delayed 180ms keeps being 180ms behind one delayed 0, which is the entire point of a rail.
 *
 * A pseudo element cannot take an inline style, so the host is marked and a rule is emitted for it.
 * That means one stylesheet holds the whole hold, and undoing is removing it, which matters more
 * than it sounds: the same document is held at ninety instants in a row, and a hold that leaves a
 * milligram behind each time is jitter that reads as a bad ease.
 */
export function holdAt(doc, ms) {
  const at = Math.max(0, Number(ms) || 0)
  const view = doc.defaultView
  if (!view) throw new Error('holdAt needs a document that is in a window, because it reads computed styles')

  const marked = []
  const rules = []
  const retimed = new Set()
  let n = 0

  for (const el of doc.querySelectorAll('*')) {
    const lines = []
    for (const part of PARTS) {
      let style = null
      try {
        style = view.getComputedStyle(el, part)
      } catch {
        style = null
      }
      const name = style && style.animationName
      if (!name || name === 'none') continue
      const shifted = String(style.animationDelay || '0s').split(',')
        .map((one) => `${millis(one) - at}ms`).join(', ')
      lines.push(`[${HELD}="${n}"]${part || ''}{animation-delay:${shifted} !important;animation-play-state:paused !important}`)
    }
    if (!lines.length) continue
    el.setAttribute(HELD, String(n))
    marked.push(el)
    retimed.add(el)
    rules.push(...lines)
    n++
  }

  const sheet = doc.createElement('style')
  sheet.setAttribute('data-wall-hold', '')
  sheet.textContent = rules.join('\n')
  ;(doc.head || doc.documentElement).appendChild(sheet)

  /**
   * The live page, moved to the same instant the copy will show.
   *
   * The delays above decide what gets drawn. This decides what a person watching the scrubber sees,
   * and what a suite reading computed styles under the hold can check, and the two have to agree or
   * the frame is not the frame you were looking at. A css animation now carries the instant in its
   * own delay, so its clock belongs at zero; anything made by script has no delay to carry it and
   * is seeked outright.
   */
  const clocks = []
  try {
    for (const anim of doc.getAnimations()) {
      const target = anim.effect && anim.effect.target
      clocks.push({ anim, state: anim.playState, startTime: anim.startTime, currentTime: anim.currentTime })
      try {
        anim.pause()
        anim.currentTime = typeof anim.animationName === 'string' && retimed.has(target) ? 0 : at
      } catch {}
    }
  } catch {}

  let done = false
  return function release() {
    if (done) return
    done = true
    sheet.remove()
    for (const el of marked) el.removeAttribute(HELD)
    for (const { anim, state, startTime, currentTime } of clocks) {
      try {
        /**
         * A start time is a point on the document's own timeline, so putting one back is exact:
         * the animation carries on as if it had never been touched, and one that had already run
         * out goes back to being finished rather than to being paused at its last frame. Only an
         * animation that was genuinely paused has no start time, and that one is restored by its
         * clock, which is the case the studio is always in.
         */
        if (state === 'idle') anim.cancel()
        else if (startTime !== null && startTime !== undefined) anim.startTime = startTime
        else if (typeof currentTime === 'number') {
          anim.pause()
          anim.currentTime = currentTime
        }
      } catch {}
    }
  }
}

/** css time is seconds unless it says otherwise, and a delay list mixes the two freely */
const millis = (time) => {
  const s = String(time).trim()
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return 0
  return s.endsWith('ms') ? n : n * 1000
}

/**
 * The document as xhtml a foreignObject will accept.
 *
 * Everything here is about one failure. An svg that is not well formed loads as an Image error with
 * an empty message, so a single stray ampersand or a framework attribute named @click costs a black
 * frame and says nothing about why. XMLSerializer handles the ampersands and the void elements; the
 * rest is the things it will happily emit that no xml parser will read back, and a parse of the
 * result before it leaves here, so the error names the line instead of the browser shrugging.
 */
export async function serialize(doc, { inlined, width, height } = {}) {
  const found = new Map([...(inlined?.fonts || []), ...(inlined?.images || [])])
  const failed = inlined?.failed || new Set()
  const base = doc.baseURI || ''
  const root = doc.documentElement.cloneNode(true)

  /* scripts cannot run inside an image and links cannot load, so both are weight and neither is paint */
  for (const el of root.querySelectorAll('script, link[rel~="stylesheet"], link[rel~="preload"]')) el.remove()

  for (const el of root.querySelectorAll('style')) el.textContent = rewriteCss(el.textContent, base, found)

  const live = {
    img: [...doc.querySelectorAll('img')],
    canvas: [...doc.querySelectorAll('canvas')],
    field: [...doc.querySelectorAll('input, textarea, select')],
  }

  ;[...root.querySelectorAll('img')].forEach((el, i) => {
    const from = live.img[i]
    const url = absolute(from ? (from.currentSrc || from.getAttribute('src')) : el.getAttribute('src'), base)
    const data = url && found.get(url)
    if (data) {
      el.setAttribute('src', data)
      el.removeAttribute('srcset')
      el.removeAttribute('sizes')
      return
    }
    if (!url || !failed.has(url)) return
    /* an image that will not load draws as a broken glyph and shrinks to nothing, so the box it had
       is pinned and the source is emptied: a gap where the picture was beats a browser's own icon */
    if (from) {
      const box = from.getBoundingClientRect()
      if (box.width && box.height) el.setAttribute('style', `${el.getAttribute('style') || ''};width:${box.width}px;height:${box.height}px`)
    }
    el.removeAttribute('src')
    el.removeAttribute('srcset')
  })

  for (const el of root.querySelectorAll('image')) {
    const url = absolute(el.getAttribute('href') || el.getAttribute('xlink:href'), base)
    const data = url && found.get(url)
    if (data) {
      el.setAttribute('href', data)
      el.removeAttribute('xlink:href')
    }
  }

  for (const el of root.querySelectorAll('[style*="url("]')) {
    el.setAttribute('style', rewriteCss(el.getAttribute('style'), base, found))
  }

  /**
   * The three kinds of state that live off the dom.
   *
   * A canvas is pixels a script painted and the script will not run again, a typed value is a
   * property and not an attribute, and a checked box is the same. All three clone as empty, which
   * is the studio-capture finding all over again: a picked element that lost what was typed in it.
   *
   * The canvas is swapped for an image rather than dressed up as one, which was measured and not
   * guessed. Chromium does not paint a canvas element inside a foreignObject at all: not its
   * contents, not its own background, not a background-image put on it, and a chart in the middle
   * of a page collapses to nothing. An img in its place draws. Its id, its classes and its inline
   * style come with it so most of the css still finds it, and a rule written against the canvas
   * element itself no longer matches, which is the price and is written down in CAVEATS.
   */
  ;[...root.querySelectorAll('canvas')].forEach((el, i) => {
    const from = live.canvas[i]
    if (!from) return
    let data = ''
    try {
      data = from.toDataURL('image/png')
    } catch {}
    const box = from.getBoundingClientRect()
    const swap = doc.createElement('img')
    for (const attr of el.attributes) swap.setAttribute(attr.name, attr.value)
    swap.setAttribute('style', `${el.getAttribute('style') || ''};width:${box.width}px;height:${box.height}px`)
    if (data.length > 32) swap.setAttribute('src', data)
    el.replaceWith(swap)
  })
  ;[...root.querySelectorAll('input, textarea, select')].forEach((el, i) => {
    const from = live.field[i]
    if (!from) return
    const tag = el.tagName.toLowerCase()
    if (tag === 'textarea') el.textContent = from.value ?? ''
    else if (tag === 'select') {
      const options = [...el.querySelectorAll('option')]
      const chosen = [...from.querySelectorAll('option')]
      options.forEach((o, j) => (chosen[j] && chosen[j].selected ? o.setAttribute('selected', 'selected') : o.removeAttribute('selected')))
    } else {
      if (from.value != null) el.setAttribute('value', from.value)
      if (from.type === 'checkbox' || from.type === 'radio') from.checked ? el.setAttribute('checked', 'checked') : el.removeAttribute('checked')
    }
  })

  if (inlined?.css) {
    const carried = doc.createElement('style')
    carried.setAttribute('data-wall-inlined', '')
    carried.textContent = inlined.css
    ;(root.querySelector('head') || root).insertBefore(carried, (root.querySelector('head') || root).firstChild)
  }

  /**
   * The size of the frame and the colour behind it, both said out loud.
   *
   * Inside a foreignObject the root element is the initial containing block, and a page written
   * against 100% of a viewport gets the foreignObject's box either way. A page written against
   * nothing gets auto height, which is a background that stops halfway down the frame.
   *
   * The colour is the same wound one level deeper, and it cost the first real page this was pointed
   * at. A browser takes the background off whichever of html and body declares one and paints the
   * whole canvas with it, which is why `body{background:#08090a}` covers a viewport the body is not
   * tall enough to fill. There is no canvas inside an image, so a page whose content ran out at 460
   * of 760 pixels came back correct to the pixel down to 460 and transparent below it. Measured on
   * a real studio page: 39 percent of the frame, every pixel of it in the band under the content.
   */
  const view = doc.defaultView
  if (view) {
    const paint = view.getComputedStyle(doc.documentElement)
    const bare = paint.backgroundImage === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(paint.backgroundColor)
    const from = bare && doc.body ? view.getComputedStyle(doc.body) : paint
    const canvas = ['background-color', 'background-image', 'background-position', 'background-size',
      'background-repeat', 'background-origin', 'background-clip']
      .map((p) => `${p}:${from.getPropertyValue(p)}`).join(';')
    const box = width && height ? `;width:${Math.round(width)}px;height:${Math.round(height)}px` : ''
    root.setAttribute('style', `${canvas};${root.getAttribute('style') || ''}${box}`)
  } else if (width && height) {
    root.setAttribute('style', `${root.getAttribute('style') || ''};width:${Math.round(width)}px;height:${Math.round(height)}px`)
  }

  const walker = doc.createTreeWalker(root, 0x01 | 0x04 | 0x80)
  const doomed = []
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 8) {
      doomed.push(node)
      continue
    }
    if (node.nodeType === 3) {
      const text = clean(node.nodeValue)
      if (text !== node.nodeValue) node.nodeValue = text
      continue
    }
    for (const attr of [...node.attributes]) {
      /* the dom is the one that knows whether a colon is a prefix or just a character in the name,
         so a namespaced attribute is trusted to a QName and a plain one is held to no colon at all */
      const fits = attr.namespaceURI ? Q_NAME.test(attr.name) : NC_NAME.test(attr.name)
      if (!fits || attr.name.startsWith('xmlns')) {
        node.removeAttributeNode(attr)
        continue
      }
      const value = clean(attr.value)
      if (value !== attr.value) attr.value = value
    }
  }
  for (const node of doomed) node.remove()

  let xml = new XMLSerializer().serializeToString(root)
  /* spliced rather than set as an attribute: setAttribute('xmlns') makes a plain attribute that the
     serializer then emits beside the one it declares itself, and two xmlns on one tag is not xml */
  if (!/^<[^>]*\sxmlns=/.test(xml)) xml = xml.replace(/^<([A-Za-z][\w:.-]*)/, `<$1 xmlns="${XHTML}"`)

  const parsed = new DOMParser().parseFromString(xml, 'application/xhtml+xml')
  const bad = parsed.querySelector('parsererror')
  if (bad) throw new Error(`the page did not serialize to well formed xml, which is the blank frame with no message: ${bad.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)}`)
  return xml
}

/**
 * One frame: the document, held at ms, drawn onto a canvas.
 *
 * The hold is released as soon as the copy is a string, well before the image has decoded, because
 * the live page is somebody's preview and holding it for the length of a decode is a page that
 * stutters while it films.
 */
export async function rasterize(doc, { width, height, ms = 0, inlined, scale = 1 } = {}) {
  const w = Math.max(1, Math.round(Number(width) || doc.documentElement.clientWidth || 1))
  const h = Math.max(1, Math.round(Number(height) || doc.documentElement.clientHeight || 1))
  const factor = Math.max(0.1, Number(scale) || 1)

  const release = holdAt(doc, ms)
  let xml
  try {
    xml = await serialize(doc, { inlined, width: w, height: h })
  } finally {
    release()
  }

  const svg = `<svg xmlns="${SVGNS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<foreignObject x="0" y="0" width="${w}" height="${h}">${xml}</foreignObject></svg>`
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    /* the event carries no message at all, so the only useful thing to say is the size of what
       failed and the fact that it was the copy and not the network */
    img.onerror = () => reject(new Error(`the browser refused the svg copy of the page at ${ms}ms (${Math.round(svg.length / 1024)}kb), which is what an unparseable frame looks like from here`))
    img.src = source(svg)
  })

  /* made in the realm this module runs in and not in the iframe, because the caller is the studio
     and the encoder it hands the canvas to lives there too */
  const owner = (typeof document !== 'undefined' && document) || doc
  const canvas = owner.createElement('canvas')
  canvas.width = Math.round(w * factor)
  canvas.height = Math.round(h * factor)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * A data uri and not a blob url, which is the one thing here that was measured rather than assumed.
 *
 * A blob url is the obvious way to hand a large string to an Image: no encoding pass, one object to
 * revoke, and the string is never copied. It also taints the canvas. Measured in chromium 142, an
 * svg drawn from blob: makes getImageData throw SecurityError, and the same svg from a data uri does
 * not, which matters far more than it first looks: a tainted canvas cannot be read back and cannot
 * be turned into a VideoFrame either, so every frame would encode to nothing and the only symptom
 * would be a film that plays black. createImageBitmap is not a way out; it refuses svg outright with
 * InvalidStateError. Base64 costs a third more bytes and is the price of a canvas that can be read.
 *
 * btoa alone is not enough because it is latin1 and a page has real text in it, so the string is
 * encoded to utf-8 bytes first.
 */
const source = (svg) => `data:image/svg+xml;base64,${base64(new TextEncoder().encode(svg))}`

/**
 * Every frame of a film, in order.
 *
 * Inlining happens once. The resources do not change between frames, and fetching a font ninety
 * times is most of the difference between a film that takes seconds and one somebody gives up on.
 * The clock is the index and not the wall clock, so a frame that took 80ms to draw does not write
 * that stall into the film, which is the same reason shared/mp4.mjs times its samples by index.
 */
export async function frames(doc, { fps = 30, ms = 3000, width, height, onFrame, scale = 1, fetchVia } = {}) {
  const rate = Math.max(1, Number(fps) || 30)
  const span = Math.max(0, Number(ms) || 0)
  const total = Math.max(1, Math.round((span / 1000) * rate))
  const inlined = await inline(doc, { fetchVia })
  for (let i = 0; i < total; i++) {
    const canvas = await rasterize(doc, { width, height, ms: Math.round((i / rate) * 1000), inlined, scale })
    if (onFrame) await onFrame(canvas, i)
  }
  return total
}
