import { expect, it } from 'vitest'
import { applyAction, formatAction, legalActions } from '../../src/engine/index.js'
import type { Action, GameState } from '../../src/engine/index.js'
import { chooseAction, extractFeatures, makeEvaluator, probeMobility } from '../../src/ai/index.js'
import { battle, move, path, sq } from '../fixtures.js'
import { replay, rescueLog, terminalLog } from '../web-fixtures.js'
import { immobilizingReply, multiplePrisoners, seededPosition } from './positions.js'

function greedy(state: GameState) {
  const { action, diagnostics } = chooseAction(state, { policy: 'tactical', nodeBudget: 5_000 })
  expect(diagnostics.completedDepth).toBe(1)
  return applyAction(state, action!)
}

it.each([
  ['horizontal', 'c5 e4 a1', 'd4 h8 g8', ['d4']],
  ['double', 'c5 c2 e4 a1', 'c3 d4 h8', ['c3', 'd4']],
  ['corner', 'c1 a2 h1', 'a1 h8 g8', ['a1']],
] as const)('takes a %s imprisonment', (_, white, black, expected) => {
  const observed = greedy(battle(white, black)).events.flatMap(event =>
    event.type === 'imprisonment' ? [event.at] : [])
  expect(observed).toEqual(expected.map(sq))
})

it('chooses one of two engine removals from legal deployment and movement', () => {
  const state = multiplePrisoners()
  const legal = legalActions(state).flatMap(action => action.type === 'battle' ? [action.remove] : [])
  expect(new Set(legal)).toEqual(new Set(path('c3', 'd4')))
  expect(greedy(state).events.filter(event => event.type === 'removal')).toHaveLength(1)
})

it('uses a mandatory removal square for a new capture', () => {
  const state = battle('c4 e4 d6 a1', 'd4* d5 h8')
  const next = greedy(state)
  expect(next.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'removal', at: sq('d4') }),
    expect.objectContaining({ type: 'imprisonment', at: sq('d5') }),
  ]))
  const action = chooseAction(state, { policy: 'tactical' }).action
  expect(action?.type === 'battle' && action.path?.at(-1)).toBe(sq('d4'))
})

it('rescues an imprisoned counter in a replay from deployment', () => {
  const next = greedy(replay(rescueLog()))
  expect(next.events).toContainEqual(expect.objectContaining({ type: 'liberation', at: sq('d4') }))
})

it('recognizes a multi-stage rescue and imprisonment cascade', () => {
  const state = battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8')
  const next = greedy(state)
  expect(next.events.flatMap(event => event.type === 'imprisonment' || event.type === 'liberation' ?
    [[event.type, event.at]] : [])).toEqual([
    ['imprisonment', sq('d4')], ['liberation', sq('d3')], ['imprisonment', sq('c3')],
    ['liberation', sq('c2')], ['imprisonment', sq('d2')],
  ])
})

it('avoids a tempting move refuted by immediate capture in a seeded legal replay', () => {
  const state = seededPosition(7, 58)
  const captureReplies = (action: Action) => {
    const next = applyAction(state, action).state
    return legalActions(next).filter(reply =>
      applyAction(next, reply).events.some(event => event.type === 'imprisonment')).map(formatAction)
  }
  const tempting = chooseAction(state, { policy: 'tactical' }).action!
  expect(formatAction(tempting)).toBe('a6-a5')
  expect(captureReplies(tempting)).toContain('c5-c6')
  const searched = chooseAction(state, { depth: 2, nodeBudget: 12_000 })
  expect(searched.diagnostics.completedDepth).toBe(2)
  expect(searched.action).not.toEqual(tempting)
  expect(captureReplies(searched.action!)).toHaveLength(0)
})

it('takes a chained leap over a friendly prisoner to imprison an enemy', () => {
  const state = battle('a2 b2 c3* e4 a1', 'b3 d3 d4 h8')
  const decision = chooseAction(state, { policy: 'tactical' })
  const expected = move('a2', 'c2', 'c4')
  expect(decision.action).toEqual(expected)
  expect(applyAction(state, decision.action!).state.board[sq('d4')]?.status).toBe('imprisoned')
  expect(probeMobility(state, 'white').chainedThreats).toBeGreaterThan(0)
})

it('finds a delayed material win that every reply to the double custody allows', () => {
  const state = battle('c5 c2 e4 a1', 'c3 d4 h8')
  const searched = chooseAction(state, { depth: 3, nodeBudget: 10_000 })
  expect(searched.diagnostics.completedDepth).toBe(3)
  const next = applyAction(state, searched.action!).state
  for (const reply of legalActions(next)) {
    const returned = applyAction(next, reply).state
    const follow = chooseAction(returned, { policy: 'tactical' }).action!
    expect(applyAction(returned, follow).state.removed.black).toBeGreaterThan(state.removed.black)
  }
})

it('takes the immediate terminal removal in a replayable game', () => {
  const actions = terminalLog()
  const state = replay(actions.slice(0, -1))
  const decision = chooseAction(state, { depth: 2 })
  expect(decision.action).toEqual(actions.at(-1))
  expect(decision.diagnostics.score).toBe(999_999)
})

it('avoids the sole move that permits an immediate material-scored loss', () => {
  const state = battle('a2 c1', 'd1 a5 b3 a1 h8')
  const losing = legalActions(state).filter(action => immobilizingReply(state, action))
  expect(losing).toEqual([move('a2', 'b2')])
  const decision = chooseAction(state, { depth: 2 })
  expect(immobilizingReply(state, decision.action!)).toBe(false)
})

it('scores immobilization as a loss for the mover when the blocked side leads on removals', () => {
  const state = battle('a1 b1 c1 a2 b2 c2 a3 b3 c3', 'a4 b4 c4 d1 d2 e3', 'black')
  expect(applyAction(state, move('e3', 'd3')).state.outcome)
    .toEqual({ reason: 'immobilization', winner: 'white' })
  const decision = chooseAction(state, { depth: 2 })
  expect(decision.action).not.toEqual(move('e3', 'd3'))
})

it('search respects own oscillation history, even if geometry allows the step', () => {
  let state = battle('d4 h1', 'a8 h8')
  for (const action of [move('d4', 'd5'), move('a8', 'a7'), move('d5', 'd4'), move('a7', 'a6')]) {
    state = applyAction(state, action).state
  }
  const decision = chooseAction(state, { depth: 2 })
  expect(legalActions(state)).not.toContainEqual(move('d4', 'd5'))
  expect(legalActions(state)).toContainEqual(decision.action)
  expect(probeMobility(state, 'white').legal!.pairs).toBeLessThan(probeMobility(state, 'white').geometric.pairs)
})

it('reports material separately and values a removal above temporary custody', () => {
  const state = battle('c4 e4 h1', 'd4* a8 h8')
  const totals = extractFeatures(state)
  expect(totals.white).toMatchObject({ active: 3, prisoners: 0, dueRemoval: 1, removed: 17 })
  expect(totals.black).toMatchObject({ active: 2, prisoners: 1, removed: 17 })
  const generate = makeEvaluator({ threats: 0, multiThreats: 0, rescue: 0, exposedCaptors: 0, redundantPairs: 0 })
  const after = applyAction(state, { type: 'battle', remove: sq('d4'), path: path('c4', 'd4') }).state
  expect(generate(after, 'white')).toBeGreaterThan(generate(state, 'white'))
  expect(generate(state, 'white')).toBe(-generate(state, 'black'))
})
