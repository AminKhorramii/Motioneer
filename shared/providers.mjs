/**
 * The model path, shared by both builds. Electron calls this from its main process, where
 * there is no CORS wall, and the web build calls it straight from the page. Keeping one
 * implementation means a change to a request shape or a delta shape lands in both at once.
 */

/** Tests point this at a local server that speaks the same wire format, so the streaming
 *  path can be exercised without a key. Unset in normal use. */
/** The model is configurable because this task is short JSON copy, not code, so a small model
 *  may do it as well as a large one at a fraction of the cost. */
const model = (fallback) => env('WALL_MODEL') || fallback

const env = (name) =>
  globalThis[name] ?? (typeof process !== 'undefined' ? process.env?.[name] : '') ?? ''

/**
 * Which fetch this module calls.
 *
 * Electron's main process and Node have no CORS wall, and a browser holding its own key talks
 * to the vendor directly, so the global is right in three of the four shells. Tauri's webview
 * is the fourth: it is a real browser origin, so the request has to travel through the Rust
 * side to avoid preflight. That is a transport difference and nothing more, so it is swapped
 * here rather than answered with a second implementation of the request shapes, the SSE
 * splitting and the delta extraction. One model path stays one.
 */
let doFetch = (...args) => globalThis.fetch(...args)

/** Install a different transport. It must answer with a real Response, streaming body included. */
export const setFetch = (fn) => {
  doFetch = typeof fn === 'function' ? fn : (...args) => globalThis.fetch(...args)
}

const base = () => env('WALL_API_BASE')

/**
 * Every serious open weight model speaks the OpenAI shape: same request, same SSE frames, same
 * delta field. So there is no vendor table here, only a base URL and a model name. Pointing
 * WALL_OPENAI_BASE at GLM, DeepSeek, Qwen, Kimi, MiniMax or a gateway is the whole integration.
 */
const openaiBase = () => base() || env('WALL_OPENAI_BASE') || 'https://api.openai.com'

export const REQUESTS = {
  openai: (system, user, key, opts = {}) => ({
    url: `${opts.base || openaiBase()}/v1/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: {
      model: opts.model || model('gpt-5.2'),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: opts.maxTokens || 8000,
      stream: true,
    },
    delta: (j) => j?.choices?.[0]?.delta?.content ?? '',
  }),
  anthropic: (system, user, key, opts = {}) => ({
    url: `${opts.base || base() || 'https://api.anthropic.com'}/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // the web build calls the API from the page, which the API allows only when asked
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: opts.model || model('claude-sonnet-5'),
      // nine sections of copy runs past 2000, and a truncated reply is a lost page
      max_tokens: opts.maxTokens || 8000,
      system,
      messages: [{ role: 'user', content: user }],
      stream: true,
    },
    delta: (j) => (j?.type === 'content_block_delta' ? j?.delta?.text ?? '' : ''),
  }),
}

/** Split a response body into server-sent-event payloads. Reader based, because browsers do
 *  not yet allow async iteration over a ReadableStream. */
async function* sse(body) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) if (line.startsWith('data:')) yield line.slice(5).trim()
  }
}

/**
 * When a Google endpoint answers 404 the cause is almost always a model id that has been
 * retired or closed to new keys, and the reply does not say which ones would work. This asks,
 * so the error names the way out instead of the dead end.
 */
async function suggest(url, key) {
  if (!url.includes('generativelanguage')) return ''
  try {
    const root = url.split('/v1beta')[0]
    const res = await doFetch(`${root}/v1beta/models?key=${encodeURIComponent(key)}`)
    if (!res.ok) return ''
    const names = ((await res.json()).models ?? [])
      .map((m) => String(m.name ?? '').replace('models/', ''))
      .filter((n) => n.includes('flash'))
      .slice(0, 6)
    return names.length ? `. Your key can use: ${names.join(', ')}` : ''
  } catch {
    return ''
  }
}

/** Stream one completion, handing every delta to onDelta and returning the whole text. */
export async function streamText(provider, system, user, key, onDelta, opts = {}) {
  const req = (REQUESTS[provider] ?? REQUESTS.anthropic)(system, user, key, opts)
  try {
    const res = await doFetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
    if (!res.ok) {
      const why = (await res.text()).slice(0, 160)
      return { error: `${provider} ${res.status}: ${why}${res.status === 404 ? await suggest(req.url, key) : ''}` }
    }
    let text = ''
    for await (const payload of sse(res.body)) {
      if (payload === '[DONE]') break
      let delta = ''
      try {
        delta = req.delta(JSON.parse(payload))
      } catch {
        continue
      }
      if (!delta) continue
      text += delta
      onDelta(delta)
    }
    return { text }
  } catch (err) {
    return { error: String(err).slice(0, 200) }
  }
}

/**
 * Image generation. Separate from streamText because an image is one response rather than a
 * stream, and because it is a different provider axis: the model writing the copy and the
 * model drawing the picture are chosen independently.
 *
 * Returns a data URL, since the whole product promise is one self-contained file.
 */
export const IMAGE_REQUESTS = {
  gemini: (prompt, key, opts = {}) => ({
    url: `${base() || 'https://generativelanguage.googleapis.com'}/v1beta/models/${opts.model || env('WALL_IMAGE_MODEL') || 'gemini-2.5-flash-image'}:generateContent?key=${encodeURIComponent(key)}`,
    headers: { 'content-type': 'application/json' },
    body: { contents: [{ parts: [{ text: prompt }] }] },
    pick: (j) => {
      const part = (j?.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)
      return part ? `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}` : ''
    },
  }),
}

/** Ask the account which image models it can actually reach, newest looking first. */
async function anImageModel(url, key) {
  try {
    const root = url.split('/v1beta')[0]
    const res = await doFetch(`${root}/v1beta/models?key=${encodeURIComponent(key)}`)
    if (!res.ok) return ''
    return ((await res.json()).models ?? [])
      .map((m) => String(m.name ?? '').replace('models/', ''))
      .filter((n) => n.includes('image') && !n.includes('embedding'))
      .sort()
      .reverse()[0] ?? ''
  } catch {
    return ''
  }
}

export async function generateImage(provider, prompt, key, opts = {}) {
  const make = IMAGE_REQUESTS[provider] ?? IMAGE_REQUESTS.gemini
  const send = async (req) => {
    const res = await doFetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
    return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : await res.text() }
  }
  try {
    const req = make(prompt, key, opts)
    let out = await send(req)
    // Google retires image models on a schedule and closes older ones to new keys, so a 404
    // here is usually a name that has moved rather than a broken request. Ask which names the
    // key can reach and use one, instead of handing back a dead end.
    if (!out.ok && out.status === 404) {
      const found = await anImageModel(req.url, key)
      if (found) out = await send(make(prompt, key, { ...opts, model: found }))
    }
    if (!out.ok) return { error: `${provider} ${out.status}: ${String(out.body).slice(0, 160)}` }
    const dataUrl = req.pick(out.body)
    return dataUrl ? { dataUrl } : { error: 'the reply carried no image' }
  } catch (err) {
    return { error: String(err).slice(0, 200) }
  }
}
