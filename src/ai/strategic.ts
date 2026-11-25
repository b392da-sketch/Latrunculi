import { holdingPairs, opponent, SQUARES, steps } from '../engine/board.js'
import { movementPaths } from '../engine/movement.js'
import { positionKey } from '../engine/index.js'
import type { GameState, Player, Square } from '../engine/index.js'

const distance = (a: Square, b: Square) => Math.abs(a % 8 - b % 8) + Math.abs((a >> 3) - (b >> 3))
const radius = SQUARES.map(at => SQUARES.filter(near => distance(at, near) <= 2))
const sides = ['white', 'black'] as const

function emptyMetrics() {
  return {
    pressure: 0, preparation: 0, closureDiversity: 0, initiative: 0,
    escape: 0, formation: 0, confinement: 0, repetitionRisk: 0,
  }
}

export type StrategicFeature = keyof ReturnType<typeof emptyMetrics>
export const strategicFeatureNames = Object.freeze(Object.keys(emptyMetrics()) as StrategicFeature[])
export type StrategicWeights = Readonly<Partial<Record<StrategicFeature, number>>>
export const strategicPreset: StrategicWeights = Object.freeze({
  pressure: 2, preparation: 2, closureDiversity: 1, initiative: 3,
  escape: 1, formation: 1, confinement: 4,
})
export const positionalDeployment: StrategicWeights = Object.freeze({ escape: 2, formation: 2 })

export function strategicFeatures(state: GameState, includeRepetition = false) {
  const { board, removed, phase } = state
  const result = { white: emptyMetrics(), black: emptyMetrics() }
  const paths = { white: [...movementPaths(board, 'white', [])], black: [...movementPaths(board, 'black', [])] }
  const active = (at: Square, side: Player) => board[at]?.owner === side && board[at]?.status === 'active'
  const reach = { white: new Map<Square, Set<Square>>(), black: new Map<Square, Set<Square>>() }
  for (const side of sides) {
    const destinationsByOrigin = new Map<Square, Set<Square>>()
    for (const route of paths[side]) {
      const from = route[0]!
      const to = route.at(-1)!
      const sources = reach[side].get(to) ?? new Set<Square>()
      sources.add(from)
      reach[side].set(to, sources)
      const destinations = destinationsByOrigin.get(from) ?? new Set<Square>()
      destinations.add(to)
      destinationsByOrigin.set(from, destinations)
    }

    const enemy = opponent(side)
    const own = result[side]
    const seen = new Set<Square>()
    const threats = new Set<Square>()
    const closureSquares = new Set<Square>()
    const attackingOrigins = new Set<Square>()
    const sparse = removed.white + removed.black >= 28
    for (const at of SQUARES) {
      if (active(at, side)) {
        const options = destinationsByOrigin.get(at)?.size ?? 0
        if (options >= 2) own.escape++
        if (!seen.has(at)) {
          const queue = [at]
          seen.add(at)
          for (const from of queue) {
            for (const near of steps[from]!) {
              if (!seen.has(near) && active(near, side)) {
                seen.add(near)
                queue.push(near)
              }
            }
          }
          // Credit connected cooperation only when at least two members can move.
          if (queue.filter(from => destinationsByOrigin.has(from)).length >= 2) own.formation += Math.min(4, queue.length)
        }
        continue
      }
      if (phase !== 'battle' || !active(at, enemy)) continue
      const local = radius[at]!
      const ownNearby = local.filter(near => active(near, side) && destinationsByOrigin.has(near)).length
      const enemyNearby = local.filter(near => active(near, enemy)).length
      if (ownNearby >= 2) own.pressure += Math.max(0, Math.min(3, ownNearby - enemyNearby))
      if (sparse && removed[enemy] > removed[side] && steps[at]!.length < 4 && ownNearby >= 2) {
        own.confinement += 4 - steps[at]!.length
      }

      let prepared = false
      for (const [a, b] of holdingPairs[at]!) {
        for (const [anchor, gap] of [[a, b], [b, a]] as const) {
          if (!active(anchor, side) || board[gap] !== null) continue
          const origins = [...(reach[side].get(gap) ?? [])].filter(source => source !== anchor)
          if (origins.length > 0) {
            closureSquares.add(gap)
            threats.add(at)
            for (const source of origins) attackingOrigins.add(source)
            own.closureDiversity += Math.min(3, origins.length - 1)
          } else if (steps[gap]!.some(landing => [...(reach[side].get(landing) ?? [])]
            .some(source => source !== anchor))) {
            prepared = true
          }
        }
      }
      if (prepared && !threats.has(at)) own.preparation++
    }
    own.initiative = Math.min(threats.size, closureSquares.size, attackingOrigins.size)
    if (includeRepetition && phase === 'battle' && removed[enemy] > removed[side]) {
      own.repetitionRisk = Math.max(0, (state.repetitions[positionKey(state)] ?? 0) - 1)
    }
  }
  return result
}

export function makeStrategicBonus(battle: StrategicWeights = {}, deployment: StrategicWeights = {}) {
  const entries = (weights: StrategicWeights) => (Object.entries(weights) as [StrategicFeature, number][])
    .filter(([, weight]) => weight !== 0)
  const battleEntries = entries(battle)
  const openingEntries = entries(deployment)
  return (state: GameState, side: Player): number => {
    const weights = state.phase === 'battle' ? battleEntries : openingEntries
    if (!weights.length) return 0
    const features = strategicFeatures(state, weights.some(([key]) => key === 'repetitionRisk'))
    let value = 0
    for (const [key, weight] of weights) {
      value += weight * (features[side][key] - features[opponent(side)][key]) * (key === 'repetitionRisk' ? -1 : 1)
    }
    return value
  }
}
