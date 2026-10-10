/**
 * The house style as a check a person runs on their own stylesheets: `npx motioneer lint`.
 *
 * Assembled is measured on everything Motioneer writes; this turns the same measurements on a
 * project's own css, so the style can be held to in code review and not only in a film. It reports
 * and does not refuse unless asked: the gates were calibrated on Motioneer's output, and a product's
 * own motion has reasons a checker cannot see. `--strict` fails the run for CI.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const SHEETS = /\.(css|scss|less|html|svelte|vue)$/i
/** The stylesheet text in a file: all of a css file, or the style blocks in markup. */
const sheetOf = (file, text) => /\.(css|scss|less)$/i.test(file) ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')

async function filesUnder(target, out = []) {
  const s = await stat(target).catch(() => null)
  if (!s) return out
  if (s.isFile()) { if (SHEETS.test(target)) out.push(target); return out }
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', '.next', '.studio', 'motioneer'].includes(entry.name)) continue
    await filesUnder(path.join(target, entry.name), out)
  }
  return out
}

/**
 * @param targets  files or folders; the current folder when empty
 * @returns { files: [{ file, notes }], checked, flagged }
 */
export async function lint(targets, core) {
  const files = []
  for (const t of targets.length ? targets : ['.']) await filesUnder(path.resolve(t), files)
  const reports = []
  for (const file of files) {
    const css = sheetOf(file, await readFile(file, 'utf8'))
    if (!/@keyframes|animation|transition/i.test(css)) continue
    // motion that is not wrapped already gets one note from unstill; the house report names the rest
    // a product's hover and press transitions are not staggered entrances, so the entrance-only checks stay out
    const notes = [...new Set([...core.janky(css), ...core.unstill(css), ...core.assembled(css, { purpose: 'any' }).notes])]
    reports.push({ file: path.relative(process.cwd(), file) || file, notes })
  }
  return { files: reports, checked: reports.length, flagged: reports.filter((r) => r.notes.length).length }
}
