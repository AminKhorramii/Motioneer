/**
 * The update story, held by tests rather than memory.
 *
 * Wall updates by publish: `npx -y wall-mcp` resolves the latest published version on every
 * run, so the whole channel rests on the package staying publishable under the advertised
 * name and carrying everything its entry points import. Each check here guards a break that
 * would otherwise surface silently, at publish time or later on a user's machine: a rename
 * that strands the README's one line, a directory the files list forgot, a hardcoded version
 * nobody bumps, or a cached index.html pointing at assets a redeploy removed.
 *
 * Run: node verify/update.mjs   (the server checks read the built dist)
 */

import { spawn, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

let failed = 0
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`)
  if (!cond) failed++
}

// the README's one line is the public name of the channel, so the package must answer to it
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const advertised = readme.match(/npx -y (\S+)/)?.[1]
ok(advertised === pkg.name, 'the README one-liner names this package', `${advertised} vs ${pkg.name}`)
ok(!pkg.private, 'the package is publishable, not private')
ok(!!pkg.bin?.[pkg.name] && existsSync(path.join(ROOT, pkg.bin[pkg.name])), 'the bin the one-liner runs exists', pkg.bin?.[pkg.name])
ok(pkg.scripts?.prepublishOnly?.includes('build'), 'publishing rebuilds first, so a stale dist cannot ship')

// one version, written once: the desktop reads it from here rather than keeping its own
const tauri = JSON.parse(readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'))
ok(tauri.version === '../package.json', 'the desktop version points at package.json', tauri.version)

// what npm would actually publish, asked rather than assumed: the files list is a manifest
// written by hand, and an entry point importing a directory it forgot fails only on install
const manifest = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' }))
const shipped = new Set(manifest[0].files.map((f) => f.path))
for (const need of ['mcp/index.mjs', 'server/index.mjs', 'shared/providers.mjs', 'shared/cli.mjs', 'dist/index.html', 'dist-core/core.js']) {
  ok(shipped.has(need), `the tarball carries ${need}`)
}

// the version a client is told is the version that was published, proved by asking
const version = await new Promise((resolve) => {
  const mcp = spawn('node', [path.join(ROOT, 'mcp/index.mjs')], { stdio: ['pipe', 'pipe', 'ignore'] })
  let out = ''
  mcp.stdout.on('data', (d) => {
    out += d
    const line = out.split('\n').find((l) => l.includes('serverInfo'))
    if (line) {
      mcp.kill()
      resolve(JSON.parse(line).result?.serverInfo?.version)
    }
  })
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
  setTimeout(() => (mcp.kill(), resolve(null)), 5000)
})
ok(version === pkg.version, 'the MCP server reports the package version', `${version} vs ${pkg.version}`)

/**
 * The same question again, from a directory with a space in its name.
 *
 * Where a package lands is not ours to choose, and a home folder with a space in it is ordinary.
 * The entry point used to find its own root through the URL's pathname, which is percent encoded
 * and therefore not a path, so it read %20 and looked for its own package.json and its own server
 * in places that do not exist. The version falling back to 0.0.0 is the visible half of that; the
 * invisible half was design reporting that it could not open a browser, on a machine where
 * everything was installed and working. The version is asked here because it needs no browser.
 */
const spaced = path.join(tmpdir(), 'wall update check')
rmSync(spaced, { recursive: true, force: true })
mkdirSync(path.join(spaced, 'mcp'), { recursive: true })
copyFileSync(path.join(ROOT, 'mcp/index.mjs'), path.join(spaced, 'mcp/index.mjs'))
copyFileSync(path.join(ROOT, 'package.json'), path.join(spaced, 'package.json'))
const spacedVersion = await new Promise((resolve) => {
  const mcp = spawn('node', [path.join(spaced, 'mcp/index.mjs')], { stdio: ['pipe', 'pipe', 'ignore'] })
  let out = ''
  mcp.stdout.on('data', (d) => {
    out += d
    const line = out.split('\n').find((l) => l.includes('serverInfo'))
    if (line) {
      mcp.kill()
      resolve(JSON.parse(line).result?.serverInfo?.version)
    }
  })
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
  setTimeout(() => (mcp.kill(), resolve(null)), 5000)
})
ok(spacedVersion === pkg.version, 'it finds its own files where the path has a space in it', `${spacedVersion} vs ${pkg.version}`)
rmSync(spaced, { recursive: true, force: true })

// an updated deployment must not serve a cached index.html into purged hashed assets: the
// page revalidates, the assets it names are immutable because their names carry their hash
const server = spawn('node', [path.join(ROOT, 'server/index.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'ignore'] })
const base = await new Promise((resolve) => {
  let out = ''
  server.stdout.on('data', (d) => {
    out += d
    const m = out.match(/http:\/\/localhost:\d+/)
    if (m) resolve(m[0])
  })
  setTimeout(() => resolve(null), 5000)
})
if (base) {
  const page = await fetch(`${base}/`)
  ok(page.headers.get('cache-control') === 'no-cache', 'index.html revalidates on every load', page.headers.get('cache-control'))
  const asset = readdirSync(path.join(ROOT, 'dist/assets'))[0]
  const hashed = await fetch(`${base}/assets/${asset}`)
  ok((hashed.headers.get('cache-control') ?? '').includes('immutable'), 'hashed assets cache forever', hashed.headers.get('cache-control'))
} else {
  ok(false, 'the server said where it is')
}
server.kill()

console.log(failed ? `\n${failed} failed` : '\nall good')
process.exit(failed ? 1 : 0)
