import { SIZE, steps, validSquare } from './board.js'
import type { Action, GameEvent, Outcome, Square } from './types.js'

export function squareName(square: Square): string {
  if (!validSquare(square)) throw new Error('Invalid square')
  return `${'abcdefgh'[square % SIZE]}${Math.floor(square / SIZE) + 1}`
}

export function parseSquare(name: string): Square {
  if (!/^[a-h][1-8]$/.test(name)) throw new Error('Invalid square name')
  return (Number(name[1]) - 1) * SIZE + 'abcdefgh'.indexOf(name[0]!)
}

export function formatAction(action: Action): string {
  if (action.type === 'place') return `@${squareName(action.at)}`
  const parts: string[] = []
  if (action.remove !== undefined) parts.push(`x${squareName(action.remove)}`)
  if (action.path) {
    const [from, first] = action.path
    const step = action.path.length === 2 && steps[from!]?.includes(first!)
    parts.push(action.path.map(squareName).join(step ? '-' : '~'))
  }
  return parts.join('; ')
}

export function formatResult(outcome: Outcome): string {
  return outcome.winner === 'white' ? '1-0' : outcome.winner === 'black' ? '0-1' : '½-½'
}

export function formatEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'placement': return formatAction({ type: 'place', at: event.at })
    case 'movement': return formatAction({ type: 'battle', path: event.path })
    case 'removal': return `x${squareName(event.at)}`
    case 'imprisonment': return `[${squareName(event.at)}]`
    case 'liberation': return `+${squareName(event.at)}`
    case 'termination': return formatResult(event.outcome)
    case 'phase': return null
  }
}
