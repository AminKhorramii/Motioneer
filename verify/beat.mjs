/**
 * The minute before the first word has to look different from a hang.
 *
 * A design call spends sixty to a hundred seconds thinking, and while it does the reply is empty.
 * The server beats once a second so the connection carries something, and this proves the three
 * things that has to be true: the beats arrive before any words, they keep arriving, and they
 * leave the reply exactly as the model wrote it.
 *
 * The stand-in is written here rather than found on PATH, so this suite never spends a real
 * session and never depends on a file in /tmp surviving.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const REPLY = { worlds: [{ name: 'tide table' }, { name: 'betting slip' }] }

const dir = mkdtempSync(path.join(tmpdir(), 'wall-beat-'))
const bin = path.join(dir, 'claude')
writeFileSync(
  bin,
  `#!/usr/bin/env node
// thinks out loud for a moment, then answers, which is the shape of every real design call
const frame = (delta) => process.stdout.write(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta } }) + '\\n')
let n = 0
const think = setInterval(() => {
  // the real shape: the CLI takes the words out and sends a token estimate, so an empty
  // thinking field is what a healthy frame looks like and the type is the only signal
  frame({ type: 'thinking_delta', thinking: '', estimated_tokens: n * 50 })
  if (++n < 6) return
  clearInterval(think)
  for (const chunk of ${JSON.stringify(JSON.stringify(REPLY))}.match(/.{1,20}/gs)) frame({ type: 'text_delta', text: chunk })
  process.exit(0)
}, 400)
process.stdin.resume()
`,
  'utf8',
)
chmodSync(bin, 0o755)

const server = spawn('node', [path.join(import.meta.dirname, '..', 'server', 'index.mjs')], {
  env: { ...process.env, PORT: '0', PATH: `${dir}:${process.env.PATH}` },
  stdio: ['ignore', 'pipe', 'inherit'],
})
const url = await new Promise((resolve) => {
  let out = ''
  server.stdout.on('data', (d) => {
    out += d
    const m = out.match(/http:\/\/localhost:\d+/)
    if (m) resolve(m[0])
  })
})

const problems = []
const check = (ok, said) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${said}`)
  if (!ok) problems.push(said)
}

const res = await fetch(`${url}/api/cli`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ system: 'design worlds', user: 'go', kind: 'design' }),
})
const reader = res.body.getReader()
const dec = new TextDecoder()
let raw = ''
let beats = 0
let beforeAnyWord = 0
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = dec.decode(value, { stream: true })
  const said = chunk.replace(/\0/g, '')
  beats += chunk.length - said.length
  if (!raw && !said) beforeAnyWord = beats
  raw += chunk
}
server.kill()

const words = raw.replace(/\0/g, '')
check(beats >= 2, `the call beat while it thought  ${beats} beats`)
check(beforeAnyWord >= 1, 'the first beat arrived before the first word')
check(raw.indexOf('\0') < raw.search(/[^\0]/), 'nothing was written before the beats began')
check(words === JSON.stringify(REPLY), 'taking the beats out leaves the reply the model wrote')
check(!words.includes('\0'), 'no beat survives into the reply')
try {
  const back = JSON.parse(words)
  check(back.worlds?.length === 2, `the reply still parses  ${back.worlds?.length} worlds`)
} catch (e) {
  check(false, `the reply still parses  ${String(e).slice(0, 60)}`)
}

console.log(`\nerrors: ${problems.length ? problems.join('; ') : 'none'}`)
process.exit(problems.length ? 1 : 0)
