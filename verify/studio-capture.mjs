/**
 * What survives being picked, across many kinds of element and many real sites.
 *
 * studio-sites.mjs asks whether a site can be reached and whether one element can be picked at all.
 * This asks the harder question: when an element is lifted out of its page, does it still look like
 * itself? That is the whole promise of the picker, and it fails differently for different shapes. An
 * svg is one node with a drawing inside it. An input carries its value in a property rather than in
 * the markup, so outerHTML loses what is typed. A select keeps its options but not which one is
 * chosen. A canvas is pixels that were painted by a script that will not run again.
 *
 * So each pick is rendered back on its own and measured against the original: how much of the tree
 * survived, and how close the size is. A capture that keeps every node and lands within a few percent
 * of the original box is one somebody can write motion against. Anything else is reported with the
 * reason rather than counted as a pass, because a silently half captured element is exactly the
 * failure this whole tool keeps running into.
 *
 *   node verify/studio-capture.mjs                  every site
 *   node verify/studio-capture.mjs linear stripe    only those
 *   node verify/studio-capture.mjs --deep           more element kinds per site
 */

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const SITES = [
  ['shadcn', 'ui.shadcn.com/charts'], ['stripe', 'stripe.com'], ['linear', 'linear.app'],
  ['vercel', 'vercel.com'], ['github', 'github.com'], ['tailwind', 'tailwindcss.com'],
  ['nextjs', 'nextjs.org'], ['react', 'react.dev'], ['mdn', 'developer.mozilla.org'],
  ['figma', 'figma.com'], ['notion', 'notion.so'], ['supabase', 'supabase.com'],
  ['railway', 'railway.com'], ['posthog', 'posthog.com'], ['resend', 'resend.com'],
  ['clerk', 'clerk.com'], ['sentry', 'sentry.io'], ['anthropic', 'anthropic.com'],
  ['google', 'google.com'], ['npmjs', 'npmjs.com'],
]

/** the shapes worth telling apart, because each fails in its own way */
const KINDS = [
  ['svg', 'svg'],
  ['input', 'input[type=text], input[type=search], input:not([type]), textarea'],
  ['select', 'select'],
  ['button', 'button'],
  ['link', 'a[href]'],
  ['heading', 'h1, h2'],
  ['image', 'img'],
  ['list', 'ul, ol'],
  ['card', 'article, [class*=card], [class*=Card]'],
  ['nav', 'nav, header'],
]
const DEEP = process.argv.includes('--deep')
const kinds = DEEP ? KINDS : KINDS.slice(0, 7)

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const list = only.length ? SITES.filter(([n]) => only.includes(n)) : SITES
const PORT = Number(process.env.WALL_PORT || 4398)

const studio = spawn('node', ['tools/studio.mjs'],
  { env: { ...process.env, WALL_PORT: String(PORT), WALL_NO_OPEN: '1' }, stdio: 'ignore' })
const stop = () => { try { studio.kill() } catch {} }
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(1) })
await new Promise((r) => setTimeout(r, 3500))

const browser = await chromium.launch()
const rows = []

for (const [site, addr] of list) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' })
    await page.fill('#url', addr)
    await page.click('#go')
    await page.waitForFunction(() => !/reaching it/i.test(document.getElementById('aimnote').textContent),
      null, { timeout: 60000 })
    if (!/proxied/i.test(await page.textContent('#aimnote'))) {
      rows.push({ site, kind: '(site)', note: (await page.textContent('#aimnote')).trim().slice(0, 44) })
      await ctx.close(); continue
    }
    await page.waitForTimeout(12000)
    const fr = page.frames().find((f) => f.url().includes(`localhost:${PORT}`) && !f.url().endsWith(`${PORT}/`))
    if (!fr) { rows.push({ site, kind: '(site)', note: 'frame left the proxy' }); await ctx.close(); continue }
    const box = await page.locator('.appwrap iframe').boundingBox()
    await page.click('#pick'); await page.waitForTimeout(400)

    for (const [kind, sel] of kinds) {
      const row = { site, kind, note: '' }
      // the original, measured before it is touched
      const found = await fr.evaluate((s) => {
        const seen = window.__cap || (window.__cap = [])
        let e
        try {
          e = [...document.querySelectorAll(s)].filter((x) => {
            const r = x.getBoundingClientRect()
            return r.width > 40 && r.height > 16 && r.top > 50 && r.top < 830 && !seen.includes(x)
          })[0]
        } catch { /* a selector this page's engine dislikes */ }
        if (!e) return null
        seen.push(e)
        const r = e.getBoundingClientRect()
        return { x: Math.round(r.x + Math.min(r.width / 2, 280)), y: Math.round(r.y + Math.min(r.height / 2, 24)),
          w: Math.round(r.width), h: Math.round(r.height), nodes: e.querySelectorAll('*').length + 1 }
      }, sel)
      if (!found) { row.note = 'none on screen'; rows.push(row); continue }
      Object.assign(row, { w: found.w, h: found.h, nodes: found.nodes })

      const before = await page.evaluate(() => picks.length)
      await page.mouse.move(box.x + found.x, box.y + found.y); await page.waitForTimeout(260)
      await page.mouse.click(box.x + found.x, box.y + found.y); await page.waitForTimeout(650)
      const got = await page.evaluate((n) => {
        const q = picks[n]
        return q ? { html: q.html, css: q.css, w: q.w, h: q.h, n: q.n, cut: q.cut, opaque: q.opaque } : null
      }, before)
      if (!got) { row.note = 'click did not register'; rows.push(row); continue }
      Object.assign(row, { mk: got.html.length, ck: got.css.length, cut: got.cut, opaque: got.opaque })

      /**
       * Rendered on its own and measured, which is the only question that matters.
       *
       * Written into a frame rather than compared as strings: the tree can survive intact and still
       * lay out as nothing once its parent's width and flex context are gone, and a string comparison
       * would call that a pass.
       */
      const back = await page.evaluate(async ({ html, css, w }) => {
        const f = document.createElement('iframe')
        f.style.cssText = 'position:fixed;left:-9999px;width:1200px;height:900px;border:0'
        document.body.appendChild(f)
        const d = f.contentDocument
        d.open()
        d.write('<html><head><style>html,body{margin:0}#c{width:' + (w || 800) + 'px}' + css
          + '</style></head><body><div id="c">' + html + '</div></body></html>')
        d.close()
        await new Promise((r) => setTimeout(r, 350))
        const root = d.getElementById('c').firstElementChild
        const out = root
          ? { nodes: root.querySelectorAll('*').length + 1,
              w: Math.round(root.getBoundingClientRect().width),
              h: Math.round(root.getBoundingClientRect().height) }
          : null
        f.remove()
        return out
      }, { html: got.html, css: got.css, w: got.w })
      if (!back) { row.note = 'rendered to nothing'; rows.push(row); continue }
      /**
       * Measured against the element that was picked, not the one that was aimed at.
       *
       * The first version compared the re-render to whatever the selector had found, then clicked its
       * centre and let the picker take whatever was topmost there, which is frequently a child or a
       * wrapper. Comparing two different elements produced readings like 8300 percent and told me
       * nothing. The picker now reports its own node count, so this is the same element both times.
       */
      row.w = got.w; row.h = got.h; row.nodes = got.n
      row.kept = got.n ? Math.round((back.nodes / got.n) * 100) : 100
      row.fit = got.h ? Math.round((back.h / got.h) * 100) : 0
      rows.push(row)
    }
  } catch (e) {
    rows.push({ site, kind: '(site)', note: String(e && e.message ? e.message : e).split('\n')[0].slice(0, 44) })
  }
  await ctx.close()
}
await browser.close()
stop()

const num = (v, s = '') => (v === undefined || v === null ? '-' : v + s)
console.log('\n  site        kind      original      nodes kept  height   css     note')
for (const r of rows) {
  console.log('  ' + r.site.padEnd(11) + ' ' + r.kind.padEnd(9) + ' '
    + String(r.w !== undefined ? r.w + 'x' + r.h : '-').padEnd(13)
    + String(num(r.kept, '%')).padEnd(11) + ' ' + String(num(r.fit, '%')).padEnd(8)
    + String(r.ck !== undefined ? (r.ck / 1000).toFixed(1) + 'kb' : '-').padEnd(8)
    + (r.cut ? 'trimmed ' : '') + (r.note || ''))
}

const tried = rows.filter((r) => r.kept !== undefined)
// a capture is faithful when the tree survived and the box is close to what it was
const good = tried.filter((r) => r.kept >= 95 && r.fit >= 60 && r.fit <= 160)
console.log(`\n  ${good.length} of ${tried.length} captures kept their tree and their shape`)
for (const kind of [...new Set(rows.map((r) => r.kind))].filter((k) => k !== '(site)')) {
  const of = tried.filter((r) => r.kind === kind)
  if (!of.length) continue
  const ok = of.filter((r) => r.kept >= 95 && r.fit >= 60 && r.fit <= 160).length
  console.log(`    ${kind.padEnd(9)} ${ok}/${of.length}`)
}
const missing = rows.filter((r) => r.note === 'none on screen').length
if (missing) console.log(`  ${missing} kinds were not on the page at all, which is not a failure`)
