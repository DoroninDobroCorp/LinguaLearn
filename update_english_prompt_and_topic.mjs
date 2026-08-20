import Database from 'better-sqlite3';
import fs from 'fs';

// ============================================
// 1. UPDATE ENGLISH TOPIC NAME
// ============================================
const eDb = new Database('/srv/LinguaLearn/english/server/english_learning.db');
eDb.prepare("UPDATE curriculum_topics SET name = 'Subject pronouns (I/you/he/she/it/we/they)', pedagogical_order = 1 WHERE id = 6 OR name LIKE 'Subject pronouns (%'").run();
console.log('English pronoun topic updated to comprehensive name.');

// ============================================
// 2. HARDEN ENGLISH PROMPT & ADD alternativeAnswers
// ============================================
const ePath = '/srv/LinguaLearn/english/server/index.js';
let eCode = fs.readFileSync(ePath, 'utf8');

// Replace pronoun name in CURRICULUM_DATA in english/server/index.js
eCode = eCode.replaceAll("Subject pronouns (I/you/he/she)", "Subject pronouns (I/you/he/she/it/we/they)");

// Replace prompt for /api/exercises/generate
const targetOldPart = `CRITICAL MANDATORY INSTRUCTIONS:
1. GRAMMAR TOPIC & COMPREHENSIVE NUANCE COVERAGE:
   - All 10 exercises MUST strictly test the specific grammar mechanism of "\${topicObj.name}".
   - ACROSS THE 10 EXERCISES, YOU MUST SYSTEMATICALLY COVER DIFFERENT NUANCES, ASPECTS, AND SUB-RULES OF THIS TOPIC:
     * Different grammatical persons (I, you, he/she/it, we, they; 1st/2nd/3rd person singular/plural).
     * Affirmative sentences, negative sentences (not...), and questions.
     * Regular patterns vs irregular roots/forms/exceptions relevant to this topic.
     * Distinct contextual situations.
   - DO NOT repeat the same sentence structure or grammatical person repeatedly! Ensure variety and progressive pedagogical depth across the 10 tasks.
   - DO NOT just ask for plain vocabulary translations of isolated words. Every exercise must be a meaningful sentence testing the grammar rule.

2. STUDENT VOCABULARY INTEGRATION:
   - Embed words from the student's vocabulary pool across the 10 exercises: \${vocabListStr}.
   - Naturally integrate these vocabulary words into the subjects, objects, or context of the sentences.

3. EXERCISE FORMAT:
   - Generate an array of 10 items (mix of multiple-choice and fill-blank unless a specific type was requested).
   - For multiple-choice: provide 4 distinct, plausible options in "options". One correct option, three realistic grammatical distractors.
   - For fill-blank: use "___" in the sentence for the blank.
   - For open: provide a clear instruction in Russian with the sentence.

4. RUSSIAN EXPLANATIONS:
   - Every exercise MUST include a clear, detailed "explanation" in Russian explaining the grammar rule, why this answer is correct, and common pitfalls.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "exercises": [
    {
      "type": "multiple-choice" | "fill-blank" | "open",
      "question": "Question or sentence in English (with Russian instructions/context if needed)",
      "options": ["Option A", "Option B", "Option C", "Option D"], // if multiple-choice
      "correctAnswer": "exact correct answer string",
      "explanation": "Clear grammatical explanation in Russian",
      "topic": "\${topicObj.name}",
      "level": "\${topicObj.level}",
      "targetWord": "English word from student vocabulary used in this exercise",
      "targetWordTranslation": "Russian translation"
    }
  ]
}`;

const targetNewPart = `CRITICAL MANDATORY INSTRUCTIONS:
1. GRAMMAR TOPIC & COMPREHENSIVE NUANCE COVERAGE:
   - All 10 exercises MUST strictly test the specific grammar mechanism of "\${topicObj.name}".
   - ACROSS THE 10 EXERCISES, YOU MUST SYSTEMATICALLY COVER DIFFERENT NUANCES, ASPECTS, AND SUB-RULES OF THIS TOPIC:
     * Different grammatical persons (I, you, he/she/it, we, they; 1st/2nd/3rd person singular/plural).
     * Affirmative sentences, negative sentences (not...), and questions (Do/Does/Did, inverted order).
     * Regular patterns vs irregular forms/exceptions relevant to this topic.
     * Distinct contextual situations (formal vs informal, American vs British variants).
   - DO NOT repeat the same sentence structure or grammatical person repeatedly! Ensure variety and progressive pedagogical depth across the 10 tasks.
   - DO NOT just ask for plain vocabulary translations of isolated words. Every exercise must be a meaningful sentence testing the grammar rule.

2. UNAMBIGUOUS PROMPTS & ALTERNATIVE ANSWERS:
   - Ensure the Russian instructions and English context are completely unambiguous (e.g. if testing pronouns or specific tenses, include a clear Russian context cue in parentheses).
   - ALWAYS provide "alternativeAnswers" listing all valid contracted/full forms (e.g. ["don't", "do not"], ["it's", "it is"], ["cannot", "can't"]), British/American spelling variations (e.g. ["colour", "color"]), and valid alternative synonyms.
   - For fill-blank and open questions, "correctAnswer" should be the canonical answer, and "alternativeAnswers" must include all other acceptable forms.

3. STUDENT VOCABULARY INTEGRATION:
   - Embed words from the student's vocabulary pool across the 10 exercises: \${vocabListStr}.
   - Naturally integrate these vocabulary words into the subjects, objects, or context of the sentences.

4. ACCURATE RUSSIAN EXPLANATIONS:
   - Every exercise MUST include a clear, detailed, linguistically precise "explanation" in Russian explaining the grammar rule, auxiliary verbs, agreement, and WHY this answer is correct.
   - NEVER contradict the validation or write confusing statements.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "exercises": [
    {
      "type": "multiple-choice" | "fill-blank" | "open",
      "question": "Question or sentence in English (with Russian instructions/context if needed)",
      "options": ["Option A", "Option B", "Option C", "Option D"], // if multiple-choice
      "correctAnswer": "exact correct answer string",
      "alternativeAnswers": ["alternative acceptable answer 1", "alternative acceptable answer 2"],
      "explanation": "Clear grammatical explanation in Russian explaining why this answer fits",
      "topic": "\${topicObj.name}",
      "level": "\${topicObj.level}",
      "targetWord": "English word from student vocabulary used in this exercise",
      "targetWordTranslation": "Russian translation"
    }
  ]
}`;

if (eCode.includes(targetOldPart)) {
  eCode = eCode.replace(targetOldPart, targetNewPart);
  console.log('Successfully replaced English exercise prompt with hardened Gemini 3.7 Flash prompt.');
} else {
  console.warn('Old English prompt substring not found directly, performing targeted replacement...');
  const promptStartIdx = eCode.indexOf('const prompt = `You are an elite English language professor');
  const promptEndIdx = eCode.indexOf('let exercises = [];', promptStartIdx);
  if (promptStartIdx !== -1 && promptEndIdx !== -1) {
    const fullNewPrompt = `const prompt = \`You are an elite English language professor and curriculum examiner.
Your mission is to generate a cohesive set of 10 interactive practice exercises for a student practicing the CEFR topic: "\${topicObj.name}" (\${topicObj.category}, Level: \${topicObj.level}).

${targetNewPart}\`;\n\n    `;
    eCode = eCode.slice(0, promptStartIdx) + fullNewPrompt + eCode.slice(promptEndIdx);
    console.log('Updated English prompt via targeted index replacement.');
  }
}

fs.writeFileSync(ePath, eCode, 'utf8');
console.log('English server index.js updated.');
