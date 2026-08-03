import { PROVIDERS, type Provider } from '@/compose'
import { Icon } from '@/icons'
import type { Flag } from '@/slop'

interface Props {
  at: number
  count: number
  angle?: string
  flags: Flag[]
  bar: string
  provider: Provider
  busy: boolean
  onBar: (v: string) => void
  onRun: () => void
  onProvider: (p: Provider) => void
  onGo: (i: number) => void
  onFlags: () => void
  onOpen: () => void
  onShip: () => void
}

export function Dock({ at, count, angle, flags, bar, provider, busy, onBar, onRun, onProvider, onGo, onFlags, onOpen, onShip }: Props) {
  return (
    <>
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
        <button title="previous alternative" onClick={() => onGo(at - 1)} disabled={at === 0}><Icon.left /></button>
        <span>{at + 1} of {count}</span>
        {angle && <span className="angle">{angle}</span>}
        <button title="next alternative" onClick={() => onGo(at + 1)} disabled={at >= count - 1}><Icon.right /></button>
        <span className="tip">scroll sideways to compare. click any text on the paper to edit it.</span>
        <button
          className={flags.length ? 'flags' : 'flags ok'}
          title={flags.length ? flags.map((f) => `${f.label}. ${f.why}`).join('\n') : 'nothing generic found'}
          onClick={onFlags}
        >
          {flags.length ? `${flags.length} generic` : 'clean'}
        </button>
        <button onClick={onOpen}>open in browser</button>
        <button className="go" onClick={onShip}><Icon.ship /> ship this</button>
      </div>
    </>
  )
}
