import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Volume2, Square } from 'lucide-react';
import { diffWords } from '../../utils/coachApi';
import { useCoachSpeech } from '../../hooks/useCoachSpeech';

export const STATUS_LABELS = {
  active: { label: 'Нужно внимание', className: 'c-bg-bad' },
  improving: { label: 'Улучшается', className: 'c-bg-warn' },
  mastered: { label: 'Освоено', className: 'c-bg-good' },
};

export function CoachPage({ children, narrow = false }) {
  return (
    <div className={`mx-auto w-full ${narrow ? 'max-w-2xl' : 'max-w-5xl'} px-1 sm:px-2 py-3 sm:py-6 animate-fade-in`}>
      {children}
    </div>
  );
}

export function BackLink({ to = '/', label = 'Назад' }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-semibold c-muted hover:opacity-80 mb-3">
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}

export function Card({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`c-card rounded-2xl ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3 mt-7">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] c-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Spinner({ className = 'w-4 h-4' }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function TypingDots({ label }) {
  return (
    <span className="inline-flex items-center gap-2 c-muted text-sm">
      <span className="inline-flex gap-1">
        <span className="coach-dot w-1.5 h-1.5 rounded-full bg-current" />
        <span className="coach-dot w-1.5 h-1.5 rounded-full bg-current" />
        <span className="coach-dot w-1.5 h-1.5 rounded-full bg-current" />
      </span>
      {label}
    </span>
  );
}

export function ScoreBar({ score, size = 'md', tone }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const auto = value >= 85 ? 'good' : value >= 60 ? 'warn' : 'bad';
  const color = `var(--c-${tone || auto})`;
  return (
    <div className={`w-full rounded-full c-track overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, value)}%`, background: color }} />
    </div>
  );
}

export function StatusPill({ status }) {
  const meta = STATUS_LABELS[status] || STATUS_LABELS.active;
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.className}`}>{meta.label}</span>;
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="c-bg-bad rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2 whitespace-nowrap">
          Повторить
        </button>
      )}
    </div>
  );
}

/** Corrected sentence with removed words struck through and new words highlighted. */
export function CorrectionDiff({ original, corrected, className = '' }) {
  const parts = diffWords(original, corrected);
  return (
    <span className={`leading-relaxed ${className}`}>
      {parts.map((part, index) => {
        if (part.type === 'same') return <span key={index}>{part.text}</span>;
        if (part.type === 'del') return <span key={index} className="line-through c-bad opacity-70 mx-0.5">{part.text.trim()}</span>;
        return <span key={index} className="c-bg-good rounded px-1 mx-0.5 font-semibold">{part.text.trim()}</span>;
      })}
    </span>
  );
}

export function SpeakButton({ text, speechKey, voice, style, className = '', label }) {
  const { playingKey, status, play, stop } = useCoachSpeech();
  const key = speechKey || text;
  const isActive = playingKey === key;
  return (
    <button
      type="button"
      onClick={() => (isActive ? stop() : play(text, { key, voice, style }))}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold c-muted hover:opacity-80 ${className}`}
      aria-label={isActive ? 'Остановить' : 'Прослушать'}
    >
      {isActive && status === 'loading' ? <Spinner className="w-3.5 h-3.5" /> : isActive ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Сегодня, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${time}`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function plural(count, one, few, many) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function PartnerAvatar({ name = 'Lucía', size = 40, speaking = false }) {
  const initial = String(name).trim().charAt(0).toUpperCase() || 'L';
  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: size, height: size }}>
      {speaking && <span className="absolute inset-0 rounded-full coach-pulse" style={{ background: 'var(--c-accent)' }} />}
      <span
        className="relative inline-flex items-center justify-center rounded-full font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.42, background: 'linear-gradient(135deg, #c0369f 0%, #6d28d9 100%)' }}
      >
        {initial}
      </span>
    </span>
  );
}
