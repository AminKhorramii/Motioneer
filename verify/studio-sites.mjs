/**
 * Twenty real sites, aimed at one at a time, checked the way a person would.
 *
 * Every bug the studio's proxy has had was found by pointing it at something real: a layer rule
 * Tailwind hides its utilities in, an apex that redirects to www, an asset path that is root relative
 * to the host rather than to the page. None of them appear against a fixture, and each one presents
 * as "it shows the wrong site" or "nothing moves" rather than as an error.
 *
 * So this drives the actual studio in an actual browser and asks four questions per site: does the
 * frame stay inside the proxy, does its dom arrive, can its stylesheets be read, and does clicking
 * something hand back an element with css attached. A site that fails the first question is a proxy
 * bug. One that fails the third is usually cors on a cdn and is reported rather than fixed.
 *
 *   node verify/studio-sites.mjs                 all of them
 *   node verify/studio-sites.mjs stripe linear   only those
 */

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const SITES = [
  ['shadcn', 'ui.shadcn.com/charts'], ['stripe', 'stripe.com'], ['linear', 'linear.app'],
  ['vercel', 'vercel.com'], ['github', 'github.com'], ['tailwind', 'tailwindcss.com'],
  ['nextjs', 'nextjs.org'], ['react', 'react.dev'], ['mdn', 'developer.mozilla.org'],
  ['npm', 'npmjs.com'], ['figma', 'figma.com'], ['notion', 'notion.so'],
  ['supabase', 'supabase.com'], ['railway', 'railway.com'], ['posthog', 'posthog.com'],
  ['resend', 'resend.com'], ['clerk', 'clerk.com'], ['sentry', 'sentry.io'],
  ['anthropic', 'anthropic.com'], ['google', 'google.com'],
]

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const list = only.length ? SITES.filter(([n]) => only.includes(n)) : SITES
const PORT = Number(process.env.MOTIONEER_PORT || 4399)

const studio = spawn('node', ['tools/studio.mjs'],
  { env: { ...process.env, MOTIONEER_PORT: String(PORT), MOTIONEER_NO_OPEN: '1' }, stdio: 'ignore' })
const stop = () => { try { studio.kill() } catch {} }
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(1) })
await new Promise((r) => setTimeout(r, 3500))

const browser = await chromium.launch()
const rows = []

for (const [name, addr] of list) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  const row = { name, addr, aimed: '', frame: false, nodes: 0, readable: 0, opaque: 0, picked: '', note: '' }
  try {
    await page.goto(`http://localhost:${PORT}/__motioneer/legacy`, { waitUntil: 'load' })
    await page.fill('#url', addr)
    await page.click('#go')
    // "reaching it" is the in flight state and must not be mistaken for an answer
    await page.waitForFunction(
      () => document.getElementById('aimnote').dataset.state !== 'reaching',
      null, { timeout: 60000 })
    const note = await page.textContent('#aimnote')
    // the element's state rather than its wording, which is copy and is allowed to change
    const state = await page.getAttribute('#aimnote', 'data-state')
    if (state !== 'ok') { row.note = note.trim().slice(0, 60); rows.push(row); await ctx.close(); continue }
    row.aimed = await page.inputValue('#url')
    await page.waitForTimeout(9000)

    // the frame must still be served by us: a redirect that escaped is the failure this catches
    const fr = page.frames().find((f) => f.url().includes(`localhost:${PORT}`) && !f.url().endsWith(`${PORT}/`) && !f.url().includes('/__motioneer/legacy'))
    row.frame = !!fr
    if (!fr) {
      const stray = page.frames().map((f) => f.url()).find((u) => !u.includes(`localhost:${PORT}`) && u !== 'about:blank')
      row.note = stray ? `left the proxy for ${new URL(stray).host}` : 'no frame'
      rows.push(row); await ctx.close(); continue
    }
    const dom = await fr.evaluate(() => {
      let readable = 0, opaque = 0
      for (const s of document.styleSheets) { try { s.cssRules; readable++ } catch { opaque++ } }
      return { nodes: document.querySelectorAll('*').length, readable, opaque }
    })
    Object.assign(row, dom)

    // and something on it has to be pickable
    await page.click('#pick'); await page.waitForTimeout(400)
    const box = await page.locator('.appwrap iframe').boundingBox()
    const spot = await fr.evaluate(() => {
      const best = [...document.querySelectorAll('div,section,article,header,ul')]
        .map((e) => ({ e, r: e.getBoundingClientRect(), n: e.children.length }))
        .filter((o) => o.r.width > 200 && o.r.height > 60 && o.r.top > 40 && o.r.top < 640 && o.n >= 2)
        .sort((a, b) => b.n - a.n)[0]
      if (!best) return null
      return { x: Math.round(best.r.x + Math.min(best.r.width / 2, 300)), y: Math.round(best.r.top + 10) }
    })
    if (spot) {
      await page.mouse.move(box.x + spot.x, box.y + spot.y); await page.waitForTimeout(400)
      await page.mouse.click(box.x + spot.x, box.y + spot.y); await page.waitForTimeout(900)
      const got = await page.evaluate(() => (picks[0]
        ? `${picks[0].label.slice(0, 22)} ${(picks[0].css.length / 1000).toFixed(1)}kb css` : ''))
      row.picked = got
      if (!got) row.note = 'click did not register'
    } else row.note = 'nothing worth picking on screen'
  } catch (e) {
    row.note = String(e && e.message ? e.message : e).split('\n')[0].slice(0, 60)
  }
  rows.push(row)
  await ctx.close()
}

await browser.close()
stop()

// a bot check is the site refusing every proxy, not a fault in this one, so it is counted apart
const blocked = (r) => /bot check/i.test(r.note || '')
const ok = (r) => r.frame && r.nodes > 50 && r.picked
console.log('')
console.log('  site        frame  nodes  sheets(readable/opaque)  picked')
for (const r of rows) {
  console.log(`  ${r.name.padEnd(11)} ${(r.frame ? 'yes' : 'NO ').padEnd(6)} ${String(r.nodes).padStart(5)}`
    + `  ${String(r.readable).padStart(2)}/${String(r.opaque).padEnd(2)}`
    + `                  ${(r.picked || '-').padEnd(34)}${r.note ? '  ' + r.note : ''}`)
}
const good = rows.filter(ok).length
const walled = rows.filter(blocked)
console.log(`\n  ${good} of ${rows.length - walled.length} reachable sites worked end to end`)
if (walled.length) console.log(`  ${walled.length} refuse any proxy: ${walled.map((r) => r.name).join(', ')}`)
const cors = rows.filter((r) => r.opaque > 0)
if (cors.length) console.log(`  ${cors.length} had stylesheets they could not read: ${cors.map((r) => r.name).join(', ')}`)
process.exit(good === rows.length - walled.length ? 0 : 1)
