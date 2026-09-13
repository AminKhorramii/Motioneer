/**
 * The model layer, exercised against a server that speaks the wire formats.
 *
 * The thing worth testing here is not that a catalogue has seven entries. It is that pointing an
 * entry somewhere actually sends the request there, in the shape that endpoint expects, and that the
 * reply comes back as text. That failure mode is invisible to a shape assertion and obvious to a
 * round trip, so this stands up a local server that answers in both formats and talks to it.
 *
 * The other thing asserted is that the key does not come back out. A settings panel is fed by
 * `publicly`, and the day that starts returning the secret is the day it lands in somebody's
 * screenshot, so it is checked rather than trusted.
 *
 *   node verify/model.mjs
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { PROVIDERS, providerById, resolve, missing, publicly, write, check } from '../shared/model.mjs'
import { REQUESTS } from '../shared/providers.mjs'
import { judgeMotion } from '../dist-core/core.js'

let bad = 0
const ok = (how, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${how}${detail ? `  ${detail}` : ''}`)
  if (!cond) bad++
}

// A declared scope without a selector once bypassed leak detection and failed only when saved.
const globalMotion=judgeMotion({scope:'data-mn',css:'@media (prefers-reduced-motion:no-preference){:root{animation:rise 900ms both}@keyframes rise{from{opacity:0}to{opacity:1}}}'})
ok('an unscoped motion is rejected before it can reach the project',!globalMotion.css&&/data attribute selector/.test(globalMotion.why||''))

/* ── a server that answers in both formats, so the round trip is real ─────────────────────────── */
const seen = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', (d) => { body += d })
  req.on('end', () => {
    seen.push({ path: req.url, headers: req.headers, body: JSON.parse(body || '{}') })
    if (req.url.includes('/refuse')) {
      res.writeHead(401, { 'content-type': 'text/plain' })
      return res.end('invalid x-api-key')
    }
    const anthropic = req.url.includes('/v1/messages')
    const frame = (t) => (anthropic
      ? { type: 'content_block_delta', delta: { text: t } }
      : { choices: [{ delta: { content: t } }] })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const word of ['ready', '']) res.write(`data: ${JSON.stringify(frame(word))}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  })
})
await new Promise((go) => server.listen(0, '127.0.0.1', go))
const at = `http://127.0.0.1:${server.address().port}`

/* ── the catalogue is data other code indexes into, so its shape is load bearing ──────────────── */
console.log('\n  the catalogue')
ok('every entry carries what a panel needs to draw it',
  PROVIDERS.every((p) => p.id && p.label && p.shape && Array.isArray(p.needs) && Array.isArray(p.models)),
  `${PROVIDERS.length} providers`)
ok('every shape is one the wire layer knows',
  PROVIDERS.every((p) => p.shape === 'cli' || REQUESTS[p.shape]),
  [...new Set(PROVIDERS.map((p) => p.shape))].join(', '))
ok('ids are unique', new Set(PROVIDERS.map((p) => p.id)).size === PROVIDERS.length)

/* ── the part that has to run somewhere with no filesystem and no shell ───────────────────────── */
console.log('\n  portability')
const src = readFileSync(new URL('../shared/model.mjs', import.meta.url), 'utf8')
const topLevel = src.slice(0, src.indexOf('export async function write'))
ok('nothing imports a node builtin at module scope', !/^import[^\n]*['"]node:/m.test(topLevel),
  'so a worker can load it')
ok('the command line provider is loaded only when chosen', /await import\('\.\/cli\.mjs'\)/.test(src))
ok('providers.mjs imports no node builtin either',
  !/^import[^\n]*['"]node:/m.test(readFileSync(new URL('../shared/providers.mjs', import.meta.url), 'utf8')))

/* ── filling in and refusing ──────────────────────────────────────────────────────────────────── */
console.log('\n  resolving a config')
ok('an unset model falls back to the first the provider lists',
  resolve({ provider: 'anthropic' }).model === providerById('anthropic').models[0])
ok('an explicit model wins', resolve({ provider: 'anthropic', model: 'x' }).model === 'x')
ok('an unknown provider does not throw', resolve({ provider: 'nope' }).provider === PROVIDERS[0].id)
ok('a provider needing a key says so without one',
  missing({ provider: 'openai' }).join() === 'an api key')
ok('and says nothing with one', missing({ provider: 'openai', key: 'k' }).length === 0)
ok('one needing a base url says so', missing({ provider: 'compatible' }).join() === 'a base url')
ok('the command line needs nothing', missing({ provider: 'claude-cli' }).length === 0)

/* ── the secret ───────────────────────────────────────────────────────────────────────────────── */
console.log('\n  what a browser is told')
const shown = publicly({ provider: 'anthropic', key: 'sk-secret-value', model: 'm' })
ok('the key is not in it', !JSON.stringify(shown).includes('secret'), JSON.stringify(shown))
ok('but whether there is one is', shown.hasKey === true)
ok('and it is false when there is not', publicly({ provider: 'anthropic' }).hasKey === false)

/* ── the round trip, which is the only proof the dispatch works ───────────────────────────────── */
console.log('\n  talking to something')
const openai = await write('sys', 'user', { provider: 'compatible', base: at, key: 'k', model: 'my-model' })
ok('an openai shaped endpoint answers', openai.text === 'ready', JSON.stringify(openai).slice(0, 80))
ok('it was asked at the chat completions path', seen.at(-1).path === '/v1/chat/completions')
ok('with a bearer key', seen.at(-1).headers.authorization === 'Bearer k')
ok('and the model name that was configured', seen.at(-1).body.model === 'my-model')
ok('and the system prompt as a system message', seen.at(-1).body.messages[0].content === 'sys')

const anthropic = await write('sys', 'user', { provider: 'anthropic', base: at, key: 'k2', model: 'claude-x' })
ok('an anthropic shaped endpoint answers', anthropic.text === 'ready', JSON.stringify(anthropic).slice(0, 80))
ok('it was asked at the messages path', seen.at(-1).path === '/v1/messages')
ok('with the header that vendor wants', seen.at(-1).headers['x-api-key'] === 'k2')
ok('and the system prompt hoisted out of the messages', seen.at(-1).body.system === 'sys')
ok('a configured base url beats the environment',
  seen.at(-1).headers.host === at.replace('http://', ''),
  'which an admin panel depends on entirely')

/* ── failures come back as words, because a retry loop reads them ─────────────────────────────── */
console.log('\n  when it goes wrong')
const refused = await write('sys', 'user', { provider: 'compatible', base: `${at}/refuse`, key: 'k' })
ok('a refusal is an error rather than a throw', !!refused.error, String(refused.error).slice(0, 60))
ok('and it carries the status, so the caller can tell auth from busy',
  /401/.test(refused.error || ''))
const nokey = await write('sys', 'user', { provider: 'openai' })
ok('a missing key is caught before any request', /needs an api key/.test(nokey.error || ''),
  String(nokey.error))

const good = await check({ provider: 'compatible', base: at, key: 'k' })
ok('the test button gets a verdict', good.ok === true && good.said === 'ready', JSON.stringify(good))
const bad2 = await check({ provider: 'compatible', base: `${at}/refuse`, key: 'k' })
ok('and a reason when it fails', bad2.ok === false && !!bad2.why, String(bad2.why).slice(0, 50))

server.close()
console.log(bad ? `\n  ${bad} failed\n` : `\n  all good, ${seen.length} requests made\n`)
process.exit(bad ? 1 : 0)
