/**
 * Art direction: the looks a film wears, and the mix that decides which shot wears which.
 *
 * A capture film used to put every element in the same centred box on a flat colour, which is a
 * template rather than a composition. These are the decisions an art director makes once and holds
 * across a film: a ground, a material, a type system, and how the interface is presented.
 *
 * Plate makes the house style visible. The interface is printed onto stock as a plate of its own
 * ground, a hair off register in cyan and magenta, with crop marks, registration targets, its real
 * measurement and a colour strip around it, and the type is set like a job sheet. In motion the
 * marks draw first, the plate prints, the plates register and the parts assemble.
 *
 * Editorial is a spread. A page holds the type on a grid, and the interface is cropped hard into one
 * passage at about twice its size, so it reads as a detail of the product rather than a screenshot.
 *
 * The mix uses Plate for openings, headlines, pairs and the closing, and Editorial for detail, so a
 * film moves between the whole sheet and a passage of it. Sizes are pixels at 1080 high.
 *
 * Data only. The first cut composes shots from it in editor/project.ts, and the runtime in
 * editor/composition.ts draws it. (The authored reels keep their own font themes in tools/editor/art-direction.mjs.)
 */
export type Look = 'plate' | 'editorial'

export const LOOKS = {
  plate: {
    stock: '#ece8df',
    ink: '#151412',
    /** fibre in the stock: the opacity of a drawn noise, multiplied over everything printed on it */
    grain: 0.5,
    vignette: 'rgba(60,48,30,.16)',
    /** the cyan and magenta plates, and how far off register they sit when the plate prints and at rest */
    fringe: ['rgba(0,160,228,.62)', 'rgba(230,0,126,.5)'] as [string, string],
    registerFrom: 9,
    registerTo: 2,
    /** crop marks: their distance from the sheet and their length */
    markGap: 16,
    markLength: 30,
    /** process colours, printed after the brand's own in the colour strip */
    process: ['#00a0e4', '#e6007e', '#ffe500', '#151412'],
    /** where a sheet sits beside its type, and where it sits alone when there are no words to set beside it, as percentages of the frame */
    sheet: { x: 38.5, y: 17, width: 55.5, height: 66 },
    alone: { x: 14, y: 16, width: 72, height: 66 },
  },
  editorial: {
    /** the page a spread sets its type on, light beside a dark product and dark beside a light one */
    light: '#f3f2ee',
    dark: '#0c0d10',
    /** the page's share of the frame's width; the product's passage fills the rest */
    field: 0.396,
    grain: 0.35,
    /** how far past fitting the passage is enlarged, and how much further it drifts while held */
    zoom: 2,
    drift: 0.04,
    /** the most a capture is enlarged past its own size, since the pictures inside it are pixels */
    sharpest: 2.6,
    /** a crop less than this past fitting is not a passage, so the shot prints as a sheet instead */
    least: 1.25,
    /** where each passage of a capture centres, in turn, as fractions of the capture: a capture that comes back shows another part of itself */
    focus: [{ x: 0.24, y: 0.3 }, { x: 0.72, y: 0.62 }, { x: 0.5, y: 0.45 }, { x: 0.78, y: 0.26 }],
  },
  type: {
    /** a short line, such as a name, is set large enough to carry a sheet on its own */
    short: 14,
    shortSheet: 210,
    sheet: 120,
    headline: 96,
    spread: 124,
    label: 15,
    caption: 12,
  },
  /** milliseconds: marks draw, the plate prints, the plates register, and type is set a character at a time */
  timing: { marks: 300, print: 420, register: 620, perCharacter: 26 },
  /** a capture with no picture in it and this little height is type, so it is set as type rather than filmed */
  typeOnly: 180,
  /** the generic noun a planned name ends in, cut so what is left can head a shot; a name still longer than this heads nothing */
  generic: /\s+(product\s+)?(interface|workspace|section|card|screen|view|panel|component|module|area|block|element|widget|dashboard|ui|page)s?$/i,
  nameLength: 40,
  /** the picker's own label for an element it could not name, which says where it was rather than what it is */
  anonymous: /^the (image|picture|button|heading|link|card|section|element|text|paragraph|list|logo|icon|video|figure|form|input|banner|block)\b/i,
  /** a headline is kept whole up to this length, and a longer one stops at a clause, never on a small word */
  headlineLength: 56,
  small: /\s(of|to|the|a|an|and|or|for|in|into|with|on|at|by|from|your|our)$/i,
  /** a capture this much wider than tall is a hero: its own headline already carries the sheet, so nothing is set beside it */
  hero: 2.4,
}
