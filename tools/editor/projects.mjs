/** Files stay inside each project. Revision checks prevent two tabs from overwriting each other. */
import { mkdir, readFile, writeFile, rename, readdir, rm, stat, link, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createProject, validateProject } from '../../dist-core/core.js'
const valid = id => /^[a-zA-Z0-9_-]{1,100}$/.test(String(id))
/** What a list of projects needs to say about one, without its captures. */
export function summary(p) {
  const shots = new Set(p.tracks.filter(t => t.kind === 'component' && !t.hidden).map(t => t.start)).size
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, revision: p.revision, source: p.source || '', kind: p.direction ? 'reel' : 'film', pace: p.film?.pace || null, seconds: Math.round((p.settings.to - p.settings.from) / 100) / 10, shots, origin: p.film?.origin || null }
}
export function projectStore(root) {
  const directory = id => { if (!valid(id)) throw Object.assign(new Error('Invalid project identifier.'), { status: 400 }); return path.join(root, id) }
  const locks = new Map()
  const serial = async (id, run) => { const before = locks.get(id) || Promise.resolve(); const next = before.catch(() => {}).then(run); locks.set(id, next); try { return await next } finally { if (locks.get(id) === next) locks.delete(id) } }
  const read = async id => JSON.parse(await readFile(path.join(directory(id), 'project.json'), 'utf8'))
  const save = (raw, fresh = false) => serial(raw.id, async () => {
    const project = structuredClone(validateProject(raw)), dir = directory(project.id)
    const old = await read(project.id).catch(e => { if (e.code !== 'ENOENT') throw e; return null })
    if ((!old && !fresh) || (old && old.revision !== project.revision)) throw Object.assign(new Error('This project changed in another tab. Reopen it before saving, or save a copy.'), { status: 409 })
    await mkdir(dir, { recursive: true }); project.revision++; project.updatedAt = Date.now()
    const temporary = path.join(dir, `${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(project)); await rename(temporary, path.join(dir, 'project.json'))
    await writeFile(path.join(dir, 'meta.json'), JSON.stringify(summary(project))).catch(() => {}); return project
  })
  /**
   * Listing reads the small summary written beside each project, because a project carries its
   * captures inline and this workspace had 1.8GB of them: parsing every one to show a menu of names
   * held them all in memory at once. A project saved before summaries existed is read once and
   * gets one.
   */
  const list = async () => {
    await mkdir(root, { recursive: true }); const entries = await readdir(root, { withFileTypes: true })
    const metas = await Promise.all(entries.filter(x => x.isDirectory() && valid(x.name)).map(async x => {
      try { return JSON.parse(await readFile(path.join(root, x.name, 'meta.json'), 'utf8')) } catch {}
      const project = await read(x.name).catch(() => null); if (!project) return null
      const meta = summary(project); await writeFile(path.join(root, x.name, 'meta.json'), JSON.stringify(meta)).catch(() => {}); return meta
    }))
    return metas.filter(Boolean).sort((a,b) => b.updatedAt-a.updatedAt)
  }
  /**
   * A new take of a saved project. Asset bytes are linked rather than uploaded again, so a take
   * costs a directory rather than a copy of every soundtrack, and the take records where it came from.
   */
  const fork = async (id, { name, origin } = {}) => {
    const source = await read(id), fresh = await save(createProject(String(name || source.name + ' / Take').slice(0, 200)), true)
    const from = path.join(directory(id), 'assets'), to = path.join(directory(fresh.id), 'assets')
    await mkdir(to, { recursive: true })
    const film = { ...source.film, origin: { tool: String(origin?.tool || 'fork').slice(0, 40), sourceProjectId: id, ...(origin?.request ? { request: String(origin.request).slice(0, 2000) } : {}), at: Date.now() } }
    let serialized = JSON.stringify({ ...source, id: fresh.id, revision: fresh.revision, name: fresh.name, film }).split(`/__motioneer/projects/${id}/assets/`).join(`/__motioneer/projects/${fresh.id}/assets/`)
    // each asset gets an identity of its own in the take, as an uploaded copy did, over the same bytes
    for (const file of await readdir(from).catch(() => [])) {
      if (!valid(file)) continue
      const entry = JSON.parse(await readFile(path.join(from, file + '.json'), 'utf8').catch(() => 'null')), copy = randomUUID()
      await link(path.join(from, file), path.join(to, copy)).catch(() => copyFile(path.join(from, file), path.join(to, copy)))
      if (entry) await writeFile(path.join(to, copy + '.json'), JSON.stringify({ ...entry, id: copy }))
      serialized = serialized.split(file).join(copy)
    }
    return save(JSON.parse(serialized))
  }
  const importAsset = async (id, name, mime, data) => {
    await read(id)
    const allowed = ['image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/x-m4a']
    if (!allowed.includes(mime)) throw Object.assign(new Error('Choose a PNG, JPEG, WebP, or an audio file.'), { status: 415 })
    const asset = { id: randomUUID(), name: String(name).slice(0,200), kind: mime.startsWith('image/') ? 'image' : 'audio', mime }
    const dir = path.join(directory(id), 'assets'); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, asset.id), data); await writeFile(path.join(dir, asset.id + '.json'), JSON.stringify(asset))
    return asset
  }
  const assetPath = (id, asset) => { if (!valid(asset)) throw new Error('Invalid asset identifier.'); return path.join(directory(id), 'assets', asset) }
  return { list, read, save, fork, directory, importAsset, assetPath,
    create: name => save(createProject(name), true),
    remove: id => serial(id, () => rm(directory(id), { recursive: true, force: true })),
    async asset(id, asset) { const p = await read(id), entry = p.assets.find(a => a.id === asset) || JSON.parse(await readFile(assetPath(id, asset) + '.json', 'utf8')); if (!entry) throw Object.assign(new Error('Asset not found.'), { status: 404 }); return { data: await readFile(assetPath(id, asset)), mime: entry.mime } },
    async bytes(id) { return (await stat(path.join(directory(id), 'project.json'))).size },
  }
}
