/**
 * What a rendered film actually is, measured off its frames rather than read off its plan.
 *
 * A film tool that says "fast" because it was asked for fast is trusting its own intent. This
 * decodes the file at four frames a second, counts the cuts as frames that differ sharply from
 * the one before, times the shots between them, and checks that something is on screen. The
 * verdict compares that to the pace requested, so the reply can say "twelve cuts, one second
 * each" or admit it came out slower than asked. The same check guards the suite.
 */
import { spawn } from 'node:child_process'
import { loadFfmpeg } from './render.mjs'

// 320 by 180: at half that, a line of text is one pixel tall and its fade cannot be seen at all
const W = 320, H = 180, FPS = 10

/** Decode to small rgb frames in memory. */
async function frames(ffmpeg, file) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const p = spawn(ffmpeg, ['-v', 'error', '-i', file, '-vf', `fps=${FPS},scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
    p.stdout.on('data', (d) => chunks.push(d))
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code) return reject(new Error(`ffmpeg exited ${code}`))
      const all = Buffer.concat(chunks), size = W * H * 3, out = []
      for (let i = 0; i + size <= all.length; i += size) out.push(all.subarray(i, i + size))
      resolve(out)
    })
  })
}

/**
 * The share of the frame that is content rather than ground. The ground is the frame's most
 * common colour, found on a coarse grid, so a film on a white site counts its dark headline the
 * same way a film on a dark site counts its light one. Brightness alone called a white stage
 * "lit" everywhere and a dark headline on it nothing at all.
 */
const lit = (f) => {
  const seen = new Map()
  for (let i = 0; i < f.length; i += 3) { const k = ((f[i] >> 4) << 8) | ((f[i + 1] >> 4) << 4) | (f[i + 2] >> 4); seen.set(k, (seen.get(k) || 0) + 1) }
  let ground = 0, most = -1
  for (const [k, n] of seen) if (n > most) { most = n; ground = k }
  // the ground's exact colour is the mean of the pixels in its bucket: a bucket's corner was off
  // by up to 15 a channel, which made a light ground count as content everywhere
  let sr = 0, sg = 0, sb = 0, count = 0
  for (let i = 0; i < f.length; i += 3) if ((((f[i] >> 4) << 8) | ((f[i + 1] >> 4) << 4) | (f[i + 2] >> 4)) === ground) { sr += f[i]; sg += f[i + 1]; sb += f[i + 2]; count++ }
  const gr = sr / count, gg = sg / count, gb = sb / count
  let on = 0
  for (let i = 0; i < f.length; i += 3) if (Math.abs(f[i] - gr) + Math.abs(f[i + 1] - gg) + Math.abs(f[i + 2] - gb) > 30) on++
  return on / (f.length / 3)
}
/**
 * The share of pixels that changed, not the average change. A film's elements cover a few
 * percent of a dark frame, so a real cut averaged over the whole picture reads as almost nothing:
 * measured on a fast film of linear.app, cuts averaged 4 to 10 out of 255 while covering 8 to 14
 * percent of the pixels, and a motion mid-shot covered 2 to 3 percent. Counting pixels sees the
 * cut; averaging hid it.
 */
const changed = (a, b, floor = 60) => { let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > floor) n++; return n / (a.length / 3) }
/**
 * A cut is a hard change on more than 3 percent of the pixels, or a soft one on more than 10:
 * one dark screenshot replacing another moved only 2.3 percent of pixels hard and 18 soft, while
 * nothing inside a shot, motion or drift, passed 8 soft. Or an element appearing out of a blank
 * frame, which is what a shot looks like when its motion starts from invisible.
 */
const isCut = (a, b, litA, litB) => changed(a, b) > 0.03 || changed(a, b, 18) > 0.10 || (litA <= 0.004 && litB >= 0.012)

/**
 * @param cuts   the times in ms at which the cut planned a boundary, when known; each is checked
 *               where it should be rather than guessed from pixels, because a fade of a big white
 *               card changes a third of the picture every step and no pixel rule tells that apart
 *               from a cut. Without a plan, boundaries are detected and the count is a best guess.
 * @returns { seconds, cuts, planned, shots, avgShotMs, longestShotMs, arriveMs, blank, ok, notes[] }
 */
export async function proveFilm({ file, pace = 'calm', seconds, cuts: planned }) {
  const ffmpeg = await loadFfmpeg()
  if (!ffmpeg) return { ok: false, notes: ['the renderer is not installed, so the film could not be measured'] }
  const fs = await frames(ffmpeg, file)
  if (fs.length < 2) return { ok: false, notes: ['the file decoded to fewer than two frames'] }
  const total = fs.length / FPS, lits = fs.map(lit)
  const soft = (i) => changed(fs[i], fs[i - 1], 18)
  const frameAt = (ms) => Math.max(1, Math.min(fs.length - 1, Math.round(ms / 1000 * FPS)))

  // boundaries: the planned ones checked in place, or detected when nothing was planned
  let boundaries
  if (Array.isArray(planned) && planned.length) {
    boundaries = planned.map((ms) => {
      const a = frameAt(ms - 150), b = frameAt(ms + 250)
      let best = -1, bestAt = -1
      for (let i = a; i <= b; i++) { const v = soft(i); if (v > best) { best = v; bestAt = i } }
      /**
       * A boundary is seen when the change right there is large against what is on screen, not
       * against the whole frame: a film of one small heading repeated, on example.com, changes
       * under two percent of the frame at a cut because the heading is under two percent of the
       * frame, while a card that fills a third of it changes a third. Forty percent of the
       * content around the boundary, or three percent of the frame outright, is a cut.
       */
      const around = Math.max(lits[Math.max(1, a)], lits[Math.min(fs.length - 1, b)], 0.005)
      return { at: bestAt, seen: best > 0.03 || best >= around * 0.4 }
    })
  } else {
    boundaries = []
    for (let i = 1, l = 0; i < fs.length; i++) { if (isCut(fs[i], fs[i - 1], lits[i - 1], lits[i]) && i - l >= Math.ceil(FPS * 0.6)) { boundaries.push({ at: i, seen: true }); l = i } }
  }
  const seen = boundaries.filter((b) => b.seen)
  const cuts = seen.length
  const marks = [0, ...seen.map((b) => b.at), fs.length]
  const shots = marks.slice(1).map((m, k) => (m - marks[k]) / FPS * 1000)
  const avgShotMs = Math.round(shots.reduce((a, b) => a + b, 0) / shots.length), longestShotMs = Math.round(Math.max(...shots))

  /**
   * How long an element takes to arrive after a boundary: the time to reach 80 percent of all the
   * change above the shot's own baseline in its first second. A pop gets there in one step; a fade
   * or a staggered arrival takes most of the second. The baseline is subtracted because a brisk
   * shot drifts and keeps a large element changing about three percent a step, and measured on
   * change rather than on what is lit because a fading card is lit early and keeps brightening for
   * its whole fade. Measured: motions asked for 450ms arrived in about 100 to 150ms, a pop; asked
   * for 900ms, 400 to 700.
   */
  const arrivals = []
  seen.forEach((b, k) => {
    const end = Math.min(fs.length - 1, (seen[k + 1]?.at ?? fs.length) - 1, b.at + Math.round(FPS * 1.2))
    const steps = []
    for (let i = b.at + 1; i <= end; i++) steps.push(soft(i))
    if (steps.length < 4) return
    const tail = steps.slice(Math.round(steps.length / 2)).sort((x, y) => x - y), baseline = tail[Math.floor(tail.length / 2)] || 0
    const excess = steps.slice(0, Math.round(FPS * 1.0)).map((v) => Math.max(0, v - baseline))
    const total = excess.reduce((a, c) => a + c, 0)
    if (total < 0.01) { arrivals.push(0); return }
    let sum = 0, reached = excess.length
    for (let j = 0; j < excess.length; j++) { sum += excess[j]; if (sum >= total * 0.8) { reached = j; break } }
    arrivals.push((reached + 1) / FPS * 1000)
  })
  const arriveMs = arrivals.length ? Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : 0
  const blank = lits.filter((l) => l < 0.002).length / fs.length
  // a shot that is still empty a third of a second in: a motion that hides its root before revealing it
  const lateShots = seen.filter((b) => { const i = Math.min(fs.length - 1, b.at + Math.round(FPS * 0.3)); return lits[i] < 0.002 }).length

  const notes = []
  const want = pace === 'fast' ? { minCuts: Math.max(6, Math.round(total / 2)), maxAvg: 1800 } : pace === 'brisk' ? { minCuts: Math.max(3, Math.round(total / 4)), maxAvg: 3200 } : { minCuts: 1, maxAvg: Infinity }
  if (Array.isArray(planned) && planned.length && cuts < planned.length) notes.push(`${planned.length - cuts} of the ${planned.length} planned cuts did not show in the frames`)
  if (cuts < want.minCuts) notes.push(`only ${cuts} cuts in ${total.toFixed(0)} seconds, ${pace} asks for at least ${want.minCuts}`)
  if (avgShotMs > want.maxAvg) notes.push(`shots average ${(avgShotMs / 1000).toFixed(1)}s, ${pace} asks for under ${(want.maxAvg / 1000).toFixed(1)}s`)
  if (blank > 0.15) notes.push(`${Math.round(blank * 100)}% of the frames are blank`)
  if (arrivals.length && arriveMs < 200) notes.push(arriveMs < 50 ? 'elements pop in at once rather than arrive' : `elements pop in rather than arrive, settling in about ${arriveMs}ms`)
  if (lateShots) notes.push(`${lateShots} shot${lateShots === 1 ? '' : 's'} still empty a third of a second in, a motion that hides its element before revealing it`)
  if (seconds && Math.abs(total - seconds) > 1.5) notes.push(`it runs ${total.toFixed(0)} seconds, not the ${seconds} asked for`)
  return { seconds: Math.round(total), cuts, planned: Array.isArray(planned) ? planned.length : null, shots: shots.length, avgShotMs, longestShotMs, arriveMs, lateShots, blank: Math.round(blank * 100) / 100, ok: notes.length === 0, notes }
}

/** One sentence an agent can repeat. */
export const proofLine = (r) => r.ok
  ? `Verified from the frames: ${r.cuts}${r.planned ? ` of ${r.planned} planned` : ''} cuts in ${r.seconds} seconds, shots of ${(r.avgShotMs / 1000).toFixed(1)}s on average, each element arriving over about ${(r.arriveMs / 1000).toFixed(1)}s, nothing blank.`
  : `Checked the frames: ${r.notes.join('; ')}.`
