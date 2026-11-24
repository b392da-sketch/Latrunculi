import { expect, it } from 'vitest'
import { applyAction, createGame, legalActions } from '../../src/engine/index.js'
import { chooseAction, extractFeatures, randomFor, runTournament, summarizeGames } from '../../src/ai/index.js'
import { legacyValue } from '../../src/ai/legacy.js'
import { battle, sq } from '../fixtures.js'
import { replay } from '../web-fixtures.js'
import { cyclePosition, seededPosition } from './positions.js'

it('random samples exactly one representative action using the shared seed generator', () => {
  const state = seededPosition(7, 58)
  const actions = legalActions(state)
  for (const seed of [0, 1, 31, 796]) {
    const expected = actions[Math.floor(randomFor(seed)() * actions.length)]
    const decision = chooseAction(state, { policy: 'random', seed })
    expect(decision.action).toEqual(expected)
    expect(decision.diagnostics.nodes).toBe(0)
  }
})

it('legacy baseline retains the historical threefold-preview evaluation', () => {
  const state = cyclePosition(17)
  const score = (action: ReturnType<typeof legalActions>[number]) =>
    legacyValue(applyAction(state, action).state, state.turn)
  const oldScore = (action: ReturnType<typeof legalActions>[number]) =>
    legacyValue(applyAction({ ...state, repetitions: {} }, action).state, state.turn)
  const actions = legalActions(state)
  expect(actions.map(score)).toEqual(actions.map(oldScore))
  const best = actions.filter(action => score(action) === Math.max(...actions.map(score)))
  const seed = 26
  expect(chooseAction(state, { policy: 'legacy', seed }).action)
    .toEqual(best[Math.floor(randomFor(seed)() * best.length)])
  expect(legacyValue(battle('c4 e4 f8 h8', 'd4* g8* a1 c1'), 'white')).toBe(20)
})

it('keeps static deployment sandwiches outside tactical custody features', () => {
  let state = createGame()
  for (const at of ['c4', 'd4', 'e4']) state = applyAction(state, { type: 'place', at: sq(at) }).state
  const counts = extractFeatures(state)
  expect(counts.black.prisoners).toBe(0)
  expect(counts.white.threats).toBe(0)
  const move = chooseAction(state, { deployment: 'heuristic', nodeBudget: 128 })
  expect(move.diagnostics.completedDepth).toBe(1)
  expect(legalActions(state)).toContainEqual(move.action)
})

it('replays both paired games and reports truncations separately from draws', () => {
  const options = {
    opponents: [{ name: 'A0', config: { policy: 'random' } }, { name: 'A2', config: { policy: 'tactical' } }],
    cap: 45, seeds: [19], now: () => 0,
  } as const
  const games = [...runTournament(options)]
  expect(games).toEqual([...runTournament(options)])
  const [first, second] = games
  expect(first!.actions.slice(0, 40)).toEqual(second!.actions.slice(0, 40))
  expect(first!.players.white).toBe(second!.players.black)
  for (const game of games) expect(replay(game.actions).outcome).toBe(game.outcome)
  const report = summarizeGames(games)
  expect(report.truncated.games).toBe(2)
  expect(report.outcomes).toEqual({ white: 0, black: 0, draw: 0 })
})
