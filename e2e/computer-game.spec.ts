import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { difficulties, difficultyIds } from '../src/ai/difficulties.js'
import type { DifficultyId } from '../src/ai/difficulties.js'
import { applyAction, legalActions, squareName } from '../src/engine/index.js'
import { commit, defaults, exportMatch, importMatch, newMatch, saveKey } from '../src/web/match.js'
import { computerConfig } from '../src/web/match-config.js'
import { multiplePrisonersLog } from '../tests/ai/positions.js'
import { terminalLog } from '../tests/web-fixtures.js'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const issues: string[] = []
  errors.set(page, issues)
  page.on('pageerror', error => issues.push(error.message))
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
})
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]) })

const target = (page: Page, name: string) => page.locator(`[data-square="${name}"]`)
const progress = (page: Page, placed: number) => page.getByText(`${placed} / 40 placed`, { exact: true })
const title = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })

async function start(page: Page, id: DifficultyId, side: 'White' | 'Black' | 'Random side') {
  const entry = difficulties[id]
  await page.getByRole('button', { name: 'Play the computer' }).click()
  await page.getByRole('radio', { name: `${entry.name} — ${entry.designation}` }).check()
  await page.getByRole('radio', { name: new RegExp(`^${side}`) }).check()
  await page.getByRole('button', { name: 'Start match' }).click()
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save game', exact: true }).click()
  return importMatch((await page.evaluate(key => localStorage.getItem(key), saveKey))!).match
}

async function load(page: Page, json: string) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'computer.json', mimeType: 'application/json', buffer: Buffer.from(json),
  })
}

test('selects every difficulty and plays real initial worker turns as either side', async ({ page }) => {
  for (const [index, id] of difficultyIds.entries()) {
    if (index > 0) await page.reload()
    const human = index % 2 === 0 ? 'white' : 'black'
    await start(page, id, human === 'white' ? 'White' : 'Black')
    if (human === 'white') await target(page, 'd4').click()
    const count = human === 'white' ? 2 : 1
    await expect(progress(page, count)).toBeVisible()
    const match = await save(page)
    expect(match.config).toMatchObject({ mode: 'computer', difficulty: id, human })
    expect(match.actions).toHaveLength(count)
    expect(match.state.turn).toBe(human)
  }
})

test('finishes alternating deployment and restores an AI reply without recalculating it', async ({ page }) => {
  await start(page, 'centurio', 'White')
  for (let i = 0; i < 20; i++) {
    await expect(progress(page, i * 2)).toBeVisible()
    await page.getByRole('grid').getByRole('button', { name: /, empty$/ }).first().click()
  }
  await expect(title(page, 'Battle')).toBeVisible()
  const prior = await save(page)
  expect(prior.cursor).toBe(40)
  expect(prior.state.turn).toBe('white')
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(progress(page, 38)).toBeVisible()
  await page.getByRole('button', { name: /Redo/ }).click()
  await expect(title(page, 'Battle')).toBeVisible()
  const replayed = await save(page)
  expect(replayed.actions).toEqual(prior.actions)
  expect(replayed.state).toEqual(prior.state)
})

test('commits real worker removal plus movement and a terminal removal through canonical replay', async ({ page }) => {
  const config = computerConfig('centurio', 'black', 18)
  const root = multiplePrisonersLog().reduce(commit, newMatch('white', config))
  await load(page, exportMatch(root, defaults))
  await expect(page.getByText('43 turns')).toBeVisible()
  const after = await save(page)
  const action = after.actions.at(-1)!
  expect(action.type === 'battle' && action.remove !== undefined && !!action.path).toBe(true)
  expect(legalActions(root.state)).toContainEqual(action)
  expect(after.state).toEqual(applyAction(root.state, action).state)
  await page.reload()
  const penultimate = terminalLog().slice(0, -1).reduce(commit, newMatch('white', config))
  await load(page, exportMatch(penultimate, defaults))
  await expect(title(page, 'Ivory wins')).toBeVisible()
  const ended = await save(page)
  expect(ended.cursor).toBe(891)
  expect(ended.state.outcome).toEqual({ winner: 'white', reason: 'one-counter' })
})

test('keyboard setup, stable random side, accessibility and save resume', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Play the computer' }).click()
  const recommended = page.getByRole('radio', { name: 'Centurio — Centurion' })
  await expect(recommended).toBeChecked()
  await recommended.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Legatus — Legate' })).toBeChecked()
  const randomSide = page.getByRole('radio', { name: 'Random side' })
  await randomSide.focus()
  await page.keyboard.press('Space')
  await expect(randomSide).toBeChecked()
  const violations = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  expect(await violations()).toEqual([])
  if (process.env.LATRUNCULI_SCREENSHOTS && ['desktop', 'mobile'].includes(info.project.name)) {
    await page.screenshot({ path: `${process.env.LATRUNCULI_SCREENSHOTS}/computer-setup-${info.project.name}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Start match' }).click()
  await expect(page.getByLabel('Computer game')).toBeVisible()
  const first = await save(page)
  if (first.config.mode !== 'computer') throw new Error('Missing computer metadata')
  if (first.config.human === 'black') await expect(progress(page, 1)).toBeVisible()
  const expected = await save(page)
  await page.reload()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await expect(page.getByLabel('Computer game')).toBeVisible()
  const resumed = await save(page)
  expect(resumed.config).toEqual(expected.config)
  expect(resumed.state).toEqual(expected.state)
  expect(await violations()).toEqual([])
})

test('Pages-base worker smoke test also checks assets, navigation and resume', async ({ page }, info) => {
  const requests: string[] = []
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  const workers: string[] = []
  page.on('worker', worker => workers.push(new URL(worker.url()).pathname))
  await page.reload()
  await start(page, 'centurio', 'Black')
  await expect(progress(page, 1)).toBeVisible()
  const first = await save(page)
  if (process.env.LATRUNCULI_PAGES_SMOKE) {
    expect(requests.some(path => /^\/Latrunculi\/assets\/.*\.css$/.test(path))).toBe(true)
    expect(requests.some(path => /^\/Latrunculi\/assets\/index.*\.js$/.test(path))).toBe(true)
    expect(workers.some(path => /^\/Latrunculi\/assets\/ai\.worker.*\.js$/.test(path))).toBe(true)
  }
  await page.getByRole('button', { name: 'Exit to menu' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await expect(progress(page, 1)).toBeVisible()
  expect((await save(page)).state).toEqual(first.state)
  if (process.env.LATRUNCULI_SCREENSHOTS && ['desktop', 'mobile'].includes(info.project.name)) {
    const root = multiplePrisonersLog().reduce(commit, newMatch('white', computerConfig('centurio', 'black', 23)))
    await page.reload()
    await load(page, exportMatch(root, defaults))
    await expect(page.getByText('43 turns')).toBeVisible()
    const feedback = page.getByRole('button', { name: 'Dismiss message' })
    if (await feedback.isVisible()) await feedback.click()
    const match = await save(page)
    const legal = legalActions(match.state).find(action => action.type === 'battle' && action.path)
    if (legal?.type === 'battle' && legal.path && legal.remove === undefined) {
      await target(page, squareName(legal.path[0]!)).click()
    }
    if (await feedback.isVisible()) await feedback.click()
    await page.screenshot({ path: `${process.env.LATRUNCULI_SCREENSHOTS}/computer-match-${info.project.name}.png`, fullPage: true })
  }
})
