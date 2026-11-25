import { deserialize } from '../engine/index.js'
import type { GameState } from '../engine/index.js'
import { difficultyConfig, isDifficultyId } from './difficulties.js'
import type { DifficultyId, DifficultyOptions } from './difficulties.js'
import { chooseAction } from './search.js'
import type { AiDecision } from './types.js'

export interface AiRequest {
  readonly requestId: string
  readonly state: GameState
  readonly difficulty: DifficultyId
  readonly seed?: number
  readonly mode?: DifficultyOptions['mode']
  readonly limits?: DifficultyOptions['limits']
}

export type AiResponse =
  | (AiDecision & { readonly requestId: string; readonly ok: true })
  | {
      readonly requestId: string | null
      readonly ok: false
      readonly error: { readonly code: 'invalid-request' | 'invalid-state' | 'search-failed'; readonly message: string }
    }

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value))
}

function optionNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value))
}

/** Pure request handler. Hosts supply cancellation and discard stale IDs. */
export function handleAiRequest(raw: unknown, host: Pick<DifficultyOptions, 'now' | 'shouldStop'> = {}): AiResponse {
  const requestId = object(raw) && typeof raw.requestId === 'string' && raw.requestId.trim() && raw.requestId.length <= 128
    ? raw.requestId : null
  const fail = (code: Extract<AiResponse, { ok: false }>['error']['code'], message: string): AiResponse => ({
    requestId, ok: false, error: { code, message },
  })
  if (!object(raw) || requestId === null || !isDifficultyId(raw.difficulty) || !optionNumber(raw.seed) ||
    (raw.mode !== undefined && raw.mode !== 'interactive' && raw.mode !== 'deterministic')) {
    return fail('invalid-request', 'Invalid request ID, difficulty, mode or seed')
  }
  const limits = raw.limits
  if (limits !== undefined && (!object(limits) || Object.keys(limits).some(key => !['nodes', 'timeMs', 'depth'].includes(key)) ||
    !optionNumber(limits.nodes) || !optionNumber(limits.depth) || !optionNumber(limits.timeMs))) {
    return fail('invalid-request', 'Invalid resource overrides')
  }
  let config
  try {
    config = difficultyConfig(raw.difficulty, {
      ...host, ...(raw.seed === undefined ? {} : { seed: raw.seed }),
      ...(raw.mode === undefined ? {} : { mode: raw.mode }),
      ...(limits === undefined ? {} : { limits }),
    })
  } catch {
    return fail('invalid-request', 'Resource overrides or seed outside supported range')
  }
  let state
  try {
    if (!object(raw.state) || !object(raw.state.repetitions)) throw new Error('Expected a canonical snapshot')
    state = deserialize(JSON.stringify(raw.state))
  } catch {
    return fail('invalid-state', 'Malformed canonical game snapshot')
  }
  try {
    return { requestId, ok: true, ...chooseAction(state, config) }
  } catch {
    return fail('search-failed', 'AI search could not complete')
  }
}
