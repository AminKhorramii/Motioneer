import { chosen } from '@/compose'
import { Icon } from '@/icons'
import { worldById, type WorldId } from '@/worlds'
import { MARKS } from '@/models'
import type { Flag } from '@/slop'

/**
 * The dock: what you ask for on top, where you are underneath.
 *
 * Everything here acts on the paper in the middle, which is why it is one panel rather than a
 * toolbar per concern. Secondary actions carry their explanation in a title rather than a
 * label, because a row of sentences competes with the page you are trying to read.
 */

interface Props {
  at: number
  count: number
  angle?: string
  world?: WorldId
  bar: string
  busy: boolean
  /** set when the model wrote this page whole, so the badge can say what it made */
  written?: { note: string }
  /** what the slop detector found on this page, so the verdict travels with the paper */
  flags: Flag[]
  onBar: (v: string) => void
  onRun: () => void
  onGo: (i: number) => void
  onModel: () => void
  onKill: () => void
  /** present only when something asked for this design, which is what makes it the main act */
  onSend?: () => void
  onOpen: () => void
  onShip: () => void
}

export function Dock({
  at, count, angle, world, bar, busy, flags, written,
  onBar, onRun, onGo, onModel, onKill, onSend, onOpen, onShip,
}: Props) {
  return (
    <div className="dock">
      <div className="barwrap">
        {/* the mark alone: the name is in the tooltip, and a row of words competes with the page */}
        <button className="model" onClick={onModel} aria-label={`writing with ${chosen().label}`}
          title={`writing with ${chosen().label}. click to change.`}>
          {MARKS[chosen().id]?.() ?? <Icon.claude />}
        </button>
        <input
          className="bar"
          value={bar}
          placeholder="say what to change, for example: name the pain in the headline"
          onChange={(e) => onBar(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRun() }}
        />
        {/* the return key already does this, so the button is the same key drawn small: it
            appears only when there is something to ask for, and says the rest in its tooltip */}
        {bar.trim() && (
          <button className="run" onClick={onRun} disabled={busy} aria-label="rewrite this page"
            title="rewrite this page and keep the one you have">
            <Icon.enter />
          </button>
        )}
      </div>

      <div className="filmbar">
        {/* Everything that acts on this paper, in one cluster.
            These used to be spread across the bar with the identity and the counter between them,
            so the row read as eight unrelated things and the one that matters was last. Grouped,
            the bar is three clusters rather than nine controls: what you can do, what this is, and
            where you are. */}
        <div className="acts">
          <button aria-label="remove this page"
            title="take this page off the wall, or press x. z brings the last removed one back."
            onClick={onKill}><Icon.x /></button>
          <button className="icon" aria-label="full view" title="open this page in your browser"
            onClick={onOpen}><Icon.open /></button>
          <button className={onSend ? 'icon' : 'go'} aria-label="download"
            title="write this page out as one HTML file" onClick={onShip}>
            <Icon.down />{onSend ? '' : ' download'}
          </button>
          {/* when something asked for this design, handing it back is the whole point of being
              here, so it is the one thing wearing a name */}
          {onSend && (
            <button className="go send" title="hand this design back to the agent that asked"
              onClick={onSend}>
              {MARKS['claude-code']?.() ?? <Icon.claude />} to Claude
            </button>
          )}
        </div>

        {/* What this paper is, in one label rather than two chips. A written page says what the
            model made; an arranged one says the world it is built in, which is the same question
            answered by whichever half designed it. */}
        <span className="angle" title={written?.note ?? worldById(world).note}>
          {[angle, written?.note || worldById(world).library || worldById(world).name]
            .filter(Boolean)
            .join(' · ')}
        </span>

        <span className="spacer" />

        {/* the verdict sits with the identity rather than with the actions, because it describes
            the page rather than doing anything to it, and the reasons ride in the tooltip */}
        <span className={flags.length ? 'flags' : 'flags ok'}
          title={flags.length
            ? flags.map((f) => `${f.kind}: ${f.label}. ${f.why}`).join('\n')
            : 'none of the catalogued generic patterns'}>
          {/* design and copy counted apart, because they are fixed by different things: one is
              the world this page is built in and the other is the words on it */}
          {flags.length
            ? [
                flags.filter((f) => f.kind === 'design').length && `${flags.filter((f) => f.kind === 'design').length} design`,
                flags.filter((f) => f.kind === 'copy').length && `${flags.filter((f) => f.kind === 'copy').length} copy`,
              ].filter(Boolean).join(', ')
            : 'clean'}
        </span>

        <div className="nav">
          <button title="previous alternative, or press the left arrow key"
            onClick={() => onGo(at - 1)} disabled={at === 0}><Icon.left /></button>
          <span className="count"><b>{at + 1}</b> of {count}</span>
          <button title="next alternative, or press the right arrow key"
            onClick={() => onGo(at + 1)} disabled={at >= count - 1}><Icon.right /></button>
        </div>
      </div>
    </div>
  )
}
