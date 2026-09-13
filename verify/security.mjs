/** Exercise the actual studio boundary without touching a user's projects or credentials. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir, networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { get } from 'node:http'
import { localRequest } from '../shared/local-http.mjs'

const dir = await mkdtemp(path.join(tmpdir(), 'motioneer-security-'))
const studio = fileURLToPath(new URL('../tools/studio.mjs', import.meta.url))
const child = spawn(process.execPath, [studio], { cwd: dir, env: { ...process.env,
  MOTIONEER_PORT: '0', MOTIONEER_NO_OPEN: '1', ANTHROPIC_API_KEY: '',
}, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', d => { output += d })
child.stderr.on('data', d => { output += d })
try {
  let port
  for (let i = 0; i < 100; i++) {
    port = /motion studio\s+http:\/\/localhost:(\d+)/.exec(output)?.[1]
    if (port || child.exitCode !== null) break
    await new Promise(r => setTimeout(r, 100))
  }
  assert.ok(port, 'isolated studio starts: ' + output)
  const at = `http://127.0.0.1:${port}`
  const request = (route, options = {}) => fetch(at + route, { ...options, signal: AbortSignal.timeout(3000) })
  assert.equal((await request('/__motioneer/editor/')).status, 200)
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = get(at + '/__motioneer/projects', { headers: { host: `rebound.example:${port}` } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject)
  })
  assert.equal(reboundStatus, 403)
  const malformedStatus = await new Promise((resolve, reject) => {
    const req = get(at, { path: '//[', headers: { host: `127.0.0.1:${port}` } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject)
  })
  assert.equal(malformedStatus, 400, 'malformed URLs cannot crash the local server')
  for (const origin of ['https://foreign.example', 'null', 'http://localhost:1']) {
    assert.equal((await request('/__motioneer/projects', { method: 'POST', headers: { origin }, body: '{}' })).status, 403)
  }
  assert.equal((await request('/__motioneer/projects', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.deepEqual(await request('/__motioneer/projects').then(r => r.json()), [])
  const created = await request('/__motioneer/projects', { method: 'POST', headers: { origin: at, 'content-type': 'application/json' }, body: '{"name":"Allowed local edit"}' })
  assert.equal(created.status, 201)
  assert.equal((await request('/__motioneer/projects')).status, 200, 'native MCP requests need no browser Origin')
  assert.equal((await request('/__motioneer/picked', { method: 'OPTIONS', headers: { origin: 'https://capture.example' } })).status, 204)
  assert.equal((await request('/__motioneer/picked', { method: 'POST', headers: { origin: 'https://capture.example', 'content-type': 'application/json' }, body: '{"picks":[]}' })).status, 200)
  assert.equal((await request('/__motioneer/inbox', { headers: { origin: 'https://capture.example' } })).status, 403)
  assert.equal((await request('/__motioneer/model', { method: 'POST', headers: { origin: at, 'content-type': 'application/json' }, body: '{"provider":"claude-cli","model":""}' })).status, 200)
  if (process.platform !== 'win32') assert.equal((await stat(path.join(dir, '.studio/model.json'))).mode & 0o777, 0o600)
  // Cover upgrade requests with the same gate and ensure the exception cannot bypass Host checks.
  assert.equal(localRequest({ socket: { localPort: Number(port) }, method: 'GET', headers: { host: `localhost:${port}`, origin: 'https://foreign.example' } }, '/socket'), false)
  assert.equal(localRequest({ socket: { localPort: Number(port) }, method: 'POST', headers: { host: `foreign.example:${port}` } }, '/__motioneer/picked'), false)
  const source = await readFile(studio, 'utf8')
  assert.match(source, /listenNear\(server, PORT, '127\.0\.0\.1'\)/)
  for (const address of Object.values(networkInterfaces()).flat().filter(a => a && !a.internal && a.family === 'IPv4')) {
    await assert.rejects(fetch(`http://${address.address}:${port}/__motioneer/projects`, { signal: AbortSignal.timeout(500) }), 'studio is unreachable through a LAN interface')
  }
  console.log('Security: loopback binding, Host/Origin checks, blocked cross-site reads and writes, bookmarklet capture, local editing and private model settings verified.')
} finally {
  child.kill('SIGTERM')
  await new Promise(r => { if (child.exitCode !== null) r(); else child.once('exit', r) })
  await rm(dir, { recursive: true, force: true })
}
