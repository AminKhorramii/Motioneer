/**
 * A direction, said in the token names the rest of the world already uses.
 *
 * Wall has always described a look in its own vocabulary: bg, ink, dim, accent, accent2, surface,
 * line. That is the right vocabulary for a page this app renders and the wrong one for anybody
 * else, because the app somebody is actually building has a --primary and a --muted-foreground and
 * a --ring, and a set of colours that does not name those is a swatch strip rather than a theme.
 * Translating is most of what makes a direction droppable, and it is the difference between
 * handing somebody twenty hex values and handing them a page that changed.
 *
 * Two things here are not translation and are the reason this file exists.
 *
 * The foregrounds are chosen by measuring rather than by being written down. Every pair below is
 * some text on some ground, and the pair that renders is the one that has to be readable: the
 * repository already learned this the expensive way, when the button ink was picked by a luminance
 * threshold and two of eight shipped looks put white on a saturated pink at 3.14 to 1. There are
 * only ever a few candidates, so each foreground is the candidate that measures best against the
 * exact ground it lands on.
 *
 * And the other mode is derived rather than invented. A theme that ships one mode is half a theme,
 * and a dark counterpart guessed by hand is where unreadable pairs come from. The derivation keeps
 * the palette's temperature by building the dark ground out of the light one's ink, then moves each
 * ink along its own lightness until it clears the floor against the ground it now sits on. Nothing
 * is nudged by eye and nothing ships that cannot be read.
 */

import { alpha, contrast, luminance, mix, shift, type Taste } from '@/taste'

/** the names a shadcn-shaped app is already written against */
export interface Tokens {
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  border: string
  input: string
  ring: string
  chart: [string, string, string, string, string]
}

export interface Theme {
  light: Tokens
  dark: Tokens
  radius: number
}

/**
 * The floors, against the pair each one actually renders as.
 *
 * Body text is held to the figure for text at a normal size. The foregrounds that only ever sit on
 * a fill, inside a button or a badge, are held to the same figure, because a label on a fill is
 * still text somebody has to read. Borders are not text and are held only to being visible, since
 * a hairline at reading contrast is a rule, and a page of rules is a table.
 */
export const PAIRS: { name: string; on: keyof Tokens; ink: keyof Tokens; floor: number }[] = [
  { name: 'body text', on: 'background', ink: 'foreground', floor: 4.5 },
  { name: 'text on a card', on: 'card', ink: 'cardForeground', floor: 4.5 },
  { name: 'text in a popover', on: 'popover', ink: 'popoverForeground', floor: 4.5 },
  { name: 'the primary button label', on: 'primary', ink: 'primaryForeground', floor: 4.5 },
  { name: 'the secondary button label', on: 'secondary', ink: 'secondaryForeground', floor: 4.5 },
  { name: 'secondary text', on: 'muted', ink: 'mutedForeground', floor: 4.5 },
  { name: 'text on the accent', on: 'accent', ink: 'accentForeground', floor: 4.5 },
  { name: 'the destructive label', on: 'destructive', ink: 'destructiveForeground', floor: 4.5 },
  { name: 'a border', on: 'background', ink: 'border', floor: 1.25 },
]

/** black or white, whichever can actually be read on this. Two candidates, so ask rather than guess */
const readableOn = (ground: string) =>
  contrast('#0a0a0b', ground) >= contrast('#ffffff', ground) ? '#0a0a0b' : '#ffffff'

/**
 * Move an ink along its own lightness until it clears a floor against the ground it sits on.
 *
 * Toward white on a dark ground and toward black on a light one, in small steps, keeping the hue
 * rather than desaturating toward grey: a palette that clears its floors by draining its colour has
 * satisfied the gate and lost the thing it was for. Gives up rather than looping, and the gate in
 * the suite is what catches the case where it could not get there.
 */
const lift = (ink: string, ground: string, floor: number) => {
  const toward = luminance(ground) < 0.5 ? '#ffffff' : '#000000'
  let out = ink
  for (let i = 0; i < 24 && contrast(out, ground) < floor; i++) out = mix(out, toward, 0.06)
  return out
}

/** the five series a chart uses, walked around the wheel from the two inks the direction owns */
const charts = (a: string, b: string, ground: string): [string, string, string, string, string] => {
  const mid = mix(a, b, 0.5)
  return [a, b, mix(a, mid, 0.5), mix(b, mid, 0.5), mix(mid, ground, 0.35)]
    .map((c) => lift(c, ground, 1.9)) as [string, string, string, string, string]
}

/** one mode, built from a ground and the two inks that belong to it */
function modeOf(bg: string, ink: string, dim: string, accent: string, accent2: string): Tokens {
  const dark = luminance(bg) < 0.5
  // a card is the ground moved a step, in the direction that reads as raised on this mode
  const surface = dark ? shift(bg, 12) : shift(bg, -8)
  const quiet = dark ? shift(bg, 18) : shift(bg, -12)
  const line = dark ? shift(bg, 34) : shift(bg, -30)
  /**
   * Destructive is derived rather than dealt, and it stays red.
   *
   * A palette's own inks cannot supply it: the thing this colour has to say is that an action does
   * not come back, and a direction whose accent happens to be red would otherwise say that about
   * everything. So it is a red carried a little way toward the palette so it belongs, and no
   * further, because the whole job of the colour is to not belong.
   */
  const destructive = lift(mix('#c0392b', accent, 0.16), bg, 3)
  return {
    background: bg,
    foreground: lift(ink, bg, 4.5),
    card: surface,
    cardForeground: lift(ink, surface, 4.5),
    popover: surface,
    popoverForeground: lift(ink, surface, 4.5),
    primary: accent,
    primaryForeground: lift(readableOn(accent), accent, 4.5),
    secondary: quiet,
    secondaryForeground: lift(ink, quiet, 4.5),
    muted: quiet,
    mutedForeground: lift(dim, quiet, 4.5),
    accent: accent2,
    accentForeground: lift(readableOn(accent2), accent2, 4.5),
    destructive,
    destructiveForeground: lift(readableOn(destructive), destructive, 4.5),
    border: lift(line, bg, 1.25),
    input: lift(line, bg, 1.25),
    ring: accent,
    chart: charts(accent, accent2, bg),
  }
}

/**
 * Both modes of a direction, from the one it was drawn in.
 *
 * The mode it already has is used as it stands and the other is built from it, so the side somebody
 * chose by hand is the side that survives. The counterpart keeps the palette's temperature by being
 * made out of the original's own ink and ground rather than out of neutral grey, which is what makes
 * a warm theme stay warm in the dark instead of turning into everybody else's charcoal.
 */
/**
 * How much colour a colour has, and where to find some when it has none.
 *
 * Blueprint is white lines bitten out of prussian blue, so its accent is #ffffff. Deriving the
 * light counterpart lifted that toward black until it cleared contrast and handed back #929292:
 * readable, and grey, and nothing to do with a cyanotype. Pure white and pure black carry no hue,
 * so there is nothing for a lift to preserve, and the direction loses the thing it was.
 *
 * The second ink is where the hue comes from, because a direction that spends one of its two on an
 * achromatic has put all of its colour in the other. Falling back to the ground rather than to a
 * default keeps a monochrome direction monochrome, which is right: a till roll has no hue anywhere
 * and inventing one for it would be worse than grey.
 */
const chroma = (hex: string) => {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16))
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}
const hued = (ink: string, second: string, ground: string) =>
  chroma(ink) > 0.06 ? ink : mix(ink, chroma(second) > 0.06 ? second : ground, 0.55)

export function themeOf(taste: Taste): Theme {
  const wasDark = luminance(taste.bg) < 0.5
  const here = modeOf(taste.bg, taste.ink, taste.dim, taste.accent, taste.accent2)
  // the far ground, made from this one's own colours so the temperature travels
  const farBg = wasDark ? mix(taste.ink, '#ffffff', 0.72) : mix(taste.ink, '#000000', 0.86)
  const farInk = wasDark ? mix(taste.bg, '#000000', 0.78) : mix(taste.bg, '#ffffff', 0.12)
  const farDim = mix(farInk, farBg, 0.42)
  const there = modeOf(
    farBg, farInk, farDim,
    lift(hued(taste.accent, taste.accent2, taste.bg), farBg, 3),
    lift(hued(taste.accent2, taste.accent, taste.bg), farBg, 3),
  )
  return wasDark
    ? { light: there, dark: here, radius: taste.radius }
    : { light: here, dark: there, radius: taste.radius }
}

const NAMES: [keyof Tokens, string][] = [
  ['background', 'background'], ['foreground', 'foreground'],
  ['card', 'card'], ['cardForeground', 'card-foreground'],
  ['popover', 'popover'], ['popoverForeground', 'popover-foreground'],
  ['primary', 'primary'], ['primaryForeground', 'primary-foreground'],
  ['secondary', 'secondary'], ['secondaryForeground', 'secondary-foreground'],
  ['muted', 'muted'], ['mutedForeground', 'muted-foreground'],
  ['accent', 'accent'], ['accentForeground', 'accent-foreground'],
  ['destructive', 'destructive'], ['destructiveForeground', 'destructive-foreground'],
  ['border', 'border'], ['input', 'input'], ['ring', 'ring'],
]

const block = (t: Tokens, radius: number, withRadius: boolean) =>
  NAMES.map(([k, name]) => `  --${name}: ${t[k] as string};`).join('\n') +
  '\n' + t.chart.map((c, i) => `  --chart-${i + 1}: ${c};`).join('\n') +
  (withRadius ? `\n  --radius: ${(radius / 16).toFixed(3).replace(/0+$/, '')}rem;` : '')

/** the paste-able thing, in the shape a globals.css already has */
export const themeCss = (theme: Theme) =>
  `:root {\n${block(theme.light, theme.radius, true)}\n}\n\n.dark {\n${block(theme.dark, theme.radius, false)}\n}\n`

/** every pair that renders, measured, in both modes. Empty means the direction can be read */
export function unreadable(theme: Theme): string[] {
  const out: string[] = []
  for (const [mode, tokens] of [['light', theme.light], ['dark', theme.dark]] as const) {
    for (const pair of PAIRS) {
      const r = contrast(tokens[pair.ink] as string, tokens[pair.on] as string)
      if (r < pair.floor) out.push(`${mode}: ${pair.name} is ${r.toFixed(2)} to 1, under ${pair.floor}`)
    }
  }
  return out
}

/** the tokens as a Tailwind theme fragment, for a project that keeps its colours there */
export const themeTailwind = (theme: Theme) =>
  `@theme {\n${NAMES.map(([k, name]) => `  --color-${name}: ${theme.light[k] as string};`).join('\n')}\n}\n`

export const swatches = (t: Tokens) =>
  [t.background, t.foreground, t.primary, t.accent, t.muted, t.mutedForeground, t.destructive, t.border]

export { alpha }
