/**
 * The motion a product already has, read off its live page, and the motion system it should have.
 *
 * A film borrows the product's DOM; this borrows its motion. Every transition and animation the
 * page's own stylesheets declare is read through the studio's proxy, so a person's real timings
 * and easings are what the tokens start from, not a default. The tokens land inside the house
 * style's bands, and the audit names what the page does today that reflows, ignores stillness or
 * wears the curves every generated interface already wears. The `motion` tool then writes a
 * component's motion with these tokens, so new motion matches the product it goes into.
 */
import { ASSEMBLED } from '../../dist-core/core.js'

const LAYOUT = /^(width|height|top|left|right|bottom|margin|padding|inset|max-height|max-width|min-height|min-width|font-size|line-height|grid-template)/
const ms = (raw) => { const n = parseFloat(raw); return !Number.isFinite(n) ? null : /ms\s*$/i.test(raw) ? n : n * 1000 }

/** Every motion declaration the page's own stylesheets make, read inside the proxied page. */
export async function readMotion(frame) {
  // the survey hands over the source frame as a locator, a test may hand over a frame itself
  const run = (fn) => typeof frame.evaluate === 'function' ? frame.evaluate(fn) : frame.locator('body').evaluate(fn)
  return run(() => {
    const found = [], keyframes = new Set(), guards = { reduce: 0, noPreference: 0 }
    const walk = (rules, media) => {
      for (const r of rules) {
        try {
          if (r.constructor.name === 'CSSMediaRule') {
            const m = r.conditionText || r.media.mediaText
            if (/prefers-reduced-motion/.test(m)) { if (/reduce/.test(m)) guards.reduce++; else guards.noPreference++ }
            walk(r.cssRules, m); continue
          }
          if (r.constructor.name === 'CSSKeyframesRule') { keyframes.add(r.name); continue }
          if (r.cssRules && !r.style) { walk(r.cssRules, media); continue }
          const s = r.style
          if (!s) continue
          const transition = s.transitionDuration && s.transitionDuration !== '0s', animation = s.animationName && s.animationName !== 'none'
          if (!transition && !animation) continue
          found.push({ selector: String(r.selectorText || '').slice(0, 120), media: media || '', transition: transition ? { duration: s.transitionDuration, easing: s.transitionTimingFunction, property: s.transitionProperty, delay: s.transitionDelay } : null, animation: animation ? { name: s.animationName, duration: s.animationDuration, easing: s.animationTimingFunction, delay: s.animationDelay, iterations: s.animationIterationCount } : null })
        } catch { /* a rule this browser cannot read */ }
      }
    }
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, '') } catch { /* a stylesheet from another origin */ } }
    return { found: found.slice(0, 1500), keyframes: [...keyframes].slice(0, 300), guards }
  })
}

const quantile = (list, q) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) }
const split = (value) => String(value || '').split(/,(?![^(]*\))/).map((v) => v.trim()).filter(Boolean)
/** A decelerating cubic-bezier: it arrives fast and settles, the shape an arrival should have. */
const decelerates = (curve) => { const m = /cubic-bezier\(([^)]*)\)/.exec(curve); if (!m) return false; const [x1, y1, x2, y2] = m[1].split(',').map(Number); return y1 > x1 && y2 >= x2 }
const overshoots = (curve) => { const m = /cubic-bezier\(([^)]*)\)/.exec(curve); return !!m && m[1].split(',').map(Number).some((v, i) => i % 2 === 1 && v > 1) }

/**
 * What the page's motion is, what its tokens should be, and what is wrong with it today.
 *
 * @param read  what readMotion found
 * @returns { fingerprint, tokens, verbs, css, tailwind, audit }
 */
export function motionSystem(read) {
  const durations = [], easings = new Map(), properties = new Map()
  for (const d of read.found) {
    for (const part of [d.transition, d.animation].filter(Boolean)) {
      // an endless loop is decoration, not a wait, so its length says nothing about the product's tempo
      if (!/infinite/.test(part.iterations || '')) for (const v of split(part.duration)) { const n = ms(v); if (n && n > 0) durations.push(n) }
      for (const e of split(part.easing)) easings.set(e, (easings.get(e) || 0) + 1)
    }
    for (const p of split(d.transition?.property)) properties.set(p, (properties.get(p) || 0) + 1)
  }
  const curves = [...easings].sort((a, b) => b[1] - a[1])
  const guarded = read.guards.reduce + read.guards.noPreference > 0
  const fingerprint = {
    rules: read.found.length, keyframes: read.keyframes.length,
    durations: { p25: quantile(durations, 0.25), median: quantile(durations, 0.5), p75: quantile(durations, 0.75) },
    easings: curves.slice(0, 6).map(([curve, uses]) => ({ curve, uses })),
    properties: [...properties].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([property, uses]) => ({ property, uses })),
    reducedMotion: guarded,
    // the product's own arrival curve when it has one, which the tokens keep rather than the house's
    arrival: curves.find(([c]) => decelerates(c))?.[0] || null,
  }
  const own = fingerprint.arrival
  const median = fingerprint.durations.median
  const tokens = {
    part: Math.round(Math.max(ASSEMBLED.partMs[0], Math.min(ASSEMBLED.partMs[1], median ?? 320))),
    gap: 60,
    component: ASSEMBLED.componentMs,
    arrive: own || ASSEMBLED.easing.arrive,
    leave: ASSEMBLED.easing.leave,
    mechanical: 'steps(6, end)',
  }
  // verbs that fit how the product already moves: stepped, springy, or smooth and drawn
  // the verbs follow what the product mostly does: a tenth of its curves stepped or springy decides it.
  // steps(1) is an on and off switch rather than a mechanism, so only real steps count as stepped
  const total = curves.reduce((n, [, uses]) => n + uses, 0) || 1, share = (test) => curves.filter(([c]) => test(c)).reduce((n, [, uses]) => n + uses, 0) / total
  const verbs = share((c) => Number(/steps\((\d+)/.exec(c)?.[1]) >= 2) >= 0.1 ? ['print', 'type', 'stamp'] : share(overshoots) >= 0.1 ? ['flap', 'wind', 'register'] : ['draw', 'scan', 'register']
  const audit = []
  const layout = [...properties].filter(([p]) => LAYOUT.test(p)).map(([p]) => p)
  if (layout.length) audit.push(`transitions animate ${layout.slice(0, 4).join(', ')}, which lays the page out again every frame; the same effect has a transform spelling`)
  if (properties.has('all')) audit.push(`${properties.get('all')} transitions animate every property at once ("all"), which catches layout changes too`)
  if (read.found.length && !guarded) audit.push('nothing on the page answers prefers-reduced-motion, so it moves for people who asked their machine not to')
  const defaults = curves.filter(([c]) => ASSEMBLED.never.includes(c)).reduce((n, [, uses]) => n + uses, 0)
  if (defaults) audit.push(`${defaults} motions use ease, ease-in-out or linear, the curves every generated interface already wears`)
  const quick = durations.filter((d) => d < 150).length, slow = durations.filter((d) => d > 700).length
  if (quick) audit.push(`${quick} motions finish in under 150ms, which reads as a glitch rather than as movement`)
  if (slow) audit.push(`${slow} motions take longer than 700ms, which reads as waiting`)
  const css = `/* Motion tokens for this product, in Motioneer's Assembled house style */\n:root {\n  --motion-part: ${tokens.part}ms;\n  --motion-gap: ${tokens.gap}ms;\n  --motion-component: ${tokens.component}ms;\n  --motion-ease-arrive: ${tokens.arrive};\n  --motion-ease-leave: ${tokens.leave};\n  --motion-ease-mechanical: ${tokens.mechanical};\n}\n`
  const tailwind = `// tailwind.config: theme.extend\n{\n  transitionDuration: { part: '${tokens.part}ms', component: '${tokens.component}ms' },\n  transitionTimingFunction: { arrive: '${tokens.arrive}', leave: '${tokens.leave}' },\n  transitionDelay: { gap: '${tokens.gap}ms' },\n}\n`
  return { fingerprint, tokens, verbs, css, tailwind, audit }
}

