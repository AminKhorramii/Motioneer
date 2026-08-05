/**
 * The face vocabulary: four platform stacks certain to be on the machine, and two variable
 * faces carried inside the page itself by render.ts. A leaf file with no imports, because
 * every other layer, tastes, worlds, presets, reads from it.
 */

export const GROTESK = "'Helvetica Neue', Arial, sans-serif"
export const SERIF = "'Charter', 'Iowan Old Style', Georgia, serif"
export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"
export const SANS = "'Inter Variable', 'Inter', -apple-system, sans-serif"
// carried inside the page by render.ts, so these exist on every machine the file reaches
export const FRAUNCES = "'Fraunces Variable', 'Charter', 'Iowan Old Style', Georgia, serif"
export const ARCHIVO = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif"

/**
 * The faces a world may wear. Four are platform stacks certain to be on the machine; two are
 * variable faces carried inside the page itself, because a face at factory defaults chosen by
 * nobody is the deepest typographic tell of a generated page. render.ts embeds a face only
 * when the page wears it, so a page in the platform stacks still ships with no font payload.
 */
export const FACES: Record<string, string> = {
  sans: SANS, grotesk: GROTESK, serif: SERIF, mono: MONO, fraunces: FRAUNCES, archivo: ARCHIVO,
}
