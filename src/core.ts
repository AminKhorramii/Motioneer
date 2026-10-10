/**
 * What runs outside a browser, gathered in one place.
 *
 * The studio is a node program and the MCP server is another, and neither can import TypeScript. So
 * this is the one module vite builds for them, and it exports exactly what they call and nothing
 * else. It used to re-export the whole of Motioneer, which meant a node tool asking for one gate pulled
 * in a page renderer, a composer, an image pipeline and a wasm binding it would never call.
 *
 * The kinds of thing here, and why each is outside the studio rather than inside it:
 *
 *   the decks     what a motion is asked to be, which is taste and belongs in design/
 *   the gates     what judges a written sheet, which has to be the same in the studio, in the MCP
 *                 and in any check, or two callers will disagree about what is acceptable
 *   the palette   the colours a preview is dressed in
 *   the style     Assembled, the house style: its numbers, the sound of each verb, and its report
 */

export { MOTION, MOTION_SYSTEM, dealMotions, dealErrands, VERBS, verbOf, dealVerbs, errandOf, errandFor } from '@/design/motion'
export { ASSEMBLED, SOUNDS, GUIDES, ASSEMBLED_RULES } from '@/design/assembled'
export {
  safeStyle, unmoved, brittle, janky, scopeOf, retimed, tempo, unstill, leaks, grounded, namespaced, typefaces, faceList, unfaced, assembled,
  type Retime, type Tempo, type Written,
} from '@/written'
export { grabJson } from '@/reply'
export { PRESETS } from '@/design/presets'
export { themeOf, themeCss, type Theme, type Tokens } from '@/theme'
export { type Taste } from '@/taste'
export { createProject, validateProject, firstCut, contrastInk, newTrack, lookInk, headlineOf } from './editor/project'
export { LOOKS } from './design/looks'
export { compositionDocument } from './editor/composition'
export { motionBrief, motionDirection } from './design/motion'
export { judgeMotion } from './written'
