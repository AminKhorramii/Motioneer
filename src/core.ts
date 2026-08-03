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
export { renderPage, renderSection } from '@/render'
export { PRESETS, drift, mix, shift, alpha, luminance, type Taste } from '@/taste'
