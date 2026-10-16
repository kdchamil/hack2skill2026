import { defineConfig, devices } from '@playwright/test'

// End-to-end against the REAL FastAPI backend (FIVESEC_MOCK=1: fixtures + template commentary, no cloud calls).
// No route mocking. Requires a built PWA in web/dist and `uv` on PATH.
export default defineConfig({
  testDir: 'tests/e2e-real',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8080', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'uv run uvicorn app.main:app --port 8080',
    cwd: '../backend',
    env: { FIVESEC_MOCK: '1', WEB_DIST: '../web/dist', PATH: process.env.PATH ?? '' },
    url: 'http://localhost:8080/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
