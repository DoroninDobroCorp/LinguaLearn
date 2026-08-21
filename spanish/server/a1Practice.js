import { getGrammarTheoryGuide } from './grammarTheoryData.js';
import { A1_UNITS } from './a1CourseEngine.js';
import { A1_CORE_VOCABULARY, getA1VocabularyByUnit } from './a1VocabularyData.js';

export class A1PracticeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function parseA1PracticeTopicIds(value) {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 5 || parts.some((part) => !/^\d+$/.test(part) || Number(part) <= 0)) {
    throw new A1PracticeError(400, 'INVALID_A1_TOPIC_IDS', 'topicIds must contain 1 to 5 positive integers');
  }
  return [...new Set(parts.map(Number))];
}

function topicStates(course) {
  return (course?.units || []).flatMap((unit) => unit.topics || []);
}

export function selectA1PracticeTopicIds(course, requestedTopicIds = []) {
  const introduced = topicStates(course).filter((topic) => topic.phase !== 'new');
  const introducedIds = new Set(introduced.map((topic) => Number(topic.topicId)));

  if (requestedTopicIds.length > 0) {
    const unknown = requestedTopicIds.filter((topicId) => !introducedIds.has(Number(topicId)));
    if (unknown.length > 0) {
      throw new A1PracticeError(
        403,
        'A1_TOPIC_NOT_INTRODUCED',
        'Practice is available only for topics already introduced in the course',
      );
    }
    return requestedTopicIds.map(Number);
  }

  const dueIds = (course?.dueTopics || [])
    .map((topic) => Number(topic.topicId))
    .filter((topicId) => introducedIds.has(topicId));
  if (dueIds.length > 0) return [...new Set(dueIds)].slice(0, 3);

  return introduced
    .sort((left, right) => Number(left.masteryScore || 0) - Number(right.masteryScore || 0))
    .slice(0, 3)
    .map((topic) => Number(topic.topicId));
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function publicExercise(exercise, topicId, guide) {
  const { correctAnswer, acceptableAnswers, alternativeAnswers, explanation, ...safe } = exercise;
  return {
    ...safe,
    id: String(exercise.id),
    topicId,
    topic: guide.topicName,
    level: 'A1',
    category: guide.category || 'Grammar',
    verificationRequired: true,
  };
}

export function buildA1PracticeExercises(course, requestedTopicIds = [], options = {}) {
  const selectedTopicIds = selectA1PracticeTopicIds(course, requestedTopicIds);
  const exercises = [];
  for (const topicId of selectedTopicIds) {
    const guide = getGrammarTheoryGuide(topicId);
    if (!guide || !Array.isArray(guide.exercises)) continue;
    for (const exercise of guide.exercises) {
      if (!exercise?.id) continue;
      exercises.push(publicExercise(exercise, topicId, guide));
    }
  }
  const count = clamp(Math.round(Number(options.count) || 20), 1, 50);
  return shuffle(exercises, options.random).slice(0, count);
}

export function findA1PracticeExercise(course, topicId, exerciseId) {
  const numericTopicId = Number(topicId);
  selectA1PracticeTopicIds(course, [numericTopicId]);
  const guide = getGrammarTheoryGuide(numericTopicId);
  const exercise = guide?.exercises?.find((item) => String(item.id) === String(exerciseId));
  if (!exercise) {
    throw new A1PracticeError(404, 'A1_EXERCISE_NOT_FOUND', 'A1 practice exercise not found');
  }
  return { exercise, guide, topicId: numericTopicId };
}

function normalizeAnswer(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isA1PracticeAnswerCorrect(exercise, answer) {
  const accepted = [
    exercise?.correctAnswer,
    ...(exercise?.acceptableAnswers || []),
    ...(exercise?.alternativeAnswers || []),
  ].filter((value) => value !== undefined && value !== null);
  const normalized = normalizeAnswer(answer);
  return normalized.length > 0 && accepted.some((value) => normalizeAnswer(value) === normalized);
}

function countInCorpus(corpus, word) {
  const normalizedWord = normalizeAnswer(word);
  if (normalizedWord.length < 3) return 0;
  const escaped = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = corpus.match(new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`, 'g'));
  return matches?.length || 0;
}

export function buildA1StarterVocabulary(topicId, topicName, limit = 10) {
  const guide = getGrammarTheoryGuide(topicId, topicName);
  if (!guide) return [];
  const unit = A1_UNITS.find((candidate) => candidate.topics.includes(guide.topicName || topicName));
  const corpus = normalizeAnswer(JSON.stringify({
    summary: guide.summary,
    sections: guide.sections,
    examples: guide.examples,
    miniScenario: guide.miniScenario,
    shortText: guide.shortText,
    exercises: guide.exercises,
  }));
  const boundedLimit = clamp(Math.round(Number(limit) || 10), 6, 14);
  const ranked = A1_CORE_VOCABULARY
    .map((entry, index) => {
      const occurrences = countInCorpus(corpus, entry.word);
      const phraseWeight = Math.min(3, normalizeAnswer(entry.word).split(' ').length);
      return { entry, index, score: occurrences * phraseWeight };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((candidate) => candidate.entry);
  const fallback = unit ? getA1VocabularyByUnit(unit.id) : [];
  const unique = new Map();
  for (const entry of [...ranked, ...fallback]) {
    const key = normalizeAnswer(entry.word);
    if (!key || unique.has(key)) continue;
    unique.set(key, {
      word: entry.word,
      translation: entry.translation,
      example: entry.example,
      exampleTranslation: entry.example_translation,
      partOfSpeech: entry.part_of_speech,
    });
    if (unique.size >= boundedLimit) break;
  }
  return [...unique.values()];
}
