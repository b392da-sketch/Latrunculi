import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { createGame } from '../src/engine/index.js'
import { multiplePrisoners, seededPosition } from './ai/positions.js'
import { quietHistory } from './history-benchmark-fixtures.js'
import { replay, terminalLog } from './web-fixtures.js'

it('writes legally replayable browser-worker benchmarks', () => {
  const fixtures = {
    deployment: createGame(),
    early: seededPosition(7, 45),
    dense: seededPosition(27, 64),
    custody: multiplePrisoners(),
    sparse: replay(terminalLog().slice(0, 850)),
    long: replay(quietHistory(2_500)),
  }
  writeFileSync(process.env.LATRUNCULI_WORKER_FIXTURES ?? '/tmp/latrunculi-worker-fixtures.json', JSON.stringify(fixtures))
})
