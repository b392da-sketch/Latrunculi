import { performance } from 'node:perf_hooks'
import { appendFileSync, writeFileSync } from 'node:fs'
import { runTournament, summarizeGames } from '../dist/ai/index.js'

const opponent = (policy, extra = {}) => ({ name: policy, config: { policy, tieBreak: 'seeded', ...extra } })
const random = opponent('random')
const legacy = opponent('legacy')
const tactical = opponent('tactical')
const search = opponent('search', { depth: 2, nodeBudget: 512 })
const mobile = { ...opponent('tactical', { weights: { movable: 3, geometricOptions: 1 } }), name: 'tactical-mobility' }
const modes = {
  'random-legacy': [random, legacy, 50, 600],
  'legacy-tactical': [legacy, tactical, 50, 600],
  'tactical-tactical': [tactical, tactical, 50, 600],
  'tactical-search': [tactical, search, 10, 600],
  'search-search': [search, search, 10, 600],
  'tactical-mobility': [tactical, mobile, 20, 600],
  'deployment': [
    { ...tactical, name: 'random-placement', config: { ...tactical.config, deployment: 'random' } },
    { ...tactical, name: 'heuristic-placement', config: { ...tactical.config, deployment: 'heuristic' } },
    6, 400,
  ],
}

const [name, file, seedsArg, capArg] = process.argv.slice(2)
const mode = modes[name]
if (!mode || !file) throw new Error(`Usage: node scripts/ai-tournament.mjs <${Object.keys(modes).join('|')}> <log.jsonl> [seed-count] [cap]`)
const [first, second, count, cap] = mode
const seedCount = Number(seedsArg ?? count)
if (!Number.isSafeInteger(seedCount) || seedCount < 1) throw new RangeError('Invalid seed count')
const config = {
  opponents: [first, second], cap: Number(capArg ?? cap),
  seeds: Array.from({ length: seedCount }, (_, i) => i + 1),
  deployment: name === 'deployment' ? 'by-policy' : 'shared-random',
}
writeFileSync(file, JSON.stringify({ config }) + '\n')
const games = []
for (const game of runTournament({ ...config, now: () => performance.now() })) {
  appendFileSync(file, JSON.stringify(game) + '\n')
  games.push(game)
}
console.log(JSON.stringify({ name, config, ...summarizeGames(games) }, null, 2))
