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
export { drift, mix, shift, alpha, luminance, type Taste } from '@/taste'
// what a wall remembers, and the story of how one was chosen. Both are file formats other
// programs read, so they belong to the core rather than to the window that happens to write them
export {
  essence, readTasteLog, recordWall, storyOf, tasteAvoid, tasteBrief, tasteLean,
  type Asked, type Essence, type Judged, type Kept, type Killed, type Lean, type Seen,
  type TasteLog, type WallStory, type WallTaste,
} from '@/taste'
export { DIRECTIONS, dealDirections, directionSeed, type Direction } from '@/design/directions'
// the page a model wrote whole, and the filter standing between its markup and the wall
export { madeWritten, safeMarkup, safeStyle, type Written } from '@/written'
export { PRESETS } from '@/design/presets'
export { BLOCKS, TOKENS, blockContract } from '@/design/blocks'
