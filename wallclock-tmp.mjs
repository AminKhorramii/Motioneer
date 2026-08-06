/**
 * How long a whole wall takes, from the brief to the last page, through the real app.
 *
 * Every other measurement here has been of one call. This drives the browser the way a person
 * does and watches the pages land, because the number that matters is the one someone waits.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const server = spawn('node', ['/Users/developer/Documents/code/side/wall/server/index.mjs'], {
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
})
const url = await new Promise((resolve) => {
  let out = ''
  server.stdout.on('data', (d) => {
    out += d
    const m = out.match(/http:\/\/localhost:\d+/)
    if (m) resolve(m[0])
  })
})

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(url)
await page.evaluate(() => localStorage.setItem('wall-model', 'claude-code'))
await page.reload()

// straight past the picker with the local Claude chosen, then the brief
await page.waitForSelector('.onboard', { timeout: 20000 })
await page.evaluate(() => {
  document.querySelector('.onboard .picks button[aria-label="Claude Code"]')?.click()
})
await page.waitForTimeout(300)
await page.evaluate(() => document.querySelector('.onboard .primary')?.click())
await page.waitForSelector('.onboard .tell', { timeout: 20000 })
await page.evaluate(() => {
  const box = document.querySelector('.onboard .tell')
  const set = Object.getOwnPropertyDescriptor(box.constructor.prototype, 'value').set
  set.call(box, 'A CRM for salespeople who actually sell, keeping every lead, deal and follow-up in one pipeline so reps close instead of updating spreadsheets. Drag and drop pipeline, follow-up reminders, a timeline of every call and email, and reports on what is closing. Priced for small sales teams as the anti-enterprise CRM.')
  box.dispatchEvent(new Event('input', { bubbles: true }))
})

const t0 = Date.now()
const at = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
await page.evaluate(() => document.querySelector('.onboard .primary')?.click())
console.log(`${at()}  asked`)

// reading the brief is itself a model call, and it may come back wanting a gap filled, so this
// keeps answering until the onboarding is gone rather than assuming one click finishes it
for (let i = 0; i < 20 && (await page.locator('.onboard').count()); i++) {
  await page.evaluate(() => {
    const gap = document.querySelector('.onboard .fields input:not([type=password])')
    if (gap && !gap.value) {
      const set = Object.getOwnPropertyDescriptor(gap.constructor.prototype, 'value').set
      set.call(gap, 'small sales teams')
      gap.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.querySelector('.onboard .primary')?.click()
  })
  await page.waitForTimeout(1500)
}
console.log(`${at()}  brief accepted`)

let papers = 0
let firstBeat = 0
for (;;) {
  if (Date.now() - t0 > 420_000) {
    console.log(`${at()}  gave up`)
    break
  }
  const now = await page.evaluate(() => ({
    papers: document.querySelectorAll('.paper').length,
    busy: Boolean(document.querySelector('[data-busy]')),
    beat: Boolean(document.querySelector('.progress .beat[data-on]')),
    line: document.querySelector('.progress .line')?.textContent ?? '',
  }))
  if (now.beat && !firstBeat) {
    firstBeat = Date.now()
    console.log(`${at()}  beating: "${now.line}"`)
  }
  if (now.papers > papers) {
    papers = now.papers
    console.log(`${at()}  ${papers} paper${papers > 1 ? 's' : ''}`)
  }
  if (!now.busy && papers > 1) {
    console.log(`${at()}  done`)
    break
  }
  await page.waitForTimeout(500)
}

console.log('toast:', await page.evaluate(() => document.querySelector('.toast')?.textContent ?? null))
await browser.close()
server.kill()
