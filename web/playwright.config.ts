import { defineConfig, devices } from '@playwright/test'

// These tests drive the real app. Start the database, the API (port 5195) and the web app
// (port 3300) first; see the README.
export default defineConfig({
  testDir: './e2e',
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3300' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
})
