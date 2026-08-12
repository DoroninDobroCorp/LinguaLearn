import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testDbPath = path.join(projectRoot, 'server', 'english_learning_test.db');
const adminScript = path.join(projectRoot, 'server', 'scripts', 'admin.js');

describe('Admin CLI & Auth Tables Integration Tests', () => {
  let db;

  beforeEach(() => {
    // Clean up test DB if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (e) {}
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
  });

  it('verifies DB schema includes users, beta_invites, and sessions tables', async () => {
    // Run bootstrap-owner to trigger schema creation
    const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
    execSync(`node "${adminScript}" bootstrap-owner --email=owner@test.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

    db = new Database(testDbPath);

    // Verify users table schema
    const usersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    assert.ok(usersTable, 'users table must exist');

    const usersCols = db.prepare("PRAGMA table_info(users)").all();
    const colNames = usersCols.map(c => c.name);
    assert.ok(colNames.includes('id'), 'users table missing id');
    assert.ok(colNames.includes('email'), 'users table missing email');
    assert.ok(colNames.includes('password_hash'), 'users table missing password_hash');
    assert.ok(colNames.includes('role'), 'users table missing role');
    assert.ok(colNames.includes('status'), 'users table missing status');
    assert.ok(colNames.includes('cefr_level'), 'users table missing cefr_level');

    // Verify beta_invites table schema
    const invitesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='beta_invites'").get();
    assert.ok(invitesTable, 'beta_invites table must exist');

    const invitesCols = db.prepare("PRAGMA table_info(beta_invites)").all().map(c => c.name);
    assert.ok(invitesCols.includes('id'), 'beta_invites table missing id');
    assert.ok(invitesCols.includes('code'), 'beta_invites table missing code');
    assert.ok(invitesCols.includes('created_by'), 'beta_invites table missing created_by');
    assert.ok(invitesCols.includes('used_by'), 'beta_invites table missing used_by');
    assert.ok(invitesCols.includes('used_at'), 'beta_invites table missing used_at');
    assert.ok(invitesCols.includes('expires_at'), 'beta_invites table missing expires_at');

    // Verify sessions table schema
    const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    assert.ok(sessionsTable, 'sessions table must exist');

    const sessionsCols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
    assert.ok(sessionsCols.includes('id'), 'sessions table missing id');
    assert.ok(sessionsCols.includes('user_id'), 'sessions table missing user_id');
    assert.ok(sessionsCols.includes('expires_at'), 'sessions table missing expires_at');
  });

  it('bootstrap-owner creates initial owner user with role = owner (VAL-AUTH-010)', () => {
    const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
    const output = execSync(`node "${adminScript}" bootstrap-owner --email=owner@lingualearn.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

    assert.match(output, /Owner user created/i);

    db = new Database(testDbPath);
    const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get();
    assert.ok(owner, 'Owner record must exist in users table');
    assert.equal(owner.email, 'owner@lingualearn.com');
    assert.equal(owner.role, 'owner');
    assert.equal(owner.status, 'active');
    assert.ok(bcrypt.compareSync('OwnerPassword123!', owner.password_hash), 'password_hash must match password');

    // Re-running bootstrap-owner must be idempotent and report owner exists
    const rerunOutput = execSync(`node "${adminScript}" bootstrap-owner --email=owner@lingualearn.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });
    assert.match(rerunOutput, /already exists/i);
  });

  it('create-invite creates a unique unused invite code (VAL-AUTH-011)', () => {
    const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
    // Bootstrap owner first
    execSync(`node "${adminScript}" bootstrap-owner --email=owner@test.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

    const output = execSync(`node "${adminScript}" create-invite`, { env, encoding: 'utf8' });
    assert.match(output, /Invite code created/i);

    db = new Database(testDbPath);
    const invite = db.prepare("SELECT * FROM beta_invites LIMIT 1").get();
    assert.ok(invite, 'Invite row must be created in beta_invites');
    assert.ok(invite.code && invite.code.length > 5, 'Invite code must be non-empty string');
    assert.equal(invite.used_by, null, 'New invite must not be used');
    assert.equal(invite.used_at, null, 'New invite must have null used_at');
  });

  it('deactivate-user sets user status = deactivated and purges active sessions (VAL-AUTH-013)', () => {
    const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
    // Bootstrap owner
    execSync(`node "${adminScript}" bootstrap-owner --email=owner@test.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

    db = new Database(testDbPath);
    // Insert test user and sessions
    const hash = bcrypt.hashSync('UserPassword123!', 10);
    const res = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'user', 'active')").run('target_user@test.com', hash);
    const userId = res.lastInsertRowid;

    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run('sess_abc_123', userId, '2099-01-01T00:00:00.000Z');
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run('sess_xyz_789', userId, '2099-01-01T00:00:00.000Z');
    db.close();
    db = null;

    const output = execSync(`node "${adminScript}" deactivate-user --email=target_user@test.com`, { env, encoding: 'utf8' });
    assert.match(output, /deactivated/i);

    db = new Database(testDbPath);
    const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    assert.equal(updatedUser.status, 'deactivated', 'User status must be deactivated');

    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ?").all(userId);
    assert.equal(sessions.length, 0, 'Active sessions must be purged');
  });

  it('reset-password updates password_hash and purges active sessions (VAL-AUTH-012)', () => {
    const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
    // Bootstrap owner
    execSync(`node "${adminScript}" bootstrap-owner --email=owner@test.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

    db = new Database(testDbPath);
    // Insert test user and session
    const oldHash = bcrypt.hashSync('OldPassword123!', 10);
    const res = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'user', 'active')").run('reset_user@test.com', oldHash);
    const userId = res.lastInsertRowid;

    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run('sess_reset_123', userId, '2099-01-01T00:00:00.000Z');
    db.close();
    db = null;

    const output = execSync(`node "${adminScript}" reset-password --email=reset_user@test.com --password=BrandNewPassword456!`, { env, encoding: 'utf8' });
    assert.match(output, /password reset/i);

    db = new Database(testDbPath);
    const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    assert.ok(bcrypt.compareSync('BrandNewPassword456!', updatedUser.password_hash), 'New password must match updated password_hash');
    assert.ok(!bcrypt.compareSync('OldPassword123!', updatedUser.password_hash), 'Old password must no longer match');

    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ?").all(userId);
    assert.equal(sessions.length, 0, 'Active sessions must be purged');
  });

  it('list-users outputs formatted user table without exposing password hashes or tokens (VAL-ADM-001)', () => {
    const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
    // Bootstrap owner
    execSync(`node "${adminScript}" bootstrap-owner --email=owner@test.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

    db = new Database(testDbPath);
    const hash = bcrypt.hashSync('UserPassword123!', 10);
    db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'user', 'active')").run('member@test.com', hash);
    db.close();
    db = null;

    const output = execSync(`node "${adminScript}" list-users`, { env, encoding: 'utf8' });
    assert.match(output, /owner@test.com/);
    assert.match(output, /member@test.com/);

    // Ensure password_hash is strictly redacted/absent from output
    assert.doesNotMatch(output, new RegExp(hash.replace(/\$/g, '\\$')));
    assert.doesNotMatch(output, /password_hash/i);
    assert.doesNotMatch(output, /OwnerPassword123!/);
  });
});
