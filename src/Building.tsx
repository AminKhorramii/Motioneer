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
      ? `${landed[landed.length - 1]}, and ${total - (arrived ?? 0)} still coming.`
      : `${model} is writing the first page.`

  return (
    <div className="building">
      {/* Three marks at the proportions of a page: a headline, a line under it, one action.
          No card and no border, because a container around a placeholder is a second thing to
          look at while there is nothing to look at. */}
      <div className="skel">
        <div className="skel-bar head" />
        <div className="skel-bar sub" />
        <div className="skel-bar act" />
      </div>

      <div className="progress">
        <div className="slots">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < (arrived ?? 0) ? 'slot on' : 'slot'} />
          ))}
        </div>
        <p className="line">{line}</p>
      </div>
    </div>
  )
}
