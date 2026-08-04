/** Making pages: alternatives, section prompts, and the model path (with a mock for tests). */

import { PRESETS, type Taste } from '@/taste'
import { giveKey, host, isDesktop, isServed, servedProviders } from '@/host'
import { slop, slopBrief } from '@/slop'
import { craftBrief } from '@/craft'
import { MODELS, modelById } from '@/models'
import { BACKDROPS, type Backdrop } from '@/backdrop'
import { shrinkDataUrl } from '@/imagepipe'
import { WORLDS, madeWorld, worldById, type World } from '@/worlds'
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
export function arrange(base: Page, i: number, worlds: World[] = WORLDS): Page {
  if (i === 0) {
    // a derived page is a new candidate, so the triage pin stays behind on its parent
    return { ...base, id: uid(), pinned: undefined, sections: base.sections.map((s) => ({ ...s, content: structuredClone(s.content) })) }
  }
  return arrangeIn(base, i, worlds[(i - 1) % worlds.length])
}

/**
 * The i-th arrangement, in a named world.
 *
 * Two axes, not one. A world decides how a page is built and a look decides how it feels, and
 * holding the look fixed made six worlds read as six versions of the same page. The look
 * advances by a stride so the pairs do not move in lockstep, which is what makes a wall of
 * eight look like eight rather than like three repeated.
 */
export function arrangeIn(base: Page, i: number, world: World): Page {
  const looks = [base.taste, ...PRESETS.filter((p) => p.name !== base.taste.name)]
  const look = looks[((i - 1) * 3) % looks.length]
  return { ...inWorld({ ...base, taste: look }, world), id: uid(), pinned: undefined }
}

/**
 * Write one page: one angle, in one world.
 *
 * The unit both paths share. A page is written for the world it lands in, because the voice,
 * the measure and the density are all in its prompt. That is why the world has to exist before
 * the writing starts, and why restyling a finished page into a different world afterwards would
 * be a different and worse thing.
 */
export async function writeOne(
  base: Page,
  product: Product,
  world: World,
  i: number,
  onPage: (page: Page) => void,
): Promise<{ ok: number; error?: string }> {
  const angle = ANGLES[i % ANGLES.length]
  try {
    const written = await promptPage(
      arrangeIn(base, i + 1, world),
      `Write this page as "${angle.name}". ${angle.instruction}`,
      product,
      'model',
      (partial) => onPage({ ...partial, angle: angle.name }),
    )
    if (!written) return { ok: 0, error: 'the reply was not usable JSON' }
    onPage({ ...written, angle: angle.name })
    return { ok: 1 }
  } catch (e) {
    return { ok: 0, error: String(e instanceof Error ? e.message : e).slice(0, 160) }
  }
}

/**
 * Rebuild the page from a world's own composition, keeping the copy that already exists.
 *
 * A section of a kind the world asks for is reused, so the words survive a change of world.
 * A kind it asks for that the page does not have arrives with defaults, and a kind the page
 * has that the world does not want is dropped, which is the point: a world gets to decide the
 * shape of the page and not only its finish.
 */
function composeSections(page: Page, wanted: Kind[]): Section[] {
  const name = String(page.sections.find((s) => s.kind === 'footer')?.content.product ?? 'Product')
  const pool = new Map<Kind, Section[]>()
  for (const s of page.sections) pool.set(s.kind, [...(pool.get(s.kind) ?? []), s])
  return wanted.map((kind) => {
    const had = pool.get(kind)?.shift()
    return had
      ? { ...had, content: structuredClone(had.content) }
      : { id: uid(), kind, variant: 0, on: true, content: defaultContent(kind, name) }
  })
}

/** Rebuild a page inside a world: its palette, its type, its layouts, its shape. */
function inWorld(page: Page, world: World): Page {
  const sections = world.compose?.length ? composeSections(page, world.compose) : page.sections
  return {
    ...page,
    world: world.id,
    backdrop: world.backdrop,
    taste: world.taste(page.taste),
    sections: sections.map((s) => ({
      ...s,
      on: true,
      variant: Math.min(world.prefer[s.kind] ?? s.variant, KIND_VARIANTS[s.kind].length - 1),
      content: structuredClone(s.content),
    })),
  }
}

/** Worlds a model designed for this product, so the renderer and the dock can find them by id. */
let designed: World[] = []
export const setDesigned = (w: World[]) => {
  designed = w
}
export const allWorlds = () => [...designed, ...WORLDS]

/** Move a page to the next world, keeping its copy. */
export function cycleWorld(page: Page): Page {
  const pool = allWorlds()
  const at = pool.findIndex((w) => w.id === page.world)
  return inWorld(page, pool[(at + 1) % pool.length])
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
    pinned: undefined,
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

export type Provider = string

/** The chosen model, which is a whole configuration rather than a provider name: a wire shape,
 *  an endpoint, a model id and where its key lives. */
const CHOICE = 'wall-model'
export const chosen = () => modelById(localStorage.getItem(CHOICE) ?? 'claude')
export const choose = (id: string) => localStorage.setItem(CHOICE, id)

/** custom endpoints are configured rather than guessed, so they are stored beside the key */
export const CUSTOM = { base: 'wall-custom-base', model: 'wall-custom-model' }
export function optsFor(m = chosen()) {
  if (m.id !== 'custom') return { base: m.base, model: m.model }
  return {
    base: localStorage.getItem(CUSTOM.base) ?? '',
    model: localStorage.getItem(CUSTOM.model) ?? '',
  }
}

/** Images are a separate provider axis: the model writing the copy and the model drawing the
 *  picture are chosen independently, so the key is stored separately too. */
export const IMAGE_KEY_NAME = 'wall-key-gemini'
export const imageKey = () => vault[IMAGE_KEY_NAME] ?? localStorage.getItem(IMAGE_KEY_NAME) ?? ''

/**
 * Keys read from wherever the shell keeps them.
 *
 * The desktop keeps them in the system keychain, which is asynchronous, and everything that
 * gates on having a key asks synchronously. So they are read once at startup into memory and
 * written through to the keychain, which also means a key is never read from disk twice.
 */
const vault: Record<string, string> = {}

export async function loadKeys() {
  if (!isDesktop) return
  const names = new Set([...MODELS.map((m) => m.keyName), IMAGE_KEY_NAME])
  await Promise.all(
    [...names].map(async (name) => {
      const got = await host.getKey(name).catch(() => null)
      if (got) vault[name] = got
    }),
  )
}

/** Put a key where this shell keeps them, which is not the same place in each. */
export async function setKey(name: string, value: string) {
  if (isServed) {
    await giveKey(name === IMAGE_KEY_NAME ? 'gemini' : chosen().wire, value)
    await loadHeldKeys()
    return
  }
  vault[name] = value
  await host.setKey(name, value)
}

/** Where this shell keeps them, said plainly, because it is the one thing worth knowing. */
export const keyHome = () =>
  chosen().wire === 'cli'
    ? 'No key is stored. It asks the Claude already on this machine.'
    : isDesktop
    ? 'Kept in your system keychain, never in a file or a page.'
    : isServed
      ? 'Kept by the local server on this machine, never in the page.'
      : 'Kept in this browser only, and sent straight to the provider.'

export const keyFor = (_p?: Provider) =>
  vault[chosen().keyName] ?? localStorage.getItem(chosen().keyName) ?? ''

/**
 * A deployment can hold the keys instead of the visitor, so "can this write" is not the same
 * question as "is there a key in this browser". Everything that gates on writing asks this.
 */
let held: string[] = []
let asking: Promise<string[]> | null = null
export async function loadHeldKeys() {
  asking ??= servedProviders()
  held = await asking
}
/** A model the person already has needs no key, only a shell that can start a process. */
export const canWrite = (_p?: Provider) =>
  (chosen().wire === 'cli' ? Boolean(host.cli) : Boolean(keyFor())) || held.includes(chosen().wire)
export const canDraw = () => Boolean(imageKey()) || held.includes('gemini')

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
  extra?: { maxTokens?: number },
): Promise<string | null> {
  const m = chosen()
  // the local Claude has no key and no endpoint: it is a process, not a request
  if (m.wire === 'cli') {
    if (!host.cli) return null
    const out = await host.cli(system, user, onDelta)
    if (out.error) throw new Error(out.error)
    return out.text ?? null
  }
  const key = keyFor(provider)
  // a served deployment holds the key, so an empty one here is not a reason to stop
  if (!key && !isServed) return null
  if (!listening) {
    listening = true
    host.onDelta((id, delta) => streams.get(id)?.(delta))
  }
  const id = uid()
  if (onDelta) streams.set(id, onDelta)
  try {
    const res = await host.stream(id, m.wire, system, user, key, { ...optsFor(m), ...extra })
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
function scanSections(buf: string, from: number, key = '"sections"') {
  const out: { id: string; content: Record<string, unknown> }[] = []
  let cursor = from
  if (from === 0) {
    const at = buf.indexOf(key)
    const open = at < 0 ? -1 : buf.indexOf('[', at)
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
          if (obj.id !== undefined || obj.content !== undefined || key !== '"sections"') {
            out.push(obj as { id: string; content: Record<string, unknown> })
          }
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

const PAGE_SYSTEM = `You write copy for a whole landing page. You receive the page as JSON: an array of sections, each with an id, a kind, and content. You also receive an instruction describing what to change.

Return JSON shaped as {"sections":[{"id":"...","content":{...}}]}, reusing the same ids and the same content keys, with the copy rewritten to follow the instruction. Reusing ids and keys matters because the app merges your reply into the existing page by id, and an unknown id or missing key is dropped.

Write concrete sentences a stranger could understand, and keep them short, because people scan a landing page rather than read it. Prefer plain words over marketing vocabulary such as revolutionary, seamless, unlock, or empower, because those words describe nothing and readers skip them. Let each section keep its own job: the hero states the value, features explain how, the closing call asks for one action.

This page sits beside seven others written from different angles, and the reader compares them side by side. Rewrite every headline so it differs from the one you were given in both wording and emphasis, because a page that matches its neighbour gives the reader nothing to choose between. Commit fully to the angle you are given, even where a safer line exists, since the safe version is already one of the other seven.

${craftBrief()}

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
  // the copy is written into a design, so it is told which one. Without this a poster and a
  // catalogue come back at the same length, when one wants six words and the other wants forty.
  const w = worldById(page.world)
  const design = [
    `Design: ${w.name}. ${w.note}`,
    w.voice,
    `The measure is ${w.structure.measure} characters, the type scale is ${page.taste.scale.toFixed(2)} and the page is ${page.taste.density > 0.65 ? 'dense' : page.taste.density < 0.4 ? 'airy' : 'evenly spaced'}.`,
  ].filter(Boolean).join(' ')
  const text = await ask(
    provider,
    PAGE_SYSTEM,
    `Product: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}\n\n${design}\n\nPage:\n${JSON.stringify(shape, null, 2)}\n\nInstruction: ${instruction}${avoid ? `\n\n${avoid}` : ''}`,
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

const WORLDS_SYSTEM = `You are designing the visual systems for a set of landing pages, one system per page. Each is a "world": one set of decisions that hold together, in the way a magazine, a timetable and a museum wall label each hold together while looking nothing like each other.

Return JSON shaped as {"worlds":[{ ... }]} with exactly the number asked for. Each world has these fields, and every one of them is a real lever on how the page looks:

name: two or three words, lowercase, naming the feeling rather than the technique. "wall label", "field manual", "night edition".
note: one sentence on what it is, for a person choosing between them.
voice: one sentence telling the writer how to write for it. A poster wants six words where a catalogue wants forty, and the copy is written from this line, so make it specific about length and register.
display and body: one of sans, grotesk, serif, mono, fraunces, archivo. Only these six, because the page ships as a single file and anything else would fall back to something you did not choose. The first four are platform stacks and cost nothing. fraunces is a warm expressive serif and archivo a sturdy display grotesque, each carried inside the page at about 50KB, so spend one only where the type is the design.
scale: 1.1 to 1.7. The ratio between heading sizes. Above 1.5 the headline dominates everything.
weight: 300 to 800. 300 is thin and editorial, 800 is a poster shouting.
radius: 0 to 24 pixels. 0 is architectural, 24 is friendly software.
density: 0.25 to 0.9, where 0.25 is airy and 0.9 is packed.
caps: true or false, for small capitalised labels.
palette: as-is, mono, tinted or contrast. mono drops the second accent, tinted pushes the background toward the accent, contrast pulls ink and background apart.
structure.rules: hairlines between sections, which is what makes a grid read as a grid.
structure.numbered: numbers in the margin beside each section.
structure.bleed: sections run edge to edge rather than sitting in a column.
structure.measure: 44 to 82 characters per line. This is the single biggest lever on how a page reads.
structure.figure: framed, bleed or plain.
structure.rhythm: 4 to 8 padding multipliers between 0.4 and 3, cycled down the page, like [2.4, 0.8, 1.6, 0.6]. Adjacent sections must not breathe the same: a page with equal air everywhere reads as one treatment applied to all content, where a sparse beat against a dense one reads as paced.
backdrop: none, contours, grain or ridge. Drawn behind the page from the palette.
prefer: which layout each section wears, as {"hero":0-3,"logos":0-1,"features":0-2,"showcase":0-1,"quote":0-1,"pricing":0-1,"faq":0-1,"cta":0-1}. Keep them agreeing with each other: a page where every section picked differently reads as a shuffle rather than a design.
sections: which sections the page is made of and in what order, as a list from hero, logos, features, showcase, quote, pricing, faq, cta, footer. Four to nine of them, repeats allowed. This is the shape of the page and it is yours to decide: a receipt is an itemised list and a total, not a testimonial and a pricing grid; a poster is a headline and one action; a field manual is mostly features and questions. Leave out anything the idea does not need, including the hero.
css: the part that matters most. Thirty to sixty lines of CSS that make the idea real, because the fields above can only change size and spacing, and no arrangement of them will make a page look like a receipt or a departures board. This is where you draw.

The page you are styling is plain HTML with these hooks, and nothing else:
  section[data-section] wraps every section and carries id="hero", "features", "pricing" and so on, so you can style one kind differently from another
  .wrap is the column inside each section
  h1 and h2 are the headings, p is body copy
  .eyebrow is the small label above a headline
  .ctas holds the buttons, .btn is a button, .btn-primary and .btn-ghost are the two kinds
  .card is a bordered block, .grid is a row of them
  img sits inside a bordered figure
These custom properties are already set from the palette and are the colours you should use: --bg, --ink, --dim, --accent, --accent2, --surface, --line, --r for radius, --gap for rhythm.

Write CSS that commits to the idea. A receipt has a narrow column, dashed rules, tabular figures and a torn edge. A departures board has slabs of solid colour, tight uppercase rows and hard shadows. A gallery card has enormous margins, one hairline and nothing else. Use borders, background gradients, pseudo elements, counters, transforms, grid and mix-blend-mode. Change the shape of things, not only their size.

Avoid the patterns that make a page look generated rather than designed, and the reasons matter more than the list: frosted glass panels, because they read as a period effect and cost contrast; default drop shadows under everything, because when every block floats nothing is above anything; cards inside cards, because two borders around the same content divide attention without adding structure; gradient filled headlines, because that is the decoration a page reaches for when the words are not carrying it; more than three typefaces, because two is a system and four is an accident; body text under fifteen pixels, because it looks refined on your screen and is unreadable on everyone else's; and small labels blinking forever, because they take attention they never give back.

Two rules on the CSS, both about the page still working when it leaves here. Use no @import and no remote urls, because the page ships as a single file with nothing to fetch. Keep body text at least 15px and keep it legible against the background, because a page nobody can read is not a daring design, it is a broken one.

Make them far apart. Two worlds that differ only in radius are one world, and the whole point is that someone can choose. Push each one until it commits: if it is dense, make it genuinely dense; if it is quiet, take things away rather than shrinking them. Ground each in something real that already exists in the world, a field guide, a receipt, an airport sign, a gallery card, a terminal session, a broadsheet, and let that decide the whole set of values rather than picking them one at a time.

At least one of them should be uncomfortable. A set where everything is tasteful is a set with nothing to choose between.

Ground each world in something that already exists and is not a website: a luggage tag, a seed packet, a hospital chart, a betting slip, a concert poster, a tide table, a museum vitrine. Then build the whole set of values, including the CSS, from that one thing. Worlds invented from web design vocabulary come out looking like every other page, and worlds taken from an object in the world come out looking like themselves.

Respond with the JSON object alone, because the reply is parsed directly.`

/**
 * Ask for a set of visual systems rather than choosing from mine.
 *
 * Six hand written worlds is six points in a space, and every page the app could make was
 * inside a box I drew. This lets the space be explored instead of enumerated. Every value is
 * clamped on the way in, so a model can be daring without being able to produce an unreadable
 * page, and the built in worlds remain the fallback when the call fails.
 */
export async function promptWorlds(
  product: Product,
  n: number,
  onWorld?: (world: World, i: number) => void,
  provider: Provider = 'model',
): Promise<World[]> {
  // the mock stands in here too, or an offline run reaches the real API and fails on the key
  if (mockReply) {
    const out = mockReply('worlds', n) as { worlds?: Record<string, unknown>[] } | null
    const fromMock = (out?.worlds ?? []).map(madeWorld).filter((w) => w.name)
    return fromMock.length >= 2 ? fromMock : WORLDS
  }
  // A world is complete long before the reply is, and the page for it can start then. Half of
  // the fifty seconds this call takes is the model thinking before it writes anything, so
  // reading the rest as it arrives is what turns one long wait into eight overlapping ones.
  let buf = ''
  let cursor = 0
  let seen = 0
  const feed = onWorld
    ? (delta: string) => {
        buf += delta
        if (!delta.includes('}')) return
        const scan = scanSections(buf, cursor, '"worlds"')
        cursor = scan.cursor
        for (const raw of scan.out) {
          onWorld(madeWorld(raw as unknown as Record<string, unknown>, seen), seen)
          seen += 1
        }
      }
    : undefined
  const text = await ask(
    provider,
    WORLDS_SYSTEM,
    `Product: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}\n\nDesign ${n} worlds for it.`,
    feed,
    { maxTokens: 24000 },
  ).catch(() => null)
  // A world carries CSS now, so eight of them is a long reply and a cut one used to yield
  // nothing at all. The same walk that recovers half-arrived sections recovers half-arrived
  // worlds, so a truncated design still gives whatever finished.
  const json = text ? (grabJson(text) as { worlds?: Record<string, unknown>[] } | null) : null
  const raw = json?.worlds ?? (text ? (scanSections(text, 0, '"worlds"').out as unknown as Record<string, unknown>[]) : [])
  const made = raw.map(madeWorld).filter((w) => w.name)
  return made.length >= 2 ? made : WORLDS
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
  worlds: World[] = WORLDS,
): Promise<{ written: number; error?: string }> {
  const done = await Promise.all(
    ANGLES.slice(0, n).map(async (angle, i) => {
      try {
        const written = await promptPage(
          arrange(base, i + 1, worlds), `Write this page as "${angle.name}". ${angle.instruction}`, product, provider,
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
export async function illustrate(
  sec: Section,
  product: Product,
  taste: Taste,
): Promise<{ dataUrl: string; before: number; after: number } | null> {
  const key = imageKey()
  if (!key && !isServed) return null
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
  if (!res.dataUrl) return null
  // The reply is a PNG of about a megabyte, and it goes into the page content, so it ships with
  // the file. Fitting it to the width a page actually renders at is the difference between an
  // illustrated page that is still one small file and one that is mostly picture.
  return shrinkDataUrl(res.dataUrl, { background: taste.bg })
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
    pinned: undefined,
    sections: page.sections.map((s) => (byId.has(s.id) ? { ...s, content: byId.get(s.id)! } : s)),
  }
}
