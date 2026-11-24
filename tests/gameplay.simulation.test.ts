import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  applyAction, createGame, deserialize, legalActions, result, serialize,
} from '../src/engine/index.js'
import type { Action, GameState, Player } from '../src/engine/index.js'
import { holdingPairs, opponent, steps } from '../src/engine/board.js'
import { randomFor } from './seeded-random.js'

const games = 200
const cap = 1_000

function value(state: GameState, side: Player): number {
  const enemy = opponent(side)
  const { board, outcome, removed } = state
  if (outcome) return outcome.winner === null ? 0 : outcome.winner === side ? 10_000 : -10_000

  let score = 20 * (removed[enemy] - removed[side])
  const enemyAt = (at: number) => board[at]?.owner === enemy && board[at]?.status === 'active'
  board.forEach((counter, at) => {
    if (counter?.status === 'imprisoned') {
      score += counter.owner === side ? -12 : 10
    } else if (counter?.owner === side) {
      // Penalize a visible one-step closure. This is a heuristic, not a
      // prediction of the opponent's full turn or leap possibilities.
      const threatened = holdingPairs[at]!.some(pair =>
        pair.some((captor, index) => {
          const gap = pair[1 - index]!
          return enemyAt(captor) && board[gap] === null &&
            steps[gap]!.some(from => from !== captor && enemyAt(from))
        }),
      )
      if (threatened) score -= 2
    }
  })
  return score
}

function choose(state: GameState, actions: Action[], greedy: boolean, random: () => number): Action {
  if (!greedy || state.phase === 'deployment') return actions[Math.floor(random() * actions.length)]!

  // Scoring uses one hypothetical turn, without copying or scoring its
  // repetition ledger. The selected action uses the real state below.
  const preview = { ...state, repetitions: {} }
  let best = -Infinity
  const choices: Action[] = []
  for (const action of actions) {
    const score = value(applyAction(preview, action).state, state.turn)
    if (score > best) {
      choices.length = 0
      best = score
    }
    if (score === best) choices.push(action)
  }
  return choices[Math.floor(random() * choices.length)]!
}

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

function playPairing(pairing: 'random-random' | 'greedy-random' | 'greedy-greedy') {
  const outcomes = { white: 0, black: 0, draw: 0 }
  const reasons = { 'one-counter': 0, immobilization: 0, threefold: 0 }
  const lengths: number[] = []
  const completedLengths: number[] = []
  const removals: number[] = []
  const completedRemovals: number[] = []
  const removalsByColor = { white: 0, black: 0 }
  const mixed = {
    greedyWhite: { greedyWins: 0, randomWins: 0, draws: 0, truncated: 0 },
    greedyBlack: { greedyWins: 0, randomWins: 0, draws: 0, truncated: 0 },
  }
  for (let seed = 1; seed <= games; seed++) {
    const random = randomFor(seed)
    const greedySide = seed % 2 === 1 ? 'white' : 'black'
    const mixedColor = greedySide === 'white' ? mixed.greedyWhite : mixed.greedyBlack
    let state = createGame()
    let length = 0
    try {
      while (!result(state) && length < cap) {
        const actions = legalActions(state)
        assert(actions.length > 0, 'Ongoing game has no legal action')
        const greedy = pairing === 'greedy-greedy' ||
          (pairing === 'greedy-random' && state.turn === greedySide)
        state = applyAction(state, choose(state, actions, greedy, random)).state
        length++
      }
      assert.deepEqual(deserialize(serialize(state)), state)
    } catch (cause) {
      throw new Error(`${pairing}, seed ${seed}, after ${length} actions`, { cause })
    }
    lengths.push(length)
    const totalRemoved = state.removed.white + state.removed.black
    removals.push(totalRemoved)
    removalsByColor.white += state.removed.black
    removalsByColor.black += state.removed.white
    const outcome = result(state)
    if (outcome) {
      completedLengths.push(length)
      completedRemovals.push(totalRemoved)
      reasons[outcome.reason]++
      outcomes[outcome.winner ?? 'draw']++
    }
    if (pairing === 'greedy-random') {
      if (!outcome) mixedColor.truncated++
      else if (!outcome.winner) mixedColor.draws++
      else if (outcome.winner === greedySide) mixedColor.greedyWins++
      else mixedColor.randomWins++
    }
  }

  return {
    pairing, seedRange: [1, games], actionCap: cap,
    completed: completedLengths.length, truncated: games - completedLengths.length,
    reasons, outcomes,
    meanObservedActions: mean(lengths), maxObservedActions: Math.max(...lengths),
    meanCompletedActions: mean(completedLengths),
    meanRemovals: mean(removals), meanCompletedRemovals: mean(completedRemovals),
    meanRemovalsByColor: {
      white: removalsByColor.white / games, black: removalsByColor.black / games,
    },
    ...(pairing === 'greedy-random' ? { mixed } : {}),
  }
}

it.each(['random-random', 'greedy-random', 'greedy-greedy'] as const)(
  'diagnoses %s with 200 seeded games',
  pairing => {
    const report = playPairing(pairing)
    console.log(JSON.stringify(report, null, 2))
    assert.equal(report.completed, report.outcomes.white + report.outcomes.black + report.outcomes.draw)
    assert.equal(report.completed + report.truncated, games)
  },
  300_000,
)
