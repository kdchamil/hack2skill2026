import { expect, test } from '@playwright/test'
import { demoPack, mockApi, PIN, setupHousehold } from './helpers'

test('seed household, unlock, scan, summary, areas, detail, claims, listen fallback', async ({ page }) => {
  await mockApi(page)
  await setupHousehold(page)
  await expect(page.getByText('Amaya').first()).toBeVisible()
  await expect(page.getByTestId('privacy-banner')).toContainText('Stored only on this phone')

  // lock then unlock with PIN
  await page.getByRole('button', { name: 'Lock now' }).click()
  await page.getByLabel('PIN (6 or more digits)').fill('000000')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Wrong PIN')
  await page.getByLabel('PIN (6 or more digits)').fill(PIN)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add member' })).toBeVisible()

  // scan screen: household count, steps, then demo pack
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByTestId('checking-for')).toHaveText('Checking for 3')
  await expect(page.getByRole('list', { name: 'Photo steps' })).toContainText('Ingredients')
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()

  // summary: grade, drivers, partial planet note, rings, five areas
  await expect(page.getByRole('img', { name: 'Grade D' }).first()).toBeVisible()
  await expect(page.getByText(/moved it most/)).toBeVisible()
  await expect(page.getByTestId('planet-partial')).toBeVisible()
  const rings = page.locator('.ring-item')
  await expect(rings).toHaveCount(3)
  await expect(rings.nth(0)).toHaveAccessibleName(/Amaya: Avoid/)
  await expect(rings.nth(1)).toHaveAccessibleName(/Dad: Check/)
  await expect(rings.nth(2)).toHaveAccessibleName(/Ravi: None found/)
  await expect(page.locator('.area-row')).toHaveCount(5)
  await expect(page.locator('.area-row').nth(0)).toContainText('Contains: egg, sesame')

  // ring filter toggles
  await rings.nth(0).click()
  await expect(rings.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.area-row').nth(0).click()
  await expect(page.getByTestId('watch')).toContainText('Amaya: what to watch')
  await expect(page.getByTestId('contains')).toContainText('Sesame, Egg')
  await expect(page.getByTestId('may-contain')).toContainText('Peanut')
  await page.locator('.strip-main').click()
  await page.locator('.ring-item').first().click()
  await expect(page.locator('.ring-item').first()).toHaveAttribute('aria-pressed', 'false')

  // language switch uses /api/commentary
  await page.locator('.listenbar select').selectOption('si')
  await expect(page.locator('.area-row').nth(0)).toContainText('තල')
  await page.locator('.listenbar select').selectOption('en')

  // Body: nutrition card detail
  await page.locator('.area-row').nth(0).click()
  await expect(page.getByText('No recall data for your market')).toBeVisible()
  await page.locator('[data-card="nutrition"]').click()
  await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()
  await expect(page.getByRole('table')).toContainText('Sodium')
  await expect(page.getByText('Check for Dad').first()).toBeVisible()
  await page.getByRole('button', { name: 'Report wrong info', exact: true }).click()
  const rep = page.getByRole('dialog', { name: 'Report wrong info' })
  await expect(rep).toContainText("Don't include names or health details")
  await rep.getByLabel(/What is wrong/).fill('x'.repeat(600))
  await expect(rep.getByLabel(/What is wrong/)).toHaveValue('x'.repeat(500))
  await rep.getByRole('button', { name: 'Send report' }).click()
  await expect(rep).toContainText('Thanks — sent for review')
  await rep.getByRole('button', { name: 'Close' }).first().click()

  // listen falls back to text on 503
  await page.getByRole('button', { name: 'Listen' }).click()
  await expect(page.getByText('Audio unavailable — reading on screen')).toBeVisible()
  await expect(page.locator('.listen-text')).not.toBeEmpty()

  // Planet, People, Truth (claims), Choice via Next
  await page.locator('.strip-main').click()
  await page.locator('.area-row').nth(1).click()
  await expect(page.getByText('No reliable data').first()).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'The people behind it' })).toBeVisible()
  await expect(page.getByText('Unknown').first()).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('A barcode cannot prove a product is genuine.')).toBeVisible()
  await page.getByRole('button', { name: 'Open claim check' }).click()
  const cards = page.locator('.claimcard')
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(0)).toContainText('Contradicted')
  await expect(cards.nth(1)).toContainText('Unverifiable')
  await expect(cards.nth(2)).toContainText('Supported')
  await expect(cards.nth(3)).toContainText('Unsupported')
  await page.locator('.strip-main').click()
  await page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: 'Choose' }).click()
  await page.getByRole('switch').check()
  await expect(page.getByTestId('no-price')).toBeVisible()
  await page.getByRole('button', { name: 'Pick from Library' }).click()
  await expect(page.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('thin data: no grade, retake, check for every member', async ({ page }) => {
  await mockApi(page)
  await setupHousehold(page)
  await demoPack(page, 'Blurred label')
  await expect(page.getByTestId('no-grade')).toContainText('Not enough data to grade')
  await expect(page.getByTestId('thin-everyone')).toContainText('Amaya, Dad, Ravi: Check')
  await page.getByRole('button', { name: 'Scan the ingredient side' }).click()
  await expect(page.getByRole('heading', { name: 'Scan a pack' })).toBeVisible()
})

test('scan error shows retry', async ({ page }) => {
  await mockApi(page)
  let fail = true
  await page.route('**/api/scan', (r) => (fail ? r.fulfill({ status: 500, json: { message: 'boom' } }) : r.fallback()))
  await page.goto('/')
  await demoPack(page)
  await expect(page.getByRole('alert')).toContainText('boom')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.area-row')).toHaveCount(5)
})

test('delete all wipes the household', async ({ page }) => {
  await mockApi(page)
  await setupHousehold(page)
  // put data in the library and the list first
  await demoPack(page)
  await page.locator('.area-row').first().waitFor()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const L = (window as unknown as { __fsList: { saveItems: (i: unknown[]) => void; toItems: (p: unknown[]) => unknown[] } }).__fsList
    L.saveItems(L.toItems([{ name: 'Rice', quantity: 1, unit: null, brand: null, range_id: null }]))
  })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Household', exact: true }).click()
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await page.getByRole('button', { name: 'Yes, delete everything' }).click()
  await expect(page.getByTestId('deleted-msg')).toHaveText('All data on this phone was deleted.')
  await expect(page.getByRole('heading', { name: 'Protect your household' })).toBeVisible()
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).length ? await new Promise((r) => { const q = indexedDB.open('fivesec'); q.onsuccess = () => { const t = q.result.transaction('kv'); const c = t.objectStore('kv').count(); c.onsuccess = () => r(c.result) } }) : 0)
  expect(dbs).toBe(0)
  const left = await page.evaluate(async () => ({
    dbs: (await indexedDB.databases()).map((d) => d.name),
    ls: Object.keys(localStorage).filter((k) => k.startsWith('fivesec')).filter((k) => k !== 'fivesec.lang'),
  }))
  expect(left.dbs).not.toContain('fivesec')
  expect(left.ls).toEqual([])
  // list, library and basket are empty after a fresh start
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByTestId('progress')).toHaveCount(0)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByTestId('lib-entry')).toHaveCount(0)
})

test('report: offline shows a retry message, then succeeds', async ({ page }) => {
  await mockApi(page)
  let fail = true
  await page.route('**/api/report', (r) => (fail ? r.abort('failed') : r.fulfill({ status: 202, json: { status: 'queued' } })))
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()
  await page.locator('.area-row').nth(0).click()
  await page.locator('[data-card="nutrition"]').click()
  await page.getByRole('button', { name: 'Report wrong info', exact: true }).click()
  const rep = page.getByRole('dialog', { name: 'Report wrong info' })
  await rep.getByRole('button', { name: 'Send report' }).click()
  await expect(rep.getByRole('alert')).toContainText('Could not send')
  fail = false
  await rep.getByRole('button', { name: 'Try again' }).click()
  await expect(rep).toContainText('Thanks — sent for review')
})

test('+N ring opens a sheet to filter a hidden member', async ({ page }) => {
  await mockApi(page)
  await setupHousehold(page)
  for (const n of ['Mia', 'Noa']) {
    await page.getByRole('button', { name: /^Add member/ }).click()
    await page.getByLabel(/Name or nickname/).fill(n)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
  }
  await demoPack(page)
  await page.getByTestId('ring-more').click()
  const sheet = page.getByRole('dialog')
  await sheet.locator('.ring-item').first().click()
  await expect(page.getByRole('status').filter({ hasText: /Showing/ })).toBeVisible()
})
