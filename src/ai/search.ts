import { applyAction, legalActions } from '../engine/index.js'
import type { Action, GameState } from '../engine/index.js'
import { makeEvaluator, terminalScore } from './evaluation.js'
import { legacyValue } from './legacy.js'
import { ordered, sameAction } from './ordering.js'
import { randomFor } from './random.js'
import type { AiConfig, AiDecision, AiDiagnostics } from './types.js'

function integer(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid AI depth or node budget')
  return value
}

interface Line {
  score: number
  pv: Action[]
}

/** Searches complete canonical game states, including their repetition ledgers. */
export function chooseAction(state: GameState, config: AiConfig = {}): AiDecision {
  const now = config.now ?? Date.now
  const start = now()
  const root = state.turn
  const policy = config.policy ?? 'search'
  const deployment = config.deployment ?? 'random'
  const mode = state.phase === 'deployment' ? deployment : policy
  const target = integer(config.depth ?? 2, 1, 64)
  const budget = integer(config.nodeBudget ?? 5_000, 0, Number.MAX_SAFE_INTEGER)
  const timeBudget = config.timeBudgetMs
  if (timeBudget !== undefined && (!Number.isFinite(timeBudget) || timeBudget < 0)) {
    throw new RangeError('Invalid AI time budget')
  }
  const actions = legalActions(state)
  const firstUsableMs = Math.max(0, now() - start)
  const random = config.random ?? randomFor(config.seed ?? 0)
  let nodes = 0
  let evaluations = 0
  let cutoffs = 0
  let completedDepth = 0
  let action: Action | null = actions[0] ?? null
  let score: number | null = null
  let pv: Action[] = action ? [action] : []

  const report = (stop: AiDiagnostics['stop']): AiDecision => ({
    action, diagnostics: {
      branching: actions.length, nodes, evaluations, cutoffs, completedDepth, score,
      principalVariation: pv, firstUsableMs, elapsedMs: Math.max(0, now() - start), stop,
    },
  })
  const stopped = (): 'nodes' | 'time' | 'canceled' | undefined => {
    if (config.shouldStop?.()) return 'canceled'
    if (timeBudget !== undefined && now() - start >= timeBudget) return 'time'
    if (nodes >= budget) return 'nodes'
  }

  if (!action) {
    score = terminalScore(state, root, 0)
    return report('terminal')
  }

  if (mode === 'random') {
    const reason = stopped()
    if (reason === 'canceled' || reason === 'time') return report(reason)
    action = actions[Math.floor(random() * actions.length)]!
    pv = [action]
    return report('completed')
  }

  const evaluate = makeEvaluator(config.weights, config.deploymentWeights)
  function value(node: GameState, ply: number): number {
    evaluations++
    return mode === 'legacy' ? legacyValue(node, root) : terminalScore(node, root, ply) ?? evaluate(node, root)
  }

  let stop: ReturnType<typeof stopped>
  if (mode !== 'search') {
    const best: Action[] = []
    let bestScore = -Infinity
    for (const candidate of actions) {
      stop = stopped()
      if (stop) break
      nodes++
      const candidateScore = value(applyAction(state, candidate).state, 1)
      if (candidateScore > bestScore) {
        bestScore = candidateScore
        best.length = 0
      }
      if (candidateScore === bestScore) best.push(candidate)
    }
    if (best.length) {
      action = config.tieBreak === 'first' || (config.tieBreak === undefined && mode !== 'legacy')
        ? best[0]! : best[Math.floor(random() * best.length)]!
      score = bestScore
      pv = [action]
    }
    completedDepth = stop ? 0 : 1
    return report(stop ?? 'completed')
  }

  const rootActions = actions.slice()
  if (config.tieBreak === 'seeded') {
    for (let i = rootActions.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const previous = rootActions[i]!
      rootActions[i] = rootActions[j]!
      rootActions[j] = previous
    }
    action = rootActions[0]!
    pv = [action]
  }

  function visit(node: GameState, depth: number, ply: number, alpha: number, beta: number,
    hint: readonly Action[]): Line | null {
    if (node.outcome || depth === 0) return { score: value(node, ply), pv: [] }
    let choices = ply === 0 ? rootActions : legalActions(node)
    if (config.ordering !== false) choices = ordered(node, choices, hint[0])
    const maximizing = node.turn === root
    let best: Line = { score: maximizing ? -Infinity : Infinity, pv: [] }
    for (const candidate of choices) {
      stop = stopped()
      if (stop) return null
      nodes++
      const child = applyAction(node, candidate).state
      const line = visit(child, depth - 1, ply + 1, alpha, beta,
        sameAction(candidate, hint[0]) ? hint.slice(1) : [])
      if (!line) return null
      if (maximizing ? line.score > best.score : line.score < best.score) {
        best = { score: line.score, pv: [candidate, ...line.pv] }
      }
      if (maximizing) alpha = Math.max(alpha, best.score)
      else beta = Math.min(beta, best.score)
      if (alpha >= beta) {
        cutoffs++
        break
      }
    }
    return best
  }

  for (let depth = 1; depth <= target; depth++) {
    const line = visit(state, depth, 0, -Infinity, Infinity, completedDepth ? pv : [])
    if (!line) break
    completedDepth = depth
    score = line.score
    pv = line.pv
    action = pv[0]!
  }
  return report(stop ?? 'completed')
}
