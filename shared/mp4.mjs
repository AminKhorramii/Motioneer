/**
 * A film written in the room it was composed in.
 *
 * The studio films by driving a headless chromium to screenshot every frame and then shelling out
 * to ffmpeg, so the two things a person is least likely to have installed are the two things
 * standing between them and a file they can post. Both of them are also the reason the studio can
 * only run on a machine with a filesystem and a package manager, which rules out putting it on a
 * worker. Every browser that can show the motion can already encode it: WebCodecs hands back h264
 * chunks and this turns them into an mp4.
 *
 * The two halves are separated on purpose. encode() needs the browser. mux() is arithmetic over
 * Uint8Array, imports nothing, and runs the same in node and in a tab, which is what lets the suite
 * check it without a browser at all. That split is the point, because the failure this file exists
 * to avoid is not a crash. It is a container that ffprobe reads happily and every player shows as
 * black, which is what a wrong chunk offset looks like from the outside.
 */

/**
 * The media clock, in ticks per second.
 *
 * 90000 divides 24, 25, 30, 50 and 60 exactly, which is why it is the number every mp4 uses. At a
 * timescale of 1000 a frame at 30fps is 33.333 ticks and has to be rounded, and the rounding walks:
 * ten seconds of film ends up a third of a frame away from where it should be, and a rail of
 * options timed against each other is exactly the thing that drift shows up in.
 */
const TIMESCALE = 90000

/** the movie clock, which is only ever read by a player showing a duration, so milliseconds is enough */
const MOVIE_SCALE = 1000

// bytes

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)

const u8 = (...n) => Uint8Array.from(n)

const u16 = (n) => Uint8Array.from([(n >>> 8) & 255, n & 255])

/**
 * Four bytes, or a thrown error rather than a wrapped number.
 *
 * Every field this file gets wrong in a way that survives to a player is an offset, and an offset
 * that overflows silently becomes a small number pointing into the middle of the header. A film
 * over four gigabytes needs the 64 bit boxes (co64, and a largesize mdat) and does not have them
 * here, so it is worth saying so rather than writing a file that opens and plays nothing.
 */
const u32 = (n) => {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff)
    throw new RangeError(`${n} does not fit in the 32 bit field this box uses, so the file would need co64 and a largesize mdat`)
  return Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

/** 16.16 fixed point, which is how a box says a width or a playback rate */
const fixed = (n) => u32(Math.round(n * 65536))

const join = (parts) => {
  let size = 0
  for (const p of parts) size += p.length
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const box = (type, ...parts) => {
  const body = join(parts)
  return join([u32(body.length + 8), ascii(type), body])
}

/** a box with a version and three flag bytes in front of its payload */
const full = (type, version, flags, ...parts) =>
  box(type, u8(version), u8((flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255), ...parts)

const zeros = (n) => new Uint8Array(n)

/** the identity transform, which every track carries and no player here ever changes */
const UNITY = join([fixed(1), u32(0), u32(0), u32(0), fixed(1), u32(0), u32(0), u32(0), u32(0x40000000)])

/** a description arrives as an ArrayBuffer, a view, or already a Uint8Array, depending on the encoder */
const asBytes = (d) => {
  if (!d) return null
  if (d instanceof Uint8Array) return d
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
  if (d instanceof ArrayBuffer) return new Uint8Array(d)
  return null
}

// the container

/**
 * How long each sample is on screen, in media ticks.
 *
 * Taken from the timestamps rather than from the frame rate, because a rasterizer that stalls on
 * one frame produces a film with a gap in it and asserting 1/fps over the top of that gap silently
 * speeds the rest of the motion up. The last sample is the only one with nothing after it to
 * measure against, so it uses the duration the encoder reported and falls back to 1/fps.
 *
 * Timestamps going backwards means the encoder reordered frames, which needs a ctts box to say by
 * how much, and there is no ctts here. Baseline h264 cannot reorder, which is why encode() asks for
 * baseline first, so this is a thing worth naming rather than quietly mistiming.
 */
function spans(chunks, fps) {
  const at = chunks.map((c) => Math.round(((Number(c.timestamp) || 0) * TIMESCALE) / 1e6))
  const step = Math.max(1, Math.round(TIMESCALE / (Number(fps) || 30)))
  return at.map((t, i) => {
    if (i + 1 === at.length) {
      const said = Math.round(((Number(chunks[i].duration) || 0) * TIMESCALE) / 1e6)
      return said > 0 ? said : step
    }
    const span = at[i + 1] - t
    if (span <= 0)
      throw new Error(
        `sample ${i + 1} is timestamped at or after sample ${i + 2}, so the encoder reordered frames and the file would need a ctts box; encode with a baseline codec`,
      )
    return span
  })
}

/** consecutive samples of the same length collapse into one entry, which is most of them */
function runs(durations) {
  const out = []
  for (const d of durations) {
    const last = out[out.length - 1]
    if (last && last[1] === d) last[0] += 1
    else out.push([1, d])
  }
  return out
}

/**
 * One h264 track, written whole.
 *
 * chunks are exactly what WebCodecs produces, copied out: {data, timestamp in microseconds,
 * duration, type of 'key' or 'delta'}. codecDescription is metadata.decoderConfig.description, the
 * avcC bytes, which carry the sps and pps and without which nothing can decode a frame.
 *
 * moov goes before mdat. These files get downloaded and posted, and a player streaming one with the
 * index at the end has to fetch the whole thing before it can show the first frame.
 *
 * Which means the chunk offsets have to be known before the offsets exist. moov is built twice: once
 * with zeros only to learn its length, then again with the real numbers. Every offset field is a
 * fixed four bytes, so the second pass cannot change the length, and the assertion below says so out
 * loud because an moov that moved is a file where every sample offset is wrong by the same amount
 * and the only symptom is a black picture.
 */
export function mux(chunks, { width, height, fps = 30, codecDescription } = {}) {
  const list = Array.from(chunks ?? [])
  if (!list.length) throw new Error('mux needs at least one encoded chunk, and was given none')
  const avcc = asBytes(codecDescription)
  if (!avcc || avcc.length < 7)
    throw new Error(
      'mux needs the avcC bytes from metadata.decoderConfig.description; an encoder configured for annexb never produces them, so configure it with avc: { format: "avc" }',
    )
  const w = Math.round(Number(width) || 0)
  const h = Math.round(Number(height) || 0)
  if (w <= 0 || h <= 0 || w > 65535 || h > 65535) throw new Error(`${width} by ${height} is not a size a track can carry`)

  const data = list.map((c, i) => {
    const bytes = asBytes(c?.data)
    if (!bytes) throw new Error(`chunk ${i + 1} has no data`)
    return bytes
  })
  const sizes = data.map((d) => d.length)
  const durations = spans(list, fps)
  const ticks = durations.reduce((a, b) => a + b, 0)
  const keys = []
  list.forEach((c, i) => {
    // a chunk with no type at all is treated as a delta, because guessing key would tell a player
    // it can seek to a frame that has no picture in it
    if (c?.type === 'key') keys.push(i + 1)
  })
  if (!keys.length)
    throw new Error('none of the chunks is a keyframe, so nothing in the film can be decoded from the start')

  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'))

  /**
   * The picture description.
   *
   * The 78 bytes before avcC are the visual sample entry, and almost all of them are fixed by the
   * format: six reserved, the data reference index, sixteen bytes no reader looks at, the size, two
   * resolutions of 72dpi, a frame count of one, a 32 byte compressor name whose first byte is its
   * length, a depth of 24 and a trailing -1.
   */
  const avc1 = box(
    'avc1',
    zeros(6),
    u16(1),
    zeros(16),
    u16(w),
    u16(h),
    fixed(72),
    fixed(72),
    u32(0),
    u16(1),
    join([u8(0), zeros(31)]),
    u16(0x0018),
    u16(0xffff),
    box('avcC', avcc),
  )

  const timing = runs(durations)
  const stbl = (offsets) =>
    box(
      'stbl',
      full('stsd', 0, 0, u32(1), avc1),
      full('stts', 0, 0, u32(timing.length), ...timing.flatMap(([n, d]) => [u32(n), u32(d)])),
      full('stss', 0, 0, u32(keys.length), ...keys.map(u32)),
      // one sample to a chunk, so a chunk offset is a sample offset and there is nothing to add up
      full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      full('stsz', 0, 0, u32(0), u32(sizes.length), ...sizes.map(u32)),
      full('stco', 0, 0, u32(offsets.length), ...offsets.map(u32)),
    )

  const moovOf = (offsets) =>
    box(
      'moov',
      full('mvhd', 0, 0, u32(0), u32(0), u32(MOVIE_SCALE), u32(Math.round((ticks * MOVIE_SCALE) / TIMESCALE)),
        fixed(1), u16(0x0100), zeros(2), zeros(8), UNITY, zeros(24), u32(2)),
      box(
        'trak',
        // enabled, in the movie, in the preview: the three flags a track needs to be played at all
        full('tkhd', 0, 7, u32(0), u32(0), u32(1), u32(0), u32(Math.round((ticks * MOVIE_SCALE) / TIMESCALE)),
          zeros(8), u16(0), u16(0), u16(0), zeros(2), UNITY, fixed(w), fixed(h)),
        box(
          'mdia',
          // 0x55c4 is 'und' packed five bits to a letter, which is what a track with no spoken language says
          full('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(ticks), u16(0x55c4), u16(0)),
          full('hdlr', 0, 0, u32(0), ascii('vide'), zeros(12), ascii('VideoHandler'), u8(0)),
          box(
            'minf',
            full('vmhd', 0, 1, u16(0), zeros(6)),
            // the one url entry with its self contained flag set, meaning the media is in this file
            box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
            stbl(offsets),
          ),
        ),
      ),
    )

  const probe = moovOf(sizes.map(() => 0))
  const start = ftyp.length + probe.length + 8
  let at = start
  const offsets = sizes.map((s) => {
    const here = at
    at += s
    return here
  })
  const moov = moovOf(offsets)
  if (moov.length !== probe.length)
    throw new Error('the moov box changed length once the real chunk offsets went in, so every offset in it is wrong')

  return join([ftyp, moov, u32(at - start + 8), ascii('mdat'), ...data])
}

// the encoder

/** whether this environment can encode at all, which is the browser question and not the mux one */
export function supported() {
  return typeof globalThis.VideoEncoder !== 'undefined' && typeof globalThis.VideoFrame !== 'undefined'
}

/**
 * Baseline first, and the others only if it is refused.
 *
 * Baseline 3.1 is the profile that plays everywhere, including the places a film gets posted to, and
 * it cannot reorder frames, which is what lets the muxer above skip the ctts box. Main and high are
 * fallbacks for hardware that will not do baseline, and are listed in the order that costs the least
 * compatibility.
 */
const CODECS = ['avc1.42E01F', 'avc1.4D401F', 'avc1.640028']

/** how far the encoder may fall behind before frames stop being handed to it */
const QUEUE = 8

async function chooseCodec(want) {
  const refused = []
  for (const codec of CODECS) {
    try {
      const said = await globalThis.VideoEncoder.isConfigSupported({ ...want, codec })
      if (said?.supported) return said.config ?? { ...want, codec }
      refused.push(codec)
    } catch (e) {
      refused.push(`${codec} (${String(e?.message ?? e).slice(0, 60)})`)
    }
  }
  throw new Error(`this browser encodes none of ${refused.join(', ')} at ${want.width} by ${want.height}`)
}

/**
 * Film a sequence of frames into an mp4.
 *
 * frames may be an array or an async iterable, and each one may be a VideoFrame or a canvas. The
 * canvas case is the one that matters: the half of this that rasterizes the dom draws into a canvas
 * and would otherwise have to know how to stamp a frame with a time.
 *
 * The clock comes from the index and not from the frame, on purpose. The studio steps its own clock
 * to take each frame, so frame n is at n/fps by construction, and trusting whatever timestamp a
 * frame arrives with means a rasterizer that took 80ms on one frame writes that stall into the film.
 *
 * Every frame handed in is closed, including the ones this wraps. A VideoFrame holds a hardware
 * buffer, there is a small fixed number of them, and a loop that leaks a few hundred stops the
 * encoder dead with no error worth reading.
 */
export async function encode(frames, { width, height, fps = 30, bitrate, onProgress } = {}) {
  if (!supported())
    throw new Error(
      'this browser has no VideoEncoder, so it cannot film: WebCodecs needs Chrome or Edge 94, Safari 16.4, or Firefox 130',
    )
  if (!frames || (typeof frames[Symbol.iterator] !== 'function' && typeof frames[Symbol.asyncIterator] !== 'function'))
    throw new TypeError('encode needs an array or an iterable of frames')

  // asked before rounding, because a missing width rounds to zero and then clamps to a legal two,
  // and a two pixel film is a worse answer than a sentence saying what was left out
  if (!(Number(width) >= 2) || !(Number(height) >= 2))
    throw new Error(`encode needs a width and a height of at least two pixels, and was given ${width} by ${height}`)
  // h264 is 4:2:0, so a chroma plane is half the width and half the height and an odd size has no
  // middle. Rounding down loses at most one row and one column, which nobody sees, and refusing to
  // encode is a worse answer to a canvas that happens to be 1281 wide.
  const w = Math.floor(Number(width) / 2) * 2
  const h = Math.floor(Number(height) / 2) * 2

  const rate = Number(fps) || 30
  // a tenth of a bit per pixel per frame, which is about 2.8Mbps at 720p30. Page motion is flat
  // colour over large areas and compresses far better than camera footage, and the crossfades and
  // blurs that do cost something are short.
  const bits = Math.round(Number(bitrate) || Math.min(20e6, w * h * rate * 0.1))
  /**
   * The format is 'avc' and not 'avcc'.
   *
   * The box is called avcC and the description this asks for is the avcC bytes, so 'avcc' is the
   * word everyone reaches for and it is not in the enum. Chrome does not ignore it or fall back:
   * isConfigSupported throws before it has looked at the codec at all, which reads as "this browser
   * cannot encode h264" rather than as a typo. Measured in chromium 142: "The provided value 'avcc'
   * is not a valid enum value of type AvcBitstreamFormat." The two values are annexb and avc.
   */
  const config = await chooseCodec({ width: w, height: h, framerate: rate, bitrate: bits, avc: { format: 'avc' } })

  const every = Math.max(1, Math.round(rate * 2))
  const step = Math.round(1e6 / rate)
  const total = Number.isInteger(frames?.length) ? frames.length : null

  const out = []
  let description = null
  let failed = null

  const encoder = new globalThis.VideoEncoder({
    output: (chunk, metadata) => {
      // The description arrives once, on the first chunk, and only when the encoder was asked for
      // avcc. Later chunks carry no metadata at all, so it is kept the first time it is seen.
      const said = asBytes(metadata?.decoderConfig?.description)
      if (said && !description) description = said.slice()
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      out.push({ data, timestamp: chunk.timestamp, duration: chunk.duration ?? step, type: chunk.type })
    },
    error: (e) => {
      failed = e instanceof Error ? e : new Error(String(e?.message ?? e))
    },
  })

  try {
    encoder.configure(config)
    let n = 0
    for await (const source of frames) {
      if (failed) throw failed
      if (!source) continue
      const at = Math.round((n * 1e6) / rate)
      // the same constructor takes a canvas and takes a frame, which is what lets both kinds in
      // without asking the caller which one it has
      const frame = new globalThis.VideoFrame(source, { timestamp: at, duration: step })
      try {
        encoder.encode(frame, { keyFrame: n % every === 0 })
      } finally {
        frame.close()
        // a canvas has nothing to release, a VideoFrame does, and the caller handed this one over
        if (typeof source.close === 'function') source.close()
      }
      n += 1
      onProgress?.(n, total)
      // Handing frames in faster than they encode holds every one of them in memory at once. A
      // three second film at 720p is a hundred megabytes of raw frames, and the tab that dies is the
      // one the person was watching.
      while (!failed && encoder.encodeQueueSize > QUEUE) {
        await Promise.race([
          new Promise((go) => encoder.addEventListener?.('dequeue', go, { once: true })),
          new Promise((go) => setTimeout(go, 50)),
        ])
      }
    }
    if (!n) throw new Error('there were no frames to film')
    await encoder.flush()
    if (failed) throw failed
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }

  if (!description)
    throw new Error('the encoder produced no avcC description, so the codec string it accepted was not an avc one')
  return mux(out, { width: w, height: h, fps: rate, codecDescription: description })
}
