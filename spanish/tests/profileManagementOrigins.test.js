import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testDbBasePath = path.join(__dirname, '.profile-management-origins');
const activeServers = new Set();

function cleanupDbFiles(dbPath) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
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

async function waitForServer(baseUrl, serverProcess, getOutput) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited before becoming ready:\n${getOutput()}`);
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

  throw new Error(`Timed out waiting for server readiness:\n${getOutput()}`);
}

async function readJsonResponse(response) {
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function startServer(envOverrides = {}) {
  const port = await getAvailablePort();
  const dbPath = `${testDbBasePath}-${port}.sqlite`;
  let serverOutput = '';

  cleanupDbFiles(dbPath);

  const serverProcess = spawn('node', ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      GEMINI_API_KEY: '',
      PORT: String(port),
      SPANISH_DB_PATH: dbPath,
      SPANISH_ALLOWED_ORIGINS: '',
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendServerOutput = (chunk) => {
    serverOutput += chunk.toString();
  };

  serverProcess.stdout.on('data', appendServerOutput);
  serverProcess.stderr.on('data', appendServerOutput);

  const server = {
    baseUrl: `http://127.0.0.1:${port}`,
    dbPath,
    process: serverProcess,
    getOutput: () => serverOutput,
  };

  activeServers.add(server);
  await waitForServer(server.baseUrl, serverProcess, server.getOutput);
  return server;
}

async function stopServer(server) {
  if (!server) {
    return;
  }

  activeServers.delete(server);

  if (server.process.exitCode === null) {
    server.process.kill('SIGTERM');
    await once(server.process, 'exit');
  }

  cleanupDbFiles(server.dbPath);
}

afterEach(async () => {
  await Promise.all([...activeServers].map((server) => stopServer(server)));
});

describe('Profile management trusted origins', () => {
  it('allows the default Vite dev-proxy origin without extra env configuration', async () => {
    const server = await startServer();

    const localhostResult = await readJsonResponse(
      await fetch(`${server.baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: { origin: 'http://localhost:5175' },
      }),
    );

    assert.equal(localhostResult.status, 200);
    assert.equal(localhostResult.body.profile.id, 1);
    assert.ok(localhostResult.body.activeProfileToken);

    const loopbackResult = await readJsonResponse(
      await fetch(`${server.baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:5175' },
      }),
    );

    assert.equal(loopbackResult.status, 200);
    assert.equal(loopbackResult.body.profile.id, 1);
    assert.ok(loopbackResult.body.activeProfileToken);
  });

  it('keeps production mode strict when no trusted origins are configured', async () => {
    const server = await startServer({ NODE_ENV: 'production' });

    const result = await readJsonResponse(
      await fetch(`${server.baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: { origin: 'http://localhost:5175' },
      }),
    );

    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'UNTRUSTED_ORIGIN');
  });

  it('accepts same-origin HTTPS requests forwarded by a trusted reverse proxy', async () => {
    const server = await startServer({ NODE_ENV: 'production' });

    const result = await readJsonResponse(
      await fetch(`${server.baseUrl}/api/profiles/1/select`, {
        method: 'POST',
        headers: {
          host: 'internal-proxy.local',
          origin: 'https://spanish.example.com',
          'x-forwarded-host': 'spanish.example.com',
          'x-forwarded-proto': 'https',
        },
      }),
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.profile.id, 1);
    assert.ok(result.body.activeProfileToken);
  });
});
