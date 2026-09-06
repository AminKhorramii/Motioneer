/** Files stay inside each project. Revision checks prevent two tabs from overwriting each other. */
import { mkdir, readFile, writeFile, rename, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createProject, validateProject } from '../../dist-core/core.js'
const valid = id => /^[a-zA-Z0-9_-]{1,100}$/.test(String(id))
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
    await writeFile(temporary, JSON.stringify(project)); await rename(temporary, path.join(dir, 'project.json')); return project
  })
  const list = async () => {
    await mkdir(root, { recursive: true }); const entries = await readdir(root, { withFileTypes: true })
    const projects = await Promise.all(entries.filter(x => x.isDirectory() && valid(x.name)).map(x => read(x.name).catch(() => null)))
    return projects.filter(Boolean).sort((a,b) => b.updatedAt-a.updatedAt).map(({ id, name, updatedAt, revision }) => ({ id, name, updatedAt, revision }))
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
  return { list, read, save, directory, importAsset, assetPath,
    create: name => save(createProject(name), true),
    remove: id => serial(id, () => rm(directory(id), { recursive: true, force: true })),
    async asset(id, asset) { const p = await read(id), entry = p.assets.find(a => a.id === asset) || JSON.parse(await readFile(assetPath(id, asset) + '.json', 'utf8')); if (!entry) throw Object.assign(new Error('Asset not found.'), { status: 404 }); return { data: await readFile(assetPath(id, asset)), mime: entry.mime } },
    async bytes(id) { return (await stat(path.join(directory(id), 'project.json'))).size },
  }
}
