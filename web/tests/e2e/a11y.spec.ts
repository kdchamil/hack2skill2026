import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockApi, setupHousehold } from './helpers'

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: scan, summary, household (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Scan a pack' })).toBeVisible()
    await axe(page)

    await setupHousehold(page)
    await axe(page)

    await page.getByRole('button', { name: 'Scan', exact: true }).click()
    await page.getByRole('button', { name: 'Try a demo pack' }).click()
    await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()
    await expect(page.locator('.vchip')).toHaveCount(3)
    await axe(page)

    await page.locator('[data-card="allergens"] .card-main').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await axe(page)
  })
}
