import { useState } from 'react'
import type { Taste } from '@/taste'
import { CUSTOM, IMAGE_KEY_NAME, canWrite, choose, keyHome, readBrief, setKey, type Intake } from '@/compose'
import type { Product } from '@/compose'
import { MARKS, MODELS, modelById } from '@/models'


/**
 * First run, in two steps: which model writes, and what it writes about.
 *
 * Everything else was moved out. The look belongs beside the page it changes, and explaining
 * the app before it has done anything is a worse introduction than the app doing it.
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

export function Onboarding({ product, taste, explainOnly, onProduct, onBuild, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [told, setTold] = useState('')
  const [reading, setReading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [asked, setAsked] = useState<Intake['questions']>([])
  // nothing is chosen on a first run, so the grid is the only thing on screen until it is
  const [hover, setHover] = useState('')
  const [pick, setPick] = useState(() => localStorage.getItem('wall-model') ?? '')
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...MODELS.map((m) => [m.keyName, localStorage.getItem(m.keyName) ?? '']),
      [IMAGE_KEY_NAME, localStorage.getItem(IMAGE_KEY_NAME) ?? ''],
    ]),
  )
  const model = modelById(pick)
  const picked = Boolean(pick)
  const shown = hover || pick ? modelById(hover || pick) : null
  const ready = product.name.trim().length > 0 && product.oneLiner.trim().length > 0

  const saveKey = (keyName: string, value: string) => {
    setKeys((k) => ({ ...k, [keyName]: value }))
    // where a key goes depends on the shell, and only compose knows which one this is
    void setKey(keyName, value.trim())
  }
  const take = (id: string) => {
    setPick(id)
    choose(id)
  }

  /** Read the description into a brief, then ask only for what it did not carry. */
  async function readIt() {
    if (!told.trim()) return
    setReading(true)
    const got = await readBrief(told).catch(() => null)
    setReading(false)
    if (!got) {
      setFailed(true)
      return
    }
    setFailed(false)
    onProduct(got.product)
    const gaps = got.questions.filter((q) => !String(got.product[q.key] ?? '').trim()).slice(0, 2)
    setAsked(gaps)
    if (!gaps.length && got.product.name && got.product.oneLiner) finish(got.product)
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
          {['model', 'brief'].map((label, i) => (
            <button key={label} className={i === step ? 'on' : ''} onClick={() => setStep(i)}>{label}</button>
          ))}
          <span className="grow" />
          {explainOnly && <button onClick={onClose}>close</button>}
        </div>

        {step === 0 && (
          <div className="pane">
            <h2>Which model writes?</h2>
            {/* one row of marks, and one line that names whichever is under the cursor. Ten
                labelled tiles was four rows of reading to make one choice. */}
            <div className="picks" onMouseLeave={() => setHover('')}>
              {MODELS.map((m) => (
                <button key={m.id} className={m.id === pick ? 'pick on' : 'pick'} aria-label={m.label}
                  onMouseEnter={() => setHover(m.id)} onFocus={() => setHover(m.id)} onClick={() => take(m.id)}>
                  {MARKS[m.id]?.()}
                </button>
              ))}
            </div>
            <p className="lede small named">
              {shown ? `${shown.label}: ${shown.note}` : 'Pick one. Wall asks for short copy, not code, so a small model does it well.'}
            </p>

            {picked && (
            <div className="fields">
              <label className="keyline">
                <span>{model.label} key</span>
                <input type="password" autoFocus value={keys[model.keyName] ?? ''}
                  placeholder={`from ${model.keys}`}
                  onChange={(e) => saveKey(model.keyName, e.currentTarget.value)} />
              </label>
              {model.id === 'custom' && (
                <div className="pair">
                  <label><span>endpoint</span>
                    <input defaultValue={localStorage.getItem(CUSTOM.base) ?? ''} placeholder="https://host/v1"
                      onChange={(e) => localStorage.setItem(CUSTOM.base, e.currentTarget.value.trim())} />
                  </label>
                  <label><span>model</span>
                    <input defaultValue={localStorage.getItem(CUSTOM.model) ?? ''} placeholder="model-name"
                      onChange={(e) => localStorage.setItem(CUSTOM.model, e.currentTarget.value.trim())} />
                  </label>
                </div>
              )}
              {model.keyName !== IMAGE_KEY_NAME && (
                <label className="keyline">
                  <span>Gemini, for images</span>
                  <input type="password" value={keys[IMAGE_KEY_NAME] ?? ''} placeholder="optional"
                    onChange={(e) => saveKey(IMAGE_KEY_NAME, e.currentTarget.value)} />
                </label>
              )}
            </div>
            )}

            <div className="row">
              <button className="primary" disabled={!picked}
                onClick={() => (explainOnly ? onClose() : setStep(1))}>
                {explainOnly ? 'done' : 'next'}
              </button>
              {picked && <span className="lede small">{keyHome()}</span>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="pane">
            <h2>What are you launching?</h2>
            {canWrite() ? (
              <>
                <p className="lede">Say it however you already say it. A README, a note, two sentences.</p>
                <div className="fields">
                  <textarea className="tell" autoFocus value={told}
                    placeholder="Spoor reads the transcripts my AI tools already write to disk and makes 900MB of history searchable in under a second. It is for people who build with agents."
                    onChange={(e) => setTold(e.currentTarget.value)} />
                </div>
                {failed && <p className="lede small">That could not be read. Try again, or use the sample.</p>}
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
                  {asked.length > 0 ? (
                    <button className="primary" disabled={!ready} onClick={() => finish(product)}>write my pages</button>
                  ) : (
                    <button className="primary" disabled={!told.trim() || reading} onClick={() => void readIt()}>
                      {reading ? 'reading' : 'write my pages'}
                    </button>
                  )}
                  <button className="sample" onClick={() => { onProduct(SAMPLE); finish(SAMPLE) }}>use a sample</button>
                </div>
              </>
            ) : (
              <>
                <p className="lede">Without a key Wall still builds and arranges pages. It needs these two.</p>
                <div className="fields">
                  <label><span>product name</span>
                    <input autoFocus value={product.name} placeholder="Spoor"
                      onChange={(e) => onProduct({ ...product, name: e.currentTarget.value })} />
                  </label>
                  <label><span>one line that makes it obvious</span>
                    <input value={product.oneLiner} placeholder="Every session you ever ran, findable in one keystroke."
                      onChange={(e) => onProduct({ ...product, oneLiner: e.currentTarget.value })} />
                  </label>
                </div>
                <div className="row">
                  <button className="primary" disabled={!ready} onClick={() => finish(product)}>build my pages</button>
                  <button className="sample" onClick={() => { onProduct(SAMPLE); finish(SAMPLE) }}>use a sample</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
