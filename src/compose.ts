/** Making pages: alternatives, section prompts, and the model path (with a mock for tests). */

import { type Taste } from '@/taste'
import { host } from '@/host'
import { slop, slopBrief } from '@/slop'
import { BACKDROPS, type Backdrop } from '@/backdrop'
import { WORLDS, type World } from '@/worlds'
import { KIND_VARIANTS, defaultContent, uid, type Kind, type Page, type Section } from '@/sections'

export interface Product {
  name: string
  oneLiner: string
  what: string
  audience: string
  cta: string
}

export const EMPTY_PRODUCT: Product = { name: '', oneLiner: '', what: '', audience: '', cta: 'Start free' }

/** seed a page's copy from the product brief */
export function seeded(page: Page, p: Product): Page {
  return {
    ...page,
    sections: page.sections.map((s) => {
      const c = { ...s.content } as Record<string, unknown>
      if (s.kind === 'hero') {
        c.eyebrow = p.audience || c.eyebrow
        c.headline = p.oneLiner || c.headline
        c.sub = p.what || c.sub
        c.cta = p.cta || c.cta
      }
      if (s.kind === 'cta') {
        c.headline = `Start with ${p.name || 'it'} today.`
        c.cta = p.cta || c.cta
      }
      if (s.kind === 'footer') c.product = p.name || c.product
      return { ...s, content: c }
    }),
  }
}

/**
 * The i-th arrangement of a page: one design world applied whole, copy untouched.
 * Index 0 is the page as given, so a fan-out always keeps the original to compare against.
 *
 * The layouts come from the world rather than from chance. Picking each section at random
 * produced variety without identity: a terminal hero above an editorial features block reads
 * as a shuffle rather than as a design.
 */
export function arrange(base: Page, i: number): Page {
  if (i === 0) {
    return { ...base, id: uid(), sections: base.sections.map((s) => ({ ...s, content: structuredClone(s.content) })) }
  }
  return { ...inWorld(base, WORLDS[(i - 1) % WORLDS.length]), id: uid() }
}

/** Rebuild a page inside a world: its palette, its type, its layouts, its backdrop. */
function inWorld(page: Page, world: World): Page {
  return {
    ...page,
    world: world.id,
    backdrop: world.backdrop,
    taste: world.taste(page.taste),
    sections: page.sections.map((s) => ({
      ...s,
      variant: Math.min(world.prefer[s.kind] ?? s.variant, KIND_VARIANTS[s.kind].length - 1),
      content: structuredClone(s.content),
    })),
  }
}

/** Move a page to the next world, keeping its copy. */
export function cycleWorld(page: Page): Page {
  const at = WORLDS.findIndex((w) => w.id === page.world)
  return inWorld(page, WORLDS[(at + 1) % WORLDS.length])
}

/** alternatives of a whole page: same copy, different arrangement. The path with no key. */
export function alternatives(base: Page, n: number): Page[] {
  return Array.from({ length: n }, (_, i) => arrange(base, i))
}

/** alternatives of ONE section, keeping the rest of the page identical */
export function sectionAlternatives(page: Page, sectionId: string): Page[] {
  const sec = page.sections.find((s) => s.id === sectionId)
  if (!sec) return [page]
  return KIND_VARIANTS[sec.kind].map((_, v) => ({
    ...page,
    id: uid(),
    sections: page.sections.map((s) => (s.id === sectionId ? { ...s, variant: v } : s)),
  }))
}

export function addSection(page: Page, kind: Kind, product: string, at?: number): Page {
  const sec: Section = { id: uid(), kind, variant: 0, on: true, content: defaultContent(kind, product) }
  const list = [...page.sections]
  list.splice(at ?? list.length - 1, 0, sec)
  return { ...page, sections: list }
}

/** Cycle the page's backdrop. The wrap lives here because BACKDROPS defines the range. */
export function cycleBackdrop(page: Page): Page {
  const at = BACKDROPS.indexOf(page.backdrop ?? 'none')
  return { ...page, backdrop: BACKDROPS[(at + 1) % BACKDROPS.length] as Backdrop }
}

/** Cycle a section to its next layout. The wrap lives here because KIND_VARIANTS defines the range. */
export function cycleVariant(page: Page, id: string): Page {
  return {
    ...page,
    sections: page.sections.map((s) =>
      s.id === id ? { ...s, variant: (s.variant + 1) % KIND_VARIANTS[s.kind].length } : s,
    ),
  }
}

/** Drop one section next to another. The paper reports the intent, the model does the move. */
export function dropSection(page: Page, id: string, onto: string, after: boolean): Page {
  if (id === onto) return page
  const list = page.sections.filter((s) => s.id !== id)
  const moved = page.sections.find((s) => s.id === id)
  const target = list.findIndex((s) => s.id === onto)
  if (!moved || target < 0) return page
  list.splice(target + (after ? 1 : 0), 0, moved)
  return { ...page, sections: list }
}

// ——— the model path: pick a provider, prompt, get variants ———

export type Provider = 'claude' | 'gpt'

export const PROVIDERS: { id: Provider; label: string; keyName: string }[] = [
  { id: 'claude', label: 'Claude', keyName: 'wall-key-anthropic' },
  { id: 'gpt', label: 'GPT', keyName: 'wall-key-openai' },
]

/** Images are a separate provider axis: the model writing the copy and the model drawing the
 *  picture are chosen independently, so the key is stored separately too. */
export const IMAGE_KEY_NAME = 'wall-key-gemini'
export const imageKey = () => localStorage.getItem(IMAGE_KEY_NAME) ?? ''

export const keyFor = (p: Provider) =>
  localStorage.getItem(PROVIDERS.find((x) => x.id === p)!.keyName) ?? ''

// One delta listener for the whole app, fanned out by request id, because several pages
// stream at once and each needs only its own text.
const streams = new Map<string, (delta: string) => void>()
let listening = false

let mockReply: ((prompt: string, content: unknown) => unknown) | null = null
export function setMock(fn: typeof mockReply) {
  mockReply = fn
}

async function ask(
  provider: Provider,
  system: string,
  user: string,
  onDelta?: (delta: string) => void,
): Promise<string | null> {
  const key = keyFor(provider)
  if (!key) return null
  if (!listening) {
    listening = true
    host.onDelta((id, delta) => streams.get(id)?.(delta))
  }
  const id = uid()
  if (onDelta) streams.set(id, onDelta)
  try {
    const res = await host.stream(id, provider === 'gpt' ? 'openai' : 'anthropic', system, user, key)
    if (res?.error) throw new Error(res.error)
    return res?.text ?? null
  } finally {
    streams.delete(id)
  }
}

/**
 * Pull the section objects that have finished arriving out of a partial JSON reply. The walk
 * tracks strings and brace depth, so a closing brace inside a headline does not end an object
 * early.
 *
 * It resumes from a cursor rather than re-reading the buffer, because copy full of braces
 * makes almost every delta trigger a scan, and re-reading turns one page into quadratic work.
 * With several pages streaming at once that is enough to stall the app.
 */
function scanSections(buf: string, from: number) {
  const out: { id: string; content: Record<string, unknown> }[] = []
  let cursor = from
  if (from === 0) {
    const key = buf.indexOf('"sections"')
    const open = key < 0 ? -1 : buf.indexOf('[', key)
    if (open < 0) return { out, cursor }
    cursor = open + 1
  }
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  let done = cursor
  for (let i = cursor; i < buf.length; i++) {
    const ch = buf[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(buf.slice(start, i + 1)) as { id?: string; content?: Record<string, unknown> }
          if (obj.id && obj.content) out.push({ id: obj.id, content: obj.content })
        } catch {
          // an object that fails to parse is simply not finished yet
        }
        start = -1
        done = i + 1
      }
    }
  }
  return { out, cursor: done }
}

const grabJson = (text: string) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

const SECTION_SYSTEM = `You write copy for one section of a landing page. You receive the section's current content as JSON and an instruction describing what to change.

Return a single JSON object with exactly the same keys as the input, with the copy rewritten to follow the instruction. Keep the keys identical because the renderer reads them by name, and a missing key removes that text from the page.

Write concrete sentences a stranger could understand, and keep them short, because people scan a landing page rather than read it. Prefer plain words over marketing vocabulary such as revolutionary, seamless, unlock, or empower, because those words describe nothing and readers skip them.

Respond with the JSON object alone, because the reply is parsed directly.`

export async function promptSection(
  sec: Section,
  instruction: string,
  product: Product,
  provider: Provider = 'claude',
): Promise<Record<string, unknown> | null> {
  if (mockReply) return mockReply(instruction, sec.content) as Record<string, unknown>
  const text = await ask(
    provider,
    SECTION_SYSTEM,
    `Product: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}\n\nSection kind: ${sec.kind}\nCurrent content:\n${JSON.stringify(sec.content, null, 2)}\n\nInstruction: ${instruction}`,
  )
  return text ? grabJson(text) : null
}

const PAGE_SYSTEM = `You write copy for a whole landing page. You receive the page as JSON: an array of sections, each with an id, a kind, and content. You also receive an instruction describing what to change.

Return JSON shaped as {"sections":[{"id":"...","content":{...}}]}, reusing the same ids and the same content keys, with the copy rewritten to follow the instruction. Reusing ids and keys matters because the app merges your reply into the existing page by id, and an unknown id or missing key is dropped.

Write concrete sentences a stranger could understand, and keep them short, because people scan a landing page rather than read it. Prefer plain words over marketing vocabulary such as revolutionary, seamless, unlock, or empower, because those words describe nothing and readers skip them. Let each section keep its own job: the hero states the value, features explain how, the closing call asks for one action.

This page sits beside seven others written from different angles, and the reader compares them side by side. Rewrite every headline so it differs from the one you were given in both wording and emphasis, because a page that matches its neighbour gives the reader nothing to choose between. Commit fully to the angle you are given, even where a safer line exists, since the safe version is already one of the other seven.

Respond with the JSON object alone, because the reply is parsed directly.`

/** prompt the whole page. This is how variants are made. */
export async function promptPage(
  page: Page,
  instruction: string,
  product: Product,
  provider: Provider = 'claude',
  onPartial?: (p: Page) => void,
): Promise<Page | null> {
  const shape = page.sections
    .filter((s) => s.on)
    .map((s) => ({ id: s.id, kind: s.kind, content: s.content }))
  const outId = uid()
  let buf = ''
  let cursor = 0
  const found: { id: string; content: Record<string, unknown> }[] = []
  const feed = (delta: string) => {
    buf += delta
    if (!delta.includes('}')) return
    const scan = scanSections(buf, cursor)
    cursor = scan.cursor
    if (!scan.out.length) return
    found.push(...scan.out)
    // repaint only when another section has finished, because a real stream delivers a few
    // characters at a time and repainting per delta would re-render every paper hundreds of
    // times for the same content
    onPartial?.(mergeSections(page, found, outId))
  }

  if (mockReply) {
    const out = mockReply(instruction, shape) as { sections?: { id: string; content: Record<string, unknown> }[] }
    const full = JSON.stringify(out)
    // feed the mock through the same parser in chunks, so tests exercise the streaming path
    for (let i = 0; i < full.length; i += 140) feed(full.slice(i, i + 140))
    return mergeSections(page, out?.sections ?? [], outId)
  }

  // the detector runs before the call, so its findings steer the writing instead of only
  // describing it afterwards
  const avoid = slopBrief(slop(page))
  const text = await ask(
    provider,
    PAGE_SYSTEM,
    `Product: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}\n\nPage:\n${JSON.stringify(shape, null, 2)}\n\nInstruction: ${instruction}${avoid ? `\n\n${avoid}` : ''}`,
    feed,
  )
  if (!text) return null
  const json = grabJson(text) as { sections?: { id: string; content: Record<string, unknown> }[] } | null
  // A reply cut off mid-object cannot be parsed whole, but the sections that did arrive are
  // already complete and worth keeping. The streaming parser doubles as the recovery path, so
  // a truncated reply costs the tail of a page instead of the entire page.
  const sections = json?.sections ?? found
  return sections.length ? mergeSections(page, sections, outId) : null
}

/**
 * Distinct positions a landing page can take on the same product. A wall of variants is
 * only worth scanning if the pages disagree with each other, so each angle argues for a
 * different reason to care rather than rephrasing the same one.
 */
export const ANGLES: { name: string; instruction: string }[] = [
  { name: 'the pain', instruction: 'Open by naming the problem the reader has today, in their words, before mentioning the product. Someone who recognises their own situation keeps reading.' },
  { name: 'the outcome', instruction: 'Lead with the state the reader ends up in, described concretely enough to picture. Skip how it works until later sections.' },
  { name: 'proof first', instruction: 'Lead with evidence: numbers, scale, and what real usage looks like. Keep claims to ones a sceptical reader could check.' },
  { name: 'plain and specific', instruction: 'Say exactly what the product does in the fewest words, with no framing or persuasion. Specificity is the argument.' },
  { name: 'the one line', instruction: 'Build the page around a single short sentence that would work on a billboard, and let every other section support that one line.' },
  { name: 'for the sceptic', instruction: 'Write for a reader who assumes this is overpromised. Address the obvious objection early and answer it with detail.' },
  { name: 'the before', instruction: 'Contrast the old way with this one throughout, so the reader measures the difference themselves instead of being told it.' },
  { name: 'the craft', instruction: 'Argue from how carefully it is built: the decisions, the constraints honoured, what was deliberately left out.' },
]

/**
 * Write a full wall in parallel, one page per angle. Each page is handed back the moment its
 * own call returns, so papers land as they finish instead of after the slowest one. One
 * angle failing must not lose the other seven, so failures are caught per angle and the
 * first message is returned for the app to show.
 */
export async function fanOut(
  base: Page,
  product: Product,
  provider: Provider,
  n: number,
  onPage: (page: Page) => void,
): Promise<{ written: number; error?: string }> {
  const done = await Promise.all(
    ANGLES.slice(0, n).map(async (angle, i) => {
      try {
        const written = await promptPage(
          arrange(base, i + 1), `Write this page as "${angle.name}". ${angle.instruction}`, product, provider,
          (partial) => onPage({ ...partial, angle: angle.name }),
        )
        if (!written) return { ok: 0, error: 'the reply was not usable JSON' }
        onPage({ ...written, angle: angle.name })
        return { ok: 1 }
      } catch (e) {
        return { ok: 0, error: String(e instanceof Error ? e.message : e).slice(0, 160) }
      }
    }),
  )
  return {
    written: done.reduce((a, b) => a + b.ok, 0),
    error: done.find((d) => d.error)?.error,
  }
}

const INTAKE_SYSTEM = `You are reading someone's description of the thing they are launching, so that a landing page can be written from it. The description may be a README, a note, a paste from a pitch, or a couple of sentences typed quickly.

Return JSON shaped as {"product":{"name":"","oneLiner":"","what":"","audience":"","cta":""},"questions":[{"key":"","question":"","why":""}]}.

Fill the product fields from what you were actually told. Leave a field empty rather than inventing it, because a made up audience produces a page aimed at nobody. Write oneLiner as a single sentence a stranger would understand, and what as two sentences at most. Write cta as the words that would sit on the button, naming the action rather than the effort, so "Download for macOS" rather than "Get started".

Then ask for what is missing. Each question names one field in key, which must be one of name, oneLiner, what, audience or cta. Ask at most three, and ask none if the description already covers everything, because every question you ask is one the person has to answer before they see anything.

Ask the question a designer would ask: who specifically this is for, what they use today, what the one action is, what a sceptical reader would need to believe. Put the reason in why, in one short sentence, so the person can tell whether the answer matters.

Respond with the JSON object alone, because the reply is parsed directly.`

export interface Intake {
  product: Product
  questions: { key: keyof Product; question: string; why: string }[]
}

/**
 * Read a free description into a brief, and ask for what is missing.
 *
 * A form asks everyone the same five questions in the same order, including the ones they
 * already answered in the first sentence. This asks only for what the description does not
 * carry, which is both shorter and better, because the questions are chosen after reading.
 */
export async function readBrief(text: string, provider: Provider = 'claude'): Promise<Intake | null> {
  const raw = mockReply
    ? mockReply('intake', text)
    : grabJson((await ask(provider, INTAKE_SYSTEM, text)) ?? '')
  const j = raw as { product?: Partial<Product>; questions?: Intake['questions'] } | null
  if (!j?.product) return null
  return {
    product: { ...EMPTY_PRODUCT, ...j.product },
    questions: (j.questions ?? []).filter((q) => q.key in EMPTY_PRODUCT).slice(0, 3),
  }
}

/**
 * Draw the image for one section. The prompt rules out the things that make a generated image
 * announce itself, and rules out text hardest of all: words baked into a picture cannot be
 * edited on the paper, cannot be translated, and are usually misspelled.
 */
export async function illustrate(sec: Section, product: Product, taste: Taste): Promise<string | null> {
  const key = imageKey()
  if (!key) return null
  const prompt = [
    `Draw one abstract image for the ${sec.kind} section of a landing page.`,
    `The product: ${product.name}. ${product.oneLiner}`,
    `Use this palette and nothing else: background ${taste.bg}, foreground ${taste.ink}, accent ${taste.accent}.`,
    'Compose it wide and calm, around a single idea, with generous empty space, because it sits behind and beside text that has to stay readable.',
    'Include no text, letters or numbers, because words baked into an image cannot be edited on the page and are usually wrong.',
    'Avoid stock photography, people, glossy three dimensional renders, neon gradients, lens flare and floating glass cards, because those are the defaults that make a page look like every other page.',
  ].join('\n')
  const res = await host.image('gemini', prompt, key)
  if (res.error) throw new Error(res.error)
  return res.dataUrl ?? null
}

function mergeSections(
  page: Page,
  incoming: { id: string; content: Record<string, unknown> }[],
  id: string,
): Page {
  const byId = new Map(incoming.map((s) => [s.id, s.content]))
  return {
    ...page,
    id,
    sections: page.sections.map((s) => (byId.has(s.id) ? { ...s, content: byId.get(s.id)! } : s)),
  }
}
