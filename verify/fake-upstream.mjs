/**
 * A local test upstream. It answers in Anthropic's wire format for text, and in Gemini's for
 * images, so the streaming path can be run
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
import { deflateSync } from 'node:zlib'
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
    const all = await Promise.all(names.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8'))))
    // a capture now contains the design reply as well as the page replies, and replaying a set
    // of worlds where a page was asked for is one guaranteed failure per wall
    return all.filter((fx) => !(fx.chunks ?? []).map((c) => c.text).join('').includes('"worlds"'))
  } catch {
    return []
  }
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * Copy designed to break the parser rather than to read well. Every string here targets a
 * specific fragility: braces and quotes inside strings must not end a JSON object early,
 * markup must be escaped rather than rendered, and multi-byte characters must survive being
 * split across network chunks.
 */
const HARD = (tag, i) => ({
  eyebrow: `${tag} · for teams shipping 24/7 — ünïcödé, 日本語, العربية`,
  headline: `Ship {fast}: 99.9% uptime, "guaranteed" & <b>proven</b> [${i}]`,
  sub: `Line one with a closing brace } mid sentence.\nLine two: <script>window.__pwned=1</script> & an ampersand.\nA backslash \\ and a quote " and an emoji 🚀🛰️ that must survive chunking.`,
  cta: `Start {now}`,
  cta2: 'See the "docs"',
  label: `${tag} <em>label</em>`,
  title: `A title with {braces} & "quotes"`,
  quote: `They said: "it just works }" and meant it.`,
  name: 'Ada <Lovelace>',
  role: 'CTO & co-founder',
  product: 'Wall & Co. {test}',
  note: 'note } with brace',
})

/** wrap a reply in the same frames a real stream uses, without the recorded pacing */
const intakeStream = (payload) =>
  frame('message_start', { type: 'message_start', message: { id: 'msg_fake', role: 'assistant' } }) +
  frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
  [...payload.matchAll(/[\s\S]{1,40}/g)]
    .map(([text]) => frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }))
    .join('') +
  frame('message_stop', { type: 'message_stop' })

/** A stand-in stream, used only when nothing has been captured yet. */
function synthetic(ids, tag, hard) {
  const payload = '```json\n' + JSON.stringify({
    sections: ids.map((id, i) => ({
      id,
      content: hard ? HARD(tag, i) : { headline: `${tag} headline ${i}`, sub: `${tag} sub ${i}` },
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

/**
 * Cut text into network sized chunks on a plausible clock, for the no-fixture case.
 *
 * In hard mode the split happens on the byte buffer at deliberately awkward offsets, so a
 * multi-byte character lands half in one chunk and half in the next. That is the case a
 * streaming decoder gets wrong, and slicing a JavaScript string would never produce it.
 */
function chunkUp(raw, hard) {
  const out = []
  if (hard) {
    const buf = Buffer.from(raw, 'utf8')
    for (let i = 0, at = 0; i < buf.length; at += 14) {
      const size = 7 + (i % 5)
      out.push({ at, text: buf.subarray(i, i + size) })
      i += size
    }
    return out
  }
  for (let i = 0, at = 0; i < raw.length; at += 16) {
    const size = 37 + (i % 23)
    out.push({ at, text: raw.slice(i, i + size) })
    i += size
  }
  return out
}

/** A real, decodable PNG built from scratch, so image assertions can check actual bytes. */
function png(w = 64, h = 40) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  // a gradient rather than a flat fill, so a "this is not one solid colour" check means something
  const rows = []
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3)
    for (let x = 0; x < w; x++) {
      row[1 + x * 3] = (x * 255) / w
      row[2 + x * 3] = (y * 255) / h
      row[3 + x * 3] = ((x ^ y) * 7) % 256
    }
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export async function fakeAnthropic(dir = FIXTURES, { answerWritten = true } = {}) {
  // 'hard' skips the captured corpus and serves copy built to break the parser
  const hard = dir === 'hard'
  const fixtures = hard ? [] : await loadFixtures(dir)
  /**
   * A design call needs a design reply.
   *
   * Fixtures used to be handed out by a single counter, which was faithful while the wall was
   * designed by one call: fixture zero was the design and the rest were pages. It stopped being
   * faithful the moment the design was split across several calls, because the later ones were
   * served page-shaped replies, produced no worlds, and quietly fell back to the built-in
   * worlds while the suite still reported no errors. Routing by what the call is asking for
   * keeps the replay honest however many calls the design is split into.
   */
  let seq = 0

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return void res.writeHead(204, CORS).end()

    const body = await new Promise((r) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => r(b))
    })

    // the openai shape: different frames, same job, and until now never tested
    if (req.url.includes('chat/completions')) {
      const ids = [...body.matchAll(/\\?"id\\?":\s*\\?"([a-z0-9]{5,})\\?"/g)].map((m) => m[1])
      const payload = body.includes('questions')
        ? JSON.stringify({ product: { name: 'Spoor', oneLiner: 'Findable in one keystroke.', what: '', audience: '', cta: 'Download' }, questions: [] })
        : JSON.stringify({ sections: ids.map((id, i) => ({ id, content: { headline: `openai headline ${i}` } })) })
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      for (const [text] of payload.matchAll(/[\s\S]{1,17}/g)) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
        await new Promise((r) => setTimeout(r, 3))
      }
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    // images are one response rather than a stream, so they take the short path
    if (req.url.includes('generateContent')) {
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' })
      res.end(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png().toString('base64') } }] } }],
      }))
      return
    }
    // the page shape is embedded in a JSON body, so its quotes arrive escaped
    const ids = [...body.matchAll(/\\?"id\\?":\s*\\?"([a-z0-9]{5,})\\?"/g)].map((m) => m[1])
    // a design request asks for worlds, and the reply exercises the clamping on the way in, so
    // some values here are deliberately out of range
    // route on the user message, not on words in the system prompt: the design prompt mentions
    // questions as a section kind, which used to send it to the intake branch
    if (body.includes('worlds for it')) {
      const faces = ['sans', 'grotesk', 'serif', 'mono']
      const backdrops = ['none', 'contours', 'grain', 'ridge']
      const palettes = ['as-is', 'mono', 'tinted', 'contrast']
      const reply = '```json\n' + JSON.stringify({
        worlds: Array.from({ length: 8 }, (_, i) => ({
          name: ['wall label', 'field manual', 'night edition', 'receipt', 'broadsheet', 'sign system', 'zine', 'gallery card'][i],
          note: `a made world number ${i + 1}`,
          voice: i % 2 ? 'Write six words where you would write twenty.' : 'Write densely and specifically.',
          display: faces[i % 4], body: faces[(i + 2) % 4],
          scale: i === 0 ? 9 : 1.15 + i * 0.06,
          weight: i === 1 ? 5000 : 300 + i * 60,
          radius: i === 2 ? 400 : i * 3,
          density: 0.3 + i * 0.07,
          caps: i % 3 === 0,
          palette: palettes[i % 4],
          backdrop: i === 3 ? 'nonsense' : backdrops[i % 4],
          structure: {
            rules: i % 2 === 0, numbered: i % 3 === 0, bleed: i % 4 === 0,
            measure: i === 0 ? 400 : 46 + i * 4,
            figure: ['framed', 'bleed', 'plain'][i % 3],
          },
          prefer: { hero: i % 4, features: i % 3, showcase: i % 2, quote: i % 2, pricing: i % 2, faq: i % 2, cta: i % 2, logos: i % 2 },
          sections: [
            ['hero', 'features', 'pricing', 'cta', 'footer'],
            ['hero', 'quote', 'features', 'faq', 'cta', 'footer'],
            ['features', 'pricing', 'footer'],
            ['hero', 'logos', 'showcase', 'quote', 'cta', 'footer'],
            ['hero', 'features', 'features', 'faq', 'footer'],
            ['hero', 'showcase', 'pricing', 'faq', 'cta', 'footer'],
            ['quote', 'features', 'cta', 'footer'],
            ['hero', 'logos', 'features', 'showcase', 'quote', 'pricing', 'faq', 'cta', 'footer'],
          ][i],
          css: i === 0
            ? '@import url(https://evil.example/x.css); section{border-top:2px dashed var(--line)} h1{letter-spacing:-.03em} .btn-primary{background:url(https://evil.example/a.png)}'
            : `section#hero .wrap{border:1px solid var(--line)} .card{border-radius:0} .eyebrow{letter-spacing:.${i}em}`,
        })),
      }) + '\n```'
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      for (const { text } of chunkUp(intakeStream(reply))) res.write(text)
      return res.end()
    }

    // an intake asks for a product and questions rather than sections, so it needs its own reply
    // match without quotes: the prompt travels inside a JSON body, so its quotes are escaped
    if (body.includes('questions')) {
      const reply = '```json\n' + JSON.stringify({
        product: {
          name: 'Spoor',
          oneLiner: 'Every session you ever ran, findable in one keystroke.',
          what: 'It reads what your tools already write to disk and makes it searchable.',
          audience: '',
          cta: 'Download for macOS',
        },
        questions: [{ key: 'audience', question: 'Who specifically is this for?', why: 'the page needs a reader' }],
      }) + '\n```'
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      for (const { text } of chunkUp(intakeStream(reply))) res.write(text)
      return res.end()
    }

    /**
     * A design call must not spend a page fixture.
     *
     * loadFixtures drops the design capture on purpose, so a design call has nothing to replay
     * and the app falls back to its built-in worlds, which is the intent. What it must not do is
     * take the next page fixture on its way past: the corpus is a queue, and how many calls the
     * design happens to be split into would then decide which copy each paper is written from.
     * That is how splitting the design further turned this wall's headlines blank while the
     * suite still reported no errors.
     */
    if (/Design (?:one world|\d+ worlds) for it/.test(body)) {
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      return res.end()
    }

    /**
     * Nor may a call for a whole page, for exactly the same reason.
     *
     * There is no recorded capture of a page written whole, and it must not help itself to the
     * next copy fixture on the way past: the corpus is a queue, so three of them would shift every
     * arranged paper onto somebody else's words and change what the replay is replaying. Answering
     * nothing is also the case worth exercising, because it is the one the wall has to survive
     * without a hole in it, and the app falls back to arranging that place.
     */
    if (/Build it from /.test(body)) {
      /**
       * Two suites are about the copy stream, and this call is not part of it.
       *
       * A written page is one shot: it carries no sections, does not stream them, and renders from
       * its own markup rather than from the model this half of the app owns. So the suites that
       * exist to prove SSE framing, split frames, partial JSON, the progressive repaint and copy
       * built to break the parser all need the arranged path, and answering here would fill their
       * wall with pages none of that applies to. This half stands aside for them and every place
       * falls back to being arranged. The written half is checked adversarially against safeMarkup
       * directly, in verify/app.mjs.
       */
      if (hard || !answerWritten) {
        res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        return res.end()
      }
      // Named after the ground it was handed, so the suite can see the deal reach the page, and
      // carrying a headline because a page with no h1 is refused on the way in. This used to
      // answer nothing, which exercised only the fallback: fine while written pages were three of
      // eight and a hole once they became the wall, because the path that matters was untested.
      const ground = (body.match(/Build it from ([^:\\]+)/) || [])[1] || 'somewhere'
      const reply = '```json\n' + JSON.stringify({
        note: `a ${ground}`,
        ground,
        backdrop: 'dither',
        html: `<section class="lede"><h1>${ground} headline ${seq}</h1><p>Written whole, not arranged.</p></section>`,
        css: '.lede{padding:8rem 2rem}.lede h1{font-size:clamp(2rem,7vw,6rem)}'
          + '.lede::before{content:"";display:block;width:min(50vw,26rem);aspect-ratio:1;'
          + 'background:repeating-radial-gradient(circle,var(--ink) 0 1px,transparent 1px 5px)}',
      }) + '\n```'
      seq++
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      for (const { text } of chunkUp(intakeStream(reply))) res.write(text)
      return res.end()
    }

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
      : chunkUp(synthetic(ids, `angle${n}`, hard), hard)

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
