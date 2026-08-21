import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles, Target, Brain, BookOpen, BookMarked, Flame,
  ArrowRight, CheckCircle2, Zap, Play, Trophy, Compass,
  MessageCircle, Map, ChevronRight, HelpCircle, Star
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { soundEngine } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';
import MateoCharacter from './MateoCharacter';

export default function TodayDashboard() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [recommendations, setRecommendations] = useState(null);
  const [a1Stats, setA1Stats] = useState({ mastered: 0, total: 30, percent: 0 });
  const [loading, setLoading] = useState(true);
  const [targetMinutes, setTargetMinutes] = useState(() => {
    const saved = Number(globalThis.localStorage?.getItem('spanish_daily_pace_minutes'));
    return [15, 30, 60].includes(saved) ? saved : 30;
  });

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl(`/spanish/api/recommendations/today?lang=${language}&minutes=${targetMinutes}`));
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data);
        if (data.course) {
          setA1Stats({
            mastered: data.course.masteredTopics,
            total: data.course.totalTopics,
            percent: data.course.overallPercent,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching today recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
    const handleUpdate = () => fetchRecommendations();
    window.addEventListener('gamification_updated', handleUpdate);
    return () => window.removeEventListener('gamification_updated', handleUpdate);
  }, [language, targetMinutes]);

  const gamification = recommendations?.gamification || {};
  const steps = recommendations?.steps || [];
  const dailyQuests = gamification?.dailyQuests || [];
  const primaryAction = recommendations?.primaryAction;
  const continueOptions = recommendations?.continueOptions || [];
  const plannedMinutes = recommendations?.plannedMinutes || targetMinutes;
  const remainingPercent = 100 - a1Stats.percent;

  const mateoSpeech = language === 'ru'
    ? `Я покажу лучший следующий шаг. План примерно на ${plannedMinutes} минут, но заниматься можно сколько угодно.`
    : language === 'es'
    ? `Te mostraré el siguiente mejor paso. El plan dura unos ${plannedMinutes} minutos, pero puedes seguir todo lo que quieras.`
    : `I’ll show your best next step. The plan is about ${plannedMinutes} minutes, with no daily limit.`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-8">
      {/* 1. Hero Banner with Mateo Character */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 bg-gradient-to-br from-white/90 via-purple-50/70 to-pink-50/70 dark:from-gray-850/90 dark:via-purple-950/30 dark:to-gray-850/90 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-gradient-to-br from-fuchsia-400 to-purple-600 rounded-full opacity-20 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Mateo Avatar + Greeting */}
          <div className="flex items-start sm:items-center space-x-4">
            <MateoCharacter
              mood="happy"
              speechText={mateoSpeech}
              size="md"
            />
          </div>

          {/* Quick Stats Widget */}
          <div className="flex items-center gap-3 self-start lg:self-auto bg-white/80 dark:bg-gray-800/80 p-3 rounded-2xl border border-purple-200 dark:border-gray-700 shadow-sm">
            <div className="text-center px-3 border-r border-purple-100 dark:border-gray-700">
              <div className="text-2xl font-black text-amber-500 flex items-center justify-center gap-1">
                <Flame className="w-5 h-5 fill-amber-500" />
                {gamification.streakDays || 1}
              </div>
              <div className="text-[10px] text-gray-500 uppercase font-bold">{t('today_streak', 'Дней')}</div>
            </div>

            <div className="text-center px-3 border-r border-purple-100 dark:border-gray-700">
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {gamification.xp || 100}
              </div>
              <div className="text-[10px] text-gray-500 uppercase font-bold">{t('today_xp', 'XP')}</div>
            </div>

            <div className="text-center px-3">
              <div className="text-2xl font-black text-fuchsia-500">
                Nv.{gamification.level || 1}
              </div>
              <div className="text-[10px] text-gray-500 uppercase font-bold">{t('today_level', 'Уровень')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. A1 Level Progress Roadmap Card */}
      <div className="glass-card rounded-3xl p-6 border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>{t('today_a1_progress_title', 'Прогресс уровня A1')}</span>
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mt-0.5">
              {a1Stats.percent}% {t('today_readiness', 'готовности к завершению')}
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({a1Stats.mastered} из {a1Stats.total} тем) • {language === 'ru' ? `Осталось ${remainingPercent}%` : `${remainingPercent}% remaining`}
              </span>
            </h3>
          </div>

          <Link
            to="/curriculum"
            className="px-4 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-xs rounded-xl shadow hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all flex items-center justify-center space-x-1.5 self-start sm:self-auto"
          >
            <Compass className="w-4 h-4" />
            <span>{t('today_a1_map_btn', 'Интерактивная карта A1')}</span>
          </Link>
        </div>

        {/* Progress Bar */}
        <div className="h-3.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden p-0.5 border border-purple-100 dark:border-gray-600 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-fuchsia-500 to-purple-600 rounded-full transition-all duration-700 shadow"
            style={{ width: `${Math.max(a1Stats.percent, 4)}%` }}
          />
        </div>
      </div>

      {/* 3. Flexible pace and the single best next action */}
      <div className="glass-card rounded-3xl p-5 border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-purple-600">Темп на сегодня</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Это ориентир, не лимит. Можно остановиться раньше или продолжать часами.</div>
          </div>
          <div className="flex gap-2" role="group" aria-label="Желаемая длительность занятия">
            {[15, 30, 60].map((minutes) => (
              <button key={minutes} onClick={() => { setTargetMinutes(minutes); globalThis.localStorage?.setItem('spanish_daily_pace_minutes', String(minutes)); }} className={`px-4 py-2 rounded-xl text-xs font-bold ${targetMinutes === minutes ? 'bg-purple-600 text-white' : 'bg-purple-50 dark:bg-gray-700 text-purple-700 dark:text-purple-200'}`}>
                {minutes} мин
              </button>
            ))}
          </div>
        </div>
        {primaryAction && (
          <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase font-black tracking-wider text-purple-100">Следующий лучший шаг</div>
              <div className="text-lg font-black mt-1">{primaryAction.titleRu}</div>
              <div className="text-xs text-purple-100 mt-1">{primaryAction.rationaleRu}</div>
            </div>
            <button onClick={() => navigate(primaryAction.actionUrl)} className="px-5 py-3 rounded-xl bg-white text-purple-700 font-black text-sm shadow whitespace-nowrap flex items-center gap-2 justify-center">
              Начать • ~{primaryAction.minutes} мин <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Статус «освоено» нельзя получить за один день: ранняя практика полезна, но зачёт удержания требует повторений в разные дни и минимум 14 дней.
        </div>
      </div>

      {/* Recommended route */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
            <Target className="w-6 h-6 text-fuchsia-500" />
            {t('today_recommended_title', 'Твой маршрут на сегодня')}
          </h2>
          <span className="text-xs text-purple-600 dark:text-purple-400 font-bold bg-purple-100 dark:bg-purple-900/60 px-3 py-1 rounded-full">
            ~{plannedMinutes} минут • без лимита
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {steps.map((step, idx) => {
            const isDone = Boolean(step.isCompleted);
            return (
              <div
                key={idx}
                className={`glass-card rounded-3xl p-6 border shadow-lg flex flex-col justify-between hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 group ${
                  isDone
                    ? 'bg-gradient-to-br from-green-50/90 via-emerald-50/80 to-white/90 dark:from-emerald-950/40 dark:via-gray-800/90 dark:to-gray-800/90 border-green-300 dark:border-green-700 shadow-green-500/10'
                    : 'bg-white/85 dark:bg-gray-800/85 border-purple-100 dark:border-gray-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-2xl text-white font-extrabold text-xl flex items-center justify-center shadow-md ${
                      isDone ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-fuchsia-500 to-purple-600'
                    }`}>
                      {step.emoji}
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                      isDone
                        ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700 flex items-center gap-1'
                        : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    }`}>
                      {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                      <span>{isDone ? '✓ Выполнено' : step.tag}</span>
                    </span>
                  </div>

                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    {t('today_step_prefix', 'Шаг')} {step.stepNumber}
                  </div>
                  <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mb-4">
                    {step.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-purple-50 dark:border-gray-750">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-semibold mb-3">
                    <span className={isDone ? 'text-green-600 dark:text-green-400 font-bold' : 'text-purple-600 dark:text-purple-400 font-bold'}>
                      {isDone ? '✓ Зачтено (+XP)' : `+${step.xpReward} XP`}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isDone ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700'
                    }`}>
                      {step.badge}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      soundEngine.playTileClick();
                      navigate(step.actionUrl);
                    }}
                    className={`w-full py-2.5 font-bold rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center space-x-1.5 text-xs text-white ${
                      isDone
                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-green-500/20'
                        : 'bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 shadow-purple-500/20'
                    }`}
                  >
                    <span>{step.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {continueOptions.length > 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-purple-300 dark:border-purple-700 p-4">
            <div className="font-black text-sm text-gray-900 dark:text-white mb-2">Хочешь заниматься дальше?</div>
            <div className="flex flex-wrap gap-2">
              {continueOptions.map((action) => (
                <button key={`${action.kind}-${action.actionUrl}`} onClick={() => navigate(action.actionUrl)} className="px-3 py-2 rounded-xl bg-purple-50 dark:bg-gray-700 text-purple-700 dark:text-purple-200 text-xs font-bold hover:bg-purple-100">
                  {action.titleRu} • ~{action.minutes} мин
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Daily Quests Progress Card */}
      <div className="glass-card rounded-3xl p-6 border border-purple-100 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            {t('today_daily_quests', 'Миссии на сегодня')}
          </h3>
          <span className="text-xs text-gray-500 font-medium">
            {t('today_daily_quests_sub', 'Выполни все 3 для бонусного опыта')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {dailyQuests.map((q) => (
            <div
              key={q.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                q.isCompleted
                  ? 'bg-green-50/90 dark:bg-green-950/40 border-green-300 text-green-900 dark:text-green-200'
                  : 'bg-gray-50 dark:bg-gray-750 border-gray-200 dark:border-gray-600'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">{q.emoji}</span>
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white line-clamp-1">
                    {q.title}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {q.current}/{q.target} {q.isCompleted ? '✓' : ''}
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                +{q.rewardXp} XP
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Full Freedom: Explore by category */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-purple-600" />
            {t('today_explore_all', 'Все разделы для свободной практики')}
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { title: t('nav_stories', 'Истории'), desc: 'С выбором развилок', path: '/stories', emoji: '📖' },
            { title: t('quests_tab_roleplay', 'Квесты AI'), desc: 'Живые ситуации', path: '/chat', emoji: '🎭' },
            { title: t('nav_exercises', 'Тренажер'), desc: 'Speed Match & Фразы', path: '/exercises', emoji: '⚡' },
            { title: t('nav_vocabulary', 'Словарь'), desc: 'Интервальное повторение', path: '/vocabulary', emoji: '📇' },
            { title: t('nav_curriculum', 'Карта тем'), desc: 'A1-C2 и Экзамены', path: '/curriculum', emoji: '🗺️' },
            { title: 'Репетитор AI', desc: 'Чат без ограничений', path: '/chat', emoji: '🤖' }
          ].map((item, idx) => (
            <Link
              key={idx}
              to={item.path}
              className="glass-card rounded-2xl p-4 border border-purple-100 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 text-center group flex flex-col justify-between"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br mx-auto mb-2 flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
                {item.emoji}
              </div>
              <div className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-purple-600 transition-colors">
                {item.title}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {item.desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
