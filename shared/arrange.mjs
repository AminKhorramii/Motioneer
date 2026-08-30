/**
 * An arrangement, and the arithmetic that decides when its cars start.
 *
 * The rail was a global array mutated in place by five handlers, which made fork, compare, undo and
 * export special cases written against a variable rather than operations on a value. This is the
 * value, and every edit to it returns a new one.
 *
 * It lives here rather than in `shared/page.mjs` for the reason that file's header gives: the page is
 * one template literal, so a regex written inside it loses its escapes before a browser sees it, and
 * a second copy of a measurement is how `3.2s` came to be read as `2s`. It is served to the page the
 * same way `raster.mjs` and `mp4.mjs` already are, so there is one definition and node can import it
 * directly to check it.
 *
 * Nothing here touches the dom, does i/o, or imports a node builtin, which is the rule for this
 * folder. Everything is a function of its arguments.
 */

/* how far apart two cars start when nothing has said otherwise, which is what the rail did by an
   invisible constant before any of this was drawn */
export const BEAT = 420
/* the shortest ruler worth drawing: a rail of one 200ms motion on a 200ms ruler is a full bar and
   tells you nothing about where it sits */
export const FLOOR = 1200
const MS = 600   // what a car runs for when its motion never reported a span

const num = (v, or = 0) => (Number.isFinite(Number(v)) ? Number(v) : or)
const runs = (car) => Math.max(0, num(car && car.motion && car.motion.ms, MS))

/**
 * The rail's answer, turned into an arrangement.
 *
 * `railOf` hands back one entry per pick, carrying a motion when one survived the gates and a reason
 * when none did. Both become cars: a car that did not move still holds a place in the composition and
 * still has a row, because a row that is missing cannot be told why it is missing.
 *
 * The motion records are frozen. They are shared by every history step rather than copied into each
 * one, which is what makes undo cheap, and that sharing is only safe while nothing writes through
 * them. Freezing turns an agreement between call sites into a throw at the moment one breaks it.
 */
export function fromRail(got, picks = [], id = 'a1') {
  const cars = (got || []).map((c, i) => {
    /* what the element looked like when it was picked, carried so a row can show it rather than
       describe it. Shared by reference across history steps like the motions are, never written to */
    const from = (picks || [])[i] || {}
    const alternatives = (c.alts || (c.id ? [c] : [])).map(motionOf).filter(Boolean)
    const motion = c.id ? (alternatives.find((m) => m.id === c.id) || motionOf(c)) : null
    return {
      /**
       * A car's own name, which is not its motion's.
       *
       * Links used to be keyed by motion id, and a car's motion is the one thing about it that
       * changes: cycling onto an alternative renamed it, so every car following it silently came
       * loose and fell back to the absolute offset it had been ignoring. The rail still played, at
       * the wrong times, having thrown away a decision without saying so.
       */
      key: `c${i + 1}`,
      pick: Object.freeze({
        label: String(c.label ?? 'element'),
        w: num(from.w, num(c.w)),
        h: num(from.h, num(c.h)),
        // what it looked like when it was picked, so a row can show it rather than describe it
        html: String(from.html ?? ''),
        css: String(from.css ?? ''),
        shot: String(from.shot ?? ''),
      }),
      motion,
      alternatives: Object.freeze(alternatives),
      at: i * BEAT,
      after: null,
      shot: '',
      tune: null,
      /**
       * Where this component sits on the stage, rather than only when it moves.
       *
       * A rail was a stack of equal boxes in the order the picks happened, which is not what any of
       * these compositions actually look like: a header sits above a row of cards, and a chart sits
       * beside them. Null means the stack, which is the sensible thing to open on; a place is what a
       * hand puts there. Measured in per cent of the stage so it survives the frame being resized,
       * and so a film at 1080 square shows the arrangement you made at whatever your window was.
       */
      place: null,
      why: c.id ? '' : String(c.why ?? 'nothing came back'),
    }
  })
  return { id, cars, camera: '', markers: [] }
}

/** a car put somewhere on the stage, or handed back to the stack when given nothing */
export function placed(arr, i, at) {
  if (!arr.cars[i]) return arr
  if (!at) return patch(arr, i, { place: null })
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)))
  return patch(arr, i, {
    place: {
      x: clamp(at.x, 0, 100),
      y: clamp(at.y, 0, 100),
      w: clamp(at.w === undefined ? (arr.cars[i].place ? arr.cars[i].place.w : 40) : at.w, 4, 100),
    },
  })
}

/** whether anybody has been moved, which is what tells a stage from a stack */
export const staged = (arr) => live(arr).some((x) => !!x.car.place)

/** a name no car in this arrangement is using, for a copy that must not answer to the original's */
export function freshKey(arr) {
  let n = 0
  for (const c of (arr && arr.cars) || []) {
    const m = /^c(\d+)$/.exec(String(c.key || ''))
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `c${n + 1}`
}

const motionOf = (o) => (o && o.id
  ? Object.freeze({
    id: String(o.id),
    note: String(o.note ?? ''),
    verb: String(o.verb ?? ''),
    scope: String(o.scope ?? ''),
    ms: Math.max(1, num(o.ms, num(o.tempo && o.tempo.span, MS)) || MS),
    tempo: o.tempo ?? null,
    seen: o.seen ?? null,
  })
  : null)

/** the cars that carry a motion, with the index they sit at, since a dead car still owns a row */
export const live = (arr) => (arr && arr.cars ? arr.cars : [])
  .map((car, i) => ({ car, i }))
  .filter((x) => x.car.motion)

/**
 * When each car actually starts.
 *
 * A car may be pinned to another one rather than to the clock: `after` starts it when that car
 * finishes, `with` starts it when that car starts, each with a gap that may be negative. That is a
 * graph, so this is a topological walk over it, and the only interesting question is what a cycle
 * does. It must not be a hang: a page that stops answering has no message and no stack, and the
 * person reading it sees a dead timeline rather than a bad link.
 *
 * So cars the walk cannot reach fall back to the absolute `at` they still carry, and their ids come
 * back in `cyclic` so a row can say why it did not move where it was told to. `at` is kept on every
 * car, linked or not, precisely so there is something to fall back to.
 */
export function resolve(arr) {
  const cars = (arr && arr.cars) ? arr.cars : []
  const at = cars.map((c) => Math.max(0, num(c.at)))
  const byKey = new Map()
  cars.forEach((c, i) => { if (c.key) byKey.set(String(c.key), i) })

  // a link to a car that is not here, or to itself, is not a link
  const link = cars.map((c, i) => {
    const l = c.after
    if (!l || !l.key) return null
    const to = byKey.get(String(l.key))
    if (to === undefined || to === i) return null
    return { to, gap: num(l.gap), mode: l.mode === 'with' ? 'with' : 'after' }
  })

  const waiting = cars.map((_, i) => (link[i] ? 1 : 0))
  const feeds = cars.map(() => [])
  link.forEach((l, i) => { if (l) feeds[l.to].push(i) })

  const queue = []
  waiting.forEach((n, i) => { if (!n) queue.push(i) })
  const settled = new Array(cars.length).fill(false)
  for (const i of queue) settled[i] = true

  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head]
    for (const next of feeds[i]) {
      const l = link[next]
      at[next] = Math.max(0, at[i] + (l.mode === 'after' ? runs(cars[i]) : 0) + l.gap)
      if (!settled[next]) { settled[next] = true; queue.push(next) }
    }
  }

  /* every node the walk never drained is in a cycle or hangs off one. Each keeps the absolute offset
     it already had, which is why that field is never derived away */
  const cyclic = []
  cars.forEach((c, i) => { if (!settled[i]) cyclic.push(String(c.key)) })
  return { at, cyclic }
}

/** how long the composition runs, which is not the same number as how long the ruler is drawn */
export function spanOf(arr) {
  const { at } = resolve(arr)
  const ends = live(arr).map((x) => at[x.i] + runs(x.car))
  return Math.max(FLOOR, ...ends, 0)
}

/**
 * The drawn ruler, which only ever grows while a session lasts.
 *
 * Sizing the strip to the content means swapping one car for a longer alternative rescales every
 * other bar: nothing moved in time, but everything slid, and the composition looks like it changed
 * when it did not. So the drawn span is sticky, and `fit` is how you ask for it back.
 */
export function viewSpan(arr, sticky = 0) {
  return Math.max(spanOf(arr) * 1.04, num(sticky))
}

/**
 * The coarse grid, chosen so its lines are far enough apart to aim between.
 *
 * Returned in ms for a given ruler and track width, so the same step draws the ticks and catches the
 * drag. Two numbers for one decision is how a ruler comes to disagree with what it snaps to.
 */
export function gridStep(total, px, least = 44) {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
  const wide = Math.max(1, num(px, 700))
  for (const s of steps) if ((s / Math.max(1, num(total, FLOOR))) * wide >= least) return s
  return steps[steps.length - 1]
}

/** every instant worth landing on: zero, the playhead, and the edges of the bars not being dragged */
export function edges(arr, skip = [], playhead = null) {
  const hide = new Set(skip)
  const { at } = resolve(arr)
  const out = [{ at: 0, what: 'the start' }]
  if (playhead !== null && Number.isFinite(Number(playhead))) {
    out.push({ at: num(playhead), what: 'the playhead' })
  }
  for (const m of (arr && arr.markers) || []) out.push({ at: num(m), what: 'a marker' })
  for (const x of live(arr)) {
    if (hide.has(x.i)) continue
    const name = x.car.motion.note || x.car.pick.label
    out.push({ at: at[x.i], what: `${name} starting` })
    out.push({ at: at[x.i] + runs(x.car), what: `${name} ending` })
  }
  return out
}

/**
 * The nearest thing worth landing on, or nothing.
 *
 * The tolerance arrives in ms already converted from pixels by the caller, because the track is
 * flexible and the ruler runs from about a second to twenty: a fixed ms threshold is twenty two
 * pixels of magnet at the short end, where nothing can be placed off a target at all, and under two
 * at the long end, where it may as well be absent.
 *
 * A named edge beats the grid even when the grid line is nearer, which is the whole priority rule and
 * needs no list: the grid is offered a narrower tolerance and simply misses more often.
 */
export function snapTo(ms, targets, tol, grid = 0, gridTol = 0) {
  const want = num(ms)
  let best = null
  for (const t of targets || []) {
    const d = Math.abs(t.at - want)
    if (d <= tol && (!best || d < best.d)) best = { d, at: t.at, what: t.what }
  }
  if (best) return { at: best.at, hit: best.what }
  if (grid > 0) {
    const on = Math.round(want / grid) * grid
    if (Math.abs(on - want) <= gridTol) return { at: on, hit: `${grid}ms` }
  }
  return { at: want, hit: null }
}

/**
 * How far a set of cars may actually move, given none of them may start before zero.
 *
 * The delta is clamped once for the whole set rather than each car being clamped at zero on its own.
 * Clamping individually looks identical until the group reaches the start, at which point the cars
 * pile up on zero and their spacing is gone: dragging back to the right does not restore it, because
 * the information was destroyed on the way in. Clamping the delta makes the group meet a wall with
 * its shape intact, which is what a person dragging three bars expects and cannot check.
 */
export function clampDelta(delta, wases) {
  const floor = Math.min(...(wases.length ? wases : [0]))
  return Math.max(num(delta), -floor)
}

/* ── the operations, each returning a new arrangement ─────────────────────────────────────────── */

const withCars = (arr, cars) => ({ ...arr, cars })
const patch = (arr, i, fields) => withCars(arr, arr.cars.map((c, k) => (k === i ? { ...c, ...fields } : c)))

/**
 * One car moved to an instant, whichever field actually decides where it sits.
 *
 * A linked car's absolute `at` is not what puts it anywhere: resolve overwrites it from whatever it
 * follows. Writing there would leave the bar exactly where it was and the arrangement quietly
 * changed, which is a drag that appears to do nothing. So a link is retimed by its gap, and the
 * gesture stays the same one.
 */
export function moved(arr, i, at) {
  const car = arr.cars[i]
  if (!car) return arr
  /* whole milliseconds. A pointer lands on a fraction of one and nothing downstream wants it: the
     bar reads two decimal places of seconds, railview rounds, and an export carrying 46.228ms of gap
     is a number no one chose and no one can type back */
  const want = Math.max(0, Math.round(num(at)))
  if (!car.after || !car.after.key) return patch(arr, i, { at: want })
  const { at: when } = resolve(arr)
  const to = arr.cars.findIndex((c) => String(c.key) === String(car.after.key))
  if (to < 0) return patch(arr, i, { at: want })
  const base = when[to] + (car.after.mode === 'with' ? 0 : runs(arr.cars[to]))
  return patch(arr, i, { at: want, after: { ...car.after, gap: Math.round(want - base) } })
}

/**
 * A set of cars moved together, keeping every offset between them.
 *
 * The clamp is over where the cars actually are, so a linked car counts at its resolved instant
 * rather than at the absolute offset it is not using.
 */
export function shifted(arr, ids, delta) {
  const want = new Set(ids)
  const { at } = resolve(arr)
  const step = clampDelta(delta, arr.cars.map((c, i) => (want.has(i) ? at[i] : null))
    .filter((v) => v !== null))
  let out = arr
  for (const i of want) out = moved(out, i, at[i] + step)
  return out
}

/** a row moved to a different place in the film, which is not a change to when it starts */
export function reordered(arr, from, to) {
  const cars = arr.cars.slice()
  const [car] = cars.splice(from, 1)
  if (!car) return arr
  cars.splice(Math.max(0, Math.min(cars.length, to)), 0, car)
  return withCars(arr, cars)
}

/** a car given a different camera, a tune, or a link */
export const retimed = (arr, i, fields) => patch(arr, i, fields)

/** a car swapped onto one of the motions already generated for it */
export function swapped(arr, i, k) {
  const car = arr.cars[i]
  if (!car || !car.alternatives.length) return arr
  const n = ((k % car.alternatives.length) + car.alternatives.length) % car.alternatives.length
  return patch(arr, i, { motion: car.alternatives[n] })
}

/** which alternative a car is currently showing, derived rather than stored so the two cannot part */
export const chosenAlt = (car) => (car && car.motion
  ? car.alternatives.findIndex((m) => m.id === car.motion.id) : -1)

/** more motions for one car, appended rather than pushed, because history steps share this array */
export function offered(arr, i, more) {
  const car = arr.cars[i]
  if (!car) return arr
  const add = (more || []).map(motionOf).filter(Boolean)
    .filter((m) => !car.alternatives.some((a) => a.id === m.id))
  if (!add.length) return arr
  return patch(arr, i, { alternatives: Object.freeze(car.alternatives.concat(add)) })
}

/** a copy of the composition, so one of them can be changed and both watched at the same instant */
export const forked = (arr, id) => ({ ...arr, id, cars: arr.cars.map((c) => ({ ...c })) })

/** what railview is asked for: ids, resolved offsets and cameras, in the order the rows sit in */
export function urlOf(arr, palette) {
  const { at } = resolve(arr)
  const on = live(arr)
  if (!on.length) return null
  const q = (k, v) => `${k}=${encodeURIComponent(v)}`
  return `/__wall/railview?${[
    q('ids', on.map((x) => x.car.motion.id).join(',')),
    q('at', on.map((x) => Math.round(at[x.i])).join(',')),
    q('shots', on.map((x) => x.car.shot || '').join(',')),
    /* one entry per car, empty where it has never been moved, so the frame can lay the untouched
       ones out as a stack and put the rest where they were put */
    q('place', on.map((x) => (x.car.place
      ? `${Math.round(x.car.place.x)}_${Math.round(x.car.place.y)}_${Math.round(x.car.place.w)}`
      : '')).join(',')),
    q('palette', palette ?? ''),
  ].join('&')}`
}

/**
 * What the composition does with its time, said out loud.
 *
 * This reports and does not judge. Everything landing in the first fifth of the rail is a real
 * criticism and so is a two second hole in the middle, but which of those is a fault depends on what
 * the thing is for, and a gate tuned by taste is how a field guide gets rejected for its italics.
 */
export function density(arr) {
  const { at } = resolve(arr)
  const on = live(arr)
  if (!on.length) return null
  const starts = on.map((x) => at[x.i]).sort((a, b) => a - b)
  const total = spanOf(arr)
  const last = starts[starts.length - 1] + runs(on[on.length - 1].car)
  let hole = 0, holeAt = 0
  for (let i = 1; i < starts.length; i += 1) {
    const gap = starts[i] - (starts[i - 1] + runs(on[i - 1].car))
    if (gap > hole) { hole = gap; holeAt = starts[i - 1] + runs(on[i - 1].car) }
  }
  return {
    cars: on.length,
    span: total,
    busiest: starts.length ? Math.round(starts[Math.floor(starts.length / 2)]) : 0,
    settledBy: Math.round(last),
    hole: Math.round(Math.max(0, hole)),
    holeAt: Math.round(holeAt),
  }
}
