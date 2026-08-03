/**
 * Briefs. A brief carries the copy and the design tokens of a section or a
 * whole page so the work can be rebuilt somewhere else, by a person or a model.
 */

import { KIND_LABEL, KIND_VARIANTS, type Page, type Section } from '@/sections'
import type { Taste } from '@/taste'

/** the brief: what a model (or a person) needs to rebuild this section elsewhere */
export function sectionBrief(sec: Section, t: Taste): string {
  const lines = [
    `## ${KIND_LABEL[sec.kind]}, ${KIND_VARIANTS[sec.kind][sec.variant] ?? 'default'} layout`,
    '',
    '**Copy**',
    ...briefLines(sec.content, ''),
    '',
    '**Design tokens**',
    `- background ${t.bg} · text ${t.ink} · muted ${t.dim} · accent ${t.accent} / ${t.accent2}`,
    `- display ${t.display.split(',')[0]} · body ${t.body.split(',')[0]} · type scale ${t.scale.toFixed(2)} · weight ${t.weight}`,
    `- radius ${t.radius}px · density ${t.density.toFixed(2)} (0 airy … 1 tight) · motion ${t.motion}`,
  ]
  return lines.join('\n')
}

function briefLines(obj: unknown, prefix: string): string[] {
  if (Array.isArray(obj)) return obj.flatMap((v, i) => briefLines(v, `${prefix}[${i}]`))
  if (obj && typeof obj === 'object')
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      briefLines(v, prefix ? `${prefix}.${k}` : k),
    )
  return [`- ${prefix}: ${String(obj)}`]
}

export function pageBrief(page: Page, product: string): string {
  return [
    `# Landing page brief: ${product}`,
    '',
    `A ${page.sections.filter((s) => s.on).length}-section page. Sections in order:`,
    ...page.sections.filter((s) => s.on).map((s, i) => `${i + 1}. ${KIND_LABEL[s.kind]} (${KIND_VARIANTS[s.kind][s.variant] ?? 'default'})`),
    '',
    ...page.sections.filter((s) => s.on).map((s) => sectionBrief(s, page.taste)),
    '',
    '---',
    'Rebuild this as a single self-contained HTML file. Keep the copy exactly; honour the tokens.',
  ].join('\n')
}
