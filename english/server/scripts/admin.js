#!/usr/bin/env node
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getDb } from '../db.js';
import { getSystemMetrics } from '../analytics.js';

function parseArgs(rawArgs) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const equalsIdx = arg.indexOf('=');
      if (equalsIdx !== -1) {
        const key = arg.slice(2, equalsIdx);
        const val = arg.slice(equalsIdx + 1);
        flags[key] = val;
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
        const key = arg.slice(2);
        flags[key] = rawArgs[i + 1];
        i++;
      } else {
        const key = arg.slice(2);
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printHelp() {
  console.log(`
LinguaLearn English - Admin CLI

Usage:
  node server/scripts/admin.js <command> [options]

Commands:
  bootstrap-owner [--email=<email>] [--password=<password>]
      Create the initial owner account (role = 'owner').
      Defaults: email = owner@lingualearn.com, password = owner123456

  create-invite [--code=<code>] [--expires=<days>]
      Generate a new unredeemed beta invite code.

  deactivate-user --email=<email>
      Deactivate a user account and immediately purge all active sessions.

  reset-password --email=<email> --password=<new_password>
      Update user password and immediately purge all active sessions.

  list-users
      Display formatted list of users (strictly redacting password hashes & tokens).

  metrics
      Display aggregated non-sensitive system telemetry and usage metrics.

Options:
  --help, -h       Show this help message
`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const { flags, positional } = parseArgs(rawArgs);
  const command = positional[0];
  const db = getDb();

  try {
    switch (command) {
      case 'bootstrap-owner': {
        const email = String(flags.email || positional[1] || 'owner@lingualearn.com').trim().toLowerCase();
        const password = String(flags.password || 'owner123456');

        const existingOwner = db.prepare("SELECT id, email, role, status FROM users WHERE role = 'owner'").get();
        if (existingOwner) {
          console.log(`Owner user already exists: ${existingOwner.email} (ID: ${existingOwner.id}, status: ${existingOwner.status})`);
          break;
        }

        const existingByEmail = db.prepare("SELECT id, email, role FROM users WHERE email = ?").get(email);
        if (existingByEmail) {
          db.prepare("UPDATE users SET role = 'owner', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existingByEmail.id);
          console.log(`Updated existing user ${email} to role 'owner'.`);
          break;
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = db.prepare(`
          INSERT INTO users (email, password_hash, role, status, cefr_level)
          VALUES (?, ?, 'owner', 'active', 'B1')
        `).run(email, passwordHash);

        console.log(`Owner user created successfully: ${email} (ID: ${result.lastInsertRowid}, role: owner)`);
        break;
      }

      case 'create-invite': {
        let code = flags.code ? String(flags.code).trim().toUpperCase() : null;
        if (!code) {
          code = 'INVITE-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        }

        let expiresAt = null;
        if (flags.expires) {
          const days = parseInt(flags.expires, 10);
          if (!isNaN(days) && days > 0) {
            const d = new Date();
            d.setDate(d.getDate() + days);
            expiresAt = d.toISOString();
          }
        }

        const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();
        const createdBy = owner ? owner.id : null;

        db.prepare(`
          INSERT INTO beta_invites (code, created_by, expires_at)
          VALUES (?, ?, ?)
        `).run(code, createdBy, expiresAt);

        console.log(`Invite code created successfully: ${code}`);
        break;
      }

      case 'deactivate-user': {
        const email = String(flags.email || positional[1] || '').trim().toLowerCase();
        if (!email) {
          console.error('Error: Email is required. Usage: node server/scripts/admin.js deactivate-user --email=<email>');
          process.exit(1);
        }

        const user = db.prepare("SELECT id, email, status FROM users WHERE email = ?").get(email);
        if (!user) {
          console.error(`Error: User with email "${email}" not found.`);
          process.exit(1);
        }

        db.prepare("UPDATE users SET status = 'deactivated', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
        const purgedSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

        console.log(`User ${email} deactivated successfully. Purged ${purgedSessions.changes} active session(s).`);
        break;
      }

      case 'reset-password': {
        const email = String(flags.email || positional[1] || '').trim().toLowerCase();
        const password = String(flags.password || positional[2] || '');

        if (!email || !password) {
          console.error('Error: Email and password are required. Usage: node server/scripts/admin.js reset-password --email=<email> --password=<new_password>');
          process.exit(1);
        }

        const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
        if (!user) {
          console.error(`Error: User with email "${email}" not found.`);
          process.exit(1);
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, user.id);
        const purgedSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

        console.log(`Password reset successfully for ${email}. Purged ${purgedSessions.changes} active session(s).`);
        break;
      }

      case 'list-users': {
        const users = db.prepare(`
          SELECT id, email, role, status, cefr_level, created_at, updated_at
          FROM users
          ORDER BY id ASC
        `).all();

        const deviceTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='device_tokens'").get();

        const formatted = users.map(u => {
          let deviceCount = 0;
          if (deviceTableExists) {
            const dev = db.prepare("SELECT COUNT(*) as count FROM device_tokens WHERE user_id = ? AND revoked_at IS NULL").get(u.id);
            deviceCount = dev ? dev.count : 0;
          }

          const lastSess = db.prepare("SELECT MAX(created_at) as last_active FROM sessions WHERE user_id = ?").get(u.id);
          const lastActive = (lastSess && lastSess.last_active) ? lastSess.last_active : (u.updated_at || u.created_at);

          return {
            ID: u.id,
            Email: u.email,
            Role: u.role,
            Status: u.status,
            CEFR: u.cefr_level || 'B1',
            Devices: deviceCount,
            'Last Active': lastActive,
            Created: u.created_at
          };
        });

        console.log(`Total users: ${users.length}\n`);
        console.table(formatted);
        break;
      }

      case 'metrics': {
        const metrics = getSystemMetrics(db);
        console.log('LinguaLearn English - Aggregated System Metrics\n');
        console.log(`Total Users: ${metrics.totalUsers} (Active: ${metrics.activeUsers}, Deactivated: ${metrics.deactivatedUsers})`);
        console.log(`Active Devices: ${metrics.activeDevices} / ${metrics.totalDevices} total`);
        console.log(`Total Sentences Analyzed: ${metrics.totalSentencesAnalyzed}`);
        console.log(`Daily Practice Sessions: ${metrics.dailyPractice.completedSessions} completed / ${metrics.dailyPractice.totalSessions} total (${metrics.dailyPractice.completionRate}% completion rate)`);
        console.log(`Feedback Submissions: ${metrics.feedback.totalCount}`);
        if (Object.keys(metrics.feedback.byType || {}).length > 0) {
          console.log('  Feedback by Type:');
          for (const [type, count] of Object.entries(metrics.feedback.byType)) {
            console.log(`    - ${type}: ${count}`);
          }
        }
        console.log(`Telemetry Events Logged: ${metrics.telemetryEventsCount}`);
        console.log('\nAggregated Metrics Summary (JSON):');
        console.log(JSON.stringify(metrics, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    try {
      db.close();
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('Fatal admin CLI error:', err);
  process.exit(1);
});
