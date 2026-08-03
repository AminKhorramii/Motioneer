import { _electron } from 'playwright'
import electronPath from 'electron'
const app = await _electron.launch({ args: ['.'], executablePath: electronPath, env: { ...process.env, WALL_DATA: '/tmp/wall-shots' } })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForSelector('.onboard .card')
await page.waitForTimeout(700)
await page.screenshot({ path: 'shots/onboard-1.png' })
await page.click('.onboard .steps button:nth-child(2)')
await page.evaluate(() => {
  document.querySelectorAll('.onboard input, .onboard textarea').forEach((el, i) => {
    const v = ['Spoor','Every session you ever ran, findable in one keystroke.','Spoor reads what your AI tools already write to disk and turns 900MB of transcripts into memory you can search.','for people who build with agents','Download for macOS'][i]
    if (v) { const s = Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set; s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})) }
  })
})
await page.waitForTimeout(400)
await page.screenshot({ path: 'shots/onboard-2.png' })
await page.click('.onboard .steps button:nth-child(3)')
await page.waitForTimeout(400)
await page.screenshot({ path: 'shots/onboard-3.png' })
await page.click('.onboard .primary')
await page.waitForSelector('.paper.here')
await page.waitForTimeout(2200)
await page.screenshot({ path: 'shots/studio.png' })
await page.evaluate(() => document.querySelectorAll('.sec')[0].click())
await page.waitForTimeout(600)
await page.screenshot({ path: 'shots/section.png' })
for (const name of ['swiss', 'editorial', 'terminal', 'poster', 'catalogue', 'soft']) {
  await page.evaluate(() => document.querySelector('.filmbar .world')?.click())
  await page.waitForTimeout(1100)
  await page.screenshot({ path: `shots/world-${name}.png`, clip: { x: 150, y: 60, width: 840, height: 800 } })
}
for (const name of ['contours', 'grain', 'ridge']) {
  await page.evaluate(() => [...document.querySelectorAll('.filmbar button')]
    .find((x) => /backdrop|contours|grain|ridge/.test(x.textContent))?.click())
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `shots/backdrop-${name}.png` })
}
await app.close()
console.log('shots done')
