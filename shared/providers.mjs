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

const base = () => env('WALL_API_BASE')

/**
 * Every serious open weight model speaks the OpenAI shape: same request, same SSE frames, same
 * delta field. So there is no vendor table here, only a base URL and a model name. Pointing
 * WALL_OPENAI_BASE at GLM, DeepSeek, Qwen, Kimi, MiniMax or a gateway is the whole integration.
 */
const openaiBase = () => base() || env('WALL_OPENAI_BASE') || 'https://api.openai.com'

export const REQUESTS = {
  openai: (system, user, key) => ({
    url: `${openaiBase()}/v1/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: {
      model: model('gpt-5.2'),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: 8000,
      stream: true,
    },
    delta: (j) => j?.choices?.[0]?.delta?.content ?? '',
  }),
  anthropic: (system, user, key) => ({
    url: `${base() || 'https://api.anthropic.com'}/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // the web build calls the API from the page, which the API allows only when asked
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: model('claude-sonnet-5'),
      // nine sections of copy runs past 2000, and a truncated reply is a lost page
      max_tokens: 8000,
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

/** Stream one completion, handing every delta to onDelta and returning the whole text. */
export async function streamText(provider, system, user, key, onDelta) {
  const req = (REQUESTS[provider] ?? REQUESTS.anthropic)(system, user, key)
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
    if (!res.ok) return { error: `${provider} ${res.status}: ${(await res.text()).slice(0, 160)}` }
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
  gemini: (prompt, key) => ({
    url: `${base() || 'https://generativelanguage.googleapis.com'}/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`,
    headers: { 'content-type': 'application/json' },
    body: { contents: [{ parts: [{ text: prompt }] }] },
    pick: (j) => {
      const part = (j?.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)
      return part ? `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}` : ''
    },
  }),
}

export async function generateImage(provider, prompt, key) {
  const make = IMAGE_REQUESTS[provider] ?? IMAGE_REQUESTS.gemini
  const req = make(prompt, key)
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
    if (!res.ok) return { error: `${provider} ${res.status}: ${(await res.text()).slice(0, 160)}` }
    const dataUrl = req.pick(await res.json())
    return dataUrl ? { dataUrl } : { error: 'the reply carried no image' }
  } catch (err) {
    return { error: String(err).slice(0, 200) }
  }
}
