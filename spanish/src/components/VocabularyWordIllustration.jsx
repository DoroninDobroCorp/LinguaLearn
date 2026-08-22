import React from 'react';
import { Volume2 } from 'lucide-react';
import { speakSpanish } from '../utils/soundEffects';

// Smart visual mapping for Spanish vocabulary
export function getWordVisualMeta(word, translation) {
  const normW = (word || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normT = (translation || '').toLowerCase();

  // Greetings & Time of day
  if (normW.includes('buenos dias') || normT.includes('утро')) {
    return {
      emoji: '🌅',
      gradient: 'from-amber-400 via-orange-400 to-yellow-300',
      bgCard: 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      tag: 'Утреннее приветствие',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('buenas tardes') || normT.includes('день')) {
    return {
      emoji: '☀️',
      gradient: 'from-orange-400 via-amber-500 to-rose-400',
      bgCard: 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
      tag: 'Дневное приветствие',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('buenas noches') || normT.includes('вечер') || normT.includes('ноч')) {
    return {
      emoji: '🌙',
      gradient: 'from-indigo-600 via-purple-700 to-slate-800',
      bgCard: 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
      tag: 'Вечер / Ночь',
      mateoMood: 'calm'
    };
  }
  if (normW.includes('hola') || normT.includes('привет') || normT.includes('здравствуй')) {
    return {
      emoji: '👋',
      gradient: 'from-fuchsia-500 via-purple-600 to-indigo-600',
      bgCard: 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
      tag: 'Универсальное приветствие',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('adios') || normW.includes('hasta') || normT.includes('пока') || normT.includes('до ')) {
    return {
      emoji: '🤝',
      gradient: 'from-teal-400 via-cyan-500 to-blue-600',
      bgCard: 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',
      tag: 'Прощание / До встречи',
      mateoMood: 'guiding'
    };
  }
  if (normW.includes('llamo') || normW.includes('nombre') || normT.includes('зовут') || normT.includes('имя')) {
    return {
      emoji: '📇',
      gradient: 'from-purple-500 via-pink-500 to-rose-500',
      bgCard: 'bg-pink-50/80 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800',
      tag: 'Знакомство / Имя',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('gracias') || normT.includes('спасибо')) {
    return {
      emoji: '🙏',
      gradient: 'from-emerald-400 via-green-500 to-teal-600',
      bgCard: 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      tag: 'Формула вежливости',
      mateoMood: 'celebrating'
    };
  }
  if (normW.includes('favor') || normT.includes('пожалуйста')) {
    return {
      emoji: '🤲',
      gradient: 'from-sky-400 via-blue-500 to-indigo-500',
      bgCard: 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
      tag: 'Вежливая просьба',
      mateoMood: 'guiding'
    };
  }
  if (normW.includes('como estas') || normW.includes('que tal') || normT.includes('как дела')) {
    return {
      emoji: '💬',
      gradient: 'from-cyan-400 via-teal-500 to-blue-500',
      bgCard: 'bg-cyan-50/80 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800',
      tag: 'Вопрос о самочувствии',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('soy de') || normT.includes('из ')) {
    return {
      emoji: '🌎',
      gradient: 'from-blue-500 via-indigo-600 to-purple-600',
      bgCard: 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
      tag: 'Происхождение / Страна',
      mateoMood: 'guiding'
    };
  }
  if (normW.includes('gusto') || normW.includes('encantado') || normT.includes('приятно')) {
    return {
      emoji: '💖',
      gradient: 'from-rose-400 via-pink-500 to-fuchsia-500',
      bgCard: 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
      tag: 'Радость знакомства',
      mateoMood: 'celebrating'
    };
  }
  if (normW.includes('sol') || normT.includes('солн')) {
    return {
      emoji: '☀️',
      gradient: 'from-amber-400 via-yellow-400 to-orange-500',
      bgCard: 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      tag: 'Погода / Природа',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('hermano') || normW.includes('familia') || normT.includes('брат') || normT.includes('семь')) {
    return {
      emoji: '👨‍👩‍👦',
      gradient: 'from-orange-400 via-amber-500 to-rose-400',
      bgCard: 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
      tag: 'Семья / Родственники',
      mateoMood: 'happy'
    };
  }
  if (normW.includes('opinion') || normT.includes('мнение')) {
    return {
      emoji: '💡',
      gradient: 'from-purple-400 via-indigo-500 to-blue-500',
      bgCard: 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
      tag: 'Мысли / Мнение',
      mateoMood: 'thinking'
    };
  }

  // General default fallback
  return {
    emoji: '📇',
    gradient: 'from-purple-500 via-fuchsia-500 to-indigo-600',
    bgCard: 'bg-purple-50/70 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
    tag: 'Слово темы',
    mateoMood: 'guiding'
  };
}

export default function VocabularyWordIllustration({
  word = '',
  translation = '',
  example = '',
  exampleTranslation = '',
  partOfSpeech = '',
  overallIndex = 1,
  totalWords = 10,
  className = ''
}) {
  const meta = getWordVisualMeta(word, translation);

  return (
    <div className={`p-6 sm:p-8 rounded-3xl ${meta.bgCard} border-2 shadow-xl relative overflow-hidden text-center transition-all ${className}`}>
      {/* Background ambient glowing gradient circle */}
      <div className={`absolute -right-8 -top-8 w-36 h-36 rounded-full bg-gradient-to-br ${meta.gradient} opacity-20 blur-2xl pointer-events-none`} />

      {/* Top Tag & Audio Button */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm text-xs font-black text-gray-800 dark:text-gray-100">
          <span>{meta.emoji}</span>
          <span>{meta.tag}</span>
          <span className="opacity-50 text-[10px]">({overallIndex}/{totalWords})</span>
        </div>

        <button
          onClick={() => speakSpanish(word)}
          className="p-3 rounded-2xl bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-300 shadow-md hover:scale-105 active:scale-95 transition-all border border-purple-100 dark:border-gray-600 flex items-center gap-1.5"
          title="Озвучить слово"
        >
          <Volume2 className="w-5 h-5" />
          <span className="text-xs font-bold hidden sm:inline">Слушать</span>
        </button>
      </div>

      {/* Center Illustrated Mascot Icon Banner */}
      <div className="my-3 flex items-center justify-center gap-4 relative z-10">
        {/* Animated Mascot Head with contextual mood */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-200 via-orange-300 to-amber-400 dark:from-amber-700 dark:via-orange-800 dark:to-amber-900 border-2 border-amber-400 dark:border-amber-600 shadow-lg flex items-center justify-center relative overflow-hidden transform hover:rotate-3 transition-transform">
          <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] drop-shadow">
            <path d="M 25 35 Q 50 15 75 35 Q 85 45 65 42 Q 50 40 35 42 Z" fill="#4f46e5" stroke="#3730a3" strokeWidth="2" />
            <circle cx="50" cy="22" r="3.5" fill="#facc15" />
            <rect x="25" y="38" width="50" height="42" rx="18" fill="#b45309" />
            <rect x="32" y="52" width="36" height="25" rx="10" fill="#d97706" />
            <circle cx="28" cy="38" r="7" fill="#92400e" />
            <circle cx="28" cy="38" r="4" fill="#fcd34d" />
            <circle cx="72" cy="38" r="7" fill="#92400e" />
            <circle cx="72" cy="38" r="4" fill="#fcd34d" />
            <ellipse cx="38" cy="48" rx="3.5" ry="4" fill="#1e293b" />
            <circle cx="37" cy="46.5" r="1.2" fill="#ffffff" />
            <ellipse cx="62" cy="48" rx="3.5" ry="4" fill="#1e293b" />
            <circle cx="61" cy="46.5" r="1.2" fill="#ffffff" />
            <ellipse cx="50" cy="58" rx="6" ry="4" fill="#451a03" />
            <path d="M 46 64 Q 50 67 54 64" fill="none" stroke="#451a03" strokeWidth="2" strokeLinecap="round" />
            <circle cx="34" cy="56" r="3.5" fill="#f87171" opacity="0.6" />
            <circle cx="66" cy="56" r="3.5" fill="#f87171" opacity="0.6" />
          </svg>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 rounded-full border border-purple-200 flex items-center justify-center text-xs shadow">
            {meta.emoji}
          </div>
        </div>
      </div>

      {/* Large Spanish Word */}
      <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-2 tracking-tight relative z-10">
        {word}
      </h2>

      {/* Russian Translation */}
      <p className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mb-5 relative z-10">
        {translation}
      </p>

      {/* Example Speech Box */}
      {example && (
        <div className="p-4 rounded-2xl bg-white/95 dark:bg-gray-800/95 border border-purple-100 dark:border-gray-700 text-left shadow-sm relative z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-gray-100">
                «{example}»
              </p>
              {exampleTranslation && (
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 italic">
                  {exampleTranslation}
                </p>
              )}
            </div>
            <button
              onClick={() => speakSpanish(example)}
              className="p-1.5 rounded-xl text-purple-500 hover:bg-purple-50 dark:hover:bg-gray-700 transition-all flex-shrink-0"
              title="Озвучить пример"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
