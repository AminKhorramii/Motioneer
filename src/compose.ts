/** Making pages: alternatives, section prompts, and the model path (with a mock for tests). */

import { PRESETS } from '@/design/presets'
import { tasteAvoid, tasteBrief, type Lean, type Taste } from '@/taste'
import { giveKey, host, isDesktop, isServed, servedConfig } from '@/host'
import { slop, slopBrief } from '@/slop'
import { dealDirections, dealShapes, dealDepictions, directionSeed, type Direction } from '@/design/directions'
import { ANGLES } from '@/design/angles'
import { INTAKE_SYSTEM, MEND_SYSTEM, PAGE_SYSTEM, WORLDS_SYSTEM, WRITTEN_SYSTEM } from '@/design/prompts'
import { madeWritten, safeStyle, undrawn, type Written } from '@/written'
import { grabJson, scanSections } from '@/reply'
import { MODELS, modelById, type ModelChoice } from '@/models'
import { BACKDROPS, type Backdrop } from '@/backdrop'
import { DEFAULT_KIND, asKind, type Kind } from '@/design/kinds'
import { shrinkDataUrl } from '@/imagepipe'
import { renderPage } from '@/render'
import { WIDTHS, strainsIn } from '@/geometry'
import { WORLDS, dressSections, madeWorld, register as registerWorlds, unspent, worldById, type World } from '@/worlds'
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

/**
 * The whole look deck, light and dark.
 *
 * This was filtered to the five dark looks for a wall, and the wall came back reading as generated.
 * Two reasons, and both were predictable. Light against dark is the loudest difference between two
 * papers seen side by side, so removing it cut the strongest axis a wall has, from eight looks to
 * five of one temperature. And dark is where every design tell in the catalogue lives: frosted
 * panels, a violet wash, glowing text, a transition on everything are all things that only happen
 * on a dark ground. Pushing every page there put the whole wall in the one region the detector
 * exists to police. Dark belongs in the deck, not as the deck.
 */
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
/**
 * Ask again for the lines that trip the catalogue, and keep the answer only if it is better.
 *
 * The detector ran in three places and repaired exactly one of them. A world that trips it goes
 * back to the model with its faults named and is kept only if it improved; copy that trips it got
 * a chip on the dock and shipped. The asymmetry showed: a recorded wall handed back a testimonial
 * signed "A real person" at "founder, somewhere", which is this app's own placeholder for a page
 * with no customer yet. The copy call is given the page as it stands and rewrites what it chooses
 * to, so anything it declines to touch survives all the way into the file somebody ships.
 *
 * promptPage already reads the detector over the page it is handed and writes the findings into
 * its own prompt, so handing it the written page names the real faults rather than the defaults',
 * and this is nine lines rather than a second prompt to keep in agreement with the first.
 *
 * Only a page that failed pays for this, and it pays once. A repair that trades one tell for
 * another is a second opinion rather than a fix, so the page that came back is kept only when it
 * is carrying strictly fewer.
 */
async function mendCopy(page: Page, product: Product, provider: Provider): Promise<Page> {
  // no html, so this is the copy half: the design half is the world's and was settled before a
  // word was written
  const faults = slop(page).filter((f) => f.kind === 'copy')
  if (!faults.length) return page
  const again = await promptPage(
    page,
    'Those lines trip the checks named below. Rewrite only what they name and leave the rest of ' +
      'the page exactly as it is, because everything else was already right.',
    product,
    provider,
  ).catch(() => null)
  if (!again) return page
  return slop(again).filter((f) => f.kind === 'copy').length < faults.length ? again : page
}

/**
 * Ask for the styles again when the page reads as generated, and keep them only if it improved.
 *
 * The detector has always had two halves and only ever repaired one of each kind of page. A world
 * that tripped the design half went back with its faults named; a written page got a chip on the
 * dock and shipped. That was survivable while written pages were three of eight beside worlds that
 * were being repaired, and became the whole story when they became the wall: a page can trip
 * frosted panels, a violet wash, glowing text and a transition on everything, and nothing at all
 * happens.
 *
 * The styles rather than the whole page. Every design tell in the catalogue is a CSS decision, the
 * markup and the words were not what was wrong, and re-asking for the document would spend twelve
 * thousand tokens to fix four rules. Kept only if it carries strictly fewer, on the same reasoning
 * the world repair uses: a repair that trades one tell for another is a second opinion.
 */
/**
 * What the repairs did, said out loud where a harness can hear it.
 *
 * Whether this fires, and whether the answer it gets back is better, has been guessed at for
 * several rounds: a wall came back with two design flags and there was no way to tell whether the
 * repair had not run or had run and lost. It is a console line rather than app state because it
 * is a measurement of the model rather than a fact about the page, and the bench reads it.
 */
const say = (m: string) => console.info(`[wall] ${m}`)

async function mendWritten(page: Page, product: Product, provider: Provider): Promise<Page> {
  const written = page.written
  if (!written) return page
  const html = renderPage(page, { title: product.name })
  const faults = [
    ...slop(page, html)
      .filter((f) => f.kind === 'design')
      .map((f) => `${f.label}. ${f.why}`),
    // and the other half of the question the detector never asks: not whether this reads as
    // generated, but whether it drew the thing it was asked to draw
    ...undrawn(written),
    /**
     * And the half neither of them can reach, which had never run here at all.
     *
     * This module's own opening paragraph said the detector and the ruler both run over a written
     * page exactly as they run over an arranged one. Only the first was true: strainsIn was called
     * from faultsIn, faultsIn takes a World, and a written page has none. So for as long as the
     * wall has been written pages, nothing has measured one laid out. A page could scroll sideways,
     * set eight pixel body text or crush a column to a stack of single words, and every gate we had
     * would call it clean, because all of them read source and none of them read boxes.
     */
    ...await strainsIn(html, WIDTHS, 'page').catch(() => []),
  ]
  if (!faults.length) return page
  const text = await ask(
    provider,
    'You wrote the CSS for a landing page. Rendered, it trips checks that exist because those '
      + 'patterns are what make a page look generated rather than designed, and the reason is given '
      + 'with each one.\n\nReturn JSON shaped as {"css":"..."} carrying the same design with only '
      + 'the named faults fixed. Change nothing else: the markup is unchanged and every class you '
      + 'wrote still has to match it. Fix the fault rather than removing what carried it, because a '
      + 'page with the offending thing deleted is a page with a hole where a decision was.',
    `${written.css}\n\nIt trips ${faults.length === 1 ? 'this check' : `these ${faults.length} checks`}:\n`
      + faults.map((f) => `- ${f}`).join('\n'),
    undefined,
    { maxTokens: 6000, kind: 'repair' },
  ).catch(() => null)
  const css = text ? safeStyle((grabJson(text) as { css?: unknown } | null)?.css) : ''
  if (!css) {
    say(`repair ${faults.length} faults: no usable reply`)
    return page
  }
  const mended = { ...page, written: { ...written, css } }
  // counted exactly as the faults above were, or the comparison is rigged. Leaving the ruler out
  // of this half would score the repair against a shorter list than the one it was given and keep
  // work that made the page worse, which is the failure the strictly-fewer rule exists to prevent
  const mendedHtml = renderPage(mended, { title: product.name })
  const after = slop(mended, mendedHtml).filter((f) => f.kind === 'design').length
    + undrawn(mended.written!).length
    + (await strainsIn(mendedHtml, WIDTHS, 'page').catch(() => [])).length
  say(`repair ${faults.length} faults -> ${after}: ${after < faults.length ? 'kept' : 'discarded'}`)
  return after < faults.length ? mended : page
}

/**
 * Ask for a whole page, and put it in a place on the wall beside the arranged ones.
 *
 * One call rather than two. An arranged page costs a design call for its world and a copy call for
 * its words, and the split exists because the two halves land in different machinery. Here there
 * is no machinery to land in, so the page is designed and written at once, which is also the only
 * way its type can answer to its layout.
 *
 * A page that comes back unusable is not an empty place on the wall. The caller is handed nothing
 * and falls back to arranging that place, because eight papers and one hole is worse than eight
 * papers, and this path is the experimental half of a wall rather than the whole of it.
 */
export async function writeWhole(
  base: Page,
  product: Product,
  direction: Direction,
  i: number,
  /** the silhouette this hand was dealt, so eight independent calls do not all reach for a column */
  shape: string,
  /**
   * And how this hand draws its subject, for the same reason one level down.
   *
   * Pulled out of three real walls and laid side by side, nine of twelve drawn marks were the
   * same watch dial: eight independent calls each pick the most obvious rendering of the thing
   * they were handed, and obvious is the same answer every time.
   */
  depiction: string,
  provider: Provider = 'model',
  /** called each time the model proves it is still thinking, before any of it can be read */
  onBeat?: () => void,
): Promise<Page | null> {
  const angle = ANGLES[i % ANGLES.length]
  // the same look the arranged page in this place would have worn, so the two are compared on
  // what the model did with the page and not on which palette each happened to draw
  const dealt = arrange(base, i + 1)
  /**
   * And the object's own colours over the top of it, when the ground has them.
   *
   * The colour half only. The look still decides the type, the scale, the radius and the feel, so
   * the two axes a wall varies on stay independent: the object says what colour this page is and
   * the look says how it reads. Overriding the whole taste would collapse them into one axis and
   * hand every page built from the same ground an identical paper.
   *
   * This is the lever the wall was missing. Measured over two real walls the model typed five
   * colours of its own across eight pages and reached for a token three hundred and twenty nine
   * times, so it was never withholding colour: it was using the variables it was given, and every
   * look hands it the same two accents. A paragraph in the prompt asking for more was tried first
   * and moved nothing, which is this repository's own note about guidance and gates, again.
   */
  const page = direction.inks
    ? { ...dealt, taste: { ...dealt.taste, ...direction.inks } }
    : dealt
  const landed = (written: Written): Page => ({
    ...page,
    written,
    angle: angle.name,
    ground: written.ground ?? direction.name,
  })
  /**
   * The stand-in answers here too, or a suite reaches the network.
   *
   * Every other model call in this file checks the mock first and this one did not, so a run with
   * a mock installed sent eight real requests and got eight 401s before falling back to arranging.
   * The suites passed, because falling back is what they were written to survive, which is exactly
   * how a path stays untested while looking tested.
   */
  if (mockReply) {
    const out = mockReply('written', direction.name) as Record<string, unknown> | null
    const written = out && typeof out === 'object' ? madeWritten(out) : null
    return written ? landed(written) : null
  }
  const brief =
    `A ${product.kind}: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}\n` +
    `The one action is: ${product.cta}.\n\n` +
    `Build it from ${directionSeed(direction)}\n\n` +
    `Argue it as "${angle.name}". ${angle.instruction}\n\n` +
    `Lay this one out as ${shape}, unless the ground you were given genuinely refuses it.\n\n` +
    `Draw the subject ${depiction}, unless the subject genuinely refuses it. This is how this one ` +
    `is depicted and not what it is: the other pages on this wall are drawing the same thing other ` +
    `ways, so the picture here has to be the one nobody else will arrive at on their own.`
  // the same split the design hands used: what this person culls goes to every page, because
  // pruning narrows nothing, and what they keep goes only to a page dealt from what they like
  const note = memory ? tasteBrief(memory, memory.favor.includes(direction.name)) : ''
  /**
   * The beat, which is the only honest sign of life during this call.
   *
   * A whole page is one long call that writes nothing anyone can read until it is nearly done, so
   * the wall sits still for a minute. The model emits an empty delta while it thinks, and that is
   * the one mark on screen that moves because something moved rather than because a timer did.
   */
  const feed = onBeat ? (delta: string) => { if (!delta) onBeat() } : undefined
  const text = await ask(
    provider,
    note ? `${WRITTEN_SYSTEM}\n\n${note}` : WRITTEN_SYSTEM,
    brief,
    feed,
    { maxTokens: 12000, kind: 'design' },
  ).catch(() => null)
  if (!text) return null
  const raw = grabJson(text) as Record<string, unknown> | null
  if (!raw) return null
  const written = madeWritten(raw)
  if (!written) return null
  // a page that reads as generated goes back for its styles once, and only that page pays
  return mendWritten(landed(written), product, provider)
}

/**
 * Change a written page by asking the thing that wrote it.
 *
 * The bar rewrites the page you are reading, and for a written page it had been rewriting
 * something else. promptPage edits page.sections, which is what an arranged page is made of and
 * what a written page merely still carries for the brief: the instruction landed on data the
 * renderer never reads, the paper on screen did not move, and the app said "This page has been
 * rewritten." Worse than the no-op, the instruction was then pushed into the asked list, so it
 * travelled into the handoff story and into the taste log as a thing that had taken effect. A
 * memory of preferences is built out of that list, and it was being fed events that never happened.
 *
 * The whole document goes back rather than the styles alone, because unlike the repair this is not
 * known in advance to be a CSS fault: "name the pain in the headline" is words, "make the dial
 * bigger" is CSS, and the person typing is owed both. Nothing is mended afterwards. The repair
 * exists because eight pages are written while nobody is looking; here somebody is looking, and a
 * second call spent arguing with an instruction a reader just gave is the wrong way round.
 */
export async function rewriteWritten(
  page: Page,
  instruction: string,
  product: Product,
  provider: Provider = 'model',
): Promise<Page | null> {
  const written = page.written
  if (!written) return null
  if (mockReply) {
    const out = mockReply('rewrite', instruction) as Record<string, unknown> | null
    const made = out && typeof out === 'object' ? madeWritten(out) : null
    return made ? { ...page, written: { ...written, ...made } } : null
  }
  const text = await ask(
    provider,
    `${WRITTEN_SYSTEM}\n\nYou are changing a page you already wrote. Do what is asked and leave the `
      + `rest of the page alone: the reader is looking at it and expects to recognise it afterwards. `
      + `Return the whole document again, in the same shape, with the change made.`,
    `The page as it stands.\n\nHTML:\n${written.html}\n\nCSS:\n${written.css}\n\n`
      + `A ${product.kind}: ${product.name}. ${product.oneLiner}\n\n`
      + `Change this, and only this: ${instruction}`,
    undefined,
    { maxTokens: 12000, kind: 'design' },
  ).catch(() => null)
  if (!text) return null
  const raw = grabJson(text) as Record<string, unknown> | null
  if (!raw) return null
  const made = madeWritten(raw)
  if (!made) return null
  // the ground and the backdrop were decided when the page was dealt and are not the bar's to
  // change, so what comes back replaces the document and inherits the rest of what this page is
  return { ...page, written: { ...written, html: made.html, css: made.css, note: made.note || written.note } }
}

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
    // the page lands before it is judged, so the wall fills at the speed it always did and a
    // repair improves a paper already on the wall rather than delaying it
    onPage({ ...written, angle: angle.name })
    const mended = await mendCopy(written, product, 'model')
    if (mended !== written) onPage({ ...mended, angle: angle.name })
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

/**
 * What this person has kept and killed before, held the way the designed worlds are held.
 *
 * Module state rather than a parameter, for the same reason: it is one fact about the session
 * that three unrelated calls need, and threading it through the deal, the design prompt and the
 * copy prompt would put a memory argument on every signature between here and the app. The app
 * computes it once per build, so a log edited between walls is read again on the next one.
 */
let memory: Lean | null = null
export const setMemory = (lean: Lean | null) => {
  memory = lean
}

/**
 * The deal for the pages the model writes whole, which is now most of the wall.
 *
 * It lives here rather than at the call site because the memory does, and a caller that dealt its
 * own directions would be dealing them blind to what this person keeps: while the written pages
 * were three of eight that was a deliberate quarantine, and the moment they became the wall it
 * became the memory quietly having nothing left to bias.
 */
export const dealWritten = (n: number): Direction[] => dealDirections(n, memory ?? undefined)
export { dealShapes, dealDepictions }

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
  // and what this person has culled before, which the detector on this page cannot know
  const remembered = memory ? tasteAvoid(memory) : ''
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
      `Product: ${product.name}. ${product.oneLiner}\n${product.what}\nAudience: ${product.audience}\n\n${design}\n\nPage:\n${JSON.stringify(shape, null, 2)}\n\nInstruction: ${instruction}${avoid ? `\n\n${avoid}` : ''}${remembered ? `\n\n${remembered}` : ''}`,
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
 *
 * Directions rather than the lines folded out of them, because the name on a direction is the
 * only stable handle on what a page was: the world's own name is whatever the model called it,
 * and two walls that both started from the till roll never call it the same thing twice.
 */
const territories = (n: number): Direction[] => dealDirections(n, memory ?? undefined)

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
  return [
    ...slop(page, renderPage(page, { title: 'Product' }))
      .filter((f) => f.kind === 'design')
      .map((f) => `${f.label}. ${f.why}`),
    // and the other half of the question. The detector says whether this is generic; unspent says
    // whether it is anything. A world that trips neither has both avoided the median and chosen
    // something, and a world that trips this one goes back through the same repair.
    ...unspent(world, page.taste),
  ]
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
    `${brief}\n\nThis is a world you designed${ground ? `, grounded in ${ground}` : ''}:\n\n${JSON.stringify(raw)}\n\n` +
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

  const hand = async (count: number, ground: Direction[], lean: string) => {
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
    // A hand dealt from what this person likes hears what they like; a wild hand does not. The
    // kills half of the note goes to both, because pruning a hated pattern narrows nothing.
    const note = memory ? tasteBrief(memory, ground.some((d) => memory!.favor.includes(d.name))) : ''
    const text = await ask(
      provider,
      // the territory goes last so the long shared prompt in front of it still caches
      `${WORLDS_SYSTEM}\n\nBuild these particular ones from ${ground.map(directionSeed).join(', or ')}. One object each.` +
        `\n\nLay this one out as a ${lean}, unless the ground you were given genuinely refuses it.` +
        (note ? `\n\n${note}` : ''),
      `${brief}\n\nDesign ${count === 1 ? 'one world' : `${count} worlds`} for it.`,
      feed,
      // room for the drawing. A world may now carry nine thousand characters of CSS rather than
      // four, and a reply cut off mid-gradient costs the whole design it was in the middle of
      { maxTokens: 12000, kind: 'design' },
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
      /**
       * Exactly the ground this world was asked for, and nothing at all when there is none.
       *
       * A hand is dealt one ground and a call can answer with more worlds than it was asked for,
       * and those extra worlds used to fall back to the hand's only ground. A world stamped with
       * a direction it did not grow from teaches the memory a preference for something no page
       * on the wall ever stood on, and the memory is the one place that error compounds.
       */
      const dealt: Direction | undefined = ground[out.length]
      const flaws = await faultsIn(candidate)
      const built = flaws.length
        ? await mend(raw as unknown as Record<string, unknown>, candidate, flaws, at, dealt ? directionSeed(dealt) : '', provider, brief)
        : candidate
      /**
       * What it built from, which is what it was dealt unless it said otherwise.
       *
       * A call may refuse its ground when the register would misrepresent the subject, and it
       * names what it used instead. Stamping the dealt one over that would file the page in the
       * memory under an object it deliberately did not use, and the memory would then favour a
       * ground this person has never actually seen a page built from. An object it invented is
       * harmless to the deal, which only ever matches names back against the library.
       */
      const world = built.ground ? built : dealt ? { ...built, ground: dealt.name } : built
      // stamping makes a new object, and the renderer resolves a world by id, so the one the
      // map holds has to be this one and not the copy without the stamp
      registerWorlds([world])
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
