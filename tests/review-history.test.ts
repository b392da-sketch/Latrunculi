import { expect, it, vi } from 'vitest'
import { legalActions } from '../src/engine/index.js'
import { commit, current, importMatch, importMatchAsync, maxImportActions, maxImportBytes, seek } from '../src/web/match.js'
import { quietHistory } from './history-benchmark-fixtures.js'
import { gameFile, replay, terminalLog } from './web-fixtures.js'

it('reconstructs a cold cursor, redo and a branch after thinning checkpoints', () => {
  const actions = quietHistory(1_150)
  const match = importMatch(gameFile(actions)).match
  expect(match.checkpoints.stride).toBeGreaterThan(32)
  expect(match.checkpoints.states.size).toBeLessThanOrEqual(32)
  expect(match.recent.size).toBeLessThanOrEqual(24)
  expect(current(match)).toEqual(replay(actions))
  const cold = seek(match, 333)
  expect(current(cold)).toEqual(replay(actions.slice(0, 333)))
  expect(current(seek(cold, 334))).toEqual(replay(actions.slice(0, 334)))
  const action = legalActions(current(cold)).find(candidate =>
    JSON.stringify(candidate) !== JSON.stringify(actions[333]))!
  const changed = commit(cold, action)
  expect(changed.actions).toHaveLength(334)
  expect(changed.timeline).toHaveLength(334)
  expect([...changed.checkpoints.states.keys(), ...changed.recent.keys()].every(i => i <= 334)).toBe(true)
  expect(current(changed)).toEqual(replay([...actions.slice(0, 333), action]))
  expect(current(seek(changed, 1150))).toEqual(current(changed))
})

it('seeks through removals, ledger resets and terminal redo exactly', () => {
  const actions = terminalLog()
  const match = importMatch(gameFile(actions, 400)).match
  const terminal = seek(match, actions.length)
  expect(current(terminal)).toEqual(replay(actions))
  expect(current(seek(terminal, 400))).toEqual(current(match))
})

it('rejects oversized text, excessive action count and an impossible path', () => {
  expect(() => importMatch('a'.repeat(maxImportBytes + 1))).toThrow(/5 MiB/)
  expect(() => importMatch(gameFile(Array.from({ length: maxImportActions + 1 }, () => ({ type: 'place', at: 0 })))))
    .toThrow(/12,000 actions/)
  expect(() => importMatch(gameFile([{ type: 'battle', path: Array<number>(65).fill(0) }]))).toThrow(/position 1/)
})

it('can abort replay after yielding and returns the same v1 history when completed', async () => {
  const json = gameFile(quietHistory(100), 42)
  const controller = new AbortController()
  let time = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => { time += 13; return time })
  try {
    const replaying = importMatchAsync(json, controller.signal)
    controller.abort()
    await expect(replaying).rejects.toMatchObject({ name: 'AbortError' })
  } finally {
    clock.mockRestore()
  }
  const restored = await importMatchAsync(json, new AbortController().signal)
  expect(restored).toEqual(importMatch(json))
})
