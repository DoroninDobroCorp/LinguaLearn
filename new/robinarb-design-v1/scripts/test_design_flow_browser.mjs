import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = process.env.ROBIN_PREVIEW_ORIGIN || 'http://127.0.0.1:4182';
const artifactsDir = new URL('../artifacts/design/', import.meta.url);
await mkdir(artifactsDir, { recursive: true });
const artifact = (name) => fileURLToPath(new URL(name, artifactsDir));

const makeArb = (id, match, home, away) => ({
  id,
  event_id: `event-${id}`,
  match,
  home,
  away,
  league: 'England - Northern League Division 1',
  sport: 'Soccer',
  market: 'Handicap',
  display_market: 'Handicap 0',
  bk1: 'Pinnacle',
  bk1_label: 'Pinnacle',
  bk1_outcome: 'Win1',
  bk1_selection: 'H1 0',
  bk1_odds: 1.793,
  bk2: 'paddypower.com',
  bk2_label: 'PaddyPower',
  bk2_outcome: 'Win2',
  bk2_selection: 'Away',
  bk2_odds: 3.2,
  bk2_url: 'https://example.test/counter',
  profit_pct: 1.1,
  robin_profit_pct: 2.48,
  robin_work_rank_profit_pct: 2.48,
  robin_work_verified_pin_odds: 1.793,
  robin_odds: 1.84,
  robin_price_source: 'pinnacle-parser-full-market',
  robin_work_actionable: true,
  robin_work_verification_blocked: false,
  robin_work_verification_status: 'verified',
  age_sec: 0.6,
  is_live: true,
});

const arbs = [
  makeArb('arb-a', 'Shepshed Dynamo - Long Eaton United', 'Shepshed Dynamo', 'Long Eaton United'),
  makeArb('arb-b', 'Hyde United - Worksop Town', 'Hyde United', 'Worksop Town'),
  makeArb('arb-c', 'Matlock Town - Bamber Bridge', 'Matlock Town', 'Bamber Bridge'),
];

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const body = request.postDataJSON?.() || {};
    const json = (value) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(value),
    });

    if (path === '/auth/me') return json({
      user: { username: 'design-test', display_name: 'Robin Operator', role: 'admin' },
      balance: { pinnacle_cashback: 100, robinbet: 100, cashback_pl: 4.28, total: 204.28 },
    });
    if (path === '/balance') return json({
      pinnacle_cashback: 100,
      robinbet: 100,
      cashback_pl: 4.28,
      total: 204.28,
      in_play: {},
    });
    if (path === '/arbs') return json({
      arbs,
      count: arbs.length,
      total_count: arbs.length,
      updated_at: Date.now() / 1000,
      feed_stale_after_sec: 30,
      source: 'forted',
      filters: { sports: ['Soccer'], markets: ['Handicap'], bookmakers: ['PaddyPower'] },
      robin_work: { enabled: true, pricing_pending: false },
    });
    if (path === '/verify' && request.method() === 'POST') return json({
      verified: true,
      status: 'OK',
      current_odds: 1.8,
      feed_odds: 1.793,
      robin_odds: 1.84,
      robin_quote_verified: true,
      robin_reference_pin_odds: 1.793,
      counter_odds: 3.2,
      counter_binding: `counter-${body.arb_id}`,
      quote_id: `quote-${body.arb_id}`,
      basket_revision: 2,
      timestamp: Date.now() / 1000,
    });
    if (path === '/verify/calculator/release') return json({ released: true, basket_released: true });
    if (path === '/calc') {
      const donorStake = Number(body.counter_stake || 50);
      const donorOdds = Number(body.counter_odds || 3.2);
      return json({
        mode: 'donor',
        donor_stake: donorStake,
        donor_odds: donorOdds,
        total_stake: donorStake + 63.21,
        guaranteed_payout: donorStake * donorOdds,
        profit_pct: 1.2,
        robin_profit_pct: 2.48,
        pinnacle: { odds: 1.8, stake: 63.21, profit: 1.2, guaranteed_payout: donorStake * donorOdds },
        robinbet: { odds: 1.84, stake: 61.84, counter_stake: donorStake, profit: 2.48, guaranteed_payout: donorStake * donorOdds },
        counter: { odds: donorOdds, stake: donorStake },
      });
    }
    if (path === '/forted/filters') return json({
      filters: {
        sports: ['Soccer'],
        bookmakers: ['paddypower.com'],
        available_sports: ['Soccer', 'Tennis'],
        bookmakers_count: 1,
        sports_count: 1,
        available_sports_count: 2,
        mode: '0',
        filter_id: '5925',
      },
    });
    if (path === '/forted/bookmaker') return json({
      profile: 'pin_paddy',
      active_profile: 'pin_paddy',
      observed_active_profile: 'pin_paddy',
      inferred_profile: 'pin_paddy',
      profile_authoritative: true,
      profile_ready: true,
      data_epoch: 1,
      generation: 1,
      switching: false,
      control_available: true,
    });
    if (path === '/admin/users') return json({ users: [] });
    if (path === '/admin/bets') return json({ bets: [] });
    return json({});
  });
}

let browser;
try {
  browser = await chromium.launch({ headless: true });

  const landingContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const landingPage = await landingContext.newPage();
  await landingPage.goto(origin, { waitUntil: 'domcontentloaded' });
  await landingPage.getByRole('heading', { name: 'Больше вилок. Лучшая цена.' }).waitFor();
  assert.equal(await landingPage.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await landingPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await landingPage.locator('img[src="/robin-hood-hero.webp"]').count(), 1);
  assert.equal(await landingPage.locator('img[src="/robin-hood-more-forks.webp"]').count(), 1);
  await landingPage.screenshot({ path: artifact('landing-light.png') });
  await landingPage.getByRole('button', { name: 'Тёмная графитовая тема' }).click();
  await landingPage.waitForTimeout(180);
  assert.equal(await landingPage.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await landingPage.screenshot({ path: artifact('landing-dark.png') });
  await landingPage.setViewportSize({ width: 390, height: 844 });
  await landingPage.waitForTimeout(180);
  assert.equal(await landingPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await landingPage.screenshot({ path: artifact('landing-mobile-dark.png') });
  await landingContext.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    window.localStorage.setItem('robinarb.authToken', 'design-contract-token');
    window.localStorage.setItem('robinarb.workspaceTheme', 'light');
  });
  const page = await context.newPage();
  await mockApi(page);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByText('Безопасный Donor-поток').waitFor();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('[aria-label="Тема рабочего пространства"]').count(), 1);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || !active.matches('a, button, input, select, textarea')) return false;
    return getComputedStyle(active).outlineStyle !== 'none';
  }), true);
  await page.screenshot({ path: artifact('scanner-light.png'), fullPage: true });

  await page.getByRole('button', { name: /Open calculator for Shepshed Dynamo - Long Eaton United/ }).click();
  await page.getByRole('heading', { name: /Shepshed Dynamo - Long Eaton United/ }).waitFor();
  await page.getByLabel('Фактическая сумма внешнего плеча').fill('50');
  await page.getByLabel('Фактическая цена внешнего плеча').fill('3.2');
  await page.waitForTimeout(300);
  assert.equal(await page.getByText('BIA Single', { exact: false }).count() > 0, true);
  await page.screenshot({ path: artifact('calculator-light.png'), fullPage: true });

  await page.getByTitle('Close').click();
  await page.locator('.sidebar-theme .theme-toggle button').nth(1).click();
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.getByRole('button', { name: /Open calculator for Shepshed Dynamo - Long Eaton United/ }).click();
  await page.getByRole('heading', { name: /Shepshed Dynamo - Long Eaton United/ }).waitFor();
  await page.getByLabel('Фактическая сумма внешнего плеча').fill('50');
  await page.getByLabel('Фактическая цена внешнего плеча').fill('3.2');
  await page.waitForTimeout(300);
  await page.screenshot({ path: artifact('calculator-dark.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('.sidebar').isVisible(), false);
  await page.screenshot({ path: artifact('calculator-mobile-dark.png'), fullPage: true });
  await page.getByTitle('Close').click();
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('.sidebar').isVisible(), true);
  await page.screenshot({ path: artifact('scanner-mobile-dark.png'), fullPage: true });

  await context.close();
  console.log('design browser flow: ok');
} finally {
  await browser?.close();
}
