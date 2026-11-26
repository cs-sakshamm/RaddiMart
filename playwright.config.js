import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /(.+\.)spec\.js$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  webServer: {
    command: 'npm run preview',
    port: 4173,
    baseURL: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
    {
      name: 'mobile-chrome',
      use: devices['Pixel 5'],
    },
    {
      name: 'mobile-safari',
      use: devices['iPhone 12'],
    },
  ],
});
