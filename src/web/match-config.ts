import { isDifficultyId } from '../ai/difficulties.js'
import type { DifficultyId } from '../ai/difficulties.js'
import type { GameEvent, Player } from '../engine/index.js'
import { opponent } from '../engine/board.js'

export type ComputerConfig = Readonly<{
  mode: 'computer'
  human: Player
  computer: Player
  difficulty: DifficultyId
  seed: number
}>

export type MatchConfig = Readonly<{ mode: 'local' }> | ComputerConfig
export const localConfig: MatchConfig = Object.freeze({ mode: 'local' })

export function computerConfig(difficulty: DifficultyId, side: Player | 'random', seed: number): ComputerConfig {
  const human = side === 'random' ? (seed % 2 === 0 ? 'white' : 'black') : side
  return { mode: 'computer', human, computer: opponent(human), difficulty, seed }
}

export function readMatchConfig(value: unknown): MatchConfig {
  if (typeof value !== 'object' || !value || Array.isArray(value)) throw new Error('Invalid match configuration.')
  const { mode, human, computer, difficulty, seed } = value as Record<string, unknown>
  if (mode === 'local') return localConfig
  if (mode !== 'computer' || (human !== 'white' && human !== 'black') || computer !== opponent(human) ||
    !isDifficultyId(difficulty) || typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('Invalid computer match configuration.')
  }
  return computerConfig(difficulty, human, seed)
}

export function decisionSeed(seed: number, cursor: number): number {
  return (seed ^ Math.imul(cursor + 1, 0x9e3779b9)) >>> 0
}

/** Identify the actor by events rather than by parity or the resulting turn. */
export function actor(events: readonly GameEvent[]): Player {
  for (const event of events) {
    if (event.type === 'placement' || event.type === 'movement') return event.counter.owner
  }
  const removal = events.find(event => event.type === 'removal')
  if (removal?.type === 'removal') return opponent(removal.counter.owner)
  throw new Error('Committed action has no actor')
}

export function decisionCursor(config: MatchConfig, timeline: readonly (readonly GameEvent[])[], cursor: number, direction: -1 | 1): number {
  if (config.mode === 'local') return Math.max(0, Math.min(timeline.length, cursor + direction))
  if (direction === -1) {
    for (let index = cursor - 1; index >= 0; index--) {
      if (actor(timeline[index]!) === config.human) return index
    }
    return cursor
  }
  if (cursor === timeline.length) return cursor
  let index = cursor + 1
  while (index < timeline.length && actor(timeline[index]!) === config.computer) index++
  return index
}
