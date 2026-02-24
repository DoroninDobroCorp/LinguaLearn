// @ts-check
import { test, expect } from '@playwright/test';

test('Check ibet.team/english is accessible', async ({ page }) => {
  await page.goto('https://ibet.team/english/');
  await expect(page).toHaveTitle(/English/i);
});
