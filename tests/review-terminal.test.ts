import { expect, it } from 'vitest'
import {
  applyAction, createGame, deserialize, legalActions, mandatoryRemovals, result, serialize,
} from '../src/engine/index.js'
import { deployWith, move, path, sq } from './fixtures.js'
import { randomFor } from './seeded-random.js'

it('offers both captor steps for each of two prisoners reached from deployment', () => {
  let state = deployWith(
    ['c5', 'c2', 'e4'], ['c3', 'd4', 'h8'], ['c4', 'h7'],
  )
  state = applyAction(state, move('c5', 'c4')).state
  state = applyAction(state, move('h8', 'h7')).state
  expect(mandatoryRemovals(state)).toEqual(path('c3', 'd4'))
  const actions = legalActions(state)
  for (const [victim, first, second] of [
    ['c3', 'c2', 'c4'], ['d4', 'c4', 'e4'],
  ] as const) {
    expect(actions).not.toContainEqual({ type: 'battle', remove: sq(victim) })
    for (const from of [first, second]) {
      const action = { type: 'battle', remove: sq(victim), path: path(from, victim) } as const
      expect(actions).toContainEqual(action)
      expect(applyAction(state, action).events.map(event => event.type).slice(0, 2))
        .toEqual(['removal', 'movement'])
    }
  }
})

it('round-trips immobilization immediately after a legal deployment', () => {
  const state = deployWith(
    [...'abcdefgh'].flatMap(file => [`${file}1`, `${file}2`]).concat(['a3', 'b3', 'c3', 'd3']),
    ['e3', 'f3', 'g3', 'h3', 'a4', 'b4', 'c4', 'd4'],
  )
  expect(result(state)).toEqual({ reason: 'immobilization', winner: null })
  expect(deserialize(serialize(state))).toEqual(state)
  const first = deployWith(['h8'], ['a1'])
  expect(() => deserialize(serialize({ ...state, repetitions: first.repetitions }))).toThrow(/Malformed/)
})

it('round-trips one-counter termination in a seeded game from the empty board', () => {
  const random = randomFor(2)
  let state = createGame()
  for (let ply = 0; ply < 891; ply++) {
    const actions = legalActions(state)
    state = applyAction(state, actions[Math.floor(random() * actions.length)]!).state
  }
  expect(result(state)).toEqual({ reason: 'one-counter', winner: 'white' })
  expect(deserialize(serialize(state))).toEqual(state)
})
