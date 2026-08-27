import express from 'express';
import { 
  getWordTilesBatch, 
  verifyWordTiles, 
  getSpeedMatchItems, 
  getErrorDetectiveBatch, 
  verifyErrorDetective 
} from '../gameExercises.js';
import { generateExamQuestions } from '../examEngine.js';

export function ensureMistakesTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_grammar_mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL DEFAULT 1,
      topic_id INTEGER,
      topic_name TEXT,
      category TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'A1',
      prompt TEXT NOT NULL,
      user_wrong_answer TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      rule_explanation TEXT,
      error_count INTEGER NOT NULL DEFAULT 1,
      is_resolved INTEGER NOT NULL DEFAULT 0,
      last_occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_grammar_mistakes_profile_active ON student_grammar_mistakes(profile_id, category, is_resolved, level);
    CREATE INDEX IF NOT EXISTS idx_grammar_mistakes_prompt ON student_grammar_mistakes(profile_id, category, prompt);
  `);
}

export function createExerciseRoutes({ db, getProfileId }) {
  ensureMistakesTable(db);
  const router = express.Router();

  // Mistake Memory Endpoints
  router.post('/record-mistake', (req, res) => {
    try {
      ensureMistakesTable(db);
      const profileId = getProfileId(req) || 1;
      const {
        topicId = null,
        topicName = '',
        category = 'general',
        level = 'A1',
        prompt,
        userWrongAnswer,
        correctAnswer,
        ruleExplanation = ''
      } = req.body || {};

      if (!prompt || !correctAnswer) {
        return res.status(400).json({ error: 'Prompt and correctAnswer are required' });
      }

      const existing = db.prepare(`
        SELECT id, error_count FROM student_grammar_mistakes
        WHERE profile_id = ? AND category = ? AND prompt = ?
      `).get(profileId, category, String(prompt).trim());

      const now = new Date().toISOString();
      if (existing) {
        db.prepare(`
          UPDATE student_grammar_mistakes
          SET error_count = error_count + 1,
              user_wrong_answer = ?,
              correct_answer = ?,
              rule_explanation = COALESCE(?, rule_explanation),
              is_resolved = 0,
              last_occurred_at = ?,
              resolved_at = NULL
          WHERE id = ?
        `).run(String(userWrongAnswer || ''), String(correctAnswer), ruleExplanation || null, now, existing.id);
        return res.json({ success: true, mistakeId: existing.id, errorCount: existing.error_count + 1 });
      } else {
        const result = db.prepare(`
          INSERT INTO student_grammar_mistakes (
            profile_id, topic_id, topic_name, category, level,
            prompt, user_wrong_answer, correct_answer, rule_explanation,
            error_count, is_resolved, last_occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
        `).run(
          profileId,
          topicId ? Number(topicId) : null,
          topicName || null,
          category,
          level || 'A1',
          String(prompt).trim(),
          String(userWrongAnswer || ''),
          String(correctAnswer).trim(),
          ruleExplanation || null,
          now
        );
        return res.json({ success: true, mistakeId: result.lastInsertRowid, errorCount: 1 });
      }
    } catch (err) {
      console.error('Error recording Spanish grammar mistake:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/resolve-mistake', (req, res) => {
    try {
      ensureMistakesTable(db);
      const profileId = getProfileId(req) || 1;
      const { category, prompt, correctAnswer } = req.body || {};

      const now = new Date().toISOString();
      let result;
      if (prompt && category) {
        result = db.prepare(`
          UPDATE student_grammar_mistakes
          SET is_resolved = 1, resolved_at = ?
          WHERE profile_id = ? AND category = ? AND prompt = ? AND is_resolved = 0
        `).run(now, profileId, category, String(prompt).trim());
      } else if (prompt) {
        result = db.prepare(`
          UPDATE student_grammar_mistakes
          SET is_resolved = 1, resolved_at = ?
          WHERE profile_id = ? AND prompt = ? AND is_resolved = 0
        `).run(now, profileId, String(prompt).trim());
      } else if (correctAnswer) {
        result = db.prepare(`
          UPDATE student_grammar_mistakes
          SET is_resolved = 1, resolved_at = ?
          WHERE profile_id = ? AND correct_answer = ? AND is_resolved = 0
        `).run(now, profileId, String(correctAnswer).trim());
      }

      return res.json({ success: true, resolved: result ? result.changes : 0 });
    } catch (err) {
      console.error('Error resolving Spanish grammar mistake:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  router.get('/mistakes', (req, res) => {
    try {
      ensureMistakesTable(db);
      const profileId = getProfileId(req) || 1;
      const { category, level, limit = 20 } = req.query || {};

      let query = 'SELECT * FROM student_grammar_mistakes WHERE profile_id = ? AND is_resolved = 0';
      const params = [profileId];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }
      if (level && level !== 'all') {
        query += ' AND level = ?';
        params.push(level);
      }
      query += ' ORDER BY error_count DESC, last_occurred_at DESC LIMIT ?';
      params.push(Number(limit) || 20);

      const mistakes = db.prepare(query).all(...params);
      return res.json({ mistakes });
    } catch (err) {
      console.error('Error fetching Spanish grammar mistakes:', err);
      return res.status(500).json({ error: err.message });
    }
  });

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

      // Retrieve student active grammar mistakes for adaptive remediation
      ensureMistakesTable(db);
      const recentMistakes = db.prepare(`
        SELECT prompt, user_wrong_answer, correct_answer, rule_explanation, topic_name, category
        FROM student_grammar_mistakes
        WHERE profile_id = ? AND is_resolved = 0
        ORDER BY error_count DESC, last_occurred_at DESC
        LIMIT 8
      `).all(profileId || 1);

      const exam = await generateExamQuestions({
        db,
        profileId,
        level,
        examType: 'custom',
        topicIds,
        apiKey,
        recentMistakes
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
        topicsCount: topicIds.length,
        remediatedMistakesCount: recentMistakes.length
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

      // Retrieve student active grammar mistakes for adaptive translation remediation
      ensureMistakesTable(db);
      const activeMistakes = db.prepare(`
        SELECT prompt, user_wrong_answer, correct_answer, rule_explanation, topic_name, category
        FROM student_grammar_mistakes
        WHERE profile_id = ? AND is_resolved = 0
        ORDER BY error_count DESC, last_occurred_at DESC
        LIMIT 8
      `).all(profileId || 1);

      let mistakesInstruction = '';
      if (activeMistakes.length > 0) {
        const mistakeListStr = activeMistakes.map((m, i) => `${i + 1}. [${m.topic_name || m.category}] Prompt: "${m.prompt}" | Student made mistake: "${m.user_wrong_answer}" ❌ | Correct was: "${m.correct_answer}" ✅ (Rule: ${m.rule_explanation || ''})`).join('\n');
        mistakesInstruction = `
CRITICAL ADAPTIVE REMEDIATION MANDATE (MUST FOLLOW):
The student previously made mistakes on the following grammar items/sentences:
${mistakeListStr}
You MUST design at least 3 to 5 of the 10 sentences to directly practice and test these exact grammar weak spots, verb forms, and sentence structures so the student learns from their previous mistakes!
`;
      }

      const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
      const prompt = `You are an elite Spanish language professor.
Your task is to generate 10 full-sentence translation exercises for a student.

SELECTED GRAMMAR TOPIC(S):
${topicsStr}

STUDENT'S MASTERED VOCABULARY POOL (YOU MUST COMPOSE SENTENCES PRIMARILY USING THESE KNOWN WORDS):
${vocabListStr}
${mistakesInstruction}
CRITICAL MANDATORY INSTRUCTIONS:
1. STRICT TRANSLATION SYMMETRY & FIDELITY:
   - "sourceSentence" (Russian) and "targetSentence" (Spanish) MUST BE 100% FAITHFUL, EXACT EQUIVALENTS OF EACH OTHER. Every adjective, noun, adverb, and verb must match in meaning without swapping or hallucinating concepts (for example: if Russian has "длинная", Spanish MUST be "larga", NEVER swap with "buena").
   - Russian sentences MUST sound completely natural and elegant to a native Russian speaker (NEVER duplicate words like "В эту ночь ночь...").
   - "alternativeAnswers" MUST provide 1-3 valid Spanish translation alternatives (e.g. omitting/including subject pronouns, word order permutations, synonym phrases).
2. For each of the 10 tasks:
   - "sourceSentence": Natural Russian sentence for the student to translate into Spanish.
   - "targetSentence": The perfect, accurate Spanish translation.
   - "alternativeAnswers": Array of 1-3 valid alternative translations in Spanish.
   - "testedGrammar": Name of the specific grammar topic tested in this sentence.
   - "usedVocabulary": Array of student vocabulary words embedded in this sentence.
   - "explanation": Detailed Russian explanation of the grammar rule, word order, gender agreements, and verb conjugations.
   - "isReview": Set to true if this sentence addresses one of the student's previous mistakes listed above, false otherwise.
   - "reviewReason": If isReview is true, write a short Russian note (e.g. "Повторение: тренировка формы глагола / конструкции из прошлых ошибок").
3. The sentences MUST strictly practice the chosen grammar topics while weaving together words from the student's vocabulary list.
4. Provide progressive variety across the 10 sentences covering different grammatical persons (yo, tú, él/ella, nosotros, ellos), affirmative/negative/questions, and nuances.

Respond ONLY with valid JSON matching this exact schema:
{
  "exercises": [
    {
      "sourceSentence": "Русское предложение для перевода",
      "targetSentence": "Correct Spanish translation",
      "alternativeAnswers": ["Alternative Spanish translation 1"],
      "testedGrammar": "Grammar topic name",
      "usedVocabulary": ["palabra1", "palabra2"],
      "explanation": "Подробное объяснение грамматики и перевода на русском языке",
      "isReview": true,
      "reviewReason": "Повторение темы из прошлых ошибок"
    }
  ]
}`;

      let exercises = [];
      const aiModels = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest'];
      for (const m of aiModels) {
        try {
          const aiRes = await Promise.race([
            fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
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
            sourceSentence: "Они строят новый дом в центре города.",
            targetSentence: "Ellos están construyendo una casa nueva en el centro.",
            alternativeAnswers: ["Construyen una casa nueva en el centro.", "Están construyendo una casa nueva en el centro."],
            testedGrammar: selectedTopicRows[0]?.name || "Estar + Gerundio",
            usedVocabulary: ["casa", "nuevo", "centro"],
            explanation: "Для выражения действия, происходящего прямо сейчас, используется estar + gerundio (están construyendo)."
          },
          {
            sourceSentence: "Я живу в этом красивом городе уже два года.",
            targetSentence: "Vivo en esta ciudad hermosa desde hace dos años.",
            alternativeAnswers: ["Yo vivo en esta hermosa ciudad desde hace dos años.", "Vivo en esta ciudad bonita hace dos años."],
            testedGrammar: "Presente / Preposiciones de tiempo",
            usedVocabulary: ["vivir", "ciudad", "año", "dos"],
            explanation: "Конструкция 'desde hace + промежуток времени' указывает на действие, начавшееся в прошлом и продолжающееся сейчас."
          },
          {
            sourceSentence: "Мой брат хочет купить машину в следующем месяце.",
            targetSentence: "Mi hermano quiere comprar un coche el próximo mes.",
            alternativeAnswers: ["Mi hermano quiere comprar un auto el mes que viene.", "Mi hermano desea comprar un coche el próximo mes."],
            testedGrammar: "Querer + Infinitivo",
            usedVocabulary: ["hermano", "comprar", "mes", "próximo"],
            explanation: "После модального глагола querer основной смысловой глагол ставится в инфинитиве (comprar)."
          },
          {
            sourceSentence: "Мы всегда пьем кофе по утрам на террасе.",
            targetSentence: "Siempre bebemos café por las mañanas en la terraza.",
            alternativeAnswers: ["Nosotros tomamos café por la mañana en la terraza.", "Siempre tomamos café por las mañanas en la terraza."],
            testedGrammar: "Presente de indicativo (rutina)",
            usedVocabulary: ["siempre", "beber", "café", "mañana"],
            explanation: "Для регулярных повторяющихся привычек используется Presente de Indicativo (bebemos / tomamos)."
          },
          {
            sourceSentence: "Где находится ближайшая аптека?",
            targetSentence: "¿Dónde está la farmacia más cercana?",
            alternativeAnswers: ["¿Dónde se encuentra la farmacia más cercana?", "¿Dónde queda la farmacia más próxima?"],
            testedGrammar: "Estar para ubicación / Superlativo",
            usedVocabulary: ["dónde", "farmacia", "cercano"],
            explanation: "Для указания местоположения объектов всегда используется глагол estar (¿Dónde está...?)."
          },
          {
            sourceSentence: "У тебя есть время поговорить сегодня со мной?",
            targetSentence: "¿Tienes tiempo para hablar conmigo hoy?",
            alternativeAnswers: ["¿Tú tienes tiempo de hablar conmigo hoy?", "¿Tienes tiempo para hablar hoy conmigo?"],
            testedGrammar: "Tener + Pronombres con preposición",
            usedVocabulary: ["tiempo", "hablar", "hoy", "conmigo"],
            explanation: "С предлогом con местоимение yo превращается в слитную форму conmigo."
          },
          {
            sourceSentence: "Эти студенты очень умные и трудолюбивые.",
            targetSentence: "Estos estudiantes son muy inteligentes y trabajadores.",
            alternativeAnswers: ["Estos alumnos son muy inteligentes y trabajadores."],
            testedGrammar: "Ser + Adjetivos de cualidad esencial",
            usedVocabulary: ["estudiante", "inteligente", "trabajador"],
            explanation: "Для постоянных качеств и характеристик характера используется глагол ser (son inteligentes)."
          },
          {
            sourceSentence: "Завтра мы пойдем на пляж, если будет хорошая погода.",
            targetSentence: "Mañana vamos a la playa si hace buen tiempo.",
            alternativeAnswers: ["Mañana iremos a la playa si hace buen tiempo.", "Mañana vamos a ir a la playa si hace buen tiempo."],
            testedGrammar: "Oraciones condicionales (si + Presente)",
            usedVocabulary: ["mañana", "playa", "tiempo", "bueno"],
            explanation: "В реальном условии после si используется Presente de Indicativo (si hace buen tiempo)."
          },
          {
            sourceSentence: "Она не может прийти на встречу, потому что сейчас работает.",
            targetSentence: "Ella no puede venir a la reunión porque ahora está trabajando.",
            alternativeAnswers: ["No puede venir a la reunión porque está trabajando ahora.", "Ella no puede asistir a la reunión porque trabaja ahora."],
            testedGrammar: "Poder + Infinitivo / Estar + Gerundio",
            usedVocabulary: ["poder", "venir", "trabajar", "ahora"],
            explanation: "После poder ставится инфинитив (venir), а для текущей занятости используется está trabajando."
          },
          {
            sourceSentence: "Я должен закончить эту важную работу до вечера.",
            targetSentence: "Debo terminar este trabajo importante antes de la tarde.",
            alternativeAnswers: ["Tengo que terminar este trabajo importante antes de la tarde.", "Debo finalizar este trabajo importante para la tarde."],
            testedGrammar: "Deber / Tener que + Infinitivo",
            usedVocabulary: ["deber", "terminar", "trabajo", "importante", "tarde"],
            explanation: "Обязательство выражается через deber + infinitivo или tener que + infinitivo."
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
