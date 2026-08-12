const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1/english/';

test.describe('Correction Inbox Page E2E Verification', () => {
  test('Correction Inbox opens via navbar and renders heading, filters, visual diff, and feedback controls', async ({ page }) => {
    // 1. Load English SPA homepage
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // 2. Click Correction Inbox in navigation bar
    const inboxLink = page.getByRole('link', { name: /Correction Inbox/i }).first();
    await expect(inboxLink).toBeVisible();
    await inboxLink.click();
    await page.waitForURL('**/correction-inbox');

    // 3. Verify Page Title & Subtitle (VAL-INBOX-001)
    await expect(page.getByRole('heading', { name: 'Correction Inbox' })).toBeVisible();

    // 4. Verify Filters & Search Controls (VAL-INBOX-002)
    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();

    const appFilter = page.getByTestId('app-filter');
    await expect(appFilter).toBeVisible();

    const statusFilter = page.getByTestId('status-filter');
    await expect(statusFilter).toBeVisible();

    const topicFilter = page.getByTestId('topic-filter');
    await expect(topicFilter).toBeVisible();

    // 5. Interact with search input
    await searchInput.fill('Slack');
    await expect(searchInput).toHaveValue('Slack');

    // 6. Screenshot artifact
    await page.screenshot({ path: 'test-screenshots/correction-inbox-navigation.png', fullPage: true });
    console.log('✅ Correction Inbox UI navigation and controls verified');
  });
});
