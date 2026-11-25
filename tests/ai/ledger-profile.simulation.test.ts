import { it } from 'vitest'
import { applyAction, createGame, legalActions, positionKey } from '../../src/engine/index.js'
import { boundaryOutcome } from '../../src/engine/game.js'
import { resolveCustody } from '../../src/engine/imprisonment.js'
import { extractFeatures } from '../../src/ai/index.js'
import { quietHistory } from '../history-benchmark-fixtures.js'

const sample = (operation: () => unknown, iterations: number) => {
  let sink: unknown
  const start = performance.now()
  for (let i = 0; i < iterations; i++) sink = operation()
  const microseconds = (performance.now() - start) * 1000 / iterations
  if (sink === null) throw new Error('Unexpected benchmark result')
  return Number(microseconds.toFixed(2))
}

it('profiles canonical transitions on legal quiet histories', () => {
  const wanted = [100, 1000, 2500, 5000, 10000]
  const log = quietHistory(wanted.at(-1)! + 39)
  let state = createGame()
  for (const [index, next] of log.entries()) {
    state = applyAction(state, next).state
    if (!wanted.includes(index - 38)) continue
    const base = state
    const actions = legalActions(base)
    const action = actions.find(candidate => candidate.type === 'battle' && candidate.path)!
    if (action.type !== 'battle' || !action.path) throw new Error('Expected movement')
    const child = applyAction(base, action).state
    const key = positionKey(child)
    const from = action.path[0]!
    const to = action.path.at(-1)!
    const moved = base.board.slice()
    moved[to] = moved[from]!
    moved[from] = null
    const counts = Object.keys(base.repetitions).length
    globalThis.gc?.()
    const heapStart = process.memoryUsage().heapUsed
    const held = Array.from({ length: 64 }, () => applyAction(base, action))
    const heapHeld = process.memoryUsage().heapUsed - heapStart
    const gcAt = performance.now()
    globalThis.gc?.()
    const gcMs = performance.now() - gcAt
    console.log(JSON.stringify({
      counts, branching: actions.length, heapKiB64: Math.round(heapHeld / 1024), gcMs: Number(gcMs.toFixed(2)),
      held: held.length,
      micros: {
        apply: sample(() => applyAction(base, action), 200),
        actionGeneration: sample(() => legalActions(base), 500),
        boardCopy: sample(() => base.board.slice(), 10000),
        ledgerCopy: sample(() => ({ ...base.repetitions, [key]: (base.repetitions[key] ?? 0) + 1 }), 200),
        key: sample(() => positionKey(child), 1000),
        outcome: sample(() => [boundaryOutcome(child)], 500),
        features: sample(() => extractFeatures(child, false), 1000),
        custody: sample(() => resolveCustody(moved.slice(), base.turn, to), 1000),
      },
    }))
  }
}, 240_000)
