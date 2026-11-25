import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Action } from '../engine/index.js'
import { createComputerWorker, launchComputerTurn } from './computer-turn.js'
import type { WorkerFactory } from './computer-turn.js'
import type { Match } from './match.js'
import { decisionSeed } from './match-config.js'

type Status = 'idle' | 'pending' | 'thinking' | 'applying' | 'error'
let nextRequest = 0

export function useComputerTurn(match: Match, enabled: boolean, generation: number,
  commit: (action: Action) => void, factory: WorkerFactory = createComputerWorker) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const cancelRef = useRef<() => void>(null)
  const latest = useRef({ match, enabled, generation, commit })
  useLayoutEffect(() => {
    latest.current = { match, enabled, generation, commit }
  })

  useEffect(() => {
    if (!enabled || match.config.mode !== 'computer') {
      setStatus('idle')
      setError('')
      return
    }
    const config = match.config
    const requestId = `${generation}:${match.cursor}:${++nextRequest}`
    let active = true
    let stop: (() => void) | undefined
    const stillCurrent = () => active && latest.current.enabled && latest.current.generation === generation &&
      latest.current.match === match && !match.state.outcome && match.state.turn === config.computer
    setStatus('pending')
    setError('')
    // Deferral lets the Strict Mode setup/cleanup probe expire before creating a worker.
    const timer = setTimeout(() => {
      if (!stillCurrent()) return
      stop = launchComputerTurn({
        requestId, state: match.state, difficulty: config.difficulty,
        seed: decisionSeed(config.seed, match.cursor),
      }, factory, {
        onThinking() { if (stillCurrent()) setStatus('thinking') },
        onError(message) {
          if (!stillCurrent()) return
          setStatus('error')
          setError(message)
        },
        onAction(action) {
          if (!stillCurrent()) return
          setStatus('applying')
          try {
            latest.current.commit(action)
          } catch {
            setStatus('error')
            setError('The computer move was not legal in this position. Retry its turn.')
          }
        },
      })
    }, 0)
    const cancel = () => { active = false; clearTimeout(timer); stop?.() }
    cancelRef.current = cancel
    return () => {
      cancel()
      if (cancelRef.current === cancel) cancelRef.current = null
    }
  }, [match, enabled, generation, attempt, factory])

  function invalidate() {
    if (!cancelRef.current) return
    cancelRef.current()
    setAttempt(value => value + 1)
  }

  return { status, error, invalidate, retry: () => setAttempt(value => value + 1) }
}
