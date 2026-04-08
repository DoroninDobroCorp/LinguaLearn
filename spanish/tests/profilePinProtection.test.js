import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import {
  buildProfilePinSession,
  clearProfilePin,
  createActiveProfileToken,
  ensureActiveProfileSessionSchema,
  createProfileUnlockToken,
  ensureProfilePinSchema,
  ensureProfilePinTokenSecret,
  isProfileLocked,
  ProfilePinError,
  sanitizeProfile,
  setProfilePin,
  verifyProfilePinAccess,
  verifyActiveProfileToken,
  verifyProfilePin,
  verifyProfileUnlockToken,
} from '../server/profilePin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '👤',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO profiles (id, name, avatar_emoji) VALUES (1, 'Default', '👤');
    INSERT INTO profiles (id, name, avatar_emoji) VALUES (2, 'Alice', '👧');
  `);

  ensureProfilePinSchema(db);
  ensureActiveProfileSessionSchema(db);
  ensureProfilePinSchema(db);
  return db;
}

describe('Profile PIN protection', () => {
  it('sets, verifies, unlocks and clears a profile PIN', () => {
    const db = createTestDb();
    const now = new Date('2030-05-01T12:00:00.000Z');

    const lockedProfile = setProfilePin(db, 2, '1234', null, now);
    assert.equal(isProfileLocked(lockedProfile), true);
    assert.equal(sanitizeProfile(lockedProfile).is_locked, true);
    assert.equal(verifyProfilePin(lockedProfile, '1234'), true);

    const unlockToken = createProfileUnlockToken(lockedProfile, 'test-secret', { now });
    assert.equal(verifyProfileUnlockToken(lockedProfile, unlockToken, 'test-secret', now), true);
    assert.equal(
      verifyProfileUnlockToken(lockedProfile, unlockToken, 'test-secret', new Date('2030-05-02T12:00:00.000Z')),
      false,
    );

    const clearedProfile = clearProfilePin(db, 2, '1234');
    assert.equal(isProfileLocked(clearedProfile), false);
    assert.equal(sanitizeProfile(clearedProfile).is_locked, false);

    db.close();
  });

  it('requires the current PIN before changing an existing profile PIN', () => {
    const db = createTestDb();
    setProfilePin(db, 2, '1234');

    assert.throws(
      () => setProfilePin(db, 2, '5678', '0000'),
      {
        message: 'Incorrect PIN',
        status: 403,
        code: 'INCORRECT_PIN',
      },
    );

    const updatedProfile = setProfilePin(db, 2, '5678', '1234');
    assert.equal(verifyProfilePin(updatedProfile, '5678'), true);

    db.close();
  });

  it('returns a fresh unlock token after changing a profile PIN', () => {
    const db = createTestDb();
    const now = new Date('2030-05-01T12:00:00.000Z');

    setProfilePin(db, 2, '1234', null, now);
    const updatedProfile = setProfilePin(db, 2, '5678', '1234', now);
    const session = buildProfilePinSession(updatedProfile, 'test-secret', {
      now,
      trustedOrigin: 'http://localhost:5175',
    });

    assert.equal(session.profile.is_locked, true);
    assert.ok(session.unlockToken);
    assert.ok(session.activeProfileToken);
    assert.equal(
      verifyProfileUnlockToken(updatedProfile, session.unlockToken, 'test-secret', now),
      true,
    );
    assert.equal(
      verifyActiveProfileToken(updatedProfile, session.activeProfileToken, 'test-secret', now, 'http://localhost:5175'),
      true,
    );

    db.close();
  });

  it('creates active-profile tokens that are scoped to the selected profile', () => {
    const db = createTestDb();
    const now = new Date('2030-05-01T12:00:00.000Z');
    const alice = db.prepare('SELECT * FROM profiles WHERE id = 2').get();
    const defaultProfile = db.prepare('SELECT * FROM profiles WHERE id = 1').get();
    const sessionNonce = 'current-selection';

    const activeToken = createActiveProfileToken(alice, 'test-secret', {
      now,
      trustedOrigin: 'http://localhost:5175',
      sessionNonce,
    });

    assert.equal(
      verifyActiveProfileToken(alice, activeToken, 'test-secret', now, 'http://localhost:5175', sessionNonce),
      true,
    );
    assert.equal(verifyActiveProfileToken(alice, activeToken, 'test-secret', now, 'http://evil.example'), false);
    assert.equal(verifyActiveProfileToken(defaultProfile, activeToken, 'test-secret', now, 'http://localhost:5175'), false);
    assert.equal(
      verifyActiveProfileToken(alice, activeToken, 'test-secret', now, 'http://localhost:5175', 'stale-selection'),
      false,
    );
    assert.equal(
      verifyActiveProfileToken(
        alice,
        activeToken,
        'test-secret',
        new Date('2030-05-02T12:00:00.000Z'),
        'http://localhost:5175',
        sessionNonce,
      ),
      false,
    );

    db.close();
  });

  it('locks profile PIN verification behind a cooldown after repeated failures', () => {
    const db = createTestDb();
    const now = new Date('2030-05-01T12:00:00.000Z');
    setProfilePin(db, 2, '1234', null, now);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      assert.throws(
        () => verifyProfilePinAccess(db, 2, '9999', new Date(now.getTime() + attempt * 1000)),
        (error) => error instanceof ProfilePinError
          && error.status === 403
          && error.code === 'INCORRECT_PIN'
          && error.details?.failedAttempts === attempt
          && error.details?.remainingAttempts === 5 - attempt,
      );
    }

    assert.throws(
      () => verifyProfilePinAccess(db, 2, '9999', new Date(now.getTime() + 5000)),
      (error) => error instanceof ProfilePinError
        && error.status === 429
        && error.code === 'PROFILE_PIN_COOLDOWN'
        && error.details?.failedAttempts === 5
        && error.details?.retryAfterSeconds > 0,
    );

    assert.throws(
      () => verifyProfilePinAccess(db, 2, '1234', new Date(now.getTime() + 6000)),
      (error) => error instanceof ProfilePinError
        && error.status === 429
        && error.code === 'PROFILE_PIN_COOLDOWN',
    );

    const unlockedProfile = verifyProfilePinAccess(db, 2, '1234', new Date(now.getTime() + (15 * 60 * 1000) + 6000));
    assert.equal(unlockedProfile.id, 2);

    db.close();
  });

  it('persists the generated unlock secret when no env var is configured', () => {
    const dbPath = path.join(__dirname, '.profile-pin-secret.sqlite');
    fs.rmSync(dbPath, { force: true });

    try {
      const firstDb = new Database(dbPath);
      const firstSecret = ensureProfilePinTokenSecret(firstDb);
      firstDb.close();

      const secondDb = new Database(dbPath);
      const secondSecret = ensureProfilePinTokenSecret(secondDb);
      const envOverrideSecret = ensureProfilePinTokenSecret(secondDb, 'override-secret');
      secondDb.close();

      assert.equal(firstSecret, secondSecret);
      assert.equal(envOverrideSecret, 'override-secret');
    } finally {
      fs.rmSync(dbPath, { force: true });
    }
  });
});
