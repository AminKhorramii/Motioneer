import { PRESETS } from '@/design/presets'
import { FACES } from '@/design/faces'
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

/** breed two taste sheets: this one's colour, that one's typography */
export function cross(a: Taste, b: Taste): Taste {
  return {
    ...a,
    name: 'crossed',
    display: b.display,
    body: b.body,
    scale: b.scale,
    weight: b.weight,
    caps: b.caps,
    radius: Math.round((a.radius + b.radius) / 2),
    density: (a.density + b.density) / 2,
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
    pins: wall.pins.map(seenAs),
    kills: wall.kills.map(seenAs),
    // the last few, because a long session asks for many things and the recent ones are the
    // ones the chosen page actually came out of
    asked: wall.asked.slice(-ASKED).map((a) => ({ said: a.said.slice(0, SAID), chosen: a.chosen })),
    edited: [...new Set(wall.edited)].slice(0, EDITED),
  }
}
