/**
 * The muxer, read back byte by byte.
 *
 * A container is the one kind of output where working and looking like it works are nearly the same
 * picture. ffprobe reads the index, reports one h264 stream at the right size with the right number
 * of frames, and says nothing at all about whether the offsets in that index point at the samples;
 * a file with every offset eight bytes short probes identically and plays black. So this parses the
 * bytes back into a box tree and checks the arithmetic itself: every box length has to account for
 * the file exactly, and every chunk offset has to land on the first byte of the sample it names.
 *
 * Two legs. The first is synthetic and always runs, because it is the one that can say why something
 * is wrong. The second builds real h264 with ffmpeg if ffmpeg is here, muxes it with our own boxes,
 * and asks ffprobe to decode every frame back out, which is the only thing that can prove the file
 * plays. It also breaks one offset on purpose afterwards, because a leg that cannot fail the classic
 * bug is not testing for it.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mux, supported } from '../shared/mp4.mjs'

const problems = []
const check = (ok, said) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${said}`)
  if (!ok) problems.push(said)
}
const throws = (fn, why) => {
  try {
    fn()
    check(false, `${why}  it returned instead of throwing`)
  } catch (e) {
    check(true, `${why}  ${String(e.message).slice(0, 70)}`)
  }
}

// reading the boxes back

/**
 * Which boxes hold other boxes, and how much of their own payload comes first.
 *
 * Most containers are nothing but children. stsd and dref are full boxes with a count in front, and
 * a sample entry like avc1 carries the whole visual description before anything nests inside it, so
 * the number here is how far in the children start.
 */
const HOLDS = { moov: 0, trak: 0, mdia: 0, minf: 0, dinf: 0, stbl: 0, stsd: 8, dref: 8, avc1: 78 }

function walk(buf, from, to) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out = []
  let at = from
  while (at < to) {
    if (at + 8 > to) throw new Error(`a box header at ${at} runs past the end of its parent`)
    let len = view.getUint32(at)
    const type = String.fromCharCode(...buf.subarray(at + 4, at + 8))
    let head = 8
    if (len === 1) {
      len = Number(view.getBigUint64(at + 8))
      head = 16
    } else if (len === 0) len = to - at
    if (len < head) throw new Error(`box ${type} at ${at} says it is ${len} bytes, which is shorter than its header`)
    if (at + len > to) throw new Error(`box ${type} at ${at} runs ${at + len - to} bytes past the end of its parent`)
    const skip = HOLDS[type]
    out.push({
      type,
      at,
      len,
      head,
      body: buf.subarray(at + head, at + len),
      kids: skip === undefined ? [] : walk(buf, at + head + skip, at + len),
    })
    at += len
  }
  if (at !== to) throw new Error(`the boxes between ${from} and ${to} add up to ${at} instead`)
  return out
}

/** the first box down a path of types, or null */
function find(tree, ...types) {
  let here = tree
  let hit = null
  for (const type of types) {
    hit = here.find((b) => b.type === type)
    if (!hit) return null
    here = hit.kids
  }
  return hit
}

const num = (b, at) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at)

/**
 * The rows of a table box.
 *
 * The entry count sits right after the version and flags in every one of these except stsz, which
 * puts a shared sample size in front of it, so where to read the count is an argument rather than a
 * constant. Reading it from the wrong place gives zero rows and a table check that passes by
 * looping over nothing.
 */
const table = (b, stride, countAt = 4) => {
  const n = num(b.body, countAt)
  const from = countAt + 4
  const rows = []
  for (let i = 0; i < n; i++) rows.push(Array.from({ length: stride }, (_, k) => num(b.body, from + i * stride * 4 + k * 4)))
  return rows
}

// the synthetic leg

/**
 * Chunks shaped exactly like the ones WebCodecs hands over, with the awkward parts kept in.
 *
 * The timestamps are not evenly spaced. A rasterizer that misses its slot is the normal case rather
 * than the exception, and the durations in stts are supposed to come from the timestamps, so a
 * fixture at a perfect 30fps would pass whether that was true or not. The sizes are all different
 * too, which is what makes a wrong offset show up as a wrong offset rather than as a coincidence.
 */
const AVCC = Uint8Array.from([1, 0x42, 0xe0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0xe0, 0x1f, 1, 0, 4, 0x68, 0xce, 0x3c, 0x80])
const SPACING = [0, 33333, 66667, 100000, 141000, 166667, 200000, 233333, 266667, 300000]
const FAKE = SPACING.map((timestamp, i) => ({
  data: Uint8Array.from({ length: 40 + i * 7 }, (_, k) => (i * 31 + k) & 255),
  timestamp,
  duration: 33333,
  type: i % 4 === 0 ? 'key' : 'delta',
}))
const SIZE = { width: 640, height: 360, fps: 30 }

console.log('the boxes')
const file = mux(FAKE, { ...SIZE, codecDescription: AVCC })
check(file instanceof Uint8Array, `mux returned ${file.constructor.name} of ${file.length} bytes`)

let tree = []
try {
  tree = walk(file, 0, file.length)
  check(true, `the box tree parses and every length accounts for the file  ${tree.map((b) => b.type).join(' ')}`)
} catch (e) {
  check(false, `the box tree parses  ${e.message}`)
}

const ftyp = tree[0]
check(ftyp?.type === 'ftyp' && ftyp.at === 0, 'the file starts with ftyp')
check(String.fromCharCode(...(ftyp?.body.subarray(0, 4) ?? [])) === 'isom', 'the major brand is isom')
const brands = []
for (let i = 8; i + 4 <= (ftyp?.body.length ?? 0); i += 4) brands.push(String.fromCharCode(...ftyp.body.subarray(i, i + 4)))
check(brands.join(' ') === 'isom iso2 avc1 mp41', `the compatible brands are ${brands.join(' ')}`)

const order = tree.map((b) => b.type)
check(order.indexOf('moov') > -1 && order.indexOf('moov') < order.indexOf('mdat'), `moov comes before mdat  ${order.join(' ')}`)
check(order.length === 3, `there are three boxes at the top and nothing stray  ${order.length}`)

const mdat = tree.find((b) => b.type === 'mdat')
const stbl = find(tree, 'moov', 'trak', 'mdia', 'minf', 'stbl')
check(!!stbl, 'moov > trak > mdia > minf > stbl is where it should be')
for (const want of ['stsd', 'stts', 'stss', 'stsc', 'stsz', 'stco'])
  check(!!find(stbl?.kids ?? [], want), `stbl carries ${want}`)
check(!!find(tree, 'moov', 'trak', 'mdia', 'minf', 'dinf', 'dref', 'url '), 'dinf > dref > url is present and self contained')
check(!!find(tree, 'moov', 'trak', 'mdia', 'minf', 'vmhd'), 'vmhd is present')
check(!!find(tree, 'moov', 'trak', 'mdia', 'hdlr'), 'hdlr is present')

const avc1 = find(stbl.kids, 'stsd', 'avc1')
const avcC = avc1 && find(avc1.kids, 'avcC')
check(!!avcC, 'stsd > avc1 > avcC is present')
check(
  avcC && avcC.body.length === AVCC.length && AVCC.every((b, i) => avcC.body[i] === b),
  'avcC holds the description it was given, byte for byte',
)
check(num(avc1.body, 24) >> 16 === SIZE.width && (num(avc1.body, 24) & 0xffff) === SIZE.height,
  `avc1 says ${num(avc1.body, 24) >> 16} by ${num(avc1.body, 24) & 0xffff}`)

// the offsets, which are the reason this file exists
const stco = find(stbl.kids, 'stco')
const stsz = find(stbl.kids, 'stsz')
const offsets = table(stco, 1).map((r) => r[0])
const sizes = table(stsz, 1, 8).map((r) => r[0])
check(offsets.length === FAKE.length, `stco has one offset per sample  ${offsets.length}`)
check(sizes.length === FAKE.length, `stsz has one size per sample  ${sizes.length}`)
check(num(stsz.body, 4) === 0, 'stsz uses the per sample form rather than one shared size')
check(sizes.every((s, i) => s === FAKE[i].data.length), 'every stsz entry is the length of its chunk')

const start = mdat.at + 8
check(offsets[0] === start, `the first offset lands on the first byte after the mdat header  ${offsets[0]} against ${start}`)
let running = start
let landed = true
let held = true
for (let i = 0; i < FAKE.length; i++) {
  if (offsets[i] !== running) landed = false
  const there = file.subarray(offsets[i], offsets[i] + FAKE[i].data.length)
  if (!FAKE[i].data.every((b, k) => there[k] === b)) held = false
  running += FAKE[i].data.length
}
check(landed, 'every offset lands exactly on the start of its sample')
check(held, 'the bytes at every offset are the bytes of that chunk')
check(running === mdat.at + mdat.len, `the samples fill mdat exactly  ${running} against ${mdat.at + mdat.len}`)

// the clock
const stts = find(stbl.kids, 'stts')
const rows = table(stts, 2)
const counted = rows.reduce((a, [n]) => a + n, 0)
const ticks = rows.reduce((a, [n, d]) => a + n * d, 0)
const expected = SPACING.slice(1).reduce((a, t, i) => a + Math.round(((t - SPACING[i]) * 90000) / 1e6), 0) + Math.round((33333 * 90000) / 1e6)
check(counted === FAKE.length, `stts counts every sample  ${counted}`)
check(ticks === expected, `stts sums to the film's length  ${ticks} against ${expected} ticks`)
check(rows.length < FAKE.length, `equal spans collapse into runs  ${rows.length} entries for ${FAKE.length} samples`)
check(rows.some(([, d]) => d !== rows[0][1]), 'the uneven spacing survived rather than being rounded to one rate')

const mdhd = find(tree, 'moov', 'trak', 'mdia', 'mdhd')
check(num(mdhd.body, 12) === 90000, `the media timescale is ${num(mdhd.body, 12)}`)
check(num(mdhd.body, 16) === ticks, 'mdhd duration is what stts adds up to')
const mvhd = find(tree, 'moov', 'mvhd')
check(num(mvhd.body, 16) === Math.round((ticks * 1000) / 90000), `mvhd duration agrees at its own timescale  ${num(mvhd.body, 16)}ms`)
const tkhd = find(tree, 'moov', 'trak', 'tkhd')
check(num(tkhd.body, 76) >> 16 === SIZE.width && num(tkhd.body, 80) >> 16 === SIZE.height, 'tkhd carries the size in 16.16')

// the keyframes
const stss = find(stbl.kids, 'stss')
const keys = table(stss, 1).map((r) => r[0])
const want = FAKE.map((c, i) => (c.type === 'key' ? i + 1 : 0)).filter(Boolean)
check(keys.join(',') === want.join(','), `stss lists the keyframes and only those  ${keys.join(' ')}`)
const stsc = find(stbl.kids, 'stsc')
check(table(stsc, 3).length === 1 && table(stsc, 3)[0].join(',') === '1,1,1', 'stsc says one sample to a chunk')

// the edges
console.log('\nthe edges')
const one = mux([FAKE[0]], { ...SIZE, codecDescription: AVCC })
const alone = walk(one, 0, one.length)
check(alone.map((b) => b.type).join(' ') === 'ftyp moov mdat', 'a film of one frame is still a file')
const soloStbl = find(alone, 'moov', 'trak', 'mdia', 'minf', 'stbl')
check(table(find(soloStbl.kids, 'stco'), 1)[0][0] === alone[2].at + 8, 'the single offset is right too')
check(table(find(soloStbl.kids, 'stts'), 2)[0].join(',') === '1,3000', 'the last sample falls back to the duration it reported')

const noDuration = mux([{ ...FAKE[0], duration: 0 }], { ...SIZE, fps: 25, codecDescription: AVCC })
const noDurStbl = find(walk(noDuration, 0, noDuration.length), 'moov', 'trak', 'mdia', 'minf', 'stbl')
check(table(find(noDurStbl.kids, 'stts'), 2)[0][1] === 3600, 'with no duration reported the last sample falls back to 1/fps')

throws(() => mux([], { ...SIZE, codecDescription: AVCC }), 'muxing nothing is refused')
throws(() => mux(FAKE, SIZE), 'muxing without an avcC description is refused')
throws(() => mux(FAKE, { ...SIZE, width: 0, codecDescription: AVCC }), 'muxing at no size is refused')
throws(() => mux(FAKE.map((c) => ({ ...c, type: 'delta' })), { ...SIZE, codecDescription: AVCC }), 'a film with no keyframe is refused')
throws(
  () => mux([FAKE[0], { ...FAKE[1], timestamp: 0 }, FAKE[2]], { ...SIZE, codecDescription: AVCC }),
  'reordered timestamps are refused rather than mistimed',
)
check(supported() === false, 'supported() says no under plain node, where there is no VideoEncoder')

// the real leg

console.log('\nthe real bytes')
const has = (bin) => spawnSync('which', [bin], { encoding: 'utf8' }).status === 0
const REAL = { width: 320, height: 240, fps: 30, frames: 45 }

/** the payload of every nal in an annexb stream, with start codes and their padding taken off */
function nals(buf) {
  const starts = []
  for (let i = 0; i + 3 <= buf.length; i++)
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      starts.push(i + 3)
      i += 2
    }
  return starts.map((from, k) => {
    let to = k + 1 < starts.length ? starts[k + 1] - 3 : buf.length
    // a four byte start code leaves its extra zero on the tail of the nal before it
    while (to > from && buf[to - 1] === 0) to--
    return buf.subarray(from, to)
  })
}

if (!has('ffmpeg') || !has('ffprobe')) {
  console.log('skip  ffmpeg or ffprobe is not on PATH, so the real bytes leg did not run and the boxes above are the assertion')
} else {
  const raw = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${REAL.width}x${REAL.height}:rate=${REAL.fps}`,
      '-frames:v', String(REAL.frames), '-c:v', 'libx264', '-profile:v', 'baseline', '-g', '15', '-bf', '0',
      '-pix_fmt', 'yuv420p', '-f', 'h264', '-'],
    { maxBuffer: 1 << 28 },
  )
  if (raw.status !== 0) {
    console.log(`skip  ffmpeg is here but would not encode  ${String(raw.stderr).slice(0, 120)}`)
  } else {
    const stream = new Uint8Array(raw.stdout)
    let sps = null
    let pps = null
    const units = []
    for (const nal of nals(stream)) {
      const kind = nal[0] & 0x1f
      if (kind === 7 && !sps) sps = nal
      else if (kind === 8 && !pps) pps = nal
      // a slice whose first bit is set has first_mb_in_slice of zero, which is where a frame begins
      else if (kind === 1 || kind === 5) {
        if (nal[1] & 0x80) units.push({ nals: [], key: kind === 5 })
        units[units.length - 1]?.nals.push(nal)
      } else if (kind === 6 && units.length) units[units.length - 1].nals.push(nal)
    }
    const description = Uint8Array.from([
      1, sps[1], sps[2], sps[3], 0xff, 0xe1,
      sps.length >> 8, sps.length & 255, ...sps,
      1, pps.length >> 8, pps.length & 255, ...pps,
    ])
    // the length prefixed form avcC describes, which is what a browser encoder hands back directly
    const chunks = units.map((u, i) => {
      const size = u.nals.reduce((a, n) => a + n.length + 4, 0)
      const data = new Uint8Array(size)
      let at = 0
      for (const n of u.nals) {
        new DataView(data.buffer).setUint32(at, n.length)
        data.set(n, at + 4)
        at += n.length + 4
      }
      return { data, timestamp: Math.round((i * 1e6) / REAL.fps), duration: Math.round(1e6 / REAL.fps), type: u.key ? 'key' : 'delta' }
    })
    check(chunks.length === REAL.frames, `ffmpeg gave ${chunks.length} access units for ${REAL.frames} frames`)
    check(chunks.filter((c) => c.type === 'key').length >= 2, `and ${chunks.filter((c) => c.type === 'key').length} of them are keyframes`)

    const dir = mkdtempSync(path.join(tmpdir(), 'wall-mp4-'))
    try {
      const real = mux(chunks, { width: REAL.width, height: REAL.height, fps: REAL.fps, codecDescription: description })
      const at = path.join(dir, 'film.mp4')
      writeFileSync(at, real)
      const probe = (file) =>
        spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-count_packets', '-select_streams', 'v', '-show_entries',
          'stream=codec_name,width,height,nb_read_frames,nb_read_packets', '-print_format', 'json', file], { encoding: 'utf8' })
      const said = probe(at)
      let streams = []
      try {
        streams = JSON.parse(said.stdout).streams ?? []
      } catch {}
      check(streams.length === 1, `ffprobe finds exactly one video stream  ${streams.length}`)
      check(streams[0]?.codec_name === 'h264', `and it is ${streams[0]?.codec_name}`)
      check(
        Number(streams[0]?.width) === REAL.width && Number(streams[0]?.height) === REAL.height,
        `at ${streams[0]?.width} by ${streams[0]?.height}`,
      )
      check(Number(streams[0]?.nb_read_packets) === REAL.frames, `carrying ${streams[0]?.nb_read_packets} packets`)
      // decoded, not counted from the index: this is the assertion the black picture cannot pass
      check(Number(streams[0]?.nb_read_frames) === REAL.frames, `and decoding it yields ${streams[0]?.nb_read_frames} pictures`)
      check(!said.stderr.trim(), `the decoder had nothing to complain about  ${said.stderr.trim().split('\n')[0] ?? ''}`)

      /**
       * The same file with one offset moved, which has to fail.
       *
       * Without this the leg above proves only that some file decodes, not that this suite would
       * notice the bug it was written for. Four bytes into the second sample is exactly the shape
       * of an moov that changed length between the two passes.
       */
      const broken = Uint8Array.from(real)
      const brokenStbl = find(walk(broken, 0, broken.length), 'moov', 'trak', 'mdia', 'minf', 'stbl')
      const where = find(brokenStbl.kids, 'stco')
      const field = where.at + where.head + 8 + 4
      new DataView(broken.buffer).setUint32(field, new DataView(broken.buffer).getUint32(field) + 4)
      const bad = path.join(dir, 'broken.mp4')
      writeFileSync(bad, broken)
      const after = probe(bad)
      let brokenStreams = []
      try {
        brokenStreams = JSON.parse(after.stdout).streams ?? []
      } catch {}
      const noticed = Number(brokenStreams[0]?.nb_read_frames) !== REAL.frames || !!after.stderr.trim()
      check(noticed, `moving one offset by four bytes breaks the film, so this leg can see the bug it is for`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

console.log(`\nerrors: ${problems.length ? problems.join('; ') : 'none'}`)
process.exit(problems.length ? 1 : 0)
