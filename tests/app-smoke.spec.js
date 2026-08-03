const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

test('boots the job tracker shell without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await stubExternals(page);

  await page.goto('/');

  await expect(page.getByRole('banner')).toContainText('Job Tracker');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jobs/ })).toBeVisible();
  await expect(page.locator('#content')).toBeVisible();

  await page.getByRole('button', { name: /Jobs/ }).click();
  await expect(page.locator('#content')).toContainText(/job|lead|active|complete/i);

  expect(errors).toEqual([]);
});
