import React, { useEffect, useState } from 'react';
import { MessageCircle, Search, Dumbbell, Check } from 'lucide-react';
import { coachApi } from '../../utils/coachApi';
import { Card, ErrorNote, SpeakButton, Spinner } from './CoachUI';
import { unlockCoachAudio } from '../../hooks/useCoachSpeech';

const VOICE_SAMPLE = '¡Hola! Soy Lucía, de Buenos Aires. ¿Charlamos un rato? Contame cómo te fue hoy.';

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${selected ? 'c-btn-primary border-transparent' : 'c-btn-ghost'}`}
    >
      {selected && <Check className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
      {children}
    </button>
  );
}

export default function CoachOnboarding({ initialName, initial, onDone, mode = 'onboarding' }) {
  const [catalog, setCatalog] = useState(null);
  const [step, setStep] = useState(mode === 'onboarding' ? 0 : 1);
  const [name, setName] = useState(initial?.display_name || initialName || '');
  const [interests, setInterests] = useState(initial?.interests || []);
  const [goals, setGoals] = useState(initial?.goals || []);
  const [about, setAbout] = useState(initial?.about || '');
  const [voice, setVoice] = useState(initial?.partner_voice || 'Sulafat');
  const [autoplay, setAutoplay] = useState(initial?.voice_autoplay ?? true);
  const [inlineFeedback, setInlineFeedback] = useState(initial?.show_inline_feedback ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    coachApi.catalog().then(setCatalog).catch((loadError) => setError(loadError.message));
  }, []);

  const toggle = (list, setList, value) => setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { learner } = await coachApi.saveProfile({
        display_name: name,
        interests,
        goals,
        about,
        partner_voice: voice,
        voice_autoplay: autoplay,
        show_inline_feedback: inlineFeedback,
        onboarded: true,
      });
      onDone?.(learner);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  if (step === 0) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-sm font-semibold c-accent mb-2">Разговорный испанский · B1</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold c-text leading-tight">
          ¡Hola{name ? `, ${name}` : ''}! Здесь ты говоришь, а ИИ находит твои настоящие ошибки
        </h1>
        <p className="c-muted mt-3 text-[15px] leading-relaxed">
          Никаких детских уроков и списков слов. Ты болтаешь с Лусией из Буэнос-Айреса — голосом или текстом, как с подругой.
          После разговора получаешь честный разбор и короткую тренировку ровно на то, в чём ошибаешься именно ты.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mt-6">
          {[
            { icon: MessageCircle, title: '1. Разговор', text: 'Чат с голосовыми или живой звонок. Аргентинский испанский, vos, без «учебникового» тона.' },
            { icon: Search, title: '2. Разбор', text: 'Твои фразы → как правильно и почему. Слабые места собираются в личную карту.' },
            { icon: Dumbbell, title: '3. Тренировка', text: 'Задания из твоих же предложений. В следующих разговорах Лусия незаметно вернёт эти темы.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="c-panel rounded-xl p-4">
              <Icon className="w-5 h-5 c-accent mb-2" />
              <div className="font-bold c-text text-sm">{title}</div>
              <div className="c-muted text-[13px] mt-1 leading-snug">{text}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => { unlockCoachAudio(); setStep(1); }} className="c-btn-primary mt-6 w-full sm:w-auto px-6 py-3 rounded-xl font-bold">
          Настроить под себя — 1 минута
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      {mode === 'onboarding' && <p className="text-xs font-bold c-muted mb-1">Шаг {step} из 2</p>}
      {step === 1 && (
        <>
          <h2 className="text-xl font-extrabold c-text">О чём тебе интересно говорить?</h2>
          <p className="c-muted text-sm mt-1">Лусия будет начинать с твоих тем и запоминать, что ты рассказываешь.</p>
          {!catalog ? (
            <div className="py-8 flex justify-center c-muted"><Spinner className="w-5 h-5" /></div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-4">
              {catalog.onboarding.interests.map((interest) => (
                <Chip key={interest} selected={interests.includes(interest)} onClick={() => toggle(interests, setInterests, interest)}>{interest}</Chip>
              ))}
            </div>
          )}
          <label className="block mt-5">
            <span className="text-sm font-bold c-text">Пара слов о себе <span className="c-muted font-normal">(можно по-русски)</span></span>
            <textarea
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              rows={3}
              maxLength={800}
              placeholder="Например: живу в Буэнос-Айресе, двое детей, работаю дизайнером, люблю готовить…"
              className="c-input w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-[15px]"
            />
          </label>
          <label className="block mt-4">
            <span className="text-sm font-bold c-text">Как к тебе обращаться</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} className="c-input w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-[15px]" />
          </label>
          <div className="flex gap-2 mt-6">
            {mode === 'onboarding' && <button type="button" onClick={() => setStep(0)} className="c-btn-ghost px-4 py-2.5 rounded-xl font-semibold">Назад</button>}
            <button type="button" onClick={() => setStep(2)} className="c-btn-primary flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold">Дальше</button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h2 className="text-xl font-extrabold c-text">Зачем тебе испанский?</h2>
          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {(catalog?.onboarding.goals || []).map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => toggle(goals, setGoals, goal.label_ru)}
                className={`text-left px-4 py-3 rounded-xl text-sm font-semibold border transition-colors ${goals.includes(goal.label_ru) ? 'c-bg-accent border-transparent' : 'c-btn-ghost'}`}
              >
                {goals.includes(goal.label_ru) ? '✓ ' : ''}{goal.label_ru}
              </button>
            ))}
          </div>

          <h3 className="text-sm font-bold c-text mt-6">Голос Лусии</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {(catalog?.voices || []).filter((item) => !['Puck', 'Charon'].includes(item.id)).map((item) => (
              <div key={item.id} className={`flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full border ${voice === item.id ? 'c-bg-accent border-transparent' : 'c-btn-ghost'}`}>
                <button type="button" onClick={() => setVoice(item.id)} className="text-sm font-semibold">{item.label_ru}</button>
                <SpeakButton text={VOICE_SAMPLE} speechKey={`sample-${item.id}`} voice={item.id} />
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} className="mt-1 w-4 h-4 accent-fuchsia-700" />
              <span className="text-sm c-text">Озвучивать ответы Лусии автоматически <span className="c-muted block text-xs">Тренирует восприятие на слух; текст всё равно виден.</span></span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={inlineFeedback} onChange={(event) => setInlineFeedback(event.target.checked)} className="mt-1 w-4 h-4 accent-fuchsia-700" />
              <span className="text-sm c-text">Показывать исправления сразу под моими сообщениями <span className="c-muted block text-xs">Можно выключить, если мешает — полный разбор всё равно будет в конце.</span></span>
            </label>
          </div>

          <div className="mt-5"><ErrorNote message={error} /></div>
          <div className="flex gap-2 mt-5">
            <button type="button" onClick={() => setStep(1)} className="c-btn-ghost px-4 py-2.5 rounded-xl font-semibold">Назад</button>
            <button type="button" onClick={save} disabled={saving || !name.trim()} className="c-btn-primary flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold inline-flex items-center justify-center gap-2">
              {saving && <Spinner />}
              {mode === 'onboarding' ? 'Готово — к разговору' : 'Сохранить'}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
