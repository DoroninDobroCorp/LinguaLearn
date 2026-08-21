// Gamification Engine for LinguaLearn Spanish (XP, Levels, Streaks, Daily Quests)

export const LEVEL_TITLES = [
  { level: 1, minXp: 0, title: "Novato Porteño", emoji: "🌱" },
  { level: 2, minXp: 150, title: "Turista Curioso", emoji: "🧭" },
  { level: 3, minXp: 350, title: "Cebador de Mate", emoji: "🧉" },
  { level: 4, minXp: 700, title: "Hablante de Café", emoji: "☕" },
  { level: 5, minXp: 1200, title: "Explorador de San Telmo", emoji: "🎭" },
  { level: 6, minXp: 2000, title: "Bailarín de Milongas", emoji: "💃" },
  { level: 7, minXp: 3000, title: "Maestro del Subjuntivo", emoji: "🧠" },
  { level: 8, minXp: 4500, title: "Filósofo Rioplatense", emoji: "📚" },
  { level: 9, minXp: 6500, title: "Gran Porteño Legendario", emoji: "👑" }
];

export function ensureGamificationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_gamification (
      profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      xp INTEGER NOT NULL DEFAULT 0,
      streak_days INTEGER NOT NULL DEFAULT 1,
      last_active_date TEXT NOT NULL DEFAULT (date('now')),
      best_streak INTEGER NOT NULL DEFAULT 1,
      streak_freeze_count INTEGER NOT NULL DEFAULT 1,
      daily_quests_json TEXT,
      quests_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS story_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      story_id TEXT NOT NULL,
      current_chapter_id TEXT NOT NULL,
      completed_chapters_json TEXT NOT NULL DEFAULT '[]',
      is_finished INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, story_id)
    );

    CREATE TABLE IF NOT EXISTS scenario_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      completed_goals_json TEXT NOT NULL DEFAULT '[]',
      messages_count INTEGER NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, scenario_id)
    );
  `);
}

export function getProfileLevelInfo(xp) {
  let currentLevel = LEVEL_TITLES[0];
  let nextLevel = LEVEL_TITLES[1];

  for (let i = 0; i < LEVEL_TITLES.length; i++) {
    if (xp >= LEVEL_TITLES[i].minXp) {
      currentLevel = LEVEL_TITLES[i];
      nextLevel = LEVEL_TITLES[i + 1] || { ...LEVEL_TITLES[i], minXp: LEVEL_TITLES[i].minXp + 2000 };
    } else {
      break;
    }
  }

  const xpInCurrentLevel = xp - currentLevel.minXp;
  const xpRequiredForNext = nextLevel.minXp - currentLevel.minXp;
  const progressPercent = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNext) * 100)));

  return {
    level: currentLevel.level,
    title: currentLevel.title,
    emoji: currentLevel.emoji,
    xp,
    xpInCurrentLevel,
    xpRequiredForNext,
    progressPercent,
    nextTitle: nextLevel.title
  };
}

export function generateDailyQuests(lang = 'ru') {
  const isRu = lang === 'ru';
  const isEs = lang === 'es';

  return [
    {
      id: "quest_vocab",
      title: isRu ? "Повторение слов" : isEs ? "Repaso de Vocabulario" : "Vocabulary Review",
      description: isRu ? "Повтори 10 слов в карточках интервального повторения" : isEs ? "Repasa 10 palabras en tarjetas de memoria" : "Review 10 words with flashcards",
      target: 10,
      current: 0,
      rewardXp: 30,
      isCompleted: false,
      emoji: "📇"
    },
    {
      id: "quest_story",
      title: isRu ? "Чтение историй" : isEs ? "Lector de Historias" : "Story Reader",
      description: isRu ? "Прочитай хотя бы 1 главу интерактивной истории" : isEs ? "Lee al menos 1 capítulo de una historia interactiva" : "Read at least 1 chapter of an interactive story",
      target: 1,
      current: 0,
      rewardXp: 35,
      isCompleted: false,
      emoji: "📖"
    },
    {
      id: "quest_speed_match",
      title: isRu ? "Скоростной раунд" : isEs ? "Velocidad Relámpago" : "Speed Match Blitz",
      description: isRu ? "Сыграй 1 раунд Speed Match" : isEs ? "Completa una ronda de Speed Match" : "Complete 1 round of Speed Match Blitz",
      target: 1,
      current: 0,
      rewardXp: 25,
      isCompleted: false,
      emoji: "⚡"
    },
    {
      id: "quest_scenario",
      title: isRu ? "Сюжетный собеседник" : isEs ? "Conversador Porteño" : "Roleplay Conversationalist",
      description: isRu ? "Выполни хотя бы 1 цель в ролевом квесте (Roleplay)" : isEs ? "Completa al menos 1 objetivo en un juego de rol (Roleplay)" : "Complete at least 1 goal in a roleplay scenario",
      target: 1,
      current: 0,
      rewardXp: 40,
      isCompleted: false,
      emoji: "🎭"
    }
  ];
}

export function getGamificationStatus(db, profileId, lang = 'ru') {
  ensureGamificationSchema(db);
  const today = new Date().toISOString().slice(0, 10);

  let row = db.prepare("SELECT * FROM user_gamification WHERE profile_id = ?").get(profileId);
  if (!row) {
    db.prepare(`
      INSERT INTO user_gamification (profile_id, xp, streak_days, last_active_date, daily_quests_json, quests_date)
      VALUES (?, 100, 1, ?, ?, ?)
    `).run(profileId, today, JSON.stringify(generateDailyQuests(lang)), today);
    row = db.prepare("SELECT * FROM user_gamification WHERE profile_id = ?").get(profileId);
  }

  let quests = [];
  try {
    quests = JSON.parse(row.daily_quests_json || "[]");
  } catch (e) {
    quests = generateDailyQuests(lang);
  }

  if (row.quests_date !== today || quests.length === 0) {
    quests = generateDailyQuests(lang);
    db.prepare(`
      UPDATE user_gamification
      SET daily_quests_json = ?, quests_date = ?
      WHERE profile_id = ?
    `).run(JSON.stringify(quests), today, profileId);
  }

  const tplQuests = generateDailyQuests(lang);
  const storedMap = new Map((quests || []).map(q => [q.id, q]));
  const localizedQuests = tplQuests.map(tpl => {
    const sq = storedMap.get(tpl.id);
    return sq
      ? { ...tpl, current: sq.current || 0, isCompleted: Boolean(sq.isCompleted) }
      : tpl;
  });

  const levelInfo = getProfileLevelInfo(row.xp);

  return {
    ...levelInfo,
    streakDays: row.streak_days,
    bestStreak: row.best_streak,
    streakFreezeCount: row.streak_freeze_count,
    lastActiveDate: row.last_active_date,
    dailyQuests: localizedQuests
  };
}

export function addProfileXp(db, profileId, amount, reason = "practice") {
  ensureGamificationSchema(db);
  const status = getGamificationStatus(db, profileId);
  const today = new Date().toISOString().slice(0, 10);
  const newXp = (status.xp || 0) + Math.max(1, amount);

  let streak = status.streakDays || 1;
  let bestStreak = status.bestStreak || 1;

  if (status.lastActiveDate !== today) {
    const lastDate = new Date(status.lastActiveDate);
    const currentDate = new Date(today);
    const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak += 1;
    } else if (diffDays > 1) {
      streak = 1;
    }
    if (streak > bestStreak) bestStreak = streak;
  }

  db.prepare(`
    UPDATE user_gamification
    SET xp = ?, streak_days = ?, best_streak = ?, last_active_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE profile_id = ?
  `).run(newXp, streak, bestStreak, today, profileId);

  return getProfileLevelInfo(newXp);
}

export function updateDailyQuestProgress(db, profileId, questType, increment = 1) {
  ensureGamificationSchema(db);
  const status = getGamificationStatus(db, profileId);
  let updated = false;
  let rewardXpGained = 0;

  const quests = (status.dailyQuests || []).map(q => {
    if (q.id === questType || (questType === "story" && q.id === "quest_story") || (questType === "speed_match" && q.id === "quest_speed_match") || (questType === "scenario" && q.id === "quest_scenario") || (questType === "vocab" && q.id === "quest_vocab") || (questType === "vocab_review" && q.id === "quest_vocab")) {
      const newCurr = Math.min(q.target, (q.current || 0) + increment);
      const justCompleted = !q.isCompleted && newCurr >= q.target;
      if (justCompleted) {
        rewardXpGained += q.rewardXp;
      }
      updated = true;
      return {
        ...q,
        current: newCurr,
        isCompleted: q.isCompleted || newCurr >= q.target
      };
    }
    return q;
  });

  if (updated) {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`
      UPDATE user_gamification
      SET daily_quests_json = ?, quests_date = ?
      WHERE profile_id = ?
    `).run(JSON.stringify(quests), today, profileId);

    if (rewardXpGained > 0) {
      addProfileXp(db, profileId, rewardXpGained, "daily_quest_completed");
    }
  }

  return getGamificationStatus(db, profileId);
}
