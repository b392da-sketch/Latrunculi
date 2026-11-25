import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { squareName } from '../engine/index.js'
import type { Board as BoardState, Counter, GameEvent, Square } from '../engine/index.js'
import type { Preferences } from './match.js'
import { playerName } from './presentation.js'

interface Props {
  board: BoardState
  preferences: Preferences
  destinations: ReadonlySet<Square>
  removals: readonly Square[]
  selected?: Square | undefined
  pendingRemoval?: Square | undefined
  route?: readonly Square[] | undefined
  last?: readonly Square[] | undefined
  events: readonly GameEvent[]
  locked?: boolean
  onSquare: (at: Square) => void
  onCancel: () => void
}

export function Piece({ counter }: { counter: Pick<Counter, 'owner' | 'status'> }) {
  return <span aria-hidden="true" className={`piece ${counter.owner} ${counter.status}`} />
}

export function Board(props: Props) {
  const { board, preferences, destinations, removals, selected, pendingRemoval, route, last, events } = props
  const order = Array.from({ length: 64 }, (_, display) => {
    const row = Math.floor(display / 8)
    const file = display % 8
    return preferences.flipped ? row * 8 + 7 - file : (7 - row) * 8 + file
  })
  const [focused, setFocused] = useState<Square | undefined>()
  const refs = useRef(new Map<Square, HTMLButtonElement>())
  const focusAt = focused ?? order[0]
  const keyNavigate = (event: KeyboardEvent, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onCancel()
      return
    }
    const row = Math.floor(index / 8)
    const col = index % 8
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    const nextRow = Math.max(0, Math.min(7, row + delta[0]))
    const nextCol = Math.max(0, Math.min(7, col + delta[1]))
    refs.current.get(order[nextRow * 8 + nextCol]!)?.focus()
  }
  return <div className="board-surround">
    {preferences.coordinates && <div className="file-labels" aria-hidden="true">
      {order.slice(0, 8).map(at => <span key={at}>{squareName(at)[0]}</span>)}
    </div>}
    <div className="board-with-ranks">
      {preferences.coordinates && <div className="rank-labels" aria-hidden="true">
        {order.filter((_, index) => index % 8 === 0).map(at => <span key={at}>{squareName(at)[1]}</span>)}
      </div>}
      <div className="board" role="grid" aria-label="Game board">
        {Array.from({ length: 8 }, (_, row) => <div role="row" className="board-row" key={row}>
          {order.slice(row * 8, row * 8 + 8).map((at, col) => {
            const counter = board[at]
            const isRemoval = removals.includes(at)
            const isDestination = destinations.has(at)
            const routeIndex = route?.indexOf(at) ?? -1
            const changed = events.findIndex(event =>
              (event.type === 'imprisonment' || event.type === 'liberation' || event.type === 'placement') && event.at === at)
            const change = events[changed]?.type
            const removed = events.flatMap((event, index) =>
              event.type === 'removal' && event.at === at ? [{ event, index }] : [])
            const label = [
              squareName(at), counter ? `${playerName[counter.owner]} ${counter.status} counter` : 'empty',
              isRemoval ? 'eligible for removal' : '', isDestination ? 'legal destination' : '',
              selected === at ? 'selected' : '', pendingRemoval === at ? 'removal preview' : '',
            ].filter(Boolean).join(', ')
            return <div role="gridcell" key={at} aria-selected={selected === at || pendingRemoval === at}>
              <button type="button" aria-label={label} data-square={squareName(at)}
                ref={node => { if (node) refs.current.set(at, node); else refs.current.delete(at) }}
                tabIndex={focusAt === at ? 0 : -1}
                onFocus={() => setFocused(at)} onKeyDown={event => keyNavigate(event, row * 8 + col)}
                aria-disabled={props.locked || undefined}
                onClick={() => { if (!props.locked) props.onSquare(at) }}
                className={[
                  'square', (row + col) % 2 ? 'deep' : 'light',
                  last?.includes(at) && 'last', selected === at && 'selected',
                  pendingRemoval === at && 'preview-remove', isRemoval && 'eligible',
                  isDestination && 'destination', routeIndex >= 0 && 'route',
                ].filter(Boolean).join(' ')}>
                {counter && pendingRemoval !== at && <span className={`piece-holder ${change ?? ''}`}
                  style={{ '--delay': `${changed * 85}ms` } as CSSProperties}><Piece counter={counter} /></span>}
                {removed.map(({ event, index }) => <span key={index} className="piece-holder departing"
                  style={{ '--delay': `${index * 85}ms` } as CSSProperties}><Piece counter={event.counter} /></span>)}
                {isDestination && <span aria-hidden="true" className="destination-marker" />}
                {routeIndex > 0 && <span aria-hidden="true" className="route-marker">{routeIndex}</span>}
                {pendingRemoval === at && <span aria-hidden="true" className="remove-marker">×</span>}
              </button>
            </div>
          })}
        </div>)}
      </div>
    </div>
  </div>
}
