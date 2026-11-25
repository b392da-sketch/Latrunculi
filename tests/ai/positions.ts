import { applyAction, createGame, legalActions } from '../../src/engine/index.js'
import type { Action, GameState } from '../../src/engine/index.js'
import { randomFor } from '../../src/ai/index.js'
import { battle, deployWith, move } from '../fixtures.js'
import { deploymentLog, replay } from '../web-fixtures.js'

export function seededLog(seed: number, actions: number): Action[] {
  let state = createGame()
  const random = randomFor(seed)
  const log: Action[] = []
  for (let i = 0; i < actions; i++) {
    const moves = legalActions(state)
    if (!moves.length) throw new Error(`Seed ${seed} ended at action ${i}`)
    const action = moves[Math.floor(random() * moves.length)]!
    state = applyAction(state, action).state
    log.push(action)
  }
  return log
}

export function seededPosition(seed: number, actions: number): GameState {
  return replay(seededLog(seed, actions))
}

export function multiplePrisonersLog(): Action[] {
  const opening = deployWith(['c5', 'c2', 'e4'], ['c3', 'd4', 'h8'], ['c4', 'h7'])
  return [...deploymentLog(opening), move('c5', 'c4'), move('h8', 'h7')]
}

export function multiplePrisoners(): GameState {
  return replay(multiplePrisonersLog())
}

export function cyclePosition(plies: number): GameState {
  const cycle = [
    move('d4', 'd5'), move('a1', 'a2'), move('d5', 'e5'), move('a2', 'b2'),
    move('e5', 'e4'), move('b2', 'b1'), move('e4', 'd4'), move('b1', 'a1'),
  ]
  let state = battle('d4 h1 h2', 'a1 h8')
  for (let i = 0; i < plies; i++) state = applyAction(state, cycle[i % cycle.length]!).state
  return state
}

export function immobilizingReply(state: GameState, action: Action): boolean {
  const next = applyAction(state, action).state
  return next.outcome?.winner === 'black' || legalActions(next).some(reply =>
    applyAction(next, reply).state.outcome?.winner === 'black')
}
