import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  readTasteLog, recordWall, storyOf, tasteFromImage, tasteLean,
  type Judged, type Taste, type TasteLog,
} from '@/taste'
import { PRESETS } from '@/design/presets'
import { asKind } from '@/design/kinds'
import { ROLE_LABEL, applyEdit, migratePage, starterPage, type Page, type Role } from '@/sections'
import { renderBody, renderPage, shellOf } from '@/render'
import { pageBrief } from '@/brief'
import { slop } from '@/slop'
import {
  EMPTY_PRODUCT, addSection, alternatives, arrangeIn, dealShapes, readBrief, canDraw, canWrite, choose, chosen, setMemory, cycleForm, cycleWorld, dropSection, dealWritten, writeOne, writeWhole, illustrate, loadHeldKeys, loadKeys, promptPage, sectionAlternatives, seeded, setMock, type Product,
} from '@/compose'
import { Onboarding } from '@/Onboarding'
import { SectionsRail } from '@/SectionsRail'
import { Dock } from '@/Dock'
import { Building } from '@/Building'
import { Icon } from '@/icons'
import { WORLDS, register as registerWorlds, worldById } from '@/worlds'
import type { Direction } from '@/design/directions'

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
  const [building, setBuilding] = useState<{ landed: number; thoughts: number } | null>(null)
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
  /** the section list is a detail of one paper, so it is a thing you open rather than a wall */
  const [railOpen, setRailOpen] = useState(false)
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
  /**
   * The rest of the judgement, kept beside the graveyard so a choice can say why it was made.
   *
   * A pin and a cull are visible on the wall; asking the bar for tighter spacing and retyping a
   * headline are not, and they are the two clearest statements of taste a session produces. Both
   * carry which paper they were aimed at, because a rewrite keeps the paper's id and every paper
   * on a wall shares its section ids, so an unlabelled note would read as a note about all nine.
   */
  const asked = useRef<{ said: string; of: string }[]>([])
  const edited = useRef<{ path: string; of: string }[]>([])
  /**
   * What earlier walls kept and killed, and where that memory lives.
   *
   * Two sources that never merge. A window an agent opened reads the project's own file, because
   * a taste belongs to the thing being designed and mixing a client's brand into a side project
   * would be worse than remembering nothing. A window opened by hand reads the browser's. Which
   * one is settled by the brief arriving, so the local read stands aside once it has.
   */
  const memory = useRef<TasteLog>({ format: 1, walls: [] })
  const fromProject = useRef(false)
  /** whether this wall is already in the log, because choosing twice is still one wall */
  const remembered = useRef(false)

  const page = pages[at] ?? null

  /** a new wall is a new triage, so nothing said about the last one travels into it */
  const forgetTriage = useCallback(() => {
    graveyard.current = []
    buried.current.clear()
    asked.current = []
    edited.current = []
    remembered.current = false
  }, [])

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
    forgetTriage()
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
  const scaffold = useCallback(() => {
    forgetTriage()
    /**
     * Nothing, until there is something.
     *
     * The wall used to go up before the model was asked: eight places, each holding a locally
     * arranged page marked as a draft, so there was something to scroll from the first frame. That
     * was right while those drafts were the same kind of thing as the pages replacing them, and
     * stopped being right when every place became a page written whole. Eight templates appearing
     * at once and then being replaced is a worse first impression than an empty wall filling up:
     * it shows the one thing this product is not, first, and eight times.
     *
     * So a place exists once its page does. They arrive one at a time as their calls return, and
     * the count in the status line is the honest measure of how far along it is.
     */
    forgetTriage()
    slots.current = []
    setPages([])
    setDrafts(new Set())
    setAt(0)
  }, [forgetTriage])

  /**
   * Fill the wall. With a key every paper is written from a different angle and lands as
   * soon as its own call returns, so the wall fills in front of you. With no key the same
   * copy is arranged eight ways, which still gives something to choose between.
   */
  const fill = useCallback(async (base: Page, p: Product) => {
    const mine = ++run.current
    scaffold()
    // read once per wall rather than once per call, so a log edited between walls is picked up
    // and a wall in flight cannot change its mind halfway through
    setMemory(tasteLean(memory.current, asKind(p.kind)))
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
    setBuilding({ landed: 0, thoughts: 0 })
    setBusy('designing')
    const jobs: Promise<{ ok: number; error?: string }>[] = []

    /**
     * Put a paper in its own place on the wall.
     *
     * A written page arrives with an id of its own, so the first time one lands for a slot it
     * takes over from the draft standing there rather than being appended beside it. That is
     * what makes the wall improve in front of you instead of growing to sixteen papers.
     */
    const land = (page: Page, i: number) => {
      if (run.current !== mine) return
      /**
       * A place on the wall, held by index rather than by the id of whatever is in it.
       *
       * This used to replace a draft by matching its id, which worked while every place opened
       * holding one. With the drafts gone there was nothing to match, so it fell through to
       * appending, and anything that lands twice in the same place appended twice: a copy repair
       * comes back as a new page with a new id, so a wall of eight quietly became a wall of nine.
       * The place is the identity, and what is standing in it is a detail.
       */
      const held = slots.current[i]
      // a place turned away during triage turns away the page still being written for it, or the
      // wall grows back the one paper the reader just took off it
      if (held && buried.current.has(held)) {
        buried.current.add(page.id)
        return
      }
      slots.current[i] = page.id
      setPages((all) => {
        const at = held ? all.findIndex((x) => x.id === held) : -1
        if (at < 0) return [...all, page]
        const next = [...all]
        next[at] = page
        return next
      })
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
    /**
     * Every place on the wall goes to a page the model writes whole.
     *
     * This started as three of eight beside five arranged ones, which was an experiment with a
     * control: same look, same faces, same wall, and whichever half survived triage was the
     * answer. The three written pages were the ones worth keeping, so they are the wall now.
     *
     * The arranged path is not deleted and is not dead. It is the floor: a place whose written
     * page comes back unusable is arranged instead, below, because eight papers beats seven and a
     * gap, and because a day when the model cannot write markup should cost a duller wall rather
     * than no wall. Turning this back down is one number.
     */
    const WHOLE = 8
    const deck = dealWritten(WHOLE)
    // one silhouette each, so the wall disagrees about shape as well as about subject
    const shapes = dealShapes(WHOLE)
    const arrangeInstead: number[] = []
    const wholeJobs = deck.map((d: Direction, at: number) =>
      writeWhole(base, p, d, at, shapes[at], 'model', () => {
        if (run.current === mine) setBuilding((b) => (b ? { ...b, thoughts: b.thoughts + 1 } : b))
      }).then((made) => {
        if (run.current !== mine) return { ok: 0 }
        if (made) {
          land(made, at)
          setBuilding((b) => (b ? { ...b, landed: b.landed + 1 } : b))
          return { ok: 1 }
        }
        // the place keeps its arranged draft for now and is written properly below
        arrangeInstead.push(at)
        return { ok: 0 }
      }).catch((e) => {
        arrangeInstead.push(at)
        return { ok: 0, error: String(e instanceof Error ? e.message : e).slice(0, 160) }
      }),
    )
    const first = await Promise.all(wholeJobs)
    if (run.current !== mine) return

    /**
     * The floor, run only for the places nothing came back for.
     *
     * The arranged path is still the whole of the old machinery, and it stays reachable for the
     * one case that matters: a reply that could not be used. A page arranged from a built-in world
     * is duller than one the model drew, and it is a page, which beats a place on the wall still
     * wearing a draft that says it is a draft.
     */
    if (arrangeInstead.length) {
      setBusy('writing')
      const spare = WORLDS.filter((w) => !w.library)
      registerWorlds(spare)
      await Promise.all(
        arrangeInstead.map(async (at, n) => {
          const world = spare[n % spare.length]
          const wrote = await writeOne(base, p, world, at, (pg) => land(pg, at))
          /**
           * And a floor under the floor.
           *
           * The fallback is itself a model call, so it can fail too, and when it did the place was
           * left with nothing in it: a bench run came back with six papers on a wall of eight and
           * said so only in a status line. A page arranged locally from a built-in world against
           * the copy the brief already seeded needs no model at all. It is the dullest page the
           * app can make and it is a page, which beats a wall that is quietly short.
           */
          if (!wrote.ok) land(arrangeIn(base, at + 1, world), at)
          return wrote
        }),
      )
    }
    const results: { ok: number; error?: string }[] = [...first, ...(jobs.length ? await Promise.all(jobs) : [])]
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
    // the browser's own memory, which a brief arriving from outside overrides rather than joins
    void host.readTaste().then((raw) => {
      if (!fromProject.current) memory.current = readTasteLog(raw)
    })
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
      // this project's memory is the memory now, and a project with no file yet starts empty
      // rather than inheriting whatever this browser remembers about somebody else's product
      fromProject.current = true
      memory.current = readTasteLog(req.taste)
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
        setBuilding({ landed: 0, thoughts: 0 })
      } else {
        /**
         * Reading the brief is a model call of its own, and the wait belongs to it.
         *
         * This used to put a whole wall up first, arranged from the brief as it stood, so the
         * reading happened behind something worth looking at. Those were templates, and once every
         * paper became a page written whole they were the one thing on screen that this product is
         * not, shown first and eight times. The skeleton is the honest version again: it holds the
         * shape of what is coming and claims nothing has arrived, which is true.
         */
        setProduct(provisional)
        scaffold()
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
        // noted against the paper it happened on, because retyping the same line on two papers is
        // two judgements and every paper on a wall shares its section ids
        edited.current.push({ path: d.path, of: page?.id ?? '' })
        setPages((all) => all.map((p, i) => (i === at ? applyEdit(p, d.path!, d.value ?? '') : p)))
      } else if (d?.wall === 'move' && d.id && d.onto) {
        setPages((all) => all.map((p, i) => (i === at ? dropSection(p, d.id!, d.onto!, !!d.after) : p)))
      } else if (d?.wall === 'select' && d.id) setSelected(d.id)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [at, page?.id])

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
      // the way back out of one paper, because reading one is a detour from comparing eight
      if (e.key === 'Escape') setView('wall')
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
    // kept only once the rewrite landed, because an instruction the model never answered says
    // nothing about the page that was chosen
    asked.current.push({ said: instruction, of: here })
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

  /**
   * The wall as a judgement, gathered at the moment of choosing.
   *
   * A culled page was turned away in a pass over nine papers, so nobody ever opened it and no
   * verdict on it was written down. Every paper is measured here instead: rendering one and
   * reading the detector over it is a fraction of a millisecond, and a verdict kept up to date
   * through every rewrite would be state that can go stale.
   *
   * The story goes out with this page and the log stays behind for the next wall, so they are
   * gathered together and written apart. Once per wall, because shipping twice is still one
   * choice, and a wall counted twice would weigh double against every other wall in the file.
   */
  function judge(chosen: Page) {
    const judged = (p: Page): Judged => ({
      page: p,
      world: worldById(p.world),
      flags: slop(p, renderPage(p, { title: product.name })),
    })
    // an edit is stored against the section it landed on, and a section id means nothing outside
    // this app, so it is handed over as the role that section argues
    const roleOf = new Map(chosen.sections.map((s) => [s.id, s.role]))
    const dotted = (path: string) => {
      const [id, ...rest] = path.split('.')
      const role = roleOf.get(id)
      return role ? [role, ...rest].join('.') : null
    }
    const pins = pages.filter((p) => p.pinned && p.id !== chosen.id).map(judged)
    const kills = graveyard.current.map((g) => judged(g.page))
    const said = asked.current.map((a) => ({ said: a.said, chosen: a.of === chosen.id }))
    const story = storyOf({
      of: pages.length + graveyard.current.length,
      pins,
      kills,
      asked: said,
      edited: edited.current
        .filter((e) => e.of === chosen.id)
        .map((e) => dotted(e.path))
        .filter((p): p is string => p !== null),
    })
    if (!remembered.current) {
      remembered.current = true
      memory.current = recordWall(memory.current, {
        at: new Date().toISOString().slice(0, 10),
        // through the same normaliser the read side uses. A wall filed under one string and
        // looked up under another is a memory that silently never applies, and state saved
        // before kinds existed comes back with none at all
        kind: asKind(product.kind),
        chosen: judged(chosen),
        pins,
        kills,
        asked: said,
      })
    }
    return { story, log: memory.current }
  }

  /** Hand the chosen page back as a spec, a render and the page itself. */
  async function sendBack() {
    if (!page || !askedFrom) return
    const { story, log } = judge(page)
    const res = await host.handoff(askedFrom, {
      'chosen.md': pageBrief(page, product.name, story),
      'chosen.html': renderPage(page, { title: product.name }),
      // additive under the same format, because bumping it would make every installed reader
      // refuse the file to protect them from a field they can ignore
      'chosen.json': JSON.stringify({ format: 2, product, page, story }, null, 2),
      // the project's memory rides in the same call. It sorts after chosen.md, which is the file
      // an agent polls for, and nothing waits on this one, so arriving last costs nobody anything
      'taste.json': JSON.stringify(log, null, 2),
    })
    flash(res.error ? `Could not write the handoff: ${res.error}` : 'Sent back. Your agent can pick it up now.')
  }

  /**
   * Write the page out as one file, which is what choosing means when nobody asked for it.
   *
   * The memory goes to the browser here rather than to a project, because a window opened by hand
   * is not standing in anybody's repository and has nowhere else to put it.
   */
  async function shipPage() {
    if (!page) return
    const { log } = judge(page)
    if (!askedFrom) await host.writeTaste(log)
    const r = await host.exportPage(renderPage(page, { title: product.name }), shipName)
    if (r) flash(`${r.file} saved, ${r.bytes.toLocaleString()} bytes.`)
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
          {/* The section list belongs to one paper, so it opens from here rather than standing
              beside the wall taking a column of it. */}
          <button className={railOpen ? 'on' : ''} onClick={() => setRailOpen((v) => !v)}
            disabled={!page} title="the sections of the paper you are on">sections</button>
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
            ? `${building.landed} of 8 written${building.thoughts ? `, ${clock(building.thoughts)} thinking` : ''}`
            : busy}
        </p>
      )}

      <div className="body">

        {view === 'studio' && (busy || building) && !pages.length && (
          <main className="stage">
            <Building landed={building?.landed ?? 0} total={8} thoughts={building?.thoughts ?? 0} />
          </main>
        )}

        {view === 'studio' && page && !((busy || building) && !pages.length) && (
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
                        ? <Paper page={p} title={product.name} editable />
                        : <Aside page={p} title={product.name} />}
                    </div>
                  )
                })}
              </div>
              <Dock
                at={at} count={pages.length} angle={page.angle} world={page.world} bar={bar} busy={!!busy}
                flags={flags} written={page.written}
                onBar={setBar} onRun={runBar}
                onModel={() => setOnboarding('first')}
                onGo={(i) => setAt(Math.max(0, Math.min(i, pages.length - 1)))}
                onKill={() => kill(at)}
                onSend={askedFrom ? sendBack : undefined}
                onOpen={() => void host.preview(renderPage(page, { title: product.name })).then(() => flash('Opened in your browser.'))}
                onShip={() => void shipPage()}
              />
            </main>

            {railOpen && <SectionsRail
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
            />}
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
 * One paper, written once and patched after.
 *
 * A page arrives a section at a time, and handing the iframe a new srcDoc for each of them threw
 * the document away and built another: measured, one changed word cost two document loads, the
 * inline faces decoded again, the backdrop restarted and the scroll went to the top. What a
 * reader should see is a paper gaining a section, and what they saw was a paper reloading.
 *
 * So the document is written when its shell changes, which is when the world, the backdrop or
 * the look changes, and at every other moment only the sections are posted in. That is the whole
 * trick: the head is identical while the copy is being written, and the head is all the
 * expensive part.
 */
function Paper({ page, title, editable, still }: {
  page: Page; title: string; editable?: boolean; still?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const shell = shellOf(page)
  const written = useRef('')
  // the first write has to be the document, and it carries the sections it has at that moment
  const doc = useMemo(() => renderPage(page, { title, editable, still, live: true }), [shell, title, editable, still])

  useEffect(() => {
    const el = frame.current
    if (!el) return
    if (written.current !== shell) {
      // a new shell is a new document, because the faces and the world's css are in its head
      written.current = shell
      el.srcdoc = doc
      return
    }
    const { html, layout } = renderBody(page)
    el.contentWindow?.postMessage({ wall: 'body', html, layout }, '*')
  }, [page, shell, doc])

  return <iframe ref={frame} title={page.id} srcDoc={doc}
    scrolling={still ? 'no' : undefined}
    sandbox={editable ? 'allow-scripts allow-same-origin' : 'allow-scripts allow-same-origin'} />
}

/**
 * A paper beside the centre: still, frozen backdrop, and memoised on the page object, so
 * typing in the bar or a toast appearing never re-parses four documents. Handlers are not
 * compared because they are recreated every render on purpose; the page is the identity.
 */
const Aside = memo(function Aside({ page, title }: { page: Page; title: string }) {
  return <Paper page={page} title={title} still />
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

// The seam the suites drive the model path through. writeOne is here so the copy repair can be
// asserted on its own: it is the one step whose whole job is to make a second call conditionally,
// and a suite that can only watch the finished wall cannot tell a repair from a first draft.
;(window as unknown as { __wall?: unknown }).__wall = { setMock, writeOne, starterPage, slop, PRESETS, pageBrief }
