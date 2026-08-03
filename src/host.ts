/**
 * The one boundary between Wall and whatever it is running inside. Electron answers over IPC
 * because the main process has no CORS wall and can write real files. The browser answers for
 * itself. Everything above this file is identical in both builds, so the web version is the
 * desktop version rather than a reduced copy of it.
 */

import { generateImage, streamText } from '../shared/providers.mjs'

export interface Host {
  readState: () => Promise<unknown>
  writeState: (v: unknown) => Promise<boolean>
  /** returns where the page went, so the app can say it plainly */
  exportPage: (html: string, name: string) => Promise<{ file: string; bytes: number } | null>
  preview: (html: string) => Promise<string>
  stream: (id: string, provider: string, system: string, user: string, key: string)
    => Promise<{ text?: string; error?: string }>
  onDelta: (fn: (id: string, delta: string) => void) => () => void
  /** one response rather than a stream, returned as a data URL so the page stays one file */
  image: (provider: string, prompt: string, key: string) => Promise<{ dataUrl?: string; error?: string }>
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
  stream: (id, provider, system, user, key) =>
    streamText(provider, system, user, key, (delta) => deltaFns.forEach((fn) => fn(id, delta))),
  image: (provider, prompt, key) => generateImage(provider, prompt, key),
  onDelta: (fn) => {
    deltaFns.add(fn)
    return () => deltaFns.delete(fn)
  },
}

const deltaFns = new Set<(id: string, delta: string) => void>()

/** Electron injects its bridge on window.wall, so its presence is what picks the host. */
export const host: Host = (window as unknown as { wall?: Host }).wall ?? web

export const isDesktop = Boolean((window as unknown as { wall?: Host }).wall)
