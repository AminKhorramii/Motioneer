/**
 * The built-in worlds and the vocabulary they are made from: face stacks, palette moves,
 * and the six hand-written design systems. Design knowledge, not machinery: edit a world,
 * add one, retune a rhythm, and nothing else needs to know. The World type and the code
 * that dresses pages live in src/worlds.ts.
 */

import { mix, shift, type Taste } from '@/taste'
import type { World } from '@/worlds'
import { ARCHIVO, FRAUNCES, GROTESK, MONO, SANS, SERIF } from '@/design/faces'


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


/** the palette moves a model-designed world may pick from, each a relationship */
export const PALETTES: Record<string, (t: Taste) => Taste> = {
  'as-is': (t) => t, mono, tinted, contrast,
}
