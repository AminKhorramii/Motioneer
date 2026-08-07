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
// Registers the platform stacks cannot reach. Each falls back to the nearest platform face, so
// a page that fails to load one still lands in the right family rather than on a default.
export const BRICOLAGE = "'Bricolage Grotesque Variable', 'Helvetica Neue', Arial, sans-serif"
export const SYNE = "'Syne Variable', 'Helvetica Neue', Arial, sans-serif"
export const BODONI = "'Bodoni Moda Variable', 'Didot', 'Times New Roman', serif"
export const MARTIAN = "'Martian Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"
export const DOTO = "'Doto Variable', ui-monospace, Menlo, monospace"
// the faces the named design systems ship with. Neither is certain to be installed, so each
// falls back to the closest platform grotesque rather than to a default nobody chose
export const ROBOTO = "'Roboto', 'Helvetica Neue', Arial, sans-serif"
export const PLEX = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"

/**
 * The faces a world may wear. Four are platform stacks certain to be on the machine; two are
 * variable faces carried inside the page itself, because a face at factory defaults chosen by
 * nobody is the deepest typographic tell of a generated page. render.ts embeds a face only
 * when the page wears it, so a page in the platform stacks still ships with no font payload.
 */
export const FACES: Record<string, string> = {
  sans: SANS, grotesk: GROTESK, serif: SERIF, mono: MONO, fraunces: FRAUNCES, archivo: ARCHIVO,
  roboto: ROBOTO, plex: PLEX,
  bricolage: BRICOLAGE, syne: SYNE, bodoni: BODONI, martian: MARTIAN, doto: DOTO,
}
