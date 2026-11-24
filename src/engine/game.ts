import { AREA, opponent, PER_PLAYER, SQUARES, validSquare } from './board.js'
import { deploy } from './deployment.js'
import { resolveCustody } from './imprisonment.js'
import { movementPaths, recordMove, validatePath } from './movement.js'
import { positionKey } from './repetition.js'
import { PLAYERS, RULESET } from './types.js'
import type { Action, GameEvent, GameState, Outcome, Player, Square, Transition } from './types.js'

export function createGame({ firstPlayer = 'white' }: { firstPlayer?: Player } = {}): GameState {
  if (!PLAYERS.includes(firstPlayer)) throw new Error('Invalid starting player')
  return {
    ruleset: RULESET,
    board: Array.from({ length: AREA }, () => null),
    reserves: { white: PER_PLAYER, black: PER_PLAYER },
    removed: { white: 0, black: 0 },
    phase: 'deployment',
    firstPlayer,
    turn: firstPlayer,
    movement: { white: [], black: [] },
    repetitions: {},
    outcome: null,
  }
}

export function result(state: GameState): Outcome | null {
  return state.outcome
}

/** An empty list means no removal is required at this boundary. */
export function mandatoryRemovals(state: GameState): readonly Square[] {
  if (state.phase !== 'battle' || state.outcome) return []
  return SQUARES.filter(at => {
    const counter = state.board[at]
    return counter?.owner === opponent(state.turn) && counter.status === 'imprisoned'
  })
}

export function materialOutcome(state: GameState, reason: 'one-counter' | 'immobilization'): Outcome {
  const { white, black } = state.removed
  return { reason, winner: black === white ? null : black > white ? 'white' : 'black' }
}

function reachesOneCounter(state: GameState): boolean {
  return PLAYERS.some(player => state.removed[player] === PER_PLAYER - 1)
}

function removePrisoner(state: GameState, at: Square): Transition {
  const board = state.board.slice()
  const counter = board[at]!
  board[at] = null
  const removed = { ...state.removed, [counter.owner]: state.removed[counter.owner] + 1 }
  const movement = state.movement[counter.owner].some(move => move.id === counter.id)
    ? { ...state.movement, [counter.owner]: [] }
    : state.movement
  return { state: { ...state, board, removed, movement }, events: [{ type: 'removal', at, counter }] }
}

function moves(state: GameState) {
  return movementPaths(state.board, state.turn, state.movement[state.turn])
}

export function boundaryOutcome(state: GameState): Outcome | null {
  if (state.phase !== 'battle') return null
  if (reachesOneCounter(state)) return materialOutcome(state, 'one-counter')
  if (mandatoryRemovals(state).length === 0 && moves(state).next().done) {
    return materialOutcome(state, 'immobilization')
  }
  if ((state.repetitions[positionKey(state)] ?? 0) >= 3) return { reason: 'threefold', winner: null }
  return null
}

function finish(state: GameState, events: readonly GameEvent[], outcome: Outcome): Transition {
  return { state: { ...state, outcome }, events: [...events, { type: 'termination', outcome }] }
}

function enterBattleBoundary(state: GameState, events: readonly GameEvent[]): Transition {
  const key = positionKey(state)
  const counted = { ...state, repetitions: { ...state.repetitions, [key]: (state.repetitions[key] ?? 0) + 1 } }
  const outcome = boundaryOutcome(counted)
  return outcome ? finish(counted, events, outcome) : { state: counted, events }
}

/** One representative path per equivalent movement destination and removal choice. */
export function legalActions(state: GameState): Action[] {
  if (state.outcome) return []
  if (state.phase === 'deployment') {
    return SQUARES.filter(at => state.board[at] === null).map(at => ({ type: 'place', at }))
  }
  const removals = mandatoryRemovals(state)
  if (removals.length === 0) return Array.from(moves(state), path => ({ type: 'battle', path }))

  return removals.flatMap((remove): Action[] => {
    const next = removePrisoner(state, remove).state
    if (reachesOneCounter(next)) return [{ type: 'battle', remove }]
    const paths = Array.from(moves(next), path => ({ type: 'battle' as const, remove, path }))
    return paths.length > 0 ? paths : [{ type: 'battle', remove }]
  })
}

export function applyAction(state: GameState, action: Action): Transition {
  if (state.outcome) throw new Error('The game has ended')
  if (state.phase === 'deployment') {
    if (action?.type !== 'place' || !validSquare(action.at)) throw new Error('Expected a placement')
    const placed = deploy(state, action.at)
    return placed.state.phase === 'battle'
      ? enterBattleBoundary(placed.state, placed.events)
      : placed
  }

  if (action?.type !== 'battle') throw new Error('Expected a battle turn')
  const removals = mandatoryRemovals(state)
  if (removals.length === 0 ? action.remove !== undefined : !removals.includes(action.remove!)) {
    throw new Error('Invalid mandatory removal')
  }
  const prepared = action.remove === undefined
    ? { state, events: [] }
    : removePrisoner(state, action.remove)

  if (action.remove !== undefined) {
    const reason = reachesOneCounter(prepared.state) ? 'one-counter'
      : moves(prepared.state).next().done ? 'immobilization' : null
    if (reason) {
      if (action.path !== undefined) throw new Error('Removal ends the game')
      return finish(prepared.state, prepared.events, materialOutcome(prepared.state, reason))
    }
  }

  const { board, movement, turn } = prepared.state
  if (!Array.isArray(action.path)) throw new Error('Expected a movement path')
  const path = Array.from(action.path)
  const counter = validatePath(board, turn, movement[turn], path)
  const from = path[0]!
  const to = path.at(-1)!
  const nextBoard = board.slice()
  nextBoard[from] = null
  nextBoard[to] = counter
  const events: GameEvent[] = [...prepared.events, { type: 'movement', path, counter }]
  events.push(...resolveCustody(nextBoard, turn, to))
  const moved = recordMove(movement[turn], { id: counter.id, from, to })
  return enterBattleBoundary({
    ...prepared.state,
    board: nextBoard,
    // Positions from before a removal have different material and cannot recur.
    repetitions: action.remove === undefined ? prepared.state.repetitions : {},
    turn: opponent(turn),
    movement: { ...movement, [turn]: moved },
  }, events)
}
