import { expect, it } from 'vitest'
import { applyAction } from '../src/engine/index.js'
import { isHeld } from '../src/engine/imprisonment.js'
import { examples } from '../src/web/Reference.js'
import { battle, move, sq } from './fixtures.js'

function position(diagram: Record<string, string>, whiteExtra = ['h1'], blackExtra = ['h8', 'g8']) {
  const group = (owner: 'white' | 'black', extra: string[]) => [
    ...Object.entries(diagram).flatMap(([at, value]) =>
      value.startsWith(owner) ? [at + (value.endsWith('-prisoner') ? '*' : '')] : []),
    ...extra,
  ].join(' ')
  return battle(group('white', whiteExtra), group('black', blackExtra))
}

it('shows both legal landings of an orthogonal chain that changes direction', () => {
  const { pieces, marked } = examples[1]
  const state = position(pieces)
  expect(() => applyAction(state, move('a2', ...marked))).not.toThrow()
})

it('shows the horizontal, vertical and true board-corner holding pairs', () => {
  const { pieces } = examples[2]
  const state = position(pieces)
  for (const at of ['a1', 'b3', 'd2']) expect(isHeld(state.board, sq(at), 'black')).toBe(true)
})

it('shows a white prisoner rescued by imprisoning its black captor', () => {
  const { pieces, marked } = examples[3]
  const state = position(pieces)
  expect(isHeld(state.board, sq('b2'), 'white')).toBe(true)
  const next = applyAction(state, move('a4', ...marked))
  expect(next.events.map(event => event.type)).toEqual(['movement', 'imprisonment', 'liberation'])
  expect(next.state.board[sq('a2')]?.status).toBe('imprisoned')
  expect(next.state.board[sq('b2')]?.status).toBe('active')
})
