import { PRESETS } from '@/design/presets'
import type { Taste } from '@/taste'
import { starterPage } from '@/sections'
import { renderPage } from '@/render'
import { seeded, type Product } from '@/compose'

interface Props {
  product: Product
  taste: Taste
  onProduct: (p: Product) => void
  onTaste: (t: Taste) => void
  onCopy: () => void
}

/** A look shown as the page it makes, at rail size. */
const lookHtml = (t: Taste, p: Product) => {
  const page = seeded(starterPage(t, p.name || 'Product'), p)
  return renderPage({ ...page, sections: page.sections.slice(0, 1) }, { title: t.name })
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

      <h3 className="mt">look</h3>
      <div className="looks small">
        {PRESETS.map((p) => (
          <button key={p.name} className={p.name === taste.name ? 'look on' : 'look'} onClick={() => onTaste(p)}>
            <span className="shot">
              <iframe title={p.name} scrolling="no" tabIndex={-1} srcDoc={lookHtml(p, product)} />
            </span>
            <span className="looklabel">{p.name}</span>
          </button>
        ))}
      </div>
      <p className="hint">Drop a screenshot of a page you admire and its colours become a look.</p>
    </aside>
  )
}
