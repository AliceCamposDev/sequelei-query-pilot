import { defineConfig } from '@playwright/test';

export default defineConfig({
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  testDir: '.',
  testMatch: '**/*.spec.ts',
  use: {
    trace: 'retain-on-failure',
  },
});
