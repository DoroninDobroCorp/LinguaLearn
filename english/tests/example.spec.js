import { test, expect } from "@playwright/test";

test("Example test with form interaction", async ({ page }) => {
  // Navigate to your app
  await page.goto("https://ibet.team/english");
  
  // Check the page loads
  await expect(page).toHaveTitle("English Learning Assistant");
  
  // Example: Click a button (update selector as needed)
  // await page.click('button[type="submit"]');
  
  // Example: Fill a form (update selector as needed)
  // await page.fill('input[name="username"]', 'testuser');
  
  // Example: Check for element text
  // await expect(page.locator('h1')).toContainText('Welcome');
});

test("assert no 404 errors and successful API request", async ({ page }) => {
  // Listen for console errors
  page.on("console", msg => {
    if (msg.type() === "error" && msg.text().includes("404")) {
      throw new Error("404 error in console: " + msg.text());
    }
  });
  
  // Navigate to the page
  await page.goto("https://ibet.team/english");
  
  // Wait for successful API call
  await page.waitForResponse(response => 
    response.url().includes("/english/api/chat") && response.status() === 200
  );
});
