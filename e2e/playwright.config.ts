import { defineConfig } from '@playwright/test';

const useTauri = process.env.PLAYWRIGHT_TAURI === 'true';

export default defineConfig({
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  testDir: '.',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: useTauri
      ? 'xvfb-run --auto-servernum --server-args="-screen 0 1440x900x24" corepack pnpm --filter @sequelei/desktop dev'
      : 'corepack pnpm --filter @sequelei/ui dev',
    reuseExistingServer: true,
    url: 'http://127.0.0.1:1420',
  },
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
  },
});
