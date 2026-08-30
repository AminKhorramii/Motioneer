/**
 * What the proxy is allowed to fetch.
 *
 * On a laptop this question has an easy answer: anything, including localhost, because pointing the
 * studio at your own dev server is the entire feature. Deployed, the same code is an open proxy that
 * fetches whatever a stranger names and serves the result from your origin, and that is two separate
 * problems. The first is that your domain now hosts other people's pages, which is a phishing kit
 * with a certificate. The second is that "whatever a stranger names" includes 169.254.169.254, which
 * on most clouds hands out credentials to anybody who asks from inside.
 *
 * So the decision is made here rather than at each of the four places that fetch, and it takes a mode
 * rather than assuming one. Local keeps working exactly as it does now. Public refuses anything that
 * resolves inward.
 *
 * WHAT THIS DOES NOT DO. It checks the address as written. A hostname that looks public and resolves
 * to 10.0.0.1 passes every test in this file, because answering that requires resolving the name and
 * then making sure the connection goes to the address you resolved rather than to whatever the second
 * lookup returns. `resolves` below does the resolving half for a host with dns available, and the
 * pinning half is a socket level concern this cannot reach. On Cloudflare the edge will not route to
 * RFC1918 anyway, which covers the gap there but is somebody else's guarantee and not this one's.
 */

/* ── addresses, in every notation somebody has used to sneak one past a check ─────────────────── */

/**
 * A dotted quad is one of four spellings and the other three are the interesting ones.
 *
 * `http://2130706433/` and `http://0x7f.1/` and `http://017700000001/` all reach 127.0.0.1, because
 * inet_aton accepts decimal, hex and octal and accepts fewer than four parts by widening the last
 * one. A check that only understands 127.0.0.1 stops none of them, and every one of those is a real
 * bypass that has been used on real services.
 */
function asV4(host) {
  const parts = host.split('.')
  if (parts.length > 4 || parts.some((p) => p === '')) return null
  const nums = []
  for (const raw of parts) {
    let n
    if (/^0[xX][0-9a-fA-F]+$/.test(raw)) n = parseInt(raw, 16)
    else if (/^0[0-7]+$/.test(raw)) n = parseInt(raw, 8)
    else if (/^[0-9]+$/.test(raw)) n = parseInt(raw, 10)
    else return null
    if (!Number.isFinite(n) || n < 0) return null
    nums.push(n)
  }
  // the last part absorbs whatever room the missing parts left, which is what makes 2130706433 work
  const last = nums.pop()
  const room = 2 ** (8 * (4 - nums.length))
  if (last >= room) return null
  if (nums.some((n) => n > 255)) return null
  let out = last
  for (let i = 0; i < nums.length; i++) out += nums[i] * 2 ** (8 * (3 - i))
  return out >>> 0
}

const v4 = (a, b, c, d) => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
/** the ranges that mean "inside", each with the reason it is on the list */
const SHUT = [
  [v4(0, 0, 0, 0), 8, 'this host'],
  [v4(10, 0, 0, 0), 8, 'a private network'],
  [v4(100, 64, 0, 0), 10, 'carrier space'],
  [v4(127, 0, 0, 0), 8, 'loopback'],
  [v4(169, 254, 0, 0), 16, 'link local, which is where cloud credentials live'],
  [v4(172, 16, 0, 0), 12, 'a private network'],
  [v4(192, 0, 0, 0), 24, 'protocol assignments'],
  [v4(192, 168, 0, 0), 16, 'a private network'],
  [v4(198, 18, 0, 0), 15, 'benchmark space'],
  [v4(224, 0, 0, 0), 4, 'multicast'],
  [v4(240, 0, 0, 0), 4, 'reserved'],
]
function whyShutV4(n) {
  for (const [base, bits, why] of SHUT) {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    if ((n & mask) >>> 0 === (base & mask) >>> 0) return why
  }
  return ''
}

/** IPv6, only as far as telling inside from outside, which is all this has to decide. */
function whyShutV6(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  if (h === '::1' || h === '::') return 'loopback'
  // an address written ::ffff:127.0.0.1 is a v4 address wearing a v6 spelling
  const mapped = /^::ffff:(.+)$/.exec(h)
  if (mapped) {
    const n = mapped[1].includes('.') ? asV4(mapped[1]) : parseInt(mapped[1].replace(':', ''), 16)
    if (n !== null && Number.isFinite(n)) return whyShutV4(n >>> 0) || ''
  }
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return 'a private network'
  if (/^fe[89ab][0-9a-f]:/.test(h)) return 'link local, which is where cloud credentials live'
  return ''
}

/** Names that mean this machine without ever being an address. */
const HOMELY = /^(localhost|ip6-localhost|ip6-loopback)$/i

/**
 * Whether an address is one this machine considers its own.
 *
 * Exported because the studio needs the same answer for a different reason: a bare host typed into
 * the address bar is http when it is local and https everywhere else.
 */
export function isLocal(host) {
  const h = String(host || '').replace(/\.$/, '')
  if (HOMELY.test(h) || /\.local$/i.test(h)) return true
  if (h.startsWith('[')) return !!whyShutV6(h)
  const n = asV4(h)
  return n === null ? false : !!whyShutV4(n)
}

/* ── the decision ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Whether the proxy may fetch this, and if not, why not in a sentence somebody can act on.
 *
 *   mode        'local' allows everything, which is what a laptop wants. 'public' refuses inward
 *               addresses, credentials in the url, and anything not http.
 *   allow       if given, the only hosts permitted. A suffix match, so 'example.com' covers its
 *               subdomains. This is the honest answer for a first deployment: an open proxy is a
 *               liability whatever else is checked, and a list of sites you meant to support is not.
 *   deny        hosts refused even in local mode.
 *   maxBytes    carried through rather than enforced here, since the caller owns the response.
 */
export function inspect(raw, { mode = 'local', allow = [], deny = [] } = {}) {
  let url
  try { url = new URL(String(raw)) } catch { return { ok: false, why: 'that is not an address' } }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, why: `${url.protocol.replace(':', '')} is not a protocol this fetches` }
  }
  /**
   * Credentials in the address are refused everywhere, including local.
   *
   * They are forwarded verbatim by every http client, so a url like http://user:pass@host is a way
   * to make this send somebody's credentials somewhere, and there is no case where a proxy for
   * looking at web pages needs them.
   */
  if (url.username || url.password) {
    return { ok: false, why: 'an address carrying a username or password is not fetched' }
  }
  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!host) return { ok: false, why: 'that address has no host' }

  const suffixed = (list) => list.some((d) => {
    const want = String(d).toLowerCase().replace(/^\./, '')
    return host === want || host.endsWith(`.${want}`)
  })
  if (deny.length && suffixed(deny)) return { ok: false, why: `${host} is on the refused list` }
  if (allow.length && !suffixed(allow)) {
    return { ok: false, why: `this only fetches from ${allow.slice(0, 3).join(', ')}` +
      (allow.length > 3 ? ` and ${allow.length - 3} more` : '') }
  }
  if (mode === 'local') return { ok: true, url }

  if (HOMELY.test(host) || /\.local$/i.test(host)) {
    return { ok: false, why: `${host} is this machine, which a deployed proxy will not fetch` }
  }
  const why = host.includes(':') || raw.includes('[')
    ? whyShutV6(url.hostname)
    : (() => { const n = asV4(host); return n === null ? '' : whyShutV4(n) })()
  if (why) return { ok: false, why: `${host} is ${why}, which a deployed proxy will not fetch` }

  return { ok: true, url }
}

/**
 * The half of the problem that needs a resolver.
 *
 * A name is not an address, so `inspect` cannot see that shell.example.com has an A record pointing
 * at 10.0.0.1. This asks, on hosts where asking is possible, and is a no-op everywhere else rather
 * than a hard failure, because a worker has no resolver and refusing every request there would be
 * the wrong way to be careful.
 *
 * This still leaves the gap between the lookup and the connection, where a name that answered
 * truthfully the first time answers differently the second. Closing that means pinning the address
 * into the socket, which is below where this sits.
 */
export async function resolves(host, { mode = 'local' } = {}) {
  if (mode === 'local') return { ok: true }
  let lookup
  try { ({ lookup } = await import('node:dns/promises')) } catch { return { ok: true, checked: false } }
  try {
    const found = await lookup(host, { all: true })
    for (const { address, family } of found) {
      const why = family === 6 ? whyShutV6(address)
        : (() => { const n = asV4(address); return n === null ? '' : whyShutV4(n) })()
      if (why) return { ok: false, why: `${host} resolves to ${address}, which is ${why}` }
    }
    return { ok: true, checked: true, addresses: found.map((f) => f.address) }
  } catch (e) {
    return { ok: false, why: `${host} did not resolve (${String(e.code || e.message).slice(0, 40)})` }
  }
}

/** Both halves, which is what a request handler actually wants to call. */
export async function allowed(raw, opts = {}) {
  const first = inspect(raw, opts)
  if (!first.ok) return first
  const second = await resolves(first.url.hostname, opts)
  return second.ok ? first : second
}
