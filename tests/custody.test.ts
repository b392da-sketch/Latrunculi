import { describe, expect, it } from 'vitest'
import { applyAction, formatEvent, mandatoryRemovals } from '../src/engine/index.js'
import { battle, move, sq } from './fixtures.js'

describe('imprisonment and liberation', () => {
  it.each([
    ['c5 e4 a1', 'd4 h8', 'c5', 'c4', 'd4'],
    ['d6 d3 a1', 'd4 h8', 'd6', 'd5', 'd4'],
    ['c1 a2 h1', 'a1 h8', 'c1', 'b1', 'a1'],
  ])('holds opposite or corner neighbors with %s', (white, black, from, to, victim) => {
    const next = applyAction(battle(white, black), move(from, to))
    expect(next.state.board[sq(victim)]?.status).toBe('imprisoned')
    expect(next.events.map(formatEvent)).toContain(`[${victim}]`)
  })

  it('does not use the non-corner board edge as a captor', () => {
    const next = applyAction(battle('d3 h1', 'd1 h8'), move('d3', 'd2'))
    expect(next.state.board[sq('d1')]?.status).toBe('active')
  })

  it('does not imprison a moving counter or an unrelated static sandwich', () => {
    const state = battle('d3 a1 c7 e7', 'c4 e4 d7 h8')
    const next = applyAction(state, move('d3', 'd4'))
    expect(next.events.map(event => event.type)).toEqual(['movement'])
  })

  it('imprisons two enemies simultaneously', () => {
    const state = battle('c5 e4 c2', 'd4 c3 h8')
    const next = applyAction(state, move('c5', 'c4'))
    expect(next.events.map(formatEvent)).toEqual(['c5-c4', '[c3]', '[d4]'])
  })

  it('evaluates custody only at the final landing of a leap sequence', () => {
    const state = battle('a4 b4 c5 e4', 'd4 h8')
    expect(applyAction(state, move('a4', 'c4')).events.map(formatEvent)).toContain('[d4]')
    expect(applyAction(state, move('a4', 'c4', 'c6')).events.map(formatEvent)).toEqual(['a4~c4~c6'])
  })

  it('does not let an imprisoned counter act as a captor', () => {
    const state = battle('c5 e4* h1', 'd4 e3 e5')
    const next = applyAction(state, move('c5', 'c4'))
    expect(next.state.board[sq('d4')]?.status).toBe('active')
  })

  it('rescues prisoners and uses each new friendly rescuer as a capture trigger', () => {
    const state = battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8')
    const next = applyAction(state, move('c5', 'c4'))
    expect(next.events.map(formatEvent)).toEqual(['c5-c4', '[d4]', '+d3', '[c3]', '+c2', '[d2]'])
    expect(mandatoryRemovals(next.state)).toEqual([])
    expect(() => applyAction(next.state, { type: 'battle', remove: sq('d3') })).toThrow()
  })

  it('preserves an overlapping pair but liberates when the final pair is broken', () => {

    // Test movement disruption on the opponent's turn via the rule resolver:
    // a holding side may move a captor only after removing another prisoner.
    const multiple = battle('c4 e4 d3 d5 f8 h8', 'd4* g8* a1 c1')
    const retained = applyAction(multiple, { type: 'battle', remove: sq('g8'), path: [sq('c4'), sq('c5')] })
    expect(retained.state.board[sq('d4')]?.status).toBe('imprisoned')

    const single = battle('c4 e4 f8 h8', 'd4* g8* a1 c1')
    const rescued = applyAction(single, { type: 'battle', remove: sq('g8'), path: [sq('c4'), sq('c5')] })
    expect(rescued.events.map(formatEvent)).toEqual(['xg8', 'c4-c5', '+d4'])
    expect(rescued.state.board[sq('d4')]?.status).toBe('active')
  })
})
