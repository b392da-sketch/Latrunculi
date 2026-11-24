// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { App } from '../src/web/App.js'
import { sq } from './fixtures.js'
import { gameFile } from './web-fixtures.js'

afterEach(() => { cleanup(); localStorage.clear() })

function delayedFile() {
  let finish!: (contents: string) => void
  const text = new Promise<string>(resolve => { finish = resolve })
  const file = new File(['pending'], 'match.json')
  Object.defineProperty(file, 'text', { value: () => text })
  fireEvent.change(screen.getByLabelText('Import JSON'), { target: { files: [file] } })
  return async (contents: string) => { await act(async () => finish(contents)) }
}

function start() {
  fireEvent.click(screen.getByRole('button', { name: 'New local game' }))
}

function place(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name}, empty` }))
}

function importedAt(name: string) {
  return gameFile([{ type: 'place', at: sq(name) }])
}

it('ignores a read started in an empty game after the player makes a move', async () => {
  render(<App />)
  start()
  const finish = delayedFile()
  place('b2')
  await finish(importedAt('c3'))
  expect(screen.getByRole('button', { name: 'b2, Ivory active counter' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'c3, empty' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('ignores a read from a match that was replaced using the new-game flow', async () => {
  render(<App />)
  start()
  place('b2')
  const finish = delayedFile()
  // jsdom lacks native dialog methods. The browser suite tests actual focus and close behavior.
  const dialog = document.querySelector('dialog')!
  dialog.showModal = () => { dialog.open = true }
  dialog.close = () => { dialog.open = false }
  fireEvent.click(screen.getByRole('button', { name: /^New game$/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }))
  await finish(importedAt('c3'))
  expect(screen.getByText('0 / 40 placed')).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('installs only the newest import even when reads resolve out of order', async () => {
  render(<App />)
  const first = delayedFile()
  const second = delayedFile()
  await second(importedAt('c3'))
  await first(importedAt('b2'))
  expect(screen.getByRole('button', { name: 'c3, Ivory active counter' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'b2, empty' })).toBeTruthy()
})

it('does not navigate back to a match when a read finishes on another screen', async () => {
  render(<App />)
  const finish = delayedFile()
  fireEvent.click(screen.getByRole('navigation').getElementsByTagName('button')[0]!)
  await finish(importedAt('c3'))
  expect(screen.getByRole('heading', { name: 'How to play' })).toBeTruthy()
  expect(screen.queryByRole('grid')).toBeNull()
})

it('keeps newer feedback when an older malformed read finishes', async () => {
  render(<App />)
  start()
  const finish = delayedFile()
  place('b2')
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await finish('{')
  expect(screen.getByText('Match saved on this device.')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
