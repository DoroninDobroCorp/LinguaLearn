const MAX_MESSAGE_ID_LENGTH = 200;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function chatHttpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function normalizeOptionalMessageId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw chatHttpError(400, 'messageId must be a string.', 'INVALID_MESSAGE_ID');
  }

  const messageId = value.trim();
  if (
    !messageId ||
    messageId.length > MAX_MESSAGE_ID_LENGTH ||
    !MESSAGE_ID_PATTERN.test(messageId)
  ) {
    throw chatHttpError(
      400,
      'messageId must contain only letters, digits, dot, underscore, colon, or dash.',
      'INVALID_MESSAGE_ID',
    );
  }
  return messageId;
}

export function normalizeGeminiChatHistory(rows) {
  const history = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const role = row?.role === 'user'
      ? 'user'
      : row?.role === 'assistant' || row?.role === 'model'
        ? 'model'
        : null;
    const content = typeof row?.content === 'string' ? row.content.trim() : '';
    if (!role || !content) continue;

    // A LIMIT window may start in the middle of a completed pair. Gemini chat
    // history must always begin with a user turn.
    if (!history.length && role !== 'user') continue;
    const previous = history.at(-1);
    if (previous?.role === role) {
      previous.parts[0].text += `\n${content}`;
    } else {
      history.push({ role, parts: [{ text: content }] });
    }
  }

  // The next operation is another user send, so keep only completed pairs.
  if (history.at(-1)?.role === 'user') history.pop();
  return history;
}

export function migrateChatIdempotencySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_requests (
      message_id TEXT PRIMARY KEY,
      request_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed')),
      response_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chat_requests_status_created
      ON chat_requests(status, created_at);
  `);
}

export function createChatIdempotencyStore(db) {
  migrateChatIdempotencySchema(db);
  // Reservations are normally released/finalized by the request handler. Rows
  // left in processing state therefore belong to an interrupted prior process.
  db.prepare("DELETE FROM chat_requests WHERE status = 'processing'").run();

  return {
    begin(messageId, requestText) {
      if (!messageId) return { state: 'legacy' };

      const inserted = db.prepare(`
        INSERT OR IGNORE INTO chat_requests (message_id, request_text, status)
        VALUES (?, ?, 'processing')
      `).run(messageId, requestText);

      const row = db.prepare('SELECT * FROM chat_requests WHERE message_id = ?').get(messageId);
      if (!row) {
        throw chatHttpError(500, 'Could not reserve chat request.', 'CHAT_RESERVATION_FAILED');
      }

      if (Number(inserted.changes) === 1) return { state: 'reserved' };
      if (row.request_text !== requestText) {
        throw chatHttpError(
          409,
          'messageId is already associated with a different message.',
          'MESSAGE_ID_CONFLICT',
        );
      }
      if (row.status === 'processing') return { state: 'processing' };

      try {
        return { state: 'cached', response: JSON.parse(row.response_json) };
      } catch {
        throw chatHttpError(500, 'Stored chat response is corrupt.', 'CORRUPT_CHAT_RESPONSE');
      }
    },

    complete(messageId, response) {
      if (!messageId) return;
      const updated = db.prepare(`
        UPDATE chat_requests
        SET status = 'completed', response_json = ?, completed_at = CURRENT_TIMESTAMP
        WHERE message_id = ? AND status = 'processing'
      `).run(JSON.stringify(response), messageId);
      if (Number(updated.changes) !== 1) {
        throw chatHttpError(409, 'Chat request was already finalized.', 'CHAT_ALREADY_FINALIZED');
      }
    },

    release(messageId) {
      if (!messageId) return;
      db.prepare(`
        DELETE FROM chat_requests
        WHERE message_id = ? AND status = 'processing'
      `).run(messageId);
    },
  };
}
