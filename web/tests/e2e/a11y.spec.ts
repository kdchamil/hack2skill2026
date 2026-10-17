import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockApi, setupHousehold } from './helpers'

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: scan, summary, areas, detail, claims, thin, household (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Scan a pack' })).toBeVisible()
    await axe(page)

    await setupHousehold(page)
    await axe(page)

    await page.getByRole('button', { name: 'Scan', exact: true }).click()
    await axe(page)
    await page.getByRole('button', { name: 'Try a demo pack' }).click()
    await axe(page)
    await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()
    await expect(page.locator('.area-row')).toHaveCount(5)
    await axe(page)

    for (const i of [0, 1, 2, 3, 4]) {
      await page.locator('.area-row').nth(i).click()
      await expect(page.locator('.area-tabs')).toBeVisible()
      await axe(page)
      await page.locator('.strip-main').click()
    }
    await page.locator('.area-row').nth(0).click()
    await page.locator('[data-card="nutrition"]').click()
    await expect(page.getByRole('table')).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Report wrong info', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report wrong info' })).toBeVisible()
    await axe(page)
    await page.keyboard.press('Escape')
    await page.locator('.strip-main').click()
    await page.locator('.area-row').nth(3).click()
    await page.getByRole('button', { name: 'Open claim check' }).click()
    await expect(page.locator('.claimcard')).toHaveCount(4)
    await axe(page)

    await page.getByRole('button', { name: 'Scan', exact: true }).click()
    await page.getByRole('button', { name: 'Try a demo pack' }).click()
    await page.getByRole('button', { name: 'Blurred label' }).click()
    await expect(page.getByTestId('no-grade')).toBeVisible()
    await axe(page)

    await page.getByRole('button', { name: 'Privacy' }).click()
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Delete all my data' }).click()
    await axe(page)
  })
}
