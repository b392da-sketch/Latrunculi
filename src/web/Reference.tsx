import { parseSquare } from '../engine/index.js'
import type { Counter } from '../engine/index.js'
import { Piece } from './Board.js'

export const examples = [
  { title: '01 · Deployment', text: 'Ivory and Obsidian alternate placing one counter on any empty square. Battle begins after forty placements. Deployment creates no prisoners.', pieces: { b2: 'white', d3: 'black', a4: 'black' }, marked: ['c2'] },
  { title: '02 · Steps and leaps', text: 'Step to an adjacent empty square orthogonally, or jump over one friendly counter to an empty square. Chain leaps, turn corners, and stop on any legal landing. Do not revisit a square. The marked route is a2–c2–c4. The board diagrams show the lower-left corner of the full board.', pieces: { a2: 'white', b2: 'white', c3: 'white' }, marked: ['c2', 'c4'] },
  { title: '03 · Imprisonment', text: 'Finish a move to enclose an enemy between two active friendly counters horizontally or vertically. In a corner, the two neighbors suffice. The diagram shows prisoners in the a1 corner, along rank 3 and along file d. Moving between enemies is safe.', pieces: { a1: 'black-prisoner', a2: 'white', b1: 'white', a3: 'white', b3: 'black-prisoner', c3: 'white', d1: 'white', d2: 'black-prisoner', d3: 'white' }, marked: [] },
  { title: '04 · Rescue and removal', text: 'Break every holding pair to rescue a prisoner. Imprisoning a captor can free a counter, which can then help imprison more enemies. In this example, Ivory plays a4–a3 to imprison a2 and rescue b2. If you still hold prisoners at the start of your turn, choose and remove one before moving.', pieces: { a1: 'white', a2: 'black', a4: 'white', b2: 'white-prisoner', c2: 'black' }, marked: ['a3'] },
] as const

export function Reference({ history }: { history: boolean }) {
  if (history) return <article className="reading history">
    <p className="eyebrow">Historical background</p>
    <h1>A game from the Roman world</h1>
    <p>Ludus Latrunculorum was a Roman strategy game played on a grid. Roman authors describe enclosure and the possibility of freeing a captured counter. Ancient boards vary in size, and no complete ancient ruleset survives.</p>
    <p>This implementation follows the Seneca reconstruction published by Locus Ludi, drawing on the scholarship of Ulrich Schädler. The eight-by-eight board, steps, leaps, and delayed removal belong to that reconstruction. We document provisional digital conventions such as exact oscillation tracking and the modern threefold draw separately.</p>
    <p>This independent project credits Locus Ludi and does not imply its endorsement.</p>
    <a href="https://locusludi.ch/wp-content/uploads/2022/08/LUDUS-LATRUNCULORUM_rules_GB.pdf" target="_blank" rel="noreferrer">Read the Locus Ludi rules publication ↗</a>
  </article>
  return <article className="reading">
    <p className="eyebrow">The Seneca reconstruction</p>
    <h1>How to play</h1>
    <div className="guide-grid">{examples.map(({ title, text, pieces, marked }) => {
      const diagram = new Map(Object.entries(pieces).map(([square, owner]) => [parseSquare(square), owner]))
      const marks = new Set<string>(marked)
      return <section className="guide-card" key={title}>
        <div className="mini-board" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => {
            const col = i % 4
            const row = Math.floor(i / 4)
            const counter = diagram.get((3 - row) * 8 + col)
            const piece: Pick<Counter, 'owner' | 'status'> | undefined = counter === undefined ? undefined : {
              owner: counter.startsWith('black') ? 'black' : 'white',
              status: counter.endsWith('-prisoner') ? 'imprisoned' : 'active',
            }
            return <span className={(row + col) % 2 ? 'mini-deep' : ''} key={i}>
              {piece ? <Piece counter={piece} /> : marks.has(`${'abcd'[col]}${4 - row}`) && <i />}
            </span>
          })}
        </div>
        <div><h2>{title}</h2><p>{text}</p></div>
      </section>
    })}</div>
    <section className="guide-scoring"><h2>Scoring and repetition</h2>
      <p>When a player has one counter left or cannot move, the side that removed more enemies wins. Equal removal totals draw. Prisoners still on the board do not count as removals.</p>
      <p>A counter cannot go A→B→A→B across three consecutive turns of its side. Three equivalent complete turn-boundary positions draw. This is a modern digital safeguard.</p>
    </section>
  </article>
}
