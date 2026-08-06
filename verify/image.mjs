/**
 * The image pipeline, verified without a browser and without Rust installed.
 *
 * It reads the committed wasm rather than the crate's build output, because that is what ships
 * and what a fresh clone has. The input is built here with zlib rather than loaded from a
 * fixture, so the suite has nothing to keep in sync and no binary to explain.
 *
 * Run: node verify/image.mjs
 */

import { deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

let failed = 0
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`)
  if (!cond) failed++
}

// ——— a PNG to feed it, detailed rather than smooth so it compresses like real generated art ———

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, body) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0)
  return Buffer.concat([head, body, crc])
}

/**
 * Something shaped like generated art rather than like static: low frequency colour fields with
 * fine grain over them. Pure noise would be the one input JPEG cannot compress and no model
 * produces, so a suite built on it would measure the worst case and report it as the normal one.
 */
function noisyPng(w, h, grain = 10) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  let seed = 0x5eed >>> 0
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed >>> 24) & 0xff
  }
  const raw = Buffer.alloc(h * (1 + w * 3))
  let i = 0
  for (let y = 0; y < h; y++) {
    raw[i++] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const u = x / w
      const v = y / h
      const field = [
        128 + 90 * Math.sin(u * 5.1 + v * 2.3),
        120 + 80 * Math.sin(u * 2.7 - v * 4.1 + 1.4),
        140 + 70 * Math.sin(u * 3.3 + v * 6.2 + 2.6),
      ]
      for (const c of field) {
        raw[i++] = Math.max(0, Math.min(255, Math.round(c + ((next() / 255) * 2 - 1) * grain)))
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Read a JPEG's real dimensions out of its frame header, so the resize is checked rather than assumed. */
function jpegSize(buf) {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  return null
}

// ——— the pipeline, loaded the way the app loads it ———

const source = readFileSync(new URL('../src/imagewasm.ts', import.meta.url), 'utf8')
const b64 = [...source.matchAll(/^\s*'([A-Za-z0-9+/=]+)',$/gm)].map((m) => m[1]).join('')
ok(b64.length > 1000, 'the committed wasm is present', `${b64.length.toLocaleString()} base64 chars`)

const bytes = Buffer.from(b64, 'base64')
const { instance } = await WebAssembly.instantiate(bytes, {})
const { memory, alloc, dealloc, shrink } = instance.exports
ok(typeof shrink === 'function', 'the module exports the pipeline')

function run(input, maxEdge = 1400, quality = 82, bg = 0x0c0d10) {
  const ptr = alloc(input.length)
  new Uint8Array(memory.buffer, ptr, input.length).set(input)
  const out = shrink(ptr, input.length, maxEdge, quality, bg)
  const len = new DataView(memory.buffer).getUint32(out, true)
  const body = Buffer.from(new Uint8Array(memory.buffer, out + 4, len))
  dealloc(out, 4 + len)
  return body
}

// ——— what it has to do ———

const src = noisyPng(2400, 1200)
const t0 = process.hrtime.bigint()
const out = run(src)
const ms = Number(process.hrtime.bigint() - t0) / 1e6

ok(out.length > 0, 'a large png comes back as something')
ok(out[0] === 0xff && out[1] === 0xd8, 'the reply is a jpeg')

const dims = jpegSize(out)
ok(dims?.w === 1400 && dims?.h === 700, 'it fits the long edge and keeps the aspect', JSON.stringify(dims))

const saving = 1 - out.length / src.length
ok(
  saving > 0.8,
  'it saves most of the bytes',
  `${(src.length / 1024).toFixed(0)}KB to ${(out.length / 1024).toFixed(0)}KB, ${(saving * 100).toFixed(1)}% off in ${ms.toFixed(0)}ms`,
)

const small = noisyPng(320, 200)
const kept = run(small)
ok(jpegSize(kept)?.w === 320, 'a small image is never enlarged', `${jpegSize(kept)?.w}px`)

const junk = run(Buffer.from('not an image at all'))
ok(junk.length === 0, 'undecodable input reports nothing rather than throwing')

// the page keeps a megabyte per image today, so the number that matters is what one costs now
const perImage = out.length
ok(perImage < 250_000, 'one image now costs a quarter megabyte at most', `${(perImage / 1024).toFixed(0)}KB`)

console.log(failed ? `\n${failed} failed` : '\nall good')
process.exit(failed ? 1 : 0)
