/**
 * The taste sheet a preview is dressed in, and the colour arithmetic that reads it.
 *
 * This was the larger half of a system for remembering which of eight landing pages somebody kept
 * and biasing the next wall towards it. That is gone with the wall. What is left is what a motion
 * preview actually needs: the shape of a look, and enough colour maths to tell whether text on a
 * background can be read.
 *
 * No imports beyond the presets and the faces, on purpose. A page's flags were once read here,
 * which meant this file reached the detector, the page model and the world machinery, and asking
 * for a palette pulled all three.
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



/**
 * Three digit hex is the same colour as six, and this used to read it as NaN.
 *
 * The slices are fixed offsets, so #fff took 'ff' then '' then '', and parseInt('') is NaN. Every
 * comparison against NaN is false, which means a gate handed one silently passed rather than
 * loudly failing: the palette check found this in its own first run, on the #fff the button ink
 * is derived as. Short hex is what somebody writing a palette by hand types, and palettes are
 * becoming data written by hand, so this had to stop being a shape only the machine's own output
 * survived.
 */
const hex2rgb = (h: string): [number, number, number] => {
  const s = h.trim().replace(/^#/, '')
  const full = s.length === 3 || s.length === 4 ? s.slice(0, 3).replace(/./g, (c) => c + c) : s
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}
const rgb2hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

export const luminance = (hex: string) => {
  const [r, g, b] = hex2rgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * How far apart two colours actually are to read, rather than how far apart their numbers are.
 *
 * luminance above is a weighted average of the raw channels, which is the right cheap answer to
 * "is this palette dark", the only question it was written for. It is the wrong answer to "can
 * this be read", because a screen does not emit its channels linearly: the difference between two
 * dark colours is worth far more than the same arithmetic difference between two light ones, and
 * an average taken before undoing the transfer curve does not know that. So this undoes it first
 * and then takes the ratio the accessibility guidelines are stated in, where 1 is the same colour
 * and 21 is black on white.
 *
 * It exists because palettes are about to become data. A direction that carries its own inks is
 * a set of colours somebody wrote by hand into a file, and the one way to write them badly that
 * a reader cannot work around is to make the page unreadable. Everything else in a palette is
 * taste and can be argued about; this cannot, so it is the one part with a gate on it.
 */
export const contrast = (a: string, b: string) => {
  // undo the sRGB transfer curve, or the ratio is taken in the wrong space and flatters dark pairs
  const flat = (hex: string) =>
    hex2rgb(hex)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const rel = (hex: string) => {
    const [r, g, b] = flat(hex)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [rel(a), rel(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
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
