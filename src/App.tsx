import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tasteFromImage, type Taste } from '@/taste'
import { PRESETS } from '@/design/presets'
import { ROLE_LABEL, applyEdit, migratePage, starterPage, type Page, type Role } from '@/sections'
import { renderPage } from '@/render'
import { pageBrief } from '@/brief'
import { slop } from '@/slop'
import {
  EMPTY_PRODUCT, addSection, alternatives, arrangeIn, readBrief, canDraw, canWrite, choose, chosen, promptWorlds, setDesigned, cycleForm, cycleWorld, dropSection, writeOne, illustrate, loadHeldKeys, loadKeys, promptPage, sectionAlternatives, seeded, setMock, type Product,
} from '@/compose'
import { Onboarding } from '@/Onboarding'
import { BriefRail } from '@/BriefRail'
import { SectionsRail } from '@/SectionsRail'
import { Dock } from '@/Dock'
import { Building } from '@/Building'
import { Icon } from '@/icons'
import { WORLDS, register as registerWorlds, type World } from '@/worlds'

import { host, isTauri } from '@/host'

const PAGE_W = 1280

/**
 * A beat is the model proving it is still thinking, and the stream emits at most one a second,
 * so the count of them is an elapsed clock wearing the wrong name. Nobody reads "170 beats" as
 * "you have been waiting nearly three minutes", which is the only thing it was ever saying.
 */
const clock = (beats: number) =>
  beats < 60 ? `${beats}s` : `${Math.floor(beats / 60)}m ${String(beats % 60).padStart(2, '0')}s`

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
  /**
   * Which papers are still the locally arranged stand-in rather than a written page.
   *
   * The wall used to be empty for the whole design call, which is about a minute of a skeleton
   * before the first paper, because a page nobody had written looked finished until you read it.
   * The answer to that is to say so rather than to show nothing: eight real pages are up
   * immediately, each one marked, and each is replaced where it stands as its design and then
   * its words arrive.
   */
  const [drafts, setDrafts] = useState<ReadonlySet<string>>(new Set())
  /** which paper holds each of the eight places, so a slot can be upgraded rather than appended */
  const slots = useRef<string[]>([])
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)
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
    // The timer belongs to the message on screen, not to the one that set it. Without this a
    // message arriving two seconds after another was taken away by the first one's timer a
    // moment later, so "sent back" could appear and vanish inside the same second.
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
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
   * Put the wall up before anything has been asked of a model.
   *
   * These are arranged from the built-in worlds against the copy the brief already seeded, so
   * there is something to compare, scroll and open from the first frame, and each is marked as
   * a draft so it is not mistaken for a written page. Every place one takes is a place a written
   * page will land in, so the wall improves where it stands instead of appearing all at once.
   *
   * It is separate from fill because the paint is worth having before the writing is possible:
   * a run that has to read the brief first can put this up and read behind it.
   *
   * Nine: the page as it was given, which stays as the thing to compare against, and eight
   * places that each hold a draft until the written page for that place arrives.
   */
  const scaffold = useCallback((base: Page) => {
    // a new wall is a new triage
    graveyard.current = []
    buried.current.clear()
    const first = alternatives(base, 9)
    slots.current = first.slice(1).map((x) => x.id)
    setPages(first)
    setDrafts(new Set(slots.current))
    setAt(0)
  }, [])

  /**
   * Fill the wall. With a key every paper is written from a different angle and lands as
   * soon as its own call returns, so the wall fills in front of you. With no key the same
   * copy is arranged eight ways, which still gives something to choose between.
   */
  const fill = useCallback(async (base: Page, p: Product) => {
    const mine = ++run.current
    scaffold(base)
    // a served deployment answers which keys it holds asynchronously, and someone clicking
    // straight through setup can arrive here before that answer does
    if (!canWrite()) await loadHeldKeys()
    if (!canWrite()) {
      // nothing more is coming, so these are the finished pages rather than stand-ins
      setDrafts(new Set())
      return
    }
    // Each page starts the moment its own world is finished, rather than when the whole design
    // is. Writing the wall in one call instead was measured against this and came out the same
    // within noise, so this stays: one path, and the earliest first paper.
    setBuilding({ arrived: null, landed: [], thoughts: 0 })
    setBusy('designing')
    const jobs: Promise<{ ok: number; error?: string }>[] = []
    const started: World[] = []

    /**
     * Put a paper in its own place on the wall.
     *
     * A written page arrives with an id of its own, so the first time one lands for a slot it
     * takes over from the draft standing there rather than being appended beside it. That is
     * what makes the wall improve in front of you instead of growing to sixteen papers.
     */
    const land = (page: Page, i: number) => {
      if (run.current !== mine) return
      const held = slots.current[i]
      if (held && held !== page.id) {
        // a draft turned away during triage turns away the page that was being written for it,
        // or the wall would grow back the one place the reader just took off it
        if (buried.current.has(held)) {
          buried.current.add(page.id)
          return
        }
        slots.current[i] = page.id
        setPages((all) => all.map((x) => (x.id === held ? page : x)))
        setDrafts((d) => {
          const next = new Set(d)
          next.delete(held)
          return next
        })
        return
      }
      upsertPage(page)
    }

    const startPage = (world: World, i: number) => {
      // the wall has as many places as it has drafts, and a call that answers with more worlds
      // than it was asked for cannot be allowed to grow one
      if (run.current !== mine || started[i] || i >= slots.current.length) return
      started[i] = world
      registerWorlds([world])
      // The design is worth showing before the words are. A world is finished several seconds
      // before the page written in it, and restyling the draft in place the moment it lands
      // means the wall visibly turns into the designed one while the copy is still being
      // written, rather than staying still until a whole page is ready.
      const held = slots.current[i]
      if (held) upsertPage({ ...arrangeIn(base, i + 1, world), id: held })
      setBuilding((b) => ({ arrived: jobs.length + 1, landed: started.filter(Boolean).map((w) => w.name), thoughts: b?.thoughts ?? 0 }))
      setBusy('writing')
      jobs.push(writeOne(base, p, world, i, (page) => land(page, i)))
    }

    /**
     * A world that is already written costs nothing to design, so its page starts writing at once.
     *
     * Every slot used to wait on the design call, and that call spends about fifty seconds
     * thinking before it writes a character, so the first written page could not arrive before
     * about seventy. Three of the built-in worlds are seeded here instead: there is nothing to
     * design, only copy to write, so three of the nine start at the first frame and the model is
     * asked for five worlds rather than eight, which is three design calls rather than four.
     *
     * Which three is a taste decision rather than a speed one, and it used to be shadcn, material
     * and carbon, which are faithful reproductions of other people's systems and therefore the
     * three most restrained pages on the wall. They were chosen because they were free, and every
     * built-in world is equally free, so the saving is kept and the three places now go to worlds
     * that commit to something. The libraries remain in the deck and one press of w away.
     *
     * These are the same three the deck deals into those places, so the written page lands in the
     * world its draft was already wearing and the wall gains words rather than changing shape.
     */
    const SYSTEMS = ['editorial', 'poster', 'terminal']
    const seeded = WORLDS.filter((w) => SYSTEMS.includes(w.id))

    /**
     * The design calls are dispatched before the seeded pages start writing.
     *
     * Every call is a whole session and only five run at once, so the order they are asked in is
     * the order they get the machine. Seeding first put three copy calls in front of the design
     * calls, which are the long pole and the thing the reader is actually waiting on, and the
     * copy for a page whose design is already on screen can wait its turn.
     */
    const designing = promptWorlds(p, 8 - seeded.length, (w, i) => startPage(w, i + seeded.length), 'model', () => {
      if (run.current === mine) setBuilding((b) => (b ? { ...b, thoughts: b.thoughts + 1 } : b))
    })
    seeded.forEach((w, k) => startPage(w, k))
    const worlds = await designing
    if (run.current !== mine) return
    setDesigned(worlds)
    registerWorlds(worlds)
    setBusy('writing')

    // a provider that does not stream hands the worlds over at the end, so anything that did
    // not arrive as it was written starts here
    worlds.forEach((w, i) => startPage(w, i + seeded.length))
    const results = await Promise.all(jobs)
    const written = results.reduce((x, r) => x + r.ok, 0)
    const error = results.find((r) => r.error)?.error

    if (run.current !== mine) return
    setBusy('')
    setBuilding(null)
    // nothing else is coming, so whatever is still standing is the finished page
    setDrafts(new Set())
    if (!written) {
      flash(error ? `The model call failed: ${error}` : 'No copy came back, so the wall is arranged locally instead.')
    } else {
      flash(
        error
          ? `${written} of 8 pages written. The rest failed: ${error}`
          : `${written} written pages. Use the arrow keys to compare the angles.`,
      )
    }
  }, [upsertPage, scaffold])

  const build = useCallback((p: Product, t: Taste) => {
    void fill(seeded(starterPage(t, p.name || 'Product', p.kind), p), p)
  }, [fill])

  /**
   * Ask the deployment what it can write with, before anything gates on having a model.
   *
   * The answer arrives after the first render and every gate reads it synchronously, so it is
   * counted here: without a state change nothing renders again, and the setup screen would go
   * on offering the local Claude on a machine that has none, or hiding it on one that has it.
   */
  const [, knewKeys] = useState(false)
  useEffect(() => {
    void loadHeldKeys().then(() => knewKeys(true))
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
      // The writer of this file is kept current by npx while the reader can be any age, so a
      // shape this build does not know is refused rather than half read into a wrong brief.
      if (req.format !== 1) {
        flash(`This brief says format ${req.format ?? 'nothing'}, and this build reads format 1. Update whichever is older.`)
        return
      }
      // an agent opened this window, so the Claude that opened it is right there. Nothing to
      // configure is a better first run than a good default.
      if (!localStorage.getItem('wall-model')) choose('claude-code')
      setAskedFrom(req.dir)
      setOnboarding(null)
      // The agent that asked already knew what this is, so if it said so there is nothing to
      // work out. Reading the brief back through a model cost about forty seconds to recover
      // what the caller had already written down.
      const told = req.oneLiner?.trim()
      // Everything the caller supplied, and the brief itself standing in for whatever it did
      // not. This is enough to arrange a wall from, which is the point: it is either the brief
      // in full or a usable guess at it, and neither needs waiting for.
      const provisional: Product = {
        ...EMPTY_PRODUCT,
        name: req.name?.trim() || 'Product',
        oneLiner: told || req.brief,
        what: req.what?.trim() || req.brief,
        audience: req.audience?.trim() || '',
        cta: req.cta?.trim() || EMPTY_PRODUCT.cta,
      }
      if (told) {
        // nothing to read, so the next thing on screen is the wall itself a moment later
        setBuilding({ arrived: null, landed: [], thoughts: 0 })
      } else {
        // Reading the brief is a model call of its own, and the wait for it used to be spent
        // looking at a placeholder. There is a whole wall to look at instead, arranged from the
        // brief as it stands, so the reading happens behind something worth reading.
        setProduct(provisional)
        scaffold(seeded(starterPage(taste, provisional.name, provisional.kind), provisional))
        setBusy('reading the brief')
      }
      await loadHeldKeys()
      // A wall with nothing to write it is still eight arranged pages, and they look finished
      // until you read them. Someone who arrived here from their agent never chose a model and
      // has no reason to suspect it, so the app is the one that has to say so.
      if (!canWrite()) {
        flash('No model can write here: there is no key and no claude command on this machine, so these pages are arranged rather than written.')
      }
      const read = !told && canWrite() ? await readBrief(req.brief).catch(() => null) : null
      setBusy('')
      const p = told ? provisional : read?.product ?? provisional
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
      // the dock no longer names the world, so this is the way to move a page to the next one
      if (e.key === 'w') setPage(cycleWorld)
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
    /**
     * The rewrite lands on the paper you asked from.
     *
     * A rewritten page comes back with an id of its own, and it used to be added at the end of
     * the wall, so asking for a punchier headline grew the wall to ten and moved you to a paper
     * you had not been reading. The bar says what to change about this page, so this page is
     * what changes: the reply keeps the place, the pin and the position it was asked from, and
     * the wall stays the size the reader left it.
     */
    const here = page.id
    // rewriting in place means a call that dies halfway leaves the paper halfway, so the page
    // as it stands is held until there is a whole one to put in its place
    const was = page
    const onto = (p: Page) => upsertPage({ ...p, id: here, pinned: was.pinned })
    const made = await promptPage(page, instruction, product, 'model', onto)
      .catch((e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 160))
    setBusy('')
    if (!made || typeof made === 'string') {
      upsertPage(was)
      flash(made ? `The model call failed: ${made}` : 'No usable copy came back. A plainer instruction usually works.')
      return
    }
    onto(made)
    setBar('')
    flash('This page has been rewritten.')
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

      {/* the wall is up from the first frame, so the progress is a line rather than a screen.
          It still has to prove the model is alive: the design call spends about fifty seconds
          thinking before it writes a character, and a minute of silence reads as a hang */}
      {busy && (
        <p className="busy">
          {building
            ? `${busy}, ${building.landed.length} of 8 designed${building.thoughts ? `, ${clock(building.thoughts)}` : ''}`
            : busy}
        </p>
      )}

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
            <Building arrived={building.arrived} total={8} thoughts={building.thoughts} />
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
                flags={flags}
                onBar={setBar} onRun={runBar}
                onModel={() => setOnboarding('first')}
                onGo={(i) => setAt(Math.max(0, Math.min(i, pages.length - 1)))}
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
                draft={drafts.has(p.id)}
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
const Cell = memo(function Cell({ page, title, current, draft, canCull, onOpen, onCull }: {
  page: Page; title: string; current: boolean; draft: boolean; canCull: boolean
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
        {/* a page nobody has written yet looks finished until you read it, so it says which
            it is rather than borrowing the confidence of a written one */}
        {draft
          ? <span className="flags" title="a local stand-in until the written page lands here">drafting</span>
          : <span className={verdict.length ? 'flags' : 'flags ok'}
          title={verdict.length
            ? verdict.map((f) => `${f.kind}: ${f.label}. ${f.why}`).join('\n')
            : 'none of the catalogued generic patterns'}>
          {/* Two counts rather than one, because they are two faults with two owners: the
              design is the world's and the words are the writer's, and one number for both
              is unreadable. A world the house proves is design-clean showed "1 generic" on a
              real wall and the flag was in its copy, which cost a measurement to work out. */}
          {verdict.length
            ? [
                verdict.filter((f) => f.kind === 'design').length && `${verdict.filter((f) => f.kind === 'design').length} design`,
                verdict.filter((f) => f.kind === 'copy').length && `${verdict.filter((f) => f.kind === 'copy').length} copy`,
              ].filter(Boolean).join(', ')
            : 'clean'}
        </span>}
      </div>
    </div>
  )
}, (a, b) => a.page === b.page && a.title === b.title && a.current === b.current
  && a.canCull === b.canCull && a.draft === b.draft)

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
