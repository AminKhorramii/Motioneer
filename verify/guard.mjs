/**
 * The proxy guard, against the addresses people actually use to get past one.
 *
 * A guard that stops 127.0.0.1 and nothing else is worse than none, because it reads as protection.
 * Every bypass below is a real one: decimal, octal and hex spellings of a loopback address, the
 * shortened forms inet_aton accepts, a v4 address wearing a v6 spelling, a trailing dot, credentials
 * in the authority, and the cloud metadata address that is the reason anybody cares.
 *
 * The two modes are tested separately, because local mode is supposed to allow all of this. Pointing
 * the studio at localhost:3000 is the feature, and a guard that broke it would be turned off.
 *
 *   node verify/guard.mjs
 */

import { inspect, isLocal, allowed } from '../shared/guard.mjs'

let bad = 0
const ok = (how, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${how}${detail ? `  ${detail}` : ''}`)
  if (!cond) bad++
}
const shut = (addr, note = '') => {
  const r = inspect(addr, { mode: 'public' })
  ok(`refuses ${addr}`, !r.ok, note || (r.ok ? 'IT WAS ALLOWED' : r.why))
}
const open = (addr) => {
  const r = inspect(addr, { mode: 'public' })
  ok(`allows ${addr}`, r.ok, r.ok ? '' : r.why)
}

console.log('\n  loopback, in each spelling that reaches it')
shut('http://127.0.0.1/')
shut('http://localhost/')
shut('http://localhost./')          // a trailing dot is still the same name
shut('http://LOCALHOST/')
shut('http://2130706433/')          // decimal
shut('http://0x7f000001/')          // hex
shut('http://017700000001/')        // octal
shut('http://127.1/')               // inet_aton widens the last part
shut('http://0x7f.1/')              // mixed
shut('http://[::1]/')
shut('http://[::ffff:127.0.0.1]/')  // a v4 address in v6 clothing
shut('http://0.0.0.0/')
shut('http://box.local/')

console.log('\n  the address this is really about')
shut('http://169.254.169.254/latest/meta-data/')
shut('http://169.254.169.254/')
shut('http://[fe80::1]/')

console.log('\n  private space')
shut('http://10.0.0.1/')
shut('http://10.1.2.3:8080/admin')
shut('http://172.16.0.1/')
shut('http://172.31.255.255/')
shut('http://192.168.1.1/')
shut('http://[fc00::1]/')
shut('http://100.64.0.1/')

console.log('\n  and the neighbours of private space, which must still work')
open('http://172.32.0.1/')          // just outside 172.16/12
open('http://172.15.255.255/')      // just below it
open('http://11.0.0.1/')
open('http://126.255.255.255/')
open('https://example.com/')
open('https://sub.example.co.uk/a/b?c=d')
open('http://8.8.8.8/')

console.log('\n  things that are not addresses to fetch')
shut('file:///etc/passwd')
shut('gopher://host/x')
shut('data:text/html,hi')
shut('not a url at all')
shut('http://user:pass@example.com/')
ok('credentials are refused even in local mode',
  !inspect('http://user:pass@example.com/', { mode: 'local' }).ok,
  'they get forwarded verbatim, and nothing here needs them')

console.log('\n  local mode is the laptop, and keeps working')
for (const a of ['http://localhost:3000/', 'http://127.0.0.1:5173/', 'http://192.168.1.9:8080/',
  'http://box.local/', 'https://example.com/']) {
  const r = inspect(a, { mode: 'local' })
  ok(`local mode allows ${a}`, r.ok, r.ok ? '' : r.why)
}

console.log('\n  an allowlist, which is the honest first deployment')
const only = { mode: 'public', allow: ['example.com', 'shadcn.com'] }
ok('allows a listed host', inspect('https://example.com/x', only).ok)
ok('allows a subdomain of one', inspect('https://ui.shadcn.com/charts', only).ok)
ok('refuses anything else', !inspect('https://evil.test/x', only).ok,
  inspect('https://evil.test/x', only).why)
ok('and says what it does allow', /example\.com/.test(inspect('https://evil.test/x', only).why || ''))
ok('a denylist bites even in local mode',
  !inspect('http://ads.test/x', { mode: 'local', deny: ['ads.test'] }).ok)

console.log('\n  isLocal, which the address bar uses to choose a scheme')
ok('localhost is local', isLocal('localhost'))
ok('127.0.0.1 is local', isLocal('127.0.0.1'))
ok('a .local name is local', isLocal('printer.local'))
ok('192.168.x is local', isLocal('192.168.0.4'))
ok('example.com is not', !isLocal('example.com'))
ok('8.8.8.8 is not', !isLocal('8.8.8.8'))

console.log('\n  resolving, which is the half a string cannot answer')
const viaName = await allowed('https://localhost.localtest.me/', { mode: 'public' })
ok('a public name resolving inward is caught', !viaName.ok, viaName.why || 'IT WAS ALLOWED')
const real = await allowed('https://example.com/', { mode: 'public' })
ok('a real public name still passes', real.ok, real.ok ? '' : real.why)

console.log(bad ? `\n  ${bad} failed\n` : '\n  all good\n')
process.exit(bad ? 1 : 0)
