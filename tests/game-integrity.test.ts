import { describe, expect, it } from 'vitest'
import {
  applyAction, createGame, deserialize, formatAction, formatResult, legalActions, mandatoryRemovals,
  positionKey, result, serialize,
} from '../src/engine/index.js'
import type { Action, GameState } from '../src/engine/index.js'
import { battle, move, path, sq } from './fixtures.js'

describe('mandatory removal and scoring', () => {
  it('requires choosing exactly one prisoner before moving', () => {
    const state = battle('c4 e4 f8 h8', 'd4* g8* a1 c1')
    expect(mandatoryRemovals(state)).toEqual([sq('d4'), sq('g8')])
    expect(() => applyAction(state, move('c4', 'c5'))).toThrow()
    expect(() => applyAction(state, { type: 'battle', remove: sq('a1'), path: path('c4', 'c5') })).toThrow()
    expect(() => applyAction(state, { type: 'battle', remove: sq('d4') })).toThrow()
    for (const remove of mandatoryRemovals(state)) {
      expect(legalActions(state)).toContainEqual({ type: 'battle', remove, path: path('h8', 'h7') })
      const next = applyAction(state, { type: 'battle', remove, path: path('h8', 'h7') })
      expect(next.events.filter(event => event.type === 'removal')).toHaveLength(1)
      expect(next.state.removed.black).toBe(state.removed.black + 1)
      expect(next.state.turn).toBe('black')
      expect(next.state.repetitions).toEqual({ [positionKey(next.state)]: 1 })
    }
  })

  it('allows moving into the vacated prison square', () => {
    const state = battle('c4 e4 h8', 'd4* a1 c1')
    const action = { type: 'battle', remove: sq('d4'), path: path('c4', 'd4') } as const
    expect(legalActions(state)).toContainEqual(action)
    expect(applyAction(state, action).state.board[sq('d4')]?.owner).toBe('white')
    expect(formatAction(action)).toBe('xd4; c4-d4')
  })

  it('removes the penultimate piece without accepting any movement', () => {
    const state = battle('c4 e4 d3 d5', 'd4* h8')
    const action = { type: 'battle', remove: sq('d4') } as const
    expect(legalActions(state)).toEqual([action])
    expect(() => applyAction(state, { ...action, path: path('c4', 'c5') })).toThrow()
    const next = applyAction(state, action)
    expect(next.events.map(event => event.type)).toEqual(['removal', 'termination'])
    expect(result(next.state)).toEqual({ reason: 'one-counter', winner: 'white' })
    expect(deserialize(serialize(next.state))).toEqual(next.state)
    expect(legalActions(next.state)).toEqual([])
    expect(() => applyAction(next.state, action)).toThrow()
  })

  it.each([
    ['a3 b3 c1 d2', null, '½-½'],
    ['a3 b3 c1 d2 h8', 'black', '0-1'],
  ] as const)('scores immobilization by actual removals against %s', (black, winner, notation) => {
    const next = applyAction(battle('a1 b1 a2 b2', black, 'black'), move('d2', 'c2'))
    expect(result(next.state)).toEqual({ reason: 'immobilization', winner })
    expect(formatResult(result(next.state)!)).toEqual(notation)
  })

  it('keeps prisoners off the removal scoreboard', () => {
    const state = battle('c4 e4 f8 h8', 'd4* g8* a1 c1')
    const next = applyAction(state, { type: 'battle', remove: sq('d4'), path: path('c4', 'd4') })
    expect(next.state.board[sq('g8')]?.status).toBe('imprisoned')
    expect(next.state.removed.black).toBe(17)
  })
})

describe('repetition', () => {
  it('blocks a third oscillating move and resets for another piece or destination', () => {
    let state = battle('d4 h1', 'a8 h8')
    for (const action of [move('d4', 'd5'), move('a8', 'a7'), move('d5', 'd4'), move('a7', 'a6')]) {
      state = applyAction(state, action).state
    }
    expect(() => applyAction(state, move('d4', 'd5'))).toThrow(/oscillation/)
    expect(legalActions(state)).not.toContainEqual(move('d4', 'd5'))
    const another = applyAction(state, move('h1', 'h2')).state
    const changed = applyAction(state, move('d4', 'e4')).state
    expect(another.movement.white).toHaveLength(1)
    expect(changed.movement.white).toHaveLength(1)
    expect(another.movement.black).toEqual(state.movement.black)
    const blackMoved = applyAction(another, move('a6', 'a5')).state
    expect(legalActions(blackMoved)).toContainEqual(move('d4', 'd5'))
  })

  it('draws on the third equal boundary even with unequal material', () => {
    const cycle = [
      move('d4', 'd5'), move('a1', 'a2'), move('d5', 'e5'), move('a2', 'b2'),
      move('e5', 'e4'), move('b2', 'b1'), move('e4', 'd4'), move('b1', 'a1'),
    ]
    let state = battle('d4 h1 h2', 'a1 h8')
    for (let i = 0; i < 18; i++) {
      expect(result(state)).toBeNull()
      state = applyAction(state, cycle[i % cycle.length]!).state
    }
    expect(result(state)).toEqual({ reason: 'threefold', winner: null })
    expect(state.repetitions[positionKey(state)]).toBe(3)
    expect(deserialize(serialize(state))).toEqual(state)
  })

  it('keys relevant movement history but ignores relabeled counter IDs', () => {
    const root = battle('d4 h1', 'a8 h8')
    const state = applyAction(root, move('d4', 'd5')).state
    const relabeled: GameState = {
      ...state,
      board: state.board.map(counter => counter?.owner === 'white'
        ? { ...counter, id: 1 - counter.id }
        : counter),
      movement: {
        ...state.movement, white: state.movement.white.map(record => ({ ...record, id: 1 - record.id })),
      },
    }
    expect(positionKey(relabeled)).toBe(positionKey(state))
    expect(positionKey({ ...state, movement: root.movement })).not.toBe(positionKey(state))
    expect(positionKey({ ...state, turn: 'white' })).not.toBe(positionKey(state))
  })
})

describe('integrity', () => {
  it('leaves the original state unchanged when a post-removal path is invalid', () => {
    const state = battle('c4 e4 f8 h8', 'd4* g8* a1 c1')
    const before = serialize(state)
    expect(() => applyAction(state, { type: 'battle', remove: sq('d4'), path: path('c4', 'd5') })).toThrow()
    expect(serialize(state)).toBe(before)
  })

  it('replays a full action log and round trips throughout the game', () => {
    const start = { firstPlayer: 'black' } as const
    const log: Action[] = []
    let state = createGame(start)
    for (let i = 0; i < 150 && !result(state); i++) {
      const actions = legalActions(state)
      const action = actions[(i * 37) % actions.length]!
      log.push(action)
      state = applyAction(state, action).state
      expect(deserialize(serialize(state))).toEqual(state)
    }
    const replay = JSON.parse(JSON.stringify({ start, log })) as { start: typeof start; log: Action[] }
    expect(replay.log.reduce((game, action) => applyAction(game, action).state, createGame(replay.start))).toEqual(state)
  })

  it('applies every generated action in both phases and across removal choices', () => {
    const states = [
      createGame(),
      battle('c4 e4 f8 h8', 'd4* g8* a1 c1'),
      battle('b2 c2 d3 b3 c4', 'h8 g8'),
      battle('c4 e4 d3 d5', 'd4* h8'),
    ]
    for (const state of states) {
      const before = serialize(state)
      const actions = legalActions(state)
      expect(actions.length).toBeGreaterThan(0)
      expect(new Set(actions.map(formatAction)).size).toBe(actions.length)
      for (const action of actions) {
        const next = applyAction(state, action).state
        expect(deserialize(serialize(next))).toEqual(next)
      }
      expect(serialize(state)).toBe(before)
    }
  })

  it.each([
    (state: GameState) => ({ ...state, ruleset: 'wrong' }),
    (state: GameState) => ({ ...state, board: state.board.slice(1) }),
    (state: GameState) => ({ ...state, reserves: { white: -1, black: 0 } }),
    (state: GameState) => ({ ...state, removed: { white: 0, black: 0 } }),
    (state: GameState) => ({ ...state, board: state.board.map(c => c?.owner === 'white' ? { ...c, id: 0 } : c) }),
    (state: GameState) => ({ ...state, board: state.board.map(c => c?.owner === 'white' ? { ...c, status: 'imprisoned' } : c) }),
    (state: GameState) => ({ ...state, repetitions: { badKey: 2 } }),
    (state: GameState) => ({ ...state, repetitions: { [positionKey(state)]: 3 } }),
    (state: GameState) => ({ ...state, movement: { white: [{ id: 0, from: 64, to: 0 }], black: [] } }),
    (state: GameState) => ({ ...state, outcome: { reason: 'one-counter', winner: 'black' } }),
  ])('rejects a malformed snapshot', corrupt => {
    const state = battle('d4 h1', 'a8 h8')
    expect(() => deserialize(JSON.stringify(corrupt(state)))).toThrow(/Malformed/)
  })

  it.each([
    (at: number) => (at % 8) * 8 + 7 - Math.floor(at / 8),
    (at: number) => at - (at % 8) + 7 - (at % 8),
  ])('preserves custody cascades under rotation and reflection', transform => {
    const state = battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8')
    const mapBoard = (board: GameState['board']) => {
      const transformed = board.slice()
      board.forEach((counter, at) => { transformed[transform(at)] = counter })
      return transformed
    }
    const next = applyAction(state, move('c5', 'c4')).state
    const mirrored = { ...state, board: mapBoard(state.board) }
    const mapped = applyAction(mirrored, { type: 'battle', path: path('c5', 'c4').map(transform) }).state
    expect(mapped.board).toEqual(mapBoard(next.board))
    expect(mapped.outcome).toEqual(next.outcome)
    const abstract = (action: Action, map: (at: number) => number) => {
      if (action.type !== 'battle') throw new Error('Expected battle action')
      return [action.path?.[0], action.path?.at(-1)].map(at => map(at!)).join(':')
    }
    expect(legalActions(mirrored).map(action => abstract(action, at => at)).sort())
      .toEqual(legalActions(state).map(action => abstract(action, transform)).sort())
  })
})
