import React, { useState, useEffect } from 'react';
import {
  GraduationCap, Trophy, Award, CheckCircle2, Circle, Sparkles,
  BookOpen, Play, ChevronRight, ShieldCheck, Dumbbell, Compass,
  Layers, Lock, Check, ArrowRight, HelpCircle, Volume2
} from 'lucide-react';
import { profileApiUrl, profileFetch, getAssetUrl } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { soundEngine } from '../utils/soundEffects';
import SandwichStoryModal from './SandwichStoryModal';

const TOPIC_RUSSIAN_TITLES = {
  1: { ru: "Глаголы SER и ESTAR: фундаментальная разница", icon: "⚖️" },
  2: { ru: "Правильные глаголы на -AR в настоящем времени", icon: "📝" },
  3: { ru: "Правильные глаголы на -ER и -IR в настоящем времени", icon: "☕" },
  4: { ru: "Род существительных и определенные артикли (el/la/los/las)", icon: "🏷️" },
  5: { ru: "Неопределенные артикли (un/una/unos/unas)", icon: "📦" },
  6: { ru: "Множественное число существительных (-s / -es)", icon: "👥" },
  7: { ru: "Личные местоимения (yo, tú, vos, él, ella, nosotros...)", icon: "👤" },
  8: { ru: "Притяжательные прилагательные (mi/tu/su/nuestro)", icon: "🤝" },
  9: { ru: "Указательные местоимения (este/ese/aquel)", icon: "👉" },
  10: { ru: "Конструкция HAY (наличие предметов и мест)", icon: "📍" },
  11: { ru: "Глагол TENER и устойчивые идиомы (возраст, голод)", icon: "🔑" },
  12: { ru: "Глагол GUSTAR и выражение предпочтений", icon: "❤️" },
  13: { ru: "Согласование прилагательных в роде и числе", icon: "🎨" },
  14: { ru: "Числа от 0 до 1000 и денежные суммы", icon: "🔢" },
  15: { ru: "Предлоги места (en, sobre, debajo de, al lado de)", icon: "🗺️" },
  16: { ru: "Неправильные глаголы первого лица (ir, hacer, decir...)", icon: "⚡" },
  17: { ru: "Отрицание в испанском языке (no + глагол)", icon: "🚫" },
  18: { ru: "Построение вопросительных предложений (¿qué? ¿dónde?)", icon: "❓" },
  19: { ru: "Счет и количественные числительные (1-30)", icon: "🔟" },
  20: { ru: "Цвета и оттенки в испанском языке", icon: "🌈" },
  21: { ru: "Семья и родственники (la familia)", icon: "👨‍👩‍👧‍👦" },
  22: { ru: "Дни недели, месяцы и времена года", icon: "📅" },
  23: { ru: "Еда, продукты и напитки (comida y bebida)", icon: "🍽️" },
  24: { ru: "Одежда, обувь и покупки (la ropa)", icon: "👕" },
  25: { ru: "Части тела и базовое здоровье (el cuerpo)", icon: "🫀" },
  26: { ru: "Дом, комнаты и мебель (la casa y muebles)", icon: "🏡" },
  27: { ru: "Приветствия, знакомство и формулы вежливости", icon: "👋" },
  28: { ru: "Который час? Время и расписание (la hora)", icon: "⏰" },
  29: { ru: "Заказ еды в ресторане и кафе (pedir comida)", icon: "🍷" },
  30: { ru: "Описание внешности и характера человека", icon: "🧑‍🦱" }
};

export default function A1UnitsView({ onOpenTheory, onOpenExercises, onOpenCheckpoint, onOpenSkills, onOpenVocab }) {
  const { isDark } = useTheme();
  const { t, language } = useLanguage();
  const [courseData, setCourseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storyData, setStoryData] = useState(null);
  const [activeStoryChapter, setActiveStoryChapter] = useState(null);
  const [completedChapters, setCompletedChapters] = useState([]);

  const fetchCourseData = async () => {
    try {
      setLoading(true);
      const [res, sRes] = await Promise.all([
        profileFetch(profileApiUrl('/spanish/api/a1/course')),
        profileFetch(profileApiUrl('/spanish/api/sandwich-story'))
      ]);

      if (res.ok) {
        const data = await res.json();
        setCourseData(data);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setStoryData(sData.story || null);
        setCompletedChapters(sData.completedChapterIds || []);
      }
    } catch (err) {
      console.error('Error loading course units:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourseData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-purple-600 space-y-3">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <span className="font-bold text-sm text-gray-700 dark:text-gray-300">
          Загрузка 9 модулей курса A1...
        </span>
      </div>
    );
  }

  const units = courseData?.units || [];
  const overallPercent = courseData?.overallPercent || 0;
  const masteredTopics = courseData?.masteredTopics || 0;
  const totalTopics = courseData?.totalTopics || 30;
  const dueCount = courseData?.dueCount || 0;
  const completionGates = courseData?.completionGates || {};

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Hero Course Banner */}
      <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-purple-700 via-fuchsia-600 to-amber-600 text-white shadow-2xl relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/3 -mb-12 w-48 h-48 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black tracking-wider uppercase mb-2">
                <span>🇪🇸 CEFR A1 Standard</span>
                <span>•</span>
                <span>Полная программа</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight drop-shadow">
                Курс испанского языка уровня A1
              </h2>
              <p className="text-purple-100 text-xs sm:text-base mt-2 max-w-2xl leading-relaxed">
                9 тематических модулей, 30 грамматико-лексических тем с аудио и таблицами спряжений, сквозная интерактивная история с Матео в Буэнос-Айресе, 10 контрольных точек и интервальное повторение.
              </p>
            </div>

            {/* Quick Progress Badge */}
            <div className="bg-white/15 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/20 shadow-lg flex flex-col items-center justify-center min-w-[170px] text-center">
              <div className="text-3xl sm:text-4xl font-black text-amber-300">
                {overallPercent}%
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-purple-100 mt-0.5">
                Освоение курса
              </div>
              <div className="text-[11px] text-white/80 mt-1">
                {masteredTopics} из {totalTopics} тем готово
              </div>
            </div>
          </div>

          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/15">
            <div className="bg-black/15 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
              <div className="text-xs text-purple-200 font-semibold">Модули</div>
              <div className="text-lg font-black mt-0.5">9 модулей</div>
              <div className="text-[10px] text-white/70">100% охват A1</div>
            </div>
            <div className="bg-black/15 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
              <div className="text-xs text-purple-200 font-semibold">Темы и теория</div>
              <div className="text-lg font-black mt-0.5">30 пакетов</div>
              <div className="text-[10px] text-white/70">с аудио и ошибками</div>
            </div>
            <div className="bg-black/15 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
              <div className="text-xs text-purple-200 font-semibold">Ключевой словарь</div>
              <div className="text-lg font-black mt-0.5">650 лемм</div>
              <div className="text-[10px] text-white/70">12 доменов</div>
            </div>
            <div className="bg-black/15 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
              <div className="text-xs text-purple-200 font-semibold">Контрольные точки</div>
              <div className="text-lg font-black mt-0.5">10 срезов</div>
              <div className="text-[10px] text-white/70">+ Выпускной экзамен</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 9 Thematic Modules List */}
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Layers className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                Модули учебной программы (Units 1–9)
              </h3>
              <p className="text-xs sm:text-sm text-gray-500">
                Каждый модуль объединяет грамматику, активный словарь, главу истории и контрольный срез.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {units.map((unit, uIdx) => {
            const unitOrder = unit.order || uIdx + 1;
            const coverFilename = `a1-u${String(unitOrder).padStart(2, '0')}-cover-01.webp`;
            const coverUrl = getAssetUrl(`/a1/media/${coverFilename}`);
            const unitPercent = unit.percent || 0;
            const unitTopics = unit.topics || [];
            const masteredCount = unitTopics.filter(t => t.phase === 'mastered').length;

            return (
              <div
                key={unit.id || uIdx}
                className="glass-card rounded-3xl border border-purple-100 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 shadow-lg hover:shadow-xl transition-all overflow-hidden"
              >
                {/* Module Banner Header */}
                <div className="relative flex flex-col md:flex-row items-stretch bg-gradient-to-r from-purple-50 via-white to-pink-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-750 border-b border-purple-100 dark:border-gray-700">
                  {/* Cover Image */}
                  <div className="md:w-72 h-44 md:h-auto relative overflow-hidden flex-shrink-0 bg-purple-100 dark:bg-gray-700">
                    <img
                      src={coverUrl}
                      alt={unit.titleRu}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/60 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white text-[11px] font-black tracking-wider uppercase shadow">
                      Модуль {unitOrder}
                    </div>
                  </div>

                  {/* Unit Metadata & Outcome */}
                  <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                          Unit {unitOrder} • Уровень A1
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                          {masteredCount} из {unitTopics.length} тем освоено
                        </span>
                      </div>

                      <h4 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mt-1">
                        {unit.titleRu}
                      </h4>

                      {/* Outcome Goal Statement */}
                      <div className="mt-2.5 p-3 rounded-2xl bg-white/80 dark:bg-gray-750 border border-purple-100 dark:border-gray-650 flex items-start gap-2.5 text-xs sm:text-sm">
                        <span className="text-amber-500 font-bold text-base leading-none mt-0.5">🎯</span>
                        <div className="text-gray-700 dark:text-gray-200">
                          <strong className="font-bold text-gray-900 dark:text-white">Чему вы научитесь: </strong>
                          {unit.outcomeRu}
                        </div>
                      </div>
                    </div>

                    {/* Unit Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
                        <span>Прогресс модуля</span>
                        <span className="text-purple-600 dark:text-purple-400 font-black">{unitPercent}%</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-400 via-fuchsia-500 to-purple-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(unitPercent, 4)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Topics Grid inside the Module */}
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Темы модуля ({unitTopics.length}):
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {unitTopics.map((topic) => {
                      const topicMeta = TOPIC_RUSSIAN_TITLES[topic.topicId] || {};
                      const isMastered = topic.phase === 'mastered';
                      const isLearning = topic.phase === 'learning' || (topic.masteryScore > 0 && !isMastered);

                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500">
                          Новая
                        </span>
                      );
                      if (isMastered) {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Освоено
                          </span>
                        );
                      } else if (isLearning) {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                            {topic.masteryScore}% в процессе
                          </span>
                        );
                      }

                      return (
                        <div
                          key={topic.topicId}
                          className="p-4 rounded-2xl border border-purple-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-750/70 hover:bg-white dark:hover:bg-gray-700/90 transition-all shadow-sm hover:shadow-md flex flex-col justify-between space-y-3 group"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-lg border border-purple-100 dark:border-purple-800">
                                {topic.category === 'Grammar' ? '📝 Грамматика' : topic.category === 'Vocabulary' ? '📖 Лексика' : '🗣️ Речь'}
                              </span>
                              {statusBadge}
                            </div>

                            <div className="flex items-start gap-2 mt-1">
                              <span className="text-lg flex-shrink-0">{topicMeta.icon || '📝'}</span>
                              <div>
                                <h5 className="font-black text-sm text-gray-900 dark:text-white leading-snug group-hover:text-purple-600 transition-colors">
                                  {topicMeta.ru || topic.name}
                                </h5>
                                <div className="text-[11px] text-gray-400 mt-0.5 font-medium">
                                  {topic.name}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Quick Topic Actions */}
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <button
                              onClick={() => onOpenTheory && onOpenTheory({ id: topic.topicId, name: topic.name })}
                              className="py-1.5 px-2.5 rounded-xl bg-purple-50 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-200 font-extrabold text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Теория</span>
                            </button>

                            <button
                              onClick={() => onOpenExercises && onOpenExercises({ id: topic.topicId, name: topic.name })}
                              className="py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-xs transition-transform active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                            >
                              <Dumbbell className="w-3.5 h-3.5" />
                              <span>24+ задач</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Module Footer Links: Checkpoint and Story Chapter */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-purple-50 dark:border-gray-700/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-semibold">
                        Контроль и практика модуля:
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      {/* Read Story Chapter Button */}
                      {storyData && (
                        <button
                          onClick={() => {
                            const chap = storyData.chapters.find(c => c.stationOrder === unitOrder) || storyData.chapters[unitOrder - 1];
                            if (chap?.access?.isUnlocked) setActiveStoryChapter(chap);
                          }}
                          disabled={!(storyData.chapters.find(c => c.stationOrder === unitOrder) || storyData.chapters[unitOrder - 1])?.access?.isUnlocked}
                          className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-black text-xs flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                          <span>Глава {unitOrder} истории с Матео</span>
                        </button>
                      )}

                      {/* Module Checkpoint Button */}
                      <button
                        onClick={() => onOpenCheckpoint && onOpenCheckpoint(unitOrder)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-black text-xs flex items-center gap-1.5 transition-transform active:scale-95 shadow-md"
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-300" />
                        <span>Срез модуля {unitOrder} (Checkpoint)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. A1 Final Graduation & Certificate Card */}
      <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-amber-500 via-orange-500 to-purple-700 text-white shadow-2xl border-2 border-amber-300 dark:border-amber-600 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black tracking-wider uppercase">
              <Award className="w-4 h-4 text-amber-200" />
              <span>Финальная аттестация A1</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
              Выпускной экзамен курса A1 и сертификат
            </h3>
            <p className="text-xs sm:text-sm text-purple-100 leading-relaxed">
              Итоговый 10-й контрольный срез проверяет комплексное владение всеми 9 модулями: грамматические структуры, активный словарь 650 лемм, аудирование и продуктивное письмо.
            </p>
          </div>

          <button
            onClick={() => onOpenCheckpoint && onOpenCheckpoint(10)}
            className="px-6 py-4 bg-white hover:bg-amber-50 text-purple-900 font-black text-sm rounded-2xl shadow-2xl transition-transform active:scale-95 flex items-center justify-center gap-2 flex-shrink-0"
          >
            <GraduationCap className="w-5 h-5 text-purple-700" />
            <span>Сдать выпускной экзамен A1</span>
            <ArrowRight className="w-4 h-4 text-purple-700" />
          </button>
        </div>
      </div>

      {/* Story Chapter Reader Modal */}
      {activeStoryChapter && (
        <SandwichStoryModal
          chapter={activeStoryChapter}
          isOpen={Boolean(activeStoryChapter)}
          isCompleted={completedChapters.includes(activeStoryChapter.id)}
          onClose={() => setActiveStoryChapter(null)}
          onChapterFinished={(chapterId) => {
            if (!completedChapters.includes(chapterId)) {
              setCompletedChapters(prev => [...prev, chapterId]);
            }
          }}
        />
      )}
    </div>
  );
}
