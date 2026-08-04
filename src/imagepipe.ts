/**
 * The image pipeline, as the app sees it.
 *
 * A generated image arrives as a PNG data URL of about a megabyte and goes into the page
 * content, where it ships with the file. That is the one thing in a Wall page that is not
 * measured in kilobytes, so it is the one thing worth compressing.
 *
 * The work is `crates/wall-image`, compiled to wasm and inlined. It is the same binary in the
 * desktop app, the web build and a served deployment, so there is no per shell implementation
 * to keep in agreement. Canvas could resize, but it cannot control JPEG quality properly, and
 * it decodes and re-encodes through the compositor rather than in one pass.
 *
 * Everything here fails soft. An image that cannot be decoded, or a wasm that cannot be
 * instantiated, returns the original untouched, because a slightly large picture on the page is
 * a better outcome than no picture at all.
 */

import { WASM_BASE64 } from '@/imagewasm'

interface Pipe {
  memory: WebAssembly.Memory
  alloc: (len: number) => number
  dealloc: (ptr: number, len: number) => void
  shrink: (ptr: number, len: number, maxEdge: number, quality: number, bg: number) => number
}

let pipe: Promise<Pipe | null> | null = null

const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** One instance for the life of the app. Instantiating is milliseconds, but it is not free. */
function load(): Promise<Pipe | null> {
  pipe ??= WebAssembly.instantiate(bytesOf(WASM_BASE64) as unknown as BufferSource, {})
    .then((w) => w.instance.exports as unknown as Pipe)
    .catch(() => null)
  return pipe
}

export interface Shrunk {
  dataUrl: string
  before: number
  after: number
}

const dataUrlBytes = (url: string) => {
  const comma = url.indexOf(',')
  return comma < 0 ? new Uint8Array() : bytesOf(url.slice(comma + 1))
}

/** "#0c0d10" as the 0x0c0d10 the crate flattens transparency onto. */
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  return Number.isFinite(n) ? n : 0
}

/**
 * Fit to `maxEdge` and re-encode as JPEG.
 *
 * 1400 is the default because a page renders at 1280 wide and a figure is never the full
 * width of it, so anything larger is detail no reader can resolve. Quality 82 is where a
 * generated illustration stops losing anything visible on the second look.
 */
export async function shrinkDataUrl(
  dataUrl: string,
  { maxEdge = 1400, quality = 82, background = '#000000' } = {},
): Promise<Shrunk> {
  const before = dataUrlBytes(dataUrl).length
  const w = await load()
  if (!w || !before) return { dataUrl, before, after: before }

  const input = dataUrlBytes(dataUrl)
  const ptr = w.alloc(input.length)
  new Uint8Array(w.memory.buffer, ptr, input.length).set(input)

  // shrink takes ownership of the input, so only the reply is ours to free
  const out = w.shrink(ptr, input.length, maxEdge, quality, rgb(background))
  const len = new DataView(w.memory.buffer).getUint32(out, true)
  if (!len) {
    w.dealloc(out, 4)
    return { dataUrl, before, after: before }
  }
  const body = new Uint8Array(w.memory.buffer, out + 4, len).slice()
  w.dealloc(out, 4 + len)

  // a re-encode that grew is a re-encode worth discarding, which happens with flat art that
  // PNG already stores better than JPEG can
  if (body.length >= before) return { dataUrl, before, after: before }

  let bin = ''
  for (let i = 0; i < body.length; i += 0x8000) {
    bin += String.fromCharCode(...body.subarray(i, i + 0x8000))
  }
  return { dataUrl: `data:image/jpeg;base64,${btoa(bin)}`, before, after: body.length }
}
