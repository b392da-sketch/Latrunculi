import { PLAYERS, type GameState } from './types.js'

/** Identical counters are interchangeable, including in movement memory. */
export function positionKey(state: GameState): string {
  const cells = state.board.map(counter => {
    if (!counter) return '.'
    if (counter.owner === 'white') return counter.status === 'active' ? 'w' : 'W'
    return counter.status === 'active' ? 'b' : 'B'
  }).join('')
  const history = PLAYERS.map(player => {
    const records = state.movement[player]
    const last = records.at(-1)
    if (!last || state.board[last.to]?.id !== last.id) return '-'
    return records.map(({ from, to }) => `${from}>${to}`).join(',')
  }).join('/')
  return [
    state.ruleset, state.phase, state.turn, state.phase === 'deployment' ? state.firstPlayer : '-', state.reserves.white, state.reserves.black, cells, history,
  ].join('|')
}
