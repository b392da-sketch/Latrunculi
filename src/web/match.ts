import { applyAction, createGame } from '../engine/index.js'
import { validSquare } from '../engine/board.js'
import type { Action, GameState, Player, Transition } from '../engine/index.js'

export interface Preferences {
  coordinates: boolean
  flipped: boolean
  reducedMotion: boolean
}

export const defaults: Preferences = { coordinates: true, flipped: false, reducedMotion: false }
export const saveKey = 'latrunculi.local-match.v1'
export const preferencesKey = 'latrunculi.preferences.v1'

export interface Match {
  firstPlayer: Player
  actions: readonly Action[]
  cursor: number
  timeline: readonly Transition[]
  initial: GameState
}

export function newMatch(firstPlayer: Player = 'white'): Match {
  return { firstPlayer, actions: [], cursor: 0, timeline: [], initial: createGame({ firstPlayer }) }
}

export function current(match: Match): GameState {
  return match.timeline[match.cursor - 1]?.state ?? match.initial
}

export function commit(match: Match, action: Action): Match {
  const transition = applyAction(current(match), action)
  return {
    ...match,
    actions: [...match.actions.slice(0, match.cursor), action],
    timeline: [...match.timeline.slice(0, match.cursor), transition],
    cursor: match.cursor + 1,
  }
}

export function seek(match: Match, cursor: number): Match {
  return { ...match, cursor: Math.max(0, Math.min(cursor, match.actions.length)) }
}

export function exportMatch(match: Match, preferences: Preferences): string {
  const { firstPlayer, actions, cursor } = match
  return JSON.stringify({ version: 1, firstPlayer, actions, cursor, preferences }, null, 2)
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object.')
  return value as Record<string, unknown>
}

export function readPreferences(value: unknown): Preferences {
  const { coordinates, flipped, reducedMotion } = record(value)
  if (typeof coordinates !== 'boolean' || typeof flipped !== 'boolean' || typeof reducedMotion !== 'boolean') {
    throw new Error('Invalid display preferences.')
  }
  return { coordinates, flipped, reducedMotion }
}

function readAction(raw: unknown): Action {
  const { type, at, remove, path } = record(raw)
  if (type === 'place' && validSquare(at)) return { type, at }
  if (type !== 'battle' || (remove !== undefined && !validSquare(remove)) ||
    (path !== undefined && (!Array.isArray(path) || !path.every(validSquare)))) {
    throw new Error('Malformed action.')
  }
  return { type, ...(remove === undefined ? {} : { remove }), ...(path === undefined ? {} : { path }) }
}

export function importMatch(json: string): { match: Match; preferences: Preferences } {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { throw new Error('This file is not valid JSON.') }
  const { version, firstPlayer, actions, cursor, preferences } = record(raw)
  if (version !== 1) throw new Error('Unsupported game file version.')
  if ((firstPlayer !== 'white' && firstPlayer !== 'black') || !Array.isArray(actions) ||
    typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0 || cursor > actions.length) {
    throw new Error('Invalid match configuration or history cursor.')
  }
  const initial = createGame({ firstPlayer })
  const timeline: Transition[] = []
  const parsed: Action[] = []
  let state = initial
  // Validate the entire log, including redo actions beyond the current cursor.
  for (const [index, rawAction] of actions.entries()) {
    try {
      const action = readAction(rawAction)
      const transition = applyAction(state, action)
      parsed.push(action)
      timeline.push(transition)
      state = transition.state
    } catch (cause) {
      throw new Error(`Illegal or malformed action at position ${index + 1}.`, { cause })
    }
  }
  return { match: { firstPlayer, initial, cursor, actions: parsed, timeline }, preferences: readPreferences(preferences) }
}
