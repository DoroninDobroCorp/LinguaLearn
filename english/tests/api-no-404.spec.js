import { test, expect } from '@playwright/test';

test('English app - no 404 errors and API works', async ({ page }) => {
  const consoleErrors = [];
  const failedRequests = [];
  
  // Перехватываем ошибки консоли
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Перехватываем failed requests
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
  await page.waitForTimeout(2000);
  
  // Проверяем что страница загрузилась
  const title = await page.title();
  console.log(`📄 Page title: ${title}`);
  expect(title).toBe('English Learning Assistant');
  
  // Проверяем что нет 404 ошибок
  console.log(`\n📊 Checking for 404 errors...`);
  console.log(`   Console errors: ${consoleErrors.length}`);
  console.log(`   Failed requests (404): ${failedRequests.length}`);
  
  if (consoleErrors.length > 0) {
    console.log('\n❌ Console errors found:');
    consoleErrors.forEach(err => console.log(`   - ${err}`));
  }
  
  if (failedRequests.length > 0) {
    console.log('\n❌ 404 requests found:');
    failedRequests.forEach(req => console.log(`   - ${req.url} (${req.status})`));
  }
  
  // Проверяем что чат виден
  const chatInput = page.locator('textarea, input[type="text"]').first();
  await expect(chatInput).toBeVisible({ timeout: 5000 });
  console.log('✅ Chat input is visible');
  
  // Вводим тестовое сообщение
  console.log('\n📝 Testing chat functionality...');
  await chatInput.fill('Hello test');
  
  // Ищем кнопку отправки
  const sendButton = page.locator('button').filter({ hasText: /send|отправить|→|➤/i }).first();
  
  // Ждем ответа от API
  const apiResponsePromise = page.waitForResponse(
    response => response.url().includes('/english/api/chat') && response.status() === 200,
    { timeout: 10000 }
  );
  
  // Отправляем сообщение
  await sendButton.click();
  console.log('✅ Message sent');
  
  // Проверяем что API ответил успешно
  try {
    const apiResponse = await apiResponsePromise;
    console.log(`✅ API responded: ${apiResponse.status()} ${apiResponse.statusText()}`);
    expect(apiResponse.status()).toBe(200);
  } catch (error) {
    console.log('❌ API request failed or timed out');
    throw error;
  }
  
  // Финальная проверка - не должно быть 404 ошибок
  expect(failedRequests.length).toBe(0);
  
  // Проверяем что нет критических ошибок в консоли (404)
  const has404Errors = consoleErrors.some(err => err.includes('404'));
  expect(has404Errors).toBe(false);
  
  console.log('\n✅ All checks passed! No 404 errors, API works correctly.');
});
