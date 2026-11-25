// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { handleAiRequest } from '../src/ai/worker-protocol.js'
import type { AiRequest } from '../src/ai/worker-protocol.js'
import { applyAction, createGame, legalActions } from '../src/engine/index.js'
import type { Action } from '../src/engine/index.js'
import { App } from '../src/web/App.js'
import type { ComputerWorker } from '../src/web/computer-turn.js'
import { launchComputerTurn } from '../src/web/computer-turn.js'
import { commit, defaults, exportMatch, importMatch, newMatch, preferencesKey, saveKey, seek } from '../src/web/match.js'
import { computerConfig } from '../src/web/match-config.js'
import { battle, move, path, sq } from './fixtures.js'
import { gameFile, terminalLog } from './web-fixtures.js'
import { multiplePrisonersLog } from './ai/positions.js'

class FakeWorker implements ComputerWorker {
  onmessage: ComputerWorker['onmessage'] = null
  onerror: ComputerWorker['onerror'] = null
  onmessageerror: ComputerWorker['onmessageerror'] = null
  request!: AiRequest
  terminated = false
  postMessage(request: AiRequest) { this.request = request }
  terminate() { this.terminated = true }
  answer(action?: Action) {
    const send = this.onmessage
    const response = handleAiRequest(this.request, { now: () => 0 })
    const payload = action ? { ...response, action } : response
    act(() => send?.(new MessageEvent('message', { data: payload })))
  }
}

afterEach(() => { cleanup(); localStorage.clear() })

function setup(saved?: string, reducedMotion = true) {
  localStorage.setItem(preferencesKey, JSON.stringify({ ...defaults, reducedMotion }))
  if (saved) localStorage.setItem(saveKey, saved)
  const workers: FakeWorker[] = []
  const view = render(<StrictMode><App workerFactory={() => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  }} /></StrictMode>)
  return { workers, view }
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const place = (at: string) => click(new RegExp(`^${at}, empty`))
const request = async (workers: FakeWorker[], count: number) => {
  await waitFor(() => expect(workers).toHaveLength(count))
  return workers[count - 1]!
}

function start(side: 'white' | 'black' = 'white') {
  click('Play the computer')
  fireEvent.click(screen.getByRole('radio', { name: side === 'white' ? 'White · Ivory' : 'Black · Obsidian' }))
  click('Start match')
}

function save() {
  click('Save game')
  return importMatch(localStorage.getItem(saveKey)!).match
}

it('AI-first starts exactly one request under Strict Mode and ignores duplicate callbacks', async () => {
  const { workers } = setup()
  start('black')
  const worker = await request(workers, 1)
  expect(worker.request.state.turn).toBe('white')
  expect(worker.request.difficulty).toBe('centurio')
  place('d4')
  expect(screen.getByText('0 / 40 placed')).toBeTruthy()
  const captured = worker.onmessage
  worker.answer({ type: 'place', at: sq('a8') })
  act(() => captured?.(new MessageEvent('message', { data: handleAiRequest(worker.request) })))
  expect(screen.getByText('1 / 40 placed')).toBeTruthy()
  expect(worker.terminated).toBe(true)
  expect(workers).toHaveLength(1)
  expect((screen.getByRole('button', { name: /Undo/ }) as HTMLButtonElement).disabled).toBe(true)
})

it('undo cancels a pending search, redo preserves committed moves and a new branch drops them', async () => {
  const { workers } = setup()
  start()
  place('d4')
  const worker = await request(workers, 1)
  const deferred = worker.onmessage
  click(/Undo/)
  await screen.findByText('0 / 40 placed')
  expect(worker.terminated).toBe(true)
  act(() => deferred?.(new MessageEvent('message', { data: handleAiRequest(worker.request) })))
  expect(screen.getByText('0 / 40 placed')).toBeTruthy()
  click(/Redo/)
  const resumed = await request(workers, 2)
  expect(resumed.request.seed).toBe(worker.request.seed)
  resumed.answer({ type: 'place', at: sq('e4') })
  await screen.findByText('2 / 40 placed')
  click(/Undo/)
  await screen.findByText('0 / 40 placed')
  click(/Redo/)
  await screen.findByText('2 / 40 placed')
  expect(workers).toHaveLength(2)
  click(/Undo/)
  await screen.findByText('0 / 40 placed')
  place('a2')
  await request(workers, 3)
  expect(save().actions).toEqual([{ type: 'place', at: sq('a2') }])
})

it('waits for the previous presentation before scheduling an AI reply', async () => {
  const { workers } = setup(undefined, false)
  start()
  place('d4')
  expect(workers).toHaveLength(0)
  expect(screen.getByText('Computer turn paused.')).toBeTruthy()
  await request(workers, 1)
})

it('retry recovers from runtime failure, malformed and canonically illegal replies', async () => {
  const { workers } = setup()
  start()
  place('d4')
  const broken = await request(workers, 1)
  act(() => broken.onerror?.(new ErrorEvent('error')))
  expect(screen.getByRole('alert').textContent).toContain('worker stopped')
  click('Retry computer turn')
  const malformed = await request(workers, 2)
  act(() => malformed.onmessage?.(new MessageEvent('message', { data: { requestId: malformed.request.requestId, ok: true } })))
  expect(screen.getByRole('alert').textContent).toContain('invalid result')
  click('Retry computer turn')
  const illegal = await request(workers, 3)
  illegal.answer({ type: 'place', at: sq('d4') })
  expect(screen.getByRole('alert').textContent).toContain('not legal')
  expect(save().cursor).toBe(1)
  click('Retry computer turn')
  const retried = await request(workers, 4)
  expect(retried.request.seed).toBe(broken.request.seed)
  retried.answer({ type: 'place', at: sq('e4') })
  await screen.findByText('2 / 40 placed')
})

it('navigation and unmount terminate active work, with a fresh request on return', async () => {
  const { workers, view } = setup()
  start('black')
  const worker = await request(workers, 1)
  const stale = worker.onmessage
  click('Settings')
  expect(worker.terminated).toBe(true)
  act(() => stale?.(new MessageEvent('message', { data: handleAiRequest(worker.request) })))
  click(/Back/)
  const next = await request(workers, 2)
  expect(next.request.state.board.every(counter => counter === null)).toBe(true)
  expect(next.request.requestId).not.toBe(worker.request.requestId)
  view.unmount()
  expect(next.terminated).toBe(true)
})

it('saving and resuming during AI search keeps the cursor, state and per-turn seed', async () => {
  const first = setup()
  start()
  place('d4')
  const pending = await request(first.workers, 1)
  expect(save().cursor).toBe(1)
  expect(pending.terminated).toBe(false)
  const saved = localStorage.getItem(saveKey)!
  first.view.unmount()
  const second = setup(saved)
  click('Continue saved game')
  const resumed = await request(second.workers, 1)
  expect(resumed.request.state).toEqual(pending.request.state)
  expect(resumed.request.seed).toBe(pending.request.seed)
})

it('holds a recorded AI turn at an imported cursor until redo', async () => {
  const config = computerConfig('centurio', 'white', 5)
  const full = [sq('d4'), sq('e4')].reduce((s, at) => commit(s, { type: 'place', at }), newMatch('white', config))
  const { workers } = setup(exportMatch(seek(full, 1), defaults))
  click('Continue saved game')
  await screen.findByText('Recorded computer turn. Use Redo to continue.')
  expect(workers).toHaveLength(0)
  click(/Redo/)
  await screen.findByText('2 / 40 placed')
  expect(workers).toHaveLength(0)
})

it('commits an AI removal-and-move turn once, from the canonical opening', async () => {
  const config = computerConfig('centurio', 'black', 7)
  const ending = multiplePrisonersLog().reduce(commit, newMatch('white', config))
  const { workers } = setup(exportMatch(ending, defaults))
  click('Continue saved game')
  const worker = await request(workers, 1)
  const action = { type: 'battle', remove: sq('c3'), path: path('c2', 'c3') } as const
  worker.answer(action)
  await screen.findByText('43 turns')
  expect(save().state).toEqual(applyAction(ending.state, action).state)
})

it('renders an ordered cascade after an AI action and handles a terminal AI removal', async () => {
  const worker = new FakeWorker()
  let cascade: string[] = []
  const config = computerConfig('centurio', 'black', 8)
  const fixture = battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8')
  // Exercise cascade event delivery independently of constructing an opening that yields this custody.
  const matches = launchComputerTurn({ requestId: 'cascade', state: fixture, difficulty: 'centurio' },
    () => worker, { onThinking() {}, onError(message) { throw new Error(message) },
      onAction(action) { cascade = applyAction(fixture, action).events.map(event => event.type) } })
  worker.answer(move('c5', 'c4'))
  expect(cascade).toEqual(['movement', 'imprisonment', 'liberation', 'imprisonment', 'liberation', 'imprisonment'])
  matches()
  const log = terminalLog()
  const penultimate = log.slice(0, -1).reduce(commit, newMatch('white', config))
  const { workers } = setup(exportMatch(penultimate, defaults))
  click('Continue saved game')
  const computer = await request(workers, 1)
  computer.answer(log.at(-1))
  await screen.findByRole('heading', { name: 'Ivory wins' })
  expect(workers).toHaveLength(1)
  expect(save().state.outcome).toMatchObject({ reason: 'one-counter', winner: 'white' })
})

it('invalidates the active AI callback immediately when importing another match', async () => {
  const { workers } = setup()
  start('black')
  const pending = await request(workers, 1)
  const stale = pending.onmessage
  let finish!: (value: string) => void
  const file = new File(['pending'], 'local.json')
  Object.defineProperty(file, 'text', { value: () => new Promise<string>(resolve => { finish = resolve }) })
  fireEvent.change(screen.getByLabelText('Import JSON'), { target: { files: [file] } })
  expect(pending.terminated).toBe(true)
  act(() => stale?.(new MessageEvent('message', { data: handleAiRequest(pending.request) })))
  await act(async () => finish(gameFile([{ type: 'place', at: sq('g7') }])))
  expect(screen.getByRole('button', { name: 'g7, Ivory active counter' })).toBeTruthy()
  expect(workers).toHaveLength(1)
})


it('reports worker startup failure without committing an action', () => {
  const onAction = vi.fn()
  const onError = vi.fn()
  const cancel = launchComputerTurn({ requestId: 'startup', state: createGame(), difficulty: 'centurio' },
    () => { throw new Error('Worker unavailable') }, { onAction, onError, onThinking() {} })
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('could not start'))
  expect(onAction).not.toHaveBeenCalled()
  cancel()
})

it('ignores mismatched replies and terminates a silent worker at the watchdog', () => {
  vi.useFakeTimers()
  try {
    const worker = new FakeWorker()
    const onAction = vi.fn()
    const onError = vi.fn()
    launchComputerTurn({ requestId: 'live', state: createGame(), difficulty: 'centurio' }, () => worker,
      { onAction, onError, onThinking() {} })
    const valid = handleAiRequest(worker.request)
    worker.onmessage?.(new MessageEvent('message', { data: { ...valid, requestId: 'stale' } }))
    expect(onAction).not.toHaveBeenCalled()
    expect(worker.terminated).toBe(false)
    vi.advanceTimersByTime(8_450)
    expect(worker.terminated).toBe(true)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('did not respond'))
  } finally {
    vi.useRealTimers()
  }
})
