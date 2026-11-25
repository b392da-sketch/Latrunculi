import { readdir, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { difficultyIds } from '../dist/ai/index.js'
import { legalActions } from '../dist/engine/index.js'

const base = process.env.LATRUNCULI_BENCH_BASE ?? 'http://127.0.0.1:4174/Latrunculi/'
const fixtures = JSON.parse(await readFile(process.argv[2] ?? '/tmp/latrunculi-worker-fixtures.json', 'utf8'))
const asset = (await readdir('web-dist/assets')).find(name => /^ai\.worker-.*\.js$/.test(name))
if (!asset) throw new Error('Build the production worker bundle first')
const url = new URL(`assets/${asset}`, base).href
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
})
const results = []
try {
  for (const rate of [1, 4]) {
    const page = await browser.newPage()
    await page.goto(base)
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate })
    const heapStart = await session.send('Runtime.getHeapUsage')
    for (const [fixture, state] of Object.entries(fixtures)) {
      for (const difficulty of difficultyIds) {
        const data = await page.evaluate(async ({ url, state, difficulty }) => {
          const stamp = () => performance.timeOrigin + performance.now()
          const start = stamp()
          const worker = new Worker(url, { type: 'module' })
          let last = stamp()
          let widestGap = 0
          let beats = 0
          const interval = setInterval(() => {
            const next = stamp()
            widestGap = Math.max(widestGap, next - last)
            last = next
            beats++
          }, 16)
          const send = requestId => new Promise((resolve, reject) => {
            const sentAt = stamp()
            const watchdog = setTimeout(() => reject(new Error('Benchmark worker stalled')), 15_000)
            worker.onmessage = ({ data }) => {
              clearTimeout(watchdog)
              if (data.requestId !== requestId || !data.ok) { reject(new Error(JSON.stringify(data))); return }
              const arrival = stamp()
              resolve({
                action: data.action, diagnostics: data.diagnostics,
                rtt: arrival - sentAt, inbound: data.timing.receivedAt - sentAt,
                handling: data.timing.handlingMs, return: arrival - data.timing.receivedAt - data.timing.handlingMs,
                validationOverhead: data.timing.handlingMs - data.diagnostics.elapsedMs,
              })
            }
            worker.onerror = event => { clearTimeout(watchdog); reject(new Error(event.message)) }
            worker.postMessage({ requestId, state, difficulty, seed: 47 })
          })
          try {
            const cold = await send('cold')
            const warm = await send('warm')
            // Capture at least one timer tick after any deferred delivery.
            await new Promise(resolve => setTimeout(resolve, 24))
            return { cold, warm, startupEstimate: cold.inbound - warm.inbound,
              elapsedIncludingProbe: stamp() - start, widestGap, beats }
          } finally {
            clearInterval(interval)
            worker.terminate()
          }
        }, { url, state, difficulty })
        const legal = legalActions(state)
        for (const result of [data.cold, data.warm]) assert(legal.some(action => JSON.stringify(action) === JSON.stringify(result.action)))
        results.push({ rate, fixture, difficulty, ...data })
      }
    }
    const canceled = await page.evaluate(async ({ url, state }) => {
      const worker = new Worker(url, { type: 'module' })
      let answered = false
      worker.onmessage = () => { answered = true }
      worker.postMessage({ requestId: 'cancel', state, difficulty: 'imperator', seed: 47 })
      await new Promise(resolve => setTimeout(resolve, 20))
      const start = performance.now()
      worker.terminate()
      const terminateMs = performance.now() - start
      await new Promise(resolve => setTimeout(resolve, 90))
      return { terminateMs, answered }
    }, { url, state: fixtures.dense })
    assert.equal(canceled.answered, false)
    const heapEnd = await session.send('Runtime.getHeapUsage')
    console.log(JSON.stringify({ rate, canceled, pageHeapDeltaBytes: heapEnd.usedSize - heapStart.usedSize }))
    await page.close()
  }
  for (const row of results) console.log(JSON.stringify(row))
} finally {
  await browser.close()
}
