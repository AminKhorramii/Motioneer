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
      /**
       * When this component is on the stage at all, which is not the same as when it moves.
       *
       * A car was in the document from the first frame and stayed there for good, so a rail of three
       * opened as three boxes and only their contents arrived in order. In a demo an element has a
       * life: it comes on, does things, and leaves. Null means the sensible default rather than a
       * number nobody chose, so `from` is when its first motion starts and `until` is never.
       */
      from: null,
      until: null,
      /**
       * What this component is shown against.
       *
       * A component arrives wearing whatever its page had, which is honest and is often a white box
       * on a dark stage. That is right until it is not: the same element in a demo may want the
       * stage showing through it, or the opposite of what it was picked off. Empty means as picked,
       * which is what it opens on, because guessing is worse than the page's own answer.
       */
      paper: '',
      /**
       * Where this component goes, and when, after it has arrived.
       *
       * A motion is what the model wrote and it happens once, at the start. A move is authored: this
       * thing travels from where it is to there, over that long, because you dragged it while the
       * clock was somewhere. That is the whole of a product demo and none of it needs a model.
       *
       * Ordered by when they start, kept as offsets from where the car sits rather than as absolute
       * places, so moving the component moves its whole journey with it.
       */
      moves: [],
      why: c.id ? '' : String(c.why ?? 'nothing came back'),
    }
  })
  /* the camera is the stage's own journey. A camera move and a component move turned out to be the
     same shape, so this is that shape applied to everything at once rather than to one thing */
  return { id, cars, camera: [], markers: [] }
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

/**
 * A journey for one component, kept in the order it happens.
 *
 * A move landing where one already ends replaces it rather than stacking on top, because dragging
 * the same thing to the same instant twice is one decision made twice, not two decisions.
 */
export function routed(arr, i, moves) {
  if (!arr.cars[i]) return arr
  const clean = (moves || []).map((m) => ({
    at: Math.max(0, Math.round(num(m.at))),
    ms: Math.max(60, Math.round(num(m.ms, 400))),
    x: num(m.x), y: num(m.y),
    scale: Math.max(0.05, num(m.scale, 1)),
    ease: String(m.ease || 'ease'),
  })).sort((a, b) => a.at - b.at)
  return patch(arr, i, { moves: Object.freeze(clean) })
}

/**
 * The camera's journey, which is a component's journey applied to the stage.
 *
 * A camera was four presets and a rig per car, and a rig per car is what lets one component sit
 * still while the one below it pushes in. That is a different thing from a camera over the whole
 * composition, which is where the whole picture goes, and once a component could be sent somewhere
 * the camera was the same operation one level up.
 */
export function framed(arr, moves) {
  const clean = (moves || []).map((m) => ({
    at: Math.max(0, Math.round(num(m.at))),
    ms: Math.max(60, Math.round(num(m.ms, 600))),
    x: num(m.x), y: num(m.y),
    scale: Math.max(0.2, num(m.scale, 1)),
    ease: String(m.ease || 'ease'),
  })).sort((a, b) => a.at - b.at)
  return { ...arr, camera: Object.freeze(clean) }
}

/** one more move of the camera, replacing whichever already ended at that instant */
export function filmed(arr, move) {
  const ends = Math.round(num(move.at) + num(move.ms, 600))
  const rest = (arr.camera || []).filter((m) => Math.abs(m.at + m.ms - ends) > 1)
  return framed(arr, rest.concat([move]))
}

/** one more leg of the journey, replacing whichever already ended at that instant */
export function travels(arr, i, move) {
  const car = arr.cars[i]
  if (!car) return arr
  const ends = Math.round(num(move.at) + num(move.ms, 400))
  const rest = (car.moves || []).filter((m) => Math.abs(m.at + m.ms - ends) > 1)
  return routed(arr, i, rest.concat([move]))
}

/** where a component has got to by an instant, as an offset from where it sits */
export function wandered(car, t) {
  let x = 0, y = 0, scale = 1
  for (const m of (car && car.moves) || []) {
    if (t <= m.at) break
    // a move still running counts as arrived, since this is for the strip rather than the picture
    x = m.x; y = m.y; scale = m.scale
  }
  return { x, y, scale }
}

/** what a component is shown against: as it was picked, or something chosen instead */
export const PAPERS = ['', 'light', 'dark', 'none']
export function papered(arr, i, paper) {
  if (!arr.cars[i]) return arr
  return patch(arr, i, { paper: PAPERS.includes(paper) ? paper : '' })
}

/**
 * Taking one out of the picture without taking it out of the composition.
 *
 * A rail is a set of decisions about several elements at once, and the way you find out whether one
 * of them is carrying its weight is to watch the thing without it. Removing the car answers that and
 * costs the arrangement: its motion, its offset, its camera, everything chosen for it, and undo is
 * the only way back. Hidden, the row stays where it is with its timing intact and comes back the
 * same way it went.
 */
export function hidden(arr, i, off) {
  if (!arr.cars[i]) return arr
  return patch(arr, i, { off: !!off })
}

/** the cars that will actually be in the picture, which is what a frame and a film are built from */
export const shown = (arr) => live(arr).filter((x) => !x.car.off)

/** whether anybody has been moved, which is what tells a stage from a stack */
export const staged = (arr) => live(arr).some((x) => !!x.car.place)

/**
 * An arrangement read back from somewhere it was stored, made trustworthy again.
 *
 * Everything here relies on the motion records being frozen, which is what makes sharing them across
 * every history step safe. json carries the values and not that promise, so anything that has been
 * through a file has to have it put back, or the first write through a shared record after a restart
 * would be silent instead of a throw.
 */
export function revive(said) {
  if (!said || !Array.isArray(said.cars)) return null
  const cars = said.cars.map((c, i) => ({
    key: String(c.key || `c${i + 1}`),
    pick: Object.freeze({ ...(c.pick || { label: 'element' }) }),
    motion: c.motion ? Object.freeze({ ...c.motion }) : null,
    alternatives: Object.freeze((c.alternatives || []).map((m) => Object.freeze({ ...m }))),
    at: Math.max(0, num(c.at)),
    after: c.after && c.after.key ? { ...c.after } : null,
    shot: String(c.shot || ''),
    tune: c.tune || null,
    place: c.place ? { ...c.place } : null,
    paper: String(c.paper || ''),
    moves: Object.freeze((c.moves || []).map((m) => ({ ...m }))),
    from: c.from === null || c.from === undefined ? null : num(c.from),
    until: c.until === null || c.until === undefined ? null : num(c.until),
    why: String(c.why || ''),
  }))
  return { id: String(said.id || 'a1'), cars,
    camera: Object.freeze((Array.isArray(said.camera) ? said.camera : []).map((m) => ({ ...m }))),
    markers: (said.markers || []).map(num) }
}

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
    /* which motion this was retimed from, so dragging a bar's edge a dozen times leaves one
       alternative rather than a dozen. Absent on anything that came from the model */
    origin: o.origin ? String(o.origin) : '',
  })
  : null)

/**
 * A motion at a length somebody chose, put in place of the one it was retimed from.
 *
 * Dragging a bar's edge is a retime, and every retime mints a new option on the server. Appending
 * each one would turn the row's list of alternatives into a record of every drag, so a retime of a
 * retime replaces its predecessor: the list stays the set of real choices, and the one that came
 * from the model stays in it.
 */
export function trimmed(arr, i, made) {
  const car = arr.cars[i]
  const next = motionOf(made)
  if (!car || !next) return arr
  const root = next.origin || next.id
  const kept = car.alternatives.filter((m) => (m.origin || m.id) !== root || m.id === root)
  const at = kept.findIndex((m) => (m.origin || m.id) === root && m.origin)
  const list = at >= 0 ? kept.map((m, k) => (k === at ? next : m)) : kept.concat([next])
  return patch(arr, i, { motion: next, alternatives: Object.freeze(list) })
}

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

/**
 * When a car is on the stage, resolved.
 *
 * Defaults rather than stored numbers: a component arrives when its motion starts, because that is
 * what you meant by putting the motion there, and it stays unless somebody says otherwise. Writing
 * either of those into every car at birth would freeze a decision nobody made and would go stale the
 * moment the motion moved.
 */
export function lifeOf(arr, i) {
  const car = (arr && arr.cars && arr.cars[i]) || null
  if (!car) return { from: 0, until: null }
  const { at } = resolve(arr)
  const from = car.from == null ? at[i] : Math.max(0, num(car.from))
  const until = car.until == null ? null : Math.max(from, num(car.until))
  return { from, until }
}

/** a car given a life of its own, or handed back the default when told nothing */
export function living(arr, i, life) {
  if (!arr.cars[i]) return arr
  const has = (v) => v !== undefined && v !== null
  return patch(arr, i, {
    from: has(life && life.from) ? Math.max(0, Math.round(num(life.from))) : null,
    until: has(life && life.until) ? Math.max(0, Math.round(num(life.until))) : null,
  })
}

/** how long the composition runs, which is not the same number as how long the ruler is drawn */
export function spanOf(arr) {
  const { at } = resolve(arr)
  /* a car nobody is going to see must not keep the film running to wait for it: hide the last one
     on the rail and the composition ends where the last visible one does */
  const ends = shown(arr).map((x) => {
    const life = lifeOf(arr, x.i)
    const trip = (x.car.moves || []).reduce((most, m) => Math.max(most, m.at + m.ms), 0)
    /* a car that leaves still had to be watched leaving, and one still travelling at the end of its
       motion is the whole point of a demo, so both count as much as the motion does */
    return Math.max(at[x.i] + runs(x.car), life.until === null ? 0 : life.until, trip)
  })
  // a camera still moving at the end of every motion is the last thing anybody is watching
  const shot = (arr.camera || []).reduce((most, m) => Math.max(most, m.at + m.ms), 0)
  return Math.max(FLOOR, ...ends, shot, 0)
}

/**
 * The stretch of the composition a film is of.
 *
 * A rail can run for a minute now, and a minute of composing is rarely a minute worth watching: the
 * thirty seconds that matter are somewhere inside it and the rest is setting up. This is the
 * difference between filming what you made and filming the part of it you meant.
 *
 * Held on the arrangement rather than beside the film controls, because it is a decision about the
 * composition, it belongs with the offsets and the markers, and forking a rail should carry it.
 * Absent means the whole thing, which is what every rail starts as and most stay.
 *
 * Named cut rather than trim because trimmed is already an operation here, on a car's alternatives.
 * Two things called the same thing in one module is how the wrong one gets called.
 */
export function cutOf(arr) {
  const total = spanOf(arr)
  const cut = arr && arr.cut
  if (!cut) return { from: 0, to: total, whole: true }
  const from = Math.max(0, Math.min(num(cut.from), total))
  /* never inverted and never nothing, since a film of no frames is not a thing anybody asked for and
     a handle dragged past its partner is a slip rather than an instruction */
  const to = Math.max(from + 200, Math.min(num(cut.to, total), total))
  return { from: Math.round(from), to: Math.round(to), whole: false }
}

export function cutTo(arr, cut) {
  if (!cut) return { ...arr, cut: null }
  const total = spanOf(arr)
  const from = Math.max(0, Math.min(num(cut.from), total))
  const to = Math.max(from + 200, Math.min(num(cut.to, total), total))
  /* the whole thing is stored as no cut at all rather than as a range that happens to match it, so a
     rail nobody cut carries nothing and one cut back to full forgets that it ever was */
  if (from <= 0 && to >= total) return { ...arr, cut: null }
  return { ...arr, cut: { from: Math.round(from), to: Math.round(to) } }
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
    /* which are out of the picture, one entry per car like the rest of these. Filtered out of the
       list instead, every index after a hidden car would shift, and data-rail is what the stage
       maps back to a row: the same conflation that once handed every car its neighbour's timing */
    q('off', on.map((x) => (x.car.off ? '1' : '')).join(',')),
    /* when each is on stage, as from_until, empty where both are the default */
    q('life', on.map((x) => {
      const life = lifeOf(arr, x.i)
      /* loose, so a car built somewhere that never set the fields reads as having chosen nothing
         rather than as having chosen undefined */
      const own = arr.cars[x.i].from != null || arr.cars[x.i].until != null
      return own ? `${Math.round(life.from)}_${life.until === null ? '' : Math.round(life.until)}` : ''
    }).join(',')),
    /* each car's journey as at_ms_x_y_scale steps joined by a pipe, empty where it never travels */
    q('go', on.map((x) => (x.car.moves || [])
      .map((m) => `${Math.round(m.at)}_${Math.round(m.ms)}_${m.x.toFixed(2)}_${m.y.toFixed(2)}`
        + `_${m.scale.toFixed(3)}_${m.ease}`).join('|')).join(',')),
    q('cam', (arr.camera || [])
      .map((m) => `${Math.round(m.at)}_${Math.round(m.ms)}_${m.x.toFixed(2)}_${m.y.toFixed(2)}`
        + `_${m.scale.toFixed(3)}_${m.ease}`).join('|')),
    q('paper', on.map((x) => x.car.paper || '').join(',')),
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
  /**
   * Everything the composition is still doing, not only what its motions are doing.
   *
   * This counted the last motion and said the rail had landed, which stopped being true the moment a
   * component could travel after arriving or leave after staying. It read "all landed by 1.5s" over
   * a ruler running to 2.7, which is the readout being wrong about the one thing it is for.
   */
  const busyTo = (x) => Math.max(
    at[x.i] + runs(x.car),
    (x.car.moves || []).reduce((most, m) => Math.max(most, m.at + m.ms), 0),
    lifeOf(arr, x.i).until === null ? 0 : lifeOf(arr, x.i).until,
  )
  const last = Math.max(...on.map(busyTo))
  // the quiet is measured between what each is still doing and when the next one starts
  const order = on.slice().sort((a, b) => at[a.i] - at[b.i])
  let hole = 0, holeAt = 0
  for (let i = 1; i < order.length; i += 1) {
    const done = busyTo(order[i - 1])
    const gap = at[order[i].i] - done
    if (gap > hole) { hole = gap; holeAt = done }
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
