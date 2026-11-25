import { applyAction, createGame } from '../engine/index.js'
import { localConfig, readMatchConfig } from './match-config.js'
import type { MatchConfig } from './match-config.js'
import { validSquare } from '../engine/board.js'
import type { Action, GameEvent, GameState, Player } from '../engine/index.js'

export interface Preferences {
  coordinates: boolean
  flipped: boolean
  reducedMotion: boolean
}

export const defaults: Preferences = { coordinates: true, flipped: false, reducedMotion: false }
export const saveKey = 'latrunculi.local-match.v1'
export const preferencesKey = 'latrunculi.preferences.v1'

const recentLimit = 24
const checkpointLimit = 32
const initialStride = 32

// Application import budgets. Live matches and engine rules have no action cap.
export const maxImportBytes = 5 * 1024 * 1024
export const maxImportActions = 12_000

export function exceedsImportBytes(json: string): boolean {
  return json.length > maxImportBytes || new TextEncoder().encode(json).byteLength > maxImportBytes
}

interface Checkpoints {
  stride: number
  states: ReadonlyMap<number, GameState>
}

export interface Match {
  firstPlayer: Player
  config: MatchConfig
  actions: readonly Action[]
  cursor: number
  timeline: readonly (readonly GameEvent[])[]
  initial: GameState
  state: GameState
  checkpoints: Checkpoints
  recent: ReadonlyMap<number, GameState>
}

export function newMatch(firstPlayer: Player = 'white', config: MatchConfig = localConfig): Match {
  const initial = createGame({ firstPlayer })
  return {
    firstPlayer, config, actions: [], cursor: 0, timeline: [], initial, state: initial,
    checkpoints: { stride: initialStride, states: new Map() }, recent: new Map(),
  }
}

export function current(match: Match): GameState {
  return match.state
}

function checkpoint(history: Checkpoints, at: number, state: GameState): Checkpoints {
  if (at % history.stride !== 0) return history
  let { stride } = history
  let states = new Map(history.states)
  if (states.size >= checkpointLimit) {
    stride *= 2
    states = new Map([...states].filter(([index]) => index % stride === 0))
  }
  if (at % stride === 0) states.set(at, state)
  return { stride, states }
}

function remember(recent: Map<number, GameState>, at: number, state: GameState) {
  recent.delete(at)
  recent.set(at, state)
  if (recent.size > recentLimit) recent.delete(recent.keys().next().value!)
}

export function commit(match: Match, action: Action): Match {
  const { state, events } = applyAction(match.state, action)
  const cursor = match.cursor + 1
  const recent = new Map([...match.recent].filter(([at]) => at <= match.cursor))
  remember(recent, match.cursor, match.state)
  remember(recent, cursor, state)
  const history = match.cursor === match.actions.length ? match.checkpoints : {
    ...match.checkpoints,
    states: new Map([...match.checkpoints.states].filter(([at]) => at <= match.cursor)),
  }
  return {
    ...match, cursor, state, recent, checkpoints: checkpoint(history, cursor, state),
    actions: [...match.actions.slice(0, match.cursor), action],
    timeline: [...match.timeline.slice(0, match.cursor), events],
  }
}

function* replayTo(match: Match, cursor: number): Generator<void, Match> {
  const target = Math.max(0, Math.min(cursor, match.actions.length))
  if (target === match.cursor) return match
  const recent = new Map(match.recent)
  let at = 0
  let state = match.initial
  for (const cache of [match.checkpoints.states, recent]) {
    for (const [index, saved] of cache) {
      if (index <= target && index > at) {
        at = index
        state = saved
      }
    }
  }
  remember(recent, at, state)
  while (at < target) {
    state = applyAction(state, match.actions[at]!).state
    remember(recent, ++at, state)
    yield
  }
  return { ...match, cursor: target, state, recent }
}

export function seek(match: Match, cursor: number): Match {
  return finishReplay(replayTo(match, cursor))
}

export function seekAsync(match: Match, cursor: number, signal: AbortSignal): Promise<Match> {
  return finishReplayAsync(replayTo(match, cursor), signal)
}

export function exportMatch(match: Match, preferences: Preferences): string {
  const { firstPlayer, actions, cursor, config } = match
  const game = { firstPlayer, actions, cursor, preferences }
  return JSON.stringify(config.mode === 'local' ? { version: 1, ...game } : { version: 2, ...game, config }, null, 2)
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

export function readAction(raw: unknown): Action {
  const { type, at, remove, path } = record(raw)
  if (type === 'place' && validSquare(at)) return { type, at }
  if (type !== 'battle' || (remove !== undefined && !validSquare(remove)) ||
    (path !== undefined && (!Array.isArray(path) || path.length > 64 || !path.every(validSquare)))) {
    throw new Error('Malformed action.')
  }
  return { type, ...(remove === undefined ? {} : { remove }), ...(path === undefined ? {} : { path }) }
}

interface Restored {
  match: Match
  preferences: Preferences
}

function* replayImport(json: string): Generator<void, Restored> {
  if (exceedsImportBytes(json)) {
    throw new Error('The game file exceeds 5 MiB.')
  }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { throw new Error('This file is not valid JSON.') }
  const { version, firstPlayer, actions, cursor, preferences, config: rawConfig } = record(raw)
  if (version !== 1 && version !== 2) throw new Error('Unsupported game file version.')
  if ((firstPlayer !== 'white' && firstPlayer !== 'black') || !Array.isArray(actions) ||
    typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0 || cursor > actions.length) {
    throw new Error('Invalid match configuration or history cursor.')
  }
  if (actions.length > maxImportActions) throw new Error('This browser can import up to 12,000 actions.')
  const settings = readPreferences(preferences)
  const config = version === 2 ? readMatchConfig(rawConfig) : localConfig
  const initialMatch = newMatch(firstPlayer, config)
  const { initial } = initialMatch
  const timeline: (readonly GameEvent[])[] = []
  const parsed: Action[] = []
  const recent = new Map<number, GameState>()
  let checkpoints = initialMatch.checkpoints
  let state = initial
  let selected = initial
  // Validate the entire log, including redo actions beyond the current cursor.
  for (const [index, rawAction] of actions.entries()) {
    try {
      const action = readAction(rawAction)
      const transition = applyAction(state, action)
      parsed.push(action)
      timeline.push(transition.events)
      state = transition.state
    } catch (cause) {
      throw new Error(`Illegal or malformed action at position ${index + 1}.`, { cause })
    }
    const at = index + 1
    checkpoints = checkpoint(checkpoints, at, state)
    if (at === cursor) selected = state
    if (at > cursor - recentLimit / 2 && at <= cursor + recentLimit / 2) remember(recent, at, state)
    yield
  }
  return {
    match: { firstPlayer, config, initial, cursor, actions: parsed, timeline, state: selected, checkpoints, recent },
    preferences: settings,
  }
}

function finishReplay<T>(replay: Generator<void, T>): T {
  let next = replay.next()
  while (!next.done) next = replay.next()
  return next.value
}

async function finishReplayAsync<T>(replay: Generator<void, T>, signal: AbortSignal): Promise<T> {
  let sliceStart = performance.now()
  for (;;) {
    signal.throwIfAborted()
    const next = replay.next()
    if (next.done) return next.value
    if (performance.now() - sliceStart >= 12) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      sliceStart = performance.now()
    }
  }
}

export function importMatch(json: string): Restored {
  return finishReplay(replayImport(json))
}

/** Validate cooperatively so long replays do not monopolize the browser thread. */
export function importMatchAsync(json: string, signal: AbortSignal): Promise<Restored> {
  return finishReplayAsync(replayImport(json), signal)
}
