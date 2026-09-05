import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '/srv/LinguaLearn/spanish/.env' });

const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
const aiModels = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest'];

const BATCHES = [
  {
    batchNum: 1,
    topics: "1. Greetings and introductions (saludos)\n2. Subject pronouns (yo, tú, vos, él, ella, nosotros, ellos, ustedes)",
    focus: "Greetings (formal/informal), introducing oneself and others, asking how someone is, polite exchanges, subject pronouns and their natural omission/inclusion."
  },
  {
    batchNum: 2,
    topics: "3. Numbers and counting (1-100)\n4. Gender and articles (el/la/los/las, including exceptions like el problema, el día, la mano)",
    focus: "Counting everyday objects, prices, quantities, definite articles with masculine and feminine nouns, singular and plural."
  },
  {
    batchNum: 3,
    topics: "5. Indefinite articles (un, una, unos, unas)\n6. Colors (rojo, azul, verde, amarillo, negro, blanco, gris)",
    focus: "Buying or describing items with indefinite articles, color adjectives placed after nouns, agreeing in gender and number (e.g. una mesa blanca, unos coches rojos)."
  },
  {
    batchNum: 4,
    topics: "7. Plural nouns (-s, -es, changes)\n8. Ser vs Estar (basic distinctions: identity, nationality, profession vs temporary state, location)",
    focus: "Contrast between SER (essential traits, origin, profession: 'soy médico', 'somos de España') and ESTAR (states, feelings, location: 'estoy cansado', 'están en la cocina')."
  },
  {
    batchNum: 5,
    topics: "9. Basic adjective agreement (gender/number)\n10. Describing people (describir personas: physical and personality traits)",
    focus: "Describing friends, colleagues, and strangers using adjectives of appearance (alto, bajo, moreno, rubio) and character (simpático, inteligente, trabajador, tímido)."
  },
  {
    batchNum: 6,
    topics: "11. Family members (padre, madre, hermano, hijo, abuelo, tíos)\n12. Possessive adjectives (mi/mis, tu/tus, su/sus, nuestro/nuestra/nuestros/nuestras)",
    focus: "Talking about family relationships, relatives' jobs, ages, and homes using possessive adjectives correctly agreeing with the possessed noun."
  },
  {
    batchNum: 7,
    topics: "13. Tener (to have) and idiomatic tener expressions\n14. Parts of the body (la cabeza, los ojos, las manos, las piernas, la espalda)",
    focus: "Idiomatic expressions: tener hambre, tener sed, tener frío, tener calor, tener miedo, tener prisa, tener sueño, tener ... años, and physical sensations with body parts."
  },
  {
    batchNum: 8,
    topics: "15. Present tense regular -ar verbs (hablar, trabajar, estudiar, escuchar, cocinar, comprar, viajar, esperar)\n16. Negation (no + verb, nunca, tampoco)",
    focus: "Everyday routines, workplace and study habits with regular -ar verbs across all persons (yo, tú, él, nosotros, ellos), affirmative vs negative sentences."
  },
  {
    batchNum: 9,
    topics: "17. Question formation (¿Qué?, ¿Dónde?, ¿Cuándo?, ¿Por qué?, ¿Cómo?, ¿Quién?, ¿Cuánto?)\n18. Days of the week, months, seasons (el lunes, en mayo, en verano)",
    focus: "Asking and answering questions about schedules, appointments, weekly routines, months, birthdays, and favorite seasons."
  },
  {
    batchNum: 10,
    topics: "Comprehensive A1 Synthesis (All 18 Topics: Greetings, Pronouns, Ser/Estar, Tener, -ar verbs, Family, Time, Descriptions)",
    focus: "Rich situational dialogues and real-life conversational phrases weaving together multiple topics into natural communication."
  }
];

async function generateBatch(batch) {
  const prompt = `You are an elite Spanish language professor and curriculum designer.
Generate exactly 10 full-sentence translation exercises for Spanish Level A1.

SPECIFIC TOPICS FOR THIS BATCH:
${batch.topics}

PEDAGOGICAL FOCUS & CONSTRAINTS:
${batch.focus}

CRITICAL MANDATORY INSTRUCTIONS:
1. STRICT TRANSLATION SYMMETRY & FIDELITY:
   - "sourceSentence" (Russian) and "targetSentence" (Spanish) MUST BE 100% FAITHFUL, EXACT EQUIVALENTS.
   - Russian sentences MUST sound completely natural to a native Russian speaker.
   - "alternativeAnswers" MUST provide 1-3 valid Spanish translation alternatives (different word order, with/without subject pronoun, synonyms).
2. For each of the 10 tasks:
   - "sourceSentence": Natural Russian sentence.
   - "targetSentence": Accurate Spanish translation.
   - "alternativeAnswers": Array of 1-3 alternative valid Spanish translations.
   - "testedGrammar": Short name of the grammar rule / topic tested.
   - "explanation": Educational Russian explanation detailing grammar rules, agreements, or verb forms.

Respond ONLY with valid JSON matching this schema:
{
  "exercises": [
    {
      "sourceSentence": "...",
      "targetSentence": "...",
      "alternativeAnswers": ["..."],
      "testedGrammar": "...",
      "explanation": "..."
    }
  ]
}`;

  for (const m of aiModels) {
    try {
      const res = await fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.35 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
          return parsed.exercises;
        }
      }
    } catch (err) {
      console.warn(`[Batch ${batch.batchNum}] Model ${m} error: ${err.message}`);
    }
  }
  throw new Error(`Failed to generate batch ${batch.batchNum}`);
}

async function main() {
  console.log("Starting 100-sentence generation across all 18 A1 topics...");
  const allExercises = [];

  for (const batch of BATCHES) {
    console.log(`\nGenerating Batch ${batch.batchNum}/10 (${batch.topics.split('\n')[0]})...`);
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const items = await generateBatch(batch);
        console.log(`  ✓ Batch ${batch.batchNum} generated: ${items.length} sentences`);
        items.forEach((item, idx) => {
          allExercises.push({
            id: `offline_pack_a1_${batch.batchNum}_${idx + 1}`,
            batch: batch.batchNum,
            ...item
          });
        });
        success = true;
        break;
      } catch (err) {
        console.warn(`  ⚠ Attempt ${attempt} failed for batch ${batch.batchNum}: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!success) {
      console.error(`FATAL: Could not generate batch ${batch.batchNum}`);
      process.exit(1);
    }
  }

  console.log(`\nSuccessfully generated all ${allExercises.length} sentences!`);

  const packData = {
    packId: 'a1_first_18_mastery_100',
    title: 'Полный офлайн-пак: Первые 18 тем курса A1 (100 предложений)',
    description: 'Все ключевые темы начала испанского языка: приветствия, местоимения, артикли, Ser/Estar, прилагательные, семья, глаголы -ar, отрицание, вопросы и время.',
    totalCount: allExercises.length,
    generatedAt: new Date().toISOString(),
    topics: [
      { id: 27, order: 1, name: 'Greetings and introductions (saludos)' },
      { id: 7, order: 2, name: 'Subject pronouns (yo/tú/vos/él/ella)' },
      { id: 19, order: 3, name: 'Numbers and counting' },
      { id: 4, order: 4, name: 'Gender and articles (el/la/los/las)' },
      { id: 5, order: 5, name: 'Indefinite articles (un/una/unos/unas)' },
      { id: 20, order: 6, name: 'Colors (colores)' },
      { id: 6, order: 7, name: 'Plural nouns (-s/-es)' },
      { id: 1, order: 8, name: 'Ser vs Estar (basic)' },
      { id: 13, order: 9, name: 'Basic adjective agreement (gender/number)' },
      { id: 30, order: 10, name: 'Describing people (describir personas)' },
      { id: 21, order: 11, name: 'Family members (la familia)' },
      { id: 8, order: 12, name: 'Possessive adjectives (mi/tu/su)' },
      { id: 11, order: 13, name: 'Tener (to have) and tener expressions' },
      { id: 25, order: 14, name: 'Parts of the body (el cuerpo)' },
      { id: 2, order: 15, name: 'Present tense regular -ar verbs' },
      { id: 17, order: 16, name: 'Negation (no + verb)' },
      { id: 18, order: 17, name: 'Question formation (¿...?)' },
      { id: 22, order: 18, name: 'Days, months, seasons' }
    ],
    exercises: allExercises
  };

  const outputPathPublic = '/srv/LinguaLearn/spanish/public/a1_first_18_offline_pack_100.json';
  fs.writeFileSync(outputPathPublic, JSON.stringify(packData, null, 2));
  console.log(`Saved public pack to: ${outputPathPublic}`);

  const outputPathSrc = '/srv/LinguaLearn/spanish/src/utils/a1First18OfflinePack.json';
  fs.writeFileSync(outputPathSrc, JSON.stringify(packData, null, 2));
  console.log(`Saved bundle pack to: ${outputPathSrc}`);
}

main();
