/** Loopback is not enough: browsers can reach it from other sites or through DNS rebinding. */
export function localRequest(req, pathname) {
  const port = req.socket.localPort
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`])
  const host = String(req.headers.host || '').toLowerCase()
  if (!hosts.has(host)) return false
  // The bookmarklet only deposits captures; it cannot read projects or change model settings.
  if (pathname === '/__motioneer/picked' && ['POST', 'OPTIONS'].includes(req.method)) return true
  const origin = req.headers.origin
  if (origin !== undefined && origin !== `http://${host}`) return false
  return req.headers['sec-fetch-site'] !== 'cross-site'
}
