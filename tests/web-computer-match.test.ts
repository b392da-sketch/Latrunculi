import { expect, it } from 'vitest'
import { applyAction, legalActions, serialize } from '../src/engine/index.js'
import { commit, defaults, exportMatch, importMatch, newMatch, seek } from '../src/web/match.js'
import { actor, computerConfig, decisionCursor, decisionSeed } from '../src/web/match-config.js'
import { multiplePrisonersLog } from './ai/positions.js'
import { path, sq } from './fixtures.js'
import { gameFile, terminalLog } from './web-fixtures.js'

it('resolves random color once and deterministically seeds a committed cursor', () => {
  expect(computerConfig('tiro', 'random', 18)).toEqual({
    mode: 'computer', human: 'white', computer: 'black', difficulty: 'tiro', seed: 18,
  })
  expect(computerConfig('imperator', 'random', 19).human).toBe('black')
  expect(decisionSeed(18, 1)).toBe(decisionSeed(18, 1))
  expect(decisionSeed(18, 2)).not.toBe(decisionSeed(18, 1))
})

it('exports v2 with resolved roles and redo branch while migrating v1 to local', () => {
  const config = computerConfig('legatus', 'black', 23)
  const played = [sq('a1'), sq('b2'), sq('c3')].reduce((match, at) => commit(match, { type: 'place', at }),
    newMatch('white', config))
  const original = serialize(played.state)
  const { match, preferences } = importMatch(exportMatch(seek(played, 1), { ...defaults, flipped: true }))
  expect(match.config).toEqual(config)
  expect(match.cursor).toBe(1)
  expect(match.actions).toEqual(played.actions)
  expect(serialize(seek(match, 3).state)).toBe(original)
  expect(preferences.flipped).toBe(true)
  expect(importMatch(gameFile(played.actions)).match.config).toEqual({ mode: 'local' })
  expect(JSON.parse(exportMatch(newMatch(), defaults)).version).toBe(1)
})

it.each([{ human: 'black' }, { seed: -1 }, { difficulty: 'random' }, { computer: 'white' }, { mode: 'network' }])(
  'rejects invalid AI metadata (%j)',
  invalid => {
    const file = JSON.parse(exportMatch(newMatch('white', computerConfig('centurio', 'white', 12)), defaults))
    expect(() => importMatch(JSON.stringify({ ...file, config: { ...file.config, ...invalid } })))
      .toThrow('Invalid computer match configuration.')
  },
)

it('uses actors to preserve the AI-first prefix and undo or redo complete human decisions', () => {
  const config = computerConfig('miles', 'black', 4)
  let match = newMatch('white', config)
  match = commit(match, { type: 'place', at: sq('a1') })
  expect(decisionCursor(config, match.timeline, 1, -1)).toBe(1)
  match = commit(match, { type: 'place', at: sq('b1') })
  expect(decisionCursor(config, match.timeline, 2, -1)).toBe(1)
  match = commit(match, { type: 'place', at: sq('c1') })
  expect(decisionCursor(config, match.timeline, 3, -1)).toBe(1)
  expect(decisionCursor(config, match.timeline, 1, 1)).toBe(3)
  expect(decisionCursor(config, match.timeline, 2, 1)).toBe(3)
  expect(commit(seek(match, 1), { type: 'place', at: sq('d1') }).actions).toHaveLength(2)
})

it('handles atomic removal and a terminal removal without relying on turn parity', () => {
  const config = computerConfig('tiro', 'black', 8)
  const match = multiplePrisonersLog().reduce(commit, newMatch('white', config))
  const at = match.cursor
  const move = { type: 'battle', remove: sq('c3'), path: path('c2', 'c3') } as const
  const committed = commit(match, move)
  expect(actor(committed.timeline[at]!)).toBe('white')
  expect(committed.state).toEqual(applyAction(match.state, move).state)
  expect(committed.timeline[at]!.filter(event => ['removal', 'movement'].includes(event.type)).map(event => event.type))
    .toEqual(['removal', 'movement'])
  const ending = terminalLog().reduce(commit, newMatch())
  expect(legalActions(ending.state)).toEqual([])
  expect(actor(ending.timeline.at(-1)!)).toBe('white')
})
