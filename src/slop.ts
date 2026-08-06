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
import { COPY_TELLS, MARKUP_TELLS } from '@/design/slop'

export interface Flag {
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
  const add = (id: string, label: string, why: string, section?: string) => {
    if (claimed.has(id)) return
    if (!flags.some((f) => f.id === id && f.section === section)) flags.push({ id, label, why, section })
  }

  for (const { section, key, value } of text(page)) {
    const v = value.trim()
    for (const tell of COPY_TELLS) {
      if (tell.key && tell.key !== key) continue
      const m = v.match(tell.find)
      if (m) add(tell.id, tell.label(m[0]), tell.why, section)
    }
  }

  // an em dash is the punctuation a model leans on for energy it did not earn in the words,
  // and more than one on a page is a tell rather than a choice
  const dashes = text(page).reduce((n, f) => n + (f.value.match(/—/g)?.length ?? 0), 0)
  if (dashes >= 2) {
    add('em-dashes', `${dashes} em dashes`,
      'Chained asides read as generated writing now, where a full sentence would carry the point.')
  }

  // three bare figures make a stat banner, which asks to be admired rather than believed
  const bares = text(page).filter((f) => /^[\d,.]+\s*(?:%|[kKmMbB]\+?|x|×|\+)$/.test(f.value.trim())).length
  if (bares >= 3) {
    add('stat-banner', 'a row of big statistics',
      'A number outside a sentence says nothing about what it cost or saved, so the row decorates rather than argues.')
  }

  const hero = page.sections.find((s) => s.role === 'claim' && s.on)
  const headline = typeof hero?.content.headline === 'string' ? hero.content.headline : ''
  if (headline) {
    const words = headline.trim().split(/\s+/)
    const specific = /\d/.test(headline) || words.some((w) => /^[A-Z]/.test(w.slice(0, 1)) && w.length > 2)
    if (!specific && words.length > 7) {
      add('vague-headline', 'vague headline',
        'It carries no number, no name and no concrete noun, so it could sit on any product.',
        hero?.id)
    }
    if (/\?\s*$/.test(headline.trim()) || /^(?:tired of|struggling|still|ready to|what if|why settle)\b/i.test(headline.trim())) {
      add('rhetorical-headline', 'a headline that asks',
        'A question the page answers itself spends the headline warming up, where the answer would have been the headline.',
        hero?.id)
    }
  }
  const eyebrow = typeof hero?.content.eyebrow === 'string' ? hero.content.eyebrow : ''
  if (eyebrow && eyebrow.length < 40 && /^(for|the|your|built for|made for)\b/i.test(eyebrow)) {
    add('hero-eyebrow-chip', 'hero eyebrow chip',
      'A small label above the headline is the most reached for hero decoration, and it usually repeats what the headline already says.',
      hero?.id)
  }

  if (typeof page.taste?.bg === 'string' && AI_BEIGE.test(page.taste.bg)) {
    add('ai-beige', 'ai beige background',
      'It is the off-white a model picks when no palette was chosen, and it dates a page immediately.')
  }

  if (html) {
    for (const tell of MARKUP_TELLS) {
      if (tell.find.every((r) => r.test(html))) add(tell.id, tell.label, tell.why)
    }
    // The counted checks. These exist because the model writes CSS: parameters could not
    // produce an unreadable page, but hand written CSS can, and these are the ways it does.
    const body = html.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) ?? []
    if (body.some((d) => Number(d.replace(/\D+/g, '')) < 14)) {
      add('tiny-text', 'text under 14px',
        "It looks refined on a designer's screen and is unreadable on everyone else's.")
    }
    if ((html.match(/box-shadow:/g) ?? []).length > 8) {
      add('shadow-stack', 'shadows on everything',
        'When every block floats, nothing is above anything, and the depth stops meaning anything.')
    }
    const faces = new Set((html.match(/font-family:\s*([^;}]+)/g) ?? []).map((f) => f.split(',')[0]))
    if (faces.size > 3) {
      add('face-soup', `${faces.size} typefaces`,
        'Two faces is a system and four is an accident, since each one asks the reader to adjust.')
    }
    const cards = (html.match(/class="card/g) ?? []).length
    if (cards >= 6) {
      add('card-soup', `${cards} cards on one page`,
        'When everything is boxed, nothing is emphasised, and the page reads as a list of tiles.')
    }
    // the macOS traffic lights, drawn rather than captured. Two of the three hexes together is
    // the signature of a mocked terminal, in either of the shades the mockups circulate in.
    const dots = ['ff5f5', 'ffbd2e', 'febc2e', '27c93f', '28c840'].filter((c) => html.toLowerCase().includes(c))
    if (dots.length >= 2) {
      add('terminal-dots', 'a drawn terminal window',
        'The three little circles promise a real window and deliver a picture of one, which is the gap between a screenshot and a prop.')
    }
    if ((html.match(/border-radius:\s*(?:2[89]|[3-9]\d)px/g) ?? []).length >= 3) {
      add('over-rounding', 'over-rounded corners',
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
