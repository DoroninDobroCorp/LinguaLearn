import { getA1SkillTaskById, recordA1SkillEvidence } from './a1CourseEngine.js';

const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const AI_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];

function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function cleanJson(text) {
  return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export function publicA1SkillTask(task) {
  if (!task) return null;
  const { transcript, ...publicTask } = task;
  return {
    ...publicTask,
    // A listening transcript is answer material and becomes available only after evaluation.
    ...(task.audioUrl ? {} : { transcript }),
    questions: task.questions?.map(({ correctIndex, explanation, ...question }) => question),
  };
}

export function evaluateObjectiveTask(task, answers) {
  if (!Array.isArray(answers) || answers.length !== task.questions.length) {
    throw apiError(400, 'INCOMPLETE_SKILL_TASK', 'Ответьте на все вопросы перед отправкой.');
  }
  const results = task.questions.map((question, index) => ({
    index,
    selectedIndex: Number(answers[index]),
    correctIndex: question.correctIndex,
    correct: Number(answers[index]) === question.correctIndex,
    explanation: question.explanation,
  }));
  const correctCount = results.filter((row) => row.correct).length;
  const score = Math.round((correctCount / Math.max(1, results.length)) * 100);
  return {
    score,
    passed: score >= 70,
    breakdown: results,
    feedbackRu: score >= 70
      ? `Верно ${correctCount} из ${results.length}. Зачёт засчитан.`
      : `Верно ${correctCount} из ${results.length}. Разберите объяснения и повторите попытку.`,
    evaluationSource: 'deterministic',
  };
}

function normalizeAiEvaluation(value, task) {
  const score = Math.max(0, Math.min(100, Math.round(Number(value?.score))));
  if (!Number.isFinite(score)) throw new Error('AI response has no valid score');
  const allowedNames = new Set((task.rubric?.criteria || []).map((criterion) => criterion.name));
  const breakdown = Array.isArray(value?.breakdown)
    ? value.breakdown.filter((row) => allowedNames.has(row?.name)).map((row) => ({
      name: row.name,
      score: Math.max(0, Number(row.score) || 0),
      max: Math.max(0, Number(row.max) || 0),
      commentRu: String(row.commentRu || '').slice(0, 500),
    }))
    : [];
  return {
    score,
    passed: score >= 70,
    breakdown,
    feedbackRu: String(value?.feedbackRu || 'Оценка готова.').slice(0, 1200),
    transcript: value?.transcript ? String(value.transcript).slice(0, 1500) : null,
    evaluationSource: 'gemini',
  };
}

async function runGeminiEvaluation(task, skill, submission) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw apiError(503, 'A1_EVALUATION_UNAVAILABLE', 'AI-проверка временно недоступна: ключ модели не настроен.');
  const rubric = JSON.stringify(task.rubric?.criteria || []);
  const prompt = `Ты строгий экзаменатор испанского CEFR A1. Оцени только фактически предоставленный ответ, не додумывай отсутствующее.\nЗадание: ${task.promptRu}\nКритерии: ${rubric}\nВерни только JSON: {"score":0,"breakdown":[{"name":"точное имя критерия","score":0,"max":0,"commentRu":"..."}],"feedbackRu":"2-4 конкретных совета на русском"${skill === 'speaking' ? ',"transcript":"что реально распознано"' : ''}}. Проходной балл определит сервер.`;
  const parts = [{ text: prompt }];
  if (skill === 'writing') {
    parts.push({ text: `Текст ученика:\n${submission.text}` });
  } else {
    parts.push({ inlineData: { mimeType: submission.mimeType, data: submission.audioBase64 } });
  }

  let lastError = null;
  for (const model of AI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`http://127.0.0.1:58433/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Model ${model} returned ${response.status}`);
      const payload = await response.json();
      const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      return normalizeAiEvaluation(JSON.parse(cleanJson(raw)), task);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  console.warn('A1 skill evaluation failed:', lastError?.message);
  throw apiError(503, 'A1_EVALUATION_UNAVAILABLE', 'Проверка ответа временно недоступна. Попытка не засчитана — запись сохранена только в вашем браузере.');
}

export async function evaluateA1SkillSubmission(db, profileId, skill, taskId, input, now = new Date()) {
  const task = getA1SkillTaskById(skill, taskId);
  if (!task) throw apiError(404, 'A1_SKILL_TASK_NOT_FOUND', 'Задание A1 не найдено.');
  const eventId = String(input?.eventId || '').trim();
  if (!eventId || eventId.length > 160) throw apiError(400, 'INVALID_EVENT_ID', 'eventId обязателен.');

  let evaluation;
  if (skill === 'listening' || skill === 'reading') {
    evaluation = evaluateObjectiveTask(task, input?.answers);
  } else if (skill === 'writing') {
    const text = String(input?.text || '').trim();
    if (text.length < 10 || text.length > 2500) throw apiError(400, 'INVALID_WRITING_SUBMISSION', 'Напишите осмысленный ответ длиной от 10 до 2500 символов.');
    evaluation = await runGeminiEvaluation(task, skill, { text });
  } else if (skill === 'speaking') {
    const audioBase64 = String(input?.audioBase64 || '').replace(/^data:[^;]+;base64,/, '');
    const mimeType = String(input?.mimeType || '').split(';')[0].toLowerCase();
    const durationMs = Number(input?.durationMs || 0);
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType) || audioBase64.length < 500 || audioBase64.length > 7_000_000 || durationMs < 3_000) {
      throw apiError(400, 'INVALID_SPEAKING_SUBMISSION', 'Нужна настоящая аудиозапись длительностью не менее 3 секунд.');
    }
    evaluation = await runGeminiEvaluation(task, skill, { audioBase64, mimeType });
  } else {
    throw apiError(400, 'INVALID_SKILL', 'Неизвестный навык A1.');
  }

  const evidence = recordA1SkillEvidence(db, profileId, {
    eventId,
    skill,
    taskId,
    score: evaluation.score,
    passed: evaluation.passed,
  }, now);
  return { ...evaluation, evidence };
}
