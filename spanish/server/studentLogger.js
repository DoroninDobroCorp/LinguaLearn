import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { buildProfileNameKey } from './unicodeKeys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const studentLogEvents = new EventEmitter();
studentLogEvents.setMaxListeners(100);

const LOGS_DIR = join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (e) {
    console.error('Error creating logs dir:', e);
  }
}

export function ensureStudentLogsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_vocabulary_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      client_event_id TEXT,
      session_id TEXT,
      student_token TEXT,
      vocabulary_id INTEGER,
      card_id INTEGER,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      direction TEXT NOT NULL,
      prompt TEXT,
      expected_answer TEXT,
      user_input TEXT,
      grade TEXT,
      is_correct INTEGER NOT NULL DEFAULT 0,
      practice_mode TEXT DEFAULT 'flashcard',
      group_name TEXT,
      response_time_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_student_vocab_logs_profile_time
      ON student_vocabulary_logs(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_student_vocab_logs_word
      ON student_vocabulary_logs(profile_id, word);
    CREATE INDEX IF NOT EXISTS idx_student_vocab_logs_session
      ON student_vocabulary_logs(session_id);
  `);

  // Ensure client_event_id column and unique index exist for deduplication
  try {
    db.prepare('SELECT client_event_id FROM student_vocabulary_logs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE student_vocabulary_logs ADD COLUMN client_event_id TEXT');
  }

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_student_vocab_logs_event
        ON student_vocabulary_logs(profile_id, client_event_id)
        WHERE client_event_id IS NOT NULL;
    `);
  } catch (e) {
    console.warn('Index on client_event_id check:', e.message);
  }
}

export function resolveStudentProfile(db, identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  if (!raw || raw.length > 100) return null;

  // 1. Exact Numeric ID (strictly digits)
  if (/^\d+$/.test(raw)) {
    const num = parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0) {
      const p = db.prepare('SELECT id, name, avatar_emoji FROM profiles WHERE id = ?').get(num);
      if (p) return p;
    }
  }

  // 2. Direct alias for Maya / Майя
  const lower = raw.toLowerCase();
  if (lower === 'maya' || lower === 'майя') {
    const maya = db.prepare('SELECT id, name, avatar_emoji FROM profiles WHERE id = 9 OR name_key = ?').get('майя');
    if (maya) return maya;
  }

  // 3. Exact name_key match
  const nameKey = buildProfileNameKey(raw);
  const byKey = db.prepare('SELECT id, name, avatar_emoji FROM profiles WHERE name_key = ?').get(nameKey);
  if (byKey) return byKey;

  // 4. Case-insensitive exact name match
  const byName = db.prepare('SELECT id, name, avatar_emoji FROM profiles WHERE LOWER(name) = ? LIMIT 1').get(lower);
  if (byName) return byName;

  // 5. Substring match (only if identifier has at least 3 characters to prevent accidental matches on single letters)
  if (lower.length >= 3) {
    const escaped = lower.replace(/[%_\\]/g, '\\$&');
    const byLike = db.prepare("SELECT id, name, avatar_emoji FROM profiles WHERE LOWER(name) LIKE ? ESCAPE '\\' LIMIT 1").get(`%${escaped}%`);
    if (byLike) return byLike;
  }
  return null;
}

export function logStudentAttempt(db, entry) {
  try {
    let profileId = entry.profileId || 1;
    if (typeof profileId !== 'number') {
      const num = parseInt(profileId, 10);
      profileId = Number.isFinite(num) && num > 0 ? num : 1;
    }

    const clientEventId = entry.clientEventId ? String(entry.clientEventId).trim().slice(0, 100) : null;

    // Deduplication check: if client_event_id is already logged for this profile, skip re-insertion
    if (clientEventId) {
      const existing = db.prepare(
        'SELECT id FROM student_vocabulary_logs WHERE profile_id = ? AND client_event_id = ?'
      ).get(profileId, clientEventId);
      if (existing) {
        return { logId: existing.id, deduplicated: true };
      }
    }

    const word = String(entry.word || entry.prompt || '').trim().slice(0, 200);
    const translation = String(entry.translation || entry.expectedAnswer || '').trim().slice(0, 300);
    if (!word) {
      return null;
    }

    const isCorrect = (
      entry.isCorrect === true ||
      entry.isCorrect === 1 ||
      entry.isCorrect === '1' ||
      entry.isCorrect === 'true'
    ) ? 1 : 0;

    let now;
    if (entry.createdAt) {
      const parsedDate = new Date(entry.createdAt);
      now = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();
    } else {
      now = new Date().toISOString();
    }

    const stmt = db.prepare(`
      INSERT INTO student_vocabulary_logs (
        profile_id, client_event_id, session_id, student_token, vocabulary_id, card_id,
        word, translation, direction, prompt, expected_answer, user_input,
        grade, is_correct, practice_mode, group_name, response_time_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const direction = entry.direction === 'target_to_source' ? 'target_to_source' : 'source_to_target';
    const prompt = String(entry.prompt || word).trim().slice(0, 200);
    const expectedAnswer = String(entry.expectedAnswer || translation).trim().slice(0, 300);
    const userInput = entry.userInput !== undefined && entry.userInput !== null ? String(entry.userInput).trim().slice(0, 300) : null;
    const grade = String(entry.grade || '').trim().slice(0, 50);
    const practiceMode = String(entry.practiceMode || 'flashcard').trim().slice(0, 50);
    const groupName = entry.groupName ? String(entry.groupName).trim().slice(0, 100) : null;
    const responseTimeMs = typeof entry.responseTimeMs === 'number' && Number.isFinite(entry.responseTimeMs)
      ? Math.min(60000, Math.max(0, Math.round(entry.responseTimeMs)))
      : null;

    const vocabularyId = (typeof entry.vocabularyId === 'number' && Number.isInteger(entry.vocabularyId) && entry.vocabularyId > 0)
      ? entry.vocabularyId
      : (parseInt(entry.vocabularyId, 10) > 0 ? parseInt(entry.vocabularyId, 10) : null);
    const cardId = (typeof entry.cardId === 'number' && Number.isInteger(entry.cardId) && entry.cardId > 0)
      ? entry.cardId
      : (parseInt(entry.cardId, 10) > 0 ? parseInt(entry.cardId, 10) : null);
    const sessionId = entry.sessionId ? String(entry.sessionId).trim().slice(0, 100) : null;
    const studentToken = entry.studentToken ? String(entry.studentToken).trim().slice(0, 100) : null;

    let result;
    try {
      result = stmt.run(
        profileId,
        clientEventId,
        sessionId,
        studentToken,
        vocabularyId,
        cardId,
        word,
        translation,
        direction,
        prompt,
        expectedAnswer,
        userInput,
        grade,
        isCorrect,
        practiceMode,
        groupName,
        responseTimeMs,
        now
      );
    } catch (insertErr) {
      if (clientEventId && String(insertErr.message).includes('UNIQUE constraint failed')) {
        const existing = db.prepare(
          'SELECT id FROM student_vocabulary_logs WHERE profile_id = ? AND client_event_id = ?'
        ).get(profileId, clientEventId);
        if (existing) {
          return { logId: existing.id, deduplicated: true };
        }
      }
      throw insertErr;
    }

    const logId = Number(result.lastInsertRowid);

    // Also write atomically to permanent jsonl file
    const logObject = {
      id: logId,
      timestamp: now,
      profileId,
      clientEventId,
      sessionId: entry.sessionId || null,
      studentToken: entry.studentToken || null,
      vocabularyId: entry.vocabularyId || null,
      cardId: entry.cardId || null,
      word,
      translation,
      direction,
      prompt,
      expectedAnswer,
      userInput,
      grade,
      isCorrect: Boolean(isCorrect),
      practiceMode,
      groupName,
      responseTimeMs
    };

    try {
      fs.appendFileSync(
        join(LOGS_DIR, 'student_vocab_activity.jsonl'),
        JSON.stringify(logObject) + '\n',
        'utf8'
      );
    } catch (fsErr) {
      console.error('Error appending to JSONL log file:', fsErr);
    }

    // Emit live SSE event
    studentLogEvents.emit('attempt', {
      profileId,
      log: {
        id: logId,
        profile_id: profileId,
        session_id: entry.sessionId || null,
        student_token: entry.studentToken || null,
        word,
        translation,
        direction,
        prompt,
        expected_answer: expectedAnswer,
        user_input: userInput,
        grade,
        is_correct: isCorrect,
        practice_mode: practiceMode,
        group_name: groupName,
        response_time_ms: responseTimeMs,
        created_at: now
      }
    });

    return { logId, deduplicated: false };
  } catch (err) {
    console.error('Error logging student vocabulary attempt:', err);
    return null;
  }
}

export function buildDateFilter(period = 'all', fromDate = null, toDate = null) {
  const clauses = [];
  const params = [];

  const isValidDate = (str) => typeof str === 'string' && /^\d{4}-\d{2}-\d{2}/.test(str.trim());

  if (period === 'today') {
    clauses.push("date(created_at) = date('now')");
  } else if (period === '7d' || period === 'week') {
    clauses.push("created_at >= datetime('now', '-7 days')");
  } else if (period === '30d' || period === 'month') {
    clauses.push("created_at >= datetime('now', '-30 days')");
  } else {
    if (isValidDate(fromDate)) {
      clauses.push("created_at >= ?");
      params.push(String(fromDate).trim());
    }
    if (isValidDate(toDate)) {
      const trimmedTo = String(toDate).trim();
      const endOfDay = trimmedTo.length === 10 ? `${trimmedTo} 23:59:59` : trimmedTo;
      clauses.push("created_at <= ?");
      params.push(endOfDay);
    }
  }

  return {
    sql: clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '',
    params
  };
}

export function getStudentLogs(db, profileId, {
  limit = 100,
  offset = 0,
  period = 'all',
  fromDate = null,
  toDate = null,
  filterCorrect = null
} = {}) {
  const parsedLimit = parseInt(limit, 10);
  const safeLimit = Number.isFinite(parsedLimit) ? Math.min(1000, Math.max(1, parsedLimit)) : 100;
  const parsedOffset = parseInt(offset, 10);
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  const dateFilter = buildDateFilter(period, fromDate, toDate);
  const correctClause = filterCorrect === '1' || filterCorrect === 'correct'
    ? ' AND is_correct = 1'
    : (filterCorrect === '0' || filterCorrect === 'mistake' ? ' AND is_correct = 0' : '');

  const whereSql = `WHERE profile_id = ?${dateFilter.sql}${correctClause}`;
  const queryParams = [profileId, ...dateFilter.params];

  const logs = db.prepare(`
    SELECT *
    FROM student_vocabulary_logs
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...queryParams, safeLimit, safeOffset);

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM student_vocabulary_logs
    ${whereSql}
  `).get(...queryParams)?.count || 0;

  return { total, count: logs.length, logs, period: period || 'all' };
}

export function getStudentSummary(db, profileId, { period = 'all', fromDate = null, toDate = null } = {}) {
  const profile = db.prepare('SELECT id, name, avatar_emoji FROM profiles WHERE id = ?').get(profileId);
  if (!profile) return null;

  const dateFilter = buildDateFilter(period, fromDate, toDate);

  const filteredStats = db.prepare(`
    SELECT
      COUNT(*) as total_attempts,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_attempts,
      COUNT(DISTINCT word) as unique_words_practiced,
      COUNT(DISTINCT session_id) as total_sessions
    FROM student_vocabulary_logs
    WHERE profile_id = ?${dateFilter.sql}
  `).get(profileId, ...dateFilter.params) || {};

  const todayStats = db.prepare(`
    SELECT
      COUNT(*) as today_attempts,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as today_correct
    FROM student_vocabulary_logs
    WHERE profile_id = ? AND date(created_at) = date('now')
  `).get(profileId) || {};

  const last7DaysStats = db.prepare(`
    SELECT
      COUNT(*) as attempts_7d,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_7d
    FROM student_vocabulary_logs
    WHERE profile_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(profileId) || {};

  const difficultWords = db.prepare(`
    SELECT
      MIN(word) as word,
      MIN(translation) as translation,
      COUNT(*) as total_tries,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as mistake_count,
      MAX(created_at) as last_attempt_at
    FROM student_vocabulary_logs
    WHERE profile_id = ?${dateFilter.sql}
    GROUP BY LOWER(word)
    HAVING mistake_count > 0
    ORDER BY mistake_count DESC, total_tries DESC
    LIMIT 15
  `).all(profileId, ...dateFilter.params);

  const masteredCount = db.prepare(`
    SELECT COUNT(*) as c
    FROM vocabulary
    WHERE profile_id = ? AND (learned_permanently_at IS NOT NULL OR level >= 4)
  `).get(profileId)?.c || 0;

  const totalVocabularyCount = db.prepare(`
    SELECT COUNT(*) as c FROM vocabulary WHERE profile_id = ?
  `).get(profileId)?.c || 0;

  const dailyActivity = db.prepare(`
    SELECT
      date(created_at) as day,
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM student_vocabulary_logs
    WHERE profile_id = ?${dateFilter.sql}
    GROUP BY date(created_at)
    ORDER BY day DESC
    LIMIT 14
  `).all(profileId, ...dateFilter.params);

  const recentLogs = db.prepare(`
    SELECT *
    FROM student_vocabulary_logs
    WHERE profile_id = ?${dateFilter.sql}
    ORDER BY id DESC
    LIMIT 60
  `).all(profileId, ...dateFilter.params);

  const totalAttempts = filteredStats.total_attempts || 0;
  const correctAttempts = filteredStats.correct_attempts || 0;
  const accuracy = totalAttempts > 0
    ? Math.min(100, Math.max(0, Math.round((correctAttempts / totalAttempts) * 1000) / 10))
    : 0;

  return {
    profile,
    period: period || 'all',
    summary: {
      totalAttempts,
      correctAttempts,
      mistakeAttempts: totalAttempts - correctAttempts,
      accuracyPercent: accuracy,
      uniqueWordsPracticed: filteredStats.unique_words_practiced || 0,
      totalVocabularyCount,
      masteredWordsCount: masteredCount,
      todayAttempts: todayStats.today_attempts || 0,
      todayCorrect: todayStats.today_correct || 0,
      last7DaysAttempts: last7DaysStats.attempts_7d || 0,
      last7DaysCorrect: last7DaysStats.correct_7d || 0,
      totalSessions: filteredStats.total_sessions || 0,
    },
    difficultWords,
    dailyActivity,
    recentLogs
  };
}

export function renderParentReportHtml(data, studentParam = 'maya', reqHost = '145.239.82.124.sslip.io', currentPeriod = 'all') {
  const { profile, summary, difficultWords, dailyActivity, recentLogs, period } = data;
  const activePeriod = period || currentPeriod || 'all';
  const studentUrl = `https://${reqHost}/spanish/vocabulary?student=${encodeURIComponent(studentParam)}`;

  const formatGrade = (grade, isCorrect, input) => {
    if (grade === 'easy') return '<span class="badge badge-easy">✓ Очень легко</span>';
    if (grade === 'good') return '<span class="badge badge-good">✓ Хорошо</span>';
    if (grade === 'hard') return '<span class="badge badge-hard">⚠️ Трудно</span>';
    if (grade === 'dont_know') return '<span class="badge badge-wrong">✗ Не помню</span>';
    if (grade === 'learned') return '<span class="badge badge-easy">🎓 Выучено навсегда</span>';
    if (isCorrect) return `<span class="badge badge-good">✓ Верно${input ? ` (${input})` : ''}</span>`;
    return `<span class="badge badge-wrong">✗ Ошибка${input ? ` (${input})` : ''}</span>`;
  };

  const formatDateTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const rows = recentLogs.map((l, idx) => `
    <tr class="log-row hover:bg-purple-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}" data-word="${escapeHtml(l.word).toLowerCase()}" data-trans="${escapeHtml(l.translation).toLowerCase()}" data-correct="${l.is_correct ? '1' : '0'}">
      <td class="time-cell px-4 py-3 text-xs text-slate-500 whitespace-nowrap" data-iso="${escapeHtml(l.created_at)}">${formatDateTime(l.created_at)}</td>
      <td class="px-4 py-3 font-bold text-slate-900 text-sm break-words max-w-[180px]">${escapeHtml(l.word)}</td>
      <td class="px-4 py-3 text-sm text-slate-600 break-words max-w-[220px]">${escapeHtml(l.translation)}</td>
      <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(l.practice_mode || 'карточки')}</td>
      <td class="px-4 py-3 text-sm break-words max-w-[240px]">${formatGrade(l.grade, l.is_correct, l.user_input)}</td>
    </tr>
  `).join('');

  const difficultRows = difficultWords.map((w) => {
    const accuracy = w.total_tries > 0 ? Math.round(((w.total_tries - w.mistake_count) / w.total_tries) * 100) : 0;
    return `
    <tr class="hover:bg-rose-50/40 transition-colors">
      <td class="px-4 py-2.5 font-bold text-rose-950 text-sm break-words max-w-[180px]">${escapeHtml(w.word)}</td>
      <td class="px-4 py-2.5 text-sm text-slate-700 break-words max-w-[220px]">${escapeHtml(w.translation)}</td>
      <td class="px-4 py-2.5 text-center whitespace-nowrap">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
          ${w.mistake_count} из ${w.total_tries} (${accuracy}% верно)
        </span>
      </td>
      <td class="time-cell px-4 py-2.5 text-xs text-slate-500 text-right whitespace-nowrap" data-iso="${escapeHtml(w.last_attempt_at)}">${formatDateTime(w.last_attempt_at)}</td>
    </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Отчёт для родителей · Успехи ${escapeHtml(profile.name)} · LinguaLearn</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      border-width: 1px;
    }
    .badge-easy { background-color: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
    .badge-good { background-color: #f0fdf4; color: #166534; border-color: #bbf7d0; }
    .badge-hard { background-color: #fffbeb; color: #92400e; border-color: #fde68a; }
    .badge-wrong { background-color: #fff1f2; color: #9f1239; border-color: #fecdd3; }
    @keyframes highlightRow {
      0% { background-color: #f3e8ff; }
      100% { background-color: transparent; }
    }
    .new-row-highlight {
      animation: highlightRow 3s ease-out;
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-800 min-h-screen font-sans antialiased">
  <div class="max-w-6xl mx-auto px-4 py-6 sm:py-10 space-y-6">

    <!-- Top Header -->
    <header class="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center text-3xl sm:text-4xl shadow-md shadow-purple-200 flex-shrink-0">
          ${escapeHtml(profile.avatar_emoji || '👧')}
        </div>
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              ${escapeHtml(profile.name)}
            </h1>
            <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
              Ученица · Испанский A1
            </span>
            <span id="liveStatusBadge" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live подключение
            </span>
          </div>
          <p class="text-xs sm:text-sm text-slate-500 mt-1">
            Детальная статистика повторения слов, попыток и прогресса в LinguaLearn
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 self-start md:self-center">
        <!-- Date Period Filter Pills -->
        <div class="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
          <a href="?student=${encodeURIComponent(studentParam)}&period=all" class="px-3 py-1.5 rounded-xl transition-all ${activePeriod === 'all' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'}">
            Всё время
          </a>
          <a href="?student=${encodeURIComponent(studentParam)}&period=today" class="px-3 py-1.5 rounded-xl transition-all ${activePeriod === 'today' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'}">
            Сегодня
          </a>
          <a href="?student=${encodeURIComponent(studentParam)}&period=7d" class="px-3 py-1.5 rounded-xl transition-all ${activePeriod === '7d' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'}">
            7 дней
          </a>
          <a href="?student=${encodeURIComponent(studentParam)}&period=30d" class="px-3 py-1.5 rounded-xl transition-all ${activePeriod === '30d' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'}">
            30 дней
          </a>
        </div>

        <button onclick="downloadCsv()" class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer">
          <span>📥</span>
          <span>Экспорт CSV</span>
        </button>
      </div>
    </header>

    <!-- Student Direct Link Banner -->
    <div class="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-3xl p-5 sm:p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
      <div class="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none"></div>
      <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">🔗</span>
            <span class="font-extrabold text-sm uppercase tracking-wider text-purple-200">Прямая ссылка для Майи:</span>
          </div>
          <p class="text-xs sm:text-sm text-purple-100 max-w-2xl leading-relaxed">
            Отправьте эту ссылку ученице на любое устройство. Браузер автоматически подключится к профилю Майи, и все ответы будут надежно сохраняться в этот отчёт.
          </p>
        </div>

        <div class="flex items-center gap-2 w-full md:w-auto">
          <input
            id="studentLinkInput"
            type="text"
            readonly
            value="${escapeHtml(studentUrl)}"
            class="bg-white/20 text-white font-mono text-xs px-3 py-2.5 rounded-xl border border-white/30 w-full md:w-80 select-all focus:outline-none"
          />
          <button
            onclick="copyStudentLink()"
            id="copyBtn"
            class="px-4 py-2.5 rounded-xl bg-white text-indigo-700 hover:bg-purple-50 font-bold text-xs transition-all flex-shrink-0 shadow-md cursor-pointer active:scale-95"
          >
            📋 Скопировать
          </button>
        </div>
      </div>
    </div>

    <!-- 4 Key Metric Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Accuracy Card -->
      <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
          <span>Точность ответов</span>
          <span class="text-lg">🎯</span>
        </div>
        <div>
          <div id="metricAccuracy" class="text-3xl sm:text-4xl font-black text-slate-900">
            ${summary.accuracyPercent}%
          </div>
          <p class="text-xs text-slate-500 mt-1">
            <strong id="metricCorrect" class="text-emerald-600 font-bold">${summary.correctAttempts}</strong> верных из <span id="metricTotal">${summary.totalAttempts}</span>
          </p>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
          <div id="metricAccuracyBar" class="bg-emerald-500 h-full rounded-full transition-all" style="width: ${summary.accuracyPercent}%"></div>
        </div>
      </div>

      <!-- Total Words Card -->
      <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
          <span>Слов в тренировках</span>
          <span class="text-lg">📇</span>
        </div>
        <div>
          <div id="metricUniqueWords" class="text-3xl sm:text-4xl font-black text-indigo-600">
            ${summary.uniqueWordsPracticed}
          </div>
          <p class="text-xs text-slate-500 mt-1">
            из <strong>${summary.totalVocabularyCount}</strong> слов программы
          </p>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
          <div id="metricUniqueWordsBar" class="bg-indigo-500 h-full rounded-full transition-all" style="width: ${summary.totalVocabularyCount > 0 ? Math.min(100, Math.round((summary.uniqueWordsPracticed / summary.totalVocabularyCount) * 100)) : 0}%"></div>
        </div>
      </div>

      <!-- Mastered Words Card -->
      <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
          <span>Выучено слов</span>
          <span class="text-lg">🌟</span>
        </div>
        <div>
          <div id="metricMastered" class="text-3xl sm:text-4xl font-black text-purple-600">
            ${summary.masteredWordsCount}
          </div>
          <p class="text-xs text-slate-500 mt-1">
            выучены навсегда или уровень 4+
          </p>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
          <div class="bg-purple-500 h-full rounded-full transition-all" style="width: ${summary.totalVocabularyCount > 0 ? Math.min(100, Math.round((summary.masteredWordsCount / summary.totalVocabularyCount) * 100)) : 0}%"></div>
        </div>
      </div>

      <!-- Today Activity Card -->
      <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
          <span>Сегодня отвечено</span>
          <span class="text-lg">⏱️</span>
        </div>
        <div>
          <div id="metricToday" class="text-3xl sm:text-4xl font-black text-amber-600">
            ${summary.todayAttempts}
          </div>
          <p class="text-xs text-slate-500 mt-1">
            <strong id="metricTodayCorrect" class="text-emerald-600">${summary.todayCorrect}</strong> правильных за сегодня
          </p>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
          <div id="metricTodayBar" class="bg-amber-500 h-full rounded-full transition-all" style="width: ${Math.min(100, summary.todayAttempts * 5)}%"></div>
        </div>
      </div>
    </div>

    <!-- Daily Activity Bar Strip -->
    ${dailyActivity.length > 0 ? `
    <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">📅</span>
          <h2 class="text-lg sm:text-xl font-bold text-slate-900">
            Активность по дням
          </h2>
        </div>
        <span class="text-xs font-bold text-slate-500">Показано ${dailyActivity.length} дней</span>
      </div>
      <div class="flex items-end gap-2 overflow-x-auto pt-4 pb-2 px-1">
        ${dailyActivity.slice().reverse().map(d => {
          const maxAttempts = Math.max(...dailyActivity.map(a => a.attempts), 10);
          const heightPercent = Math.min(100, Math.max(15, Math.round((d.attempts / maxAttempts) * 100)));
          const acc = d.attempts > 0 ? Math.round((d.correct / d.attempts) * 100) : 0;
          const dayLabel = new Date(d.day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
          return `
            <div class="flex flex-col items-center gap-1.5 flex-1 min-w-[54px] max-w-[76px] text-center" title="${dayLabel}: ${d.attempts} ответов (${d.correct} верно, ${acc}%)">
              <span class="text-[11px] font-extrabold text-indigo-600">${d.attempts}</span>
              <div class="w-full bg-slate-100 rounded-xl h-24 flex items-end p-1 overflow-hidden">
                <div class="w-full bg-gradient-to-t from-indigo-600 to-purple-500 rounded-lg transition-all" style="height: ${heightPercent}%;"></div>
              </div>
              <span class="text-[10px] font-bold text-slate-500 whitespace-nowrap">${dayLabel}</span>
              <span class="text-[9px] font-bold text-emerald-600">${acc}%</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Difficult Words Section -->
    ${difficultWords.length > 0 ? `
    <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">⚠️</span>
          <h2 class="text-lg sm:text-xl font-bold text-slate-900">
            Слова, где были ошибки (требуют внимания)
          </h2>
        </div>
        <span class="text-xs font-bold text-slate-500">${difficultWords.length} слов</span>
      </div>
      <p class="text-xs text-slate-500">
        На эти слова стоит обратить внимание при совместных повторениях:
      </p>

      <div class="overflow-x-auto rounded-2xl border border-slate-200">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-rose-50/70 border-b border-rose-200 text-xs font-extrabold text-rose-900 uppercase tracking-wider">
              <th class="px-4 py-3">Слово (Испанский)</th>
              <th class="px-4 py-3">Перевод</th>
              <th class="px-4 py-3 text-center">Ошибок</th>
              <th class="px-4 py-3 text-right">Последний ответ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${difficultRows}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Recent Logs Table -->
    <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">📋</span>
          <h2 class="text-lg sm:text-xl font-bold text-slate-900">
            История последних ответов (реальное время)
          </h2>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <!-- Filter buttons -->
          <button type="button" onclick="setFilter('all', this)" class="filter-btn px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold transition-all">
            Все (<span id="countAll">${recentLogs.length}</span>)
          </button>
          <button type="button" onclick="setFilter('mistake', this)" class="filter-btn px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold transition-all">
            Ошибки (<span id="countMistake">${recentLogs.filter(l => !l.is_correct).length}</span>)
          </button>
          <button type="button" onclick="setFilter('correct', this)" class="filter-btn px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold transition-all">
            Верные (<span id="countCorrect">${recentLogs.filter(l => l.is_correct).length}</span>)
          </button>

          <!-- Search input -->
          <input
            id="logSearch"
            type="text"
            placeholder="🔍 Поиск слова..."
            oninput="applyFilters()"
            class="px-3 py-1.5 rounded-xl border border-slate-200 text-xs w-36 sm:w-48 focus:outline-none focus:border-purple-500"
          />
          <span id="visibleCount" class="text-slate-400 font-medium hidden sm:inline"></span>
        </div>
      </div>

      <div id="newActivityBanner" class="hidden p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center justify-between animate-pulse">
        <div class="flex items-center gap-2">
          <span>🔔</span>
          <span id="newActivityText">Поступили новые ответы ученицы!</span>
        </div>
        <button onclick="location.reload()" class="px-3 py-1 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">
          Обновить ленту
        </button>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-200">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              <th class="px-4 py-3">Время</th>
              <th class="px-4 py-3">Слово (Испанский)</th>
              <th class="px-4 py-3">Перевод</th>
              <th class="px-4 py-3">Режим</th>
              <th class="px-4 py-3">Результат</th>
            </tr>
          </thead>
          <tbody id="logsTableBody" class="divide-y divide-slate-100">
            ${rows}
          </tbody>
        </table>
        ${recentLogs.length === 0 ? `
          <div id="emptyLogsPlaceholder" class="p-8 text-center bg-slate-50 text-slate-500 text-sm">
            Пока нет залогированных ответов за выбранный период. Дайте ссылку Майе, и при каждом повторении карточки здесь будут появляться записи!
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Footer -->
    <footer class="text-center text-xs text-slate-400 py-4">
      LinguaLearn · Платформа для обучения языкам · Серверный мониторинг прогресса
    </footer>

  </div>

  <script>
    function copyStudentLink() {
      const input = document.getElementById('studentLinkInput');
      const btn = document.getElementById('copyBtn');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        btn.textContent = '✓ Скопировано!';
        btn.classList.add('bg-emerald-500', 'text-white');
        setTimeout(() => {
          btn.textContent = '📋 Скопировать';
          btn.classList.remove('bg-emerald-500', 'text-white');
        }, 2500);
      });
    }

    function downloadCsv() {
      window.location.href = '/spanish/api/student-logs/export-csv?student=${encodeURIComponent(studentParam)}&period=${encodeURIComponent(activePeriod)}';
    }

    let currentFilter = 'all';

    function setFilter(type, btn) {
      currentFilter = type;
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('bg-purple-600', 'text-white');
        b.classList.add('bg-slate-100', 'text-slate-600');
      });
      btn.classList.add('bg-purple-600', 'text-white');
      btn.classList.remove('bg-slate-100', 'text-slate-600');
      applyFilters();
    }

    function applyFilters() {
      const query = (document.getElementById('logSearch')?.value || '').toLowerCase().trim();
      const rows = document.querySelectorAll('.log-row');
      let visible = 0;

      rows.forEach(r => {
        const word = (r.getAttribute('data-word') || '').toLowerCase();
        const trans = (r.getAttribute('data-trans') || '').toLowerCase();
        const isCorrect = r.getAttribute('data-correct') === '1';

        let matchesFilter = true;
        if (currentFilter === 'correct' && !isCorrect) matchesFilter = false;
        if (currentFilter === 'mistake' && isCorrect) matchesFilter = false;

        let matchesQuery = true;
        if (query && !word.includes(query) && !trans.includes(query)) matchesQuery = false;

        if (matchesFilter && matchesQuery) {
          r.style.display = '';
          visible++;
        } else {
          r.style.display = 'none';
        }
      });

      const badge = document.getElementById('visibleCount');
      if (badge) badge.textContent = '(' + visible + ')';
    }

    function formatGradeJs(grade, isCorrect, input) {
      if (grade === 'easy') return '<span class="badge badge-easy">✓ Очень легко</span>';
      if (grade === 'good') return '<span class="badge badge-good">✓ Хорошо</span>';
      if (grade === 'hard') return '<span class="badge badge-hard">⚠️ Трудно</span>';
      if (grade === 'dont_know') return '<span class="badge badge-wrong">✗ Не помню</span>';
      if (grade === 'learned') return '<span class="badge badge-easy">🎓 Выучено навсегда</span>';
      if (isCorrect) return '<span class="badge badge-good">✓ Верно' + (input ? ' (' + escapeHtml(input) + ')' : '') + '</span>';
      return '<span class="badge badge-wrong">✗ Ошибка' + (input ? ' (' + escapeHtml(input) + ')' : '') + '</span>';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function handleLiveAttempt(log, summary) {
      // 1. Update KPI numbers if summary provided
      if (summary) {
        if (document.getElementById('metricAccuracy')) {
          document.getElementById('metricAccuracy').textContent = summary.accuracyPercent + '%';
        }
        if (document.getElementById('metricAccuracyBar')) {
          document.getElementById('metricAccuracyBar').style.width = summary.accuracyPercent + '%';
        }
        if (document.getElementById('metricCorrect')) {
          document.getElementById('metricCorrect').textContent = summary.correctAttempts;
        }
        if (document.getElementById('metricTotal')) {
          document.getElementById('metricTotal').textContent = summary.totalAttempts;
        }
        if (document.getElementById('metricToday')) {
          document.getElementById('metricToday').textContent = summary.todayAttempts;
        }
        if (document.getElementById('metricTodayCorrect')) {
          document.getElementById('metricTodayCorrect').textContent = summary.todayCorrect;
        }
        if (document.getElementById('metricTodayBar')) {
          document.getElementById('metricTodayBar').style.width = Math.min(100, summary.todayAttempts * 5) + '%';
        }
        if (document.getElementById('metricUniqueWords')) {
          document.getElementById('metricUniqueWords').textContent = summary.uniqueWordsPracticed;
        }
      }

      // 2. Prepend live row to table
      const tbody = document.getElementById('logsTableBody');
      if (tbody) {
        const tr = document.createElement('tr');
        tr.className = 'log-row hover:bg-purple-50/40 transition-colors bg-white new-row-highlight';
        tr.setAttribute('data-word', (log.word || '').toLowerCase());
        tr.setAttribute('data-trans', (log.translation || '').toLowerCase());
        tr.setAttribute('data-correct', log.is_correct ? '1' : '0');

        const dateStr = new Date(log.created_at).toLocaleString('ru-RU', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        tr.innerHTML = \`
          <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">\${dateStr}</td>
          <td class="px-4 py-3 font-bold text-slate-900 text-sm">\${escapeHtml(log.word)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">\${escapeHtml(log.translation)}</td>
          <td class="px-4 py-3 text-xs text-slate-500">\${escapeHtml(log.practice_mode || 'карточки')}</td>
          <td class="px-4 py-3 text-sm">\${formatGradeJs(log.grade, log.is_correct, log.user_input)}</td>
        \`;

        tbody.insertBefore(tr, tbody.firstChild);

        // Cap rows in DOM to 200
        if (tbody.children.length > 200) {
          tbody.removeChild(tbody.lastChild);
        }

        // Increment filter chips
        const countAllEl = document.getElementById('countAll');
        if (countAllEl) {
          countAllEl.textContent = parseInt(countAllEl.textContent || '0', 10) + 1;
        }
        if (log.is_correct) {
          const countCorrectEl = document.getElementById('countCorrect');
          if (countCorrectEl) countCorrectEl.textContent = parseInt(countCorrectEl.textContent || '0', 10) + 1;
        } else {
          const countMistakeEl = document.getElementById('countMistake');
          if (countMistakeEl) countMistakeEl.textContent = parseInt(countMistakeEl.textContent || '0', 10) + 1;
        }

        const empty = document.getElementById('emptyLogsPlaceholder');
        if (empty) empty.style.display = 'none';

        applyFilters();
      }
    }

    // Connect to Server-Sent Events (SSE) for zero-latency live updates
    let sseActive = false;
    let es = null;

    if (typeof EventSource !== 'undefined') {
      try {
        es = new EventSource('/spanish/api/student-logs/stream?student=${encodeURIComponent(studentParam)}');
        es.onopen = function() {
          sseActive = true;
          const badge = document.getElementById('liveStatusBadge');
          if (badge) {
            badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200';
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Live подключение';
          }
        };
        es.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            if (data && data.type === 'attempt' && data.log) {
              handleLiveAttempt(data.log, data.summary);
            }
          } catch (err) {}
        };
        es.onerror = function() {
          sseActive = false;
          const badge = document.getElementById('liveStatusBadge');
          if (badge) {
            badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200';
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> Polling режим';
          }
        };
        window.addEventListener('beforeunload', function() {
          if (es) es.close();
        });
      } catch (e) {}
    }

    // Fallback soft polling every 15s in case SSE is blocked
    let lastSeenTotal = ${summary.totalAttempts};
    const pollInterval = setInterval(() => {
      if (sseActive) return;
      fetch('/spanish/api/student-logs/summary?student=${encodeURIComponent(studentParam)}&period=${encodeURIComponent(activePeriod)}')
        .then(r => r.json())
        .then(data => {
          if (data && data.summary && data.summary.totalAttempts > lastSeenTotal) {
            const banner = document.getElementById('newActivityBanner');
            const text = document.getElementById('newActivityText');
            if (banner && text) {
              text.textContent = 'Поступили новые ответы (' + (data.summary.totalAttempts - lastSeenTotal) + ')!';
              banner.classList.remove('hidden');
            }
          }
        })
        .catch(() => {});
    }, 15000);

    window.addEventListener('beforeunload', function() {
      clearInterval(pollInterval);
    });

    // Format initial timestamps according to user local timezone
    try {
      document.querySelectorAll('.time-cell').forEach(function(el) {
        var iso = el.getAttribute('data-iso');
        if (iso) {
          var d = new Date(iso);
          if (!isNaN(d.getTime())) {
            el.textContent = d.toLocaleString('ru-RU', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
          }
        }
      });
    } catch (e) {}
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
