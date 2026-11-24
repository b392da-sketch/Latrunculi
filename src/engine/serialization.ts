import { AREA, PER_PLAYER, opponent, steps, validSquare } from './board.js'
import { boundaryOutcome } from './game.js'
import { isHeld } from './imprisonment.js'
import { positionKey } from './repetition.js'
import { PLAYERS, RULESET } from './types.js'
import type { Counter, Counts, GameState, MoveRecord, Outcome, Player } from './types.js'

function requireSaved(condition: unknown): asserts condition {
  if (!condition) throw new Error('Malformed saved game')
}

function object(value: unknown): Record<string, unknown> {
  requireSaved(typeof value === 'object' && value !== null && !Array.isArray(value))
  return value as Record<string, unknown>
}

function player(value: unknown): Player {
  requireSaved(value === 'white' || value === 'black')
  return value
}

function integer(value: unknown, min: number, max: number): number {
  requireSaved(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max)
  return value
}

function counts(value: unknown, max: number): Counts {
  const { white, black } = object(value)
  return { white: integer(white, 0, max), black: integer(black, 0, max) }
}

function counterId(value: unknown, owner: Player): number {
  const first = owner === 'white' ? 0 : PER_PLAYER
  return integer(value, first, first + PER_PLAYER - 1)
}

function parseCounter(value: unknown): Counter | null {
  if (value === null) return null
  const { id, owner: rawOwner, status } = object(value)
  const owner = player(rawOwner)
  requireSaved(status === 'active' || status === 'imprisoned')
  return { id: counterId(id, owner), owner, status }
}

function movementRecords(value: unknown, owner: Player, board: GameState['board']): MoveRecord[] {
  requireSaved(Array.isArray(value) && value.length <= 2)
  const records = value.map(raw => {
    const { id, from, to } = object(raw)
    requireSaved(validSquare(from) && validSquare(to) && from !== to)
    const sameParity = (from % 2 === to % 2) && ((from >> 3) % 2 === (to >> 3) % 2)
    requireSaved(sameParity || steps[from]!.includes(to))
    return { id: counterId(id, owner), from, to }
  })
  const last = records.at(-1)
  if (last) requireSaved(board[last.to]?.id === last.id)
  if (records.length === 2) {
    const first = records[0]!
    requireSaved(first.id === last!.id && first.from === last!.to && first.to === last!.from)
  }
  return records
}

function parseOutcome(value: unknown): Outcome | null {
  if (value === null) return null
  const { reason, winner } = object(value)
  requireSaved(reason === 'one-counter' || reason === 'immobilization' || reason === 'threefold')
  return { reason, winner: winner === null ? null : player(winner) }
}

const recordKey = '(?:[0-9]|[1-5][0-9]|6[0-3])>(?:[0-9]|[1-5][0-9]|6[0-3])'
const historyKey = `(?:-|${recordKey}(?:,${recordKey})?)`
const battleKey = new RegExp(`^${RULESET}\\|battle\\|(white|black)\\|-\\|0\\|0\\|[.wWbB]{64}\\|${historyKey}/${historyKey}$`)

function validateState(state: GameState): void {
  const { board, reserves, removed, phase, movement, repetitions, outcome, firstPlayer, turn } = state
  const ids = new Set<number>()
  const onBoard = { white: 0, black: 0 }
  board.forEach((counter, at) => {
    if (!counter) return
    requireSaved(!ids.has(counter.id))
    ids.add(counter.id)
    onBoard[counter.owner]++
    if (counter.status === 'imprisoned') {
      requireSaved(phase === 'battle' && isHeld(board, at, counter.owner))
    }
  })
  for (const owner of PLAYERS) {
    requireSaved(onBoard[owner] + reserves[owner] + removed[owner] === PER_PLAYER)
  }
  if (phase === 'deployment') {
    const other = opponent(firstPlayer)
    const expected = onBoard[firstPlayer] - onBoard[other]
    requireSaved(reserves.white + reserves.black > 0 && removed.white + removed.black === 0)
    requireSaved(expected === (turn === firstPlayer ? 0 : 1))
    requireSaved(!outcome && !movement.white.length && !movement.black.length && !Object.keys(repetitions).length)
    for (const owner of PLAYERS) {
      const first = owner === 'white' ? 0 : PER_PLAYER
      for (let i = 0; i < onBoard[owner]; i++) requireSaved(ids.has(first + i))
    }
    return
  }

  requireSaved(reserves.white + reserves.black === 0 && Object.keys(repetitions).length > 0)
  const key = positionKey(state)
  for (const [pastKey, count] of Object.entries(repetitions)) {
    requireSaved(battleKey.test(pastKey) && (count < 3 || (key === pastKey && outcome !== null)))
  }
  // Only a one-counter ending occurs during removal, before a new
  // boundary is recorded. Other terminal outcomes must have a visit.
  const expected = boundaryOutcome({ ...state, outcome: null })
  if (outcome) {
    requireSaved(expected?.reason === outcome.reason && expected.winner === outcome.winner)
    requireSaved(outcome.reason === 'one-counter' || repetitions[key] !== undefined)
  } else {
    requireSaved(!expected && repetitions[key] !== undefined)
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state)
}

export function deserialize(json: string): GameState {
  const value = object(JSON.parse(json))
  requireSaved(value.ruleset === RULESET)
  const { phase } = value
  requireSaved(phase === 'deployment' || phase === 'battle')
  requireSaved(Array.isArray(value.board) && value.board.length === AREA)
  const board = value.board.map(parseCounter)
  const rawMovement = object(value.movement)
  const repetitions = Object.fromEntries(
    Object.entries(object(value.repetitions)).map(([key, count]) => [key, integer(count, 1, 3)]),
  )
  const state: GameState = {
    ruleset: RULESET, board, phase, repetitions,
    reserves: counts(value.reserves, PER_PLAYER),
    removed: counts(value.removed, PER_PLAYER - 1),
    firstPlayer: player(value.firstPlayer),
    turn: player(value.turn),
    movement: {
      white: movementRecords(rawMovement.white, 'white', board),
      black: movementRecords(rawMovement.black, 'black', board),
    },
    outcome: parseOutcome(value.outcome),
  }
  validateState(state)
  return state
}
