import { expect, it } from 'vitest'
import { applyAction, legalActions } from '../../src/engine/index.js'
import { chooseAction, extractFeatures, probeMobility } from '../../src/ai/index.js'
import { battle } from '../fixtures.js'
import { quietHistory } from '../history-benchmark-fixtures.js'
import { replay, terminalLog } from '../web-fixtures.js'
import { multiplePrisoners, seededPosition } from './positions.js'

const round = (value: number) => Number(value.toFixed(3))
const byMedian = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]!

it('measures search ordering at equal completed depth and custody feature overhead', () => {
  const rows = [
    ['early-deployment', seededPosition(7, 2)],
    ['late-deployment', seededPosition(8, 39)],
    ['early-battle', seededPosition(7, 45)],
    ['multiple-prisoners', multiplePrisoners()],
    ['late-battle', replay(terminalLog().slice(0, 770))],
    ['sparse-synthetic', battle('d4 h1', 'a8 h8')],
    ['long-ledger', replay(quietHistory(2_500))],
  ] as const
  const options = { depth: 2, nodeBudget: 30_000, deployment: 'search', now: () => performance.now() } as const

  for (const [position, state] of rows) {
    const actions = legalActions(state)
    const results = [false, true].map(ordering => {
      chooseAction(state, { ...options, ordering })
      const runs = Array.from({ length: 5 }, () => chooseAction(state, { ...options, ordering }).diagnostics)
      const ms = byMedian(runs.map(run => run.elapsedMs))
      const { nodes, evaluations, completedDepth, score } = runs[0]!
      expect(completedDepth).toBe(2)
      globalThis.gc?.()
      const before = process.memoryUsage().heapUsed
      chooseAction(state, { ...options, ordering })
      const heapDelta = process.memoryUsage().heapUsed - before
      return {
        ordering, completedDepth, score, nodes, evaluations,
        elapsedMs: round(ms), firstUsableMs: round(byMedian(runs.map(run => run.firstUsableMs))),
        evaluationsPerSecond: Math.round(evaluations * 1_000 / ms),
        effectiveBranching: round((Math.sqrt(1 + 4 * nodes) - 1) / 2),
        heapDeltaKiB: Math.round(heapDelta / 1024),
      }
    })
    expect(results[0]!.score).toBe(results[1]!.score)
    let tokens = 0
    let cancellationObserved = 0
    const stop = chooseAction(state, {
      ...options,
      shouldStop: () => {
        if (++tokens !== 21) return false
        cancellationObserved = performance.now()
        return true
      },
    })
    const cancellationMs = performance.now() - cancellationObserved
    expect(stop.diagnostics.stop).toBe('canceled')

    const cost = (work: () => unknown) => {
      const start = performance.now()
      for (let i = 0; i < 20; i++) work()
      return round((performance.now() - start) / 20)
    }
    const experimentalCost = state.phase === 'battle' ? {
      approximateFeaturesMs: cost(() => extractFeatures(state)),
      mobilityAndChainedThreatsMs: cost(() => probeMobility(state, state.turn)),
      exactOneTurnEventsMs: cost(() => actions.forEach(action => applyAction(state, action).events)),
    } : null
    console.log(JSON.stringify({
      position, branching: actions.length, ledgerKeys: Object.keys(state.repetitions).length,
      results, cancellationMs: round(cancellationMs), experimentalCost,
    }))
  }
}, 120_000)
