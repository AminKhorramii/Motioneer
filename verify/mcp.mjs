/**
 * Wall as a tool an agent calls, driven the way an agent drives it.
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

let bad = 0
const ok = (how, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${how}${detail ? `  ${detail}` : ''}`)
  if (!cond) bad++
}

const PORT = Number(process.env.WALL_PORT || 4396)
for (const p of [PORT]) {
  const pids = spawnSync('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
  for (const pid of pids) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone already */ } }
}

const mcp = spawn('node', ['mcp/index.mjs'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, WALL_PORT: String(PORT), WALL_NO_OPEN: '1' },
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
  const pids = spawnSync('lsof', ['-ti', `tcp:${PORT}`], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
  for (const pid of pids) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ } }
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
const answering = await fetch(`http://localhost:${PORT}/__wall/model`)
  .then((r) => r.ok).catch(() => false)
ok('and something is really serving there', answering)

const second = await callTool('studio', {})
ok('a second call does not open a second studio', /already open/i.test(second.text),
  second.text.slice(0, 56))

stop()
console.log(bad ? `\n  ${bad} failed\n` : '\n  errors: none\n')
process.exit(bad ? 1 : 0)
