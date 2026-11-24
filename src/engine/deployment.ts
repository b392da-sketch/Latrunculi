import { PER_PLAYER, opponent } from './board.js'
import type { GameState, Square, Transition } from './types.js'

export function deploy(state: GameState, at: Square): Transition {
  const { turn } = state
  if (state.board[at] !== null || state.reserves[turn] === 0) throw new Error('Illegal placement')
  const id = (turn === 'white' ? 0 : PER_PLAYER) + PER_PLAYER - state.reserves[turn]
  const counter = { id, owner: turn, status: 'active' } as const
  const board = state.board.slice()
  board[at] = counter
  const reserves = { ...state.reserves, [turn]: state.reserves[turn] - 1 }
  const placement = { type: 'placement', at, counter } as const
  if (reserves.white + reserves.black > 0) {
    return { state: { ...state, board, reserves, turn: opponent(turn) }, events: [placement] }
  }
  return {
    state: { ...state, board, reserves, phase: 'battle', turn: state.firstPlayer },
    events: [placement, { type: 'phase', phase: 'battle' }],
  }
}
