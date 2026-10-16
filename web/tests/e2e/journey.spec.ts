import { expect, test } from '@playwright/test'
import { mockApi, PIN, setupHousehold } from './helpers'

test('seed household, unlock, demo pack, chips, detail, listen fallback', async ({ page }) => {
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

  // demo pack
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()

  const chips = page.locator('.vchip')
  await expect(chips).toHaveCount(3)
  await expect(chips.nth(0)).toContainText('Avoid for Amaya: contains sesame')
  await expect(chips.nth(1)).toContainText('Check for Dad: high sodium')
  await expect(chips.nth(2)).toContainText('None found for Ravi in what we could read')
  await expect(page.locator('.card')).toHaveCount(6)
  await expect(page.getByText('Turn to the nutrition panel')).toBeVisible()
  await expect(page.getByTestId('elapsed')).toBeVisible()

  // language switch uses /api/commentary
  await page.getByRole('button', { name: 'සිං' }).click()
  await expect(page.locator('[data-card="allergens"]')).toContainText('තල අඩංගුයි')
  await page.getByRole('button', { name: 'EN', exact: true }).click()

  // card detail
  await page.locator('[data-card="allergens"] .card-main').click()
  const dlg = page.getByRole('dialog')
  await expect(dlg).toContainText('Contains sesame')
  await expect(dlg).toContainText('Label-stated')
  await expect(dlg.getByRole('button', { name: 'Report wrong info' })).toBeVisible()
  await dlg.getByRole('button', { name: 'Report wrong info' }).click()
  await expect(dlg).toContainText('Thanks, reported.')

  // listen falls back to text on 503
  await dlg.getByRole('button', { name: /Listen/ }).click()
  await expect(dlg.getByText('Audio unavailable — reading on screen')).toBeVisible()
  await expect(dlg.locator('.listen-text')).not.toBeEmpty()
})

test('delete all wipes the household', async ({ page }) => {
  await mockApi(page)
  await setupHousehold(page)
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await page.getByRole('button', { name: 'Yes, delete everything' }).click()
  await expect(page.getByRole('heading', { name: 'Protect your household' })).toBeVisible()
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).length ? await new Promise((r) => { const q = indexedDB.open('fivesec'); q.onsuccess = () => { const t = q.result.transaction('kv'); const c = t.objectStore('kv').count(); c.onsuccess = () => r(c.result) } }) : 0)
  expect(dbs).toBe(0)
})
