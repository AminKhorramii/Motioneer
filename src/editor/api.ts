export async function api<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/__motioneer/' + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal })
  const result = await response.json()
  if (!response.ok || result.error) throw Object.assign(new Error(result.error || `Request failed (${response.status})`), { status: response.status })
  return result
}
export function download(name: string, data: string, type = 'text/css') {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
