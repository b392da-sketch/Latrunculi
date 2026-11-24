import type { Player, Square } from './types.js'

export const SIZE = 8
export const AREA = SIZE * SIZE
export const PER_PLAYER = 20
export const SQUARES = Array.from({ length: AREA }, (_, index) => index)

export function opponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white'
}

export function validSquare(value: unknown): value is Square {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < AREA
}

const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
function offset(square: Square, dx: number, dy: number): Square | null {
  const x = square % SIZE + dx
  const y = Math.floor(square / SIZE) + dy
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? y * SIZE + x : null
}

export const steps = SQUARES.map(square =>
  directions.flatMap(([dx, dy]) => {
    const target = offset(square, dx, dy)
    return target === null ? [] : [target]
  }),
)

export const jumps = SQUARES.map(square =>
  directions.flatMap(([dx, dy]) => {
    const over = offset(square, dx, dy)
    const to = offset(square, dx * 2, dy * 2)
    return over === null || to === null ? [] : [{ over, to }]
  }),
)

export const holdingPairs = SQUARES.map(square => {
  const pairs: [Square, Square][] = []
  for (const [dx, dy] of directions.slice(0, 2)) {
    const a = offset(square, dx, dy)
    const b = offset(square, -dx, -dy)
    if (a !== null && b !== null) pairs.push([a, b])
  }
  const neighbors = steps[square]!
  if (neighbors.length === 2) pairs.push([neighbors[0]!, neighbors[1]!])
  return pairs
})

export const adjacentVictims = SQUARES.map(square =>
  steps[square]!.filter(victim => holdingPairs[victim]!.some(pair => pair.includes(square))),
)
