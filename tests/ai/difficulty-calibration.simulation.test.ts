import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { difficulties, difficultyConfig, positionalDeployment, referencePolicies, runTournament, summarizeGames } from '../../src/ai/index.js'
import type { AiConfig, DifficultyId, TournamentOptions } from '../../src/ai/index.js'
import { quietHistory } from '../history-benchmark-fixtures.js'
import { replay, terminalLog } from '../web-fixtures.js'
import { multiplePrisonersLog, seededLog } from './positions.js'

const group = process.env.M33_GROUP ?? 'lower'
const output = process.env.M33_OUTPUT ?? '/tmp'
type Opponent = TournamentOptions['opponents'][number]
type Trial = Omit<TournamentOptions, 'now'> & { name: string }
const reduced: Partial<Record<DifficultyId, number>> = { centurio: 410, legatus: 960, imperator: 2100 }
const opponent = (id: DifficultyId, full = false): Opponent => {
  const nodes = reduced[id]
  const config = difficultyConfig(id, { mode: 'deterministic', ...(nodes && !full ? { limits: { nodes } } : {}) })
  return { name: id, config }
}
const control = (name: keyof typeof referencePolicies): Opponent => ({
  name, config: { ...referencePolicies[name], nodeBudget: 512 },
})
const matchup = (a: Opponent, b: Opponent, seeds: readonly number[], cap = 260): Trial => ({
  name: `${a.name}-${b.name}`, opponents: [a, b], seeds, cap,
})

it(`calibrates the ${group} difficulty group`, () => {
  const seeds = [101, 102, 103, 104, 105, 106]
  const [t, m, v, c, l, i] = (['tiro', 'miles', 'veteranus', 'centurio', 'legatus', 'imperator'] as const)
    .map(id => opponent(id)) as [Opponent, Opponent, Opponent, Opponent, Opponent, Opponent]
  let trials: Trial[]
  switch (group) {
    case 'lower':
      trials = [
        matchup(t, m, seeds), matchup(m, v, seeds), matchup(v, c, seeds),
        matchup(control('A0'), t, seeds), matchup(control('A1'), m, seeds), matchup(control('A1'), v, seeds),
        matchup(control('A2'), c, seeds),
      ]
      break
    case 'upper':
      trials = [matchup(c, l, seeds.slice(0, 4)), matchup(l, i, seeds.slice(0, 4)),
        matchup(control('S1'), l, seeds.slice(0, 4)), matchup(control('A2'), i, seeds.slice(0, 4)),
        matchup(i, i, seeds.slice(0, 2))]
      break
    case 'additional':
      trials = [
        matchup(control('A2'), l, seeds.slice(0, 4)),
        {
          ...matchup(v, { name: 'opening-positional', config: { ...v.config, deployment: 'heuristic',
            positionalDeploymentWeights: positionalDeployment } }, [1, 2, 3], 200),
          deployment: 'by-policy',
        },
      ]
      break
    case 'target': {
      const log = terminalLog()
      const starts = [
        ['dense', seededLog(7, 58)], ['material', log.slice(0, 630)],
        ['custody', multiplePrisonersLog()], ['sparse', log.slice(0, 850)], ['long', quietHistory(1120)],
      ] as const
      trials = starts.map(([label, start], index) => {
        const configs: [Opponent, Opponent] = index % 2
          ? [opponent('legatus', true), opponent('imperator', true)]
          : [opponent('centurio', true), opponent('legatus', true)]
        const state = replay(start)
        console.log(JSON.stringify({ label, start: start.length, turn: state.turn, material: state.removed,
          counters: state.board.filter(Boolean).length, keys: Object.keys(state.repetitions).length }))
        return { name: `target-${label}`, opponents: configs, seeds: [107], cap: start.length + 16, startingActions: start }
      })
      break
    }
    case 'design': {
      const mixed: AiConfig = { ...t.config, selection: { kind: 'mixture', randomRate: 0.3 } }
      const pure: AiConfig = { ...m.config, selection: { kind: 'rank', candidates: 1, margin: 0, decay: 1 } }
      trials = [
        matchup(t, { name: 'mixed-tiro', config: mixed }, [1, 2, 3], 200),
        matchup(m, { name: 'greedy-miles', config: pure }, [1, 2, 3], 200),
        ...(['heuristic', 'search'] as const).map(deployment => ({
          ...matchup(v, { name: `opening-${deployment}`, config: { ...v.config, deployment, depth: 2, nodeBudget: 512 } },
            [1, 2, 3], 200),
          deployment: 'by-policy' as const,
        })),
      ]
      break
    }
    default: throw new Error('Unknown calibration group')
  }
  for (const trial of trials) {
    globalThis.gc?.()
    const before = process.memoryUsage().heapUsed
    const games = [...runTournament({ ...trial, now: () => performance.now() })]
    globalThis.gc?.()
    const report = {
      name: trial.name, cap: trial.cap, ...summarizeGames(games),
      heapWithLogsKiB: Math.round((process.memoryUsage().heapUsed - before) / 1024),
      processPeakRssKiB: process.resourceUsage().maxRSS,
    }
    writeFileSync(`${output}/${trial.name}.jsonl`, [trial, ...games].map(value => JSON.stringify(value)).join('\n') + '\n')
    writeFileSync(`${output}/${trial.name}.summary.json`, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  }
}, 600_000)
