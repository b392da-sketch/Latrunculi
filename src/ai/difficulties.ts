import { chooseAction } from './search.js'
import type { AiConfig, AiDecision } from './types.js'
import type { GameState } from '../engine/index.js'

export const difficultyIds = Object.freeze(['tiro', 'miles', 'veteranus', 'centurio', 'legatus', 'imperator'] as const)
export type DifficultyId = typeof difficultyIds[number]

type Policy = Readonly<AiConfig & Required<Pick<AiConfig,
  'policy' | 'deployment' | 'depth' | 'nodeBudget' | 'timeBudgetMs' | 'tieBreak' | 'transition'
>>>

export interface Difficulty {
  readonly id: DifficultyId
  readonly name: string
  readonly designation: string
  readonly description: string
  readonly config: Policy
}

function preset(id: DifficultyId, name: string, designation: string, description: string, config: Policy): Difficulty {
  return Object.freeze({ id, name, designation, description, config: Object.freeze(config) })
}

const oneTurn = Object.freeze({
  policy: 'tactical', deployment: 'random', depth: 1, tieBreak: 'first', transition: 'overlay',
} as const)
const search = Object.freeze({
  policy: 'search', deployment: 'random', tieBreak: 'first', transition: 'overlay', orderingStyle: 'phase',
} as const)

export const difficulties: Readonly<Record<DifficultyId, Difficulty>> = Object.freeze({
  tiro: preset('tiro', 'Tiro', 'Recruit', 'Varies its choices among plausible moves and sometimes misses captures.', {
    ...oneTurn, tieBreak: 'seeded', nodeBudget: 560, timeBudgetMs: 90,
    weights: Object.freeze({ threats: 0, multiThreats: 0, rescue: 0, redundantPairs: 0, exposedCaptors: 0 }),
    selection: Object.freeze({ kind: 'rank', candidates: 10, margin: 105, decay: 0.82 }),
  }),
  miles: preset('miles', 'Miles', 'Soldier', 'Looks for immediate captures and weighs simple threats.', {
    ...oneTurn, tieBreak: 'seeded', nodeBudget: 680, timeBudgetMs: 180,
    weights: Object.freeze({ threats: 5, multiThreats: 0, rescue: 3, redundantPairs: 0, exposedCaptors: 1 }),
    selection: Object.freeze({ kind: 'rank', candidates: 4, margin: 42, decay: 0.53 }),
  }),
  veteranus: preset('veteranus', 'Veteranus', 'Veteran', 'Uses the full tactical evaluator for each immediate move.', {
    ...oneTurn, nodeBudget: 900, timeBudgetMs: 270,
  }),
  centurio: preset('centurio', 'Centurio', 'Centurion', 'Searches for the opponent’s immediate response.', {
    ...search, depth: 2, nodeBudget: 1_600, timeBudgetMs: 450,
  }),
  legatus: preset('legatus', 'Legatus', 'Legate', 'Searches further for delayed exchanges and rescues.', {
    ...search, depth: 4, nodeBudget: 6_000, timeBudgetMs: 1_400,
  }),
  imperator: preset('imperator', 'Imperator', 'Commander', 'Uses the deepest search budget and calculates further in sparse positions.', {
    ...search, depth: 5, nodeBudget: 20_000, timeBudgetMs: 2_800,
  }),
})

export function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === 'string' && Object.hasOwn(difficulties, value)
}

export interface DifficultyLimits {
  readonly nodes?: number
  readonly timeMs?: number
  readonly depth?: number
}

export interface DifficultyOptions {
  readonly mode?: 'interactive' | 'deterministic'
  readonly seed?: number
  readonly limits?: DifficultyLimits
  readonly now?: () => number
  readonly shouldStop?: () => boolean
}

function limit(value: number | undefined, ceiling: number, min = 0): number {
  if (value === undefined) return ceiling
  if (!Number.isSafeInteger(value) || value < min || value > ceiling) throw new RangeError('AI limit exceeds the supported range')
  return value
}

export function difficultyConfig(id: DifficultyId, options: DifficultyOptions = {}): AiConfig {
  if (!isDifficultyId(id)) throw new RangeError('Unknown difficulty')
  if (options.mode !== undefined && options.mode !== 'interactive' && options.mode !== 'deterministic') {
    throw new RangeError('Unknown AI budget mode')
  }
  const { timeBudgetMs, ...policy } = difficulties[id].config
  const { limits, seed } = options
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)) throw new RangeError('Invalid seed')
  if (options.mode === 'deterministic' && limits?.timeMs !== undefined) {
    throw new RangeError('Deterministic AI does not take a time limit')
  }
  return {
    ...policy,
    ...(options.mode === 'deterministic' ? {} : { timeBudgetMs: limit(limits?.timeMs, timeBudgetMs) }),
    nodeBudget: limit(limits?.nodes, policy.nodeBudget),
    depth: limit(limits?.depth, policy.depth, 1),
    ...(seed === undefined ? {} : { seed }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.shouldStop === undefined ? {} : { shouldStop: options.shouldStop }),
  }
}

export function chooseDifficulty(state: GameState, id: DifficultyId, options?: DifficultyOptions): AiDecision {
  return chooseAction(state, difficultyConfig(id, options))
}
