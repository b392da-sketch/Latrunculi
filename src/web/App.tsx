import { useEffect, useRef, useState } from 'react'
import { formatAction, formatEvent, legalActions, mandatoryRemovals, squareName } from '../engine/index.js'
import type { Action, GameEvent, GameState, Player, Square } from '../engine/index.js'
import { difficulties } from '../ai/difficulties.js'
import { ComputerSetup } from './ComputerSetup.js'
import { useComputerTurn } from './use-computer-turn.js'
import type { WorkerFactory } from './computer-turn.js'
import { actor, decisionCursor, localConfig } from './match-config.js'
import type { MatchConfig } from './match-config.js'
import { Board, Piece } from './Board.js'
import { commit, current, defaults, exceedsImportBytes, exportMatch, importMatchAsync, maxImportActions, maxImportBytes, newMatch, preferencesKey, readPreferences, saveKey, seekAsync } from './match.js'
import type { Match, Preferences } from './match.js'
import { describeEvent, outcomeReason, playerName } from './presentation.js'
import { Reference } from './Reference.js'

type Page = 'menu' | 'game' | 'guide' | 'history' | 'settings' | 'computer'
type BattleAction = Extract<Action, { type: 'battle' }>
const players = ['white', 'black'] as const
const historyPageSize = 60

function loadPreferences(): Preferences {
  try {
    const saved = localStorage.getItem(preferencesKey)
    return saved ? readPreferences(JSON.parse(saved)) : defaults
  } catch { return defaults }
}

function PlayerCard({ player, state }: { player: Player; state: GameState }) {
  const board = state.board.filter(counter => counter?.owner === player)
  const prisoners = board.filter(counter => counter?.status === 'imprisoned').length
  const removed = state.removed[player === 'white' ? 'black' : 'white']
  return <div className={`player-card ${state.turn === player && !state.outcome ? 'to-play' : ''}`}>
    <div className="player-name"><Piece counter={{ owner: player, status: 'active' }} />{playerName[player]}
      {state.turn === player && !state.outcome && <span className="turn-dot" aria-hidden="true" />}
    </div>
    <dl>
      {state.phase === 'deployment' ? <>
        <div><dt>Reserve</dt><dd>{state.reserves[player]}</dd></div>
        <div><dt>Placed</dt><dd>{board.length}</dd></div>
      </> : <>
        <div><dt>Remaining</dt><dd>{board.length}</dd></div>
        <div><dt>Active</dt><dd>{board.length - prisoners}</dd></div>
        <div><dt>Imprisoned</dt><dd>{prisoners}</dd></div>
      </>}
      <div><dt>Removed</dt><dd>{removed}</dd></div>
    </dl>
  </div>
}

export function App({ workerFactory }: { workerFactory?: WorkerFactory } = {}) {
  const [page, setPage] = useState<Page>('menu')
  const [returnTo, setReturnTo] = useState<Page>('menu')
  const [match, setMatch] = useState<Match>(() => newMatch())
  const [preferences, setPreferences] = useState(loadPreferences)
  const [systemReducedMotion, setSystemReducedMotion] = useState(() =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [saved, setSaved] = useState(() => {
    try { return localStorage.getItem(saveKey) !== null } catch { return false }
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [historyPage, setHistoryPage] = useState(0)
  const [importBusy, setImportBusy] = useState(false)
  const [historyBusy, setHistoryBusy] = useState(false)
  const pendingReplay = useRef<AbortController>(null)
  const [events, setEvents] = useState<readonly GameEvent[]>([])
  const [selected, setSelected] = useState<Square>()
  const [removed, setRemoved] = useState<Square>()
  const [proposal, setProposal] = useState<BattleAction>()
  const [confirmation, setConfirmation] = useState<{ label: string; action: () => void }>()
  const dialog = useRef<HTMLDialogElement>(null)
  const historyEnd = useRef<HTMLDivElement>(null)
  const boardKey = useRef(0)
  const state = current(match)
  const config = match.config.mode === 'computer' ? match.config : undefined
  const entry = config && difficulties[config.difficulty]
  const aiTurn = !!config && !state.outcome && state.turn === config.computer
  const reviewing = aiTurn && match.cursor < match.actions.length
  const paced = !preferences.reducedMotion && !systemReducedMotion
  const presenting = !!config && paced && events.length > 0
  const presentingComputer = presenting && actor(events) === config?.computer
  const aiEnabled = page === 'game' && aiTurn && !reviewing && !presenting && !historyBusy && !importBusy && !confirmation
  const cpu = useComputerTurn(match, aiEnabled, boardKey.current, applyMove, workerFactory)
  const blocked = historyBusy || aiTurn || presentingComputer
  const actions = page === 'game' && !blocked ? legalActions(state) : []
  const removals = blocked ? [] : mandatoryRemovals(state)
  const undoCursor = decisionCursor(match.config, match.timeline, match.cursor, -1)
  const redoCursor = decisionCursor(match.config, match.timeline, match.cursor, 1)
  const compatible = actions.filter((action): action is BattleAction =>
    action.type === 'battle' && action.remove === removed)
  const moving = compatible.filter(action => action.path?.[0] === selected && selected !== undefined)
  const destinations = new Set(state.phase === 'deployment'
    ? [] : moving.flatMap(action => action.path?.at(-1) ?? []))
  const lastEvents = match.timeline[match.cursor - 1]
  const historyEndIndex = Math.max(0, match.cursor - historyPage * historyPageSize)
  const historyStartIndex = Math.max(0, historyEndIndex - historyPageSize)
  const lastAction = match.actions[match.cursor - 1]
  const last = lastAction?.type === 'place' ? [lastAction.at] : lastAction?.path
  const placed = 40 - state.reserves.white - state.reserves.black
  const terminalRemoval = removed === undefined ? undefined : compatible.find(action => !action.path)
  const hasOutcome = state.outcome !== null
  const effects = lastEvents?.filter(event =>
    event.type === 'imprisonment' || event.type === 'liberation' || event.type === 'removal')
    .map(describeEvent).join(' ')

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReducedMotion(query?.matches ?? false)
    query?.addEventListener('change', update)
    return () => query?.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)) } catch { /* persistence reports on save */ }
  }, [preferences])
  useEffect(() => {
    if (confirmation) dialog.current?.showModal()
    else if (dialog.current?.open) dialog.current.close()
  }, [confirmation])
  useEffect(() => {
    if (historyEnd.current) historyEnd.current.scrollTop = historyEnd.current.scrollHeight
  }, [match.cursor, page, historyPage])
  useEffect(() => () => pendingReplay.current?.abort(), [])

  useEffect(() => {
    if (!events.length) return
    const timer = window.setTimeout(() => setEvents([]), paced ? events.length * 85 + 360 : 0)
    return () => window.clearTimeout(timer)
  }, [events, paced])

  function clearSelection() {
    setSelected(undefined)
    setRemoved(undefined)
    setProposal(undefined)
  }

  function cancelReplay() {
    pendingReplay.current?.abort()
    pendingReplay.current = null
    setHistoryBusy(false)
    setImportBusy(false)
  }

  function beginReplay() {
    cpu.invalidate()
    cancelReplay()
    clearFeedback()
    const request = new AbortController()
    pendingReplay.current = request
    return request.signal
  }

  function clearFeedback() {
    setMessage('')
    setError('')
  }

  function show(next: Page) {
    cpu.invalidate()
    cancelReplay()
    clearFeedback()
    if (page === 'menu' || page === 'game') setReturnTo(page)
    setPage(next)
  }

  function proceed(label: string, action: () => void) {
    if ((page === 'game' || (page !== 'menu' && returnTo === 'game')) && match.actions.length > 0 && !state.outcome) {
      setConfirmation({ label, action })
    }
    else action()
  }

  function start(config: MatchConfig = localConfig) {
    cpu.invalidate()
    cancelReplay()
    const create = () => {
      setMatch(newMatch('white', config))
      setHistoryPage(0)
      boardKey.current++
      clearSelection()
      clearFeedback()
      setEvents([])
      setPage('game')
    }
    if (page === 'computer') create()
    else proceed('Start a new game?', create)
  }

  function openComputer() {
    cpu.invalidate()
    cancelReplay()
    proceed('Start a new computer game?', () => show('computer'))
  }

  function leave() {
    cpu.invalidate()
    cancelReplay()
    proceed('Return to the main menu?', () => {
      setPage('menu')
      setReturnTo('menu')
      clearSelection()
      clearFeedback()
    })
  }

  function applyMove(action: Action) {
    const next = commit(match, action)
    cancelReplay()
    setMatch(next)
    setHistoryPage(0)
    setEvents(next.timeline[next.cursor - 1]!)
    clearFeedback()
    clearSelection()
  }

  function submit(action: Action) {
    if (blocked || state.outcome) return
    try {
      applyMove(action)
    } catch {
      setError('That action is no longer legal. Choose another move.')
      clearSelection()
    }
  }

  function square(at: Square) {
    if (state.outcome || blocked) return
    if (state.phase === 'deployment') {
      const placement = actions.find(action => action.type === 'place' && action.at === at)
      if (placement) submit(placement)
      return
    }
    const destination = moving.find(action => action.path?.at(-1) === at)
    if (destination) {
      if (formatAction(destination).includes('~')) setProposal(destination)
      else submit(destination)
      return
    }
    if (removals.includes(at)) {
      setRemoved(removed === at ? undefined : at)
      setSelected(undefined)
      setProposal(undefined)
      return
    }
    if (removals.length && removed === undefined) return
    setProposal(undefined)
    if (selected === at) setSelected(undefined)
    else if (compatible.some(action => action.path?.[0] === at)) setSelected(at)
  }

  async function undoRedo(cursor: number) {
    const signal = beginReplay()
    setHistoryBusy(true)
    setHistoryPage(0)
    clearSelection()
    setEvents([])
    try {
      const next = await seekAsync(match, cursor, signal)
      if (!signal.aborted) setMatch(next)
    } catch {
      if (!signal.aborted) setError('That position could not be restored.')
    } finally {
      if (!signal.aborted) setHistoryBusy(false)
    }
  }

  async function restore(json: string, signal: AbortSignal) {
    setImportBusy(true)
    try {
      const restored = await importMatchAsync(json, signal)
      if (signal.aborted) return
      setHistoryPage(0)
      setMatch(restored.match)
      setPreferences(restored.preferences)
      boardKey.current++
      setEvents([])
      clearSelection()
      clearFeedback()
      setPage('game')
      setMessage('Match restored.')
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'This match could not be loaded.')
    } finally {
      if (!signal.aborted) setImportBusy(false)
    }
  }

  function save() {
    cancelReplay()
    try {
      const json = exportMatch(match, preferences)
      if (match.actions.length > maxImportActions || exceedsImportBytes(json)) {
        setError('This match exceeds the resume limit. Export JSON to keep a copy.')
        return
      }
      localStorage.setItem(saveKey, json)
      setSaved(true)
      setMessage('Match saved on this device.')
      setError('')
    } catch { setError('Browser storage is unavailable. Export a game file to save it.') }
  }

  function resume() {
    const signal = beginReplay()
    try {
      const json = localStorage.getItem(saveKey)
      if (json) void restore(json, signal)
      else setError('There is no saved match on this device.')
    } catch { setError('The saved match could not be read.') }
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    const signal = beginReplay()
    if (file.size > maxImportBytes) { setError('The game file exceeds 5 MiB.'); return }
    setImportBusy(true)
    try {
      const json = await file.text()
      if (signal.aborted) return
      setImportBusy(false)
      proceed('Replace this match with the imported game?', () => {
        if (!signal.aborted) void restore(json, signal)
      })
    } catch {
      if (!signal.aborted) {
        setImportBusy(false)
        setError('The game file could not be read.')
      }
    }
  }

  function download() {
    cancelReplay()
    const file = new Blob([exportMatch(match, preferences)], { type: 'application/json' })
    const canResume = match.actions.length <= maxImportActions && file.size <= maxImportBytes
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'latrunculi-game.json'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(canResume ? 'Game file exported.' : 'Game file exported. It exceeds this version’s import limit.')
    setError('')
  }

  const upload = <label className="button file-button">Import JSON<input type="file" accept=".json,application/json"
    onChange={event => { void readFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label>

  const computerInstruction = reviewing ? 'Recorded computer turn. Use Redo to continue.'
    : cpu.status === 'error' && aiEnabled ? 'Computer turn interrupted.'
    : importBusy || confirmation || presenting ? 'Computer turn paused.'
    : cpu.status === 'applying' ? 'Applying computer move…' : `${entry?.name} is thinking…`
  const instruction = historyBusy ? 'Restoring position…' : hasOutcome ? 'Match complete'
    : aiTurn ? computerInstruction : presentingComputer ? `${entry?.name} moved.` : state.phase === 'deployment' ? 'Place a counter on an empty square.'
    : terminalRemoval ? 'Confirm the final removal.'
    : removals.length > 0 && removed === undefined ? 'Choose an enemy prisoner to remove.'
    : proposal ? 'Review the marked leap path.'
    : selected === undefined ? 'Select an active counter.' : 'Choose a marked destination.'

  return <div className={`app ${preferences.reducedMotion ? 'reduced-motion' : ''}`}>
    <header className="masthead">
      <button className="brand" onClick={page === 'menu' ? undefined : leave} aria-label="Latrunculi main menu">
        <span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>
        <span><strong>LATRVNCVLI</strong><small>THE ROMAN GAME OF STRATEGY</small></span>
      </button>
      <nav aria-label="Site">
        <button onClick={() => show('guide')} aria-current={page === 'guide' ? 'page' : undefined}>How to play</button>
        <button onClick={() => show('settings')} aria-current={page === 'settings' ? 'page' : undefined}>Settings</button>
      </nav>
    </header>

    <main id="main">
      {page === 'menu' && <section className="menu">
        <div className="menu-art" aria-hidden="true">
          <div className="menu-grid">{Array.from({ length: 64 }, (_, i) => <span key={i}
            className={(i + Math.floor(i / 8)) % 2 ? 'mini-deep' : ''}>
            {[9, 12, 18, 20, 26, 27, 34, 36, 40, 43, 50, 53, 55].includes(i) &&
              <Piece counter={{ owner: i < 30 ? 'black' : 'white', status: i === 27 ? 'imprisoned' : 'active' }} />}
          </span>)}</div>
        </div>
        <div className="menu-copy">
          <p className="eyebrow">Ludus Latrunculorum</p>
          <h1>LATRVNCVLI</h1>
          <p className="menu-intro">A Roman strategy game for two people at the same table or one player against the computer.</p>
          <div className="menu-actions">
            <button className="button primary" onClick={() => start()}>New local game <span aria-hidden="true">→</span></button>
            <button className="button" onClick={openComputer}>Play the computer</button>
            <button className="button" onClick={resume} disabled={!saved}>Continue saved game</button>
            <button className="button" onClick={() => show('guide')}>How to play</button>
            <button className="button" onClick={() => show('settings')}>Settings</button>
            <button className="button" onClick={() => show('history')}>Historical background</button>
            {upload}
          </div>
        </div>
      </section>}

      {page === 'computer' && <ComputerSetup onStart={start} onBack={() => setPage(returnTo)} />}
      {page === 'game' && <section className="match-shell" aria-label={config ? 'Computer game' : 'Local game'}>
        <div className="turn-card">
          <p className="eyebrow">{hasOutcome ? 'Result' : removals.length > 0 ? 'Mandatory removal' : 'Current turn'}</p>
          <h2>{state.outcome ? state.outcome.winner ? `${playerName[state.outcome.winner]} wins` : 'Draw' : `${playerName[state.turn]} to play`}</h2>
          {config && entry && <p className="match-assignment">You · {playerName[config.human]} <span aria-hidden="true">/</span> {entry.name} · {entry.designation} · {playerName[config.computer]}</p>}
          <p role="status">{state.outcome ? outcomeReason[state.outcome.reason] : instruction}</p>
          {cpu.status === 'error' && aiEnabled && <div className="computer-error">
            <p role="alert">{cpu.error}</p>
            <button className="button compact" onClick={cpu.retry}>Retry computer turn</button>
          </div>}
          {removed !== undefined && <p className="pending">Removal preview · {squareName(removed)}</p>}
          {proposal && <p className="pending">Path · {formatAction(proposal)}</p>}
          {(proposal || terminalRemoval) && <button className="button primary compact"
            onClick={() => submit((proposal ?? terminalRemoval)!)}>{terminalRemoval ? 'Confirm removal' : 'Confirm leap'}</button>}
          {(selected !== undefined || removed !== undefined || proposal) &&
            <button className="quiet cancel" onClick={clearSelection}>Cancel selection</button>}
          {state.outcome && <button className="button primary compact" onClick={config ? openComputer : () => start()}>{config ? 'New computer game' : 'New local game'}</button>}
        </div>
        <div className="table-side">
          <div className="table-heading">
            <div><p className="eyebrow">{config ? 'Computer match' : 'Local match'} <span aria-hidden="true">/</span> Seneca rules</p>
              <h1>{state.phase === 'deployment' ? 'Deployment' : 'Battle'}</h1>
            </div>
            {state.phase === 'deployment' && <div className="progress">
              <span>{placed} / 40 placed</span>
              <progress aria-label="Counters placed" value={placed} max={40} />
            </div>}
          </div>
          <Board key={boardKey.current} board={state.board} preferences={preferences} destinations={destinations}
            removals={removals} selected={selected} pendingRemoval={removed} route={proposal?.path ?? (presentingComputer && lastAction?.type === 'battle' ? lastAction.path : undefined)} last={last} locked={!!config && blocked}
            events={events} onSquare={square} onCancel={clearSelection} />
          <div className="board-footer">
            <span><i className="legend-dot" /> Legal destination</span>
            <span><i className="legend-corner" /> Prisoner to remove</span>
            <button className="quiet" onClick={() => setPreferences({ ...preferences, flipped: !preferences.flipped })}>↻ Flip board</button>
          </div>
          {effects && <p className="table-effects">{effects}</p>}
        </div>
        <aside className="match-panel">
          <div className="scoreboard" aria-label={hasOutcome ? 'Final scores' : 'Scores'}>
            {players.map(player => <PlayerCard key={player} player={player} state={state} />)}
          </div>
          <div className="history-card">
            <div className="history-heading"><h2>Move history</h2><span>{match.cursor} turns</span></div>
            <div className="log" ref={historyEnd} tabIndex={0} aria-label="Committed moves">
              {match.cursor === 0 ? <p className="empty-log">Moves will appear here.</p> : <ol>
                {match.actions.slice(historyStartIndex, historyEndIndex).map((action, offset) => {
                  const index = historyStartIndex + offset
                  const effects = match.timeline[index]!.flatMap(event =>
                    event.type === 'imprisonment' || event.type === 'liberation' || event.type === 'termination'
                      ? formatEvent(event) ?? [] : [])
                  return <li key={index}><b>{index + 1}.</b><span>{formatAction(action)}</span><small>{effects.join(' ')}</small></li>
                })}
              </ol>}
            </div>
            {(historyStartIndex > 0 || historyPage > 0) && <div className="history-controls" aria-label="Move history pages">
              <button className="button compact" disabled={historyStartIndex === 0}
                onClick={() => setHistoryPage(historyPage + 1)}>Earlier moves</button>
              <button className="button compact" disabled={historyPage === 0}
                onClick={() => setHistoryPage(historyPage - 1)}>Later moves</button>
            </div>}
            <div className="history-controls">
              <button className="button compact" disabled={historyBusy || undoCursor === match.cursor} onClick={() => { void undoRedo(undoCursor) }}>↶ Undo</button>
              <button className="button compact" disabled={historyBusy || redoCursor === match.cursor} onClick={() => { void undoRedo(redoCursor) }}>↷ Redo</button>
            </div>
          </div>
          <div className="match-controls">
            <button className="button compact" onClick={save}>Save game</button>
            <button className="button compact" onClick={download}>Export JSON</button>
            {upload}
            <button className="quiet" onClick={config ? openComputer : () => start()}>New game</button>
            <button className="quiet" onClick={leave}>Exit to menu</button>
          </div>
          <p className="sr-only" aria-live="polite">{lastEvents?.map(describeEvent).join(' ')}</p>
        </aside>
      </section>}

      {(page === 'guide' || page === 'history' || page === 'settings') && <section className="secondary">
        <button className="quiet back" onClick={() => { cancelReplay(); setPage(returnTo === page ? 'menu' : returnTo) }}>← Back</button>
        {page === 'settings' ? <article className="reading">
          <p className="eyebrow">Local preferences</p><h1>Settings</h1>
          <div className="settings-list">
            {([['coordinates', 'Show board coordinates'], ['flipped', 'Rotate the board'], ['reducedMotion', 'Reduce animations']] as const)
              .map(([key, label]) => <label key={key}>{label}<input type="checkbox" checked={preferences[key]}
                onChange={event => setPreferences({ ...preferences, [key]: event.currentTarget.checked })} /></label>)}
          </div>
        </article> : <Reference history={page === 'history'} />}
      </section>}

      {importBusy && <div className="feedback" role="status">
        Loading match…<button className="quiet" onClick={cancelReplay} aria-label="Cancel import">×</button>
      </div>}
      {(message || error) && <div className={`feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
        {error || message}<button className="quiet" onClick={clearFeedback} aria-label="Dismiss message">×</button>
      </div>}
    </main>

    <footer className="site-footer"><span>LATRVNCVLI</span><button className="quiet" onClick={() => show('history')}>Historical background</button></footer>
    <dialog ref={dialog} aria-labelledby="confirmation-title" onCancel={() => setConfirmation(undefined)}>
      <h2 id="confirmation-title">{confirmation?.label}</h2>
      <p>Unsaved changes to the current match will be lost.</p>
      <div className="dialog-actions">
        <button className="button" autoFocus onClick={() => setConfirmation(undefined)}>Keep playing</button>
        <button className="button primary" onClick={() => { confirmation?.action(); setConfirmation(undefined) }}>Continue</button>
      </div>
    </dialog>
  </div>
}
