/**
 * English Grammar & Vocabulary Exercise Generation Engine
 * Creates rich, contextual grammar exercises testing the selected CEFR topic
 * while embedding the student's vocabulary (mastered / active).
 */

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cleanWord(w) {
  return (w || '').trim().replace(/^(a|an|the|to)\s+/i, '');
}

export function generateEnglishExercise({ topic, exerciseType, targetWordObj, allUserWords = [] }) {
  const topicName = (topic?.name || '').toLowerCase();
  const word = cleanWord(targetWordObj.word);
  const translation = targetWordObj.translation;
  const level = topic?.level || 'B1';
  const type = exerciseType || 'multiple-choice';

  // 1. PRESENT SIMPLE (3rd person singular -s/-es)
  if (topicName.includes('present simple') || topicName.includes('verb "to be"')) {
    const verbs = [
      { base: 'like', s: 'likes', ing: 'liking', ru: 'нравиться' },
      { base: 'need', s: 'needs', ing: 'needing', ru: 'нуждаться' },
      { base: 'want', s: 'wants', ing: 'wanting', ru: 'хотеть' },
      { base: 'know', s: 'knows', ing: 'knowing', ru: 'знать' },
    ];
    const v = sample(verbs);
    const question = `Choose the correct Present Simple form:\n"The person ___ (${v.base}) this ${word} very much."`;
    const correctAnswer = v.s;
    const options = [v.s, v.base, v.ing, 'are ' + v.base].sort(() => 0.5 - Math.random());
    const explanation = `In Present Simple with 3rd-person singular subjects (the person / he / she), verbs take the "-s" ending: "${correctAnswer}".`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Present Simple',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 2. PAST SIMPLE (Regular & Irregular)
  if (topicName.includes('past simple') || topicName.includes('past')) {
    const verbs = [
      { base: 'find', past: 'found', distractors: ['finded', 'finds', 'finding'] },
      { base: 'see', past: 'saw', distractors: ['seed', 'seen', 'sees'] },
      { base: 'buy', past: 'bought', distractors: ['buyed', 'buys', 'buying'] },
      { base: 'use', past: 'used', distractors: ['uses', 'use', 'using'] },
    ];
    const v = sample(verbs);
    const question = `Put the verb in the Past Simple form:\n"Yesterday, we ___ (${v.base}) a very interesting ${word}."`;
    const correctAnswer = v.past;
    const options = [v.past, ...v.distractors].sort(() => 0.5 - Math.random());
    const explanation = `The Past Simple form of the verb "${v.base}" is "${correctAnswer}". Full sentence: "Yesterday, we ${correctAnswer} a very interesting ${word}."`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Past Simple',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 3. ARTICLES (a / an / the / zero)
  if (topicName.includes('article') || topicName.includes('a/an')) {
    const startsWithVowel = /^[aeiou]/i.test(word);
    const correctAnswer = startsWithVowel ? 'an' : 'a';
    const options = ['a', 'an', 'the', '— (no article)'];
    const question = `Choose the correct indefinite article for "${word}" (${translation}):\n"She gave me ___ ${word} as a gift."`;
    const explanation = `Because "${word}" begins with a ${startsWithVowel ? 'vowel sound' : 'consonant sound'}, we use the indefinite article "${correctAnswer}".`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Articles (a/an/the)',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 4. PREPOSITIONS OF PLACE / TIME
  if (topicName.includes('preposition') || topicName.includes('in/on/at')) {
    const preps = [
      { en: 'next to', ru: 'рядом с', distractors: ['behind', 'between', 'under'] },
      { en: 'in front of', ru: 'перед', distractors: ['behind', 'next to', 'under'] },
      { en: 'behind', ru: 'позади / за', distractors: ['in front of', 'near', 'on'] },
    ];
    const p = sample(preps);
    const question = `Insert the correct preposition of place (${p.ru}):\n"The documents are ___ (${p.ru}) the ${word} on the desk."`;
    const correctAnswer = p.en;
    const options = [p.en, ...p.distractors].sort(() => 0.5 - Math.random());
    const explanation = `The preposition "${p.en}" translates as "${p.ru}". Full sentence: "The documents are ${p.en} the ${word} on the desk."`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Prepositions of place',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 5. GENERAL CONTEXTUAL SENTENCE EXERCISE
  const templates = [
    {
      q: `Fill in the missing word "${word}" (${translation}) in context:\n"We always need to check the ___ before making a decision."`,
      ans: word,
      exp: `The word "${word}" (${translation}) fits the meaning of the sentence. Full sentence: "We always need to check the ${word} before making a decision."`,
    },
    {
      q: `Choose the correct word (${translation}) to complete the thought:\n"My colleague told me about an important ___ yesterday."`,
      ans: word,
      exp: `"${word}" means "${translation}". Full sentence: "My colleague told me about an important ${word} yesterday."`,
    },
  ];
  const t = sample(templates);
  const otherWords = allUserWords.map((w) => cleanWord(w.word)).filter((w) => w.toLowerCase() !== word.toLowerCase());
  const distractors = otherWords.sort(() => 0.5 - Math.random()).slice(0, 3);
  while (distractors.length < 3) {
    distractors.push(['result', 'project', 'matter', 'example', 'choice'][distractors.length]);
  }
  const options = [word, ...distractors].sort(() => 0.5 - Math.random());

  return {
    type,
    question: t.q,
    options: type === 'multiple-choice' ? options : undefined,
    correctAnswer: t.ans,
    explanation: t.exp,
    topic: topic?.name || 'General English Practice',
    level,
    targetWord: word,
    targetWordTranslation: translation,
  };
}
