/**
 * The layout of every page the house designs, measured.
 *
 * The slop detector reads the source of a page, so it can see a gradient in a string and not a
 * column that changed width. Nothing here had ever measured a box, and it showed: every world
 * rendered five to seven different left edges down one page, two thirds of them collapsed on a
 * phone, and the suite passed. Both were invisible because the only check that could have seen
 * them did not exist.
 *
 * So this renders the real pages in a real browser at the three widths that actually occur, a
 * wall cell, the studio paper and a phone, and asserts what a designed page owes a reader: one
 * column, nothing off the edge, nothing too narrow to read, and no id used twice.
 *
 * Run alone with `node verify/layout.mjs`, or from verify/app.mjs, which is where it gates.
 */

import { chromium } from 'playwright'

const WIDTHS = [{ name: 'cell', w: 1280 }, { name: 'studio', w: 900 }, { name: 'phone', w: 390 }]

/** every built-in world on every look, composed the way the app composes them */
function housePages(core) {
  const out = []
  for (const world of core.WORLDS) {
    for (const look of core.PRESETS) {
      const taste = world.taste(look)
      const base = core.starterPage(taste, 'Spoor')
      const pool = new Map()
      for (const s of base.sections) pool.set(s.role, [...(pool.get(s.role) ?? []), s])
      const ordered = world.compose?.length
        ? world.compose.map((r) => pool.get(r)?.shift() ?? {
            id: r, role: r, form: core.ROLE_FORMS[r][0], on: true, content: core.defaultContent(r, 'Spoor'),
          })
        : base.sections
      out.push({
        where: `${world.id} on ${look.name}`,
        page: { ...base, world: world.id, backdrop: world.backdrop, taste, sections: core.dressSections(ordered, world) },
      })
    }
  }
  return out
}

/**
 * The block library reaches real pages.
 *
 * A world designed by a model is thirty lines of CSS written against hooks it was told about in
 * the prompt. When that list was written by hand it drifted: it promised a figure element and a
 * second button style that had never existed, and about two fifths of every world a model wrote
 * landed on nothing at all. The prompt is generated from the library now, so this only has to
 * prove the other half, that everything the library names is something a page actually wears.
 */
export function checkLibrary(core) {
  const rendered = new Set()
  for (const world of core.WORLDS) {
    for (const look of [core.PRESETS[0], core.PRESETS[3]]) {
      const taste = world.taste(look)
      // every form of every role, so a block only one form uses is still seen
      for (const s of core.starterPage(taste, 'Spoor').sections) {
        for (const form of core.ROLE_FORMS[s.role]) {
          const html = core.renderSection({ ...s, form }, taste, 7, world, {})
          for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => rendered.add(c))
        }
      }
    }
  }
  const named = [...core.BLOCKS.map((b) => b.name), 'wrap', 'wide', 'ctas', 'btn-primary', 'link', 'eyebrow', 'figure', 'num']
  const missing = named.filter((c) => !rendered.has(c))
  return { blocks: core.BLOCKS.length, tokens: core.TOKENS.length, classesRendered: rendered.size, missing }
}

/** What one page's geometry is, at one width. */
const MEASURE = () => {
  const vw = document.documentElement.clientWidth
  const out = { scrolls: document.documentElement.scrollWidth - vw, past: [], crushed: [], tiny: [], dup: [], empty: 0, edges: [] }
  const seen = new Set()
  for (const el of document.querySelectorAll('[id]')) {
    if (seen.has(el.id)) out.dup.push(el.id)
    seen.add(el.id)
  }
  for (const s of document.querySelectorAll('section')) {
    if (s.getBoundingClientRect().height < 8) out.empty++
    // the edge a reader's eye tracks down the page: where each block of a section begins
    for (const block of s.querySelectorAll(':scope > .wrap > *')) {
      const r = block.getBoundingClientRect()
      if (r.width > 0) out.edges.push(Math.round(r.left))
    }
  }
  out.edges = [...new Set(out.edges)]
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.display === 'none' || (!r.width && !r.height)) continue
    if (r.right > vw + 1 || r.left < -1) out.past.push(el.tagName.toLowerCase() + ' right=' + Math.round(r.right))
  }
  // a column too narrow to form a line, measured against the type actually set in it
  for (const el of document.querySelectorAll('p')) {
    const r = el.getBoundingClientRect()
    const fs = parseFloat(getComputedStyle(el).fontSize)
    const txt = (el.textContent ?? '').trim()
    if (txt.length > 25 && r.width > 0 && r.width < fs * 12) out.crushed.push(Math.round(r.width) + 'px at ' + fs + 'px type')
    if (txt.length > 25 && fs < 12.5) out.tiny.push(fs + 'px')
  }
  return out
}

export async function checkGeometry(core) {
  const browser = await chromium.launch()
  const pages = housePages(core)
  const faults = []
  let mostEdges = 0
  for (const { name, w } of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1400 } })
    const probe = await ctx.newPage()
    for (const { where, page } of pages) {
      await probe.setContent(core.renderPage(page, { title: 'Spoor', still: true }), { waitUntil: 'load' })
      const m = await probe.evaluate(MEASURE)
      mostEdges = Math.max(mostEdges, m.edges.length)
      const at = `${where} at ${name}`
      if (m.scrolls > 1) faults.push(`${at}: scrolls ${m.scrolls}px sideways`)
      if (m.past.length) faults.push(`${at}: ${m.past.length} boxes past the edge, ${m.past[0]}`)
      // a page is allowed the column, a centred block and a bleed, and no more. Past that the
      // sections are not sharing a grid, which is what reads as wild rather than as designed
      if (m.edges.length > 3) faults.push(`${at}: ${m.edges.length} left edges (${m.edges.join(', ')})`)
      if (m.crushed.length) faults.push(`${at}: ${m.crushed.length} crushed columns, ${m.crushed[0]}`)
      if (m.tiny.length) faults.push(`${at}: body text at ${m.tiny[0]}`)
      if (m.dup.length) faults.push(`${at}: duplicate id ${m.dup[0]}`)
      if (m.empty) faults.push(`${at}: ${m.empty} sections with no height`)
    }
    await ctx.close()
  }
  await browser.close()
  return { pages: pages.length * WIDTHS.length, widths: WIDTHS.map((x) => x.w), mostLeftEdgesOnOnePage: mostEdges, faults }
}

/** Both gates, reported the way the rest of the suite reports, and fatal the same way. */
export async function checkLayout(core) {
  const lib = checkLibrary(core)
  console.log('block library:', JSON.stringify({
    blocks: lib.blocks, tokens: lib.tokens, classesRendered: lib.classesRendered,
    promisedButNeverRendered: lib.missing.length ? lib.missing : 'none',
  }))
  if (lib.missing.length) throw new Error(`the design prompt names hooks no page has: ${lib.missing.join(', ')}`)

  const geo = await checkGeometry(core)
  console.log('house geometry:', JSON.stringify({
    pages: geo.pages, widths: geo.widths, mostLeftEdgesOnOnePage: geo.mostLeftEdgesOnOnePage,
    faults: geo.faults.length ? geo.faults.slice(0, 8) : 'none',
  }))
  if (geo.faults.length) throw new Error(`the house breaks its own layout on ${geo.faults.length} counts`)
}

// run alone, so a change to a block can be checked without driving the whole app
if (import.meta.url === `file://${process.argv[1]}`) {
  await checkLayout(await import('../dist-core/core.js'))
}
