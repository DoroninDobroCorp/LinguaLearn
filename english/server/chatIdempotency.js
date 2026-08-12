import { migrateMultiUserSchema } from './dbMigration.js';

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

    if (!history.length && role !== 'user') continue;
    const previous = history.at(-1);
    if (previous?.role === role) {
      previous.parts[0].text += `\n${content}`;
    } else {
      history.push({ role, parts: [{ text: content }] });
    }
  }

  if (history.at(-1)?.role === 'user') history.pop();
  return history;
}

export function migrateChatIdempotencySchema(db) {
  migrateMultiUserSchema(db);
}

export function createChatIdempotencyStore(db) {
  migrateChatIdempotencySchema(db);
  db.prepare("DELETE FROM chat_requests WHERE status = 'processing'").run();

  return {
    begin(messageId, requestText, userIdInput) {
      if (!messageId) return { state: 'legacy' };
      const userId = userIdInput || 1;

      const existing = db.prepare('SELECT * FROM chat_requests WHERE message_id = ?').get(messageId);
      if (existing) {
        if (existing.user_id !== userId) {
          throw chatHttpError(403, 'Access denied to chat request ID.', 'FORBIDDEN');
        }
        if (existing.request_text !== requestText) {
          throw chatHttpError(
            409,
            'messageId is already associated with a different message.',
            'MESSAGE_ID_CONFLICT',
          );
        }
        if (existing.status === 'processing') return { state: 'processing' };
        try {
          return { state: 'cached', response: JSON.parse(existing.response_json) };
        } catch {
          throw chatHttpError(500, 'Stored chat response is corrupt.', 'CORRUPT_CHAT_RESPONSE');
        }
      }

      const inserted = db.prepare(`
        INSERT OR IGNORE INTO chat_requests (message_id, user_id, request_text, status)
        VALUES (?, ?, ?, 'processing')
      `).run(messageId, userId, requestText);

      const row = db.prepare('SELECT * FROM chat_requests WHERE message_id = ? AND user_id = ?').get(messageId, userId);
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

    complete(messageId, response, userIdInput) {
      if (!messageId) return;
      const userId = userIdInput || 1;
      const updated = db.prepare(`
        UPDATE chat_requests
        SET status = 'completed', response_json = ?, completed_at = CURRENT_TIMESTAMP
        WHERE message_id = ? AND user_id = ? AND status = 'processing'
      `).run(JSON.stringify(response), messageId, userId);
      if (Number(updated.changes) !== 1) {
        throw chatHttpError(409, 'Chat request was already finalized.', 'CHAT_ALREADY_FINALIZED');
      }
    },

    release(messageId, userIdInput) {
      if (!messageId) return;
      const userId = userIdInput || 1;
      db.prepare(`
        DELETE FROM chat_requests
        WHERE message_id = ? AND user_id = ? AND status = 'processing'
      `).run(messageId, userId);
    },
  };
}
