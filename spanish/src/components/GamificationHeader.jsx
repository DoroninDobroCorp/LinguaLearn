import React, { useState, useEffect } from 'react';
import { Flame, Sparkles, Trophy, Award, X, CheckCircle2, ChevronRight } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';

export default function GamificationHeader() {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState(null);
  const [showQuestsModal, setShowQuestsModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await profileFetch(profileApiUrl(`/spanish/api/gamification?lang=${language}`));
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Error fetching gamification status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const handleUpdate = () => fetchStatus();
    window.addEventListener('gamification_updated', handleUpdate);
    return () => window.removeEventListener('gamification_updated', handleUpdate);
  }, [language]);

  if (loading || !status) return null;

  const completedQuestsCount = (status.dailyQuests || []).filter(q => q.isCompleted).length;
  const totalQuestsCount = (status.dailyQuests || []).length;

  return (
    <>
      <div className="flex items-center space-x-2 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-3 py-1 rounded-full border border-purple-200 dark:border-gray-700 shadow-sm text-xs font-bold">
        {/* Level Badge */}
        <div className="flex items-center space-x-1.5 text-purple-900 dark:text-purple-300">
          <span className="text-base">{status.emoji}</span>
          <span className="hidden md:inline">{status.title}</span>
          <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-md">
            Nv.{status.level}
          </span>
        </div>

        {/* XP Progress Bar */}
        <div className="hidden xl:flex items-center space-x-2 w-24">
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${status.progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
            {status.xp} XP
          </span>
        </div>

        {/* Streak Counter */}
        <div
          className="flex items-center space-x-1 text-amber-600 dark:text-amber-400 cursor-pointer hover:scale-105 transition-transform"
          title={`Racha actual: ${status.streakDays} días`}
          onClick={() => setShowQuestsModal(true)}
        >
          <Flame className="w-4 h-4 fill-amber-500 text-amber-500 animate-pulse" />
          <span>{status.streakDays}</span>
        </div>

        {/* Daily Quests Button */}
        <button
          onClick={() => setShowQuestsModal(true)}
          className="flex items-center space-x-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white px-2 py-0.5 rounded-full text-[11px] font-bold shadow transition-transform active:scale-95"
        >
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">{t('today_daily_quests', 'Миссии')}</span>
          <span className="bg-white/30 text-white px-1.5 py-0.2 rounded-full text-[9px]">
            {completedQuestsCount}/{totalQuestsCount}
          </span>
        </button>
      </div>

      {/* Daily Quests Modal */}
      {showQuestsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-purple-100 dark:border-gray-700 relative">
            <button
              onClick={() => setShowQuestsModal(false)}
              className="p-1.5 absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="flex items-center space-x-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl shadow-lg">
                {status.emoji}
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
                  {status.title} ({t('today_level', 'Уровень')} {status.level})
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {status.xpInCurrentLevel} / {status.xpRequiredForNext} XP до {status.nextTitle}
                </p>
              </div>
            </div>

            {/* XP Bar */}
            <div className="w-full bg-gray-100 dark:bg-gray-700 h-3 rounded-full overflow-hidden mb-6">
              <div
                className="bg-gradient-to-r from-amber-400 via-fuchsia-500 to-purple-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${status.progressPercent}%` }}
              />
            </div>

            {/* Daily Quests List */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 text-sm">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  {t('today_daily_quests', 'Миссии на сегодня')}
                </h4>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
                  Сброс в полночь
                </span>
              </div>

              {(status.dailyQuests || []).map((quest) => (
                <div
                  key={quest.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                    quest.isCompleted
                      ? 'bg-green-50/80 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-900 dark:text-green-200'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{quest.emoji}</span>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        {quest.title}
                        {quest.isCompleted && (
                          <span className="text-[10px] bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-300 px-1.5 py-0.5 rounded font-bold">
                            ✓ {language === 'ru' ? 'Выполнено' : 'Done'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {quest.description}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full">
                      +{quest.rewardXp} XP
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {quest.current}/{quest.target}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowQuestsModal(false)}
              className="w-full py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs"
            >
              {language === 'ru' ? 'Понятно, к занятиям! 🚀' : language === 'es' ? '¡Entendido! A practicar 🚀' : 'Got it! Lets practice 🚀'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
