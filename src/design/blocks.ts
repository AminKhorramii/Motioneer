/**
 * The block library: the layout a page is built from, as data.
 *
 * Layout used to live in the renderer as inline styles, one per role and form. That put it
 * where nothing could reach it: a section carried its own width, so nine sections meant seven
 * left edges, and a world's CSS could not move any of them without !important. It also meant
 * the model designing a world was writing CSS against markup it had never been shown, so about
 * two fifths of every world it wrote landed on nothing at all.
 *
 * So the layout is here, once, as classes and properties. The renderer emits it, a world
 * restyles it by name, and the design prompt is generated from it, which is the part that
 * matters: the hooks a model is told about cannot drift from the hooks that exist, because
 * they are the same list. Design knowledge, not machinery. Retune a block, add one, and the
 * renderer and the prompt both follow.
 *
 * The rule the whole file exists to keep: a block says which column it sits on and how its
 * contents divide. It never states a width. Widths come from the tokens below, so moving one
 * value moves the whole page and a page stays one page.
 */

/** a property a world sets to retune the blocks, rather than a rule it writes to replace them */
export interface Token {
  name: string
  note: string
  range: string
}

export const TOKENS: Token[] = [
  { name: '--measure', note: 'the reading column, and the single biggest lever on how a page reads', range: '44ch to 82ch' },
  { name: '--page', note: 'the outer column everything is centred in', range: '720px to 1400px, or none for edge to edge' },
  { name: '--edge', note: 'the gutter between the page and its content', range: '1rem to 8vw' },
  { name: '--split', note: 'the two tracks of a split block', range: 'two fr values, like 1fr 1fr or .6fr 1.4fr' },
  { name: '--tile', note: 'the narrowest a tile gets before the grid drops a column', range: '12rem to 26rem' },
  { name: '--rowsplit', note: 'the label and body tracks of a row', range: 'two tracks, like minmax(9rem,15rem) 1fr' },
  { name: '--rule', note: 'the weight of every hairline on the page at once', range: '0 to 4px' },
  { name: '--stack', note: 'the air between things stacked on each other', range: '.3rem to 2rem' },
  { name: '--beat', note: 'set per section from the rhythm, multiplying that section, air', range: '.4 to 3' },
]

/**
 * The frame: one grid, three columns, shared by every section on the page.
 *
 * text and wide begin at the same line on purpose. A block may be as wide as the page or as
 * narrow as the measure, and either way it starts where the last one started, which is the
 * whole of what makes a page look composed rather than assembled.
 */
export const FRAME = `.wrap{max-width:var(--page);margin-inline:auto;display:grid;container:wrap/inline-size;
row-gap:calc(var(--gap)*1.1);
grid-template-columns:[full-start] var(--edge) [wide-start text-start] minmax(0,var(--measure))
[text-end] minmax(0,1fr) [wide-end] var(--edge) [full-end]}
.wrap>*{grid-column:text;min-width:0}
.wrap>.wide{grid-column:wide}
.wrap>.full{grid-column:full}
section{padding-block:calc(var(--gap)*2.2*var(--beat))}`

export interface Block {
  /** the class, which is what a world names to restyle it */
  name: string
  /** what it is for, in the words someone choosing between them would use */
  note: string
  /** the tokens that retune this one */
  knobs: string[]
  css: string
  /** what it does when its own box runs out of room */
  collapse?: string
}

export const BLOCKS: Block[] = [
  {
    name: 'stack',
    note: 'things one under another with even air. The default shape of an argument.',
    knobs: ['--stack'],
    css: '.stack{display:grid;gap:var(--stack);align-content:start;justify-items:stretch}',
  },
  {
    name: 'split',
    note: 'two columns that hold something beside something else, words and a figure most often.',
    knobs: ['--split'],
    css: '.split{display:grid;grid-template-columns:var(--split);gap:calc(var(--gap)*1.3);align-items:center}',
    collapse: '.split{grid-template-columns:1fr;gap:calc(var(--gap)*.9)}',
  },
  {
    name: 'grid',
    note: 'tiles that fit as many across as the room allows and drop a column when it does not.',
    knobs: ['--tile'],
    css: `.grid{display:grid;gap:calc(var(--gap)*.8);
grid-template-columns:repeat(auto-fit,minmax(min(var(--tile),100%),1fr))}`,
  },
  {
    name: 'rows',
    note: 'ruled rows with a label beside a body, the shape of a table that is not a table.',
    knobs: ['--rowsplit', '--rule'],
    css: `.rows{display:grid}
.row{display:grid;grid-template-columns:var(--rowsplit);gap:1.3rem;
padding:calc(var(--gap)*.5) 0;border-top:var(--rule) solid var(--line)}
.rows.open>.row:first-child{border-top:0}
.rows.closed>.row:last-child{border-bottom:var(--rule) solid var(--line)}`,
    collapse: '.row{grid-template-columns:1fr;gap:.35rem}',
  },
  {
    name: 'band',
    note: 'a rule with something at each end of it, for a closing line and the action beside it.',
    knobs: ['--rule'],
    css: `.band{display:flex;justify-content:space-between;align-items:flex-end;gap:1.4rem;flex-wrap:wrap;
border-top:var(--rule) solid var(--line);padding-top:calc(var(--gap)*1.1)}`,
    collapse: '.band{align-items:flex-start}',
  },
  {
    name: 'names',
    note: 'a row of names that wraps, for the one strip of a page that is a list of who.',
    knobs: [],
    css: '.names{display:flex;gap:calc(var(--gap)*1.3);justify-content:center;flex-wrap:wrap;align-items:center}',
  },
  {
    name: 'qa',
    note: 'a question over its answer, under a hairline.',
    knobs: ['--rule'],
    css: '.qa{border-top:var(--rule) solid var(--line);padding-top:.9rem}',
  },
  {
    name: 'card',
    note: 'a filled block. Two borders around one thing divide attention, so a card holds no cards.',
    knobs: [],
    css: '.card{background:var(--surface);border-radius:var(--r);padding:calc(var(--gap)*.95)}',
  },
  {
    name: 'center',
    note: 'centres what is inside it. The box keeps its column, so a centred block still lines up.',
    knobs: [],
    css: `.center{text-align:center}
.center p,.center .ctas{margin-inline:auto}
.center .ctas{justify-content:center}`,
  },
]

/** the shapes a block wears, each a value rather than a second layout */
export const SHAPES = `.halves{--split:1fr 1fr}
.figside{--split:.8fr 1.2fr}
.numbered{--rowsplit:3.4rem 1fr}
.pairs{--tile:20rem}
.ruled{border-top:var(--rule) solid var(--line);padding-top:calc(var(--gap)*.9)}
.row h3{font-size:1rem}
.qa h3{font-size:1.05rem}
.row .stack{--stack:.4rem}
.plan{display:grid;gap:.45rem;align-content:start}
.features{display:flex;flex-direction:column;gap:.4rem;margin:.6rem 0 .5rem}
.figure{display:block}
.mono{font-family:ui-monospace,Menlo,monospace}
.tabular{font-variant-numeric:tabular-nums}
.ink{color:var(--ink)}
.small{font-size:.92rem}`

/**
 * Every block, plus the one place they are allowed to change shape.
 *
 * The collapse is a container query and never a media query. The same page is rendered at three
 * widths in three places, a wall cell, the studio paper and whatever a reader's phone is, and a
 * block that answers to the viewport made the cell and the paper disagree about the same page,
 * so what you picked was not what you opened.
 */
export function blockCss(): string {
  const collapse = BLOCKS.filter((b) => b.collapse).map((b) => b.collapse).join('\n')
  return [
    FRAME,
    ...BLOCKS.map((b) => b.css),
    SHAPES,
    `@container wrap (max-width:34rem){\n${collapse}\n}`,
  ].join('\n')
}

/**
 * The library, written for the model that designs worlds.
 *
 * This is generated rather than described, because the hand written version told the model that
 * images sat inside a figure element and that the quiet action was called btn-ghost, and neither
 * had ever existed. A world would commit thirty lines to being a receipt and land twelve.
 */
export function blockContract(): string {
  return [
    'The page is built from these blocks, and only these. Each is a class on a real element, so a rule you write against one lands on every page that uses it:',
    ...BLOCKS.map((b) => `  .${b.name} - ${b.note}${b.knobs.length ? ` Retuned by ${b.knobs.join(', ')}.` : ''}`),
    '',
    'A block sits on one of three columns and never states a width of its own. text is the reading column, wide is the page column, and full runs edge to edge. text and wide begin at the same line, so a section can be wide or narrow and still start where the last one started.',
    '',
    'Set these rather than writing widths, because moving one of them moves the whole page and the page stays one page:',
    ...TOKENS.map((t) => `  ${t.name}: ${t.note}. ${t.range}.`),
    '',
    'The rest of the markup: section carries data-role, which is claim, proof, substance, offer, objections, invitation or credits, and data-form, which is how that role is set. The first section of each role also carries id of the same name, so #claim styles the opening and [data-role="substance"] reaches every substance section. .wrap is the frame inside each section. h1, h2 and h3 are headings and p is body copy. .eyebrow is the small label above a headline. .ctas holds the actions, .btn-primary is the one real button and .link is the quiet one beside it. .figure wraps a drawn or generated image. .num is the figure beside a numbered row. There is no figure element, no figcaption and no second button style.',
    '',
    'These custom properties carry the palette: --bg, --ink, --dim, --accent, --accent2, --surface, --line, --r for radius, --gap for rhythm.',
  ].join('\n')
}
