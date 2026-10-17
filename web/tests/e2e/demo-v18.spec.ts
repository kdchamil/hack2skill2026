// The 3-minute judge demo (SRS "3-minute judge demo"), mocked camera via demo packs.
import { expect, test } from '@playwright/test'
import sample from '../fixtures/sample-analysis.json' with { type: 'json' }
import { mockApi, setupHousehold } from './helpers'

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function biscuit(id: string, name: string): Any {
  const a: Any = structuredClone(sample.analysis)
  a.product.name.value = name
  a.product_range = 'biscuits'
  a.facts = { ...a.facts, allergens_contains: [], allergens_may_contain: [] }
  a.findings = [...a.findings.filter((f: Any) => f.topic !== 'allergens'), {
    id: 'claim.0', area: 'truth', topic: 'claims', card: null, category: 'claim', severity: 'check', risk: 'no_known_concern', tier: 'inferred',
    title: 'Claim: contradicted', reason: 'Maltitol and dextrose are listed.', next_step: null, sources: [], data: { verdict: 'contradicted', kind: 'other', claim: 'Sugar free', evidence: [] },
  }]
  return { ...sample.done, scan_id: id, analysis: a }
}

test('3-minute judge demo', async ({ page }) => {
  const seen: { url: string; body: string; method: string }[] = []
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.toString('latin1') ?? '' }))
  await mockApi(page)
  const packs = [
    { name: 'kokis_sesame_si_en', title: 'Kokis (Sinhala + English)' }, { name: 'sugar_free_biscuit', title: 'Sugar-free biscuit' },
    { name: 'biscuit_b', title: 'Cream biscuit' }, { name: 'blurred_label', title: 'Blurred label' },
  ]
  await page.route('**/api/fixtures', (r) => r.fulfill({ json: packs }))
  await page.route('**/api/ranges', (r) => r.fulfill({ json: { ranges: [{ id: 'biscuits', name: 'Biscuits', keywords: { en: ['biscuit'], si: [], ta: [] } }] } }))
  await page.route('**/api/list/parse', (r) => r.fulfill({ json: { items: [{ name: 'Biscuits', quantity: 1, unit: null, brand: null, range_id: 'biscuits' }] } }))
  let n = 0
  await page.route('**/api/scan', (r) => {
    const body = r.request().postData() ?? ''
    if (body.includes('sugar_free_biscuit') || body.includes('biscuit_b')) {
      const d = biscuit(`bis-${++n}`, body.includes('biscuit_b') ? 'Cream Biscuit' : 'Sugar-free Biscuit')
      return r.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('analysis', d.analysis) + sse('commentary', d.commentary) + sse('done', d) })
    }
    return r.fallback()
  })

  // household unlock -> Kokis
  await setupHousehold(page)
  const scan = async (title: string) => {
    await page.getByRole('button', { name: 'Scan', exact: true }).click()
    await page.getByRole('button', { name: 'Try a demo pack' }).click()
    await page.getByRole('button', { name: title }).click()
  }
  await scan('Kokis (Sinhala + English)')
  const rings = page.locator('.ring-item')
  await expect(rings).toHaveCount(3)
  await expect(rings.nth(0)).toHaveAccessibleName(/Amaya: Avoid.*sesame/i)
  await expect(rings.nth(1)).toHaveAccessibleName(/Dad: Check.*sodium/i)
  await page.locator('.area-row').nth(0).click()
  await expect(page.getByTestId('contains')).toContainText('Sesame')
  await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible()
  await page.locator('.strip-main').click()

  // sugar-free biscuit -> Contradicted claim
  await scan('Sugar-free biscuit')
  await page.locator('.area-row').nth(3).click()
  await page.getByRole('button', { name: 'Open claim check' }).click()
  await expect(page.locator('.claimcard').first()).toContainText('Contradicted')

  // blurred label -> No grade / retake
  await scan('Blurred label')
  await expect(page.getByTestId('no-grade')).toContainText('Not enough data to grade')
  await expect(page.getByRole('button', { name: 'Scan the ingredient side' })).toBeVisible()

  // library has both
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByTestId('lib-entry').filter({ hasText: 'Crunchy Kokis' })).toHaveCount(1)
  await expect(page.getByTestId('lib-entry').filter({ hasText: 'Sugar-free Biscuit' })).toHaveCount(1)

  // paste a list; scanning ticks it; a second biscuit prompts compare; basket
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByRole('textbox', { name: 'Paste your list' }).fill('biscuits')
  await page.getByRole('button', { name: 'Read my list' }).click()
  await page.getByRole('button', { name: 'Save list' }).click()
  await expect(page.getByTestId('progress')).toHaveText('0 found, 1 open')
  await scan('Sugar-free biscuit')
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByTestId('progress')).toHaveText('1 found, 0 open')
  await scan('Cream biscuit')
  await expect(page.getByRole('dialog', { name: 'Compare these two?' })).toBeVisible()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Compare two' })).toBeVisible()
  await page.getByRole('button', { name: 'Put this in my basket' }).first().click()
  await expect(page.getByRole('heading', { name: 'Your basket' })).toBeVisible()

  // opening a saved Library entry works offline
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByTestId('lib-entry').filter({ hasText: 'Crunchy Kokis' }).getByRole('button', { name: /^Open/ }).click()
  await expect(page.getByTestId('saved-note')).toBeVisible()
  await expect(page.locator('.area-row')).toHaveCount(5)
  await page.context().setOffline(false)

  // no profile field left the phone
  const forbidden = ['Amaya', 'Dad', 'Ravi', 'alias', 'life_stage', 'allergens', 'diets', 'goals', 'low_sodium', 'low_sugar', 'household', 'skin_type', 'profile']
  const out = seen.filter((x) => x.url.includes('/api/') || (x.method !== 'GET' && !x.url.startsWith('data:')))
  expect(out.some((x) => x.url.endsWith('/api/scan'))).toBe(true)
  for (const r of out) {
    const hay = (decodeURIComponent(r.url) + '\n' + r.body.replace(/kokis_sesame_si_en|sugar_free_biscuit|biscuit_b/g, '')).toLowerCase()
    for (const f of forbidden) expect(hay, `${r.method} ${r.url} contains "${f}"`).not.toContain(f.toLowerCase())
  }
})
