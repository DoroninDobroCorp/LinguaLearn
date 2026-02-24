import { test, expect } from '@playwright/test';

test('Check for 404 on ibet.team/english', async ({ page }) => {
  const response = await page.goto('https://ibet.team/english');
  expect(response.status()).toBe(200);
});
