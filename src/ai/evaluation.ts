import { extractFeatures, featureBalance } from './features.js'
import type { Feature, Weights } from './features.js'
import type { GameState, Player } from '../engine/index.js'

export const WIN = 1_000_000
const evaluationLimit = WIN / 2
export const tacticalWeights: Weights = Object.freeze({
  removed: 100, prisoners: 24, dueRemoval: 46, threats: 9, multiThreats: 5,
  rescue: 7, redundantPairs: 4, exposedCaptors: 3,
})
export const deploymentWeights: Weights = Object.freeze({
  movable: 3, geometricOptions: 1, support: 1, isolation: 1, leapAccess: 1,
})

export function terminalScore(state: GameState, side: Player, ply: number): number | null {
  if (!state.outcome) return null
  if (state.outcome.winner === null) return 0
  return (state.outcome.winner === side ? 1 : -1) * (WIN - ply)
}

export function makeEvaluator(custom: Weights = {}, deployment: Weights = {}) {
  const entries = (weights: Weights) => (Object.entries(weights) as [Feature, number][])
    .filter(([, weight]) => Number.isFinite(weight) && weight !== 0)
    .map(([feature, weight]) => [feature, Math.min(WIN, Math.max(-WIN, weight))] as const)
  const battle = entries({ ...tacticalWeights, ...custom })
  const opening = entries({ ...deploymentWeights, ...deployment })
  const spatial = battle.some(([feature]) =>
    ['movable', 'geometricOptions', 'support', 'superiority', 'cohesion', 'isolation',
      'leapAccess', 'exposedEdge', 'center', 'contact'].includes(feature))
  return (state: GameState, side: Player): number => {
    const weights = state.phase === 'deployment' ? opening : battle
    const totals = extractFeatures(state, state.phase === 'deployment' || spatial)
    let value = 0
    for (const [feature, weight] of weights) value += weight * featureBalance(totals, feature, side)
    return Math.min(evaluationLimit, Math.max(-evaluationLimit, value))
  }
}
