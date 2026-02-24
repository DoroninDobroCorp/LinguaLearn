import { test, expect } from '@playwright/test';

test('Chat functionality - UI message send and display', async ({ page }) => {
  // Navigate to the English learning app
  await page.goto('https://ibet.team/english');

  // Find and interact with chat input field
  const chatInput = page.locator('textarea[placeholder="Type a message..."]');
  await expect(chatInput).toBeVisible();
  
  // Type a test message
  await chatInput.fill('Hello, how are you?');

  // Find and click send button (look for button with Send icon)
  const sendButton = page.locator('button').filter({ has: page.locator('svg') }).first();
  await expect(sendButton).toBeVisible();
  await sendButton.click();

  // Wait a moment for the message to be sent and processed
  await page.waitForTimeout(3000);

  // Verify the user message is displayed in the chat window
  await expect(page.locator('body')).toContainText('Hello, how are you?', { timeout: 10000 });

  // Wait for response to appear (assistant response)
  await page.waitForTimeout(5000);

  // Verify there are now multiple messages (user + assistant)
  const messageContainers = page.locator('div').filter({ hasClass: /max-w.*%/ });
  const messageCount = await messageContainers.count();
  expect(messageCount).toBeGreaterThan(1);

  // Look for any assistant response (should have different gradient than user messages)
  const allMessages = page.locator('div').filter({ hasClass: /bg-gradient-to-r/i });
  const allMessageCount = await allMessages.count();
  expect(allMessageCount).toBeGreaterThan(1);
});
