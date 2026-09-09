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
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
const [url, pace = 'fast', seconds = '15', pick = '', direction = ''] = process.argv.slice(2)
const root = process.cwd(), out = path.join(root, '.context/studio-redesign'), tag = new URL(url).hostname.replace(/^www\./, '').split('.')[0]
for (const p of [4321, 4322, 4323]) spawn('sh', ['-c', `lsof -ti tcp:${p} | xargs -r kill -9`])
await new Promise((r) => setTimeout(r, 900))
const srv = spawn(process.execPath, [path.join(root, 'mcp', 'index.mjs')], { cwd: root, env: { ...process.env, MOTIONEER_NO_OPEN: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
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
const list = await (await fetch('http://localhost:4321/__motioneer/projects')).json()
const proj = list.find((p) => p.name === `Film of ${new URL(url).host}`) || list[0]
const j = await (await fetch('http://localhost:4321/__motioneer/projects/' + proj.id)).json()
const subs = j.subjects.map((s, i) => `  [${i}] ${(s.name || '').slice(0, 44).padEnd(46)} ${(s.w + 'x' + s.h).padEnd(9)} ${j.motions.find((m) => m.subjectId === s.id && m.saved) ? 'motion' : 'NO MOTION'} ${s.warnings.filter((w) => !/stylesheets|inaccessible/.test(w)).join('; ').slice(0, 60)}`)
const comps = j.tracks.filter((t) => t.kind === 'component')
const shots = [...new Set(comps.map((t) => t.start))].sort((a, b) => a - b).map((st) => { const on = comps.filter((t) => t.start === st); return `${(st / 1000).toFixed(1)}s ${(on[0].duration / 1000).toFixed(1)}s ` + on.map((t) => `${j.subjects.findIndex((s) => s.id === t.subjectId)}@${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.width)}x${Math.round(t.height)}`).join(' + ') })
const report = `# ${tag} ${pace} ${seconds}s, ${took}s\n${text}\n\nsubjects:\n${subs.join('\n')}\n\nshots:\n${shots.join('\n')}\n`
writeFileSync(path.join(out, `lab-${tag}.txt`), report)
if (file) { const n = Math.min(12, shots.length + 2); spawn('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=1/${(Number(seconds) / n).toFixed(2)},scale=384:216,tile=6x2`, '-frames:v', '1', path.join(out, `lab-${tag}.png`)]).on('exit', () => { console.log(report); srv.kill('SIGTERM'); process.exit(0) }) }
else { console.log(report); srv.kill('SIGTERM'); process.exit(1) }
