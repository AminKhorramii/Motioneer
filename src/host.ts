/**
 * The one boundary between Wall and whatever it is running inside. Electron answers over IPC
 * because the main process has no CORS wall and can write real files. The browser answers for
 * itself. Everything above this file is identical in both builds, so the web version is the
 * desktop version rather than a reduced copy of it.
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
  /** a brief handed in from outside, when something launched this window to ask for a design */
  request: () => Promise<{ brief?: string; name?: string; dir?: string } | null>
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
  wall?: Host
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
  request: () => invoke('wall_request'),
  handoff: (dir, files) => invoke('handoff', { dir, files }),
}

// The transport, installed once and before anything streams. Swapping the fetch is the entire
// difference between this shell and the browser's.
if (onTauri) setFetch(tauriFetch)

/**
 * Which host answers is decided by what is present. Electron injects a bridge on window.wall,
 * Tauri injects its own internals, and a server injects a flag into the page it serves. None of
 * them means the browser is on its own and the visitor brings a key.
 */
export const host: Host = win.wall ?? (onTauri ? tauri : win.__wallServed ? served : web)

export const isTauri = onTauri
export const isDesktop = Boolean(win.wall) || onTauri
export const isServed = Boolean(!win.wall && !onTauri && win.__wallServed)

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
