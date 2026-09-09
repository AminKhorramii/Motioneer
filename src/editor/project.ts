/** The durable document, shared by the editor and the local server. Times are milliseconds. */
export type Purpose = 'entrance' | 'emphasis' | 'idle' | 'interaction'
export type Brief = { purpose: Purpose; intensity: 'range' | 'subtle' | 'expressive' | 'bold'; duration: number; direction: string }
export type Subject = { id: string; name: string; html: string; css: string; w: number; h: number; shot?: string; warnings: string[]; source?: string }
export type Motion = { id: string; subjectId: string; css: string; scope: string; note: string; treatment: string; brief: Brief; duration: number; saved?: boolean; seen?: { blank: number; escape: number; stir: number }; parentId?: string }
export type Move = { at: number; duration: number; x: number; y: number; scale: number; ease: string }
export type Track = { id: string; kind: 'component' | 'title' | 'image' | 'audio'; name: string; subjectId?: string; motionId?: string; assetId?: string; text?: string; color: string; fontSize: number; start: number; duration: number; entrance: number; x: number; y: number; width: number; height: number; hidden: boolean; locked: boolean; moves: Move[]; volume: number; sourceStart: number; fadeIn: number; fadeOut: number; after?: { key: string; mode: 'after' | 'with'; gap: number } }
export type Asset = { id: string; name: string; kind: 'image' | 'audio'; mime: string; duration?: number; waveform?: number[]; width?: number; height?: number }
export type Arrangement = { id: string; name: string; tracks: Track[]; camera: Move[] }
export type Project = { version: 1; id: string; revision: number; name: string; updatedAt: number; source: string; subjects: Subject[]; motions: Motion[]; tracks: Track[]; camera: Move[]; assets: Asset[]; arrangements: Arrangement[]; settings: { width: number; height: number; fps: number; duration: number; background: string; from: number; to: number }; brief: Brief }
export const uid = () => crypto.randomUUID()
export const defaultBrief: Brief = { purpose: 'entrance', intensity: 'range', duration: 1000, direction: '' }
export function createProject(name = 'Untitled film'): Project {
  return { version: 1, id: uid(), revision: 0, name, updatedAt: Date.now(), source: '', subjects: [], motions: [], tracks: [], camera: [], assets: [], arrangements: [], brief: { ...defaultBrief }, settings: { width: 1920, height: 1080, fps: 30, duration: 30000, background: '#101319', from: 0, to: 30000 } }
}
export function newTrack(kind: Track['kind'], name: string, at = 0): Track {
  return { id: uid(), kind, name, color: '#f4f4f5', fontSize: 64, start: at, duration: 5000, entrance: 0, x: 15, y: 20, width: 70, height: 60, hidden: false, locked: false, moves: [], volume: 0.7, sourceStart: 0, fadeIn: 200, fadeOut: 400 }
}
export type Pace = 'calm' | 'brisk' | 'fast'
export type CutOptions = { pace?: Pace; seconds?: number; opening?: string; closing?: string }
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
  const shots = shot ? Math.max(chosen.length, Math.round(body / shot)) : chosen.length
  const step = body / shots
  const opening = { ...newTrack('title', 'Opening'), text: opts.opening || 'Meet your next great idea', x: 10, y: 35, width: 80, height: 25, duration: title, fontSize: 76 }
  const end = { ...newTrack('title', 'Closing', span - title), text: opts.closing || 'See it in action', x: 10, y: 35, width: 80, height: 25, duration: title, fontSize: 76 }
  const cuts: Track[] = Array.from({ length: shots }, (_, i) => {
    const { s, m } = chosen[i % chosen.length], round = Math.floor(i / chosen.length)
    // a repeat is framed a little differently, alternating sides and a touch tighter, so it cuts rather than freezes
    const nudge = round % 2 ? 4 : 0, tighten = Math.min(8, round * 2)
    return { ...newTrack('component', s.name, title + i * step), duration: step, subjectId: s.id, motionId: m!.id, width: 76 - tighten, x: 12 + nudge + tighten / 2, y: 16 + tighten / 2, height: 68 - tighten }
  })
  const camera = pace === 'calm' ? [{ at: title, duration: body, x: 0, y: 0, scale: 1.04, ease: 'ease-in-out' }] : [{ at: title, duration: body, x: 0, y: 0, scale: 1.06, ease: 'linear' }]
  return { ...p, tracks: [opening, ...cuts, end], camera, settings: { ...p.settings, duration: span, from: 0, to: span } }
}
/** Reject malformed documents at the disk boundary instead of poisoning future sessions. */
export function validateProject(raw: unknown): Project {
  const p = raw as Project
  if (!p || p.version !== 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || !Number.isInteger(p.revision) || p.revision < 0) throw new Error('This project has an unsupported format or revision.')
  for (const key of ['subjects', 'motions', 'tracks', 'camera', 'assets', 'arrangements'] as const) if (!Array.isArray(p[key]) || p[key].length > 500) throw new Error('The project contains an invalid collection.')
  if (!p.name?.trim() || p.name.length > 200 || typeof p.source !== 'string') throw new Error('Give the project a name of at most 200 characters.')
  const finite = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
  const s = p.settings
  if (!s || !finite(s.duration, 100, 120000) || !finite(s.width, 100, 3840) || !finite(s.height, 100, 3840) || ![30, 60].includes(s.fps) || !finite(s.from, 0, s.duration) || !finite(s.to, s.from + 1, s.duration) || !/^#[0-9a-f]{6}$/i.test(s.background)) throw new Error('The film settings are invalid. Films can be up to two minutes long.')
  const ids = (items: { id: string }[]) => { const set = new Set<string>(); for (const v of items) { if (!v || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) || set.has(v.id)) throw new Error('Project items must have unique identifiers.'); set.add(v.id) } return set }
  const subjects = ids(p.subjects), motions = ids(p.motions), assets = ids(p.assets); ids(p.tracks)
  for (const a of p.assets) if (!['audio', 'image'].includes(a.kind) || typeof a.name !== 'string' || typeof a.mime !== 'string') throw new Error('Invalid asset.')
  for (const m of p.motions) if (!subjects.has(m.subjectId) || typeof m.css !== 'string' || !/^data-[\w-]+$/.test(m.scope)) throw new Error('A motion is missing its subject or scope.')
  const checkMoves = (moves: Move[]) => { if (!Array.isArray(moves) || moves.length > 100) throw new Error('Invalid movement track.'); for (const m of moves) if (!finite(m.at, 0, 120000) || !finite(m.duration, 1, 120000) || !finite(m.x, -300, 300) || !finite(m.y, -300, 300) || !finite(m.scale, 0.05, 10) || !['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(m.ease)) throw new Error('Invalid movement timing or position.') }
  for (const subject of p.subjects) if (typeof subject.html !== 'string' || typeof subject.css !== 'string' || !finite(subject.w, 1, 20000) || !finite(subject.h, 1, 20000) || !Array.isArray(subject.warnings)) throw new Error('Invalid captured element.')
  const checkTracks = (tracks: Track[]) => { ids(tracks); for (const t of tracks) {
    if (!['component', 'title', 'image', 'audio'].includes(t.kind) || typeof t.name !== 'string' || !finite(t.start, 0, 120000) || !finite(t.duration, 1, 120000) || !finite(t.entrance, 0, 120000) || !finite(t.x, -300, 300) || !finite(t.y, -300, 300) || !finite(t.width, 1, 300) || !finite(t.height, 1, 300) || !finite(t.volume, 0, 2) || !finite(t.sourceStart, 0, 86400000) || !finite(t.fadeIn, 0, 120000) || !finite(t.fadeOut, 0, 120000) || !finite(t.fontSize, 8, 500)) throw new Error('A track has invalid timing, dimensions, or volume.')
    if (t.kind === 'component' && (!subjects.has(t.subjectId!) || (t.motionId && !motions.has(t.motionId)))) throw new Error('A component track is missing its capture or motion.')
    if (['image', 'audio'].includes(t.kind) && !assets.has(t.assetId!)) throw new Error('A media track is missing its asset.')
    checkMoves(t.moves)
  } }
  checkTracks(p.tracks); checkMoves(p.camera)
  for (const a of p.arrangements) { checkTracks(a.tracks); checkMoves(a.camera) }
  return p
}
