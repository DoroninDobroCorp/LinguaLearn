import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Volume2, Sparkles, CheckCircle2, RotateCcw, ArrowRight, Users, UserCheck, Eye } from 'lucide-react';
import { speakSpanish, soundEngine } from '../../utils/soundEffects';
import { resolveVocabPhoto } from '../WordIllustration';
import {
  PART2_REMAINING_PRONOUNS,
  ENDING_CARDS,
  MAYA_REGULAR_VERBS,
  MAYA_SCENES,
  buildMayaLessonQuiz,
  buildMayaPart2Quiz,
  conjugateMayaVerb,
  getPersonTailMap,
  isMayaLessonAnswer,
} from '../../utils/mayaVerbLesson';

const STEPS_V1 = ['look', 'tails', 'play'];
const STEPS_V2 = ['cards', 'wheel', 'quiz'];

function SpeakButton({ text, label = 'Послушать', small = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        soundEngine.playTileClick();
        speakSpanish(text);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/95 font-bold text-fuchsia-700 shadow-sm ring-1 ring-fuchsia-200 hover:bg-fuchsia-50 active:scale-95 transition-all cursor-pointer ${
        small ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
      title="Нажми, чтобы послушать (можно нажимать повторно сколько угодно раз)"
    >
      <Volume2 className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      <span>{label}</span>
    </button>
  );
}

function VerbPhoto({ verb, className = '' }) {
  const src = resolveVocabPhoto(verb.photo || verb.infinitive);
  if (!src) {
    return <span className={`text-4xl ${className}`}>{verb.emoji}</span>;
  }
  return (
    <img
      src={src}
      alt={verb.translation}
      className={`rounded-2xl object-cover shadow-md ${className}`}
    />
  );
}

// Kid-friendly vector scenes illustrating who performs the action for each Argentine pronoun
function PronounKidSvg({ id }) {
  switch (id) {
    case 'yo':
      return (
        <svg viewBox="0 0 120 90" className="w-24 h-20 shrink-0 drop-shadow-sm">
          <circle cx="60" cy="45" r="38" fill="#fef3c7" stroke="#f59e0b" strokeWidth="3" />
          {/* Ponytail */}
          <circle cx="82" cy="28" r="10" fill="#451a03" />
          {/* Head */}
          <circle cx="60" cy="36" r="16" fill="#fed7aa" stroke="#9a3412" strokeWidth="2" />
          <circle cx="54" cy="34" r="2.2" fill="#1e293b" />
          <circle cx="66" cy="34" r="2.2" fill="#1e293b" />
          <path d="M 54 42 Q 60 47 66 42" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" />
          {/* Body & hand pointing to self */}
          <path d="M 42 74 C 42 56 78 56 78 74" fill="#fb7185" stroke="#be123c" strokeWidth="2" />
          <path d="M 35 60 Q 48 52 57 56" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
          <circle cx="58" cy="56" r="4" fill="#fed7aa" stroke="#9a3412" strokeWidth="1.5" />
        </svg>
      );
    case 'vos':
      return (
        <svg viewBox="0 0 120 90" className="w-24 h-20 shrink-0 drop-shadow-sm">
          <circle cx="60" cy="45" r="38" fill="#ffe4e6" stroke="#f43f5e" strokeWidth="3" />
          <circle cx="42" cy="38" r="14" fill="#fed7aa" stroke="#9a3412" strokeWidth="2" />
          <circle cx="82" cy="38" r="14" fill="#fde68a" stroke="#9a3412" strokeWidth="2" />
          <path d="M 37 42 Q 42 46 47 42" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
          <path d="M 77 42 Q 82 46 87 42" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
          {/* Arrow pointing to "vos" */}
          <path d="M 54 56 L 72 56" stroke="#e11d48" strokeWidth="4" strokeLinecap="round" />
          <polygon points="72,50 82,56 72,62" fill="#e11d48" />
        </svg>
      );
    case 'ella':
      return (
        <svg viewBox="0 0 120 90" className="w-24 h-20 shrink-0 drop-shadow-sm">
          <circle cx="60" cy="45" r="38" fill="#f3e8ff" stroke="#9333ea" strokeWidth="3" />
          {/* Boy (él) */}
          <circle cx="44" cy="38" r="13" fill="#fed7aa" stroke="#6b21a8" strokeWidth="2" />
          <path d="M 32 70 C 32 55 56 55 56 70" fill="#38bdf8" />
          {/* Girl (ella) */}
          <circle cx="78" cy="38" r="13" fill="#fed7aa" stroke="#6b21a8" strokeWidth="2" />
          <path d="M 66 70 C 66 55 90 55 90 70" fill="#f472b6" />
          <circle cx="90" cy="30" r="6" fill="#451a03" />
        </svg>
      );
    case 'nosotros':
      return (
        <svg viewBox="0 0 120 90" className="w-24 h-20 shrink-0 drop-shadow-sm">
          <circle cx="60" cy="45" r="38" fill="#d1fae5" stroke="#10b981" strokeWidth="3" />
          {/* Three kids hugging together */}
          <circle cx="38" cy="40" r="11" fill="#fed7aa" stroke="#065f46" strokeWidth="2" />
          <circle cx="60" cy="35" r="12" fill="#fed7aa" stroke="#065f46" strokeWidth="2" />
          <circle cx="82" cy="40" r="11" fill="#fed7aa" stroke="#065f46" strokeWidth="2" />
          <path d="M 26 70 Q 60 52 94 70" fill="#34d399" stroke="#047857" strokeWidth="2.5" />
          <path d="M 55 20 L 60 13 L 65 20" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case 'ustedes':
    default:
      return (
        <svg viewBox="0 0 120 90" className="w-24 h-20 shrink-0 drop-shadow-sm">
          <circle cx="60" cy="45" r="38" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
          {/* Group of friends on the right */}
          <circle cx="52" cy="36" r="10" fill="#fed7aa" stroke="#0369a1" strokeWidth="2" />
          <circle cx="70" cy="33" r="10" fill="#fed7aa" stroke="#0369a1" strokeWidth="2" />
          <circle cx="86" cy="38" r="10" fill="#fed7aa" stroke="#0369a1" strokeWidth="2" />
          <path d="M 42 68 C 42 54 96 54 96 68" fill="#38bdf8" stroke="#0369a1" strokeWidth="2" />
          {/* Pointing wave to the group */}
          <path d="M 24 52 L 40 46" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
  }
}

/* ============================================================================
 * VERSION 1: VOS + VIDEO (Original lesson)
 * ========================================================================== */

function LookStep({ onNext }) {
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-rose-100">
        <img
          src="/spanish/images/maya-verbs/hero.png"
          alt="Майя на солнечной площадке с тремя цветными шариками"
          className="h-64 w-full object-cover sm:h-80"
        />
        <div className="space-y-3 p-5 sm:p-6">
          <p className="text-sm font-black uppercase tracking-wide text-rose-500">Шаг 1 · Смотрим</p>
          <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">Глагол — это действие</h2>
          <p className="text-base leading-relaxed text-slate-700">
            Слова вроде <strong>jugar</strong>, <strong>comer</strong> и <strong>correr</strong> говорят, что кто-то делает.
            В Аргентине «ты» — это <strong>vos</strong>. Хвостик слова чуть меняется, а само действие остаётся.
          </p>
          <SpeakButton text="El verbo es una acción. Vos jugás, vos comés, vos corrés." label="Послушать правило" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {MAYA_SCENES.map((scene) => (
          <figure key={scene.id} className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-purple-100">
            <img src={scene.src} alt={scene.alt} className="h-52 w-full object-cover" />
            <figcaption className="flex flex-wrap gap-2 p-3">
              {scene.verbs.map((infinitive) => {
                const verb = MAYA_REGULAR_VERBS.find((item) => item.infinitive === infinitive);
                if (!verb) return null;
                return (
                  <button
                    key={infinitive}
                    type="button"
                    onClick={() => speakSpanish(verb.infinitive)}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-2 py-1 text-sm font-bold text-slate-800 ring-1 ring-slate-200 hover:bg-fuchsia-50 cursor-pointer"
                  >
                    <VerbPhoto verb={verb} className="h-8 w-8" />
                    <span>{verb.infinitive}</span>
                    <span className="font-medium text-slate-500">{verb.translation}</span>
                    <Volume2 className="h-3.5 w-3.5 text-fuchsia-600" />
                  </button>
                );
              })}
            </figcaption>
          </figure>
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 py-3 text-lg font-black text-white shadow-lg cursor-pointer"
      >
        Дальше: три хвостика <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function TailsStep({ onNext, onBack }) {
  const [openId, setOpenId] = useState('ar');
  const open = ENDING_CARDS.find((card) => card.id === openId) || ENDING_CARDS[0];
  const samples = MAYA_REGULAR_VERBS.filter((verb) => verb.ending === open.id);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-5 shadow-xl ring-1 ring-purple-100 sm:p-6">
        <p className="text-sm font-black uppercase tracking-wide text-purple-500">Шаг 2 · Три хвостика для vos</p>
        <h2 className="mt-1 text-2xl font-black text-slate-900">Смотри на последние две буквы</h2>
        <p className="mt-2 text-slate-700">
          В Буэнос-Айресе говорят <strong>vos jugás</strong>, не «tú juegas». Ударение на последнем слоге — это и есть аргентинский хвостик.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl bg-slate-900">
          <video
            key="maya-verb-explainer"
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
            poster="/spanish/images/maya-verbs/hero.png"
          >
            <source src="/spanish/videos/maya-verb-endings-explainer.mp4" type="video/mp4" />
          </video>
          <p className="px-4 py-3 text-sm text-slate-200">
            Короткое видео без букв: коралловый шарик — jugar, голубой — comer, зелёный — correr.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {ENDING_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              soundEngine.playTileClick();
              setOpenId(card.id);
              if (card.sample !== '—') speakSpanish(card.sample);
            }}
            className={`rounded-3xl bg-gradient-to-br ${card.swatch} p-4 text-left text-white shadow-lg ring-4 cursor-pointer ${openId === card.id ? card.ring : 'ring-transparent'}`}
          >
            <div className="text-3xl font-black">{card.label}</div>
            <div className="mt-1 text-lg font-bold">vos → -{card.tail}</div>
            <div className="mt-2 text-sm font-semibold text-white/90">
              {card.sample === '—' ? 'пока нет своих слов' : `${card.sample} · ${card.sampleRu}`}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-slate-100 sm:p-5">
        {open.note && <p className="mb-3 text-sm text-emerald-800">{open.note}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {samples.map((verb) => {
            const vosForm = conjugateMayaVerb(verb, 'vos');
            return (
              <div key={verb.infinitive} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <VerbPhoto verb={verb} className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-500">{verb.infinitive} · {verb.translation}</div>
                  <button
                    type="button"
                    onClick={() => speakSpanish(verb.vos)}
                    className="inline-flex items-center gap-1.5 text-left text-xl font-black text-slate-900 hover:text-fuchsia-700 cursor-pointer"
                  >
                    <span>{vosForm}</span>
                    <Volume2 className="h-4 w-4 text-fuchsia-600" />
                  </button>
                  <div className="text-sm text-slate-600">{verb.vosRu}</div>
                </div>
              </div>
            );
          })}
        </div>
        {samples.length === 0 && (
          <p className="text-slate-600">Зелёный хвостик -ís ждёт, когда появится первый глагол на -IR. Сейчас играем только со словами Майи.</p>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-600 ring-1 ring-slate-200 cursor-pointer">Назад</button>
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 py-3 text-lg font-black text-white shadow-lg cursor-pointer"
        >
          Играем <Sparkles className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * PART 2: REMAINING ARGENTINE PRONOUNS (él/ella, nosotros, ustedes/ellos)
 * ========================================================================== */

function PronounsCardsStep({ onNext }) {
  return (
    <div className="space-y-5">
      {/* Intro Hero Banner with Pictures (No video!) */}
      <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xl ring-1 ring-amber-200">
        <div className="flex flex-col md:flex-row items-center gap-5">
          <img
            src="/spanish/images/maya-verbs/ar-actions.png"
            alt="Дети играют, кушают и рисуют"
            className="h-44 w-full md:w-72 rounded-2xl object-cover shadow-md"
          />
          <div className="space-y-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-purple-800">
              🇦🇷 Часть 2 · Остальные местоимения (без видео)
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
              В Части 1 было vos («ты»), а теперь — остальные!
            </h2>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
              В первой части мы выучили <strong>vos</strong> (ты) и <strong>yo</strong> (я).
              А во второй части разберём <strong>только оставшиеся местоимения</strong>: когда действие делает <strong>он или она (él / ella)</strong>, <strong>мы вместе (nosotros / nosotras)</strong>, <strong>вы все (ustedes)</strong> и <strong>они (ellos / ellas)</strong>!
            </p>
            <SpeakButton
              text="Ella dibuja. Nosotros dibujamos. Ustedes dibujan. Ellos dibujan."
              label="Послушать остальные формы"
            />
          </div>
        </div>
      </div>

      {/* 3 Illustrated Cards for the Remaining Pronouns */}
      <div className="space-y-4">
        {PART2_REMAINING_PRONOUNS.map((card, idx) => (
          <div
            key={card.id}
            className={`rounded-3xl border-2 p-4 sm:p-5 shadow-lg transition-all ${card.bgLight}`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-4">
                <PronounKidSvg id={card.id} />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-0.5 text-xs font-black uppercase ${card.badgeBg}`}>
                      Хвостик {idx + 1}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black">{card.pronoun}</h3>
                    <span className="text-sm font-bold opacity-75">— {card.meaning}</span>
                  </div>
                  <p className="text-sm sm:text-base font-medium leading-snug">
                    {card.kidRule}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 rounded-xl bg-white/90 px-3 py-1 text-sm font-black text-rose-700 shadow-2xs ring-1 ring-rose-200">
                      глаголы на -AR ➔ <strong className="text-base underline">{card.arTail}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-xl bg-white/90 px-3 py-1 text-sm font-black text-sky-700 shadow-2xs ring-1 ring-sky-200">
                      глаголы на -ER ➔ <strong className="text-base underline">{card.erTail}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <img
                src={card.sceneImage}
                alt={card.meaning}
                className="h-32 w-full lg:w-48 rounded-2xl object-cover shadow-md ring-2 ring-white shrink-0"
              />
            </div>

            {/* Spoken example pills */}
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 pt-3 border-t border-black/10">
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/90 p-3 shadow-xs">
                <div>
                  <div className="text-xs font-bold uppercase text-rose-600">Пример на -AR</div>
                  <div className="text-base font-black text-slate-900">{card.arExample}</div>
                  <div className="text-xs text-slate-600">{card.arExampleRu}</div>
                </div>
                <SpeakButton text={card.arExample} label="Слушать" small />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/90 p-3 shadow-xs">
                <div>
                  <div className="text-xs font-bold uppercase text-sky-600">Пример на -ER</div>
                  <div className="text-base font-black text-slate-900">{card.erExample}</div>
                  <div className="text-xs text-slate-600">{card.erExampleRu}</div>
                </div>
                <SpeakButton text={card.erExample} label="Слушать" small />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Special Kid Note about Ustedes vs Vosotros */}
      <div className="rounded-3xl bg-gradient-to-r from-sky-100 via-indigo-50 to-purple-100 p-5 border-2 border-sky-200 shadow-md">
        <div className="flex items-start gap-3">
          <span className="text-3xl">🇦🇷</span>
          <div>
            <h4 className="text-lg font-black text-slate-900">Почему в Аргентине так легко учить множественное число?</h4>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              В Испании есть отдельное слово <em>vosotros</em>, а в Аргентине его вообще не используют!
              Когда ты говоришь друзьям <strong>«вы все» (ustedes)</strong> или говоришь <strong>«они» (ellos / ellas)</strong>,
              хвостик у глагола всегда одинаковый — с буквой <strong>N</strong> на конце: <strong>-an</strong> (saltan, dibujan) или <strong>-en</strong> (comen, corren)!
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3.5 text-lg font-black text-white shadow-lg cursor-pointer"
      >
        Дальше: Хвостики Части 2 на глаголах Майи <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

const PART2_PRONOUN_ROWS = [
  { key: 'ella', title: 'Él / Ella', sub: 'он / она', badge: 'bg-purple-600' },
  { key: 'nosotros', title: 'Nosotros / Nosotras', sub: 'мы вместе', badge: 'bg-emerald-600' },
  { key: 'ustedes', title: 'Ustedes', sub: 'вы все (в Аргентине)', badge: 'bg-sky-600' },
  { key: 'ellos', title: 'Ellos / Ellas', sub: 'они', badge: 'bg-indigo-600' },
];

function PronounsWheelStep({ onNext, onBack }) {
  const [selectedInf, setSelectedInf] = useState('dibujar');
  const verb = MAYA_REGULAR_VERBS.find((v) => v.infinitive === selectedInf) || MAYA_REGULAR_VERBS[0];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xl ring-1 ring-purple-100">
        <p className="text-xs font-black uppercase tracking-wide text-purple-600">
          Шаг 2 · Интерактивная таблица с картинками
        </p>
        <h2 className="mt-1 text-2xl font-black text-slate-900">
          Выбери любой глагол Майи и послушай все его формы
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Нажимай на картинки слов ниже — таблица покажет корень и цветной хвостик для каждого местоимения.
        </p>

        {/* 12 Verb Selector Pills with Photos */}
        <div className="mt-4 flex flex-wrap gap-2">
          {MAYA_REGULAR_VERBS.map((item) => {
            const active = item.infinitive === verb.infinitive;
            return (
              <button
                key={item.infinitive}
                type="button"
                onClick={() => {
                  soundEngine.playTileClick();
                  setSelectedInf(item.infinitive);
                  speakSpanish(item.infinitive);
                }}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-black transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md scale-105'
                    : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200 hover:bg-fuchsia-50'
                }`}
              >
                <VerbPhoto verb={item} className="h-8 w-8" />
                <span>{item.infinitive}</span>
                <span className={`text-xs font-semibold ${active ? 'text-fuchsia-100' : 'text-slate-500'}`}>
                  ({item.translation})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Verb Showcase Card */}
      <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xl ring-1 ring-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <VerbPhoto verb={verb} className="h-20 w-20 sm:h-24 sm:w-24 shrink-0" />
            <div>
              <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-black uppercase ${
                verb.ending === 'ar' ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-800'
              }`}>
                Группа -{verb.ending.toUpperCase()}
              </span>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {verb.infinitive} <span className="text-lg font-bold text-slate-500">— {verb.translation}</span>
              </h3>
              {verb.stemNote && (
                <p className="mt-1 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
                  💡 {verb.stemNote}
                </p>
              )}
            </div>
          </div>
          <SpeakButton text={verb.infinitive} label={`Слушать «${verb.infinitive}»`} />
        </div>

        {/* 4 Remaining Argentine Pronoun Conjugation Cards (Part 2 focus) */}
        <div className="grid gap-3 sm:grid-cols-2">
          {PART2_PRONOUN_ROWS.map((row) => {
            const fullForm = conjugateMayaVerb(verb, row.key);
            const tail = getPersonTailMap(row.key)[verb.ending];
            const stemPart = fullForm.endsWith(tail)
              ? fullForm.slice(0, fullForm.length - tail.length)
              : verb.stem;
            const sentence = verb[row.key] || verb.vos;
            const sentenceRu = verb[`${row.key}Ru`] || verb.vosRu;

            return (
              <div
                key={row.key}
                onClick={() => speakSpanish(sentence)}
                className="group rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-purple-50/60 hover:border-purple-300 p-4 transition-all cursor-pointer flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black text-white ${row.badge}`}>
                      {row.title}
                    </span>
                    <span className="text-xs font-bold text-slate-500">{row.sub}</span>
                  </div>

                  <div className="mt-3 text-2xl font-black tracking-tight text-slate-900 flex items-center justify-between">
                    <div>
                      <span>{stemPart}</span>
                      <span className="text-purple-600 underline decoration-2 underline-offset-4">{tail}</span>
                    </div>
                    <Volume2 className="h-4 w-4 text-purple-500 opacity-80 group-hover:scale-110 transition-transform" />
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200/80">
                  <div className="text-sm font-bold text-slate-800">{sentence}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{sentenceRu}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Small reminder strip from Part 1 */}
        <div className="rounded-2xl bg-rose-50/70 border border-rose-200/80 px-4 py-2.5 text-xs text-rose-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            Из <strong>Части 1</strong>: Yo <strong>{conjugateMayaVerb(verb, 'yo')}</strong> (я) · Vos <strong>{conjugateMayaVerb(verb, 'vos')}</strong> (ты)
          </span>
          <SpeakButton text={`${verb.yo} ${verb.vos}`} label="Повторить Часть 1" small />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-600 ring-1 ring-slate-200 cursor-pointer"
        >
          Назад к карточкам
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 py-3 text-lg font-black text-white shadow-lg cursor-pointer"
        >
          Играем по всем местоимениям <Sparkles className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * SHARED QUIZ COMPONENT (Used by both Version 1 and Version 2)
 * ========================================================================== */

function QuizPlayStep({ quiz, onBack, backLabel = 'К хвостикам', stepTitle = 'Шаг 3 · Собери хвостик', onGoToNextPart }) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState('');
  const [status, setStatus] = useState('');
  const [score, setScore] = useState(0);

  const question = quiz[index];
  const finished = index >= quiz.length;

  const choices = useMemo(() => {
    if (!question) return [];
    const candidates = [
      question.answer,
      conjugateMayaVerb(question.verb, 'yo'),
      conjugateMayaVerb(question.verb, 'vos'),
      conjugateMayaVerb(question.verb, 'ella'),
      conjugateMayaVerb(question.verb, 'nosotros'),
      conjugateMayaVerb(question.verb, 'ustedes'),
    ];
    const unique = [];
    candidates.forEach((item) => {
      if (item && !unique.includes(item)) unique.push(item);
    });
    return unique.slice(0, 4).sort((a, b) => a.localeCompare(b, 'es'));
  }, [question]);

  const check = (value) => {
    if (!question || status === 'ok') return;
    const ok = isMayaLessonAnswer(value, question.answer);
    setPicked(value);
    setStatus(ok ? 'ok' : 'no');
    if (ok) {
      setScore((prev) => prev + 1);
      soundEngine.playCorrect();
      speakSpanish(question.spoken);
    } else {
      soundEngine.playWrong();
    }
  };

  if (finished) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-emerald-100">
        <div className="text-5xl">🌟</div>
        <h2 className="mt-3 text-3xl font-black text-slate-900">Умница, Майя!</h2>
        <p className="mt-2 text-lg text-slate-700">{score} из {quiz.length} хвостиков на месте.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIndex(0);
              setScore(0);
              setTyped('');
              setPicked('');
              setStatus('');
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-black text-white cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> Сыграть ещё раз
          </button>
          {onGoToNextPart && (
            <button
              type="button"
              onClick={onGoToNextPart}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 font-black text-white shadow-lg cursor-pointer"
            >
              <span>Перейти к Части 2 (остальные местоимения)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-xl ring-1 ring-fuchsia-100 sm:p-6">
        <div className="flex items-center justify-between text-sm font-bold text-slate-500">
          <span>{stepTitle}</span>
          <span>{index + 1} / {quiz.length} · {score} верно</span>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <VerbPhoto verb={question.verb} className="h-24 w-24 shrink-0" />
          <div>
            <div className="inline-block rounded-full bg-fuchsia-100 px-3 py-1 text-sm font-black text-fuchsia-800">
              {question.prompt}
            </div>
            <div className="mt-1 text-3xl font-black text-slate-900">{question.verb.infinitive}</div>
            <div className="text-slate-600">{question.verb.translation} · {question.hint}</div>
            <div className="mt-2">
              <SpeakButton text={question.verb.infinitive} label="Как звучит глагол" />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {choices.map((choice) => {
            const chosen = picked === choice;
            const tone = status && chosen
              ? (status === 'ok' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white')
              : 'bg-slate-50 text-slate-900 ring-1 ring-slate-200 hover:bg-fuchsia-50';
            return (
              <button
                key={choice}
                type="button"
                onClick={() => check(choice)}
                className={`rounded-2xl px-3 py-3.5 text-xl font-black transition-all cursor-pointer ${tone}`}
              >
                {choice}
              </button>
            );
          })}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            check(typed);
          }}
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="или напиши сама..."
            autoComplete="off"
            autoCapitalize="off"
            className="flex-1 rounded-2xl border-2 border-fuchsia-100 px-4 py-3 text-lg"
          />
          <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white cursor-pointer">
            Проверить
          </button>
        </form>

        {status === 'ok' && (
          <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-black text-lg">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>{question.spoken}</span>
              </div>
              <SpeakButton text={question.spoken} label="Повторить фразу" small />
            </div>
            <div className="text-sm mt-1">{question.spokenRu}</div>
            <button
              type="button"
              onClick={() => {
                setIndex((prev) => prev + 1);
                setTyped('');
                setPicked('');
                setStatus('');
              }}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white cursor-pointer"
            >
              Дальше <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {status === 'no' && (
          <p className="mt-3 text-sm font-bold text-rose-700">
            Почти! Подсказка: {question.hint}. Попробуй выбрать ещё раз!
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-600 ring-1 ring-slate-200 cursor-pointer"
      >
        {backLabel}
      </button>
    </div>
  );
}

export default function MayaVerbLessonSection({ initialVersion }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const versionParam = searchParams.get('version') || (searchParams.get('tab') === 'maya_pronouns' ? 'pronouns' : '');
  const [version, setVersion] = useState(() => {
    if (initialVersion === 'pronouns' || versionParam === 'pronouns') return 'pronouns';
    return 'vos';
  });

  useEffect(() => {
    if (initialVersion === 'pronouns' || versionParam === 'pronouns') {
      setVersion('pronouns');
    } else if (versionParam === 'vos') {
      setVersion('vos');
    }
  }, [initialVersion, versionParam]);

  const [stepV1, setStepV1] = useState('look');
  const [stepV2, setStepV2] = useState('cards');

  const quizV1 = useMemo(() => buildMayaLessonQuiz(), []);
  const quizV2 = useMemo(() => buildMayaPart2Quiz(), []);

  const switchVersion = (nextVersion) => {
    soundEngine.playTileClick();
    setVersion(nextVersion);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'maya_verbs');
    nextParams.set('version', nextVersion);
    setSearchParams(nextParams, { replace: true });
  };

  const switchToSentences = () => {
    soundEngine.playTileClick();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'maya_sentences');
    nextParams.delete('version');
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      {/* Top Lesson Header + Version Switcher */}
      <header className="rounded-3xl bg-gradient-to-r from-amber-100 via-rose-100 to-fuchsia-100 p-5 sm:p-6 shadow-md border border-rose-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm font-black uppercase tracking-wide text-fuchsia-700">
              Урок Майи · Аргентинский испанский 🇦🇷
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900">
              {version === 'vos'
                ? 'Часть 1: Хвостики глаголов для vos (с видео)'
                : 'Часть 2: Остальные местоимения Аргентины (без видео)'}
            </h1>
          </div>
        </div>

        {/* Prominent 2-Version Switcher */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => switchVersion('vos')}
            className={`flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all cursor-pointer ${
              version === 'vos'
                ? 'bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-lg ring-2 ring-white scale-[1.01]'
                : 'bg-white/85 text-slate-800 hover:bg-white ring-1 ring-rose-200'
            }`}
          >
            <span className="text-2xl">🎈</span>
            <div>
              <div className="text-xs font-black uppercase opacity-85">Часть 1 · с видео</div>
              <div className="text-sm sm:text-base font-black">Ты (vos) и я (yo): jugás, comés</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => switchVersion('pronouns')}
            className={`flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all cursor-pointer ${
              version === 'pronouns'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg ring-2 ring-white scale-[1.01]'
                : 'bg-white/85 text-slate-800 hover:bg-white ring-1 ring-purple-200'
            }`}
          >
            <span className="text-2xl">🇦🇷</span>
            <div>
              <div className="text-xs font-black uppercase opacity-85">Часть 2 · без видео · с картинками</div>
              <div className="text-sm sm:text-base font-black">Остальные: он/она, мы, вы все, они</div>
            </div>
          </button>

          <button
            type="button"
            onClick={switchToSentences}
            className="flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all cursor-pointer bg-white/90 text-slate-800 hover:bg-white ring-2 ring-amber-300 hover:ring-amber-500 shadow-sm active:scale-98"
          >
            <span className="text-2xl">⭐</span>
            <div>
              <div className="text-xs font-black uppercase text-amber-700 font-extrabold">Тренировка: 200 предложений</div>
              <div className="text-sm sm:text-base font-black">5 упр. ES→RU и 5 упр. RU→ES по 20 предложений</div>
            </div>
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-700">
          Слова из словаря Майи: <strong>dibujar, pintar, comer, correr, escuchar, mirar, comprar, saltar, esperar, ayudar, jugar, entender</strong>.
        </p>

        {/* Step pills for active version */}
        {version === 'vos' ? (
          <div className="flex flex-wrap gap-2">
            {STEPS_V1.map((id, index) => (
              <button
                key={id}
                type="button"
                onClick={() => setStepV1(id)}
                className={`rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-bold cursor-pointer ${
                  stepV1 === id ? 'bg-fuchsia-600 text-white shadow-xs' : 'bg-white/80 text-slate-700 hover:bg-white'
                }`}
              >
                {index + 1}. {id === 'look' ? 'Смотрим картинки' : id === 'tails' ? 'Три хвостика + Видео' : 'Игра (vos)'}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {STEPS_V2.map((id, index) => (
              <button
                key={id}
                type="button"
                onClick={() => setStepV2(id)}
                className={`rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-bold cursor-pointer ${
                  stepV2 === id ? 'bg-purple-600 text-white shadow-xs' : 'bg-white/80 text-slate-700 hover:bg-white'
                }`}
              >
                {index + 1}. {id === 'cards' ? 'Карточки местоимений (без видео)' : id === 'wheel' ? 'Все формы 12 глаголов' : 'Игра по всем местоимениям'}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Render Version 1 or Version 2 */}
      {version === 'vos' ? (
        <>
          {stepV1 === 'look' && <LookStep onNext={() => setStepV1('tails')} />}
          {stepV1 === 'tails' && <TailsStep onNext={() => setStepV1('play')} onBack={() => setStepV1('look')} />}
          {stepV1 === 'play' && (
            <QuizPlayStep
              key="quiz-v1"
              quiz={quizV1}
              onBack={() => setStepV1('tails')}
              backLabel="К хвостикам"
              stepTitle="Шаг 3 · Собери хвостик (Часть 1)"
              onGoToNextPart={() => {
                switchVersion('pronouns');
                setStepV2('cards');
              }}
            />
          )}
        </>
      ) : (
        <>
          {stepV2 === 'cards' && <PronounsCardsStep onNext={() => setStepV2('wheel')} />}
          {stepV2 === 'wheel' && <PronounsWheelStep onNext={() => setStepV2('quiz')} onBack={() => setStepV2('cards')} />}
          {stepV2 === 'quiz' && (
            <QuizPlayStep
              key="quiz-v2"
              quiz={quizV2}
              onBack={() => setStepV2('wheel')}
              backLabel="К таблице Части 2"
              stepTitle="Шаг 3 · Тренировка Части 2 (él/ella, nosotros, ustedes, ellos)"
            />
          )}
        </>
      )}
    </section>
  );
}
