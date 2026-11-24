import { adjacentVictims, holdingPairs, opponent, steps } from '../engine/board.js'
import type { Action, GameState, Square } from '../engine/index.js'

/** Cheap ordering hints only. Actual terminal scores and effects come from applyAction. */
export function priority(state: GameState, action: Action): number {
  if (action.type === 'place') {
    return steps[action.at]!.filter(at => state.board[at] === null).length
  }
  if (!action.path) return 10_000
  const from = action.path[0]!
  const to = action.path.at(-1)!
  const mover = state.turn
  const enemy = opponent(mover)
  const active = (at: Square) => at !== from && state.board[at]?.owner === mover &&
    state.board[at]?.status === 'active'
  let value = action.remove === undefined ? 0 : 100
  for (const target of adjacentVictims[to]!) {
    if (target === action.remove || state.board[target]?.owner !== enemy ||
      state.board[target]?.status !== 'active') continue
    if (!holdingPairs[target]!.some(([a, b]) => (a === to && active(b)) || (b === to && active(a)))) continue
    value += 20
    for (const captive of adjacentVictims[target]!) {
      if (state.board[captive]?.owner === mover && state.board[captive]?.status === 'imprisoned') value += 12
    }
  }
  return value
}

export function sameAction(a: Action, b: Action | undefined): boolean {
  if (a.type === 'place') return b?.type === 'place' && a.at === b.at
  return b?.type === 'battle' && a.remove === b.remove && a.path?.[0] === b.path?.[0] &&
    a.path?.at(-1) === b.path?.at(-1)
}

export function ordered(state: GameState, actions: readonly Action[], preferred?: Action): Action[] {
  return actions.map(action => ({ action, priority: sameAction(action, preferred) ? Infinity : priority(state, action) }))
    .sort((a, b) => b.priority - a.priority).map(entry => entry.action)
}
