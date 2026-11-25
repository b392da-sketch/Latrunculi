import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const base = process.env.LATRUNCULI_PAGES_SMOKE ? '/Latrunculi/' : '/'
const address = `http://127.0.0.1:4173${base}`
const launchOptions = executablePath ? { executablePath } : {}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: address,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions, viewport: { width: 1440, height: 1024 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=${base}`,
    url: address,
    reuseExistingServer: !process.env.CI,
  },
})
