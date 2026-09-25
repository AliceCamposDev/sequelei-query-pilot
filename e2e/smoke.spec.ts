import { expect, test } from '@playwright/test';

test('abre o app e exibe os cinco paineis principais', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('explorer-panel')).toBeVisible();
  await expect(page.getByTestId('editor-panel')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('permite navegar até os painéis com teclado', async ({ page }) => {
  await page.goto('/');
  const separator = page.getByRole('separator').first();

  await separator.focus();
  await page.keyboard.press('ArrowRight');

  await expect(separator).toHaveAttribute('aria-valuenow', '264');
  await page.reload();

  await expect(page.getByRole('separator').first()).toHaveAttribute('aria-valuenow', '264');
});

test('alterna entre os temas dark e light', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
