import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

export function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

export class LoginRateLimiter {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 10;
    this.windowMs = options.windowMs || 15 * 60 * 1000;
    this.attempts = new Map();
  }

  isLimited(ip) {
    const record = this.attempts.get(ip);
    if (!record) return { limited: false };
    const now = Date.now();
    if (now - record.firstAttemptTime > this.windowMs) {
      this.attempts.delete(ip);
      return { limited: false };
    }
    if (record.count >= this.maxAttempts) {
      const retryAfterSeconds = Math.ceil((record.firstAttemptTime + this.windowMs - now) / 1000);
      return { limited: true, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }
    return { limited: false };
  }

  recordFailed(ip) {
    const now = Date.now();
    const record = this.attempts.get(ip);
    if (!record || (now - record.firstAttemptTime > this.windowMs)) {
      this.attempts.set(ip, { count: 1, firstAttemptTime: now });
    } else {
      record.count += 1;
    }
  }

  reset(ip) {
    this.attempts.delete(ip);
  }
}

const defaultRateLimiter = new LoginRateLimiter();

export function createAuthService(db, options = {}) {
  const rateLimiter = options.rateLimiter || defaultRateLimiter;

  function createSession(userId, durationDays = 30) {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
    return { sessionId, expiresAt };
  }

  function getSessionUser(sessionId) {
    if (!sessionId) return { user: null, reason: 'missing' };
    const session = db.prepare('SELECT id, user_id, expires_at FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return { user: null, reason: 'invalid' };

    const expiresAtMs = new Date(session.expires_at).getTime();
    if (isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return { user: null, reason: 'expired' };
    }

    const user = db.prepare('SELECT id, email, role, status, cefr_level FROM users WHERE id = ?').get(session.user_id);
    if (!user) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return { user: null, reason: 'invalid' };
    }

    if (user.status === 'deactivated') {
      return { user: null, status: 'deactivated', reason: 'deactivated' };
    }

    return { user, session };
  }

  function setSessionCookie(res, sessionId) {
    const isProd = process.env.NODE_ENV === 'production';
    const secureFlag = isProd ? '; Secure' : '';
    const cookie = `lingua_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`;
    res.setHeader('Set-Cookie', cookie);
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', 'lingua_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }

  return {
    rateLimiter,
    createSession,
    getSessionUser,
    setSessionCookie,
    clearSessionCookie,

    async signup(req, res) {
      const { email, password, invite_code, inviteCode, code } = req.body || {};
      const actualCode = String(invite_code || inviteCode || code || '').trim().toUpperCase();
      const rawEmail = String(email || '').trim().toLowerCase();
      const rawPassword = String(password || '');

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!rawEmail || !emailRegex.test(rawEmail) || !rawPassword || rawPassword.length < 8) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      if (!actualCode) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }

      const invite = db.prepare('SELECT id, code, used_by, expires_at FROM beta_invites WHERE code = ?').get(actualCode);
      if (!invite) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }

      if (invite.used_by !== null && invite.used_by !== undefined) {
        return res.status(400).json({ error: 'Invite code already used' });
      }

      if (invite.expires_at) {
        const expTime = new Date(invite.expires_at).getTime();
        if (!isNaN(expTime) && expTime < Date.now()) {
          return res.status(400).json({ error: 'Invite code expired' });
        }
      }

      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(rawEmail);
      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = bcrypt.hashSync(rawPassword, 10);
      const result = db.prepare(`
        INSERT INTO users (email, password_hash, role, status, cefr_level)
        VALUES (?, ?, 'user', 'active', 'B1')
      `).run(rawEmail, passwordHash);
      const userId = result.lastInsertRowid;

      db.prepare('UPDATE beta_invites SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId, invite.id);

      const { sessionId } = createSession(userId);
      setSessionCookie(res, sessionId);

      return res.status(201).json({
        user: {
          id: userId,
          email: rawEmail,
          role: 'user',
          cefr_level: 'B1'
        }
      });
    },

    async login(req, res) {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '127.0.0.1';

      const rateCheck = rateLimiter.isLimited(clientIp);
      if (rateCheck.limited) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
      }

      const { email, password } = req.body || {};
      const rawEmail = String(email || '').trim().toLowerCase();
      const rawPassword = String(password || '');

      if (!rawEmail || !rawPassword) {
        rateLimiter.recordFailed(clientIp);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = db.prepare('SELECT id, email, password_hash, role, status, cefr_level FROM users WHERE email = ?').get(rawEmail);
      if (!user || !bcrypt.compareSync(rawPassword, user.password_hash)) {
        rateLimiter.recordFailed(clientIp);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.status === 'deactivated') {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      rateLimiter.reset(clientIp);
      const { sessionId } = createSession(user.id);
      setSessionCookie(res, sessionId);

      return res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          cefr_level: user.cefr_level || 'B1'
        }
      });
    },

    async me(req, res) {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies.lingua_session;

      if (!sessionId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const authResult = getSessionUser(sessionId);
      if (authResult.reason === 'expired') {
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Session expired' });
      }

      if (authResult.reason === 'deactivated') {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      if (!authResult.user) {
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(200).json({
        user: {
          id: authResult.user.id,
          email: authResult.user.email,
          role: authResult.user.role,
          cefr_level: authResult.user.cefr_level || 'B1'
        }
      });
    },

    async logout(req, res) {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies.lingua_session;

      if (sessionId) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      }

      clearSessionCookie(res);
      return res.status(200).json({ message: 'Logged out' });
    }
  };
}

export function createAuthMiddleware(db) {
  const { getSessionUser, clearSessionCookie } = createAuthService(db);

  return function authMiddleware(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.lingua_session;

    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { user, reason } = getSessionUser(sessionId);
    if (reason === 'expired') {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session expired' });
    }

    if (reason === 'deactivated') {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = user;
    req.sessionId = sessionId;
    next();
  };
}
