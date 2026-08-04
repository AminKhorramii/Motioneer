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
        {/* the model is a whole configuration now, so it is shown and changed in one place */}
        <button className="model" onClick={onModel} title={`writing with ${chosen().label}. click to change.`}>
          {MARKS[chosen().id]?.() ?? <Icon.claude />} {chosen().label}
        </button>
        <input
          className="bar"
          value={bar}
          placeholder="say what to change, for example: name the pain in the headline"
          onChange={(e) => onBar(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRun() }}
        />
        <button className="go" onClick={onRun} disabled={!bar.trim() || busy}>make 3 variants</button>
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
        <button title="open this page in your browser" onClick={onOpen}>full view</button>
        {onSend && (
          <button className="go" title="write this design back for the agent that asked" onClick={onSend}>
            send back
          </button>
        )}
        <button className="go" title="write this page out as one HTML file" onClick={onShip}>
          <Icon.ship /> download
        </button>
      </div>
    </div>
  )
}
