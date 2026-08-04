import { useEffect, useState } from 'react'

/**
 * What you look at while a wall is being made.
 *
 * The first thing on screen used to be the unwritten page: real layout, placeholder words,
 * indistinguishable from a finished result until you read it. A skeleton is the honest version,
 * because it says clearly that nothing has arrived yet, and it holds the shape of the thing
 * that will.
 *
 * The lines change because a wall takes half a minute, and a status that never moves in half a
 * minute reads as a hang rather than as work.
 */

const DESIGNING = [
  'Looking for eight different ways to build this.',
  'Borrowing from receipts, timetables and wall labels.',
  'Deciding what each page should leave out.',
  'Choosing type, measure and how dense to set it.',
  'Writing the CSS for each one.',
]

interface Props {
  /** null while designing, otherwise how many pages have arrived */
  arrived: number | null
  total: number
  /** the worlds that have landed so far, newest last */
  landed: string[]
  model: string
}

export function Building({ arrived, total, landed, model }: Props) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2600)
    return () => clearInterval(t)
  }, [])

  const designing = arrived === null
  const line = designing
    ? DESIGNING[tick % DESIGNING.length]
    : landed.length
      ? `${landed[landed.length - 1]} just landed.`
      : 'Writing the first page.'

  return (
    <div className="building">
      <div className="skel">
        {/* the shape of a page rather than a spinner, so the wait has somewhere to go */}
        <div className="skel-bar w40 tall" />
        <div className="skel-bar w70 tall" />
        <div className="skel-bar w55" />
        <div className="skel-bar w30" />
        <div className="skel-row">
          <span className="skel-pill" />
          <span className="skel-pill ghost" />
        </div>
        <div className="skel-figure" />
      </div>

      <div className="progress">
        <div className="slots">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < (arrived ?? 0) ? 'slot on' : 'slot'} />
          ))}
        </div>
        <p className="line">{line}</p>
        <p className="sub">
          {designing ? `${model} is designing ${total} worlds.` : `${arrived} of ${total} pages written.`}
        </p>
      </div>
    </div>
  )
}
