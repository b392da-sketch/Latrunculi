import { applyAction, createGame, parseSquare, positionKey } from '../src/engine/index.js'
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

/** Complete a real deployment while reserving named squares for a scripted test. */
export function deployWith(white: string[], black: string[], vacant: string[] = []): GameState {
  const unavailable = new Set([...white, ...black, ...vacant].map(sq))
  const available = Array.from({ length: 64 }, (_, at) => at).filter(at => !unavailable.has(at))
  const fill = (names: string[]) => [
    ...names.map(sq), ...available.splice(0, 20 - names.length),
  ]
  const bySide = { white: fill(white), black: fill(black) }
  let state = createGame()
  for (let i = 0; i < 20; i++) {
    for (const side of ['white', 'black'] as const) {
      state = applyAction(state, { type: 'place', at: bySide[side][i]! }).state
    }
  }
  return state
}
