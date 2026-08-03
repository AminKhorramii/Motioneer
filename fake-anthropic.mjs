/**
 * A local server that answers in Anthropic's wire format, so the streaming path can be run
 * repeatedly without a key and without spending tokens.
 *
 * It prefers to replay a real captured stream from fixtures/, because a fake I invented would
 * only prove the parser handles what I imagined. Frames are replayed exactly as Anthropic
 * sent them and are cut into chunks at arbitrary byte offsets, so the reader has to survive
 * events split across reads. Section ids are rewritten to the ones in the incoming request,
 * since the app merges replies by id.
 *
 * With no fixture it falls back to a synthetic stream, so the suite still runs on a fresh
 * clone before anyone has captured anything.
 */
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const FIXTURES = path.join(process.cwd(), 'fixtures')
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

async function loadFixtures(dir) {
  try {
    const names = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
    return await Promise.all(names.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8'))))
  } catch {
    return []
  }
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/** A stand-in stream, used only when nothing has been captured yet. */
function synthetic(ids, tag) {
  const payload = '```json\n' + JSON.stringify({
    sections: ids.map((id, i) => ({
      id,
      content: { headline: `${tag} headline ${i}`, sub: `${tag} sub ${i}` },
    })),
  }) + '\n```'
  return (
    frame('message_start', { type: 'message_start', message: { id: 'msg_fake', role: 'assistant' } }) +
    frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    frame('ping', { type: 'ping' }) +
    [...payload.matchAll(/[\s\S]{1,11}/g)]
      .map(([text]) => frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }))
      .join('') +
    frame('content_block_stop', { type: 'content_block_stop', index: 0 }) +
    frame('message_stop', { type: 'message_stop' })
  )
}

/**
 * Replay a capture with its section ids pointed at this request, at its recorded pace.
 *
 * The rewrite happens on the assembled message text, never on the raw stream: the model emits
 * an id a few characters at a time, so an id is routinely split across two delta frames and a
 * search of the raw bytes would miss it. Deltas are reassembled, rewritten, then redistributed
 * across exactly the same frames, which keeps the original wording, whitespace and fences.
 */
function replay(fx, ids) {
  const chunks = fx.chunks ?? [{ at: 0, text: fx.raw }]
  const lines = chunks.map((c) => c.text).join('').split('\n')

  const deltas = []
  const frames = lines.map((line, i) => {
    if (!line.startsWith('data:')) return { i, line }
    let json
    try {
      json = JSON.parse(line.slice(5))
    } catch {
      return { i, line }
    }
    if (json.type === 'content_block_delta' && typeof json.delta?.text === 'string') {
      deltas.push({ i, json, len: json.delta.text.length })
    }
    return { i, line, json }
  })

  let text = deltas.map((d) => d.json.delta.text).join('')
  fx.ids.forEach((old, k) => {
    if (ids[k] && ids[k].length === old.length) text = text.split(old).join(ids[k])
  })

  let at = 0
  for (const d of deltas) {
    d.json.delta = { ...d.json.delta, text: text.slice(at, at + d.len) }
    at += d.len
    frames[d.i].line = `data: ${JSON.stringify(d.json)}`
  }

  const raw = frames.map((f) => f.line).join('\n')
  // keep the recorded pace, spreading the rebuilt bytes over the original chunk clock
  const total = chunks.reduce((a, c) => a + c.text.length, 0) || 1
  let cut = 0
  return chunks.map((c) => {
    const size = Math.round((c.text.length / total) * raw.length)
    const slice = raw.slice(cut, cut + size)
    cut += size
    return { at: c.at, text: slice }
  }).concat([{ at: chunks[chunks.length - 1]?.at ?? 0, text: raw.slice(cut) }])
}

/** Cut text into network sized chunks on a plausible clock, for the no-fixture case. */
function chunkUp(raw) {
  const out = []
  for (let i = 0, at = 0; i < raw.length; at += 16) {
    const size = 37 + (i % 23)
    out.push({ at, text: raw.slice(i, i + size) })
    i += size
  }
  return out
}

export async function fakeAnthropic(dir = FIXTURES) {
  const fixtures = await loadFixtures(dir)
  let seq = 0

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return void res.writeHead(204, CORS).end()

    const body = await new Promise((r) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => r(b))
    })
    // the page shape is embedded in a JSON body, so its quotes arrive escaped
    const ids = [...body.matchAll(/\\?"id\\?":\s*\\?"([a-z0-9]{5,})\\?"/g)].map((m) => m[1])
    const n = seq++
    // real calls do not return in lockstep, and a wall that appears all at once would not
    // exercise the code that puts one paper up while others are still writing
    await new Promise((r) => setTimeout(r, n * 70))

    // Rewrite ids on the whole stream before splitting it, never per chunk: a captured id
    // that straddles a chunk boundary would otherwise survive unreplaced, and that section
    // would silently fail to merge. Ids are a fixed width, so offsets are unchanged and the
    // recorded chunk boundaries still apply exactly.
    const plan = fixtures.length
      ? replay(fixtures[n % fixtures.length], ids)
      : chunkUp(synthetic(ids, `angle${n}`))

    res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    let clock = 0
    for (const { at, text } of plan) {
      if (at > clock) await new Promise((r) => setTimeout(r, at - clock))
      clock = at
      res.write(text)
    }
    res.end()
  })

  // bind to a loopback address and an ephemeral port, because other dev servers on this
  // machine hold fixed ports on ::1 and would silently answer instead
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { server, url: `http://127.0.0.1:${server.address().port}`, fixtures: fixtures.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url, fixtures } = await fakeAnthropic(process.argv[2])
  console.log(`fake anthropic at ${url}, ${fixtures} fixtures`)
}
