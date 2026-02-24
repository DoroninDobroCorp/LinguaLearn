const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173/english',
    headless: true,
    screenshot: 'off',
    video: 'off',
  },
});
