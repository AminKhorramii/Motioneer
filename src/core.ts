/**
 * The headless core: everything that makes a page, with no browser and no host.
 *
 * This is what every shell shares. The desktop app, the web build, a server that renders on
 * request, and an agent tool all need the same page model, the same renderer, the same worlds
 * and the same checks. Keeping them in one place with no DOM dependency is what makes a second
 * shell cheap to add rather than a fork to maintain.
 */

export * from '@/sections'
export * from '@/worlds'
export * from '@/backdrop'
export * from '@/brief'
export * from '@/slop'
export { MEASURE, WIDTHS, faultsOf, type Measured } from '@/geometry'
export { renderPage, renderSection, renderBody, shellOf } from '@/render'
export { drift, mix, shift, alpha, luminance, contrast, type Taste } from '@/taste'
// what a wall remembers, and the story of how one was chosen. Both are file formats other
// programs read, so they belong to the core rather than to the window that happens to write them
export {
  essence, readTasteLog, recordWall, storyOf, tasteAvoid, tasteBrief, tasteLean,
  type Asked, type Essence, type Judged, type Kept, type Killed, type Lean, type Seen,
  type TasteLog, type WallStory, type WallTaste,
} from '@/taste'
export { DIRECTIONS, dealDirections, dealShapes, dealDepictions, dealMotions, directionSeed, tasteOf, type Direction, type Look } from '@/design/directions'
// the page a model wrote whole, and the filter standing between its markup and the wall
export { madeWritten, madeMark, safeMarkup, safeStyle, undrawn, unmoved, type Written } from '@/written'
// what a world left unspent, which is the question the slop detector never asked
export { unspent } from '@/worlds'
export { PRESETS } from '@/design/presets'
// what is being launched, which decides what the page is made of rather than how it looks. The
// list travels because a suite has to be able to check every kind, and because whoever reads a
// brief is offered these names and their meanings together
export { KINDS, KIND_IDS, DEFAULT_KIND, asKind, kindMenu, type Kind } from '@/design/kinds'
export { BLOCKS, TOKENS, blockContract } from '@/design/blocks'
// the prompt for one drawn thing rather than a page with one on it. It travels because the mark
// path is driven from a tool rather than from the window, and because the deck it composes with
// already lives out here
export { MARK_SYSTEM, MOTION, WRITTEN_SYSTEM } from '@/design/prompts'
// reading one finished reply, which the mark tool needs for the same reason the app does
export { grabJson } from '@/reply'
// a direction said in the token names the rest of the world already uses, with both modes derived
// and every pair that renders measured rather than assumed
export { themeOf, themeCss, themeTailwind, unreadable, swatches, PAIRS, type Theme, type Tokens } from '@/theme'
