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
 *
 * They used to change on a timer, which meant the page claimed to be writing CSS at the fourth
 * rotation whether or not it was. Now the movement comes from the call itself: the model beats
 * once a second while it thinks, and this shows the beats. A status that invents its own progress
 * is the same lie as a progress bar that fills at a fixed rate, and it is worse here, because the
 * one thing someone waiting a minute needs to know is whether anything is actually happening.
 */

interface Props {
  /** how many of the pages have landed */
  landed: number
  total: number
  /** beats from the model while it thinks, before it has written anything anyone can read */
  thoughts: number
}

export function Building({ landed, total, thoughts }: Props) {
  // the timer still runs, but only to count seconds: nothing on screen moves without a reason
  const [, setTick] = useState(0)
  /**
   * Elapsed seconds, shown rather than hidden.
   *
   * Designing the worlds takes about a minute on its own, and eight pages follow it. A status
   * that changes its wording but never its number reads as a hang, and someone who cannot tell
   * the difference between slow and broken assumes broken.
   */
  const [since] = useState(() => Date.now())
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setTick((v) => v + 1)
      setSecs(Math.round((Date.now() - since) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [since])

  /**
   * One character that turns, and only when something turned it.
   *
   * A spinner on a timer is the same lie as a progress bar that fills at a fixed rate, and this
   * file already refuses that everywhere else. This advances on the model's own beat while it is
   * thinking and on a page landing after that, so a still frame means nothing is happening, which
   * is exactly what somebody waiting a minute needs to be able to tell.
   */
  const SPIN = ['-', '\\', '|', '/']
  const spin = SPIN[(thoughts + landed) % SPIN.length]
  const done = landed >= total

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
            <span key={i} className={i < landed ? 'slot on' : 'slot'} />
          ))}
        </div>
        <p className="elapsed">
          <span className="spin" aria-hidden>{done ? '' : spin}</span>
          <b className="tally">{landed} of {total}</b>
          <span className="what">written</span>
          <span className="secs">{secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`}</span>
        </p>
      </div>
    </div>
  )
}
