// Smart Coach & Today's Recommendations Engine for LinguaLearn Spanish
import { getGamificationStatus } from './gamification.js';
import { getA1TodayPlan } from './a1CourseEngine.js';
import { PRESET_STORIES } from './storiesData.js';
import { PRESET_SCENARIOS } from './scenariosData.js';

export function getTodayRecommendations(db, profileId, lang = 'ru', options = {}) {
  const gamification = getGamificationStatus(db, profileId, lang);
  const isRu = lang === 'ru';
  const isEs = lang === 'es';

  // 1. Vocabulary Due stats
  let dueCardsCount = 0;
  try {
    const dueRow = db.prepare(`
      SELECT count(*) as count
      FROM vocabulary_review_cards
      WHERE profile_id = ? AND next_review_at <= datetime('now') AND (learned_until IS NULL OR learned_until <= datetime('now'))
    `).get(profileId);
    dueCardsCount = dueRow?.count || 0;
  } catch (e) {
    dueCardsCount = 0;
  }

  // 2. Active Story Check
  let activeStory = null;
  try {
    const storyProgressRows = db.prepare('SELECT * FROM story_progress WHERE profile_id = ?').all(profileId);
    const progressMap = new Map(storyProgressRows.map(r => [r.story_id, r]));

    for (const story of PRESET_STORIES) {
      const prog = progressMap.get(story.id);
      if (!prog || !prog.is_finished) {
        const completedChapters = JSON.parse(prog?.completed_chapters_json || '[]');
        activeStory = {
          id: story.id,
          title: story.title,
          coverEmoji: story.coverEmoji,
          level: story.level,
          currentChapterTitle: story.chapters.find(c => c.id === prog?.current_chapter_id)?.title || story.chapters[0]?.title,
          completedCount: completedChapters.length,
          totalChapters: story.chapters.length
        };
        break;
      }
    }
  } catch (e) {
    console.error('Error finding active story:', e);
  }

  // 3. Active Scenario Quest Check
  let nextScenario = null;
  try {
    const scenarioRows = db.prepare('SELECT * FROM scenario_progress WHERE profile_id = ?').all(profileId);
    const scMap = new Map(scenarioRows.map(r => [r.scenario_id, r]));

    for (const sc of PRESET_SCENARIOS) {
      const prog = scMap.get(sc.id);
      const completedGoals = JSON.parse(prog?.completed_goals_json || '[]');
      if (!prog || !prog.is_completed || completedGoals.length < sc.objectives.length) {
        nextScenario = {
          id: sc.id,
          title: sc.title,
          avatarEmoji: sc.avatarEmoji,
          characterName: sc.characterName,
          level: sc.level,
          completedGoalsCount: completedGoals.length,
          totalGoals: sc.objectives.length
        };
        break;
      }
    }
  } catch (e) {
    console.error('Error finding active scenario:', e);
  }

  // 4. Next Curriculum Topic Check
  let nextTopic = null;
  try {
    const topicRow = db.prepare(`
      SELECT t.id, t.name, t.category, t.level, coalesce(p.score, 0) as score, coalesce(p.status, 'not_started') as status
      FROM curriculum_topics t
      LEFT JOIN curriculum_progress p ON p.topic_id = t.id AND p.profile_id = ?
      WHERE coalesce(p.status, 'not_started') != 'mastered' AND coalesce(p.score, 0) < 80
      ORDER BY t.level ASC, t.pedagogical_order ASC, t.id ASC
      LIMIT 1
    `).get(profileId);

    if (topicRow) {
      nextTopic = {
        id: topicRow.id,
        name: topicRow.name,
        category: topicRow.category,
        level: topicRow.level,
        score: Math.round(topicRow.score)
      };
    }
  } catch (e) {
    console.error('Error finding next topic:', e);
  }

  // 5. Compose 3 Personalized Steps for Today's Flow with full RU/EN/ES localization
  const questsMap = new Map((gamification.dailyQuests || []).map(q => [q.id, q]));
  const vocabQuest = questsMap.get('quest_vocab');
  const storyQuest = questsMap.get('quest_story');
  const speedQuest = questsMap.get('quest_speed_match');
  const scenarioQuest = questsMap.get('quest_scenario');

  const steps = [];

  // Step 1: Warm-up
  if (dueCardsCount > 0) {
    const isVocabDone = Boolean(vocabQuest?.isCompleted || (vocabQuest?.current >= 10));
    steps.push({
      stepNumber: 1,
      tag: isRu ? "Разминка • 5 мин" : isEs ? "Calentamiento • 5 min" : "Warm-up • 5 min",
      title: isRu ? "Повторить 10 слов в карточках" : isEs ? "Repasar 10 tarjetas de vocabulario" : "Review 10 vocabulary flashcards",
      description: isRu ? `Повтори 10 слов с интервальным повторением для выполнения дневной миссии (всего готово: ${dueCardsCount}).` : isEs ? `Repasa al menos 10 palabras para completar la misión del día (total pendientes: ${dueCardsCount}).` : `Review 10 flashcards to complete today's mission (${dueCardsCount} due in total).`,
      actionLabel: isVocabDone ? (isRu ? "✓ Выполнено (Повторить еще)" : "✓ Done (Review more)") : (isRu ? "Повторить 10 слов" : isEs ? "Repasar 10 palabras" : "Review 10 words"),
      actionUrl: "/vocabulary",
      emoji: "📇",
      badge: isVocabDone ? "✓ 10/10" : (isRu ? `Прогресс: ${vocabQuest?.current || 0}/10` : `Progress: ${vocabQuest?.current || 0}/10`),
      xpReward: 30,
      isCompleted: isVocabDone
    });
  } else {
    const isSpeedDone = Boolean(speedQuest?.isCompleted);
    steps.push({
      stepNumber: 1,
      tag: isRu ? "Разминка • 3 мин" : isEs ? "Calentamiento • 3 min" : "Warm-up • 3 min",
      title: isRu ? "Раунд Speed Match Blitz" : isEs ? "Ronda Relámpago en Speed Match" : "Speed Match Blitz Round",
      description: isRu ? "Разомни мозг сопоставлением пар слов на скорость с комбо-множителями." : isEs ? "Activa tu cerebro emparejando palabras contrarreloj con multiplicadores de combo." : "Warm up your brain by matching word pairs against the clock.",
      actionLabel: isSpeedDone ? (isRu ? "✓ Выполнено (Сыграть еще)" : "✓ Done (Play again)") : (isRu ? "Играть в Speed Match" : isEs ? "Jugar Speed Match" : "Play Speed Match"),
      actionUrl: "/exercises",
      emoji: "⚡",
      badge: isSpeedDone ? "✓ Выполнено" : "Blitz",
      xpReward: 25,
      isCompleted: isSpeedDone
    });
  }

  // Step 2: Core Learning / Story
  if (activeStory) {
    const isStoryDone = Boolean(storyQuest?.isCompleted);
    steps.push({
      stepNumber: 2,
      tag: isRu ? "Погружение • 7 мин" : isEs ? "Inmersión • 7 min" : "Immersion • 7 min",
      title: isRu ? `Продолжить: «${activeStory.title}»` : isEs ? `Continuar: «${activeStory.title}»` : `Continue: "${activeStory.title}"`,
      description: isRu ? `${activeStory.currentChapterTitle} • Выбирай решения, меняющие финал.` : isEs ? `${activeStory.currentChapterTitle} • Elige decisiones que cambian el final.` : `${activeStory.currentChapterTitle} • Make choices that shape the ending.`,
      actionLabel: isStoryDone ? (isRu ? "✓ Пройдено (Читать дальше)" : "✓ Done (Read next)") : (isRu ? "Читать историю" : isEs ? "Leer Historia" : "Read Story"),
      actionUrl: "/stories",
      emoji: activeStory.coverEmoji,
      badge: isStoryDone ? "✓ Глава пройдена" : (isRu ? `Глава ${activeStory.completedCount + 1}/${activeStory.totalChapters}` : `Chapter ${activeStory.completedCount + 1}/${activeStory.totalChapters}`),
      xpReward: 40,
      isCompleted: isStoryDone
    });
  } else if (nextTopic) {
    steps.push({
      stepNumber: 2,
      tag: isRu ? "Грамматика • 8 мин" : isEs ? "Gramática • 8 min" : "Grammar • 8 min",
      title: isRu ? `Освоить тему: ${nextTopic.name}` : isEs ? `Dominar: ${nextTopic.name}` : `Master: ${nextTopic.name}`,
      description: isRu ? "Наглядная теория со схемами, примерами и мини-квизом." : isEs ? "Guía visual con ejemplos prácticos y notas del dialecto rioplatense." : "Visual guide with diagrams, examples, and mini-quiz.",
      actionLabel: isRu ? "Учить теорию и практику" : isEs ? "Ver Teoría & Práctica" : "Learn Theory & Practice",
      actionUrl: "/curriculum",
      emoji: "📝",
      badge: isRu ? `Уровень ${nextTopic.level}` : isEs ? `Nivel ${nextTopic.level}` : `Level ${nextTopic.level}`,
      xpReward: 35
    });
  } else {
    steps.push({
      stepNumber: 2,
      tag: isRu ? "Практика • 5 мин" : isEs ? "Práctica • 5 min" : "Practice • 5 min",
      title: isRu ? "Конструктор фраз (Word Tiles)" : isEs ? "Constructor de Frases (Word Tiles)" : "Word Tiles Constructor",
      description: isRu ? "Сборка предложений тапом по плиткам в правильном порядке." : isEs ? "Entrena la estructura de oraciones en español sin cansancio de teclado." : "Practice Spanish sentence structure with tactile word tiles.",
      actionLabel: isRu ? "Собирать фразы" : isEs ? "Construir Frases" : "Build Sentences",
      actionUrl: "/exercises",
      emoji: "🧩",
      badge: "Word Tiles",
      xpReward: 30
    });
  }

  // Step 3: Real Communication
  if (nextScenario) {
    const isScenarioDone = Boolean(scenarioQuest?.isCompleted);
    steps.push({
      stepNumber: 3,
      tag: isRu ? "Разговор • 5 мин" : isEs ? "Conversación • 5 min" : "Conversation • 5 min",
      title: isRu ? `Квест: ${nextScenario.title}` : isEs ? `Misión: ${nextScenario.title}` : `Quest: ${nextScenario.title}`,
      description: isRu ? `Поговори с персонажем (${nextScenario.characterName}) и выполни цели ситуации.` : isEs ? `Habla con ${nextScenario.characterName} y cumple los objetivos de la situación real.` : `Talk to ${nextScenario.characterName} and complete real-life mission objectives.`,
      actionLabel: isScenarioDone ? (isRu ? "✓ Выполнено (Играть еще)" : "✓ Done (Replay)") : (isRu ? "Начать миссию" : isEs ? "Iniciar Misión" : "Start Quest"),
      actionUrl: "/chat",
      emoji: nextScenario.avatarEmoji,
      badge: isScenarioDone ? "✓ Выполнено" : (isRu ? `${nextScenario.completedGoalsCount}/${nextScenario.totalGoals} целей` : `${nextScenario.completedGoalsCount}/${nextScenario.totalGoals} goals`),
      xpReward: 45,
      isCompleted: isScenarioDone
    });
  } else {
    steps.push({
      stepNumber: 3,
      tag: isRu ? "Свободный разговор • 5 мин" : isEs ? "Conversación Libre • 5 min" : "Free Chat • 5 min",
      title: isRu ? "Беседа с AI-репетитором" : isEs ? "Charla con tu Profesor AI" : "Chat with AI Tutor",
      description: isRu ? "Задай любой вопрос по грамматике или пообщайся на испанском." : isEs ? "Pregunta cualquier duda o conversa libremente en español." : "Ask any grammar question or chat freely in Spanish.",
      actionLabel: isRu ? "Открыть чат AI" : isEs ? "Abrir Chat AI" : "Open AI Chat",
      actionUrl: "/chat",
      emoji: "🤖",
      badge: isRu ? "Репетитор" : isEs ? "Tutor Libre" : "Tutor",
      xpReward: 30
    });
  }

  // The adaptive A1 scheduler owns the recommended order. The legacy coach
  // still supplies stories/scenarios and gamification metadata, but it cannot
  // move a new lesson ahead of overdue spaced reviews.
  const adaptive = getA1TodayPlan(db, profileId, new Date(), options);
  const adaptiveSteps = adaptive.actions.map((action, index) => ({
    stepNumber: index + 1,
    tag: action.kind === 'grammar_review'
      ? (isRu ? 'Повторение по расписанию' : 'Spaced review')
      : action.kind === 'new_topic'
        ? (isRu ? 'Новый материал' : 'New material')
        : (isRu ? 'Навык в контексте' : 'Context skill'),
    title: action.titleRu,
    description: action.descriptionRu,
    actionLabel: isRu ? 'Начать' : 'Start',
    actionUrl: action.actionUrl,
    emoji: action.kind === 'grammar_review' ? '🧠' : action.kind === 'new_topic' ? '📝' : action.kind === 'vocabulary_review' ? '📇' : '🗣️',
    badge: `~${action.minutes} мин`,
    xpReward: action.kind === 'skill' ? 40 : 30,
    isCompleted: false,
    topicIds: action.topicIds || [],
    skill: action.skill || null,
  }));

  return {
    gamification,
    steps: adaptiveSteps,
    course: adaptive.course,
    primaryAction: adaptive.primaryAction,
    continueOptions: adaptive.continueOptions,
    pace: adaptive.pace,
    targetMinutes: adaptive.targetMinutes,
    plannedMinutes: adaptive.plannedMinutes,
    summary: {
      dueCardsCount,
      activeStory,
      nextScenario,
      nextTopic
    }
  };
}
