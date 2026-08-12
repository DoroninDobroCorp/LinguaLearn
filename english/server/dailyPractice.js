import { recordTopicEvidence } from './topicProgress.js';

export function getWeakTopics(db, userId) {
  const rows = db
    .prepare(
      `
    SELECT c.id, c.name, c.category, c.level,
           COALESCE(p.status, 'not_started') AS status,
           COALESCE(p.score, 0) AS score,
           COALESCE(p.error_count, 0) AS error_count,
           p.last_error_at
    FROM curriculum_topics c
    LEFT JOIN user_topic_progress p ON c.id = p.curriculum_topic_id AND p.user_id = ?
    ORDER BY
      CASE COALESCE(p.status, 'not_started')
        WHEN 'recurring_problem' THEN 1
        WHEN 'insufficient_evidence' THEN 2
        WHEN 'improving' THEN 3
        WHEN 'not_started' THEN 4
        WHEN 'stable' THEN 5
        WHEN 'mastered' THEN 6
        ELSE 7
      END ASC,
      p.score ASC,
      p.error_count DESC,
      c.id ASC
    LIMIT 3
  `
    )
    .all(userId);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    level: r.level,
    status: r.status,
    score: r.score,
  }));
}

export function generateExercises(topics) {
  const exercises = [];
  let exId = 1;

  for (const topic of topics) {
    const topicNameLower = (topic.name || '').toLowerCase();
    const count = topics.length === 3 ? 2 : 3;

    if (topicNameLower.includes('article')) {
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'fill-in-the-blank',
        prompt: 'Fill in the blank with the correct article: She bought ___ apple from the market.',
        options: ['a', 'an', 'the', 'zero article'],
        canonical_answer: 'an',
        explanation_ru: "Употребляется артикль 'an' перед гласным звуком.",
      });
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'multiple-choice',
        prompt: 'Select the correct sentence:',
        options: [
          'The Sun rises in the east.',
          'Sun rises in the east.',
          'A Sun rises in the east.',
          'An Sun rises in the east.',
        ],
        canonical_answer: 'The Sun rises in the east.',
        explanation_ru: "С уникальными природными объектами (Sun, Moon) употребляется артикль 'The'.",
      });
    } else if (topicNameLower.includes('present simple')) {
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'fill-in-the-blank',
        prompt: 'He ___ (work) at a tech company in Berlin.',
        options: ['work', 'works', 'working', 'worked'],
        canonical_answer: 'works',
        explanation_ru: 'В Present Simple к глаголу для 3-го лица ед. ч. (he/she/it) добавляется окончание -s.',
      });
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'multiple-choice',
        prompt: 'Which sentence is in correct Present Simple form?',
        options: [
          'She does not like cold weather.',
          'She do not like cold weather.',
          'She not likes cold weather.',
          'She is not like cold weather.',
        ],
        canonical_answer: 'She does not like cold weather.',
        explanation_ru: 'Отрицание в Present Simple для 3-го лица формируется с помощью does not + смысловой глагол.',
      });
    } else if (topicNameLower.includes('past simple')) {
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'fill-in-the-blank',
        prompt: 'Yesterday, we ___ (visit) the new museum downtown.',
        options: ['visit', 'visited', 'visiting', 'visits'],
        canonical_answer: 'visited',
        explanation_ru: 'Форма Past Simple для правильного глагола visit — visited.',
      });
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'multiple-choice',
        prompt: "Choose the correct past form of the irregular verb 'go':",
        options: ['goed', 'went', 'gone', 'going'],
        canonical_answer: 'went',
        explanation_ru: "Форма прошедшего времени (Past Simple) для глагола 'go' — 'went'.",
      });
    } else if (topicNameLower.includes('verb "to be"') || topicNameLower.includes('to be')) {
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'fill-in-the-blank',
        prompt: 'They ___ very pleased with the final result.',
        options: ['am', 'is', 'are', 'be'],
        canonical_answer: 'are',
        explanation_ru: "Для местоимения множественного числа 'they' используется форма глагола to be — 'are'.",
      });
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'fill-in-the-blank',
        prompt: 'I ___ an engineer working on software systems.',
        options: ['am', 'is', 'are', 'be'],
        canonical_answer: 'am',
        explanation_ru: "Для 1-го лица единственного числа ('I') глагол to be имеет форму 'am'.",
      });
    } else {
      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'multiple-choice',
        prompt: `Choose the correct option applying the rule for '${topic.name}':`,
        options: [
          `Correct usage of ${topic.name}`,
          `Incorrect form of ${topic.name}`,
          `Unrelated sentence structure`,
          `Malformed grammar expression`,
        ],
        canonical_answer: `Correct usage of ${topic.name}`,
        explanation_ru: `Правильное употребление языковой конструкции по теме '${topic.name}'.`,
      });

      exercises.push({
        id: `ex_${exId++}`,
        curriculum_topic_id: topic.id,
        topic_name: topic.name,
        type: 'fill-in-the-blank',
        prompt: `Complete the practice item for '${topic.name}': Select target form:`,
        options: [topic.name, 'Wrong answer 1', 'Wrong answer 2', 'Wrong answer 3'],
        canonical_answer: topic.name,
        explanation_ru: `В данном задании тренируется тема '${topic.name}'.`,
      });

      if (count === 3) {
        exercises.push({
          id: `ex_${exId++}`,
          curriculum_topic_id: topic.id,
          topic_name: topic.name,
          type: 'rewrite',
          prompt: `Target practice sentence for '${topic.name}': Write standard form:`,
          options: [`Standard form of ${topic.name}`, `Draft 1`, `Draft 2`],
          canonical_answer: `Standard form of ${topic.name}`,
          explanation_ru: `Закрепление знаний по теме '${topic.name}'.`,
        });
      }
    }
  }

  return exercises;
}

export function createDailyPracticeService(db) {
  return {
    getTodaySession(req, res) {
      const userId = req.userId || (req.user && req.user.id);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const existing = db
        .prepare(
          `
        SELECT * FROM practice_sessions
        WHERE user_id = ? AND status = 'in_progress'
        ORDER BY created_at DESC LIMIT 1
      `
        )
        .get(userId);

      if (existing) {
        const sessionObj = {
          id: existing.id,
          user_id: existing.user_id,
          status: existing.status,
          topics: JSON.parse(existing.topics_json),
          exercises: JSON.parse(existing.exercises_json),
          user_answers: JSON.parse(existing.user_answers_json || '[]'),
          results: JSON.parse(existing.results_json || '[]'),
          created_at: existing.created_at,
          completed_at: existing.completed_at,
        };
        return res.json({ ...sessionObj, session: sessionObj });
      }

      const topics = getWeakTopics(db, userId);
      const exercises = generateExercises(topics);
      const sessionId = 'prac_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      db.prepare(
        `
        INSERT INTO practice_sessions (
          id, user_id, status, topics_json, exercises_json, user_answers_json, results_json, created_at
        ) VALUES (?, ?, 'in_progress', ?, ?, '[]', '[]', ?)
      `
      ).run(sessionId, userId, JSON.stringify(topics), JSON.stringify(exercises), nowStr);

      const newSession = {
        id: sessionId,
        user_id: userId,
        status: 'in_progress',
        topics,
        exercises,
        user_answers: [],
        results: [],
        created_at: nowStr,
        completed_at: null,
      };

      return res.json({ ...newSession, session: newSession });
    },

    completeSession(req, res) {
      const userId = req.userId || (req.user && req.user.id);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sessionId = req.params.id;
      const session = db
        .prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?')
        .get(sessionId, userId);

      if (!session) {
        return res.status(404).json({ error: 'Practice session not found' });
      }

      if (session.status === 'completed') {
        const cachedSession = {
          id: session.id,
          user_id: session.user_id,
          status: session.status,
          topics: JSON.parse(session.topics_json),
          exercises: JSON.parse(session.exercises_json),
          user_answers: JSON.parse(session.user_answers_json || '[]'),
          results: JSON.parse(session.results_json || '[]'),
          created_at: session.created_at,
          completed_at: session.completed_at,
          already_completed: true,
        };
        return res.json({ ...cachedSession, session: cachedSession });
      }

      const exercises = JSON.parse(session.exercises_json);
      const answersInput = req.body.answers || [];

      const answerMap = {};
      if (Array.isArray(answersInput)) {
        for (const item of answersInput) {
          if (item && item.exercise_id) {
            answerMap[item.exercise_id] = String(item.answer || '').trim();
          }
        }
      } else if (typeof answersInput === 'object' && answersInput !== null) {
        for (const [k, v] of Object.entries(answersInput)) {
          answerMap[k] = String(v || '').trim();
        }
      }

      const results = [];
      const topicPerformance = {};

      for (const ex of exercises) {
        const userAns = answerMap[ex.id] || '';
        const normUser = userAns.trim().toLowerCase().replace(/[.,!?]$/, '');
        const normCanon = String(ex.canonical_answer || '').trim().toLowerCase().replace(/[.,!?]$/, '');
        const isCorrect = normUser === normCanon;

        results.push({
          exercise_id: ex.id,
          curriculum_topic_id: ex.curriculum_topic_id,
          topic_name: ex.topic_name,
          user_answer: userAns,
          canonical_answer: ex.canonical_answer,
          is_correct: isCorrect,
          explanation_ru: ex.explanation_ru,
        });

        const tId = ex.curriculum_topic_id;
        if (!topicPerformance[tId]) {
          topicPerformance[tId] = { correct: 0, total: 0 };
        }
        topicPerformance[tId].total += 1;
        if (isCorrect) {
          topicPerformance[tId].correct += 1;
        }
      }

      const topics = JSON.parse(session.topics_json);
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      db.transaction(() => {
        for (const t of topics) {
          const perf = topicPerformance[t.id] || { correct: 0, total: 0 };
          const outcome = perf.correct >= Math.ceil(perf.total / 2) && perf.correct > 0 ? 'success' : 'error';
          recordTopicEvidence(db, {
            userId,
            curriculumTopicId: t.id,
            outcome,
            confidence: 1.0,
            timestamp: nowStr,
          });
        }

        db.prepare(
          `
          UPDATE practice_sessions
          SET status = 'completed',
              user_answers_json = ?,
              results_json = ?,
              completed_at = ?
          WHERE id = ? AND user_id = ?
        `
        ).run(JSON.stringify(answersInput), JSON.stringify(results), nowStr, sessionId, userId);
      })();

      const completedSession = {
        id: session.id,
        user_id: userId,
        status: 'completed',
        topics: topics,
        exercises: exercises,
        user_answers: answersInput,
        results: results,
        created_at: session.created_at,
        completed_at: nowStr,
      };

      return res.json({ ...completedSession, session: completedSession });
    },

    getSessionById(req, res) {
      const userId = req.userId || (req.user && req.user.id);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sessionId = req.params.id;
      const session = db
        .prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?')
        .get(sessionId, userId);

      if (!session) {
        return res.status(404).json({ error: 'Practice session not found' });
      }

      const sessionObj = {
        id: session.id,
        user_id: session.user_id,
        status: session.status,
        topics: JSON.parse(session.topics_json),
        exercises: JSON.parse(session.exercises_json),
        user_answers: JSON.parse(session.user_answers_json || '[]'),
        results: JSON.parse(session.results_json || '[]'),
        created_at: session.created_at,
        completed_at: session.completed_at,
      };

      return res.json({ ...sessionObj, session: sessionObj });
    },
  };
}
