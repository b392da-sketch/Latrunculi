import { applyAction, legalActions, result } from '../src/engine/index.js'
import type { Action } from '../src/engine/index.js'
import { deployWith } from './fixtures.js'
import { randomFor } from './seeded-random.js'
import { deploymentLog } from './web-fixtures.js'

/** Both sides stay in their own half, separated by two empty ranks. */
export function quietHistory(length: number): Action[] {
  const ranks = (from: number) => [from, from + 1, from + 2].flatMap(rank =>
    [...'abcdefgh'].map(file => `${file}${rank}`),
  )
  const white = ranks(1)
  const black = ranks(6)
  let state = deployWith(white.slice(0, 20), black.slice(0, 20), [
    ...white.slice(20), ...black.slice(20), ...ranks(4).slice(0, 16),
  ])
  const log = deploymentLog(state)
  const random = randomFor(19)
  while (log.length < length && !result(state)) {
    const moves = legalActions(state).filter(action => action.type === 'battle' &&
      action.path?.every(at => state.turn === 'white' ? at < 24 : at >= 40))
    const move = moves[Math.floor(random() * moves.length)]
    if (!move) throw new Error(`Quiet fixture blocked after ${log.length} actions`)
    state = applyAction(state, move).state
    if (state.removed.white || state.removed.black) throw new Error('Unexpected removal in quiet fixture')
    log.push(move)
  }
  if (log.length !== length) throw new Error(`Quiet fixture ended at ${log.length}: ${JSON.stringify(result(state))}`)
  return log
}
