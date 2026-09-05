import dotenv from 'dotenv';
dotenv.config({ path: '/srv/LinguaLearn/spanish/.env' });

const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
const aiModels = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest'];

const prompt = `You are an elite Spanish language professor.
Generate exactly 10 full-sentence translation exercises for Spanish Level A1.

TOPICS TO PRACTICE:
1. Greetings and introductions (saludos)
2. Subject pronouns (yo, tú, vos, él, ella, nosotros, ellos)

CRITICAL MANDATORY INSTRUCTIONS:
1. "sourceSentence" (Russian) and "targetSentence" (Spanish) MUST BE 100% FAITHFUL, EXACT EQUIVALENTS.
2. Russian sentences must sound natural to native speakers.
3. Provide 1-3 valid Spanish translation alternatives in "alternativeAnswers".
4. Ensure variety of persons (yo, tú, él, ella, nosotros, ellos, ustedes).

Respond ONLY with valid JSON matching this schema:
{
  "exercises": [
    {
      "sourceSentence": "Привет, меня зовут Анна, а тебя как зовут?",
      "targetSentence": "Hola, me llamo Ana, ¿y tú cómo te llamas?",
      "alternativeAnswers": ["Hola, mi nombre es Ana, ¿cómo te llamas?", "Hola, soy Ana, ¿y tú?"],
      "testedGrammar": "Greetings and introductions",
      "explanation": "Hola — приветствие. Me llamo — 'меня зовут' (возвратный глагол llamarse). ¿Cómo te llamas? — вопрос на 'ты'."
    }
  ]
}`;

async function run() {
  console.log("Calling Gemini for batch 1...");
  for (const m of aiModels) {
    try {
      const res = await fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(raw);
        console.log(`Success on model ${m}! Received ${parsed.exercises?.length} exercises.`);
        console.log("First exercise:", parsed.exercises?.[0]);
        return;
      }
    } catch (err) {
      console.warn(`Model ${m} error:`, err.message);
    }
  }
  console.error("All models failed");
}

run();
