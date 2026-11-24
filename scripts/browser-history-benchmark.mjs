import { chromium } from 'playwright'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const folder = process.argv[2]
if (!folder) throw new Error('Pass the directory containing generated benchmark fixtures.')
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
})
const round = value => Number(value.toFixed(1))
try {
  for (const file of (await readdir(folder)).filter(name => name.endsWith('.json'))) {
    const page = await browser.newPage()
    await page.goto('http://127.0.0.1:4173')
    await page.evaluate(() => {
      let last = performance.now()
      const gaps = []
      const id = setInterval(() => {
        const now = performance.now()
        gaps.push(now - last)
        last = now
      }, 16)
      window.historyProbe = () => {
        clearInterval(id)
        return { maxTimerGapMs: Math.max(0, ...gaps), samples: gaps.length }
      }
    })
    const start = performance.now()
    await page.locator('input[type=file]').setInputFiles(join(folder, file))
    await page.locator('.feedback').filter({ hasText: 'Match restored.' }).waitFor({ timeout: 90_000 })
    const importMs = performance.now() - start
    await page.waitForTimeout(50)
    const probe = await page.evaluate(() => window.historyProbe())
    console.log(JSON.stringify({ file, importMs: round(importMs), maxTimerGapMs: round(probe.maxTimerGapMs), samples: probe.samples }))
    await page.close()
  }
} finally {
  await browser.close()
}
