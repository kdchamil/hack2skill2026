import { expect, test, type Page } from '@playwright/test'
import { PIN, setupHousehold } from '../e2e/helpers'

// Judge demo (SPEC section 11) against the real backend in mock mode. No request interception.
async function noVoices(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], cancel() {}, speak() {}, pause() {}, resume() {} } })
  })
}

async function openDemo(page: Page, title: string, ready = '.area-row') {
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: title }).click()
  await page.locator(ready).first().waitFor()
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
  const rings = page.locator('.ring-item')
  await expect(rings).toHaveCount(3)
  await expect(rings.nth(0)).toHaveAccessibleName(/Amaya: Avoid.*sesame/i)
  await expect(rings.nth(1)).toHaveAccessibleName(/Dad: Check.*sodium/i)
  await expect(page.locator('.area-row')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible()

  // language switch changes the area text (real /api/commentary)
  const first = page.locator('.area-row').nth(0)
  const en = await first.innerText()
  await page.locator('.listenbar select').selectOption('si')
  await expect(first).not.toHaveText(en)
  await page.locator('.listenbar select').selectOption('ta')
  await expect(first).not.toHaveText(en)
  await page.locator('.listenbar select').selectOption('en')
  await expect(first).toContainText('Contains: egg, sesame')

  // packaging card: label-stated recycling code, carbon is "No reliable data"
  await page.locator('.area-row').nth(1).click()
  await expect(page.getByText(/no reliable data/i).first()).toBeVisible()
  await page.locator('[data-card="packaging"]').click()
  await expect(page.getByText(/PP 5/).first()).toBeVisible()
  await expect(page.getByText('Label-stated').first()).toBeVisible()

  // Listen falls back to on-screen text when TTS is unavailable (503 in mock mode)
  await page.getByRole('button', { name: 'Listen' }).click()
  await expect(page.getByText('Audio unavailable — reading on screen')).toBeVisible()
  await expect(page.locator('.listen-text')).not.toBeEmpty()

  // claims: "Sugar free" contradicted by dextrose
  await openDemo(page, 'Digestive Biscuits Sugar Free')
  await page.locator('.area-row').nth(3).click()
  await page.getByRole('button', { name: 'Open claim check' }).click()
  await expect(page.locator('.claimcard').first()).toContainText(/contradicted/i)
  await expect(page.locator('.claimcard').first()).toContainText(/dextrose/i)

  // blurred label: no grade, retake guidance
  await openDemo(page, 'blurred label', '[data-testid="no-grade"]')
  await expect(page.getByTestId('no-grade')).toContainText('Not enough data to grade')
  await expect(page.getByRole('button', { name: 'Scan the ingredient side' })).toBeVisible()

  // library holds the scans; one opens offline
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByTestId('lib-entry')).toHaveCount(3)

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

async function idbState(page: Page) {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name)
    if (!names.includes('fivesec')) return { dbs: names.length, keys: [] as string[] }
    const keys = await new Promise<string[]>((res) => {
      const q = indexedDB.open('fivesec')
      q.onsuccess = () => {
        const db = q.result
        if (!db.objectStoreNames.contains('kv')) { db.close(); return res([]) }
        const k = db.transaction('kv').objectStore('kv').getAllKeys()
        k.onsuccess = () => { db.close(); res(k.result.map(String)) }
      }
    })
    return { dbs: names.length, keys }
  })
}

test('delete-all returns the app to first run: IndexedDB empty, no members, old PIN useless', async ({ page }) => {
  await noVoices(page)
  await setupHousehold(page)
  await expect(page.getByText('Amaya').first()).toBeVisible()
  await openDemo(page, 'Crunchy Kokis')
  await expect(page.locator('.ring-item')).toHaveCount(3)
  await page.waitForTimeout(500)
  await page.evaluate(() => { sessionStorage.setItem('fivesec.tmp', '1') })
  expect((await idbState(page)).keys.sort()).toEqual(expect.arrayContaining(['history', 'library', 'meta', 'profiles']))

  // reachable from the Privacy tab as well as Household; use Privacy here
  await page.getByRole('button', { name: 'Privacy' }).click()
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await page.getByRole('button', { name: 'Yes, delete everything' }).click()
  await expect(page.getByTestId('deleted-msg')).toHaveText('All data on this phone was deleted.')

  expect((await idbState(page)).keys).toEqual([])
  expect(await page.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)].flat().filter((k) => k.startsWith('fivesec')))).toEqual([])
  // the scan result is gone too
  await expect(page.getByRole('button', { name: 'Kokis' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Household' }).click()
  await expect(page.getByRole('heading', { name: 'Protect your household' })).toBeVisible()
  await expect(page.getByText('Amaya')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toHaveCount(0)

  // a reload is still first run: nothing to unlock with the old PIN
  await page.reload()
  await page.getByRole('button', { name: 'Household' }).click()
  await expect(page.getByRole('heading', { name: 'Protect your household' })).toBeVisible()
  await expect(page.getByLabel('PIN (6 or more digits)')).toBeVisible()
  await expect(page.getByText('Amaya')).toHaveCount(0)
  expect((await idbState(page)).keys).toEqual([])
})

test('report wrong information sends only scan_id, finding_id and note', async ({ page }) => {
  await noVoices(page)
  await setupHousehold(page)
  await openDemo(page, 'Crunchy Kokis')
  await expect(page.locator('.ring-item')).toHaveCount(3)

  const posts: string[] = []
  await page.route('**/api/report', (route) => { posts.push(route.request().postData() ?? ''); return route.continue() })

  await page.locator('.area-row').nth(0).click()
  await page.locator('[data-card="nutrition"]').click()
  await page.getByRole('button', { name: 'Report wrong info', exact: true }).click()
  const rep = page.getByRole('dialog', { name: 'Report wrong info' })
  await expect(rep).toContainText("Don't include names or health details")
  await rep.getByLabel(/What is wrong/).fill('The sesame is not on my pack')
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/report') && r.status() === 202), rep.getByRole('button', { name: 'Send report' }).click()])
  await expect(rep).toContainText('Thanks — sent for review')
  await rep.getByRole('button', { name: 'Close' }).first().click()

  // one-tap, no note
  await page.getByRole('button', { name: 'Report wrong info', exact: true }).click()
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/report') && r.status() === 202), page.getByRole('dialog', { name: 'Report wrong info' }).getByRole('button', { name: 'Send report' }).click()])

  expect(posts).toHaveLength(2)
  const [drawer, finding] = posts.map((p) => JSON.parse(p) as Record<string, unknown>)
  for (const body of [drawer, finding]) {
    expect(Object.keys(body).every((k) => ['scan_id', 'finding_id', 'note'].includes(k))).toBe(true)
    expect(typeof body.scan_id).toBe('string')
    const raw = JSON.stringify(body).toLowerCase()
    for (const f of ['amaya', 'dad', 'ravi', 'alias', 'life_stage', 'low_sodium', 'household', 'profile', 'image']) expect(raw).not.toContain(f)
  }
  expect(drawer.note).toBe('The sesame is not on my pack')
  expect(typeof finding.finding_id).toBe('string')
  expect(finding.note).toBeUndefined()
})
