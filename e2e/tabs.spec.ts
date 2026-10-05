import { expect, test } from '@playwright/test';

test('abrir abas, alternar e fechar aba', async ({ page }) => {
  await page.goto('/');

  const tablist = page.getByRole('tablist', { name: 'Abas de consulta' });
  await expect(tablist).toBeVisible();

  // Inicialmente tem 1 aba
  await expect(page.getByRole('tab')).toHaveCount(1);

  // Abrir segunda aba via botão +
  await page.getByRole('button', { name: 'Nova aba' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);

  // Abrir terceira aba via botão Nova query na topbar
  await page.getByRole('button', { name: 'Nova query' }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);

  // Fechar a terceira aba
  await page.getByRole('button', { name: 'Fechar Consulta 03' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
});

test('cria nova aba via menu de contexto do explorador com select top 1000', async ({ page }) => {
  await page.goto('/');

  const tableItem = page.getByText('TBResultados');
  await tableItem.click({ button: 'right' });

  const contextMenuItem = page.getByRole('menuitem', { name: 'select top 1000 *' });
  await expect(contextMenuItem).toBeVisible();
  await contextMenuItem.click();

  // Uma nova aba foi criada para dbo.TBResultados
  await expect(page.getByRole('tab', { name: /TBResultados/ })).toBeVisible();
});
