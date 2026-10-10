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
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
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
const notifications = []
let buf = ''
mcp.stdout.on('data', (d) => {
  buf += d
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const line of lines) {
    try {
      const m = JSON.parse(line)
      if(m.method==='notifications/progress')notifications.push(m.params)
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
const card = hello.result?.instructions ?? ''
ok('it answers initialize', !!hello.result, JSON.stringify(hello.result?.serverInfo ?? {}))
ok('and names itself with a version', /\d+\.\d+/.test(hello.result?.serverInfo?.version ?? ''))
ok('its card fits inside the 2,048 characters Claude Code shows, with room to spare', card.length <= 1900, `${card.length} characters`)
ok('and how to read a failure, so it relays the next step rather than guessing', /starts with "Cannot"/.test(card) && /Relay it as given/.test(card))
ok('and that a film is a wait rather than something to poll', /never call it again/i.test(card))
ok('and to look at the storyboard before calling a film finished, without mistaking the verdict for taste', /storyboard/.test(card) && /not taste/.test(card))
ok('and to open things only when asked', /only for when they ask to open/.test(card))

console.log('\n  what it offers')
const list = await rpc('tools/list', {})
const tools = list.result?.tools ?? []
const tool = (name) => tools.find((t) => t.name === name)
const props = (name) => tool(name)?.inputSchema?.properties ?? {}
const names = tools.map((t) => t.name).sort()
ok('eight tools, one job each', names.join(',') === 'change,doctor,film,look,motion,open,projects,studio', names.join(','))
ok('the card names every one of them, since a deferred client shows only the card and the names', names.every((n) => card.includes(n)))
ok('every one has a title and annotations, which clients use to show and to permit a call', tools.every((t) => t.title && t.annotations && typeof t.annotations === 'object'))
ok('every description stands on its own and stays within budget', tools.every((t) => (t.description ?? '').length > 80 && t.description.length <= 900), tools.map((t) => `${t.name} ${t.description?.length}`).join(', '))
ok('every one has an object schema', tools.every((t) => t.inputSchema?.type === 'object'))
ok('the tools that change nothing say so, and film and change never destroy', tool('doctor')?.annotations.readOnlyHint && tool('projects')?.annotations.readOnlyHint && tool('look')?.annotations.readOnlyHint && tool('film')?.annotations.destructiveHint === false && tool('change')?.annotations.destructiveHint === false)
ok('motion takes a component\'s markup, and lists nothing that would make a request for css look like it needs a site', !!props('motion').html && !props('motion').url && !props('motion').check)
ok('studio requires nothing, because opening it is the whole call', (tool('studio')?.inputSchema?.required ?? []).length === 0)
ok('open requires a target, since it has to know what to open, and can open a project', (tool('open')?.inputSchema?.required ?? []).includes('target') && !!props('open').projectId)
ok('change requires the film it changes', (tool('change')?.inputSchema?.required ?? []).includes('projectId'))
ok('film makes every kind of film: capture, authored from the DOM, screenshots mixed in, and graphics alone', JSON.stringify(props('film').mode?.enum) === '["auto","capture","native","hybrid","graphic"]')
ok('a capture film takes a pace, a pick in the person\'s words, a count, a treatment and a capture mode', JSON.stringify(props('film').pace?.enum) === '["calm","brisk","fast"]' && !!props('film').pick && !!props('film').count && JSON.stringify(props('film').treatment?.enum) === '["subtle","expressive","bold"]' && props('film').captureMode?.enum.includes('pixels'))
ok('an authored film takes twenty-two musical identities, a tempo, six art directions, the brand mode and documentation', props('film').music?.enum.length === 22 && props('film').bpm?.maximum === 180 && props('film').art?.enum.length === 6 && props('film').brandMode?.enum.join(',') === 'site,expressive' && props('film').referenceUrls?.maxItems === 3 && !!props('film').soundKit)
ok('finishing options and locale selection are on film', props('film').soundtrack?.enum.includes('none') && !!props('film').language && props('film').theme?.enum.includes('dark') && props('film').fps?.enum.includes(60))
ok('change recuts by shot number, rewrites motion by track with locks, and replaces only the music', !!props('change').cut?.properties?.drop && !!props('change').cut?.properties?.order && props('change').motion?.properties?.trackIds?.maxItems === 12 && !!props('change').motion?.properties?.lockedTrackIds && !!props('change').music?.properties?.audioFile && props('change').music?.properties?.identity?.enum.includes('none'))
ok('look sees a page or a film, frames at chosen seconds or a shot as a filmstrip, and can ask for a critique', !!props('look').url && !!props('look').projectId && props('look').at?.maxItems === 12 && props('look').shot?.type === 'number' && props('look').critique?.type === 'boolean')
ok('change can rescale timing exactly, with no model', props('change').timing?.properties?.duration?.minimum === 0.25 && JSON.stringify(props('change').timing?.properties?.ease?.enum) === '["arrive","leave","mechanical"]')
ok('projects lists earlier work or describes one film', !!props('projects').projectId && !!props('projects').limit)

console.log('\n  the names it used to have')
const noProject = await callTool('revise', {})
ok('revise still answers, as change, and says what it cannot do and what to do next', noProject.isError && /^Cannot/.test(noProject.text) && /Next:/.test(noProject.text), noProject.text.slice(0, 70))
for (const old of ['refine', 'rescore', 'reel', 'review']) {
  const said = await callTool(old, {})
  ok(`${old} still answers rather than being an unknown tool`, said.isError && /^Cannot/.test(said.text) && !/no tool by that name/.test(said.text), said.text.slice(0, 70))
}
const doctorRaw = await rpc('tools/call', { name: 'doctor', arguments: {} })
ok('a success carries its summary and its next calls inside the structured copy, which is all Claude Code shows', typeof doctorRaw.result?.structuredContent?.summary === 'string' && Array.isArray(doctorRaw.result?.structuredContent?.next) && Array.isArray(doctorRaw.result?.structuredContent?.checks))
const lookNothing = await callTool('look', {})
ok('look with nothing to look at says what it needs', lookNothing.isError && /url or a projectId/.test(lookNothing.text))
const tracked=await rpc('tools/call',{name:'revise',arguments:{},_meta:{progressToken:'review-test'}})
ok('a long tool carries correlated progress without losing its terminal error',
  tracked.result?.isError && notifications.some(n=>n.progressToken==='review-test'&&n.progress===0&&n.message))
const noUrl = await callTool('inspect', {})
ok('inspect without a url says what it cannot do and what to do next', noUrl.isError && /^Cannot/.test(noUrl.text) && /Next:/.test(noUrl.text), noUrl.text.slice(0, 70))

/* ── refusals come back as content, not as transport faults ──────────────────────────────────── */
console.log('\n  when it is asked for something it cannot do')
const nothing = await callTool('motion', { html: '   ' })
ok('empty markup is refused', nothing.isError, nothing.text.slice(0, 60))
ok('and the refusal says what was missing', /markup/i.test(nothing.text))
const nowhere = await callTool('open', { target: 'video', path: '/nowhere/at/all.mp4' })
ok('open refuses a file that is not there rather than launching anything', nowhere.isError && /no file/i.test(nowhere.text), nowhere.text.slice(0, 60))
const nowhereRaw = await rpc('tools/call', { name: 'open', arguments: { target: 'video', path: '/nowhere/at/all.mp4' } })
ok('and the structured copy carries the same refusal, since that copy is all some agents read', /^Cannot .*Next:/.test(nowhereRaw.result?.structuredContent?.error || ''), nowhereRaw.result?.structuredContent?.error?.slice(0, 60))
const badTarget = await callTool('open', { target: 'desk' })
ok('and a target it does not know', badTarget.isError, badTarget.text.slice(0, 60))
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
 * A studio belongs to a workspace. It says which in .studio/studio.json and at its health route,
 * and an agent for another workspace starts its own rather than filing projects into this one.
 */
const owner = JSON.parse(readFileSync(path.join(realpathSync(process.cwd()), '.studio', 'studio.json'), 'utf8'))
const healthy = await fetch(`http://127.0.0.1:${PORT}/__motioneer/health`).then((r) => r.json()).catch(() => ({}))
ok('the studio records which workspace it serves, and says the same when asked', owner.port === PORT && healthy.nonce === owner.nonce && healthy.workspace === owner.workspace, owner.workspace)
const tooLong = await fetch(`http://127.0.0.1:${PORT}/__motioneer/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'x'.repeat(200_000) }) })
const tooLongSaid = await tooLong.json().catch(() => ({}))
ok('a prompt too long for one model call is refused whole, with the next step, rather than cut', tooLong.status === 413 && /^Cannot ask/.test(tooLongSaid.error || '') && /Next:/.test(tooLongSaid.error || ''), tooLongSaid.error?.slice(0, 60))
const elsewhere = realpathSync(mkdtempSync(path.join(tmpdir(), 'motioneer-elsewhere-')))
const { projectStore } = await import('../tools/editor/projects.mjs')
const seeded = await projectStore(path.join(elsewhere, '.studio', 'projects')).create('Seeded film')
const other = spawn('node', ['mcp/index.mjs'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, MOTIONEER_PORT: String(PORT), MOTIONEER_WORKSPACE: elsewhere, MOTIONEER_NO_OPEN: '1' } })
const otherWaiting = new Map()
let otherBuf = '', otherN = 100
other.stdout.on('data', (d) => { otherBuf += d; const lines = otherBuf.split('\n'); otherBuf = lines.pop(); for (const l of lines) { try { const m = JSON.parse(l); otherWaiting.get(m.id)?.(m) } catch { /* not a message */ } } })
const otherCall = (name, args) => new Promise((done) => { const id = ++otherN; otherWaiting.set(id, done); other.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n'); setTimeout(() => done({}), 30000) })
const otherSaid = (await otherCall('studio', {})).result?.content?.[0]?.text || ''
let theirs = null
try { theirs = JSON.parse(readFileSync(path.join(elsewhere, '.studio', 'studio.json'), 'utf8')) } catch { /* it never started */ }
ok('an agent for another workspace starts its own studio on the next port instead of reusing this one', !/already open/i.test(otherSaid) && theirs?.workspace === elsewhere && theirs?.port !== PORT && otherSaid.includes(String(theirs?.port)), otherSaid.slice(0, 70))
const listed = (await otherCall('projects', {})).result?.structuredContent
ok('projects lists the films on disk in its own workspace, with a summary and the next call', listed?.total === 1 && listed.projects?.[0]?.id === seeded.id && typeof listed.summary === 'string' && listed.next?.[0]?.tool === 'projects', listed?.summary)
const one = (await otherCall('projects', { projectId: seeded.id })).result?.structuredContent
ok('and describes one film by its id', one?.projectId === seeded.id && Array.isArray(one.shots) && Array.isArray(one.locked), one?.summary)
try { process.kill(theirs?.pid, 'SIGKILL') } catch { /* gone */ }
await new Promise((r) => setTimeout(r, 300))
const changed = (await otherCall('change', { projectId: seeded.id, cut: { seconds: 9 } })).result
const restarted = (() => { try { return JSON.parse(readFileSync(path.join(elsewhere, '.studio', 'studio.json'), 'utf8')) } catch { return null } })()
ok('change starts a studio when none is running and reaches the film, rather than saying to film again', changed?.isError && /no shots yet/.test(changed.content?.[0]?.text || '') && restarted?.nonce && restarted.nonce !== theirs?.nonce, changed?.content?.[0]?.text?.slice(0, 80))
const after = (await otherCall('projects', {})).result?.structuredContent
ok('and a capture film is changed on a take of its own, which records where it came from', after?.projects?.some((p) => p.origin?.sourceProjectId === seeded.id && p.origin?.tool === 'change'), JSON.stringify(after?.projects?.map((p) => p.origin)))
const noShot = (await otherCall('look', { projectId: seeded.id, shot: 3 })).result
ok('a filmstrip of a shot the film does not have says how many it has', noShot?.isError && /has 0 shots/.test(noShot.content?.[0]?.text || ''), noShot?.content?.[0]?.text?.slice(0, 80))
const noRecipe = (await otherCall('film', { refresh: seeded.id })).result
ok('a film made before recipes says why it cannot be refreshed, rather than filming something else', noRecipe?.isError && /before films kept their recipe/.test(noRecipe.content?.[0]?.text || ''), noRecipe?.content?.[0]?.text?.slice(0, 80))
const noTiming = (await otherCall('change', { projectId: seeded.id, timing: { duration: 0.7 } })).result
ok('timing on a film with nothing in it is refused before any take is made', noTiming?.isError && /does not have/.test(noTiming.content?.[0]?.text || ''), noTiming?.content?.[0]?.text?.slice(0, 80))
try { process.kill(restarted?.pid, 'SIGKILL') } catch { /* gone */ }
try { other.kill('SIGKILL') } catch { /* gone */ }

/* ── open, which is how a finished film's three choices get acted on ─────────────────────────── */
console.log('\n  opening what was made')
const editor = await callTool('open', { target: 'editor' })
ok('the editor opens at the studio that is running', !editor.isError && editor.text.includes(`${PORT}/__motioneer/editor`), editor.text.slice(0, 70))
const clip = path.join(mkdtempSync(path.join(tmpdir(), 'motioneer-open-')), 'film.mp4')
import('node:fs').then((fs) => fs.writeFileSync(clip, 'x'))
await new Promise((r) => setTimeout(r, 50))
const video = await callTool('open', { target: 'video', path: clip })
ok('a video that exists is opened by path', !video.isError && video.text.includes(clip), video.text.slice(0, 70))
const folder = await callTool('open', { target: 'folder', path: clip })
ok('and its folder is the directory, not the file', !folder.isError && folder.text.includes(path.dirname(clip)) && !folder.text.endsWith('film.mp4.'), folder.text.slice(0, 70))

/* ── an agent's own motion, held to the same gates and watched on its markup ──────────────────── */
console.log('\n  checking motion an agent wrote')
const rows = '<ul class="list"><li>One</li><li>Two</li><li>Three</li></ul>'
const passes = (await rpc('tools/call', { name: 'motion', arguments: { html: rows, check: '@media (prefers-reduced-motion: no-preference){[data-motion-rows] > li{animation:rise 320ms cubic-bezier(.16,1,.3,1) both}[data-motion-rows] > li:nth-child(2){animation-delay:60ms}[data-motion-rows] > li:nth-child(3){animation-delay:120ms}@keyframes rise{from{translate:0 14px}to{translate:0 0}}}' } })).result?.structuredContent
ok('a staggered sheet passes the gates and the house style', passes?.ok === true && passes.assembled?.ok === true, passes?.summary?.slice(0, 80))
const fails = (await rpc('tools/call', { name: 'motion', arguments: { html: rows, check: '@media (prefers-reduced-motion: no-preference){[data-motion-fade]{animation:fade 900ms ease-in-out both}@keyframes fade{from{opacity:0}to{opacity:1}}}' } })).result?.structuredContent
ok('a whole-component fade is refused with its reasons', fails?.ok === false && /at once/.test(fails.faults?.join(' ') || '') && /opacity 0/.test(fails.assembled?.notes?.join(' ') || ''), fails?.summary?.slice(0, 80))

/* ── one request never waits on another, and a cancelled one stays quiet ─────────────────────── */
console.log('\n  one request does not wait on another')
const ping = await rpc('ping', {})
ok('a ping is answered', !!ping.result && !ping.error)
const nobody = await rpc('resources/list', {})
ok('a method it does not serve is said to be one, rather than answered with nothing', nobody.error?.code === -32601, JSON.stringify(nobody.error))
const { createServer } = await import('node:http')
const slow = createServer((req, res) => setTimeout(() => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Slow</title><h1>A slow page</h1><section><h2>One</h2><p>The first card on it</p></section><section><h2>Two</h2><p>The second card on it</p></section>') }, 1500))
await new Promise((r) => slow.listen(0, '127.0.0.1', r))
const arrived = []
const raw = (method, params) => { const id = ++n; mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); return id }
const watch = (id) => new Promise((done) => waiting.set(id, (m) => { arrived.push(id); done(m) }))
const slowId = raw('tools/call', { name: 'look', arguments: { url: `http://127.0.0.1:${slow.address().port}/` } })
watch(slowId)
const doctorId = raw('tools/call', { name: 'doctor', arguments: {} })
await watch(doctorId)
ok('doctor answers while a look is still running', arrived[0] === doctorId && !arrived.includes(slowId))
mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: slowId, reason: 'verify' } })}\n`)
const afterId = raw('tools/call', { name: 'look', arguments: {} })
const queued = await Promise.race([watch(afterId), new Promise((r) => setTimeout(() => r(null), 90000))])
ok('a cancelled call sends no reply, and the next long call answers once it has stopped', !!queued && !arrived.includes(slowId), JSON.stringify(arrived))
slow.close()

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
