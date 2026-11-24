import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  applyAction, createGame, deserialize, legalActions, PLAYERS, result, serialize,
} from '../src/engine/index.js'
import { isHeld } from '../src/engine/imprisonment.js'
import { randomFor } from './seeded-random.js'

const games = 2_000
const cap = 1_000

it('runs seeded legal games and reports canonical outcomes separately from truncation', () => {
  const report = {
    seedRange: [1, games], simulationOnlyActionCap: cap, completed: 0, truncated: 0,
    outcomes: { white: 0, black: 0, draw: 0 },
    reasons: { 'one-counter': 0, immobilization: 0, threefold: 0 },
    averageObservedActions: 0, maximumObservedActions: 0,
    averageCompletedActions: 0, illegalActions: 0, invariantFailures: 0,
    failureSeeds: [] as number[],
  }
  let total = 0
  let completedTotal = 0
  const failures: Error[] = []
  for (let seed = 1; seed <= games; seed++) {
    const random = randomFor(seed)
    let state = createGame()
    let length = 0
    let checkingAction = false
    try {
      while (!result(state) && length < cap) {
        const actions = legalActions(state)
        assert(actions.length > 0, 'Ongoing game has no legal actions')
        const action = actions[Math.floor(random() * actions.length)]!
        checkingAction = true
        state = applyAction(state, action).state
        checkingAction = false
        length++

        const counts = { white: 0, black: 0 }
        const ids = new Set<number>()
        state.board.forEach((counter, at) => {
          if (!counter) return
          counts[counter.owner]++
          assert(!ids.has(counter.id), 'Counter ID is duplicated')
          ids.add(counter.id)
          if (counter.status === 'imprisoned') {
            assert(isHeld(state.board, at, counter.owner), 'Prisoner has no active holding pair')
          }
        })
        for (const owner of PLAYERS) {
          assert.equal(counts[owner] + state.reserves[owner] + state.removed[owner], 20)
        }
      }

      assert.deepEqual(deserialize(serialize(state)), state)
      const outcome = result(state)
      total += length
      report.maximumObservedActions = Math.max(report.maximumObservedActions, length)
      if (outcome) {
        report.completed++
        completedTotal += length
        report.outcomes[outcome.winner ?? 'draw']++
        report.reasons[outcome.reason]++
      } else {
        report.truncated++
      }
    } catch (cause) {
      if (checkingAction) report.illegalActions++
      else report.invariantFailures++
      report.failureSeeds.push(seed)
      failures.push(new Error(`Simulation seed ${seed}, action ${length + 1}`, { cause }))
    }
  }
  report.averageObservedActions = total / (report.completed + report.truncated)
  report.averageCompletedActions = completedTotal / report.completed
  console.log(JSON.stringify(report, null, 2))
  if (failures.length) throw new AggregateError(failures, 'Seeded simulations failed')
  assert.equal(report.completed + report.truncated, games)
}, 180_000)
