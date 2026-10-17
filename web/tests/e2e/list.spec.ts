import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './helpers'

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

const ids = ['nutrition', 'processing', 'additives', 'carbon', 'water_land', 'packaging']
const analysis = (name: string, letter: string) => ({
  product: { name: { value: name, confidence: 1 }, category: { value: 'food', confidence: 1 } },
  findings: [], grade: { letter, reason: null, planet_partial: true, drivers: [], rule_version: 'grade-1.0' }, product_range: 'milk_powder',
  cards: ids.map((id, i) => ({ id, grade: i < 3 ? letter : null, status: 'info', tier: i < 3 ? 'verified' : 'unknown', headline: '', finding_ids: [] })),
  facts: { allergens_contains: [], allergens_may_contain: [], ingredients_known: true, diets: {}, nutrient_levels: {}, canonical_ingredient_ids: [] },
})

test('list parse, review, tick, compare, basket, axe', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/ranges', (r) => r.fulfill({ json: { ranges: [{ id: 'milk_powder', name: 'Milk powder', keywords: { en: ['milk powder'], si: [], ta: [] } }] } }))
  let body = ''
  await page.route('**/api/list/parse', (r) => { body = r.request().postData() ?? ''; return r.fulfill({ json: { items: [
    { name: 'Milk powder', quantity: 1, unit: 'kg', brand: null, range_id: 'milk_powder' }, { name: 'Rice', quantity: 5, unit: 'kg', brand: null, range_id: null }] } }) })
  await page.goto('/')
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()
  await axe(page)

  await page.getByRole('textbox', { name: 'Paste your list' }).fill('milk powder 1kg\nrice 5kg')
  await page.getByRole('button', { name: 'Read my list' }).click()
  expect(JSON.parse(body)).toEqual({ text: 'milk powder 1kg\nrice 5kg', lang: 'en' })
  await expect(page.getByTestId('review').locator('li')).toHaveCount(2)
  await axe(page)
  await page.getByRole('button', { name: 'Remove Rice' }).click()
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill('Milk powder (full cream)')
  await page.getByRole('button', { name: 'Save list' }).click()
  await expect(page.getByTestId('progress')).toHaveText('0 found, 1 open')

  await page.evaluate(async (a) => {
    const L = (window as unknown as { __fsList: { onScanCompleted: (r: unknown) => Promise<unknown> } }).__fsList
    await L.onScanCompleted({ scan_id: 's1', analysis: a[0] })
    await L.onScanCompleted({ scan_id: 's2', analysis: a[1] })
  }, [analysis('Anchor Milk Powder', 'B'), analysis('Nespray Milk Powder', 'C')])
  await expect(page.getByTestId('progress')).toHaveText('1 found, 0 open')
  await expect(page.getByText('Found: Anchor Milk Powder')).toBeVisible()
  await axe(page)

  await page.evaluate(() => (window as unknown as { __fsList: { openCompare: (p: unknown) => void } }).__fsList.openCompare({ itemId: 'x', firstScanId: 's1', secondScanId: 's2' }))
  await expect(page.getByRole('heading', { name: 'Compare two' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Put this in my basket' })).toHaveCount(2)
  await expect(page.getByText(/better|best|recommend(ed)? for you/i)).toHaveCount(0)
  await axe(page)
  await page.getByRole('button', { name: 'Put this in my basket' }).nth(1).click()

  await expect(page.getByRole('heading', { name: 'Your basket' })).toBeVisible()
  await expect(page.getByText('1 of 1 are B or better')).toHaveCount(0)
  await expect(page.getByText('0 of 1 are B or better')).toBeVisible()
  await axe(page)
  await page.getByRole('button', { name: 'End trip' }).click()
  await expect(page.getByText(/Your basket is empty/)).toBeVisible()
})
