export const RULESET = 'locus-ludi-seneca-v1'
export const PLAYERS = ['white', 'black'] as const
export type Player = typeof PLAYERS[number]
export type Square = number
export type Phase = 'deployment' | 'battle'
export type Counts = Readonly<Record<Player, number>>

export interface Counter {
  readonly id: number
  readonly owner: Player
  readonly status: 'active' | 'imprisoned'
}

export type Board = readonly (Counter | null)[]

export interface MoveRecord {
  readonly id: number
  readonly from: Square
  readonly to: Square
}

export type Action =
  | { readonly type: 'place'; readonly at: Square }
  | { readonly type: 'battle'; readonly remove?: Square; readonly path?: readonly Square[] }

export type Outcome = {
  readonly reason: 'one-counter' | 'immobilization' | 'threefold'
  readonly winner: Player | null
}

export interface GameState {
  readonly ruleset: typeof RULESET
  readonly board: Board
  readonly reserves: Counts
  /** Number of that player's counters that have been removed. */
  readonly removed: Counts
  readonly phase: Phase
  readonly firstPlayer: Player
  readonly turn: Player
  readonly movement: Readonly<Record<Player, readonly MoveRecord[]>>
  readonly repetitions: Readonly<Record<string, number>>
  readonly outcome: Outcome | null
}

export type GameEvent =
  | { readonly type: 'placement' | 'imprisonment' | 'liberation' | 'removal'; readonly at: Square; readonly counter: Counter }
  | { readonly type: 'movement'; readonly path: readonly Square[]; readonly counter: Counter }
  | { readonly type: 'phase'; readonly phase: Phase }
  | { readonly type: 'termination'; readonly outcome: Outcome }

export interface Transition {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}
