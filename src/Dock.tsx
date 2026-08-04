import { chosen } from '@/compose'
import { Icon } from '@/icons'
import { MARKS } from '@/models'
import { worldById, type WorldId } from '@/worlds'

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
  onBar: (v: string) => void
  onRun: () => void
  onGo: (i: number) => void
  onModel: () => void
  onWorld: () => void
  /** present only when something asked for this design, which is what makes it the main act */
  onSend?: () => void
  onOpen: () => void
  onShip: () => void
}

export function Dock({
  at, count, angle, world, bar, busy,
  onBar, onRun, onGo, onModel, onWorld, onSend, onOpen, onShip,
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
          <button className="run" onClick={onRun} disabled={busy} aria-label="make three variants"
            title="make three variants of this page">
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
        {/* the left side says what this paper is, and the world doubles as the control for it */}
        {angle && <span className="angle">{angle}</span>}
        <button className="world" title={`${worldById(world).note} click for the next world.`} onClick={onWorld}>
          {worldById(world).name}
        </button>
        <span className="spacer" />
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
