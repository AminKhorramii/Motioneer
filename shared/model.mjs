/**
 * Which model writes the motion, chosen at runtime rather than baked in.
 *
 * `providers.mjs` already knew how to talk to two wire formats and pointed out that every serious
 * open weight model speaks the OpenAI one, so there is no vendor table to write. What was missing is
 * everything around that: the shapes were selected by environment variable, which means the answer to
 * "which model is this using" was a restart away, and the studio called `streamText('anthropic', ...)`
 * with the name written into the call. A person could not change it and a deployment could not either.
 *
 * So this is the part above the wire: a catalogue of places a request can go, and one `write` that
 * takes a config and dispatches. The config is a plain object, which is what lets the same code read
 * it from a json file on a laptop and from a key value store in a worker without knowing which.
 *
 * No node builtins are imported here, on purpose. The command line provider is the one thing that
 * cannot run in a browser or a worker, so it is loaded only when it is actually chosen, and asking
 * for it somewhere it cannot run is an error that says so rather than a module that fails to import.
 */

import { streamText } from './providers.mjs'

/**
 * What a provider entry means:
 *   shape    which wire format, so `openai` here covers most of the industry
 *   needs    what a person has to supply before this can be used at all
 *   browser  whether the vendor allows a page to call it directly, which decides whether a key can
 *            stay on the user's machine or has to be handed to a server
 *   base     the default endpoint, overridable, because that is the whole integration for a gateway
 */
export const PROVIDERS = [
  {
    id: 'claude-cli',
    label: 'Claude Code, on this machine',
    shape: 'cli',
    needs: [],
    browser: false,
    local: true,
    models: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
    note: 'Uses the claude command already signed in here, so there is no key to paste.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    shape: 'anthropic',
    needs: ['key'],
    browser: true,
    base: 'https://api.anthropic.com',
    models: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
    note: 'Allows a page to call it directly, so the key can stay in your browser.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    shape: 'openai',
    needs: ['key'],
    browser: false,
    base: 'https://api.openai.com',
    models: ['gpt-5.2', 'gpt-5.2-mini'],
    note: 'Sends no cross origin headers, so this one has to go through a server.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    shape: 'openai',
    needs: ['key'],
    browser: true,
    base: 'https://openrouter.ai/api',
    models: ['anthropic/claude-sonnet-5', 'openai/gpt-5.2', 'google/gemini-2.5-pro',
      'meta-llama/llama-4-maverick', 'deepseek/deepseek-v3'],
    note: 'One key reaching most vendors, which is the cheapest way to compare two of them.',
  },
  {
    id: 'groq',
    label: 'Groq',
    shape: 'openai',
    needs: ['key'],
    browser: false,
    base: 'https://api.groq.com/openai',
    models: ['llama-4-maverick-17b', 'llama-3.3-70b-versatile'],
    note: 'Fast enough that five options come back in about the time one usually does.',
  },
  {
    id: 'ollama',
    label: 'Ollama, on this machine',
    shape: 'openai',
    needs: [],
    browser: false,
    local: true,
    base: 'http://localhost:11434',
    models: ['qwen3-coder:30b', 'llama3.3:70b', 'deepseek-r1:32b'],
    note: 'No key and no network. Whether a local model writes css this well is worth measuring.',
  },
  {
    id: 'compatible',
    label: 'Anything OpenAI shaped',
    shape: 'openai',
    needs: ['base'],
    browser: false,
    base: '',
    models: [],
    note: 'A base url and a model name is the whole integration for most of the industry.',
  },
]

export const providerById = (id) => PROVIDERS.find((p) => p.id === id)

/** The shipped default: the command line if it is there, because it needs nothing pasted. */
export const DEFAULT_CONFIG = { provider: 'claude-cli', model: '', base: '', key: '' }

/**
 * Fill in what the config left out, so every caller downstream sees the same complete shape.
 *
 * A model of '' means "whatever this provider defaults to" rather than an error, because the useful
 * thing to type into a model box is nothing at all until you have a reason.
 */
export function resolve(config = {}) {
  const p = providerById(config.provider) ?? PROVIDERS[0]
  return {
    provider: p.id,
    shape: p.shape,
    label: p.label,
    model: config.model || p.models[0] || '',
    base: config.base || p.base || '',
    key: config.key || '',
    browser: !!p.browser,
    local: !!p.local,
  }
}

/**
 * What is still missing before this config can be used, in words rather than as a boolean.
 *
 * Returned as a list so an admin panel can point at the empty box, and so a server can refuse a save
 * for the same reason it would have failed on the first request, which is a much better moment.
 */
export function missing(config = {}) {
  const p = providerById(config.provider)
  if (!p) return [`there is no provider called ${config.provider}`]
  const out = []
  for (const need of p.needs) {
    if (need === 'key' && !config.key) out.push('an api key')
    if (need === 'base' && !(config.base || p.base)) out.push('a base url')
  }
  return out
}

/**
 * One completion, wherever it has been pointed.
 *
 * Returns `{ text }` or `{ error }` and never throws, matching what `streamText` and `runClaude`
 * already both did, because the caller's retry loop is written against that shape.
 */
export async function write(system, user, config = {}, opts = {}) {
  const at = resolve(config)
  const gap = missing({ ...config, provider: at.provider })
  if (gap.length) return { error: `${at.label} needs ${gap.join(' and ')}` }

  if (at.shape === 'cli') {
    /**
     * Loaded here rather than at the top of the file.
     *
     * This is the only provider that spawns a process, so it is the only one that cannot exist in a
     * browser or a worker. Importing it at module scope would make this whole file unloadable there,
     * which would take the other six providers down with the one that cannot run.
     */
    let runClaude
    try {
      ({ runClaude } = await import('./cli.mjs'))
    } catch {
      return { error: 'the claude command can only be used where there is a shell to run it in' }
    }
    return runClaude(system, user, {
      model: at.model || undefined,
      onDelta: opts.onDelta,
      callMs: opts.callMs,
      thinking: opts.thinking,
      env: opts.env,
    }).catch((e) => ({ error: String(e && e.message ? e.message : e).slice(0, 200) }))
  }

  return streamText(at.shape, system, user, at.key, opts.onDelta ?? (() => {}), {
    model: at.model,
    base: at.base,
    maxTokens: opts.maxTokens ?? 4000,
  })
}

/**
 * A one sentence round trip, for the button next to the settings.
 *
 * Deliberately asks for something with exactly one right answer and almost no tokens: the failure
 * this catches is a wrong key, a wrong base url or a model name the account cannot reach, and none
 * of those need a real task to surface. A long test would only make the wait longer.
 */
export async function check(config = {}, opts = {}) {
  const started = Date.now()
  const r = await write('Answer with one word and nothing else.', 'Say: ready', config,
    { ...opts, maxTokens: 16 })
  if (r && r.error) return { ok: false, why: String(r.error).slice(0, 180) }
  const said = String((r && r.text) || '').trim().slice(0, 40)
  return said
    ? { ok: true, said, ms: Date.now() - started }
    : { ok: false, why: 'the reply came back empty' }
}

/** What is safe to hand to a browser: everything except the secret. */
export const publicly = (config = {}) => {
  const at = resolve(config)
  return { provider: at.provider, model: at.model, base: at.base, label: at.label,
    browser: at.browser, local: at.local, hasKey: !!at.key }
}
