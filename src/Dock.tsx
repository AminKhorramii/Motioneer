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
        <div className="nav">
          <button title="previous alternative, or press the left arrow key"
            onClick={() => onGo(at - 1)} disabled={at === 0}><Icon.left /></button>
          <span className="count"><b>{at + 1}</b> of {count}</span>
          <button title="next alternative, or press the right arrow key"
            onClick={() => onGo(at + 1)} disabled={at >= count - 1}><Icon.right /></button>
        </div>
        {/* triage sits beside the counter because narrowing is done while counting through */}
        <button aria-label="remove this page"
          title="take this page off the wall, or press x. z brings the last removed one back."
          onClick={onKill}><Icon.x /></button>
        {/* the left side says what this paper is. The pin and the world used to sit here too and
            were the two things in the bar that named a state rather than doing something, so they
            are keys now: p pins, w moves the page to the next world. */}
        {angle && <span className="angle">{angle}</span>}
        {/* a badge rather than a control: it says what this page is built in, which is the one
            thing you need before handing it back, and the brief carries the same name */}
        {/* A written page borrows a world for its tokens and its faces and is not built in it, so
            naming that world here was naming the wrong thing: a page drawn as a record sleeve
            reported itself as Material 3, which is the one label a reader would act on. It says
            what it made instead, which is what the model called it. */}
        <span className="angle library" title={written?.note ?? worldById(world).note}>
          {written?.note || worldById(world).library || worldById(world).name}
        </span>
        <span className="spacer" />
        {/* the verdict sits beside ship, because it is the last thing worth checking before a
            page goes out, and the reasons ride in the tooltip rather than taking a panel */}
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
    </div>
  )
}
