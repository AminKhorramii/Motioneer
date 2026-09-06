import { useEffect, useRef } from 'react'
/**
 * The empty room, which is the one piece of motion the studio writes itself: a field of dots lit by
 * two sine waves folded into each other, ported from the previous studio's waiting state. A tool
 * about motion showing a sentence in a large empty room is the wrong advertisement. Only opacity
 * changes per frame, and the loop stops when the element leaves the page or motion is reduced.
 */
const COLS = 64, ROWS = 16
export function Field() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = host.current; if (!node) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cells: HTMLElement[] = []
    for (let i = 0; i < COLS * ROWS; i++) { const c = document.createElement('i'); c.textContent = '·'; node.appendChild(c); cells.push(c); if (i % COLS === COLS - 1) node.appendChild(document.createElement('br')) }
    let t = 0, frame = 0
    const tick = () => {
      t += 0.055
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const q = Math.sin(x * 0.13 + t * 0.9) + Math.cos(y * 0.21 - t * 0.6)
        const r = Math.sin((x * 0.07 + y * 0.11) + q * 0.8 + t * 0.5)
        const v = Math.sin(x * 0.05 - y * 0.08 + r * 1.6 + t * 0.35)
        let a = (v + 1) / 2; a = a * a * (3 - 2 * a); a = a * a * a
        const dx = (x / COLS - 0.5) * 2.05, dy = (y / ROWS - 0.5) * 2.05, d = Math.sqrt(dx * dx + dy * dy)
        let m = 1 - Math.min(1, Math.max(0, (d - 0.25) / 0.85)); m = m * m * (3 - 2 * m)
        cells[y * COLS + x].style.opacity = (a * m).toFixed(3)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); node.replaceChildren() }
  }, [])
  return <div className="wait"><div className="dotfield" ref={host} aria-hidden="true"/></div>
}
