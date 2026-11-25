import { expect, it } from 'vitest'
import { applyAction, createGame, legalActions, serialize } from '../../src/engine/index.js'
import type { GameState } from '../../src/engine/index.js'
import { chooseAction, chooseDifficulty, difficulties, difficultyConfig, difficultyIds, handleAiRequest, isDifficultyId } from '../../src/ai/index.js'
import type { AiRequest } from '../../src/ai/index.js'
import { applyOverlay } from '../../src/ai/overlay.js'
import { battle, move } from '../fixtures.js'
import { replay, terminalLog } from '../web-fixtures.js'
import { cyclePosition, multiplePrisoners, seededPosition } from './positions.js'

it('publishes stable IDs, display names, designations and immutable nested presets', () => {
  expect(difficultyIds).toEqual(['tiro', 'miles', 'veteranus', 'centurio', 'legatus', 'imperator'])
  expect(difficultyIds.map(id => [difficulties[id].name, difficulties[id].designation])).toEqual([
    ['Tiro', 'Recruit'], ['Miles', 'Soldier'], ['Veteranus', 'Veteran'], ['Centurio', 'Centurion'],
    ['Legatus', 'Legate'], ['Imperator', 'Commander'],
  ])
  expect(Object.isFrozen(difficultyIds)).toBe(true)
  expect(Object.isFrozen(difficulties)).toBe(true)
  for (const preset of Object.values(difficulties)) {
    expect(Object.isFrozen(preset)).toBe(true)
    expect(Object.isFrozen(preset.config)).toBe(true)
    if (preset.config.selection) expect(Object.isFrozen(preset.config.selection)).toBe(true)
    if (preset.config.weights) expect(Object.isFrozen(preset.config.weights)).toBe(true)
  }
  expect(isDifficultyId('toString')).toBe(false)
})

it.each(difficultyIds)('%s is reproducible and legal in deployment, battle and mandatory removal', id => {
  const options = { mode: 'deterministic', limits: { nodes: 110 }, seed: 18, now: () => 0 } as const
  for (const state of [createGame(), seededPosition(8, 39), seededPosition(7, 58), multiplePrisoners(), cyclePosition(17)]) {
    const before = serialize(state)
    const first = chooseDifficulty(state, id, options)
    const second = chooseDifficulty(state, id, options)
    expect(second).toEqual(first)
    expect(legalActions(state)).toContainEqual(first.action)
    expect(first.diagnostics.nodes).toBeLessThanOrEqual(110)
    const next = applyAction(state, first.action!)
    if (state.phase === 'deployment' && state.reserves.white + state.reserves.black === 1) {
      expect(next.state.phase).toBe('battle')
    }
    expect(serialize(state)).toBe(before)
  }
  const custody = multiplePrisoners()
  const decision = chooseDifficulty(custody, id, options)
  expect(applyAction(custody, decision.action!).events.filter(event => event.type === 'removal')).toHaveLength(1)
})

it.each(difficultyIds)('%s honors an injected deadline, node ceiling and cancellation', id => {
  const state = multiplePrisoners()
  let count = 0
  const timed = chooseDifficulty(state, id, { now: () => ++count, limits: { timeMs: 3 } })
  expect(timed.diagnostics).toMatchObject({ stop: 'time', nodes: 1 })
  const short = chooseDifficulty(state, id, { mode: 'deterministic', limits: { nodes: 2 } })
  expect(short.diagnostics).toMatchObject({ stop: 'nodes', nodes: 2 })
  const canceled = chooseDifficulty(state, id, { shouldStop: () => true })
  expect(canceled.diagnostics).toMatchObject({ stop: 'canceled', nodes: 0 })
  for (const decision of [timed, short, canceled]) expect(legalActions(state)).toContainEqual(decision.action)
})

it('varies weak choices by seed, preserves detected terminal wins, and stops on terminal state', () => {
  const state = seededPosition(7, 58)
  const choices = new Set(Array.from({ length: 16 }, (_, seed) =>
    JSON.stringify(chooseDifficulty(state, 'tiro', { mode: 'deterministic', seed }).action)))
  expect(choices.size).toBeGreaterThan(1)
  const before = replay(terminalLog().slice(0, -1))
  for (const id of difficultyIds) {
    const decision = chooseDifficulty(before, id, { mode: 'deterministic' })
    const ended = applyAction(before, decision.action!).state
    expect(ended.outcome?.winner).toBe('white')
    expect(chooseDifficulty(ended, id)).toMatchObject({ action: null, diagnostics: { stop: 'terminal' } })
  }
})

it('does not let stochastic sampling select a visible terminal loss when a safe action exists', () => {
  const state = battle('a1 b1 c1 a2 b2 c2 a3 b3 c3', 'a4 b4 c4 d1 d2 e3', 'black')
  for (const id of ['tiro', 'miles'] as const) {
    for (const seed of [3, 5, 12, 33]) {
      const selected = chooseDifficulty(state, id, { mode: 'deterministic', seed })
      expect(applyAction(state, selected.action!).state.outcome?.winner).not.toBe('white')
    }
  }
})

it('separates interactive and deterministic limits and rejects invalid overrides', () => {
  expect(difficultyConfig('centurio', { mode: 'deterministic' })).not.toHaveProperty('timeBudgetMs')
  expect(difficultyConfig('centurio', { limits: { depth: 1, nodes: 0, timeMs: 5 } }))
    .toMatchObject({ depth: 1, nodeBudget: 0, timeBudgetMs: 5 })
  expect(() => difficultyConfig('unknown' as never)).toThrow(RangeError)
  expect(() => difficultyConfig('tiro', { mode: 'deterministic', limits: { timeMs: 4 } })).toThrow(RangeError)
  expect(() => difficultyConfig('tiro', { limits: { nodes: 50_000 } })).toThrow(RangeError)
  expect(() => difficultyConfig('tiro', { seed: -1 })).toThrow(RangeError)
})

it('round-trips worker messages and retains history-dependent draw choices across the boundary', () => {
  const repeated = cyclePosition(17)
  const other = cyclePosition(9)
  const request = (state: GameState): AiRequest => ({
    requestId: 'turn-17', state, difficulty: 'centurio', mode: 'deterministic', seed: 6, limits: { depth: 1 },
  })
  const snapshot = serialize(repeated)
  const response = handleAiRequest(structuredClone(request(repeated)), { now: () => 0 })
  expect(response).toEqual(JSON.parse(JSON.stringify(response)))
  expect(response).toMatchObject({ ok: true, requestId: 'turn-17', action: move('a1', 'a2'), diagnostics: { score: 0 } })
  expect(handleAiRequest(request(other), { now: () => 0 })).not.toMatchObject({ diagnostics: { score: 0 } })
  expect(serialize(repeated)).toBe(snapshot)
  for (const state of [other, repeated, multiplePrisoners()]) {
    const config = difficultyConfig('centurio', { mode: 'deterministic', now: () => 0 })
    expect(chooseAction(state, config)).toEqual(chooseAction(state, { ...config, transition: 'canonical' }))
  }
})

it('handles structured errors and cooperatively canceled worker requests', () => {
  const state = multiplePrisoners()
  const raw = { requestId: 'turn-2', state, difficulty: 'veteranus' }
  for (const malformed of [null, [], { ...raw, requestId: '' }, { ...raw, difficulty: 'x' },
    { ...raw, limits: { nodes: '1' } }, { ...raw, limits: { overlay: true } }, { ...raw, seed: Infinity },
    { ...raw, mode: 'deterministic', limits: { timeMs: 50 } }]) {
    expect(handleAiRequest(malformed)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  }
  expect(handleAiRequest({ ...raw, state: { ...state, repetitions: {} } }))
    .toMatchObject({ requestId: 'turn-2', ok: false, error: { code: 'invalid-state' } })
  const overlay = applyOverlay(state, legalActions(state)[0]!).state
  expect(handleAiRequest({ ...raw, state: overlay })).toMatchObject({ ok: false, error: { code: 'invalid-state' } })
  expect(handleAiRequest(raw, { shouldStop: () => true })).toMatchObject({
    requestId: 'turn-2', ok: true, diagnostics: { stop: 'canceled', nodes: 0 },
  })
})
