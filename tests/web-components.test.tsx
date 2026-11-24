// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { parseSquare } from '../src/engine/index.js'
import { App } from '../src/web/App.js'
import { Board } from '../src/web/Board.js'
import { defaults, saveKey } from '../src/web/match.js'
import { gameFile, replay, rescueLog } from './web-fixtures.js'

import { quietHistory } from './history-benchmark-fixtures.js'

afterEach(() => { cleanup(); localStorage.clear() })

it('announces alternating deployments and ignores occupied squares', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'New local game' }))
  const grid = screen.getByRole('grid', { name: 'Game board' })
  fireEvent.click(within(grid).getByRole('button', { name: 'd4, empty' }))
  expect(screen.getByRole('heading', { name: 'Obsidian to play' })).toBeTruthy()
  fireEvent.click(within(grid).getByRole('button', { name: 'd4, Ivory active counter' }))
  expect(screen.getByText('1 / 40 placed')).toBeTruthy()
})

it('provides roving focus with arrow navigation in board order', () => {
  const board = replay(rescueLog()).board
  render(<Board board={board} preferences={{ ...defaults, flipped: true }} events={[]}
    destinations={new Set()} removals={[]} onSquare={() => undefined} onCancel={() => undefined} />)
  const starting = screen.getByRole('button', { name: /^h1,/ })
  expect(starting.tabIndex).toBe(0)
  starting.focus()
  fireEvent.keyDown(starting, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /^g1,/ }))
  expect(starting.tabIndex).toBe(-1)
  expect(screen.getByRole('button', { name: /^d4, Ivory imprisoned/ })).toBeTruthy()
  expect(board[parseSquare('d4')]?.status).toBe('imprisoned')
})

it('reports a corrupted browser save without opening a match', async () => {
  localStorage.setItem(saveKey, '{')
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
  expect((await screen.findByRole('alert')).textContent).toContain('not valid JSON')
  expect(screen.queryByRole('grid')).toBeNull()
})


it('renders a bounded move-history page while retaining older moves', async () => {
  localStorage.setItem(saveKey, gameFile(quietHistory(100)))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
  await screen.findByText('100 turns')
  expect(screen.getAllByRole('listitem')).toHaveLength(60)
  fireEvent.click(screen.getByRole('button', { name: 'Earlier moves' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(40)
  expect(screen.getByText('1.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Later moves' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(60)
  expect(screen.getByText('100 turns')).toBeTruthy()
})
