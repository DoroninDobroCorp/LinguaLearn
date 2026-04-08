import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.join(__dirname, '.vocabulary-import-route-limit.sqlite');

let baseUrl = '';
let serverProcess = null;
let serverOutput = '';

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

function sendJson(pathname, payload) {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode ?? 0,
          body: responseBody ? JSON.parse(responseBody) : null,
        });
      });
    });

    request.on('error', reject);
    request.end(body);
  });
}

function createLargeVocabularyArchive(minimumBytes, maximumBytes = Number.POSITIVE_INFINITY) {
  const exportedAt = '2030-06-04T09:00:00.000Z';
  const entries = [];
  const repeatedSentence = 'La restauración conserva el contexto de estudio y las notas detalladas. ';

  while (true) {
    const entryNumber = entries.length + 1;
    entries.push({
      word: `palabra-${entryNumber}`,
      translation: `translation-${entryNumber}`,
      example: `${repeatedSentence.repeat(8)}Entrada ${entryNumber}.`,
      created_at: exportedAt,
      cards: {},
    });

    const payload = {
      format: 'lingualearn-spanish-vocabulary',
      version: 1,
      exported_at: exportedAt,
      profile: { id: 1, name: 'Default', avatar_emoji: '👤' },
      stats: {},
      entries,
    };

    const payloadBytes = Buffer.byteLength(JSON.stringify(payload));
    if (payloadBytes > minimumBytes) {
      if (payloadBytes > maximumBytes) {
        throw new Error(`Generated payload ${payloadBytes} bytes, which exceeds the requested maximum of ${maximumBytes} bytes`);
      }
      return { payload, payloadBytes };
    }
  }
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

describe('Vocabulary import route body limit', () => {
  it('accepts realistic exported archives that exceed the previous 512kb cap', async () => {
    const { payload, payloadBytes } = createLargeVocabularyArchive(640 * 1024);
    assert.ok(payloadBytes > 512 * 1024, `Expected payload to exceed 512kb, got ${payloadBytes} bytes`);
    assert.ok(payloadBytes < 2 * 1024 * 1024, `Expected payload to stay below 2mb, got ${payloadBytes} bytes`);

    const response = await fetch(`${baseUrl}/api/vocabulary/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.summary.created_entries, payload.entries.length);
    assert.equal(body.summary.merged_entries, 0);
    assert.equal(body.stats.total_entries, payload.entries.length);
  });

  it('rejects oversized imports with a bounded JSON error', async () => {
    const { payload, payloadBytes } = createLargeVocabularyArchive(
      (2 * 1024 * 1024) + 1,
      2176 * 1024,
    );
    assert.ok(payloadBytes > 2 * 1024 * 1024, `Expected payload to exceed 2mb, got ${payloadBytes} bytes`);

    const response = await sendJson('/api/vocabulary/import', payload);

    assert.equal(response.status, 413, JSON.stringify(response.body));
    assert.equal(response.body.code, 'VOCABULARY_IMPORT_TOO_LARGE');
  });
});
