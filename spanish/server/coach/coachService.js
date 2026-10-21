// Conversation coach orchestration: sessions, partner replies, inline feedback,
// end-of-session diagnosis, personalised workouts and grading.

import {
  ANALYSIS_SCHEMA,
  FEEDBACK_SCHEMA,
  GRADE_SCHEMA,
  HINT_SCHEMA,
  LESSON_SCHEMA,
  TRANSLATE_PROMPT,
  WORKOUT_REVIEW_SCHEMA,
  WORKOUT_SCHEMA,
  buildAnalysisPrompt,
  buildWorkoutReviewPrompt,
  buildFeedbackPrompt,
  buildGradePrompt,
  buildHintPrompt,
  buildLessonPrompt,
  buildOpeningInstruction,
  buildPartnerSystemPrompt,
  buildWorkoutPrompt,
} from './coachPrompts.js';
import {
  COACH_MODELS,
  CoachAiError,
  generateJson,
  generateText,
  normalizeRecording,
  transcribeSpeech,
} from './coachGemini.js';
import {
  addEvidence,
  addLearnerMemory,
  addMessage,
  applySpotEvidence,
  createSession,
  createWorkoutRow,
  ensureSpot,
  getLearner,
  getMessage,
  getSession,
  getSpot,
  getSpotByKey,
  getWorkout,
  latestOpenWorkout,
  listEvidence,
  listMessages,
  listRecentCustom,
  listSessions,
  listSpots,
  listWorkouts,
  parseJson,
  prioritizedSpots,
  setMessageFeedback,
  setMessageTranslation,
  setSpotLesson,
  updateSession,
  updateWorkout,
} from './coachStore.js';
import { PARTNERS, SCENARIOS, TOPICS, getScenario, getTaxonomySpot, getTopic, normalizeSpotKey } from './coachTaxonomy.js';
import { createVocabularyEntry, createVocabularyGroup, listVocabularyGroups } from '../vocabularyReview.js';
import { addProfileXp } from '../gamification.js';

export class CoachError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_TEXT_MESSAGE = 1200;
const MAX_SESSION_USER_MESSAGES = 120;
const HISTORY_WINDOW = 24;
const VOCAB_GROUP_NAME = 'Из разговоров';

const pendingFeedback = new Map();
const analysisLocks = new Map();
const workoutJobs = new Map();

// ------------------------------------------------------------------ helpers

export function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeAnswer(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:"«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chat bubbles are plain text: drop markdown emphasis and list markers the model sometimes adds. */
export function cleanPartnerText(text) {
  return String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[\s(¿¡"«])[*_]([^*_\n]+)[*_](?=[\s.,;:!?)"»]|$)/g, '$1$2')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim();
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter((token) => /\p{L}/u.test(token)).length;
}

function requireSession(db, profileId, sessionId) {
  const session = getSession(db, profileId, Number(sessionId));
  if (!session) throw new CoachError(404, 'Разговор не найден.', 'SESSION_NOT_FOUND');
  return session;
}

function requireLearner(db, profileId) {
  const learner = getLearner(db, profileId);
  if (!learner) throw new CoachError(404, 'Профиль не найден.', 'PROFILE_NOT_FOUND');
  return learner;
}

function spotForPrompt(spot) {
  const reference = getTaxonomySpot(spot.spot_key);
  return { spot_key: spot.spot_key, title_es: spot.title_es || reference?.title_es, title_ru: spot.title_ru, score: spot.score };
}

function chooseFocusSpots(db, profileId, { topic, scenario }) {
  const spots = listSpots(db, profileId).filter((spot) => spot.status !== 'mastered');
  const preferredKeys = new Set([...(topic?.focus || []), ...(scenario?.focus || [])]);
  const preferred = spots.filter((spot) => preferredKeys.has(spot.spot_key));
  const prioritized = prioritizedSpots(db, profileId, 3);
  const chosen = [];
  for (const spot of [...preferred, ...prioritized]) {
    if (chosen.length >= 3) break;
    if (!chosen.some((item) => item.spot_key === spot.spot_key)) chosen.push(spot);
  }
  // A brand-new learner has no spots yet: use the topic's own structures.
  if (!chosen.length) {
    for (const key of preferredKeys) {
      const reference = getTaxonomySpot(key);
      if (reference) chosen.push({ spot_key: key, title_es: reference.title_es, title_ru: reference.title_ru });
      if (chosen.length >= 2) break;
    }
  }
  return chosen.map(spotForPrompt);
}

function buildContents(messages, openingInstruction) {
  const contents = [{ role: 'user', parts: [{ text: openingInstruction }] }];
  const recent = messages.slice(-HISTORY_WINDOW);
  for (const message of recent) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last.role === role) {
      last.parts[0].text += `\n${message.content}`;
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }
  return contents;
}

// ------------------------------------------------- learner-defined content

const CUSTOM_VOICES = { female: 'Aoede', male: 'Charon' };

function cleanCustomText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function shortTitle(text, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Validate what she typed into "Своя тема" / "Своя ситуация". */
export function normalizeCustomInput({ customTopic, customScenario } = {}) {
  if (customScenario) {
    const character = cleanCustomText(customScenario.character, 200);
    const goal = cleanCustomText(customScenario.goal, 400);
    if (character.length < 3) throw new CoachError(400, 'Напиши, кого играет собеседник.', 'BAD_CUSTOM_SCENARIO');
    if (goal.length < 5) throw new CoachError(400, 'Опиши ситуацию и чего ты хочешь добиться.', 'BAD_CUSTOM_SCENARIO');
    return {
      scenario: {
        character,
        goal,
        name: cleanCustomText(customScenario.name, 40),
        voice: customScenario.voice === 'male' ? 'male' : 'female',
        formal: Boolean(customScenario.formal),
      },
    };
  }
  if (customTopic !== undefined && customTopic !== null) {
    const text = cleanCustomText(customTopic, 300);
    if (text.length < 3) throw new CoachError(400, 'Напиши тему чуть подробнее.', 'BAD_CUSTOM_TOPIC');
    return { topic: { text } };
  }
  return null;
}

function customTopicObject(custom) {
  return {
    id: 'custom',
    custom: true,
    emoji: '✍️',
    title_ru: shortTitle(custom.text),
    opener: `abrí la charla sobre el tema que ella misma eligió: «${custom.text}» (puede estar escrito en ruso: entendelo y hablá en español). Hacé una primera pregunta concreta sobre ese tema`,
    focus: [],
  };
}

function customScenarioObject(custom) {
  return {
    id: 'custom',
    custom: true,
    emoji: '✍️',
    name: custom.name || 'Собеседник',
    title_ru: shortTitle(custom.goal),
    goal_ru: custom.goal,
    character: `${custom.character}${custom.name ? `, que se llama ${custom.name}` : ''} (la descripción puede estar en ruso: interpretala y actuá en español rioplatense); ${custom.formal ? 'trato de usted' : 'trato de vos'}`,
    voice: CUSTOM_VOICES[custom.voice] || CUSTOM_VOICES.female,
    focus: [],
  };
}

/** Topic and scenario of a session, whether from the catalog or typed by her. */
function resolveSessionSetting(session) {
  const custom = session.custom || null;
  const topic = custom?.topic ? customTopicObject(custom.topic) : (session.topic_id ? getTopic(session.topic_id) : null);
  const scenario = custom?.scenario ? customScenarioObject(custom.scenario) : (session.scenario_id ? getScenario(session.scenario_id) : null);
  return { topic, scenario };
}

function sessionPromptContext(db, profileId, session) {
  const learner = requireLearner(db, profileId);
  const { topic, scenario } = resolveSessionSetting(session);
  const focusSpots = (session.focus_keys || []).map((key) => {
    const spot = getSpotByKey(db, profileId, key);
    const reference = getTaxonomySpot(key);
    return { spot_key: key, title_es: spot?.title_es || reference?.title_es, title_ru: spot?.title_ru || reference?.title_ru };
  });
  const isFirstSession = !db.prepare("SELECT 1 FROM coach_sessions WHERE profile_id = ? AND id < ? AND status IN ('analyzed', 'empty') LIMIT 1").get(profileId, session.id);
  const system = buildPartnerSystemPrompt({ learner, memory: learner.memory, focusSpots, topic, scenario, mode: session.mode });
  const opening = buildOpeningInstruction({ learner, topic, scenario, isFirstSession });
  const voice = scenario?.voice || learner.partner_voice || PARTNERS.lucia.voice;
  return { learner, topic, scenario, focusSpots, system, opening, voice };
}

export function describeSessionPartner(session) {
  const { scenario } = resolveSessionSetting(session);
  if (scenario) {
    return { name: scenario.name, role_ru: scenario.title_ru, voice: scenario.voice, formal: /usted/.test(scenario.character) };
  }
  return { name: PARTNERS.lucia.name, role_ru: 'подруга из Буэнос-Айреса', voice: null, formal: false };
}

// ------------------------------------------------------------------ catalog

export function getCatalog() {
  return {
    topics: TOPICS.map(({ id, title_ru, subtitle_ru, emoji }) => ({ id, title_ru, subtitle_ru, emoji })),
    scenarios: SCENARIOS.map(({ id, title_ru, subtitle_ru, emoji, goal_ru }) => ({ id, title_ru, subtitle_ru, emoji, goal_ru })),
    partner: { name: PARTNERS.lucia.name, voice: PARTNERS.lucia.voice },
  };
}

// ----------------------------------------------------------------- sessions

export async function startSession(db, profileId, { mode = 'chat', topicId = 'free', scenarioId = null, customTopic = null, customScenario = null } = {}) {
  requireLearner(db, profileId);
  const safeMode = mode === 'call' ? 'call' : 'chat';
  const custom = normalizeCustomInput({ customTopic, customScenario });
  let topic = null;
  let scenario = null;
  if (custom?.scenario) {
    scenario = customScenarioObject(custom.scenario);
  } else if (custom?.topic) {
    topic = customTopicObject(custom.topic);
  } else {
    scenario = scenarioId ? getScenario(scenarioId) : null;
    if (scenarioId && !scenario) throw new CoachError(400, 'Неизвестная ситуация.', 'BAD_SCENARIO');
    topic = scenario ? null : (getTopic(topicId) || getTopic('free'));
  }

  const focusSpots = chooseFocusSpots(db, profileId, { topic, scenario });
  const session = createSession(db, profileId, {
    mode: safeMode,
    topicId: custom ? null : topic?.id || null,
    scenarioId: custom ? null : scenario?.id || null,
    focusKeys: focusSpots.map((spot) => spot.spot_key),
    custom,
  });

  if (safeMode === 'chat') {
    const context = sessionPromptContext(db, profileId, session);
    try {
      const { text } = await generateText({
        task: 'opening',
        models: COACH_MODELS.chat,
        system: context.system,
        contents: [{ role: 'user', parts: [{ text: context.opening }] }],
        temperature: 0.9,
        maxOutputTokens: 300,
        timeoutMs: 25_000,
      });
      addMessage(db, { sessionId: session.id, profileId, role: 'assistant', content: cleanPartnerText(text) });
    } catch (error) {
      const fallback = scenario
        ? 'Hola, buenas. ¿En qué la puedo ayudar?'
        : `¡Hola, ${context.learner.display_name}! ¿Cómo andás? Contame, ¿qué tal viene tu semana?`;
      addMessage(db, { sessionId: session.id, profileId, role: 'assistant', content: fallback });
      console.warn('[coach] opening generation failed, used fallback:', error.message);
    }
  }
  return getSessionDetail(db, profileId, session.id);
}

export function getSessionDetail(db, profileId, sessionId) {
  const session = requireSession(db, profileId, sessionId);
  const messages = listMessages(db, session.id);
  const { topic, scenario } = resolveSessionSetting(session);
  return {
    ...session,
    partner: describeSessionPartner(session),
    topic: topic ? { id: topic.id, title_ru: topic.title_ru, emoji: topic.emoji } : null,
    scenario: scenario ? { id: scenario.id, title_ru: scenario.title_ru, goal_ru: scenario.goal_ru, emoji: scenario.emoji } : null,
    messages,
  };
}

export function listSessionSummaries(db, profileId, limit = 20) {
  return listSessions(db, profileId, limit).map((session) => {
    const { topic, scenario } = resolveSessionSetting(session);
    return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    started_at: session.started_at,
    ended_at: session.ended_at,
    user_messages: session.user_messages,
    topic: topic ? { id: topic.id, title_ru: topic.title_ru, emoji: topic.emoji } : null,
    scenario: scenario ? { id: scenario.id, title_ru: scenario.title_ru, emoji: scenario.emoji } : null,
    summary_ru: session.analysis?.summary_ru || null,
    cefr_estimate: session.analysis?.cefr_estimate || null,
    stats: session.stats,
    workout_id: session.workout_id,
    };
  });
}

async function prepareUserText({ text, audio, mimeType }) {
  if (audio) {
    const recording = await normalizeRecording(audio, mimeType);
    if (recording.durationSec && recording.durationSec < 0.6) {
      throw new CoachError(400, 'Слишком короткая запись — скажите фразу целиком.', 'AUDIO_TOO_SHORT');
    }
    if (recording.durationSec > 150) {
      throw new CoachError(400, 'Запись длиннее 2,5 минут — лучше разбить на несколько сообщений.', 'AUDIO_TOO_LONG');
    }
    if (recording.maxVolumeDb < -45) {
      throw new CoachError(400, 'Ничего не слышно — проверьте микрофон.', 'AUDIO_SILENT');
    }
    const { text: transcript } = await transcribeSpeech(recording);
    if (!transcript) {
      throw new CoachError(422, 'Не получилось разобрать речь. Попробуйте ещё раз, чуть ближе к микрофону.', 'NO_SPEECH');
    }
    return { content: transcript.slice(0, MAX_TEXT_MESSAGE * 2), inputMode: 'voice', audioSeconds: recording.durationSec };
  }
  const content = String(text || '').trim();
  if (!content) throw new CoachError(400, 'Пустое сообщение.', 'EMPTY_MESSAGE');
  if (content.length > MAX_TEXT_MESSAGE) throw new CoachError(400, 'Сообщение слишком длинное.', 'MESSAGE_TOO_LONG');
  return { content, inputMode: 'text', audioSeconds: null };
}

// Fast models occasionally slip into transliterated Russian ("ne stavit'sya")
// or echo Spanish words inside the Russian explanation. Cheap heuristic check.
export function looksGarbledRussian(text) {
  const value = String(text || '');
  if (!value) return false;
  // Quoted Spanish examples and grammar terms in parentheses are expected.
  const prose = value.replace(/«[^»]*»|"[^"]*"|“[^”]*”|\([^)]*\)/g, ' ').replace(/'[^'\s][^']*[^'\s]'/g, ' ');
  if (/[a-z]+['’][a-z]+/i.test(prose)) return true;
  if (/\b[a-z]{3,}(sya|tsya|yut|yet|aet|ivat|ennyy|nyy|ogo|ovat)\b/i.test(prose)) return true;
  const words = prose.match(/[\p{L}]+/gu) || [];
  const cyrillic = words.filter((word) => /[а-яё]/i.test(word)).length;
  return words.length >= 6 && cyrillic / words.length < 0.4;
}

function feedbackIsGarbled(feedback) {
  return (feedback?.issues || []).some((issue) => looksGarbledRussian(issue.explanation_ru)) || looksGarbledRussian(feedback?.praise_ru);
}

async function computeFeedback(db, message, contextMessages) {
  const contextText = contextMessages
    .slice(-6)
    .map((item) => `${item.role === 'user' ? 'ALUMNA' : 'COMPAÑERA'}: ${item.content}`)
    .join('\n');
  const request = (models) => generateJson({
    task: 'feedback',
    models,
    system: buildFeedbackPrompt({ inputMode: message.input_mode }),
    contents: [{ role: 'user', parts: [{ text: `CONTEXTO:\n${contextText || '(inicio)'}\n\nÚLTIMO MENSAJE DE LA ALUMNA (input=${message.input_mode}):\n${message.content}` }] }],
    schema: FEEDBACK_SCHEMA,
    effort: 'low',
    temperature: 0.2,
    maxOutputTokens: 2048,
    timeoutMs: 40_000,
  });
  let feedback = sanitizeFeedback((await request(COACH_MODELS.feedback)).json, message.content);
  if (feedbackIsGarbled(feedback)) {
    try {
      const retry = sanitizeFeedback((await request(COACH_MODELS.feedback.filter((model) => model !== 'vp:gemini-3-flash' && model !== 'gemini-3.5-flash'))).json, message.content);
      if (!feedbackIsGarbled(retry)) feedback = retry;
    } catch (error) {
      console.warn('[coach] feedback retry failed:', error.message);
    }
  }
  setMessageFeedback(db, message.id, feedback);
  return feedback;
}

// Rebuild a corrected sentence from the remaining issues (used after some of
// them were withdrawn). Returns null if a fragment can't be located.
function applyFixes(content, issues) {
  let result = String(content || '');
  for (const issue of issues) {
    const index = result.toLowerCase().indexOf(String(issue.original || '').toLowerCase());
    if (index < 0) return null;
    result = result.slice(0, index) + issue.fix + result.slice(index + issue.original.length);
  }
  return result;
}

const FILLER_WORD = /^(e+h+|e+m+|m{2,}|a+h+|u+h+|u+m+)$/i;

/** Speech hesitations and stutters are not mistakes ("en en en particular"). */
export function dropDisfluencies(text) {
  const out = [];
  for (const word of normalizeForMatch(text).split(' ').filter(Boolean)) {
    if (FILLER_WORD.test(word) || out[out.length - 1] === word) continue;
    out.push(word);
  }
  return out.join(' ');
}

export function sanitizeFeedback(raw, original) {
  const issues = Array.isArray(raw?.issues) ? raw.issues : [];
  const normalizedOriginal = normalizeForMatch(original);
  const cleanIssues = issues
    .filter((issue) => issue && issue.original && issue.fix)
    .filter((issue) => normalizeForMatch(issue.original) !== normalizeForMatch(issue.fix))
    // An "error" that only removes a stutter or an "eh" is just spoken disfluency.
    .filter((issue) => dropDisfluencies(issue.original) !== dropDisfluencies(issue.fix))
    // Guard against invented quotes: the fragment must really be in her message.
    .filter((issue) => normalizedOriginal.includes(normalizeForMatch(issue.original)) || issue.type === 'vocabulary')
    .slice(0, 5)
    .map((issue) => ({
      original: String(issue.original).slice(0, 200),
      fix: String(issue.fix).slice(0, 200),
      explanation_ru: String(issue.explanation_ru || '').slice(0, 300),
      type: ['grammar', 'vocabulary', 'spelling', 'style'].includes(issue.type) ? issue.type : 'grammar',
      spot_key: normalizeSpotKey(issue.spot_key || ''),
      severity: ['high', 'medium', 'low'].includes(issue.severity) ? issue.severity : 'medium',
    }));
  let verdict = cleanIssues.length === 0 ? 'perfect' : cleanIssues.every((issue) => issue.severity === 'low') ? 'minor' : 'errors';
  const corrected = verdict === 'perfect' ? original : String(raw?.corrected || original).slice(0, MAX_TEXT_MESSAGE * 2);
  if (verdict !== 'perfect' && normalizeForMatch(corrected) === normalizedOriginal && cleanIssues.every((issue) => issue.type !== 'vocabulary')) {
    verdict = 'minor';
  }
  const natural = String(raw?.natural || '').trim();
  return {
    verdict,
    corrected,
    natural: natural && normalizeForMatch(natural) !== normalizeForMatch(corrected) ? natural.slice(0, 600) : '',
    issues: cleanIssues,
    praise_ru: String(raw?.praise_ru || '').trim().slice(0, 200),
  };
}

export async function postUserMessage(db, profileId, sessionId, payload) {
  const session = requireSession(db, profileId, sessionId);
  if (session.status !== 'active') throw new CoachError(409, 'Этот разговор уже завершён.', 'SESSION_CLOSED');
  if (session.mode !== 'chat') throw new CoachError(400, 'Сообщения в звонке идут через голосовой канал.', 'WRONG_MODE');
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM coach_messages WHERE session_id = ? AND role = 'user'").get(session.id).count;
  if (userCount >= MAX_SESSION_USER_MESSAGES) throw new CoachError(409, 'Разговор получился очень длинным — завершите его, чтобы получить разбор.', 'SESSION_TOO_LONG');

  const { content, inputMode, audioSeconds } = await prepareUserText(payload);
  const previous = listMessages(db, session.id);
  const userMessage = addMessage(db, { sessionId: session.id, profileId, role: 'user', content, inputMode, audioSeconds });

  const learner = requireLearner(db, profileId);
  let feedbackPromise = null;
  if (learner.show_inline_feedback) {
    feedbackPromise = computeFeedback(db, userMessage, previous).catch((error) => {
      console.warn('[coach] inline feedback failed:', error.message);
      return null;
    });
    pendingFeedback.set(userMessage.id, feedbackPromise);
    // A failed check is forgotten at once so that "Повторить" really recomputes it.
    feedbackPromise.then((result) => {
      if (!result) pendingFeedback.delete(userMessage.id);
      else setTimeout(() => pendingFeedback.delete(userMessage.id), 60_000);
    });
  }

  const context = sessionPromptContext(db, profileId, session);
  let replyText;
  try {
    const result = await generateText({
      task: 'reply',
      models: COACH_MODELS.chat,
      system: context.system,
      contents: buildContents([...previous, userMessage], context.opening),
      temperature: 0.85,
      maxOutputTokens: 400,
      timeoutMs: 30_000,
    });
    replyText = result.text;
  } catch (error) {
    // Keep the user's message; the client can retry the reply.
    throw new CoachError(503, error instanceof CoachAiError ? error.message : 'Не удалось получить ответ. Попробуйте ещё раз.', 'REPLY_FAILED');
  }
  const assistantMessage = addMessage(db, { sessionId: session.id, profileId, role: 'assistant', content: cleanPartnerText(replyText) });

  // Give the feedback a short head start so it usually arrives together with the reply.
  const feedback = feedbackPromise
    ? await Promise.race([feedbackPromise, new Promise((resolve) => setTimeout(() => resolve(undefined), 1500))])
    : null;

  return {
    user_message: { ...userMessage, feedback: feedback || null },
    assistant_message: assistantMessage,
    feedback_pending: feedback === undefined,
    feedback_failed: Boolean(feedbackPromise) && feedback === null,
  };
}

export async function retryReply(db, profileId, sessionId) {
  const session = requireSession(db, profileId, sessionId);
  if (session.status !== 'active' || session.mode !== 'chat') throw new CoachError(409, 'Разговор уже завершён.', 'SESSION_CLOSED');
  const messages = listMessages(db, session.id);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new CoachError(409, 'Нет сообщения без ответа.', 'NOTHING_TO_RETRY');
  }
  const context = sessionPromptContext(db, profileId, session);
  const { text } = await generateText({
    task: 'reply-retry',
    models: COACH_MODELS.chat,
    system: context.system,
    contents: buildContents(messages, context.opening),
    temperature: 0.85,
    maxOutputTokens: 400,
    timeoutMs: 30_000,
  });
  return { assistant_message: addMessage(db, { sessionId: session.id, profileId, role: 'assistant', content: cleanPartnerText(text) }) };
}

export async function getMessageFeedback(db, profileId, messageId) {
  const message = getMessage(db, Number(messageId));
  if (!message || message.role !== 'user') throw new CoachError(404, 'Сообщение не найдено.', 'MESSAGE_NOT_FOUND');
  requireSession(db, profileId, message.session_id);
  if (message.feedback) return { feedback: message.feedback };
  const pending = pendingFeedback.get(message.id);
  if (pending) {
    const feedback = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve(undefined), 30_000))]);
    if (feedback === undefined) return { feedback: null, pending: true };
    if (!feedback) return { feedback: null, failed: true };
    return { feedback };
  }
  // Server restarted or feedback failed: compute it now.
  const previous = listMessages(db, message.session_id).filter((item) => item.id < message.id);
  try {
    return { feedback: await computeFeedback(db, message, previous) };
  } catch {
    return { feedback: null, failed: true };
  }
}

export async function translateMessage(db, profileId, messageId) {
  const message = getMessage(db, Number(messageId));
  if (!message) throw new CoachError(404, 'Сообщение не найдено.', 'MESSAGE_NOT_FOUND');
  requireSession(db, profileId, message.session_id);
  if (message.translation_ru) return { translation_ru: message.translation_ru };
  const { text } = await generateText({
    task: 'translate',
    models: COACH_MODELS.utility,
    system: TRANSLATE_PROMPT,
    contents: [{ role: 'user', parts: [{ text: message.content }] }],
    temperature: 0.2,
    maxOutputTokens: 600,
    timeoutMs: 20_000,
  });
  setMessageTranslation(db, message.id, text);
  return { translation_ru: text };
}

export async function suggestReply(db, profileId, sessionId) {
  const session = requireSession(db, profileId, sessionId);
  const messages = listMessages(db, session.id);
  const context = sessionPromptContext(db, profileId, session);
  const transcript = messages.slice(-8).map((item) => `${item.role === 'user' ? 'ALUMNA' : 'COMPAÑERA'}: ${item.content}`).join('\n');
  const { json } = await generateJson({
    task: 'hint',
    models: COACH_MODELS.utility,
    system: buildHintPrompt({ learner: context.learner, focusSpots: context.focusSpots }),
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
    schema: HINT_SCHEMA,
    temperature: 0.8,
    maxOutputTokens: 800,
    timeoutMs: 25_000,
  });
  return {
    options: (json?.options || []).slice(0, 2).map((option) => ({ es: String(option.es || ''), ru: String(option.ru || '') })),
    useful_words: (json?.useful_words || []).slice(0, 3).map((word) => ({ es: String(word.es || ''), ru: String(word.ru || '') })),
  };
}

// ------------------------------------------------------- live call support

export function getCallSetup(db, profileId, sessionId) {
  const session = requireSession(db, profileId, sessionId);
  if (session.mode !== 'call') throw new CoachError(400, 'Это не звонок.', 'WRONG_MODE');
  if (session.status !== 'active') throw new CoachError(409, 'Звонок уже завершён.', 'SESSION_CLOSED');
  const context = sessionPromptContext(db, profileId, session);
  return { session, system: context.system, opening: context.opening, voice: context.voice, learner: context.learner };
}

export function recordCallTurn(db, profileId, sessionId, role, text) {
  const content = String(text || '').replace(/\s+/g, ' ').trim();
  if (!content) return null;
  return addMessage(db, { sessionId, profileId, role, content: content.slice(0, 4000), inputMode: role === 'user' ? 'call' : 'text' });
}

// ---------------------------------------------------------------- analysis

function buildTranscriptForAnalysis(messages) {
  return messages.map((message) => {
    if (message.role !== 'user') return `[${message.id}] COMPAÑERA: ${message.content}`;
    let line = `[${message.id}] ALUMNA (input=${message.input_mode}): ${message.content}`;
    if (message.feedback?.issues?.length) {
      line += `\n    inline_feedback: ${message.feedback.issues.map((issue) => `"${issue.original}"→"${issue.fix}" [${issue.spot_key}]`).join('; ')}`;
    }
    return line;
  }).join('\n');
}

// Role-play lines are not facts about her life; tell the analyst so they stay out of memory.
function analysisSettingNote(session) {
  const { topic, scenario } = resolveSessionSetting(session);
  if (scenario) {
    return `CONTEXTO: juego de rol. La compañera hizo de ${scenario.character}. Objetivo de la alumna: ${scenario.goal_ru}. Lo que ella dice dentro de la escena NO son datos reales de su vida (no los pongas en memory).\n\n`;
  }
  if (topic?.custom) return `CONTEXTO: tema elegido por ella: «${session.custom.topic.text}».\n\n`;
  return '';
}

function ensureVocabularyGroup(db, profileId) {
  const existing = listVocabularyGroups(db, profileId).find((group) => group.name === VOCAB_GROUP_NAME);
  if (existing) return existing.id;
  try {
    return createVocabularyGroup(db, profileId, VOCAB_GROUP_NAME).id;
  } catch {
    return listVocabularyGroups(db, profileId).find((group) => group.name === VOCAB_GROUP_NAME)?.id || null;
  }
}

function applyAnalysis(db, profileId, session, analysis, messages) {
  const userMessages = new Map(messages.filter((message) => message.role === 'user').map((message) => [message.id, message]));
  const spotDefs = new Map((analysis.spots || []).map((spot) => [normalizeSpotKey(spot.spot_key), spot]));
  const touched = new Map();
  const penaltiesPerSpot = new Map();
  const successesPerSpot = new Map();

  const ensure = (rawKey) => {
    const key = normalizeSpotKey(rawKey);
    if (touched.has(key)) return touched.get(key);
    const before = getSpotByKey(db, profileId, key);
    const def = spotDefs.get(key) || {};
    const reference = getTaxonomySpot(key);
    const spot = ensureSpot(db, profileId, {
      spot_key: key,
      title_ru: def.title_ru || reference?.title_ru || key,
      title_es: def.title_es || reference?.title_es || '',
      category: def.category || reference?.category || 'grammar',
      description_ru: def.description_ru,
    });
    const entry = { spot, before: before ? before.score : null, isNew: !before };
    touched.set(key, entry);
    return entry;
  };

  const validErrors = [];
  const errorMessageSpots = new Set();
  for (const error of analysis.errors || []) {
    const message = userMessages.get(Number(error.message_id))
      || [...userMessages.values()].find((item) => normalizeForMatch(item.content).includes(normalizeForMatch(error.original)));
    if (!message || !error.original || !error.corrected) continue;
    if (Number(error.confidence ?? 1) < 0.8) continue;
    if (!normalizeForMatch(message.content).includes(normalizeForMatch(error.original))) continue;
    if (normalizeForMatch(error.original) === normalizeForMatch(error.corrected)) continue;
    const { spot } = ensure(error.spot_key || 'otros');
    errorMessageSpots.add(`${message.id}|${spot.spot_key}`);
    const count = penaltiesPerSpot.get(spot.id) || 0;
    if (count < 3) {
      applySpotEvidence(db, spot.id, 'conversation_error', { severity: error.severity });
      penaltiesPerSpot.set(spot.id, count + 1);
    }
    addEvidence(db, { profileId, spotId: spot.id, sessionId: session.id, kind: 'error', original: error.original, corrected: error.corrected, explanation: error.explanation_ru });
    validErrors.push({
      message_id: message.id,
      original: String(error.original),
      corrected: String(error.corrected),
      explanation_ru: String(error.explanation_ru || ''),
      spot_key: spot.spot_key,
      spot_title_ru: spot.title_ru,
      severity: ['high', 'medium', 'low'].includes(error.severity) ? error.severity : 'medium',
    });
  }

  const validSuccesses = [];
  for (const success of analysis.successes || []) {
    const key = normalizeSpotKey(success.spot_key);
    const existing = getSpotByKey(db, profileId, key);
    if (!existing || !success.example) continue;
    const sourceMessage = [...userMessages.values()].find((message) => normalizeForMatch(message.content).includes(normalizeForMatch(success.example)));
    if (!sourceMessage) continue;
    // Half-right sentences (correct main clause, wrong "si" clause) are not a success.
    if (errorMessageSpots.has(`${sourceMessage.id}|${key}`)) continue;
    if (!touched.has(key)) touched.set(key, { spot: existing, before: existing.score, isNew: false });
    const count = successesPerSpot.get(existing.id) || 0;
    if (count < 2) {
      applySpotEvidence(db, existing.id, 'conversation_success');
      successesPerSpot.set(existing.id, count + 1);
    }
    addEvidence(db, { profileId, spotId: existing.id, sessionId: session.id, kind: 'success', original: success.example, explanation: success.note_ru });
    validSuccesses.push({ spot_key: key, spot_title_ru: existing.title_ru, example: String(success.example), note_ru: String(success.note_ru || '') });
  }

  const avoidance = [];
  for (const item of (analysis.avoidance || []).slice(0, 2)) {
    if (!item.spot_key || !item.note_ru) continue;
    const { spot } = ensure(item.spot_key);
    addEvidence(db, { profileId, spotId: spot.id, sessionId: session.id, kind: 'avoidance', explanation: item.note_ru });
    avoidance.push({ spot_key: spot.spot_key, spot_title_ru: spot.title_ru, note_ru: String(item.note_ru) });
  }

  const vocabulary = [];
  const groupId = (analysis.vocabulary || []).length ? ensureVocabularyGroup(db, profileId) : null;
  for (const item of (analysis.vocabulary || []).slice(0, 8)) {
    if (!item.word || !item.translation_ru) continue;
    let added = false;
    try {
      createVocabularyEntry(db, profileId, {
        word: String(item.word).slice(0, 100),
        translation: String(item.translation_ru).slice(0, 200),
        example: String(item.example || '').slice(0, 400),
        ...(groupId ? { groupId } : {}),
      });
      added = true;
    } catch (error) {
      if (error?.code !== 'DUPLICATE_WORD') console.warn('[coach] vocabulary add failed:', error.message);
    }
    vocabulary.push({ word: String(item.word), translation_ru: String(item.translation_ru), example: String(item.example || ''), reason_ru: String(item.reason_ru || ''), added });
  }

  // Withdraw inline chat corrections the deeper analysis found to be wrong, so
  // the chat and the report never contradict each other.
  const retracted = [];
  for (const item of (analysis.retracted || []).slice(0, 6)) {
    const message = userMessages.get(Number(item.message_id));
    if (!message?.feedback || !item.original) continue;
    const target = normalizeForMatch(item.original);
    const keptIssues = message.feedback.issues.filter((issue) => {
      const fragment = normalizeForMatch(issue.original);
      return !(fragment && (target.includes(fragment) || fragment.includes(target)));
    });
    if (keptIssues.length === message.feedback.issues.length) continue;
    const verdict = keptIssues.length === 0 ? 'perfect' : keptIssues.every((issue) => issue.severity === 'low') ? 'minor' : 'errors';
    setMessageFeedback(db, message.id, {
      ...message.feedback,
      issues: keptIssues,
      verdict,
      corrected: verdict === 'perfect' ? message.content : applyFixes(message.content, keptIssues) || message.feedback.corrected,
      retracted_note_ru: String(item.note_ru || ''),
    });
    retracted.push({ message_id: message.id, original: String(item.original), note_ru: String(item.note_ru || '') });
  }

  const memoryAdded = addLearnerMemory(db, profileId, (analysis.memory || []).slice(0, 6));

  const spotChanges = [...touched.values()].map(({ spot, before, isNew }) => {
    const after = getSpot(db, profileId, spot.id);
    return {
      id: after.id,
      spot_key: after.spot_key,
      title_ru: after.title_ru,
      is_new: isNew,
      before: before ?? null,
      after: after.score,
      status: after.status,
    };
  });

  const userTexts = [...userMessages.values()];
  const words = userTexts.reduce((sum, message) => sum + wordCount(message.content), 0);
  const startedAt = Date.parse(session.started_at);
  const lastAt = Date.parse(messages[messages.length - 1]?.created_at || session.started_at);
  const stats = {
    user_messages: userTexts.length,
    voice_messages: userTexts.filter((message) => message.input_mode !== 'text').length,
    words,
    minutes: Math.max(1, Math.round((lastAt - startedAt) / 60_000)),
    errors: validErrors.length,
    errors_per_100_words: words ? Math.round((validErrors.length / words) * 1000) / 10 : 0,
  };

  const nextFocus = (analysis.next_focus || []).map(normalizeSpotKey)
    .map((key) => getSpotByKey(db, profileId, key))
    .filter(Boolean)
    .slice(0, 3)
    .map((spot) => ({ id: spot.id, spot_key: spot.spot_key, title_ru: spot.title_ru }));

  const scores = analysis.scores || {};
  const clampScore = (value) => Math.max(1, Math.min(5, Math.round(Number(value) || 3)));

  return {
    report: {
      summary_ru: String(analysis.summary_ru || ''),
      cefr_estimate: analysis.cefr_estimate || null,
      scores: {
        grammar: clampScore(scores.grammar),
        vocabulary: clampScore(scores.vocabulary),
        fluency: clampScore(scores.fluency),
        interaction: clampScore(scores.interaction),
      },
      strengths_ru: (analysis.strengths_ru || []).slice(0, 3).map(String),
      errors: validErrors,
      successes: validSuccesses,
      avoidance,
      retracted,
      vocabulary,
      memory_added: memoryAdded,
      spot_changes: spotChanges,
      next_focus: nextFocus,
      next_topic_ru: String(analysis.next_topic_ru || ''),
    },
    stats,
  };
}

export async function finishSession(db, profileId, sessionId, { generateWorkoutAfter = true } = {}) {
  const session = requireSession(db, profileId, sessionId);
  if (['analyzed', 'empty'].includes(session.status)) return getSessionDetail(db, profileId, session.id);
  if (analysisLocks.has(session.id)) {
    await analysisLocks.get(session.id).catch(() => {});
    return getSessionDetail(db, profileId, session.id);
  }

  const job = (async () => {
    const messages = listMessages(db, session.id);
    const userMessages = messages.filter((message) => message.role === 'user');
    const endedAt = session.ended_at || new Date().toISOString();
    if (!userMessages.length) {
      updateSession(db, session.id, { status: 'empty', ended_at: endedAt });
      return;
    }
    updateSession(db, session.id, { status: 'analyzing', ended_at: endedAt, analysis_error: null });
    const learner = requireLearner(db, profileId);
    const existingSpots = listSpots(db, profileId).map((spot) => ({ spot_key: spot.spot_key, title_es: spot.title_es, title_ru: spot.title_ru, score: spot.score, error_count: spot.error_count }));
    try {
      const { json, model } = await generateJson({
        task: 'analysis',
        models: COACH_MODELS.analysis,
        system: buildAnalysisPrompt({ learner, existingSpots }),
        contents: [{ role: 'user', parts: [{ text: `${analysisSettingNote(session)}TRANSCRIPCIÓN:\n${buildTranscriptForAnalysis(messages)}` }] }],
        schema: ANALYSIS_SCHEMA,
        effort: 'low',
        temperature: 0.2,
        maxOutputTokens: 8192,
        timeoutMs: 90_000,
      });
      if (!json) throw new Error('empty analysis');
      const { report, stats } = db.transaction(() => applyAnalysis(db, profileId, session, json, messages))();
      updateSession(db, session.id, {
        status: 'analyzed',
        analysis_json: JSON.stringify({ ...report, model }),
        stats_json: JSON.stringify(stats),
      });
      try {
        addProfileXp(db, profileId, 20 + Math.min(40, Math.round(stats.words / 8)), 'coach_session');
      } catch (error) {
        console.warn('[coach] xp failed:', error.message);
      }
      if (generateWorkoutAfter && report.spot_changes.length) {
        startWorkoutGeneration(db, profileId, { sessionId: session.id, spotKeys: (report.next_focus.length ? report.next_focus : report.spot_changes).map((spot) => spot.spot_key).slice(0, 3) });
      }
      // Prepare mini-lessons for newly found spots in the background (after the
      // workout has had its share of the quota) so they open instantly.
      const newSpotIds = report.spot_changes.filter((spot) => spot.is_new).map((spot) => spot.id);
      if (newSpotIds.length) {
        setTimeout(async () => {
          for (const spotId of newSpotIds) {
            await getSpotLesson(db, profileId, spotId).catch((error) => console.warn('[coach] lesson prefetch failed:', error.message));
          }
        }, 20_000);
      }
    } catch (error) {
      console.error('[coach] analysis failed:', error.message);
      updateSession(db, session.id, { status: 'failed', analysis_error: error.message?.slice(0, 300) || 'analysis failed' });
    }
  })();
  analysisLocks.set(session.id, job);
  try {
    await job;
  } finally {
    analysisLocks.delete(session.id);
  }
  return getSessionDetail(db, profileId, session.id);
}

export async function retryAnalysis(db, profileId, sessionId) {
  const session = requireSession(db, profileId, sessionId);
  if (session.status !== 'failed') return getSessionDetail(db, profileId, session.id);
  updateSession(db, session.id, { status: 'active' });
  return finishSession(db, profileId, session.id);
}

// ---------------------------------------------------------------- workouts

const ITEM_TYPES = new Set(['fix', 'choice', 'gap', 'translate', 'speak']);

export function sanitizeWorkoutItems(rawItems, spotsByKey) {
  const items = [];
  for (const raw of rawItems || []) {
    const type = String(raw?.type || '');
    const spotKey = normalizeSpotKey(raw?.spot_key || '');
    const spot = spotsByKey.get(spotKey) || [...spotsByKey.values()][0];
    if (!ITEM_TYPES.has(type) || !raw?.prompt) continue;
    const answers = (Array.isArray(raw.answers) ? raw.answers : []).map((answer) => String(answer).trim()).filter(Boolean).slice(0, 8);
    let options = (Array.isArray(raw.options) ? raw.options : []).map((option) => String(option).trim()).filter(Boolean).slice(0, 4);
    if (type === 'choice') {
      if (options.length < 2 || !answers.length) continue;
      const correct = options.filter((option) => answers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(option)));
      if (correct.length !== 1) continue; // Ambiguous or broken item: drop it rather than mislead.
    } else {
      options = [];
    }
    if (type === 'gap' && !/_{2,}/.test(raw.prompt)) continue;
    // A "fix" item must still contain the mistake; if the prompt already equals
    // an accepted answer there is nothing to fix.
    if (type === 'fix' && answers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(raw.prompt))) continue;
    if (type !== 'speak' && !answers.length) continue;
    items.push({
      id: items.length,
      spot_key: spot?.spot_key || spotKey,
      spot_id: spot?.id || null,
      spot_title_ru: spot?.title_ru || spotKey,
      type,
      instruction_ru: String(raw.instruction_ru || '').slice(0, 300),
      prompt: String(raw.prompt).slice(0, 400),
      options,
      answers,
      hint_ru: String(raw.hint_ru || '').slice(0, 200),
      explanation_ru: String(raw.explanation_ru || '').slice(0, 400),
      source: raw.source === 'own' ? 'own' : 'new',
    });
  }
  return items.slice(0, 12);
}

async function generateWorkoutItems(db, profileId, spotKeys) {
  const learner = requireLearner(db, profileId);
  const spots = spotKeys.map((key) => getSpotByKey(db, profileId, key)).filter(Boolean)
    .map((spot) => ({ ...spot, evidence: listEvidence(db, spot.id, { kind: 'error', limit: 4 }) }));
  if (!spots.length) throw new CoachError(400, 'Нет тем для тренировки.', 'NO_SPOTS');
  const itemCount = Math.min(10, Math.max(6, spots.length * 4));
  const { json } = await generateJson({
    task: 'workout',
    models: COACH_MODELS.workout,
    system: buildWorkoutPrompt({ learner, memory: learner.memory, spots, itemCount }),
    contents: [{ role: 'user', parts: [{ text: `Generá ${itemCount} ejercicios.` }] }],
    schema: WORKOUT_SCHEMA,
    effort: 'low',
    temperature: 0.6,
    maxOutputTokens: 8192,
    timeoutMs: 90_000,
  });
  const spotsByKey = new Map(spots.map((spot) => [spot.spot_key, spot]));
  const draft = sanitizeWorkoutItems(json?.items, spotsByKey);
  if (draft.length < 3) throw new Error('workout generation produced too few valid items');
  const items = await reviewWorkoutItems(draft, spotsByKey);
  if (items.length < 3) throw new Error('workout review left too few valid items');
  return items;
}

// A second, independent pass by a "native reviewer" catches broken Spanish and
// ambiguous items before the learner sees them; one wrong exercise costs more
// trust than ten good ones earn.
async function reviewWorkoutItems(draft, spotsByKey) {
  const payload = draft.map((item, index) => ({
    index,
    spot_key: item.spot_key,
    type: item.type,
    instruction_ru: item.instruction_ru,
    prompt: item.prompt,
    options: item.options,
    answers: item.answers,
    hint_ru: item.hint_ru,
  }));
  let reviews;
  try {
    const { json } = await generateJson({
      task: 'workout-review',
      models: COACH_MODELS.workout,
      system: buildWorkoutReviewPrompt(),
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload, null, 1) }] }],
      schema: WORKOUT_REVIEW_SCHEMA,
      effort: 'low',
      temperature: 0.1,
      maxOutputTokens: 8192,
      timeoutMs: 60_000,
    });
    reviews = Array.isArray(json?.reviews) ? json.reviews : null;
  } catch (error) {
    console.warn('[coach] workout review failed, keeping draft:', error.message);
    return draft;
  }
  if (!reviews) return draft;
  const byIndex = new Map(reviews.map((review) => [Number(review.index), review]));
  const revised = [];
  let fixed = 0;
  let dropped = 0;
  draft.forEach((item, index) => {
    const review = byIndex.get(index);
    if (!review || review.verdict === 'keep') {
      revised.push(item);
      return;
    }
    if (review.verdict === 'drop') {
      dropped += 1;
      return;
    }
    fixed += 1;
    revised.push({
      ...item,
      // The learner's own erroneous sentence is the point of a "fix" item.
      prompt: item.type === 'fix' ? item.prompt : (review.prompt || item.prompt),
      options: item.type === 'choice' && Array.isArray(review.options) && review.options.length >= 2 ? review.options : item.options,
      answers: Array.isArray(review.answers) && review.answers.length ? review.answers : item.answers,
      hint_ru: review.hint_ru ?? item.hint_ru,
    });
  });
  const sanitized = sanitizeWorkoutItems(revised, spotsByKey).map((item, index) => ({ ...item, id: index }));
  console.info(`[coach] workout review: ${draft.length} items, ${fixed} fixed, ${dropped} dropped, ${draft.length - fixed - dropped} kept → ${sanitized.length}`);
  return sanitized;
}

export function startWorkoutGeneration(db, profileId, { sessionId = null, spotKeys = null } = {}) {
  const keys = (spotKeys && spotKeys.length ? spotKeys : prioritizedSpots(db, profileId, 3).map((spot) => spot.spot_key))
    .map(normalizeSpotKey)
    .filter((key, index, list) => list.indexOf(key) === index)
    .filter((key) => getSpotByKey(db, profileId, key))
    .slice(0, 3);
  if (!keys.length) {
    throw new CoachError(400, 'Сначала поговорите с Лусией — тренировка строится по вашим собственным ошибкам.', 'NO_SPOTS');
  }
  const workoutId = createWorkoutRow(db, profileId, { sessionId, spotKeys: keys });
  if (sessionId) updateSession(db, sessionId, { workout_id: workoutId });
  const job = generateWorkoutItems(db, profileId, keys)
    .then((items) => updateWorkout(db, workoutId, { status: 'ready', items_json: JSON.stringify(items) }))
    .catch((error) => {
      console.error('[coach] workout generation failed:', error.message);
      updateWorkout(db, workoutId, { status: 'failed', error: String(error.message || 'failed').slice(0, 300) });
    })
    .finally(() => workoutJobs.delete(workoutId));
  workoutJobs.set(workoutId, job);
  return workoutId;
}

function publicWorkout(workout) {
  if (!workout) return null;
  const answered = Object.keys(workout.results || {}).length;
  return {
    id: workout.id,
    status: workout.status,
    session_id: workout.session_id,
    spot_keys: workout.spot_keys,
    created_at: workout.created_at,
    completed_at: workout.completed_at,
    error: workout.error,
    total: workout.items.length,
    answered,
    // Answers stay on the server until the item is answered.
    items: workout.items.map((item) => {
      const result = workout.results?.[item.id];
      const base = {
        id: item.id,
        spot_key: item.spot_key,
        spot_title_ru: item.spot_title_ru,
        type: item.type,
        instruction_ru: item.instruction_ru,
        prompt: item.prompt,
        options: item.options,
        hint_ru: item.hint_ru,
        source: item.source,
      };
      return result ? { ...base, result, answers: item.answers, explanation_ru: item.explanation_ru } : base;
    }),
  };
}

export async function getWorkoutDetail(db, profileId, workoutId, { wait = false } = {}) {
  let workout = getWorkout(db, profileId, Number(workoutId));
  if (!workout) throw new CoachError(404, 'Тренировка не найдена.', 'WORKOUT_NOT_FOUND');
  if (wait && workout.status === 'generating' && workoutJobs.has(workout.id)) {
    await Promise.race([workoutJobs.get(workout.id), new Promise((resolve) => setTimeout(resolve, 25_000))]);
    workout = getWorkout(db, profileId, workout.id);
  }
  if (workout.status === 'generating' && !workoutJobs.has(workout.id)) {
    // The job was lost (server restart): mark it so the client can regenerate.
    updateWorkout(db, workout.id, { status: 'failed', error: 'interrupted' });
    workout = getWorkout(db, profileId, workout.id);
  }
  return publicWorkout(workout);
}

export function getOrCreateNextWorkout(db, profileId) {
  const open = latestOpenWorkout(db, profileId);
  if (open && (open.status === 'generating' ? workoutJobs.has(open.id) : Object.keys(open.results).length < open.items.length)) {
    return open.id;
  }
  return startWorkoutGeneration(db, profileId, {});
}

async function gradeWithAi(item, answer, inputMode) {
  const { json } = await generateJson({
    task: 'grade',
    models: COACH_MODELS.grade,
    system: buildGradePrompt({ item, inputMode }),
    contents: [{ role: 'user', parts: [{ text: `RESPUESTA DE LA ALUMNA (input=${inputMode}): ${answer}` }] }],
    schema: GRADE_SCHEMA,
    effort: 'none',
    temperature: 0.1,
    maxOutputTokens: 1024,
    timeoutMs: 30_000,
  });
  const verdict = ['correct', 'almost', 'incorrect'].includes(json?.verdict) ? json.verdict : 'incorrect';
  return {
    verdict,
    corrected: String(json?.corrected || '').slice(0, 400),
    feedback_ru: String(json?.feedback_ru || '').slice(0, 400),
  };
}

export async function answerWorkoutItem(db, profileId, workoutId, itemId, payload) {
  const workout = getWorkout(db, profileId, Number(workoutId));
  if (!workout) throw new CoachError(404, 'Тренировка не найдена.', 'WORKOUT_NOT_FOUND');
  if (workout.status !== 'ready') throw new CoachError(409, 'Тренировка недоступна.', 'WORKOUT_NOT_READY');
  const item = workout.items.find((candidate) => candidate.id === Number(itemId));
  if (!item) throw new CoachError(404, 'Задание не найдено.', 'ITEM_NOT_FOUND');
  const previous = workout.results?.[item.id];
  if (previous?.final) return { result: previous, item: { answers: item.answers, explanation_ru: item.explanation_ru } };

  if (payload?.giveUp) {
    // "Show me the answer" after a failed attempt: close the item without
    // touching the score again (the first attempt already counted).
    if (!previous) throw new CoachError(409, 'Сначала попробуйте ответить.', 'NO_ATTEMPT');
    const result = { ...previous, final: true, gave_up: true };
    const results = { ...workout.results, [item.id]: result };
    const completed = Object.values(results).filter((entry) => entry.final).length >= workout.items.length;
    updateWorkout(db, workout.id, {
      results_json: JSON.stringify(results),
      ...(completed ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
    });
    const spot = item.spot_id ? getSpot(db, profileId, item.spot_id) : null;
    return { result, completed, item: { answers: item.answers, explanation_ru: item.explanation_ru }, spot: spot ? { id: spot.id, score: spot.score, status: spot.status } : null };
  }

  let answer;
  let inputMode = 'text';
  if (item.type === 'choice') {
    const index = Number(payload?.choiceIndex);
    if (!Number.isInteger(index) || index < 0 || index >= item.options.length) throw new CoachError(400, 'Выберите вариант.', 'BAD_CHOICE');
    answer = item.options[index];
  } else if (payload?.audio) {
    const prepared = await prepareUserText({ audio: payload.audio, mimeType: payload.mimeType });
    answer = prepared.content;
    inputMode = 'voice';
  } else {
    answer = String(payload?.answer || '').trim().slice(0, 600);
    if (!answer) throw new CoachError(400, 'Введите ответ.', 'EMPTY_ANSWER');
  }

  let grade;
  const normalized = normalizeAnswer(answer);
  const exact = item.answers.some((reference) => normalizeAnswer(reference) === normalized);
  const accentOnly = !exact && item.answers.some((reference) => stripAccents(normalizeAnswer(reference)) === stripAccents(normalized));
  if (item.type === 'choice') {
    grade = { verdict: exact ? 'correct' : 'incorrect', corrected: item.answers[0], feedback_ru: '' };
  } else if (exact) {
    grade = { verdict: 'correct', corrected: answer, feedback_ru: '' };
  } else if (accentOnly && item.type === 'gap') {
    grade = inputMode === 'voice'
      ? { verdict: 'correct', corrected: item.answers[0], feedback_ru: '' }
      : { verdict: 'almost', corrected: item.answers.find((reference) => stripAccents(normalizeAnswer(reference)) === stripAccents(normalized)) || item.answers[0], feedback_ru: 'Всё верно, только не забудьте про ударение (tilde).' };
  } else {
    grade = await gradeWithAi(item, answer, inputMode);
  }

  const attempts = (previous?.attempts || 0) + 1;
  // Only the first attempt moves the mastery score; a retry after seeing a hint is practice.
  let spotDelta = 0;
  if (attempts === 1 && item.spot_id) {
    const kind = grade.verdict === 'correct' ? 'drill_correct' : grade.verdict === 'almost' ? 'drill_almost' : 'drill_wrong';
    spotDelta = applySpotEvidence(db, item.spot_id, kind);
  }
  const allowRetry = grade.verdict === 'incorrect' && attempts < 2 && item.type !== 'choice';
  const result = {
    answer,
    input_mode: inputMode,
    verdict: grade.verdict,
    corrected: grade.corrected,
    feedback_ru: grade.feedback_ru,
    attempts,
    first_verdict: previous?.first_verdict || grade.verdict,
    final: !allowRetry,
    spot_delta: spotDelta,
  };
  const results = { ...workout.results, [item.id]: result };
  const finals = Object.values(results).filter((entry) => entry.final).length;
  const completed = finals >= workout.items.length;
  updateWorkout(db, workout.id, {
    results_json: JSON.stringify(results),
    ...(completed ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
  });
  if (completed) {
    try {
      const correct = Object.values(results).filter((entry) => entry.first_verdict !== 'incorrect').length;
      addProfileXp(db, profileId, 15 + correct * 3, 'coach_workout');
    } catch (error) {
      console.warn('[coach] xp failed:', error.message);
    }
  }
  const spot = item.spot_id ? getSpot(db, profileId, item.spot_id) : null;
  return {
    result,
    completed,
    item: { answers: item.answers, explanation_ru: item.explanation_ru },
    spot: spot ? { id: spot.id, score: spot.score, status: spot.status } : null,
  };
}

// ------------------------------------------------------------------ spots

export function getSpotDetail(db, profileId, spotId) {
  const spot = getSpot(db, profileId, Number(spotId));
  if (!spot) throw new CoachError(404, 'Тема не найдена.', 'SPOT_NOT_FOUND');
  return {
    ...spot,
    errors: listEvidence(db, spot.id, { kind: 'error', limit: 12 }),
    successes: listEvidence(db, spot.id, { kind: 'success', limit: 6 }),
  };
}

export async function getSpotLesson(db, profileId, spotId) {
  const spot = getSpot(db, profileId, Number(spotId));
  if (!spot) throw new CoachError(404, 'Тема не найдена.', 'SPOT_NOT_FOUND');
  if (spot.lesson) return { lesson: spot.lesson };
  const evidence = listEvidence(db, spot.id, { kind: 'error', limit: 4 });
  const { json } = await generateJson({
    task: 'lesson',
    models: COACH_MODELS.lesson,
    system: buildLessonPrompt({ spot, evidence }),
    contents: [{ role: 'user', parts: [{ text: 'Escribí la mini-lección.' }] }],
    schema: LESSON_SCHEMA,
    effort: 'low',
    temperature: 0.4,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  });
  if (!json?.rule_ru) throw new CoachError(503, 'Не удалось подготовить объяснение. Попробуйте ещё раз.', 'LESSON_FAILED');
  setSpotLesson(db, spot.id, json);
  return { lesson: json };
}

// -------------------------------------------------------------- dashboard

export function getDashboard(db, profileId) {
  const learner = requireLearner(db, profileId);
  const spots = listSpots(db, profileId);
  const sessions = listSessionSummaries(db, profileId, 30);
  const analyzed = sessions.filter((session) => session.status === 'analyzed');
  const openWorkout = latestOpenWorkout(db, profileId);
  const lastAnalyzed = analyzed[0] ? getSession(db, profileId, analyzed[0].id) : null;

  const trend = analyzed.slice(0, 10).reverse().map((session) => ({
    id: session.id,
    date: session.started_at,
    errors_per_100_words: session.stats?.errors_per_100_words ?? null,
    words: session.stats?.words ?? 0,
  }));

  const totals = analyzed.reduce((acc, session) => {
    acc.sessions += 1;
    acc.words += session.stats?.words || 0;
    acc.minutes += session.stats?.minutes || 0;
    return acc;
  }, { sessions: 0, words: 0, minutes: 0 });

  const completedWorkouts = listWorkouts(db, profileId, 50).filter((workout) => workout.status === 'completed').length;

  return {
    learner: {
      display_name: learner.display_name,
      cefr_level: learner.cefr_level,
      onboarded: learner.onboarded,
      interests: learner.interests,
      goals: learner.goals,
      about: learner.about,
      partner_voice: learner.partner_voice,
      voice_autoplay: learner.voice_autoplay,
      show_inline_feedback: learner.show_inline_feedback,
      memory: learner.memory,
    },
    spots: spots.map((spot) => ({
      id: spot.id,
      spot_key: spot.spot_key,
      title_ru: spot.title_ru,
      title_es: spot.title_es,
      category: spot.category,
      description_ru: spot.description_ru,
      score: spot.score,
      status: spot.status,
      error_count: spot.error_count,
      success_count: spot.success_count,
      last_seen_at: spot.last_seen_at,
      example: listEvidence(db, spot.id, { kind: 'error', limit: 1 })[0] || null,
    })),
    focus: prioritizedSpots(db, profileId, 3).map((spot) => ({ id: spot.id, spot_key: spot.spot_key, title_ru: spot.title_ru, score: spot.score })),
    // Calls that never connected and chats she never answered are noise in the history.
    sessions: sessions.filter((session) => session.user_messages > 0 || session.status === 'analyzed').slice(0, 8),
    active_session: sessions.find((session) => session.status === 'active' && session.mode === 'chat' && session.user_messages > 0) || null,
    open_workout: openWorkout
      ? { id: openWorkout.id, status: openWorkout.status, total: openWorkout.items.length, answered: Object.values(openWorkout.results).filter((entry) => entry.final).length }
      : null,
    last_report: lastAnalyzed?.analysis ? { session_id: lastAnalyzed.id, next_topic_ru: lastAnalyzed.analysis.next_topic_ru, cefr_estimate: lastAnalyzed.analysis.cefr_estimate, scores: lastAnalyzed.analysis.scores } : null,
    trend,
    totals: { ...totals, workouts: completedWorkouts },
    recent_custom: listRecentCustom(db, profileId),
  };
}

export { parseJson };
