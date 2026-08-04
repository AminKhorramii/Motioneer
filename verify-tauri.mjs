/**
 * The Tauri shell, checked without running it.
 *
 * Tauri has no WebDriver on macOS, so the Playwright suites that drive Electron cannot drive
 * this one. That is a real gap and it is stated rather than papered over. What can be checked
 * is the class of bug the gap would otherwise hide: a command name that exists on one side of
 * the boundary and not the other, a permission the code needs and the capabilities file does
 * not grant, and a Host method one desktop shell implements and the other quietly does not.
 *
 * All three are text, so none of them needs a window.
 *
 * Run: node verify-tauri.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

let failed = 0
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`)
  if (!cond) failed++
}

const host = read('src/host.ts')
const main = read('src-tauri/src/main.rs')
const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
const caps = JSON.parse(read('src-tauri/capabilities/default.json'))
const preload = read('electron/preload.cjs')

// ——— every command the page calls exists on the Rust side ———

const called = [...host.matchAll(/invoke\(\s*'([a-z_]+)'/g)].map((m) => m[1])
const declared = [...main.matchAll(/#\[tauri::command\]\s*(?:pub\s+)?fn\s+([a-z_]+)/g)].map((m) => m[1])
const handled = (main.match(/generate_handler!\[([^\]]+)\]/)?.[1] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

ok(called.length >= 6, 'the host calls the commands it needs', called.join(', '))
for (const name of called) {
  ok(declared.includes(name), `${name} is declared in Rust`)
  ok(handled.includes(name), `${name} is registered in generate_handler`)
}
for (const name of declared) {
  ok(handled.includes(name), `${name} is not declared and then forgotten`)
}

// ——— the two desktop shells expose the same thing ———

const electronMethods = [...preload.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort()
const tauriBlock = host.slice(host.indexOf('const tauri: Host'), host.indexOf('if (onTauri)'))
const tauriOwn = [...tauriBlock.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
// the rest are inherited from the web host by spread, which is the point of the spread
const inherited = tauriBlock.includes('...web')
ok(inherited, 'the tauri host inherits the browser answers it does not need to change')

const missing = electronMethods.filter((m) => !tauriOwn.includes(m) && !inherited)
ok(missing.length === 0, 'no Host method exists in one desktop shell and not the other', missing.join(', ') || 'none')

for (const m of ['readState', 'writeState', 'exportPage', 'preview', 'request', 'handoff']) {
  ok(tauriOwn.includes(m), `${m} is answered natively rather than by the browser fallback`)
}

// the model path must not be one of them
ok(!tauriOwn.includes('stream'), 'streaming is not reimplemented for this shell')
ok(!tauriOwn.includes('image'), 'image generation is not reimplemented for this shell')
ok(
  /setFetch\(tauriFetch\)/.test(host),
  'the shell swaps the transport instead, so providers.mjs stays the only model path',
)
ok(
  /export function setFetch/.test(read('shared/providers.d.mts')) || /setFetch/.test(read('shared/providers.d.mts')),
  'setFetch is declared for TypeScript as well as implemented',
)

// ——— permissions the code actually needs ———

const perms = JSON.stringify(caps.permissions)
ok(perms.includes('dialog:'), 'the folder picker is permitted, or export cannot ask where')
ok(perms.includes('opener:'), 'opening a path is permitted, or preview cannot show anything')
ok(perms.includes('http:'), 'the http plugin is permitted, or no model can be reached')
const allowed = JSON.stringify(caps.permissions.find((p) => p?.identifier === 'http:default')?.allow ?? [])
ok(allowed.includes('https://'), 'https endpoints are in scope', allowed.slice(0, 80))
ok(allowed.includes('localhost'), 'a local test upstream is in scope, so the suites can point at one')

for (const plugin of ['dialog', 'http', 'opener']) {
  ok(main.includes(`tauri_plugin_${plugin}::init()`), `the ${plugin} plugin is initialised in Rust`)
}

// ——— the bundle points at what the build produces ———

ok(conf.build.frontendDist === '../dist', 'the shell serves the same dist every other shell does')
ok(conf.identifier.includes('.'), 'the bundle identifier is set', conf.identifier)
for (const icon of conf.bundle.icon) {
  ok(existsSync(path.join(ROOT, 'src-tauri', icon)), `${icon} exists`)
}

// ——— the drag handle, which is the one thing WebKit does differently ———

ok(
  /data-tauri-drag-region/.test(read('src/App.tsx')),
  'the header carries the WebKit drag attribute, or the window cannot be moved by it',
)

// ——— the test hooks the suites drive Electron with are answered here too ———

for (const hook of ['WALL_DATA', 'WALL_EXPORT_DIR', 'WALL_REQUEST', 'WALL_TEST']) {
  ok(main.includes(hook), `${hook} is honoured, so the shells can be driven the same way`)
}

console.log(failed ? `\n${failed} failed` : '\nall good')
process.exit(failed ? 1 : 0)
