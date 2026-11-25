import { applyAction, legalActions } from '../../src/engine/index.js'
import type { Action, GameState, Transition } from '../../src/engine/index.js'
import { makeEvaluator, terminalScore } from '../../src/ai/index.js'
import { battle, move, sq } from '../fixtures.js'
import { replay, rescueLog, terminalLog } from '../web-fixtures.js'
import { cyclePosition, immobilizingReply, multiplePrisoners, seededPosition } from './positions.js'

export interface ExamCase {
  label: string
  state: GameState
  accepts(action: Action): boolean
  criterion: 'legal' | 'objective' | 'heuristic'
  source: string
}

function task(label: string, state: GameState, source: string, criterion: ExamCase['criterion'],
  check: (transition: Transition, action: Action) => boolean): ExamCase {
  return { label, state, source, criterion, accepts: action => check(applyAction(state, action), action) }
}

const custody = (type: 'imprisonment' | 'liberation', ...squares: string[]) => (next: Transition) =>
  squares.every(at => next.events.some(event => event.type === type && event.at === sq(at)))

const evaluate = makeEvaluator()
function optimal(label: string, state: GameState, depth: number, source: string): ExamCase {
  const root = state.turn
  function value(node: GameState, remaining: number, ply: number): number {
    const terminal = terminalScore(node, root, ply)
    if (terminal !== null) return terminal
    if (remaining === 0) return evaluate(node, root)
    const children = legalActions(node).map(action => value(applyAction(node, action).state, remaining - 1, ply + 1))
    return node.turn === root ? Math.max(...children) : Math.min(...children)
  }
  const horizon = legalActions(state).map(action => ({ action, score: value(applyAction(state, action).state, depth - 1, 1) }))
  const best = Math.max(...horizon.map(item => item.score))
  return {
    label, state, source, criterion: 'heuristic',
    accepts: action => horizon.some(item => item.score === best && JSON.stringify(item.action) === JSON.stringify(action)),
  }
}

export function developmentExam(): ExamCase[] {
  const double = battle('c5 c2 e4 a1', 'c3 d4 h8')
  const removal = multiplePrisoners()
  const oscillation = [move('d4', 'd5'), move('a8', 'a7'), move('d5', 'd4'), move('a7', 'a6')]
    .reduce((state, action) => applyAction(state, action).state, battle('d4 h1', 'a8 h8'))
  return [
    task('horizontal', battle('c5 e4 a1', 'd4 h8 g8'), 'synthetic', 'heuristic', custody('imprisonment', 'd4')),
    task('double', double, 'synthetic', 'heuristic', custody('imprisonment', 'c3', 'd4')),
    task('removal choice', removal, 'M1 deployment and two moves', 'legal',
      next => next.events.filter(event => event.type === 'removal').length === 1),
    task('rescue', replay(rescueLog()), 'M2 legal rescue transcript', 'heuristic', custody('liberation', 'd4')),
    task('cascade', battle('c5 e4 d3* b3 c2* e2', 'd4 d2 c3 c1 h8'), 'synthetic', 'heuristic',
      next => custody('liberation', 'd3', 'c2')(next) && custody('imprisonment', 'd4', 'c3', 'd2')(next)),
    task('chain over a prisoner', battle('a2 b2 c3* e4 a1', 'b3 d3 d4 h8'), 'synthetic', 'heuristic',
      (next, action) => action.type === 'battle' && (action.path?.length ?? 0) >= 3 && custody('imprisonment', 'd4')(next)),
    optimal('delayed gains', double, 3, 'synthetic, exhaustive three-ply tactical value'),
    optimal('sacrificial exchange', seededPosition(13, 43), 3, 'legal seed 13 after 43 actions, exhaustive three-ply value'),
    task('oscillation', oscillation, 'synthetic with four applied turns', 'legal',
      (_, action) => JSON.stringify(action) !== JSON.stringify(move('d4', 'd5'))),
  ]
}

export function heldOutExam(): ExamCase[] {
  const doNotBlock = battle('a1 b1 c1 a2 b2 c2 a3 b3 c3', 'a4 b4 c4 d1 d2 e3', 'black')
  const avoid = battle('a2 c1', 'd1 a5 b3 a1 h8')
  const trap = seededPosition(7, 58)
  return [
    task('upper corner', battle('f8 h7 a1', 'h8 g2 a8'), 'synthetic h8 corner', 'heuristic', custody('imprisonment', 'h8')),
    task('vacated square', battle('b5 d5 c7 a8', 'c5* c6 h1'), 'synthetic c5 removal', 'heuristic',
      (next, action) => action.type === 'battle' && action.remove === sq('c5') && action.path?.at(-1) === sq('c5') &&
        custody('imprisonment', 'c6')(next)),
    task('vertical rescue', battle('c3* b1 b4 h1', 'b3 d3 f7'), 'synthetic c3 rescue', 'heuristic', custody('liberation', 'c3')),
    task('avoid capture reply', trap, 'legal seed 7 after 58 actions', 'objective',
      next => legalActions(next.state).every(reply => !applyAction(next.state, reply).events.some(e => e.type === 'imprisonment'))),
    optimal('quiet versus tempting capture', seededPosition(27, 346), 2,
      'legal seed 27 after 346 actions, exhaustive two-ply value'),
    task('immediate terminal win', replay(terminalLog().slice(0, -1)), 'legal seed 2 after 890 actions', 'objective',
      next => next.state.outcome?.winner === 'white'),
    task('avoid terminal reply', avoid, 'synthetic, all opponent replies enumerated', 'objective',
      (_, action) => !immobilizingReply(avoid, action)),
    task('threefold while behind', cyclePosition(17), 'synthetic followed by 17 applied actions', 'heuristic',
      next => next.state.outcome?.reason === 'threefold'),
    task('material-scored immobilization', doNotBlock, 'synthetic blocked 3×3 cluster', 'objective',
      next => next.state.outcome?.winner !== 'white'),
    task('sparse conversion', battle('a4 c4 h1', 'b4* h8'), 'synthetic three against two', 'objective',
      next => next.state.outcome?.winner === 'white'),
  ]
}
