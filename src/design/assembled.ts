/**
 * Assembled, the house style: nothing fades in, and the real interface is built in front of the
 * viewer, part by part, on time.
 *
 * It is the one thing a video model and a template kit cannot do. A video model invents an
 * interface, and a template moves a screenshot. Motioneer has the product's own DOM, so every row,
 * label, glyph and control can arrive by itself, timed like the machine it borrows from. The verbs
 * are the deck in motion.ts; this file is what holds a film or a motion to them: the numbers, the
 * sound each verb makes, and the guides that show the build.
 *
 * Data only. What measures a stylesheet against these numbers lives in written.ts, and what
 * measures a film's frames lives in the proof.
 */
export const ASSEMBLED = {
  name: 'Assembled',
  promise: 'Nothing fades in. The real interface is built in front of the viewer, part by part, on time.',
  /** one part's movement, the gap between consecutive parts, and a whole component, in milliseconds */
  partMs: [240, 520] as [number, number],
  gapMs: [40, 90] as [number, number],
  componentMs: 1400,
  /** how long a shot stays still and legible at its end: a shot still moving when it cuts was never read */
  holdMs: 600,
  fastHoldMs: 300,
  /** the share of the frame a settled subject fills, below which it reads as a thumbnail */
  fill: 0.45,
  easing: { arrive: 'cubic-bezier(.16,1,.3,1)', leave: 'cubic-bezier(.4,0,1,1)', mechanical: 'steps(n, end)' },
  /** the defaults every generated interface already wears */
  never: ['ease', 'ease-in-out', 'linear'],
}

/**
 * The sound each verb makes when a part lands, as one of the dry action scores. A printer feeds
 * with a tabulator's stepping, a split flap clacks like a relay, type is keystrokes, a stamp is a
 * postmark, a line or a scan resolves like a handshake, two inks in register release, and a part
 * winding against still ones turns like a slowed relay.
 */
export const SOUNDS: Record<string, string> = { print: 'tabulator', flap: 'relay', type: 'keystroke', stamp: 'postmark', draw: 'handshake', scan: 'handshake', register: 'release', wind: 'relay' }

/**
 * The construction guides that open a shot: hairlines on the real boxes of the parts about to
 * land, at most two labels, and every value read from the captured computed style rather than
 * invented, since a measurement that is not the product's is decoration.
 */
export const GUIDES = { stroke: 1, opacity: 0.35, labels: 2, retractMs: 240, values: ['border-radius', 'gap', 'font-size'] }

/** The rules as a director or a motion writer is told them. */
export const ASSEMBLED_RULES = `House style, Assembled: nothing fades in. Build the real interface part by part, in reading order.
- Move the parts, not the whole: rows, labels, glyphs and controls arrive one after another.
- Each part arrives once, the way a real object does, as the verb it was dealt says.
- One part moves for ${ASSEMBLED.partMs[0]} to ${ASSEMBLED.partMs[1]}ms; consecutive parts start ${ASSEMBLED.gapMs[0]} to ${ASSEMBLED.gapMs[1]}ms apart; a component is built within ${ASSEMBLED.componentMs}ms.
- Arrivals end on ${ASSEMBLED.easing.arrive}; anything mechanical uses steps(). Never ${ASSEMBLED.never.join(', ')} on a movement.
- Every part is visible and moving from the first frame; the root never starts hidden or at opacity 0.
- End on a still, legible hold.`
