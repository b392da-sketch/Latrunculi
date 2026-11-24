import { applyAction, createGame, legalActions, result } from '../src/engine/index.js'
import type { Action, GameState } from '../src/engine/index.js'
import { default as assert } from 'node:assert/strict'
import { defaults } from '../src/web/match.js'
import { deployWith, move } from './fixtures.js'
import { randomFor } from './seeded-random.js'

export function deploymentLog(state: GameState): Action[] {
  const indexed = new Map(state.board.flatMap((piece, at) => piece ? [[piece.id, at] as const] : []))
  return Array.from({ length: 40 }, (_, index) => {
    const id = Math.floor(index / 2) + (index % 2 ? 20 : 0)
    assert(indexed.has(id))
    return { type: 'place', at: indexed.get(id)! } as const
  })
}

export function gameFile(actions: readonly Action[], cursor = actions.length): string {
  return JSON.stringify({ version: 1, firstPlayer: 'white', actions, cursor, preferences: defaults })
}

export function replay(actions: readonly Action[]): GameState {
  return actions.reduce((state, action) => applyAction(state, action).state, createGame())
}

export function rescueLog(): Action[] {
  const deployed = deployWith(
    ['d4', 'c2', 'c5', 'c6', 'd3', 'h1'], ['b4', 'e4', 'h8'],
    ['c3', 'c4', 'd5', 'h7', 'g7', 'g8', 'f8', 'f7', 'g1', 'g2', 'h2'],
  )
  return [...deploymentLog(deployed), move('d4', 'd5'), move('h8', 'h7'), move('d5', 'd4'), move('b4', 'c4')]
}

export function terminalLog(): Action[] {
  const random = randomFor(2)
  let state = createGame()
  const actions: Action[] = []
  while (!result(state) && actions.length < 891) {
    const choices = legalActions(state)
    const action = choices[Math.floor(random() * choices.length)]!
    actions.push(action)
    state = applyAction(state, action).state
  }
  assert.equal(result(state)?.reason, 'one-counter')
  return actions
}
