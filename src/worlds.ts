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
import { KIND_VARIANTS, type Kind } from '@/sections'
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
  }
  backdrop: Backdrop
  /** the layout each kind wears in this world, so sections agree with each other */
  prefer: Partial<Record<Kind, number>>
  /**
   * CSS the world brings with it, written against the page's own classes and tokens.
   *
   * Parameters alone could not express what the model was designing: a world called thermal
   * receipt came out as a slightly narrow page in mono, because font, scale and measure are
   * the only levers a template exposes. This is the surface where a receipt can have dashed
   * rules and a perforated edge.
   */
  css?: string
}

const GROTESK = "'Helvetica Neue', Arial, sans-serif"
const SERIF = "'Charter', 'Iowan Old Style', Georgia, serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"
const SANS = "'Inter Variable', 'Inter', -apple-system, sans-serif"

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
    structure: { rules: true, numbered: true, bleed: false, measure: 62, figure: 'framed' },
    backdrop: 'none',
    prefer: { hero: 2, features: 0, showcase: 0, quote: 1, pricing: 0, faq: 0, cta: 1, logos: 0 },
  },
  {
    id: 'editorial',
    name: 'editorial',
    note: 'a large serif and long lines, set like a page that expects to be read.',
    voice: 'Write in full sentences with rhythm. The measure is long and the type is large, so the copy can breathe and should.',
    taste: (t) => ({ ...tinted(t), display: SERIF, body: SERIF, scale: 1.44, radius: 2, density: 0.35, weight: 500, caps: true }),
    structure: { rules: false, numbered: false, bleed: true, measure: 74, figure: 'bleed' },
    backdrop: 'grain',
    prefer: { hero: 2, features: 1, showcase: 1, quote: 0, pricing: 1, faq: 1, cta: 0, logos: 1 },
  },
  {
    id: 'terminal',
    name: 'terminal',
    note: 'monospace throughout and no rounded corners, for a product that is a tool.',
    voice: 'Write like good documentation. Precise, unpersuasive, comfortable with technical nouns.',
    taste: (t) => ({ ...mono(t), display: MONO, body: MONO, scale: 1.2, radius: 0, density: 0.8, weight: 500, caps: true }),
    structure: { rules: true, numbered: false, bleed: false, measure: 68, figure: 'plain' },
    backdrop: 'contours',
    prefer: { hero: 3, features: 0, showcase: 0, quote: 1, pricing: 0, faq: 0, cta: 1, logos: 0 },
  },
  {
    id: 'poster',
    name: 'poster',
    note: 'one headline at the size of a wall, and very little else competing with it.',
    voice: 'Write six words where you would write twenty. The headline carries the page alone and everything else is a whisper.',
    taste: (t) => ({ ...contrast(t), display: GROTESK, body: SANS, scale: 1.62, radius: 0, density: 0.3, weight: 800, caps: false }),
    structure: { rules: false, numbered: false, bleed: true, measure: 52, figure: 'bleed' },
    backdrop: 'ridge',
    prefer: { hero: 2, features: 1, showcase: 1, quote: 0, pricing: 1, faq: 1, cta: 0, logos: 1 },
  },
  {
    id: 'catalogue',
    name: 'catalogue',
    note: 'small type set densely, the way a page looks when it has a lot to list.',
    voice: 'Write densely and specifically. Numbers, names and lists rather than claims, because there is room for detail here.',
    taste: (t) => ({ ...mono(t), display: SANS, body: SANS, scale: 1.16, radius: 3, density: 0.85, weight: 600, caps: true }),
    structure: { rules: true, numbered: true, bleed: false, measure: 58, figure: 'plain' },
    backdrop: 'none',
    prefer: { hero: 1, features: 0, showcase: 0, quote: 1, pricing: 0, faq: 0, cta: 1, logos: 0 },
  },
  {
    id: 'soft',
    name: 'soft product',
    note: 'rounded, roomy and framed, the register most software pages are written in.',
    voice: 'Write warmly and directly, the way a good product page speaks to a stranger who is in a hurry.',
    taste: (t) => ({ ...tinted(t), display: SANS, body: SANS, scale: 1.3, radius: 16, density: 0.45, weight: 600, caps: false }),
    structure: { rules: false, numbered: false, bleed: false, measure: 66, figure: 'framed' },
    backdrop: 'grain',
    prefer: { hero: 0, features: 1, showcase: 1, quote: 0, pricing: 1, faq: 1, cta: 0, logos: 1 },
  },
]

/** the four faces that are certain to be on the machine, since the page ships without webfonts */
export const FACES: Record<string, string> = { sans: SANS, grotesk: GROTESK, serif: SERIF, mono: MONO }
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
  const prefer: Partial<Record<Kind, number>> = {}
  for (const [kind, v] of Object.entries((raw.prefer ?? {}) as Record<string, unknown>)) {
    if (kind in KIND_VARIANTS) {
      prefer[kind as Kind] = Math.max(0, Math.min(Math.round(Number(v) || 0), KIND_VARIANTS[kind as Kind].length - 1))
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
    },
    backdrop: (['none', 'contours', 'grain', 'ridge'] as const).includes(raw.backdrop as never)
      ? (raw.backdrop as Backdrop)
      : 'none',
    prefer,
    css: safeCss(raw.css),
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

/** The signature a page wears, used to check that a wall spans real ground. */
export const worldSignature = (w: World, t: Taste) =>
  [w.id, t.display.slice(0, 12), t.scale.toFixed(2), t.density.toFixed(2), t.radius, t.bg].join('|')
