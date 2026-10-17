import { expect, test } from '@playwright/test'
import { mockApi } from './helpers'

test('demo pack without a household shows a labelled in-memory sample household and the AI trace line', async ({ page }) => {
  const bodies: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) bodies.push(r.postDataBuffer()?.toString('latin1') ?? '') })
  await mockApi(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: 'Kokis (Sinhala + English)' }).click()
  await expect(page.getByTestId('sample-household')).toContainText('Sample household')
  await expect(page.getByTestId('sample-household').getByRole('button', { name: 'Set up your own' })).toBeVisible()
  await expect(page.locator('.ring-item').first()).toHaveAccessibleName(/Amaya: Avoid/)
  await expect(page.getByTestId('ai-trace')).toBeVisible()
  await page.getByTestId('ai-trace').getByRole('button').click()
  await expect(page.getByRole('list', { name: 'Processing steps' })).toBeVisible()
  expect(bodies.join('')).not.toContain('Amaya')
})
