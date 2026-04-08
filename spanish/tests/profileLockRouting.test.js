import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PROFILE_UNLOCK_TOKEN_HEADER } from '../server/profilePin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.join(__dirname, '.profile-lock-routing.sqlite');

let baseUrl = '';
let serverProcess = null;
let serverOutput = '';

function withTrustedOrigin(headers = {}) {
  return {
    origin: baseUrl,
    ...headers,
  };
}

function appendServerOutput(chunk) {
  serverOutput += chunk.toString();
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

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(`Server exited before becoming ready:\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for server readiness:\n${serverOutput}`);
}

async function readJsonResponse(response) {
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

before(async () => {
  fs.rmSync(dbPath, { force: true });
  const port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = '';

  serverProcess = spawn('node', ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      GEMINI_API_KEY: '',
      PORT: String(port),
      SPANISH_DB_PATH: dbPath,
      SPANISH_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', appendServerOutput);
  serverProcess.stderr.on('data', appendServerOutput);

  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await once(serverProcess, 'exit');
  }

  fs.rmSync(dbPath, { force: true });
});

describe('Profile lock routing', () => {
  it('keeps profile management reachable while the default profile is locked', async () => {
    let result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: withTrustedOrigin(),
      })
    );
    assert.equal(result.status, 200);
    assert.ok(result.body.activeProfileToken);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/pin?profileId=1`, {
        method: 'POST',
        headers: withTrustedOrigin({
          'content-type': 'application/json',
          'x-active-profile-token': result.body.activeProfileToken,
        }),
        body: JSON.stringify({ newPin: '1234' }),
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.profile.id, 1);
    assert.equal(result.body.profile.is_locked, true);
    assert.ok(result.body.unlockToken);

    result = await readJsonResponse(await fetch(`${baseUrl}/api/settings`));
    assert.equal(result.status, 423);
    assert.equal(result.body.code, 'PROFILE_LOCKED');

    result = await readJsonResponse(await fetch(`${baseUrl}/api/profiles`));
    assert.equal(result.status, 200);
    assert.equal(result.body.profiles.find((profile) => profile.id === 1)?.is_locked, true);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/pin?profileId=1`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ newPin: '5678', currentPin: '1234' }),
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.profile.id, 1);
    assert.equal(result.body.profile.is_locked, true);
    assert.ok(result.body.unlockToken);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/unlock`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pin: '5678' }),
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.ok(result.body.unlockToken);

    const unlockToken = result.body.unlockToken;

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/settings`, {
        headers: { [PROFILE_UNLOCK_TOKEN_HEADER]: unlockToken },
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.profile_id, 1);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/pin`, {
        method: 'DELETE',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ currentPin: '5678' }),
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.profile.id, 1);
    assert.equal(result.body.profile.is_locked, false);

    result = await readJsonResponse(await fetch(`${baseUrl}/api/settings`));
    assert.equal(result.status, 200);
    assert.equal(result.body.profile_id, 1);
  });

  it('requires the active profile context before setting a first PIN on an unlocked profile', async () => {
    let result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ name: 'Household 2', avatarEmoji: '🦊' }),
      })
    );
    assert.equal(result.status, 200);

    const profileId = result.body.id;

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/pin?profileId=1`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ newPin: '2468' }),
      })
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'PROFILE_PIN_AUTH_REQUIRED');

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/pin?profileId=${profileId}`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ newPin: '2468' }),
      })
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'PROFILE_PIN_AUTH_REQUIRED');

    const selection = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/select`, {
        method: 'POST',
        headers: withTrustedOrigin(),
      })
    );
    assert.equal(selection.status, 200);
    assert.ok(selection.body.activeProfileToken);

    const defaultSelection = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: withTrustedOrigin(),
      })
    );
    assert.equal(defaultSelection.status, 200);
    assert.ok(defaultSelection.body.activeProfileToken);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/pin?profileId=${profileId}`, {
        method: 'POST',
        headers: withTrustedOrigin({
          'content-type': 'application/json',
          'x-active-profile-token': selection.body.activeProfileToken,
        }),
        body: JSON.stringify({ newPin: '2468' }),
      })
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'PROFILE_PIN_AUTH_REQUIRED');

    const refreshedSelection = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/select`, {
        method: 'POST',
        headers: withTrustedOrigin(),
      })
    );
    assert.equal(refreshedSelection.status, 200);
    assert.ok(refreshedSelection.body.activeProfileToken);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/pin?profileId=${profileId}`, {
        method: 'POST',
        headers: withTrustedOrigin({
          'content-type': 'application/json',
          'x-active-profile-token': refreshedSelection.body.activeProfileToken,
        }),
        body: JSON.stringify({ newPin: '2468' }),
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.profile.id, profileId);
    assert.equal(result.body.profile.is_locked, true);
    assert.ok(result.body.unlockToken);
  });

  it('rejects profile-management requests from untrusted origins', async () => {
    const result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      })
    );

    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'UNTRUSTED_ORIGIN');
  });

  it('locks PIN entry behind a cooldown after repeated incorrect attempts', async () => {
    let result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ name: 'Cooldown Test', avatarEmoji: '🌟' }),
      })
    );
    assert.equal(result.status, 200);
    const profileId = result.body.id;

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/select`, {
        method: 'POST',
        headers: withTrustedOrigin(),
      })
    );
    assert.equal(result.status, 200);

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/pin?profileId=${profileId}`, {
        method: 'POST',
        headers: withTrustedOrigin({
          'content-type': 'application/json',
          'x-active-profile-token': result.body.activeProfileToken,
        }),
        body: JSON.stringify({ newPin: '1357' }),
      })
    );
    assert.equal(result.status, 200);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      result = await readJsonResponse(
        await fetch(`${baseUrl}/api/profiles/${profileId}/unlock`, {
          method: 'POST',
          headers: withTrustedOrigin({ 'content-type': 'application/json' }),
          body: JSON.stringify({ pin: '9999' }),
        })
      );

      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'INCORRECT_PIN');
      assert.equal(result.body.failedAttempts, attempt);
      assert.equal(result.body.remainingAttempts, 5 - attempt);
    }

    result = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/unlock`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pin: '9999' }),
      })
    );

    assert.equal(result.status, 429);
    assert.equal(result.body.code, 'PROFILE_PIN_COOLDOWN');
    assert.equal(result.body.failedAttempts, 5);
    assert.ok(result.body.retryAfterSeconds >= 1);

    const blockedCorrectPin = await readJsonResponse(
      await fetch(`${baseUrl}/api/profiles/${profileId}/unlock`, {
        method: 'POST',
        headers: withTrustedOrigin({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pin: '1357' }),
      })
    );

    assert.equal(blockedCorrectPin.status, 429);
    assert.equal(blockedCorrectPin.body.code, 'PROFILE_PIN_COOLDOWN');
  });
});
