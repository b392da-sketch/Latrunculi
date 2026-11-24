import { expect, it } from 'vitest'
import {
  applyAction, deserialize, formatEvent, legalActions, positionKey, result, serialize,
} from '../src/engine/index.js'
import { deployWith, move, path, sq } from './fixtures.js'

it('counts a sixteen-ply loop from a real deployment and stops on its third visit', () => {
  const white = ['a1', 'b1', 'c1', 'c2', 'c3', 'b3', 'a3', 'a2']
  const black = ['f6', 'g6', 'h6', 'h7', 'h8', 'g8', 'f8', 'f7']
  let state = deployWith([white[0]!], [black[0]!], [...white.slice(1), ...black.slice(1)])
  const cycle = white.flatMap((from, i) => [
    move(from, white[(i + 1) % 8]!),
    move(black[i]!, black[(i + 1) % 8]!),
  ])
  let firstKey: string | undefined
  for (let i = 0; i < 34; i++) {
    expect(result(state)).toBeNull()
    state = applyAction(state, cycle[i % cycle.length]!).state
    if (i === 1) firstKey = positionKey(state)
    if (i % 16 === 1) {
      expect(positionKey(state)).toBe(firstKey)
      expect(state.repetitions[firstKey!]).toBe(1 + Math.floor(i / 16))
    }
  }
  expect(result(state)).toEqual({ reason: 'threefold', winner: null })
  expect(deserialize(serialize(state))).toEqual(state)
})

it('counts identical custody and movement memory despite different deployment IDs', () => {
  const black = ['d4', 'h8']
  const vacant = ['c4', 'h7']
  const actions = [move('c5', 'c4'), move('h8', 'h7')]
  const states = [
    deployWith(['c5', 'e4'], black, vacant),
    deployWith(['e4', 'c5'], black, vacant),
  ].map(state => actions.reduce((game, action) => applyAction(game, action).state, state))
  const [a, b] = states
  expect(a!.board[sq('c4')]?.id).not.toBe(b!.board[sq('c4')]?.id)
  expect(a!.board[sq('d4')]?.status).toBe('imprisoned')
  expect(a!.movement.white[0]?.id).not.toBe(b!.movement.white[0]?.id)
  expect(positionKey(a!)).toBe(positionKey(b!))
  expect(a!.repetitions).toEqual(b!.repetitions)
  expect(legalActions(a!)).toEqual(legalActions(b!))
})

it('counts equivalent leap routes in a longer threefold loop', () => {
  const black = ['a8', 'b8', 'b7', 'a7']
  let state = deployWith(
    ['b2', 'c2', 'd3', 'b3', 'c4'], [black[0]!],
    ['d2', 'b4', 'd4', ...black.slice(1)],
  )
  for (let i = 0; i < 50; i++) {
    expect(result(state)).toBeNull()
    const turn = Math.floor(i / 2)
    const white = i % 2 === 0
    const whiteMoves = [
      Math.floor(turn / 12) % 2 === 0 ? move('b2', 'd2', 'd4') : move('b2', 'b4', 'd4'),
      move('d4', 'b4'),
      move('b4', 'b2'),
    ]
    if (white && turn % 3 === 0) {
      const first = applyAction(state, move('b2', 'd2', 'd4'))
      const second = applyAction(state, move('b2', 'b4', 'd4'))
      expect(first.events).not.toEqual(second.events)
      expect(first.state).toEqual(second.state)
    }
    const action = white ? whiteMoves[turn % 3]! : move(black[turn % 4]!, black[(turn + 1) % 4]!)
    state = applyAction(state, action).state
    if (i % 24 === 1) expect(state.repetitions[positionKey(state)]).toBe(1 + Math.floor(i / 24))
  }
  expect(result(state)).toEqual({ reason: 'threefold', winner: null })
  expect(deserialize(serialize(state))).toEqual(state)
})

it('retains oscillation memory on imprisonment, counts rescue, and resets the ledger on removal', () => {
  let state = deployWith(
    ['d4', 'c2', 'c5', 'c6', 'd3', 'h1'], ['b4', 'e4', 'h8'],
    ['c3', 'c4', 'd5', 'h7', 'g7', 'g8', 'f8', 'f7', 'g1', 'g2', 'h2'],
  )
  for (const action of [move('d4', 'd5'), move('h8', 'h7'), move('d5', 'd4')]) {
    state = applyAction(state, action).state
  }
  const history = state.movement.white
  expect(history).toHaveLength(2)
  const capture = applyAction(state, move('b4', 'c4'))
  expect(capture.events.map(formatEvent)).toContain('[d4]')
  expect(capture.state.movement.white).toEqual(history)
  const captureKey = positionKey(capture.state)
  expect(capture.state.repetitions[captureKey]).toBe(1)
  const withoutCustody = {
    ...capture.state, board: capture.state.board.map((counter, at) =>
      at === sq('d4') ? { ...counter!, status: 'active' as const } : counter),
  }
  expect(positionKey(withoutCustody)).not.toBe(captureKey)
  expect(() => applyAction(withoutCustody, move('d4', 'd5'))).toThrow(/oscillation/)
  expect(() => applyAction(capture.state, move('d4', 'd5'))).toThrow(/moving counter/)

  const rescue = applyAction(capture.state, move('c2', 'c3'))
  expect(rescue.events.map(formatEvent)).toEqual(['c2-c3', '[c4]', '+d4'])
  expect(rescue.state.movement.white).toHaveLength(1)
  const rescueKey = positionKey(rescue.state)
  expect(rescue.state.repetitions).toMatchObject({ [captureKey]: 1, [rescueKey]: 1 })

  state = applyAction(rescue.state, move('h7', 'g7')).state
  const removal = { type: 'battle', remove: sq('c4'), path: path('d4', 'd5') } as const
  expect(legalActions(state)).toContainEqual(removal)
  const next = applyAction(state, removal).state
  expect(next.repetitions).toEqual({ [positionKey(next)]: 1 })
  expect(next.movement.black).toEqual(state.movement.black)
  const freshCycle = [
    move('g7', 'g8'), move('h1', 'g1'), move('g8', 'f8'), move('g1', 'g2'),
    move('f8', 'f7'), move('g2', 'h2'), move('f7', 'g7'), move('h2', 'h1'),
  ]
  state = next
  for (let i = 0; i < 18; i++) {
    expect(result(state)).toBeNull()
    state = applyAction(state, freshCycle[i % freshCycle.length]!).state
  }
  expect(result(state)).toEqual({ reason: 'threefold', winner: null })
  expect(state.repetitions[captureKey]).toBeUndefined()
  expect(state.repetitions[rescueKey]).toBeUndefined()
  expect(deserialize(serialize(state))).toEqual(state)
})
