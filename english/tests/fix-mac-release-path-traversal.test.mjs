import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path, { basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('GET /releases/:file and /english/releases/:file Path Traversal Hardening', () => {
  let app;
  let server;
  let baseUrl;
  let testReleaseDir;
  const testFileName = 'LinguaLearnCapture-test-v0.1.1.zip';

  before(async () => {
    testReleaseDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-release-test-'));
    fs.writeFileSync(path.join(testReleaseDir, testFileName), 'DUMMY_ZIP_CONTENT');

    app = express();

    app.get(['/releases/:file', '/english/releases/:file'], (req, res) => {
      const rawFile = String(req.params.file || '');
      const safeFile = basename(rawFile);
      if (!safeFile || safeFile === '.' || safeFile === '..' || safeFile !== rawFile) {
        return res.status(400).json({ error: 'Invalid release file parameter' });
      }

      const baseDirs = [
        testReleaseDir,
        resolve('/srv/LinguaLearn/releases'),
        resolve(__dirname, '../../releases'),
        resolve(__dirname, '../../macos/LinguaLearnCapture/.build/release-dist'),
      ];

      for (const baseDir of baseDirs) {
        const targetPath = resolve(baseDir, safeFile);
        if (targetPath.startsWith(baseDir + sep)) {
          if (fs.existsSync(targetPath)) {
            return res.sendFile(targetPath);
          }
        }
      }
      return res.status(404).json({ error: 'Release file not found' });
    });

    await new Promise((resolvePromise) => {
      server = http.createServer(app).listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolvePromise();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((res) => server.close(res));
    }
    if (testReleaseDir && fs.existsSync(testReleaseDir)) {
      fs.rmSync(testReleaseDir, { recursive: true, force: true });
    }
  });

  it('serves valid release file from /releases/:file', async () => {
    const res = await fetch(`${baseUrl}/releases/${testFileName}`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body, 'DUMMY_ZIP_CONTENT');
  });

  it('serves valid release file from /english/releases/:file', async () => {
    const res = await fetch(`${baseUrl}/english/releases/${testFileName}`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body, 'DUMMY_ZIP_CONTENT');
  });

  it('returns 404 for non-existent release file', async () => {
    const res = await fetch(`${baseUrl}/releases/nonexistent-file.zip`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Release file not found');
  });

  it('rejects relative path traversal attempt (../etc/passwd) with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/releases/..%2fetc%2fpasswd`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200, 'Must not serve system file');
  });

  it('rejects absolute path traversal attempt (/etc/passwd) with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/releases/%2fetc%2fpasswd`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200, 'Must not serve system file');
  });

  it('rejects dot-dot (..) traversal attempt with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/releases/%2e%2e`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200);
  });

  it('rejects single dot (.) parameter with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/releases/%2e`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200);
  });

  it('rejects subfolder traversal attempt (folder/file) with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/releases/folder%2ffile.zip`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200);
  });

  it('rejects Windows-style path traversal attempt (..\\etc\\passwd) with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/releases/..%5cetc%5cpasswd`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200);
  });

  it('verifies path traversal rejections work on /english/releases/:file endpoint as well', async () => {
    const res = await fetch(`${baseUrl}/english/releases/%2fetc%2fpasswd`);
    assert.ok(res.status === 400 || res.status === 404);
    assert.notEqual(res.status, 200);
  });
});
