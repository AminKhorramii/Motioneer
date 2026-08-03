/**
 * The page model. A page is an ordered list of sections; each section has a
 * kind, a layout variant, and content. Rendering lives in render.ts and brief
 * generation in brief.ts so this file stays the single source of shape.
 */

import type { Taste } from '@/taste'
import type { Backdrop } from '@/backdrop'

export type Kind = 'hero' | 'logos' | 'features' | 'showcase' | 'quote' | 'pricing' | 'faq' | 'cta' | 'footer'

export interface Section {
  id: string
  kind: Kind
  variant: number
  on: boolean
  content: Record<string, unknown>
}

export interface Page {
  id: string
  taste: Taste
  sections: Section[]
  pinned?: boolean
  /** the editorial position this page argues, when a model wrote it */
  angle?: string
  /** the generated art behind the page, drawn from the taste sheet */
  backdrop?: Backdrop
}

export const KIND_VARIANTS: Record<Kind, string[]> = {
  hero: ['centered', 'split', 'editorial', 'terminal'],
  logos: ['row', 'muted line'],
  features: ['three cards', 'bento', 'numbered list'],
  showcase: ['wide frame', 'offset frame'],
  quote: ['big quote', 'card'],
  pricing: ['three plans', 'single plan'],
  faq: ['two columns', 'stacked'],
  cta: ['banner', 'centered'],
  footer: ['simple'],
}

export const KIND_LABEL: Record<Kind, string> = {
  hero: 'hero', logos: 'social proof', features: 'features', showcase: 'showcase',
  quote: 'testimonial', pricing: 'pricing', faq: 'questions', cta: 'closing call', footer: 'footer',
}

export const uid = () => Math.random().toString(36).slice(2, 9)

// ——— defaults ———

export function defaultContent(kind: Kind, product = 'Product'): Record<string, unknown> {
  switch (kind) {
    case 'hero':
      return {
        eyebrow: 'for people who build',
        headline: 'A sentence that makes the value obvious.',
        sub: 'Two lines a stranger would understand, without adjectives.',
        cta: 'Start free',
        cta2: 'See how it works',
      }
    case 'logos':
      return { label: 'used by teams at', names: ['Northwind', 'Acme', 'Vector', 'Halden', 'Fold'] }
    case 'features':
      return {
        title: 'What it does',
        items: [
          { title: 'The first thing', body: 'One line about why it matters.' },
          { title: 'The second thing', body: 'One line about why it matters.' },
          { title: 'The third thing', body: 'One line about why it matters.' },
        ],
      }
    case 'showcase':
      return { title: 'See it working', caption: 'A moment from the product.' }
    case 'quote':
      return { quote: 'It replaced three tools and a spreadsheet.', name: 'A real person', role: `founder, somewhere` }
    case 'pricing':
      return {
        title: 'Simple pricing',
        plans: [
          { name: 'Free', price: '$0', line: 'to try it', features: ['One project', 'Local only'] },
          { name: 'Pro', price: '$19', line: 'per month', features: ['Unlimited projects', 'Everything local', 'Priority replies'] },
          { name: 'Team', price: '$49', line: 'per month', features: ['Shared workspace', 'Roles', 'Invoicing'] },
        ],
      }
    case 'faq':
      return {
        title: 'Questions',
        items: [
          { q: 'Where does my data live?', a: 'On your machine. Nothing is uploaded.' },
          { q: 'Can I cancel?', a: 'Any time, in one click.' },
          { q: 'Does it work offline?', a: 'Yes. That is the point.' },
        ],
      }
    case 'cta':
      return { headline: 'Start in under a minute.', sub: 'No account needed to try it.', cta: 'Download' }
    case 'footer':
      return { product, note: '' }
  }
}

export function starterPage(taste: Taste, product = 'Product'): Page {
  const kinds: Kind[] = ['hero', 'logos', 'features', 'showcase', 'quote', 'pricing', 'faq', 'cta', 'footer']
  return {
    id: uid(),
    taste,
    sections: kinds.map((kind) => ({
      id: uid(),
      kind,
      variant: 0,
      on: true,
      content: defaultContent(kind, product),
    })),
  }
}

/** set a value at "sectionId.a.0.b" */
export function applyEdit(page: Page, path: string, value: string): Page {
  const [sid, ...rest] = path.split('.')
  return {
    ...page,
    sections: page.sections.map((s) => {
      if (s.id !== sid) return s
      const content = structuredClone(s.content) as Record<string, unknown>
      let cur: Record<string, unknown> | unknown[] = content
      for (let i = 0; i < rest.length - 1; i++) {
        const k = rest[i]
        cur = (Array.isArray(cur) ? cur[Number(k)] : cur[k]) as Record<string, unknown>
      }
      const last = rest[rest.length - 1]
      if (Array.isArray(cur)) cur[Number(last)] = value
      else (cur as Record<string, unknown>)[last] = value
      return { ...s, content }
    }),
  }
}

