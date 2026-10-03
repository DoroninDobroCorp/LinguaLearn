import React, { useState, useEffect } from 'react';
import { getWordVisualMeta } from '../utils/wordVisuals';

// Dedicated SVG vector illustrations for thematic kinds
function ThematicSvgScene({ kind, accent = '#6366f1' }) {
  switch (kind) {
    case 'house':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Sun */}
          <circle cx="85" cy="18" r="8" fill="#fde047" />
          {/* Ground */}
          <path d="M 5 72 Q 50 68 95 72" stroke="#86efac" strokeWidth="6" strokeLinecap="round" />
          {/* House body */}
          <rect x="25" y="32" width="50" height="38" rx="4" fill="#fed7aa" stroke="#ea580c" strokeWidth="2.5" />
          {/* Roof */}
          <polygon points="18,34 50,12 82,34" fill="#f87171" stroke="#dc2626" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Chimney */}
          <rect x="65" y="16" width="8" height="12" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" />
          {/* Door */}
          <rect x="42" y="46" width="16" height="24" rx="2" fill="#ca8a04" stroke="#854d0e" strokeWidth="2" />
          <circle cx="54" cy="58" r="1.5" fill="#fef08a" />
          {/* Window */}
          <rect x="30" y="40" width="12" height="12" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
          <line x1="36" y1="40" x2="36" y2="52" stroke="#0284c7" strokeWidth="1" />
          <line x1="30" y1="46" x2="42" y2="46" stroke="#0284c7" strokeWidth="1" />
        </svg>
      );

    case 'apple':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Leaf */}
          <path d="M 52 14 C 62 8 68 18 64 22 C 56 22 52 18 52 14 Z" fill="#22c55e" stroke="#15803d" strokeWidth="1.5" />
          {/* Stem */}
          <path d="M 50 24 C 52 18 48 10 44 8" fill="none" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          {/* Apple shape */}
          <path
            d="M 50 26 C 42 22 26 24 22 38 C 17 56 34 72 50 70 C 66 72 83 56 78 38 C 74 24 58 22 50 26 Z"
            fill="#ef4444"
            stroke="#b91c1c"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Shine highlight */}
          <path d="M 32 34 C 28 40 28 50 32 54" fill="none" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    case 'soccer_ball':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Grass */}
          <path d="M 15 72 Q 50 68 85 72" stroke="#86efac" strokeWidth="5" strokeLinecap="round" />
          {/* Ball outer */}
          <circle cx="50" cy="40" r="26" fill="#f8fafc" stroke="#1e293b" strokeWidth="3" />
          {/* Center pentagon */}
          <polygon points="50,33 58,38 55,47 45,47 42,38" fill="#1e293b" />
          {/* Seams */}
          <line x1="50" y1="33" x2="50" y2="20" stroke="#1e293b" strokeWidth="2" />
          <line x1="58" y1="38" x2="70" y2="33" stroke="#1e293b" strokeWidth="2" />
          <line x1="55" y1="47" x2="65" y2="57" stroke="#1e293b" strokeWidth="2" />
          <line x1="45" y1="47" x2="35" y2="57" stroke="#1e293b" strokeWidth="2" />
          <line x1="42" y1="38" x2="30" y2="33" stroke="#1e293b" strokeWidth="2" />
          {/* Motion lines */}
          <path d="M 18 28 Q 12 34 16 44" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'backpack':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Handle */}
          <path d="M 40 24 C 40 14 60 14 60 24" fill="none" stroke="#4338ca" strokeWidth="3.5" strokeLinecap="round" />
          {/* Main body */}
          <rect x="28" y="22" width="44" height="48" rx="10" fill="#6366f1" stroke="#3730a3" strokeWidth="2.5" />
          {/* Front pocket */}
          <rect x="34" y="44" width="32" height="20" rx="6" fill="#818cf8" stroke="#3730a3" strokeWidth="2" />
          <circle cx="50" cy="50" r="2.5" fill="#facc15" />
          {/* Side straps */}
          <line x1="28" y1="36" x2="24" y2="48" stroke="#4338ca" strokeWidth="3" strokeLinecap="round" />
          <line x1="72" y1="36" x2="76" y2="48" stroke="#4338ca" strokeWidth="3" strokeLinecap="round" />
          {/* Zipper accent */}
          <line x1="36" y1="32" x2="64" y2="32" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="2 2" strokeLinecap="round" />
        </svg>
      );

    case 'pencil':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Eraser */}
          <rect x="20" y="32" width="12" height="16" rx="3" fill="#f43f5e" stroke="#be123c" strokeWidth="2" />
          {/* Metal band */}
          <rect x="32" y="32" width="6" height="16" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
          {/* Pencil body */}
          <rect x="38" y="32" width="34" height="16" fill="#facc15" stroke="#b45309" strokeWidth="2" />
          <line x1="38" y1="37" x2="72" y2="37" stroke="#eab308" strokeWidth="1.5" />
          <line x1="38" y1="43" x2="72" y2="43" stroke="#eab308" strokeWidth="1.5" />
          {/* Wood cone */}
          <polygon points="72,32 86,40 72,48" fill="#fde68a" stroke="#b45309" strokeWidth="2" />
          {/* Graphite tip */}
          <polygon points="81,37 87,40 81,43" fill="#334155" />
        </svg>
      );

    case 'water_glass':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Glass cup */}
          <polygon points="34,18 66,18 61,68 39,68" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Water content */}
          <polygon points="36,32 64,32 60,66 40,66" fill="#38bdf8" opacity="0.85" />
          {/* Wave ripple */}
          <path d="M 36 32 Q 50 36 64 32" stroke="#bae6fd" strokeWidth="2" fill="none" />
          {/* Water drops */}
          <circle cx="70" cy="22" r="3" fill="#0ea5e9" />
          <circle cx="76" cy="30" r="2" fill="#38bdf8" />
          {/* Sparkle */}
          <path d="M 44 44 L 46 48 L 44 52 L 42 48 Z" fill="#ffffff" />
        </svg>
      );

    case 'croissant':
    case 'alfajor':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Bottom cookie layer */}
          <ellipse cx="50" cy="46" rx="28" ry="12" fill="#d97706" stroke="#92400e" strokeWidth="2.5" />
          {/* Dulce de leche filling */}
          <ellipse cx="50" cy="40" rx="27" ry="10" fill="#78350f" stroke="#451a03" strokeWidth="2" />
          {/* Top cookie layer */}
          <ellipse cx="50" cy="34" rx="28" ry="12" fill="#f59e0b" stroke="#b45309" strokeWidth="2.5" />
          {/* Coconut sprinkles / dots on top */}
          <circle cx="42" cy="32" r="1.5" fill="#fef3c7" />
          <circle cx="50" cy="30" r="1.5" fill="#fef3c7" />
          <circle cx="58" cy="32" r="1.5" fill="#fef3c7" />
          <circle cx="46" cy="36" r="1.5" fill="#fef3c7" />
          <circle cx="54" cy="36" r="1.5" fill="#fef3c7" />
        </svg>
      );

    case 'swings':
    case 'playground_slide':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Swing frame */}
          <line x1="20" y1="70" x2="35" y2="15" stroke="#4b5563" strokeWidth="3" strokeLinecap="round" />
          <line x1="50" y1="70" x2="35" y2="15" stroke="#4b5563" strokeWidth="3" strokeLinecap="round" />
          <line x1="80" y1="70" x2="65" y2="15" stroke="#4b5563" strokeWidth="3" strokeLinecap="round" />
          <line x1="30" y1="15" x2="70" y2="15" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
          {/* Chains */}
          <line x1="44" y1="15" x2="44" y2="52" stroke="#9ca3af" strokeWidth="1.5" />
          <line x1="56" y1="15" x2="56" y2="52" stroke="#9ca3af" strokeWidth="1.5" />
          {/* Swing seat */}
          <rect x="40" y="52" width="20" height="5" rx="2" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" />
          {/* Ground */}
          <path d="M 10 70 Q 50 68 90 70" stroke="#86efac" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );

    case 'sun':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Sun core */}
          <circle cx="50" cy="40" r="18" fill="#facc15" stroke="#ea580c" strokeWidth="2.5" />
          {/* Smiling face */}
          <circle cx="44" cy="37" r="2" fill="#78350f" />
          <circle cx="56" cy="37" r="2" fill="#78350f" />
          <path d="M 45 44 Q 50 49 55 44" fill="none" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
          {/* Cheeks */}
          <circle cx="41" cy="41" r="2" fill="#f87171" opacity="0.6" />
          <circle cx="59" cy="41" r="2" fill="#f87171" opacity="0.6" />
          {/* Rays */}
          <line x1="50" y1="14" x2="50" y2="8" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="50" y1="66" x2="50" y2="72" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="24" y1="40" x2="18" y2="40" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="76" y1="40" x2="82" y2="40" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="32" y1="22" x2="28" y2="18" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
          <line x1="68" y1="58" x2="72" y2="62" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
          <line x1="68" y1="22" x2="72" y2="18" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
          <line x1="32" y1="58" x2="28" y2="62" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    case 'dog':
    case 'cat':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Ears */}
          <polygon points="32,32 38,15 48,28" fill="#f59e0b" stroke="#b45309" strokeWidth="2" strokeLinejoin="round" />
          <polygon points="68,32 62,15 52,28" fill="#f59e0b" stroke="#b45309" strokeWidth="2" strokeLinejoin="round" />
          {/* Head */}
          <circle cx="50" cy="44" r="22" fill="#fbbf24" stroke="#b45309" strokeWidth="2.5" />
          {/* Eyes */}
          <ellipse cx="42" cy="40" rx="3" ry="3.5" fill="#1e293b" />
          <circle cx="41" cy="38.5" r="1" fill="#ffffff" />
          <ellipse cx="58" cy="40" rx="3" ry="3.5" fill="#1e293b" />
          <circle cx="57" cy="38.5" r="1" fill="#ffffff" />
          {/* Snout */}
          <ellipse cx="50" cy="50" rx="6" ry="4.5" fill="#fef3c7" />
          <polygon points="48,48 52,48 50,51" fill="#78350f" />
          <path d="M 48 52 Q 50 55 52 52" fill="none" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
          {/* Cheeks */}
          <circle cx="36" cy="46" r="2.5" fill="#f87171" opacity="0.5" />
          <circle cx="64" cy="46" r="2.5" fill="#f87171" opacity="0.5" />
        </svg>
      );

    case 'bed':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Headboard */}
          <rect x="18" y="24" width="10" height="46" rx="3" fill="#854d0e" stroke="#713f12" strokeWidth="2" />
          {/* Footboard */}
          <rect x="74" y="40" width="8" height="30" rx="2" fill="#854d0e" stroke="#713f12" strokeWidth="2" />
          {/* Mattress */}
          <rect x="26" y="44" width="50" height="16" rx="4" fill="#6366f1" stroke="#3730a3" strokeWidth="2" />
          {/* Pillow */}
          <rect x="28" y="36" width="14" height="10" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
          {/* Blanket folded */}
          <path d="M 44 44 L 76 44 L 76 60 L 44 60 Z" fill="#ec4899" stroke="#be185d" strokeWidth="1.5" />
        </svg>
      );

    case 'car':
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          {/* Road */}
          <path d="M 8 68 L 92 68" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
          {/* Cabin */}
          <path d="M 32 36 L 44 22 L 68 22 L 78 36 Z" fill="#bae6fd" stroke="#0284c7" strokeWidth="2" />
          {/* Car body */}
          <path
            d="M 18 48 C 18 40 24 36 32 36 L 78 36 C 86 36 90 40 90 48 L 90 56 C 90 58 88 60 86 60 L 18 60 Z"
            fill="#ef4444"
            stroke="#b91c1c"
            strokeWidth="2.5"
          />
          {/* Wheels */}
          <circle cx="34" cy="60" r="8" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          <circle cx="34" cy="60" r="3" fill="#f8fafc" />
          <circle cx="74" cy="60" r="8" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          <circle cx="74" cy="60" r="3" fill="#f8fafc" />
          {/* Headlight */}
          <circle cx="87" cy="46" r="3" fill="#fef08a" />
        </svg>
      );

    default:
      // Playful abstract mascot with spark
      return (
        <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-sm">
          <circle cx="50" cy="40" r="22" fill="#f1f5f9" stroke={accent} strokeWidth="3" />
          <circle cx="43" cy="36" r="2.5" fill="#1e293b" />
          <circle cx="57" cy="36" r="2.5" fill="#1e293b" />
          <path d="M 44 44 Q 50 49 56 44" fill="none" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="38" cy="42" r="2" fill="#f87171" opacity="0.6" />
          <circle cx="62" cy="42" r="2" fill="#f87171" opacity="0.6" />
          {/* Sparkles */}
          <path d="M 74 18 L 76 22 L 80 24 L 76 26 L 74 30 L 72 26 L 68 24 L 72 22 Z" fill="#fbbf24" />
          <circle cx="26" cy="24" r="2" fill="#38bdf8" />
        </svg>
      );
  }
}

export function detectMediaType(url = '') {
  if (!url || typeof url !== 'string') return 'none';
  const clean = url.trim().toLowerCase();
  if (
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.mov') ||
    clean.startsWith('data:video/')
  ) {
    return 'video';
  }
  if (clean.endsWith('.gif')) {
    return 'gif';
  }
  if (clean.endsWith('.swf') || clean.includes('shockwave-flash')) {
    return 'flash';
  }
  if (clean.includes('youtube.com/embed/') || clean.includes('youtu.be/')) {
    return 'youtube';
  }
  return 'image';
}

function MediaRenderer({ url, word, onError, className = '' }) {
  const type = detectMediaType(url);

  if (type === 'video') {
    return (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/5">
        <video
          src={url}
          autoPlay
          loop
          muted
          playsInline
          onError={onError}
          className={`max-w-full max-h-full w-auto h-auto object-contain rounded-xl ${className}`}
        />
      </div>
    );
  }

  if (type === 'flash') {
    return (
      <div className={`w-full h-full relative rounded-xl overflow-hidden bg-slate-900/10 flex items-center justify-center ${className}`}>
        <embed
          src={url}
          type="application/x-shockwave-flash"
          width="100%"
          height="100%"
          className="w-full h-full object-contain rounded-xl"
        />
      </div>
    );
  }

  if (type === 'youtube') {
    let embedUrl = url;
    if (url.includes('youtu.be/')) {
      const vidId = url.split('youtu.be/')[1].split('?')[0];
      embedUrl = `https://www.youtube.com/embed/${vidId}?autoplay=1&mute=1&loop=1&playlist=${vidId}`;
    }
    return (
      <iframe
        src={embedUrl}
        title={word}
        frameBorder="0"
        allow="autoplay; encrypted-media"
        className={`w-full h-full object-contain rounded-xl ${className}`}
      />
    );
  }

  // Standard Image or GIF: 100% visible without cropping (object-contain) + soft blurred ambient backdrop
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-2xl">
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover blur-xl opacity-30 scale-110 pointer-events-none select-none"
      />
      <img
        src={url}
        alt={word}
        onError={onError}
        className={`relative z-10 max-w-full max-h-full w-auto h-auto object-contain rounded-xl shadow-xs ${className}`}
      />
    </div>
  );
}

export default function WordIllustration({
  word = '',
  translation = '',
  imageUrl = null,
  size = 'md', // 'sm' | 'md' | 'lg'
  showTag = true,
  className = ''
}) {
  const currentKey = `${imageUrl || ''}:${word}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  const [imageError, setImageError] = useState(false);

  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setImageError(false);
  }

  const meta = getWordVisualMeta(word, translation);
  const mediaType = imageUrl && !imageError ? detectMediaType(imageUrl) : 'none';

  // Thumbnail mode (for tables and lists: comfortable 56px to 80px on desktop)
  if (size === 'sm') {
    if (imageUrl && !imageError) {
      return (
        <div className={`w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-2xl overflow-hidden shadow-xs border border-purple-200 dark:border-purple-800 flex-shrink-0 relative ${className}`}>
          <MediaRenderer url={imageUrl} word={word} onError={() => setImageError(true)} />
          {mediaType === 'video' && (
            <span className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white px-1 rounded-md font-bold">▶</span>
          )}
          {mediaType === 'flash' && (
            <span className="absolute bottom-1 right-1 bg-amber-500 text-[9px] text-white px-1 rounded-md font-bold">⚡</span>
          )}
        </div>
      );
    }
    return (
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-xs flex items-center justify-center text-2xl lg:text-3xl flex-shrink-0 border border-white/40 select-none ${className}`}
        title={`${word} (${meta.tag})`}
      >
        <span>{meta.emoji}</span>
      </div>
    );
  }

  // Large Hero mode (for intros, study modals - extra generous on desktop)
  if (size === 'lg') {
    return (
      <div className={`w-full max-w-lg lg:max-w-3xl xl:max-w-4xl p-4 sm:p-6 lg:p-8 rounded-3xl ${meta.bgCard} border-2 shadow-md relative overflow-hidden text-center transition-all ${className}`}>
        {/* Glow circle */}
        <div className={`absolute -right-8 -top-8 w-48 h-48 rounded-full bg-gradient-to-br ${meta.gradient} opacity-25 blur-2xl pointer-events-none`} />

        {showTag && (
          <div className="flex items-center justify-center mb-3 relative z-10">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/95 dark:bg-gray-800/95 shadow-xs text-xs sm:text-sm font-black text-gray-800 dark:text-gray-100 border border-black/5">
              <span className="text-base">{meta.emoji}</span>
              <span>{meta.tag}</span>
              {mediaType === 'video' && <span className="text-xs text-purple-600 font-extrabold ml-1">🎬 Видео</span>}
              {mediaType === 'gif' && <span className="text-xs text-pink-600 font-extrabold ml-1">🎞️ GIF</span>}
              {mediaType === 'flash' && <span className="text-xs text-amber-600 font-extrabold ml-1">⚡ Flash</span>}
            </span>
          </div>
        )}

        <div className="w-full h-56 sm:h-72 md:h-80 lg:h-[420px] xl:h-[500px] 2xl:h-[560px] mx-auto my-1 flex items-center justify-center relative z-10 rounded-2xl overflow-hidden shadow-sm bg-black/5 dark:bg-white/5">
          {imageUrl && !imageError ? (
            <MediaRenderer url={imageUrl} word={word} onError={() => setImageError(true)} />
          ) : (
            <ThematicSvgScene kind={meta.svgKind} accent={meta.accentColor} />
          )}
        </div>
      </div>
    );
  }

  // Medium mode (optimized for Vocabulary Flashcards - bold, significantly enlarged on desktop for clear visual learning)
  return (
    <div className={`w-full max-w-[420px] sm:max-w-[500px] md:max-w-[600px] lg:max-w-[720px] xl:max-w-[800px] 2xl:max-w-[880px] p-3 sm:p-4 lg:p-6 rounded-3xl ${meta.bgCard} border-2 shadow-sm relative overflow-hidden text-center select-none transition-all ${className}`}>
      {/* Background glow */}
      <div className={`absolute -right-8 -top-8 w-44 h-44 rounded-full bg-gradient-to-br ${meta.gradient} opacity-25 blur-2xl pointer-events-none`} />

      {/* Top category chip */}
      {showTag && (
        <div className="flex items-center justify-center mb-2.5 relative z-10">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-gray-800/95 shadow-xs text-xs sm:text-sm font-extrabold text-gray-700 dark:text-gray-200 border border-black/5">
            <span className="text-sm sm:text-base">{meta.emoji}</span>
            <span className="truncate max-w-[320px]">{meta.tag}</span>
            {mediaType === 'video' && <span className="text-[10px] text-purple-600 font-black">🎬</span>}
            {mediaType === 'gif' && <span className="text-[10px] text-pink-600 font-black">🎞️</span>}
            {mediaType === 'flash' && <span className="text-[10px] text-amber-600 font-black">⚡</span>}
          </span>
        </div>
      )}

      {/* Center artwork / photo / video / flash (on the flashcard: up to 540px height on large desktop) */}
      <div className="w-full h-52 sm:h-64 md:h-80 lg:h-[400px] xl:h-[480px] 2xl:h-[540px] mx-auto flex items-center justify-center relative z-10 rounded-2xl overflow-hidden shadow-sm bg-black/5 dark:bg-white/5">
        {imageUrl && !imageError ? (
          <MediaRenderer url={imageUrl} word={word} onError={() => setImageError(true)} />
        ) : (
          <ThematicSvgScene kind={meta.svgKind} accent={meta.accentColor} />
        )}
      </div>
    </div>
  );
}
