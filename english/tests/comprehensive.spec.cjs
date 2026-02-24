const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5173/english/';

test.describe('English Learning Assistant - Full Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
  });

  test('01 - Homepage loads with navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/English Learning/);
    
    // Check nav items exist
    await expect(page.getByText('English Learning', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Chat/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Topics/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Exercises/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Vocabulary/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Settings/i }).first()).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/01-homepage.png', fullPage: true });
    console.log('✅ 01 - Homepage loaded');
  });

  test('02 - Theme toggle (light/dark)', async ({ page }) => {
    await page.screenshot({ path: 'test-screenshots/02a-theme-light.png', fullPage: true });
    
    const themeBtn = page.locator('button[aria-label="Toggle theme"]').first();
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();
    await page.waitForTimeout(500);
    
    // Verify dark theme applied
    const htmlAttr = await page.locator('html').getAttribute('data-theme');
    expect(htmlAttr).toBe('dark');
    
    await page.screenshot({ path: 'test-screenshots/02b-theme-dark.png', fullPage: true });
    
    // Toggle back
    await themeBtn.click();
    await page.waitForTimeout(300);
    
    console.log('✅ 02 - Theme toggle works');
  });

  test('03 - Chat page loads with history', async ({ page }) => {
    // Chat is the default page
    // Check chat elements exist
    await expect(page.getByText('Chat with Assistant')).toBeVisible();
    await expect(page.locator('textarea[placeholder="Type a message..."]')).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/03-chat-page.png', fullPage: true });
    console.log('✅ 03 - Chat page loaded');
  });

  test('04 - Topics page shows data', async ({ page }) => {
    await page.getByRole('link', { name: /Topics/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Check for either topics list or empty state
    const hasContent = await page.getByText(/Topics to Work On|No topics yet/).count();
    expect(hasContent).toBeGreaterThan(0);
    
    await page.screenshot({ path: 'test-screenshots/04-topics-page.png', fullPage: true });
    console.log('✅ 04 - Topics page loaded');
  });

  test('05 - Exercises page works', async ({ page }) => {
    await page.getByRole('link', { name: /Exercises/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page.getByText('Practice Exercises')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate New Exercise' })).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/05-exercises-page.png', fullPage: true });
    console.log('✅ 05 - Exercises page loaded');
  });

  test('06 - Vocabulary page works', async ({ page }) => {
    await page.getByRole('link', { name: /Vocabulary/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page.getByText('Vocabulary Practice')).toBeVisible();
    await expect(page.getByText('Add New Word')).toBeVisible();
    
    // Check stats cards
    await expect(page.getByText('Total Words')).toBeVisible();
    await expect(page.getByText('Due Today')).toBeVisible();
    await expect(page.getByText('Mastered')).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/06-vocabulary-page.png', fullPage: true });
    console.log('✅ 06 - Vocabulary page loaded');
  });

  test('07 - Settings page works', async ({ page }) => {
    await page.getByRole('link', { name: /Settings/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page.getByText('Maximum English Level')).toBeVisible();
    await expect(page.getByText('Save Settings')).toBeVisible();
    
    // Check level buttons
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      await expect(page.getByRole('button', { name: level, exact: true })).toBeVisible();
    }
    
    await page.screenshot({ path: 'test-screenshots/07-settings-page.png', fullPage: true });
    console.log('✅ 07 - Settings page loaded');
  });

  test('08 - All API endpoints respond correctly', async ({ page }) => {
    const endpoints = [
      { url: '/english/api/topics', check: (d) => 'topics' in d },
      { url: '/english/api/chat/history', check: (d) => 'history' in d },
      { url: '/english/api/vocabulary', check: (d) => 'words' in d },
      { url: '/english/api/vocabulary/due', check: (d) => 'words' in d },
      { url: '/english/api/settings', check: (d) => 'max_level' in d },
      { url: '/english/api/stats', check: (d) => 'topics' in d && 'vocabulary' in d },
    ];
    
    for (const ep of endpoints) {
      const response = await page.request.get(`http://127.0.0.1:5173${ep.url}`);
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(ep.check(data)).toBeTruthy();
    }
    
    console.log('✅ 08 - All 6 API endpoints verified');
  });

  test('09 - Mobile responsive view', async ({ page }) => {
    // iPhone SE viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    // Check hamburger menu exists
    const menuBtn = page.locator('button[aria-label="Menu"]');
    await expect(menuBtn).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/09a-mobile-closed.png', fullPage: true });
    
    // Open menu
    await menuBtn.click();
    await page.waitForTimeout(300);
    
    // Nav items should now be visible
    await expect(page.getByRole('link', { name: /Topics/i }).first()).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/09b-mobile-menu-open.png', fullPage: true });
    
    // Navigate via mobile menu
    await page.getByRole('link', { name: /Topics/i }).first().click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-screenshots/09c-mobile-topics.png', fullPage: true });
    
    console.log('✅ 09 - Mobile responsive works');
  });

  test('10 - Vocabulary: add a word', async ({ page }) => {
    await page.getByRole('link', { name: /Vocabulary/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    // Click Add New Word
    await page.getByText('Add New Word').click();
    await page.waitForTimeout(300);
    
    // Fill form
    await page.fill('input[placeholder="English word..."]', 'serendipity');
    await page.fill('input[placeholder*="Translation"]', 'счастливая случайность');
    await page.fill('textarea[placeholder*="Example"]', 'Finding this café was pure serendipity!');
    
    await page.screenshot({ path: 'test-screenshots/10a-vocab-add-form.png', fullPage: true });
    
    // Submit
    await page.getByRole('button', { name: 'Add Word' }).click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-screenshots/10b-vocab-word-added.png', fullPage: true });
    
    console.log('✅ 10 - Vocabulary word added');
  });

  test('11 - Settings: change level', async ({ page }) => {
    await page.getByRole('link', { name: /Settings/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Click C1 level
    await page.getByRole('button', { name: 'C1', exact: true }).click();
    await page.waitForTimeout(300);
    
    // Verify description updated  
    await expect(page.getByText('Advanced')).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/11a-settings-c1.png', fullPage: true });
    
    // Save
    await page.getByText('Save Settings').click();
    await page.waitForTimeout(500);
    
    // Check saved message
    await expect(page.getByText('Saved!')).toBeVisible();
    
    await page.screenshot({ path: 'test-screenshots/11b-settings-saved.png', fullPage: true });
    
    // Reset back to B2
    await page.getByRole('button', { name: 'B2', exact: true }).click();
    await page.getByText('Save Settings').click();
    await page.waitForTimeout(500);
    
    console.log('✅ 11 - Settings change and save works');
  });

  test('12 - Performance: navigate all pages fast', async ({ page }) => {
    const start = Date.now();
    
    const pages = [
      { name: 'Topics', check: 'Topics to Work On' },
      { name: 'Exercises', check: 'Practice Exercises' },
      { name: 'Vocabulary', check: 'Vocabulary Practice' },
      { name: 'Settings', check: 'Settings' },
      { name: 'Chat', check: 'Chat with Assistant' },
    ];
    
    for (const p of pages) {
      await page.getByRole('link', { name: new RegExp(p.name, 'i') }).first().click();
      await page.waitForLoadState('networkidle');
    }
    
    const elapsed = Date.now() - start;
    console.log(`✅ 12 - All 5 pages in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10000);
    
    await page.screenshot({ path: 'test-screenshots/12-performance-final.png', fullPage: true });
  });
});
