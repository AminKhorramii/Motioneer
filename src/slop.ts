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
import { wordsIn } from '@/written'

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

/**
 * The four off-whites a model reaches for when it has not been given a palette.
 *
 * A list, and it says so now. It used to open with a pattern: f, two digits, e or f, two digits,
 * d or e, one digit. That is eight hex digits and a colour has six, so the branch could never
 * match anything, and this rule had always been four literals wearing a regex.
 *
 * Widening it is the obvious repair and it is the wrong one. Measured across these four and the
 * deck's own paper grounds, the two sets do not separate on hue, saturation or lightness: the
 * till roll at #f7f6f2 sits between #f5f5f0 and #faf8f5 on every axis. That is the finding rather
 * than an obstacle to it. Cream is not a tell, it is paper, and it is the right ground for a
 * field guide and the lazy ground for a generated page in identically the same pixels.
 *
 * What is a tell is the combination, which is checked below with the other comparisons.
 */
const AI_BEIGE = /^#(f5f5f0|faf8f5|fdfcf8|f7f3ed)$/i

/**
 * Warm off-white, and rust, and a serif: the signature as it stands in 2026.
 *
 * The catalogue's oldest entries describe a violet wash and a glow, which was the generated look
 * of 2022. It moved. The register that now reads as machine made is cream stock, a terracotta
 * accent and a large italic serif, and a page can wear all three while tripping nothing here.
 *
 * Written as three conditions because no one of them is a fault. Cream is paper, terracotta is an
 * ink that has existed for as long as ink, and a serif is a serif. italic-serif below records what
 * happens when a rule fires on one ingredient: it fired on any page with an italic blockquote,
 * told the designer its serif was the problem when the display was Inter, and killed both worlds
 * that survived repair on a real wall. A conjunction is the shape that survives.
 */
const hslOf = (hex: string) => {
  const n = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(n)) return null
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  return { h, s, l }
}
/** paper: warm, pale, and not vivid */
const isCream = (c: { h: number; s: number; l: number }) => c.h >= 25 && c.h <= 65 && c.l > 0.85 && c.s < 0.7
/**
 * The terracotta band: orange-red, deep enough to be an ink rather than a tint.
 *
 * Orange side only. This first wrapped past 340 to take in carmine and oxblood, and that caught a
 * fluorescent riso pink at hue 342 and called it rust, which would have sent a repair after the
 * one colour on that page that was doing real work. The tell being described is rusty orange, so
 * the band is rusty orange: a deep carmine on cream is a stamp, not the house style.
 */
const isRust = (c: { h: number; s: number; l: number }) =>
  c.h <= 35 && c.s > 0.4 && c.l > 0.2 && c.l < 0.55

/**
 * Every string on the page, not only the ones sitting at the top of a section.
 *
 * This used to keep the top level entries and drop anything that was not a string, which meant
 * every list, every table and every group was invisible to the whole copy half of the catalogue.
 * Measured on the default page that is fifty eight of eighty four strings, and 57% of the
 * characters: the headline and the sub were policed, and the substance items, the pricing plans,
 * the objection answers and the footer were not. A page argues most of its case in those, so a
 * detector that could not read them was checking the part a writer already pays attention to and
 * skipping the part that fills up with filler.
 *
 * A leaf keeps the key nearest to it, so a plan's name is a name and a plan's cta is a cta, which
 * is what the key scoped tells want: they were written about a field, not about a depth.
 */
const strings = (value: unknown, key: string): { key: string; value: string }[] =>
  typeof value === 'string'
    ? [{ key, value }]
    : Array.isArray(value)
      ? value.flatMap((v) => strings(v, key))
      : value && typeof value === 'object'
        ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => strings(v, k))
        : []

const text = (page: Page) =>
  // A written page's words are its markup, and its sections are the defaults nobody rewrote.
  // Reading those would judge it on copy the reader cannot see: the first one rendered end to end
  // reported six tells, every one of them from a placeholder section that never reaches the page.
  page.written
    ? wordsIn(page.written).map((f) => ({ section: 'written', ...f }))
    : page.sections
        .filter((s) => s.on)
        .flatMap((s) =>
          Object.entries(s.content).flatMap(([k, v]) => strings(v, k).map((f) => ({ section: s.id, ...f }))),
        )

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
    /**
     * An italic serif display, which means the headline and not any italic on the page.
     *
     * This was narrowed once already, for exactly this, and the narrowing was left half done: the
     * check that the display face is really a serif went in, and "italic anywhere in the document"
     * stayed. So it went on firing on body text. Handed a wall of marks drawn in the deck's own
     * serif grounds it flagged five of eight, and the thing it was pointing at on the field guide
     * was `.binomial` at one rem, an italic species name, which is what a field guide is for and
     * what that ground's own chain asks for in writing.
     *
     * A rule with a rendered word for it is a rule that fights the deck, so the italic now has to
     * be on something display sized: a heading, or type set large enough that it is the headline
     * whatever it is called. Two conditions again, on the same reasoning as the entry above.
     */
    const display = String(page.taste?.display ?? '').replace(/sans-serif/gi, '')
    const bigItalic = [...html.matchAll(/([^{}]+)\{([^{}]*font-style:\s*italic[^{}]*)\}/gi)].some(([, sel, body]) => {
      if (/\bh[12]\b/i.test(sel)) return true
      /**
       * The largest length this rule sets type at, in rem, so a clamp is read by its ceiling.
       *
       * The lookbehind is load bearing. Written without it, the leading digits of a decimal with no
       * zero in front of it are read as a whole number: .56rem matched as 56rem, so an italic agate
       * mark measured fifty six rem and tripped a rule about headlines. Css is full of .5 and .75,
       * so this was not an edge case, it was most of them.
       */
      const sizes = [...body.matchAll(/(?<![\d.])(\d*\.?\d+)(rem|px)\b/gi)]
        .map(([, n, unit]) => (unit.toLowerCase() === 'px' ? Number(n) / 16 : Number(n)))
      return /font-size/i.test(body) && Math.max(0, ...sizes) >= 1.6
    })
    if (/serif/i.test(display) && bigItalic) {
      add('design', 'italic-serif', 'italic serif display',
        'It is the fastest way to look editorial, which is why it now reads as a template.')
    }

    // the 2026 signature, and only when all three are present: see the note on the helpers above
    const ground = hslOf(String(page.taste?.bg ?? ''))
    const ink = hslOf(String(page.taste?.accent ?? ''))
    if (ground && ink && isCream(ground) && isRust(ink) && /serif/i.test(display)) {
      add('design', 'cream-and-rust', 'cream ground, terracotta accent, serif display',
        'Those three together are the current house style of generated design, so a page wearing '
        + 'all of them reads as machine made however well each one is done. Any one of the three is '
        + 'fine: change the one you care about least.')
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

/**
 * The flags a page has, phrased as instructions, for feeding back into the next prompt.
 *
 * One line per pattern rather than one per place it occurs. Flags are collected per section so
 * the dock can point at the paper, and a prompt does not want that: a page with the same stand-in
 * under two testimonials was sending the same sentence and the same reason twice, which reads to
 * a model as emphasis it was never meant to carry, and grows with the page.
 */
export function slopBrief(flags: Flag[]): string {
  const once = [...new Map(flags.map((f) => [f.label, f])).values()]
  if (!once.length) return ''
  return [
    'Avoid these specific patterns, which the current draft trips:',
    ...once.map((f) => `- ${f.label}. ${f.why}`),
  ].join('\n')
}
