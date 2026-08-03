import { KIND_LABEL, KIND_VARIANTS, type Kind, type Page } from '@/sections'
import { Icon } from '@/icons'
import type { Provider } from '@/compose'

const ALL_KINDS: Kind[] = ['hero', 'logos', 'features', 'showcase', 'quote', 'pricing', 'faq', 'cta', 'footer']

interface Props {
  page: Page
  selected: string | null
  prompts: Record<string, string>
  provider: Provider
  onSelect: (id: string) => void
  onCycle: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onToggle: (id: string) => void
  onPromptChange: (id: string, value: string) => void
  onPromptRun: (id: string) => void
  onFanOut: (id: string) => void
  onCopyBrief: (id: string) => void
  onDraw: (id: string) => void
  onAdd: (kind: Kind) => void
}

export function SectionsRail({
  page, selected, prompts, provider,
  onSelect, onCycle, onMove, onToggle, onPromptChange, onPromptRun, onFanOut, onCopyBrief, onDraw, onAdd,
}: Props) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <aside className="sections">
      <h3>sections</h3>
      {page.sections.map((s, i) => (
        <div key={s.id} className={`sec ${selected === s.id ? 'sel' : ''} ${s.on ? '' : 'off'}`} onClick={() => onSelect(s.id)}>
          <div className="secline">
            <b>{KIND_LABEL[s.kind]}</b>
            <span className="vname">{KIND_VARIANTS[s.kind][s.variant]}</span>
            <button title="try the next layout" onClick={(e) => { stop(e); onCycle(s.id) }}><Icon.cycle /></button>
            <button title="move up" disabled={i === 0} onClick={(e) => { stop(e); onMove(s.id, -1) }}><Icon.up /></button>
            <button title="move down" disabled={i === page.sections.length - 1} onClick={(e) => { stop(e); onMove(s.id, 1) }}><Icon.down /></button>
            <button title={s.on ? 'hide this section' : 'show this section'} onClick={(e) => { stop(e); onToggle(s.id) }}>
              {s.on ? <Icon.shown /> : <Icon.hidden />}
            </button>
          </div>
          {selected === s.id && (
            <div className="secbody">
              <div className="prow">
                <input
                  placeholder={`say what this ${KIND_LABEL[s.kind]} should say`}
                  value={prompts[s.id] ?? ''}
                  onChange={(e) => onPromptChange(s.id, e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPromptRun(s.id) }}
                />
                <button title="rewrite this section" onClick={() => onPromptRun(s.id)}>
                  {provider === 'claude' ? <Icon.claude /> : <Icon.gpt />}
                </button>
              </div>
              <div className="srow">
                <button onClick={() => onFanOut(s.id)}>every layout as an alternative</button>
                <button onClick={() => onCopyBrief(s.id)}><Icon.copy /> brief</button>
                {(s.kind === 'hero' || s.kind === 'showcase') && (
                  <button onClick={() => onDraw(s.id)}>draw the image</button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="addrow">
        {ALL_KINDS.map((k) => (
          <button key={k} onClick={() => onAdd(k)}>add {KIND_LABEL[k]}</button>
        ))}
      </div>
    </aside>
  )
}
