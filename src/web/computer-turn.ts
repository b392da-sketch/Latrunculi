import { difficulties } from '../ai/difficulties.js'
import type { AiRequest, AiResponse } from '../ai/worker-protocol.js'
import type { Action } from '../engine/index.js'
import { readAction } from './match.js'

export interface ComputerWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  postMessage(request: AiRequest): void
  terminate(): void
}

export type WorkerFactory = () => ComputerWorker
export const createComputerWorker: WorkerFactory = () => new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })

interface Callbacks {
  onAction(action: Action): void
  onError(message: string): void
  onThinking(): void
}

const badResult = 'The computer returned an invalid result. Retry its turn.'

/** Owns exactly one worker request. Cleanup disarms captured callbacks before terminating. */
export function launchComputerTurn(request: AiRequest, factory: WorkerFactory, callbacks: Callbacks): () => void {
  let active = true
  let worker: ComputerWorker | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  function cancel() {
    if (!active) return
    active = false
    if (timer !== undefined) clearTimeout(timer)
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }
  }
  function fail(message: string) {
    if (!active) return
    cancel()
    callbacks.onError(message)
  }
  try {
    worker = factory()
    worker.onmessage = ({ data }) => {
      if (!active) return
      if (!data || typeof data !== 'object' || !(('requestId' in data) && typeof data.requestId === 'string')) {
        fail(badResult)
        return
      }
      if (data.requestId !== request.requestId) return
      const response = data as AiResponse
      if (response.ok === false && ['invalid-request', 'invalid-state', 'search-failed'].includes(response.error?.code)) {
        fail('The computer could not calculate this turn. Retry or save the match.')
        return
      }
      let action: Action
      try {
        if (response.ok !== true || !response.diagnostics ||
          !['completed', 'nodes', 'time'].includes(response.diagnostics.stop) ||
          !Number.isSafeInteger(response.diagnostics.completedDepth) || response.diagnostics.completedDepth < 0 ||
          !Number.isSafeInteger(response.diagnostics.nodes) || response.diagnostics.nodes < 0 ||
          !Number.isFinite(response.diagnostics.elapsedMs) || response.diagnostics.elapsedMs < 0 ||
          !Array.isArray(response.diagnostics.principalVariation)) throw new Error('Invalid worker diagnostics')
        action = readAction(response.action)
      } catch {
        fail(badResult)
        return
      }
      cancel()
      callbacks.onAction(action)
    }
    worker.onerror = event => {
      event.preventDefault()
      fail('The computer worker stopped unexpectedly. Retry its turn.')
    }
    worker.onmessageerror = () => fail(badResult)
    timer = setTimeout(() => fail('The computer did not respond. Retry its turn.'), difficulties[request.difficulty].config.timeBudgetMs + 8_000)
    worker.postMessage(request)
    if (active) callbacks.onThinking()
  } catch {
    fail('The computer worker could not start. Retry its turn.')
  }
  return cancel
}
