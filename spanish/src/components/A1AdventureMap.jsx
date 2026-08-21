import React, { useState, useEffect } from 'react';
import {
  Sparkles, Trophy, Star, Circle, Lock,
  BookOpen, ChevronRight, Compass, ShieldCheck, HelpCircle,
  MapPin, Play, Volume2, ArrowRight
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { soundEngine } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';
import MateoCharacter from './MateoCharacter';
import SandwichStoryModal from './SandwichStoryModal';

// 9 Interleaved Stations along the Buenos Aires adventure route for Units 1 to 9
const A1_LANDMARKS = [
  {
    order: 1,
    id: "station-1",
    nameRu: "Аэропорт Эсейса",
    nameEs: "Aeropuerto de Ezeiza",
    topicName: "Greetings and introductions (saludos)",
    landmarkEmoji: "🛬",
    x: 10,
    y: 12,
    chapterId: "chapter-1",
    storyTitle: "Прилет в Эсейсу и первые слова",
    description: "Первые приветствия, знакомство и базовые местоимения yo/tú/vos."
  },
  {
    order: 2,
    id: "station-2",
    nameRu: "Обелиск & Авенида 9 de Julio",
    nameEs: "Obelisco & Av. 9 de Julio",
    topicName: "Gender and articles (el/la/los/las)",
    landmarkEmoji: "🚕",
    x: 35,
    y: 18,
    chapterId: "chapter-2",
    storyTitle: "Такси на Авенида 9 де Хулио",
    description: "Поездка на такси по широкому проспекту, артикли el/la, цвета и числа."
  },
  {
    order: 3,
    id: "station-3",
    nameRu: "Пласа де Майо & Каса Росада",
    nameEs: "Plaza de Mayo",
    topicName: "Ser vs Estar (basic)",
    landmarkEmoji: "🏛️",
    x: 65,
    y: 24,
    chapterId: "chapter-3",
    storyTitle: "Встреча на Пласа де Майо",
    description: "Встреча с гидом Софией, разница Ser vs Estar и описание людей."
  },
  {
    order: 4,
    id: "station-4",
    nameRu: "Сан-Тельмо и семья",
    nameEs: "San Telmo & La Familia",
    topicName: "Tener (to have) and tener expressions",
    landmarkEmoji: "🏡",
    x: 84,
    y: 40,
    chapterId: "chapter-4",
    storyTitle: "Семья и уют в Сан-Тельмо",
    description: "Колониальный дворик, члены семьи, притяжательные mi/tu и глагол Tener."
  },
  {
    order: 5,
    id: "station-5",
    nameRu: "Каминито в Ла Бока",
    nameEs: "Caminito (La Boca)",
    topicName: "Present tense regular -ar verbs",
    landmarkEmoji: "🎨",
    x: 60,
    y: 52,
    chapterId: "chapter-5",
    storyTitle: "Танго и краски в Ла Бока",
    description: "Разноцветные домики, ритмы танго, глаголы на -AR и отрицание no."
  },
  {
    order: 6,
    id: "station-6",
    nameRu: "Английская башня & Метро",
    nameEs: "Torre Monumental & Subte",
    topicName: "Asking and telling the time (la hora)",
    landmarkEmoji: "🕰️",
    x: 25,
    y: 62,
    chapterId: "chapter-6",
    storyTitle: "Время и ритм большого города",
    description: "Часы на площади, расписание метро, дни недели и ориентация во времени."
  },
  {
    order: 7,
    id: "station-7",
    nameRu: "Кафе Тортони",
    nameEs: "Café Tortoni",
    topicName: "Present tense regular -er/-ir verbs",
    landmarkEmoji: "☕",
    x: 48,
    y: 72,
    chapterId: "chapter-7",
    storyTitle: "Завтрак в Кафе Тортони",
    description: "Старейшее кафе Буэнос-Айреса, глаголы -ER/-IR, еда и заказ блюд."
  },
  {
    order: 8,
    id: "station-8",
    nameRu: "Баррио Норте и Квартира",
    nameEs: "Barrio Norte & Apartamento",
    topicName: "House and furniture (la casa)",
    landmarkEmoji: "🛋️",
    x: 78,
    y: 82,
    chapterId: "chapter-8",
    storyTitle: "Новый дом в Сан-Тельмо и уют",
    description: "Обустройство квартиры, мебель, конструкция Hay и предлоги места."
  },
  {
    order: 9,
    id: "station-9",
    nameRu: "Пуэрто-Мадеро & Выпускной A1",
    nameEs: "Puerto Madero & Graduación",
    topicName: "Gustar and similar verbs",
    landmarkEmoji: "🎓",
    x: 40,
    y: 92,
    chapterId: "chapter-9",
    storyTitle: "Фиеста в Пуэрто-Мадеро и Выпускной A1",
    description: "Женский мост, вечерняя фиеста, глаголы Gustar, планы на будущее и финал A1!"
  }
];

export default function A1AdventureMap({ onSelectTopicForPractice }) {
  const { t, language } = useLanguage();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [storyData, setStoryData] = useState(null);
  const [completedChapters, setCompletedChapters] = useState([]);
  const [activeStoryChapter, setActiveStoryChapter] = useState(null);

  const fetchTopicsAndStory = async () => {
    try {
      setLoading(true);
      const [topRes, storyRes] = await Promise.all([
        profileFetch(profileApiUrl('/spanish/api/a1/course')),
        profileFetch(profileApiUrl('/spanish/api/sandwich-story'))
      ]);

      if (topRes.ok) {
        const topData = await topRes.json();
        const adaptiveTopics = (topData.units || []).flatMap(unit => unit.topics || []).map(topic => ({
          id: topic.topicId,
          name: topic.name,
          category: topic.category,
          status: topic.phase,
          score: topic.masteryScore,
          is_locked: false,
        }));
        setTopics(adaptiveTopics);
      }

      if (storyRes.ok) {
        const sData = await storyRes.json();
        setStoryData(sData.story || null);
        setCompletedChapters(sData.completedChapterIds || []);
      }
    } catch (err) {
      console.error('Error fetching adventure map data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopicsAndStory();
  }, []);

  const a1TopicsMap = new Map(topics.map(t => [t.name.toLowerCase(), t]));
  const masteredCount = topics.filter(t => t.status === 'mastered').length;
  const totalCount = Math.max(topics.length, 30);
  const progressPercent = Math.round((masteredCount / totalCount) * 100);
  const remainingPercent = 100 - progressPercent;

  let activeStationIndex = 0;
  for (let i = 0; i < A1_LANDMARKS.length; i++) {
    const lm = A1_LANDMARKS[i];
    const top = a1TopicsMap.get(lm.topicName.toLowerCase());
    const isMastered = top && (top.status === 'mastered');
    if (!isMastered) {
      activeStationIndex = i;
      break;
    }
    if (i === A1_LANDMARKS.length - 1) {
      activeStationIndex = i;
    }
  }

  const currentStation = A1_LANDMARKS[activeStationIndex];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Header Progress Bar */}
      <div className="glass-card rounded-3xl p-6 border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>{t('today_a1_progress_title', 'Интерактивная карта приключений уровня A1 (9 глав)')}</span>
            </div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-1 flex items-center gap-2">
              <span>{progressPercent}% {t('status_mastered', 'Освоено')}</span>
              <span className="text-sm font-semibold text-gray-500">
                ({masteredCount} из {totalCount} тем) • {language === 'ru' ? `Осталось ${remainingPercent}%` : `${remainingPercent}% left`}
              </span>
            </h2>
          </div>

          {/* Milestones */}
          <div className="flex items-center gap-2 self-start md:self-auto bg-purple-50 dark:bg-gray-750 px-3 py-1.5 rounded-2xl border border-purple-100 dark:border-gray-700">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${progressPercent >= 25 ? 'bg-amber-400 text-amber-950 shadow-sm' : 'text-gray-400'}`}>25% ⭐</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${progressPercent >= 50 ? 'bg-amber-400 text-amber-950 shadow-sm' : 'text-gray-400'}`}>50% 🏆</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${progressPercent >= 75 ? 'bg-amber-400 text-amber-950 shadow-sm' : 'text-gray-400'}`}>75% 🎖️</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${progressPercent >= 100 ? 'bg-amber-400 text-amber-950 shadow-sm' : 'text-gray-400'}`}>100% 👑</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-4 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden p-0.5 border border-purple-100 dark:border-gray-600 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-fuchsia-500 to-purple-600 rounded-full transition-all duration-700 shadow"
            style={{ width: `${Math.max(progressPercent, 4)}%` }}
          />
        </div>
      </div>

      {/* 2. Illustrated Landscape SVG Map Canvas */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl border-2 border-purple-200 dark:border-gray-700 bg-gradient-to-b from-sky-100 via-amber-50 to-emerald-100 dark:from-slate-900 dark:via-purple-950/40 dark:to-slate-900 min-h-[680px] p-4 sm:p-8 select-none">

        {/* Background Visual SVG Elements (Road, River, City silhouettes) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          {/* Rio de la Plata Water Body */}
          <path d="M 80,0 Q 95,30 88,70 Q 75,100 100,100 L 100,0 Z" fill="rgba(56, 189, 248, 0.25)" />

          {/* Clouds */}
          <path d="M 10,8 Q 15,2 22,8 Q 28,14 20,16 Q 10,16 10,8 Z" fill="rgba(255,255,255,0.6)" />
          <path d="M 60,6 Q 66,1 74,6 Q 80,12 70,14 Q 58,14 60,6 Z" fill="rgba(255,255,255,0.5)" />

          {/* Winding Cobblestone Road Path for 9 stations */}
          <path
            d="M 10,12 C 24,14 30,16 35,18 C 50,20 58,22 65,24 C 76,28 84,34 84,40 C 80,46 72,50 60,52 C 42,56 30,58 25,62 C 20,68 36,70 48,72 C 62,75 75,78 78,82 C 80,88 56,90 40,92"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3.5"
            strokeDasharray="2 1.5"
            strokeLinecap="round"
            className="opacity-75"
          />
          <path
            d="M 10,12 C 24,14 30,16 35,18 C 50,20 58,22 65,24 C 76,28 84,34 84,40 C 80,46 72,50 60,52 C 42,56 30,58 25,62 C 20,68 36,70 48,72 C 62,75 75,78 78,82 C 80,88 56,90 40,92"
            fill="none"
            stroke="#b45309"
            strokeWidth="0.8"
            strokeLinecap="round"
            className="opacity-40"
          />
        </svg>

        {/* Stations Pins Placed Along the Path */}
        <div className="relative w-full h-[620px]">
          {A1_LANDMARKS.map((lm, idx) => {
            const top = a1TopicsMap.get(lm.topicName.toLowerCase());
            const isMastered = top && (top.status === 'mastered');
            const isCurrent = idx === activeStationIndex;
            const isStoryDone = completedChapters.includes(lm.chapterId);

            return (
              <div
                key={lm.id}
                style={{ left: `${lm.x}%`, top: `${lm.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                onClick={() => {
                  soundEngine.playTileClick();
                  setSelectedStation({ ...lm, topic: top });
                }}
              >
                {/* Glowing Pulse Halo on Active Station */}
                {isCurrent && (
                  <div className="absolute -inset-4 bg-gradient-to-r from-amber-400 to-fuchsia-500 rounded-full animate-ping opacity-60 pointer-events-none" />
                )}

                {/* Station Node Badge */}
                <div
                  className={`w-12 h-12 sm:w-16 sm:h-16 rounded-3xl shadow-xl flex flex-col items-center justify-center border-3 transition-all duration-300 transform group-hover:scale-110 group-hover:-translate-y-1.5 ${
                    isMastered
                      ? 'bg-gradient-to-br from-emerald-400 to-green-600 border-green-200 text-white ring-4 ring-green-400/30'
                      : isCurrent
                      ? 'bg-gradient-to-br from-amber-400 via-orange-500 to-fuchsia-600 border-white text-white ring-4 ring-amber-400/50 shadow-amber-500/50'
                      : 'bg-white/90 dark:bg-gray-800/90 border-purple-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <span className="text-xl sm:text-2xl">{lm.landmarkEmoji}</span>
                  <div className="text-[9px] font-black tracking-tight leading-none mt-0.5">
                    {isMastered ? '⭐' : `№${lm.order}`}
                  </div>
                </div>

                {/* Station Label Banner */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap px-2.5 py-1 rounded-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-purple-100 dark:border-gray-700 shadow-md text-center pointer-events-none transition-transform group-hover:scale-105">
                  <div className="text-[11px] font-extrabold text-gray-900 dark:text-white">
                    {language === 'ru' ? lm.nameRu : lm.nameEs}
                  </div>
                  <div className="text-[9px] font-semibold text-purple-600 dark:text-purple-400">
                    Глава {lm.order} {isStoryDone ? '✓' : ''}
                  </div>
                </div>

                {/* Mateo Character positioned on Active Station */}
                {isCurrent && (
                  <div className="absolute -top-24 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-bounce">
                    <div className="bg-white/95 dark:bg-gray-800/95 px-3 py-1 rounded-2xl shadow-lg border border-amber-300 text-[10px] font-black text-amber-900 dark:text-amber-200 whitespace-nowrap mb-1">
                      📍 Я здесь! 🦫
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overarching Story Banner at bottom of map */}
        <div className="mt-4 p-4 rounded-3xl bg-white/85 dark:bg-gray-800/85 backdrop-blur-md border border-purple-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl shadow-md text-white">
              🦫
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Сквозной сюжет • 9 Глав по Буэнос-Айресу
              </div>
              <div className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white">
                {currentStation ? `Глава ${currentStation.order}: ${currentStation.storyTitle}` : "Приключения Матео"}
              </div>
            </div>
          </div>

          {currentStation && storyData && (
            <button
              onClick={() => {
                const chap = storyData.chapters.find(c => c.id === currentStation.chapterId) || storyData.chapters[0];
                setActiveStoryChapter(chap);
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-fuchsia-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center gap-2 self-stretch sm:self-auto justify-center"
            >
              <BookOpen className="w-4 h-4" />
              <span>Читать сюжет главы {currentStation.order}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Station Detail Modal on Click */}
      {selectedStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white dark:bg-gray-850 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-purple-100 dark:border-gray-700 relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-3xl shadow-md">
                  {selectedStation.landmarkEmoji}
                </div>
                <div>
                  <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                    Станция №{selectedStation.order}
                  </div>
                  <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
                    {language === 'ru' ? selectedStation.nameRu : selectedStation.nameEs}
                  </h3>
                  <div className="text-xs text-gray-500">
                    Тема: {selectedStation.topicName}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedStation(null)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-6 bg-purple-50/50 dark:bg-gray-800 p-3.5 rounded-2xl border border-purple-100 dark:border-gray-700 leading-relaxed">
              {selectedStation.description}
            </p>

            <div className="space-y-3">
              {/* Button: Read Story Chapter */}
              {storyData && (
                <button
                  onClick={() => {
                    const chap = storyData.chapters.find(c => c.id === selectedStation.chapterId);
                    if (chap) {
                      setActiveStoryChapter(chap);
                      setSelectedStation(null);
                    }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold rounded-2xl shadow-md transition-transform active:scale-95 flex items-center justify-center space-x-2 text-xs sm:text-sm"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>📖 Читать сюжет главы {selectedStation.order}</span>
                </button>
              )}

              {/* Button: Open Theory Modal */}
              {selectedStation.topic && (
                <button
                  onClick={() => {
                    if (onSelectTopicForPractice) {
                      onSelectTopicForPractice(selectedStation.topic);
                      setSelectedStation(null);
                    }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold rounded-2xl shadow-md transition-transform active:scale-95 flex items-center justify-center space-x-2 text-xs sm:text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>📝 Открыть теорию и квиз по теме</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Sandwich Story Reader Modal */}
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
