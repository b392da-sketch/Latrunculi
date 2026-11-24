import { holdingPairs, opponent, steps } from '../engine/board.js'
import type { GameState, Player } from '../engine/index.js'
import { activeAt } from './features.js'

/** M1's unmodified scoring terms, including its historical treatment of threefold previews. */
export function legacyValue(state: GameState, side: Player): number {
  const enemy = opponent(side)
  const { board, outcome, removed } = state
  if (outcome && outcome.reason !== 'threefold') {
    return outcome.winner === null ? 0 : outcome.winner === side ? 10_000 : -10_000
  }

  let score = 20 * (removed[enemy] - removed[side])
  board.forEach((counter, at) => {
    if (counter?.status === 'imprisoned') score += counter.owner === side ? -12 : 10
    else if (counter?.owner === side) {
      const threatened = holdingPairs[at]!.some(pair =>
        pair.some((captor, index) => {
          const gap = pair[1 - index]!
          return activeAt(board, captor, enemy) && board[gap] === null &&
            steps[gap]!.some(from => from !== captor && activeAt(board, from, enemy))
        }),
      )
      if (threatened) score -= 2
    }
  })
  return score
}
