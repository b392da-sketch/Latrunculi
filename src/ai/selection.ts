import type { Action } from '../engine/index.js'

export type MoveSelection =
  | Readonly<{ kind: 'rank'; candidates: number; margin: number; decay: number }>
  | Readonly<{ kind: 'mixture'; randomRate: number }>

export interface Candidate {
  action: Action
  score: number
  terminal: 'win' | 'loss' | null
}

export function sampleCandidate(candidates: readonly Candidate[], selection: MoveSelection, random: () => number) {
  const ranked = candidates.slice().sort((a, b) => b.score - a.score)
  const wins = ranked.filter(candidate => candidate.terminal === 'win')
  if (wins.length) return wins[0]!
  const safe = ranked.filter(candidate => candidate.terminal !== 'loss')
  if (!safe.length) return ranked[0]!
  if (selection.kind === 'mixture') {
    return random() < selection.randomRate ? safe[Math.floor(random() * safe.length)]! : safe[0]!
  }

  const shortlist = safe.slice(0, selection.candidates)
    .filter(candidate => safe[0]!.score - candidate.score <= selection.margin)
  const weights = shortlist.map((_, rank) => selection.decay ** rank)
  let pick = random() * weights.reduce((sum, mass) => sum + mass, 0)
  for (const [index, weight] of weights.entries()) {
    pick -= weight
    if (pick < 0) return shortlist[index]!
  }
  return shortlist.at(-1)!
}

export function validateSelection(selection: MoveSelection) {
  if (selection.kind === 'rank' && Number.isInteger(selection.candidates) && selection.candidates >= 1 &&
    selection.candidates <= 400 && Number.isFinite(selection.margin) && selection.margin >= 0 &&
    Number.isFinite(selection.decay) && selection.decay > 0 && selection.decay <= 1) return
  if (selection.kind === 'mixture' && Number.isFinite(selection.randomRate) &&
    selection.randomRate >= 0 && selection.randomRate <= 1) return
  throw new RangeError('Invalid AI move selection')
}
