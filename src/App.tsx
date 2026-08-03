import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRESETS, tasteFromImage, type Taste } from '@/taste'
import { KIND_LABEL, applyEdit, starterPage, type Kind, type Page } from '@/sections'
import { renderPage } from '@/render'
import { pageBrief } from '@/brief'
import {
  EMPTY_PRODUCT, addSection, alternatives, arrange, cycleBackdrop, cycleVariant, dropSection, fanOut, illustrate, imageKey, keyFor, promptPage, promptSection, sectionAlternatives, seeded, setMock, type Product, type Provider,
} from '@/compose'
import { Onboarding } from '@/Onboarding'
import { BriefRail } from '@/BriefRail'
import { SectionsRail } from '@/SectionsRail'
import { Dock } from '@/Dock'
import { Icon } from '@/icons'
import { slop } from '@/slop'

import { host, isDesktop } from '@/host'

const PAGE_W = 1280

export default function App() {
  const [product, setProduct] = useState<Product>(EMPTY_PRODUCT)
  const [taste, setTaste] = useState<Taste>(PRESETS[0])
  const [pages, setPages] = useState<Page[]>([])
  const [at, setAt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [bar, setBar] = useState('')
  const [provider, setProvider] = useState<Provider>('claude')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [view, setView] = useState<'studio' | 'wall'>('studio')
  const [briefOpen, setBriefOpen] = useState(false)
  const [onboarding, setOnboarding] = useState<'first' | 'explain' | null>(
    () => (localStorage.getItem('wall-onboarded') ? null : 'first'),
  )
  const wheelLock = useRef(0)
  // Each fan-out gets a token. Pages from an earlier run keep streaming in after a new one
  // starts, and without this they land on the new wall, which mixes pages built from two
  // different bases.
  const run = useRef(0)

  const page = pages[at] ?? null

  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }
  const copy = async (text: string, what: string) => {
    await navigator.clipboard?.writeText(text)
    flash(`${what} copied, ${text.length.toLocaleString()} characters.`)
  }

  /** Put a streaming page on the wall, replacing it in place once it already has an id there. */
  const upsertPage = useCallback((page: Page) => {
    setPages((all) => {
      const i = all.findIndex((x) => x.id === page.id)
      if (i < 0) return [...all, page]
      const next = [...all]
      next[i] = page
      return next
    })
  }, [])

  /**
   * Fill the wall. With a key every paper is written from a different angle and lands as
   * soon as its own call returns, so the wall fills in front of you. With no key the same
   * copy is arranged eight ways, which still gives something to choose between.
   */
  const fill = useCallback(async (base: Page, p: Product, prov: Provider) => {
    const mine = ++run.current
    setPages([arrange(base, 0)])
    setAt(0)
    if (!keyFor(prov)) {
      setPages(alternatives(base, 8))
      return
    }
    setBusy(`Writing eight pages with ${prov === 'claude' ? 'Claude' : 'GPT'}, one per angle.`)
    // a page keeps one id for its whole stream, so a paper appears on its first section and
    // then fills in, instead of arriving all at once when the model finishes
    const started = new Set<string>()
    const { written, error } = await fanOut(base, p, prov, 8, (page) => {
      if (run.current !== mine) return
      if (!started.has(page.id)) {
        started.add(page.id)
        setBusy(`${started.size} of 8 pages writing.`)
      }
      upsertPage(page)
    })
    if (run.current !== mine) return
    setBusy('')
    if (!written) {
      setPages(alternatives(base, 8))
      flash(error ? `The model call failed: ${error}` : 'No copy came back, so the wall is arranged locally instead.')
    } else {
      flash(
        error
          ? `${written} of 8 pages written. The rest failed: ${error}`
          : `${written} written pages. Use the arrow keys to compare the angles.`,
      )
    }
  }, [upsertPage])

  const build = useCallback((p: Product, t: Taste) => {
    void fill(seeded(starterPage(t, p.name || 'Product'), p), p, provider)
  }, [fill, provider])

  useEffect(() => {
    void host.readState().then((raw) => {
      const s = raw as { product: Product; page: Page } | null
      if (s?.page?.sections?.length) {
        setProduct(s.product)
        setPages(alternatives(s.page, 7))
      }
    })
  }, [])

  useEffect(() => {
    if (page && product.name) void host.writeState({ product, page })
  }, [page, product])

  // text edited directly on the paper
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as
        { wall?: string; path?: string; value?: string; id?: string; onto?: string; after?: boolean }
      if (d?.wall === 'edit' && d.path) {
        setPages((all) => all.map((p, i) => (i === at ? applyEdit(p, d.path!, d.value ?? '') : p)))
      } else if (d?.wall === 'move' && d.id && d.onto) {
        setPages((all) => all.map((p, i) => (i === at ? dropSection(p, d.id!, d.onto!, !!d.after) : p)))
      } else if (d?.wall === 'select' && d.id) setSelected(d.id)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [at])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.('input, textarea') || onboarding) return
      if (e.key === 'ArrowRight') setAt((v) => Math.min(v + 1, pages.length - 1))
      if (e.key === 'ArrowLeft') setAt((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages.length, onboarding])

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < 22 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return
    const now = Date.now()
    if (now - wheelLock.current < 420) return
    wheelLock.current = now
    setAt((v) => Math.max(0, Math.min(v + (e.deltaX > 0 ? 1 : -1), pages.length - 1)))
  }

  const setPage = (fn: (p: Page) => Page) => setPages((all) => all.map((p, i) => (i === at ? fn(p) : p)))

  async function runBar() {
    const instruction = bar.trim()
    if (!instruction || !page) return
    if (!keyFor(provider)) {
      flash(`Add a ${provider === 'claude' ? 'Claude' : 'GPT'} key in the brief panel to write copy with a model.`)
      return
    }
    setBusy(`Writing three variants with ${provider === 'claude' ? 'Claude' : 'GPT'}.`)
    // streamed pages land at the end of the wall, so remember where the new run starts
    const firstNew = pages.length
    const made = await Promise.all(
      [0, 1, 2].map(() =>
        promptPage(page, instruction, product, provider, upsertPage)
          .catch((e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 160)),
      ),
    )
    const good = made.filter((m) => m && typeof m !== 'string') as Page[]
    setBusy('')
    if (!good.length) {
      const why = made.find((m) => typeof m === 'string') as string | undefined
      flash(why ? `The model call failed: ${why}` : 'No usable copy came back. A plainer instruction usually works.')
      return
    }
    good.forEach(upsertPage)
    setAt(firstNew)
    setBar('')
    flash(`${good.length} variants ready. Use the arrow keys to compare them.`)
  }

  /** Draw the image for one section. It lands in the page content, so it ships with the file. */
  async function drawImage(id: string) {
    const sec = page?.sections.find((s) => s.id === id)
    if (!sec) return
    if (!imageKey()) return flash('Add a Gemini key in the brief panel to draw images.')
    setBusy(`Drawing the ${KIND_LABEL[sec.kind]} image.`)
    try {
      const dataUrl = await illustrate(sec, product, page!.taste)
      if (!dataUrl) return flash('No image came back.')
      setPage((p) => ({
        ...p,
        sections: p.sections.map((s) => (s.id === id ? { ...s, content: { ...s.content, image: dataUrl } } : s)),
      }))
      flash(`Image drawn, ${Math.round((dataUrl.length * 3) / 4 / 1024)}KB inside the page.`)
    } catch (e) {
      flash(`The image call failed: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`)
    } finally {
      setBusy('')
    }
  }

  async function runSectionPrompt(id: string) {
    const sec = page?.sections.find((s) => s.id === id)
    const instruction = prompts[id]?.trim()
    if (!sec || !instruction) return
    if (!keyFor(provider)) return flash('Add a model key in the brief panel to rewrite a section.')
    setBusy(`Rewriting the ${KIND_LABEL[sec.kind]}.`)
    const next = await promptSection(sec, instruction, product, provider)
    setBusy('')
    if (!next) return flash('No usable copy came back.')
    setPage((p) => ({ ...p, sections: p.sections.map((s) => (s.id === id ? { ...s, content: next } : s)) }))
    setPrompts((v) => ({ ...v, [id]: '' }))
    flash(`The ${KIND_LABEL[sec.kind]} was rewritten.`)
  }

  const html = useMemo(
    () => (page ? renderPage(page, { editable: true, title: product.name }) : ''),
    [page, product.name],
  )

  // checked against the rendered page, because several patterns are visual rather than textual
  const flags = useMemo(() => (page ? slop(page, html) : []), [page, html])

  async function onDropRef(e: React.DragEvent) {
    e.preventDefault()
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    setBusy('Reading the colours out of your reference.')
    const dataUrl = await new Promise<string>((res) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.readAsDataURL(file)
    })
    try {
      const t = await tasteFromImage(dataUrl, file.name.replace(/\.[^.]+$/, ''))
      setTaste(t)
      setPages((all) => all.map((p) => ({ ...p, taste: t })))
      flash('Your taste sheet now follows that reference.')
    } catch {
      flash('That image could not be read.')
    }
    setBusy('')
  }

  const shipName = (product.name || 'landing').toLowerCase().replace(/\W+/g, '-')

  return (
    <div className="wall" onDragOver={(e) => e.preventDefault()} onDrop={onDropRef}>
      <header>
        <h1>Wall</h1>
        <span className="sub">{view === 'studio' ? 'one paper, alternatives either side' : 'all of them at once'}</span>
        <div className="hactions">
          <button onClick={() => setBriefOpen((v) => !v)}>{briefOpen ? 'hide brief' : 'brief'}</button>
          <button className={view === 'wall' ? 'on' : ''} onClick={() => setView(view === 'wall' ? 'studio' : 'wall')}>
            {view === 'wall' ? 'studio' : 'see all'}
          </button>
          <button disabled={!page} onClick={() => page && void copy(pageBrief(page, product.name), 'Page brief')}>
            copy page brief
          </button>
          {/* writing a wall takes half a minute, so starting another must not be blocked. Runs
              carry a token, so the previous one is abandoned rather than mixed in. */}
          <button className="go" disabled={!page} onClick={() => page && void fill(page, product, provider)}>
            {keyFor(provider) ? 'write a new wall' : 'new alternatives'}
          </button>
          <button title="how this works" onClick={() => setOnboarding('explain')}><Icon.help /></button>
        </div>
      </header>

      {busy && <p className="busy">{busy}</p>}

      <div className="body">
        {briefOpen && <BriefRail product={product} taste={taste} onProduct={setProduct} onTaste={(t) => {
          setTaste(t)
          setPages((all) => all.map((p) => ({ ...p, taste: t })))
        }} />}

        {view === 'studio' && page && (
          <>
            <main className="studio" onWheel={onWheel}>
              <div className="film">
                {pages.map((p, i) => {
                  const d = i - at
                  if (Math.abs(d) > 2) return null
                  return (
                    <div key={p.id} className={`paper ${d === 0 ? 'here' : 'aside'}`}
                      style={{ transform: `translateX(${d * 76}%) scale(${d === 0 ? 1 : 0.85})`, opacity: d === 0 ? 1 : 0.32, zIndex: 10 - Math.abs(d) }}
                      onClick={() => d !== 0 && setAt(i)}>
                      <iframe title={p.id} srcDoc={d === 0 ? html : renderPage(p, { title: product.name })}
                        sandbox="allow-scripts allow-same-origin" />
                    </div>
                  )
                })}
              </div>
              <Dock
                at={at} count={pages.length} angle={page.angle} flags={flags} backdrop={page.backdrop ?? 'none'} bar={bar} provider={provider} busy={!!busy}
                onBar={setBar} onRun={runBar} onProvider={setProvider}
                onGo={(i) => setAt(Math.max(0, Math.min(i, pages.length - 1)))}
                onFlags={() => flash(
                  flags.length
                    ? `${flags.length} generic patterns: ${flags.slice(0, 3).map((f) => f.label).join(', ')}.`
                    : 'No generic patterns found on this page.',
                )}
                onBackdrop={() => setPage(cycleBackdrop)}
                onOpen={() => void host.preview(renderPage(page, { title: product.name })).then(() => flash('Opened in your browser.'))}
                onShip={() => void host.exportPage(renderPage(page, { title: product.name }), shipName).then(
                  (r) => r && flash(isDesktop ? `Shipped to ${r.file}` : `${r.file} downloaded, ${r.bytes.toLocaleString()} bytes.`),
                )}
              />
            </main>

            <SectionsRail
              page={page}
              selected={selected}
              prompts={prompts}
              provider={provider}
              onSelect={setSelected}
              onCycle={(id) => setPage((p) => cycleVariant(p, id))}
              onDrop={(id, onto, after) => setPage((p) => dropSection(p, id, onto, after))}
              onToggle={(id) => setPage((p) => ({
                ...p,
                sections: p.sections.map((s) => (s.id === id ? { ...s, on: !s.on } : s)),
              }))}
              onPromptChange={(id, v) => setPrompts((all) => ({ ...all, [id]: v }))}
              onPromptRun={runSectionPrompt}
              onFanOut={(id) => {
                const alts = sectionAlternatives(page, id)
                setPages((all) => [...all.slice(0, at + 1), ...alts.slice(1), ...all.slice(at + 1)])
                flash(`${alts.length - 1} more layouts are waiting to the right.`)
              }}
              onDraw={(id) => void drawImage(id)}
              onAdd={(kind: Kind) => setPage((p) => addSection(p, kind, product.name))}
            />
          </>
        )}

        {view === 'wall' && (
          <main className="grid">
            {pages.map((p, i) => (
              <div key={p.id} className={`cell ${i === at ? 'pinned' : ''}`} onClick={() => { setAt(i); setView('studio') }}>
                <Preview html={renderPage(p, { title: product.name })} />
                <div className="cellbar">
                  <span className="arch">{p.sections.filter((s) => s.on).length} sections</span>
                  <span className="tname">{p.taste.name}</span>
                </div>
              </div>
            ))}
          </main>
        )}

        {!page && view === 'studio' && !onboarding && (
          <main className="empty">
            <p>There is no page yet.</p>
            <p className="dim">Open the brief, describe the product, then press new alternatives.</p>
          </main>
        )}
      </div>

      {onboarding && (
        <Onboarding
          product={product}
          taste={taste}
          explainOnly={onboarding === 'explain'}
          onProduct={setProduct}
          onTaste={setTaste}
          onBuild={build}
          onClose={() => setOnboarding(null)}
        />
      )}

      {toast && <p className="toast">{toast}</p>}
    </div>
  )
}

function Preview({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / PAGE_W))
    ro.observe(el)
    setScale(el.clientWidth / PAGE_W)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="preview" ref={box}>
      <iframe title="alternative" srcDoc={html} scrolling="no"
        style={{ width: PAGE_W, height: 960, transform: `scale(${scale})` }} />
    </div>
  )
}

;(window as unknown as { __wall?: unknown }).__wall = { setMock }
