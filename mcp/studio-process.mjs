/**
 * Which studio an agent talks to, started when needed and never one that belongs to someone else.
 *
 * The server used to ask whatever answered on 4321. That was the person's own studio from another
 * checkout, or Astro's dev server, or nothing at all because a busy 4321 had sent the studio to
 * 4322 while the agent kept asking 4321. And a film followed by a restart could not be revised,
 * because the follow-up tools refused when no studio answered and said to film again, with every
 * project still on disk.
 *
 * So a studio is owned by a workspace: it writes .studio/studio.json with its port and a nonce, and
 * answers /__motioneer/health with the same. A studio is reused only when both match. Otherwise
 * one is started on a port this side chooses, held strictly, so the address it reports is the
 * address it serves.
 */
import { spawn } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The workspace the projects live in: the one setup named, or where the server was started. */
export const workspace = () => realpath(process.env.MOTIONEER_WORKSPACE || process.cwd())

const health = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__motioneer/health`, { signal: AbortSignal.timeout(700) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Something listening on 127.0.0.1 at that port, whoever it is. */
const taken = (port) => new Promise((done) => {
  const socket = net.connect({ port, host: '127.0.0.1' })
  socket.once('connect', () => { socket.destroy(); done(true) })
  socket.once('error', () => done(false))
  socket.setTimeout(500, () => { socket.destroy(); done(false) })
})

/** The address of the studio serving this workspace, when one is running. */
export async function runningStudio(work) {
  work = work || await workspace()
  const owner = JSON.parse(await readFile(path.join(work, '.studio', 'studio.json'), 'utf8').catch(() => 'null'))
  if (!owner?.port) return null
  const seen = await health(owner.port)
  return seen && seen.nonce === owner.nonce && seen.workspace === work ? `http://127.0.0.1:${owner.port}` : null
}

/**
 * This workspace's studio, started when there is none.
 *
 * @param url     a site to aim a new studio at
 * @param folder  a folder of components to open a new studio on, when there is no url
 * @param headless  a new studio opens no browser tab
 * @returns the studio's address, or null when one could not be started
 */
export async function ensureStudio({ url, folder, headless = true } = {}) {
  const work = await workspace()
  const running = await runningStudio(work)
  if (running) return running
  const first = Number(process.env.MOTIONEER_PORT || 4321)
  for (let port = first; port < first + 20; port++) {
    if (await taken(port)) continue
    const args = [path.join(ROOT, 'tools', 'studio.mjs')]
    if (url) args.push('--app', String(url))
    else if (folder) args.push(String(folder))
    // process.execPath rather than the word node: an agent launched from a desktop icon carries a
    // login shell's PATH, which on any machine using nvm or fnm has no node on it at all
    const child = spawn(process.execPath, args, {
      stdio: 'ignore', detached: true, cwd: work,
      env: { ...process.env, MOTIONEER_PORT: String(port), MOTIONEER_STRICT_PORT: '1', ...(headless ? { MOTIONEER_NO_OPEN: '1' } : {}) },
    })
    let gone = false
    child.once('exit', () => { gone = true })
    child.once('error', () => { gone = true })
    child.unref()
    for (let n = 0; n < 60 && !gone; n++) {
      const at = await runningStudio(work)
      if (at) return at
      await new Promise((r) => setTimeout(r, 250))
    }
    // it lost the port to someone faster: try the next one. Still starting after fifteen seconds is
    // a studio that will not answer, and starting a second would only leave two
    if (!gone) return null
  }
  return null
}
