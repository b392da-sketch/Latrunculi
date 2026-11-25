import { expect, it } from 'vitest'
import { applyAction, createGame, legalActions } from '../../src/engine/index.js'
import type { AiConfig } from '../../src/ai/index.js'
import { chooseAction, strategicFeatures, strategicPreset } from '../../src/ai/index.js'

import { quietHistory } from '../history-benchmark-fixtures.js'
import { battle } from '../fixtures.js'
import { multiplePrisoners, seededPosition } from './positions.js'

const round = (n: number) => Math.round(n * 1000) / 1000

it('compares M3.1 and M3.2 at matched search depth, budget, and legal history', () => {
  const max = Number(process.env.LATRUNCULI_LEDGER_MAX ?? 10_000)
  const wanted = [100, 1000, 2500, 5000, 10000].filter(size => size <= max)
  const quiet = quietHistory(wanted.at(-1)! + 39)
  let state = createGame()
  const positions = new Map([
    ['early-deployment', seededPosition(7, 2)], ['late-deployment', seededPosition(8, 39)],
    ['early-battle', seededPosition(7, 45)], ['midgame', multiplePrisoners()],
    ['sparse', battle('a2 c1', 'd1 a5 b3 a1 h8')],
  ])
  for (const [index, action] of quiet.entries()) {
    state = applyAction(state, action).state
    if (wanted.includes(index - 38)) {
      positions.set(`ledger-${index - 38}`, state)
    }
  }
  function measure(config: AiConfig, root: typeof state) {
    const now = () => performance.now()
    globalThis.gc?.()
    const before = process.memoryUsage().heapUsed
    const decision = chooseAction(root, { ...config, now })
    const allocated = process.memoryUsage().heapUsed - before
    globalThis.gc?.()
    const retained = process.memoryUsage().heapUsed - before
    const { elapsedMs, firstUsableMs, completedDepth, nodes, evaluations, score } = decision.diagnostics
    const layerTotal = (b: number) => Array.from({ length: completedDepth }, (_, index) => b ** (index + 1))
      .reduce((sum, count) => sum + count, 0)
    let lo = 0
    let hi = Math.max(nodes, 1)
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      if (layerTotal(mid) > nodes) hi = mid
      else lo = mid
    }
    return {
      elapsedMs: round(elapsedMs), firstUsableMs: round(firstUsableMs), completedDepth, nodes, evaluations, score,
      effectiveBranching: completedDepth ? round(lo) : null, successorsPerSecond: Math.round(nodes * 1000 / elapsedMs),
      evaluationsPerSecond: Math.round(evaluations * 1000 / elapsedMs),
      allocatedKiB: Math.round(allocated / 1024), retainedKiB: Math.round(retained / 1024),
    }
  }
  for (const [name, raw] of positions) {
    const root = raw
    const depths = name === 'sparse' || name === 'midgame' ? [1, 2, 3, 4] : [2]
    const branching = legalActions(root).length
    for (const depth of depths) {
      const config = { depth, nodeBudget: name === 'early-deployment' ? 6_000 : 1_200, deployment: 'search' } as const
      const original = measure(config, root)
      const overlay = measure({ ...config, transition: 'overlay' }, root)
      expect(overlay.nodes).toBe(original.nodes)
      expect(overlay.score).toBe(original.score)
      expect(overlay.completedDepth).toBe(original.completedDepth)
      const variants = name.startsWith('ledger') ? {} : {
        phase: measure({ ...config, transition: 'overlay', orderingStyle: 'phase' }, root),
        ...(depth === 2 ? {
          unordered: measure({ ...config, transition: 'overlay', ordering: false }, root),
          extended: measure({ ...config, transition: 'overlay', tacticalExtensions: 1 }, root),
          aspiration: measure({ ...config, transition: 'overlay', aspirationWindow: 12 }, root),
          strategic: measure({ ...config, transition: 'overlay', strategicWeights: strategicPreset }, root),
        } : {}),
      }
      let polls = 0
      let stoppedAt = 0
      const interrupted = chooseAction(root, { ...config, transition: 'overlay', depth: 4, shouldStop: () => {
        if (++polls !== 5) return false
        stoppedAt = performance.now()
        return true
      } })
      expect(interrupted.diagnostics.stop).toBe('canceled')
      const cancellationMs = performance.now() - stoppedAt
      const start = performance.now()
      for (let i = 0; i < 50; i++) strategicFeatures(root)
      console.log(JSON.stringify({
        name, branching, depth, original, overlay, ...variants,
        strategicPassMs: round((performance.now() - start) / 50), cancellationMs: round(cancellationMs),
      }))
    }
  }
}, 240_000)
