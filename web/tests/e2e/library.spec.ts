import { expect, test } from '@playwright/test'
import { mockApi, setupHousehold } from './helpers'

async function scanOnce(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()
  await page.getByText(/Contains|Avoid/).first().waitFor()
  await page.waitForTimeout(500)
}

test('library: saves a scan with household verdicts, opens offline, filters, re-checks, deletes', async ({ page, context }) => {
  await mockApi(page)
  await setupHousehold(page)
  await scanOnce(page)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByTestId('lib-entry')).toHaveCount(1)
  await expect(page.getByTestId('lib-sub')).toContainText('1 scans')
  await page.getByLabel('Search the library').fill('zzz')
  await expect(page.getByText('No scans match.')).toBeVisible()
  await page.getByLabel('Search the library').fill('')

  // opens with the network off
  await context.setOffline(true)
  const t0 = Date.now()
  await page.getByTestId('lib-entry').getByRole('button', { name: /^Open/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(Date.now() - t0).toBeLessThan(1000)
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click()
  await context.setOffline(false)

  // change a profile -> stale -> re-check
  await page.getByRole('button', { name: 'Household', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Dad' }).click()
  await page.getByLabel('Sesame').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByTestId('lib-stale')).toContainText('Dad')
  await page.getByRole('button', { name: 'Re-check' }).click()
  await expect(page.getByTestId('lib-stale')).toHaveCount(0)

  // removing a member removes their verdicts
  await page.getByRole('button', { name: 'Household', exact: true }).click()
  await page.getByRole('button', { name: 'Remove Ravi' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByTestId('lib-entry').getByText('Ravi')).toHaveCount(0)

  // pause saving, delete all
  await page.getByRole('switch', { name: 'Save scans to Library' }).uncheck()
  await expect(page.getByText('Saving is paused. New scans are not kept.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete the whole Library' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByTestId('lib-empty')).toBeVisible()
})
