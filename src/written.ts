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


export interface Written {
  /** the body markup, filtered */
  html: string
  /** the styles that came with it */
  css: string
  /** what the model says it made, so the dock can name it the way it names a world */
  note: string
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

/**
 * @param parts whether this movement is supposed to have parts arriving in order.
 *
 * Stagger is the difference between mechanism and slideshow when several things are arriving, and it
 * is meaningless when they are not. A motion whose job is to single out one figure, or to keep a
 * badge alive, or to acknowledge a press, has exactly one thing moving on purpose, and demanding a
 * second delay from it produces movement invented to satisfy a check.
 *
 * That is not hypothetical. Asked for five motions on a bar chart with the errand varied every time,
 * all five still came back as staggered entrances, because this gate and the prompt together left no
 * other kind of answer standing. Defaults to true, so every existing caller is unchanged.
 */
export function unmoved(written: Written, { parts = true }: { parts?: boolean } = {}): string[] {
  const out: string[] = []
  if (!MOVES.test(written.css)) {
    out.push('nothing on this mark moves. It was asked for movement and came back a still, so the '
      + 'whole point of the call was not paid for.')
    return out
  }
  if (parts && !STAGGER.test(written.css)) {
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

/**
 * Changing how a motion is executed without asking for it again.
 *
 * Every adjustment somebody wants to make after seeing an option is arithmetic on numbers that are
 * already in the sheet: slower, more space between the parts, land harder. Going back to the model
 * for that costs ten seconds, returns something that is not quite the thing you liked, and cannot be
 * undone. None of it needs a model at all.
 *
 * Durations and delays are separated rather than scaled together, because they are different
 * decisions: a slower move is not the same as a longer wait between moves, and confusing the two is
 * why "make it slower" usually ruins a stagger. The shorthand is the fiddly case, since
 * `animation: rise 420ms 40ms both` gives duration then delay in that order and both look alike, so
 * the times inside a shorthand are counted rather than pattern matched.
 */
export interface Retime { duration?: number; stagger?: number; ease?: string }

const TIME = /(\d*\.?\d+)(ms|s)/g
const scale = (value: string, by: number) => {
  const n = parseFloat(value)
  const ms = /ms$/.test(value) ? n : n * 1000
  const out = Math.max(0, Math.round(ms * by))
  return `${out}ms`
}

export function retimed(css: string, { duration = 1, stagger = 1, ease }: Retime = {}): string {
  // asking for nothing returns the sheet untouched rather than a reformatted copy of it, so a caller
  // can hand every option through here without wondering whether it changed something
  if (duration === 1 && stagger === 1 && !ease) return css
  let out = css

  // the explicit properties first, where there is no ambiguity about which is which
  out = out.replace(/animation-duration:\s*([^;}]+)/gi,
    (_a, v: string) => 'animation-duration: ' + v.replace(TIME, (t) => scale(t, duration)))
  out = out.replace(/animation-delay:\s*([^;}]+)/gi,
    (_a, v: string) => 'animation-delay: ' + v.replace(TIME, (t) => scale(t, stagger)))

  // then the shorthand, where the first time is the duration and the second is the delay
  out = out.replace(/(^|[;{\s])animation:\s*([^;}]+)/gi, (_all, lead: string, body: string) => {
    let seen = 0
    const moved = body.replace(TIME, (t) => scale(t, ++seen === 1 ? duration : stagger))
    return `${lead}animation: ${moved}`
  })

  if (ease) {
    // a named curve, a bezier or a steps call, all of which sit where a timing function goes
    out = out.replace(/cubic-bezier\([^)]*\)|steps\([^)]*\)|\b(?:ease-in-out|ease-in|ease-out|ease|linear)\b/gi,
      () => ease)
  }
  return out
}

/**
 * The shape of a motion, measured rather than described.
 *
 * MOTION_SYSTEM asks for six things by name: a reduced-motion wrapper, parts that move for 240 to
 * 520ms, consecutive parts 40 to 90ms apart, the whole thing over inside 1.4 seconds, no blank first
 * frame, and transform and opacity only. Four of those six were prose with nothing behind them, and
 * this repository already learned that lesson once: prose changed a palette count from six to five,
 * and turning the same intent into values changed it to thirty-nine.
 *
 * These are measurements, not verdicts. What counts as too slow depends on what the model actually
 * produces, and a gate calibrated against an imagined distribution is how you end up rejecting a
 * field guide for the italics its own subject requires.
 */
export interface Tempo {
  durations: number[]
  gaps: number[]
  span: number
  stillness: 'wrapped' | 'guarded' | 'ignored'
  paints: string[]
}

const asMs = (raw: string) => {
  const n = parseFloat(raw)
  return /ms\s*$/.test(raw) ? n : n * 1000
}

export function tempo(css: string): Tempo {
  const times = (re: RegExp, pick: number) =>
    [...css.matchAll(re)].map((m) => asMs(m[pick])).filter((n) => Number.isFinite(n) && n > 0)

  // the shorthand gives duration then delay in that order, so they are counted rather than guessed
  const shorthand = [...css.matchAll(/animation:\s*([^;}]+)/gi)].map((m) => m[1])
  const shortDur: number[] = []
  const shortDelay: number[] = []
  for (const body of shorthand) {
    const found = [...body.matchAll(/(\d*\.?\d+)\s*(ms|s)\b/g)].map((m) => asMs(m[1] + m[2]))
    if (found[0] !== undefined) shortDur.push(found[0])
    if (found[1] !== undefined) shortDelay.push(found[1])
  }
  const durations = [...times(/animation-duration:\s*(\d*\.?\d+\s*m?s)/gi, 1), ...shortDur]
    .filter((d) => d >= 16)
  const delays = [...new Set([...times(/animation-delay:\s*(\d*\.?\d+\s*m?s)/gi, 1), ...shortDelay]
    .map((d) => Math.round(d)))].sort((a, b) => a - b)
  const gaps = delays.slice(1).map((d, i) => d - delays[i]).filter((g) => g > 0)
  const span = (delays.length ? Math.max(...delays) : 0) + (durations.length ? Math.max(...durations) : 0)

  /**
   * Three postures towards somebody who asked for stillness, and only one of them is wrong.
   * Everything inside a no-preference block is the shape the prompt asks for; a reduce block that
   * turns animation off is the same promise written the other way round. Neither present means the
   * component moves for a reader who asked it not to, which is an accessibility fault rather than a
   * matter of taste.
   */
  const wrapped = /@media[^{]*prefers-reduced-motion\s*:\s*no-preference/i.test(css)
  const guarded = /@media[^{]*prefers-reduced-motion\s*:\s*reduce/i.test(css)
  const paints = [...new Set([...css.matchAll(/@keyframes[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/gi)]
    .flatMap((m) => [...m[1].matchAll(/([a-z-]+)\s*:/gi)].map((d) => d[1].toLowerCase())))]

  return {
    durations, gaps, span,
    stillness: wrapped ? 'wrapped' : guarded ? 'guarded' : 'ignored',
    paints,
  }
}

/** the one part of the shape that is not a matter of degree: it either respects stillness or it does not */
export function unstill(css: string): string[] {
  if (tempo(css).stillness !== 'ignored') return []
  return ['nothing here is wrapped in a prefers-reduced-motion query, so this moves for somebody who '
    + 'has asked their machine not to move things. That is an accessibility fault rather than a matter '
    + 'of taste, and it is one media query.']
}

/**
 * Rules that would apply to the whole page this sheet is pasted into.
 *
 * MOTION_SYSTEM asks for every selector to start from the scope attribute, and nothing checked it.
 * A sheet that also carries `.card { animation: ... }` looks fine in a preview, where the only card
 * on the page is the one being previewed, and then animates every card in the host application the
 * moment somebody pastes it. That is not a matter of taste: it is a stylesheet reaching outside the
 * component it was written for.
 *
 * Keyframe steps are skipped because `from`, `to` and `40%` are not selectors, and a sheet with no
 * scope at all is left to scopeOf, which has its own account of that.
 */
export function leaks(css: string, scope: string): string[] {
  if (!scope) return []
  const outside: string[] = []
  // strip the keyframe bodies first, or their steps read as unscoped selectors
  const flat = css.replace(/@keyframes[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/gi, '')
  for (const [, selector] of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const one of selector.split(',')) {
      const t = one.trim()
      if (!t || t.startsWith('@') || t.startsWith('%')) continue
      if (t.includes(`[${scope}]`)) continue
      outside.push(t.slice(0, 48))
    }
  }
  if (!outside.length) return []
  return [`${outside.length} selector${outside.length > 1 ? 's' : ''} here do not start from `
    + `[${scope}], beginning with ${outside[0]}. Pasted into a real page that applies to everything `
    + 'matching, not to this component, which is a stylesheet reaching outside what it was written for.']
}

/**
 * Keyframe names are global, so a sheet naming one `fade` redefines the host's `fade`.
 *
 * There is no scoping mechanism for @keyframes: the name is one flat namespace shared by every
 * stylesheet on the page. A motion sheet that defines `@keyframes slide` and gets pasted into an
 * application that already has a `slide` silently replaces it, and the thing that breaks is somewhere
 * else entirely. Nothing about that is visible in a preview, where this sheet is the only one.
 *
 * This renames rather than complains, because unlike an unscoped selector there is no ambiguity about
 * what was meant: the name is private to this sheet and only has to be unique. Both the definition
 * and every animation that references it move together, and a name that already carries the scope is
 * left alone so running this twice changes nothing.
 */
/** where the block opened at `from` closes, counting the ones nested inside it */
function balanced(css: string, from: number): number {
  let depth = 0
  for (let i = from; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') { depth -= 1; if (!depth) return i }
  }
  return css.length
}

/**
 * The typeface definitions out of a lifted sheet, and nothing else from it.
 *
 * A preview normally renders the computed-style snapshot instead of the matched rules, because the
 * snapshot cannot leak and the rules can. But a snapshot writes what the browser computed, and what
 * it computed for a typeface is a name: `font-family: Inter`. The thing that turns that name into a
 * typeface is an `@font-face` rule, which names no selector, so no snapshot can carry it and dropping
 * the sheet drops it. The component then renders in whatever the fallback is, which reads as the
 * capture having quietly lost its font somewhere between being picked and being given motion.
 *
 * So these come back on their own. They are safe to keep when the rest of the sheet is not, for the
 * same reason they are useless to a snapshot: a face rule styles nothing by itself and can only be
 * reached by a name something else already asked for.
 */
export function faceList(css: string): string[] {
  if (!css) return []
  const out: string[] = []
  for (let at = css.indexOf('@font-face'); at >= 0; at = css.indexOf('@font-face', at + 1)) {
    const open = css.indexOf('{', at)
    if (open < 0) break
    out.push(css.slice(at, balanced(css, open) + 1))
  }
  return out
}

export function typefaces(css: string): string {
  return faceList(css).join('\n')
}

/**
 * The same sheet with its face rules taken out, so somebody else can carry them.
 *
 * A rail gives every car its own copy of the sheet it was captured with, and a face rule is not
 * scoped to a car the way a selector is: thirty cars off the same app meant the same three typefaces
 * declared six hundred and ninety times. That costs nothing on a page, where a browser fetches each
 * url once however often it is named, and it costs everything in a frame, where the bytes are
 * embedded at every mention. Measured on thirty real captures: 28105kb of a 28805kb frame was three
 * fonts written out again and again.
 */
export function unfaced(css: string): string {
  if (!css) return ''
  let out = ''
  let at = 0
  for (let i = css.indexOf('@font-face'); i >= 0; i = css.indexOf('@font-face', at)) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    out += css.slice(at, i)
    at = balanced(css, open) + 1
  }
  return out + css.slice(at)
}

/**
 * A page's stylesheet, lifted out of that page and made safe to stand beside another one.
 *
 * The rules that matched a picked element arrive with the page they were on: `:root`, `html`, `body`,
 * `*, ::after, ::before`. In a frame those are still page rules and still mean the page, so a
 * component lifted off a light site repaints the studio's own dark frame white and takes its chrome
 * with it. Every site measured carries six of them.
 *
 * With one component that is untidy. With several it stops being cosmetic, because two sheets in one
 * document are two sites arguing: whichever comes last wins `body`, and a `.title` rule written for
 * one component quietly restyles the other. So every selector is walked into the car it belongs to,
 * and the page-level ones become the car itself, which keeps the font and the background they were
 * carrying without letting either escape the box it was picked into.
 *
 * Keyframe bodies are left alone: their steps are `from` and `50%` rather than selectors, and
 * prefixing one produces a percentage nothing can parse.
 */
const CONTAINER = /^(html|body|:root)$/i
export function grounded(css: string, scope: string): string {
  if (!scope || !css) return css || ''
  const put = (selector: string): string => selector.split(',').flatMap((one) => {
    const t = one.trim()
    if (!t) return []
    // already inside the car, and saying it twice only makes the selector longer
    if (t.includes(`[${scope}]`)) return [t]
    const head = t.split(/[\s>+~]/)[0]
    /* the page becomes the car. What those rules declare is worth keeping, because a font or a
       colour set on body is what the component was inheriting at the moment it was picked */
    if (CONTAINER.test(head)) {
      const rest = t.slice(head.length).trim()
      return [rest ? `[${scope}] ${rest}` : `[${scope}]`]
    }
    /**
     * Everything means the car and everything in it, which is two selectors and not one.
     *
     * A reset written as `*, ::after, ::before` is the commonest rule on the web and the descendant
     * form alone misses the car's own root, so the component that was picked is the one element the
     * reset stops reaching. That reads as one box laid out differently from its own children.
     */
    if (head.startsWith('*') || t.startsWith(':')) {
      const rest = head.startsWith('*') ? t.slice(1) : t
      return [`[${scope}]${rest}`, `[${scope}] *${rest}`]
    }
    return [`[${scope}] ${t}`]
  }).join(', ')

  let out = ''
  let i = 0
  while (i < css.length) {
    const lead = /^\s*/.exec(css.slice(i))?.[0] ?? ''
    i += lead.length
    out += lead
    if (i >= css.length) break
    if (css[i] === '@') {
      const open = css.indexOf('{', i)
      const semi = css.indexOf(';', i)
      // an at rule with no block of its own, like @import, is copied and left alone
      if (open < 0 || (semi >= 0 && semi < open)) {
        const end = semi < 0 ? css.length : semi + 1
        out += css.slice(i, end); i = end; continue
      }
      const name = css.slice(i, open).trim()
      const shut = balanced(css, open)
      const body = css.slice(open + 1, shut)
      // one that wraps other rules is recursed into; one that does not is copied whole
      out += /^@(media|supports|layer|container)\b/i.test(name)
        ? `${name}{${grounded(body, scope)}}`
        : `${name}{${body}}`
      i = shut + 1
      continue
    }
    const open = css.indexOf('{', i)
    if (open < 0) { out += css.slice(i); break }
    const shut = balanced(css, open)
    out += `${put(css.slice(i, open))}{${css.slice(open + 1, shut)}}`
    i = shut + 1
  }
  return out
}

export function namespaced(css: string, scope: string): string {
  const tail = (scope || '').replace(/^data-motion-?/, '').replace(/[^-\w]/g, '')
  if (!tail) return css
  const names = [...new Set([...css.matchAll(/@keyframes\s+([-\w]+)/gi)].map((m) => m[1]))]
  let out = css
  for (const name of names) {
    // a name that already carries the scope's identity is unique enough, and appending it twice
    // produces splitflap-card-splitflap, which is uglier than the collision it is preventing
    if (name.includes(tail)) continue
    const safe = `${name}-${tail}`
    const word = new RegExp(`(^|[^-\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-\\w])`, 'g')
    out = out.replace(word, (_a, lead: string) => `${lead}${safe}`)
  }
  return out
}

export function scopeOf(css: string, declared?: unknown): string {
  const used = [...css.matchAll(/\[(data-[-\w]+)\]/g)].map((m) => m[1])
  const said = String(declared ?? '').replace(/[^-\w]/g, '').slice(0, 40)
  if (said && used.includes(said)) return said
  return used[0] ?? ''
}



/** Every entry point judges the same sheet; purpose decides whether a stagger is appropriate. */
export function judgeMotion(raw: { css?: unknown; scope?: string; note?: unknown }, fallbackScope?: string, parts = false) {
  const clean = safeStyle(raw.css)
  if (!clean) return { why: 'The reply carried no usable motion CSS.' }
  const scope = scopeOf(clean, raw.scope ?? fallbackScope), css = namespaced(clean, scope)
  const faults = [...unmoved({html:'',css,note:''},{parts}), ...brittle(css), ...janky(css), ...unstill(css), ...leaks(css,scope)]
  if (faults.length) return { why: faults[0] }
  return { css, scope, note: String(raw.note ?? '').slice(0, 150) }
}
