import { readFileSync } from 'node:fs'
import { applyAction, createGame, formatAction, legalActions } from '../dist/engine/index.js'
import { chooseAction, extractFeatures, makeEvaluator, probeMobility, strategicPreset } from '../dist/ai/index.js'

const source = process.argv[2]
if (!source) throw new Error('Pass an M3.1 search-search tournament JSONL file.')
const [, ...games] = readFileSync(source, 'utf8').trim().split('\n').map(line => JSON.parse(line))
const samples = []
const evaluate = makeEvaluator()
const probe = process.argv.includes('--search')
for (const game of games) {
  const segments = []
  let from = 40
  for (let i = from; i <= game.actions.length; i++) {
    const action = game.actions[i]
    if (i === game.actions.length || action?.type === 'battle' && action.remove !== undefined) {
      segments.push({ from, end: i })
      from = i + 1
    }
  }
  const { from: start, end } = segments.sort((a, b) => (b.end - b.from) - (a.end - a.from))[0]
  const midpoint = Math.floor((start + end) / 2)
  const positions = []
  let search
  const routes = new Set()
  let reverse = 0
  let state = createGame()
  const prior = { white: null, black: null }
  for (let i = 0; i <= end; i++) {
    if (i === start || i === midpoint || i === end) {
      const f = extractFeatures(state)
      positions.push({
        at: i, removed: state.removed, threats: [f.white.threats, f.black.threats],
        cohesion: [f.white.cohesion, f.black.cohesion],
        options: ['white', 'black'].map(side => probeMobility(state, side).geometric.pairs),
        contact: f.white.contact + f.black.contact,
        board: state.board.map(c => c ? c.status === 'imprisoned' ? c.owner[0].toUpperCase() : c.owner[0] : '.').join(''),
      })
    }
    if (probe && i === midpoint) {
      const values = legalActions(state).map(action => evaluate(applyAction(state, action).state, state.turn))
      const best = Math.max(...values)
      const decisions = [
        { label: 'S1-depth-two', depth: 2 },
        { label: 'S1-depth-four', depth: 4 },
        { label: 'strategic-depth-two', depth: 2, strategicWeights: strategicPreset },
      ].map(({ label, ...config }) => {
        const decision = chooseAction(state, { ...config, transition: 'overlay', nodeBudget: 16_000 })
        const { score, nodes, completedDepth } = decision.diagnostics
        return { label, action: decision.action && formatAction(decision.action), score, nodes, completedDepth }
      })
      search = { actions: values.length, scoreRange: [Math.min(...values), best], tied: values.filter(value => value === best).length, decisions }
    }
    if (i === end) break
    const action = game.actions[i]
    if (i >= start && action.type === 'battle' && action.path) {
      const pair = [action.path[0], action.path.at(-1)]
      const last = prior[state.turn]
      if (last?.[0] === pair[1] && last[1] === pair[0]) reverse++
      prior[state.turn] = pair
      routes.add(`${state.turn}:${pair.join('-')}`)
    }
    state = applyAction(state, action).state
  }
  samples.push({
    seed: game.seed, swapped: game.swapped, start, end, length: end - start, reverse,
    distinctRoutes: routes.size, positions, ...(search ? { search } : {}),
    excerpt: game.actions.slice(midpoint - 3, midpoint + 4).map(formatAction),
  })
}
console.log(JSON.stringify(samples, null, 2))
