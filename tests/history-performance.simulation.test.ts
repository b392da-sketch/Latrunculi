import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { legalActions } from '../src/engine/index.js'
import { commit, current, defaults, exportMatch, importMatch, seek } from '../src/web/match.js'
import { gameFile, terminalLog } from './web-fixtures.js'
import { quietHistory } from './history-benchmark-fixtures.js'

const max = Number(process.env.LATRUNCULI_BENCH_MAX ?? 10_000)
const ms = (value: number) => Number(value.toFixed(2))
const heap = () => {
  globalThis.gc?.()
  return process.memoryUsage().heapUsed
}

it('measures legally replayable browser match logs', () => {
  const quiet = quietHistory(max)
  const frequent = terminalLog()
  const cases = [
    ...[100, 1_000, 5_000, 10_000].filter(length => length <= max).map(length =>
      ({ name: 'quiet', log: quiet.slice(0, length) })),
    { name: 'removals', log: frequent },
  ]
  for (const { name, log } of cases) {
    const source = gameFile(log)
    if (process.env.LATRUNCULI_BENCH_FIXTURES) {
      writeFileSync(`${process.env.LATRUNCULI_BENCH_FIXTURES}/${name}-${log.length}.json`, source)
    }
    const before = heap()
    const start = performance.now()
    const { match } = importMatch(source)
    const importMs = performance.now() - start
    const retained = heap() - before
    const at = match.cursor - 1
    let begin = performance.now()
    const undone = seek(match, at)
    current(undone)
    const undoMs = performance.now() - begin
    begin = performance.now()
    current(seek(undone, match.cursor))
    const redoMs = performance.now() - begin
    const terminal = current(match)
    const beforeCommit = terminal.outcome ? undone : match
    const action = legalActions(current(beforeCommit))[0]!
    const commitSamples = Array.from({ length: 5 }, () => {
      const start = performance.now()
      commit(beforeCommit, action)
      return performance.now() - start
    }).sort((a, b) => a - b)
    const commitMs = commitSamples[2]!
    begin = performance.now()
    current(seek(match, Math.floor(match.cursor / 2)))
    const midSeekMs = performance.now() - begin
    console.log(JSON.stringify({
      name, actions: log.length, removed: terminal.removed, fileBytes: Buffer.byteLength(exportMatch(match, defaults)),
      compactBytes: Buffer.byteLength(source), importMs: ms(importMs), retainedMiB: ms(retained / 2 ** 20),
      undoMs: ms(undoMs), redoMs: ms(redoMs), commitMs: ms(commitMs), midSeekMs: ms(midSeekMs),
    }))
  }
}, 300_000)
