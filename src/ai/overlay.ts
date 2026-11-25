import { applyWithVisitRecorder } from '../engine/game.js'
import type { Action, GameState, Transition } from '../engine/index.js'

type Ledger = GameState['repetitions']
const parent = Symbol('search ledger parent')
type Layer = Ledger & { readonly [parent]?: Ledger }

function visit(ledger: Ledger, key: string): Ledger {
  return Object.create(ledger, {
    [parent]: { value: ledger },
    [key]: { value: (ledger[key] ?? 0) + 1, enumerable: true },
  }) as Ledger
}

/** Internal search state. Materialize before serialization or enumerating ledger entries. */
export function applyOverlay(state: GameState, action: Action): Transition {
  return applyWithVisitRecorder(state, action, visit)
}

export function materialize(state: GameState): GameState {
  let ledger = state.repetitions as Layer
  if (!ledger[parent]) return state
  const layers: Layer[] = []
  while (ledger[parent]) {
    layers.push(ledger)
    ledger = ledger[parent]!
  }
  const repetitions = { ...ledger }
  for (const layer of layers.reverse()) Object.assign(repetitions, layer)
  return { ...state, repetitions }
}
