import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const android = join(root, 'android', 'LinguaLearn', 'app', 'src', 'main', 'java', 'com', 'factory', 'lingualearn');
const api = readFileSync(join(android, 'ime', 'net', 'ApiClient.kt'), 'utf8');
const service = readFileSync(join(android, 'ime', 'LinguaLearnIMEKeyboardService.kt'), 'utf8');
const queue = readFileSync(join(android, 'ime', 'queue', 'BackgroundSyncQueue.kt'), 'utf8');

describe('Android IME delivery safety', () => {
  it('allows enough time for model analysis and carries HTTP status into retry policy', () => {
    assert.match(api, /READ_TIMEOUT_MS = 60000/);
    assert.match(api, /statusCode !in 200\.\.299/);
    assert.match(api, /statusCode = statusCode/);
  });

  it('fails closed without a device token and keeps network work off the IME thread', () => {
    assert.doesNotMatch(service, /ll_dev_android_default_token/);
    assert.match(service, /Device token not configured/);
    assert.match(service, /serviceScope\.launch/);
    assert.match(service, /withContext\(Dispatchers\.IO\)/);
  });

  it('queues only transport failures and preserves their exact-once identity', () => {
    assert.doesNotMatch(service, /if \(!previewOnly && !response\.accepted\)/);
    assert.match(service, /eventId = eventId/);
    assert.match(service, /sentAt = sentAt/);
    assert.match(queue, /existing = currentQueue\.find \{ it\.eventId == eventId \}/);
    assert.match(queue, /eventId = item\.eventId/);
  });

  it('keeps exhausted or unconfigured durable items instead of reporting false delivery', () => {
    assert.match(queue, /Keep exhausted items for diagnostics\/manual retry/);
    assert.match(queue, /Missing runtime dependencies are not delivery/);
    assert.match(queue, /status in 200\.\.299/);
    assert.doesNotMatch(queue, /Default sync \/ mock behavior/);
  });
});
