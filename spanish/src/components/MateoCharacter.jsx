import React from 'react';

export default function MateoCharacter({
  mood = 'guiding', // 'guiding' | 'happy' | 'thinking' | 'celebrating'
  speechText = null,
  size = 'md', // 'sm' | 'md' | 'lg'
  className = ''
}) {
  const sizeClasses = {
    sm: 'w-12 h-12 text-2xl',
    md: 'w-20 h-20 text-4xl',
    lg: 'w-28 h-28 text-5xl',
  };

  const moodEmojis = {
    guiding: '🧭',
    happy: '🧉',
    thinking: '💡',
    celebrating: '🎉',
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Mateo Avatar Illustration */}
      <div className={`relative flex-shrink-0 ${sizeClasses[size] || sizeClasses.md}`}>
        {/* Animated Capybara Badge */}
        <div className="w-full h-full rounded-3xl bg-gradient-to-br from-amber-200 via-orange-300 to-amber-400 dark:from-amber-700 dark:via-orange-800 dark:to-amber-900 border-2 border-amber-400 dark:border-amber-600 shadow-xl flex items-center justify-center relative overflow-hidden transform hover:scale-105 transition-transform">
          {/* Custom SVG Capybara face with beret and mate */}
          <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] drop-shadow-md">
            {/* Beret (Argentine Boina) */}
            <path d="M 25 35 Q 50 15 75 35 Q 85 45 65 42 Q 50 40 35 42 Z" fill="#4f46e5" stroke="#3730a3" strokeWidth="2" />
            <circle cx="50" cy="22" r="3.5" fill="#facc15" />

            {/* Capybara Head */}
            <rect x="25" y="38" width="50" height="42" rx="18" fill="#b45309" />
            {/* Snout / Muzzle */}
            <rect x="32" y="52" width="36" height="25" rx="10" fill="#d97706" />

            {/* Ears */}
            <circle cx="28" cy="38" r="7" fill="#92400e" />
            <circle cx="28" cy="38" r="4" fill="#fcd34d" />
            <circle cx="72" cy="38" r="7" fill="#92400e" />
            <circle cx="72" cy="38" r="4" fill="#fcd34d" />

            {/* Eyes */}
            <ellipse cx="38" cy="48" rx="3.5" ry="4" fill="#1e293b" />
            <circle cx="37" cy="46.5" r="1.2" fill="#ffffff" />
            <ellipse cx="62" cy="48" rx="3.5" ry="4" fill="#1e293b" />
            <circle cx="61" cy="46.5" r="1.2" fill="#ffffff" />

            {/* Cute Nose */}
            <ellipse cx="50" cy="58" rx="6" ry="4" fill="#451a03" />

            {/* Mouth */}
            <path d="M 46 64 Q 50 67 54 64" fill="none" stroke="#451a03" strokeWidth="2" strokeLinecap="round" />

            {/* Cheeks */}
            <circle cx="34" cy="56" r="3.5" fill="#f87171" opacity="0.6" />
            <circle cx="66" cy="56" r="3.5" fill="#f87171" opacity="0.6" />
          </svg>

          {/* Mood mini badge */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 rounded-full border border-purple-200 dark:border-gray-600 flex items-center justify-center text-xs shadow-md">
            {moodEmojis[mood] || '🧉'}
          </div>
        </div>
      </div>

      {/* Speech Bubble */}
      {speechText && (
        <div className="relative bg-white/95 dark:bg-gray-800/95 border-2 border-purple-200 dark:border-gray-700 rounded-2xl p-3.5 shadow-lg max-w-sm sm:max-w-md animate-fadeIn">
          {/* Bubble Tail */}
          <div className="absolute -left-2.5 top-5 w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-r-[10px] border-r-purple-200 dark:border-r-gray-700" />
          <div className="absolute -left-2 top-5 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[9px] border-r-white dark:border-r-gray-800" />

          <div className="flex items-center space-x-1.5 text-[11px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
            <span>Капибара Матео</span>
            <span className="opacity-60">• Твой гид</span>
          </div>
          <div className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 font-medium leading-relaxed">
            {speechText}
          </div>
        </div>
      )}
    </div>
  );
}
