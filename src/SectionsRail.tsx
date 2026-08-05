import { ROLES, ROLE_LABEL, type Page, type Role } from '@/sections'
import { Icon } from '@/icons'

interface Props {
  page: Page
  selected: string | null
  onSelect: (id: string) => void
  onCycle: (id: string) => void
  onDrop: (id: string, onto: string, after: boolean) => void
  onToggle: (id: string) => void
  onFanOut: (id: string) => void
  onDraw: (id: string) => void
  onAdd: (role: Role) => void
}

export function SectionsRail({
  page, selected,
  onSelect, onCycle, onDrop, onToggle, onFanOut, onDraw, onAdd,
}: Props) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <aside className="sections">
      <h3>sections</h3>
      {page.sections.map((s) => (
        <div
          key={s.id}
          className={`sec ${selected === s.id ? 'sel' : ''} ${s.on ? '' : 'off'}`}
          draggable
          onClick={() => onSelect(s.id)}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
          onDragOver={(e) => {
            e.preventDefault()
            const box = e.currentTarget.getBoundingClientRect()
            e.currentTarget.dataset.edge = e.clientY > box.top + box.height / 2 ? 'after' : 'before'
          }}
          onDragLeave={(e) => delete e.currentTarget.dataset.edge}
          onDrop={(e) => {
            e.preventDefault()
            const from = e.dataTransfer.getData('text/plain')
            const after = e.currentTarget.dataset.edge === 'after'
            delete e.currentTarget.dataset.edge
            if (from && from !== s.id) onDrop(from, s.id, after)
          }}
        >
          <div className="secline">
            <b>{ROLE_LABEL[s.role]}</b>
            <span className="vname">{s.form}</span>
            <button title="try the next form" onClick={(e) => { stop(e); onCycle(s.id) }}><Icon.cycle /></button>
            <button title={s.on ? 'hide this section' : 'show this section'} onClick={(e) => { stop(e); onToggle(s.id) }}>
              {s.on ? <Icon.shown /> : <Icon.hidden />}
            </button>
          </div>
          {selected === s.id && (
            <div className="secbody">
              <div className="srow">
                <button onClick={() => onFanOut(s.id)}>all forms</button>
                {(s.role === 'claim' || s.role === 'substance') && (
                  <button onClick={() => onDraw(s.id)}>draw image</button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="addrow">
        {ROLES.map((r) => (
          <button key={r} onClick={() => onAdd(r)}>add {ROLE_LABEL[r]}</button>
        ))}
      </div>
    </aside>
  )
}
