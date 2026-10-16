import { expect, test, type Page } from '@playwright/test'
import { PIN, setupHousehold } from '../e2e/helpers'

// Judge demo (SPEC section 11) against the real backend in mock mode. No request interception.
async function noVoices(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], cancel() {}, speak() {}, pause() {}, resume() {} } })
  })
}

async function openDemo(page: Page, title: string) {
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: title }).click()
  await expect(page.locator('.card')).toHaveCount(6)
}

test('3-minute judge demo against the real backend, with no household data on the wire', async ({ page }) => {
  await noVoices(page)
  const seen: { url: string; method: string; body: string }[] = []
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.toString('latin1') ?? '' }))

  // seed household, lock, unlock
  await setupHousehold(page)
  await expect(page.getByText('Amaya').first()).toBeVisible()
  await page.getByRole('button', { name: 'Lock now' }).click()
  await page.getByLabel('PIN (6 or more digits)').fill(PIN)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add member' })).toBeVisible()

  // demo pack: kokis with sesame and high sodium
  await openDemo(page, 'Crunchy Kokis')
  const chips = page.locator('.vchip')
  await expect(chips).toHaveCount(3)
  await expect(chips.nth(0)).toContainText('Avoid for Amaya')
  await expect(chips.nth(0)).toContainText(/sesame/i)
  await expect(chips.nth(1)).toContainText('Check for Dad')
  await expect(chips.nth(1)).toContainText(/sodium/i)
  await expect(page.getByTestId('elapsed')).toBeVisible()

  // language switch changes the card text (real /api/commentary)
  const allergens = page.locator('[data-card="allergens"] .card-headline')
  await expect(page.getByText('Writing the explanation')).toHaveCount(0) // commentary streamed in
  const en = await allergens.innerText()
  await page.getByRole('button', { name: 'සිං' }).click()
  await expect(allergens).not.toHaveText(en)
  const si = await allergens.innerText()
  await page.getByRole('button', { name: 'தமிழ்', exact: true }).click()
  await expect(allergens).not.toHaveText(si)
  await expect(allergens).not.toHaveText(en)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(allergens).toHaveText(en)

  // packaging card: label-stated recycling code, carbon is "No reliable data"
  await page.locator('[data-card="packaging"] .card-main').click()
  let dlg = page.getByRole('dialog')
  await expect(dlg).toContainText('Recycling code PP 5')
  await expect(dlg.locator('[data-finding="packaging.code.pp5"]')).toContainText('Label-stated')
  await expect(dlg.locator('[data-finding="packaging.carbon"]')).toContainText(/no reliable data/i)
  await expect(dlg.locator('[data-finding="packaging.carbon"]')).toContainText('Unknown')
  await page.keyboard.press('Escape')

  // evidence drawer lists tiers
  await page.getByRole('button', { name: 'All evidence' }).click()
  dlg = page.getByRole('dialog')
  for (const tier of ['Label-stated', 'Inferred', 'Unknown']) await expect(dlg.locator('.tier', { hasText: tier }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // Listen falls back to on-screen text when TTS is unavailable (503 in mock mode)
  await page.locator('[data-card="allergens"] .card-main').click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: /Listen/ }).click()
  await expect(dlg.getByText('Audio unavailable — reading on screen')).toBeVisible()
  await expect(dlg.locator('.listen-text')).not.toBeEmpty()
  await page.keyboard.press('Escape')

  // claims: "Sugar free" contradicted by dextrose
  await page.getByRole('button', { name: 'Scan another' }).click()
  await openDemo(page, 'Digestive Biscuits Sugar Free')
  await page.locator('[data-card="claims"] .card-main').click()
  dlg = page.getByRole('dialog')
  await expect(dlg).toContainText(/contradicted/i)
  await expect(dlg).toContainText(/dextrose/i)
  await page.keyboard.press('Escape')

  // blurred label: retake guidance, ingredients Unknown
  await page.getByRole('button', { name: 'Scan another' }).click()
  await openDemo(page, 'blurred label')
  await expect(page.getByText('Turn to the ingredient side')).toBeVisible()
  await expect(page.locator('[data-card="ingredients"]')).toContainText('Unknown')

  // privacy: nothing sent anywhere carries household data
  const api = seen.filter((r) => r.url.includes('/api/'))
  expect(api.filter((r) => r.url.endsWith('/api/scan')).length).toBe(3)
  const profileOnly = ['Amaya', 'Dad', 'Ravi', 'alias', 'life_stage', 'low_sodium', 'low_sugar', 'household', 'skin_type', 'profile']
  // product allergen words legitimately appear in /api/tts text (spoken product facts), so they are checked elsewhere only
  const productTerms = ['allergens', 'diets', 'goals', 'peanut']
  const fixtures = /kokis_sesame_si_en|sugarfree_biscuit|blurred_label/g
  for (const r of seen.filter((x) => x.url.includes('/api/') || x.method !== 'GET' || !x.url.startsWith('http://localhost'))) {
    const hay = (decodeURIComponent(r.url) + '\n' + r.body.replace(fixtures, '')).toLowerCase()
    const forbidden = r.url.endsWith('/api/tts') ? profileOnly : [...profileOnly, ...productTerms]
    for (const f of forbidden) expect(hay, `${r.method} ${r.url} contains "${f}"`).not.toContain(f.toLowerCase())
  }
  for (const r of api.filter((x) => x.url.endsWith('/api/scan'))) {
    const names = [...r.body.matchAll(/form-data; name="([^"]+)"/g)].map((m) => m[1])
    // Chromium may not expose streamed multipart bodies; the server itself rejects any extra field with 400
    if (names.length) expect(new Set(names)).toEqual(new Set(['images', 'lang', 'market', 'fixture']))
  }
})
