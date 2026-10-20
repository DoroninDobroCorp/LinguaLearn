// Real-time voice call with the conversation partner (Gemini Live), bridged
// over a WebSocket at /api/coach/live. Transcripts of both sides are stored as
// coach_messages so the same end-of-session analysis runs for calls and chats.
//
// Browser → server: {type:'audio', data:<base64 PCM16 LE 16 kHz mono>} | {type:'text', text} | {type:'end'}
// Server → browser: ready | audio{data: PCM16 24 kHz} | user_transcript{text} | assistant_transcript{text}
//                   | interrupted | turn_complete | warning{message} | ended{reason} | error{message, code}

import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer } from 'ws';
import { getCoachApiKeys } from './coachGemini.js';
import { finishSession, getCallSetup, recordCallTurn } from './coachService.js';
import { listMessages, updateSession } from './coachStore.js';

const LIVE_MODELS = (process.env.COACH_LIVE_MODELS || 'gemini-3.8-live,gemini-3.1-flash-live-preview')
  .split(',').map((model) => model.trim()).filter(Boolean);
const CALL_MAX_MS = 15 * 60 * 1000;
const MAX_AUDIO_FRAME_CHARS = 96 * 1024;
const MAX_TOTAL_CONNECTIONS = 4;
const RESUME_CONTEXT_MESSAGES = 16;

const activeBySession = new Map();
let keyRotation = 0;

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Socket is closing.
    }
  }
}

function resumeBlock(messages) {
  if (!messages.length) return '';
  const lines = messages.slice(-RESUME_CONTEXT_MESSAGES)
    .map((message) => `${message.role === 'user' ? 'ELLA' : 'VOS'}: ${message.content}`)
    .join('\n');
  return `\n\nLA LLAMADA SE CORTÓ UN MOMENTO. Esto es lo que ya hablaron (continuá desde acá, sin volver a presentarte):\n${lines}`;
}

async function connectLive({ system, voice, handlers }) {
  const keys = getCoachApiKeys();
  const errors = [];
  for (const model of LIVE_MODELS) {
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      keyRotation = (keyRotation + 1) % keys.length;
      const apiKey = keys[keyRotation];
      try {
        const ai = new GoogleGenAI({ apiKey });
        let opened = false;
        const session = await ai.live.connect({
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: system,
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
          callbacks: {
            onopen: () => { opened = true; },
            onmessage: (message) => handlers.onmessage(message),
            onerror: (error) => handlers.onerror(error),
            onclose: (event) => handlers.onclose(event, opened),
          },
        });
        return { session, model };
      } catch (error) {
        errors.push(`${model}: ${error.message}`);
      }
    }
  }
  throw new Error(errors.join(' | ') || 'no live model available');
}

export function attachCoachLive({ server, db, path = '/api/coach/live', authorize, logger = console }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return;
    }
    if (url.pathname !== path) return;

    const reject = (status, message) => {
      socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };

    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin) {
      try {
        if (new URL(origin).host !== String(host).split(',')[0].trim()) return reject(403, 'Forbidden');
      } catch {
        return reject(403, 'Forbidden');
      }
    }

    let auth;
    try {
      auth = authorize(url.searchParams);
    } catch (error) {
      return reject(error.status || 401, 'Unauthorized');
    }
    const sessionId = Number(url.searchParams.get('sessionId'));
    if (!Number.isInteger(sessionId) || sessionId <= 0) return reject(400, 'Bad Request');
    if (activeBySession.has(sessionId)) {
      try {
        activeBySession.get(sessionId).close(4000, 'replaced');
      } catch {
        // Previous socket already gone.
      }
    }
    if (activeBySession.size >= MAX_TOTAL_CONNECTIONS) return reject(503, 'Busy');

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, { db, profileId: auth.profileId, sessionId, logger });
    });
  });

  logger.info?.(`[coach-live] WebSocket endpoint mounted at ${path}`);
  return wss;
}

async function handleConnection(ws, { db, profileId, sessionId, logger }) {
  activeBySession.set(sessionId, ws);
  let setup;
  try {
    setup = getCallSetup(db, profileId, sessionId);
  } catch (error) {
    send(ws, { type: 'error', message: error.message, code: error.code || 'SESSION_INVALID' });
    if (activeBySession.get(sessionId) === ws) activeBySession.delete(sessionId);
    ws.close(4004, 'session');
    return;
  }

  const previous = listMessages(db, sessionId);
  const system = setup.system + resumeBlock(previous);
  const opening = previous.length
    ? '[Indicación interna, no la repitas] Se cortó la llamada un segundo y ella volvió. Retomá con naturalidad en una frase ("¡Uy, se cortó! Me decías…") y seguí la charla.'
    : setup.opening;

  let live = null;
  let closed = false;
  let userBuffer = '';
  let assistantBuffer = '';
  let audioFrames = 0;
  const startedAt = Date.now();

  const flush = () => {
    if (userBuffer.trim()) {
      recordCallTurn(db, profileId, sessionId, 'user', userBuffer);
    }
    if (assistantBuffer.trim()) {
      recordCallTurn(db, profileId, sessionId, 'assistant', assistantBuffer);
    }
    userBuffer = '';
    assistantBuffer = '';
  };

  const shutdown = (reason, { notify = true } = {}) => {
    if (closed) return;
    closed = true;
    clearTimeout(limitTimer);
    clearTimeout(warnTimer);
    try {
      flush();
    } catch (error) {
      logger.error?.('[coach-live] flush failed:', error.message);
    }
    try {
      live?.session?.close();
    } catch {
      // Already closed.
    }
    if (notify) send(ws, { type: 'ended', reason });
    if (activeBySession.get(sessionId) === ws) activeBySession.delete(sessionId);
    try {
      ws.close(1000, reason);
    } catch {
      // Already closed.
    }
    // Analyse automatically if the learner actually spoke and she does not come back
    // (a dropped connection gets a minute to reconnect before the call is closed).
    if (reason !== 'reconnect') {
      const delay = reason === 'socket_closed' || reason === 'gemini_closed' ? 60_000 : 4000;
      setTimeout(() => {
        if (activeBySession.has(sessionId)) return;
        const hasSpeech = listMessages(db, sessionId).some((message) => message.role === 'user');
        if (!hasSpeech) return;
        updateSession(db, sessionId, { ended_at: new Date().toISOString() });
        finishSession(db, profileId, sessionId).catch((error) => logger.error?.('[coach-live] auto-finish failed:', error.message));
      }, delay);
    }
    logger.info?.(`[coach-live] call ${sessionId} closed (${reason}) after ${Math.round((Date.now() - startedAt) / 1000)} s, ${audioFrames} frames`);
  };

  const warnTimer = setTimeout(() => send(ws, { type: 'warning', message: 'Осталась минута звонка.' }), CALL_MAX_MS - 60_000);
  const limitTimer = setTimeout(() => shutdown('time_limit'), CALL_MAX_MS);

  try {
    live = await connectLive({
      system,
      voice: setup.voice,
      handlers: {
        onmessage: (message) => {
          if (closed) return;
          const content = message.serverContent;
          if (content?.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (part.inlineData?.data) send(ws, { type: 'audio', data: part.inlineData.data });
            }
          }
          if (content?.inputTranscription?.text) {
            // A new user utterance after the partner spoke: store the partner turn first.
            if (assistantBuffer.trim() && !userBuffer.trim()) {
              recordCallTurn(db, profileId, sessionId, 'assistant', assistantBuffer);
              assistantBuffer = '';
            }
            userBuffer += content.inputTranscription.text;
            send(ws, { type: 'user_transcript', text: content.inputTranscription.text });
          }
          if (content?.outputTranscription?.text) {
            if (userBuffer.trim()) {
              recordCallTurn(db, profileId, sessionId, 'user', userBuffer);
              userBuffer = '';
            }
            assistantBuffer += content.outputTranscription.text;
            send(ws, { type: 'assistant_transcript', text: content.outputTranscription.text });
          }
          if (content?.interrupted) send(ws, { type: 'interrupted' });
          if (content?.turnComplete) {
            flush();
            send(ws, { type: 'turn_complete' });
          }
          if (message.goAway) send(ws, { type: 'warning', message: 'Связь скоро обновится…' });
        },
        onerror: (error) => {
          logger.error?.('[coach-live] gemini error:', error?.message || error);
        },
        onclose: (event) => {
          if (closed) return;
          logger.info?.(`[coach-live] gemini closed ${event?.code} ${event?.reason || ''}`);
          send(ws, { type: 'error', message: 'Связь с собеседницей прервалась.', code: 'LIVE_CLOSED', reconnectable: true });
          shutdown('gemini_closed', { notify: false });
        },
      },
    });
  } catch (error) {
    logger.error?.('[coach-live] failed to start:', error.message);
    send(ws, { type: 'error', message: 'Не удалось начать звонок. Попробуйте ещё раз или напишите в чат.', code: 'LIVE_START_FAILED' });
    shutdown('start_failed', { notify: false });
    return;
  }
  if (closed) {
    try {
      live.session.close();
    } catch {
      // Ignore.
    }
    return;
  }

  send(ws, { type: 'ready', model: live.model, maxMs: CALL_MAX_MS, resumed: previous.length > 0 });
  try {
    live.session.sendRealtimeInput({ text: opening });
  } catch (error) {
    logger.error?.('[coach-live] opening failed:', error.message);
  }

  ws.on('message', (raw) => {
    if (closed) return;
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.type === 'audio' && typeof message.data === 'string') {
      if (message.data.length > MAX_AUDIO_FRAME_CHARS) return;
      audioFrames += 1;
      try {
        live.session.sendRealtimeInput({ audio: { data: message.data, mimeType: 'audio/pcm;rate=16000' } });
      } catch (error) {
        logger.error?.('[coach-live] audio forward failed:', error.message);
      }
    } else if (message?.type === 'text' && typeof message.text === 'string') {
      const text = message.text.trim().slice(0, 1000);
      if (!text) return;
      if (assistantBuffer.trim()) {
        recordCallTurn(db, profileId, sessionId, 'assistant', assistantBuffer);
        assistantBuffer = '';
      }
      recordCallTurn(db, profileId, sessionId, 'user', text);
      try {
        live.session.sendRealtimeInput({ text });
      } catch (error) {
        logger.error?.('[coach-live] text forward failed:', error.message);
      }
    } else if (message?.type === 'end') {
      shutdown('user_ended');
    }
  });

  ws.on('close', (code) => shutdown(code === 4000 ? 'reconnect' : 'socket_closed', { notify: false }));
  ws.on('error', (error) => logger.error?.('[coach-live] socket error:', error.message));
}
