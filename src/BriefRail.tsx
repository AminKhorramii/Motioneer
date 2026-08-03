import { PRESETS, type Taste } from '@/taste'
import { PROVIDERS, type Product } from '@/compose'
import { Icon } from '@/icons'

interface Props {
  product: Product
  taste: Taste
  onProduct: (p: Product) => void
  onTaste: (t: Taste) => void
  onCopy: () => void
}

/** The brief rail. Editing here changes what future sections are written from. */
export function BriefRail({ product, taste, onProduct, onTaste, onCopy }: Props) {
  return (
    <aside className="side">
      {/* copying the brief belongs with the brief, not in the header beside the view switch */}
      <div className="briefhead">
        <h3>the brief</h3>
        <button className="copybrief" onClick={onCopy} title="the whole page as markdown, for another model">copy</button>
      </div>
      <label><span>product</span>
        <input value={product.name} placeholder="Spoor"
          onChange={(e) => onProduct({ ...product, name: e.currentTarget.value })} />
      </label>
      <label><span>one line</span>
        <input value={product.oneLiner} placeholder="The sentence that makes it obvious."
          onChange={(e) => onProduct({ ...product, oneLiner: e.currentTarget.value })} />
      </label>
      <label><span>what it is</span>
        <textarea value={product.what}
          onChange={(e) => onProduct({ ...product, what: e.currentTarget.value })} />
      </label>
      <label><span>who it is for</span>
        <input value={product.audience}
          onChange={(e) => onProduct({ ...product, audience: e.currentTarget.value })} />
      </label>
      <label><span>the one action you want</span>
        <input value={product.cta}
          onChange={(e) => onProduct({ ...product, cta: e.currentTarget.value })} />
      </label>

      <h3 className="mt">taste</h3>
      <p className="hint">Drop a screenshot of a page you admire and its colours become your taste sheet.</p>
      <div className="swatches">
        {[taste.bg, taste.ink, taste.accent, taste.accent2].map((c, i) => <i key={i} style={{ background: c }} />)}
      </div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} className={p.name === taste.name ? 'on' : ''} onClick={() => onTaste(p)}>{p.name}</button>
        ))}
      </div>

      <h3 className="mt">models</h3>
      {PROVIDERS.map((p) => (
        <label key={p.id} className="keyrow">
          <span>{p.id === 'claude' ? <Icon.claude /> : <Icon.gpt />} {p.label} key</span>
          <input type="password" defaultValue={localStorage.getItem(p.keyName) ?? ''}
            placeholder={p.id === 'claude' ? 'sk-ant-...' : 'sk-...'}
            onChange={(e) => localStorage.setItem(p.keyName, e.currentTarget.value.trim())} />
        </label>
      ))}
      <p className="hint">Keys are used only for writing copy, and they stay on this machine.</p>
    </aside>
  )
}
