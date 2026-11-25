import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { chooseAction, chooseDifficulty, difficulties, difficultyConfig, difficultyIds, handleAiRequest } from '../../src/ai/index.js'
import type { AiDecision } from '../../src/ai/index.js'
import { applyAction, formatAction, legalActions } from '../../src/engine/index.js'
import { developmentExam, heldOutExam } from './difficulty-exam.js'
import { multiplePrisoners, seededPosition } from './positions.js'
import { quietHistory } from '../history-benchmark-fixtures.js'
import { replay, terminalLog } from '../web-fixtures.js'
import { battle } from '../fixtures.js'

const output = process.env.M33_OUTPUT ?? '/tmp'
const round = (value: number) => Number(value.toFixed(3))

it('examines held-out and development tactics with deterministic preset limits', () => {
  const exams = [developmentExam(), heldOutExam()]
  const results = difficultyIds.map(id => ({
    id,
    sets: exams.map((exam, set) => exam.map(item => {
      const count = difficulties[id].config.selection ? 16 : 1
      let hits = 0
      let nodes = 0
      let depth = 0
      let example: unknown
      for (let index = 0; index < count; index++) {
        const seed = (set ? 201 : 1) + index
        const decision = chooseDifficulty(item.state, id, { seed, mode: 'deterministic' })
        expect(legalActions(item.state)).toContainEqual(decision.action)
        if (item.accepts(decision.action!)) hits++
        else if (count === 1) {
          let state = item.state
          example = decision.diagnostics.principalVariation.map(action => {
            const step = applyAction(state, action)
            state = step.state
            return { action: formatAction(action), effects: step.events.filter(event => event.type !== 'movement'), removed: state.removed }
          })
        }
        nodes += decision.diagnostics.nodes
        depth += decision.diagnostics.completedDepth
      }
      return { case: item.label, source: item.source, criterion: item.criterion,
        hits, count, passRate: hits / count, meanNodes: nodes / count, meanDepth: depth / count, ...(example ? { example } : {}) }
    })),
  }))
  writeFileSync(`${output}/exam.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
}, 300_000)

it('measures interactive search, memory and overlay cost against canonical search', () => {
  const long = replay(quietHistory(2_500))
  const positions = [
    ['early deployment', seededPosition(7, 2)], ['late deployment', seededPosition(8, 39)],
    ['dense', seededPosition(7, 58)], ['custody', multiplePrisoners()],
    ['material', replay(terminalLog().slice(0, 630))], ['sparse', battle('a2 c1', 'd1 a5 b3 a1 h8')],
    ['long', long],
  ] as const
  const rows = []
  for (const id of difficultyIds) {
    for (const [name, state] of positions) {
      globalThis.gc?.()
      const before = process.memoryUsage().heapUsed
      const decision = chooseDifficulty(state, id, { seed: 47, now: () => performance.now() })
      const heapDeltaKiB = Math.round((process.memoryUsage().heapUsed - before) / 1024)
      globalThis.gc?.()
      const retainedKiB = Math.round((process.memoryUsage().heapUsed - before) / 1024)
      const { elapsedMs, completedDepth, nodes, stop, firstUsableMs } = decision.diagnostics
      expect(legalActions(state)).toContainEqual(decision.action)
      rows.push({ id, name, nodes, depth: completedDepth, stop, ms: round(elapsedMs), first: round(firstUsableMs), heapDeltaKiB, retainedKiB })
    }
  }
  const overlays = positions.filter(([name]) => ['dense', 'custody', 'long'].includes(name)).map(([name, state]) => {
    const options = { ...difficultyConfig('centurio', { mode: 'deterministic' }), now: () => performance.now() }
    const measure = (backend: 'overlay' | 'canonical') => {
      const samples = Array.from({ length: 5 }, () => chooseAction(state, { ...options, transition: backend }))
      return samples.sort((a, b) => a.diagnostics.elapsedMs - b.diagnostics.elapsedMs)[2] as AiDecision
    }
    const canonical = measure('canonical')
    const overlay = measure('overlay')
    expect(overlay.action).toEqual(canonical.action)
    expect(overlay.diagnostics.score).toBe(canonical.diagnostics.score)
    return { name, keys: Object.keys(state.repetitions).length, nodes: overlay.diagnostics.nodes,
      baselineMs: round(canonical.diagnostics.elapsedMs), overlayMs: round(overlay.diagnostics.elapsedMs) }
  })
  let beforeCancel = 0
  let checks = 0
  const interrupted = chooseDifficulty(long, 'imperator', { shouldStop: () => {
    if (++checks < 11) return false
    beforeCancel = performance.now()
    return true
  } })
  expect(interrupted.diagnostics.stop).toBe('canceled')
  const cancellationReturnMs = round(performance.now() - beforeCancel)
  const protocol = Array.from({ length: 5 }, (_, i) => {
    const start = performance.now()
    const response = handleAiRequest(structuredClone({ requestId: `benchmark-${i}`, state: long, difficulty: 'centurio',
      mode: 'deterministic', limits: { nodes: 0 } }))
    expect(response.ok).toBe(true)
    return performance.now() - start
  }).sort((a, b) => a - b)
  const data = { positions: rows, overlays, cancellationReturnMs, longProtocolMedianMs: round(protocol[2]!),
    rssKiB: process.resourceUsage().maxRSS }
  writeFileSync(`${output}/performance.json`, JSON.stringify(data, null, 2))
  console.log(JSON.stringify(data))
}, 120_000)

it('compares weaker selection methods on development positions', () => {
  const exam = developmentExam().filter(item => item.criterion !== 'legal')
  const alternatives = [
    ['Tiro ranked', difficultyConfig('tiro', { mode: 'deterministic' })],
    ['Tiro mixture', { ...difficultyConfig('tiro', { mode: 'deterministic' }), selection: { kind: 'mixture', randomRate: 0.3 } }],
    ['Miles ranked', difficultyConfig('miles', { mode: 'deterministic' })],
    ['Miles best only', { ...difficultyConfig('miles', { mode: 'deterministic' }), selection: { kind: 'rank', candidates: 1, margin: 0, decay: 1 } }],
  ] as const
  const results = alternatives.map(([name, config]) => {
    let hits = 0
    let regret = 0
    let distinct = 0
    for (const item of exam) {
      const best = chooseAction(item.state, { ...config, selection: { kind: 'rank', candidates: 1, margin: 0, decay: 1 } })
      const actions = new Set()
      for (let seed = 1; seed <= 16; seed++) {
        const decision = chooseAction(item.state, { ...config, seed })
        if (item.accepts(decision.action!)) hits++
        regret += best.diagnostics.score! - decision.diagnostics.score!
        actions.add(formatAction(decision.action!))
      }
      distinct += actions.size
    }
    return { name, hits, count: exam.length * 16, meanRegret: regret / (exam.length * 16), meanDistinct: distinct / exam.length }
  })
  writeFileSync(`${output}/selection.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
})
