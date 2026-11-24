import { createGame, parseSquare, positionKey } from '../src/engine/index.js'
import type { Action, Counter, GameState, Player } from '../src/engine/index.js'

export const sq = parseSquare
export const path = (...names: string[]) => names.map(sq)
export function move(...names: string[]): Action {
  return { type: 'battle', path: path(...names) }
}

export function battle(white: string, black: string, turn: Player = 'white'): GameState {
  const board: (Counter | null)[] = Array.from({ length: 64 }, () => null)
  const place = (names: string, owner: Player, offset: number): number => {
    const pieces = names.split(' ')
    pieces.forEach((name, i) => {
      const at = sq(name.slice(0, 2))
      if (board[at]) throw new Error('Duplicate fixture square')
      board[at] = { id: offset + i, owner, status: name.endsWith('*') ? 'imprisoned' : 'active' }
    })
    return 20 - pieces.length
  }
  const removed = { white: place(white, 'white', 0), black: place(black, 'black', 20) }
  const state: GameState = {
    ...createGame(), board, phase: 'battle', turn, removed, reserves: { white: 0, black: 0 },
  }
  return { ...state, repetitions: { [positionKey(state)]: 1 } }
}
