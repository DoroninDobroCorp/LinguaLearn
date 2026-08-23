/**
 * English Curriculum Examination Engine
 * Handles Milestone Exams (20 questions, 4-6 topics >= 50%, excluding 100% locked)
 * and Level Mastery Exams (30 questions, complete level).
 */

import { generateEnglishExercise } from './grammarExerciseEngine.js';

export function ensureCurriculumExamsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS curriculum_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      exam_type TEXT NOT NULL CHECK (exam_type IN ('milestone', 'level_mastery')),
      topic_ids_json TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      score_percent REAL NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_curriculum_exams_user ON curriculum_exams(user_id, level);
  `);
}

function normalizeSentence(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkGrammarAnswerMatch(userText, correctText, altAnswers = []) {
  const normUser = normalizeSentence(userText);
  const normCorrect = normalizeSentence(correctText);
  if (!normUser) return false;
  if (normUser === normCorrect) return true;

  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (normalizeSentence(alt) === normUser) return true;
    }
  }

  return false;
}

/**
 * Returns available milestone & level mastery exam status for all levels
 */
export function getExamsStatus(db, userId) {
  ensureCurriculumExamsSchema(db);

  const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const results = {};

  const queryTopicsStmt = db.prepare(`
    SELECT ct.id, ct.name, ct.category, ct.level, ct.pedagogical_order,
           COALESCE(cp.score, 0) as score,
           COALESCE(cp.status, 'not_started') as status,
           COALESCE(cp.is_locked, 0) as is_locked,
           cp.last_practiced
    FROM curriculum_topics ct
    LEFT JOIN user_topic_progress cp ON cp.curriculum_topic_id = ct.id AND cp.user_id = ?
    WHERE ct.source = 'preset' AND ct.level = ?
    ORDER BY ct.pedagogical_order ASC, ct.id ASC
  `);

  const queryRecentExamsStmt = db.prepare(`
    SELECT id, exam_type, total_questions, correct_count, score_percent, passed, created_at
    FROM curriculum_exams
    WHERE user_id = ? AND level = ?
    ORDER BY id DESC
    LIMIT 3
  `);

  for (const level of CEFR_LEVELS) {
    const topics = queryTopicsStmt.all(userId, level);
    const totalTopics = topics.length;

    // Completed: score >= 50 or is_locked == 1
    const completedTopics = topics.filter((t) => t.score >= 50 || t.is_locked === 1);

    // Eligible milestone topics: score >= 50 AND is_locked == 0 (excluding 100% frozen/locked)
    const eligibleMilestoneTopics = topics.filter((t) => t.score >= 50 && t.is_locked === 0);

    const milestoneAvailable = eligibleMilestoneTopics.length >= 4;

    // Pick candidate topics (up to 6)
    const candidateMilestoneTopics = [...eligibleMilestoneTopics]
      .sort((a, b) => {
        if (!a.last_practiced && b.last_practiced) return -1;
        if (a.last_practiced && !b.last_practiced) return 1;
        if (a.last_practiced && b.last_practiced) {
          const dateDiff = new Date(a.last_practiced) - new Date(b.last_practiced);
          if (dateDiff !== 0) return dateDiff;
        }
        return a.score - b.score;
      })
      .slice(0, 6);

    const masteryAvailable = totalTopics > 0 && completedTopics.length === totalTopics;
    const recentExams = queryRecentExamsStmt.all(userId, level);

    results[level] = {
      level,
      totalTopics,
      completedCount: completedTopics.length,
      eligibleMilestoneCount: eligibleMilestoneTopics.length,
      milestone: {
        available: milestoneAvailable,
        totalQuestions: 20,
        candidateTopicCount: candidateMilestoneTopics.length,
        candidateTopics: candidateMilestoneTopics.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          score: t.score,
          is_locked: t.is_locked
        }))
      },
      mastery: {
        available: masteryAvailable,
        totalTopics,
        completedCount: completedTopics.length,
        totalQuestions: 30
      },
      recentExams
    };
  }

  return results;
}

/**
 * Generate full interactive exam (20 questions for milestone, 30 for mastery)
 */
export async function generateExamQuestions({ db, userId, level = 'A1', examType = 'milestone', topicIds = [], apiKey = '' }) {
  ensureCurriculumExamsSchema(db);

  const queryTopicsStmt = db.prepare(`
    SELECT ct.id, ct.name, ct.category, ct.level, ct.pedagogical_order,
           COALESCE(cp.score, 0) as score,
           COALESCE(cp.status, 'not_started') as status,
           COALESCE(cp.is_locked, 0) as is_locked
    FROM curriculum_topics ct
    LEFT JOIN user_topic_progress cp ON cp.curriculum_topic_id = ct.id AND cp.user_id = ?
    WHERE ct.source = 'preset' AND ct.level = ?
    ORDER BY ct.pedagogical_order ASC, ct.id ASC
  `);

  const allLevelTopics = queryTopicsStmt.all(userId, level);
  let selectedTopics = [];
  const targetQuestionCount = examType === 'level_mastery' ? 30 : 20;

  if (examType === 'level_mastery') {
    selectedTopics = allLevelTopics;
    if (selectedTopics.length === 0) {
      throw new Error(`Нет доступных тем для уровня ${level}.`);
    }
  } else if (Array.isArray(topicIds) && topicIds.length > 0) {
    // Custom user-selected topics (any 1..N topics chosen by student)
    selectedTopics = allLevelTopics.filter((t) => topicIds.includes(t.id));
    if (selectedTopics.length === 0) {
      selectedTopics = allLevelTopics.slice(0, 4);
    }
  } else if (examType === 'custom') {
    selectedTopics = allLevelTopics.slice(0, 4);
  } else {
    // Standard milestone mode
    const eligible = allLevelTopics.filter((t) => t.score >= 50 && t.is_locked === 0);
    if (eligible.length >= 4) {
      selectedTopics = eligible.slice(0, 6);
    } else {
      selectedTopics = allLevelTopics.slice(0, 4);
    }
  }

  // Sample student vocabulary
  const userWords = db.prepare('SELECT word, translation FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT 25').all(userId);
  const vocabListStr = userWords.length > 0 ? userWords.map((w) => `${w.word} (${w.translation})`).join(', ') : 'house (дом), car (машина), friend (друг), time (время), book (книга)';

  const topicsListStr = selectedTopics.map((t, idx) => `${idx + 1}. [ID: ${t.id}] ${t.name} (${t.category}, Level: ${t.level})`).join('\n');

  let questions = [];
  const proxyBase = process.env.GEMINI_API_BASE_URL || 'http://127.0.0.1:58433';
  // NOTE: Model 2.5 is strictly for audio/speech generation. In text generation, the primary model is Gemini 3.5 Flash Lite with fallbacks to gemini-3.5-flash and gemini-3.7-flash.
  const aiModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash'];

  async function generateAIBatch(batchTopics, count) {
    const topicsListStr = batchTopics.map((t, idx) => `${idx + 1}. [ID: ${t.id}] ${t.name} (${t.category}, Level: ${t.level})`).join('\n');
    const prompt = `You are a certified Cambridge / CEFR English examiner.
Generate exactly ${count} English exam questions for Level ${level}.
Exam Type: ${examType}.

TOPICS COVERED IN THIS SECTION:
${topicsListStr}

STUDENT VOCABULARY TO EMBED IN QUESTIONS:
${vocabListStr}

CRITICAL EXAM SPECIFICATIONS:
1. Total questions MUST be exactly ${count}.
2. Distribute questions evenly across the listed topics.
3. For type: "multiple-choice", "options" MUST be an array of EXACTLY 4 distinct English choices (1 correct + 3 wrong options).
4. For type: "fill-blank", omit the "options" field.
5. "correctAnswer" MUST be the exact correct English form.
6. "explanation" MUST be a clear, concise grammatical explanation in Russian (1-2 sentences).

OUTPUT SCHEMA (JSON only):
{
  "questions": [
    {
      "id": 1,
      "topicId": ${batchTopics[0]?.id || 1},
      "topicName": "${batchTopics[0]?.name || 'Grammar'}",
      "type": "multiple-choice",
      "question": "Sentence or prompt in English with Russian context",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "alternativeAnswers": ["alt1"],
      "explanation": "Clear explanation in Russian"
    }
  ]
}`;

function safeParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  let cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

    for (const m of aiModels) {
      try {
        const aiRes = await Promise.race([
          fetch(`${proxyBase}/v1beta/models/${m}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
            })
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000))
        ]);

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = safeParseJson(rawJson);
          if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            return parsed.questions;
          }
        } else {
          console.warn(`Model ${m} HTTP ${aiRes.status} in English exam generation:`, await aiRes.text());
        }
      } catch (err) {
        console.warn(`Model ${m} batch error in English exam generation:`, err.message);
      }
    }
    return [];
  }

  if (apiKey && selectedTopics.length > 0) {
    const numBatches = targetQuestionCount >= 30 ? 3 : (targetQuestionCount >= 20 ? 2 : 1);
    const countPerBatch = Math.ceil(targetQuestionCount / numBatches);
    const batches = [];

    for (let b = 0; b < numBatches; b++) {
      const startIdx = Math.floor((b * selectedTopics.length) / numBatches);
      const endIdx = Math.floor(((b + 1) * selectedTopics.length) / numBatches);
      const batchTopics = selectedTopics.slice(startIdx, Math.max(startIdx + 1, endIdx));
      batches.push({ topics: batchTopics.length > 0 ? batchTopics : selectedTopics, count: countPerBatch });
    }

    try {
      const rawCombined = [];
      for (const b of batches) {
        const batchQ = await generateAIBatch(b.topics, b.count);
        if (Array.isArray(batchQ)) {
          rawCombined.push(...batchQ);
        }
      }
      if (rawCombined.length >= Math.floor(targetQuestionCount * 0.7)) {
        questions = rawCombined.slice(0, targetQuestionCount).map((q, idx) => {
          let type = q.type || 'multiple-choice';
          let options = Array.isArray(q.options) ? q.options.filter(Boolean) : undefined;
          if (type === 'multiple-choice' && (!options || options.length < 2)) {
            type = 'fill-blank';
            options = undefined;
          }
          return {
            ...q,
            id: idx + 1,
            type,
            options,
            level
          };
        });
      }
    } catch (err) {
      console.warn('Error in AI exam generation:', err.message);
    }
  }

  // If AI generation failed, DO NOT fall back to dumb template questions — throw explicit error
  if (questions.length === 0) {
    throw new Error(
      'Failed to generate exam questions via AI (Gemini 3.5+). Please try again in a few moments.'
    );
  }

  return {
    examType,
    level,
    totalQuestions: questions.length,
    topics: selectedTopics.map((t) => ({ id: t.id, name: t.name, level: t.level, category: t.category })),
    questions
  };
}

/**
 * Submit & grade exam results
 */
export function submitExamResult({ db, userId, level, examType, topicIds = [], answers = {}, rawQuestions = [] }) {
  ensureCurriculumExamsSchema(db);

  let correctCount = 0;
  const gradedQuestions = [];
  const topicStats = {};

  for (const q of rawQuestions) {
    const userAnswer = (answers[q.id] || '').trim();
    const isCorrect = checkGrammarAnswerMatch(userAnswer, q.correctAnswer, q.alternativeAnswers || []);

    if (isCorrect) correctCount++;

    if (!topicStats[q.topicId]) {
      topicStats[q.topicId] = { topicId: q.topicId, topicName: q.topicName, total: 0, correct: 0 };
    }
    topicStats[q.topicId].total++;
    if (isCorrect) topicStats[q.topicId].correct++;

    gradedQuestions.push({
      id: q.id,
      topicId: q.topicId,
      topicName: q.topicName,
      type: q.type,
      question: q.question,
      options: q.options,
      userAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation
    });
  }

  const totalQuestions = rawQuestions.length || 1;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= 80 ? 1 : 0;

  // Persist result in database
  const insertStmt = db.prepare(`
    INSERT INTO curriculum_exams (user_id, level, exam_type, topic_ids_json, total_questions, correct_count, score_percent, passed, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRes = insertStmt.run(
    userId,
    level,
    examType,
    JSON.stringify(topicIds),
    totalQuestions,
    correctCount,
    scorePercent,
    passed,
    JSON.stringify({ gradedQuestions, topicStats })
  );

  return {
    examId: insertRes.lastInsertRowid,
    level,
    examType,
    totalQuestions,
    correctCount,
    scorePercent,
    passed: Boolean(passed),
    topicStats: Object.values(topicStats),
    gradedQuestions
  };
}
