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

import { mix, shift, type Taste } from '@/taste'
import { ROLE_FORMS, legacyRole, type Form, type Role, type Section } from '@/sections'
import type { Backdrop } from '@/backdrop'

export type WorldId = string

export interface World {
  id: WorldId
  name: string
  /** why it looks the way it does, so a choice between worlds is a choice you can reason about */
  note: string
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
    figure: 'framed' | 'bleed' | 'plain'
    /**
     * Per-section padding multipliers, cycled down the page. Uniform rhythm is the deepest
     * tell of a generated page: every section given equal air reads as one treatment applied
     * to all content. A sequence with a sparse beat and a dense beat reads as paced.
     */
    rhythm?: number[]
  }
  backdrop: Backdrop
  /**
   * The form each role takes here. This is where a world speaks: the same offer is a table
   * in a catalogue, one sentence on a poster, and a transcript line in a terminal.
   */
  wear: Partial<Record<Role, Form>>
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

const GROTESK = "'Helvetica Neue', Arial, sans-serif"
const SERIF = "'Charter', 'Iowan Old Style', Georgia, serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"
const SANS = "'Inter Variable', 'Inter', -apple-system, sans-serif"
// carried inside the page by render.ts, so these exist on every machine the file reaches
const FRAUNCES = "'Fraunces Variable', 'Charter', 'Iowan Old Style', Georgia, serif"
const ARCHIVO = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif"

/** palette moves, each a relationship rather than a random shift */
const mono = (t: Taste): Taste => ({ ...t, accent2: mix(t.accent, t.bg, 0.45) })
const tinted = (t: Taste): Taste => ({ ...t, bg: mix(t.bg, t.accent, 0.06) })
const contrast = (t: Taste): Taste => ({ ...t, ink: shift(t.ink, 14), dim: mix(t.ink, t.bg, 0.45) })

export const WORLDS: World[] = [
  {
    id: 'swiss',
    name: 'swiss grid',
    note: 'hairlines, numbered sections and tight tracking. The grid does the talking.',
    voice: 'Write plainly and exactly. Short sentences, concrete nouns, no flourish, because the grid is doing the talking.',
    taste: (t) => ({ ...mono(contrast(t)), display: GROTESK, body: SANS, scale: 1.26, radius: 0, density: 0.7, weight: 700, caps: false }),
    structure: { rules: true, numbered: true, bleed: false, measure: 62, figure: 'framed', rhythm: [1, 0.55, 1.5, 0.8, 1.9, 0.7] },
    backdrop: 'none',
    // a numbered list is more swiss than a row of cards, and the grid has no closing band
    wear: { claim: 'statement', substance: 'list', offer: 'table', objections: 'list' },
    compose: ['claim', 'substance', 'substance', 'offer', 'objections', 'credits'],
    // the one move: the folio of the opening section set enormous and almost gone.
    // One committed move per world, because restraint plus commitment is what reads as
    // designed, where several small flourishes read as generated.
    css: `section:first-of-type>.wrap::before{font-size:9rem;opacity:.08;left:-.5rem;top:-3.2rem;letter-spacing:-.04em;color:var(--ink);font-weight:700}`,
  },
  {
    id: 'editorial',
    name: 'editorial',
    note: 'a large serif and long lines, set like a page that expects to be read.',
    voice: 'Write in full sentences with rhythm. The measure is long and the type is large, so the copy can breathe and should.',
    taste: (t) => ({ ...tinted(t), display: FRAUNCES, body: SERIF, scale: 1.44, radius: 2, density: 0.35, weight: 560, caps: true }),
    structure: { rules: false, numbered: false, bleed: true, measure: 74, figure: 'bleed', rhythm: [1.7, 0.6, 1.3, 0.75, 2, 0.9] },
    backdrop: 'grain',
    wear: { claim: 'statement', proof: 'quote', substance: 'prose', offer: 'statement', objections: 'prose', invitation: 'statement' },
    // a read: the argument, one witness, the substance twice over, the terms, a quiet close
    compose: ['claim', 'proof', 'substance', 'substance', 'offer', 'objections', 'invitation', 'credits'],
    // the one move: a masthead slug above the headline, the way a periodical opens
    css: `#claim h1::before{content:'';display:block;width:2.4ch;height:4px;background:var(--accent);margin-bottom:1.6rem}`,
  },
  {
    id: 'terminal',
    name: 'terminal',
    note: 'monospace throughout and no rounded corners, for a product that is a tool.',
    voice: 'Write like good documentation. Precise, unpersuasive, comfortable with technical nouns.',
    taste: (t) => ({ ...mono(t), display: MONO, body: MONO, scale: 1.2, radius: 0, density: 0.8, weight: 500, caps: true }),
    structure: { rules: true, numbered: false, bleed: false, measure: 68, figure: 'plain', rhythm: [0.9, 0.5, 1.3, 0.6, 1.6, 0.7] },
    backdrop: 'contours',
    // documentation does not testimonial: everything is a listing or a transcript
    wear: { claim: 'transcript', substance: 'list', offer: 'transcript', objections: 'list' },
    compose: ['claim', 'substance', 'substance', 'objections', 'offer', 'credits'],
    // the one move: the substance prints inverted, a band of light in a dark page
    css: `#substance{background:var(--ink);color:var(--bg)}
#substance h2,#substance h3{color:var(--bg)}
#substance p{color:color-mix(in srgb,var(--bg) 72%,var(--ink))}`,
  },
  {
    id: 'poster',
    name: 'poster',
    note: 'one headline at the size of a wall, and very little else competing with it.',
    voice: 'Write six words where you would write twenty. The headline carries the page alone and everything else is a whisper.',
    taste: (t) => ({ ...contrast(t), display: ARCHIVO, body: SANS, scale: 1.62, radius: 0, density: 0.3, weight: 880, caps: false }),
    structure: { rules: false, numbered: false, bleed: true, measure: 52, figure: 'bleed', rhythm: [2.6, 0.9, 2.2, 1.2, 0.6] },
    backdrop: 'ridge',
    wear: { claim: 'statement', substance: 'figure', proof: 'quote', invitation: 'statement' },
    // five sections. A poster is what it leaves out, and the whitespace is the design
    compose: ['claim', 'substance', 'proof', 'invitation', 'credits'],
    // the one move: the headline at the size of the wall, tighter than body type ever sits
    css: `#claim h1{font-size:clamp(3.6rem,11.5vw,9.5rem)!important;line-height:.94!important;letter-spacing:-.045em;max-width:none!important;margin-left:-.05em}`,
  },
  {
    id: 'catalogue',
    name: 'catalogue',
    note: 'small type set densely, the way a page looks when it has a lot to list.',
    voice: 'Write densely and specifically. Numbers, names and lists rather than claims, because there is room for detail here.',
    taste: (t) => ({ ...mono(t), display: SANS, body: SANS, scale: 1.16, radius: 3, density: 0.85, weight: 600, caps: true }),
    structure: { rules: true, numbered: true, bleed: false, measure: 58, figure: 'plain', rhythm: [0.7, 0.45, 1.1, 0.5, 1.4, 0.6] },
    backdrop: 'none',
    // everything, listed: the fullest argument, set dense, priced in a table
    wear: { claim: 'prose', proof: 'list', substance: 'table', offer: 'table', objections: 'list', invitation: 'band' },
    compose: ['claim', 'proof', 'substance', 'substance', 'proof', 'offer', 'objections', 'invitation', 'credits'],
    // the one move: double rules between sections, the way a ledger separates its entries
    css: `section+section{border-top:4px double var(--line)!important}`,
  },
  {
    id: 'soft',
    name: 'soft product',
    note: 'rounded, roomy and framed, the register most software pages are written in.',
    voice: 'Write warmly and directly, the way a good product page speaks to a stranger who is in a hurry.',
    taste: (t) => ({ ...tinted(t), display: SANS, body: SANS, scale: 1.3, radius: 16, density: 0.45, weight: 600, caps: false }),
    structure: { rules: false, numbered: false, bleed: false, measure: 66, figure: 'framed', rhythm: [1.5, 0.7, 1.2, 0.6, 1.8, 0.8] },
    backdrop: 'grain',
    wear: { claim: 'prose', proof: 'list', substance: 'figure', offer: 'table', invitation: 'band' },
    compose: ['claim', 'proof', 'substance', 'substance', 'proof', 'offer', 'invitation', 'credits'],
    // the one move: the opening sits on its own tinted band, so the page has a shoreline
    css: `#claim{background:var(--surface)}`,
  },
]

/**
 * The faces a world may wear. Four are platform stacks certain to be on the machine; two are
 * variable faces carried inside the page itself, because a face at factory defaults chosen by
 * nobody is the deepest typographic tell of a generated page. render.ts embeds a face only
 * when the page wears it, so a page in the platform stacks still ships with no font payload.
 */
export const FACES: Record<string, string> = {
  sans: SANS, grotesk: GROTESK, serif: SERIF, mono: MONO, fraunces: FRAUNCES, archivo: ARCHIVO,
}
const PALETTES: Record<string, (t: Taste) => Taste> = {
  'as-is': (t) => t, mono, tinted, contrast,
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

/**
 * Keep model authored CSS to CSS. It is rendered inside an iframe that holds nothing but the
 * page, so it cannot reach the app, but it can still break the promise that a shipped page is
 * one file with no requests. Imports and remote urls go, and the whole thing is capped.
 */
function safeCss(raw: unknown): string {
  const css = String(raw ?? '')
  if (!css.trim() || css.includes('</')) return ''
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*['"]?\s*(https?:|\/\/)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
    .slice(0, 4000)
}

export function madeWorld(raw: Record<string, unknown>, i: number): World {
  const s = (raw.structure ?? {}) as Record<string, unknown>
  const face = (k: unknown, fallback: string) => FACES[String(k)] ?? fallback
  const palette = PALETTES[String(raw.palette)] ?? PALETTES['as-is']
  const asRole = (k: string): Role | null => (k in ROLE_FORMS ? (k as Role) : legacyRole(k))
  const wear: Partial<Record<Role, Form>> = {}
  for (const [k, v] of Object.entries((raw.wear ?? {}) as Record<string, unknown>)) {
    const role = asRole(k)
    const form = String(v) as Form
    if (role && ROLE_FORMS[role].includes(form)) wear[role] = form
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
    name: String(raw.name ?? `world ${i + 1}`).slice(0, 26),
    note: String(raw.note ?? '').slice(0, 120),
    voice: String(raw.voice ?? '').slice(0, 240),
    taste: (t) => ({
      ...palette(t),
      display: face(raw.display, SANS),
      body: face(raw.body, SANS),
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
      figure: (['framed', 'bleed', 'plain'] as const).includes(s.figure as never) ? (s.figure as World['structure']['figure']) : 'framed',
      rhythm: Array.isArray(s.rhythm)
        ? (s.rhythm as unknown[]).slice(0, 8).map((v) => clamp(v, 0.4, 3, 1))
        : undefined,
    },
    backdrop: (['none', 'contours', 'grain', 'ridge'] as const).includes(raw.backdrop as never)
      ? (raw.backdrop as Backdrop)
      : 'none',
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

export const worldById = (id?: WorldId) => made.get(String(id)) ?? WORLDS.find((w) => w.id === id) ?? WORLDS[0]

/**
 * Dress sections in a world's forms, under two rules a template system cannot state:
 * adjacent sections never share a form, because the repeat is what reads as one treatment
 * applied to all content, and a repeated role never repeats its form, because saying the
 * same thing twice deserves a second register. The advance is deterministic, so the same
 * world dresses the same page the same way every time.
 */
export function dressSections(sections: Section[], world: World): Section[] {
  const taken = new Map<Role, Set<Form>>()
  let prev: Form | null = null
  return sections.map((s) => {
    const allowed = ROLE_FORMS[s.role]
    const wanted = world.wear[s.role]
    let form = wanted && allowed.includes(wanted) ? wanted : allowed.includes(s.form) ? s.form : allowed[0]
    let i = allowed.indexOf(form)
    const used = taken.get(s.role) ?? new Set<Form>()
    for (let guard = 0; guard < allowed.length && (form === prev || used.has(form)); guard++) {
      i = (i + 1) % allowed.length
      form = allowed[i]
    }
    used.add(form)
    taken.set(s.role, used)
    prev = form
    return { ...s, form }
  })
}

/** The signature a page wears, used to check that a wall spans real ground. */
export const worldSignature = (w: World, t: Taste) =>
  [w.id, t.display.slice(0, 12), t.scale.toFixed(2), t.density.toFixed(2), t.radius, t.bg].join('|')
