import { test, expect } from "@playwright/test";

test("Check English page", async ({ page }) => {
  const response = await page.goto("https://ibet.team/english");
  expect(response.status()).toBe(200);
  await expect(page.locator("body")).toContainText("English Learning");
});
