/**
 * What a failed session says it failed for.
 *
 * The local Claude reports a failure as a frame on stdout and writes its warnings to stderr, and
 * the streaming reader used to look only for content deltas. Every other frame was skipped, so a
 * call that failed came back with no text and no reason, and the reason handed to the wall was
 * whatever had landed on stderr. On a real machine that was a warning about claude.ai connectors,
 * while the session had actually stopped on a bad key, so the message named a cause that had
 * nothing to do with it and the person went and looked at connectors.
 *
 * Driven through the real runClaude against stand-in binaries that fail the way the real one
 * does, because the bug was in the reading and not in the spawning.
 *
 * Run: node verify/cli.mjs
 */
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runClaude } from '../shared/cli.mjs'

const work = mkdtempSync(join(tmpdir(), 'wall-cli-'))
let failed = 0
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`)
  if (!cond) failed++
}

/** a stand-in claude that prints what it is told to and exits how it is told to */
const fake = (name, body) => {
  const at = join(work, name)
  writeFileSync(at, `#!/usr/bin/env node\n${body}\n`, 'utf8')
  chmodSync(at, 0o755)
  return at
}

const WARNING = '⚠ claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth source is set'

// ——— the shape that cost an hour: a real reason on stdout, a warning on stderr ———
const authFailed = fake('auth-failed', `
process.stdin.resume()
process.stderr.write(${JSON.stringify(WARNING)} + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true,
  result: 'Failed to authenticate. API Error: 401 API key is invalid.' }) + '\\n')
process.exit(1)
`)
const said = await runClaude('sys', 'user', { bin: authFailed, onDelta: () => {} })
console.log('a session that failed on its key:', JSON.stringify(said))
ok(!said.text, 'no text came back, so this is the failing path')
ok(/401|invalid/i.test(said.error ?? ''), 'the reason is the one the session gave', said.error)
ok(!/connectors/i.test(said.error ?? ''), 'the warning is not reported as the cause')

// ——— a warning on its own is not a failure to report ———
const onlyWarned = fake('only-warned', `
process.stdin.resume()
process.stderr.write(${JSON.stringify(WARNING)} + '\\n')
process.stdout.write(JSON.stringify({ type: 'stream_event',
  event: { type: 'content_block_delta', delta: { text: 'a real answer' } } }) + '\\n')
process.exit(0)
`)
const warned = await runClaude('sys', 'user', { bin: onlyWarned, onDelta: () => {} })
console.log('a session that warned and still answered:', JSON.stringify(warned))
ok(warned.text === 'a real answer', 'a warning does not throw away a good reply')

// ——— nothing at all still says something ———
const silent = fake('silent', `process.stdin.resume(); process.exit(1)`)
const quiet = await runClaude('sys', 'user', { bin: silent, onDelta: () => {} })
console.log('a session that said nothing:', JSON.stringify(quiet))
ok(Boolean(quiet.error), 'a silent failure is still reported as one', quiet.error)

// ——— and a binary that is not there is named as that ———
const missing = await runClaude('sys', 'user', { bin: join(work, 'not-here'), onDelta: () => {} })
console.log('no claude on the machine:', JSON.stringify(missing))
ok(/not found/i.test(missing.error ?? ''), 'a missing command says so rather than blaming the reply')

console.log(failed ? `\n${failed} failed` : '\nall good')
process.exit(failed ? 1 : 0)
