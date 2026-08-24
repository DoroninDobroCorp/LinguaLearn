import express from 'express';
import { 
  getWordTilesBatch, 
  verifyWordTiles, 
  getSpeedMatchItems, 
  getErrorDetectiveBatch, 
  verifyErrorDetective 
} from '../gameExercises.js';
import { generateExamQuestions } from '../examEngine.js';

export function createExerciseRoutes({ db, getProfileId }) {
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
      const { itemId, chosenOption, selectedFix } = req.body || {};
      const result = verifyErrorDetective(itemId, chosenOption || selectedFix);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Batch AI Exercises Generator for Selected Topics
  router.post('/generate-batch', async (req, res) => {
    try {
      const profileId = getProfileId(req);
      const { level = 'A1', topicIds = [], count = 10 } = req.body || {};
      const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

      const exam = await generateExamQuestions({
        db,
        profileId,
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
      console.error('Error generating exercises batch:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Sentence Translation Generator
  router.post('/generate-translation', async (req, res) => {
    try {
      const profileId = getProfileId(req);
      const { topicIds, topicId, level } = req.body || {};

      const allWords = db.prepare('SELECT id, word, translation, example, learned_permanently_at FROM vocabulary WHERE profile_id = ?').all(profileId);
      const learnedWords = allWords.filter((w) => w.learned_permanently_at !== null && w.learned_permanently_at !== undefined);
      const activeWords = allWords.filter((w) => !w.learned_permanently_at);

      let selectedPool = [];
      let vocabularySource = 'combined';
      let poolCount = allWords.length;
      let poolLabel = 'Все слова словаря';

      if (learnedWords.length >= 100) {
        selectedPool = learnedWords;
        vocabularySource = 'learned_forever';
        poolCount = learnedWords.length;
        poolLabel = `Полностью выученные слова (${learnedWords.length})`;
      } else if (activeWords.length >= 100) {
        selectedPool = activeWords;
        vocabularySource = 'active_studying';
        poolCount = activeWords.length;
        poolLabel = `Изучаемые слова (${activeWords.length})`;
      } else {
        selectedPool = allWords.length > 0 ? allWords : [{ word: 'casa', translation: 'дом' }, { word: 'nuevo', translation: 'новый' }];
        vocabularySource = 'combined';
        poolCount = allWords.length;
        poolLabel = `Все слова (${allWords.length})`;
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
      const prompt = `You are an elite Spanish language professor.
Your task is to generate 10 full-sentence translation exercises for a student.

SELECTED GRAMMAR TOPIC(S):
${topicsStr}

STUDENT'S MASTERED VOCABULARY POOL (YOU MUST COMPOSE SENTENCES PRIMARILY USING THESE KNOWN WORDS):
${vocabListStr}

CRITICAL MANDATORY INSTRUCTIONS:
1. For each of the 10 tasks:
   - "sourceSentence": A natural Russian sentence for the student to translate into Spanish.
   - "targetSentence": The perfect, accurate Spanish translation.
   - "alternativeAnswers": Array of 1-3 valid alternative translations in Spanish.
   - "testedGrammar": Name of the specific grammar topic tested in this sentence.
   - "usedVocabulary": Array of student vocabulary words embedded in this sentence.
   - "explanation": Detailed Russian explanation of the grammar rule, word order, verb conjugations, and why this translation is constructed this way.
2. The sentences MUST strictly practice the chosen grammar topics while weaving together words from the student's vocabulary list.
3. Provide progressive variety across the 10 sentences covering different grammatical persons (yo, tú, él/ella, nosotros, ellos), affirmative/negative/questions, and nuances.

Respond ONLY with valid JSON matching this exact schema:
{
  "exercises": [
    {
      "sourceSentence": "Русское предложение для перевода",
      "targetSentence": "Correct Spanish translation",
      "alternativeAnswers": ["Alternative Spanish translation 1"],
      "testedGrammar": "Grammar topic name",
      "usedVocabulary": ["palabra1", "palabra2"],
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
          console.warn(`Translation generation error on Spanish model ${m}:`, err.message);
        }
      }

      if (exercises.length === 0) {
        exercises = [
          {
            sourceSentence: "Ellos están construyendo una casa nueva en el centro.",
            targetSentence: "Они строят новый дом в центре.",
            alternativeAnswers: ["Construyen una casa nueva en el centro."],
            testedGrammar: selectedTopicRows[0]?.name || "Presente continuo",
            usedVocabulary: ["casa", "nuevo"],
            explanation: "Для выражения действия в процессе используется estar + gerundio (están construyendo)."
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
