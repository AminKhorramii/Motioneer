/**
 * Slop detection.
 *
 * Named after the patterns catalogued at impeccable.style: the defaults a model reaches for
 * when it has nothing specific to say. Every check runs locally on the page model and the
 * rendered HTML, so it costs nothing, runs on all eight papers at once, and can therefore be
 * fed back into the next prompt rather than only shown after the fact.
 *
 * A flag is never fatal. It names the pattern and says why it reads as generic, because the
 * point is to give the writer something specific to change, and sometimes the right answer is
 * to keep it.
 */

import type { Page } from '@/sections'

export interface Flag {
  id: string
  /** the pattern, named the way a designer would name it */
  label: string
  /** why it reads as generic, which is what a model needs in order to avoid it */
  why: string
  section?: string
}

const HOLLOW = /\b(revolutionary|seamless|unlock|empower|transform|elevate|effortless|powerful|cutting[- ]edge|game[- ]?chang\w*|supercharge|unleash|next[- ]generation|leverage|streamline|robust|innovative|best[- ]in[- ]class|world[- ]class)\b/i
const GENERIC_CTA = /^(get started|start free|learn more|sign up|try it now|get started free|start now|join now|contact us)$/i
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
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
  const add = (id: string, label: string, why: string, section?: string) => {
    if (!flags.some((f) => f.id === id && f.section === section)) flags.push({ id, label, why, section })
  }

  for (const { section, key, value } of text(page)) {
    const hollow = value.match(HOLLOW)
    if (hollow) {
      add('hollow-word', `hollow word: ${hollow[0].toLowerCase()}`,
        'It describes nothing, so a reader cannot tell what the product does from it.', section)
    }
    if (EMOJI.test(value)) {
      add('emoji', 'emoji in the copy',
        'It stands in for a tone the words are not carrying on their own.', section)
    }
    if (key === 'cta' && GENERIC_CTA.test(value.trim())) {
      add('generic-cta', `generic call to action: ${value}`,
        'It names no outcome, so it reads as a button rather than an offer.', section)
    }
  }

  const hero = page.sections.find((s) => s.kind === 'hero' && s.on)
  const headline = typeof hero?.content.headline === 'string' ? hero.content.headline : ''
  if (headline) {
    const words = headline.trim().split(/\s+/)
    const specific = /\d/.test(headline) || words.some((w) => /^[A-Z]/.test(w.slice(0, 1)) && w.length > 2)
    if (!specific && words.length > 7) {
      add('vague-headline', 'vague headline',
        'It carries no number, no name and no concrete noun, so it could sit on any product.',
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
    // These checks exist because the model now writes CSS. Parameters could not produce an
    // unreadable page, but hand written CSS can, and these are the ways it usually does.
    const body = html.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) ?? []
    if (body.some((d) => Number(d.replace(/\D+/g, '')) < 14)) {
      add('tiny-text', 'text under 14px',
        'It looks refined on a designer\'s screen and is unreadable on everyone else\'s.')
    }
    if (/background-clip:\s*text|-webkit-background-clip:\s*text/.test(html)) {
      add('gradient-text', 'gradient filled text',
        'It is the decoration a page reaches for when the words are not carrying it.')
    }
    if (/\bp\s*\{[^}]*text-transform:\s*uppercase/.test(html)) {
      add('shouting-body', 'body copy in capitals',
        'Capitals remove the word shapes people read by, so a paragraph becomes a wall.')
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
    if (/@keyframes[^}]*}[^}]*}/.test(html) && /border-radius:\s*50%/.test(html) && /animation:/.test(html)) {
      add('pulsing-dot', 'a pulsing dot',
        'A small thing blinking forever takes attention it never gives back.')
    }
    if (/backdrop-filter/.test(html)) {
      add('glassmorphism', 'glassmorphism',
        'Frosted panels read as a period effect rather than a decision, and they cost contrast.')
    }
    if (/box-shadow:\s*0 4px 6px|0 1px 3px rgba\(0,\s*0,\s*0,\s*0?\.1\)/.test(html)) {
      add('generic-shadow', 'default drop shadow',
        'It is the framework default, so it adds depth without saying anything about the product.')
    }
    if (/font-style:\s*italic/.test(html) && /serif/.test(html)) {
      add('italic-serif', 'italic serif display',
        'It is the fastest way to look editorial, which is why it now reads as a template.')
    }
    const cards = (html.match(/class="card/g) ?? []).length
    if (/class="card[^"]*"[^>]*>(?:(?!<\/)[\s\S]){0,400}?class="card/.test(html)) {
      add('nested-cards', 'cards inside cards',
        'Two borders around the same content divide attention without adding structure.')
    }
    if (cards >= 6) {
      add('card-soup', `${cards} cards on one page`,
        'When everything is boxed, nothing is emphasised, and the page reads as a list of tiles.')
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
