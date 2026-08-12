import { createAuthMiddleware } from './auth.js';
import crypto from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { parseCookies } from './auth.js';
import { getOwnerId } from './dbMigration.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateDeviceToken() {
  return 'll_dev_' + crypto.randomBytes(32).toString('hex');
}

function safeBearerEquals(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createDeviceTokenService(db) {
  return {
    createToken({ userId, deviceName, appVersion }) {
      if (!userId) {
        throw new Error('userId is required');
      }
      const name = String(deviceName || '').trim();
      if (!name) {
        throw new Error('device_name is required');
      }

      const token = generateDeviceToken();
      const tokenHash = hashToken(token);
      const version = appVersion ? String(appVersion).trim() : null;

      const result = db.prepare(`
        INSERT INTO device_tokens (user_id, token_hash, device_name, app_version)
        VALUES (?, ?, ?, ?)
      `).run(userId, tokenHash, name, version);

      const tokenId = result.lastInsertRowid;
      const row = db.prepare('SELECT id, device_name, app_version, created_at FROM device_tokens WHERE id = ?').get(tokenId);

      return {
        id: row.id,
        token,
        device_name: row.device_name,
        app_version: row.app_version,
        created_at: row.created_at,
      };
    },

    revokeToken({ userId, tokenId }) {
      if (!userId || !tokenId) {
        throw new Error('userId and tokenId are required');
      }

      const row = db.prepare('SELECT id, user_id, revoked_at FROM device_tokens WHERE id = ? AND user_id = ?').get(tokenId, userId);
      if (!row) {
        return { success: false, reason: 'not_found' };
      }

      db.prepare(`
        UPDATE device_tokens
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(tokenId, userId);

      const updated = db.prepare('SELECT id, device_name, revoked_at FROM device_tokens WHERE id = ?').get(tokenId);
      return { success: true, token: updated };
    },

    listTokens(userId) {
      if (!userId) return [];
      return db.prepare(`
        SELECT id, device_name, app_version, last_used_at, revoked_at, created_at
        FROM device_tokens
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId);
    },

    authenticateDeviceToken(token) {
      if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'missing' };
      }

      const trimmedToken = token.trim();

      // Check legacy CAPTURE_API_TOKEN fallback
      const configuredLegacyToken = process.env.CAPTURE_API_TOKEN ? String(process.env.CAPTURE_API_TOKEN).trim() : '';
      if (configuredLegacyToken && safeBearerEquals(trimmedToken, configuredLegacyToken)) {
        const ownerId = getOwnerId(db);
        if (!ownerId) {
          return { valid: false, reason: 'no_owner_found' };
        }
        return {
          valid: true,
          isLegacy: true,
          userId: ownerId,
          user: { id: ownerId, role: 'owner' },
        };
      }

      // Check device token in DB
      const tokenHash = hashToken(trimmedToken);
      const row = db.prepare(`
        SELECT d.id, d.user_id, d.revoked_at, u.status, u.role, u.email
        FROM device_tokens d
        JOIN users u ON d.user_id = u.id
        WHERE d.token_hash = ?
      `).get(tokenHash);

      if (!row) {
        return { valid: false, reason: 'invalid' };
      }

      if (row.revoked_at !== null && row.revoked_at !== undefined) {
        return { valid: false, reason: 'revoked' };
      }

      if (row.status === 'deactivated') {
        return { valid: false, reason: 'deactivated' };
      }

      // Update last_used_at
      db.prepare(`
        UPDATE device_tokens
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(row.id);

      return {
        valid: true,
        isLegacy: false,
        userId: row.user_id,
        deviceTokenId: row.id,
        user: {
          id: row.user_id,
          email: row.email,
          role: row.role,
          status: row.status,
        },
      };
    },

    handleCreateToken(req, res) {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { device_name, deviceName, app_version, appVersion } = req.body || {};
      const name = String(device_name || deviceName || '').trim();
      const version = String(app_version || appVersion || '').trim() || null;

      if (!name) {
        return res.status(400).json({ error: 'device_name is required' });
      }

      try {
        const result = this.createToken({ userId, deviceName: name, appVersion: version });
        return res.status(201).json(result);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    },

    handleListTokens(req, res) {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const tokens = this.listTokens(userId);
      return res.status(200).json({ tokens });
    },

    handleRevokeToken(req, res) {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const tokenId = Number(req.params.id);
      if (!Number.isInteger(tokenId)) {
        return res.status(400).json({ error: 'Invalid token ID' });
      }

      const result = this.revokeToken({ userId, tokenId });
      if (!result.success) {
        return res.status(404).json({ error: 'Device token not found' });
      }

      return res.status(200).json({ message: 'Device token revoked', token: result.token });
    },
  };
}

export function createDeviceAuthMiddleware(db) {
  return createAuthMiddleware(db);
}
