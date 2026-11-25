import { describe, expect, it } from 'vitest'
import { parseSquare, result } from '../src/engine/index.js'
import { commit, current, defaults, exportMatch, importMatch, newMatch, seek } from '../src/web/match.js'
import { gameFile, replay, terminalLog } from './web-fixtures.js'

describe('match log persistence', () => {
  it('validates full replay and retains the selected undo cursor and preferences', () => {
    const first = commit(newMatch(), { type: 'place', at: parseSquare('d4') })
    const second = commit(first, { type: 'place', at: parseSquare('e4') })
    const prefs = { ...defaults, flipped: true }
    const restored = importMatch(exportMatch(seek(second, 1), prefs))
    expect(restored.preferences).toEqual(prefs)
    expect(current(restored.match)).toEqual(current(first))
    expect(current(seek(restored.match, 2))).toEqual(current(second))
  })

  it('discards the redo branch when committing a different action', () => {
    const undone = seek(commit(newMatch(), { type: 'place', at: 0 }), 0)
    const changed = commit(undone, { type: 'place', at: 1 })
    expect(changed.actions).toEqual([{ type: 'place', at: 1 }])
    expect(changed.timeline).toHaveLength(1)
  })

  it.each([
    ['not valid JSON', '{'],
    ['version', '{"version":3}'],
    ['cursor', gameFile([], 1)],
    ['position 2', gameFile([{ type: 'place', at: 0 }, { type: 'place', at: 0 }], 1)],
    ['position 1', gameFile([{ type: 'battle', path: [0, 1] }])],
    ['preferences', gameFile([]).replace('"coordinates":true', '"coordinates":0')],
  ])('rejects malformed input for %s', (message, json) => {
    expect(() => importMatch(json)).toThrow(new RegExp(message, 'i'))
  })

  it('validates and restores a terminal result and its preceding position', () => {
    const log = terminalLog()
    const match = importMatch(gameFile(log)).match
    expect(result(current(match))?.reason).toBe('one-counter')
    expect(current(match)).toEqual(replay(log))
    expect(result(current(seek(match, log.length - 1)))).toBeNull()
  })
})
