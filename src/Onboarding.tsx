import { useState } from 'react'
import { PRESETS, type Taste } from '@/taste'
import { PROVIDERS } from '@/compose'
import type { Product } from '@/compose'
import { Icon } from '@/icons'
import { isDesktop } from '@/host'

/**
 * First run. Three steps that end in a finished page, so the setup produces
 * something instead of only explaining. Shown once, and reopenable from the
 * header when someone wants the explanation again.
 */

const SAMPLE: Product = {
  name: 'Spoor',
  oneLiner: 'Every session you ever ran, findable in one keystroke.',
  what: 'Spoor reads what your AI tools already write to disk and turns 900MB of transcripts into memory you can search. Local, instant, yours.',
  audience: 'for people who build with agents',
  cta: 'Download for macOS',
}

interface Props {
  product: Product
  taste: Taste
  explainOnly?: boolean
  onProduct: (p: Product) => void
  onTaste: (t: Taste) => void
  onBuild: (p: Product, t: Taste) => void
  onClose: () => void
}

export function Onboarding({ product, taste, explainOnly, onProduct, onTaste, onBuild, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [keys, setKeys] = useState(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, localStorage.getItem(p.keyName) ?? ''])),
  )
  const ready = product.name.trim().length > 0 && product.oneLiner.trim().length > 0

  const saveKey = (id: string, keyName: string, value: string) => {
    setKeys((k) => ({ ...k, [id]: value }))
    localStorage.setItem(keyName, value.trim())
  }

  const finish = (p: Product) => {
    localStorage.setItem('wall-onboarded', '1')
    onBuild(p, taste)
    onClose()
  }

  return (
    <div className="onboard">
      <div className="card">
        <div className="steps">
          {['what this is', 'your product', 'your taste'].map((label, i) => (
            <button key={label} className={i === step ? 'on' : ''} onClick={() => setStep(i)}
              disabled={explainOnly && i > 0}>
              {label}
            </button>
          ))}
          <span className="grow" />
          {explainOnly && <button onClick={onClose}>close</button>}
        </div>

        {step === 0 && (
          <div className="pane">
            <h2>Eight pages, then one.</h2>
            <p className="lede">
              Wall writes your landing page eight different ways at once and lines them up, so you
              choose between real pages instead of imagining them.
            </p>
            <ol className="how">
              <li>
                <b>Every paper argues differently.</b> One names the pain, one leads with the
                outcome, one opens with proof. The angle is named under each page, so you are
                choosing between positions rather than between page three and page five.
              </li>
              <li>
                <b>The paper sits in the middle.</b> The others wait either side. Scroll sideways or
                use the arrow keys to bring one to the centre.
              </li>
              <li>
                <b>Click any text on the paper to edit it.</b> The change goes into the page itself,
                so it survives when you switch layouts.
              </li>
              <li>
                <b>Prompting makes variants.</b> An instruction produces three new pages placed to
                the right, so your current page is never overwritten.
              </li>
              <li>
                <b>Ship writes one HTML file you own.</b> No framework and no runtime from us, so
                you can host it anywhere.
              </li>
            </ol>
            {explainOnly ? (
              <div className="row"><button className="primary" onClick={onClose}>back to work</button></div>
            ) : (
              <div className="row">
                <button className="primary" onClick={() => setStep(1)}>set up in a minute</button>
                <button className="sample" onClick={() => { onProduct(SAMPLE); finish(SAMPLE) }}>
                  skip and use a sample product
                </button>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="pane">
            <h2>What are you launching?</h2>
            <p className="lede">
              Every section is written from this, so a plain answer beats a polished one. You can
              change all of it later, on the page itself.
            </p>
            <div className="fields">
              <label><span>product name</span>
                <input autoFocus value={product.name} placeholder="Spoor"
                  onChange={(e) => onProduct({ ...product, name: e.currentTarget.value })} />
              </label>
              <label><span>one line that makes it obvious</span>
                <input value={product.oneLiner} placeholder="Every session you ever ran, findable in one keystroke."
                  onChange={(e) => onProduct({ ...product, oneLiner: e.currentTarget.value })} />
              </label>
              <label><span>what it is, in two sentences</span>
                <textarea value={product.what} placeholder="Written for someone who has never heard of it."
                  onChange={(e) => onProduct({ ...product, what: e.currentTarget.value })} />
              </label>
              <div className="pair">
                <label><span>who it is for</span>
                  <input value={product.audience} placeholder="for people who build with agents"
                    onChange={(e) => onProduct({ ...product, audience: e.currentTarget.value })} />
                </label>
                <label><span>the one action you want</span>
                  <input value={product.cta} placeholder="Start free"
                    onChange={(e) => onProduct({ ...product, cta: e.currentTarget.value })} />
                </label>
              </div>
            </div>
            <div className="row">
              <button className="primary" disabled={!ready} onClick={() => setStep(2)}>next, pick a look</button>
              <button className="sample" onClick={() => onProduct(SAMPLE)}>fill with a sample</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="pane">
            <h2>How should it feel?</h2>
            <p className="lede">
              Pick a starting point. Later you can drop a screenshot of any page you admire and Wall
              reads its colours and contrast into your taste sheet.
            </p>
            <div className="tastes">
              {PRESETS.map((p) => (
                <button key={p.name} className={p.name === taste.name ? 'tas on' : 'tas'} onClick={() => onTaste(p)}>
                  <span className="chips">
                    {[p.bg, p.ink, p.accent, p.accent2].map((c, i) => <i key={i} style={{ background: c }} />)}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>

            <h3 className="keyhead">Model keys, if you have them</h3>
            <p className="lede small">
              With a key, each of the eight pages is written from its own angle. Without one, Wall
              arranges your copy eight ways instead, so the app still works.{' '}
              {isDesktop
                ? "Either way the key stays in this app's storage on this machine, and is used only for writing copy."
                : 'Either way the key stays in this browser and goes straight to the provider, because there is no Wall server in between. On a shared computer, use a key you can revoke.'}
            </p>
            {PROVIDERS.map((p) => (
              <label key={p.id} className="keyline">
                <span>{p.id === 'claude' ? <Icon.claude /> : <Icon.gpt />} {p.label}</span>
                <input type="password" value={keys[p.id]} placeholder={p.id === 'claude' ? 'sk-ant-...' : 'sk-...'}
                  onChange={(e) => saveKey(p.id, p.keyName, e.currentTarget.value)} />
              </label>
            ))}

            <div className="row">
              <button className="primary" disabled={!ready} onClick={() => finish(product)}>build my page</button>
              <button className="sample" onClick={() => setStep(1)}>back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
