/**
 * Every direction shown on the fixtures it will actually be pasted onto, in both modes.
 *
 *   node tools/direction.mjs
 *
 * A theme cannot be judged as a list of hex values and it cannot be judged as a swatch strip
 * either, because a swatch shows you a colour and the question is what happens when that colour is
 * a button label sitting on a fill next to a muted caption. So each direction is rendered onto the
 * same small board of real parts: a heading, body text, the two buttons, a card, a destructive
 * action, an input, a badge and a five series chart. The board is identical for every direction,
 * which is what makes the comparison about the direction.
 *
 * Both modes, side by side, because a theme that ships one mode is half a theme and the dark half
 * is where the unreadable pairs hide.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import {
  DIRECTIONS, PRESETS, themeOf, themeCss, unreadable, tasteOf,
} from '../dist-core/core.js'

const out = 'directions'
if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(out, { recursive: true })

/** the parts, written once and worn by every direction */
const FIXTURES = `
<div class="board">
  <div class="row">
    <h1>Seventeen kept</h1>
    <span class="badge">in the run</span>
  </div>
  <p class="body">Every bag carries the roast curve it came off, the drop temperature and the
  development time, and the three people who scored it.</p>
  <p class="muted">Registration closes on the ninth of May. Sixty of two hundred taken.</p>
  <div class="row">
    <button class="primary">Register interest</button>
    <button class="secondary">Read the specification</button>
    <button class="destructive">Cancel the run</button>
  </div>
  <div class="card">
    <div class="row tight"><strong>Field notes</strong><span class="muted small">no. 014</span></div>
    <p class="muted small">A card sits a step off the ground, and its text has to hold on that step
    rather than on the page behind it.</p>
    <input value="7042 9931 0087" readonly>
  </div>
  <div class="chart">
    <i style="height:38%"></i><i style="height:64%"></i><i style="height:47%"></i>
    <i style="height:88%"></i><i style="height:29%"></i>
  </div>
</div>`

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-size:14px;line-height:1.55;font-family:var(--body)}
.pane{background:var(--background);color:var(--foreground);padding:calc(var(--gap) * 1.7) 24px}
.board{display:grid;gap:var(--gap);max-width:460px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.row.tight{justify-content:space-between;gap:6px}
h1{font-family:var(--display);font-weight:var(--weight);font-size:var(--h1);line-height:1.1;
  margin:0;letter-spacing:-.015em;text-transform:var(--caps)}
p{margin:0}
.body{font-size:14px}
.muted{color:var(--muted-foreground)}
.small{font-size:12px}
.badge{background:var(--accent);color:var(--accent-foreground);border-radius:999px;
  padding:3px 10px;font-size:11px;letter-spacing:.04em;text-transform:none}
button{border:0;border-radius:var(--radius,.5rem);padding:9px 15px;font-family:var(--body);
  font-size:13px;cursor:pointer;text-transform:var(--caps)}
.primary{background:var(--primary);color:var(--primary-foreground)}
.secondary{background:var(--secondary);color:var(--secondary-foreground)}
.destructive{background:var(--destructive);color:var(--destructive-foreground)}
.card{background:var(--card);color:var(--card-foreground);border:1px solid var(--border);
  border-radius:var(--radius,.5rem);padding:14px;display:grid;gap:9px}
input{width:100%;background:var(--background);color:var(--foreground);border:1px solid var(--input);
  border-radius:calc(var(--radius,.5rem) - 2px);padding:8px 10px;font:inherit;font-size:13px}
input:focus{outline:2px solid var(--ring);outline-offset:1px}
.chart{display:flex;gap:7px;align-items:flex-end;height:74px}
.chart i{flex:1;border-radius:3px 3px 0 0}
.chart i:nth-child(1){background:var(--chart-1)}.chart i:nth-child(2){background:var(--chart-2)}
.chart i:nth-child(3){background:var(--chart-3)}.chart i:nth-child(4){background:var(--chart-4)}
.chart i:nth-child(5){background:var(--chart-5)}
.pair{display:grid;grid-template-columns:1fr 1fr}`

/**
 * Both modes on one board, which costs nothing because of how the css is shaped.
 *
 * themeCss emits the counterpart under .dark, so a pane carrying that class is already wearing the
 * other mode: the same fixtures, the same markup, and the only difference between the two halves is
 * which set of tokens is in scope. That is also the honest way to show it, since it is exactly what
 * happens in the app it gets pasted into.
 */
const form = (t) => `:root{--display:${t.display};--body:${t.body};--weight:${t.weight};
  --h1:${(18 * t.scale ** 1.6).toFixed(1)}px;--gap:${(22 - t.density * 14).toFixed(1)}px;
  --caps:${t.caps ? 'uppercase' : 'none'}}`

const page = (theme, t) => `<html><head><style>${themeCss(theme)}${form(t)}${CSS}</style></head>
<body><div class="pair"><div class="pane">${FIXTURES}</div>
<div class="pane dark" style="color-scheme:dark">${FIXTURES}</div></div></body></html>`

const looks = [
  ...PRESETS.map((p) => ({ from: 'look', name: p.name, taste: p })),
  ...DIRECTIONS.filter((d) => d.look).map((d) => ({ from: 'ground', name: d.name, taste: tasteOf(d.look, d.name) })),
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 2 })
const tab = await ctx.newPage()
const rows = []

for (const l of looks) {
  const theme = themeOf(l.taste)
  const faults = unreadable(theme)
  const slug = `${l.from}-${l.name.replace(/\W+/g, '-')}`
  await tab.setContent(page(theme, l.taste), { waitUntil: 'load' })
  await tab.waitForTimeout(120)
  await tab.screenshot({ path: path.join(out, `${slug}.png`), fullPage: true }).catch(() => {})
  writeFileSync(path.join(out, `${slug}.css`), themeCss(theme))
  rows.push({ ...l, slug, faults })
  console.log(`  ${(l.from + ' ' + l.name).padEnd(28)} ${faults.length ? faults[0] : 'reads in both modes'}`)
}
await browser.close()

const cells = rows.map((r) =>
  `<figure><img src="${r.slug}.png"><figcaption>${r.from} · ${r.name}${r.faults.length ? ' · ' + r.faults.length + ' faults' : ''}</figcaption></figure>`).join('')
writeFileSync(path.join(out, 'sheet.html'), `<html><body style="margin:0;background:#101010;font:11px ui-monospace,monospace;color:#8a8a8a">
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding:16px">${cells}</div>
<style>figure{margin:0}img{width:100%;display:block;border-radius:4px}
figcaption{padding:6px 2px;text-align:center}</style></body></html>`)

console.log(`\n  ${rows.length} directions, ${rows.filter((r) => !r.faults.length).length} reading in both modes`)
console.log(`  ${path.resolve(out, 'sheet.html')}\n`)
if (process.env.WALL_NO_OPEN) console.log('  not opening it: WALL_NO_OPEN is set\n')
else {
  console.log('  opening it now\n')
  const sheet = path.resolve(out, 'sheet.html')
  const [cmd, args] = process.platform === 'darwin' ? ['open', [sheet]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', sheet]] : ['xdg-open', [sheet]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}
