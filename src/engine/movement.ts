import { jumps, SQUARES, steps, validSquare } from './board.js'
import type { Board, Counter, MoveRecord, Player, Square } from './types.js'

function oscillates(history: readonly MoveRecord[], id: number, from: Square, to: Square): boolean {
  const [previous, last] = history
  return history.length === 2 && previous!.id === id && last!.id === id &&
    previous!.from === from && previous!.to === to && last!.from === to && last!.to === from
}

export function validatePath(
  board: Board, player: Player, history: readonly MoveRecord[], path: readonly Square[],
): Counter {
  if (!Array.isArray(path) || path.length < 2 || !path.every(validSquare)) throw new Error('Invalid path')
  const [from, first] = path
  const counter = board[from!]
  if (counter?.owner !== player || counter.status !== 'active') throw new Error('Invalid moving counter')
  if (new Set(path).size !== path.length) throw new Error('Repeated landing')
  if (path.length === 2 && steps[from!]!.includes(first!)) {
    if (board[first!] !== null) throw new Error('Occupied destination')
  } else {
    for (let i = 1; i < path.length; i++) {
      const hop = jumps[path[i - 1]!]!.find(({ to }) => to === path[i])
      if (!hop || board[hop.over]?.owner !== player || board[hop.to] !== null) {
        throw new Error('Illegal leap')
      }
    }
  }
  if (oscillates(history, counter.id, from!, path.at(-1)!)) throw new Error('Prohibited oscillation')
  return counter
}

export function* movementPaths(
  board: Board, player: Player, history: readonly MoveRecord[],
): Generator<readonly Square[]> {
  for (const from of SQUARES) {
    const counter = board[from]
    if (counter?.owner !== player || counter.status !== 'active') continue
    for (const to of steps[from]!) {
      if (board[to] === null && !oscillates(history, counter.id, from, to)) yield [from, to]
    }

    // The leap graph is fixed: intermediate landings are vacated and the origin
    // cannot be a hurdle (leaps preserve both coordinate parities).
    const visited = new Set([from])
    const queue: Square[][] = [[from]]
    for (const path of queue) {
      for (const { over, to } of jumps[path.at(-1)!]!) {
        if (visited.has(to) || board[to] !== null || board[over]?.owner !== player) continue
        visited.add(to)
        const extended = [...path, to]
        queue.push(extended)
        if (!oscillates(history, counter.id, from, to)) yield extended
      }
    }
  }
}

export function recordMove(history: readonly MoveRecord[], move: MoveRecord): readonly MoveRecord[] {
  const last = history.at(-1)
  return last?.id === move.id && last.from === move.to && last.to === move.from
    ? [last, move]
    : [move]
}
