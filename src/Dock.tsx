import { PROVIDERS, type Provider } from '@/compose'
import { Icon } from '@/icons'
import type { Flag } from '@/slop'
import { BACKDROP_NOTE, type Backdrop } from '@/backdrop'
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
  flags: Flag[]
  backdrop: Backdrop
  world?: WorldId
  bar: string
  provider: Provider
  busy: boolean
  onBar: (v: string) => void
  onRun: () => void
  onProvider: (p: Provider) => void
  onGo: (i: number) => void
  onFlags: () => void
  onBackdrop: () => void
  onWorld: () => void
  onOpen: () => void
  onShip: () => void
}

export function Dock({
  at, count, angle, flags, backdrop, world, bar, provider, busy,
  onBar, onRun, onProvider, onGo, onFlags, onBackdrop, onWorld, onOpen, onShip,
}: Props) {
  return (
    <div className="dock">
      <div className="barwrap">
        <div className="models">
          {PROVIDERS.map((p) => (
            <button key={p.id} className={provider === p.id ? 'on' : ''} onClick={() => onProvider(p.id)}
              title={`write with ${p.label}`}>
              {p.id === 'claude' ? <Icon.claude /> : <Icon.gpt />} {p.label}
            </button>
          ))}
        </div>
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
        <button title={`backdrop: ${BACKDROP_NOTE[backdrop]}. click for the next one.`} onClick={onBackdrop}>
          {backdrop === 'none' ? 'no backdrop' : backdrop}
        </button>
        <button
          className={flags.length ? 'flags' : 'flags ok'}
          title={flags.length ? flags.map((f) => `${f.label}. ${f.why}`).join('\n') : 'nothing generic found'}
          onClick={onFlags}
        >
          {flags.length ? `${flags.length} generic` : 'clean'}
        </button>
        <button title="open this page in your browser" onClick={onOpen}>open</button>
        <button className="go" title="write this page out as one HTML file" onClick={onShip}>
          <Icon.ship /> ship
        </button>
      </div>
    </div>
  )
}
