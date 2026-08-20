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

  if (examType === 'milestone') {
    const eligible = allLevelTopics.filter((t) => t.score >= 50 && t.is_locked === 0);

    if (Array.isArray(topicIds) && topicIds.length > 0) {
      selectedTopics = eligible.filter((t) => topicIds.includes(t.id));
    } else {
      selectedTopics = eligible.slice(0, 6);
    }

    if (selectedTopics.length < 4) {
      selectedTopics = eligible.slice(0, 6);
    }

    if (selectedTopics.length < 4) {
      throw new Error(
        `Для промежуточного экзамена требуется минимум 4 изученные темы (прогресс от 50%), не замороженные на 100%. Сейчас доступно: ${eligible.length}.`
      );
    }

    selectedTopics = selectedTopics.slice(0, 6);
  } else {
    selectedTopics = allLevelTopics;
    if (selectedTopics.length === 0) {
      throw new Error(`Нет доступных тем для уровня ${level}.`);
    }
  }

  // Sample student vocabulary
  const userWords = db.prepare('SELECT word, translation FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT 25').all(userId);
  const vocabListStr = userWords.length > 0 ? userWords.map((w) => `${w.word} (${w.translation})`).join(', ') : 'house (дом), car (машина), friend (друг), time (время), book (книга)';

  const topicsListStr = selectedTopics.map((t, idx) => `${idx + 1}. [ID: ${t.id}] ${t.name} (${t.category}, Level: ${t.level})`).join('\n');

  const prompt = `You are a certified Cambridge / CEFR English language examiner.
Generate a rigorous, engaging, and pedagogically balanced English EXAM of exactly ${targetQuestionCount} questions for Level ${level}.
Exam Type: ${examType === 'level_mastery' ? 'FINAL LEVEL MASTERY EXAM (30 questions)' : 'INTERMEDIATE MILESTONE EXAM (20 questions)'}.

TOPICS COVERED IN THIS EXAM:
${topicsListStr}

STUDENT VOCABULARY TO EMBED IN QUESTIONS:
${vocabListStr}

CRITICAL EXAM SPECIFICATIONS:
1. Total questions MUST be exactly ${targetQuestionCount}.
2. Distribute questions evenly across the ${selectedTopics.length} topics.
3. 70% multiple-choice (4 options) and 30% fill-in-the-blank questions.
4. "explanation" MUST be in Russian explaining the grammar rule.

OUTPUT SCHEMA (Respond ONLY with valid JSON):
{
  "examType": "${examType}",
  "level": "${level}",
  "totalQuestions": ${targetQuestionCount},
  "questions": [
    {
      "id": 1,
      "topicId": ${selectedTopics[0].id},
      "topicName": "${selectedTopics[0].name}",
      "type": "multiple-choice",
      "question": "Sentence or prompt in English with Russian context",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "alternativeAnswers": ["alt1"],
      "explanation": "Clear explanation in Russian"
    }
  ]
}`;

  let questions = [];
  const aiModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];

  if (apiKey) {
    for (const m of aiModels) {
      try {
        const aiRes = await Promise.race([
          fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.6 }
            })
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
        ]);

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed.questions) && parsed.questions.length >= 10) {
            questions = parsed.questions.map((q, idx) => ({
              ...q,
              id: idx + 1,
              level
            }));
            break;
          }
        }
      } catch (err) {
        console.warn(`Model ${m} error in English exam generation:`, err.message);
      }
    }
  }

  // Fallback generation
  if (questions.length === 0) {
    const questionsPerTopic = Math.max(1, Math.floor(targetQuestionCount / selectedTopics.length));
    let qId = 1;

    for (const t of selectedTopics) {
      for (let i = 0; i < questionsPerTopic && questions.length < targetQuestionCount; i++) {
        const ex = generateEnglishExercise({
          topic: t,
          exerciseType: i % 2 === 0 ? 'multiple-choice' : 'fill-blank',
          targetWordObj: userWords[i % userWords.length] || { word: 'book', translation: 'книга' },
          allUserWords: userWords
        });

        questions.push({
          id: qId++,
          topicId: t.id,
          topicName: t.name,
          type: ex.type || 'multiple-choice',
          question: ex.question,
          options: ex.options || ['is', 'are', 'am', 'be'],
          correctAnswer: ex.correctAnswer,
          alternativeAnswers: [ex.correctAnswer],
          explanation: ex.explanation || `Правило темы "${t.name}".`,
          level
        });
      }
    }

    // Fill remainder up to targetQuestionCount
    while (questions.length < targetQuestionCount) {
      const t = selectedTopics[questions.length % selectedTopics.length];
      const ex = generateEnglishExercise({
        topic: t,
        exerciseType: 'multiple-choice',
        targetWordObj: userWords[questions.length % userWords.length] || { word: 'house', translation: 'дом' },
        allUserWords: userWords
      });

      questions.push({
        id: qId++,
        topicId: t.id,
        topicName: t.name,
        type: 'multiple-choice',
        question: ex.question,
        options: ex.options || ['is', 'are', 'am', 'be'],
        correctAnswer: ex.correctAnswer,
        alternativeAnswers: [ex.correctAnswer],
        explanation: ex.explanation || `Правило темы "${t.name}".`,
        level
      });
    }
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
