/**
 * The page model. A page is an ordered list of sections; each section has a role, a form,
 * and content. Rendering lives in render.ts and brief generation in brief.ts so this file
 * stays the single source of shape.
 *
 * A role is what the section argues; a form is how it is set. The old model had one axis,
 * kind, which conflated the two: pricing was both the offer and the three card grid, so every
 * page was assembled from the same nine marketing categories and read as the same page. Split,
 * the same argument renders unrecognisably across worlds: the offer on a poster is one
 * sentence, on a catalogue a table, in a terminal a transcript line.
 */

import type { Taste } from '@/taste'
import type { Backdrop } from '@/backdrop'
import type { WorldId } from '@/worlds'

/**
 * A masthead does not argue, it orients: whose page this is and where else you can go. It was
 * missing entirely, so every page opened straight onto its headline with nothing above it, which
 * is the one thing no shipped site does and the reason a finished page still read as a mock.
 */
export type Role = 'masthead' | 'claim' | 'proof' | 'substance' | 'offer' | 'objections' | 'invitation' | 'credits'
export type Form =
  | 'statement' | 'prose' | 'marginalia' | 'transcript'
  | 'quote' | 'list' | 'table' | 'figure' | 'band'

/** the forms each role can wear. Fewer, better set forms beat many templates each okay */
export const ROLE_FORMS: Record<Role, Form[]> = {
  masthead: ['band', 'statement'],
  claim: ['prose', 'marginalia', 'statement', 'transcript'],
  proof: ['quote', 'list', 'statement'],
  substance: ['list', 'figure', 'prose', 'table'],
  offer: ['table', 'statement', 'prose', 'transcript'],
  objections: ['list', 'prose'],
  invitation: ['band', 'statement'],
  credits: ['prose', 'table'],
}

export const ROLES: Role[] = ['masthead', 'claim', 'proof', 'substance', 'offer', 'objections', 'invitation', 'credits']

export const ROLE_LABEL: Record<Role, string> = {
  masthead: 'the masthead', claim: 'the claim', proof: 'proof', substance: 'substance', offer: 'the offer',
  objections: 'questions', invitation: 'the invitation', credits: 'credits',
}

export interface Section {
  id: string
  role: Role
  form: Form
  on: boolean
  content: Record<string, unknown>
}

export interface Page {
  id: string
  taste: Taste
  sections: Section[]
  /** marked as a keeper during triage. x cannot remove a pinned page, and the mark stays on
      this one paper: a page derived from it starts unpinned, because a pin is a judgement
      about what you saw, not about what it might become */
  pinned?: boolean
  /** the editorial position this page argues, when a model wrote it */
  angle?: string
  /** the generated art behind the page, drawn from the taste sheet */
  backdrop?: Backdrop
  /** the design world this page is built in: one set of decisions, not a shuffle */
  world?: WorldId
}

export const uid = () => Math.random().toString(36).slice(2, 9)

// ——— defaults ———

/**
 * Content is keyed the same regardless of form, so a section survives changing its clothes,
 * and the keys are unchanged from the old model, so recorded replies and saved pages still
 * merge. A form reads the keys it needs and ignores the rest.
 */
export function defaultContent(role: Role, product = 'Product'): Record<string, unknown> {
  switch (role) {
    case 'masthead':
      // the links name places rather than actions, because a nav that shouts competes with the
      // one button the page is actually asking you to press
      return { product, links: ['What it does', 'Pricing', 'Questions'], cta: 'Start' }
    case 'claim':
      return {
        eyebrow: 'One plain line that earns the claim.',
        headline: 'A sentence that makes the value obvious.',
        sub: 'Two lines a stranger would understand, without adjectives.',
        // the button names what happens, because a button that names enthusiasm is furniture
        cta: `Download ${product}`,
        cta2: 'See how it works',
      }
    case 'proof':
      // no invented companies: a made up logo row promises proof and delivers a prop
      return {
        quote: 'It replaced three tools and a spreadsheet.',
        name: 'A real person', role: 'founder, somewhere',
        label: 'used by teams at', names: ['Replace', 'these', 'with', 'real', 'names'],
      }
    case 'substance':
      return {
        title: 'What it does',
        caption: 'A moment from the product.',
        items: [
          { title: 'The first thing', body: 'One line about why it matters.' },
          { title: 'The second thing', body: 'One line about why it matters.' },
          { title: 'The third thing', body: 'One line about why it matters.' },
        ],
      }
    case 'offer':
      return {
        title: 'Simple pricing',
        plans: [
          { name: 'Free', price: '$0', line: 'to try it', features: ['One project', 'Local only'] },
          { name: 'Pro', price: '$19', line: 'per month', features: ['Unlimited projects', 'Everything local', 'Priority replies'] },
          { name: 'Team', price: '$49', line: 'per month', features: ['Shared workspace', 'Roles', 'Invoicing'] },
        ],
      }
    case 'objections':
      return {
        title: 'Questions',
        items: [
          { q: 'Where does my data live?', a: 'On your machine. Nothing is uploaded.' },
          { q: 'Can I cancel?', a: 'Any time, in one click.' },
          { q: 'Does it work offline?', a: 'Yes. That is the point.' },
        ],
      }
    case 'invitation':
      return { headline: 'Start in under a minute.', sub: 'No account needed to try it.', cta: 'Download' }
    case 'credits':
      return {
        product, note: '',
        groups: [
          { title: 'Product', links: ['What it does', 'Pricing', 'Changelog'] },
          { title: 'Company', links: ['About', 'Contact'] },
          { title: 'Legal', links: ['Privacy', 'Terms'] },
        ],
      }
  }
}

export function starterPage(taste: Taste, product = 'Product'): Page {
  const argue: [Role, Form][] = [
    ['masthead', 'band'], ['claim', 'prose'], ['proof', 'list'], ['substance', 'list'], ['substance', 'figure'],
    ['proof', 'quote'], ['offer', 'table'], ['objections', 'list'], ['invitation', 'band'],
    ['credits', 'prose'],
  ]
  return {
    id: uid(),
    taste,
    sections: argue.map(([role, form]) => ({
      id: uid(),
      role,
      form,
      on: true,
      content: defaultContent(role, product),
    })),
  }
}

// ——— reading pages written before roles and forms ———

/** what each old kind argued, and which form each of its numbered layouts wore */
const LEGACY: Record<string, { role: Role; forms: Form[] }> = {
  nav: { role: 'masthead', forms: ['band', 'statement'] },
  header: { role: 'masthead', forms: ['band', 'statement'] },
  hero: { role: 'claim', forms: ['prose', 'marginalia', 'statement', 'transcript'] },
  logos: { role: 'proof', forms: ['list', 'list'] },
  quote: { role: 'proof', forms: ['quote', 'quote'] },
  features: { role: 'substance', forms: ['list', 'figure', 'list'] },
  showcase: { role: 'substance', forms: ['figure', 'figure'] },
  pricing: { role: 'offer', forms: ['table', 'statement'] },
  faq: { role: 'objections', forms: ['list', 'prose'] },
  cta: { role: 'invitation', forms: ['band', 'statement'] },
  footer: { role: 'credits', forms: ['prose'] },
}

/** old kind names still arrive from saved state and recorded worlds, and they map cleanly */
export const legacyRole = (kind: string): Role | null => LEGACY[kind]?.role ?? null

/** A page saved before roles and forms opens as if it had always had them. */
export function migratePage(raw: unknown): Page {
  type Old = Omit<Section, 'role' | 'form'> & { kind?: string; variant?: number; role?: Role; form?: Form }
  const p = raw as Omit<Page, 'sections'> & { sections?: Old[] }
  if (!p?.sections?.some((s) => s.kind)) return raw as Page
  return {
    ...p,
    sections: p.sections.map((s) => {
      if (!s.kind || !LEGACY[s.kind]) return s as Section
      const { role, forms } = LEGACY[s.kind]
      const { kind: _kind, variant, ...rest } = s
      return { ...rest, role, form: forms[Math.min(variant ?? 0, forms.length - 1)] }
    }),
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
