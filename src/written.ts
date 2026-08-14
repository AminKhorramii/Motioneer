/**
 * A page the model wrote whole, rather than one arranged from roles and forms.
 *
 * Everything else here arranges. A world picks values, the renderer assembles blocks, and the
 * model chooses between forms somebody already enumerated: eight roles, twelve blocks and about
 * fifteen knobs. That is a box rather than a space, which is the ceiling worlds.ts admits to in
 * its own opening paragraph, and no amount of prompting moves it because the shape of the answer
 * is fixed before the question is asked.
 *
 * This is the other end of that. The model is handed the tokens, the faces and one direction, and
 * writes the markup and the styles itself. Nothing about the page is true by construction any
 * more, so everything has to be proved instead: the markup is filtered to an allowlist, the styles
 * go through the same kind of clamp a world's CSS does, and the detector and the ruler then run
 * over the result exactly as they run over an arranged page.
 *
 * It sits beside the arranged page rather than replacing it. Which of the two is better is
 * precisely the question a wall exists to answer, so the answer is eight papers and a cull rather
 * than an opinion held in advance.
 */

import { BACKDROPS, type Backdrop } from '@/backdrop'

/** the tags a landing page is allowed to be made of. Anything that can fetch or execute is absent
    rather than filtered, because a page is a single file that makes no requests, and because the
    frame it renders in shares this app's origin and its stored keys */
const TAGS = new Set([
  'section', 'div', 'header', 'footer', 'main', 'article', 'aside', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'small', 'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'figure', 'figcaption', 'img', 'blockquote', 'cite', 'q',
  'hr', 'br', 'label', 'time', 'mark', 'code', 'pre', 'abbr', 'sup', 'sub',
])

/** and the attributes they may carry. style is here because it is CSS, which is the point */
const ATTRS = new Set([
  'class', 'id', 'style', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan',
  'width', 'height', 'datetime', 'role', 'aria-label', 'aria-hidden', 'lang', 'dir',
])

/**
 * Where a value is allowed to point, which is not the same question for the two attributes.
 *
 * A link is somewhere the reader chooses to go, so an ordinary https address is exactly right. A
 * source is something the page fetches on load whether anybody wanted it or not, so an https one
 * is a request, and a page that makes a request is not one file any more. The same address is
 * fine in the first and a tracking pixel in the second, which is why one pattern for both was
 * wrong: it let an image straight through.
 */
const SAFE_HREF = /^(?:#|mailto:|tel:|https:\/\/|\/)/i
const SAFE_SRC = /^data:image\/(?:png|jpe?g|gif|webp|avif);/i

/**
 * Keep model authored markup to markup.
 *
 * An allowlist rather than a denylist, because a denylist is a list of the attacks somebody
 * thought of. Two things make this load bearing rather than tidy. A shipped page is one file that
 * makes no requests, so anything with a remote source breaks the promise the whole product rests
 * on. And the frame a paper renders in carries allow-scripts with allow-same-origin, which
 * together are not a sandbox at all: a script here would run against this app's origin, where the
 * keys are. So script never survives, in a tag, in an attribute or in a url.
 *
 * Unknown tags are unwrapped rather than dropped, so a page that reaches for something outside the
 * list loses the tag and keeps its words. The three that can execute are dropped whole, contents
 * and all, because their contents are the payload.
 */
export function safeMarkup(raw: unknown): string {
  let html = String(raw ?? '')
  if (!html.trim()) return ''
  // contents and all: what is inside these is the thing being removed
  html = html.replace(/<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
  // and the same tags left unclosed, which a truncated reply produces
  html = html.replace(/<\/?(?:script|style|iframe|object|embed|template|noscript|svg|math|link|meta|base|form|input|select|textarea)\b[^>]*>/gi, '')
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  return html.replace(/<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (_all, close: string, name: string, attrs: string) => {
    const tag = name.toLowerCase()
    // not on the list: lose the tag, keep the words it was wrapped around
    if (!TAGS.has(tag)) return ''
    if (close) return `</${tag}>`
    const kept: string[] = []
    for (const m of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      const key = m[1].toLowerCase()
      const value = m[2] ?? m[3] ?? m[4] ?? ''
      if (!ATTRS.has(key)) continue
      // every event handler is an on- prefix, and every one of them is script
      if (key.startsWith('on')) continue
      if (key === 'href' && !SAFE_HREF.test(value.trim())) continue
      if (key === 'src' && !SAFE_SRC.test(value.trim())) continue
      if (key === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*(?:https?:|\/\/)|javascript:/i.test(value)) continue
      kept.push(`${key}="${value.replace(/"/g, '&quot;')}"`)
    }
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}>`
  })
}

/**
 * The same discipline for the styles, which is the clamp madeWorld already applies to a world's
 * CSS. A page that reaches the network for a font or an image is not one file any more, and that
 * is the promise a shipped page is built on rather than a preference about tidiness.
 */
export function safeStyle(raw: unknown): string {
  const css = String(raw ?? '')
  if (!css.trim() || css.includes('</')) return ''
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*['"]?\s*(?:https?:|\/\/)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
    .replace(/javascript:/gi, '')
    .slice(0, 12000)
}

/**
 * The words on a written page, for the detector to read.
 *
 * A written page keeps its sections so the brief and the handoff have something to describe, and
 * those sections still hold the defaults nobody rewrote. Reading them would judge a page on copy
 * that is not on it: the first written page rendered end to end reported six copy tells, every one
 * of them from a placeholder section the reader could not see.
 *
 * Tags are dropped rather than parsed, because this feeds a catalogue of phrases and not a layout.
 * The key goes out empty, so the tells scoped to a field, a call to action, a witness, a logo row,
 * do not fire here: those name a slot in the arranged model and a written page has no slots. That
 * is a real gap in the gate, and narrowing it means asking the model to mark its own attribution,
 * which is a change to the prompt rather than to this.
 */
export const wordsIn = (written: Written): string[] =>
  written.html
    // one entry per text node rather than per word, because the catalogue matches phrases and
    // several of its tells are anchored to a whole line
    .split(/<[^>]*>/)
    .map((s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

export interface Written {
  /** the body markup, filtered */
  html: string
  /** the styles that came with it */
  css: string
  /** what the model says it made, so the dock can name it the way it names a world */
  note: string
  /**
   * The art behind the page, chosen rather than inherited.
   *
   * A written page borrows its look from the place on the wall it landed in, and the backdrop came
   * with it, so a page designed as a printed thing could end up over a live gradient it never
   * asked for. This is the one part of the visual system the model could not reach and the
   * cheapest to hand over: it costs no markup and the drawing is already written.
   */
  backdrop?: Backdrop
}

/**
 * Read a model's reply into a page, or refuse it.
 *
 * A landing page has a headline. That is the one structural claim worth making about a document
 * nobody arranged, and it is the difference between a page and a paragraph: without it there is
 * nothing for the wall to compare, nothing for the brief to lead on, and the suites that read one
 * headline per paper would be reading an empty string. A reply that cannot manage it is refused,
 * and the wall falls back to an arranged page in that place rather than showing a hole.
 */
export function madeWritten(raw: Record<string, unknown>): Written | null {
  const html = safeMarkup(raw.html)
  if (!/<h1[\s>]/i.test(html)) return null
  const backdrop = BACKDROPS.includes(raw.backdrop as Backdrop) ? (raw.backdrop as Backdrop) : undefined
  return {
    html,
    css: safeStyle(raw.css),
    note: String(raw.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    ...(backdrop ? { backdrop } : {}),
  }
}
