import { useState } from 'react'
import { PRESETS, type Taste } from '@/taste'
import { starterPage } from '@/sections'
import { renderPage } from '@/render'
import { IMAGE_KEY_NAME, PROVIDERS, canWrite, readBrief, seeded, type Intake } from '@/compose'
import type { Product } from '@/compose'
import { Icon } from '@/icons'
import { isDesktop } from '@/host'

/**
 * First run. Three steps that end in a finished page, so the setup produces
 * something instead of only explaining. Shown once, and reopenable from the
 * header when someone wants the explanation again.
 */

/** A look is shown as the real page it produces, because a row of colour chips describes a
 *  palette rather than a design, and the palette is the smallest part of the difference. */
const lookHtml = (t: Taste) => {
  const page = seeded(starterPage(t, 'Spoor'), SAMPLE)
  return renderPage({ ...page, sections: page.sections.slice(0, 1) }, { title: t.name })
}

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
  const [told, setTold] = useState('')
  const [reading, setReading] = useState(false)
  const [asked, setAsked] = useState<Intake['questions']>([])
  const [read, setRead] = useState(false)
  const [failed, setFailed] = useState(false)
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...PROVIDERS.map((p) => [p.id, localStorage.getItem(p.keyName) ?? '']),
      ['gemini', localStorage.getItem(IMAGE_KEY_NAME) ?? ''],
    ]),
  )
  const ready = product.name.trim().length > 0 && product.oneLiner.trim().length > 0

  const saveKey = (id: string, keyName: string, value: string) => {
    setKeys((k) => ({ ...k, [id]: value }))
    localStorage.setItem(keyName, value.trim())
  }

  /** Read the description into a brief, then ask only for what it did not carry. */
  async function readIt() {
    if (!told.trim()) return
    setReading(true)
    const got = await readBrief(told).catch(() => null)
    setReading(false)
    if (!got) {
      // silence here would look like nothing happened, which is worse than saying so
      setFailed(true)
      return
    }
    setFailed(false)
    onProduct(got.product)
    // ask only about what the description genuinely left empty, because everything else either
    // came out of the reading or has a sensible default
    const gaps = got.questions.filter((q) => !String(got.product[q.key] ?? '').trim()).slice(0, 2)
    setAsked(gaps)
    setRead(true)
    if (!gaps.length && got.product.name && got.product.oneLiner) setStep(2)
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
              Wall writes your landing page eight ways at once, so you choose between real pages
              instead of imagining them.
            </p>
            <p className="lede">
              Describe what you are launching. Edit any page by clicking its text. Ship writes one
              HTML file you own.
            </p>
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
            {keys.claude || keys.gpt || canWrite('claude') ? (
              <>
                <p className="lede">
                  Say it however you already say it. A README, a note, two sentences.
                </p>
                <div className="fields">
                  <textarea
                    className="tell"
                    autoFocus
                    value={told}
                    placeholder="Spoor reads the transcripts my AI tools already write to disk and makes 900MB of history searchable in under a second. It is for people who build with agents. Everything stays local."
                    onChange={(e) => setTold(e.currentTarget.value)}
                  />
                </div>

                {failed && (
                  <p className="lede small">
                    That could not be read. Try again, or fill the two fields below the key instead.
                  </p>
                )}

                {asked.length > 0 && (
                  <div className="fields">
                    {asked.map((q) => (
                      <label key={q.key}>
                        <span>{q.question}</span>
                        <input autoFocus value={product[q.key]} placeholder={q.why}
                          onChange={(e) => onProduct({ ...product, [q.key]: e.currentTarget.value })} />
                      </label>
                    ))}
                  </div>
                )}

                <div className="row">
                  {read ? (
                    <button className="primary" disabled={!ready} onClick={() => setStep(2)}>next, pick a look</button>
                  ) : (
                    <button className="primary" disabled={!told.trim() || reading} onClick={() => void readIt()}>
                      {reading ? 'reading' : 'write my pages'}
                    </button>
                  )}
                  <button className="sample" onClick={() => { onProduct(SAMPLE); setRead(true); setAsked([]) }}>
                    use a sample instead
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="lede">
                  Paste a key and Wall writes the pages from a description. Without one it needs
                  these two and fills in the rest.
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
                  {/* the good path needs a key, so it is offered here rather than a step later,
                      where someone would already have filled the form it replaces */}
                  <label className="keyline">
                    <span><Icon.claude /> Claude</span>
                    <input type="password" value={keys.claude ?? ''} placeholder="paste a key and describe it instead"
                      onChange={(e) => saveKey('claude', PROVIDERS[0].keyName, e.currentTarget.value)} />
                  </label>
                </div>
                <div className="row">
                  <button className="primary" disabled={!ready} onClick={() => setStep(2)}>next, pick a look</button>
                  <button className="sample" onClick={() => onProduct(SAMPLE)}>fill with a sample</button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="pane">
            <h2>How should it feel?</h2>
            <div className="looks">
              {PRESETS.map((p) => (
                <button key={p.name} className={p.name === taste.name ? 'look on' : 'look'} onClick={() => onTaste(p)}>
                  <span className="shot">
                    <iframe title={p.name} scrolling="no" tabIndex={-1} srcDoc={lookHtml(p)} />
                  </span>
                  <span className="looklabel">{p.name}</span>
                </button>
              ))}
            </div>
            <p className="lede small">Drop a screenshot of any page you admire and Wall reads its colours into a look of your own.</p>

            <h3 className="keyhead">Keys, if you have them</h3>
            <p className="lede small">
              {isDesktop
                ? 'Used only for writing copy, and kept on this machine.'
                : 'Used only for writing copy, kept in this browser, sent straight to the provider.'}
            </p>
            {PROVIDERS.map((p) => (
              <label key={p.id} className="keyline">
                <span>{p.id === 'claude' ? <Icon.claude /> : <Icon.gpt />} {p.label}</span>
                <input type="password" value={keys[p.id]} placeholder={p.id === 'claude' ? 'sk-ant-...' : 'sk-...'}
                  onChange={(e) => saveKey(p.id, p.keyName, e.currentTarget.value)} />
              </label>
            ))}

            <label className="keyline">
              <span>Gemini</span>
              <input type="password" value={keys.gemini ?? ''} placeholder="for drawing images, optional"
                onChange={(e) => saveKey('gemini', IMAGE_KEY_NAME, e.currentTarget.value)} />
            </label>

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
