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
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

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

/* ── the rail's arithmetic, which needs no site and no browser ────────────────────────────────── */
/**
 * The composition half, checked here rather than in a suite of its own.
 *
 * These are the three failures worth writing first because every one of them is silent. A solver that
 * loops on a cycle hangs the page with no message. Snapping that gives up past the end of the ruler
 * leaves a bar somewhere nobody chose. A multi drag that recomputes each bar from the pointer piles
 * three cars onto one instant, and the composition still plays, just wrong, which is why it survives
 * being looked at.
 *
 * All of it is arithmetic on a value, so it runs in node in milliseconds and joins the suite everyone
 * actually runs. The legs below it need a real pointer and a real site; this needs neither.
 *
 *   node verify/studio-capture.mjs --rail     only this, no network
 */
const RAIL = process.argv.includes('--rail')
let bad = 0
const ok = (how, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${how}${detail ? `  ${detail}` : ''}`)
  if (!cond) bad += 1
}

{
  const A = await import('../shared/arrange.mjs')
  const car = (id, at, ms, after = null) => ({
    pick: { label: id, w: 100, h: 40 }, motion: { id, note: id, ms }, alternatives: [],
    at, after, shot: '', tune: null, why: '',
  })
  const arrange = (cars) => ({ id: 'a1', cars, camera: '', markers: [] })

  console.log('\n  the solver')
  const chain = arrange([car('a', 0, 500), car('b', 9999, 300, { id: 'a', mode: 'after', gap: 100 }),
    car('c', 9999, 200, { id: 'b', mode: 'with', gap: 0 })])
  const walked = A.resolve(chain)
  ok('a chain starts each car when the one it follows has finished',
    walked.at[1] === 600 && walked.at[2] === 600, `${walked.at.join(', ')}`)
  ok('and a link resolves rather than leaving the offset it was given', !walked.at.includes(9999))
  ok('nothing is reported as circular when nothing is', walked.cyclic.length === 0)

  /* in a child with a deadline, because the failure being ruled out is a synchronous loop: it blocks
     the event loop, so a watchdog timer in this process would never get to fire and the suite would
     hang exactly as the page would */
  const at = new URL('../shared/arrange.mjs', import.meta.url).href
  const probe = `import { resolve } from '${at}'
const car = (id, o, after) => ({ pick:{label:id}, motion:{id,ms:200}, alternatives:[], at:o, after })
process.stdout.write(JSON.stringify(resolve({ cars: [
  car('a', 300, { id:'b', mode:'after', gap:0 }),
  car('b', 100, { id:'a', mode:'after', gap:0 }),
  car('c', 700, null) ] })))`
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', probe],
    { timeout: 4000, encoding: 'utf8' })
  ok('a cycle returns instead of hanging',
    ran.status === 0 && !ran.signal, ran.signal ? `killed by ${ran.signal}` : `exit ${ran.status}`)
  const solved = ran.stdout ? JSON.parse(ran.stdout) : { at: [], cyclic: [] }
  ok('and every car in it falls back to the absolute offset it still carries',
    solved.at[0] === 300 && solved.at[1] === 100, `${(solved.at || []).join(', ')}`)
  ok('and the cycle is named rather than quietly absorbed',
    (solved.cyclic || []).includes('a') && solved.cyclic.includes('b'), `${solved.cyclic}`)
  ok('while a car outside the cycle is unaffected', solved.at[2] === 700, `${solved.at[2]}`)

  console.log('\n  snapping')
  const three = arrange([car('a', 0, 500), car('b', 800, 400), car('c', 2000, 300)])
  const total = A.viewSpan(three)
  const tol = (7 / 700) * total
  const targets = A.edges(three, [2], 1500)
  const past = A.snapTo(999999, targets, tol, A.gridStep(total, 700), (4 / 700) * total)
  ok('a bar dragged far past the end keeps a real time rather than NaN',
    Number.isFinite(past.at) && past.at >= 0, `${past.at}ms`)
  ok('and lands on nothing rather than on the nearest thing behind it',
    past.hit === null || past.at > 2000, `hit ${past.hit}`)
  ok('the ruler grows to contain a bar dropped past the end',
    A.spanOf(A.moved(three, 2, past.at)) >= past.at, `${Math.round(A.spanOf(A.moved(three, 2, past.at)))}ms`)
  const near = A.snapTo(1195, A.edges(three, [2], null), tol, 0, 0)
  ok('a bar released near a neighbour lands exactly on its end',
    near.at === 1200, `${near.at}ms, on ${near.hit}`)
  ok('and says what it landed on, so the move is not a mystery', /ending/.test(near.hit || ''))
  ok('zero is a target, so a bar dragged to the start lands clean',
    A.snapTo(6, targets, tol, 0, 0).at === 0)
  ok('a named edge wins over a grid line sitting nearer it',
    A.snapTo(1202, A.edges(three, [2], null), tol, 100, (4 / 700) * total).at === 1200)
  ok('the grid is coarse enough to aim between',
    A.gridStep(20000, 700) > A.gridStep(1200, 700),
    `${A.gridStep(1200, 700)}ms at 1.2s, ${A.gridStep(20000, 700)}ms at 20s`)

  console.log('\n  dragging several rows at once')
  const four = arrange([car('a', 200, 300), car('b', 500, 300), car('c', 900, 300), car('d', 4000, 300)])
  const gaps = (a) => a.slice(1).map((v, i) => v - a[i])
  const before = [0, 1, 2].map((i) => four.cars[i].at)
  const rightward = A.shifted(four, [0, 1, 2], 600)
  const after = [0, 1, 2].map((i) => rightward.cars[i].at)
  ok('every selected bar moves by the same amount',
    new Set(after.map((v, i) => v - before[i])).size === 1, `moved ${after[0] - before[0]}ms`)
  ok('and the offsets between them are exactly what they were',
    String(gaps(after)) === String(gaps(before)), `${gaps(before)} then ${gaps(after)}`)
  ok('a row that was not selected does not move', rightward.cars[3].at === 4000)

  const wall = A.shifted(four, [0, 1, 2], -5000)
  const walled = [0, 1, 2].map((i) => wall.cars[i].at)
  ok('dragged hard against the start, the earliest bar stops at zero', walled[0] === 0, `${walled.join(', ')}`)
  ok('and the group keeps its shape rather than piling up on zero',
    String(gaps(walled)) === String(gaps(before)), `${gaps(before)} then ${gaps(walled)}`)
  ok('so dragging back out restores the arrangement exactly',
    String([0, 1, 2].map((i) => A.shifted(wall, [0, 1, 2], 200).cars[i].at)) === String(before))

  console.log('\n  the value')
  const built = A.fromRail([
    { id: 'm1', note: 'one', tempo: { span: 400 }, label: 'div.Card',
      alts: [{ id: 'm1', note: 'one', tempo: { span: 400 } }, { id: 'm2', note: 'two', tempo: { span: 900 } }] },
    { label: 'span.thin', why: 'nothing came back' },
  ])
  ok('a car that did not move still holds a row, so it can be told why',
    built.cars.length === 2 && !built.cars[1].motion && !!built.cars[1].why)
  ok('the alternatives already generated are kept rather than dropped',
    built.cars[0].alternatives.length === 2)
  ok('swapping to an alternative leaves the car where it started in time',
    A.swapped(built, 0, 1).cars[0].at === built.cars[0].at)
  ok('and changes what runs, so the bar length follows the motion',
    A.swapped(built, 0, 1).cars[0].motion.ms === 900)
  ok('which alternative is showing is derived, so it cannot disagree with the motion',
    A.chosenAlt(A.swapped(built, 0, 1).cars[0]) === 1)
  ok('an edit returns a new arrangement and leaves the old one alone',
    A.moved(built, 0, 750).cars[0].at === 750 && built.cars[0].at === 0)
  let froze = false
  try { built.cars[0].motion.ms = 1 } catch { froze = true }
  ok('a motion cannot be written through, since history steps share it',
    froze || built.cars[0].motion.ms === 400)
  /* a dead car owns a row but is not a subject, so what railview is asked for is the moving cars in
     row order. Getting that wrong shifts every offset by one and times the whole rail to the wrong
     cars, which is the misalignment railView already had between its ids and its AT array */
  const pair = A.fromRail([
    { id: 'm1', tempo: { span: 400 }, label: 'a' },
    { label: 'dead', why: 'nothing came back' },
    { id: 'm3', tempo: { span: 400 }, label: 'c' },
  ])
  ok('railview is asked only for the cars that move, in the order their rows sit in',
    /ids=m1%2Cm3/.test(A.urlOf(pair, '') || ''), `${A.urlOf(pair, '')}`)
  ok('and their offsets are the resolved ones, skipping the row that did not move',
    /at=0%2C840/.test(A.urlOf(pair, '') || ''))
  ok('a link changes what railview is told rather than anything on the server',
    /at=0%2C400/.test(A.urlOf(A.retimed(pair, 2, { after: { id: 'm1', mode: 'after', gap: 0 } }), '') || ''))
  ok('and a rail with nothing that moved asks for nothing',
    A.urlOf(A.fromRail([{ label: 'x', why: 'no' }]), '') === null)

  /**
   * What a rail hands over, driven for real.
   *
   * An export is the artifact somebody else opens, so the only honest check is to open it. This one
   * seeds the studio's own session store with three motions rather than spending three model calls
   * on it, which is what lets a check about sequencing run with no network and no key.
   *
   * The failure it exists for was reported from real use: the exported rail arrived as a stack of
   * components all starting together. Every id was present and every sheet was correct, so nothing
   * looked wrong in the file; the one decision a rail records had simply been dropped on the way out.
   */
  console.log('\n  what an exported rail plays')
  const bed = mkdtempSync(join(tmpdir(), 'wall-rail-'))
  const sheet = (n, ms) => `[data-m${n}] > b{opacity:0;animation:rise${n} ${ms}ms ease both}
[data-m${n}] > b:nth-child(2){animation-delay:120ms}
@keyframes rise${n}{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){[data-m${n}] > b{animation:none;opacity:1}}`
  mkdirSync(join(bed, '.studio'), { recursive: true })
  writeFileSync(join(bed, '.studio', 'session.json'), JSON.stringify({
    at: Date.now(), aim: null, nextId: 9,
    made: [1, 2, 3].map((n) => [String(n), {
      file: `card${n}.tsx`, markup: `<div data-m${n}><b>one</b><b>two</b></div>`, base: '', shot: '',
      css: sheet(n, 300 + n * 100), scope: `data-m${n}`, tw: false, wide: 320,
      note: `card ${n} rises`, verb: 'rising,',
    }]),
  }))
  const XPORT = Number(process.env.WALL_RAIL_PORT || 4390)
  for (const pid of spawnSync('lsof', ['-ti', `tcp:${XPORT}`], { encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean).filter((p) => p !== String(process.pid))) {
    try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ }
  }
  const seeded = spawn('node', [resolve('tools/studio.mjs'), resolve('examples/components')],
    { cwd: bed, env: { ...process.env, WALL_PORT: String(XPORT), WALL_NO_OPEN: '1' }, stdio: 'ignore' })
  const shut = () => { try { seeded.kill('SIGKILL') } catch { /* gone */ } }
  process.on('exit', shut)
  await new Promise((r) => setTimeout(r, 3500))

  const wrote = await fetch(`http://localhost:${XPORT}/__wall/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['1', '2', '3'], at: [0, 800, 1600], shots: ['', '', ''], name: 'railleg' }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
  ok('a rail exports', !!wrote.at && !wrote.error, wrote.at ? `${wrote.kb}kb` : String(wrote.error))

  if (wrote.at) {
    const seat = await chromium.launch()
    const sheetPage = await seat.newPage()
    const faults = []
    sheetPage.on('pageerror', (e) => faults.push(String(e)))
    await sheetPage.goto(`file://${wrote.at}`, { waitUntil: 'load' })
    await sheetPage.waitForTimeout(250)
    const at = (ms) => sheetPage.evaluate((t) => {
      running = false; hold(t)
      return [...document.querySelectorAll('figure')]
        .map((f) => Number(getComputedStyle(f.querySelector('b')).opacity))
    }, ms)
    const [zero, early, mid, late] = [await at(0), await at(500), await at(900), await at(1750)]
    ok('nothing has moved at the very first frame', zero.every((v) => v < 0.05), `${zero}`)
    ok('the first car has arrived while the others have not started',
      early[0] > 0.9 && early[1] < 0.05 && early[2] < 0.05, `${early.map((v) => v.toFixed(2))}`)
    ok('the second car starts at its own offset rather than at zero',
      mid[1] > 0.05 && mid[1] < 0.95 && mid[2] < 0.05, `${mid.map((v) => v.toFixed(2))}`)
    // still climbing rather than finished, or a rail that ignores offsets passes this one too
    ok('and the third is still arriving when the second is long done',
      late[2] > 0.05 && late[2] < 0.95 && late[1] > 0.9, `${late.map((v) => v.toFixed(2))}`)
    ok('a composition is one stage rather than a wall of captioned cards',
      await sheetPage.evaluate(() => document.querySelectorAll('figcaption').length) === 0)
    ok('the exported file opens without complaint', faults.length === 0, faults.join('; ').slice(0, 60))

    /**
     * The timeline under a real pointer.
     *
     * The arithmetic above is checked without a browser, which is most of it, and none of it can see
     * the two faults this leg exists for. Both were found by hand and both were silent: a cmd click
     * that took a row out of the selection and put it straight back, because the bar and the row were
     * each answering the same press; and a completed drag that swallowed the next click, so selecting
     * a row after moving one did nothing until you clicked twice.
     *
     * Driven with page.mouse rather than synthetic events, for the reason written next to the drag
     * handler: the cursor leaves a twelve pixel bar within a frame of any real drag, and events fired
     * straight at the element pass while a hand fails.
     */
    const room = await seat.newPage()
    const said = []
    room.on('pageerror', (e) => said.push(String(e)))
    await room.goto(`http://localhost:${XPORT}`, { waitUntil: 'load' })
    await room.waitForTimeout(1200)
    const lay = async () => room.evaluate(async () => {
      await arriving
      arr = ARR.fromRail([
        { id: '1', note: 'header', tempo: { span: 400 }, label: 'header' },
        { id: '2', note: 'cards', tempo: { span: 600 }, label: 'ul' },
        { id: '3', note: 'chart', tempo: { span: 500 }, label: 'figure' }])
      running = false; zoom = 0; choose([]); render()
    })
    const offs = () => room.evaluate(() => arr.cars.map((c) => Math.round(c.at)))
    const picked = () => room.evaluate(() => [...sel])
    await lay(); await room.waitForTimeout(300)

    await room.locator('[data-row="0"]').click(); await room.waitForTimeout(120)
    await room.locator('[data-row="2"]').click({ modifiers: ['Shift'] }); await room.waitForTimeout(120)
    ok('shift click takes the rows between', String(await picked()) === '0,1,2', `${await picked()}`)
    await room.locator('[data-row="1"]').click({ modifiers: ['Meta'] }); await room.waitForTimeout(120)
    ok('and the platform modifier takes one back out rather than putting it back in',
      String(await picked()) === '0,2', `${await picked()}`)

    await room.evaluate(() => choose([0, 1, 2], 0)); await room.waitForTimeout(100)
    const was = await offs()
    const bar = await room.locator('[data-bar="1"]').boundingBox()
    const track = await room.locator('[data-track="1"]').boundingBox()
    await room.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
    await room.mouse.down()
    await room.mouse.move(track.x + track.width * 0.62, bar.y + bar.height / 2, { steps: 16 })
    await room.mouse.up(); await room.waitForTimeout(300)
    const now = await offs()
    const between = (a) => a.slice(1).map((v, k) => v - a[k])
    ok('dragging one of several selected bars moves them all',
      now.every((v, k) => v !== was[k]), `${was} then ${now}`)
    ok('and the offsets between them survive the drag',
      String(between(now)) === String(between(was)), `${between(was)} then ${between(now)}`)

    // the click that follows a completed drag must not be read as a fresh selection, or eaten
    await room.locator('[data-row="0"]').click(); await room.waitForTimeout(150)
    ok('a row clicked straight after a drag still selects, first time',
      String(await picked()) === '0', `${await picked()}`)

    await lay(); await room.waitForTimeout(250)
    await room.locator('[data-row="0"]').click(); await room.waitForTimeout(100)
    await room.keyboard.press('Meta+a'); await room.waitForTimeout(150)
    const steps = await room.evaluate(() => past.length)
    const before = await offs()
    for (let n = 0; n < 5; n += 1) { await room.keyboard.press('ArrowRight'); await room.waitForTimeout(35) }
    await room.waitForTimeout(250)
    const after = await offs()
    const moves = after.map((v, k) => v - before[k])
    ok('every selected row nudges by the same amount', new Set(moves).size === 1, `${moves}`)
    ok('and by a step that does not change under the hand, so five presses are five of one thing',
      moves[0] % 5 === 0 && moves[0] !== 0, `${moves[0]}ms over five presses`)
    ok('a held run of nudges is one step to undo rather than five',
      await room.evaluate(() => past.length) === steps + 1)
    await room.evaluate(() => undo()); await room.waitForTimeout(200)
    ok('and one undo puts the whole run back', String(await offs()) === String(before), `${await offs()}`)
    /* the rail generates these, judges them, stores them, and used to hand back one */
    await room.evaluate(async () => {
      await arriving
      arr = ARR.fromRail([
        { id: '1', note: 'header rises', verb: 'rising,', tempo: { span: 400 }, label: 'header',
          alts: [{ id: '1', note: 'header rises', verb: 'rising,', tempo: { span: 400 } },
            { id: '1b', note: 'header unfolds', verb: 'unfolding,', tempo: { span: 900 } }] },
        { id: '2', note: 'cards deal', tempo: { span: 600 }, label: 'ul',
          alts: [{ id: '2', note: 'cards deal', tempo: { span: 600 } }] }])
      running = false; zoom = 0; choose([]); render()
    })
    await room.waitForTimeout(300)
    const chips = () => room.evaluate(() => [...document.querySelectorAll('.tlalt')].map((c) => c.textContent))
    const playing = () => room.evaluate(() => arr.cars.map((c) => c.motion.note))
    const starts = () => room.evaluate(() => arr.cars.map((c) => Math.round(c.at)))
    ok('a row says how many motions it has and which it is playing',
      String(await chips()) === '1/2,1/1', `${await chips()}`)
    ok('a car with only one is offered nothing to press',
      await room.evaluate(() => document.querySelector('[data-alt="1"]').classList.contains('one')))
    const held0 = await starts()
    await room.locator('[data-alt="0"]').click(); await room.waitForTimeout(300)
    ok('cycling swaps which motion that car plays',
      String(await playing()) === 'header unfolds,cards deal', `${await playing()}`)
    ok('and leaves it where it was in time, since the beat is not what is being asked',
      String(await starts()) === String(held0), `${held0} then ${await starts()}`)
    ok('the frame is asked for the motion now showing',
      /ids=1b/.test(await room.evaluate(() => ARR.urlOf(arr, ''))))
    await room.evaluate(() => undo()); await room.waitForTimeout(250)
    ok('and undo puts the first one back', String(await playing()) === 'header rises,cards deal')

    ok('the timeline drives without complaint', said.length === 0, said.join('; ').slice(0, 60))
    await seat.close()
  }
  shut()
  rmSync(bed, { recursive: true, force: true })

  console.log(bad ? `\n  ${bad} failed\n` : '\n  the rail: errors none\n')
}

/* the legs below need a real pointer and twenty real sites, so the rail can be asked on its own */
if (RAIL) process.exit(bad ? 1 : 0)

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
    await page.waitForFunction(() => document.getElementById('aimnote').dataset.state !== 'reaching',
      null, { timeout: 60000 })
    if (await page.getAttribute('#aimnote', 'data-state') !== 'ok') {
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
