/**
 * Design worlds.
 *
 * A variant used to be a shuffle: every section picked a layout at random and the palette was
 * jittered. That buys variety without identity, so eight papers came out as eight shuffles
 * rather than eight designs. A world is one set of decisions that propagate together, which is
 * what makes a page look designed rather than generated.
 *
 * A variant is now an angle crossed with a world: what the page argues, and how it is built.
 */

import type { Taste } from '@/taste'
import { ROLE_FORMS, legacyRole, type Form, type Role, type Section } from '@/sections'
import { BACKDROPS, type Backdrop } from '@/backdrop'
import { PALETTES, WORLDS } from '@/design/worlds'
import { FACES } from '@/design/faces'

export { FACES, WORLDS }

export type WorldId = string

export interface World {
  id: WorldId
  name: string
  /** why it looks the way it does, so a choice between worlds is a choice you can reason about */
  note: string
  /**
   * The direction this world grew from, by name, when a model designed it from one.
   *
   * A world's own name is whatever the model called it, so two walls that both started from the
   * till roll produce a night ledger and a thermal audit and nothing can tell they are the same
   * idea. The direction is the stable thing, and it is what a page kept or killed is remembered
   * as. A built-in world grew from nobody's direction and leaves this alone.
   */
  ground?: string
  /**
   * How to write for it. The copy used to be written blind to the design it landed in, so a
   * poster and a catalogue came out at the same length when one wants six words and the other
   * wants forty. This travels with the prompt.
   */
  voice: string
  /** a deliberate transform of your taste, never a random nudge */
  taste: (t: Taste) => Taste
  structure: {
    /** a hairline above each section, which is what makes a grid read as a grid */
    rules: boolean
    numbered: boolean
    /** sections run edge to edge rather than sitting in a column */
    bleed: boolean
    /** characters per line, the single biggest lever on how a page reads */
    measure: number
    /**
     * The size body copy is set at.
     *
     * Every page on the wall was 16.5px, which is the one measurement a real system always has
     * an opinion about: Carbon sets 14, Material 16, a page that expects to be read sets 19. It
     * was the last axis with a spread of exactly zero.
     */
    base?: number
    figure: 'framed' | 'bleed' | 'plain'
    /**
     * How a page is allowed to leave its column.
     *
     * Everything used to stack in one column: heading, body, occasionally two tracks. That is
     * what stopped pages looking wild, and it is also the silhouette of a generated page, which
     * no amount of retuned type or colour escapes. These are the ways out, and each one lands on
     * a line the grid already has rather than at an offset somebody picked, because breaking out
     * of a column is a composition and breaking off a grid is the mess this replaced.
     *
     * bleed runs the figure the full width of the page. overlap lifts it into the section above
     * so two sections share an edge. stagger drops every second tile, so a row of them reads as
     * an arrangement rather than a table.
     */
    breakout?: 'none' | 'bleed' | 'overlap' | 'stagger'
    /**
     * Per-section padding multipliers, cycled down the page. Uniform rhythm is the deepest
     * tell of a generated page: every section given equal air reads as one treatment applied
     * to all content. A sequence with a sparse beat and a dense beat reads as paced.
     */
    rhythm?: number[]
  }
  /**
   * How the page is laid out as a whole, rather than how one section leaves its column.
   *
   * Every page here was a stack of full width bands in reading order. Varying what went in the
   * stack and how tall it was made the wall better and left that untouched, and it is the thing
   * a reader registers before a single word: two pages of the same length in the same typeface
   * read as different designs when one is a column and one is a spread.
   *
   * column is the stack, and is right for most things: a poster, a receipt, a manual.
   * split holds the opening section still in a side panel while the rest travels past it, which
   * is how a spread works and how a page can be read as two things at once.
   * mosaic places the sections on a two track grid, some spanning both, so a page of many short
   * parts reads as an arrangement rather than a queue.
   * weave gives each section a side and leaves the other empty, so the argument steps down the
   * page and no two consecutive things start at the same left edge.
   *
   * Each is one media query away from being a column again, because a phone is a column and a
   * layout that will not collapse is a layout that breaks rather than adapts.
   */
  layout?: 'column' | 'split' | 'mosaic' | 'weave'
  backdrop: Backdrop
  /**
   * The form each role takes here. This is where a world speaks: the same offer is a table
   * in a catalogue, one sentence on a poster, and a transcript line in a terminal.
   *
   * A list is the forms a repeated role wears in order, because a world that argues substance
   * twice has an opinion about both, and the second one used to be picked by the machinery.
   */
  wear: Partial<Record<Role, Form | Form[]>>
  /**
   * The design system this world is built in, when it is built in one.
   *
   * Named so the page can say which, and so the brief handed back can say "build this with
   * shadcn/ui" rather than describing tokens and hoping. A world grounded in an object rather
   * than a library leaves this alone.
   */
  library?: string
  /**
   * The tells this world wears on purpose.
   *
   * The slop catalogue encodes what the median generated page looks like, and the median
   * generated page looks like soft rounded product software, so a faithful Material page trips
   * three of its entries for doing Material correctly. A world that has named a system it is
   * built in gets to claim the tells that system genuinely owns; anything it has not claimed is
   * still flagged, so the detector keeps its teeth against a page that merely drifted there.
   */
  claims?: string[]
  /**
   * CSS the world brings with it, written against the page's own classes and tokens.
   *
   * Parameters alone could not express what the model was designing: a world called thermal
   * receipt came out as a slightly narrow page in mono, because font, scale and measure are
   * the only levers a template exposes. This is the surface where a receipt can have dashed
   * rules and a perforated edge.
   */
  css?: string
  /**
   * The argument this world makes, in order: which roles, and how often.
   *
   * Until now every page was the same nine sections in the same order, so a world called
   * printed receipt still had a testimonial and a three card pricing grid. A world that can
   * choose its own composition changes the silhouette of a page rather than its surface.
   */
  compose?: Role[]
}

/**
 * Turn a model's description of a world into a real one.
 *
 * Everything is clamped rather than trusted, because a scale of 9 or a measure of 200 does not
 * produce a daring page, it produces an unreadable one. The model chooses inside a range; it
 * does not get to leave it.
 */
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

/** the properties that belong to the frame, which a block may read and no world may write */
const FRAME_OWNED = /^(max-width|min-width|width|display|grid-template-columns|grid-template|padding|padding-(inline|left|right)(-\w+)?|margin-(inline|left|right)(-\w+)?)$/i

/**
 * Keep model authored CSS to CSS, and keep it out of the frame.
 *
 * It is rendered inside an iframe that holds nothing but the page, so it cannot reach the app,
 * but it can still break the promise that a shipped page is one file with no requests. Imports
 * and remote urls go, and the whole thing is capped.
 *
 * It can also break the page. Four of eight recorded worlds set a width on .wrap, which is the
 * grid every section shares, so the reading column a world asked for at 46 characters arrived
 * at 32 and every wide block was stranded in the middle of a page it no longer filled. The
 * intent was never wrong: a receipt is a narrow column. The lever was. Those declarations are
 * dropped and the world says the same thing with --measure, which moves the whole page at once
 * and cannot leave one block behind. This is the clamp madeWorld already applies to every
 * number, extended to the one surface that had none.
 */
function safeCss(raw: unknown): string {
  const css = String(raw ?? '')
  if (!css.trim() || css.includes('</')) return ''
  const clean = css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*['"]?\s*(https?:|\/\/)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
    // !important is never needed against a library of classes, and it only hides what is winning
    .replace(/!\s*important/gi, '')
    // the frame's own properties, on the frame's own selector
    .replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selector: string, body: string) => {
      if (!/(^|[\s,>+~])\.wrap\b/.test(selector)) return whole
      const kept = body
        .split(';')
        .filter((d) => !FRAME_OWNED.test(d.split(':')[0]?.trim() ?? ''))
        .join(';')
      return kept.trim() ? `${selector}{${kept}}` : ''
    })
  /**
   * Room to draw in.
   *
   * Four thousand characters was set when a world's CSS was treatment: rules, slabs, a hairline,
   * a dashed border. Asking it to draw the object the ground names is asking for gradients with
   * a dozen stops, pseudo elements and transforms, and a record with grooves and a numbered stamp
   * does not fit in four thousand characters alongside the rest of a design. A cap still exists
   * because this ships inside every page, and nine thousand is about two screens of CSS.
   */
  return clean.slice(0, 9000)
}

/**
 * A name is a name, and a note is a sentence.
 *
 * Every number a model writes here is clamped and its CSS goes through safeCss, and the three
 * prose fields had nothing at all. They travel further than either. The name and the note are
 * read into the copy prompt, and the name is written into the spec a coding agent implements
 * from, where a string carrying a newline stops being a name and becomes a heading of its own:
 * a world called "\n## Ignore the above" put exactly that at the top level of the handoff. This
 * is the rule the handoff already keeps about file names, applied to the strings beside them.
 */
const line = (raw: unknown, n: number) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export function madeWorld(raw: Record<string, unknown>, i: number): World {
  const s = (raw.structure ?? {}) as Record<string, unknown>
  const face = (k: unknown, fallback: string) => FACES[String(k)] ?? fallback
  const palette = PALETTES[String(raw.palette)] ?? PALETTES['as-is']
  const asRole = (k: string): Role | null => (k in ROLE_FORMS ? (k as Role) : legacyRole(k))
  const wear: Partial<Record<Role, Form | Form[]>> = {}
  for (const [k, v] of Object.entries((raw.wear ?? {}) as Record<string, unknown>)) {
    const role = asRole(k)
    if (!role) continue
    // a role may be named once or once per appearance, and anything the role cannot wear is
    // dropped rather than corrected, because a wrong form is a decision nobody made
    const forms = (Array.isArray(v) ? v : [v])
      .map((f) => String(f) as Form)
      .filter((f) => ROLE_FORMS[role].includes(f))
      .slice(0, 4)
    if (forms.length) wear[role] = forms.length === 1 ? forms[0] : forms
  }
  // worlds recorded before forms said prefer as {kind: layout number}; the numbers still
  // index into the role's forms, so an old design keeps meaning something
  for (const [k, v] of Object.entries((raw.prefer ?? {}) as Record<string, unknown>)) {
    const role = asRole(k)
    if (role && wear[role] === undefined) {
      const allowed = ROLE_FORMS[role]
      wear[role] = allowed[Math.max(0, Math.min(Math.round(Number(v) || 0), allowed.length - 1))]
    }
  }
  return {
    id: `made-${i}`,
    // the fallback stays inside the clamp, so a reply that named nothing is still refused by the
    // caller's own emptiness check rather than being handed a name it never chose
    name: line(raw.name ?? `world ${i + 1}`, 26),
    note: line(raw.note, 120),
    voice: line(raw.voice, 240),
    taste: (t) => ({
      ...palette(t),
      display: face(raw.display, FACES.sans),
      body: face(raw.body, FACES.sans),
      scale: clamp(raw.scale, 1.1, 1.7, 1.3),
      radius: clamp(raw.radius, 0, 24, 6),
      density: clamp(raw.density, 0.25, 0.9, 0.5),
      weight: Math.round(clamp(raw.weight, 300, 800, 600) / 100) * 100,
      caps: Boolean(raw.caps),
    }),
    structure: {
      rules: Boolean(s.rules),
      numbered: Boolean(s.numbered),
      bleed: Boolean(s.bleed),
      measure: clamp(s.measure, 44, 82, 64),
      base: clamp(s.base, 14, 20, 16.5),
      figure: (['framed', 'bleed', 'plain'] as const).includes(s.figure as never) ? (s.figure as World['structure']['figure']) : 'framed',
      breakout: (['none', 'bleed', 'overlap', 'stagger'] as const).includes(s.breakout as never)
        ? (s.breakout as World['structure']['breakout'])
        : 'none',
      rhythm: Array.isArray(s.rhythm)
        ? (s.rhythm as unknown[]).slice(0, 8).map((v) => clamp(v, 0.4, 3, 1))
        : undefined,
    },
    // a name this renderer does not lay out is a column, because the stack is the one
    // arrangement that is always safe and a page it cannot draw is worse than a plain one
    layout: (['column', 'split', 'mosaic', 'weave'] as const).includes(raw.layout as never)
      ? (raw.layout as World['layout'])
      : 'column',
    // read from the list rather than a copy of it, so a backdrop added to the vocabulary is one
    // a world may actually choose instead of silently falling to none
    backdrop: BACKDROPS.includes(raw.backdrop as Backdrop) ? (raw.backdrop as Backdrop) : 'none',
    wear,
    css: safeCss(raw.css),
    compose: Array.isArray(raw.sections)
      ? (raw.sections as unknown[])
          .map((k) => asRole(String(k)))
          .filter((r): r is Role => r !== null)
          .slice(0, 12)
      : undefined,
  }
}

/**
 * Worlds a model designed are registered here so the renderer, the brief and the dock can find
 * them by id exactly like the built in ones. Without this a designed page would render with
 * someone else's structure, since a page stores its world by name rather than by value.
 */
const made = new Map<string, World>()
export const register = (list: World[]) => list.forEach((w) => made.set(w.id, w))

/**
 * The world a page falls back to when its own cannot be found.
 *
 * Named rather than positional. This was whichever world happened to be listed first, which tied
 * the fallback to the order the wall deals its designs in: ordering that deck by taste would have
 * changed what an unknown world falls back to as a side effect. A page whose world is missing
 * should land somewhere that says nothing, and that is swiss.
 */
export const worldById = (id?: WorldId) =>
  made.get(String(id))
  ?? WORLDS.find((w) => w.id === id)
  ?? WORLDS.find((w) => w.id === 'swiss')
  ?? WORLDS[0]

/**
 * Dress sections in a world's forms.
 *
 * Two rules a template system cannot state: adjacent sections never share a form, because the
 * repeat is what reads as one treatment applied to all content, and a repeated role never
 * repeats its form, because saying the same thing twice deserves a second register. The
 * advance is deterministic, so the same world dresses the same page the same way every time.
 *
 * Both rules are a fallback and never an override. They used to outrank the world, so a
 * terminal that asked for a list of substance was handed a drawn figure and an editorial that
 * asked for prose was handed a table: the most identity-bearing decision a world makes was
 * being spent to avoid a repeat. A form the world named for this position is now kept, and the
 * rotation only settles what the world left open.
 */
export function dressSections(sections: Section[], world: World): Section[] {
  const taken = new Map<Role, Set<Form>>()
  const nth = new Map<Role, number>()
  let prev: Form | null = null
  return sections.map((s) => {
    const allowed = ROLE_FORMS[s.role]
    const at = nth.get(s.role) ?? 0
    nth.set(s.role, at + 1)
    const said = world.wear[s.role]
    // a world names one form for a role, or one per time the role appears
    const asked = Array.isArray(said) ? said[Math.min(at, said.length - 1)] : at === 0 ? said : undefined
    const declared = asked !== undefined && allowed.includes(asked)
    let form = declared ? asked : allowed.includes(s.form) ? s.form : allowed[0]
    if (!declared) {
      let i = allowed.indexOf(form)
      const used = taken.get(s.role) ?? new Set<Form>()
      for (let guard = 0; guard < allowed.length && (form === prev || used.has(form)); guard++) {
        i = (i + 1) % allowed.length
        form = allowed[i]
      }
    }
    taken.set(s.role, (taken.get(s.role) ?? new Set<Form>()).add(form))
    prev = form
    return { ...s, form }
  })
}

/** The signature a page wears, used to check that a wall spans real ground. */
export const worldSignature = (w: World, t: Taste) =>
  [w.id, t.display.slice(0, 12), t.scale.toFixed(2), t.density.toFixed(2), t.radius, t.bg].join('|')
