export function streamText(
  provider: string,
  system: string,
  user: string,
  key: string,
  onDelta: (delta: string) => void,
  opts?: { base?: string; model?: string },
): Promise<{ text?: string; error?: string }>

export function generateImage(
  provider: string,
  prompt: string,
  key: string,
): Promise<{ dataUrl?: string; error?: string }>

/**
 * Swap the transport. A shell whose webview is a real browser origin, which is Tauri, hands in
 * a fetch that travels through its own process, so the request shapes here are not reimplemented
 * on the other side of the boundary.
 */
export function setFetch(fn: typeof globalThis.fetch | null | undefined): void
