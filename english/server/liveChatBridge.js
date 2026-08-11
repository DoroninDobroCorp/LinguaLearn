import { WebSocketServer } from 'ws';
import { startLiveSession } from './liveChat.js';

// One browser WebSocket owns one Gemini Live session. Voice transcripts share
// chat_history with text chat, while tool calls update the same curriculum and
// vocabulary tables through callbacks supplied by server/index.js.
const INPUT_BUFFER_LIMIT = 4000;
const OUTPUT_BUFFER_LIMIT = 8000;
const CLIENT_MESSAGE_BYTES_LIMIT = 96 * 1024;
const AUDIO_CHUNK_BASE64_LIMIT = 64 * 1024;
const AUDIO_SESSION_BYTES_LIMIT = 34 * 1024 * 1024;
const CLIENT_MESSAGE_COUNT_LIMIT = 6000;
const TEXT_MESSAGE_COUNT_LIMIT = 200;
const TEXT_MESSAGE_CHARS_LIMIT = 2000;
const TOOL_CALL_COUNT_LIMIT = 256;
const LIVE_CONNECTIONS_PER_IP_LIMIT = 2;
const LIVE_CONNECTIONS_TOTAL_LIMIT = 8;
const READY_STATES = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };
const CEFR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const TOPIC_CATEGORIES = new Set(['Grammar', 'Vocabulary', 'Speaking']);

export const LIVE_BRIDGE_LIMITS = Object.freeze({
  CLIENT_MESSAGE_BYTES_LIMIT,
  AUDIO_CHUNK_BASE64_LIMIT,
  AUDIO_SESSION_BYTES_LIMIT,
  CLIENT_MESSAGE_COUNT_LIMIT,
  TEXT_MESSAGE_COUNT_LIMIT,
  TEXT_MESSAGE_CHARS_LIMIT,
  TOOL_CALL_COUNT_LIMIT,
  LIVE_CONNECTIONS_PER_IP_LIMIT,
  LIVE_CONNECTIONS_TOTAL_LIMIT,
});

function clientAddress(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || '');
}

function isLoopbackAddress(value) {
  const address = String(value || '').toLowerCase();
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// Browsers must originate from the same public host. Origin-less clients are
// accepted only when they connect directly over loopback (used by local tests),
// never when nginx reports an external X-Forwarded-For address.
export function isAllowedLiveUpgrade(req) {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return isLoopbackAddress(clientAddress(req));
  try {
    const parsed = new URL(origin);
    const host = String(req?.headers?.host || '').toLowerCase();
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function safeSend(ws, payload) {
  if (ws.readyState !== READY_STATES.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function sendError(ws, message, code = 'voice_error') {
  safeSend(ws, { type: 'error', message, code });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength);
}

function cleanTranscriptFragment(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .slice(0, maxLength);
}

function normalizeTopicKey(value) {
  return cleanString(value, 120)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeVoiceName(value) {
  const voice = cleanString(value, 32);
  return /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(voice) ? voice : '';
}

function contextTopicCandidates(liveContext) {
  const candidates = [];
  for (const topic of Array.isArray(liveContext?.activeTopics) ? liveContext.activeTopics : []) {
    if (topic?.name) candidates.push(topic);
  }
  if (isObject(liveContext?.curriculumByLevel)) {
    for (const [level, topics] of Object.entries(liveContext.curriculumByLevel)) {
      for (const topic of Array.isArray(topics) ? topics : []) {
        if (typeof topic === 'string') {
          candidates.push({ name: topic, level });
        } else if (topic?.name) {
          candidates.push({ ...topic, level: topic.level || level });
        }
      }
    }
  }
  return candidates;
}

// The schema requires category and level, but model output still needs a safe
// fallback. Exact context matches recover canonical metadata; genuinely new
// grammar topics fall back to Grammar and the learner's current level.
export function normalizeTopicCall(args, liveContext = {}) {
  if (!isObject(args) || typeof args.success !== 'boolean') return null;
  const topic = cleanString(args.topic, 120);
  const key = normalizeTopicKey(topic);
  if (!topic || !key) return null;

  const match = contextTopicCandidates(liveContext).find(
    (candidate) => normalizeTopicKey(candidate.name) === key,
  );
  const requestedLevel = String(args.level || '').toUpperCase();
  const matchedLevel = String(match?.level || '').toUpperCase();
  const contextLevel = String(liveContext?.maxLevel || '').toUpperCase();

  return {
    topic: cleanString(match?.name, 120) || topic,
    category: TOPIC_CATEGORIES.has(args.category)
      ? args.category
      : TOPIC_CATEGORIES.has(match?.category)
        ? match.category
        : 'Grammar',
    level: CEFR_LEVELS.has(requestedLevel)
      ? requestedLevel
      : CEFR_LEVELS.has(matchedLevel)
        ? matchedLevel
        : CEFR_LEVELS.has(contextLevel)
          ? contextLevel
          : 'B2',
    success: args.success,
  };
}

function normalizeVocabularyCall(args) {
  if (!isObject(args)) return null;
  const word = cleanString(args.word, 100);
  const translation = cleanString(args.translation, 240);
  if (!word || !translation) return null;
  const example = cleanString(args.example, 500);
  return { word, translation, ...(example ? { example } : {}) };
}

function normalizeExerciseCall(args, liveContext) {
  if (!isObject(args)) return null;
  const question = cleanString(args.question, 500);
  const correctAnswer = cleanString(args.correctAnswer, 300);
  if (!question || !correctAnswer) return null;
  const level = String(liveContext?.maxLevel || '').toUpperCase();
  return {
    type: 'open',
    level: CEFR_LEVELS.has(level) ? level : 'B2',
    question,
    correctAnswer,
  };
}

function decodedBase64Bytes(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > AUDIO_CHUNK_BASE64_LIMIT ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return -1;
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = (value.length / 4) * 3 - padding;
  return bytes > 0 && bytes % 2 === 0 ? bytes : -1;
}

function rawByteLength(raw) {
  if (typeof raw === 'string') return Buffer.byteLength(raw);
  if (Buffer.isBuffer(raw)) return raw.byteLength;
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (ArrayBuffer.isView(raw)) return raw.byteLength;
  return CLIENT_MESSAGE_BYTES_LIMIT + 1;
}

// Attach the realtime endpoint. `startSession` is injectable for focused tests;
// production callers use startLiveSession from the Gemini module.
export function attachLiveChatBridge({
  server,
  path,
  db,
  getLiveContext,
  updateTopicFromCall,
  addVocabularyFromCall,
  geminiApiKey,
  logger = console,
  startSession = startLiveSession,
}) {
  const wss = new WebSocketServer({
    server,
    path,
    maxPayload: CLIENT_MESSAGE_BYTES_LIMIT,
    verifyClient: ({ req }, done) => {
      const allowed = isAllowedLiveUpgrade(req);
      done(allowed, allowed ? undefined : 403, allowed ? undefined : 'Forbidden');
    },
  });

  const activeConnectionsByIP = new Map();
  let activeConnections = 0;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const voiceName = normalizeVoiceName(url.searchParams.get('voice') || '');
    const ip = clientAddress(req);
    const activeForIP = activeConnectionsByIP.get(ip) || 0;
    if (
      activeConnections >= LIVE_CONNECTIONS_TOTAL_LIMIT ||
      activeForIP >= LIVE_CONNECTIONS_PER_IP_LIMIT
    ) {
      logger.info?.(`[live-chat] connection rejected by concurrency limit (ip=${ip})`);
      ws.close(1013, 'connection_limit');
      return;
    }
    activeConnections += 1;
    activeConnectionsByIP.set(ip, activeForIP + 1);
    let connectionCountReleased = false;
    const releaseConnectionCount = () => {
      if (connectionCountReleased) return;
      connectionCountReleased = true;
      activeConnections = Math.max(0, activeConnections - 1);
      const remaining = Math.max(0, (activeConnectionsByIP.get(ip) || 1) - 1);
      if (remaining) activeConnectionsByIP.set(ip, remaining);
      else activeConnectionsByIP.delete(ip);
    };
    ws.once('close', releaseConnectionCount);
    logger.info?.(`[live-chat] connection opened (ip=${ip}, voice=${voiceName || 'default'})`);

    let session = null;
    let browserClosed = false;
    let ending = false;
    let inputBuffer = '';
    let outputBuffer = '';
    let clientMessageCount = 0;
    let textMessageCount = 0;
    let audioBytes = 0;
    let toolCallCount = 0;
    let sessionLimitTimer = null;
    const typedTranscriptEchoes = [];
    const processedToolCallIds = new Set();
    const pendingTopicCalls = new Map();
    const pendingFunctionResponses = [];

    const clearSessionTimer = () => {
      if (sessionLimitTimer) {
        clearTimeout(sessionLimitTimer);
        sessionLimitTimer = null;
      }
    };

    // Preserve the alternating history shape expected by the legacy text-chat
    // replay code without changing that code path.
    const persistRole = (role, content) => {
      const safeContent = cleanString(content, role === 'user' ? 5000 : 8000);
      if (!safeContent) return;
      try {
        const last = db.prepare('SELECT role FROM chat_history ORDER BY id DESC LIMIT 1').get();
        if (last && last.role === role) {
          const placeholder = role === 'assistant' ? '(voice input)' : '(voice reply)';
          const opposite = role === 'assistant' ? 'user' : 'assistant';
          db.prepare('INSERT INTO chat_history (role, content) VALUES (?, ?)').run(opposite, placeholder);
        }
        db.prepare('INSERT INTO chat_history (role, content) VALUES (?, ?)').run(role, safeContent);
      } catch (err) {
        logger.error?.(`[live-chat] failed to persist ${role} transcript:`, err.message);
      }
    };

    const flushTranscripts = (reason) => {
      const userText = inputBuffer.trim();
      const assistantText = outputBuffer.trim();
      if (userText) persistRole('user', userText);
      if (assistantText) persistRole('assistant', assistantText);
      inputBuffer = '';
      outputBuffer = '';
      typedTranscriptEchoes.length = 0;
      logger.info?.(
        `[live-chat] flushed transcripts (${reason}) user=${userText.length}ch assistant=${assistantText.length}ch`,
      );
    };

    let liveContext;
    try {
      liveContext = getLiveContext?.() || {};
      if (!isObject(liveContext)) throw new Error('Voice context must be an object.');
    } catch (err) {
      logger.error?.('[live-chat] failed to build live context:', err.message);
      sendError(ws, 'Failed to build teaching context.', 'context_failed');
      ws.close(1011, 'context_failed');
      return;
    }

    const flushTopicCalls = (reason) => {
      if (!pendingTopicCalls.size) return;
      for (const args of pendingTopicCalls.values()) {
        try {
          const change = updateTopicFromCall?.(args);
          if (change) safeSend(ws, { type: 'topic_change', change });
        } catch (err) {
          logger.error?.(`[live-chat] topic update failed (${args.topic}):`, err.message);
        }
      }
      logger.info?.(`[live-chat] applied ${pendingTopicCalls.size} deduplicated topic updates (${reason})`);
      pendingTopicCalls.clear();
    };

    const queueTopicCall = (args) => {
      const normalized = normalizeTopicCall(args, liveContext);
      if (!normalized) return false;
      const key = normalizeTopicKey(normalized.topic);
      const existing = pendingTopicCalls.get(key);
      if (existing) {
        // One normalized topic can affect progress only once per learner turn.
        // If the model disagrees with itself, the observed error wins.
        existing.success = existing.success && normalized.success;
      } else {
        pendingTopicCalls.set(key, normalized);
      }
      return true;
    };

    const handleToolCall = (call) => {
      if (!isObject(call) || typeof call.name !== 'string') {
        return { result: 'error', error: 'invalid_function_call' };
      }
      const callId = cleanString(call.id, 128);
      if (callId && processedToolCallIds.has(callId)) {
        return { result: 'duplicate_ignored' };
      }
      if (toolCallCount >= TOOL_CALL_COUNT_LIMIT) {
        return { result: 'error', error: 'tool_call_limit' };
      }
      toolCallCount += 1;
      if (callId) processedToolCallIds.add(callId);
      const args = isObject(call.args) ? call.args : {};

      try {
        if (call.name === 'track_topic') {
          return queueTopicCall(args)
            ? { result: 'queued' }
            : { result: 'error', error: 'invalid_topic' };
        }

        if (call.name === 'add_vocabulary') {
          const normalized = normalizeVocabularyCall(args);
          if (!normalized) return { result: 'error', error: 'invalid_vocabulary' };
          const added = addVocabularyFromCall?.(normalized);
          if (added) safeSend(ws, { type: 'vocab_added', entry: added });
          return { result: 'ok' };
        }

        if (call.name === 'give_exercise') {
          const exercise = normalizeExerciseCall(args, liveContext);
          if (!exercise) return { result: 'error', error: 'invalid_exercise' };
          safeSend(ws, { type: 'exercise', exercise });
          return { result: 'ok' };
        }

        return { result: 'error', error: 'unknown_function' };
      } catch (err) {
        logger.error?.(`[live-chat] tool call ${call.name} failed:`, err.message);
        return { result: 'error', error: 'tool_execution_failed' };
      }
    };

    const sendFunctionResponses = (responses) => {
      if (!responses.length) return;
      if (!session) {
        pendingFunctionResponses.push(...responses);
        return;
      }
      try {
        session.sendToolResponse(responses);
      } catch (err) {
        logger.error?.('[live-chat] failed to send tool response:', err.message);
      }
    };

    const handlers = {
      onAudio: (base64Pcm) => {
        if (typeof base64Pcm === 'string' && base64Pcm.length <= AUDIO_CHUNK_BASE64_LIMIT) {
          safeSend(ws, { type: 'audio', data: base64Pcm });
        }
      },
      onInterimInputTranscript: (text) => {
        const cleanText = cleanTranscriptFragment(text, INPUT_BUFFER_LIMIT);
        if (!cleanText.trim()) return;
        safeSend(ws, { type: 'user_transcript', text: cleanText, interim: true });
      },
      onInputTranscript: (text) => {
        const cleanText = cleanTranscriptFragment(text, INPUT_BUFFER_LIMIT);
        if (!cleanText.trim()) return;
        const echoedTypedIndex = typedTranscriptEchoes.findIndex(
          (typedText) => typedText === cleanText.trim(),
        );
        if (echoedTypedIndex !== -1) {
          typedTranscriptEchoes.splice(echoedTypedIndex, 1);
          return;
        }
        inputBuffer = (inputBuffer + cleanText).slice(0, INPUT_BUFFER_LIMIT);
        safeSend(ws, { type: 'user_transcript', text: cleanText, interim: false });
      },
      onOutputTranscript: (text) => {
        const cleanText = cleanTranscriptFragment(text, OUTPUT_BUFFER_LIMIT);
        if (!cleanText.trim()) return;
        outputBuffer = (outputBuffer + cleanText).slice(0, OUTPUT_BUFFER_LIMIT);
        safeSend(ws, { type: 'assistant_transcript', text: cleanText });
      },
      onToolEvent: (event) => {
        if (event?.type === 'interrupted') {
          safeSend(ws, { type: 'interrupted' });
          outputBuffer = '';
          return;
        }
        if (event?.type !== 'tool_call') return;

        const functionResponses = [];
        for (const call of Array.isArray(event.calls) ? event.calls.slice(0, 20) : []) {
          const response = handleToolCall(call);
          functionResponses.push({
            ...(call?.id ? { id: cleanString(call.id, 128) } : {}),
            name: cleanString(call?.name, 128),
            response,
          });
        }
        sendFunctionResponses(functionResponses.filter((response) => response.name));
      },
      onTurnComplete: () => {
        flushTopicCalls('turn_complete');
        flushTranscripts('turn_complete');
        safeSend(ws, { type: 'turn_complete' });
      },
      onError: (err) => {
        logger.error?.('[live-chat] session error:', err.message);
        sendError(ws, 'Voice session error.', 'gemini_error');
      },
      onClose: (reason) => {
        clearSessionTimer();
        flushTopicCalls('session_close');
        flushTranscripts('session_close');
        logger.info?.(`[live-chat] Gemini session closed: ${reason}`);
        if (!ending && !browserClosed) {
          ending = true;
          safeSend(ws, {
            type: 'session_ended',
            reason: reason || 'Live API session closed',
            reconnectable: true,
          });
          ws.close(1012, 'gemini_session_closed');
        }
      },
    };

    Promise.resolve()
      .then(() => startSession({
        apiKey: geminiApiKey,
        liveContext,
        voiceName,
        handlers,
      }))
      .then((liveSession) => {
        if (browserClosed || ending) {
          liveSession.close();
          return;
        }
        session = liveSession;
        if (pendingFunctionResponses.length) {
          const queued = pendingFunctionResponses.splice(0);
          sendFunctionResponses(queued);
        }
        const maxSessionMs = Math.max(1, Number(session.maxSessionMs) || 15 * 60 * 1000);
        safeSend(ws, {
          type: 'session_ready',
          model: session.model,
          maxSessionMs,
        });
        sessionLimitTimer = setTimeout(() => {
          if (browserClosed || ending) return;
          ending = true;
          flushTopicCalls('session_limit');
          flushTranscripts('session_limit');
          safeSend(ws, {
            type: 'session_ended',
            reason: 'session_limit',
            reconnectable: true,
          });
          try {
            session.close();
          } catch {
            // Already closed by Gemini.
          }
          ws.close(1000, 'session_limit');
        }, maxSessionMs);
      })
      .catch((err) => {
        logger.error?.('[live-chat] failed to start Live session:', err.message);
        sendError(ws, 'Failed to start voice session.', 'session_start_failed');
        ending = true;
        ws.close(1011, 'session_start_failed');
      });

    ws.on('message', (raw) => {
      if (rawByteLength(raw) > CLIENT_MESSAGE_BYTES_LIMIT) {
        sendError(ws, 'Voice message is too large.', 'message_too_large');
        ws.close(1009, 'message_too_large');
        return;
      }
      clientMessageCount += 1;
      if (clientMessageCount > CLIENT_MESSAGE_COUNT_LIMIT) {
        sendError(ws, 'Voice session message limit reached.', 'message_limit');
        ws.close(1008, 'message_limit');
        return;
      }

      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        sendError(ws, 'Invalid JSON message.', 'invalid_json');
        return;
      }
      if (!isObject(payload) || typeof payload.type !== 'string') {
        sendError(ws, 'Invalid voice message.', 'invalid_message');
        return;
      }
      if (!session) {
        sendError(ws, 'Voice session is not ready yet.', 'session_not_ready');
        return;
      }

      if (payload.type === 'audio_chunk') {
        const chunkBytes = decodedBase64Bytes(payload.data);
        if (chunkBytes < 0) {
          sendError(ws, 'Invalid audio chunk.', 'invalid_audio');
          return;
        }
        audioBytes += chunkBytes;
        if (audioBytes > AUDIO_SESSION_BYTES_LIMIT) {
          sendError(ws, 'Voice session audio limit reached.', 'audio_limit');
          ws.close(1008, 'audio_limit');
          return;
        }
        try {
          session.sendAudioChunk(payload.data);
        } catch (err) {
          logger.error?.('[live-chat] failed to forward audio:', err.message);
          sendError(ws, 'Could not forward microphone audio.', 'audio_forward_failed');
        }
        return;
      }

      if (payload.type === 'text') {
        textMessageCount += 1;
        const text = cleanString(payload.text, TEXT_MESSAGE_CHARS_LIMIT);
        if (
          !text ||
          typeof payload.text !== 'string' ||
          payload.text.trim().length > TEXT_MESSAGE_CHARS_LIMIT ||
          textMessageCount > TEXT_MESSAGE_COUNT_LIMIT
        ) {
          sendError(ws, 'Invalid or excessive typed voice input.', 'invalid_text');
          return;
        }
        const previousInputBuffer = inputBuffer;
        try {
          inputBuffer = `${inputBuffer}${inputBuffer && !/\s$/.test(inputBuffer) ? ' ' : ''}${text}`
            .slice(0, INPUT_BUFFER_LIMIT);
          typedTranscriptEchoes.push(text);
          session.sendText(text);
        } catch (err) {
          inputBuffer = previousInputBuffer;
          const echoIndex = typedTranscriptEchoes.lastIndexOf(text);
          if (echoIndex !== -1) typedTranscriptEchoes.splice(echoIndex, 1);
          logger.error?.('[live-chat] failed to forward text:', err.message);
          sendError(ws, 'Could not send typed input.', 'text_forward_failed');
        }
        return;
      }

      sendError(ws, 'Unsupported voice message type.', 'unsupported_message');
    });

    ws.on('close', () => {
      browserClosed = true;
      clearSessionTimer();
      flushTopicCalls('browser_close');
      flushTranscripts('browser_close');
      logger.info?.('[live-chat] browser socket closed');
      if (session) {
        try {
          session.close();
        } catch {
          // Gemini already closed the session.
        }
      }
    });

    ws.on('error', (err) => {
      logger.error?.('[live-chat] browser socket error:', err.message);
    });
  });

  logger.info?.(`[live-chat] WebSocket endpoint mounted at ${path}`);
  return wss;
}
