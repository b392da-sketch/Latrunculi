import { applyAction, legalActions, mandatoryRemovals } from '../engine/index.js'
import type { Action, GameEvent, GameState } from '../engine/index.js'
import { makeEvaluator, terminalScore } from './evaluation.js'
import { legacyValue } from './legacy.js'
import { ordered, sameAction } from './ordering.js'
import { applyOverlay } from './overlay.js'
import { makeStrategicBonus, strategicFeatureNames } from './strategic.js'
import { sampleCandidate, validateSelection } from './selection.js'
import type { Candidate } from './selection.js'
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
  const extensions = integer(config.tacticalExtensions ?? 0, 0, 4)
  const window = config.aspirationWindow
  if (window !== undefined && (!Number.isSafeInteger(window) || window < 1 || window > 500_000)) {
    throw new RangeError('Invalid aspiration window')
  }
  for (const weights of [config.strategicWeights, config.positionalDeploymentWeights]) {
    for (const [key, value] of Object.entries(weights ?? {})) {
      if (!strategicFeatureNames.some(name => name === key) || !Number.isFinite(value) || Math.abs(value) > 1_000_000) {
        throw new RangeError('Invalid strategic weight')
      }
    }
  }
  if (config.transition !== undefined && config.transition !== 'canonical' && config.transition !== 'overlay') {
    throw new RangeError('Invalid transition backend')
  }
  if (config.orderingStyle !== undefined && config.orderingStyle !== 'legacy' && config.orderingStyle !== 'phase') {
    throw new RangeError('Invalid ordering style')
  }
  const apply = config.transition === 'overlay' ? applyOverlay : applyAction
  const timeBudget = config.timeBudgetMs
  if (timeBudget !== undefined && (!Number.isFinite(timeBudget) || timeBudget < 0)) {
    throw new RangeError('Invalid AI time budget')
  }
  if (config.selection) validateSelection(config.selection)
  const actions = legalActions(state)
  const firstUsableMs = Math.max(0, now() - start)
  const generator = config.random ?? randomFor(config.seed ?? 0)
  const random = () => {
    const value = generator()
    if (!(value >= 0 && value < 1)) throw new RangeError('Random generator must return a value in [0, 1)')
    return value
  }
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
  const bonus = makeStrategicBonus(config.strategicWeights, config.positionalDeploymentWeights)
  function value(node: GameState, ply: number): number {
    evaluations++
    if (mode === 'legacy') return legacyValue(node, root)
    const terminal = terminalScore(node, root, ply)
    if (terminal !== null) return terminal
    return Math.max(-500_000, Math.min(500_000, evaluate(node, root) + bonus(node, root)))
  }

  let stop: ReturnType<typeof stopped>
  if (mode !== 'search') {
    const selection = state.phase === 'battle' ? config.selection : undefined
    const scored: Candidate[] = []
    const best: Action[] = []
    let bestScore = -Infinity
    for (const candidate of actions) {
      stop = stopped()
      if (stop) break
      nodes++
      const child = apply(state, candidate).state
      const candidateScore = value(child, 1)
      if (selection) scored.push({
        action: candidate, score: candidateScore,
        terminal: child.outcome?.winner === root ? 'win' : child.outcome?.winner ? 'loss' : null,
      })
      if (candidateScore > bestScore) {
        bestScore = candidateScore
        best.length = 0
      }
      if (candidateScore === bestScore) best.push(candidate)
    }
    if (selection && scored.length) {
      const selected = sampleCandidate(scored, selection, random)
      action = selected.action
      score = selected.score
      pv = [action]
    } else if (best.length) {
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
    hint: readonly Action[], remaining: number, incoming: readonly GameEvent[]): Line | null {
    if (node.outcome) return { score: value(node, ply), pv: [] }
    if (depth === 0) {
      const unstable = remaining > 0 && node.phase === 'battle' && (
        mandatoryRemovals(node).length > 0 ||
        incoming.some(event => event.type === 'liberation') ||
        incoming.filter(event => event.type === 'imprisonment').length > 1
      )
      if (!unstable) return { score: value(node, ply), pv: [] }
      remaining--
      depth = 1
    }
    let choices = ply === 0 ? rootActions : legalActions(node)
    const earlyDeployment = config.orderingStyle === 'phase' && node.phase === 'deployment' &&
      node.reserves.white + node.reserves.black > 8
    if (config.ordering !== false && !earlyDeployment) choices = ordered(node, choices, hint[0])
    const maximizing = node.turn === root
    let best: Line = { score: maximizing ? -Infinity : Infinity, pv: [] }
    for (const candidate of choices) {
      stop = stopped()
      if (stop) return null
      nodes++
      const child = apply(node, candidate)
      const line = visit(child.state, depth - 1, ply + 1, alpha, beta,
        sameAction(candidate, hint[0]) ? hint.slice(1) : [], remaining, child.events)
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
    const hint = completedDepth ? pv : []
    const low = score !== null && window ? score - window : -Infinity
    const high = score !== null && window ? score + window : Infinity
    let line = visit(state, depth, 0, low, high, hint, extensions, [])
    if (line && (line.score <= low || line.score >= high)) {
      line = visit(state, depth, 0, -Infinity, Infinity, hint, extensions, [])
    }
    if (!line) break
    completedDepth = depth
    score = line.score
    pv = line.pv
    action = pv[0]!
  }
  return report(stop ?? 'completed')
}
