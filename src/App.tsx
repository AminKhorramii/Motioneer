import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tasteFromImage, type Taste } from '@/taste'
import { PRESETS } from '@/design/presets'
import { ROLE_LABEL, applyEdit, migratePage, starterPage, type Page, type Role } from '@/sections'
import { renderPage } from '@/render'
import { pageBrief } from '@/brief'
import { slop } from '@/slop'
import {
  EMPTY_PRODUCT, addSection, alternatives, arrange, readBrief, canDraw, canWrite, choose, chosen, promptWorlds, setDesigned, cycleForm, cycleWorld, dropSection, writeOne, illustrate, loadHeldKeys, loadKeys, promptPage, sectionAlternatives, seeded, setMock, type Product,
} from '@/compose'
import { Onboarding } from '@/Onboarding'
import { BriefRail } from '@/BriefRail'
import { SectionsRail } from '@/SectionsRail'
import { Dock } from '@/Dock'
import { Building } from '@/Building'
import { Icon } from '@/icons'
import { register as registerWorlds, type World } from '@/worlds'

import { host, isTauri } from '@/host'

const PAGE_W = 1280

export default function App() {
  const [product, setProduct] = useState<Product>(EMPTY_PRODUCT)
  const [taste, setTaste] = useState<Taste>(PRESETS[0])
  const [pages, setPages] = useState<Page[]>([])
  const [at, setAt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [bar, setBar] = useState('')
  const [busy, setBusy] = useState('')
  /** null when nothing is being built, otherwise how far along the wall is */
  const [building, setBuilding] = useState<{ arrived: number | null; landed: string[]; thoughts: number } | null>(null)
  const [toast, setToast] = useState('')
  const [view, setView] = useState<'studio' | 'wall'>('studio')
  const [briefOpen, setBriefOpen] = useState(false)
  const [onboarding, setOnboarding] = useState<'first' | 'explain' | null>(
    () => (localStorage.getItem('wall-onboarded') ? null : 'first'),
  )
  const wheelLock = useRef(0)
  /** where to write the chosen design, when something launched this window to ask for one */
  const [askedFrom, setAskedFrom] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  // Each fan-out gets a token. Pages from an earlier run keep streaming in after a new one
  // starts, and without this they land on the new wall, which mixes pages built from two
  // different bases.
  const run = useRef(0)
  // Triage. A removed page goes to the graveyard rather than away, so z brings it back, and
  // its id stays refused so a page still streaming in cannot reappear after being turned away.
  const graveyard = useRef<{ page: Page; index: number }[]>([])
  const buried = useRef(new Set<string>())

  const page = pages[at] ?? null

  /**
   * Start again with a different product. This throws the current wall away, so the button
   * asks once rather than opening a dialog: a second click within a few seconds confirms.
   */
  function startOver() {
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 4000)
      return
    }
    setArmed(false)
    setPages([])
    setAt(0)
    graveyard.current = []
    buried.current.clear()
    setProduct(EMPTY_PRODUCT)
    setSelected(null)
    void host.writeState(null)
    setOnboarding('first')
  }

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
    if (buried.current.has(page.id)) return
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
  const fill = useCallback(async (base: Page, p: Product) => {
    const mine = ++run.current
    // a new wall is a new triage
    graveyard.current = []
    buried.current.clear()
    // the base page is kept so there is something to compare against, but it is not shown
    // while the wall is being made: an unwritten page looks like a finished one until you read
    // it, and the skeleton says plainly that nothing has arrived
    setPages([arrange(base, 0)])
    setAt(0)
    // a served deployment answers which keys it holds asynchronously, and someone clicking
    // straight through setup can arrive here before that answer does
    if (!canWrite()) await loadHeldKeys()
    if (!canWrite()) {
      setPages(alternatives(base, 8))
      return
    }
    // Each page starts the moment its own world is finished, rather than when the whole design
    // is. Writing the wall in one call instead was measured against this and came out the same
    // within noise, so this stays: one path, and the earliest first paper.
    setBuilding({ arrived: null, landed: [], thoughts: 0 })
    setBusy('designing')
    const jobs: Promise<{ ok: number; error?: string }>[] = []
    const started: World[] = []

    const arrived = (page: Page) => {
      if (run.current !== mine) return
      // step onto the first written page, so the wall is never showing the unwritten one
      setAt((v) => (v === 0 ? 1 : v))
      upsertPage(page)
    }

    const startPage = (world: World, i: number) => {
      if (run.current !== mine || started[i]) return
      started[i] = world
      registerWorlds([world])
      setBuilding((b) => ({ arrived: jobs.length + 1, landed: started.filter(Boolean).map((w) => w.name), thoughts: b?.thoughts ?? 0 }))
      setBusy('writing')
      jobs.push(writeOne(base, p, world, i, arrived))
    }

    // every beat is the model proving it is still thinking, which is the only thing there is to
    // report during the minute before the first world
    const worlds = await promptWorlds(p, 8, startPage, 'model', () => {
      if (run.current === mine) setBuilding((b) => (b ? { ...b, thoughts: b.thoughts + 1 } : b))
    })
    if (run.current !== mine) return
    setDesigned(worlds)
    registerWorlds(worlds)
    setBusy('writing')

    // a provider that does not stream hands the worlds over at the end, so anything that did
    // not arrive as it was written starts here
    worlds.forEach(startPage)
    const results = await Promise.all(jobs)
    const written = results.reduce((x, r) => x + r.ok, 0)
    const error = results.find((r) => r.error)?.error

    if (run.current !== mine) return
    setBusy('')
    setBuilding(null)
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
    void fill(seeded(starterPage(t, p.name || 'Product'), p), p)
  }, [fill])

  // ask the deployment which keys it holds before anything gates on having one
  useEffect(() => {
    void loadHeldKeys()
    void loadKeys()
  }, [])

  /**
   * A brief handed in from outside skips setup entirely. Someone who asked their agent for a
   * landing page has already said what it is, and asking them again in a different window
   * would be the worst possible greeting.
   */
  useEffect(() => {
    void host.request().then(async (req) => {
      if (!req?.brief || !req.dir) return
      // an agent opened this window, so the Claude that opened it is right there. Nothing to
      // configure is a better first run than a good default.
      if (!localStorage.getItem('wall-model')) choose('claude-code')
      setAskedFrom(req.dir)
      setOnboarding(null)
      // Reading the brief takes a model call of its own, and until now nothing said so: the
      // setup screen had closed and the wall had not started, so the screen fell through to the
      // message for someone who never described anything.
      setBuilding({ arrived: null, landed: [], thoughts: 0 })
      await loadHeldKeys()
      // The agent that asked already knew what this is, so if it said so there is nothing to
      // work out. Reading the brief back through a model cost about forty seconds to recover
      // what the caller had already written down.
      const told = req.oneLiner?.trim()
      const read = !told && canWrite() ? await readBrief(req.brief).catch(() => null) : null
      const p: Product = told
        ? {
            ...EMPTY_PRODUCT,
            name: req.name?.trim() || 'Product',
            oneLiner: told,
            what: req.what?.trim() || req.brief,
            audience: req.audience?.trim() || '',
            cta: req.cta?.trim() || EMPTY_PRODUCT.cta,
          }
        : read?.product ?? { ...EMPTY_PRODUCT, name: req.name ?? 'Product', oneLiner: req.brief }
      setProduct(p)
      build(p, taste)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void host.readState().then((raw) => {
      const s = raw as { product: Product; page: Page } | null
      if (s?.page?.sections?.length) {
        setProduct(s.product)
        // a wall saved before roles and forms comes back dressed in them
        setPages(alternatives(migratePage(s.page), 7))
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
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight') setAt((v) => Math.min(v + 1, pages.length - 1))
      if (e.key === 'ArrowLeft') setAt((v) => Math.max(v - 1, 0))
      // triage: narrowing eight to one is a keyboard pass, not a mouse deliberation
      if (e.key === 'p') pin()
      if (e.key === 'x') kill(at)
      if (e.key === 'z') revive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < 22 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return
    const now = Date.now()
    if (now - wheelLock.current < 420) return
    wheelLock.current = now
    setAt((v) => Math.max(0, Math.min(v + (e.deltaX > 0 ? 1 : -1), pages.length - 1)))
  }

  const setPage = (fn: (p: Page) => Page) => setPages((all) => all.map((p, i) => (i === at ? fn(p) : p)))

  /** Pin the paper in the middle and step on. Flagging is a pass over the wall, so pinning and
      releasing both advance rather than leaving you parked on a page already judged. */
  function pin() {
    if (!page) return
    setPage((p) => ({ ...p, pinned: !p.pinned }))
    setAt((v) => Math.min(v + 1, pages.length - 1))
  }

  function kill(i: number) {
    const p = pages[i]
    if (!p) return
    if (p.pinned) return flash('This page is pinned. Press p to release it before removing it.')
    if (pages.length < 2) return flash('The last page stays, so the wall is never empty.')
    graveyard.current.push({ page: p, index: i })
    buried.current.add(p.id)
    setPages((all) => all.filter((x) => x.id !== p.id))
    if (i < at) setAt(at - 1)
    else if (i === at && i === pages.length - 1) setAt(Math.max(0, i - 1))
    flash('Removed. Press z to bring it back.')
  }

  function revive() {
    const g = graveyard.current.pop()
    if (!g) return flash('Nothing has been removed.')
    buried.current.delete(g.page.id)
    setPages((all) => {
      const i = Math.min(g.index, all.length)
      return [...all.slice(0, i), g.page, ...all.slice(i)]
    })
    setAt(Math.min(g.index, pages.length))
    flash('Back on the wall.')
  }

  async function runBar() {
    const instruction = bar.trim()
    if (!instruction || !page) return
    if (!canWrite()) {
      flash(`Add a ${chosen().label} key to write copy with a model.`)
      return
    }
    setBusy(`Rewriting this page with ${chosen().label}.`)
    // streamed pages land at the end of the wall, so remember where the new run starts
    const firstNew = pages.length
    const made = await Promise.all(
      [0].map(() =>
        promptPage(page, instruction, product, 'model', upsertPage)
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
    flash('A new page is waiting to the right.')
  }

  /** Draw the image for one section. It lands in the page content, so it ships with the file. */
  async function drawImage(id: string) {
    const sec = page?.sections.find((s) => s.id === id)
    if (!sec) return
    if (!canDraw()) return flash('Add a Gemini key in the brief panel to draw images.')
    setBusy(`Drawing the ${ROLE_LABEL[sec.role]} image.`)
    try {
      const drawn = await illustrate(sec, product, page!.taste)
      if (!drawn) return flash('No image came back.')
      setPage((p) => ({
        ...p,
        sections: p.sections.map((s) => (s.id === id ? { ...s, content: { ...s.content, image: drawn.dataUrl } } : s)),
      }))
      const kb = (n: number) => Math.round(n / 1024)
      // the saving is worth saying, because the page is a file you are about to ship
      flash(
        drawn.after < drawn.before
          ? `Image drawn, ${kb(drawn.after)}KB inside the page, down from ${kb(drawn.before)}KB.`
          : `Image drawn, ${kb(drawn.after)}KB inside the page.`,
      )
    } catch (e) {
      flash(`The image call failed: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`)
    } finally {
      setBusy('')
    }
  }

  const html = useMemo(
    () => (page ? renderPage(page, { editable: true, title: product.name }) : ''),
    [page, product.name],
  )
  // the verdict on the paper in the middle. Local and instant, which is what lets it sit in
  // the dock on every page rather than being a report you ask for
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

  /** Hand the chosen page back as a spec, a render and the page itself. */
  async function sendBack() {
    if (!page || !askedFrom) return
    const res = await host.handoff(askedFrom, {
      'chosen.md': pageBrief(page, product.name),
      'chosen.html': renderPage(page, { title: product.name }),
      'chosen.json': JSON.stringify({ format: 2, product, page }, null, 2),
    })
    flash(res.error ? `Could not write the handoff: ${res.error}` : 'Sent back. Your agent can pick it up now.')
  }

  return (
    // a durable signal that work is in flight, independent of how it is presented, because
    // hiding the status text once left every harness thinking the wall was finished
    <div className="wall" data-busy={busy || building ? '1' : undefined}
      onDragOver={(e) => e.preventDefault()} onDrop={onDropRef}>
      {/* The header carries what you switch between and the one thing that rebuilds the wall.
          Anything about the brief lives with the brief, and the view is a two state control
          rather than a button whose label is the state you are not in. */}
      {/* The drag handle is a CSS property in Chromium and an attribute in WebKit, so the Tauri
          shell needs the attribute or its window cannot be moved by its own header. */}
      <header {...(isTauri ? { 'data-tauri-drag-region': true } : {})}>
        <div className="views">
          <button className={view === 'studio' ? 'on' : ''} onClick={() => setView('studio')}
            title="one paper, with the alternatives either side">one</button>
          <button className={view === 'wall' ? 'on' : ''} onClick={() => setView('wall')}
            title="every paper at once">all</button>
        </div>
        <div className="hactions">
          <button className={briefOpen ? 'on' : ''} onClick={() => setBriefOpen((v) => !v)}
            title="what every page is written from">brief</button>
          {/* writing a wall takes half a minute, so starting another must not be blocked. Runs
              carry a token, so the previous one is abandoned rather than mixed in. */}
          <button className="go" disabled={!page} onClick={() => page && void fill(page, product)}>
            {canWrite() ? 'write a new wall' : 'new alternatives'}
          </button>
          <button className={armed ? 'arm' : ''} title="describe a different product and start a new wall"
            onClick={startOver}>
            {armed ? 'discard this wall?' : 'start over'}
          </button>
          <button title="how this works" onClick={() => setOnboarding('explain')}><Icon.help /></button>
        </div>
      </header>

      {busy && !building && <p className="busy">{busy}</p>}

      <div className="body">
        {briefOpen && (
          <BriefRail
            product={product}
            taste={taste}
            onProduct={setProduct}
            onCopy={() => page && void copy(pageBrief(page, product.name), 'Page brief')}
            onTaste={(t) => {
              setTaste(t)
              setPages((all) => all.map((p) => ({ ...p, taste: t })))
            }}
          />
        )}

        {view === 'studio' && building && pages.length < 2 && (
          <main className="stage">
            <Building arrived={building.arrived} total={8} landed={building.landed} thoughts={building.thoughts}
              model={chosen().label} />
          </main>
        )}

        {view === 'studio' && page && !(building && pages.length < 2) && (
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
                      {d === 0
                        ? <iframe title={p.id} srcDoc={html} sandbox="allow-scripts allow-same-origin" />
                        : <Aside page={p} title={product.name} />}
                    </div>
                  )
                })}
              </div>
              <Dock
                at={at} count={pages.length} angle={page.angle} world={page.world} bar={bar} busy={!!busy}
                pinned={!!page.pinned} flags={flags}
                onBar={setBar} onRun={runBar}
                onModel={() => setOnboarding('first')}
                onGo={(i) => setAt(Math.max(0, Math.min(i, pages.length - 1)))}
                onWorld={() => setPage(cycleWorld)}
                onPin={pin}
                onKill={() => kill(at)}
                onSend={askedFrom ? sendBack : undefined}
                onOpen={() => void host.preview(renderPage(page, { title: product.name })).then(() => flash('Opened in your browser.'))}
                onShip={() => void host.exportPage(renderPage(page, { title: product.name }), shipName).then(
                  (r) => r && flash(`${r.file} saved, ${r.bytes.toLocaleString()} bytes.`),
                )}
              />
            </main>

            <SectionsRail
              page={page}
              selected={selected}
                            onSelect={setSelected}
              onCycle={(id) => setPage((p) => cycleForm(p, id))}
              onDrop={(id, onto, after) => setPage((p) => dropSection(p, id, onto, after))}
              onToggle={(id) => setPage((p) => ({
                ...p,
                sections: p.sections.map((s) => (s.id === id ? { ...s, on: !s.on } : s)),
              }))}
              onFanOut={(id) => {
                const alts = sectionAlternatives(page, id)
                setPages((all) => [...all.slice(0, at + 1), ...alts.slice(1), ...all.slice(at + 1)])
                flash(`${alts.length - 1} more layouts are waiting to the right.`)
              }}
              onDraw={(id) => void drawImage(id)}
              onAdd={(role: Role) => setPage((p) => addSection(p, role, product.name))}
            />
          </>
        )}

        {view === 'wall' && (
          <main className="grid">
            {pages.map((p, i) => (
              <Cell key={p.id} page={p} title={product.name} current={i === at}
                canCull={!p.pinned && pages.length > 1}
                onOpen={() => { setAt(i); setView('studio') }}
                onCull={() => kill(i)} />
            ))}
          </main>
        )}

        {/* only when there is genuinely nothing happening: while a wall is being made the
            skeleton is already saying so, and both at once made the skeleton look like a
            decoration on top of a dead app */}
        {!page && !building && view === 'studio' && !onboarding && (
          <main className="empty">
            <p>There is no page yet.</p>
            <p className="dim">Open the brief, describe the product, then press write a new wall.</p>
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

/**
 * A paper beside the centre: still, frozen backdrop, and memoised on the page object, so
 * typing in the bar or a toast appearing never re-parses four documents. Handlers are not
 * compared because they are recreated every render on purpose; the page is the identity.
 */
const Aside = memo(function Aside({ page, title }: { page: Page; title: string }) {
  return <iframe title={page.id} srcDoc={renderPage(page, { title, still: true })}
    sandbox="allow-scripts allow-same-origin" />
})

/** One grid cell: still page, frozen backdrop, verdict computed once per page object. */
const Cell = memo(function Cell({ page, title, current, canCull, onOpen, onCull }: {
  page: Page; title: string; current: boolean; canCull: boolean
  onOpen: () => void; onCull: () => void
}) {
  const cellHtml = useMemo(() => renderPage(page, { title, still: true }), [page, title])
  // the verdict sits on every cell, so the generic pages announce themselves while you are
  // deciding which cells to cull
  const verdict = useMemo(() => slop(page, cellHtml), [page, cellHtml])
  return (
    <div className={`cell ${current ? 'on' : ''}${page.pinned ? ' pinned' : ''}`} onClick={onOpen}>
      <Preview html={cellHtml} />
      {/* elimination is the grid's other act: drop a cell and the survivors spread out,
          so eight become one by removing rather than by staring */}
      {canCull && (
        <button className="cull" aria-label="remove this page"
          title="take this page off the wall. z brings it back."
          onClick={(e) => { e.stopPropagation(); onCull() }}><Icon.x /></button>
      )}
      <div className="cellbar">
        <span className="arch">{page.sections.filter((s) => s.on).length} sections</span>
        <span className="tname">{page.taste.name}</span>
        <span className={verdict.length ? 'flags' : 'flags ok'}
          title={verdict.length
            ? verdict.map((f) => `${f.label}. ${f.why}`).join('\n')
            : 'none of the catalogued generic patterns'}>
          {verdict.length ? `${verdict.length} generic` : 'clean'}
        </span>
        {page.pinned && <span className="kept">pinned</span>}
      </div>
    </div>
  )
}, (a, b) => a.page === b.page && a.title === b.title && a.current === b.current && a.canCull === b.canCull)

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
      <iframe title="alternative" srcDoc={html} scrolling="no" loading="lazy"
        style={{ width: PAGE_W, height: 1707, transform: `scale(${scale})` }} />
    </div>
  )
}

;(window as unknown as { __wall?: unknown }).__wall = { setMock }
