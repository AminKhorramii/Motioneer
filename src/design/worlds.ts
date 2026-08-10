/**
 * The built-in worlds and the vocabulary they are made from: face stacks, palette moves,
 * and the six hand-written design systems. Design knowledge, not machinery: edit a world,
 * add one, retune a rhythm, and nothing else needs to know. The World type and the code
 * that dresses pages live in src/worlds.ts.
 */

import { mix, shift, type Taste } from '@/taste'
import type { World } from '@/worlds'
import { ARCHIVO, BRICOLAGE, FRAUNCES, MARTIAN, MONO, PLEX, ROBOTO, SANS, SERIF, SYNE } from '@/design/faces'


/** palette moves, each a relationship rather than a random shift */
const mono = (t: Taste): Taste => ({ ...t, accent2: mix(t.accent, t.bg, 0.45) })
const tinted = (t: Taste): Taste => ({ ...t, bg: mix(t.bg, t.accent, 0.06) })
const contrast = (t: Taste): Taste => ({ ...t, ink: shift(t.ink, 14), dim: mix(t.ink, t.bg, 0.45) })

const BUILT_IN: World[] = [
  {
    id: 'swiss',
    name: 'swiss grid',
    note: 'hairlines, numbered sections and tight tracking. The grid does the talking.',
    voice: 'Write plainly and exactly. Short sentences, concrete nouns, no flourish, because the grid is doing the talking.',
    taste: (t) => ({ ...mono(contrast(t)), display: BRICOLAGE, body: SANS, scale: 1.26, radius: 0, density: 0.7, weight: 700, caps: false }),
    structure: { rules: true, numbered: true, bleed: false, measure: 62, base: 16, figure: 'framed', breakout: 'overlap', rhythm: [1, 0.55, 1.5, 0.8, 1.9, 0.7] },
    backdrop: 'none',
    // a numbered list is more swiss than a row of cards, and the grid has no closing band.
    // Substance is argued twice: listed, then tabulated, because a grid states and then indexes
    wear: { claim: 'statement', substance: ['list', 'table'], offer: 'table', objections: 'list' },
    // a grid states once and prices once; arguing substance twice was padding wearing a system
    compose: ['masthead', 'claim', 'substance', 'offer', 'credits'],
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
    structure: { rules: false, numbered: false, bleed: true, measure: 74, base: 19, figure: 'bleed', breakout: 'bleed', rhythm: [1.7, 0.6, 1.3, 0.75, 2, 0.9] },
    backdrop: 'dither',
    // an essay argues in prose and then shows one plate, which is what a bleeding figure is for
    wear: { claim: 'statement', proof: 'quote', substance: ['prose', 'figure'], offer: 'statement', objections: 'prose', invitation: 'statement' },
    // An essay: the argument, said at length, with one witness and a colophon. No pricing table
    // and no list of objections, because an essay that stops to sell reverts to being a page.
    compose: ['masthead', 'claim', 'substance', 'proof', 'credits'],
    // the one move: a masthead slug above the headline, the way a periodical opens
    css: `#claim h1::before{content:'';display:block;width:2.4ch;height:4px;background:var(--accent);margin-bottom:1.6rem}`,
  },
  {
    id: 'terminal',
    name: 'terminal',
    note: 'monospace throughout and no rounded corners, for a product that is a tool.',
    voice: 'Write like good documentation. Precise, unpersuasive, comfortable with technical nouns.',
    taste: (t) => ({ ...mono(t), display: MARTIAN, body: MONO, scale: 1.2, radius: 0, density: 0.8, weight: 500, caps: true }),
    structure: { rules: true, numbered: false, bleed: false, measure: 68, base: 15, figure: 'plain', breakout: 'none', rhythm: [0.9, 0.5, 1.3, 0.6, 1.6, 0.7] },
    backdrop: 'contours',
    // documentation does not testimonial: everything is a listing or a transcript, and it
    // lists before it tabulates the way a manual states then indexes
    wear: { claim: 'transcript', substance: ['list', 'table'], offer: 'transcript', objections: 'list' },
    // A session opens on output, not on a navigation bar, so this one has no masthead at all.
    compose: ['claim', 'substance', 'substance', 'objections', 'credits'],
    // the one move: the first substance prints inverted, a band of light in a dark page. It is
    // keyed on the id rather than the role, because the id marks the first of a repeated role
    // and a band that happens twice is a background rather than a move
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
    structure: { rules: false, numbered: false, bleed: true, measure: 52, base: 17.5, figure: 'bleed', breakout: 'bleed', rhythm: [2.6, 0.9, 2.2, 1.2, 0.6] },
    backdrop: 'ridge',
    wear: { claim: 'statement', substance: 'figure', proof: 'quote', invitation: 'statement' },
    // Three. A poster is what it leaves out, and it said five while listing six, which is how
    // the intent survived and the page did not. No nav, because nothing printed and pinned to a
    // wall has one, and no substance, because a poster that explains itself is a leaflet.
    compose: ['claim', 'invitation', 'credits'],
    // the one move: the headline at the size of the wall, tighter than body type ever sits.
    // It needed !important on every line when the renderer wrote sizes inline; the blocks
    // carry their sizes as classes now, so a world outranks them by saying it once
    // the floor is low because a poster is big type relative to its page, not big in absolute
    // terms: a 3.6rem floor on a phone put nine characters on a line, which is a column of
    // words rather than a poster
    css: `#claim h1{font-size:clamp(2rem,11.5vw,9.5rem);line-height:.94;letter-spacing:-.045em;max-width:none;margin-left:-.05em}`,
  },
  {
    id: 'catalogue',
    name: 'catalogue',
    note: 'small type set densely, the way a page looks when it has a lot to list.',
    voice: 'Write densely and specifically. Numbers, names and lists rather than claims, because there is room for detail here.',
    taste: (t) => ({ ...mono(t), display: SYNE, body: SANS, scale: 1.16, radius: 3, density: 0.85, weight: 600, caps: true }),
    structure: { rules: true, numbered: true, bleed: false, measure: 58, base: 14, figure: 'plain', breakout: 'stagger', rhythm: [0.7, 0.45, 1.1, 0.5, 1.4, 0.6] },
    backdrop: 'dots',
    // everything, listed: the fullest argument, set dense, priced in a table. The second
    // substance is a numbered list and the second witness speaks, so the density has a seam
    wear: { masthead: 'band', claim: 'prose', proof: ['list', 'quote'], substance: ['table', 'list'], offer: 'table', objections: 'list', invitation: 'band', credits: 'table' },
    compose: ['masthead', 'claim', 'proof', 'substance', 'substance', 'proof', 'offer', 'objections', 'invitation', 'credits'],
    // the one move: double rules between sections, the way a ledger separates its entries
    css: `section+section{border-top:4px double var(--line)}`,
  },
  {
    id: 'shadcn',
    name: 'shadcn',
    library: 'shadcn/ui',
    note: 'zinc neutrals, an eight pixel radius and hairline borders. What most software ships in now.',
    voice: 'Write the way good product documentation speaks: direct, second person, and free of any adjective that could be deleted without loss.',
    // The register the old "soft product" world was gesturing at, named and made exact. A page
    // you can hand to an engineer saying "this one, in shadcn" is worth more than a page you can
    // only describe, and it is the register a reader recognises fastest.
    taste: (t) => ({
      ...t, bg: '#ffffff', ink: '#09090b', dim: '#71717a', accent2: mix(t.accent, '#ffffff', 0.72),
      display: SANS, body: SANS, scale: 1.24, radius: 8, density: 0.55, weight: 600, caps: false,
    }),
    structure: { rules: false, numbered: false, bleed: false, measure: 66, base: 15, figure: 'framed', breakout: 'none', rhythm: [1.3, 0.7, 1.15, 0.65, 1.5, 0.8] },
    backdrop: 'none',
    wear: { masthead: 'band', claim: 'prose', proof: 'list', substance: ['list', 'figure'], offer: 'table', objections: 'prose', invitation: 'band', credits: 'table' },
    compose: ['masthead', 'claim', 'proof', 'substance', 'substance', 'offer', 'objections', 'invitation', 'credits'],
    // the one move: everything is a hairline. No elevation anywhere, which is the whole tell
    css: `:root{--line:#e4e4e7;--rule:1px}
.card{border:1px solid #e4e4e7;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.btn{font-size:.875rem;font-weight:500;padding:.62em 1.05em;border-radius:6px}
.btn-primary{box-shadow:0 1px 2px rgba(0,0,0,.06)}
.link{text-decoration:none;font-weight:500;color:var(--ink)}
.masthead{border-bottom:1px solid #e4e4e7;padding-bottom:calc(var(--gap)*.8)}
.eyebrow{text-transform:none;letter-spacing:0;font-weight:500;color:#71717a}
.row{border-color:#e4e4e7}
h1,h2,h3{letter-spacing:-.03em}`,
  },
  {
    id: 'material',
    name: 'material 3',
    library: 'Material 3',
    note: 'tonal surfaces, pill actions and real elevation, the way an Android product is built.',
    voice: 'Write plainly and a little warmly, in short sentences, the way system copy speaks to someone mid-task.',
    taste: (t) => ({
      ...t, bg: mix('#ffffff', t.accent, 0.04), ink: '#1c1b1f', dim: '#49454f',
      accent2: mix(t.accent, '#ffffff', 0.82),
      display: ROBOTO, body: ROBOTO, scale: 1.32, radius: 16, density: 0.42, weight: 500, caps: false,
    }),
    structure: { rules: false, numbered: false, bleed: false, measure: 62, base: 16, figure: 'framed', breakout: 'overlap', rhythm: [1.5, 0.8, 1.25, 0.7, 1.7, 0.9] },
    backdrop: 'none',
    wear: { masthead: 'band', claim: 'marginalia', proof: 'quote', substance: ['figure', 'list'], offer: 'table', objections: 'list', invitation: 'statement', credits: 'table' },
    compose: ['masthead', 'claim', 'proof', 'substance', 'substance', 'offer', 'objections', 'invitation', 'credits'],
    // elevation and a fully rounded action are the system, not decoration, which is why this
    // world claims the two tells the detector would otherwise raise against it
    claims: ['generic-shadow', 'shadow-stack', 'over-rounding'],
    css: `.btn{border-radius:100px;padding:.72em 1.5em;font-weight:500;letter-spacing:.01em}
.btn-primary{box-shadow:0 1px 3px 1px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.3)}
.card{border:0;border-radius:12px;background:var(--accent2);box-shadow:0 1px 3px 1px rgba(0,0,0,.15)}
.figure>div{border-radius:12px}
.link{text-decoration:none;font-weight:500;color:var(--accent)}
.masthead{padding-bottom:calc(var(--gap)*.7)}
.qa{border-top:0;background:var(--accent2);border-radius:12px;padding:1rem 1.2rem}
.eyebrow{text-transform:uppercase;letter-spacing:.09em}`,
  },
  {
    id: 'carbon',
    name: 'carbon',
    library: 'IBM Carbon',
    note: 'no radius at all, a strict grid and one blue. The register of software that runs a business.',
    voice: 'Write like an operator writing for another operator. Nouns, numbers, no persuasion, and never a joke.',
    taste: (t) => ({
      ...t, bg: '#161616', ink: '#f4f4f4', dim: '#8d8d8d', accent: '#4589ff', accent2: '#78a9ff',
      display: PLEX, body: PLEX, scale: 1.2, radius: 0, density: 0.72, weight: 600, caps: false,
    }),
    structure: { rules: true, numbered: false, bleed: false, measure: 60, base: 14, figure: 'plain', breakout: 'none', rhythm: [1.1, 0.6, 1.35, 0.65, 1.6, 0.75] },
    backdrop: 'none',
    wear: { masthead: 'band', claim: 'statement', proof: 'statement', substance: ['table', 'list'], offer: 'table', objections: 'list', invitation: 'band', credits: 'table' },
    compose: ['masthead', 'claim', 'substance', 'substance', 'proof', 'offer', 'objections', 'credits'],
    // the one move: the action is a rectangle with the label pushed left and the right third
    // left empty, which is the shape of every button in the system
    css: `:root{--line:#393939;--rule:1px}
.btn{border-radius:0;padding:.95em 4rem .95em 1rem;font-weight:400;font-size:.875rem}
.card{border:0;border-radius:0;background:#262626}
.link{color:#78a9ff;text-underline-offset:3px}
.masthead{border-bottom:1px solid #393939;padding-bottom:calc(var(--gap)*.7)}
.mark{font-weight:600;letter-spacing:0}
.eyebrow{text-transform:none;letter-spacing:.02em;color:#8d8d8d}
.row{border-color:#393939}
h1,h2,h3{letter-spacing:0}`,
  },
]

/**
 * The order is the deck the wall deals from, so it is a decision about what someone sees first.
 *
 * A wall with no model behind it, and every wall for its first few seconds, is these eight dealt
 * in order against the brief's own copy. Listed as they were written, that opened on swiss grid
 * and put the three component libraries at the end, so the first two papers a reader landed on
 * were the two most restrained on the wall and the pages that commit were buried at three, four
 * and five. Nothing was wrong with any single world; the order was answering a question nobody
 * asked, which was the order they happened to be typed in.
 *
 * So the ones that argue for themselves come first, and the three reproductions of real design
 * systems come last. They are still here, still exact, and still one press of w away, because a
 * page you can hand to an engineer saying "this one, in shadcn" is worth having. They are just
 * no longer what a wall opens with.
 */
const DECK = ['editorial', 'poster', 'terminal', 'catalogue', 'swiss', 'shadcn', 'material', 'carbon']

export const WORLDS: World[] = DECK.map((id) => BUILT_IN.find((w) => w.id === id)!)

/** the palette moves a model-designed world may pick from, each a relationship */
export const PALETTES: Record<string, (t: Taste) => Taste> = {
  'as-is': (t) => t, mono, tinted, contrast,
}
