import { holdingPairs, jumps, opponent, SQUARES, steps } from '../engine/board.js'
import { movementPaths } from '../engine/movement.js'
import { legalActions } from '../engine/index.js'
import type { Action, Board, GameState, Player, Square } from '../engine/index.js'

export function activeAt(board: Board, at: Square, side: Player): boolean {
  return board[at]?.owner === side && board[at]?.status === 'active'
}

/** Geometric closures. Does not account for removal, oscillation or later chain hops. */
function canArrive(board: Board, gap: Square, anchor: Square, side: Player): boolean {
  for (const from of steps[gap]!) {
    if (from !== anchor && activeAt(board, from, side)) return true
  }
  for (const { over, to } of jumps[gap]!) {
    if (to !== anchor && board[over]?.owner === side && activeAt(board, to, side)) return true
  }
  return false
}

function sideFeatures() {
  return {
    removed: 0, active: 0, prisoners: 0, dueRemoval: 0, threats: 0, multiThreats: 0,
    rescue: 0, redundantPairs: 0, exposedCaptors: 0,
    movable: 0, geometricOptions: 0, support: 0, superiority: 0, cohesion: 0,
    isolation: 0, leapAccess: 0, exposedEdge: 0, center: 0, contact: 0,
  }
}

export type Feature = keyof ReturnType<typeof sideFeatures>
export type Features = Record<Feature, number>
export type Weights = Readonly<Partial<Features>>

/** Raw per-side counts. Offensive features are credited to the side that can exploit them. */
export function extractFeatures(state: GameState, spatial = true): Record<Player, Features> {
  const { board, phase, turn, removed } = state
  const totals = { white: sideFeatures(), black: sideFeatures() }
  totals.white.removed = removed.black
  totals.black.removed = removed.white

  const threatened = new Uint8Array(64)
  const closures = { white: new Uint8Array(64), black: new Uint8Array(64) }
  const prisoners: Square[] = []
  const exposed = { white: new Set<Square>(), black: new Set<Square>() }
  for (const at of SQUARES) {
    const counter = board[at]
    if (!counter) continue
    const side = counter.owner
    const enemy = opponent(side)
    const own = totals[side]
    if (counter.status === 'imprisoned') {
      own.prisoners++
      prisoners.push(at)
      continue
    }
    own.active++
    if (spatial) {
      let friends = 0
      let rivals = 0
      let options = 0
      for (const near of steps[at]!) {
        const adjacent = board[near]
        if (!adjacent) options++
        else if (adjacent.owner === side) friends++
        else rivals++
      }
      let leaps = 0
      for (const { over, to } of jumps[at]!) {
        if (board[over]?.owner === side && board[to] === null) leaps++
      }
      own.geometricOptions += options + leaps
      own.movable += Number(options + leaps > 0)
      own.leapAccess += leaps
      own.support += friends
      own.cohesion += Math.min(friends, 2)
      own.superiority += Number(friends > rivals && rivals > 0)
      own.isolation += Number(friends === 0)
      own.contact += rivals
      const x = at % 8
      const y = at >> 3
      own.center += Math.min(x, 7 - x, y, 7 - y)
    }
    if (phase !== 'battle') continue
    for (const [a, b] of holdingPairs[at]!) {
      for (const [gap, mate] of [[a, b], [b, a]] as const) {
        if (board[gap] !== null || !activeAt(board, mate, enemy) || !canArrive(board, gap, mate, enemy)) continue
        threatened[at] = 1
        const count = closures[enemy][gap]!
        if (count === 1) totals[enemy].multiThreats++
        closures[enemy][gap] = count + 1
      }
    }
    totals[enemy].threats += threatened[at]!
    if (spatial && steps[at]!.length < 4) own.exposedEdge += threatened[at]!
  }

  for (const at of prisoners) {
    const owner = board[at]!.owner
    const holder = opponent(owner)
    let pairs = 0
    let vulnerable = 0
    for (const [a, b] of holdingPairs[at]!) {
      if (!activeAt(board, a, holder) || !activeAt(board, b, holder)) continue
      pairs++
      if (threatened[a] || threatened[b]) vulnerable++
      if (threatened[a]) exposed[holder].add(a)
      if (threatened[b]) exposed[holder].add(b)
    }
    totals[holder].redundantPairs += Math.max(0, pairs - 1)
    totals[owner].rescue += Number(pairs > 0 && vulnerable === pairs)
    if (holder === turn) totals[holder].dueRemoval = 1
  }
  totals.white.exposedCaptors = exposed.white.size
  totals.black.exposedCaptors = exposed.black.size
  return totals
}

export function featureBalance(totals: Record<Player, Features>, feature: Feature, side: Player): number {
  const difference = totals[side][feature] - totals[opponent(side)][feature]
  return feature === 'prisoners' || feature === 'exposedCaptors' || feature === 'isolation' || feature === 'exposedEdge'
    ? -difference : difference
}

function describePaths(paths: Iterable<readonly Square[]>) {
  const origins = new Set<Square>()
  const destinations = new Set<Square>()
  const chains = new Map<Square, Set<Square>>()
  let pairs = 0
  const ends = new Map<Square, Set<Square>>()
  for (const path of paths) {
    const from = path[0]!
    const to = path.at(-1)!
    origins.add(from)
    destinations.add(to)
    const seen = ends.get(from) ?? new Set<Square>()
    if (!seen.has(to)) pairs++
    seen.add(to)
    ends.set(from, seen)
    if (path.length > 2) {
      const lands = chains.get(to) ?? new Set<Square>()
      lands.add(from)
      chains.set(to, lands)
    }
  }
  return { origins: origins.size, destinations: destinations.size, pairs, chains }
}

/** More expensive research probe, separate from the default leaf evaluation. */
export function probeMobility(state: GameState, side: Player, actions?: readonly Action[]) {
  const geometric = describePaths(movementPaths(state.board, side, []))
  const { chains, ...geometry } = geometric
  const active = state.board.filter(counter => counter?.owner === side && counter.status === 'active').length
  let chainedThreats = 0
  for (const at of SQUARES) {
    if (!activeAt(state.board, at, opponent(side))) continue
    if (holdingPairs[at]!.some(([a, b]) =>
      (activeAt(state.board, a, side) && [...(chains.get(b) ?? [])].some(from => from !== a)) ||
      (activeAt(state.board, b, side) && [...(chains.get(a) ?? [])].some(from => from !== b)),
    )) chainedThreats++
  }
  const legal = side === state.turn && state.phase === 'battle'
    ? describePaths((actions ?? legalActions(state)).flatMap(action =>
      action.type === 'battle' && action.path ? [action.path] : []))
    : null
  return {
    geometric: { ...geometry, averagePerActive: active ? geometry.pairs / active : 0, restricted: active - geometry.origins },
    legal: legal && { origins: legal.origins, destinations: legal.destinations, pairs: legal.pairs,
      averagePerActive: active ? legal.pairs / active : 0, restricted: active - legal.origins },
    chainedThreats,
  }
}
