/**
 * The brief: everything needed to rebuild this page somewhere else, and nothing else.
 *
 * It is written for a model that has to produce UI from it, so the tokens appear once rather
 * than under every section, arrays collapse onto one line, and the closing instruction is a
 * sentence rather than a paragraph. The earlier version repeated the same six lines of tokens
 * nine times, which was most of its length and none of its information.
 */

import { ROLE_LABEL, type Page } from '@/sections'
import { worldById } from '@/worlds'

/** a value on one line, so a nested list reads as a list rather than as run together text */
const flat = (v: unknown): string => (Array.isArray(v) ? v.map(flat).join(', ') : String(v))

/** one line per key: scalars inline, string lists comma joined, object lists numbered */
function lines(obj: unknown, key: string, indent = ''): string[] {
  if (Array.isArray(obj)) {
    if (!obj.length) return []
    if (obj.every((v) => typeof v !== 'object' || v === null)) return [`${indent}${key}: ${obj.join(', ')}`]
    return [
      `${indent}${key}:`,
      ...obj.flatMap((v, i) =>
        typeof v === 'object' && v !== null
          ? [`${indent}  ${i + 1}. ${Object.values(v as object).map(flat).join(' | ')}`]
          : [`${indent}  ${i + 1}. ${String(v)}`],
      ),
    ]
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => lines(v, k, indent))
  }
  const value = String(obj ?? '').trim()
  return value ? [`${indent}${key}: ${value}`] : []
}

export function pageBrief(page: Page, product: string): string {
  const t = page.taste
  const w = worldById(page.world)
  const on = page.sections.filter((s) => s.on)
  const s = w.structure

  return [
    `# ${product || 'Landing page'}`,
    '',
    '## Tokens',
    `bg ${t.bg} · ink ${t.ink} · dim ${t.dim} · accent ${t.accent} · accent2 ${t.accent2}`,
    `display ${t.display.split(',')[0]} · body ${t.body.split(',')[0]} · scale ${t.scale.toFixed(2)} · weight ${t.weight}`,
    `radius ${t.radius}px · density ${t.density.toFixed(2)} · motion ${t.motion}`,
    ...(w.library ? [`Built in ${w.library}. Use its own components and tokens rather than reproducing the CSS below; the values here are what this page set them to.`] : []),
    `${w.name}: ${s.rules ? 'ruled' : 'unruled'} · ${s.numbered ? 'numbered' : 'unnumbered'} · ${s.bleed ? 'full bleed' : 'contained'} · measure ${s.measure}ch · figures ${s.figure}`,
    '',
    '## Sections',
    ...on.flatMap((sec, i) => [
      '',
      `### ${i + 1}. ${ROLE_LABEL[sec.role]}, set as ${sec.form}`,
      ...lines(sec.content, ''),
    ]),
    '',
    w.library
      ? `Build this with ${w.library}. Keep the copy. Honour the tokens where the system allows it.`
      : 'Build one self-contained HTML file. Keep the copy. Honour the tokens.',
  ].join('\n')
}
