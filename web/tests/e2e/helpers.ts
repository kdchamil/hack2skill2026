import type { Page, Route } from '@playwright/test'
import sample from '../fixtures/sample-analysis.json' with { type: 'json' }

type Sample = typeof sample
const claim = (i: number, verdict: string, claim: string, reason: string) => ({
  id: `claim.${i}`, area: 'truth', topic: 'claims', card: null, category: 'claim', severity: verdict === 'contradicted' ? 'check' : 'info', risk: 'no_known_concern', tier: 'inferred',
  title: `Claim: ${verdict}`, reason, next_step: null, sources: [], data: { verdict, kind: 'other', claim, evidence: [] },
})
/** The mock backend's Kokis has no claims; add one of each verdict so Truth and Claim check have content. */
function withClaims(a: Sample['analysis']): Sample['analysis'] {
  const extra = [claim(0, 'contradicted', 'No added sugar', 'The ingredients list dextrose, a sugar.'), claim(1, 'unverifiable', 'Natural flavours', 'The law allows this term without listing sources.'),
    claim(2, 'supported', 'High fibre', '6.2 g per 100 g; the threshold is 6 g.'), claim(3, 'unsupported', 'Low fat', 'Fat is above the low-fat threshold.')]
  return { ...a, findings: [...a.findings, ...extra] } as unknown as Sample['analysis']
}

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
      if (route.request().postData()?.includes('blurred_label')) {
        const th = sample.thin
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('analysis', th.analysis) + sse('commentary', th.commentary) + sse('done', th) })
      }
      return route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: sse('analysis', withClaims(sample.analysis)) + sse('commentary', sample.commentary_en) + sse('done', { ...sample.done, analysis: withClaims(sample.done.analysis) }),
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

export async function demoPack(page: Page, title = 'Kokis (Sinhala + English)') {
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByRole('button', { name: 'Try a demo pack' }).click()
  await page.getByRole('button', { name: title }).click()
}
