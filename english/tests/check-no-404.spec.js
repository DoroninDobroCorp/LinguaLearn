import { test, expect } from '@playwright/test';

test('English app - NO 404 errors', async ({ page }) => {
  const consoleErrors = [];
  const failedRequests = [];
  
  // Перехватываем ошибки консоли
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Перехватываем failed requests (404)
  page.on('response', response => {
    if (response.status() === 404) {
      failedRequests.push({
        url: response.url(),
        status: response.status()
      });
    }
  });
  
  // Открываем страницу
  console.log('📍 Opening https://ibet.team/english');
  await page.goto('https://ibet.team/english', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  // Ждем загрузки приложения
  await page.waitForTimeout(3000);
  
  // Проверяем что страница загрузилась
  const title = await page.title();
  console.log(`📄 Page title: ${title}`);
  expect(title).toBe('English Learning Assistant');
  
  // Проверяем что чат виден
  const chatVisible = await page.locator('textarea, input[type="text"]').first().isVisible();
  console.log(`✅ Chat input visible: ${chatVisible}`);
  expect(chatVisible).toBe(true);
  
  // ГЛАВНАЯ ПРОВЕРКА: нет 404 ошибок
  console.log(`\n📊 Checking for 404 errors...`);
  console.log(`   Console errors: ${consoleErrors.length}`);
  console.log(`   Failed requests (404): ${failedRequests.length}`);
  
  if (consoleErrors.length > 0) {
    console.log('\n⚠️  Console errors found:');
    consoleErrors.forEach(err => console.log(`   - ${err}`));
  }
  
  if (failedRequests.length > 0) {
    console.log('\n❌ 404 requests found:');
    failedRequests.forEach(req => console.log(`   - ${req.url} (${req.status})`));
  }
  
  // Проверяем что НЕТ 404 ошибок
  expect(failedRequests.length, '404 errors found!').toBe(0);
  
  // Проверяем что нет критических ошибок в консоли (404)
  const has404Errors = consoleErrors.some(err => err.includes('404'));
  expect(has404Errors, 'Console has 404 errors!').toBe(false);
  
  console.log('\n✅ SUCCESS! No 404 errors detected.');
  console.log('✅ All resources loaded correctly.');
  console.log('✅ API paths are working.');
});
