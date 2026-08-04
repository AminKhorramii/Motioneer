/**
 * Draw the source icon, then let the Tauri CLI cut every size from it.
 *
 * It is generated rather than committed as a binary because the mark is the app's own geometry:
 * the paper in the middle at full light, its neighbours dimmed and scaled, which is exactly what
 * the studio shows. If the studio's geometry changes, this changes with it rather than drifting
 * into a picture of an older app.
 *
 * Run: node src-tauri/icon.mjs && npx tauri icon src-tauri/icon-source.png
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const S = 1024
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'icon-source.png')

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

const px = Buffer.alloc(S * S * 4)
const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  const over = (c, back) => Math.round((c * a + back * (255 - a)) / 255)
  px[i] = over(r, px[i])
  px[i + 1] = over(g, px[i + 1])
  px[i + 2] = over(b, px[i + 2])
  px[i + 3] = Math.max(px[i + 3], a)
}

/** the macOS squircle, near enough at this size, so the mark is not a square in a rounded world */
const radius = S * 0.22
const inside = (x, y) => {
  const cx = Math.min(Math.max(x, radius), S - radius)
  const cy = Math.min(Math.max(y, radius), S - radius)
  return Math.hypot(x - cx, y - cy) <= radius
}

// the chrome's own background, so the icon and the window agree
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) if (inside(x, y)) set(x, y, 0x0a, 0x0b, 0x0d)
}

/**
 * Three papers: the one in the middle at full light and full height, its neighbours dimmed and
 * shorter. Same relationship the studio draws, which is 1 and 0.32 opacity at 1 and 0.85 scale.
 */
const paper = (cx, w, h, ink) => {
  const x0 = Math.round(cx - w / 2)
  const y0 = Math.round((S - h) / 2)
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) if (inside(x, y)) set(x, y, ink, ink, ink)
  }
}

const mid = S / 2
const w = S * 0.2
const h = S * 0.5
paper(mid - w * 1.45, w * 0.85, h * 0.85, 0x4a)
paper(mid + w * 1.45, w * 0.85, h * 0.85, 0x4a)
paper(mid, w, h, 0xec)

const raw = Buffer.alloc(S * (1 + S * 4))
for (let y = 0; y < S; y++) {
  raw[y * (1 + S * 4)] = 0 // filter: none
  px.copy(raw, y * (1 + S * 4) + 1, y * S * 4, (y + 1) * S * 4)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8
ihdr[9] = 6 // truecolour with alpha

writeFileSync(
  OUT,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
)

console.log(`wrote ${path.basename(OUT)}, ${S}x${S}`)
