import { adjacentVictims, holdingPairs, opponent, SQUARES } from './board.js'
import type { Board, Counter, GameEvent, Player, Square } from './types.js'

function activeAt(board: Board, at: Square, owner: Player): boolean {
  return board[at]?.owner === owner && board[at]?.status === 'active'
}

export function isHeld(board: Board, at: Square, owner: Player): boolean {
  const enemy = opponent(owner)
  return holdingPairs[at]!.some(([a, b]) => activeAt(board, a, enemy) && activeAt(board, b, enemy))
}

export function resolveCustody(board: (Counter | null)[], player: Player, landed: Square): GameEvent[] {
  const events: GameEvent[] = []
  const enemy = opponent(player)
  let triggers = [landed]
  while (triggers.length > 0) {
    const victims = new Set<Square>()
    for (const from of triggers) {
      for (const at of adjacentVictims[from]!) {
        if (!activeAt(board, at, enemy)) continue
        const closesPair = holdingPairs[at]!.some(([a, b]) =>
          (a === from && activeAt(board, b, player)) || (b === from && activeAt(board, a, player)),
        )
        if (closesPair) victims.add(at)
      }
    }

    for (const at of [...victims].sort((a, b) => a - b)) {
      const counter = { ...board[at]!, status: 'imprisoned' } as const
      board[at] = counter
      events.push({ type: 'imprisonment', at, counter })
    }

    const freed = SQUARES.filter(at => {
      const counter = board[at]
      return counter?.status === 'imprisoned' && !isHeld(board, at, counter.owner)
    })
    triggers = []
    for (const at of freed) {
      const counter = { ...board[at]!, status: 'active' } as const
      board[at] = counter
      events.push({ type: 'liberation', at, counter })
      if (counter.owner === player) triggers.push(at)
    }
  }
  return events
}
