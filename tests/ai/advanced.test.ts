import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { applyAction, createGame, legalActions, mandatoryRemovals, positionKey, serialize } from '../../src/engine/index.js'
import type { GameEvent, GameState } from '../../src/engine/index.js'
import { chooseAction, makeEvaluator, randomFor, referencePolicies, strategicFeatures, terminalScore } from '../../src/ai/index.js'
import { applyOverlay, materialize } from '../../src/ai/overlay.js'
import { makeStrategicBonus } from '../../src/ai/strategic.js'
import { battle, move, sq } from '../fixtures.js'
import { replay, terminalLog } from '../web-fixtures.js'
import { cyclePosition, multiplePrisoners, seededPosition } from './positions.js'

const controls = Object.values(referencePolicies)

it.each([
  [2, 900, '60b6e3cf84d493bec29ad7709e5f7ac1d8945417711b36daedc13141d294af7c'],
  [7, 110, 'ab5becc994f77b41b36c019717752c67ae76cde5682cd2ae0be2934935be217a'],
  [31, 180, '66cd4dd482d2b6c2a9997a0d831fdf3cea02bd324ca86e5049277f6bd8d5b020'],
] as const)('matches M3.1 golden controls and canonical replay for seed %i', (seed, length, digest) => {
  const hash = createHash('sha256')
  const random = randomFor(seed)
  let canonical = createGame()
  let overlay = canonical
  for (let i = 0; i < length && !canonical.outcome; i++) {
    const actions = legalActions(canonical)
    expect(legalActions(overlay)).toEqual(actions)
    if ([0, 38, 39, 40, 41, 57, 90, 150, 500, 890].includes(i)) {
      for (const config of controls) {
        const limits = { ...config, nodeBudget: 256, now: () => 0, seed: 100 + i, tieBreak: 'seeded' } as const
        const baseline = chooseAction(canonical, limits)
        hash.update(JSON.stringify(baseline))
        expect(chooseAction(canonical, { ...limits, transition: 'overlay' })).toEqual(baseline)
      }
    }
    const action = actions[Math.floor(random() * actions.length)]!
    const next = applyAction(canonical, action)
    const fast = applyOverlay(overlay, action)
    expect(fast.events).toEqual(next.events)
    expect(positionKey(fast.state)).toBe(positionKey(next.state))
    const snapshot = serialize(next.state)
    expect(serialize(materialize(fast.state))).toBe(snapshot)
    hash.update(JSON.stringify(actions)).update(JSON.stringify(next.events)).update(snapshot)
    canonical = next.state
    overlay = fast.state
  }
  expect(hash.digest('hex')).toBe(digest)
})

it('handles threefold ledgers, cascades, removals and independent branches exactly', () => {
  const fixtures = [
    cyclePosition(9), cyclePosition(17), multiplePrisoners(),
    battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8'),
    replay(terminalLog().slice(0, -1)),
  ]
  for (const state of fixtures) {
    const snapshot = serialize(state)
    for (const action of legalActions(state)) {
      const exact = applyAction(state, action)
      const overlay = applyOverlay(state, action)
      expect({ ...overlay, state: materialize(overlay.state) }).toEqual(exact)
      for (const reply of legalActions(exact.state).slice(0, 3)) {
        expect(materialize(applyOverlay(overlay.state, reply).state)).toEqual(applyAction(exact.state, reply).state)
      }
    }
    expect(serialize(state)).toBe(snapshot)
  }
})

it('keeps the committed state reusable after interruption or a callback exception', () => {
  const state = cyclePosition(17)
  const before = serialize(state)
  const config = { transition: 'overlay', depth: 4, tacticalExtensions: 2, nodeBudget: 47 } as const
  let count = 0
  const interrupted = chooseAction(state, { ...config, shouldStop: () => ++count === 9 })
  expect(interrupted.diagnostics).toMatchObject({ stop: 'canceled', nodes: 8 })
  expect(legalActions(state)).toContainEqual(interrupted.action)
  count = 0
  expect(() => chooseAction(state, { ...config, shouldStop: () => {
    if (++count === 9) throw new Error('callback error')
    return false
  } })).toThrow('callback error')
  expect(serialize(state)).toBe(before)
  expect(chooseAction(state, { ...config, now: () => 0 })).toEqual(
    chooseAction(state, { ...config, transition: 'canonical', now: () => 0 }),
  )
})

it('phase ordering avoids the early-deployment blowup without changing values', () => {
  const state = seededPosition(7, 2)
  const config = { deployment: 'search', depth: 2, nodeBudget: 30_000 } as const
  const legacy = chooseAction(state, config)
  const phase = chooseAction(state, { ...config, orderingStyle: 'phase' })
  const unordered = chooseAction(state, { ...config, ordering: false })
  expect(phase.diagnostics.nodes).toBeLessThan(legacy.diagnostics.nodes)
  expect(phase.diagnostics.nodes).toBe(unordered.diagnostics.nodes)
  expect(phase.diagnostics.score).toBe(legacy.diagnostics.score)
})

it('re-searches a failed narrow aspiration window and preserves the result', () => {
  const state = multiplePrisoners()
  const opts = { depth: 2, nodeBudget: 20_000, transition: 'overlay' } as const
  const plain = chooseAction(state, opts)
  const narrow = chooseAction(state, { ...opts, aspirationWindow: 1 })
  expect(narrow.diagnostics.completedDepth).toBe(2)
  expect(narrow.diagnostics.score).toBe(plain.diagnostics.score)
  expect(legalActions(state)).toContainEqual(narrow.action)
  expect(chooseAction(state, { ...opts, nodeBudget: 1, aspirationWindow: 1 }).diagnostics.nodes).toBe(1)
})

it('agrees with an exhaustive bounded tactical reference and charges all extension nodes', () => {
  const state = battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8')
  const evaluate = makeEvaluator()
  function exact(node: GameState, depth: number, remaining: number, ply: number, events: readonly GameEvent[]): number {
    const end = terminalScore(node, state.turn, ply)
    if (end !== null) return end
    const extend = depth === 0 && remaining > 0 && (mandatoryRemovals(node).length > 0 ||
      events.some(event => event.type === 'liberation') || events.filter(event => event.type === 'imprisonment').length > 1)
    if (!extend && depth === 0) return evaluate(node, state.turn)
    const values = legalActions(node).map(action => {
      const next = applyAction(node, action)
      return exact(next.state, extend ? 0 : depth - 1, remaining - Number(extend), ply + 1, next.events)
    })
    return node.turn === state.turn ? Math.max(...values) : Math.min(...values)
  }
  const options = { transition: 'overlay', depth: 1, tacticalExtensions: 2 } as const
  const extended = chooseAction(state, { ...options, nodeBudget: 20_000 })
  expect(extended.diagnostics.score).toBe(exact(state, 1, 2, 0, []))
  expect(extended.diagnostics.principalVariation.length).toBeGreaterThan(1)
  expect(extended.diagnostics.principalVariation.length).toBeLessThanOrEqual(3)
  expect(chooseAction(state, { ...options, nodeBudget: 3 }).diagnostics)
    .toMatchObject({ completedDepth: 0, nodes: 3, stop: 'nodes' })
})

it('measures chains, formation and sparse conversion without changing terminal material rules', () => {
  const state = battle('a2 b2 c3* e4 a1', 'b3 d3 d4 h8')
  const f = strategicFeatures(state)
  expect(f.white.initiative).toBeGreaterThan(0)
  expect(f.white.formation).toBeGreaterThan(0)
  expect(f.white.escape).toBeGreaterThan(0)
  const evaluation = makeStrategicBonus({ pressure: 3, initiative: 4, confinement: 5 })
  expect(evaluation(state, 'white')).toBe(-evaluation(state, 'black'))
  const confined = battle('a3 b2 g8 h8', 'a2 a1 c8')
  expect(strategicFeatures(confined).white.confinement).toBeGreaterThan(0)
  expect(strategicFeatures(confined).black.confinement).toBe(0)
  const premature = battle('a1 b1 c1 a2 b2 c2 a3 b3 c3', 'a4 b4 c4 d1 d2 e3', 'black')
  expect(applyAction(premature, move('e3', 'd3')).state.outcome?.winner).toBe('white')
  expect(chooseAction(premature, { depth: 2, strategicWeights: { confinement: 6 } }).action).not.toEqual(move('e3', 'd3'))
})

it('validates malformed limits and strategic weights and preserves the draw score', () => {
  const state = cyclePosition(17)
  for (const config of [{ tacticalExtensions: -1 }, { aspirationWindow: 0 }, { strategicWeights: { pressure: Infinity } }]) {
    expect(() => chooseAction(state, config)).toThrow(RangeError)
  }
  expect(() => chooseAction(state, { policy: 'random', random: () => 1 })).toThrow(RangeError)
  const result = chooseAction(state, { depth: 1, transition: 'overlay', strategicWeights: { repetitionRisk: 8 } })
  expect(result.action).toEqual(move('a1', 'a2'))
  expect(result.diagnostics.score).toBe(0)
})

it('prefers an exchange over an immediate rescue when the bounded reply tree justifies it', () => {
  const state = seededPosition(13, 43)
  const side = state.turn
  const greedy = chooseAction(state, { policy: 'tactical' }).action!
  const search = chooseAction(state, { transition: 'overlay', depth: 3, nodeBudget: 6_500 })
  expect(search.diagnostics.completedDepth).toBe(3)
  const evaluate = makeEvaluator()
  function replyValue(node: GameState, depth: number, ply: number): number {
    const terminal = terminalScore(node, side, ply)
    if (terminal !== null) return terminal
    if (depth === 0) return evaluate(node, side)
    const values = legalActions(node).map(action => replyValue(applyAction(node, action).state, depth - 1, ply + 1))
    return node.turn === side ? Math.max(...values) : Math.min(...values)
  }
  const instantRescue = applyAction(state, greedy)
  expect(instantRescue.events.some(event => event.type === 'liberation' && event.counter.owner === side)).toBe(true)
  const exchange = applyAction(state, search.action!)
  expect(exchange.events.some(event => event.type === 'liberation' && event.counter.owner === side)).toBe(false)
  expect(replyValue(exchange.state, 2, 1)).toBeGreaterThan(replyValue(instantRescue.state, 2, 1))
  const worstReply = applyAction(exchange.state, search.diagnostics.principalVariation[1]!)
  expect(worstReply.events.some(event => event.type === 'removal' && event.counter.owner === side)).toBe(true)
  const follow = applyAction(worstReply.state, search.diagnostics.principalVariation[2]!)
  expect(follow.events.some(event => event.type === 'removal' && event.counter.owner !== side)).toBe(true)
})

it('converts a sparse one-counter win even with experimental features enabled', () => {
  const state = battle('c4 e4 h1', 'd4* h8')
  const decision = chooseAction(state, { depth: 4, transition: 'overlay', tacticalExtensions: 2,
    strategicWeights: { pressure: 3, confinement: 6 }, nodeBudget: 100 })
  expect(decision.action).toEqual({ type: 'battle', remove: sq('d4') })
  expect(decision.diagnostics.score).toBe(999_999)
  expect(applyAction(state, decision.action!).state.outcome).toEqual({ reason: 'one-counter', winner: 'white' })
})
