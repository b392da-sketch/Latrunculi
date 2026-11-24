import { applyAction, createGame, legalActions } from '../engine/index.js'
import type { Action, GameState, Player } from '../engine/index.js'
import { extractFeatures } from './features.js'
import { randomFor } from './random.js'
import { chooseAction } from './search.js'
import type { AiConfig } from './types.js'

type NamedOpponent = {
  readonly name: string
  readonly config: Omit<AiConfig, 'random' | 'now' | 'shouldStop' | 'timeBudgetMs'>
}

export interface TournamentOptions {
  readonly opponents: readonly [NamedOpponent, NamedOpponent]
  readonly seeds: readonly number[]
  /** Simulation-only limit, including deployment placements. */
  readonly cap: number
  readonly deployment?: 'shared-random' | 'by-policy'
  readonly now?: () => number
}

function sharedDeployment(seed: number) {
  const random = randomFor(seed)
  const actions: Action[] = []
  let state = createGame()
  while (state.phase === 'deployment' && !state.outcome) {
    const legal = legalActions(state)
    const action = legal[Math.floor(random() * legal.length)]!
    actions.push(action)
    state = applyAction(state, action).state
  }
  return { actions, state }
}

function play(options: TournamentOptions, seed: number, swapped: boolean, opening: ReturnType<typeof sharedDeployment>) {
  const [first, second] = options.opponents
  const players = swapped ? { white: second, black: first } : { white: first, black: second }
  const randomA = randomFor(seed ^ 0x71c743)
  const randomB = randomFor(seed ^ 0xc32a85)
  const random = swapped ? { white: randomB, black: randomA } : { white: randomA, black: randomB }
  const now = options.now ?? Date.now
  let state: GameState = options.deployment === 'by-policy' ? createGame() : opening.state
  const actions = options.deployment === 'by-policy' ? [] : opening.actions.slice()
  const metrics = {
    battleTurns: 0, imprisonment: 0, liberation: 0, longestNoRemoval: 0,
    threatTurns: 0, threatWithoutCapture: 0, noContactTurns: 0, sparseTurns: 0,
    nodes: 0, evaluations: 0, thinkMs: 0, depthTwoTurns: 0, searchTurns: 0,
  }
  let dry = 0
  while (!state.outcome && actions.length < options.cap) {
    const side = state.turn
    const policy = players[side].config
    const { action, diagnostics } = chooseAction(state, { ...policy, random: random[side], now })
    if (!action) throw new Error(`No action for seed ${seed}, swap ${swapped}, turn ${actions.length}`)
    const { state: next, events } = applyAction(state, action)
    if (state.phase === 'battle') {
      metrics.battleTurns++
      metrics.nodes += diagnostics.nodes
      metrics.evaluations += diagnostics.evaluations
      metrics.thinkMs += diagnostics.elapsedMs
      if (policy.policy === 'search') {
        metrics.searchTurns++
        metrics.depthTwoTurns += Number(diagnostics.completedDepth >= 2)
      }
      const features = extractFeatures(state)
      const hasThreat = features[side].threats > 0
      const captures = events.filter(event => event.type === 'imprisonment').length
      metrics.threatTurns += Number(hasThreat)
      metrics.threatWithoutCapture += Number(hasThreat && captures === 0)
      metrics.imprisonment += captures
      metrics.liberation += events.filter(event => event.type === 'liberation').length
      metrics.noContactTurns += Number(features[side].contact === 0)
      metrics.sparseTurns += Number(state.removed.white + state.removed.black >= 28)
      dry = action.type === 'battle' && action.remove !== undefined ? 0 : dry + 1
      metrics.longestNoRemoval = Math.max(metrics.longestNoRemoval, dry)
    }
    actions.push(action)
    state = next
  }
  return {
    seed, swapped, players: { white: players.white.name, black: players.black.name },
    actions, outcome: state.outcome,
    remaining: { white: 20 - state.removed.white, black: 20 - state.removed.black },
    removedBy: { white: state.removed.black, black: state.removed.white },
    finalPrisoners: {
      white: state.board.filter(counter => counter?.owner === 'white' && counter.status === 'imprisoned').length,
      black: state.board.filter(counter => counter?.owner === 'black' && counter.status === 'imprisoned').length,
    },
    metrics,
  }
}

export function* runTournament(options: TournamentOptions): Generator<ReturnType<typeof play>> {
  if (!Number.isSafeInteger(options.cap) || options.cap < 40) throw new RangeError('Tournament cap must be at least 40')
  for (const seed of options.seeds) {
    const opening = sharedDeployment(seed)
    yield play(options, seed, false, opening)
    yield play(options, seed, true, opening)
  }
}

type Game = ReturnType<typeof play>
function lengths(values: number[]) {
  if (!values.length) return null
  const ordered = values.slice().sort((a, b) => a - b)
  const half = Math.floor(ordered.length / 2)
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: (ordered[half]! + ordered[Math.floor((ordered.length - 1) / 2)]!) / 2,
    max: ordered.at(-1)!,
  }
}

function group(games: readonly Game[]) {
  const aggregate = (select: (game: Game) => number) => lengths(games.map(select))
  const sum = (select: (game: Game) => number) => games.reduce((total, game) => total + select(game), 0)
  const turns = sum(game => game.metrics.battleTurns)
  const search = sum(game => game.metrics.searchTurns)
  return {
    games: games.length, lengths: aggregate(game => game.actions.length),
    removed: aggregate(game => game.removedBy.white + game.removedBy.black),
    removedByColor: { white: aggregate(game => game.removedBy.white), black: aggregate(game => game.removedBy.black) },
    finalPrisoners: aggregate(game => game.finalPrisoners.white + game.finalPrisoners.black),
    imprisonment: aggregate(game => game.metrics.imprisonment),
    liberation: aggregate(game => game.metrics.liberation),
    longestNoRemoval: aggregate(game => game.metrics.longestNoRemoval),
    threatTurns: sum(game => game.metrics.threatTurns), threatWithoutCapture: sum(game => game.metrics.threatWithoutCapture),
    noContactTurns: sum(game => game.metrics.noContactTurns), sparseTurns: sum(game => game.metrics.sparseTurns),
    battleTurns: turns, searchTurns: search, depthTwoTurns: sum(game => game.metrics.depthTwoTurns),
    nodesPerAction: turns ? sum(game => game.metrics.nodes) / turns : null,
    evaluationsPerAction: turns ? sum(game => game.metrics.evaluations) / turns : null,
    thinkMsPerAction: turns ? sum(game => game.metrics.thinkMs) / turns : null,
  }
}

export function summarizeGames(games: readonly Game[]) {
  const completed = games.filter(game => game.outcome)
  const truncated = games.filter(game => !game.outcome)
  const outcomes = { white: 0, black: 0, draw: 0 }
  const reasons = { 'one-counter': 0, immobilization: 0, threefold: 0 }
  const byOpponent: Record<string, Record<Player, { wins: number; losses: number; draws: number; truncated: number }>> =
    Object.create(null)
  for (const game of games) {
    if (game.outcome) {
      outcomes[game.outcome.winner ?? 'draw']++
      reasons[game.outcome.reason]++
    }
    for (const side of ['white', 'black'] as const) {
      const name = game.players[side]
      const colors = byOpponent[name] ??= {
        white: { wins: 0, losses: 0, draws: 0, truncated: 0 },
        black: { wins: 0, losses: 0, draws: 0, truncated: 0 },
      }
      const bucket = !game.outcome ? 'truncated' : game.outcome.winner === null ? 'draws'
        : game.outcome.winner === side ? 'wins' : 'losses'
      colors[side][bucket]++
    }
  }
  return {
    outcomes, reasons, byOpponent, overall: group(games),
    completed: group(completed), truncated: group(truncated),
  }
}
