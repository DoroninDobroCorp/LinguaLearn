# LinguaLearn English Beta Architecture

## 1. System Overview

LinguaLearn English is a personalized language learning system for B1-B2 English speakers. It captures everyday written English (from Telegram, Slack, WhatsApp, GitHub, email, etc.) via a Mac Desktop Agent or web interface, analyzes grammar and usage errors using Gemini 2.5 Flash, tracks topic-level mastery based on real evidence, and delivers short daily practice sessions.

The system is deployed on an Ubuntu Linux server (`serverforvovka`) as a single-repository Node.js Express application with a React SPA frontend and an SQLite database (managed via `better-sqlite3`), running behind an Nginx reverse proxy.

---

## 2. System Component Topology

```
+-----------------------------------------------------------------------------------+
|                                  Client Surface                                   |
|  +------------------------------------+  +-------------------------------------+  |
|  |           Vite + React SPA         |  |         Mac Desktop Agent           |  |
|  |     (Browser Web Interface)        |  |     (Background Writing Capture)    |  |
|  +-----------------+------------------+  +------------------+------------------+  |
+--------------------|----------------------------------------|---------------------+
                     |                                        |
                     v                                        v
+-----------------------------------------------------------------------------------+
|                                Nginx Reverse Proxy                                |
|   - /english/     -> /srv/LinguaLearn/english/dist/ (Static SPA Dist)           |
|   - /english/api/ -> http://127.0.0.1:3001/api/ (Express API)                     |
|   - /spanish/     -> http://127.0.0.1:3003/ (UNTOUCHED Spanish Module)           |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        LinguaLearn English Express Server                         |
|                                    (Port 3001)                                    |
|                                                                                   |
|  +-----------------------+  +------------------------+  +----------------------+  |
|  | Auth Middleware       |  | Device Token Auth      |  | Security & CORS      |  |
|  | (Sessions & Cookies)  |  | (Bearer Device Tokens) |  | (Rate Limit/Headers) |  |
|  +-----------+-----------+  +-----------+------------+  +----------+-----------+  |
|              |                          |                          |              |
|              +--------------------------+--------------------------+              |
|                                         |                                         |
|  +--------------------------------------+--------------------------------------+  |
|  | Core Controllers & Services                                                 |  |
|  | - Auth & User Service (Invite signup, bcrypt hashing, session management)   |  |
|  | - Device Management Service (Token generation, SHA-256 hash, revocation)    |  |
|  | - Writing Analysis Pipeline (Gemini 2.5 Flash, structured error tagging)    |  |
|  | - Progress & Evidence Engine (Spaced practice, mastery tracking, undo)      |  |
|  | - Today Practice Engine (Weak spot selection, short exercise generator)      |  |
|  | - Privacy & Retention Job (Raw text purge, export, account deletion)        |  |
|  | - Admin & Metrics Service (CLI & aggregated telemetry)                       |  |
|  +--------------------------------------+--------------------------------------+  |
+-----------------------------------------|-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        SQLite Database (better-sqlite3)                           |
|               Location: /srv/LinguaLearn/english/server/english_learning.db       |
|  Tables: users, beta_invites, sessions, device_tokens, user_settings,             |
|  curriculum_topics, user_topic_progress, writing_samples, grammar_evidence,       |
|  correction_feedback, practice_sessions, chat_history, chat_requests,             |
|  vocabulary, analytics_events                                                     |
+-----------------------------------------------------------------------------------+
```

---

## 3. Multi-User Data Isolation Architecture

All user domain entities contain a foreign key column `user_id` referencing `users(id)`. Foreign keys are strictly enforced (`PRAGMA foreign_keys = ON;`), WAL mode is enabled (`PRAGMA journal_mode = WAL;`), and a 5000ms busy timeout (`PRAGMA busy_timeout = 5000;`) guarantees concurrency safety.

### Database Tables & Scoping

1. `users`: Stores user credentials (`email`, `password_hash`), role (`owner`, `admin`, `user`), status (`active`, `deactivated`), and CEFR level (`B1`, `B2`, `C1`).
2. `beta_invites`: One-time invitation codes linked to creating user and redeeming user.
3. `sessions`: Active browser sessions linked to `user_id` with expiration dates.
4. `device_tokens`: Registered Mac capture agents storing SHA-256 `token_hash`, device name, and revocation timestamp (`revoked_at`).
5. `user_settings`: User privacy settings including `raw_text_retention_days` (0, 7, 30), `allowed_apps`, `denied_apps`, and `capture_paused`.
6. `curriculum_topics`: Canonical grammar curriculum definitions (immutable reference table).
7. `user_topic_progress`: Per-user topic mastery status (`not_started`, `insufficient_evidence`, `improving`, `recurring_problem`, `stable`, `mastered`), score, error/success counts, and unique practice days. Constraint: `UNIQUE(user_id, curriculum_topic_id)`.
8. `writing_samples`: Captured writing events linked to `user_id` and `device_token_id`. Unique constraint: `UNIQUE(user_id, event_id)`.
9. `grammar_evidence`: Detected grammar errors or successes tied to a writing sample and curriculum topic. Unique constraint: `UNIQUE(writing_sample_id, curriculum_topic_id)`.
10. `correction_feedback`: User feedback on corrections (`helpful`, `wrong_correction`, `explanation_unclear`, `ignore_type`, `undo_progress`).
11. `practice_sessions`: Daily practice sessions generated for a user with exercise state and evaluation results.
12. `chat_history` & `chat_requests`: User-isolated chat messages and idempotency requests.
13. `vocabulary`: Per-user vocabulary list with SRS review counts. Unique constraint: `UNIQUE(user_id, normalized_word)`.
14. `analytics_events`: Privacy-safe telemetry log (no raw user text or tokens stored).

### Scoping Invariant
Every data access query on user-associated tables MUST include a `WHERE user_id = ?` clause or join on a user-scoped primary entity. Un-scoped queries across user tables are strictly prohibited.

---

## 4. Authentication & Security Architecture

### Authentication Mechanisms
1. **Web SPA Session Cookie**: `lingua_session` cookie set with `HttpOnly`, `SameSite=Lax`, and `Path=/`. Resolved via auth middleware into `req.user`.
2. **Mac Agent Bearer Device Token**: `Authorization: Bearer ll_dev_...`. Validated against `device_tokens` by matching the SHA-256 hash of the plain-text token string.
3. **Legacy Fallback**: Legacy requests containing `Authorization: Bearer <CAPTURE_API_TOKEN>` fall back to the initial owner account (`role = 'owner'`).

### Security Gates & Headers
* **Unauthenticated Access**: All private endpoints (`/api/user/*`, `/api/writing/*`, `/api/practice/*`, `/api/chat/*`, `/api/vocabulary/*`, `/api/curriculum/*`, `/api/admin/*`) return `401 Unauthorized` if unauthenticated, or `403 Forbidden` if deactivated or unauthorized.
* **Security Headers**: All private API responses include mandatory headers:
  * `X-Frame-Options: DENY`
  * `X-Content-Type-Options: nosniff`
  * `Cache-Control: no-store`
* **Rate Limiting**: IP-based rate limiting caps failed login attempts to 10 per 15 minutes (`429 Too Many Requests`).

---

## 5. Writing Analysis & Gemini 2.5 Flash Pipeline

1. **Input Sanitization**: User input is treated as untrusted text within the system prompt to ensure prompt injection resilience.
2. **Structured Analysis Output**: Gemini 2.5 Flash returns a structured JSON object complying with `ANALYSIS_SCHEMA`:
   ```json
   {
     "originalText": "...",
     "correctedText": "...",
     "changed": true,
     "summaryRu": "...",
     "errors": [...],
     "topicEvidence": [...]
   }
   ```
3. **Exact-Once Event Idempotency**: Submissions are constrained by `UNIQUE(user_id, event_id)`. Duplicate `event_id` requests return the cached analysis without duplicate scoring or duplicate evidence creation.
4. **Preview Hotkey Isolation**: When `preview_only: 1` is sent, analysis is generated and returned to the client, but `grammar_evidence` records are NOT created and `user_topic_progress` is NOT modified.
5. **Scoring & Evidence Rules**:
   * Error detection deducts points (`score_delta = -2.0`); clear success awards points (`score_delta = +1.0`).
   * Errors take priority over successes within the same writing sample.
   * Evidence with `confidence < 0.7` is recorded with outcome but does not alter topic score.
6. **Progress Undo**: Submitting `undo_progress` feedback via `POST /api/writing/samples/:id/feedback` idempotently reverses score deltas associated with the writing sample in `user_topic_progress`.

---

## 6. Progress Engine & Daily Practice (`/api/practice/today`)

### Mastery Status Engine
Topics progress through statuses based on score, error/success counts, and unique practice days:
* `not_started`: No evidence recorded.
* `insufficient_evidence`: 1-2 evidence entries recorded.
* `improving`: Score > 0 with consistent recent successes.
* `recurring_problem`: Multiple recent errors recorded.
* `stable`: Score >= 5.0 with low recent error rate.
* `mastered`: Score >= 10.0, 5+ unique practice days, zero recent errors.

### Daily Practice Session Lifecycle
1. **Selection**: `GET /api/practice/today` selects 2-3 weak topics (`recurring_problem` or lowest scores).
2. **Exercise Generation**: Generates 3-7 targeted exercises (fill-in-the-blank, multiple choice, rewrite, short answer).
3. **Submission**: `POST /api/practice/sessions/:id/complete` evaluates answers, provides explanations, and updates topic scores exactly once.

---

## 7. Privacy, Data Retention & Data Rights

1. **Configurable Raw-Text Retention**: Users select 0, 7, or 30 days retention.
2. **Retention Cleanup Job**: `node server/scripts/retentionCleanup.js` sets `original_text = NULL` and `retention_purged = 1` for expired samples while leaving `grammar_evidence` intact.
3. **Export My Data**: `GET /api/user/export` returns a complete JSON bundle of user settings, vocabulary, progress, evidence, writing samples, and practice sessions.
4. **Cascading Account Deletion**: `DELETE /api/user/account` handles foreign key constraints (nullifying `beta_invites` references) and deletes user data across all 11 user tables in a single atomic transaction.

---

## 8. Spanish Module Isolation Boundary

The Spanish learning module located at `/srv/LinguaLearn/spanish` and running as `spanish-backend.service` on port **3003** (Nginx route `/spanish/`) is an independent system. The English module makes zero modifications, zero database queries, and zero service calls to the Spanish module, guaranteeing complete non-interference and stability.
