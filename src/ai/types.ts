import type { Action } from '../engine/index.js'
import type { Weights } from './features.js'

export interface AiConfig {
  readonly policy?: 'random' | 'legacy' | 'tactical' | 'search'
  readonly deployment?: 'random' | 'heuristic' | 'search'
  readonly seed?: number
  /** Optional caller-owned RNG, required to return a value in [0, 1). */
  readonly random?: () => number
  readonly tieBreak?: 'first' | 'seeded'
  readonly depth?: number
  /** Maximum number of successor states made using applyAction. */
  readonly nodeBudget?: number
  readonly timeBudgetMs?: number
  readonly now?: () => number
  readonly shouldStop?: () => boolean
  readonly ordering?: boolean
  readonly weights?: Weights
  readonly deploymentWeights?: Weights
}

export interface AiDiagnostics {
  readonly branching: number
  readonly nodes: number
  readonly evaluations: number
  readonly cutoffs: number
  readonly completedDepth: number
  readonly score: number | null
  readonly principalVariation: readonly Action[]
  readonly stop: 'terminal' | 'completed' | 'nodes' | 'time' | 'canceled'
  readonly firstUsableMs: number
  readonly elapsedMs: number
}

export interface AiDecision {
  readonly action: Action | null
  readonly diagnostics: AiDiagnostics
}
