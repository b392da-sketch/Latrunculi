import { describe, expect, it } from 'vitest'
import { applyAction, createGame, legalActions } from '../src/engine/index.js'
import { battle, move, sq } from './fixtures.js'

describe('deployment', () => {
  it.each(['white', 'black'] as const)('alternates forty placements with %s starting', firstPlayer => {
    let state = createGame({ firstPlayer })
    const second = firstPlayer === 'white' ? 'black' : 'white'
    for (let at = 0; at < 40; at++) {
      expect(state.turn).toBe(at % 2 === 0 ? firstPlayer : second)
      expect(legalActions(state)).toHaveLength(64 - at)
      const next = applyAction(state, { type: 'place', at })
      expect(next.events.map(event => event.type)).toEqual(at === 39 ? ['placement', 'phase'] : ['placement'])
      state = next.state
      expect(state.reserves[firstPlayer]).toBe(20 - Math.ceil((at + 1) / 2))
      expect(state.reserves[second]).toBe(20 - Math.floor((at + 1) / 2))
      expect(state.board[at]?.status).toBe('active')
    }
    // Alternate colors on consecutive files, which leaves many static sandwiches.
    expect(state.board.slice(0, 3).map(counter => counter?.owner)).toEqual([firstPlayer, second, firstPlayer])
    expect(state.phase).toBe('battle')
    expect(state.turn).toBe(firstPlayer)
    expect(state.reserves).toEqual({ white: 0, black: 0 })
  })

  it('rejects occupied, fractional, and out-of-bounds squares', () => {
    const state = applyAction(createGame(), { type: 'place', at: 0 }).state
    for (const at of [0, -1, 64, 0.5]) expect(() => applyAction(state, { type: 'place', at })).toThrow()
  })
})

describe('battle movement', () => {
  it.each(['c4', 'd3', 'd5', 'e4'])('allows the cardinal step d4–%s', to => {
    const state = battle('d4 a1', 'g8 h8')
    expect(legalActions(state)).toContainEqual(move('d4', to))
    expect(applyAction(state, move('d4', to)).state.board[sq(to)]?.owner).toBe('white')
  })

  it.each([
    ['d4', 'e5'], ['d4', 'e4'], ['d4', 'g4'], ['d4', 'f4'],
    ['d4', 'f4', 'f5'], ['d4', 'f4', 'd4'], ['d4', 'c4', 'a4'],
  ])('rejects illegal movement %j', (...names) => {
    const state = battle('d4 b4 h1', 'e4 h8')
    expect(() => applyAction(state, move(...names))).toThrow()
  })

  it('supports a chain, a turn, and an early stop over a friendly prisoner', () => {
    const state = battle('b2 c2* d3', 'c1 c3 h8')
    for (const action of [move('b2', 'd2'), move('b2', 'd2', 'd4')]) {
      expect(legalActions(state)).toContainEqual(action)
      expect(() => applyAction(state, action)).not.toThrow()
    }
    expect(() => applyAction(state, move('c2', 'd2'))).toThrow()
  })

  it('generates one path per endpoint while accepting alternate equivalent paths', () => {
    const state = battle('b2 c2 d3 b3 c4', 'h8 g8')
    const shortList = legalActions(state).filter(action =>
      action.type === 'battle' && action.path?.[0] === sq('b2') && action.path.at(-1) === sq('d4'),
    )
    expect(shortList).toHaveLength(1)
    const a = applyAction(state, move('b2', 'd2', 'd4')).state
    const b = applyAction(state, move('b2', 'b4', 'd4')).state
    expect(a).toEqual(b)
    expect(() => applyAction(state, move('b2', 'd2', 'd4', 'b4', 'b2'))).toThrow(/Repeated/)
  })
})
