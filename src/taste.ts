/** The taste sheet: the contract every variant is generated against. */

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

const SANS = "'Inter Variable', 'Inter', -apple-system, 'SF Pro Text', sans-serif"
const GROTESK = "'Helvetica Neue', Arial, sans-serif"
const SERIF = "'Charter', 'Iowan Old Style', Georgia, serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

export const PRESETS: Taste[] = [
  {
    name: 'quiet dark',
    bg: '#0c0d10', ink: '#e9ecf1', dim: '#8a93a0', accent: '#6ea8fe', accent2: '#b48cff',
    display: SANS, body: SANS, scale: 1.28, radius: 10, density: 0.55, weight: 600, caps: false, motion: 'soft',
  },
  {
    name: 'paper editorial',
    bg: '#f6f2ea', ink: '#1b1a17', dim: '#6d675d', accent: '#b4472a', accent2: '#2f5d50',
    display: SERIF, body: SERIF, scale: 1.42, radius: 2, density: 0.4, weight: 500, caps: true, motion: 'still',
  },
  {
    name: 'clinical light',
    bg: '#ffffff', ink: '#0b0d12', dim: '#69717d', accent: '#1a54ff', accent2: '#00b389',
    display: GROTESK, body: SANS, scale: 1.33, radius: 6, density: 0.65, weight: 700, caps: false, motion: 'soft',
  },
  {
    name: 'terminal',
    bg: '#07080a', ink: '#d7ffe6', dim: '#5f8a72', accent: '#38e08a', accent2: '#e0c838',
    display: MONO, body: MONO, scale: 1.22, radius: 0, density: 0.75, weight: 500, caps: true, motion: 'lively',
  },
  {
    name: 'warm studio',
    bg: '#191512', ink: '#f2e9dd', dim: '#a2917f', accent: '#e0a441', accent2: '#7fb8a0',
    display: SERIF, body: SANS, scale: 1.36, radius: 14, density: 0.5, weight: 500, caps: false, motion: 'soft',
  },
]

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
    display: SANS,
    body: SANS,
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
