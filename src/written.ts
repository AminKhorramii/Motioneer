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
  /**
   * The one attribute that is here for the detector rather than for the page.
   *
   * Half the copy catalogue is scoped to a field: a call to action, a witness, the employer under
   * a quote, a row of logos. An arranged page has those fields because the page model has slots.
   * A written page has markup, so none of those tells could fire on it, and the wall became all
   * written pages: the same fabricated testimonial that trips three checks on an arranged page was
   * clean on a written one. This is the model naming its own slots, and it costs one attribute.
   */
  'data-k',
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
export const wordsIn = (written: Written): { key: string; value: string }[] => {
  const out: { key: string; value: string }[] = []
  let key = ''
  // one pass, carrying the nearest data-k down to the text it wraps and dropping it at the close.
  // Text nodes rather than words, because the catalogue matches phrases and several of its tells
  // are anchored to a whole line.
  for (const m of written.html.matchAll(/<([^>]*)>|([^<]+)/g)) {
    if (m[1] !== undefined) {
      key = m[1].startsWith('/') ? '' : /data-k\s*=\s*"([^"]*)"/.exec(m[1])?.[1] ?? key
      continue
    }
    const value = m[2].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    if (value) out.push({ key, value })
  }
  return out
}

export interface Written {
  /** the body markup, filtered */
  html: string
  /** the styles that came with it */
  css: string
  /** what the model says it made, so the dock can name it the way it names a world */
  note: string
  /**
   * The real object it built from, when it refused the one it was dealt.
   *
   * Absent normally, because the caller already knows what it handed over. Present when the call
   * declined that ground as untrue to the subject and built from another, and then this is what
   * the memory has to record: filing the page under the object it deliberately did not use would
   * teach a preference for a ground no page here was ever built from.
   */
  ground?: string
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
/**
 * The shapes a page draws with, as opposed to the ones it merely lays out with.
 *
 * Padding, borders, flex and grid arrange things. These make something that was not there: a
 * gradient with stops is a disc or a stripe or a halftone, a clip-path is a cut edge, a blend mode
 * is two inks overprinting, and a pseudo element is where all of it hangs without touching the
 * markup. A page built only from the first list has laid out its words, which is not the same as
 * having drawn anything.
 */
const DRAWS = /(?:repeating-)?(?:linear|radial|conic)-gradient|clip-path|mix-blend-mode|::(?:before|after)/i

/**
 * And whether the drawn thing was given room to be looked at.
 *
 * An illustration the size of a paragraph reads as an icon, and an icon is decoration, which is
 * the failure the instruction names explicitly. This is an approximation and says so: a shape with
 * proportions, or a size expressed against the viewport, or a length large enough that nothing
 * incidental is that big. It cannot tell a large drawing from a large empty box, so it is a floor
 * rather than a judgement.
 */
const SIZED = /aspect-ratio|\d{2,}v[wh]|clamp\([^)]*v[wh]|(?:[1-9]\d|\d{3,})rem/i

/**
 * What a written page did not draw.
 *
 * Every design call is asked to draw the object its ground names, and until now nothing checked
 * whether any of them did. That is the shape of failure this codebase keeps finding: a promise in
 * a prompt with no gate behind it, in a repository whose own note says written guidance increases
 * slop and mechanical gates reverse it. The wall is written pages now, so this is the whole wall.
 *
 * Two faults rather than one, because they want different repairs: a page with no drawing needs
 * one, and a page whose drawing is the size of a bullet needs it given room.
 */
export function undrawn(written: Written): string[] {
  if (!DRAWS.test(written.css)) {
    return ['nothing on this page is drawn. Every rule here arranges words, and the object the ground '
      + 'names does not appear, so the page could be about anything.']
  }
  if (!SIZED.test(written.css)) {
    return ['something is drawn and nothing was given room to be seen. An illustration the size of a '
      + 'paragraph reads as an icon, and an icon is decoration rather than the subject.']
  }
  return []
}

/**
 * Read a reply into a mark, which is a page's opposite in the one way that matters.
 *
 * A page is refused when it has no headline, because a landing page without one is a paragraph.
 * A mark has no headline at all and is refused when it does not draw, for the same reason turned
 * around: a mark that only lays type out is a caption. So the structural claim moves from the
 * markup to the styles, and it is the check the whole thing exists to pass rather than a gate
 * bolted on afterwards.
 *
 * Everything else is shared with a written page on purpose. The same allowlist stands between this
 * markup and the app's origin, the same clamp keeps the styles from reaching the network, and the
 * same detector reads the result. A mark is a written page with a different job, not a second kind
 * of thing needing a second set of defences.
 */
/**
 * What a mark asked to move did not do, which is the drawing gate one axis along.
 *
 * undrawn asks whether a page drew and whether it drew at size. This asks whether a thing moves and
 * whether it moves as a mechanism, and the second half is the one that matters: sliding or fading a
 * finished picture is a transition, and a transition is what every generated interface already does.
 *
 * The measure is staggering, and it is not a guess. Across six moving marks the count of
 * animation-delay predicted the verdict before any of them were looked at: the till roll printing a
 * line at a time carried eleven and was the best of them, the riso seal being cancelled carried
 * nine, and the one that barely moved carried none. Things happening at slightly different times
 * read as mechanism; things happening at once read as a slideshow. That is a real distinction and
 * it happens to be countable.
 *
 * A keyframe on its own is not enough and a keyframe count is not the measure either, because one
 * long keyframe moving a wrapper scores the same as twenty moving parts.
 */
const MOVES = /@keyframes/i
const STAGGER = /animation-delay\s*:|animation\s*:[^;}]*?\b\d*\.?\d+m?s\b[^;}]*?\b\d*\.?\d+m?s\b/i
/** the transition on everything, which is the motion the catalogue already knows to distrust */
const BLANKET = /transition\s*:\s*all\b|\*\s*\{[^}]*transition/i

export function unmoved(written: Written): string[] {
  const out: string[] = []
  if (!MOVES.test(written.css)) {
    out.push('nothing on this mark moves. It was asked for movement and came back a still, so the '
      + 'whole point of the call was not paid for.')
    return out
  }
  if (!STAGGER.test(written.css)) {
    out.push('everything moves at once, which is a transition rather than a mechanism. Stagger the '
      + 'parts with animation-delay so the drawing assembles itself instead of arriving whole: an '
      + 'object that prints, flips or comes into register does those things to its parts in order.')
  }
  if (BLANKET.test(written.css)) {
    out.push('a transition on everything, which is the house style of every generated interface. '
      + 'Move the few things that carry the idea and let the rest hold still.')
  }
  return out
}

/**
 * Selectors that will stop working the next time somebody edits the component.
 *
 * Handed a component written in utility classes, the first thing a model reaches for is the whole
 * stack of them: `.flex.w-72.flex-col.gap-3.rounded-lg.border.bg-card.p-3 > div.flex.flex-col.gap-2
 * > article`. That matches today and it is pinned to every layout decision in the markup, so
 * changing gap-3 to gap-4 silently stops the motion and reports nothing. In a codebase where those
 * classes change weekly it is broken on arrival, and worse, it fails quietly.
 *
 * Three chained classes with no combinator between them is the tell. One or two can be deliberate
 * (`.card.is-open`), and a utility stack is never fewer than three. The answer the prompt asks for
 * instead is one scoping attribute on the root and structure underneath it, which survives any
 * edit that does not change the shape of the component.
 */
export function brittle(css: string): string[] {
  const chained = [...css.matchAll(/(?:^|[\s,>+~{}])((?:\.[-\w]+){3,})(?=[\s,>+~{:]|$)/g)]
    .map((m) => m[1])
  if (!chained.length) return []
  return [`the selectors are pinned to the component's utility classes, starting with ${chained[0].slice(0, 60)}. `
    + 'That matches today and stops matching the first time somebody changes a spacing or a width, '
    + 'silently. Scope to the attribute you were asked to name and reach the parts by structure.']
}

/**
 * Which attribute a motion sheet actually hangs on, read from the sheet rather than from the label.
 *
 * A motion reply carries the css and, beside it, the name of the attribute the caller is supposed to
 * put on the component. Trusting that field is a mistake with a nasty shape: when it comes back empty
 * or names a different attribute than the selectors do, nothing ever gets the attribute, every rule
 * matches nothing, and the component renders perfectly still. Nothing else here catches it. The css
 * has keyframes, it staggers them, it is not pinned to utility classes, so unmoved and brittle both
 * pass it. It is only wrong about what it is attached to, and the failure appears at render, one
 * layer past everything that was watching.
 *
 * The selectors are what the sheet needs, so they decide. The declared name is used only to pick when
 * the sheet names more than one, and a sheet that names no attribute at all is left alone, because it
 * is reaching elements directly and will apply either way.
 */
/**
 * Motion that makes the browser lay the page out again on every frame.
 *
 * A keyframe that moves width, height, top or margin is asking for the whole page to be measured
 * sixty times a second, and on anything the size of a dashboard that is where dropped frames come
 * from. Transform and opacity are the two the compositor can do on its own, and every effect these
 * keyframes actually want has a transform spelling: a bar that fills is scaleX from a
 * transform-origin, a panel that grows is scale, a row that slides in is translate. The visual result
 * is the same and the cost is not.
 *
 * Only properties inside @keyframes are judged. A static rule setting a width is layout, which is the
 * component's own business and none of this gate's.
 */
const HEAVY = /(?:^|[;{\s])(width|height|top|left|right|bottom|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|font-size|line-height|flex-basis|gap|border-width)\s*:/gi

export function janky(css: string): string[] {
  const frames = [...css.matchAll(/@keyframes[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/gi)].map((m) => m[1])
  const found = new Set<string>()
  for (const body of frames) for (const [, prop] of body.matchAll(HEAVY)) found.add(prop.toLowerCase())
  if (!found.size) return []
  const named = [...found].slice(0, 3).join(', ')
  return [`the keyframes animate ${named}, which makes the browser lay the page out again on every `
    + 'frame and is where dropped frames come from on anything the size of a dashboard. Every one of '
    + 'these has a transform spelling that looks identical and costs nothing: a bar that fills is '
    + 'scaleX with a transform-origin, a thing that grows is scale, a thing that moves is translate.']
}

export function scopeOf(css: string, declared?: unknown): string {
  const used = [...css.matchAll(/\[(data-[-\w]+)\]/g)].map((m) => m[1])
  const said = String(declared ?? '').replace(/[^-\w]/g, '').slice(0, 40)
  if (said && used.includes(said)) return said
  return used[0] ?? ''
}

export function madeMark(raw: Record<string, unknown>): Written | null {
  const css = safeStyle(raw.css)
  if (!DRAWS.test(css)) return null
  const html = safeMarkup(raw.html)
  if (!html.trim()) return null
  const backdrop = BACKDROPS.includes(raw.backdrop as Backdrop) ? (raw.backdrop as Backdrop) : undefined
  const ground = String(raw.ground ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return {
    html,
    css,
    note: String(raw.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    ...(ground ? { ground } : {}),
    ...(backdrop ? { backdrop } : {}),
  }
}

export function madeWritten(raw: Record<string, unknown>): Written | null {
  const html = safeMarkup(raw.html)
  if (!/<h1[\s>]/i.test(html)) return null
  const backdrop = BACKDROPS.includes(raw.backdrop as Backdrop) ? (raw.backdrop as Backdrop) : undefined
  const ground = String(raw.ground ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return {
    html,
    css: safeStyle(raw.css),
    note: String(raw.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    ...(ground ? { ground } : {}),
    ...(backdrop ? { backdrop } : {}),
  }
}
