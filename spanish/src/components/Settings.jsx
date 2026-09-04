import React, { useState, useEffect } from 'react';
import { Save, Info, User, Globe, Moon, Sun, Wifi, CheckCircle2, Shield, Sparkles } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useProfile } from '../contexts/ProfileContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEVEL_DESCRIPTIONS = {
  'A1': 'Beginner - базовые фразы и простая грамматика',
  'A2': 'Elementary - простое повседневное общение',
  'B1': 'Intermediate - уверенный разговор на знакомые темы',
  'B2': 'Upper-Intermediate - беглая речь в большинстве ситуаций',
  'C1': 'Advanced - сложные тексты и спонтанная речь',
  'C2': 'Mastery - уровень носителя языка',
};

function Settings() {
  const [maxLevel, setMaxLevel] = useState('B2');
  const [saved, setSaved] = useState(false);
  const { profileId, profiles, activeProfile, switchProfile } = useProfile();
  const { language, setLanguage, t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/settings'));
      const data = await response.json();
      if (data?.max_level) {
        setMaxLevel(data.max_level);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      await profileFetch(profileApiUrl('/spanish/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxLevel }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-5 sm:p-8 border border-purple-100 dark:border-slate-700">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3">
          <span>⚙️</span>
          <span>{t('nav_settings', 'Настройки')}</span>
        </h2>

        <div className="space-y-6 sm:space-y-8">
          {/* 1. Profile section */}
          <div className="p-4 sm:p-5 rounded-2xl bg-fuchsia-50/70 dark:bg-fuchsia-950/30 border border-fuchsia-200 dark:border-fuchsia-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
                <User className="w-4 h-4" />
                <span>Профиль обучения</span>
              </div>
              <span className="text-xs bg-fuchsia-200 dark:bg-fuchsia-900 text-fuchsia-800 dark:text-fuchsia-200 px-2.5 py-0.5 rounded-full font-bold">
                Активен: {activeProfile?.name}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {profiles.map((p) => {
                const isActive = p.id === profileId;
                return (
                  <button
                    key={p.id}
                    onClick={() => switchProfile(p.id)}
                    className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md scale-105'
                        : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-purple-100 dark:border-slate-600 hover:bg-fuchsia-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    <span className="text-base">{p.avatar_emoji}</span>
                    <span>{p.name}</span>
                    {isActive && <CheckCircle2 className="w-3.5 h-3.5 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Language & Theme section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Interface Language */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600">
              <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3">
                <Globe className="w-4 h-4 text-purple-500" />
                <span>Язык интерфейса</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
                  { code: 'en', label: 'English', flag: '🇬🇧' },
                  { code: 'es', label: 'Español', flag: '🇪🇸' },
                ].map((opt) => (
                  <button
                    key={opt.code}
                    onClick={() => setLanguage(opt.code)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 ${
                      language === opt.code
                        ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm scale-105'
                        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-600 hover:bg-purple-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-base leading-none">{opt.flag}</span>
                    <span className="text-[11px]">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 flex flex-col justify-between">
              <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3">
                {isDark ? <Moon className="w-4 h-4 text-purple-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span>Тема оформления</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => isDark && toggleTheme()}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    !isDark
                      ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-600'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Светлая</span>
                </button>
                <button
                  onClick={() => !isDark && toggleTheme()}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    isDark
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-600'
                  }`}
                >
                  <Moon className="w-4 h-4 text-purple-300" />
                  <span>Тёмная</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Spanish Level */}
          <div>
            <label className="block text-base sm:text-lg font-bold text-gray-800 dark:text-white mb-1">
              Максимальный уровень испанского
            </label>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3">
              Темы выше этого уровня не будут появляться в тренировках.
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setMaxLevel(level)}
                  className={`py-2.5 px-3 rounded-xl font-black text-sm transition-all ${
                    maxLevel === level
                      ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md scale-105'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <div className="mt-3 p-3.5 bg-gradient-to-r from-pink-50 to-violet-50 dark:from-slate-700/60 dark:to-slate-700/60 rounded-xl border border-pink-200 dark:border-slate-600">
              <div className="flex items-start space-x-2.5">
                <Info className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-xs sm:text-sm text-fuchsia-900 dark:text-fuchsia-200">{maxLevel}</p>
                  <p className="text-xs text-fuchsia-800 dark:text-gray-300">{LEVEL_DESCRIPTIONS[maxLevel]}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Offline & PWA Info Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-2">
              <Wifi className="w-4 h-4" />
              <span>Офлайн-режим и PWA на iPhone</span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed">
              Приложение сохранено для автономной работы. Карточки слов (включая группу «Почти выучил»), спряжения глаголов и когнаты работают без интернета прямо с домашнего экрана телефона.
            </p>
          </div>

          {/* 5. Save Button */}
          <div className="flex items-center space-x-4 pt-2">
            <button
              onClick={saveSettings}
              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white rounded-xl transition-all shadow-md active:scale-95 font-bold text-sm"
            >
              <Save className="h-4 w-4" />
              <span>Сохранить настройки</span>
            </button>

            {saved && (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center gap-1 animate-fadeIn">
                ✓ Сохранено!
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
