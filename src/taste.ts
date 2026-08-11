import { PRESETS } from '@/design/presets'
import { FACES, faceKey } from '@/design/faces'
import type { Flag } from '@/slop'
import type { Page } from '@/sections'
import type { World } from '@/worlds'

/**
 * Taste, in both senses: the sheet a variant is generated against, and what this person keeps.
 *
 * The sheet is the contract, and the looks offered at setup live in design/presets.ts with the
 * rest of the editable design knowledge. Below it is the other half, which is a record of
 * judgements rather than of values: what was pinned, what was culled and what it read as, so a
 * wall can be handed the reasoning and not only the winner.
 *
 * The types only. Nothing here imports the renderer or the detector, because a page's flags are
 * read where a page is already being rendered, and a memory file that had to render to be read
 * would be a memory file nothing outside the app could open.
 */

export interface Taste {
  name: string
  bg: string
  ink: string
  dim: string
  accent: string
  accent2: string
  display: string // headline font stack
  body: string
  scale: number // type scale ratio
  radius: number
  density: number // 0 airy … 1 tight
  weight: number // display font weight
  caps: boolean // uppercase eyebrows / small caps feel
  motion: 'still' | 'soft' | 'lively'
}



const hex2rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]
const rgb2hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

export const luminance = (hex: string) => {
  const [r, g, b] = hex2rgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export const shift = (hex: string, amount: number) => {
  const [r, g, b] = hex2rgb(hex)
  return rgb2hex(r + amount, g + amount, b + amount)
}

export const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hex2rgb(a)
  const [r2, g2, b2] = hex2rgb(b)
  return rgb2hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export const alpha = (hex: string, a: number) => {
  const [r, g, b] = hex2rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Extract a taste sheet from a reference image: the page you love, read as a system. */
export async function tasteFromImage(dataUrl: string, name = 'from reference'): Promise<Taste> {
  const img = new Image()
  img.src = dataUrl
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = rej
  })
  const w = 160
  const h = Math.max(1, Math.round((img.height / img.width) * w))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const buckets = new Map<string, { n: number; r: number; g: number; b: number; sat: number; lum: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (data[i + 3] < 200) continue
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0, lum: 0 }
    e.n++
    e.r += r
    e.g += g
    e.b += b
    e.sat += sat
    e.lum += lum
    buckets.set(key, e)
  }
  const list = [...buckets.values()]
    .map((e) => ({
      hex: rgb2hex(e.r / e.n, e.g / e.n, e.b / e.n),
      n: e.n,
      sat: e.sat / e.n,
      lum: e.lum / e.n,
    }))
    .sort((a, b) => b.n - a.n)
  if (!list.length) return { ...PRESETS[0], name }

  const bg = list[0].hex
  const dark = luminance(bg) < 0.5
  // ink: the most common colour with strong contrast against the background
  const ink =
    list.find((c2) => Math.abs(c2.lum - luminance(bg)) > 0.45)?.hex ?? (dark ? '#f2f4f8' : '#101216')
  // accent: the most saturated colour that isn't background or ink
  const accents = list
    .filter((c2) => c2.sat > 0.35 && Math.abs(c2.lum - luminance(bg)) > 0.12)
    .sort((a, b) => b.sat * Math.log(b.n + 2) - a.sat * Math.log(a.n + 2))
  const accent = accents[0]?.hex ?? (dark ? '#6ea8fe' : '#1a54ff')
  const accent2 = accents[1]?.hex ?? mix(accent, ink, 0.4)

  return {
    name,
    bg,
    ink,
    dim: mix(ink, bg, 0.45),
    accent,
    accent2,
    display: FACES.sans,
    body: FACES.sans,
    scale: 1.3,
    radius: 8,
    density: 0.55,
    weight: 650,
    caps: false,
    motion: 'soft',
  }
}

/** small deterministic drift, so a wall of variants is a family and not clones */
export function drift(t: Taste, seed: number): Taste {
  const r = (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280
    return x - Math.floor(x)
  }
  const dark = luminance(t.bg) < 0.5
  return {
    ...t,
    bg: shift(t.bg, (r(1) - 0.5) * (dark ? 10 : -10)),
    accent: r(2) > 0.55 ? t.accent2 : t.accent,
    accent2: r(2) > 0.55 ? t.accent : t.accent2,
    scale: Math.max(1.16, Math.min(1.5, t.scale + (r(3) - 0.5) * 0.14)),
    radius: Math.max(0, Math.round(t.radius + (r(4) - 0.5) * 10)),
    density: Math.max(0.25, Math.min(0.85, t.density + (r(5) - 0.5) * 0.22)),
    weight: r(6) > 0.6 ? 800 : t.weight,
  }
}

// ——— the cull story ———

/** how many bar instructions are worth carrying, and how much of one */
const ASKED = 6
const SAID = 80
/** how many hand edits are worth naming before the list stops being read */
const EDITED = 8

/** something typed into the prompt bar, and whether it was aimed at the page that won */
export interface Asked {
  said: string
  chosen: boolean
}

/** a paper on the wall, named the way a person would name it when saying why it went */
export interface Seen {
  world: string
  /** the direction it grew from, when a model designed it from one */
  ground?: string
  angle?: string
  /** what the detector reads on it, which on a culled page is usually why it went */
  flags?: string[]
}

/**
 * Why this one, and not the other eight.
 *
 * Everything a person does to a wall is a judgement: pinning, culling, asking the bar for
 * something different, retyping a line straight on the paper. All of it used to die in the
 * browser, and the handoff carried the winning page as though it had arrived on its own. The
 * reasoning is the more useful half of a choice: an agent told what was turned away and what it
 * read as can hold that line through the next screen, and an agent handed only the artifact
 * cannot.
 */
export interface WallStory {
  /** how many papers were ever up, because one of nine is a different claim from one of two */
  of: number
  pins: Seen[]
  kills: Seen[]
  asked: Asked[]
  /** dotted role.key paths retyped by hand on the chosen paper: the words as wanted */
  edited: string[]
}

/** a paper and what is known about it, gathered where the renderer and the detector already are */
export interface Judged {
  page: Page
  world: World
  flags?: Flag[]
}

const seenAs = (j: Judged): Seen => ({
  world: j.world.name,
  ...(j.world.ground ? { ground: j.world.ground } : {}),
  ...(j.page.angle ? { angle: j.page.angle } : {}),
  ...(j.flags?.length ? { flags: [...new Set(j.flags.map((f) => f.label))].slice(0, 6) } : {}),
})

export function storyOf(wall: {
  of: number
  pins: Judged[]
  kills: Judged[]
  asked: Asked[]
  edited: string[]
}): WallStory {
  return {
    of: wall.of,
    // what a kept page reads as is not why it was kept, so only the culled carry their tells
    pins: wall.pins.map((j) => seenAs({ ...j, flags: undefined })),
    kills: wall.kills.map(seenAs),
    // the last few, because a long session asks for many things and the recent ones are the
    // ones the chosen page actually came out of
    asked: wall.asked.slice(-ASKED).map((a) => ({ said: a.said.slice(0, SAID), chosen: a.chosen })),
    edited: [...new Set(wall.edited)].slice(0, EDITED),
  }
}

// ——— accumulated taste ———

/**
 * What this person keeps and kills, across walls.
 *
 * Every session labels design data and every session used to throw it away, so the tenth wall
 * knew exactly as much about the person as the first. This is the log that changes that: an
 * append only list of walls, kept small enough to open and read, with every derived signal
 * computed at read time rather than stored. That last part is the whole design. A stored score
 * is a number nobody can argue with; a list of walls is a file where deleting the line about
 * the wall you regret takes the bias with it.
 */
const WALLS = 12
/** how many of them a lean is read from, so a taste can move rather than only accumulate */
const RECENT = 8
const KEPT = 4
const KILLED = 8
/** a world name is clamped to this where a model writes one, and a ground is a library name */
const NAME = 26
const GROUND = 40

const LAYOUTS = ['column', 'split', 'mosaic', 'weave']

/** a page reduced to the handful of traits a preference could be made of */
export interface Essence {
  world: string
  ground?: string
  layout: string
  display: string
  scale: number
  density: number
  caps: boolean
  dark: boolean
}

export interface Kept extends Essence {
  /** the one that was handed back, which counts for more than one that survived triage */
  chosen: boolean
}

export interface Killed extends Essence {
  flags?: string[]
}

export interface WallTaste {
  at: string
  /** taste is kind scoped, because a game never seeds a book */
  kind: string
  kept: Kept[]
  killed: Killed[]
  asked: Asked[]
}

export interface TasteLog {
  format: 1
  walls: WallTaste[]
}

const NOTHING: TasteLog = { format: 1, walls: [] }

export const essence = (page: Page, world: World): Essence => ({
  world: world.name.slice(0, NAME),
  ...(world.ground ? { ground: world.ground.slice(0, GROUND) } : {}),
  layout: world.layout ?? 'column',
  display: faceKey(page.taste.display),
  scale: page.taste.scale,
  density: page.taste.density,
  caps: page.taste.caps,
  dark: luminance(page.taste.bg) < 0.5,
})

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
const text = (v: unknown, n: number) => String(v ?? '').slice(0, n).trim()
/** the first few, for lists written most important first */
const some = <T>(v: unknown, cap: number, read: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.slice(0, cap).map(read).filter((x): x is T => x !== null) : []
/** the last few, for lists written oldest first */
const recent = <T>(v: unknown, cap: number, read: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? some(v.slice(-cap), cap, read) : []
const flagNames = (v: unknown) => some(v, 6, (f) => text(f, NAME) || null)

function readEssence(raw: unknown): Essence | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const world = text(r.world, NAME)
  if (!world) return null
  const ground = text(r.ground, GROUND)
  return {
    world,
    ...(ground ? { ground } : {}),
    layout: LAYOUTS.includes(String(r.layout)) ? String(r.layout) : 'column',
    display: text(r.display, NAME) || 'sans',
    // the ranges madeWorld holds a model to, applied again here, because this is a file a person
    // is invited to open and edit and a scale of forty is as reachable by hand as by accident
    scale: clamp(r.scale, 1.1, 1.7, 1.3),
    density: clamp(r.density, 0.25, 0.9, 0.5),
    caps: Boolean(r.caps),
    dark: Boolean(r.dark),
  }
}

const readAsked = (raw: unknown): Asked | null => {
  if (!raw || typeof raw !== 'object') return null
  const said = text((raw as Record<string, unknown>).said, SAID)
  return said ? { said, chosen: Boolean((raw as Record<string, unknown>).chosen) } : null
}

/**
 * Read a log written by anything, including a person with an editor.
 *
 * Nothing is trusted. A shape this build does not know reads as no memory at all, which is the
 * right degradation: a wall biased by a file it half understood is worse than a wall biased by
 * nothing, and this file crosses versions the same way the handoff does.
 */
export function readTasteLog(raw: unknown): TasteLog {
  if (!raw || typeof raw !== 'object') return NOTHING
  const doc = raw as Record<string, unknown>
  if (doc.format !== 1) return NOTHING
  return {
    format: 1,
    walls: recent(doc.walls, WALLS, (w) => {
      if (!w || typeof w !== 'object') return null
      const r = w as Record<string, unknown>
      const kind = text(r.kind, NAME)
      if (!kind) return null
      return {
        at: /^\d{4}-\d{2}-\d{2}$/.test(String(r.at)) ? String(r.at) : '',
        kind,
        kept: some(r.kept, KEPT, (k) => {
          const e = readEssence(k)
          return e && { ...e, chosen: Boolean((k as Record<string, unknown>).chosen) }
        }),
        killed: some(r.killed, KILLED, (k) => {
          const e = readEssence(k)
          if (!e) return null
          const flags = flagNames((k as Record<string, unknown>).flags)
          return flags.length ? { ...e, flags } : e
        }),
        asked: recent(r.asked, ASKED, readAsked),
      }
    }),
  }
}

/**
 * Add this wall to what is remembered.
 *
 * The kept pages are the chosen one first and then whatever survived triage pinned, because
 * choosing is a stronger statement than not culling. A killed page carries only the design tells
 * that no kept page on the same wall also wore: a tell on every page of one wall is what the
 * model did that day rather than what this person dislikes, and without the filter the memory
 * fills up with the model's own weather.
 */
export function recordWall(raw: unknown, wall: {
  at: string
  kind: string
  chosen: Judged
  pins: Judged[]
  kills: Judged[]
  asked: Asked[]
}): TasteLog {
  const log = readTasteLog(raw)
  const design = (j: Judged) => (j.flags ?? []).filter((f) => f.kind === 'design').map((f) => f.label)
  const keeping = [wall.chosen, ...wall.pins]
  const survived = new Set(keeping.flatMap(design))
  const kept: Kept[] = keeping
    .slice(0, KEPT)
    .map((j, i) => ({ ...essence(j.page, j.world), chosen: i === 0 }))
  const killed: Killed[] = wall.kills.slice(0, KILLED).map((j) => {
    const flags = [...new Set(design(j).filter((f) => !survived.has(f)))]
    const e = essence(j.page, j.world)
    return flags.length ? { ...e, flags } : e
  })
  const added: WallTaste = {
    at: wall.at.slice(0, 10),
    kind: wall.kind,
    kept,
    killed,
    asked: wall.asked.slice(-ASKED).map((a) => ({ said: a.said.slice(0, SAID), chosen: a.chosen })),
  }
  // newest last, and the oldest fall off the front, so the file reads in the order it happened
  return { format: 1, walls: [...log.walls, added].slice(-WALLS) }
}

/** what the log adds up to, recomputed every time it is read */
export interface Lean {
  /** grounds worth dealing again, most liked first */
  favor: string[]
  /** grounds repeatedly culled, dealt to nobody */
  shun: string[]
  /** tells culled across more than one wall */
  avoidFlags: string[]
  /** the traits most kept pages share, as one line */
  keeps: string
}

/** the words one kept page could be described with, so a majority over them is a preference */
const traitsOf = (k: Kept): string[] =>
  [
    k.dark ? 'dark' : 'light',
    k.density > 0.65 ? 'dense' : k.density < 0.4 ? 'airy' : '',
    k.caps ? 'small caps' : '',
    k.display,
    k.layout === 'column' ? '' : k.layout,
  ].filter(Boolean)

/**
 * What the walls of one kind add up to.
 *
 * Scored rather than counted: choosing a ground says more than surviving triage, and both say
 * more than one cull. The thresholds are the anti-convergence story in numbers. A ground is
 * favoured on a single choice, and shunned only after being culled twice, so a taste can form
 * quickly and a dislike has to be repeated. Nothing here is stored, so a line deleted from the
 * file is a preference genuinely forgotten rather than one that lives on in a score.
 */
export function tasteLean(log: TasteLog, kind: string): Lean | null {
  const walls = log.walls.filter((w) => w.kind === kind).slice(-RECENT)
  if (!walls.length) return null

  const score = new Map<string, number>()
  const bump = (ground: string | undefined, by: number) => {
    if (ground) score.set(ground, (score.get(ground) ?? 0) + by)
  }
  for (const w of walls) {
    for (const k of w.kept) bump(k.ground, k.chosen ? 3 : 2)
    for (const k of w.killed) bump(k.ground, -1)
  }
  const ranked = [...score].sort((a, b) => b[1] - a[1])

  // a tell has to have been culled on two separate walls before it counts as a dislike, because
  // one wall's kills are as easily one model's bad night as they are a preference
  const culledIn = new Map<string, number>()
  for (const w of walls) {
    for (const f of new Set(w.killed.flatMap((k) => k.flags ?? []))) {
      culledIn.set(f, (culledIn.get(f) ?? 0) + 1)
    }
  }

  const kept = walls.flatMap((w) => w.kept)
  const shared = new Map<string, number>()
  for (const k of kept) for (const t of traitsOf(k)) shared.set(t, (shared.get(t) ?? 0) + 1)

  return {
    favor: ranked.filter(([, n]) => n >= 2).map(([g]) => g),
    shun: ranked.filter(([, n]) => n <= -2).map(([g]) => g),
    avoidFlags: [...culledIn].filter(([, n]) => n >= 2).map(([f]) => f),
    // a trait fewer than half the kept pages wore is not a preference, it is a coincidence, and
    // three kept pages is the least that can have a majority worth the name
    keeps: kept.length < 3
      ? ''
      : [...shared]
          .filter(([, n]) => n * 2 > kept.length)
          .sort((a, b) => b[1] - a[1])
          .map(([t]) => t)
          .join(', '),
  }
}

/**
 * The memory, said to a design call.
 *
 * Split, and deliberately lopsided. What this person removes goes to every hand, because pruning
 * a hated pattern narrows nothing: fifty grounds minus one cliche is still fifty grounds. What
 * they keep goes only to the hands already dealt from what they like, because a whole wall told
 * to be dense, mono and dark is a wall of one page, and the wall is the product.
 */
export function tasteBrief(lean: Lean, favored: boolean): string {
  const said = []
  if (lean.avoidFlags.length) {
    said.push(
      `This person has taken pages off the wall for ${lean.avoidFlags.join(', ')}, so leave those out of this one.`,
    )
  }
  if (favored && lean.keeps) {
    said.push(
      `The pages they keep are ${lean.keeps}, so lean that way where your ground allows it, ` +
        'and never against the ground, which is the stronger instruction.',
    )
  }
  return said.join(' ')
}

/** the same memory, said to a call that is writing words rather than designing */
export const tasteAvoid = (lean: Lean): string =>
  lean.avoidFlags.length
    ? `Pages reading as ${lean.avoidFlags.join(', ')} have been taken off this person's wall before, ` +
      'so do not write copy that asks for them.'
    : ''
