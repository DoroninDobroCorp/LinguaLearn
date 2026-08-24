import express from 'express';
import { 
  getWordTilesBatch, 
  verifyWordTiles, 
  getSpeedMatchItems, 
  getErrorDetectiveBatch, 
  verifyErrorDetective 
} from '../gameExercises.js';
import { generateExamQuestions } from '../examEngine.js';

export function createExerciseRoutes({ db, getUserId }) {
  const router = express.Router();

  // 1. Word Tiles
  router.get('/word-tiles', (req, res) => {
    try {
      const level = req.query.level || null;
      const items = getWordTilesBatch(level);
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/word-tiles/verify', (req, res) => {
    try {
      const { itemId, userSentence } = req.body || {};
      const result = verifyWordTiles(itemId, userSentence);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Speed Match
  router.get('/speed-match', (req, res) => {
    try {
      const count = Number(req.query.count) || 6;
      const pairs = getSpeedMatchItems(count);
      res.json({ pairs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/speed-match/finish', (req, res) => {
    try {
      const { score, timeSeconds, pairsMatched } = req.body || {};
      res.json({ success: true, score, timeSeconds, pairsMatched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Error Detective
  router.get('/error-detective', (req, res) => {
    try {
      const level = req.query.level || null;
      const items = getErrorDetectiveBatch(level);
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/error-detective/verify', (req, res) => {
    try {
      const { itemId, chosenOption } = req.body || {};
      const result = verifyErrorDetective(itemId, chosenOption);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Batch AI Exercises Generator for Selected Topics
  router.post('/generate-batch', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { level = 'A1', topicIds = [], count = 10 } = req.body || {};
      const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

      const exam = await generateExamQuestions({
        db,
        userId,
        level,
        examType: 'custom',
        topicIds,
        apiKey
      });

      const exercises = (exam.questions || []).slice(0, count).map((q) => ({
        id: q.id,
        topicId: q.topicId,
        topic: q.topicName,
        level: q.level || level,
        type: q.type || 'multiple-choice',
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        alternativeAnswers: q.alternativeAnswers || [q.correctAnswer],
        explanation: q.explanation || ''
      }));

      res.json({
        success: true,
        exercises,
        topicsCount: topicIds.length
      });
    } catch (error) {
      console.error('Error generating English exercises batch:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Sentence Translation Generator
  router.post('/generate-translation', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { topicIds, topicId, level } = req.body || {};

      const allWords = db.prepare('SELECT id, word, translation, example, learned_permanently_at FROM vocabulary WHERE user_id = ?').all(userId);
      const learnedWords = allWords.filter((w) => w.learned_permanently_at !== null && w.learned_permanently_at !== undefined);
      const activeWords = allWords.filter((w) => !w.learned_permanently_at);

      let selectedPool = [];
      let vocabularySource = 'combined';
      let poolCount = allWords.length;
      let poolLabel = 'All vocabulary';

      if (learnedWords.length >= 100) {
        selectedPool = learnedWords;
        vocabularySource = 'learned_forever';
        poolCount = learnedWords.length;
        poolLabel = `Mastered words (${learnedWords.length})`;
      } else if (activeWords.length >= 100) {
        selectedPool = activeWords;
        vocabularySource = 'active_studying';
        poolCount = activeWords.length;
        poolLabel = `Studying words (${activeWords.length})`;
      } else {
        selectedPool = allWords.length > 0 ? allWords : [{ word: 'house', translation: 'дом' }, { word: 'big', translation: 'большой' }];
        vocabularySource = 'combined';
        poolCount = allWords.length;
        poolLabel = `All words (${allWords.length})`;
      }

      const sampledWords = [...selectedPool].sort(() => 0.5 - Math.random()).slice(0, 30);
      const vocabListStr = sampledWords.map((w) => `${w.word} (${w.translation})`).join(', ');

      let selectedTopicRows = [];
      if (Array.isArray(topicIds) && topicIds.length > 0) {
        const placeholders = topicIds.map(() => '?').join(',');
        selectedTopicRows = db.prepare(`SELECT id, name, category, level FROM curriculum_topics WHERE id IN (${placeholders})`).all(...topicIds);
      } else if (topicId && topicId !== 'all') {
        const single = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE id = ?').get(topicId);
        if (single) selectedTopicRows = [single];
      } else if (level && level !== 'all') {
        selectedTopicRows = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE level = ? ORDER BY RANDOM() LIMIT 4').all(level);
      }

      if (selectedTopicRows.length === 0) {
        selectedTopicRows = db.prepare('SELECT id, name, category, level FROM curriculum_topics ORDER BY RANDOM() LIMIT 3').all();
      }

      const topicsStr = selectedTopicRows.map((t, idx) => `${idx + 1}. ${t.name} (${t.category}, ${t.level})`).join('\n');

      const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
      const prompt = `You are an elite English language professor.
Your task is to generate 10 full-sentence translation exercises for a student.

SELECTED GRAMMAR TOPIC(S):
${topicsStr}

STUDENT'S MASTERED VOCABULARY POOL (YOU MUST COMPOSE SENTENCES PRIMARILY USING THESE KNOWN WORDS):
${vocabListStr}

CRITICAL MANDATORY INSTRUCTIONS:
1. For each of the 10 tasks:
   - "sourceSentence": A natural Russian sentence for the student to translate into English.
   - "targetSentence": The perfect, accurate English translation.
   - "alternativeAnswers": Array of 1-3 valid alternative translations in English.
   - "testedGrammar": Name of the specific grammar topic tested in this sentence.
   - "usedVocabulary": Array of student vocabulary words embedded in this sentence.
   - "explanation": Detailed Russian explanation of the grammar rule, word order, auxiliary verbs, and why this translation is constructed this way.
2. The sentences MUST strictly practice the chosen grammar topics while weaving together words from the student's vocabulary list.
3. Provide progressive variety across the 10 sentences covering different persons (I, you, he/she, we, they), affirmative/negative/questions, and nuances.

Respond ONLY with valid JSON matching this exact schema:
{
  "exercises": [
    {
      "sourceSentence": "Русское предложение для перевода",
      "targetSentence": "Correct English translation",
      "alternativeAnswers": ["Alternative English translation 1"],
      "testedGrammar": "Grammar topic name",
      "usedVocabulary": ["word1", "word2"],
      "explanation": "Подробное объяснение грамматики и перевода на русском языке"
    }
  ]
}`;

      let exercises = [];
      const aiModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash'];
      for (const m of aiModels) {
        try {
          const aiRes = await Promise.race([
            fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
              })
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 35000))
          ]);

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
              exercises = parsed.exercises;
              break;
            }
          }
        } catch (err) {
          console.warn(`Translation generation error on English model ${m}:`, err.message);
        }
      }

      if (exercises.length === 0) {
        exercises = [
          {
            sourceSentence: "Они строят большой новый дом в центре города.",
            targetSentence: "They are building a big new house in the city center.",
            alternativeAnswers: ["They build a big new house in the city center."],
            testedGrammar: selectedTopicRows[0]?.name || "Present Continuous",
            usedVocabulary: ["house", "big", "new"],
            explanation: "Для действия, происходящего в данный период времени, используется Present Continuous (are building). Прилагательные 'big' и 'new' идут перед существительным."
          }
        ];
      }

      exercises.forEach((ex, idx) => {
        ex.id = `trans_${Date.now()}_${idx}`;
        ex.vocabularySource = vocabularySource;
        ex.wordPoolCount = poolCount;
        ex.sourceLabel = poolLabel;
      });

      return res.json({
        exercises,
        count: exercises.length,
        vocabularySource,
        wordPoolCount: poolCount,
        sourceLabel: poolLabel,
        selectedTopics: selectedTopicRows
      });
    } catch (error) {
      console.error('Error in /api/exercises/generate-translation:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}
