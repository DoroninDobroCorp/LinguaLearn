import crypto from 'node:crypto';

export const PROFILE_PIN_MIN_LENGTH = 4;
export const PROFILE_PIN_MAX_LENGTH = 8;
export const PROFILE_UNLOCK_TOKEN_HEADER = 'x-profile-pin-token';
export const ACTIVE_PROFILE_TOKEN_HEADER = 'x-active-profile-token';
export const PROFILE_UNLOCK_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
export const PROFILE_PIN_MAX_FAILED_ATTEMPTS = 5;
export const PROFILE_PIN_COOLDOWN_MS = 1000 * 60 * 15;
const PROFILE_PIN_TOKEN_SECRET_KEY = 'profile_pin_token_secret';

const PROFILE_PIN_COLUMNS = [
  { name: 'pin_hash', sql: 'ALTER TABLE profiles ADD COLUMN pin_hash TEXT' },
  { name: 'pin_salt', sql: 'ALTER TABLE profiles ADD COLUMN pin_salt TEXT' },
  { name: 'pin_updated_at', sql: 'ALTER TABLE profiles ADD COLUMN pin_updated_at TEXT' },
  { name: 'pin_failed_attempts', sql: 'ALTER TABLE profiles ADD COLUMN pin_failed_attempts INTEGER NOT NULL DEFAULT 0' },
  { name: 'pin_locked_until', sql: 'ALTER TABLE profiles ADD COLUMN pin_locked_until TEXT' },
];

export class ProfilePinError extends Error {
  constructor(status, message, code = 'PROFILE_PIN_ERROR', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function hasNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function normalizeTrustedOrigin(value) {
  if (!hasNonEmptyText(value)) {
    return '';
  }

  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function safeStringEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signUnlockPayload(encodedPayload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

function verifySignedPayload(token, secret) {
  if (!hasNonEmptyText(token)) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signUnlockPayload(encodedPayload, secret);
  if (!safeStringEqual(expectedSignature, signature)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
}

function getProfilePinFingerprint(profile) {
  return crypto
    .createHash('sha256')
    .update(`${profile.pin_hash || ''}:${profile.pin_salt || ''}`)
    .digest('hex')
    .slice(0, 24);
}

function parseProfileTimestamp(value) {
  if (!hasNonEmptyText(value)) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp);
}

function getProfilePinFailedAttempts(profile) {
  const attempts = Number.parseInt(String(profile?.pin_failed_attempts ?? '0'), 10);
  return Number.isFinite(attempts) && attempts > 0 ? attempts : 0;
}

function clearProfilePinAttemptState(db, profileId) {
  db.prepare(`
    UPDATE profiles
    SET pin_failed_attempts = 0,
        pin_locked_until = NULL
    WHERE id = ?
  `).run(profileId);
}

function setProfilePinAttemptState(db, profileId, failedAttempts, lockedUntil = null) {
  db.prepare(`
    UPDATE profiles
    SET pin_failed_attempts = ?,
        pin_locked_until = ?
    WHERE id = ?
  `).run(failedAttempts, lockedUntil, profileId);
}

function buildPinCooldownMessage(retryAfterSeconds) {
  const roundedSeconds = Math.max(1, retryAfterSeconds);
  return `Too many incorrect PIN attempts. Try again in ${roundedSeconds} seconds.`;
}

export function getProfilePinChallengeState(profile, now = new Date()) {
  const lockedUntil = parseProfileTimestamp(profile?.pin_locked_until);
  const failedAttempts = getProfilePinFailedAttempts(profile);
  const retryAfterSeconds = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000))
    : 0;

  return {
    failedAttempts,
    isCoolingDown: retryAfterSeconds > 0,
    retryAfterSeconds,
    lockedUntil: lockedUntil?.toISOString() ?? null,
    remainingAttempts: Math.max(PROFILE_PIN_MAX_FAILED_ATTEMPTS - failedAttempts, 0),
  };
}

export function verifyProfilePinAccess(db, profileId, pin, now = new Date()) {
  let profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
  if (!profile) {
    throw new ProfilePinError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
  }

  if (!isProfileLocked(profile)) {
    throw new ProfilePinError(409, 'This profile does not have a PIN set', 'PIN_NOT_SET');
  }

  const existingState = getProfilePinChallengeState(profile, now);
  if (!existingState.isCoolingDown && existingState.lockedUntil) {
    clearProfilePinAttemptState(db, profileId);
    profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
  }

  const state = getProfilePinChallengeState(profile, now);
  if (state.isCoolingDown) {
    throw new ProfilePinError(
      429,
      buildPinCooldownMessage(state.retryAfterSeconds),
      'PROFILE_PIN_COOLDOWN',
      {
        retryAfterSeconds: state.retryAfterSeconds,
        lockedUntil: state.lockedUntil,
        failedAttempts: state.failedAttempts,
        maxFailedAttempts: PROFILE_PIN_MAX_FAILED_ATTEMPTS,
      },
    );
  }

  try {
    verifyProfilePin(profile, pin);
    if (state.failedAttempts > 0 || state.lockedUntil) {
      clearProfilePinAttemptState(db, profileId);
      profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
    }
    return profile;
  } catch (error) {
    if (error?.code !== 'INCORRECT_PIN') {
      throw error;
    }

    const failedAttempts = state.failedAttempts + 1;
    if (failedAttempts >= PROFILE_PIN_MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + PROFILE_PIN_COOLDOWN_MS).toISOString();
      setProfilePinAttemptState(db, profileId, failedAttempts, lockedUntil);
      const cooldownState = getProfilePinChallengeState(
        db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId),
        now,
      );

      throw new ProfilePinError(
        429,
        buildPinCooldownMessage(cooldownState.retryAfterSeconds),
        'PROFILE_PIN_COOLDOWN',
        {
          retryAfterSeconds: cooldownState.retryAfterSeconds,
          lockedUntil: cooldownState.lockedUntil,
          failedAttempts: failedAttempts,
          maxFailedAttempts: PROFILE_PIN_MAX_FAILED_ATTEMPTS,
        },
      );
    }

    setProfilePinAttemptState(db, profileId, failedAttempts, null);
    const remainingAttempts = PROFILE_PIN_MAX_FAILED_ATTEMPTS - failedAttempts;
    throw new ProfilePinError(
      403,
      `Incorrect PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before a 15-minute cooldown.`,
      'INCORRECT_PIN',
      {
        failedAttempts,
        remainingAttempts,
        maxFailedAttempts: PROFILE_PIN_MAX_FAILED_ATTEMPTS,
      },
    );
  }
}

export function ensureProfilePinSchema(db) {
  for (const column of PROFILE_PIN_COLUMNS) {
    try {
      db.prepare(`SELECT ${column.name} FROM profiles LIMIT 1`).get();
    } catch {
      db.exec(column.sql);
    }
  }
}

export function ensureActiveProfileSessionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_profile_sessions (
      origin TEXT PRIMARY KEY,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      session_nonce TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function ensureProfilePinTokenSecret(db, envSecret = '') {
  const normalizedEnvSecret = typeof envSecret === 'string' ? envSecret.trim() : '';
  if (normalizedEnvSecret) {
    return normalizedEnvSecret;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existing = db.prepare('SELECT value FROM app_secrets WHERE key = ?').get(PROFILE_PIN_TOKEN_SECRET_KEY);
  if (hasNonEmptyText(existing?.value)) {
    return existing.value;
  }

  const generatedSecret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT OR IGNORE INTO app_secrets (key, value) VALUES (?, ?)').run(
    PROFILE_PIN_TOKEN_SECRET_KEY,
    generatedSecret,
  );

  return db.prepare('SELECT value FROM app_secrets WHERE key = ?').get(PROFILE_PIN_TOKEN_SECRET_KEY).value;
}

export function sanitizeProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    avatar_emoji: profile.avatar_emoji,
    created_at: profile.created_at,
    is_locked: isProfileLocked(profile),
    pin_updated_at: profile.pin_updated_at ?? null,
  };
}

export function isProfileLocked(profile) {
  return hasNonEmptyText(profile?.pin_hash) && hasNonEmptyText(profile?.pin_salt);
}

export function normalizePin(pin, { fieldName = 'pin', required = true } = {}) {
  if (pin === undefined || pin === null || pin === '') {
    if (required) {
      throw new ProfilePinError(400, `${fieldName} is required`, 'PIN_REQUIRED');
    }
    return null;
  }

  const normalized = typeof pin === 'number' && Number.isInteger(pin)
    ? String(pin)
    : typeof pin === 'string'
      ? pin.trim()
      : '';

  if (!new RegExp(`^\\d{${PROFILE_PIN_MIN_LENGTH},${PROFILE_PIN_MAX_LENGTH}}$`).test(normalized)) {
    throw new ProfilePinError(
      400,
      `${fieldName} must be ${PROFILE_PIN_MIN_LENGTH}-${PROFILE_PIN_MAX_LENGTH} digits`,
      'INVALID_PIN_FORMAT',
    );
  }

  return normalized;
}

function buildPinHash(pin, salt) {
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

export function verifyProfilePin(profile, pin) {
  if (!profile) {
    throw new ProfilePinError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
  }

  if (!isProfileLocked(profile)) {
    throw new ProfilePinError(409, 'This profile does not have a PIN set', 'PIN_NOT_SET');
  }

  const normalizedPin = normalizePin(pin);
  const expectedHash = buildPinHash(normalizedPin, profile.pin_salt);
  if (!safeStringEqual(expectedHash, profile.pin_hash)) {
    throw new ProfilePinError(403, 'Incorrect PIN', 'INCORRECT_PIN');
  }

  return true;
}

export function createProfileUnlockToken(
  profile,
  secret,
  {
    now = new Date(),
    ttlMs = PROFILE_UNLOCK_TOKEN_TTL_MS,
  } = {},
) {
  if (!isProfileLocked(profile)) {
    return null;
  }

  const payload = {
    profileId: profile.id,
    fingerprint: getProfilePinFingerprint(profile),
    exp: now.getTime() + ttlMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signUnlockPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function createActiveProfileToken(
  profile,
  secret,
  {
    now = new Date(),
    ttlMs = PROFILE_UNLOCK_TOKEN_TTL_MS,
    trustedOrigin = '',
    sessionNonce = '',
  } = {},
) {
  if (!profile?.id) {
    return null;
  }

  const payload = {
    type: 'active-profile',
    profileId: profile.id,
    origin: normalizeTrustedOrigin(trustedOrigin) || null,
    sessionNonce: hasNonEmptyText(sessionNonce) ? sessionNonce : null,
    exp: now.getTime() + ttlMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signUnlockPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyProfileUnlockToken(profile, token, secret, now = new Date()) {
  if (!isProfileLocked(profile)) {
    return true;
  }

  const payload = verifySignedPayload(token, secret);
  if (!payload) {
    return false;
  }

  if (payload.profileId !== profile.id) {
    return false;
  }

  if (!Number.isFinite(payload.exp) || payload.exp <= now.getTime()) {
    return false;
  }

  return safeStringEqual(payload.fingerprint, getProfilePinFingerprint(profile));
}

export function verifyActiveProfileToken(
  profile,
  token,
  secret,
  now = new Date(),
  trustedOrigin = '',
  requiredSessionNonce = '',
) {
  const payload = verifySignedPayload(token, secret);
  if (!payload) {
    return false;
  }

  const normalizedTrustedOrigin = normalizeTrustedOrigin(trustedOrigin);

  return payload.type === 'active-profile'
    && payload.profileId === profile.id
    && Number.isFinite(payload.exp)
    && payload.exp > now.getTime()
    && safeStringEqual(payload.origin || '', normalizedTrustedOrigin)
    && safeStringEqual(payload.sessionNonce || '', requiredSessionNonce);
}

export function getActiveProfileSession(db, trustedOrigin) {
  const normalizedOrigin = normalizeTrustedOrigin(trustedOrigin);
  if (!normalizedOrigin) {
    return null;
  }

  return db.prepare(`
    SELECT origin, profile_id, session_nonce, updated_at
    FROM active_profile_sessions
    WHERE origin = ?
  `).get(normalizedOrigin) ?? null;
}

export function rotateActiveProfileSession(db, profileId, trustedOrigin, now = new Date()) {
  const normalizedOrigin = normalizeTrustedOrigin(trustedOrigin);
  if (!normalizedOrigin || !Number.isInteger(profileId) || profileId <= 0) {
    return null;
  }

  const sessionNonce = crypto.randomBytes(16).toString('hex');
  const updatedAt = now.toISOString();
  db.prepare(`
    INSERT INTO active_profile_sessions (origin, profile_id, session_nonce, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(origin) DO UPDATE SET
      profile_id = excluded.profile_id,
      session_nonce = excluded.session_nonce,
      updated_at = excluded.updated_at
  `).run(normalizedOrigin, profileId, sessionNonce, updatedAt);

  return {
    origin: normalizedOrigin,
    profile_id: profileId,
    session_nonce: sessionNonce,
    updated_at: updatedAt,
  };
}

export function setProfilePin(
  db,
  profileId,
  newPin,
  currentPin,
  now = new Date(),
  { skipCurrentPinVerification = false } = {},
) {
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
  if (!profile) {
    throw new ProfilePinError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
  }

  if (isProfileLocked(profile) && !skipCurrentPinVerification) {
    verifyProfilePin(profile, currentPin);
  }

  const normalizedPin = normalizePin(newPin, { fieldName: 'newPin' });
  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = buildPinHash(normalizedPin, salt);
  const updatedAt = now.toISOString();

  db.prepare(`
    UPDATE profiles
    SET pin_hash = ?,
        pin_salt = ?,
        pin_updated_at = ?,
        pin_failed_attempts = 0,
        pin_locked_until = NULL
    WHERE id = ?
  `).run(pinHash, salt, updatedAt, profileId);

  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
}

export function clearProfilePin(db, profileId, currentPin, { skipCurrentPinVerification = false } = {}) {
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
  if (!profile) {
    throw new ProfilePinError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
  }

  if (!skipCurrentPinVerification) {
    verifyProfilePin(profile, currentPin);
  }

  db.prepare(`
    UPDATE profiles
    SET pin_hash = NULL,
        pin_salt = NULL,
        pin_updated_at = NULL,
        pin_failed_attempts = 0,
        pin_locked_until = NULL
    WHERE id = ?
  `).run(profileId);

  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
}

export function buildProfilePinSession(profile, secret, options) {
  return {
    profile: sanitizeProfile(profile),
    unlockToken: createProfileUnlockToken(profile, secret, options),
    activeProfileToken: createActiveProfileToken(profile, secret, options),
  };
}
