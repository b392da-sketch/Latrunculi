import { formatEvent, squareName } from '../engine/index.js'
import type { GameEvent, Outcome, Player } from '../engine/index.js'

export const playerName: Record<Player, string> = { white: 'Ivory', black: 'Obsidian' }

export const outcomeReason: Record<Outcome['reason'], string> = {
  'one-counter': 'One counter remaining',
  immobilization: 'No legal moves',
  threefold: 'Threefold repetition',
}

export function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case 'phase': return 'Battle phase begins.'
    case 'imprisonment': return `${squareName(event.at)} imprisoned.`
    case 'liberation': return `${squareName(event.at)} rescued.`
    case 'removal': return `${squareName(event.at)} removed.`
    case 'termination': return `${outcomeReason[event.outcome.reason]}.`
    default: return `${playerName[event.counter.owner]} ${formatEvent(event)}.`
  }
}
