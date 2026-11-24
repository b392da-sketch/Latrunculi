import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { applyAction, legalActions, squareName } from '../src/engine/index.js'
import type { Action, GameState } from '../src/engine/index.js'
import { current, importMatch, saveKey } from '../src/web/match.js'
import { deployWith, move, path, sq } from '../tests/fixtures.js'
import { deploymentLog, gameFile, replay, rescueLog, terminalLog } from '../tests/web-fixtures.js'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const issues: string[] = []
  errors.set(page, issues)
  page.on('pageerror', error => issues.push(error.message))
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()) })
  await page.goto('/')
})
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]) })

const square = (page: Page, name: string) => page.locator(`[data-square="${name}"]`)

async function upload(page: Page, json: string) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'latrunculi-game.json', mimeType: 'application/json', buffer: Buffer.from(json),
  })
}

async function verifySaved(page: Page, direct: GameState) {
  await page.getByRole('button', { name: 'Save game', exact: true }).click()
  const saved = await page.evaluate(key => localStorage.getItem(key), saveKey)
  expect(current(importMatch(saved!).match)).toEqual(direct)
}

test('new match, keyboard and touch input, preferences, save, resume and export', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'New local game' }).click()
  await expect(page.getByRole('grid')).toBeVisible()
  await expect(square(page, 'a8')).toHaveAttribute('tabindex', '0')
  if (isMobile) {
    await square(page, 'b8').tap()
  } else {
    await square(page, 'a8').focus()
    await page.keyboard.press('ArrowRight')
    await expect(square(page, 'b8')).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: 'Obsidian to play' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Show board coordinates' }).uncheck()
  await page.getByRole('checkbox', { name: 'Rotate the board' }).check()
  await page.getByRole('checkbox', { name: 'Reduce animations' }).check()
  await page.getByRole('button', { name: '← Back', exact: true }).click()
  await expect(page.locator('.file-labels')).toHaveCount(0)
  await expect(page.getByRole('grid').getByRole('row').first().getByRole('button').first())
    .toHaveAttribute('data-square', 'h1')
  const expected = replay([{ type: 'place', at: sq('b8') }])
  await verifySaved(page, expected)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  await download.saveAs(await download.path() + '.json')
  const exported = await readFile(await download.path() + '.json', 'utf8')
  expect(current(importMatch(exported).match)).toEqual(expected)
  await page.getByRole('button', { name: 'Exit to menu' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page.getByRole('grid')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue saved game' })).toBeEnabled()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await expect(square(page, 'b8')).toHaveAccessibleName('b8, Ivory active counter')
  await expect(page.locator('.file-labels')).toHaveCount(0)
})

test('forty browser placements lead to battle and a previewed chained leap', async ({ page }) => {
  const deployed = deployWith(
    ['b2', 'c2', 'd3', 'b3', 'c4'], ['a8'], ['d2', 'b4', 'd4'],
  )
  await page.getByRole('button', { name: 'New local game' }).click()
  const placements = deploymentLog(deployed)
  for (const placement of placements) {
    if (placement.type !== 'place') throw new Error('Expected placement')
    await square(page, squareName(placement.at)).click()
  }
  await expect(page.getByRole('heading', { name: 'Battle', exact: true })).toBeVisible()
  await expect(page.locator('[aria-live=polite]')).toContainText('Battle phase begins.')
  await square(page, 'a8').click()
  await square(page, 'h8').click()
  await expect(page.getByText('40 turns')).toBeVisible()
  await square(page, 'b2').click()
  await expect(square(page, 'd4')).toHaveAccessibleName(/legal destination/)
  await square(page, 'd4').click()
  await expect(page.getByText(/Path · b2~/)).toBeVisible()
  await expect(page.getByText('40 turns')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm leap' }).click()
  const leap = legalActions(deployed).find(action => action.type === 'battle' &&
    action.path?.[0] === sq('b2') && action.path.at(-1) === sq('d4'))!
  await verifySaved(page, applyAction(deployed, leap).state)
})

test('imprisonment, changing and canceling removal previews, and atomic undo/redo', async ({ page }) => {
  const actions = [
    ...deploymentLog(deployWith(['c5', 'c2', 'e4'], ['c3', 'd4', 'h8'], ['c4', 'h7'])),
    move('c5', 'c4'), move('h8', 'h7'),
  ]
  await upload(page, gameFile(actions))
  await expect(page.getByText('Mandatory removal')).toBeVisible()
  await expect(square(page, 'c3')).toHaveAccessibleName(/imprisoned.*eligible for removal/)
  await expect(square(page, 'd4')).toHaveAccessibleName(/imprisoned.*eligible for removal/)
  await square(page, 'd4').click()
  await expect(square(page, 'd4').locator('.piece')).toHaveCount(0)
  await square(page, 'c3').click()
  await expect(square(page, 'd4').locator('.piece')).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancel selection' }).click()
  await expect(square(page, 'c3').locator('.piece')).toHaveCount(1)
  await verifySaved(page, replay(actions))
  await square(page, 'c3').click()
  await square(page, 'c2').click()
  await square(page, 'c3').click()
  const action = { type: 'battle', remove: sq('c3'), path: path('c2', 'c3') } as const
  const after = replay([...actions, action])
  await verifySaved(page, after)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('42 turns')).toBeVisible()
  await verifySaved(page, replay(actions))
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByText('43 turns')).toBeVisible()
  await verifySaved(page, after)
})

test('a browser move imprisons a captor and displays liberation', async ({ page }) => {
  const log = rescueLog()
  await upload(page, gameFile(log))
  await expect(square(page, 'd4')).toHaveAccessibleName(/Ivory imprisoned/)
  await square(page, 'c2').click()
  await square(page, 'c3').click()
  await expect(square(page, 'd4')).toHaveAccessibleName(/Ivory active/)
  await expect(page.getByText('[c4] +d4')).toBeVisible()
  await verifySaved(page, replay([...log, move('c2', 'c3')]))
})

test('terminal removal ends the game without a movement', async ({ page }) => {
  const log = terminalLog()
  await upload(page, gameFile(log, log.length - 1))
  const final = log.at(-1)
  if (final?.type !== 'battle' || final.remove === undefined) throw new Error('Expected terminal removal')
  const at = final.remove
  await square(page, squareName(at)).click()
  await page.getByRole('button', { name: 'Confirm removal' }).click()
  await expect(page.getByRole('heading', { name: 'Ivory wins' })).toBeVisible()
  await expect(page.getByText('One counter remaining', { exact: true })).toBeVisible()
  await verifySaved(page, replay(log))
})

test('displays an equal-score immobilization draw and a threefold draw', async ({ page }) => {
  const frozen = deployWith(
    [...'abcdefgh'].flatMap(file => [`${file}1`, `${file}2`]).concat(['a3', 'b3', 'c3', 'd3']),
    ['e3', 'f3', 'g3', 'h3', 'a4', 'b4', 'c4', 'd4'],
  )
  await upload(page, gameFile(deploymentLog(frozen)))
  await expect(page.getByRole('heading', { name: 'Draw' })).toBeVisible()
  await expect(page.getByText('No legal moves', { exact: true })).toBeVisible()
  const cycle = [
    move('a1', 'b1'), move('h8', 'g8'), move('b1', 'b2'), move('g8', 'g7'),
    move('b2', 'a2'), move('g7', 'h7'), move('a2', 'a1'), move('h7', 'h8'),
  ]
  const initial = deployWith(['a1'], ['h8'], ['b1', 'b2', 'a2', 'g8', 'g7', 'h7'])
  const repeated: Action[] = [...deploymentLog(initial), ...Array.from({ length: 18 }, (_, i) => cycle[i % 8]!)]
  await upload(page, gameFile(repeated))
  await expect(page.getByRole('heading', { name: 'Draw' })).toBeVisible()
  await expect(page.getByText('Threefold repetition', { exact: true })).toBeVisible()
})

test('malformed imports are reported while keeping the match intact', async ({ page }) => {
  await upload(page, '{')
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  await page.getByRole('button', { name: 'New local game' }).click()
  await square(page, 'd4').click()
  await upload(page, gameFile([{ type: 'place', at: 0 }, { type: 'place', at: 0 }]))
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toContainText('position 2')
  await expect(square(page, 'd4')).toHaveAccessibleName(/Ivory active counter/)
})

test('battle fits the viewport, passes axe checks, and can produce screenshots', async ({ page }, info) => {
  const log = rescueLog()
  await upload(page, gameFile(log))
  await page.getByRole('button', { name: 'Dismiss message' }).click()
  await square(page, 'c2').click()
  await expect(square(page, 'c3')).toHaveAccessibleName(/legal destination/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const findings = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(findings.violations).toEqual([])
  if (process.env.LATRUNCULI_SCREENSHOTS && ['desktop', 'mobile'].includes(info.project.name)) {
    await page.screenshot({ path: `${process.env.LATRUNCULI_SCREENSHOTS}/latrunculi-${info.project.name}.png`, fullPage: true, animations: 'disabled' })
  }
})

test('menu, deployment, settings, guide and confirmation pass axe; dialog restores focus', async ({ page }) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  }
  await scan()
  await page.getByRole('button', { name: 'New local game' }).click()
  await square(page, 'd4').click()
  await scan()
  const leave = page.getByRole('button', { name: 'Exit to menu' })
  await leave.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep playing' })).toBeFocused()
  await scan()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(leave).toBeFocused()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await scan()
  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible()
  await scan()
})

test('mobile turn controls follow visual keyboard order; reduced motion suppresses effects', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await upload(page, gameFile(rescueLog()))
  await square(page, 'c2').click()
  const cancel = page.getByRole('button', { name: 'Cancel selection' })
  const board = page.getByRole('grid', { name: 'Game board' })
  expect(await cancel.evaluate(element =>
    Boolean(element.compareDocumentPosition(document.querySelector('[role=grid]')!) & Node.DOCUMENT_POSITION_FOLLOWING),
  )).toBe(true)
  if (isMobile) {
    const card = await cancel.boundingBox()
    const playingArea = await board.boundingBox()
    expect(card!.y).toBeLessThan(playingArea!.y)
  }
  await cancel.focus()
  await page.keyboard.press('Tab')
  await expect(square(page, 'c2')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(cancel).toBeHidden()
  await square(page, 'c2').click()
  await square(page, 'c3').click()
  expect(await square(page, 'd4').locator('.piece-holder').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
})
