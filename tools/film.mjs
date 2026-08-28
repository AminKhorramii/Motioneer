/**
 * A cut of moving marks, rendered frame by frame, for posting.
 *
 *   node tools/motion.mjs "a status badge"     first, to make the marks
 *   node tools/film.mjs                        then this, to cut them together
 *   node tools/film.mjs --wide                 16:9 instead of square
 *
 * Two things decided the shape of this file.
 *
 * X takes mp4 and does not take webm, and macOS has no transcoder that reads webm: avconvert ships
 * with the system and refuses the file outright, because AVFoundation has never decoded VP8. So the
 * browser's own recording, which is what the other tools use, cannot be posted anywhere. Frames can,
 * and ffmpeg turns frames into mp4 if it happens to be installed, which is a thing somebody may have
 * rather than a package this repository depends on.
 *
 * And rendering frames deliberately is better than recording in real time regardless. A recording
 * hopes the machine keeps up and produces a different file every run; stepping the clock by hand
 * produces the same film every time, at whatever frame rate is asked for, with no dropped frames on
 * a busy laptop. The transport that scrubs the wall is exactly the mechanism for it: hold every
 * animation at a known instant, photograph, advance.
 */

import { chromium } from 'playwright'
import { readdirSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
const FROM = args.find((a) => !a.startsWith('--')) ?? 'motion'
const SIZE = args.includes('--wide') ? { width: 1280, height: 720 }
  : args.includes('--tall') ? { width: 864, height: 1080 }
    : { width: 1080, height: 1080 }
const FPS = Number(process.env.WALL_FPS || 30)
const SHOT_MS = Number(process.env.WALL_SHOT_MS || 2600)
const out = 'film'

if (!existsSync(FROM)) {
  console.log(`\n  no such folder: ${FROM}. run one of these first:\n`)
  console.log('    node tools/motion.mjs "a status badge"')
  console.log('    node tools/animate.mjs src/YourComponent.tsx --css src/app.css\n')
  process.exit(1)
}
const shots = readdirSync(FROM)
  .filter((f) => /\.html$/.test(f) && f !== 'sheet.html')
  .sort()
  .map((f) => path.resolve(FROM, f))
if (!shots.length) { console.log(`  nothing to film in ${FROM}/`); process.exit(1) }

if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(path.join(out, 'frames'), { recursive: true })

const perShot = Math.round((SHOT_MS / 1000) * FPS)
const total = perShot * shots.length
console.log(`\n  ${shots.length} shots, ${SHOT_MS}ms each, ${FPS}fps, ${SIZE.width}x${SIZE.height}`)
console.log(`  ${total} frames, ${(total / FPS).toFixed(1)}s\n`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 })
const tab = await ctx.newPage()
let n = 0

for (const [i, shot] of shots.entries()) {
  await tab.goto('file://' + shot, { waitUntil: 'load' })
  await tab.waitForTimeout(240)
  /**
   * The clock is set rather than waited on.
   *
   * Every page written by the motion tools carries a listener that pauses its animations and holds
   * them at a given instant, which is what the scrubber drives. Here it is driven by the frame
   * number, so frame 30 is exactly one second in whatever the machine happened to be doing, and the
   * film is the same file on a busy laptop as on an idle one.
   */
  for (let f = 0; f < perShot; f++) {
    const at = Math.round((f / FPS) * 1000)
    await tab.evaluate((t) => {
      for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = t } catch {} }
    }, at).catch(() => {})
    await tab.screenshot({ path: path.join(out, 'frames', String(n).padStart(5, '0') + '.png') })
    n++
  }
  process.stdout.write(`  shot ${i + 1}/${shots.length}  ${path.basename(shot)}\n`)
}
await browser.close()

/**
 * And then mp4, if there is anything here that can make one.
 *
 * ffmpeg is looked for rather than required. Without it the frames are still the deliverable and the
 * message says exactly what to run, because a tool that silently produces nothing postable and calls
 * that success is the failure this repository keeps finding in itself.
 */
const ff = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' }).stdout.trim()
const mp4 = path.resolve(out, 'film.mp4')
if (ff) {
  const r = spawnSync(ff, [
    '-y', '-framerate', String(FPS),
    '-i', path.join(out, 'frames', '%05d.png'),
    // yuv420p and even dimensions, or half the players in the world show a green frame
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-movflags', '+faststart', mp4,
  ], { encoding: 'utf8' })
  if (r.status === 0) {
    console.log(`\n  ${mp4}`)
    console.log('  h264, yuv420p, faststart: this is what X takes\n')
  } else {
    console.log(`\n  ffmpeg failed: ${String(r.stderr).split('\n').slice(-3).join(' ').slice(0, 160)}`)
    console.log(`  the frames are in ${path.join(out, 'frames')}\n`)
  }
} else {
  writeFileSync(path.join(out, 'make-mp4.sh'),
    `#!/bin/sh\n# X takes mp4 and not webm, and macOS has no transcoder that reads webm.\n`
    + `# Install ffmpeg once, then run this, or just run tools/film.mjs again.\n`
    + `#   brew install ffmpeg\n\n`
    + `ffmpeg -y -framerate ${FPS} -i frames/%05d.png \\\n`
    + `  -c:v libx264 -pix_fmt yuv420p -preset slow -crf 18 \\\n`
    + `  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -movflags +faststart film.mp4\n`)
  console.log(`\n  ${n} frames in ${path.join(out, 'frames')}`)
  console.log('  no mp4: ffmpeg is not installed, and nothing else on macOS reads what we record.')
  console.log('  brew install ffmpeg   then run this again, or sh film/make-mp4.sh\n')
}

// a contact sheet of the cut, so the shot order can be judged without playing anything
const picked = Array.from({ length: Math.min(12, n) }, (_, i) => Math.floor((i * n) / Math.min(12, n)))
writeFileSync(path.resolve(out, 'sheet.html'), `<html><body style="margin:0;background:#08090a;
  font:11px ui-monospace,monospace;color:#8a8f98">
<div style="padding:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
${picked.map((f) => `<figure style="margin:0"><img src="frames/${String(f).padStart(5, '0')}.png"
  style="width:100%;display:block;border-radius:4px"><figcaption style="padding:5px 2px;text-align:center">
  ${(f / FPS).toFixed(2)}s</figcaption></figure>`).join('')}
</div></body></html>`)
console.log(`  ${path.resolve(out, 'sheet.html')}\n`)
