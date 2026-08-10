/**
 * What a rendered page's geometry is, measured rather than read.
 *
 * The slop detector reads the source of a page, so it can see a gradient in a string and not a
 * column that changed width. This is the other half: it reads boxes, and it only has anything to
 * say once a browser has laid the page out.
 *
 * It lives here rather than in the suite that used to own it because two things need it now. The
 * suite still gates the built-in worlds with it, and the app runs it on every world a model
 * designs, before that world is used for anything. Two copies of a measurement are two
 * measurements, and the one in the app would have been the one that drifted.
 *
 * MEASURE is written to survive being handed to another window: it closes over nothing, takes
 * the document it is measuring, and reaches everything else through that. The suite serialises
 * it into a page under playwright and the app calls it on an iframe it just wrote.
 */

/** the widths that actually occur: a wall cell, the studio paper, a phone */
export const WIDTHS = [1280, 900, 390]

export interface Measured {
  scrolls: number
  past: string[]
  crushed: string[]
  tiny: string[]
  dup: string[]
  empty: number
  edges: number[]
  wordColumn: string[]
  unreadable: string[]
}

export const MEASURE = (doc: Document = document): Measured => {
  const view = doc.defaultView ?? window
  const css = (el: Element) => view.getComputedStyle(el)
  const vw = doc.documentElement.clientWidth
  const out: Measured = {
    scrolls: doc.documentElement.scrollWidth - vw,
    past: [], crushed: [], tiny: [], dup: [], empty: 0, edges: [], wordColumn: [], unreadable: [],
  }
  const seen = new Set<string>()
  for (const el of doc.querySelectorAll('[id]')) {
    if (seen.has(el.id)) out.dup.push(el.id)
    seen.add(el.id)
  }
  for (const s of doc.querySelectorAll('section')) {
    if (s.getBoundingClientRect().height < 8) out.empty++
    // the edge a reader's eye tracks down the page: where each block of a section begins
    for (const block of s.querySelectorAll(':scope > .wrap > *')) {
      const r = block.getBoundingClientRect()
      if (r.width > 0) out.edges.push(Math.round(r.left))
    }
  }
  out.edges = [...new Set(out.edges)]
  for (const el of doc.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    const cs = css(el)
    if (cs.position === 'fixed' || cs.display === 'none' || (!r.width && !r.height)) continue
    if (r.right > vw + 1 || r.left < -1) out.past.push(el.tagName.toLowerCase() + ' right=' + Math.round(r.right))
  }
  // a column too narrow to form a line, measured against the type actually set in it
  for (const el of doc.querySelectorAll('p')) {
    const r = el.getBoundingClientRect()
    const fs = parseFloat(css(el).fontSize)
    const txt = (el.textContent ?? '').trim()
    if (txt.length > 25 && r.width > 0 && r.width < fs * 12) out.crushed.push(Math.round(r.width) + 'px at ' + fs + 'px type')
    if (txt.length > 25 && fs < 12.5) out.tiny.push(fs + 'px')
  }

  // how many characters of its own type a heading gets on a line. A heading measured in the
  // body's column came out at eleven, which is a column of two-word lines rather than a
  // headline, and it was the most visible thing wrong with the page
  const chOf = (el: Element) => {
    const s = doc.createElement('span')
    s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
    s.style.font = css(el).font
    s.textContent = '0'.repeat(50)
    doc.body.appendChild(s)
    const w = s.getBoundingClientRect().width / 50
    s.remove()
    return w
  }
  for (const h of doc.querySelectorAll('h1,h2')) {
    const txt = (h.textContent ?? '').trim()
    if (txt.length < 24) continue
    const per = Math.round(h.getBoundingClientRect().width / chOf(h))
    if (per < 12) out.wordColumn.push(h.tagName.toLowerCase() + ' at ' + per + ' characters a line')
  }

  // the one real button, against its own fill. A world that restyled only the colour shipped
  // accent text on an accent ground, which is a button with nothing readable in it
  const lum = (c: string) => {
    const [r, g, b, a] = (c.match(/[\d.]+/g) ?? ['0', '0', '0', '1']).map(Number)
    return a === 0 ? null : (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  for (const b of doc.querySelectorAll('.btn-primary')) {
    const cs = css(b)
    const ink = lum(cs.color)
    let ground = lum(cs.backgroundColor)
    for (let el = b.parentElement; ground === null && el; el = el.parentElement) ground = lum(css(el).backgroundColor)
    if (ink !== null && ground !== null && Math.abs(ink - ground) < 0.18) {
      out.unreadable.push('button ink ' + cs.color + ' on ' + cs.backgroundColor)
    }
  }
  return out
}

/**
 * A measurement said as faults, in the words a designer of the page would need to fix it.
 *
 * Each one names the lever, and that is the whole difference between a fault and a complaint.
 * Instrumented over a real wall, every repair asked only about the catalogue succeeded and every
 * repair asked about geometry failed: a world told "2 columns too narrow to hold a line: 45px at
 * 18px type" came back with the same four faults and was thrown away, because a rendered
 * measurement is not something it set. It chooses a scale, a measure, a base size, a breakout
 * and a layout, and nothing had ever told it which of those produced a 45px column.
 *
 * The measurement still leads, because it is the evidence. What follows it is where to reach.
 */
export function faultsOf(m: Measured): string[] {
  const out: string[] = []
  if (m.scrolls > 1) {
    out.push(`the page scrolls ${m.scrolls}px sideways, so something is wider than the window. ` +
      'A fixed width in the css you wrote is the usual cause, since every other width here is set by the frame.')
  }
  if (m.past.length) {
    out.push(`${m.past.length} boxes sit past the edge of the page, starting with ${m.past[0]}. ` +
      'Same cause: a width or a margin in your css that the frame did not choose.')
  }
  // a page is allowed the column, a centred block and a bleed, and no more. Past that the
  // sections are not sharing a grid, which is what reads as wild rather than as designed
  if (m.edges.length > 3) {
    out.push(`${m.edges.length} different left edges (${m.edges.join(', ')}), so the sections are not sharing a grid. ` +
      'structure.breakout and layout decide where a section is allowed to leave the column, and a page reads as ' +
      'composed when it leaves from the same few places rather than from everywhere.')
  }
  if (m.crushed.length) {
    out.push(`${m.crushed.length} columns too narrow to hold a line: ${m.crushed[0]}. ` +
      'Widen structure.measure, lower structure.base, or give the page fewer sections standing side by side, ' +
      'because a column narrower than about twelve characters of its own type is a list of words.')
  }
  if (m.tiny.length) {
    out.push(`body text at ${m.tiny[0]}, which is unreadable on a normal screen. structure.base sets it.`)
  }
  if (m.wordColumn.length) {
    out.push(`${m.wordColumn[0]}, which is a column of words rather than a headline. ` +
      'Lower scale, widen structure.measure, or choose a layout that gives this section the full width, ' +
      'because a heading is sized against the track it is set in and not against the window.')
  }
  if (m.unreadable.length) {
    out.push(`${m.unreadable[0]}, so the button has nothing readable in it. palette decides how far the accent ` +
      'sits from the background, and contrast pulls them apart.')
  }
  if (m.dup.length) out.push(`the id ${m.dup[0]} is used twice, which is a section asking for a role twice over.`)
  if (m.empty) out.push(`${m.empty} sections render with no height at all, so something in your css is collapsing them.`)
  return out
}

/**
 * Lay a page out in this browser and measure it, at the widths that actually occur.
 *
 * Offscreen and thrown away, because the only thing wanted is the geometry. Fonts are inline in
 * the page, so the wait is for them to be applied rather than fetched: measuring before they
 * are makes every heading the wrong width and every fault imaginary.
 *
 * Anything that goes wrong here reports nothing rather than something invented. A measurement
 * that failed is not evidence of a fault, and a wall must not be held up by a ruler.
 */
export async function strainsIn(html: string, widths: number[] = WIDTHS): Promise<string[]> {
  if (typeof document === 'undefined') return []
  const out: string[] = []
  for (const width of widths) {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = `position:fixed;left:-20000px;top:0;border:0;width:${width}px;height:1400px`
    document.body.appendChild(frame)
    try {
      const doc = frame.contentDocument
      if (!doc) continue
      doc.open()
      doc.write(html)
      doc.close()
      await doc.fonts?.ready?.catch?.(() => {})
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      for (const fault of faultsOf(MEASURE(doc))) {
        // one page, three widths: a fault that holds at every one of them is still one fault
        if (!out.includes(fault)) out.push(fault)
      }
    } catch {
      // a ruler that broke says nothing
    } finally {
      frame.remove()
    }
  }
  return out
}
