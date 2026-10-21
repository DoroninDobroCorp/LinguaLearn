import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  addLearnerMemory,
  applySpotEvidence,
  ensureCoachSchema,
  ensureSpot,
  getSpot,
  prioritizedSpots,
  upsertLearner,
} from '../server/coach/coachStore.js';
import {
  cleanPartnerText,
  looksGarbledRussian,
  normalizeCustomInput,
  normalizeForMatch,
  sanitizeFeedback,
  sanitizeWorkoutItems,
} from '../server/coach/coachService.js';
import { diffWords, stripDisfluencies } from '../src/utils/coachApi.js';

function createCoachDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, avatar_emoji TEXT);
    INSERT INTO profiles (id, name) VALUES (1, 'Nataliia');
  `);
  ensureCoachSchema(db);
  return db;
}

describe('Coach store', () => {
  it('adds the learning_track column and is idempotent', () => {
    const db = createCoachDb();
    ensureCoachSchema(db);
    const columns = db.prepare('PRAGMA table_info(profiles)').all().map((column) => column.name);
    assert.ok(columns.includes('learning_track'));
  });

  it('uses taxonomy titles for known spots and moves the score with evidence', () => {
    const db = createCoachDb();
    const spot = ensureSpot(db, 1, { spot_key: 'Ser estar', title_ru: 'ignored' });
    assert.equal(spot.spot_key, 'ser-estar');
    assert.equal(spot.title_ru, 'Ser или estar');
    assert.equal(spot.score, 45);

    assert.equal(applySpotEvidence(db, spot.id, 'conversation_error', { severity: 'high' }), -8);
    assert.equal(applySpotEvidence(db, spot.id, 'conversation_error', { severity: 'low' }), -3);
    assert.equal(applySpotEvidence(db, spot.id, 'drill_correct'), 5);
    const after = getSpot(db, 1, spot.id);
    assert.equal(after.score, 39);
    assert.equal(after.error_count, 2);
    assert.equal(after.status, 'active');
  });

  it('needs both a high score and enough correct uses to call a spot mastered', () => {
    const db = createCoachDb();
    const spot = ensureSpot(db, 1, { spot_key: 'por-para' });
    db.prepare('UPDATE coach_weak_spots SET score = 84 WHERE id = ?').run(spot.id);
    applySpotEvidence(db, spot.id, 'drill_correct');
    assert.equal(getSpot(db, 1, spot.id).status, 'improving');
    for (let index = 0; index < 5; index += 1) applySpotEvidence(db, spot.id, 'drill_correct');
    assert.equal(getSpot(db, 1, spot.id).status, 'mastered');
    assert.equal(prioritizedSpots(db, 1).length, 0);
  });

  it('deduplicates remembered facts', () => {
    const db = createCoachDb();
    upsertLearner(db, 1, { display_name: 'Nataliia' });
    assert.deepEqual(addLearnerMemory(db, 1, ['Tiene una hija de ocho años.', 'tiene una hija de ocho años.', 'x']), ['Tiene una hija de ocho años.']);
    assert.deepEqual(addLearnerMemory(db, 1, ['Tiene una hija de ocho años.']), []);
  });
});

describe('Coach validation', () => {
  it('ignores "corrections" that only remove stutters or fillers', () => {
    const feedback = sanitizeFeedback({
      verdict: 'errors',
      corrected: 'Me interesa el tema en particular.',
      issues: [
        { original: 'la tema', fix: 'el tema', explanation_ru: 'Tema — мужской род.', type: 'grammar', spot_key: 'genero-concordancia', severity: 'high' },
        { original: 'en en en particular', fix: 'en particular', explanation_ru: 'Повтор.', type: 'style', spot_key: 'otros', severity: 'low' },
      ],
    }, 'Me interesa la tema eh en en en particular.');
    assert.deepEqual(feedback.issues.map((issue) => issue.fix), ['el tema']);
  });

  it('drops inline corrections that quote words she never wrote', () => {
    const feedback = sanitizeFeedback({
      verdict: 'errors',
      corrected: 'Mi hija está muy cansada.',
      issues: [
        { original: 'es muy cansada', fix: 'está muy cansada', explanation_ru: 'Состояние — estar.', type: 'grammar', spot_key: 'ser-estar', severity: 'high' },
        { original: 'fuimos al cine', fix: 'fuimos a cine', explanation_ru: 'Выдумано.', type: 'grammar', spot_key: 'articulos', severity: 'medium' },
      ],
    }, 'Mi hija es muy cansada.');
    assert.equal(feedback.issues.length, 1);
    assert.equal(feedback.issues[0].spot_key, 'ser-estar');
    assert.equal(feedback.verdict, 'errors');
  });

  it('keeps only unambiguous choice items and fix items that still contain the mistake', () => {
    const spots = new Map([['subjuntivo-deseo', { id: 1, spot_key: 'subjuntivo-deseo', title_ru: 'Subjuntivo' }]]);
    const items = sanitizeWorkoutItems([
      { spot_key: 'subjuntivo-deseo', type: 'choice', prompt: 'Quiero que vos ___.', options: ['vengas', 'venís'], answers: ['vengas'] },
      { spot_key: 'subjuntivo-deseo', type: 'choice', prompt: 'Ambiguo ___.', options: ['a', 'b'], answers: ['a', 'b'] },
      { spot_key: 'subjuntivo-deseo', type: 'fix', prompt: 'Ojalá que podamos volver.', answers: ['Ojalá que podamos volver.'] },
      { spot_key: 'subjuntivo-deseo', type: 'fix', prompt: 'Ojalá que podemos volver.', answers: ['Ojalá que podamos volver.'] },
      { spot_key: 'subjuntivo-deseo', type: 'gap', prompt: 'Sin hueco (venir).', answers: ['venga'] },
    ], spots);
    assert.deepEqual(items.map((item) => item.prompt), ['Quiero que vos ___.', 'Ojalá que podemos volver.']);
  });

  it('flags transliterated or non-Russian explanations', () => {
    assert.equal(looksGarbledRussian('Частица «no» не stavit\'sya после «nunca».'), true);
    assert.equal(looksGarbledRussian('Para acciones terminadas usá el pretérito indefinido en lugar del imperfecto.'), true);
    assert.equal(looksGarbledRussian('После «quiero que» нужен Subjuntivo: «mi hijo haga».'), false);
  });

  it('strips markdown emphasis from partner replies but keeps underscores in words', () => {
    assert.equal(cleanPartnerText('Me parece bárbaro hablar de *El Eternauta*. ¿Y vos?'), 'Me parece bárbaro hablar de El Eternauta. ¿Y vos?');
    assert.equal(cleanPartnerText('**Ojo**: es re lindo'), 'Ojo: es re lindo');
    assert.equal(cleanPartnerText('mi_usuario está bien'), 'mi_usuario está bien');
  });

  it('normalises text for quote matching', () => {
    assert.equal(normalizeForMatch('¡Ojalá QUE podamos!'), 'ojala que podamos');
  });
});

describe('Custom topics and scenarios', () => {
  it('cleans her own topic text and rejects empty input', () => {
    assert.deepEqual(normalizeCustomInput({ customTopic: '  Обсудить\nсериал  ' }), { topic: { text: 'Обсудить сериал' } });
    assert.throws(() => normalizeCustomInput({ customTopic: ' a ' }), /подробнее/);
    assert.equal(normalizeCustomInput({}), null);
  });

  it('requires a character and a goal for her own scenario', () => {
    const custom = normalizeCustomInput({ customScenario: { character: 'мастер по кондиционерам', goal: 'Узнать цену ремонта', voice: 'male', formal: 1 } });
    assert.deepEqual(custom.scenario, { character: 'мастер по кондиционерам', goal: 'Узнать цену ремонта', name: '', voice: 'male', formal: true });
    assert.throws(() => normalizeCustomInput({ customScenario: { character: 'мастер', goal: '' } }), /ситуацию/);
  });
});

describe('Voice transcript clean-up', () => {
  it('drops hesitations and stuttered repeats', () => {
    assert.equal(
      stripDisfluencies('Me gusta ver películas eh en inglés o no no no no no vi eh un ninguna película. Eh pero mmm me gusta'),
      'Me gusta ver películas en inglés o no vi un ninguna película. pero me gusta',
    );
    assert.equal(stripDisfluencies('entender que que las personas dicen'), 'entender que las personas dicen');
  });

  it('keeps meaningful repeats separated by punctuation', () => {
    assert.equal(stripDisfluencies('Creo que no, no sé.'), 'Creo que no, no sé.');
  });
});

describe('Correction diff', () => {
  it('marks removed and added words', () => {
    const parts = diffWords('Yo nunca no estuve en Tigre', 'Yo nunca estuve en Tigre');
    assert.deepEqual(parts.filter((part) => part.type !== 'same').map((part) => `${part.type}:${part.text.trim()}`), ['del:no']);
  });
});
