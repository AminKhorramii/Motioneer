#!/usr/bin/env node
/**
 * Does an agent reach for the right Motioneer tool when a person asks for motion in their own words?
 *
 * Every other suite drives the tools directly, so none of them could see that Claude Code shows an
 * agent only the first 2,048 characters of the server's card, or that two tools both claimed "a
 * video of a site". This one asks a real model, through the real card and tool list, what it would
 * call for each request, and scores the first call against what the request means. The calls reach
 * verify/routing-proxy.mjs, which records them and makes nothing.
 *
 * It needs the claude command and spends model calls, so it is not part of verify:all.
 *
 *   node verify/routing.mjs [--runs 3] [--jobs 4] [--model haiku] [--only 1,5] [--out report.json]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const flag = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] }
const RUNS = Number(flag('--runs', 1)), JOBS = Number(flag('--jobs', 4)), MODEL = flag('--model', 'haiku')
const ONLY = flag('--only', '') ? new Set(flag('--only', '').split(',').map(Number)) : null

const capture = 'Earlier in this conversation you made a film with Motioneer. Its reply said: projectId p-demo, a 20 second brisk capture film of http://localhost:3000, video /tmp/demo/motioneer/localhost-brisk-1.mp4, shots: 1 Hero (subject s-hero), 2 Pricing cards (s-pricing), 3 Testimonials (s-quotes), 4 Footer (s-footer).'
const reel = 'Earlier in this conversation you made a reel with Motioneer. Its reply said: projectId r-demo, an 18 second native brand film of https://www.notion.so, video /tmp/demo/motioneer/notion-auto-1.mp4, shots with their track IDs: 1 t1 Opening, 2 t2 Ideas detail, 3 t3 Pricing detail, 4 t4 Board reveal, 5 t5 Closing mark.'
const has = (v, re) => re.test(JSON.stringify(v ?? ''))
const authored = (a) => !a.mode || a.mode !== 'capture'

/**
 * What each request means, as the tool and arguments it should produce on each surface. v11 is the
 * surface of eleven tools; v8 is the folded one. null means no tool fits, and calling none is right.
 */
const INTENTS = [
  { say: 'Make me a snappy 15-second launch video of linear.app.', v11: ['reel', authored], v8: ['film', authored] },
  { say: 'Make a demo video of my app running at http://localhost:3000.', v11: ['film'], v8: ['film', (a) => !a.mode || a.mode === 'capture'] },
  { say: 'Film the pricing cards and the hero on http://localhost:5173, fast cuts.', v11: ['film', (a) => has(a.pick, /pricing/i) && a.pace === 'fast'], v8: ['film', (a) => has(a.pick, /pricing/i) && a.pace === 'fast'] },
  { say: 'Create a cinematic brand film for stripe.com with deep techno at 150 BPM.', v11: ['reel', (a) => a.bpm === 150], v8: ['film', (a) => a.bpm === 150 && authored(a)] },
  { say: 'I want a calm, elegant 30-second showcase of the components on http://localhost:3000.', v11: ['film', (a) => a.pace === 'calm'], v8: ['film', (a) => a.pace === 'calm'] },
  { say: 'Make a native detail film from https://www.raycast.com/ using the real interface details.', v11: ['reel', (a) => a.mode === 'native'], v8: ['film', (a) => a.mode === 'native'] },
  { say: 'Turn notion.so into a playful 20-second product film that mixes real screenshots with illustrated graphics.', v11: ['reel', (a) => ['hybrid', 'auto', undefined].includes(a.mode)], v8: ['film', (a) => ['hybrid', 'auto', undefined].includes(a.mode)] },
  { say: 'Make a quick video of my site at http://localhost:4000, but keep it completely silent.', v11: ['film', (a) => a.soundtrack === 'none'], v8: ['film', (a) => a.soundtrack === 'none' || /silent/i.test(a.direction || '')] },
  { say: 'What could you film on https://vercel.com?', v11: ['inspect'], v8: ['look', (a) => !!a.url] },
  { say: 'Before rendering anything, show me which elements are on http://localhost:3000.', v11: ['inspect'], v8: ['look', (a) => !!a.url] },
  { context: capture, say: 'Review the film you just made and tell me what is weak.', v11: ['review', (a) => a.projectId === 'p-demo'], v8: ['look', (a) => a.projectId === 'p-demo'] },
  { context: reel, say: 'Show me the frames of that reel before we change anything.', v11: ['review', (a) => a.projectId === 'r-demo'], v8: ['look', (a) => a.projectId === 'r-demo'] },
  { say: 'Animate this component: <ul class="list"><li>One</li><li>Two</li><li>Three</li></ul>', v11: ['motion'], v8: ['motion'] },
  { say: 'Give this card an entrance animation, CSS only: <div class="card"><h3>Pro</h3><p>$20 a month</p><button>Buy</button></div>', v11: ['motion'], v8: ['motion'] },
  { say: 'Write an idle animation for this status badge: <span class="badge"><i class="dot"></i>Live</span>', v11: ['motion', (a) => a.purpose === 'idle'], v8: ['motion', (a) => a.purpose === 'idle'] },
  { say: 'Open the motion studio on my app at http://localhost:3000 so I can pick elements myself.', v11: ['studio'], v8: ['studio'] },
  { say: 'I would rather compare a few motions for my header by hand.', v11: ['studio'], v8: ['studio'] },
  { context: capture, say: 'Drop the footer shot.', v11: ['revise', (a) => has(a.drop, /4|footer/i)], v8: ['change', (a) => a.projectId === 'p-demo' && has(a.cut?.drop, /4|footer/i)] },
  { context: capture, say: 'Make it 10 seconds long.', v11: ['revise', (a) => a.seconds === 10], v8: ['change', (a) => a.cut?.seconds === 10] },
  { context: capture, say: 'Put the pricing shot first.', v11: ['revise', (a) => a.order?.[0] === 2], v8: ['change', (a) => a.cut?.order?.[0] === 2] },
  { context: capture, say: 'Change the opening title to "Ship Faster".', v11: ['revise', (a) => /ship faster/i.test(a.opening || '')], v8: ['change', (a) => /ship faster/i.test(a.cut?.opening || '')] },
  { context: capture, say: 'Slower cut, please.', v11: ['revise', (a) => a.pace === 'calm'], v8: ['change', (a) => a.cut?.pace === 'calm'] },
  { context: capture, say: 'Make the pricing cards glide in more slowly.', v11: ['revise', (a) => !!a.motionDirection], v8: ['change', (a) => !!a.motion?.direction || a.timing?.duration > 1] },
  { context: reel, say: 'Sharpen the arrival of the pricing detail and keep everything else as it is.', v11: ['refine', (a) => has(a.trackIds, /t3/)], v8: ['change', (a) => has(a.motion?.trackIds, /t3/) || has(a.motion?.elements, /t3|3|pricing/i)] },
  { context: reel, say: 'Lock the closing mark, and make the ideas detail snappier.', v11: ['refine', (a) => has(a.trackIds, /t2/) && has(a.lockedTrackIds, /t5/)], v8: ['change', (a) => has(a.motion?.trackIds, /t2/) && has(a.motion?.lockedTrackIds, /t5/)] },
  { context: capture, say: 'The hero motion feels too bouncy, calm it down.', v11: ['revise', (a) => !!a.motionDirection], v8: ['change', (a) => !!a.motion?.direction || !!a.timing] },
  { context: capture, say: 'Give it a darker techno score instead.', v11: ['rescore'], v8: ['change', (a) => !!a.music] },
  { context: capture, say: 'Use my own track at /Users/me/Music/theme.wav as the music.', v11: ['rescore', (a) => has(a.audioFile, /theme\.wav/)], v8: ['change', (a) => has(a.music?.audioFile, /theme\.wav/)] },
  { context: capture, say: 'Remove the music entirely.', v11: ['revise', (a) => a.soundtrack === 'none'], v8: ['change', (a) => a.cut?.soundtrack === 'none' || a.music?.identity === 'none'] },
  { say: 'What films have we made in this project so far?', v11: [null], v8: ['projects'] },
  { say: 'Make yesterday\'s Linear film shorter.', v11: [null], v8: ['projects'] },
  { say: 'Is Motioneer set up correctly on this machine?', v11: ['doctor'], v8: ['doctor'] },
  { context: capture, say: 'Open the video.', v11: ['open', (a) => a.target === 'video'], v8: ['open', (a) => a.target === 'video'] },
  { context: capture, say: 'Open it in the editor.', v11: ['open', (a) => a.target === 'editor'], v8: ['open', (a) => a.target === 'editor'] },
  { say: 'Make a motion clip out of this screenshot: /Users/me/Desktop/hero.png', v11: [null], v8: [null] },
  { say: 'Make a 12-second kinetic typography reel for a product called Biscuit. There is no website yet.', v11: ['reel', (a) => !a.url], v8: ['film', (a) => !a.url && (!a.mode || a.mode === 'graphic')] },
  { say: 'Film https://linear.app again, and this time include the changelog section.', v11: ['film', (a) => has(a.pick, /changelog/i)], v8: ['film', (a) => has(a.pick, /changelog/i) || has(a.direction, /changelog/i)] },
  { say: 'Here is the new pricing section from my pull request, give it motion: <section class="pricing"><h2>Plans</h2><div class="tier">Free</div><div class="tier">Pro</div><div class="tier">Team</div></section>', v11: ['motion'], v8: ['motion'] },
]

/** The real card and tool list, as an agent receives them. */
async function surface() {
  const server = spawn(process.execPath, [path.join(ROOT, 'mcp', 'index.mjs')], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, MOTIONEER_NO_OPEN: '1' } })
  const answers = new Map()
  let buf = ''
  server.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) { try { const m = JSON.parse(l); answers.set(m.id, m) } catch {} } })
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'routing', version: '1' } } }) + '\n')
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
  for (let n = 0; n < 100 && !answers.has(2); n++) await new Promise((r) => setTimeout(r, 50))
  server.kill()
  const tools = answers.get(2)?.result?.tools?.map((t) => t.name) ?? []
  return { tools, card: answers.get(1)?.result?.instructions?.length ?? 0, name: tools.includes('change') ? 'v8' : 'v11' }
}

function ask(intent, tools, run) {
  const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'motioneer-routing-')))
  const log = path.join(work, 'calls.jsonl'), config = path.join(work, 'mcp.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { motioneer: { command: process.execPath, args: [path.join(ROOT, 'verify', 'routing-proxy.mjs')], env: { ROUTING_LOG: log, MOTIONEER_WORKSPACE: work, MOTIONEER_PORT: '4461' } } } }))
  const prompt = (intent.context ? intent.context + '\n\nThe person now says: ' : '') + intent.say
  return new Promise((done) => {
    const child = spawn('claude', ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--strict-mcp-config', '--mcp-config', config, '--tools', '', '--allowedTools', tools.map((t) => `mcp__motioneer__${t}`).join(','), '--max-turns', '3'], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000)
    child.on('exit', () => {
      clearTimeout(timer)
      const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
      done({ run, calls })
    })
  })
}

const seen = await surface()
console.log(`\n  routing on the ${seen.name} surface: ${seen.tools.length} tools, a card of ${seen.card} characters, model ${MODEL}, ${RUNS} run${RUNS === 1 ? '' : 's'}\n`)
const jobs = INTENTS.flatMap((intent, i) => (ONLY && !ONLY.has(i + 1)) ? [] : Array.from({ length: RUNS }, (_, run) => ({ intent, i, run })))
const results = []
for (let k = 0; k < jobs.length; k += JOBS) {
  const batch = await Promise.all(jobs.slice(k, k + JOBS).map(async (job) => ({ ...job, ...(await ask(job.intent, seen.tools, job.run)) })))
  for (const r of batch) {
    const [tool, check] = r.intent[seen.name], first = r.calls[0]
    const toolOk = tool === null ? !first : first?.tool === tool
    const argsOk = toolOk && (!check || !first || check(first.args || {}))
    results.push({ intent: r.i + 1, run: r.run, say: r.intent.say, expected: tool, called: first?.tool ?? null, args: first?.args ?? null, toolOk, argsOk })
    console.log(`  ${argsOk ? 'ok  ' : toolOk ? 'args' : 'FAIL'} ${String(r.i + 1).padStart(2)} ${r.intent.say.slice(0, 64).padEnd(64)}  wanted ${tool ?? 'nothing'}, got ${first?.tool ?? 'nothing'}${first && !argsOk && toolOk ? ' ' + JSON.stringify(first.args).slice(0, 80) : ''}`)
  }
}
const share = (k) => Math.round(100 * results.filter((r) => r[k]).length / results.length)
const summary = { surface: seen.name, tools: seen.tools.length, card: seen.card, model: MODEL, runs: RUNS, cases: results.length, tool: share('toolOk'), args: share('argsOk') }
console.log(`\n  right tool ${summary.tool}%, right tool and arguments ${summary.args}% over ${results.length} cases\n`)
const out = flag('--out', '')
if (out) writeFileSync(out, JSON.stringify({ summary, results }, null, 2))
