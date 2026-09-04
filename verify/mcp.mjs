/**
 * Motioneer as a tool an agent calls, driven the way an agent drives it.
 *
 * Spoken over stdio as real JSON-RPC rather than by importing the handlers, because most of what can
 * go wrong here is in the protocol rather than in the work: a tool that does not appear in the list
 * is never called, a schema an agent cannot read is never filled in correctly, and an error returned
 * as a transport fault instead of as tool content makes the agent retry rather than report.
 *
 * The `studio` leg starts a real studio and then asks for a second one, because the answer to the
 * second is the interesting one. A busy port makes the studio roam to 4322 and say so, which is
 * right for a person reading a terminal and wrong for an agent that has just told somebody to look
 * at 4321.
 *
 *   node verify/mcp.mjs
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let bad = 0
const ok = (how, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${how}${detail ? `  ${detail}` : ''}`)
  if (!cond) bad++
}

const PORT = Number(process.env.MOTIONEER_PORT || 4396)
/**
 * Everything holding the port, except this process.
 *
 * `lsof -ti tcp:PORT` lists both ends of a connection, not just whoever is listening. This suite
 * asks the studio a question over `fetch`, and node keeps that client socket pooled afterwards, so
 * the suite itself turns up in its own kill list and `stop()` sends SIGKILL to its own pid. Every
 * check printed `ok`, then the run ended with signal 9 and no failing assertion, which reads as an
 * infrastructure flake and was `verify:all` never passing.
 */
const mine = String(process.pid)
const holding = (p) => spawnSync('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf8' })
  .stdout.split('\n').filter(Boolean).filter((pid) => pid !== mine)
const freePort = (p) => {
  for (const pid of holding(p)) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone already */ } }
}
// a studio left listening by an earlier run answers every question the new one was going to be asked
freePort(PORT)

const mcp = spawn('node', ['mcp/index.mjs'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, MOTIONEER_PORT: String(PORT), MOTIONEER_NO_OPEN: '1' },
})
const waiting = new Map()
let buf = ''
mcp.stdout.on('data', (d) => {
  buf += d
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const line of lines) {
    try {
      const m = JSON.parse(line)
      if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
    } catch { /* a log line rather than a message */ }
  }
})
let n = 0
const rpc = (method, params) => new Promise((done) => {
  const id = ++n
  waiting.set(id, done)
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
})
const callTool = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args })
  return { text: r.result?.content?.[0]?.text ?? '', isError: !!r.result?.isError }
}
const stop = () => {
  try { mcp.kill('SIGKILL') } catch { /* already gone */ }
  freePort(PORT)
}
process.on('exit', stop)

/* ── the handshake, which decides whether anything else is ever asked ─────────────────────────── */
console.log('\n  the handshake')
const hello = await rpc('initialize', {
  protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1' },
})
ok('it answers initialize', !!hello.result, JSON.stringify(hello.result?.serverInfo ?? {}))
ok('and names itself with a version', /\d+\.\d+/.test(hello.result?.serverInfo?.version ?? ''))

console.log('\n  what it offers')
const list = await rpc('tools/list', {})
const tools = list.result?.tools ?? []
const names = tools.map((t) => t.name).sort()
ok('two tools, studio and motion', names.join(',') === 'motion,studio', names.join(','))
ok('every one has a description an agent can act on',
  tools.every((t) => (t.description ?? '').length > 80))
ok('every one has an object schema', tools.every((t) => t.inputSchema?.type === 'object'))
ok('motion requires the markup, since it cannot be guessed',
  (tools.find((t) => t.name === 'motion')?.inputSchema?.required ?? []).includes('html'))
ok('studio requires nothing, because opening it is the whole call',
  (tools.find((t) => t.name === 'studio')?.inputSchema?.required ?? []).length === 0)

/* ── refusals come back as content, not as transport faults ──────────────────────────────────── */
console.log('\n  when it is asked for something it cannot do')
const nothing = await callTool('motion', { html: '   ' })
ok('empty markup is refused', nothing.isError, nothing.text.slice(0, 60))
ok('and the refusal says what was missing', /markup/i.test(nothing.text))
const unknown = await rpc('tools/call', { name: 'nosuchtool', arguments: {} })
ok('an unknown tool is an error rather than a crash',
  !!unknown.result?.isError || !!unknown.error)

/* ── the studio, opened for real ──────────────────────────────────────────────────────────────── */
console.log('\n  opening the studio')
const first = await callTool('studio', {})
ok('it opens', !first.isError && /open/i.test(first.text), first.text.slice(0, 64))
ok('and names the address', first.text.includes(String(PORT)))
const answering = await fetch(`http://localhost:${PORT}/__motioneer/model`)
  .then((r) => r.ok).catch(() => false)
ok('and something is really serving there', answering)

const second = await callTool('studio', {})
ok('a second call does not open a second studio', /already open/i.test(second.text),
  second.text.slice(0, 56))

/**
 * What the published package actually gives somebody, which is not the same as what the repo does.
 *
 * Every instruction for opening the studio by hand was `npm run studio`, which needs a checkout, and
 * the only command the package exposed spoke JSON-RPC on stdio: run by a person it printed nothing
 * and never exited. Meanwhile the studio defaulted to a folder path relative to wherever it was
 * started, so installed into somebody's project and run there it threw on the way up. Both are
 * failures of the front door rather than of anything the tool does once it is open.
 */
console.log('\n  what the package offers a person')
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
ok('there is a command that opens the studio, not only one that talks to agents',
  !!pkg.bin && !!pkg.bin.motioneer, Object.keys(pkg.bin || {}).join(' and '))
for (const [name, at] of Object.entries(pkg.bin || {})) {
  const head = readFileSync(path.join(ROOT, at), 'utf8').slice(0, 20)
  ok(`${name} can be run as a command, since a bin without a shebang is not one`,
    head.startsWith('#!'), head.split('\n')[0])
}
ok('the components it opens on are published with it, so a first run has something in it',
  (pkg.files || []).includes('examples/'), (pkg.files || []).join(' '))

/**
 * A bare address means aim there.
 *
 * The one positional argument was always a folder, so `motioneer localhost:3000` set the components
 * directory to a string that is not one and opened an empty room advising you to type an address
 * into the sidebar, which is precisely what had just been typed.
 */
const said = (args, port) => new Promise((done) => {
  const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'studio.mjs'), ...args],
    { cwd: away0, env: { ...process.env, MOTIONEER_PORT: String(port), MOTIONEER_NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (d) => { out += d })
  setTimeout(() => { try { child.kill('SIGKILL') } catch { /* gone */ } done(out) }, 3200)
})
const away0 = mkdtempSync(path.join(tmpdir(), 'motioneer-args-'))
ok('a bare address is aimed at rather than looked for as a folder',
  /proxying localhost:3000/.test(await said(['localhost:3000'], PORT + 5)))
ok('while a folder that is there is still a folder',
  /components under/.test(await said([path.join(ROOT, 'examples', 'components')], PORT + 6)))

/* started somewhere that is not this repo and given no folder, which is every npm install of it */
const away = mkdtempSync(path.join(tmpdir(), 'motioneer-away-'))
const PORT2 = PORT + 3
for (const pid of spawnSync('lsof', ['-ti', `tcp:${PORT2}`], { encoding: 'utf8' })
  .stdout.split('\n').filter(Boolean).filter((v) => v !== mine)) {
  try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ }
}
const loose = spawn(process.execPath, [path.join(ROOT, 'tools', 'studio.mjs')],
  { cwd: away, env: { ...process.env, MOTIONEER_PORT: String(PORT2), MOTIONEER_NO_OPEN: '1' }, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 3500))
const loose200 = await fetch(`http://localhost:${PORT2}/`).then((r) => r.ok).catch(() => false)
ok('and it opens from a directory that is not this repo, rather than throwing on a folder that is not there',
  loose200)
try { loose.kill('SIGKILL') } catch { /* gone */ }

stop()
console.log(bad ? `\n  ${bad} failed\n` : '\n  errors: none\n')
process.exit(bad ? 1 : 0)
