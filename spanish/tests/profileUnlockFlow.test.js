import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.join(__dirname, '.profile-unlock-flow.sqlite');

let backendBaseUrl = '';
let frontendBaseUrl = '';
let backendProcess = null;
let frontendProcess = null;
let backendOutput = '';
let frontendOutput = '';

function withBackendOrigin(headers = {}) {
  return {
    origin: frontendBaseUrl,
    ...headers,
  };
}

function appendBackendOutput(chunk) {
  backendOutput += chunk.toString();
}

function appendFrontendOutput(chunk) {
  frontendOutput += chunk.toString();
}

function cleanupDbFiles() {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function stopProcess(processRef) {
  if (!processRef || processRef.exitCode !== null) {
    return;
  }

  processRef.kill('SIGTERM');
  try {
    await Promise.race([
      once(processRef, 'exit'),
      delay(5000).then(() => {
        throw new Error('Timed out waiting for process exit');
      }),
    ]);
  } catch {
    processRef.kill('SIGKILL');
    await once(processRef, 'exit');
  }
}

function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function waitForUrl(url, outputLabel, getOutput) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until ready.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for ${outputLabel}:\n${getOutput()}`);
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`${backendBaseUrl}${pathname}`, {
    ...options,
    headers: withBackendOrigin(options.headers || {}),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

before(async () => {
  cleanupDbFiles();

  const [backendPort, frontendPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);
  backendBaseUrl = `http://127.0.0.1:${backendPort}`;
  frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  backendOutput = '';
  frontendOutput = '';

  backendProcess = spawn('node', ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      GEMINI_API_KEY: '',
      PORT: String(backendPort),
      SPANISH_DB_PATH: dbPath,
      SPANISH_ALLOWED_ORIGINS: frontendBaseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', appendBackendOutput);
  backendProcess.stderr.on('data', appendBackendOutput);

  await waitForUrl(`${backendBaseUrl}/api/health`, 'backend server', () => backendOutput);

  frontendProcess = spawn(
    'node',
    ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        SPANISH_API_PROXY_TARGET: backendBaseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  frontendProcess.stdout.on('data', appendFrontendOutput);
  frontendProcess.stderr.on('data', appendFrontendOutput);

  await waitForUrl(`${frontendBaseUrl}/spanish/`, 'frontend server', () => frontendOutput);
});

after(async () => {
  await stopProcess(frontendProcess);
  await stopProcess(backendProcess);

  cleanupDbFiles();
});

describe('Profile unlock flows', () => {
  it('refreshes the active screen after unlocking the current locked profile', async () => {
    const selection = await apiRequest('/api/profiles/1/select', {
      method: 'POST',
    });
    assert.equal(selection.response.status, 200);
    assert.ok(selection.body.activeProfileToken);

    const { response, body } = await apiRequest('/api/profiles/1/pin?profileId=1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-active-profile-token': selection.body.activeProfileToken,
      },
      body: JSON.stringify({ newPin: '1234' }),
    });
    assert.equal(response.status, 200);
    assert.ok(body.unlockToken);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const profileSwitcher = page.locator('button[aria-label="Switch profile"]').first();

    try {
      try {
        await page.goto(`${frontendBaseUrl}/spanish/vocabulary`);
        const lockedMessage = page.getByText('Profile is locked. Enter the PIN to continue.');
        await expect(lockedMessage).toBeVisible();

        await profileSwitcher.click();
        await page.getByRole('button', { name: 'Unlock current profile' }).click();
        await page.getByPlaceholder('4-8 digits').fill('1234');
        await page.getByRole('button', { name: 'Unlock profile' }).click();

        await expect(lockedMessage).toHaveCount(0);
      } finally {
        const clearResult = await apiRequest('/api/profiles/1/pin', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ currentPin: '1234' }),
        });
        assert.equal(clearResult.response.status, 200);
      }
    } finally {
      await browser.close();
    }
  });

  it('switches back to a session-unlocked locked profile without prompting for the PIN again', async () => {
    const profileName = 'Session Lock';

    let result = await apiRequest('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: profileName, avatarEmoji: '🦊' }),
    });
    assert.equal(result.response.status, 200);
    const lockedProfileId = result.body.id;

    const selectResult = await apiRequest(`/api/profiles/${lockedProfileId}/select`, {
      method: 'POST',
    });
    assert.equal(selectResult.response.status, 200);
    assert.ok(selectResult.body.activeProfileToken);

    result = await apiRequest(`/api/profiles/${lockedProfileId}/pin?profileId=${lockedProfileId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-active-profile-token': selectResult.body.activeProfileToken,
      },
      body: JSON.stringify({ newPin: '2468' }),
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.unlockToken);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const profileSwitcher = page.locator('button[aria-label="Switch profile"]').first();

    try {
      await page.goto(`${frontendBaseUrl}/spanish/`);
      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: profileName }).first().click();
      await expect(page.getByRole('heading', { name: `Unlock ${profileName}` })).toBeVisible();
      await page.getByPlaceholder('4-8 digits').fill('2468');
      await page.getByRole('button', { name: 'Unlock profile' }).click();

      await expect(profileSwitcher).toContainText(profileName);

      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: 'Default' }).first().click();
      await expect(profileSwitcher).toContainText('Default');

      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: profileName }).first().click();

      await expect(page.getByRole('heading', { name: `Unlock ${profileName}` })).toHaveCount(0);
      await expect(profileSwitcher).toContainText(profileName);
    } finally {
      await browser.close();
    }
  });

  it('falls back to PIN entry when a remembered unlock token is stale', async () => {
    const profileName = 'Stale Session Lock';
    let currentPin = '2468';

    let result = await apiRequest('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: profileName, avatarEmoji: '🦊' }),
    });
    assert.equal(result.response.status, 200);
    const lockedProfileId = result.body.id;

    const selectResult = await apiRequest(`/api/profiles/${lockedProfileId}/select`, {
      method: 'POST',
    });
    assert.equal(selectResult.response.status, 200);
    assert.ok(selectResult.body.activeProfileToken);

    result = await apiRequest(`/api/profiles/${lockedProfileId}/pin?profileId=${lockedProfileId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-active-profile-token': selectResult.body.activeProfileToken,
      },
      body: JSON.stringify({ newPin: currentPin }),
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.unlockToken);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const profileSwitcher = page.locator('button[aria-label="Switch profile"]').first();

    try {
      await page.goto(`${frontendBaseUrl}/spanish/`);
      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: profileName }).first().click();
      await expect(page.getByRole('heading', { name: `Unlock ${profileName}` })).toBeVisible();
      await page.getByPlaceholder('4-8 digits').fill(currentPin);
      await page.getByRole('button', { name: 'Unlock profile' }).click();
      await expect(profileSwitcher).toContainText(profileName);

      const storedActiveProfileToken = await page.evaluate(
        (profileId) => sessionStorage.getItem(`spanishActiveProfileToken:${profileId}`),
        lockedProfileId,
      );
      assert.ok(storedActiveProfileToken);

      currentPin = '8642';
      result = await apiRequest(`/api/profiles/${lockedProfileId}/pin?profileId=${lockedProfileId}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-active-profile-token': storedActiveProfileToken,
        },
        body: JSON.stringify({ currentPin: '2468', newPin: currentPin }),
      });
      assert.equal(result.response.status, 200);

      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: 'Default' }).first().click();
      await expect(profileSwitcher).toContainText('Default');

      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: profileName }).first().click();

      await expect(page.getByRole('heading', { name: `Unlock ${profileName}` })).toBeVisible();
      assert.equal(
        await page.evaluate(
          (profileId) => sessionStorage.getItem(`spanishProfilePinToken:${profileId}`),
          lockedProfileId,
        ),
        null,
      );

      await page.getByPlaceholder('4-8 digits').fill(currentPin);
      await page.getByRole('button', { name: 'Unlock profile' }).click();
      await expect(profileSwitcher).toContainText(profileName);
    } finally {
      const unlockResult = await apiRequest(`/api/profiles/${lockedProfileId}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: currentPin }),
      });
      if (unlockResult.response.status === 200) {
        const clearResult = await apiRequest(`/api/profiles/${lockedProfileId}/pin?profileId=${lockedProfileId}`, {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
            'x-profile-pin-token': unlockResult.body.unlockToken,
          },
          body: JSON.stringify({ currentPin }),
        });
        assert.equal(clearResult.response.status, 200);
      }

      const deleteResult = await apiRequest(`/api/profiles/${lockedProfileId}`, {
        method: 'DELETE',
      });
      assert.equal(deleteResult.response.status, 200);

      await browser.close();
    }
  });

  it('lets the active profile add a new PIN immediately after clearing the old one', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const profileSwitcher = page.locator('button[aria-label="Switch profile"]').first();
    let activePin = '';

    try {
      await page.goto(`${frontendBaseUrl}/spanish/`);

      await profileSwitcher.click();
      await page.getByRole('button', { name: 'Add profile PIN' }).click();
      await page.locator('input[placeholder="4-8 digits"]').fill('1357');
      await page.getByRole('button', { name: 'Set PIN' }).click();
      activePin = '1357';

      await profileSwitcher.click();
      await expect(page.getByRole('button', { name: 'Manage profile PIN' })).toBeVisible();

      await page.getByRole('button', { name: 'Manage profile PIN' }).click();
      const pinInputs = page.locator('input[placeholder="4-8 digits"]');
      await pinInputs.nth(0).fill('1357');
      await page.getByRole('button', { name: 'Clear PIN' }).click();
      activePin = '';

      await profileSwitcher.click();
      await expect(page.getByRole('button', { name: 'Add profile PIN' })).toBeVisible();

      await page.getByRole('button', { name: 'Add profile PIN' }).click();
      await page.locator('input[placeholder="4-8 digits"]').fill('2468');
      await page.getByRole('button', { name: 'Set PIN' }).click();
      activePin = '2468';

      await profileSwitcher.click();
      await expect(page.getByRole('button', { name: 'Manage profile PIN' })).toBeVisible();
    } finally {
      if (activePin) {
        const unlockResult = await apiRequest('/api/profiles/1/unlock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pin: activePin }),
        });
        if (unlockResult.response.status === 200) {
          const clearResult = await apiRequest('/api/profiles/1/pin', {
            method: 'DELETE',
            headers: {
              'content-type': 'application/json',
              'x-profile-pin-token': unlockResult.body.unlockToken,
            },
            body: JSON.stringify({ currentPin: activePin }),
          });
          assert.equal(clearResult.response.status, 200);
        }
      }
      await browser.close();
    }
  });

  it('deleting the active profile falls back into a recoverable locked-profile state', async () => {
    let result = await apiRequest('/api/profiles/1/select', {
      method: 'POST',
    });
    assert.equal(result.response.status, 200);

    result = await apiRequest('/api/profiles/1/pin?profileId=1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-active-profile-token': result.body.activeProfileToken,
      },
      body: JSON.stringify({ newPin: '4321' }),
    });
    assert.equal(result.response.status, 200);

    result = await apiRequest('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Temporary', avatarEmoji: '🌟' }),
    });
    assert.equal(result.response.status, 200);
    const temporaryProfileId = result.body.id;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const profileSwitcher = page.locator('button[aria-label="Switch profile"]').first();

    try {
      page.on('dialog', (dialog) => dialog.accept());

      await page.goto(`${frontendBaseUrl}/spanish/`);
      await profileSwitcher.click();
      await page.locator('div.cursor-pointer').filter({ hasText: 'Temporary' }).first().click();
      await expect(profileSwitcher).toContainText('Temporary');

      await profileSwitcher.click();
      await page.getByLabel('Delete Temporary').click();

      await expect(profileSwitcher).toContainText('Default');

      await expect(page.getByRole('button', { name: 'Unlock current profile' })).toBeVisible();
      await expect(page.locator('div.cursor-pointer').filter({ hasText: 'Temporary' })).toHaveCount(0);

      await page.goto(`${frontendBaseUrl}/spanish/vocabulary`);
      await expect(page.getByText('Profile is locked. Enter the PIN to continue.')).toBeVisible();

      result = await apiRequest('/api/profiles');
      assert.equal(result.response.status, 200);
      assert.equal(result.body.profiles.some((profile) => profile.id === temporaryProfileId), false);
    } finally {
      await browser.close();

      const clearResult = await apiRequest('/api/profiles/1/pin', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPin: '4321' }),
      });
      assert.equal(clearResult.response.status, 200);
    }
  });
});
