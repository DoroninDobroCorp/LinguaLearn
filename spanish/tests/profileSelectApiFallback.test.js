import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonWithFallback } from '../src/utils/api.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('fetchJsonWithFallback', () => {
  it('falls back when the primary API returns HTML instead of JSON', async () => {
    const calls = [];

    global.fetch = async (input) => {
      calls.push(String(input));

      if (String(input).startsWith('/spanish/api/')) {
        return new Response('<!doctype html><html><body>Proxy error</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      return new Response(JSON.stringify({ profile: { id: 7 }, activeProfileToken: 'fallback-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await fetchJsonWithFallback('/spanish/api/profiles/7/select', '/api/profiles/7/select', {
      method: 'POST',
    });

    assert.deepEqual(calls, ['/spanish/api/profiles/7/select', '/api/profiles/7/select']);
    assert.equal(result.response.ok, true);
    assert.equal(result.data.profile.id, 7);
    assert.equal(result.data.activeProfileToken, 'fallback-token');
  });

  it('preserves a primary JSON error response without masking it via fallback', async () => {
    const calls = [];

    global.fetch = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ error: 'Profile is locked', code: 'PROFILE_LOCKED' }), {
        status: 423,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await fetchJsonWithFallback('/spanish/api/profiles/8/select', '/api/profiles/8/select', {
      method: 'POST',
    });

    assert.deepEqual(calls, ['/spanish/api/profiles/8/select']);
    assert.equal(result.response.status, 423);
    assert.equal(result.data.code, 'PROFILE_LOCKED');
    assert.equal(result.data.error, 'Profile is locked');
  });
});
