// REST API for the conversation coach, mounted at /api/coach after the
// profile-selection middleware (req.profileId is already validated and, for
// PIN-locked profiles, unlocked).

import express from 'express';
import { CoachAiError, isCoachAiConfigured, synthesizeSpeech } from './coachGemini.js';
import { getLearner, removeLearnerMemory, setProfileLearningTrack, upsertLearner, archiveSpot } from './coachStore.js';
import {
  CoachError,
  answerWorkoutItem,
  finishSession,
  getCatalog,
  getDashboard,
  getMessageFeedback,
  getOrCreateNextWorkout,
  getSessionDetail,
  getSpotDetail,
  getSpotLesson,
  getWorkoutDetail,
  listSessionSummaries,
  postUserMessage,
  retryAnalysis,
  retryReply,
  startSession,
  startWorkoutGeneration,
  suggestReply,
  translateMessage,
} from './coachService.js';
import { ONBOARDING_GOALS, ONBOARDING_INTERESTS } from './coachTaxonomy.js';

const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_LIMIT = 40;
const aiHits = new Map();

function aiRateLimit(req, res, next) {
  const bucket = `${req.profileId}`;
  const now = Date.now();
  const hits = (aiHits.get(bucket) || []).filter((stamp) => now - stamp < AI_RATE_WINDOW_MS);
  if (hits.length >= AI_RATE_LIMIT) {
    return res.status(429).json({ error: 'Слишком много запросов подряд — подождите минутку.', code: 'COACH_RATE_LIMIT' });
  }
  hits.push(now);
  aiHits.set(bucket, hits);
  return next();
}

function requireAi(req, res, next) {
  if (isCoachAiConfigured()) return next();
  return res.status(503).json({ error: 'ИИ не настроен на сервере.', code: 'AI_NOT_CONFIGURED' });
}

function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (result !== undefined && !res.headersSent) res.json(result);
    } catch (error) {
      if (res.headersSent) return;
      if (error instanceof CoachError || error instanceof CoachAiError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[coach] route error:', error);
      return res.status(500).json({ error: 'Что-то пошло не так. Попробуйте ещё раз.', code: 'COACH_INTERNAL' });
    }
  };
}

export function createCoachRoutes({ db }) {
  const router = express.Router();
  const pid = (req) => req.profileId;

  router.get('/catalog', handle(() => ({
    ...getCatalog(),
    onboarding: { interests: ONBOARDING_INTERESTS, goals: ONBOARDING_GOALS },
    voices: [
      { id: 'Sulafat', label_ru: 'Тёплый женский' },
      { id: 'Aoede', label_ru: 'Лёгкий женский' },
      { id: 'Kore', label_ru: 'Уверенный женский' },
      { id: 'Leda', label_ru: 'Молодой женский' },
      { id: 'Puck', label_ru: 'Бодрый мужской' },
      { id: 'Charon', label_ru: 'Спокойный мужской' },
    ],
  })));

  router.get('/profile', handle((req) => ({ learner: getLearner(db, pid(req)) })));

  router.put('/profile', handle((req) => {
    const body = req.body || {};
    const learner = upsertLearner(db, pid(req), body, { markOnboarded: Boolean(body.onboarded) });
    if (body.onboarded) setProfileLearningTrack(db, pid(req), 'conversation');
    return { learner };
  }));

  router.delete('/profile/memory/:index', handle((req) => ({ memory: removeLearnerMemory(db, pid(req), Number(req.params.index)) })));

  router.get('/dashboard', handle((req) => getDashboard(db, pid(req))));

  router.get('/sessions', handle((req) => ({ sessions: listSessionSummaries(db, pid(req), Math.min(50, Number(req.query.limit) || 20)) })));

  router.post('/sessions', requireAi, aiRateLimit, handle((req) => startSession(db, pid(req), {
    mode: req.body?.mode,
    topicId: req.body?.topicId,
    scenarioId: req.body?.scenarioId,
    customTopic: req.body?.customTopic,
    customScenario: req.body?.customScenario && typeof req.body.customScenario === 'object' ? req.body.customScenario : null,
  })));

  router.get('/sessions/:id', handle((req) => getSessionDetail(db, pid(req), Number(req.params.id))));

  router.post('/sessions/:id/messages', requireAi, aiRateLimit, handle((req) => postUserMessage(db, pid(req), Number(req.params.id), {
    text: req.body?.text,
    audio: req.body?.audio,
    mimeType: req.body?.mimeType,
  })));

  router.post('/sessions/:id/retry-reply', requireAi, aiRateLimit, handle((req) => retryReply(db, pid(req), Number(req.params.id))));

  router.post('/sessions/:id/hint', requireAi, aiRateLimit, handle((req) => suggestReply(db, pid(req), Number(req.params.id))));

  router.post('/sessions/:id/finish', requireAi, handle((req) => finishSession(db, pid(req), Number(req.params.id))));

  router.post('/sessions/:id/retry-analysis', requireAi, handle((req) => retryAnalysis(db, pid(req), Number(req.params.id))));

  router.get('/messages/:id/feedback', handle((req) => getMessageFeedback(db, pid(req), Number(req.params.id))));

  router.post('/messages/:id/translate', requireAi, aiRateLimit, handle((req) => translateMessage(db, pid(req), Number(req.params.id))));

  router.post('/tts', requireAi, aiRateLimit, handle(async (req, res) => {
    const learner = getLearner(db, pid(req));
    const { audio, mimeType, cached } = await synthesizeSpeech({
      text: req.body?.text,
      voice: req.body?.voice || learner?.partner_voice,
      style: req.body?.style === 'formal' ? 'formal' : 'rioplatense',
    });
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('X-Coach-TTS-Cache', cached ? 'hit' : 'miss');
    res.send(audio);
    return undefined;
  }));

  router.get('/spots', handle((req) => ({ spots: getDashboard(db, pid(req)).spots })));

  router.get('/spots/:id', handle((req) => getSpotDetail(db, pid(req), Number(req.params.id))));

  router.get('/spots/:id/lesson', requireAi, aiRateLimit, handle((req) => getSpotLesson(db, pid(req), Number(req.params.id))));

  router.post('/spots/:id/archive', handle((req) => {
    archiveSpot(db, pid(req), Number(req.params.id));
    return { ok: true };
  }));

  router.post('/workouts', requireAi, aiRateLimit, handle((req) => {
    const spotKeys = Array.isArray(req.body?.spotKeys) ? req.body.spotKeys.slice(0, 3) : null;
    return { id: startWorkoutGeneration(db, pid(req), { spotKeys }) };
  }));

  router.post('/workouts/next', requireAi, aiRateLimit, handle((req) => ({ id: getOrCreateNextWorkout(db, pid(req)) })));

  router.get('/workouts/:id', handle((req) => getWorkoutDetail(db, pid(req), Number(req.params.id), { wait: req.query.wait === '1' })));

  router.post('/workouts/:id/items/:itemId/answer', requireAi, aiRateLimit, handle((req) => answerWorkoutItem(
    db,
    pid(req),
    Number(req.params.id),
    Number(req.params.itemId),
    req.body || {},
  )));

  return router;
}
