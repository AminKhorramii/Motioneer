/**
 * The direction library: fifty descriptions of what good looks like, each grounded in a
 * real thing that already exists and is not a website. Design knowledge, not machinery.
 *
 * These are the seeds dealt to the world design calls. A call that only knows the brief
 * reaches for the median of everything it has read; a call handed a direction inherits a
 * whole set of correlated decisions at once, which is what a designed page has and a
 * generated page lacks. Each entry writes its chain in the app's own vocabulary, faces,
 * measure, density, wear, palette moves, so the model can act on it without translation,
 * and names the one failure that direction is prone to, because every register has its own
 * cliche waiting.
 */

import { FACES } from '@/design/faces'

/**
 * What the object was printed in and set in, as values rather than as prose.
 *
 * Every chain below already describes this: "tinted paper palette", "mono faces, measure under
 * 50, dense", "grotesk heavy, poster scale". Prose is the one part of a direction the machinery
 * could never act on, and the measurements say so twice over. Asked in a prompt for more colour,
 * eight pages typed five colours of their own and reached for a token three hundred and twenty
 * nine times; given the colours as values, the same brief produced thirty nine. Then the same
 * lesson again one level along: twelve grounds carrying only their inks rendered onto identical
 * fixtures as twelve colour schemes wearing one look, because the type and the spacing were still
 * only written down.
 *
 * So both halves live here. The palette is the loudest part of a direction and it is not the
 * direction: a till roll and a wine label are not one system in different paint, and the thing
 * that makes them different is mono against fraunces and dense against sparse.
 *
 * Every one is checked in the suite before it can ship, on the pairs that actually render, in both
 * modes. A palette is taste and can be argued about; a palette nobody can read is not.
 */
export interface Look {
  bg: string
  ink: string
  dim: string
  accent: string
  accent2: string
  /**
   * And the half that is not colour, which was prose until now.
   *
   * The chain above each of these already said it: mono faces and dense for a till roll, serif
   * caps small and sparse for an apothecary label, grotesk heavy at poster scale for a gig flyer.
   * Rendered onto the same fixtures, twelve grounds carrying only their inks came out as twelve
   * colour schemes wearing one look, because every one of them borrowed its type and its spacing
   * from whichever preset happened to be underneath. A palette is the loudest part of a direction
   * and it is not the direction: a receipt and a wine label are not the same system in different
   * paint. This is the rest of the chain, said in values.
   */
  display: keyof typeof FACES
  body: keyof typeof FACES
  scale: number
  radius: number
  density: number
  weight: number
  caps: boolean
  motion: 'still' | 'soft' | 'lively'
  /** the art behind it, when the object implies one */
  backdrop?: string
}

/** a look as the taste sheet the renderer wants, with the faces resolved from their names */
export const tasteOf = (look: Look, name: string) => ({
  name,
  bg: look.bg, ink: look.ink, dim: look.dim, accent: look.accent, accent2: look.accent2,
  display: FACES[look.display], body: FACES[look.body],
  scale: look.scale, radius: look.radius, density: look.density,
  weight: look.weight, caps: look.caps, motion: look.motion,
})

export interface Direction {
  name: string
  /** the real object, which decides every value that follows */
  ground: string
  /** the correlated decisions, stated with the levers a world actually has */
  chain: string
  /** the failure this direction reaches for when done lazily */
  avoid: string
  /** how to write for it */
  voice: string
  /** what it was printed in and set in, when the object is specific enough to be worth taking */
  look?: Look
}

export const DIRECTIONS: Direction[] = [
  {
    name: 'thermal receipt',
    ground: 'the till roll a shop prints: one narrow column, everything itemised, a total that matters more than anything above it',
    chain: 'mono faces, measure under 50, dense, ruled, monochrome palette, offer worn as a table, claim as prose, rhythm tight with one long breath before the offer',
    avoid: 'drawing a torn paper edge on screen, which is a prop; the receipt is the column and the discipline, not the paper',
    voice: 'Itemised and unpersuasive. Names, quantities, amounts.',
    // till roll: no colour at all, because the machine only burns one
    look: { bg: '#f7f6f2', ink: '#1a1a18', dim: '#6e6d68', accent: '#2b2b28', accent2: '#8d8b84',
      display: 'mono', body: 'mono', scale: 1.15, radius: 0, density: 0.8, weight: 500, caps: false, motion: 'still' },
  },
  {
    name: 'boarding pass',
    ground: 'the airline stub: a few facts that matter enormously, set large, with everything else in agate around them',
    chain: 'grotesk display over sans, huge scale for the two facts, tiny for the rest, unruled, one accent used once, claim as statement, credits dense',
    avoid: 'the fake barcode, which promises a scanner and delivers decoration',
    voice: 'Facts first. Gate, seat, time. No sentence longer than a glance.',
  },
  {
    name: 'luggage tag',
    ground: 'a manila tag with an eyelet: one destination code enormous, routing in small print, string through everything',
    chain: 'grotesk at poster scale for one word or code, sans agate for the rest, tinted paper palette, five sections at most, bleed off',
    avoid: 'aging the paper with texture; the tag is the hierarchy, not the distressing',
    voice: 'A destination and a handling instruction. Nothing persuades.',
  },
  {
    name: 'transit ticket',
    ground: 'a metro fare card or a punched paper ticket: zones, a validity window, a serial number that means business',
    chain: 'sans throughout, small scale, dense, numbered sections, mono palette with one municipal accent, offer as a table of zones',
    avoid: 'nostalgia; the ticket is administrative confidence, not a souvenir',
    voice: 'Terms stated flatly, as if validity were not negotiable.',
  },
  {
    name: 'betting slip',
    ground: 'the bookmaker form: selections, odds and a stake, with the possible return computed in front of you',
    chain: 'mono for figures with tabular numerals, dense, ruled, offer as a transcript, proof as a bare quote, contrast palette',
    avoid: 'excitement; the slip is dry precisely because the stakes are real',
    voice: 'Selections and odds. The reader does the arithmetic of wanting it.',
  },
  {
    name: 'telegram',
    ground: 'the wire message: words priced individually, so every one earned its place, pasted in strips on a form',
    chain: 'mono display, caps on, short measure, sparse rhythm with hard stops, claim as statement of very few words, no figure at all',
    avoid: 'writing long; a telegram that runs on has failed at the only thing it is',
    voice: 'Six words where twenty would go. Full stops as punctuation and as drama.',
  },
  {
    name: 'postage stamp sheet',
    ground: 'a sheet of stamps: one small perfect image repeated with denomination and country, gutters doing the framing',
    chain: 'serif display small but fine, generous margins, figure as the one artwork, tinted palette, five sections, credits as colophon',
    avoid: 'perforating the borders in CSS; the sheet is the repetition and restraint',
    voice: 'A denomination and an occasion. Ceremony in miniature.',
    // engraved: deep carmine and a bottle green on gummed paper
    look: { bg: '#f4efe2', ink: '#1e1b16', dim: '#6b655a', accent: '#7a2438', accent2: '#2a5148',
      display: 'serif', body: 'serif', scale: 1.3, radius: 2, density: 0.3, weight: 400, caps: true, motion: 'still' },
  },
  {
    name: 'classified ads page',
    ground: 'the back pages of a paper: hundreds of tiny entries, capital lead-ins, abbreviations a regular reader knows',
    chain: 'sans agate, measure short, density at the top of the range, ruled columns, substance as a table, many sections',
    avoid: 'letting anything be large; one big element breaks the spell of the wall of small',
    voice: 'Abbreviated, priced, direct. Every word costs a penny.',
  },
  {
    name: 'index card catalogue',
    ground: 'the library drawer: one card per record, a heading, a classification number, typed lines that never quite align',
    chain: 'mono body, sans headings, ruled, numbered sections, short measure, monochrome, objections as a list',
    avoid: 'simulating a card with drop shadows; the card is the record structure, not the rectangle',
    voice: 'Catalogued. Title, author, subject, shelf.',
  },
  {
    name: 'departures board',
    ground: 'the airport flap display: rows of destinations and times, a status column where everything happens',
    chain: 'grotesk caps, tabular figures, dense ruled rows, dark ground with one signal accent, substance as a table, claim as statement',
    avoid: 'animating the flaps; the board is the grid of certainty, not the mechanism',
    voice: 'Destination, time, status. The status column carries all the emotion.',
    // split flap: amber for now, green for boarding, everything else off
    look: { bg: '#0b0d0e', ink: '#e8e6df', dim: '#7d817c', accent: '#e8a33d', accent2: '#6fb98f',
      display: 'grotesk', body: 'mono', scale: 1.25, radius: 0, density: 0.75, weight: 700, caps: true, motion: 'soft' },
  },
  {
    name: 'metro signage',
    ground: 'the transit system sign: one typeface at a few fixed sizes, colour used only to name lines, arrows that commit',
    chain: 'sans display at large fixed steps, bleed on, accents as line colours used solidly, sparse rhythm, claim as statement',
    avoid: 'decorating; a sign with an ornament is a sign that failed',
    voice: 'Directions, not descriptions. This way. That way. Exit.',
  },
  {
    name: 'aircraft safety card',
    ground: 'the seat pocket card: numbered steps, figures doing the talking, words kept to labels',
    chain: 'sans, numbered sections, figures as the substance, short captions, tinted palette, rhythm even and calm',
    avoid: 'humour; the card is calm authority, and a joke breaks the authority',
    voice: 'Imperative and short. Pull the handle. Step out.',
  },
  {
    name: 'fire exit plan',
    ground: 'the framed floor plan by a lift: you are here, the routes in one colour, everything else in grey',
    chain: 'sans, one accent against greys, figure as the hero, mono palette, five sections, unruled',
    avoid: 'many accents; the plan works because exactly one thing is red',
    voice: 'Locational and certain. The nearest exit may be behind you.',
  },
  {
    name: 'scoreboard',
    ground: 'the stadium board: two names, two numbers, a clock, all legible from the far stand',
    chain: 'grotesk at maximum scale, tabular numerals, dark ground, contrast palette, three or four sections only, statement wear throughout',
    avoid: 'small type anywhere; if it cannot be read from the cheap seats it does not belong',
    voice: 'Numbers first. The score is the story.',
  },
  {
    name: 'weather bulletin',
    ground: 'the shipping forecast page: regions in sequence, terse conditions, a rhythm the listener knows by heart',
    chain: 'serif body, sans labels, even ruled rhythm, muted tinted palette, substance as prose in short runs, objections as a list',
    avoid: 'illustration; the forecast is the cadence of the words, not a sun icon',
    voice: 'Region, condition, outlook. Falling slowly.',
  },
  {
    name: 'tide table',
    ground: 'the harbour almanac: columns of times and heights, a month at a glance, moon phases in the margin',
    chain: 'mono figures with sans labels, dense table wear for substance and offer, numbered, muted palette, margin notes',
    avoid: 'waves as decoration; the sea is in the numbers',
    voice: 'Times and heights. The reader brings the urgency.',
  },
  {
    name: 'lab notebook',
    ground: 'the bound record: dated entries, observations in full sentences, corrections struck through and initialled, nothing erased',
    chain: 'serif body at reading size, mono for data, ruled, numbered, long measure, proof as a quote from the record',
    avoid: 'perfection; a notebook with no visible thinking reads as fabricated',
    voice: 'Observed, dated, signed. Claims only as strong as the entry supports.',
  },
  {
    name: 'hospital chart',
    ground: 'the clipboard at the foot of the bed: vitals over time, checkboxes, a strict form filled in a hurry',
    chain: 'sans, dense, ruled rows, substance as a table, objections as a list, one clinical accent, tabular figures',
    avoid: 'softening; the chart earns trust by refusing to comfort',
    voice: 'Measured, timed, charted. No adjectives on a chart.',
  },
  {
    name: 'engineering datasheet',
    ground: 'the component PDF: absolute maximum ratings, characteristic curves, a features list that is actually a specification',
    chain: 'sans, dense, numbered sections, substance as a table with units, figure as one curve, mono palette',
    avoid: 'marketing creeping into the features table; a datasheet that persuades is not believed',
    voice: 'Parameters with units and conditions. Typical and maximum.',
  },
  {
    name: 'blueprint',
    ground: 'the architectural drawing: white lines on prussian blue, dimensions strung between arrows, a title block in the corner',
    chain: 'mono labels, one pale ink on one deep ground, unruled but dimensioned, figure as the hero, credits as a title block',
    avoid: 'the blueprint blue as a costume on ordinary layout; the drawing convention is the point',
    voice: 'Dimensioned. Everything named, nothing sold.',
    // cyanotype: white lines bitten out of prussian blue
    look: { bg: '#10315e', ink: '#eef3fb', dim: '#9fb6d6', accent: '#ffffff', accent2: '#7fb2e8',
      display: 'mono', body: 'mono', scale: 1.2, radius: 0, density: 0.6, weight: 500, caps: true, motion: 'still' },
  },
  {
    name: 'topographic map',
    ground: 'the survey sheet: contour lines, a legend that unlocks everything, place names in a hierarchy of italic and roman',
    chain: 'serif place names over sans labels, contours backdrop, legend as a list, muted earth palette, margin scale',
    avoid: 'using the map as texture only; the legend and the names carry the authority',
    voice: 'Named and gridded. Heights above datum.',
  },
  {
    name: 'star chart',
    ground: 'the planisphere: white points on near black, constellation lines, magnitudes as sizes, a horizon ring',
    chain: 'dark ground, fine sans, one pale accent, sparse rhythm, figure as the sky, claim as statement over it',
    avoid: 'a purple nebula wash; the chart is points and lines, not a poster of space',
    voice: 'Precise wonder. Magnitudes and names, not awe adjectives.',
    // night sky printing: white stars, cyan for the ecliptic
    look: { bg: '#070c1c', ink: '#e6ecf7', dim: '#7d8aa6', accent: '#f2f5fb', accent2: '#58c8e8',
      display: 'sans', body: 'sans', scale: 1.4, radius: 0, density: 0.28, weight: 300, caps: true, motion: 'still' },
  },
  {
    name: 'field guide',
    ground: 'the pocket naturalist book: one species per spread, plate opposite description, marks that distinguish similar things',
    chain: 'serif body, italic binomials, figure opposite prose, numbered plates, tinted paper, objections as distinguishing marks',
    avoid: 'generic nature imagery; the guide lives on the one distinguishing detail',
    voice: 'Distinguishing marks first. Easily confused with, except for.',
    // tinted plates against cream: field green and a mammal brown
    look: { bg: '#f3eee1', ink: '#221f18', dim: '#6c6558', accent: '#3f5e3a', accent2: '#8a5a2b',
      display: 'serif', body: 'serif', scale: 1.34, radius: 2, density: 0.42, weight: 400, caps: false, motion: 'still' },
  },
  {
    name: 'nutrition label',
    ground: 'the panel on the packet: a bold rule hierarchy, amounts per serving, percentages against a stated reference',
    chain: 'sans with thick and thin rules, dense table wear, tabular figures, monochrome, claim short above the panel',
    avoid: 'decoration inside the panel; the label is regulation made visible',
    voice: 'Amounts per serving. The percentages are the argument.',
  },
  {
    name: 'dictionary entry',
    ground: 'the headword page: bold entries, pronunciation in brackets, numbered senses, etymology in small type at the end',
    chain: 'serif at reading size, hanging headwords, numbered senses as a list, long measure, credits as etymology',
    avoid: 'defining loosely; an entry that gestures is not an entry',
    voice: 'Sense one, sense two. From the Latin.',
  },
  {
    name: 'man page',
    ground: 'the terminal manual: name, synopsis, description, options, in an order every user of it knows',
    chain: 'mono throughout, caps section labels, dense, objections as options list, offer as synopsis, no figure',
    avoid: 'friendliness; the man page respects the reader by wasting nothing',
    voice: 'Name. Synopsis. Description. Exit status.',
  },
  {
    name: 'terminal session',
    ground: 'a real transcript: prompts, commands, output, the history of something actually done',
    chain: 'mono, claim as transcript, offer as transcript, contours backdrop, dense, one phosphor accent',
    avoid: 'drawing the window chrome; the session is the text, and dots are a prop',
    voice: 'Commands and output. The output is the proof.',
    // phosphor on unlit glass, and the amber a second channel used to be
    look: { bg: '#05070a', ink: '#cfe9d4', dim: '#5d8168', accent: '#3ddc84', accent2: '#d8c53a',
      display: 'mono', body: 'mono', scale: 1.18, radius: 0, density: 0.8, weight: 500, caps: false, motion: 'lively', backdrop: 'contours' },
  },
  {
    name: 'broadsheet front page',
    ground: 'the morning paper: a masthead, one story led big, columns of disciplined text, rules between everything',
    chain: 'fraunces display over serif body, ruled columns, long measure, claim as statement under a masthead slug, proof as a pull quote',
    avoid: 'many stories led equally; the front page works because one lead was chosen',
    voice: 'Reported, not promoted. The headline states what happened.',
  },
  {
    name: 'paperback cover',
    ground: 'the mid-century series design: a colour band system, one typeface, a grid so strong the title floats in it',
    chain: 'grotesk display, banded tinted palette, five sections, statement wear, no figure or one small mark',
    avoid: 'an illustration fighting the grid; the series look is the grid honoured',
    voice: 'A title and an author. The restraint is the promise of quality.',
  },
  {
    name: 'record sleeve',
    ground: 'the jazz label cover: one photograph or one field of colour, type set with total confidence, a catalogue number worn proudly',
    chain: 'grotesk display at scale, one accent on near black or near white, sparse, figure as the one image, credits as liner notes',
    avoid: 'pastiche of a specific famous sleeve; take the confidence, not the artefact',
    voice: 'Personnel and takes. The music is not described, it is credited.',
  },
  {
    name: 'risograph zine',
    ground: 'the two-colour print run: one spot colour over paper, misregistration accepted, type that was photocopied with love',
    chain: 'sans bold, two inks via tinted palette, bleed on, uneven rhythm, grain backdrop, statement wear',
    avoid: 'simulating misprint precisely; take the two-ink constraint, not fake noise',
    voice: 'Direct and a little loud. Made by someone, for someone.',
    // two drums, fluorescent pink and riso blue, muddy where they cross. The pink is a step down
    // from the ink itself: fluorescent pink sits in the band where neither black nor white clears
    // the floor for a button label, which is the real reason riso work sets black type beside the
    // pink rather than reversing out of it
    look: { bg: '#f2efe6', ink: '#17161a', dim: '#5f5c58', accent: '#e21f57', accent2: '#1552c9',
      display: 'grotesk', body: 'sans', scale: 1.5, radius: 0, density: 0.55, weight: 800, caps: false, motion: 'lively', backdrop: 'grain' },
  },
  {
    name: 'gig flyer',
    ground: 'the photocopied A5 on a lamppost: who, where, when, at sizes ordered by what matters to the door',
    chain: 'grotesk heavy, poster scale, contrast palette, four sections, claim as statement, invitation as band',
    avoid: 'careful kerning; the flyer is urgency, and polish reads as a brand pretending',
    voice: 'Who, where, when, how much. Doors at eight.',
    // photocopied black on whatever fluorescent stock the shop had
    look: { bg: '#0d0d0d', ink: '#f2f2f2', dim: '#8f8f8f', accent: '#f5f13c', accent2: '#ff5ea8',
      display: 'grotesk', body: 'grotesk', scale: 1.62, radius: 0, density: 0.6, weight: 900, caps: true, motion: 'lively' },
  },
  {
    name: 'film title card',
    ground: 'the opening frame: one line of type against black or a still, held long enough to be read twice',
    chain: 'serif or grotesk display alone, near black ground, sparse to the point of empty, statement wear, one slow entrance',
    avoid: 'more than one idea on screen; the card is patience',
    voice: 'One line. Then the next card.',
  },
  {
    name: 'museum wall label',
    ground: 'the card beside the work: artist, title, date, materials, then one paragraph that trusts the viewer',
    chain: 'serif at reading size, generous margins, unruled, five sections, quote wear for proof, credits as accession line',
    avoid: 'explaining the work to death; the label stops one sentence early',
    voice: 'Materials and provenance. One observation, then silence.',
  },
  {
    name: 'auction catalogue',
    ground: 'the lot listing: a photograph, a description in house style, an estimate range that concentrates the mind',
    chain: 'serif body, figure per lot, numbered lots, offer as a table of estimates, cream tinted palette',
    avoid: 'superlatives; condition is reported, importance is implied by the estimate',
    voice: 'Lot, provenance, condition, estimate.',
  },
  {
    name: 'type specimen sheet',
    ground: 'the foundry broadside: one face shown at every size, pangrams and figures, the name set in itself',
    chain: 'one display face celebrated at many scales, table of sizes, monochrome, substance as the specimen itself',
    avoid: 'a second typeface anywhere; the sheet is monogamy',
    voice: 'The quick brown fox. Available in these weights.',
  },
  {
    name: 'colophon page',
    ground: 'the last page of a well-made book: the faces named, the paper named, the printer thanked, the edition numbered',
    chain: 'serif small, centred or margin set, sparse, credits as the hero section, no figure',
    avoid: 'turning it into a footer; the colophon is pride, set small',
    voice: 'Set in. Printed by. This is number.',
  },
  {
    name: 'annual report',
    ground: 'the audited accounts: a chairman letter in restrained type, then tables that cannot lie, notes that confess everything',
    chain: 'serif letter then sans tables, tabular figures, numbered notes, one sober accent, offer as a table',
    avoid: 'infographic cheer; the report is credible because it is dull where it must be',
    voice: 'Results, then notes to the results. The notes are where the truth lives.',
  },
  {
    name: 'terms sheet',
    ground: 'the legal one-pager: defined terms in bold, numbered clauses, a signature block that means it',
    chain: 'serif, numbered sections, long measure, dense, objections as clauses, credits as signature block',
    avoid: 'fine print theatrics; the sheet is clarity wearing a suit',
    voice: 'Defined terms used exactly. The parties agree as follows.',
  },
  {
    name: 'ledger',
    ground: 'the bound account book: ruled feints, debits and credits in columns, a balance carried forward in a steadier hand',
    chain: 'mono figures, double rules between sections, dense, table wear, muted palette, carried-forward rhythm',
    avoid: 'aging it; the ledger is the discipline of the columns, not sepia',
    voice: 'Entered, dated, balanced. Carried forward.',
  },
  {
    name: 'bank statement',
    ground: 'the monthly letter: transactions in strict rows, running balance, a closing figure that ends the argument',
    chain: 'sans, tabular figures, ruled rows, dense, substance as a table, one accent for the closing balance',
    avoid: 'friendliness in the rows; warmth belongs in the letterhead, never the figures',
    voice: 'Date, description, amount, balance.',
  },
  {
    name: 'phone directory',
    ground: 'the thin-paper book: thousands of names in agate columns, bold surnames, the typography of maximum density',
    chain: 'sans agate, extreme density, ruled columns, short measure, substance as a table, monochrome',
    avoid: 'air; the directory is beautiful because it refuses whitespace',
    voice: 'Surname first. Number last. Nothing between.',
  },
  {
    name: 'seed packet',
    ground: 'the garden envelope: one painted vegetable, sowing instructions in tiny type, a promise of the summer',
    chain: 'serif display, figure as the one illustration, tinted warm paper, sowing table for substance, five sections',
    avoid: 'vintage filters; take the structure of promise plus instructions, not the nostalgia',
    voice: 'Sow in spring. Thin to six inches. Harvest when.',
    // spot red and spot green on kraft board, no fourth plate
    look: { bg: '#dfcfa9', ink: '#241d12', dim: '#6a5a41', accent: '#b4331f', accent2: '#2f6b3f',
      display: 'fraunces', body: 'serif', scale: 1.38, radius: 4, density: 0.4, weight: 600, caps: false, motion: 'soft' },
  },
  {
    name: 'apothecary label',
    ground: 'the chemist bottle: contents named in latin and english, dosage exact, poison marked without ambiguity',
    chain: 'serif caps small, ruled border as the one move, cream palette, dosage as a table, sparse',
    avoid: 'skulls and flourish; the label is exactness, and ornament dilutes a dose',
    voice: 'Contents, dose, caution. Not to be taken.',
    // the green leads and the sepia answers, which is the way round an apothecary label actually
    // works: the colour carries what is in the bottle. Drawn the other way first, and sepia on
    // aged stock is cream and rust, which is the register generated pages have converged on
    look: { bg: '#eee5cf', ink: '#26200f', dim: '#6d6247', accent: '#3f5a28', accent2: '#7a2f12',
      display: 'serif', body: 'serif', scale: 1.22, radius: 0, density: 0.35, weight: 500, caps: true, motion: 'still' },
  },
  {
    name: 'wine label',
    ground: 'the estate bottle: a name, a year, a place, in type that has not changed in decades because it has not needed to',
    chain: 'serif or fraunces display, one vintage figure large, cream tinted, sparse, credits as the estate line',
    avoid: 'a story paragraph; the label is a name and a year trusted',
    voice: 'Named, dated, placed. The year does the talking.',
    // oxblood and a gold foil on uncoated cream
    look: { bg: '#efe7d6', ink: '#1c1712', dim: '#6a6053', accent: '#6d1f2b', accent2: '#a8842f',
      display: 'fraunces', body: 'serif', scale: 1.44, radius: 0, density: 0.3, weight: 400, caps: true, motion: 'still' },
  },
  {
    name: 'bistro menu',
    ground: 'the single typed sheet: dishes and prices with dot leaders, changed daily, corrections accepted',
    chain: 'serif or mono typed feel, offer as a priced table, short measure, tinted paper, uneven daily rhythm',
    avoid: 'adjective inflation; a menu that says delicious has already lost',
    voice: 'The dish, its parts, its price.',
  },
  {
    name: 'recipe card',
    ground: 'the box card: ingredients as a strict list, method in numbered steps, butter stains earned in use',
    chain: 'sans, ingredients as a list, method numbered, short measure, warm tinted palette, five to six sections',
    avoid: 'life-story preamble; the card starts at the ingredients',
    voice: 'Ingredients, then method. Serves four.',
  },
  {
    name: 'instruction manual',
    ground: 'the flat-pack booklet: numbered figures, no words where a drawing serves, parts inventoried before anything begins',
    chain: 'sans labels only, figures as the substance, numbered, sparse text, mono palette, parts list as a table',
    avoid: 'writing what should be drawn; the manual trusts the figure',
    voice: 'Step one. Step two. The drawing is the sentence.',
  },
  {
    name: 'stationery set',
    ground: 'the good letterhead: a name and address set once, perfectly, and a page that is mostly paper',
    chain: 'sans or serif small, one line of identity, extreme whitespace, tinted paper, five sections at most',
    avoid: 'filling the page; the stationery is the restraint of the empty sheet',
    voice: 'A letter, not a leaflet. Address the reader once, properly.',
  },
  {
    name: 'exhibition poster',
    ground: 'the gallery announcement: an artist name at architectural scale, dates and address in a strip, one work or none',
    chain: 'archivo display at wall scale, bleed on, contrast palette, four sections, claim as statement, invitation as band',
    avoid: 'crowding the name; the poster is one name given room',
    voice: 'A name, two dates, one address.',
  },
  {
    name: 'passport page',
    ground: 'the visa spread: security pattern under official type, fields with fixed labels, stamps that prove movement',
    chain: 'sans small caps labels, fine pattern backdrop, muted palette, fields as a table, numbered pages',
    avoid: 'imitating a specific country; take the officialdom, not the crest',
    voice: 'Surname. Given names. Nationality. The fields ask, the holder answers.',
  },
]

const shuffled = (xs: Direction[]): Direction[] => {
  const deck = [...xs]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/**
 * How many hands a memory may claim, and how many stay wild whatever it says.
 *
 * A share rather than a count. This was "at most two, and always leave three wild", which was
 * written when the deck dealt five hands and quietly became "leave nothing to the memory" when it
 * dealt two: min(2, 2 - 3) is negative, so a wall whose design half had shrunk got no favoured
 * hand at all and the half of the memory about what a person keeps could never reach anybody.
 * Half the hands, capped at two, says the same thing about a five hand deal and still means
 * something about a two hand one.
 */
const FAVOURED = 2
const WILD_SHARE = 2

/**
 * Deal directions into hands, one per world, sampled fresh each wall so the library is
 * explored rather than the same eight repeated. The deal is random by design: variety
 * across walls is the point of having fifty.
 *
 * A memory of what this person keeps tilts the deal and is not allowed to decide it, because
 * the failure mode of a system that learns your taste is that it stops showing you anything
 * else, and a wall of eight pages you already like is not a wall. The guarantee is structural
 * rather than tuned: at most two hands come from what was liked and never more than half of
 * them, the rest are drawn from the whole library, and a ground has to be culled repeatedly
 * before it stops being dealt at all. If a wall ever smells samey, the first knob is the
 * favoured count and not the mechanism.
 */
export function dealDirections(n: number, lean?: { favor: string[]; shun: string[] }): Direction[] {
  const shunned = (d: Direction) => Boolean(lean?.shun.includes(d.name))
  // a ground both liked and culled is neither, rather than liked twice over
  const liked = (d: Direction) => Boolean(lean?.favor.includes(d.name)) && !shunned(d)
  const favoured = shuffled(DIRECTIONS.filter(liked)).slice(0, Math.max(0, Math.min(FAVOURED, Math.floor(n / WILD_SHARE))))
  /**
   * Every liked ground leaves the wild pool, not only the two that were dealt.
   *
   * Filtering out just the dealt pair left the rest of them drawable a second time, which read as
   * a cap and was not one: a taste that had settled on twenty five of the fifty one grounds took
   * more than two hands in five deals out of six, and took all five in one deal in ten. The cap
   * is on the wall and not on the deal, so it has to be enforced against the whole liked set.
   */
  const wild = shuffled(DIRECTIONS.filter((d) => !liked(d) && !shunned(d)))
  const dealt = [...favoured, ...wild].slice(0, n)
  // A memory may bias a wall and may never shrink it. A shun list wide enough to empty the deck
  // gives its grounds back rather than handing back fewer hands than the wall has places, because
  // a wall of five with three hands is a worse answer than one that deals something disliked.
  const short = n - dealt.length
  if (short > 0) dealt.push(...shuffled(DIRECTIONS.filter((d) => !dealt.includes(d))).slice(0, short))
  return shuffled(dealt)
}

/** one direction, folded to the line a design call is handed */
export const directionSeed = (d: Direction): string =>
  `${d.name}: ${d.ground}. Chain: ${d.chain}. Avoid ${d.avoid}. Voice: ${d.voice}`

/**
 * A silhouette for each hand, dealt rather than left to every call to work out for itself.
 *
 * The arranged path learned this the hard way and wrote it down: measured across two real walls,
 * the model chose a column four times in five, both times, and never once reached for anything
 * else. That is not the prompt failing to describe the alternatives. Every call is handed one
 * ground and cannot see the other seven, so each independently picks the arrangement that best
 * fits the object it was given, and for most objects that is a column. Variety across a wall
 * cannot come out of independent calls each choosing the most natural answer.
 *
 * The written path deals grounds and never dealt this, so eight pages agreed on their shape while
 * disagreeing about everything else. It is a lean rather than an instruction, on the same terms:
 * a ground that genuinely refuses its shape should win, because a spread forced onto a receipt is
 * worse than another column.
 */
const SHAPES = [
  'a single column, read straight down',
  'a spread: the opening held still in a panel while the rest of the argument travels past it',
  'a grid on two tracks, with some things spanning both',
  'a stepped arrangement where no two consecutive things begin at the same left edge',
  'one full bleed field, with everything set into it rather than stacked on it',
  'a stack of bands edge to edge, each one a different height',
]

export function dealShapes(n: number): string[] {
  const deck = [...SHAPES]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  // more hands than shapes means a repeat, which is honest: six silhouettes across eight papers
  // still disagrees far more than eight independent calls each choosing a column
  return Array.from({ length: n }, (_, i) => deck[i % deck.length])
}

/**
 * How the subject is depicted, which is the axis nothing here has ever varied.
 *
 * Measured by pulling every drawn element out of three real walls and looking at them together:
 * of twelve marks, nine were the same watch dial. A circular bezel, a tick ring, two hands at
 * about ten past ten, a crown on the right. Across twenty four independent calls the engine drew
 * one object over and over, and what differed between them was almost entirely the palette.
 *
 * This is the same failure dealShapes was written for, one level down, and it has the same cause.
 * Every call is handed a subject and cannot see the other seven, so each independently picks the
 * most obvious way to render it, and for a watch that is a dial seen face on. Anti convergence
 * that stops at the page cannot reach it: the ground varies, the silhouette of the page varies,
 * and then eight calls all draw the same picture inside them.
 *
 * The entries are ways of looking rather than subjects, so they compose with any ground. A dive
 * watch becomes a case in section, an exploded parts diagram, a lume plot repeated, a bezel at
 * four times size. A lean and not an instruction, on the same terms as the shapes: a subject that
 * genuinely refuses its depiction should win, because a forced cutaway is worse than a good
 * elevation.
 */
const DEPICTIONS = [
  'in cross section, cut through so the inside is the picture',
  'exploded, the parts separated along one axis with the gaps doing the explaining',
  'in plan, seen from directly above with nothing in perspective',
  'as a solid silhouette, no interior detail, the outline carrying all of it',
  'as a repeat, the one form tiled or ranked until the pattern is the subject',
  'as a detail at several times size, cropped so the whole is never shown',
  'as a labelled diagram, with leader lines to the parts that are named',
  'ghosted, the outer shell drawn faintly so an inner part reads through it',
]

export function dealDepictions(n: number): string[] {
  const deck = [...DEPICTIONS]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return Array.from({ length: n }, (_, i) => deck[i % deck.length])
}
