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

const W = 160, H = 90, FPS = 4

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

const lit = (f) => { let on = 0; for (let i = 0; i < f.length; i += 3) if (f[i] > 40 || f[i + 1] > 40 || f[i + 2] > 40) on++; return on / (f.length / 3) }
/**
 * The share of pixels that changed, not the average change. A film's elements cover a few
 * percent of a dark frame, so a real cut averaged over the whole picture reads as almost nothing:
 * measured on a fast film of linear.app, cuts averaged 4 to 10 out of 255 while covering 8 to 14
 * percent of the pixels, and a motion mid-shot covered 2 to 3 percent. Counting pixels sees the
 * cut; averaging hid it.
 */
const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++; return n / (a.length / 3) }

/**
 * @returns { seconds, cuts, shots, avgShotMs, longestShotMs, blank, ok, notes[] }
 *   cuts   how many times the picture changed sharply
 *   shots  the cut count plus one
 *   blank  the share of sampled frames with nothing lit
 *   ok     whether it meets the pace that was asked for
 */
export async function proveFilm({ file, pace = 'calm', seconds }) {
  const ffmpeg = await loadFfmpeg()
  if (!ffmpeg) return { ok: false, notes: ['the renderer is not installed, so the film could not be measured'] }
  const fs = await frames(ffmpeg, file)
  if (fs.length < 2) return { ok: false, notes: ['the file decoded to fewer than two frames'] }
  const total = fs.length / FPS
  let cuts = 0, last = 0
  const shots = [], lits = fs.map(lit)
  for (let i = 1; i < fs.length; i++) {
    /**
     * A cut is one of two things, measured on two fast films of linear.app: a jump in the share
     * of pixels that changed, which sat at 3.5 to 7 percent at cuts against 1 to 3 during a motion;
     * or an element appearing out of a blank frame, which is what a shot looks like when its
     * motion starts from invisible and the sample lands on the boundary. Either counts once, and
     * not within 600ms of the last, so the motion that follows a cut is never a second cut.
     */
    const jump = changed(fs[i], fs[i - 1]) > 0.03, appeared = lits[i - 1] <= 0.004 && lits[i] >= 0.012
    if ((jump || appeared) && i - last >= Math.ceil(FPS * 0.6)) { cuts++; shots.push((i - last) / FPS * 1000); last = i }
  }
  shots.push((fs.length - last) / FPS * 1000)
  const blank = lits.filter((l) => l < 0.002).length / fs.length
  const avgShotMs = Math.round(shots.reduce((a, b) => a + b, 0) / shots.length), longestShotMs = Math.round(Math.max(...shots))
  const notes = []
  const want = pace === 'fast' ? { minCuts: Math.max(6, Math.round(total / 2)), maxAvg: 1800 } : pace === 'brisk' ? { minCuts: Math.max(3, Math.round(total / 4)), maxAvg: 3200 } : { minCuts: 1, maxAvg: Infinity }
  if (cuts < want.minCuts) notes.push(`only ${cuts} cuts in ${total.toFixed(0)} seconds, ${pace} asks for at least ${want.minCuts}`)
  if (avgShotMs > want.maxAvg) notes.push(`shots average ${(avgShotMs / 1000).toFixed(1)}s, ${pace} asks for under ${(want.maxAvg / 1000).toFixed(1)}s`)
  if (blank > 0.15) notes.push(`${Math.round(blank * 100)}% of the frames are blank`)
  if (seconds && Math.abs(total - seconds) > 1.5) notes.push(`it runs ${total.toFixed(0)} seconds, not the ${seconds} asked for`)
  return { seconds: Math.round(total), cuts, shots: shots.length, avgShotMs, longestShotMs, blank: Math.round(blank * 100) / 100, ok: notes.length === 0, notes }
}

/** One sentence an agent can repeat. */
export const proofLine = (r) => r.ok
  ? `Verified from the frames: ${r.cuts} cuts in ${r.seconds} seconds, shots of ${(r.avgShotMs / 1000).toFixed(1)}s on average, nothing blank.`
  : `Checked the frames: ${r.notes.join('; ')}.`
