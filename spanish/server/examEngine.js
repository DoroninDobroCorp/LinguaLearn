/**
 * Spanish Curriculum Examination Engine
 * Handles Milestone Exams (20 questions, 4-6 topics >= 50%, excluding 100% locked)
 * and Level Mastery Exams (30 questions, complete level).
 */

import { generateSpanishExercise } from './grammarExerciseEngine.js';

export function ensureCurriculumExamsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS curriculum_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_curriculum_exams_profile ON curriculum_exams(profile_id, level);
  `);
}

function normalizeSentence(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\\s+/g, ' ')
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

  const stripAccents = (str) => str.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  if (stripAccents(normUser) === stripAccents(normCorrect)) return true;
  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (stripAccents(normalizeSentence(alt)) === stripAccents(normUser)) return true;
    }
  }

  return false;
}

/**
 * Returns available milestone & level mastery exam status for all levels
 */
export function getExamsStatus(db, profileId) {
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
    LEFT JOIN curriculum_progress cp ON cp.topic_id = ct.id AND cp.profile_id = ?
    WHERE ct.source = 'preset' AND ct.level = ?
    ORDER BY ct.pedagogical_order ASC, ct.id ASC
  `);

  const queryRecentExamsStmt = db.prepare(`
    SELECT id, exam_type, total_questions, correct_count, score_percent, passed, created_at
    FROM curriculum_exams
    WHERE profile_id = ? AND level = ?
    ORDER BY id DESC
    LIMIT 3
  `);

  for (const level of CEFR_LEVELS) {
    const topics = queryTopicsStmt.all(profileId, level);
    const totalTopics = topics.length;

    // A topic is completed if score >= 50 or is_locked == 1
    const completedTopics = topics.filter((t) => t.score >= 50 || t.is_locked === 1);

    // Eligible milestone topics: score >= 50 AND is_locked == 0 (excluding 100% frozen/locked)
    const eligibleMilestoneTopics = topics.filter((t) => t.score >= 50 && t.is_locked === 0);

    const milestoneAvailable = eligibleMilestoneTopics.length >= 4;

    // Pick candidate topics (up to 6) prioritized by oldest practiced / lower score
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
    const recentExams = queryRecentExamsStmt.all(profileId, level);

    results[level] = {
      level,
      totalTopics,
      completedCount: completedTopics.length,
      eligibleMilestoneCount: eligibleMilestoneTopics.length,
      milestone: {
        available: milestoneAvailable,
        required: 4,
        maxBatch: 6,
        totalQuestions: 20,
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
export async function generateExamQuestions({ db, profileId, level = 'A1', examType = 'milestone', topicIds = [], apiKey = '' }) {
  ensureCurriculumExamsSchema(db);

  const queryTopicsStmt = db.prepare(`
    SELECT ct.id, ct.name, ct.category, ct.level, ct.pedagogical_order,
           COALESCE(cp.score, 0) as score,
           COALESCE(cp.status, 'not_started') as status,
           COALESCE(cp.is_locked, 0) as is_locked
    FROM curriculum_topics ct
    LEFT JOIN curriculum_progress cp ON cp.topic_id = ct.id AND cp.profile_id = ?
    WHERE ct.source = 'preset' AND ct.level = ?
    ORDER BY ct.pedagogical_order ASC, ct.id ASC
  `);

  const allLevelTopics = queryTopicsStmt.all(profileId, level);
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
      // If user passed specific IDs but fewer than 4, take up to 6 from eligible
      selectedTopics = eligible.slice(0, 6);
    }

    if (selectedTopics.length < 4) {
      throw new Error(
        `Для промежуточного экзамена требуется минимум 4 изученные темы (прогресс от 50%), не замороженные на 100%. Сейчас доступно: ${eligible.length}.`
      );
    }

    selectedTopics = selectedTopics.slice(0, 6);
  } else {
    // Level mastery covers all preset topics of the level
    selectedTopics = allLevelTopics;
    if (selectedTopics.length === 0) {
      throw new Error(`Нет доступных тем для уровня ${level}.`);
    }
  }

  // Sample student vocabulary words for context
  const userWords = db.prepare('SELECT word, translation FROM vocabulary WHERE profile_id = ? ORDER BY RANDOM() LIMIT 25').all(profileId);
  const vocabListStr = userWords.length > 0 ? userWords.map((w) => `${w.word} (${w.translation})`).join(', ') : 'casa (дом), auto (машина), amigo (друг), tiempo (время), libro (книга)';

  const topicsListStr = selectedTopics.map((t, idx) => `${idx + 1}. [ID: ${t.id}] ${t.name} (${t.category}, Level: ${t.level})`).join('\n');

  const prompt = `You are a certified DELE / CEFR Spanish language examiner and senior professor.
Generate a rigorous, engaging, and pedagogically balanced Spanish EXAM of exactly ${targetQuestionCount} questions for Level ${level}.
Exam Type: ${examType === 'level_mastery' ? 'FINAL LEVEL MASTERY EXAM (30 questions)' : 'INTERMEDIATE MILESTONE EXAM (20 questions)'}.

TOPICS COVERED IN THIS EXAM:
${topicsListStr}

STUDENT VOCABULARY TO EMBED IN QUESTIONS:
${vocabListStr}

CRITICAL EXAM SPECIFICATIONS:
1. QUESTION DISTRIBUTION:
   - Total questions MUST be exactly ${targetQuestionCount}.
   - Distribute the questions evenly across the listed ${selectedTopics.length} topics.
   - For every question, include the exact "topicId" and "topicName" from the list above.

2. RIGOROUS GRAMMAR & CONTEXTUAL QUESTIONS:
   - Test diverse grammatical persons (yo, tú, vos, él/ella, nosotros, ellos/ustedes).
   - Test affirmative, negative (no...), and interrogative (¿...?) forms.
   - Every question must be a realistic, communicative Spanish sentence (not isolated word tests).
   - Include 70% multiple-choice (with 4 distinct options: 1 correct + 3 plausible distractors) and 30% fill-blank questions.

3. ACCURACY, RUSSIAN INSTRUCTIONS & EXPLANATIONS:
   - Questions should have clear instructions in Russian (or Spanish with context).
   - "correctAnswer" MUST be the exact correct Spanish form.
   - "alternativeAnswers" MUST include valid synonyms, Argentine voseo variations, and common accent-less spellings.
   - "explanation" MUST be a crystal-clear, detailed grammatical explanation in Russian explaining why this answer is correct and why the alternatives are incorrect.

OUTPUT SCHEMA (Respond ONLY with valid JSON):
{
  "examType": "${examType}",
  "level": "${level}",
  "totalQuestions": ${targetQuestionCount},
  "questions": [
    {
      "id": 1,
      "topicId": 7,
      "topicName": "Subject pronouns (yo/tú/vos/él/ella)",
      "type": "multiple-choice",
      "question": "Sentence or prompt in Spanish with Russian context",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "alternativeAnswers": ["alt1", "alt2"],
      "explanation": "Clear grammatical explanation in Russian"
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
        console.warn(`Model ${m} error in exam generation:`, err.message);
      }
    }
  }

  // Fallback generation if AI failed
  if (questions.length === 0) {
    const questionsPerTopic = Math.max(1, Math.floor(targetQuestionCount / selectedTopics.length));
    let qId = 1;

    for (const t of selectedTopics) {
      for (let i = 0; i < questionsPerTopic && questions.length < targetQuestionCount; i++) {
        const ex = generateSpanishExercise({
          topic: t,
          exerciseType: i % 2 === 0 ? 'multiple-choice' : 'fill-blank',
          targetWordObj: userWords[i % userWords.length] || { word: 'casa', translation: 'дом' },
          allUserWords: userWords
        });

        questions.push({
          id: qId++,
          topicId: t.id,
          topicName: t.name,
          type: ex.type || 'multiple-choice',
          question: ex.question,
          options: ex.options || ['está', 'es', 'son', 'están'],
          correctAnswer: ex.correctAnswer,
          alternativeAnswers: [ex.correctAnswer],
          explanation: ex.explanation,
          level
        });
      }
    }

    // Fill remaining if needed
    while (questions.length < targetQuestionCount && selectedTopics.length > 0) {
      const t = selectedTopics[questions.length % selectedTopics.length];
      const ex = generateSpanishExercise({
        topic: t,
        exerciseType: 'multiple-choice',
        targetWordObj: { word: 'amigo', translation: 'друг' },
        allUserWords: userWords
      });
      questions.push({
        id: qId++,
        topicId: t.id,
        topicName: t.name,
        type: 'multiple-choice',
        question: ex.question,
        options: ex.options || ['tú', 'vos', 'él', 'nosotros'],
        correctAnswer: ex.correctAnswer,
        alternativeAnswers: [ex.correctAnswer],
        explanation: ex.explanation,
        level
      });
    }
  }

  return {
    examType,
    level,
    totalQuestions: questions.length,
    topics: selectedTopics.map((t) => ({ id: t.id, name: t.name, category: t.category, score: t.score })),
    questions
  };
}

/**
 * Submits and grades the exam, awards scores, and records in database
 */
export function submitExamResult({ db, profileId, level = 'A1', examType = 'milestone', topicIds = [], answers = [], durationSeconds = 0 }) {
  ensureCurriculumExamsSchema(db);

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('Ответы на экзамен обязательны.');
  }

  let correctCount = 0;
  const gradedQuestions = [];
  const topicStats = {};

  for (const ans of answers) {
    const isCorrect = checkGrammarAnswerMatch(ans.userAnswer, ans.correctAnswer, ans.alternativeAnswers || []);
    if (isCorrect) correctCount++;

    const topicId = ans.topicId || 0;
    const topicName = ans.topicName || 'Общая тема';

    if (!topicStats[topicId]) {
      topicStats[topicId] = { topicId, topicName, total: 0, correct: 0 };
    }
    topicStats[topicId].total++;
    if (isCorrect) topicStats[topicId].correct++;

    gradedQuestions.push({
      id: ans.id,
      topicId,
      topicName,
      question: ans.question,
      userAnswer: ans.userAnswer,
      correctAnswer: ans.correctAnswer,
      alternativeAnswers: ans.alternativeAnswers || [],
      isCorrect,
      explanation: ans.explanation || ''
    });
  }

  const totalQuestions = answers.length;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= 80;

  const breakdownByTopic = Object.values(topicStats).map((ts) => ({
    ...ts,
    scorePercent: Math.round((ts.correct / ts.total) * 100),
    mastered: ts.correct === ts.total
  }));

  // Update progress in database
  db.transaction(() => {
    // Score update for tested topics
    for (const ts of breakdownByTopic) {
      if (ts.topicId > 0) {
        if (ts.scorePercent >= 75) {
          // Bonus +5% to topic score (up to 95%, without locking)
          db.prepare(`
            INSERT INTO curriculum_progress (topic_id, profile_id, score, status, success_count, last_practiced)
            VALUES (?, ?, ?, 'in_progress', 1, CURRENT_TIMESTAMP)
            ON CONFLICT(topic_id, profile_id) DO UPDATE SET
              score = CASE WHEN is_locked = 1 THEN score ELSE MIN(95, MAX(score, score + 5)) END,
              status = CASE WHEN is_locked = 1 THEN 'mastered' WHEN score + 5 >= 80 THEN 'mastered' ELSE 'in_progress' END,
              success_count = success_count + 1,
              last_practiced = CURRENT_TIMESTAMP
          `).run(ts.topicId, profileId, Math.min(95, ts.scorePercent));
        } else {
          db.prepare(`
            INSERT INTO curriculum_progress (topic_id, profile_id, score, status, failure_count, last_practiced)
            VALUES (?, ?, 30, 'in_progress', 1, CURRENT_TIMESTAMP)
            ON CONFLICT(topic_id, profile_id) DO UPDATE SET
              failure_count = failure_count + 1,
              last_practiced = CURRENT_TIMESTAMP
          `).run(ts.topicId, profileId);
        }
      }
    }

    // Save exam record
    const insertExamStmt = db.prepare(`
      INSERT INTO curriculum_exams (
        profile_id, level, exam_type, topic_ids_json, total_questions,
        correct_count, score_percent, passed, details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertExamStmt.run(
      profileId,
      level,
      examType,
      JSON.stringify(topicIds || []),
      totalQuestions,
      correctCount,
      scorePercent,
      passed ? 1 : 0,
      JSON.stringify({
        durationSeconds,
        breakdownByTopic,
        gradedQuestions
      })
    );
  })();

  return {
    passed,
    scorePercent,
    correctCount,
    totalQuestions,
    level,
    examType,
    breakdownByTopic,
    gradedQuestions
  };
}
