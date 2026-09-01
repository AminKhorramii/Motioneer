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
import { createServer } from 'node:http'
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
  /* the key is the car's own name and the id is its motion's, which is exactly the distinction the
     solver got wrong: keyed by motion, cycling a car onto an alternative renamed it and silently cut
     loose everything that followed it */
  const car = (id, at, ms, after = null) => ({
    key: id, pick: { label: id, w: 100, h: 40 }, motion: { id, note: id, ms }, alternatives: [],
    at, after, shot: '', tune: null, place: null, from: null, until: null, why: '',
  })
  const arrange = (cars) => ({ id: 'a1', cars, camera: '', markers: [] })

  console.log('\n  the solver')
  const chain = arrange([car('a', 0, 500), car('b', 9999, 300, { key: 'a', mode: 'after', gap: 100 }),
    car('c', 9999, 200, { key: 'b', mode: 'with', gap: 0 })])
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
const car = (id, o, after) => ({ key:id, pick:{label:id}, motion:{id,ms:200}, alternatives:[], at:o, after })
process.stdout.write(JSON.stringify(resolve({ cars: [
  car('a', 300, { key:'b', mode:'after', gap:0 }),
  car('b', 100, { key:'a', mode:'after', gap:0 }),
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

  console.log('\n  cars tied to other cars')
  const tied = arrange([car('a', 0, 500), car('b', 9999, 300, { key: 'a', mode: 'after', gap: 0 })])
  ok('a follower starts when the car it follows finishes',
    A.resolve(tied).at[1] === 500, `${A.resolve(tied).at}`)
  ok('and moving the leader carries it, which is the whole reason to tie one',
    A.resolve(A.moved(tied, 0, 300)).at[1] === 800, `${A.resolve(A.moved(tied, 0, 300)).at}`)
  ok('a longer motion on the leader pushes the follower along too',
    A.resolve(A.swapped(A.offered(tied, 0, [{ id: 'a2', ms: 900 }]), 0, 1)).at[1] === 900)
  /* dragging a tied bar has to change the gap: its absolute offset is not what puts it anywhere, so
     writing there leaves the bar where it was and the arrangement quietly altered */
  const nudgedTie = A.moved(tied, 1, 620)
  ok('dragging a tied bar retimes its gap rather than doing nothing visible',
    A.resolve(nudgedTie).at[1] === 620 && nudgedTie.cars[1].after.gap === 120,
    `gap ${nudgedTie.cars[1].after.gap}`)
  ok('and the gap is whole milliseconds rather than whatever the pointer landed on',
    Number.isInteger(A.moved(tied, 1, 620.37).cars[1].after.gap))
  ok('a with link starts them together instead',
    A.resolve(arrange([car('a', 0, 500),
      car('b', 9999, 300, { key: 'a', mode: 'with', gap: 0 })])).at[1] === 0)
  ok('a link to a car that is not here is not a link',
    A.resolve(arrange([car('a', 250, 500),
      car('b', 700, 300, { key: 'nope', mode: 'after', gap: 0 })])).at[1] === 700)
  /**
   * The one that was wrong, and silently.
   *
   * Links were keyed by motion id, and a car's motion is the single thing about it that changes:
   * cycling onto an alternative renamed the car, so everything following it came loose and fell back
   * to the absolute offset it had been ignoring. The rail carried on playing, at the wrong times,
   * having dropped a decision without saying anything.
   */
  const swapped = A.swapped(A.offered(tied, 0, [{ id: 'a-other', ms: 700 }]), 0, 1)
  ok('cycling the leader onto another motion does not cut its follower loose',
    swapped.cars[1].after !== null && A.resolve(swapped).at[1] === 700,
    `follower at ${A.resolve(swapped).at[1]} after the leader became ${swapped.cars[0].motion.id}`)
  ok('two cars can play the same motion and still be told apart',
    A.resolve(arrange([car('x', 0, 400), { ...car('y', 0, 400), motion: { id: 'x', note: 'x', ms: 400 } },
      car('z', 9999, 200, { key: 'y', mode: 'after', gap: 0 })])).at[2] === 400)

  /**
   * A page's sheet standing beside another page's sheet.
   *
   * The rules that matched a picked element arrive with the page they were on, and every real site
   * measured carries six that mean the page itself: :root, html, body, and the box sizing reset.
   * Dropped into a frame those still mean the page, so a component lifted off a light site repainted
   * the studio's own dark frame white and took its chrome with it. With two picks it is worse than
   * cosmetic, because whichever sheet comes last wins body and a .title written for one component
   * restyles the other.
   */
  console.log('\n  a stylesheet lifted out of the page it belonged to')
  const core = await import('../dist-core/core.js')
  const page = ':root{--x:1}\nbody{background:#fff;font:16px Inter}\n'
    + '*, ::after, ::before{box-sizing:border-box}\n.title{color:#111}\n'
    + '@media (min-width:600px){body{padding:20px}.title{font-size:40px}}\n'
    + '@keyframes rise{from{opacity:0}50%{opacity:.5}to{opacity:1}}\n'
    + '@font-face{font-family:X;src:url(a.woff2)}'
  const hemmed = core.grounded(page, "data-m1")
  ok('the page itself becomes the component, so its background cannot repaint the frame',
    !/(^|\n|\})\s*body\s*\{/.test(hemmed) && /\[data-m1\]\{background:#fff/.test(hemmed))
  ok('and :root goes with it, since a custom property set there is the page speaking',
    !/:root/.test(hemmed))
  /* the car and everything in it, which is two selectors: the descendant form alone misses the root,
     so the component that was picked is the one element the reset stops reaching */
  ok('a reset that named everything now names this component and everything in it',
    /\[data-m1\], \[data-m1\] \*, \[data-m1\]::after, \[data-m1\] \*::after/.test(hemmed),
    `${hemmed.split('\n')[2]}`)
  ok('an ordinary rule is walked into the component rather than left loose',
    /\[data-m1\] \.title\{color:#111\}/.test(hemmed))
  ok('a media query is gone into rather than copied whole',
    /@media \(min-width:600px\)\{\[data-m1\]\{padding:20px\}\[data-m1\] \.title/.test(hemmed))
  /* their steps are from and 50%, and prefixing one produces a percentage nothing can parse */
  ok('keyframe steps are left alone, because they are not selectors',
    /@keyframes rise\{from\{opacity:0\}50%\{opacity:\.5\}/.test(hemmed))
  ok('and an at rule with no rules inside it is copied as it stands',
    /@font-face\{font-family:X;src:url\(a\.woff2\)\}/.test(hemmed))
  ok('a sheet already inside the component is not walked in twice',
    core.grounded('[data-m1] .a{color:red}', 'data-m1') === '[data-m1] .a{color:red}')
  ok('and nothing without a scope to go into is left as it was',
    core.grounded(page, '') === page)

  /**
   * When a component is on the stage, which is not the same as when it moves.
   *
   * A car was in the document from the first frame and stayed for good, so a rail of three opened as
   * three boxes and only their contents arrived in order. Every element in a demo has a life: it
   * comes on, does things, and goes. The defaults are derived rather than stored, because a number
   * written into every car at birth freezes a decision nobody made and goes stale the moment the
   * motion it was copied from is moved.
   */
  /**
   * A motion at a length somebody chose.
   *
   * Every retime mints a new option on the server, so appending each one would turn a row's list of
   * alternatives into a record of every drag rather than the set of real choices it is meant to be.
   */
  console.log('\n  a motion made longer or shorter')
  /* built the way the rail builds one, so the motion the model gave is in the list to begin with */
  const short = A.fromRail([{ id: 'a', note: 'a', tempo: { span: 400 }, label: 'x' }])
  const long = A.trimmed(short, 0, { id: 'a2', ms: 900, origin: 'a' })
  ok('trimming replaces what the row is playing', long.cars[0].motion.ms === 900)
  ok('and the motion it came from stays reachable',
    long.cars[0].alternatives.some((m) => m.id === 'a'), `${long.cars[0].alternatives.map((m) => m.id)}`)
  const again = A.trimmed(long, 0, { id: 'a3', ms: 250, origin: 'a' })
  ok('and trimming again replaces the trim rather than piling another one on',
    again.cars[0].alternatives.length === long.cars[0].alternatives.length
      && again.cars[0].motion.id === 'a3',
    `${again.cars[0].alternatives.map((m) => m.id)}`)
  ok('a motion from the model carries no origin, so it is never mistaken for a retime',
    !A.fromRail([{ id: 'm', tempo: { span: 400 }, label: 'x' }]).cars[0].motion.origin)

  /**
   * Where a component goes, and when.
   *
   * A motion is what the model wrote and it happens once, at the start. A move is authored: this
   * thing travels from where it is to there, over that long, because somebody dragged it while the
   * clock was somewhere. That is the whole of a product demo and none of it needs a model.
   */
  console.log('\n  where each component goes')
  const still = A.placed(arrange([car('a', 0, 400)]), 0, { x: 5, y: 10, w: 40 })
  const trip = A.travels(still, 0, { at: 300, ms: 600, x: 30, y: 8, scale: 1, ease: 'ease' })
  ok('a component can be sent somewhere by a moment', trip.cars[0].moves.length === 1)
  ok('and where it sits is untouched, because where and when it goes are other decisions',
    trip.cars[0].place.x === 5 && trip.cars[0].place.y === 10)
  ok('a journey is kept in the order it happens',
    A.routed(trip, 0, [{ at: 900, ms: 200, x: 1, y: 1 }, { at: 100, ms: 200, x: 2, y: 2 }])
      .cars[0].moves.map((m) => m.at).join(',') === '100,900')
  /* dragging the same thing to the same instant twice is one decision made twice */
  ok('a leg landing where one already ends replaces it rather than stacking on it',
    A.travels(trip, 0, { at: 500, ms: 400, x: 9, y: 9 }).cars[0].moves.length === 1)
  ok('and one landing elsewhere is another leg',
    A.travels(trip, 0, { at: 1200, ms: 300, x: 9, y: 9 }).cars[0].moves.length === 2)
  ok('the ruler contains a journey that outlasts every motion in the rail',
    A.spanOf(A.travels(still, 0, { at: 3000, ms: 800, x: 1, y: 1 })) >= 3800)
  ok('and the frame is told the journey it has to draw',
    /go=300_600_30\.00_8\.00/.test(decodeURIComponent(A.urlOf(trip, '') || '')),
    `${decodeURIComponent(A.urlOf(trip, '') || '').split('go=')[1]}`)

  /**
   * The camera, which turned out to be a component's journey applied to everything at once.
   *
   * A camera was four presets and a rig per car, and a rig per car is what lets one component sit
   * still while the one below it pushes in. That is a different thing from a camera over the whole
   * composition, and once a component could be sent somewhere the second was the first, one level up.
   */
  console.log('\n  the camera over the whole composition')
  const shot = A.filmed(still, { at: 200, ms: 800, x: -20, y: -10, scale: 1.4, ease: 'ease' })
  ok('the camera can be sent somewhere', shot.camera.length === 1 && shot.camera[0].scale === 1.4)
  ok('and it moves the picture rather than anything in it',
    shot.cars[0].place.x === 5 && (shot.cars[0].moves || []).length === 0)
  ok('a camera move landing where one ends replaces it',
    A.filmed(shot, { at: 400, ms: 600, x: 1, y: 1 }).camera.length === 1)
  ok('the ruler contains a camera still moving after every motion has landed',
    A.spanOf(A.filmed(still, { at: 4000, ms: 900, x: 1, y: 1 })) >= 4900)
  ok('and the frame is told where the camera goes',
    /cam=200_800_-20\.00_-10\.00_1\.400/.test(decodeURIComponent(A.urlOf(shot, '') || '')),
    `${decodeURIComponent(A.urlOf(shot, '') || '').split('cam=')[1]}`)
  ok('an arrangement read back from a file brings its camera with it',
    A.revive(JSON.parse(JSON.stringify(shot))).camera.length === 1)

  console.log('\n  when each component is on the stage')
  const born = arrange([car('a', 0, 400), car('b', 600, 400)])
  ok('a component arrives when its motion starts, without anybody saying so',
    A.lifeOf(born, 1).from === 600 && A.lifeOf(born, 1).until === null)
  ok('and moving the motion moves the arrival with it, since it was never written down',
    A.lifeOf(A.moved(born, 1, 900), 1).from === 900)
  const leaves = A.living(born, 0, { from: null, until: 1000 })
  ok('a component can be given an exit', A.lifeOf(leaves, 0).until === 1000)
  ok('and told nothing it goes back to staying', A.lifeOf(A.living(leaves, 0, {}), 0).until === null)
  ok('an exit before the arrival is not an exit', A.lifeOf(A.living(born, 1, { until: 10 }), 1).until >= 600)
  /* a car that leaves still had to be watched leaving, so the ruler has to contain it */
  ok('the ruler contains a component that outlives its own motion',
    A.spanOf(A.living(born, 0, { until: 5000 })) >= 5000)
  /* decoded, because a comma encodes as %2C and the 2 in it reads as a number nobody wrote */
  const lifeIn = (a) => decodeURIComponent(A.urlOf(a, '') || '').split('life=')[1].split('&')[0]
  ok('the frame is told a life only when one was chosen',
    lifeIn(born) === ',' && lifeIn(leaves) === '0_1000,',
    `${lifeIn(born)} then ${lifeIn(leaves)}`)

  console.log('\n  where each component sits')
  const stack = arrange([car('a', 0, 400), car('b', 420, 400)])
  ok('a rail opens as a stack, with nobody placed', !A.staged(stack))
  const put = A.placed(stack, 1, { x: 35, y: 47, w: 41 })
  ok('putting one somewhere makes it a stage', A.staged(put) && !!put.cars[1].place)
  ok('and leaves the others where they were', put.cars[0].place === null)
  ok('a place is kept in per cent, so it survives the frame being another size',
    put.cars[1].place.x === 35 && put.cars[1].place.y === 47 && put.cars[1].place.w === 41)
  ok('and is clamped to the stage rather than being lost off the edge of it',
    A.placed(stack, 1, { x: -40, y: 900, w: 0 }).cars[1].place.x === 0
      && A.placed(stack, 1, { x: -40, y: 900, w: 0 }).cars[1].place.y === 100
      && A.placed(stack, 1, { x: -40, y: 900, w: 0 }).cars[1].place.w === 4)
  ok('handing it nothing puts it back in the stack', A.placed(put, 1, null).cars[1].place === null)
  ok('the frame is told where everyone goes, and told nothing for whoever is still stacked',
    /place=_%2C35_47_41|place=%2C35_47_41/.test(A.urlOf(put, '') || ''), `${A.urlOf(put, '')}`)
  ok('placing one does not move it in time, because where and when are different decisions',
    A.resolve(put).at[1] === A.resolve(stack).at[1])

  console.log('\n  an arrangement read back from where it was stored')
  const away = JSON.parse(JSON.stringify(A.placed(A.retimed(
    arrange([car('a', 0, 400), car('b', 800, 400)]), 1, { after: { key: 'a', mode: 'after', gap: 50 } }),
  1, { x: 20, y: 60, w: 45 })))
  const back = A.revive(away)
  ok('what it was is what comes back', A.resolve(back).at[1] === 450, `${A.resolve(back).at}`)
  ok('including where each component was put',
    back.cars[1].place.x === 20 && back.cars[1].place.w === 45)
  /* everything here leans on the motions being frozen, and json carries values and not that promise.
     A record that came back thawed would take a write in silence instead of throwing */
  let stillFrozen = false
  try { back.cars[0].motion.ms = 1 } catch { stillFrozen = true }
  ok('and the motions are frozen again, which json does not carry',
    stillFrozen || back.cars[0].motion.ms === 400)
  ok('nonsense is refused rather than half restored', A.revive(null) === null && A.revive({}) === null)

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
    /at=0%2C400/.test(A.urlOf(A.retimed(pair, 2, { after: { key: 'c1', mode: 'after', gap: 0 } }), '') || ''))
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
      /* the rules that matched it on the page it came from, page level ones and all, which is what
         every real pick carries and what used to repaint this frame */
      /* the rules that matched it on the page it came from, page level ones and all, which is what
         every real pick carries and what used to repaint this frame. The letter spacing differs per
         pick so a car wearing its neighbour's sheet is visible rather than merely plausible */
      base: `:root{--paper:#fff}body{background:#fff;color:#111;letter-spacing:${n}px}`
        + '*, ::after, ::before{box-sizing:border-box}',
      note: `card ${n} rises`, verb: 'rising,',
    }]).concat([['f', {
      /* A pick that arrived with a snapshot, which is what every picked element arrives with.
         The snapshot is trusted over the matched sheet because it cannot leak, so the sheet is
         dropped, and a @font-face is the one thing in that sheet no snapshot can stand in for: it
         names no selector, so nothing inline carries it and the component silently loses its
         typeface somewhere between being picked and being given motion. */
      file: 'faced.tsx', markup: '<div data-mf><b>one</b></div>',
      shot: '<div data-mf style="font-family:Inter"><b style="font-family:Inter">one</b></div>',
      base: '@font-face{font-family:"Inter";src:url(https://x/i.woff2)}\n'
        + 'body{background:#fff;color:#111}',
      css: sheet('f', 400), scope: 'data-mf', tw: false, wide: 320,
      note: 'faced rises', verb: 'rising,',
    }], ['L', {
      /* a deliberately slow one, because the camera length is floored at 2500ms and every other car
         here is quick enough to sit on that floor, where a wrong answer and a right one agree */
      file: 'slow.tsx', markup: '<div data-ml><b>one</b></div>', shot: '',
      css: sheet('L', 3200), scope: 'data-ml', tw: false, wide: 320,
      base: '', note: 'slow rises', verb: 'rising,',
    }]]),
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

  /* Measured on a real app before this was written: a pick off it carried thirty-nine face rules and
     the preview registered none of them, so every option in the grid was rendered in the fallback. */
  const faced = await fetch(`http://localhost:${XPORT}/__wall/preview/f`).then((r) => r.text())
    .catch((e) => String(e))
  ok('a preview keeps the face rules a snapshot cannot carry', faced.includes('@font-face'))
  ok('and still drops the rest of the sheet the snapshot replaces', !faced.includes('background:#fff'))

  /**
   * The camera you approved and the camera that gets filmed are the same length.
   *
   * The preview sized the move against the motion and the rail wrote a flat 3000ms, so any motion
   * longer than about 1.9 seconds was previewed with one camera and filmed with another. Both ends
   * looked right on their own, which is how this family of fault always presents.
   */
  const lens = (t) => (t.match(/animation:dolly\w*\s+(\d+)ms/) || t.match(/animation:dolly\s+(\d+)ms/) || [])[1]
  const shown = lens(await fetch(`http://localhost:${XPORT}/__wall/preview/L?camera=orbit&depth=1`)
    .then((r) => r.text()).catch(() => ''))
  const filmedAt = lens(await fetch(`http://localhost:${XPORT}/__wall/railview?ids=L&at=0&shots=orbit&palette=`)
    .then((r) => r.text()).catch(() => ''))
  ok('the camera in the film runs as long as the camera in the preview', !!shown && shown === filmedAt,
    `${shown}ms shown, ${filmedAt}ms filmed`)
  ok('and that length came from the motion rather than from a number in the file', shown !== '3000')

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

    /* the last thing the handoff was dropping. Offsets went first, then the placement, and each time
       the file looked complete: every id present, every sheet correct, one decision quietly gone */
    const filmed = await fetch(`http://localhost:${XPORT}/__wall/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['1', '2'], at: [0, 700], shots: ['push', ''],
        place: ['', ''], name: 'camleg' }),
    }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
    if (filmed.at) {
      const rigged = await seat.newPage()
      await rigged.goto(`file://${filmed.at}`, { waitUntil: 'load' })
      await rigged.waitForTimeout(300)
      const dollyAt = (ms) => rigged.evaluate((t) => {
        running = false; hold(t)
        const d = document.querySelector('.dolly')
        return { m: d ? getComputedStyle(d).transform : 'none',
          copies: document.querySelectorAll('.layer.blur > *, .layer.bloom > *').length }
      }, ms)
      const early = await dollyAt(200)
      const late = await dollyAt(2600)
      ok('a car exported with a camera brings its rig with it', early.m !== 'none' && early.m !== '')
      ok('and the two blurred copies of the subject are cloned into it', early.copies === 2)
      ok('and the camera actually moves rather than sitting on its first frame',
        early.m !== late.m, `${String(early.m).slice(0, 34)} then ${String(late.m).slice(0, 34)}`)
      ok('while the car without one is left alone',
        await rigged.evaluate(() => document.querySelectorAll('.rig').length) === 1)
      await rigged.close()
    } else ok('a rail with a camera exports', false, String(filmed.error))

    /**
     * What Film draws, which is not what the transport shows unless somebody makes it so.
     *
     * The preview holds each car at t minus its own offset, which is an operation on live animations.
     * Filming does not watch a document, it copies one, and a copy carries declarations rather than
     * clocks, so holdAt writes the instant into each element's own animation-delay. It wrote a single
     * instant into all of them: every car started together and the sequencing, the whole thing being
     * filmed, was gone. Reported from real use, the same way the export was, and for the same reason.
     *
     * Checked against the computed styles the copy inherits, at instants chosen so the answer differs
     * between the two behaviours: at 200ms only the first car has begun, and a film that ignores
     * offsets has all three at the same opacity.
     */
    const rail = await seat.newPage()
    await rail.goto(`http://localhost:${XPORT}/__wall/railview?ids=1,2,3&at=0,800,1600&shots=,,&palette=`,
      { waitUntil: 'load' })
    await rail.waitForTimeout(900)
    const drawnAt = (ms) => rail.evaluate(async (t) => {
      const R = await import('/__wall/raster.mjs')
      const undo = R.holdAt(document, t)
      const seen = [...document.querySelectorAll('.car')]
        .map((c) => Number(getComputedStyle(c.querySelector('b')).opacity))
      if (typeof undo === 'function') undo()
      return seen
    }, ms)
    const drewEarly = await drawnAt(200)
    const drewMid = await drawnAt(900)
    const drewLate = await drawnAt(2400)
    /* the seeded picks carry a real page's rules, so this is the frame refusing to be repainted */
    ok('a component lifted off a light page does not repaint the frame it is shown in',
      await rail.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(11, 12, 13)',
      `${await rail.evaluate(() => getComputedStyle(document.body).backgroundColor)}`)
    /* only the first car's sheet used to be emitted, so every car after it lost its matched rules
       and wore whichever page happened to be first */
    ok('and every car keeps its own sheet rather than wearing the first one\'s',
      String(await rail.evaluate(() => [...document.querySelectorAll('.car .in > *')]
        .map((c) => getComputedStyle(c).letterSpacing))) === '1px,2px,3px',
      `${await rail.evaluate(() => [...document.querySelectorAll('.car .in > *')]
        .map((c) => getComputedStyle(c).letterSpacing))}`)

    /**
     * A life, in the picture rather than only on the screen.
     *
     * The preview hides a component by setting a style as the clock moves, and a copy carries
     * declarations rather than whatever a listener last did. Without holdAt knowing about it, a
     * filmed rail shows every element from its first frame however carefully its arrival was placed,
     * which is the same fault the offsets had and is just as quiet.
     */
    const lived = await seat.newPage()
    await lived.goto(`http://localhost:${XPORT}/__wall/railview`
      + '?ids=1,2,3&at=0,600,1200&shots=,,&place=,,&life=0_1000,600_,1200_&palette=',
    { waitUntil: 'load' })
    await lived.waitForTimeout(800)
    const onStage = (ms) => lived.evaluate(async (t) => {
      const R = await import('/__wall/raster.mjs')
      const undo = R.holdAt(document, t)
      const v = [...document.querySelectorAll('.car')].map((c) => getComputedStyle(c).visibility)
      if (typeof undo === 'function') undo()
      return v
    }, ms)
    /**
     * The stale hide, which is what made a whole film show one component and nothing else.
     *
     * Filming holds the frame at zero before it starts, so the live listener sets an inline hidden on
     * every component that has not come on yet. A rule that only ever adds hidden cannot take that
     * back, so every later frame inherited the first one's answer and nothing ever arrived. Both
     * halves have to be written, which is why this holds at zero first and then asks.
     */
    await lived.evaluate(() => window.postMessage({ wall: 'hold', t: 0, i: 0 }, '*'))
    await lived.waitForTimeout(200)
    ok('a component held out of the picture at zero is put back into it later',
      String(await onStage(1400)) === 'hidden,visible,visible', `${await onStage(1400)}`)

    ok('a filmed component is not in the picture before it comes on',
      String(await onStage(0)) === 'visible,hidden,hidden', `${await onStage(0)}`)
    ok('and is gone from it after it leaves',
      String(await onStage(1100)) === 'hidden,visible,hidden', `${await onStage(1100)}`)
    ok('and the last one arrives at its own instant',
      String(await onStage(1400)) === 'hidden,visible,visible', `${await onStage(1400)}`)
    await lived.close()

    ok('a filmed rail draws only the car whose turn has come',
      drewEarly[0] > 0.2 && drewEarly[1] < 0.02 && drewEarly[2] < 0.02, `${drewEarly.map((v) => v.toFixed(2))}`)
    ok('and lets the next one in at its own offset rather than at the first one',
      drewMid[1] > 0.02 && drewMid[2] < 0.02, `${drewMid.map((v) => v.toFixed(2))}`)
    /* the last car starts at 1600 and runs 600ms, so this is past its end rather than mid flight */
    ok('and has them all by the end',
      drewLate.every((v) => v > 0.9), `${drewLate.map((v) => v.toFixed(2))}`)
    await rail.close()

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

    /* tying one car to another by dragging from the end of its bar onto the row it should follow */
    await lay(); await room.waitForTimeout(300)
    const tieOnto = async (from, onto) => {
      const grab = await room.locator(`[data-tie="${from}"]`).boundingBox()
      const drop = await room.locator(`[data-row="${onto}"]`).boundingBox()
      await room.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
      await room.mouse.down()
      await room.mouse.move(drop.x + 120, drop.y + drop.height / 2, { steps: 10 })
      await room.mouse.up(); await room.waitForTimeout(300)
    }
    const when = () => room.evaluate(() => ARR.resolve(arr).at.map(Math.round))
    await tieOnto(1, 0)
    ok('a bar dragged onto another row starts when that one finishes',
      (await when())[1] === 400, `${await when()}`)
    ok('and the row says what it follows rather than only looking different',
      /after/.test(await room.textContent('.tlrow[data-row="1"] .tlties') || ''))
    await room.evaluate(() => { arr = ARR.moved(arr, 0, 300); render() }); await room.waitForTimeout(250)
    ok('moving the leader carries the follower without it being touched',
      String(await when()) === '300,700,840', `${await when()}`)
    await tieOnto(0, 1)
    ok('a tie that would make a ring is refused rather than quietly ignored',
      await room.evaluate(() => arr.cars[0].after === null)
        && /ring/.test(await room.textContent('#drops') || ''))
    ok('and the refusal leaves the composition exactly as it was',
      String(await when()) === '300,700,840', `${await when()}`)

    /* two arrangements of the same elements, on one clock, which is the wall applied to time */
    await lay(); await room.waitForTimeout(300)
    const shown = () => room.evaluate(() => [...document.querySelectorAll('.grid iframe')]
      .map((f) => decodeURIComponent((f.src.split('at=')[1] || '').split('&')[0])))
    await room.locator('#tlfork').click(); await room.waitForTimeout(700)
    ok('forking puts a second arrangement on screen', (await shown()).length === 2, `${await shown()}`)
    await room.evaluate(() => { arr = ARR.moved(arr, 2, 1800); render() })
    await room.waitForTimeout(400)
    const both = await shown()
    ok('changing one leaves the other alone, which is the whole point of the pair',
      both.length === 2 && both[0] !== both[1] && both[0] === '0,420,840', `${both}`)
    ok('and both are driven by the one scrubber rather than by clocks of their own',
      await room.evaluate(async () => {
        hold(500); await new Promise((r) => setTimeout(r, 400))
        return [...document.querySelectorAll('.grid iframe')].every((f, i) => held.get(i) > 0)
      }))
    ok('film refuses to guess which of them you meant',
      /Keep the one/.test(await room.evaluate(() => filmable().why || '')))
    await room.locator('[data-arr-to="0"]').click(); await room.waitForTimeout(400)
    ok('switching back finds the first exactly as it was left',
      String(await when()) === '0,420,840', `${await when()}`)
    await room.locator('#tlkeep').click(); await room.waitForTimeout(500)
    ok('keeping one drops the rest and leaves a single rail',
      (await shown()).length === 1 && /the rail/.test(await room.evaluate(() => filmable().what || '')))

    /* beats to align to, and the tool saying what its own composition does with its time */
    await lay(); await room.waitForTimeout(300)
    const foot = () => room.textContent('.tlfoot span')
    ok('the strip says what the composition does with its time',
      /3 cars, all landed by/.test(await foot()), (await foot()).trim())
    await room.evaluate(() => { arr = ARR.moved(arr, 2, 3200); render() })
    await room.waitForTimeout(300)
    ok('and names a hole in it, which is a criticism it is in a position to make',
      /then nothing for/.test(await foot()), (await foot()).trim())
    const strip = await room.locator('[data-track="0"]').boundingBox()
    await room.mouse.dblclick(strip.x + strip.width * 0.4, strip.y + strip.height / 2)
    await room.waitForTimeout(300)
    ok('double clicking a track drops a marker',
      (await room.evaluate(() => arr.markers)).length === 1
        && await room.evaluate(() => document.querySelectorAll('.tlmark').length) === 1)
    ok('and a bar will snap onto it, which is the whole reason to place one',
      await room.evaluate(() => ARR.edges(arr, [1], null).some((t) => t.what === 'a marker')))
    await room.locator('.tlmark').first().click(); await room.waitForTimeout(250)
    ok('clicking it takes it away', (await room.evaluate(() => arr.markers)).length === 0)

    /**
     * Two picks off one page, told apart.
     *
     * Reported from real use: a rail of div.flex.flex-row.items-center and
     * div.logoWallMarquee-module-scss-module__4H5q showed "div" and "div" in the selection, and named
     * each row by what its motion was called, which says what the motion does rather than what it
     * does it to. Both rows read the same and nothing on screen said which was which.
     */
    await room.evaluate(async () => {
      await arriving
      const two = ['div.flex.flex-row.items-center', 'div.logoWallMarquee-module-scss-module__4H5q']
      picks = two.map((label) => ({ label, html: '<div></div>', css: '', shot: '', w: 640, h: 80, n: 6 }))
      arr = ARR.fromRail(two.map((label, i) => ({
        id: String(i + 1), note: 'the row settles in place', verb: 'settling,',
        tempo: { span: 420 }, label })))
      zoom = 0; choose([]); rails = []; railN = 0; drawSel(); render()
    })
    await room.waitForTimeout(400)
    const named = await room.evaluate(() =>
      [...document.querySelectorAll('.tlname b')].map((n) => n.textContent))
    const pills = await room.evaluate(() =>
      [...document.querySelectorAll('.pill .who em')].map((n) => n.textContent))
    ok('two picks off one page get two different names in the selection',
      pills.length === 2 && pills[0] !== pills[1], `${pills}`)
    ok('and two different names on the rail, even when their motions are called the same thing',
      named.length === 2 && named[0] !== named[1], `${named}`)
    ok('a css module name drops the file and the hash, which identify nothing to a person',
      /logoWallMarquee/.test(named[1] || '') && !/4H5q/.test(named[1] || ''), `${named[1]}`)
    ok('a row still says what its motion is, under the element it belongs to',
      /settles/.test(await room.evaluate(() =>
        document.querySelector('.tlname u').textContent) || ''))
    ok('and the whole label is kept where it can be read in full',
      /items-center/.test(await room.evaluate(() =>
        document.querySelector('.tlname').getAttribute('title')) || ''))

    /**
     * A component dragged to where it belongs, and the row wearing a picture of it.
     *
     * The rail opened as a stack of equal rows in the order the picks happened, which is not what any
     * of these compositions looks like, and each row named its element instead of showing it although
     * the selection has drawn a thumbnail of every pick since the picker existed.
     *
     * The thumbnails are the reason DRIVEN is narrower than every iframe in the grid: they sit inside
     * the timeline, which is inside the grid, and counting them would post hold to a still picture
     * and shift the index every rail frame is addressed by, since held and ends are keyed by position.
     */
    await room.evaluate(async () => {
      await arriving
      picks = [
        { label: 'div.flex.flex-row.items-center', html: '<div data-p1><b></b></div>',
          css: '[data-p1] b{display:block;width:260px;height:26px;background:#7079ea}', shot: '', w: 260, h: 26 },
        { label: 'div.logoWallMarquee-module-scss-module__4H5q', html: '<div data-p2><b></b></div>',
          css: '[data-p2] b{display:block;width:200px;height:60px;background:#3a8f6f}', shot: '', w: 200, h: 60 },
      ]
      arr = ARR.fromRail([
        { id: '1', note: 'the bar slides in', tempo: { span: 420 }, label: picks[0].label },
        { id: '2', note: 'the marquee drifts', tempo: { span: 420 }, label: picks[1].label }], picks)
      running = false; zoom = 0; choose([]); rails = []; railN = 0; drawSel(); render()
    })
    await room.waitForTimeout(1400)
    /**
     * The stage taking the whole room.
     *
     * The grid it sits in is columns of option cards, and the stage is not one of the cards: it
     * spans them. Everything standing in for the whole view has to say so, and when the frames were
     * wrapped so several arrangements could sit side by side, the wrapper became the grid item and
     * quietly inherited a single 330px column while the timeline under it stayed full width. The
     * rail was a narrow strip beside a lot of nothing, which reads as the preview being broken.
     */
    const wide = await room.evaluate(() => {
      const g = document.getElementById('grid').getBoundingClientRect()
      const a = document.querySelector('.appwrap').getBoundingClientRect()
      const t = document.getElementById('tl').getBoundingClientRect()
      return { grid: g.width, stage: a.width, strip: t.width }
    })
    ok('the stage spans the room rather than sitting in one column of it',
      wide.stage > wide.grid * 0.9, `${Math.round(wide.stage)} of ${Math.round(wide.grid)}`)
    ok('and is the same width as the sequence under it',
      Math.abs(wide.stage - wide.strip) < 2,
      `${Math.round(wide.stage)} against ${Math.round(wide.strip)}`)

    ok('every row wears a picture of the element it belongs to',
      await room.evaluate(() => document.querySelectorAll('.tlface iframe').length) === 2)
    ok('and each picture has the element in it rather than being an empty box',
      String(await room.evaluate(() => [...document.querySelectorAll('.tlface iframe')]
        .map((f) => (f.contentDocument ? f.contentDocument.querySelectorAll('b').length : 0)))) === '1,1')
    ok('the scrubber still drives only the rail, not the thumbnails beside it',
      await room.evaluate(() => document.querySelectorAll(DRIVEN).length) === 1)

    const stageBox = await room.locator('.appwrap iframe').boundingBox()
    const inner = room.frameLocator('.appwrap iframe')
    const timedBefore = await room.evaluate(() => ARR.resolve(arr).at.map(Math.round))
    const handle = await inner.locator('[data-grab="1"]').boundingBox()
    await room.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await room.mouse.down()
    await room.mouse.move(stageBox.x + stageBox.width * 0.6, stageBox.y + stageBox.height * 0.55,
      { steps: 14 })
    await room.mouse.up(); await room.waitForTimeout(800)
    ok('dragging a component on the stage puts it where it was dropped',
      !!(await room.evaluate(() => arr.cars[1].place)),
      `${JSON.stringify(await room.evaluate(() => arr.cars[1].place))}`)
    ok('and leaves the one nobody moved in the stack',
      (await room.evaluate(() => arr.cars[0].place)) === null)
    ok('and does not move it in time, since where and when are different decisions',
      String(await room.evaluate(() => ARR.resolve(arr).at.map(Math.round))) === String(timedBefore))
    await room.evaluate(() => undo()); await room.waitForTimeout(500)
    ok('and undo puts it back in the stack',
      (await room.evaluate(() => arr.cars[1].place)) === null)

    /**
     * One selection, and a clock somebody can put where they want it.
     *
     * The timeline had a selection and the stage had none, so you dragged whatever you happened to
     * grab and the row it belonged to was somewhere else. And the playhead was drawn and read only,
     * which makes it a readout: an editor's whole interaction is to put the clock where something
     * should happen and then do the thing, and that is not available when the only way to move it is
     * a slider in the header, above and away from the rows being aimed at.
     */
    await lay(); await room.waitForTimeout(500)
    await room.evaluate(() => hold(1500)); await room.waitForTimeout(250)
    const stage = room.frameLocator('.appwrap iframe')
    const knob = await stage.locator('[data-grab="2"]').boundingBox()
    await room.mouse.click(knob.x + knob.width / 2, knob.y + knob.height / 2)
    await room.waitForTimeout(450)
    ok('clicking a component on the stage selects its row',
      String(await room.evaluate(() => [...sel])) === '2' && await room.evaluate(() => lead) === 2,
      `${await room.evaluate(() => [...sel])}`)
    ok('and the stage says which one is chosen, since a selection true in one place is not one',
      await stage.locator('.car.chosen').count() === 1)

    const ruled = await room.evaluate(() => ruler())
    const lane = await room.locator('[data-track="0"]').boundingBox()
    await room.mouse.click(lane.x + lane.width * 0.35, lane.y + lane.height / 2)
    await room.waitForTimeout(400)
    const put = await room.evaluate(() => Number(scrub.value))
    ok('the playhead goes where the strip is clicked',
      Math.abs(put - ruled * 0.35) < ruled * 0.05, `${put} of ${Math.round(ruled)}`)
    ok('and putting it somewhere stops the transport rather than fighting it',
      await room.evaluate(() => !running))
    /* a car that never leaves has a life the width of the whole track, so leaving that clickable
       left no empty track to put the playhead on at all */
    ok('a life is a backdrop rather than a target, or there is nowhere left to click',
      await room.evaluate(() =>
        getComputedStyle(document.querySelector('.tllife')).pointerEvents) === 'none')

    /**
     * A camera on a component that has been put somewhere.
     *
     * A rig is absolutely positioned, which is right for a car sharing the stack because that car
     * has a height from the row it fills. A placed car has only what its contents give it, and a rig
     * gives it none, so the camera applied and collapsed the component to nothing. Then the plate
     * kept the fixed width it was sized to for a full width stage, and the component underneath kept
     * the inline width it was captured with, which an override matching only a direct child could
     * not reach through the rig. Three sizes to get wrong and all three read as the camera doing
     * nothing at all.
     */
    await room.evaluate(async () => {
      await arriving
      picks = [1, 2].map((n) => ({ label: `div.card${n}`, html: '<div></div>', css: '', shot: '', w: 0, h: 90 }))
      arr = ARR.fromRail([1, 2].map((n) => ({ id: String(n), note: `card ${n}`,
        tempo: { span: 400 }, label: `div.card${n}` })), picks)
      arr = ARR.placed(ARR.placed(arr, 0, { x: 8, y: 14, w: 40 }), 1, { x: 52, y: 14, w: 40 })
      running = false; zoom = 0; choose([]); rails = []; railN = 0; drawSel(); render()
    })
    await room.waitForTimeout(1200)
    ok('a component on the stage is not labelled with the selector it was picked by',
      await room.frameLocator('.appwrap iframe').locator('.car .tag').count() === 0)

    await room.locator('[data-row="0"]').click(); await room.waitForTimeout(300)
    /* scoped to the inspector, because the same grid of shots is also in the settings menu now and
       the two mean different things: this one aims at the selected car and that one at the frame */
    await room.locator('#cams [data-campick="push"]').click(); await room.waitForTimeout(700)
    await room.evaluate(() => hold(1500)); await room.waitForTimeout(300)
    const rigged = await room.evaluate(() => {
      const f = document.querySelector('.appwrap iframe')
      const car = f.contentDocument.querySelector('[data-rail="0"]')
      const plain = f.contentDocument.querySelector('[data-rail="1"]')
      const box = (el, q) => { const t = q ? el.querySelector(q) : el; if (!t) return null
        const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }
      return { car: box(car), rig: box(car, '.rig'), inner: box(car, '.sharp .in'),
        plain: box(plain) }
    })
    /* measured against the car beside it rather than a number, since how tall a component is depends
       on the component and the one thing that must not happen is it becoming nothing */
    ok('a camera on a placed component leaves it the height it had rather than collapsing it',
      rigged.car.h > 0 && Math.abs(rigged.car.h - rigged.plain.h) <= 2
        && rigged.rig.h === rigged.car.h, `${JSON.stringify(rigged)}`)
    ok('and the component fills the box it was put in rather than the width it was captured at',
      rigged.inner.w > rigged.car.w * 0.8, `${rigged.inner.w} of ${rigged.car.w}`)

    /**
     * Leaving one out of the film without taking it out of the composition.
     *
     * The flag travels as one entry per car rather than by dropping the car from the list, because
     * data-rail is what the stage maps back to a row and a filtered list moves every index after the
     * hidden one. That is the conflation that once handed every car its neighbour's timing.
     */
    const inShot = () => room.evaluate(() => {
      const f = document.querySelector('.appwrap iframe')
      return [...f.contentDocument.querySelectorAll('.car')]
        .map((c) => `${c.dataset.rail}${c.classList.contains('off') ? ':out' : ':in'}`).join(' ')
    })
    ok('every row offers to leave its element out',
      await room.evaluate(() => document.querySelectorAll('[data-eye]').length)
        === await room.evaluate(() => document.querySelectorAll('.tlrow').length))
    const wholeRail = await inShot()
    await room.locator('[data-eye="0"]').click(); await room.waitForTimeout(1200)
    ok('and one left out goes out of the picture', /^0:out/.test(await inShot()), await inShot())
    ok('while every car keeps the index the stage addresses it by',
      (await inShot()).split(' ').map((v) => v.split(':')[0]).join() === '0,1')
    ok('and the row stays, dimmed, with its offset untouched',
      await room.evaluate(() => document.querySelector('.tlrow[data-row="0"]').classList.contains('hush'))
      && await room.evaluate(() => Math.round(ARR.resolve(arr).at[0])) === 0)
    await room.locator('[data-eye="0"]').click(); await room.waitForTimeout(1200)
    ok('and putting it back is the same click', await inShot() === wholeRail, await inShot())

    /* a component arrives wearing whatever its page had, which is often a white box on a dark stage */
    ok('what a component is shown against can be chosen',
      String(await room.evaluate(() =>
        [...document.querySelectorAll('[data-paper]')].map((b) => b.dataset.paper))) === ',light,dark,none')
    await room.locator('[data-paper="dark"]').click(); await room.waitForTimeout(600)
    ok('and choosing one reaches the page rules sitting on the component itself',
      await room.evaluate(() => {
        const f = document.querySelector('.appwrap iframe')
        return getComputedStyle(f.contentDocument.querySelector('[data-rail="0"]')).backgroundColor
      }) === 'rgb(11, 12, 13)')
    ok('and the one nobody chose for keeps the answer its own page gave',
      await room.evaluate(() => arr.cars[1].paper) === '')

    /**
     * Pressing Film, which nothing did until this.
     *
     * Every part of the film path was covered and the path itself was not: holdAt had a suite, the
     * mp4 boxes had a suite that parsed them byte by byte, and no check anywhere had ever clicked
     * the button that puts the two together. The frame loop the studio runs is not even the one
     * raster exports and tests, so the covered code and the shipped code were different code.
     *
     * The span is pinned first because it is measured from whatever the previews last reported, and
     * a frame count that moves on its own cannot be asserted against.
     */
    const filmWith = async (fps, tail) => {
      await room.evaluate(() => { span = 2000 })
      await room.locator('#more').click(); await room.waitForTimeout(200)
      await room.selectOption('#fps', String(fps))
      await room.selectOption('#tail', String(tail))
      await room.keyboard.press('Escape'); await room.waitForTimeout(150)
      await room.locator('#film').click()
      await room.waitForFunction(() => document.getElementById('film').textContent === 'Film',
        null, { timeout: 120000 })
      return room.evaluate(() => (takes.length ? takes[takes.length - 1].facts : ''))
    }
    /* the ruler a rail films at comes from the arrangement rather than from whatever a preview last
       reported, which is what a composition longer than the old twenty second ceiling needs */
    await room.evaluate(() => {
      arr = ARR.moved(arr, 1, 40000); render()
    })
    await room.waitForTimeout(900)
    ok('a rail composed past a minute keeps its own length rather than a ceiling',
      await room.evaluate(() => Math.round(span)) > 20000,
      `${await room.evaluate(() => Math.round(span))}ms`)
    await room.evaluate(() => { arr = ARR.moved(arr, 1, 800); render() })
    await room.waitForTimeout(600)

    /**
     * Filming a stretch of a composition rather than all of it.
     *
     * A rail can run for a minute, and the thirty seconds worth watching are usually somewhere
     * inside it. The frame count is the honest reading here: a film of a stretch is shorter, and a
     * film of the whole thing after taking the cut back is the length it was before.
     */
    ok('a rail with nothing cut says so, and offers no way back from a cut nobody made',
      await room.evaluate(() => ARR.cutOf(arr).whole)
      && await room.evaluate(() => !document.getElementById('tlall')))
    const whole = await filmWith(30, 0)
    /* inside the composition's own length, since a cut past the end is clamped to it: this rail is
       two cars 800ms apart with 400ms motions, so it runs 1200ms and not a millisecond more */
    await room.evaluate(() => { arr = ARR.cutTo(arr, { from: 400, to: 1000 }); render() })
    await room.waitForTimeout(700)
    ok('a cut shows the stretch on the strip and a way back to all of it',
      await room.evaluate(() => !document.getElementById('tlcut').classList.contains('whole'))
      && await room.evaluate(() => !!document.getElementById('tlall')))
    const part = await filmWith(30, 0)
    ok('and the film is of the stretch rather than of the whole thing',
      /^18 frames/.test(part), `${whole} then ${part}`)
    await room.locator('#tlall').click(); await room.waitForTimeout(700)
    ok('and taking it back films all of it again',
      await room.evaluate(() => ARR.cutOf(arr).whole) && await filmWith(30, 0) === whole)

    const cut = await filmWith(30, 0)
    ok('a rail films, in the page, with nothing installed', /^72 frames at 30fps/.test(cut), cut)
    const tailed = await filmWith(30, 1600)
    ok('and a tail holds the last instant rather than lengthening the motion',
      /^120 frames at 30fps/.test(tailed), tailed)
    ok('while sixty a second is twice the frames of the same film',
      /^144 frames at 60fps/.test(await filmWith(60, 0)))

    /* the way out of a long one. Filming is the only thing here that can run for a minute, and a
       button that says Film while refusing to do anything is a button that looks broken */
    await room.evaluate(() => { span = 20000 })
    await room.locator('#more').click(); await room.waitForTimeout(200)
    await room.selectOption('#shape', 'hd'); await room.selectOption('#fps', '60')
    await room.keyboard.press('Escape'); await room.waitForTimeout(150)
    const reels = await room.evaluate(() => takes.length)
    await room.locator('#film').click(); await room.waitForTimeout(400)
    ok('a film in progress offers the way out on the button that started it',
      await room.evaluate(() => document.getElementById('film').textContent) === 'Stop')
    await room.locator('#film').click()
    await room.waitForFunction(() => document.getElementById('film').textContent === 'Film',
      null, { timeout: 60000 })
    ok('and stopping says so rather than failing',
      /Stopped/.test(await room.evaluate(() => document.getElementById('drops').textContent)))
    ok('and keeps nothing, since half a film is not a take',
      await room.evaluate(() => takes.length) === reels)

    /**
     * Saying what it should do, which is the one thing a deck cannot be asked for.
     *
     * The motion itself needs a model, so what is checked here is the half that does not: that the
     * field is the last card and not an option, that what was typed is what gets sent, and that a
     * refusal comes back as a reason next to a field still holding the sentence that earned it. The
     * answer is stubbed at the route, because a suite inside verify:all has no key and no network.
     */
    let inWords = null
    let refuse = true
    await room.route('**/__wall/described', async (route) => {
      inWords = JSON.parse(route.request().postData() || '{}').words
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(refuse ? { why: 'it never comes back to where it started' }
          : { id: '2', verb: inWords, scope: 'data-m2', note: 'what was asked for', css: '',
            tempo: { span: 500 } }) })
    })
    await room.evaluate(() => {
      arr = null; opened = null; file = 'card.tsx'
      opts = [{ id: '1', note: 'one', verb: 'rising,', scope: 'data-m1', css: '', tempo: { span: 400 } }]
      render()
    })
    await room.waitForTimeout(600)
    ok('the options end with a field for saying what it should do instead',
      await room.evaluate(() => {
        const all = [...document.querySelectorAll('.grid figure')]
        return all.length === 2 && all[all.length - 1].classList.contains('saycard')
      }))
    ok('and the field is not one of the options, so clicking it chooses nothing',
      await room.evaluate(() => {
        chosenOpt = '1'
        document.getElementById('saywhat').click()
        return chosenOpt
      }) === '1')
    const sentence = 'the rows deal in from the left, the top one first'
    await room.fill('#saywhat', sentence)
    await room.press('#saywhat', 'Enter')
    await room.waitForTimeout(500)
    ok('what was typed is what gets asked for', inWords === sentence, String(inWords))
    ok('a motion the gates turn down says why rather than failing quietly',
      /never comes back/.test(await room.evaluate(() => document.getElementById('saynote').textContent)))
    ok('and the sentence stays in the field, since a near miss is the thing worth editing',
      await room.inputValue('#saywhat') === sentence)
    refuse = false
    await room.press('#saywhat', 'Enter')
    await room.waitForTimeout(600)
    ok('and one that passes joins the row as another option',
      await room.evaluate(() => opts.length) === 2 && await room.evaluate(() => chosenOpt) === '2')
    await room.unroute('**/__wall/described')

    /**
     * Changing one of them, which is a different question from asking for another.
     *
     * The thing worth checking beyond the wiring is where the new card lands. A change that appends
     * to the end of the row makes you hunt for what your sentence did, and one that overwrites the
     * card makes the motion you were comparing against gone. It goes in next to the one it came
     * from, and the one it came from stays.
     */
    let penWords = null
    let penRefuse = true
    await room.route('**/__wall/changed', async (route) => {
      penWords = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(penRefuse ? { why: 'it never comes back to where it started' }
          : { id: '9', verb: penWords.words, scope: 'data-m1', note: 'the same one, slower',
            css: '', tempo: { span: 900 } }) })
    })
    await room.evaluate(() => {
      opts = [1, 2, 3].map((n) => ({ id: String(n), note: `option ${n}`, verb: 'rising,',
        scope: `data-m${n}`, css: '', tempo: { span: 400 } }))
      editing = null; render()
    })
    await room.waitForTimeout(400)
    ok('every result carries a pen, and none of them is open until it is asked for',
      await room.evaluate(() => document.querySelectorAll('[data-pen]').length) === 3
      && await room.evaluate(() => document.querySelectorAll('[data-penfor]').length) === 0)
    await room.locator('[data-pen="2"]').click(); await room.waitForTimeout(300)
    ok('the pen opens a field in the card it belongs to and puts the cursor in it',
      await room.evaluate(() => {
        const all = [...document.querySelectorAll('[data-penfor]')]
        return all.length === 1 && all[0].dataset.penfor === '2'
          && document.activeElement === all[0]
      }))
    await room.locator('[data-penfor="2"]').press('Escape'); await room.waitForTimeout(250)
    ok('and escape leaves it alone, since opening the field agreed to nothing',
      await room.evaluate(() => document.querySelectorAll('[data-penfor]').length) === 0
      && await room.evaluate(() => opts.length) === 3)
    await room.locator('[data-pen="2"]').click(); await room.waitForTimeout(250)
    const change = 'slower, and starting from the right'
    await room.fill('[data-penfor="2"]', change)
    await room.locator('[data-penfor="2"]').press('Enter'); await room.waitForTimeout(500)
    ok('it asks about the card it was opened on, in the words that were typed',
      penWords && penWords.id === '2' && penWords.words === change, JSON.stringify(penWords))
    ok('a change the gates turn down says why and keeps the sentence',
      /never comes back/.test(await room.evaluate(() =>
        document.querySelector('[data-pennote="2"]').textContent))
      && await room.inputValue('[data-penfor="2"]') === change)
    penRefuse = false
    await room.locator('[data-penfor="2"]').press('Enter'); await room.waitForTimeout(600)
    ok('and one that lands sits next to the card it came from rather than at the end',
      await room.evaluate(() => opts.map((o) => o.id).join(',')) === '1,2,9,3',
      await room.evaluate(() => opts.map((o) => o.id).join(',')))
    ok('with the card it came from still there, since a motion you cannot get back is one nobody edits twice',
      await room.evaluate(() => opts.filter((o) => o.id === '2').length) === 1)
    ok('and the field closed behind it', await room.evaluate(() =>
      document.querySelectorAll('[data-penfor]').length) === 0)
    await room.unroute('**/__wall/changed')

    /**
     * The shot belongs to the element, not to the room.
     *
     * It was one value for everything on screen. Choosing an orbit for one element and then picking
     * another gave the second an orbit nobody asked it for, and it followed you between sites. The
     * reading that matters is the preview's own url, since that is what actually gets rendered.
     */
    const shotIn = () => room.evaluate(() => {
      const f = document.querySelector('.grid figure iframe')
      return f ? new URL(f.src, location.href).searchParams.get('camera') : null
    })
    const aimAtPick = (n) => room.evaluate((k) => {
      chosen = picks[k]
      opts = [{ id: String(k + 1), note: `for ${k}`, verb: 'x', scope: `data-m${k + 1}`, css: '', tempo: { span: 400 } }]
      editing = null; render()
    }, n)
    await room.evaluate(() => {
      arr = null; file = null
      picks = [{ label: 'div.alpha', html: '<div></div>', css: '', shot: '', w: 280, h: 90 },
        { label: 'div.beta', html: '<div></div>', css: '', shot: '', w: 280, h: 90 }]
      drawSel()
    })
    await aimAtPick(0); await room.waitForTimeout(400)
    ok('an element with no shot chosen for it is previewed without one', await shotIn() === null)
    /* through the grid rather than by assignment, because the question is whether the control writes
       to the element it is aimed at */
    await room.evaluate(() => shut()); await room.locator('#more').click()
    await room.waitForTimeout(250)
    await room.locator('#camgrid [data-campick="orbit"]').click(); await room.waitForTimeout(400)
    ok('choosing one puts it on the element being looked at', await shotIn() === 'orbit')
    await aimAtPick(1); await room.waitForTimeout(400)
    ok('and the next element does not inherit it', await shotIn() === null)
    await room.evaluate(() => shut()); await room.locator('#more').click()
    await room.waitForTimeout(250)
    ok('with the grid showing that one has none of its own',
      await room.evaluate(() => [...document.querySelectorAll('#camgrid .camchip.on')]
        .map((c) => c.dataset.campick).join()) === '')
    await room.locator('#camgrid [data-campick="crane"]').click(); await room.waitForTimeout(400)
    await aimAtPick(0); await room.waitForTimeout(400)
    ok('and going back finds the first one still wearing its own', await shotIn() === 'orbit')
    await room.evaluate(() => shut()); await room.locator('#more').click()
    await room.waitForTimeout(250)
    ok('which is what the grid marks when it opens on it',
      await room.evaluate(() => [...document.querySelectorAll('#camgrid .camchip.on')]
        .map((c) => c.dataset.campick).join()) === 'orbit')
    await room.evaluate(() => shut())

    /**
     * Choosing, before composing.
     *
     * One element got the whole room: several motions side by side, open one bigger, ask for more
     * like it, keep the one that lands. Several elements skipped all of it and went straight to a
     * rail carrying whichever motion happened to be judged best for each, so the moment a
     * composition had two things in it the tool stopped doing the one thing it exists for.
     */
    await room.evaluate(async () => {
      await arriving
      picks = [1, 2].map((n) => ({ label: `div.card${n}.flex`, html: `<div data-p${n}></div>`,
        css: `[data-p${n}]{display:block;width:200px;height:60px;background:#556}`, shot: '', w: 200, h: 60 }))
      arr = ARR.fromRail([
        { id: '1', note: 'rises', verb: 'rising,', tempo: { span: 400 }, label: picks[0].label,
          alts: [{ id: '1', note: 'rises', tempo: { span: 400 } },
            { id: '2', note: 'unfolds', tempo: { span: 500 } }] },
        { id: '3', note: 'deals', verb: 'dealing,', tempo: { span: 600 }, label: picks[1].label,
          alts: [{ id: '3', note: 'deals', tempo: { span: 600 } },
            { id: '4', note: 'slides', tempo: { span: 700 } }] }], picks)
      stage = 'choosing'; subjectN = 0; zoom = 0; choose([]); rails = []; railN = 0; drawSel(); render()
    })
    await room.waitForTimeout(1200)
    ok('a rail of several elements offers each of them its motions to choose between',
      await room.evaluate(() => document.querySelectorAll('.chgrid figure').length) === 2
        && String(await room.evaluate(() =>
          [...document.querySelectorAll('.chgrid figcaption b')].map((e) => e.textContent))) === 'rises,unfolds')
    ok('and says which element is being chosen for, with the others one press away',
      await room.evaluate(() => document.querySelectorAll('.chtab').length) === 2)
    ok('the one it is playing is marked, so choosing again is visibly a change',
      await room.evaluate(() => document.querySelectorAll('.chgrid figure.chosen').length) === 1)
    await room.locator('[data-pick-alt="1"]').click(); await room.waitForTimeout(500)
    ok('keeping one is what that element then plays',
      await room.evaluate(() => arr.cars[0].motion.note) === 'unfolds')
    /* a card three hundred pixels wide is a thumbnail of a decision rather than the decision, which
       is as true of one of several elements as it was of the only one */
    const tall = () => room.evaluate(() => {
      const f = document.querySelector('.chgrid figure.up iframe')
        || document.querySelector('.chgrid figure iframe')
      return f ? Math.round(f.getBoundingClientRect().height) : 0
    })
    const small = await tall()
    await room.locator('[data-open-alt="2"]').click(); await room.waitForTimeout(700)
    /* against the window rather than a ratio, since what filling the room means depends on the room */
    const big = await tall()
    ok('a card in the chooser opens to fill the room, the way one option always has',
      big > small && big > await room.evaluate(() => innerHeight) * 0.5,
      `${small} then ${big} in a ${await room.evaluate(() => innerHeight)} window`)
    ok('and it is the card that was pressed',
      await room.evaluate(() =>
        document.querySelector('.chgrid figure.up figcaption b').textContent) === 'unfolds')
    ok('with only what is on screen being driven',
      await room.evaluate(() =>
        [...document.querySelectorAll(DRIVEN)].filter((f) => f.offsetParent !== null).length) === 1)

    await room.locator('[data-subject="1"]').click(); await room.waitForTimeout(700)
    /* an opened card belonging to the element you were on a moment ago would otherwise leave the
       grid in its one card view with no card to show */
    ok('and moving to another element does not leave an empty room behind',
      await room.evaluate(() => document.querySelectorAll('.chgrid figure').length) === 2
        && await room.evaluate(() => opened) === null)
    ok('and the next element brings its own motions rather than the first one\'s',
      String(await room.evaluate(() =>
        [...document.querySelectorAll('.chgrid figcaption b')].map((e) => e.textContent))) === 'deals,slides')
    await room.locator('#chmake').click(); await room.waitForTimeout(900)
    ok('making a film takes the whole set to the timeline with what was chosen',
      await room.evaluate(() => document.querySelectorAll('.tlrow').length) === 2
        && String(await room.evaluate(() => arr.cars.map((c) => c.motion.note))) === 'unfolds,deals')
    await room.locator('#tlback').click(); await room.waitForTimeout(700)
    /* the pill is the element, and it was inert except for its own remove button, so the sidebar
       could name what you had picked and do nothing whatever about it */
    await room.evaluate(() => { stage = null; render(); drawSel() })
    await room.waitForTimeout(600)
    await room.locator('.pill[data-pick="1"]').click(); await room.waitForTimeout(800)
    ok('clicking a pick in the sidebar opens that element\'s motions, from the timeline',
      await room.evaluate(() => stage) === 'choosing'
        && String(await room.evaluate(() =>
          [...document.querySelectorAll('.chgrid figcaption b')].map((e) => e.textContent))) === 'deals,slides')
    ok('and the sidebar marks the one being chosen for, so it and the room agree',
      String(await room.evaluate(() =>
        [...document.querySelectorAll('.pill')].map((x) => x.classList.contains('on')))) === 'false,true')
    await room.evaluate(() => { stage = 'choosing'; subjectN = 0; render(); drawSel() })
    await room.waitForTimeout(500)
    ok('and going back to choose again loses nothing, since both are the same arrangement',
      await room.evaluate(() => stage) === 'choosing'
        && await room.evaluate(() => arr.cars[0].motion.note) === 'unfolds')

    /* last, because taking a pick out of the selection ends the arrangement that was built from it,
       which is right and leaves nothing for the checks above to read */
    const had = await room.evaluate(() => picks.length)
    await room.locator('.pill[data-pick="1"] [data-drop]').click(); await room.waitForTimeout(500)
    ok('while its remove button still removes rather than navigating',
      await room.evaluate(() => picks.length) === had - 1
        && await room.evaluate(() => arr) === null)

    /**
     * Picking from a page the studio cannot proxy.
     *
     * An application behind a sign in calls its own api on another host, which is a cross origin
     * request the moment it runs on this origin, so it is refused and never gets past its loading
     * screen. Nothing can fix that here, because the session belongs to a domain this is not. So the
     * picker goes to the real page instead and the capture comes back on the clipboard, which is the
     * one road out that a content security policy does not govern.
     *
     * The same picker, so a capture that arrives this way is the one the message handler already
     * knows. Checked against a page served with no studio anywhere near it.
     */
    const away = await seat.newContext({ viewport: { width: 1200, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'] })
    const shelf = await away.newPage()
    await shelf.goto(`http://localhost:${XPORT}/__wall/bookmarklet`, { waitUntil: 'load' })
    const code = decodeURIComponent((await shelf.getAttribute('a.bm', 'href')).replace(/^javascript:/, ''))
    ok('the picker travels whole in the bookmarklet, since a strict site will not fetch it',
      code.length > 8000 && code.includes('wall-capture'), `${Math.round(code.length / 1024)}kb`)

    const theirs = await away.newPage()
    const sheet = '<!doctype html><html><body style="margin:0;font:16px system-ui">'
      + '<div id="a" style="width:300px;margin:20px;padding:16px;border:1px solid #ccc">'
      + '<h2 style="margin:0">One</h2><span>x</span><span>y</span></div>'
      + '<div id="b" style="width:300px;margin:20px;padding:16px;border:1px solid #ccc">'
      + '<h2 style="margin:0">Two</h2><span>p</span><span>q</span></div></body></html>'
    await theirs.setContent(sheet)
    await theirs.waitForTimeout(300)
    await theirs.evaluate(code); await theirs.waitForTimeout(300)
    ok('and arms itself, since being run at all is the asking',
      await theirs.evaluate(() => document.documentElement.style.cursor) === 'crosshair')

    const inbox = await away.newPage()
    await inbox.goto(`http://localhost:${XPORT}`, { waitUntil: 'load' })
    await inbox.waitForTimeout(1400)
    const already = await inbox.evaluate(() => picks.length)
    for (const id of ['#a', '#b']) {
      const at = await theirs.locator(id).boundingBox()
      await theirs.mouse.click(at.x + 12, at.y + 10); await theirs.waitForTimeout(500)
    }
    ok('a page whose policy allows it hands the capture straight over',
      /2 elements sent/.test(await theirs.evaluate(() => {
        const t = document.getElementById('wall-said'); return t ? t.textContent : '' })))
    await inbox.waitForTimeout(1600)
    ok('and it arrives in the studio with nothing to paste',
      await inbox.evaluate(() => picks.length) === already + 2,
      `${already} then ${await inbox.evaluate(() => picks.length)}`)
    ok('carrying the markup and the rules that matched, so nothing needs the page still open',
      await inbox.evaluate(() => !!picks[picks.length - 1].html && picks[picks.length - 1].w > 0))
    await theirs.keyboard.press('Escape'); await theirs.waitForTimeout(250)
    ok('and escape gives the page back rather than needing a reload',
      await theirs.evaluate(() => document.documentElement.style.cursor) === '')

    /**
     * The clipboard, which is the road that always works.
     *
     * A site whose policy forbids reaching localhost cannot hand anything over, and that is the case
     * this was built for. Forced here by pointing the picker at a door nobody is behind, which is
     * the same refusal from the picker's side as a policy blocking it.
     */
    const shut = await away.newPage()
    await shut.setContent(sheet); await shut.waitForTimeout(200)
    await shut.evaluate(code.replace(`http://localhost:${XPORT}`, 'http://localhost:1'))
    await shut.waitForTimeout(300)
    const one = await shut.locator('#a').boundingBox()
    await shut.mouse.click(one.x + 12, one.y + 10); await shut.waitForTimeout(1500)
    ok('and falls back to the clipboard when it cannot',
      /1 element copied/.test(await shut.evaluate(() => {
        const t = document.getElementById('wall-said'); return t ? t.textContent : '' })))

    const carried = await inbox.evaluate(() => navigator.clipboard.readText())
    const paste = (text) => inbox.evaluate((t) => {
      const dt = new DataTransfer(); dt.setData('text', t)
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, text)
    const wasAt = await inbox.evaluate(() => picks.length)
    await paste(carried); await inbox.waitForTimeout(800)
    ok('which pastes into the studio as the same pick',
      await inbox.evaluate(() => picks.length) === wasAt + 1,
      `${wasAt} then ${await inbox.evaluate(() => picks.length)}`)
    const kept = await inbox.evaluate(() => picks.length)
    await paste('just some text somebody copied'); await inbox.waitForTimeout(300)
    ok('while anything else on the clipboard is left alone',
      await inbox.evaluate(() => picks.length) === kept)
    await inbox.evaluate(() => undo()); await inbox.waitForTimeout(300)
    ok('and one undo takes a whole arrival back',
      await inbox.evaluate(() => picks.length) === kept - 1)
    await away.close()

    /**
     * What there is to write motion for, which is not where the studio is aimed.
     *
     * The guards on that button were written when a pick could only come from an app the studio was
     * proxying, so asking whether one was aimed at answered it. A capture picked on a page the
     * studio can never reach arrives without any of that, and the button then refused with pick a
     * component first while holding two of them and offering to give them motion.
     */
    const asked = await seat.newContext({ viewport: { width: 1200, height: 800 } })
    const gate = async (how) => {
      const one = await asked.newPage()
      const sent = []
      const alerts = []
      one.on('dialog', async (d) => { alerts.push(d.message()); await d.dismiss() })
      await one.route('**/__wall/rail', (r) => { sent.push(['rail', r.request().postDataJSON()]); r.abort() })
      await one.route('**/__wall/motion', (r) => { sent.push(['motion', r.request().postDataJSON()]); r.abort() })
      await one.goto(`http://localhost:${XPORT}`, { waitUntil: 'load' })
      await one.waitForTimeout(1300)
      await one.evaluate(() => { picks = []; arr = null; opts = []; file = null; drawSel(); render() })
      await how(one)
      await one.click('#ask'); await one.waitForTimeout(1000)
      const got = { which: sent.length ? sent[0][0] : 'none', body: sent.length ? sent[0][1] : null,
        said: alerts[0] || '' }
      await one.close()
      return got
    }
    const pasteIn = (n) => async (one) => one.evaluate((k) => {
      const some = [{ html: '<div data-p1><b>x</b></div>', css: '', shot: '', label: 'div.a', w: 240, h: 80, n: 2 },
        { html: '<div data-p2><b>y</b></div>', css: '', shot: '', label: 'div.b', w: 240, h: 80, n: 2 }].slice(0, k)
      const dt = new DataTransfer()
      dt.setData('text', JSON.stringify({ wall: 'wall-capture', v: 1, picks: some }))
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, n)

    const two = await gate(pasteIn(2))
    ok('several picks make a rail however they arrived, with nothing aimed at',
      two.which === 'rail' && two.body.picks.length === 2, `${two.which} ${two.said}`)
    const solo = await gate(pasteIn(1))
    ok('and one pick is asked about as itself rather than as a file that is not there',
      solo.which === 'motion' && !!solo.body.html, `${solo.which} ${JSON.stringify(solo.body)}`)
    const none = await gate(async () => {})
    ok('with nothing at all it says so, and says both ways of getting something',
      none.which === 'none' && /paste it in/.test(none.said), `${none.said.slice(0, 60)}`)
    await asked.close()

    /**
     * The stylesheets a page will not let the picker read, fetched from the one side that can.
     *
     * A sheet served from another origin without cors cannot be read by a script on the page, and on
     * a real app that is nearly always its typefaces: three of them on the one this was built
     * against, so a component lifted off it came back in whatever the fallback happened to be. The
     * studio has no origin to be refused by, so it fetches them itself.
     */
    /* served rather than intercepted, because the studio fetches it from its own side where nothing
       in the browser can stand in the way, which is the entire point of doing it there */
    const SHEET = Number(process.env.WALL_SHEET_PORT || 4372)
    const stall = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/css' })
      r.end('@font-face{font-family:Ghost;src:local("Georgia")}:root{--said:#c0ffee}p{color:red}') })
    await new Promise((r) => stall.listen(SHEET, r))
    const mending = await seat.newContext({ viewport: { width: 1100, height: 760 } })
    const faced = await mending.newPage()
    await faced.goto(`http://localhost:${XPORT}`, { waitUntil: 'load' })
    await faced.waitForTimeout(1200)
    const hadPicks = await faced.evaluate(() => picks.length)
    await faced.evaluate((where) => {
      const dt = new DataTransfer()
      dt.setData('text', JSON.stringify({ wall: 'wall-capture', v: 1, picks: [{
        html: '<div data-q><b>x</b></div>', css: '[data-q]{display:block}', shot: '',
        label: 'div.q', w: 200, h: 60, n: 2, opaque: 1, shut: [where] }] }))
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, `http://localhost:${SHEET}/hidden.css`)
    await faced.waitForTimeout(2500)
    const mended = await faced.evaluate(() => picks[picks.length - 1].css)
    ok('a stylesheet the page refused is fetched by the studio and put back',
      /@font-face/.test(mended) && /Ghost/.test(mended), `${mended.slice(0, 50)}`)
    ok('with the page level parts kept and the rest left where it was',
      /--said/.test(mended) && !/color:red/.test(mended))
    ok('and the capture it belongs to is still the one that arrived',
      await faced.evaluate(() => picks.length) === hadPicks + 1
        && /data-q/.test(await faced.evaluate(() => picks[picks.length - 1].html)))
    await mending.close()
    stall.close()

    ok('the timeline drives without complaint', said.length === 0, said.join('; ').slice(0, 60))

    /**
     * The studio restarting under a page that is already open.
     *
     * npm run studio watches its own sources, so an edit bounces the process in about half a second
     * while the tab carries on with the javascript it loaded. A dynamic import is cached for the life
     * of a document, so a change to arrange or raster is not in that tab at all and the studio and
     * the page disagree with nothing saying so. That is how a fix can land, be checked, and still not
     * be what somebody is looking at.
     *
     * So the page reloads when the boot answering it changes, which is only bearable because the work
     * is left with the server first. Both halves are checked here, in that order.
     */
    const held = () => room.evaluate(() => ({
      picks: picks.length,
      at: arr ? ARR.resolve(arr).at.map(Math.round) : null,
      place: arr ? arr.cars.map((c) => (c.place ? Math.round(c.place.x) : -1)) : null,
    }))
    await room.evaluate(async () => {
      await arriving
      picks = [1, 2, 3].map((n) => ({ label: `div.card${n}`, html: '<div></div>', css: '', shot: '', w: 520, h: 110 }))
      arr = ARR.fromRail([1, 2, 3].map((n) => ({
        id: String(n), note: `card ${n}`, tempo: { span: 400 }, label: `div.card${n}` })), picks)
      arr = ARR.placed(ARR.moved(ARR.moved(arr, 1, 800), 2, 1600), 2, { x: 20, y: 60, w: 45 })
      zoom = 0; choose([]); rails = []; railN = 0; drawSel(); render()
    })
    await room.waitForTimeout(1500)
    const wasThere = await held()
    /* the films shot earlier in this leg are still in the reel, and the point of the store is that
       this reload does not take them: a blob url dies with the document, and the studio does this to
       itself on every save while somebody is working on it */
    const filmsBefore = await room.evaluate(() => takes.map((t) => t.facts))
    await room.reload({ waitUntil: 'load' })
    await room.waitForTimeout(2200)
    const cameBack = await held()
    ok('a composition survives the page being reloaded under it',
      JSON.stringify(cameBack) === JSON.stringify(wasThere),
      `${JSON.stringify(wasThere)} then ${JSON.stringify(cameBack)}`)
    const filmsAfter = await room.evaluate(() => takes.map((t) => t.facts))
    ok('and so do the films, which a blob url alone would not',
      filmsBefore.length > 0 && JSON.stringify(filmsAfter) === JSON.stringify(filmsBefore),
      `${filmsBefore.length} before, ${filmsAfter.length} after`)
    ok('and each is still bytes a player would take, rather than a url with nothing behind it',
      await room.evaluate(async () => {
        if (!takes.length) return false
        const got = await fetch(takes[0].url).then((r) => r.blob())
        return got.type === 'video/mp4' && got.size > 1000
      }))

    // the studio bounced exactly the way an edit bounces it
    for (const pid of spawnSync('lsof', ['-ti', `tcp:${XPORT}`], { encoding: 'utf8' })
      .stdout.split('\n').filter(Boolean).filter((v) => v !== String(process.pid))) {
      try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ }
    }
    const again = spawn('node', [resolve('tools/studio.mjs'), resolve('examples/components')],
      { cwd: bed, env: { ...process.env, WALL_PORT: String(XPORT), WALL_NO_OPEN: '1' }, stdio: 'ignore' })
    process.on('exit', () => { try { again.kill('SIGKILL') } catch { /* gone */ } })
    await room.waitForTimeout(9000)
    const afterBounce = await held()
    ok('and the page reloads itself when a different studio starts answering it',
      JSON.stringify(afterBounce) === JSON.stringify(wasThere),
      `${JSON.stringify(afterBounce)}`)
    try { again.kill('SIGKILL') } catch { /* gone */ }
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
