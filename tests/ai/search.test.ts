import { describe, expect, it } from 'vitest'
import { applyAction, createGame, legalActions, positionKey, serialize } from '../../src/engine/index.js'
import type { Action, GameState, Player } from '../../src/engine/index.js'
import { chooseAction, makeEvaluator, terminalScore } from '../../src/ai/index.js'
import { battle, move } from '../fixtures.js'
import { replay, terminalLog } from '../web-fixtures.js'
import { cyclePosition, multiplePrisoners, seededPosition } from './positions.js'

const evaluate = makeEvaluator()
function exhaustive(state: GameState, side: Player, depth: number, ply = 0): number {
  const end = terminalScore(state, side, ply)
  if (end !== null) return end
  if (depth === 0) return evaluate(state, side)
  const values = legalActions(state).map(action => exhaustive(applyAction(state, action).state, side, depth - 1, ply + 1))
  return state.turn === side ? Math.max(...values) : Math.min(...values)
}

describe('search reference agreement', () => {
  it.each([
    ['white to move', () => battle('c5 c2 e4 a1', 'c3 d4 h8'), 3],
    ['black to move', () => battle('c5 c2 e4 a1', 'c3 d4 h8', 'black'), 3],
    ['deployment transition', () => seededPosition(8, 39), 2],
    ['custody and two removals', multiplePrisoners, 2],
  ] as const)('matches exhaustive minimax for %s', (_, fixture, depth) => {
    const state = fixture()
    const expected = exhaustive(state, state.turn, depth)
    for (const ordering of [true, false]) {
      const { action, diagnostics } = chooseAction(state, { depth, nodeBudget: 100_000, ordering, deployment: 'search' })
      expect(diagnostics.completedDepth).toBe(depth)
      expect(diagnostics.score).toBe(expected)
      expect(exhaustive(applyAction(state, action!).state, state.turn, depth - 1, 1)).toBe(expected)
      expect(diagnostics.cutoffs).toBeGreaterThan(0)
      let node = state
      for (const step of diagnostics.principalVariation) node = applyAction(node, step).state
      expect(diagnostics.principalVariation[0]).toEqual(action)
      expect(diagnostics.principalVariation.length).toBeLessThanOrEqual(depth)
      if (diagnostics.principalVariation.length < depth) expect(node.outcome).not.toBeNull()
    }
  })

  it('completes one iteration before exhausting the next', () => {
    const state = battle('d4 h1', 'a8 h8')
    const nodeBudget = legalActions(state).length + 1
    const first = chooseAction(state, { depth: 1, nodeBudget })
    const interrupted = chooseAction(state, { depth: 4, nodeBudget })
    expect(interrupted.diagnostics).toMatchObject({ stop: 'nodes', completedDepth: 1, nodes: nodeBudget })
    expect(interrupted.action).toEqual(first.action)
    expect(interrupted.diagnostics.score).toBe(first.diagnostics.score)
    expect(chooseAction(state, { nodeBudget: 0 })).toMatchObject({
      action: legalActions(state)[0], diagnostics: { stop: 'nodes', nodes: 0, completedDepth: 0 },
    })
  })

  it('checks cancellation and injected deadlines during search without a real clock', () => {
    const state = battle('d4 h1', 'a8 h8')
    let polls = 0
    const canceled = chooseAction(state, { depth: 4, shouldStop: () => ++polls === 4 })
    expect(canceled.diagnostics).toMatchObject({ stop: 'canceled', nodes: 3, completedDepth: 0 })
    expect(legalActions(state)).toContainEqual(canceled.action)
    let tick = 0
    const timed = chooseAction(state, { now: () => tick++, timeBudgetMs: 3 })
    expect(timed.diagnostics).toMatchObject({ stop: 'time', nodes: 1 })
    expect(legalActions(state)).toContainEqual(timed.action)
  })

  it('distinguishes identical keys with different legal threefold futures', () => {
    const fresh = cyclePosition(9)
    const repeated = cyclePosition(17)
    expect(positionKey(fresh)).toBe(positionKey(repeated))
    expect(fresh.repetitions).not.toEqual(repeated.repetitions)
    const next = move('a1', 'a2')
    expect(applyAction(fresh, next).state.outcome).toBeNull()
    expect(applyAction(repeated, next).state.outcome).toEqual({ reason: 'threefold', winner: null })
    const low = chooseAction(fresh, { depth: 1 })
    const draw = chooseAction(repeated, { depth: 1 })
    expect(low.diagnostics.score).toBeLessThan(0)
    expect(draw.action).toEqual(next)
    expect(draw.diagnostics.score).toBe(0)
    expect(chooseAction(repeated, { nodeBudget: 100_000, depth: 2 }).diagnostics.score)
      .toBe(exhaustive(repeated, repeated.turn, 2))
  })

  it('scores a real terminal win, loss, and draw by perspective and prefers faster wins', () => {
    const won = replay(terminalLog())
    expect(terminalScore(won, 'white', 1)).toBeGreaterThan(terminalScore(won, 'white', 2)!)
    expect(terminalScore(won, 'black', 1)).toBeLessThan(terminalScore(won, 'black', 2)!)
    expect(terminalScore(cyclePosition(18), 'white', 1)).toBe(0)
    expect(chooseAction(won)).toMatchObject({ action: null, diagnostics: { stop: 'terminal', nodes: 0 } })
  })
})

it('always selects applicable actions under fixed budgets without mutating state', () => {
  const policies = ['random', 'legacy', 'tactical', 'search'] as const
  let state = createGame({ firstPlayer: 'black' })
  for (let i = 0; i < 62 && !state.outcome; i++) {
    const config = { policy: policies[i % 4]!, seed: i, depth: 2, nodeBudget: 72 } as const
    const before = serialize(state)
    const first = chooseAction(state, config)
    const second = chooseAction(state, config)
    expect(first.action).toEqual(second.action)
    expect(first.diagnostics.nodes).toBe(second.diagnostics.nodes)
    expect(first.diagnostics.nodes).toBeLessThanOrEqual(72)
    expect(legalActions(state)).toContainEqual(first.action)
    expect(serialize(state)).toBe(before)
    state = applyAction(state, first.action as Action).state
  }
  expect(state.phase).toBe('battle')
})
