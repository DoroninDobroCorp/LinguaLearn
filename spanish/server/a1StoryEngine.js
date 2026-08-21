const lockedChapter = (chapter, access) => ({
  id: chapter.id,
  title: chapter.title,
  titleRu: chapter.titleRu,
  titleEs: chapter.titleEs,
  unitId: chapter.unitId,
  stationOrder: chapter.stationOrder,
  isEnd: Boolean(chapter.isEnd),
  access,
});

function safeCompleted(progress) {
  return Array.isArray(progress?.completedChapters)
    ? progress.completedChapters.map(String)
    : [];
}

export function getIntroducedA1UnitIds(course) {
  return new Set((course?.units || [])
    .filter((unit) => Array.isArray(unit.topics) && unit.topics.length > 0
      && unit.topics.every((topic) => topic.phase !== 'new'))
    .map((unit) => unit.id));
}

function linearChapterAccess(story, course, progress) {
  const completed = new Set(safeCompleted(progress));
  const introducedUnits = getIntroducedA1UnitIds(course);
  return story.chapters.map((chapter, index) => {
    const requiredUnitIds = Array.isArray(chapter.requiredUnitIds) && chapter.requiredUnitIds.length
      ? chapter.requiredUnitIds : [chapter.unitId];
    const unitReady = requiredUnitIds.every((unitId) => introducedUnits.has(unitId));
    const previousReady = index === 0 || completed.has(story.chapters[index - 1].id);
    const isCompleted = completed.has(chapter.id);
    const isUnlocked = isCompleted || (unitReady && previousReady);
    let lockedReasonRu = null;
    if (!isUnlocked) {
      lockedReasonRu = !unitReady
        ? `Сначала познакомьтесь со словами и правилами модуля ${index + 1}.`
        : `Сначала завершите главу ${index}.`;
    }
    return { isUnlocked, isCompleted, lockedReasonRu };
  });
}

function branchingChapterAccess(story, course, progress) {
  const completed = new Set(safeCompleted(progress));
  const allUnitsReady = (course?.units || []).length > 0
    && getIntroducedA1UnitIds(course).size === course.units.length;
  const reachable = new Set();
  if (allUnitsReady && story.chapters[0]) reachable.add(story.chapters[0].id);
  for (const chapter of story.chapters) {
    if (!completed.has(chapter.id)) continue;
    reachable.add(chapter.id);
    for (const choice of chapter.choices || []) {
      if (completed.has(choice.targetChapterId) || progress?.currentChapterId === choice.targetChapterId) {
        reachable.add(choice.targetChapterId);
      }
    }
  }
  if (progress?.currentChapterId && allUnitsReady) reachable.add(progress.currentChapterId);
  return story.chapters.map((chapter) => {
    const isCompleted = completed.has(chapter.id);
    const isUnlocked = isCompleted || reachable.has(chapter.id);
    return {
      isUnlocked,
      isCompleted,
      lockedReasonRu: isUnlocked ? null : (allUnitsReady
        ? 'Сначала выберите путь в предыдущей главе.'
        : 'Бонусный сюжет откроется после знакомства с материалом всех 9 модулей A1.'),
    };
  });
}

function publicQuestion(question) {
  if (!question) return question;
  const { correctIndex: _correctIndex, explanation: _explanation, ...safe } = question;
  return safe;
}

export function buildA1StoryAccess(story, course, progress = {}) {
  const isLinear = story.chapters.every((chapter) => Boolean(chapter.unitId));
  const accessByIndex = isLinear
    ? linearChapterAccess(story, course, progress)
    : branchingChapterAccess(story, course, progress);
  const chapters = story.chapters.map((chapter, index) => {
    const access = accessByIndex[index];
    if (!access.isUnlocked) return lockedChapter(chapter, access);
    return { ...chapter, question: publicQuestion(chapter.question), access };
  });
  const completed = new Set(safeCompleted(progress));
  const preferred = chapters.find((chapter) => chapter.id === progress?.currentChapterId
    && chapter.access.isUnlocked && !completed.has(chapter.id));
  const next = preferred || chapters.find(
    (chapter) => chapter.access.isUnlocked && !completed.has(chapter.id)
  );
  const firstUnlocked = chapters.find((chapter) => chapter.access.isUnlocked);
  const lockedReasonRu = firstUnlocked ? null : (chapters[0]?.access.lockedReasonRu || 'Сюжет пока закрыт.');
  return {
    ...story,
    chapters,
    access: {
      isUnlocked: Boolean(firstUnlocked),
      nextChapterId: next?.id || firstUnlocked?.id || null,
      lockedReasonRu,
    },
    progress: {
      currentChapterId: next?.id || firstUnlocked?.id || null,
      completedChapters: [...completed],
      isFinished: Boolean(progress?.isFinished),
    },
  };
}

export function buildSandwichStoryAccess(story, course, completedChapterIds = []) {
  const synthetic = {
    ...story,
    chapters: story.chapters.map((chapter, index) => ({
      ...chapter,
      unitId: course?.units?.[chapter.stationOrder - 1]?.id || `a1-unit-${index + 1}`,
      question: chapter.quickQuiz,
    })),
  };
  const publicStory = buildA1StoryAccess(synthetic, course, { completedChapters: completedChapterIds });
  return {
    ...story,
    chapters: publicStory.chapters.map((chapter) => {
      if (!chapter.access.isUnlocked) return lockedChapter(chapter, chapter.access);
      const { question: _question, unitId: _unitId, quickQuiz: _quickQuiz, ...rest } = chapter;
      const original = story.chapters.find((item) => item.id === chapter.id);
      return { ...rest, quickQuiz: publicQuestion(original?.quickQuiz) };
    }),
    access: publicStory.access,
  };
}

export function buildScenarioAccess(scenarios, course, completedScenarioIds = []) {
  const introduced = getIntroducedA1UnitIds(course);
  const completed = new Set(completedScenarioIds.map(String));
  return scenarios.map((scenario, index) => {
    const unit = course?.units?.[index];
    const isCompleted = completed.has(scenario.id);
    const isUnlocked = isCompleted || Boolean(unit && introduced.has(unit.id));
    const access = {
      isUnlocked,
      isCompleted,
      unitId: unit?.id || null,
      unitOrder: index + 1,
      lockedReasonRu: isUnlocked ? null : `Сначала познакомьтесь со словами и правилами модуля ${index + 1}.`,
    };
    const { systemPrompt: _systemPrompt, ...safe } = scenario;
    if (isUnlocked) return { ...safe, access };
    return {
      id: scenario.id,
      title: scenario.title,
      level: scenario.level,
      avatarEmoji: scenario.avatarEmoji,
      characterName: scenario.characterName,
      characterRole: scenario.characterRole,
      access,
    };
  });
}

export function answerStoryQuestion(question, answerIndex) {
  const normalized = Number(answerIndex);
  if (!question || !Number.isInteger(normalized)) {
    return { isCorrect: false, correctIndex: question?.correctIndex ?? null, explanation: question?.explanation || null };
  }
  return {
    isCorrect: normalized === question.correctIndex,
    correctIndex: question.correctIndex,
    explanation: question.explanation || null,
  };
}
