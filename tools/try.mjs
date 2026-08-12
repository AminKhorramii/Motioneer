#!/usr/bin/env node
/**
 * The loop for working on Wall itself.
 *
 * It does what an agent does, without needing one: writes a brief, starts the server the way
 * the MCP server starts it, and opens the browser. So the agent-launched path, which is the one
 * that matters and the hardest to reach by hand, is one command away.
 *
 *   npm run watch   in one terminal, so dist is never stale
 *   npm run try     in another, as often as you like
 *
 * Anything after the command is the brief.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// a pathname is percent encoded and is not a path, so a clone under a directory with a space
// in its name would look for the server somewhere that does not exist
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = process.env.WALL_TRY_DIR ?? path.join(ROOT, '.try')
const at = path.join(dir, '.wall')
const brief =
  process.argv.slice(2).join(' ') ||
  'A tool that turns the meeting notes you already keep into decisions you can search.'

/**
 * Say so when the page about to open is not the code on disk.
 *
 * This serves dist, and nothing here builds it, because the loop it was written for keeps a watch
 * running in another terminal. Without a watch it opens whatever was built last, which looks
 * exactly like a working wall and is a different program: an afternoon can go into wondering why
 * a change had no effect. Newest file wins rather than a hash, because this is a warning and not
 * a gate, and being told is enough.
 */
const newest = (dir) => {
  if (!existsSync(dir)) return 0
  let latest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    latest = Math.max(latest, entry.isDirectory() ? newest(full) : statSync(full).mtimeMs)
  }
  return latest
}
const built = newest(path.join(ROOT, 'dist'))
if (!built) {
  console.log('there is no dist yet, so nothing can be served. run: npm run build\n')
} else if (newest(path.join(ROOT, 'src')) > built) {
  const ago = Math.round((Date.now() - built) / 60000)
  console.log(`the build is older than src, by ${ago} minute${ago === 1 ? '' : 's'}.`)
  console.log('this will open the previous version. run npm run build, or npm run watch alongside.\n')
}

mkdirSync(at, { recursive: true })
const request = path.join(at, 'request.json')
// the same shape the MCP server writes, stamp and all, or the app refuses it the same way
writeFileSync(request, JSON.stringify({ format: 1, brief, name: '' }, null, 2), 'utf8')

const server = spawn('node', [path.join(ROOT, 'server', 'index.mjs')], {
  env: { ...process.env, PORT: process.env.PORT ?? '0', WALL_REQUEST: request, WALL_HANDOFF_DIR: at },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let seen = ''
server.stdout.on('data', (d) => {
  process.stdout.write(d)
  seen += d
  const url = seen.match(/http:\/\/localhost:\d+/)?.[0]
  if (url && !seen.includes('opened')) {
    seen += 'opened'
    const [cmd, args] =
      process.platform === 'darwin' ? ['open', [url]]
        : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
          : ['xdg-open', [url]]
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
    console.log(`\nbrief: ${brief}`)
    console.log(`handoff: ${at}`)
    console.log('edit src, let watch rebuild, then reload the page. ctrl-c to stop.')
    /**
     * The other half of the loop, which is a person and an agent looking at the same directory.
     *
     * Choosing writes four files here, and the agent that wants to read them is sitting in this
     * repository already, so the two only ever needed to agree on where. Saying it out loud is the
     * whole connection: the wall is where judgement happens and the terminal is where it is read.
     */
    console.log('\nin the wall: x removes a page, z brings it back, p pins one, and the bar rewrites the one you are on.')
    console.log('when you have chosen, press "to Claude", then tell your agent:')
    console.log('    read .try/.wall')
  }
})

process.on('SIGINT', () => {
  server.kill()
  process.exit(0)
})
