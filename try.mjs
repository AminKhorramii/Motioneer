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
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const dir = process.env.WALL_TRY_DIR ?? path.join(ROOT, '.try')
const at = path.join(dir, '.wall')
const brief =
  process.argv.slice(2).join(' ') ||
  'A tool that turns the meeting notes you already keep into decisions you can search.'

mkdirSync(at, { recursive: true })
const request = path.join(at, 'request.json')
writeFileSync(request, JSON.stringify({ brief, name: '' }, null, 2), 'utf8')

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
  }
})

process.on('SIGINT', () => {
  server.kill()
  process.exit(0)
})
