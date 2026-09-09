/**
 * The film lab: one command that films a site through the real server and lays out everything
 * needed to judge the result. It writes a report beside the film with the reply, every captured
 * element with its size and warnings, and every shot with its timing and boxes, and a contact
 * sheet of the shots. Every fix in the film tool so far came from looking at these for
 * linear.app, notion.so and framer.com rather than from reasoning about pages in the abstract,
 * so iterate with it: film, look, fix, film again.
 *
 *   node tools/film-lab.mjs https://linear.app fast 15 ["the hero and the cards"] ["direction…"]
 *
 * Needs the network, the renderer and a model; a lab is not a suite. Reports and sheets go to
 * .context/studio-redesign/lab-<site>.txt and .png, which git ignores.
 */
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
/**
 * One url films one site. A file of urls, one per line, films them all in sequence and keeps a
 * summary table beside the reports, one row per site with its verdict, its shape and its time, so
 * a pass over forty landings reads as a page rather than as forty replies. A site that fails is a
 * row too, with its reason, and the pass goes on to the next.
 */
const argv = process.argv.slice(2)
if (argv[0] && !/^https?:/.test(argv[0]) && existsSync(argv[0])) {
  const sites = readFileSync(argv[0], 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const summary = path.join(process.cwd(), '.context/studio-redesign/lab-summary.md')
  if (!existsSync(summary)) writeFileSync(summary, '| site | verdict | shots | distinct | layouts | found | left out | time | note |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n')
  for (const site of sites) {
    const r = spawnSync(process.execPath, [process.argv[1], site, ...argv.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 420000 })
    const text = (r.stdout || '') + (r.stderr || '')
    const tag = (() => { try { return new URL(site).hostname.replace(/^www\./, '') } catch { return site } })()
    const verdict = /Verified from the frames/.test(text) ? 'verified' : /Checked the frames: ([^.]*)/.exec(text)?.[1]?.slice(0, 70) || (/Cannot [^\n]*?(?= Next:|\n)/.exec(text)?.[0]?.replace(/https?:\/\/\S+/, 'it').slice(0, 90)) || (r.status === null ? 'timed out' : 'no reply')
    const shape = /(\d+) shots of (\d+) distinct elements in (\d+) layout/.exec(text) || []
    const found = /Found (\d+) things/.exec(text)?.[1] || '', left = /Left out (\d+)/.exec(text)?.[1] || '0', took = /, (\d+)s\n/.exec(text)?.[1] || ''
    const note = /NO MOTION/.test(text) ? `${(text.match(/NO MOTION/g) || []).length} without motion` : ''
    appendFileSync(summary, `| ${tag} | ${verdict} | ${shape[1] || ''} | ${shape[2] || ''} | ${shape[3] || ''} | ${found} | ${left} | ${took}s | ${note} |\n`)
    console.log(`${tag.padEnd(22)} ${verdict}`)
  }
  process.exit(0)
}
const [url, pace = 'fast', seconds = '15', pick = '', direction = ''] = argv
const root = process.cwd(), out = path.join(root, '.context/studio-redesign'), tag = new URL(url).hostname.replace(/^www\./, '').split('.')[0]
// the lab's own port, so a pass over forty sites never kills a studio somebody is using on 4321
const PORT = Number(process.env.MOTIONEER_LAB_PORT || 4340)
for (const p of [PORT, PORT + 1, PORT + 2]) spawn('sh', ['-c', `lsof -ti tcp:${p} | xargs -r kill -9`])
await new Promise((r) => setTimeout(r, 900))
const srv = spawn(process.execPath, [path.join(root, 'mcp', 'index.mjs')], { cwd: root, env: { ...process.env, MOTIONEER_NO_OPEN: '1', MOTIONEER_PORT: String(PORT) }, stdio: ['pipe', 'pipe', 'pipe'] })
let buf = ''; const send = (o) => srv.stdin.write(JSON.stringify(o) + '\n'); const t0 = Date.now()
const text = await new Promise((resolve) => {
  srv.stdout.on('data', (b) => { buf += b; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let m; try { m = JSON.parse(line) } catch { continue }
    if (m.id === 1) send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'film', arguments: { url, dir: out, pace, seconds: Number(seconds), ...(pick ? { pick } : {}), ...(direction ? { direction } : {}) } } })
    if (m.id === 2) resolve(m.result?.content?.[0]?.text || JSON.stringify(m)) } })
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'lab', version: '1' } } })
  setTimeout(() => resolve('TIMEOUT'), 560000)
})
const took = Math.round((Date.now() - t0) / 1000)
const file = /saved to (\S+\.mp4)/.exec(text)?.[1]
const list = await (await fetch(`http://localhost:${PORT}/__motioneer/projects`)).json()
const proj = list.find((p) => p.name === `Film of ${new URL(url).host}`) || list[0]
const j = await (await fetch(`http://localhost:${PORT}/__motioneer/projects/` + proj.id)).json()
const subs = j.subjects.map((s, i) => `  [${i}] ${(s.name || '').slice(0, 44).padEnd(46)} ${(s.w + 'x' + s.h).padEnd(9)} ${j.motions.find((m) => m.subjectId === s.id && m.saved) ? 'motion' : 'NO MOTION'} ${s.warnings.filter((w) => !/stylesheets|inaccessible/.test(w)).join('; ').slice(0, 60)}`)
const comps = j.tracks.filter((t) => t.kind === 'component')
const shots = [...new Set(comps.map((t) => t.start))].sort((a, b) => a - b).map((st) => { const on = comps.filter((t) => t.start === st); return `${(st / 1000).toFixed(1)}s ${(on[0].duration / 1000).toFixed(1)}s ` + on.map((t) => `${j.subjects.findIndex((s) => s.id === t.subjectId)}@${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.width)}x${Math.round(t.height)}`).join(' + ') })
const report = `# ${tag} ${pace} ${seconds}s, ${took}s\n${text}\n\nsubjects:\n${subs.join('\n')}\n\nshots:\n${shots.join('\n')}\n`
writeFileSync(path.join(out, `lab-${tag}.txt`), report)
if (file) { const n = Math.min(12, shots.length + 2); spawn('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=1/${(Number(seconds) / n).toFixed(2)},scale=384:216,tile=6x2`, '-frames:v', '1', path.join(out, `lab-${tag}.png`)]).on('exit', () => { console.log(report); srv.kill('SIGTERM'); process.exit(0) }) }
else { console.log(report); srv.kill('SIGTERM'); process.exit(1) }
