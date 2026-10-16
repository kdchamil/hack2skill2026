import { expect, test } from '@playwright/test'
import { mockApi, setupHousehold } from './helpers'

test('no outgoing request carries household data', async ({ page }) => {
  const seen: { url: string; body: string; method: string }[] = []
  page.on('request', (r) => {
    seen.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.toString('latin1') ?? '' })
  })
  await mockApi(page)
  await setupHousehold(page)
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()
  await expect(page.locator('.vchip')).toHaveCount(3)
  await page.locator('[data-card="allergens"] .card-main').click()
  await page.getByRole('button', { name: 'Report wrong info', exact: true }).click()
  await page.getByRole('button', { name: 'Send report' }).click()
  await page.getByText('Thanks — sent for review').waitFor()
  await page.getByRole('dialog', { name: 'Report wrong info' }).getByRole('button', { name: 'Close' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Listen/ }).click()
  await page.getByText('Audio unavailable — reading on screen').waitFor()

  const api = seen.filter((r) => r.url.includes('/api/'))
  expect(api.some((r) => r.url.endsWith('/api/scan'))).toBe(true)
  const forbidden = ['Amaya', 'Dad', 'Ravi', 'alias', 'life_stage', 'allergens', 'diets', 'goals', 'low_sodium', 'low_sugar', 'peanut', 'household', 'skin_type', 'profile']
  for (const r of seen.filter((x) => x.url.includes('/api/') || x.method !== 'GET' || !x.url.startsWith('http://localhost'))) {
    // the demo fixture name legitimately contains "sesame"; strip it before checking
    const hay = (decodeURIComponent(r.url) + '\n' + r.body.replace(/kokis_sesame_si_en/g, '')).toLowerCase()
    for (const f of forbidden) expect(hay, `${r.method} ${r.url} contains "${f}"`).not.toContain(f.toLowerCase())
  }
  // the scan form has exactly the allowed fields
  const scan = api.find((r) => r.url.endsWith('/api/scan'))!
  const names = [...scan.body.matchAll(/form-data; name="([^"]+)"/g)].map((m) => m[1])
  expect(new Set(names)).toEqual(new Set(['images', 'lang', 'market', 'fixture']))
})
