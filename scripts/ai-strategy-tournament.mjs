import { performance } from 'node:perf_hooks'
import { appendFileSync, writeFileSync } from 'node:fs'
import { positionalDeployment, referencePolicies, runTournament, strategicFeatureNames, strategicPreset, summarizeGames } from '../dist/ai/index.js'

const named = (name, config) => ({ name, config: { ...config, tieBreak: 'seeded', nodeBudget: 512 } })
const baseline = named('S1', referencePolicies.S1)
const fast = named('S1-overlay', { ...referencePolicies.S1, transition: 'overlay' })
const strategic = named('strategic', { ...fast.config, strategicWeights: strategicPreset })
const extended = named('extended', { ...fast.config, tacticalExtensions: 1 })
const tactical = named('A2', referencePolicies.A2)
const time = (policy, name) => ({ name, config: { ...policy.config, depth: 3, timeBudgetMs: 8, nodeBudget: 1024 } })
const opening = (name, config) => named(name, { ...tactical.config, ...config })

const [mode, file, fromArg = '101', countArg = '6', capArg = '300', feature, weight] = process.argv.slice(2)
const pairs = {
  overlay: [baseline, fast],
  strategic: [fast, strategic],
  'node-budget': [{ ...fast, config: { ...fast.config, depth: 4 } }, { ...strategic, config: { ...strategic.config, depth: 4 } }],
  'time-budget': [time(fast, 'S1-overlay-time'), time(strategic, 'strategic-time')],
  extended: [fast, extended],
  self: [strategic, strategic],
  tactical: [tactical, strategic],
  dry: [fast, fast],
  ablation: [fast, named(`${feature}=${weight}`, { ...fast.config, strategicWeights: { [feature]: Number(weight) } })],
  'opening-legacy': [opening('random-opening', { deployment: 'random' }), opening('legacy-opening', { deployment: 'heuristic' })],
  'opening-positional': [opening('legacy-opening', { deployment: 'heuristic' }),
    opening('positional-opening', { deployment: 'heuristic', positionalDeploymentWeights: positionalDeployment })],
  'opening-search': [opening('positional-opening', { deployment: 'heuristic', positionalDeploymentWeights: positionalDeployment }),
    opening('search-opening', { deployment: 'search', depth: 2, transition: 'overlay', orderingStyle: 'phase',
      positionalDeploymentWeights: positionalDeployment })],
}
if (!Object.hasOwn(pairs, mode) || !file) throw new Error('Usage: ai-strategy-tournament.mjs MODE FILE [START COUNT CAP [FEATURE WEIGHT]]')
const from = Number(fromArg)
const count = Number(countArg)
if (!Number.isSafeInteger(from) || !Number.isSafeInteger(count) || count < 1) throw new RangeError('Invalid seeds')
if (mode === 'ablation' && (!strategicFeatureNames.includes(feature) ||
  weight === undefined || !Number.isFinite(Number(weight)))) throw new Error('Ablation requires a feature and finite weight')

const config = {
  opponents: pairs[mode], cap: Number(capArg),
  deployment: mode.startsWith('opening-') ? 'by-policy' : 'shared-random',
  seeds: Array.from({ length: count }, (_, i) => from + i),
}
writeFileSync(file, JSON.stringify({ mode, config }) + '\n')
const start = performance.now()
globalThis.gc?.()
const heapStart = process.memoryUsage().heapUsed
const games = []
for (const game of runTournament({ ...config, now: () => performance.now() })) {
  appendFileSync(file, JSON.stringify(game) + '\n')
  games.push(game)
}
globalThis.gc?.()
console.log(JSON.stringify({
  mode, config, ...summarizeGames(games), elapsedMs: performance.now() - start,
  heapWithLogsKiB: Math.round((process.memoryUsage().heapUsed - heapStart) / 1024),
  processPeakRssKiB: process.resourceUsage().maxRSS,
}, null, 2))
