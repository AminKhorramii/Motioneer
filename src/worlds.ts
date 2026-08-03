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
import type { Kind } from '@/sections'
import type { Backdrop } from '@/backdrop'

export type WorldId = 'swiss' | 'editorial' | 'terminal' | 'poster' | 'catalogue' | 'soft'

export interface World {
  id: WorldId
  name: string
  /** why it looks the way it does, so a choice between worlds is a choice you can reason about */
  note: string
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
    taste: (t) => ({ ...mono(contrast(t)), display: GROTESK, body: SANS, scale: 1.26, radius: 0, density: 0.7, weight: 700, caps: false }),
    structure: { rules: true, numbered: true, bleed: false, measure: 62, figure: 'framed' },
    backdrop: 'none',
    prefer: { hero: 2, features: 0, showcase: 0, quote: 1, pricing: 0, faq: 0, cta: 1, logos: 0 },
  },
  {
    id: 'editorial',
    name: 'editorial',
    note: 'a large serif and long lines, set like a page that expects to be read.',
    taste: (t) => ({ ...tinted(t), display: SERIF, body: SERIF, scale: 1.44, radius: 2, density: 0.35, weight: 500, caps: true }),
    structure: { rules: false, numbered: false, bleed: true, measure: 74, figure: 'bleed' },
    backdrop: 'grain',
    prefer: { hero: 2, features: 1, showcase: 1, quote: 0, pricing: 1, faq: 1, cta: 0, logos: 1 },
  },
  {
    id: 'terminal',
    name: 'terminal',
    note: 'monospace throughout and no rounded corners, for a product that is a tool.',
    taste: (t) => ({ ...mono(t), display: MONO, body: MONO, scale: 1.2, radius: 0, density: 0.8, weight: 500, caps: true }),
    structure: { rules: true, numbered: false, bleed: false, measure: 68, figure: 'plain' },
    backdrop: 'contours',
    prefer: { hero: 3, features: 0, showcase: 0, quote: 1, pricing: 0, faq: 0, cta: 1, logos: 0 },
  },
  {
    id: 'poster',
    name: 'poster',
    note: 'one headline at the size of a wall, and very little else competing with it.',
    taste: (t) => ({ ...contrast(t), display: GROTESK, body: SANS, scale: 1.62, radius: 0, density: 0.3, weight: 800, caps: false }),
    structure: { rules: false, numbered: false, bleed: true, measure: 52, figure: 'bleed' },
    backdrop: 'ridge',
    prefer: { hero: 2, features: 1, showcase: 1, quote: 0, pricing: 1, faq: 1, cta: 0, logos: 1 },
  },
  {
    id: 'catalogue',
    name: 'catalogue',
    note: 'small type set densely, the way a page looks when it has a lot to list.',
    taste: (t) => ({ ...mono(t), display: SANS, body: SANS, scale: 1.16, radius: 3, density: 0.85, weight: 600, caps: true }),
    structure: { rules: true, numbered: true, bleed: false, measure: 58, figure: 'plain' },
    backdrop: 'none',
    prefer: { hero: 1, features: 0, showcase: 0, quote: 1, pricing: 0, faq: 0, cta: 1, logos: 0 },
  },
  {
    id: 'soft',
    name: 'soft product',
    note: 'rounded, roomy and framed, the register most software pages are written in.',
    taste: (t) => ({ ...tinted(t), display: SANS, body: SANS, scale: 1.3, radius: 16, density: 0.45, weight: 600, caps: false }),
    structure: { rules: false, numbered: false, bleed: false, measure: 66, figure: 'framed' },
    backdrop: 'grain',
    prefer: { hero: 0, features: 1, showcase: 1, quote: 0, pricing: 1, faq: 1, cta: 0, logos: 1 },
  },
]

export const worldById = (id?: WorldId) => WORLDS.find((w) => w.id === id) ?? WORLDS[0]

/** The signature a page wears, used to check that a wall spans real ground. */
export const worldSignature = (w: World, t: Taste) =>
  [w.id, t.display.slice(0, 12), t.scale.toFixed(2), t.density.toFixed(2), t.radius, t.bg].join('|')
