import type { Page, Route } from '@playwright/test'
import sample from '../fixtures/sample-analysis.json' with { type: 'json' }

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

export async function mockApi(page: Page, opts: { tts?: number } = {}) {
  // deterministic: no on-device voices, so a TTS failure ends in the text-only fallback
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], cancel() {}, speak() {}, pause() {}, resume() {} } })
  })
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    if (p === '/api/scan') {
      return route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: sse('analysis', sample.analysis) + sse('commentary', sample.commentary_en) + sse('done', sample.done),
      })
    }
    if (p === '/api/fixtures') return route.fulfill({ json: [{ name: 'kokis_sesame_si_en', title: 'Kokis (Sinhala + English)' }, { name: 'blurred_label', title: 'Blurred label' }] })
    if (p === '/api/commentary') return route.fulfill({ json: sample.commentary_si })
    if (p === '/api/tts') return route.fulfill({ status: opts.tts ?? 503, body: 'tts down' })
    if (p === '/api/report') return route.fulfill({ status: 202, body: '' })
    return route.fulfill({ status: 404, body: '' })
  })
}

export const PIN = '482916'

export async function setupHousehold(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Household' }).click()
  await page.getByLabel('PIN (6 or more digits)').fill(PIN)
  await page.getByLabel('Repeat PIN').fill(PIN)
  await page.getByRole('button', { name: 'Create PIN' }).click()
  await page.getByTestId('recovery-code').waitFor()
  await page.getByRole('button', { name: 'I have saved my recovery code' }).click()
  await page.getByRole('button', { name: 'Add demo household' }).click()
}
