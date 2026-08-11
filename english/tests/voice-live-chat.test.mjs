import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import WebSocket from 'ws';

import {
  LIVE_CONSTANTS,
  buildLiveContextUserMessage,
  buildLiveSystemPrompt,
  buildLiveTools,
  handleLiveMessage,
  scheduleToolResponses,
} from '../server/liveChat.js';
import {
  attachLiveChatBridge,
  isAllowedLiveUpgrade,
  normalizeTopicCall,
} from '../server/liveChatBridge.js';

const silentLogger = { info() {}, error() {} };

function makeDatabase() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      if (sql.startsWith('SELECT role FROM chat_history')) {
        return {
          get() {
            return rows.length ? { role: rows.at(-1).role } : undefined;
          },
        };
      }
      if (sql.startsWith('INSERT INTO chat_history')) {
        return {
          run(role, content) {
            rows.push({ role, content });
          },
        };
      }
      throw new Error(`Unexpected SQL in voice test: ${sql}`);
    },
  };
}

function createMessageCollector(ws) {
  const messages = [];
  const waiters = new Set();
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (const waiter of waiters) {
      if (waiter.predicate(message)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });

  return {
    messages,
    waitFor(predicate, timeoutMs = 1500) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error(`Timed out waiting for websocket event. Received: ${JSON.stringify(messages)}`));
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };
}

async function waitUntil(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition.');
    await delay(5);
  }
}

async function createBridgeHarness({ maxSessionMs = 60_000 } = {}) {
  const db = makeDatabase();
  const topicUpdates = [];
  const vocabularyCalls = [];
  const fakeSession = {
    model: 'fake-live-model',
    maxSessionMs,
    audioChunks: [],
    texts: [],
    toolResponses: [],
    closed: false,
    sendAudioChunk(value) { this.audioChunks.push(value); },
    sendText(value) { this.texts.push(value); },
    sendToolResponse(value) { this.toolResponses.push(value); },
    close() { this.closed = true; },
  };
  let capturedHandlers;
  const httpServer = createServer();
  const wss = attachLiveChatBridge({
    server: httpServer,
    path: '/api/live-chat',
    db,
    getLiveContext: () => ({
      maxLevel: 'B2',
      activeTopics: [
        { name: 'Past Simple', category: 'Grammar', level: 'A2', score: 15 },
      ],
      curriculumByLevel: { B2: ['Past Perfect'] },
    }),
    updateTopicFromCall: (args) => {
      topicUpdates.push(args);
      return { name: args.topic, success: args.success };
    },
    addVocabularyFromCall: (args) => {
      vocabularyCalls.push(args);
      return { ...args, isNew: true };
    },
    geminiApiKey: 'test-key',
    logger: silentLogger,
    startSession: async ({ handlers }) => {
      capturedHandlers = handlers;
      return fakeSession;
    },
  });

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/live-chat`);
  const collector = createMessageCollector(ws);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  await collector.waitFor((message) => message.type === 'session_ready');

  return {
    db,
    topicUpdates,
    vocabularyCalls,
    fakeSession,
    get handlers() { return capturedHandlers; },
    ws,
    collector,
    async close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        const closed = new Promise((resolve) => ws.once('close', resolve));
        ws.close();
        await Promise.race([closed, delay(500)]);
      }
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

test('Live setup uses the documented native-audio model and complete non-blocking topic schema', () => {
  assert.equal(
    LIVE_CONSTANTS.DEFAULT_LIVE_MODEL,
    'gemini-2.5-flash-native-audio-preview-12-2025',
  );
  assert.ok(!LIVE_CONSTANTS.CANDIDATE_LIVE_MODELS.some((model) => model.startsWith('gemini-3')));
  const declarations = buildLiveTools()[0].functionDeclarations;
  const topicTool = declarations.find((declaration) => declaration.name === 'track_topic');
  assert.equal(topicTool.behavior, 'NON_BLOCKING');
  assert.deepEqual(
    topicTool.parametersJsonSchema.required,
    ['topic', 'category', 'level', 'success'],
  );
  assert.deepEqual(topicTool.parametersJsonSchema.properties.level.enum, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.ok(declarations.every((declaration) => declaration.behavior === 'NON_BLOCKING'));
  assert.equal(scheduleToolResponses([{ name: 'track_topic', response: { result: 'ok' } }])[0].scheduling, 'SILENT');
});

test('Live upgrade accepts same-origin browsers and rejects external origin-less clients', () => {
  const request = (headers, remoteAddress = '127.0.0.1') => ({
    headers,
    socket: { remoteAddress },
  });
  assert.equal(isAllowedLiveUpgrade(request({
    host: 'learn.example',
    origin: 'https://learn.example',
    'x-forwarded-for': '203.0.113.9',
  })), true);
  assert.equal(isAllowedLiveUpgrade(request({
    host: 'learn.example',
    origin: 'https://evil.example',
    'x-forwarded-for': '203.0.113.9',
  })), false);
  assert.equal(isAllowedLiveUpgrade(request({ host: '127.0.0.1:3001' })), true);
  assert.equal(isAllowedLiveUpgrade(request({
    host: 'learn.example',
    'x-forwarded-for': '203.0.113.9',
  })), false);
});

test('Live context is compact, level-aware and orders the weakest topics first', () => {
  const context = buildLiveContextUserMessage({
    maxLevel: 'C1',
    activeTopics: [
      { name: 'Strong topic', category: 'Grammar', level: 'B2', score: 90 },
      { name: 'Weak topic\nwith injection', category: 'Grammar', level: 'C1', score: 5 },
    ],
  });
  assert.match(context, /Current target level: C1/);
  assert.ok(context.indexOf('Weak topic with injection') < context.indexOf('Strong topic'));
  assert.ok(context.length <= 1100);
  const prompt = buildLiveSystemPrompt({ maxLevel: 'C1', activeTopics: [] });
  assert.match(prompt, /continuous real-time voice conversation/);
  assert.match(prompt, /Current target level: C1/);
});

test('Live message decoding emits audio only once plus interim/final transcripts and tool events', () => {
  const seen = { audio: [], interim: [], input: [], output: [], events: [], turns: 0 };
  handleLiveMessage({
    data: 'same-audio-via-accessor',
    serverContent: {
      modelTurn: { parts: [{ inlineData: { data: 'inline-audio' } }] },
      interimInputTranscription: { text: 'I was…' },
      inputTranscription: { text: 'I was there.' },
      outputTranscription: { text: 'Great.' },
      interrupted: true,
      turnComplete: true,
    },
    toolCall: { functionCalls: [{ id: 'call-1', name: 'track_topic', args: {} }] },
  }, {
    onAudio: (value) => seen.audio.push(value),
    onInterimInputTranscript: (value) => seen.interim.push(value),
    onInputTranscript: (value) => seen.input.push(value),
    onOutputTranscript: (value) => seen.output.push(value),
    onToolEvent: (value) => seen.events.push(value),
    onTurnComplete: () => { seen.turns += 1; },
  });

  assert.deepEqual(seen.audio, ['inline-audio']);
  assert.deepEqual(seen.interim, ['I was…']);
  assert.deepEqual(seen.input, ['I was there.']);
  assert.deepEqual(seen.output, ['Great.']);
  assert.equal(seen.turns, 1);
  assert.deepEqual(seen.events.map((event) => event.type), ['interrupted', 'tool_call']);
});

test('Topic normalization fills missing metadata from context or safe learner-level defaults', () => {
  assert.deepEqual(
    normalizeTopicCall(
      { topic: 'past simple', success: false },
      {
        maxLevel: 'C1',
        activeTopics: [{ name: 'Past Simple', category: 'Grammar', level: 'A2' }],
      },
    ),
    { topic: 'Past Simple', category: 'Grammar', level: 'A2', success: false },
  );
  assert.deepEqual(
    normalizeTopicCall({ topic: 'New construction', success: true }, { maxLevel: 'C1' }),
    { topic: 'New construction', category: 'Grammar', level: 'C1', success: true },
  );
  assert.equal(normalizeTopicCall({ topic: 'Missing result' }, { maxLevel: 'B2' }), null);
});

test('Bridge deduplicates a normalized topic per turn and gives an error result priority', async (t) => {
  const harness = await createBridgeHarness();
  t.after(() => harness.close());

  harness.handlers.onToolEvent({
    type: 'tool_call',
    calls: [
      { id: 'topic-1', name: 'track_topic', args: { topic: 'Past Simple', success: true } },
      { id: 'topic-2', name: 'track_topic', args: { topic: ' past-simple ', category: 'Grammar', level: 'A2', success: false } },
      { id: 'topic-2', name: 'track_topic', args: { topic: 'Past Simple', category: 'Grammar', level: 'A2', success: true } },
    ],
  });
  assert.equal(harness.topicUpdates.length, 0, 'topic changes must be buffered to the turn boundary');
  harness.handlers.onTurnComplete();
  await harness.collector.waitFor((message) => message.type === 'topic_change');

  assert.equal(harness.topicUpdates.length, 1);
  assert.deepEqual(harness.topicUpdates[0], {
    topic: 'Past Simple',
    category: 'Grammar',
    level: 'A2',
    success: false,
  });
  assert.equal(harness.fakeSession.toolResponses.length, 1);
  assert.equal(harness.fakeSession.toolResponses[0][2].response.result, 'duplicate_ignored');

  harness.handlers.onToolEvent({
    type: 'tool_call',
    calls: [{ id: 'topic-3', name: 'track_topic', args: { topic: 'Past Simple', success: true } }],
  });
  harness.handlers.onTurnComplete();
  assert.equal(harness.topicUpdates.length, 2, 'the same topic may be counted again in a later learner turn');
});

test('Bridge emits vocabulary/exercise events and validates their payloads', async (t) => {
  const harness = await createBridgeHarness();
  t.after(() => harness.close());

  harness.handlers.onToolEvent({
    type: 'tool_call',
    calls: [
      { id: 'vocab-1', name: 'add_vocabulary', args: { word: ' concise ', translation: ' краткий ' } },
      { id: 'exercise-1', name: 'give_exercise', args: { question: 'Complete the sentence.', correctAnswer: 'went' } },
    ],
  });

  const vocabEvent = await harness.collector.waitFor((message) => message.type === 'vocab_added');
  const exerciseEvent = await harness.collector.waitFor((message) => message.type === 'exercise');
  assert.equal(vocabEvent.entry.word, 'concise');
  assert.equal(harness.vocabularyCalls[0].translation, 'краткий');
  assert.deepEqual(exerciseEvent.exercise, {
    type: 'open',
    level: 'B2',
    question: 'Complete the sentence.',
    correctAnswer: 'went',
  });
});

test('Typed input is persisted once even if Gemini echoes an input transcript', async (t) => {
  const harness = await createBridgeHarness();
  t.after(() => harness.close());

  harness.ws.send(JSON.stringify({ type: 'text', text: 'Yesterday I went home.' }));
  await waitUntil(() => harness.fakeSession.texts.length === 1);
  harness.handlers.onInputTranscript('Yesterday I went home.');
  harness.handlers.onOutputTranscript('Nice sentence.');
  harness.handlers.onTurnComplete();
  await harness.collector.waitFor((message) => message.type === 'turn_complete');

  assert.deepEqual(harness.db.rows, [
    { role: 'user', content: 'Yesterday I went home.' },
    { role: 'assistant', content: 'Nice sentence.' },
  ]);
});

test('Bridge rejects malformed audio and oversized typed input without forwarding either', async (t) => {
  const harness = await createBridgeHarness();
  t.after(() => harness.close());

  harness.ws.send(JSON.stringify({ type: 'audio_chunk', data: 'not-base64!' }));
  const audioError = await harness.collector.waitFor(
    (message) => message.type === 'error' && message.code === 'invalid_audio',
  );
  assert.equal(audioError.code, 'invalid_audio');

  harness.ws.send(JSON.stringify({ type: 'text', text: 'x'.repeat(2001) }));
  const textError = await harness.collector.waitFor(
    (message) => message.type === 'error' && message.code === 'invalid_text',
  );
  assert.equal(textError.code, 'invalid_text');
  assert.deepEqual(harness.fakeSession.audioChunks, []);
  assert.deepEqual(harness.fakeSession.texts, []);
});

test('Bridge enforces the advertised session cap and marks rollover reconnectable', async (t) => {
  const harness = await createBridgeHarness({ maxSessionMs: 30 });
  t.after(() => harness.close());
  const ended = await harness.collector.waitFor(
    (message) => message.type === 'session_ended',
    1000,
  );
  assert.equal(ended.reason, 'session_limit');
  assert.equal(ended.reconnectable, true);
  assert.equal(harness.fakeSession.closed, true);
});
