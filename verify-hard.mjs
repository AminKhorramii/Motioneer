/**
 * The hard case: an overgrown page written with copy built to break things.
 *
 * The ordinary suites use short, well-behaved copy, which is exactly the copy that never
 * exercises the parts most likely to fail. Here the page is grown to roughly twice its
 * sections, and every string carries braces, quotes, markup, backslashes, newlines and
 * multi-byte characters, delivered in chunks that split those characters in half.
 */
import { _electron } from 'playwright'
import electronPath from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeAnthropic } from './fake-upstream.mjs'

const { server, url } = await fakeAnthropic('hard')
const DATA = mkdtempSync(join(tmpdir(), 'wall-'))

const app = await _electron.launch({
  args: ['.'],
  executablePath: electronPath,
  env: { ...process.env, WALL_TEST: '1', WALL_DATA: DATA, WALL_API_BASE: url },
})
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

await page.waitForSelector('.onboard .card', { timeout: 20000 })
await page.evaluate(() => localStorage.setItem('wall-key-anthropic', 'test-key'))
await page.click('.sample')
await page.waitForSelector('.paper.here', { timeout: 20000 })

// grow the page well past its default shape
await page.evaluate(async () => {
  const wanted = ['add features', 'add showcase', 'add testimonial', 'add pricing', 'add questions',
    'add social proof', 'add closing call', 'add hero', 'add features', 'add showcase']
  for (const label of wanted) {
    ;[...document.querySelectorAll('.addrow button')].find((b) => b.textContent.trim() === label)?.click()
    await new Promise((r) => setTimeout(r, 60))
  }
})
const grown = await page.evaluate(() => document.querySelectorAll('.sec').length)
console.log('page grown to:', JSON.stringify({ sections: grown }))

await page.evaluate(() => [...document.querySelectorAll('header button')]
  .find((b) => /new alternatives|write a new wall/.test(b.textContent))?.click())
await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 180000 })
if (errors.length) console.log('errors during write:', errors.slice(0, 3))

// the iframe re-renders after the model state settles, so wait for the paper to catch up
// with the rail rather than reading a stale document
await page.waitForFunction(() => {
  const rail = document.querySelectorAll('.sec').length
  const paper = document.querySelector('.paper.here iframe')?.contentDocument?.querySelectorAll('section').length
  return rail > 0 && rail === paper
}, null, { timeout: 30000 })

console.log('after write:', JSON.stringify(await page.evaluate(() => ({
  railSections: document.querySelectorAll('.sec').length,
  counter: document.querySelector('.filmbar span')?.textContent,
  papersSections: [...document.querySelectorAll('.paper iframe')]
    .map((f) => f.contentDocument?.querySelectorAll('section').length ?? -1),
}))))

// paper zero is the untouched base, so step to a written one before checking the copy
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })))
await page.waitForFunction(
  () => document.querySelector('.paper.here iframe')?.contentDocument?.body?.innerText?.includes('Ship {fast}'),
  null,
  { timeout: 30000 },
)

console.log('sections per paper:', JSON.stringify(await page.evaluate(async () => {
  const out = []
  for (let i = 0; i < 9; i++) {
    out.push(document.querySelectorAll('.sec').length)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await new Promise((r) => setTimeout(r, 250))
  }
  for (let i = 0; i < 8; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await new Promise((r) => setTimeout(r, 120))
  }
  return out
})))

const read = await page.evaluate(() => {
  const frame = document.querySelector('.paper.here iframe')
  const doc = frame.contentDocument
  const text = doc.body.innerText
  return {
    counter: document.querySelector('.filmbar span')?.textContent,
    headline: doc.querySelector('h1')?.innerText ?? '',
    // markup in copy must arrive as text, never as an element the browser runs
    scriptRan: frame.contentWindow.__pwned !== undefined,
    scriptTagsFromCopy: [...doc.querySelectorAll('script')].filter((s) => s.textContent.includes('__pwned')).length,
    escapedMarkupVisible: text.includes('<script>') && text.includes('<b>proven</b>'),
    replacementChars: (text.match(/�/g) ?? []).length,
    emoji: text.includes('\u{1F680}'),
    japanese: text.includes('日本語'),
    arabic: text.includes('العربية'),
    braceInCopy: text.includes('Ship {fast}'),
    closingBraceMidSentence: text.includes('closing brace } mid sentence'),
    sectionsRendered: doc.querySelectorAll('section').length,
  }
})
console.log('hard copy survived:', JSON.stringify(read))

const shipped = await page.evaluate(() => {
  const html = document.querySelector('.paper.here iframe').contentDocument.documentElement.outerHTML
  return { bytes: html.length, external: /src="http|href="http/.test(html) }
})
console.log('shipped:', JSON.stringify({ bytes: shipped.bytes, selfContained: !shipped.external }))
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')

await app.close()
server.close()
