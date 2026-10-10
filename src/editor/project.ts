/** The durable document, shared by the editor and the local server. Times are milliseconds. */
import { LOOKS, type Look } from '../design/looks'
export type Purpose = 'entrance' | 'emphasis' | 'idle' | 'interaction'
export type Brief = { purpose: Purpose; intensity: 'range' | 'subtle' | 'expressive' | 'bold'; duration: number; direction: string }
export type Subject = { id: string; name: string; html: string; css: string; w: number; h: number; shot?: string; warnings: string[]; source?: string }
export type Motion = { id: string; subjectId: string; css: string; scope: string; note: string; treatment: string; verb?: string; errand?: string; assembled?: { ok: boolean; notes: string[] }; brief: Brief; duration: number; saved?: boolean; seen?: { blank: number; escape: number; stir: number }; parentId?: string }
export type Move = { at: number; duration: number; x: number; y: number; scale: number; ease: string }
export type Track = { id: string; kind: 'component' | 'title' | 'image' | 'audio'; name: string; subjectId?: string; motionId?: string; assetId?: string; text?: string; color: string; fontSize: number; start: number; duration: number; entrance: number; x: number; y: number; width: number; height: number; hidden: boolean; locked: boolean; moves: Move[]; volume: number; sourceStart: number; fadeIn: number; fadeOut: number; after?: { key: string; mode: 'after' | 'with'; gap: number }; look?: Look; zoom?: number; focus?: { x: number; y: number }; label?: string; caption?: string }
export type Asset = { id: string; name: string; kind: 'image' | 'audio'; mime: string; duration?: number; waveform?: number[]; width?: number; height?: number }
export type Arrangement = { id: string; name: string; tracks: Track[]; camera: Move[]; settings?: Project['settings'] }
export type FilmDirection = { version: 1; clock?: string; brief?: unknown; scenes: { sceneId: string; trackId: string; at: number; seconds: number; elements: string[] }[]; events: { id: string; trackId?: string; at: number; kind: string; phase?: number }[]; transitions: { id: string; from: string; to: string; trackId: string }[] }
/** What a film was asked to be and where it came from, kept so a later change reads it instead of guessing it back from geometry. */
export type FilmMeta = { art?: 'mix'; pace?: 'calm' | 'brisk' | 'fast'; scenes?: { ids: string[]; layout?: string; hold?: string }[]; origin?: { tool: string; sourceProjectId: string; request?: string; at: number } }
export type Project = { version: 1; direction?: FilmDirection; film?: FilmMeta; id: string; revision: number; name: string; updatedAt: number; source: string; subjects: Subject[]; motions: Motion[]; tracks: Track[]; camera: Move[]; assets: Asset[]; arrangements: Arrangement[]; settings: { width: number; height: number; fps: number; duration: number; background: string; from: number; to: number }; brief: Brief }
export const uid = () => crypto.randomUUID()
/** A project as the studio lists it, which is all a takes list needs without opening every film. */
export type ProjectSummary = { id: string; name: string; updatedAt?: number; origin?: FilmMeta['origin'] | null }
/**
 * The takes around a film: the one it was made from, the takes made from it, and its siblings,
 * newest first. An agent's change is always a new take, so this is where a person finds it.
 */
export function takesOf(project: Project, list: ProjectSummary[]) {
  const parent = project.film?.origin?.sourceProjectId
  return list.filter((p) => p.id !== project.id && (p.id === parent || p.origin?.sourceProjectId === project.id || (!!parent && p.origin?.sourceProjectId === parent)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((p) => ({ id: p.id, name: p.name, note: p.id === parent ? 'The film this take was made from' : p.origin?.request || `Made by ${p.origin?.tool || 'a fork'}` }))
}
export const defaultBrief: Brief = { purpose: 'entrance', intensity: 'range', duration: 1000, direction: '' }
export function createProject(name = 'Untitled film'): Project {
  return { version: 1, id: uid(), revision: 0, name, updatedAt: Date.now(), source: '', subjects: [], motions: [], tracks: [], camera: [], assets: [], arrangements: [], brief: { ...defaultBrief }, settings: { width: 1920, height: 1080, fps: 30, duration: 30000, background: '#101319', from: 0, to: 30000 } }
}
export function newTrack(kind: Track['kind'], name: string, at = 0): Track {
  return { id: uid(), kind, name, color: '#f4f4f5', fontSize: 64, start: at, duration: 5000, entrance: 0, x: 15, y: 20, width: 70, height: 60, hidden: false, locked: false, moves: [], volume: 0.7, sourceStart: 0, fadeIn: 200, fadeOut: 400 }
}
export type Pace = 'calm' | 'brisk' | 'fast'
export type Layout = 'full' | 'detail' | 'pair' | 'stack'
export type Hold = 'long' | 'normal' | 'short'
/** One shot of the film: one or two elements, how they are laid out, and how long it holds against the others. */
export type Scene = { ids: string[]; layout?: Layout; hold?: Hold }
export type CutOptions = { pace?: Pace; seconds?: number; opening?: string; closing?: string; background?: string; ink?: string; scenes?: Scene[]; art?: 'mix' }
/**
 * The first cut, paced. Calm spreads the kept motions across the film with long titles, the way
 * a person expects when they press the button. Brisk and fast are what "a demo" and "a fast video"
 * mean: shorter titles, shorter shots, and more of them. When there are fewer kept motions than
 * shots, the elements come round again with the frame nudged, so a repeat reads as a new shot and
 * not as a freeze. Everything about the rhythm lives here so the editor and the film tool agree.
 */
export function firstCut(p: Project, opts: CutOptions = {}): Project {
  const chosen = p.subjects.map(s => ({ s, m: [...p.motions].reverse().find(m => m.subjectId === s.id && m.saved) })).filter(x => x.m)
  if (!chosen.length) return p
  const pace: Pace = opts.pace ?? 'calm'
  const title = pace === 'fast' ? 1200 : pace === 'brisk' ? 2000 : 3000
  const shot = pace === 'fast' ? 1300 : pace === 'brisk' ? 2400 : 0
  const asked = opts.seconds ? Math.min(120000, Math.max(6000, Math.round(opts.seconds * 1000))) : 0
  const span = asked || (shot ? Math.min(120000, Math.max(10000, 2 * title + Math.max(6, chosen.length * 2) * shot)) : Math.min(120000, Math.max(15000, 6000 + chosen.length * 6000)))
  const body = span - 2 * title
  /**
   * The shots. Scenes come from the plan when there is one: a heading paired with the visual it
   * introduces, two cards side by side, a screenshot full bleed, a detail pushed in close, the
   * hero held longer. Without a plan every kept motion is one full shot. A brisk or fast film
   * then fills its length: when there are fewer scenes than beats, they come round again with
   * the frame nudged and tightened so a repeat reads as a new shot and not a freeze.
   */
  const byId = new Map(chosen.map(c => [c.s.id, c]))
  const planned = (opts.scenes || []).map(sc => ({ ids: sc.ids.filter(id => byId.has(id)).slice(0, 2), layout: sc.layout, hold: sc.hold || 'normal' })).filter(sc => sc.ids.length)
  const base: Scene[] = planned.length ? planned : chosen.map(c => ({ ids: [c.s.id], layout: 'full', hold: 'normal' }))
  /**
   * How many shots. A planned cut that is close to the beat count keeps its scenes and stretches
   * them a little, rather than coming round again: eight scenes in a ten beat film were filmed as
   * eight plus the hero and a heading twice, which read as padding. Only a plan well short of the
   * beat, or no plan at all, cycles its elements to fill the length.
   */
  const beats = shot ? Math.round(body / shot) : base.length
  const shots = !shot ? base.length : planned.length && planned.length >= beats * 0.7 ? planned.length : Math.max(base.length, beats)
  const weight = (h?: Hold) => h === 'long' ? 1.5 : h === 'short' ? 0.75 : 1
  const list = Array.from({ length: shots }, (_, i) => ({ ...base[i % base.length], round: Math.floor(i / base.length) }))
  const total = list.reduce((a, sc) => a + weight(sc.hold), 0)
  // the film stands on the site's own background, with ink that reads on it, so a dark headline off a light page is not lost on a dark stage
  const ink = opts.ink || (opts.background ? contrastInk(opts.background) : '#f4f4f5')
  if (opts.art === 'mix') return artCut(p, list, byId, { title, span, body, total, weight }, opts)
  const opening = { ...newTrack('title', 'Opening'), text: opts.opening || 'Meet your next great idea', color: ink, x: 10, y: 35, width: 80, height: 25, duration: title, fontSize: 76 }
  const end = { ...newTrack('title', 'Closing', span - title), text: opts.closing || 'See it in action', color: ink, x: 10, y: 35, width: 80, height: 25, duration: title, fontSize: 76 }
  /**
   * Where each element sits, by layout. A box is shrunk when it would blow an element up more
   * than 2.4 times its natural size, because a 300 pixel card drawn five times over is a blur
   * where a heading, being vector, is not; the cap keeps a small card small and lets text grow.
   */
  const boxes = (layout: Layout | undefined, n: number): { x: number; y: number; width: number; height: number }[] => {
    if (n === 2 && layout === 'stack') return [{ x: 12, y: 10, width: 76, height: 32 }, { x: 12, y: 46, width: 76, height: 46 }]
    if (n === 2) return [{ x: 4, y: 18, width: 44, height: 64 }, { x: 52, y: 18, width: 44, height: 64 }]
    if (layout === 'detail') return [{ x: 4, y: 8, width: 92, height: 84 }]
    return [{ x: 12, y: 16, width: 76, height: 68 }]
  }
  const fit = (box: { x: number; y: number; width: number; height: number }, s: Subject) => {
    const scale = Math.min(p.settings.width * box.width / 100 / s.w, p.settings.height * box.height / 100 / s.h)
    if (scale <= 2.4) return box
    const f = 2.4 / scale, width = box.width * f, height = box.height * f
    return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }
  }
  let at = title
  const cuts: Track[] = []
  list.forEach((sc, i) => {
    const step = body * weight(sc.hold) / total
    // a repeat is framed differently enough to read as a new shot: tighter each time round, and
    // swinging to the other side, because a four percent nudge of one small heading was measured
    // as no cut at all off the frames
    const nudge = sc.round % 2 ? 8 : sc.round ? -2 : 0, tighten = Math.min(24, sc.round * 8)
    const moves = shot ? [i % 2 === 0 ? { at, duration: step, x: 0, y: 0, scale: 1.035, ease: 'linear' } : { at, duration: step, x: -1.2, y: 0.4, scale: 1.02, ease: 'linear' }] : []
    boxes(sc.layout, sc.ids.length).forEach((box, k) => {
      const { s, m } = byId.get(sc.ids[k])!
      const b = fit({ x: box.x + nudge + tighten / 2 * (box.width / 76), y: box.y + tighten / 2 * (box.height / 68), width: box.width - tighten * (box.width / 76), height: box.height - tighten * (box.height / 68) }, s)
      // the second element of a pair arrives a beat after the first, so the shot reads left to right or top to bottom
      cuts.push({ ...newTrack('component', s.name, at), duration: step, subjectId: s.id, motionId: m!.id, entrance: k * 160, ...b, moves })
    })
    at += step
  })
  const camera = pace === 'calm' ? [{ at: title, duration: body, x: 0, y: 0, scale: 1.04, ease: 'ease-in-out' }] : [{ at: title, duration: body, x: 0, y: 0, scale: 1.06, ease: 'linear' }]
  return { ...p, tracks: [opening, ...cuts, end], camera, settings: { ...p.settings, duration: span, from: 0, to: span, ...(opts.background ? { background: opts.background } : {}) } }
}
/**
 * A capture's own headline: its first heading, as the page says it. An animated heading is often
 * captured with its next line already inside it, so the words stop where they start again, and a long
 * one stops at its first clause, because a headline is what a person reads at a glance.
 */
export function headingOf(s: Subject, longest = 64): string {
  const m = /<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(s.html)
  const text = (m ? m[2] : '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
  const words = text.split(' '), again = words.findIndex((_, i) => i > 2 && words.slice(i, i + 3).join(' ') === words.slice(0, 3).join(' '))
  const once = (again > 0 ? words.slice(0, again) : words).join(' ')
  if (once.length <= longest) return once
  const clause = once.slice(0, longest).search(/\s[–—-]\s|[,.;:]\s/)
  if (clause > 12) return once.slice(0, clause).trim()
  // no clause to stop at: stop at a word, and never on a small one that leaves the line hanging
  let cut = once.slice(0, once.lastIndexOf(' ', longest - 4))
  while (LOOKS.small.test(cut)) cut = cut.replace(LOOKS.small, '')
  return cut
}
/** what heads a shot: the capture's own heading, or the plan's name for it without its generic noun, or nothing */
export function headlineOf(s: Subject): string {
  // a hero's headline is already the biggest thing on its sheet, so it is not set again beside it
  if (s.w / s.h >= LOOKS.hero) return ''
  // a headline beside a sheet or on a page is read at a glance
  const own = headingOf(s, LOOKS.headlineLength)
  if (own) return own
  const named = s.name.replace(LOOKS.generic, '').trim()
  return named.length <= LOOKS.nameLength && !LOOKS.anonymous.test(named) ? named : ''
}
/**
 * The ink a title is set in, by what it sits on. A sheet's type is printed on the stock, so it takes the
 * stock's ink whatever the product's colours are; a spread's page answers the product's ground, light
 * beside a dark product and dark beside a light one, and its type takes the other. An ink a person asked
 * for wins over both, and the stock's own ink carried over from an earlier cut is not a request.
 */
export function lookInk(look: Look, ground: string, asked?: string): string {
  if (asked && asked.toLowerCase() !== LOOKS.plate.ink) return asked
  if (look === 'plate') return LOOKS.plate.ink
  return contrastInk(ground) === '#f4f4f5' ? LOOKS.editorial.dark : LOOKS.editorial.light
}
const hostOf = (source: string) => { try { return new URL(source).host.replace(/^www\./, '') } catch { return '' } }
/** a heading captured with no picture in it, which a film sets as type rather than filming a strip of it */
const typeOnly = (s: Subject) => s.h <= LOOKS.typeOnly && !/<(img|svg|canvas|video|picture)\b/i.test(s.html) && !!headingOf(s)
/** how far a passage of this capture can be enlarged past fitting its window, or nothing when it would blur before it read as a crop */
function passageZoom(p: Project, s: Subject, r: { width: number; height: number }) {
  const fit = Math.min(p.settings.width * r.width / 100 / s.w, p.settings.height * r.height / 100 / s.h)
  const zoom = Math.min(LOOKS.editorial.zoom, LOOKS.editorial.sharpest / fit)
  return zoom >= LOOKS.editorial.least ? zoom : 0
}
/** the box an element's sheet takes inside a region: its own proportions, enlarged at most 2.4 times, on the region's left edge */
function sheetBox(p: Project, s: Subject, r: { x: number; y: number; width: number; height: number }, align: 'left' | 'center') {
  const scale = Math.min(p.settings.width * r.width / 100 / s.w, p.settings.height * r.height / 100 / s.h, 2.4)
  const width = s.w * scale / p.settings.width * 100, height = s.h * scale / p.settings.height * 100
  return { x: align === 'left' ? r.x : r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height }
}

/**
 * The first cut in the mix of looks from design/looks.ts, rather than one box on a flat colour.
 *
 * The opening and the closing are sheets of type. A heading captured on its own is set as type on a
 * sheet of its own, and a heading paired with its visual is set as the headline beside it. An
 * interface alternates between its whole sheet, printed beside its headline, and a passage of it
 * cropped at twice its size beside a page of type, and a capture that comes back comes back as a
 * passage, a new scale rather than a nudge. A pair prints as two sheets.
 *
 * Shots are framed first and timed second, because a shot framed exactly as an earlier one is the same
 * shot again: it is dropped and its time goes to the others, so a page with few things on it makes a
 * film of fewer, longer shots rather than repeats, except that a fast film may cut back to a framing
 * as long as it never shows the same shot twice in a row. Each shot moves once, on purpose: a sheet is pushed
 * in a little, a passage drifts closer in the runtime, and the film's own camera stays still so the
 * stock never moves under the print.
 */
function artCut(p: Project, list: (Scene & { round: number })[], byId: Map<string, { s: Subject; m?: Motion }>, t: { title: number; span: number; body: number; total: number; weight: (h?: Hold) => number }, opts: CutOptions): Project {
  const host = hostOf(p.source), two = (n: number) => String(n).padStart(2, '0')
  const ground = opts.background || p.settings.background, plateInk = lookInk('plate', ground, opts.ink), pageInk = lookInk('editorial', ground, opts.ink)
  const page = { x: LOOKS.editorial.field * 100, y: 0, width: 100 - LOOKS.editorial.field * 100, height: 100 }, whole = { x: 0, y: 0, width: 100, height: 100 }
  type Item = { s: Subject; m?: Motion }
  type Framing = { kind: 'type' | 'pair' | 'headed' | 'spread' | 'passage' | 'sheet' | 'alone'; sc: Scene; items: Item[]; text?: string; zoom?: number; focus?: { x: number; y: number } }

  // first, how each shot is framed; the captures already shown, and those shown with their headline, make a capture
  // that comes back, by the plan or by the film coming round, a new framing of it rather than the same shot again
  const headed = new Set<string>(), shown = new Set<string>(), framed: Framing[] = []
  let singles = 0
  for (const sc of list) {
    const items = sc.ids.map((id) => byId.get(id)!)
    if (items.length === 1 && typeOnly(items[0].s)) { framed.push({ kind: 'type', sc, items, text: headingOf(items[0].s) }); continue }
    if (items.length === 2 && typeOnly(items[0].s) !== typeOnly(items[1].s)) {
      // a heading paired with the visual it introduces is its headline; shown again, the visual is cropped to a passage beside it
      const sheetOf = items.find((x) => !typeOnly(x.s))!, words = items.find((x) => typeOnly(x.s))!
      const zoom = shown.has(sheetOf.s.id) || sc.round > 0 ? passageZoom(p, sheetOf.s, page) : 0
      shown.add(sheetOf.s.id); headed.add(sheetOf.s.id)
      framed.push({ kind: zoom ? 'spread' : 'headed', sc, items: [sheetOf, words], text: headingOf(words.s, LOOKS.headlineLength), zoom, focus: LOOKS.editorial.focus[sc.round % LOOKS.editorial.focus.length] })
      continue
    }
    if (items.length === 2) { items.forEach((x) => shown.add(x.s.id)); framed.push({ kind: 'pair', sc, items }); continue }
    // a planned detail, a capture coming back, and every other full shot become a passage, if the capture can be cropped sharply
    const s = items[0].s, text = headlineOf(s)
    const asked = sc.layout === 'detail' || sc.round > 0 || shown.has(s.id), detail = asked || singles++ % 2 === 1
    shown.add(s.id)
    const zoom = detail ? passageZoom(p, s, text ? page : whole) : 0, focus = LOOKS.editorial.focus[sc.round % LOOKS.editorial.focus.length]
    if (zoom) framed.push({ kind: text ? 'spread' : 'passage', sc, items, text, zoom, focus })
    else if (text && !(asked && headed.has(s.id))) { headed.add(s.id); framed.push({ kind: 'sheet', sc, items, text }) }
    else framed.push({ kind: 'alone', sc, items })
  }
  // a shot framed exactly as an earlier one is the same shot again, so it gives its time to the others. A fast film is
  // many short shots, so it may cut back to a framing it has shown, and drops only a shot identical to the one before it
  const seen = new Set<string>(), fast = opts.pace === 'fast'
  let last = ''
  const shots = framed.filter((f) => { const key = `${f.kind}:${f.items.map((x) => x.s.id).join('+')}:${f.focus ? f.focus.x + ',' + f.focus.y : ''}`; const again = fast ? key === last : seen.has(key); seen.add(key); if (!again) last = key; return !again })

  // then each shot is timed and drawn
  const sheets = shots.length + 2, total = shots.reduce((a, f) => a + t.weight(f.sc.hold), 0)
  const set = (text: string, n: number) => ({ text, label: host, caption: `sheet ${two(n)} of ${two(sheets)}`, look: 'plate' as Look, color: plateInk, fontSize: text.length <= LOOKS.type.short ? LOOKS.type.shortSheet : LOOKS.type.sheet, x: 6.25, y: 12, width: 70, height: 76 })
  const push = (at: number, duration: number): Move[] => [{ at, duration, x: 0, y: 0, scale: 1.025, ease: 'ease-out' }]
  const tracks: Track[] = [{ ...newTrack('title', 'Opening', 0), ...set(opts.opening || host || 'Untitled', 1), duration: t.title }]
  let at = t.title
  shots.forEach((f, i) => {
    const step = t.body * t.weight(f.sc.hold) / total, n = i + 2
    const shot = (x: Item, rest: Partial<Track>): Track => ({ ...newTrack('component', x.s.name, at), duration: step, subjectId: x.s.id, motionId: x.m!.id, moves: [], ...rest })
    const job = `sheet ${two(n)} of ${two(sheets)}  ·  ${f.items[0].s.w} × ${f.items[0].s.h}`
    const column = { look: 'plate' as Look, color: plateInk, fontSize: LOOKS.type.headline, x: 6.25, y: 12, width: 29, height: 76 }
    const spread = { look: 'editorial' as Look, color: pageInk, fontSize: LOOKS.type.spread, x: 0, y: 0, width: page.x, height: 100 }
    if (f.kind === 'type') tracks.push(shot(f.items[0], set(f.text!, n)))
    else if (f.kind === 'pair') f.items.forEach((x, k) => tracks.push(shot(x, { look: 'plate', entrance: 260 + k * 160, ...sheetBox(p, x.s, { x: k ? 53 : 7, y: 20, width: 40, height: 60 }, 'center'), moves: push(at, step) })))
    else if (f.kind === 'headed') {
      tracks.push(shot(f.items[0], { look: 'plate', entrance: 260, ...sheetBox(p, f.items[0].s, LOOKS.plate.sheet, 'left'), moves: push(at, step) }))
      tracks.push(shot(f.items[1], { text: f.text, label: two(n), caption: job, ...column }))
    } else if (f.kind === 'spread' && f.items.length === 2) {
      tracks.push(shot(f.items[0], { look: 'editorial', zoom: f.zoom, focus: f.focus, entrance: 100, ...page }))
      tracks.push(shot(f.items[1], { text: f.text, label: `${two(n)} / ${host}`, caption: host, ...spread }))
    } else if (f.kind === 'spread') {
      tracks.push(shot(f.items[0], { look: 'editorial', zoom: f.zoom, focus: f.focus, entrance: 100, ...page }))
      tracks.push({ ...newTrack('title', `${f.items[0].s.name} type`, at), duration: step, text: f.text, label: `${two(n)} / ${host}`, caption: host, ...spread })
    } else if (f.kind === 'passage') tracks.push(shot(f.items[0], { look: 'editorial', zoom: f.zoom, focus: f.focus, entrance: 100, ...whole }))
    else if (f.kind === 'sheet') {
      tracks.push(shot(f.items[0], { look: 'plate', entrance: 260, ...sheetBox(p, f.items[0].s, LOOKS.plate.sheet, 'left'), moves: push(at, step) }))
      tracks.push({ ...newTrack('title', `${f.items[0].s.name} type`, at), duration: step, text: f.text, label: two(n), caption: job, ...column })
    } else {
      // nothing to set beside it, or a detail too small to crop sharply: printed alone and centred, with its marks and its job line
      tracks.push(shot(f.items[0], { look: 'plate', entrance: 260, ...sheetBox(p, f.items[0].s, LOOKS.plate.alone, 'center'), moves: push(at, step) }))
      tracks.push({ ...newTrack('title', `${f.items[0].s.name} job`, at), duration: step, text: '', label: two(n), caption: job, ...column, width: 87.5 })
    }
    at += step
  })
  tracks.push({ ...newTrack('title', 'Closing', t.span - t.title), ...set(opts.closing || host, sheets), duration: t.title })
  return { ...p, tracks, camera: [], film: { ...p.film, art: 'mix' }, settings: { ...p.settings, duration: t.span, from: 0, to: t.span, ...(opts.background ? { background: opts.background } : {}) } }
}

/** Light ink on a dark ground and dark ink on a light one, by the ground's relative luminance. */
export function contrastInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#f4f4f5'
  const n = parseInt(m[1], 16), lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return lum > 0.35 ? '#111318' : '#f4f4f5'
}
/** Reject malformed documents at the disk boundary instead of poisoning future sessions. */
export function validateProject(raw: unknown): Project {
  const p = raw as Project
  if (!p || p.version !== 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || !Number.isInteger(p.revision) || p.revision < 0) throw new Error('This project has an unsupported format or revision.')
  for (const key of ['subjects', 'motions', 'tracks', 'camera', 'assets', 'arrangements'] as const) if (!Array.isArray(p[key]) || p[key].length > 500) throw new Error('The project contains an invalid collection.')
  if (!p.name?.trim() || p.name.length > 200 || typeof p.source !== 'string') throw new Error('Give the project a name of at most 200 characters.')
  const finite = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
  const checkSettings = (s: Project['settings']) => {
  if (!s || !finite(s.duration, 100, 120000) || !finite(s.width, 100, 3840) || !finite(s.height, 100, 3840) || ![30, 60].includes(s.fps) || !finite(s.from, 0, s.duration) || !finite(s.to, s.from + 1, s.duration) || !/^#[0-9a-f]{6}$/i.test(s.background)) throw new Error('The film settings are invalid. Films can be up to two minutes long.')
  }
  checkSettings(p.settings)
  if (p.film !== undefined && (!p.film || typeof p.film !== 'object' || Array.isArray(p.film) || (p.film.pace !== undefined && !['calm', 'brisk', 'fast'].includes(p.film.pace)) || (p.film.art !== undefined && p.film.art !== 'mix') || (p.film.scenes !== undefined && (!Array.isArray(p.film.scenes) || p.film.scenes.some((sc) => !sc || !Array.isArray(sc.ids)))) || JSON.stringify(p.film).length > 50000)) throw new Error('Invalid film metadata.')
  if(p.direction && (p.direction.version !== 1 || !Array.isArray(p.direction.scenes) || !Array.isArray(p.direction.events) || !Array.isArray(p.direction.transitions) || JSON.stringify(p.direction).length > 250000)) throw new Error('Invalid film direction metadata.')
  const ids = (items: { id: string }[]) => { const set = new Set<string>(); for (const v of items) { if (!v || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) || set.has(v.id)) throw new Error('Project items must have unique identifiers.'); set.add(v.id) } return set }
  const subjects = ids(p.subjects), motions = ids(p.motions), assets = ids(p.assets); ids(p.tracks)
  for (const a of p.assets) if (!['audio', 'image'].includes(a.kind) || typeof a.name !== 'string' || typeof a.mime !== 'string') throw new Error('Invalid asset.')
  for (const m of p.motions) if (!subjects.has(m.subjectId) || typeof m.css !== 'string' || !/^data-[\w-]+$/.test(m.scope)) throw new Error('A motion is missing its subject or scope.')
  const checkMoves = (moves: Move[]) => { if (!Array.isArray(moves) || moves.length > 100) throw new Error('Invalid movement track.'); for (const m of moves) if (!finite(m.at, 0, 120000) || !finite(m.duration, 1, 120000) || !finite(m.x, -300, 300) || !finite(m.y, -300, 300) || !finite(m.scale, 0.05, 10) || !['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(m.ease)) throw new Error('Invalid movement timing or position.') }
  for (const subject of p.subjects) if (typeof subject.html !== 'string' || typeof subject.css !== 'string' || !finite(subject.w, 1, 20000) || !finite(subject.h, 1, 20000) || !Array.isArray(subject.warnings)) throw new Error('Invalid captured element.')
  const checkTracks = (tracks: Track[]) => { ids(tracks); for (const t of tracks) {
    if (!['component', 'title', 'image', 'audio'].includes(t.kind) || typeof t.name !== 'string' || !finite(t.start, 0, 120000) || !finite(t.duration, 1, 120000) || !finite(t.entrance, 0, 120000) || !finite(t.x, -300, 300) || !finite(t.y, -300, 300) || !finite(t.width, 1, 300) || !finite(t.height, 1, 300) || !finite(t.volume, 0, 2) || !finite(t.sourceStart, 0, 86400000) || !finite(t.fadeIn, 0, 120000) || !finite(t.fadeOut, 0, 120000) || !finite(t.fontSize, 8, 500)) throw new Error('A track has invalid timing, dimensions, or volume.')
    if (t.kind === 'component' && (!subjects.has(t.subjectId!) || (t.motionId && !motions.has(t.motionId)))) throw new Error('A component track is missing its capture or motion.')
    if ((t.look !== undefined && !['plate', 'editorial'].includes(t.look)) || (t.zoom !== undefined && !finite(t.zoom, 1, 6)) || (t.focus !== undefined && (!finite(t.focus?.x, 0, 1) || !finite(t.focus?.y, 0, 1))) || [t.label, t.caption].some((v) => v !== undefined && (typeof v !== 'string' || v.length > 200))) throw new Error('A track has an invalid look, crop or caption.')
    if (['image', 'audio'].includes(t.kind) && !assets.has(t.assetId!)) throw new Error('A media track is missing its asset.')
    checkMoves(t.moves)
  } }
  checkTracks(p.tracks); checkMoves(p.camera)
  for (const a of p.arrangements) { checkTracks(a.tracks); checkMoves(a.camera); if(a.settings) checkSettings(a.settings) }
  return p
}
