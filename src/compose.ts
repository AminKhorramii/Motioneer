/** Making pages: alternatives, section prompts, and the model path (with a mock for tests). */

import { PRESETS } from '@/design/presets'
import type { Taste } from '@/taste'
import { giveKey, host, isDesktop, isServed, servedConfig } from '@/host'
import { slop, slopBrief } from '@/slop'
import { dealDirections, directionSeed } from '@/design/directions'
import { ANGLES } from '@/design/angles'
import { INTAKE_SYSTEM, MEND_SYSTEM, PAGE_SYSTEM, WORLDS_SYSTEM } from '@/design/prompts'
import { MODELS, modelById, type ModelChoice } from '@/models'
import { BACKDROPS, type Backdrop } from '@/backdrop'
import { DEFAULT_KIND, asKind, type Kind } from '@/design/kinds'
import { shrinkDataUrl } from '@/imagepipe'
import { renderPage } from '@/render'
import { strainsIn } from '@/geometry'
import { WORLDS, dressSections, madeWorld, register as registerWorlds, worldById, type World } from '@/worlds'
import { ROLE_FORMS, defaultContent, starterPage, uid, type Form, type Page, type Role, type Section } from '@/sections'

export interface Product {
  name: string
  /** what is being launched, which decides what a page's roles are made of */
  kind: Kind
  oneLiner: string
  what: string
  audience: string
  cta: string
}

export const EMPTY_PRODUCT: Product = { name: '', kind: DEFAULT_KIND, oneLiner: '', what: '', audience: '', cta: 'Start free' }

/** seed a page's copy from the product brief */
export function seeded(page: Page, p: Product): Page {
  return {
    ...page,
    sections: page.sections.map((s) => {
      const c = { ...s.content } as Record<string, unknown>
      if (s.role === 'claim') {
        c.eyebrow = p.audience || c.eyebrow
        c.headline = p.oneLiner || c.headline
        c.sub = p.what || c.sub
        c.cta = p.cta || c.cta
      }
      if (s.role === 'invitation') {
        c.headline = `Start with ${p.name || 'it'} today.`
        c.cta = p.cta || c.cta
      }
      if (s.role === 'credits') c.product = p.name || c.product
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
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

export function arrangeIn(base: Page, i: number, world: World): Page {
  const looks = [base.taste, ...PRESETS.filter((p) => p.name !== base.taste.name)]
  // The stride has to be coprime with the deck or the wall repeats. Three is coprime with the
  // eight looks left after a preset is filtered out, but a taste read from a screenshot is not
  // a preset name, nothing gets filtered, and three into nine visits only three of them: the
  // wall came out as three looks repeated rather than eight.
  const stride = [3, 4, 5, 2, 1].find((k) => gcd(k, looks.length) === 1) ?? 1
  const look = looks[((i - 1) * stride) % looks.length]
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
 * A section arguing a role the world asks for is reused, so the words survive a change of
 * world. A role it asks for that the page does not have arrives with defaults, and a role the
 * page has that the world does not want is dropped, which is the point: a world gets to decide
 * the shape of the page and not only its finish.
 */
function composeSections(page: Page, wanted: Role[]): Section[] {
  const name = String(page.sections.find((s) => s.role === 'credits')?.content.product ?? 'Product')
  const pool = new Map<Role, Section[]>()
  for (const s of page.sections) pool.set(s.role, [...(pool.get(s.role) ?? []), s])
  return wanted.map((role) => {
    const had = pool.get(role)?.shift()
    return had
      ? { ...had, content: structuredClone(had.content) }
      : { id: uid(), role, form: ROLE_FORMS[role][0], on: true, content: defaultContent(role, name, page.kind) }
  })
}

/** Rebuild a page inside a world: its palette, its type, its forms, its shape. */
function inWorld(page: Page, world: World): Page {
  const sections = world.compose?.length ? composeSections(page, world.compose) : page.sections
  return {
    ...page,
    world: world.id,
    backdrop: world.backdrop,
    taste: world.taste(page.taste),
    sections: dressSections(
      sections.map((s) => ({ ...s, on: true, content: structuredClone(s.content) })),
      world,
    ),
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
  return ROLE_FORMS[sec.role].map((form) => ({
    ...page,
    id: uid(),
    pinned: undefined,
    sections: page.sections.map((s) => (s.id === sectionId ? { ...s, form } : s)),
  }))
}

export function addSection(page: Page, role: Role, product: string, at?: number): Page {
  const sec: Section = { id: uid(), role, form: ROLE_FORMS[role][0], on: true, content: defaultContent(role, product, page.kind) }
  const list = [...page.sections]
  list.splice(at ?? list.length - 1, 0, sec)
  return { ...page, sections: list }
}

/** Cycle the page's backdrop. The wrap lives here because BACKDROPS defines the range. */
export function cycleBackdrop(page: Page): Page {
  const at = BACKDROPS.indexOf(page.backdrop ?? 'none')
  return { ...page, backdrop: BACKDROPS[(at + 1) % BACKDROPS.length] as Backdrop }
}

/** Cycle a section to its next form. The wrap lives here because ROLE_FORMS defines the range. */
export function cycleForm(page: Page, id: string): Page {
  return {
    ...page,
    sections: page.sections.map((s) => {
      if (s.id !== id) return s
      const forms = ROLE_FORMS[s.role]
      const next: Form = forms[(forms.indexOf(s.form) + 1) % forms.length]
      return { ...s, form: next }
    }),
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
let heldCli = false
let asking: Promise<{ providers: string[]; cli: boolean }> | null = null
export async function loadHeldKeys() {
  asking ??= servedConfig()
  const got = await asking
  held = got.providers
  heldCli = got.cli
}

/**
 * Can the model the person already has be reached from here.
 *
 * Being able to start a process is necessary and not enough. The desktop starts it itself, so it
 * answers for itself. A served page starts it on the server's machine, and only the server knows
 * whether there is a claude there to start, so it is asked and no is the honest answer until it
 * has replied. Assuming yes was how a machine with neither a key nor a CLI showed a wall of
 * unwritten drafts and said nothing about it.
 */
export const canUseCli = () => (isServed ? heldCli : Boolean(host.cli))

/**
 * Whether this shell can actually reach a model, as opposed to whether it is in the list.
 *
 * A served deployment holds the key and calls the vendor itself, and the page tells it only
 * which wire to speak. Six of these models speak the openai wire to an endpoint of their own,
 * and neither the endpoint nor the model id survives that trip: the key is stored under the
 * wire and the request goes to the wire's default host. Measured against a stand-in vendor, a
 * key entered for GLM arrived as "Bearer glm-key-abc123" at /v1/chat/completions asking for
 * gpt-5.2, which on a real deployment is api.openai.com. Sending the base from the page would
 * close it and open something worse, since the page would then choose where the server's key
 * goes. So a deployment that cannot route a vendor does not offer it, which is the same answer
 * this app already gives for a model it has no way to run.
 */
export const canReach = (m: ModelChoice = chosen()) => {
  if (m.wire === 'cli') return canUseCli()
  return !(isServed && (m.base || m.id === 'custom'))
}

/** A model the person already has needs no key, only somewhere to run it. */
export const canWrite = (_p?: Provider) =>
  canReach() && ((chosen().wire === 'cli' ? canUseCli() : Boolean(keyFor())) || held.includes(chosen().wire))
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
  extra?: { maxTokens?: number; kind?: string },
): Promise<string | null> {
  const m = chosen()
  // the local Claude has no key and no endpoint: it is a process, not a request
  if (m.wire === 'cli') {
    if (!host.cli) return null
    const out = await host.cli(system, user, onDelta, extra?.kind)
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

/**
 * The control characters a model leaves loose inside its own strings, escaped.
 *
 * A world carries thirty to sixty lines of CSS in one JSON string, and a reply that writes those
 * lines as actual lines is not JSON any more. Neither reader here could take it: the parse fails
 * outright and the brace walk, which finds the object boundaries correctly, then fails on the
 * same slice for the same reason. Measured across the four shapes a reply arrives in, this is the
 * one that lost the whole answer while nothing was wrong with the answer.
 */
const looseJson = (s: string) => {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of s) {
    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }
    if (escaped) {
      escaped = false
      out += ch
      continue
    }
    if (ch === '\\') {
      escaped = true
      out += ch
      continue
    }
    if (ch === '"') {
      inString = false
      out += ch
      continue
    }
    out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch
  }
  return out
}

const grabJson = (text: string) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const cut = text.slice(start, end + 1)
  try {
    return JSON.parse(cut) as Record<string, unknown>
  } catch {
    // a second reading, with the loose newlines inside its strings tied down
    try {
      return JSON.parse(looseJson(cut)) as Record<string, unknown>
    } catch {
      return null
    }
  }
}


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
    .map((s) => ({ id: s.id, role: s.role, form: s.form, content: s.content }))
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
    `This is a ${product.kind}, not software in general, so the offer, the proof and the ` +
      `substance mean what they mean for a ${product.kind}.\n` +
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


/**
 * Ask for a set of visual systems rather than choosing from mine.
 *
 * Six hand written worlds is six points in a space, and every page the app could make was
 * inside a box I drew. This lets the space be explored instead of enumerated. Every value is
 * clamped on the way in, so a model can be daring without being able to produce an unreadable
 * page, and the built in worlds remain the fallback when the call fails.
 */
/**
 * Somewhere for each call to look, since none of them can see the others.
 *
 * Splitting the design across concurrent calls is what makes it fast, but a call that only knows
 * the brief reaches for the same objects as its neighbours: eight independent calls came back
 * with a betting slip twice and four names built on the word closing. Naming a territory each is
 * enough to keep them apart, and it costs nothing, because the prompt was already listing
 * examples and these are the same kind of thing.
 */
/**
 * The deck, dealt fresh each wall.
 *
 * These used to be eight strings written here and consumed in index order, so every wall for
 * every product started from the same eight grounds, forever, and two runs of Wall produced two
 * versions of the same eight worlds. The direction library has fifty of them, each carrying its
 * chain of correlated decisions and the cliche it is prone to, and it was written for exactly
 * this and then never wired up. Fifty shuffled beats eight fixed: a call handed a seed packet
 * and a call handed a fire exit plan cannot converge, and the next wall draws different ones.
 */
const territories = (n: number) => dealDirections(n).map(directionSeed)

/**
 * A layout for each hand, dealt rather than left to every call to work out for itself.
 *
 * Measured across two real walls, the model chose column four times in five, both times, and
 * never once reached for mosaic or weave. That is not the prompt failing to describe them. Every
 * call is handed one ground and cannot see the other four, so each independently picks the
 * arrangement that best fits the object it was given, and for most objects that is a column.
 * Variety across a wall cannot come out of independent calls each choosing the most natural
 * answer, which is the same reason the directions are dealt from a deck instead of listed.
 *
 * So the three that never get chosen are dealt one each, and the rest are column, because column
 * really is right for most things. It is a lean rather than an instruction: a ground that refuses
 * it should win, since a spread forced onto a receipt is worse than another column.
 */
const shuffled = <T>(xs: T[]): T[] =>
  xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

function layoutDeck(n: number): string[] {
  const deck = ['split', 'mosaic', 'weave'].slice(0, Math.max(0, n - 1))
  while (deck.length < n) deck.push('column')
  return shuffled(deck)
}

/**
 * How many worlds one call designs.
 *
 * Thinking is priced in seconds and scales with how much is being decided at once, so this is
 * the single biggest lever on how long a wall takes. Measured on the same brief, eight worlds
 * either way: one call took 166s to the first world and 232s to the last; four calls of two took
 * 57s and 118s; eight calls of one took 42s and 106s.
 *
 * One, now that the deck deals a distinct ground to every call. Two was chosen because a call
 * designing a pair can be told to make the pair far apart, and a call designing one has nothing
 * to be far apart from. That reasoning held while every call saw the same eight territories in
 * the same order; it does not hold now that each is handed its own direction out of fifty, which
 * separates them before they start. So the instruction is no longer worth the fifteen seconds it
 * was costing on the way to the first world.
 */
const PER_HAND = 1

/**
 * A page in one world, built the way the app builds one, for looking at rather than for reading.
 *
 * The copy is the defaults, because what is being asked about is the design and not the words.
 */
function probe(world: World): Page {
  const t = world.taste(PRESETS[0])
  const base = starterPage(t, 'Product')
  const pool = new Map<Role, Section[]>()
  for (const s of base.sections) pool.set(s.role, [...(pool.get(s.role) ?? []), s])
  const ordered = world.compose?.length
    ? world.compose.map((r) => pool.get(r)?.shift() ?? {
        id: r, role: r, form: ROLE_FORMS[r][0], on: true, content: defaultContent(r, 'Product'),
      })
    : base.sections
  return { ...base, world: world.id, backdrop: world.backdrop, taste: t, sections: dressSections(ordered, world) }
}

/**
 * What a designed world trips, asked only about the design.
 *
 * The detector has always run on model output, and has never done anything about it: twice to
 * put a verdict on a chip, once to write an avoid note into the copy prompt. Measured on a real
 * wall, every one of the five worlds the model designed tripped it, while the built-in worlds
 * cannot ship unless they are clean on every preset. The house was held to a standard its own
 * output was not.
 *
 * The catalogue polices copy as well as design, and this page is wearing placeholder copy on
 * purpose, so the copy half would flag every world identically and none of it would be the
 * world's to fix. Flags carry which half they came from, so this asks for one of them. That
 * replaces an earlier trick of subtracting a known-clean world's flags from this one's, which
 * got the same answer by arithmetic and could not say why.
 */
function flawsIn(world: World): string[] {
  // renderPage resolves a world by id, so an unregistered one would be measured as the fallback
  registerWorlds([world])
  const page = probe(world)
  return slop(page, renderPage(page, { title: 'Product' }))
    .filter((f) => f.kind === 'design')
    .map((f) => `${f.label}. ${f.why}`)
}

/**
 * Everything wrong with a world: what it reads as, and what it measures.
 *
 * The detector reads the source of a page and cannot see a column that changed width; the ruler
 * lays the page out at the three widths that occur and cannot see a gradient in a string. A real
 * wall produced both kinds in one run, and only one of them was ever being asked about.
 */
async function faultsIn(world: World): Promise<string[]> {
  const read = flawsIn(world)
  const measured = await strainsIn(renderPage(probe(world), { title: 'Product', still: true })).catch(() => [])
  return [...read, ...measured]
}

/**
 * Ask for the same world with its faults taken out.
 *
 * Correcting is not designing. The design call thinks for a minute or more because it is
 * deciding what the thing is; this one is handed a finished object and a list of what is wrong
 * with it, which is the shape of work that was measured taking 14.8 seconds with thinking and
 * 5.6 without. So it says it is a repair and gets none, and a wall pays for this only on the
 * worlds that failed.
 */
async function mend(
  raw: Record<string, unknown>,
  world: World,
  flaws: string[],
  at: number,
  ground: string,
  provider: Provider,
  brief: string,
): Promise<World> {
  const text = await ask(
    provider,
    MEND_SYSTEM,
    `${brief}\n\nThis is a world you designed, grounded in ${ground}:\n\n${JSON.stringify(raw)}\n\n` +
      `Rendered, it trips ${flaws.length === 1 ? 'this check' : `these ${flaws.length} checks`}:\n` +
      `${flaws.map((f) => `- ${f}`).join('\n')}\n\n` +
      'Return it with those fixed and everything else left alone.',
    undefined,
    { maxTokens: 8000, kind: 'repair' },
  ).catch(() => null)
  const json = text ? (grabJson(text) as { worlds?: Record<string, unknown>[] } | null) : null
  // The same walk the design call recovers with. A world carries thirty to sixty lines of CSS,
  // and a reply that puts a literal newline inside that string is not JSON any more, which is
  // why the design call has never trusted grabJson alone. The repair reads a reply of exactly
  // the same shape and size and did trust it: measured across two real walls, three repairs came
  // back at four and five thousand characters and were thrown away whole, two of them in one
  // run. Nothing was wrong with the model's answer except the reader.
  const back = json?.worlds?.[0]
    ?? (text ? (scanSections(text, 0, '"worlds"').out[0] as unknown as Record<string, unknown> | undefined) : undefined)
  if (!back) return world
  const mended = madeWorld(back, at)
  // kept only if it is actually better, because a repair that trades one fault for another is
  // a second opinion rather than a fix, and the first one at least came from a call that thought
  if (!mended.name || (await faultsIn(mended)).length >= flaws.length) {
    registerWorlds([world])
    return world
  }
  return mended
}

export async function promptWorlds(
  product: Product,
  n: number,
  onWorld?: (world: World, i: number) => void,
  provider: Provider = 'model',
  /** called each time the model proves it is still thinking, before any of it can be shown */
  onThinking?: () => void,
): Promise<World[]> {
  // the mock stands in here too, or an offline run reaches the real API and fails on the key
  if (mockReply) {
    const out = mockReply('worlds', n) as { worlds?: Record<string, unknown>[] } | null
    const fromMock = (out?.worlds ?? []).map(madeWorld).filter((w) => w.name)
    return fromMock.length >= 2 ? fromMock : WORLDS
  }
  // A world is complete long before the reply is, and the page for it can start then, which is
  // what turns one long wait into eight overlapping ones.
  const brief = `A ${product.kind}: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}`
  // the index is shared, so a world takes the next free page whichever call finished it
  let seen = 0

  const hand = async (count: number, ground: string[], lean: string) => {
    /**
     * The beat, and nothing else.
     *
     * This used to hand each world over the moment its closing brace arrived, which was worth
     * doing when one call designed several: a page could start writing while the rest were still
     * being drawn. A call designs one now, so its world parses as the reply ends and there is no
     * head start left to lose. What the stream is still for is the empty delta, which is the
     * model proving it is alive during the minute before it writes anything.
     */
    const feed = onThinking
      ? (delta: string) => {
          if (!delta) onThinking()
        }
      : undefined
    const text = await ask(
      provider,
      // the territory goes last so the long shared prompt in front of it still caches
      `${WORLDS_SYSTEM}\n\nBuild these particular ones from ${ground.join(', or ')}. One object each.` +
        `\n\nLay this one out as a ${lean}, unless the ground you were given genuinely refuses it.`,
      `${brief}\n\nDesign ${count === 1 ? 'one world' : `${count} worlds`} for it.`,
      feed,
      { maxTokens: 8000, kind: 'design' },
    ).catch(() => null)
    // A world carries CSS, so a cut reply used to yield nothing at all. The same walk that
    // recovers half-arrived sections recovers half-arrived worlds.
    const json = text ? (grabJson(text) as { worlds?: Record<string, unknown>[] } | null) : null
    const drawn = json?.worlds ?? (text ? (scanSections(text, 0, '"worlds"').out as unknown as Record<string, unknown>[]) : [])

    // Checked before it is used, rather than after it has been chosen. A world that fails goes
    // back once with its own faults named; a world that passes costs nothing extra.
    const out: World[] = []
    for (const raw of drawn) {
      // the wall has n places and every world that lands takes one, so a call that answers with
      // more than it was asked for cannot start a ninth page
      if (seen >= n) break
      const candidate = madeWorld(raw as unknown as Record<string, unknown>, seen)
      if (!candidate.name) continue
      const at = seen
      seen += 1
      const flaws = await faultsIn(candidate)
      const world = flaws.length
        ? await mend(raw as unknown as Record<string, unknown>, candidate, flaws, at, ground[out.length] ?? ground[0], provider, brief)
        : candidate
      onWorld?.(world, at)
      out.push(world)
    }
    return out
  }

  // one deal for the whole wall, so no two hands are handed the same ground
  const deck = territories(n)
  const leans = layoutDeck(Math.ceil(n / PER_HAND))
  const hands = Array.from({ length: Math.ceil(n / PER_HAND) }, (_, k) => {
    const count = Math.min(PER_HAND, n - k * PER_HAND)
    return hand(count, deck.slice(k * PER_HAND, k * PER_HAND + count), leans[k])
  })
  const made = (await Promise.all(hands)).flat()
  return made.length >= 2 ? made : WORLDS
}

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
    // this is field extraction rather than design or writing, and it is the whole wait between
    // describing a product and seeing a wall, so it says so and gets the model that suits it
    : grabJson((await ask(provider, INTAKE_SYSTEM, text, undefined, { kind: 'intake' })) ?? '')
  const j = raw as { product?: Partial<Product>; questions?: Intake['questions'] } | null
  if (!j?.product) return null
  return {
    product: { ...EMPTY_PRODUCT, ...j.product, kind: asKind((j.product as { kind?: unknown }).kind) },
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
    `Draw one abstract image for the ${sec.role} section of a landing page.`,
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
