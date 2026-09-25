import { defineConfig } from '@playwright/test';

export default defineConfig({
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  testDir: '.',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: 'corepack pnpm --filter @sequelei/ui dev',
    reuseExistingServer: true,
    url: 'http://127.0.0.1:1420',
  },
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
  },
});
