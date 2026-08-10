/**
 * Slop detection.
 *
 * The catalogue of tells lives in design/slop.ts as data; this file is the detector that
 * runs it, plus the handful of checks that have to count or compare rather than match.
 * Every check runs locally on the page model and the rendered HTML, so it costs nothing,
 * runs on all eight papers at once, and can therefore be fed back into the next prompt
 * rather than only shown after the fact.
 *
 * A flag is never fatal. It names the pattern and says why it reads as generic, because the
 * point is to give the writer something specific to change, and sometimes the right answer is
 * to keep it.
 */

import type { Page } from '@/sections'
import { worldById } from '@/worlds'
import { COPY_TELLS, LIMITS, MARKUP_TELLS } from '@/design/slop'

/**
 * Which half of the catalogue a flag came from.
 *
 * The two are different faults with different owners, and reading one count for both is what
 * made a real measurement unreadable: a world the house gate proves is design-clean showed one
 * generic on the wall, and the flag was in its copy. A design flag belongs to whoever designed
 * the world and can be handed back to be fixed; a copy flag belongs to whoever wrote the words.
 */
export type FlagKind = 'design' | 'copy'

export interface Flag {
  kind: FlagKind
  id: string
  /** the pattern, named the way a designer would name it */
  label: string
  /** why it reads as generic, which is what a model needs in order to avoid it */
  why: string
  section?: string
}

/** beige and its neighbours, the colour a model picks when it does not have a palette */
const AI_BEIGE = /^#(f[0-9a-f]{2}(e|f)[0-9a-f]{2}(d|e)[0-9a-f]|f5f5f0|faf8f5|fdfcf8|f7f3ed)$/i

const text = (page: Page) =>
  page.sections
    .filter((s) => s.on)
    .flatMap((s) => Object.entries(s.content).map(([k, v]) => ({ section: s.id, key: k, value: v })))
    .filter((f): f is { section: string; key: string; value: string } => typeof f.value === 'string')

/**
 * Check a page. `html` is optional so the model loop can check copy before anything renders,
 * which is when the result is still worth acting on.
 */
export function slop(page: Page, html?: string): Flag[] {
  const flags: Flag[] = []
  // a world built in a named system wears some of these on purpose, and calling a correct
  // Material elevation slop would be the detector marking the system down for existing
  const claimed = new Set(page.world ? worldById(page.world).claims ?? [] : [])
  const add = (kind: FlagKind, id: string, label: string, why: string, section?: string) => {
    if (claimed.has(id)) return
    if (!flags.some((f) => f.id === id && f.section === section)) flags.push({ kind, id, label, why, section })
  }

  for (const { section, key, value } of text(page)) {
    const v = value.trim()
    for (const tell of COPY_TELLS) {
      if (tell.key && tell.key !== key) continue
      const m = v.match(tell.find)
      if (m) add('copy', tell.id, tell.label(m[0]), tell.why, section)
    }
  }

  // an em dash is the punctuation a model leans on for energy it did not earn in the words,
  // and more than one on a page is a tell rather than a choice
  const dashes = text(page).reduce((n, f) => n + (f.value.match(/—/g)?.length ?? 0), 0)
  if (dashes >= LIMITS.emDashes) {
    add('copy', 'em-dashes', `${dashes} em dashes`,
      'Chained asides read as generated writing now, where a full sentence would carry the point.')
  }

  // three bare figures make a stat banner, which asks to be admired rather than believed
  const bares = text(page).filter((f) => /^[\d,.]+\s*(?:%|[kKmMbB]\+?|x|×|\+)$/.test(f.value.trim())).length
  if (bares >= LIMITS.bareStats) {
    add('copy', 'stat-banner', 'a row of big statistics',
      'A number outside a sentence says nothing about what it cost or saved, so the row decorates rather than argues.')
  }

  const hero = page.sections.find((s) => s.role === 'claim' && s.on)
  const headline = typeof hero?.content.headline === 'string' ? hero.content.headline : ''
  if (headline) {
    const words = headline.trim().split(/\s+/)
    const specific = /\d/.test(headline) || words.some((w) => /^[A-Z]/.test(w.slice(0, 1)) && w.length > 2)
    if (!specific && words.length > LIMITS.vagueHeadlineWords) {
      add('copy', 'vague-headline', 'vague headline',
        'It carries no number, no name and no concrete noun, so it could sit on any product.',
        hero?.id)
    }
    if (/\?\s*$/.test(headline.trim()) || /^(?:tired of|struggling|still|ready to|what if|why settle)\b/i.test(headline.trim())) {
      add('copy', 'rhetorical-headline', 'a headline that asks',
        'A question the page answers itself spends the headline warming up, where the answer would have been the headline.',
        hero?.id)
    }
  }
  const eyebrow = typeof hero?.content.eyebrow === 'string' ? hero.content.eyebrow : ''
  if (eyebrow && eyebrow.length < 40 && /^(for|the|your|built for|made for)\b/i.test(eyebrow)) {
    // copy, not design: it reads the eyebrow the writer wrote and matches it against a phrase.
    // Tagged design it was handed to the world repair call, which has no say over that line and
    // could only fail, which is the same trap the italic serif tell was in
    add('copy', 'hero-eyebrow-chip', 'hero eyebrow chip',
      'A small label above the headline is the most reached for hero decoration, and it usually repeats what the headline already says.',
      hero?.id)
  }

  // The opening is read in about a second. Measured over a recorded run, a quarter of the heros
  // ran past twenty-five words and one reached thirty-nine, which is a paragraph in the place a
  // reader has not yet decided to read anything.
  const heroSub = typeof hero?.content.sub === 'string' ? hero.content.sub.trim() : ''
  const heroWords = heroSub ? heroSub.split(/\s+/).length : 0
  if (heroWords > LIMITS.heroSubWords) {
    add('copy', 'chatty-opening', `${heroWords} words under the headline`,
      'The line under a headline is read before the reader has decided to read anything, so a paragraph there is spent rather than saved.',
      hero?.id)
  }

  const nav = page.sections.find((s) => s.role === 'masthead' && s.on)
  const wordy = ((nav?.content.links as unknown[]) ?? [])
    .filter((l) => typeof l === 'string' && l.trim().split(/\s+/).length > LIMITS.navLinkWords)
  if (wordy.length) {
    add('copy', 'chatty-nav', `${wordy.length} nav links of three words or more`,
      'Nav is read peripherally on the way to something else, so a phrase there takes a fixation the headline needed.',
      nav?.id)
  }

  if (typeof page.taste?.bg === 'string' && AI_BEIGE.test(page.taste.bg)) {
    add('design', 'ai-beige', 'ai beige background',
      'It is the off-white a model picks when no palette was chosen, and it dates a page immediately.')
  }

  if (html) {
    /**
     * Italic, on a page whose display face is actually a serif.
     *
     * This was two patterns in the catalogue, italic anywhere and the letters serif anywhere, and
     * the second is satisfied by every sans stack ever written, because they all end in
     * sans-serif. So it fired on any page carrying one italic blockquote and told the designer
     * its serif display was the problem when the display was Inter. A world handed that back
     * could not win: nothing it did about serifs could clear a flag that was really about the
     * italic, and both of the worlds that survived repair on a real wall died here.
     *
     * Which face is the display is a comparison rather than a pattern, so it belongs in the
     * detector rather than in the catalogue, which is the split that file already draws.
     */
    const display = String(page.taste?.display ?? '').replace(/sans-serif/gi, '')
    if (/serif/i.test(display) && /font-style:\s*italic/.test(html)) {
      add('design', 'italic-serif', 'italic serif display',
        'It is the fastest way to look editorial, which is why it now reads as a template.')
    }

    for (const tell of MARKUP_TELLS) {
      if (tell.find.every((r) => r.test(html))) add('design', tell.id, tell.label, tell.why)
    }
    // The counted checks. These exist because the model writes CSS: parameters could not
    // produce an unreadable page, but hand written CSS can, and these are the ways it does.
    const body = html.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) ?? []
    if (body.some((d) => Number(d.replace(/\D+/g, '')) < 14)) {
      add('design', 'tiny-text', 'text under 14px',
        "It looks refined on a designer's screen and is unreadable on everyone else's.")
    }
    if ((html.match(/box-shadow:/g) ?? []).length > 8) {
      add('design', 'shadow-stack', 'shadows on everything',
        'When every block floats, nothing is above anything, and the depth stops meaning anything.')
    }
    const faces = new Set((html.match(/font-family:\s*([^;}]+)/g) ?? []).map((f) => f.split(',')[0]))
    if (faces.size > 3) {
      add('design', 'face-soup', `${faces.size} typefaces`,
        'Two faces is a system and four is an accident, since each one asks the reader to adjust.')
    }
    const cards = (html.match(/class="card/g) ?? []).length
    if (cards >= 6) {
      add('design', 'card-soup', `${cards} cards on one page`,
        'When everything is boxed, nothing is emphasised, and the page reads as a list of tiles.')
    }
    // the macOS traffic lights, drawn rather than captured. Two of the three hexes together is
    // the signature of a mocked terminal, in either of the shades the mockups circulate in.
    const dots = ['ff5f5', 'ffbd2e', 'febc2e', '27c93f', '28c840'].filter((c) => html.toLowerCase().includes(c))
    if (dots.length >= 2) {
      add('design', 'terminal-dots', 'a drawn terminal window',
        'The three little circles promise a real window and deliver a picture of one, which is the gap between a screenshot and a prop.')
    }
    if ((html.match(/border-radius:\s*(?:2[89]|[3-9]\d)px/g) ?? []).length >= 3) {
      add('design', 'over-rounding', 'over-rounded corners',
        'Past a certain radius every element becomes a pill, and softness turns into the only voice the page has.')
    }
  }

  return flags
}

/** The flags a page has, phrased as instructions, for feeding back into the next prompt. */
export function slopBrief(flags: Flag[]): string {
  if (!flags.length) return ''
  return [
    'Avoid these specific patterns, which the current draft trips:',
    ...flags.map((f) => `- ${f.label}. ${f.why}`),
  ].join('\n')
}
