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
export async function generateExamQuestions({ db, profileId, level = 'A1', examType = 'milestone', topicIds = [], apiKey = '', recentMistakes = [] }) {
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

  // Sample student vocabulary words for context
  const userWords = db.prepare('SELECT word, translation FROM vocabulary WHERE profile_id = ? ORDER BY RANDOM() LIMIT 25').all(profileId);
  const vocabListStr = userWords.length > 0 ? userWords.map((w) => `${w.word} (${w.translation})`).join(', ') : 'casa (дом), auto (машина), amigo (друг), tiempo (время), libro (книга)';

  let mistakesInstruction = '';
  if (Array.isArray(recentMistakes) && recentMistakes.length > 0) {
    const mistakeListStr = recentMistakes.map((m, i) => `${i + 1}. [${m.topic_name || m.category || 'Topic'}] Prompt: "${m.prompt}" | Student failed with: "${m.user_wrong_answer}" ❌ | Correct was: "${m.correct_answer}" ✅ (Rule: ${m.rule_explanation || ''})`).join('\n');
    mistakesInstruction = `
CRITICAL ADAPTIVE REMEDIATION MANDATE (STUDENT WEAK SPOTS):
The student previously struggled and failed on the following grammar items:
${mistakeListStr}
You MUST dedicate several questions in this batch to directly drilling, testing, and reinforcing these exact failed forms (verb conjugations, gender/number agreements, prepositions), giving the student a direct chance to conquer their past mistakes!
`;
  }

  const topicsListStr = selectedTopics.map((t, idx) => `${idx + 1}. [ID: ${t.id}] ${t.name} (${t.category}, Level: ${t.level})`).join('\n');

  let questions = [];
  const proxyBase = process.env.GEMINI_API_BASE_URL || 'http://127.0.0.1:58433';
  const aiModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

  async function generateAIBatch(batchTopics, count) {
    const topicsListStr = batchTopics.map((t, idx) => `${idx + 1}. [ID: ${t.id}] ${t.name} (${t.category}, Level: ${t.level})`).join('\n');
    const prompt = `You are a certified DELE / CEFR Spanish language examiner.
Generate exactly ${count} Spanish exam questions for Level ${level}.
Exam Type: ${examType}.

TOPICS COVERED IN THIS SECTION:
${topicsListStr}

STUDENT VOCABULARY TO EMBED IN QUESTIONS:
${vocabListStr}
${mistakesInstruction}

CRITICAL EXAM SPECIFICATIONS:
1. QUESTION DISTRIBUTION:
   - Total questions MUST be exactly ${count}.
   - Distribute questions evenly across the listed topics.
   - For every question, include the exact "topicId" and "topicName" from the list above.

2. RIGOROUS GRAMMAR & CONTEXTUAL QUESTIONS:
   - Test diverse grammatical persons (yo, tú, vos, él/ella, nosotros, ellos/ustedes).
   - Test affirmative, negative, and interrogative sentences.
   - For type: "multiple-choice", "options" MUST be an array of EXACTLY 4 distinct Spanish choices (1 correct + 3 wrong options). Example: ["el", "la", "los", "las"].
   - For type: "fill-blank", omit the "options" field.

3. ACCURACY & RUSSIAN EXPLANATIONS:
   - Clear instructions in Russian (or Spanish with context).
   - "correctAnswer" MUST be the exact correct Spanish form.
   - "alternativeAnswers" MUST include valid synonyms, Argentine voseo variations, and common accent-less spellings.
   - "explanation" MUST be a clear, concise grammatical explanation in Russian (1-2 sentences).

OUTPUT SCHEMA (Respond ONLY with valid JSON):
{
  "questions": [
    {
      "id": 1,
      "topicId": ${batchTopics[0]?.id || 1},
      "topicName": "${batchTopics[0]?.name || 'Gramática'}",
      "type": "multiple-choice",
      "question": "Sentence or prompt in Spanish with Russian context",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "alternativeAnswers": ["alt1"],
      "explanation": "Clear grammatical explanation in Russian"
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
          console.warn(`Model ${m} HTTP ${aiRes.status} in exam generation:`, await aiRes.text());
        }
      } catch (err) {
        console.warn(`Model ${m} batch error in exam generation:`, err.message);
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
      'Не удалось сгенерировать вопросы экзамена через нейросеть (Gemini 3.5+). Пожалуйста, повторите попытку через несколько секунд.'
    );
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
