/**
 * The one boundary between Wall and whatever it is running inside.
 *
 * Three answers: the desktop app calls Rust commands for the things a browser cannot do, a
 * served deployment calls its server so the keys never enter the page, and a plain browser
 * answers for itself. Everything above this file is identical in all three, so the web version
 * is the desktop version rather than a reduced copy of it.
 */

import { invoke } from '@tauri-apps/api/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

import { generateImage, setFetch, streamText } from '../shared/providers.mjs'

export interface ModelOpts {
  base?: string
  model?: string
  /** a design reply carries CSS for eight worlds, which needs far more room than copy does */
  maxTokens?: number
}

export interface Host {
  readState: () => Promise<unknown>
  writeState: (v: unknown) => Promise<boolean>
  /** returns where the page went, so the app can say it plainly */
  exportPage: (html: string, name: string) => Promise<{ file: string; bytes: number } | null>
  preview: (html: string) => Promise<string>
  /** opts carry the endpoint and model, because a browser with its own key picks the vendor */
  stream: (id: string, provider: string, system: string, user: string, key: string, opts?: ModelOpts)
    => Promise<{ text?: string; error?: string }>
  onDelta: (fn: (id: string, delta: string) => void) => () => void
  /** one response rather than a stream, returned as a data URL so the page stays one file */
  image: (provider: string, prompt: string, key: string) => Promise<{ dataUrl?: string; error?: string }>
  /**
   * Where a key is kept. The desktop answers with the system keychain, which is encrypted at
   * rest and gated by the login session, and is where every other application on the machine
   * keeps its credentials. A browser has nowhere better than its own storage.
   */
  getKey: (name: string) => Promise<string | null>
  setKey: (name: string, value: string) => Promise<boolean>
  /**
   * The model the person already has. A shell that can start a process answers this; a plain
   * browser cannot, which is the one thing it will never be able to do.
   */
  cli?: (system: string, user: string, onDelta?: (d: string) => void, kind?: string)
    => Promise<{ text?: string; error?: string }>
  /** a brief handed in from outside, when something launched this window to ask for a design */
  request: () => Promise<{
    /** which shape the writer spoke, so a reader of a different age refuses rather than misreads */
    format?: number
    brief?: string
    name?: string
    oneLiner?: string
    what?: string
    audience?: string
    cta?: string
    dir?: string
  } | null>
  /** write the chosen design back where whoever asked can find it */
  handoff: (dir: string, files: Record<string, string>) => Promise<{ dir?: string; error?: string }>
}

const STATE_KEY = 'wall-state'

const web: Host = {
  readState: async () => {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null')
    } catch {
      return null
    }
  },
  writeState: async (v) => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(v))
      return true
    } catch {
      return false
    }
  },
  exportPage: async (html, name) => {
    const file = `${name}.html`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = file
    a.click()
    URL.revokeObjectURL(url)
    return { file, bytes: new Blob([html]).size }
  },
  preview: async (html) => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    window.open(url, '_blank')
    return url
  },
  // the browser talks to the model itself, so deltas never leave this tab
  stream: (id, provider, system, user, key, opts) =>
    streamText(provider, system, user, key, (delta) => deltaFns.forEach((fn) => fn(id, delta)), opts),
  image: (provider, prompt, key) => generateImage(provider, prompt, key),
  getKey: async (name) => localStorage.getItem(name),
  setKey: async (name, value) => {
    if (value) localStorage.setItem(name, value)
    else localStorage.removeItem(name)
    return true
  },
  // a browser cannot be launched by an agent holding a directory, so there is nothing to hand
  request: async () => null,
  handoff: async () => ({ error: 'handing off needs the desktop app' }),
  onDelta: (fn) => {
    deltaFns.add(fn)
    return () => deltaFns.delete(fn)
  },
}

const deltaFns = new Set<(id: string, delta: string) => void>()

/**
 * The served host: the same app, with the keys behind the server instead of in the page.
 * State and export stay in the browser, because those are the user's and there is no reason
 * for them to travel. Only the model calls move.
 */
const served: Host = {
  ...web,
  stream: async (id, provider, system, user) => {
    const res = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, system, user }),
    })
    if (!res.ok || !res.body) return { error: `server ${res.status}: ${(await res.text()).slice(0, 160)}` }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let text = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const delta = dec.decode(value, { stream: true })
      if (!delta) continue
      text += delta
      deltaFns.forEach((fn) => fn(id, delta))
    }
    return { text }
  },
  cli: async (system, user, onDelta, kind) => {
    try {
      const r = await fetch('/api/cli', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ system, user, kind }),
      })
      if (!r.ok || !r.body) return { error: `server ${r.status}` }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const d = dec.decode(value, { stream: true })
        if (!d) continue
        // NUL is the server's beat while the model thinks, never part of what it wrote. An empty
        // delta is how that reaches the caller: the reply is unchanged, and anyone counting
        // deltas learns the call is alive.
        const said = d.replace(/\0/g, '')
        if (said) {
          text += said
          onDelta?.(said)
        }
        if (said.length !== d.length) onDelta?.('')
      }
      return text ? { text } : { error: 'no reply' }
    } catch (e) {
      return { error: String(e).slice(0, 160) }
    }
  },
  request: async () => {
    try {
      return await (await fetch('/api/request')).json()
    } catch {
      return null
    }
  },
  // the directory is the server's, not ours to choose: it was started knowing where this goes
  handoff: async (_dir, files) => {
    try {
      const r = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      return r.json()
    } catch (e) {
      return { error: String(e).slice(0, 160) }
    }
  },
  image: async (_provider, prompt) => {
    const res = await fetch('/api/image', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) return { error: `server ${res.status}` }
    return res.json()
  },
}

const win = window as unknown as {
  __wallServed?: number
  __wallProviders?: string[]
  __TAURI_INTERNALS__?: unknown
}

const onTauri = Boolean(win.__TAURI_INTERNALS__)

/**
 * The Tauri shell: the same window, at a tenth of the download.
 *
 * Only the four things a browser cannot do are commands. The model path is not one of them: the
 * page calls providers.mjs itself, over a fetch that travels through the Rust side so a real
 * browser origin does not have to negotiate preflight with every vendor. That keeps request
 * shapes, SSE splitting and delta extraction in one file rather than one per shell, which is
 * the whole reason this boundary is here.
 */
const tauri: Host = {
  ...web,
  readState: () => invoke('read_state'),
  writeState: async (v) => Boolean(await invoke('write_state', { value: v ?? null })),
  exportPage: (html, name) => invoke('export_page', { html, name }),
  preview: (html) => invoke('preview', { html }),
  cli: (system, user, _onDelta, kind) => invoke('claude_text', { system, user, kind }),
  getKey: (name) => invoke('get_key', { name }),
  setKey: (name, value) => invoke('set_key', { name, value }),
  request: () => invoke('wall_request'),
  handoff: (dir, files) => invoke('handoff', { dir, files }),
}

// The transport, installed once and before anything streams. Swapping the fetch is the entire
// difference between this shell and the browser's.
if (onTauri) setFetch(tauriFetch)

/**
 * Which host answers is decided by what is present. Tauri injects its own internals, and a
 * server injects a flag into the page it serves. Neither means the browser is on its own and
 * the visitor brings a key.
 */
export const host: Host = onTauri ? tauri : win.__wallServed ? served : web

export const isTauri = onTauri
export const isDesktop = onTauri
export const isServed = Boolean(!onTauri && win.__wallServed)

/**
 * An open tab is a reason for the server to stay up.
 *
 * A server an agent started has nothing to tell it when the person is finished, so it counts
 * silence and stops after ten minutes of it. Somebody reading eight pages is not silence, but a
 * page that has finished loading makes no requests, so it says so on its own. Twenty seconds is
 * far enough inside the ten minutes to survive a model call that holds the connection for
 * several of them without the beat ever being the thing that is late.
 */
if (isServed) {
  setInterval(() => void fetch('/api/config').catch(() => {}), 20_000)
}

/**
 * Hand a key to the server rather than keeping it in the page.
 *
 * localStorage is per origin, so a server on a different port every run would lose it and ask
 * again. Held by the server it survives restarts and every project, and never enters a page.
 */
export async function giveKey(provider: string, key: string): Promise<string[]> {
  const r = await fetch('/api/key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, key }),
  })
  const out = (await r.json()) as { providers?: string[] }
  win.__wallProviders = out.providers ?? []
  return win.__wallProviders
}

/** Providers the server already holds a key for, so the app can stop asking for one. */
export const servedProviders = async (): Promise<string[]> => {
  if (!isServed) return []
  if (win.__wallProviders) return win.__wallProviders
  try {
    const r = await fetch('/api/config')
    const list = ((await r.json()) as { providers?: string[] }).providers ?? []
    win.__wallProviders = list
    return list
  } catch {
    return []
  }
}
