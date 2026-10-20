import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lightbulb, Mic, Send, Square, Check, X, ArrowRight, Keyboard, RotateCcw, Eye } from 'lucide-react';
import { blobToBase64, coachApi } from '../../utils/coachApi';
import { useVoiceRecorder, isVoiceRecordingSupported } from '../../hooks/useVoiceRecorder';
import { unlockCoachAudio } from '../../hooks/useCoachSpeech';
import { BackLink, Card, CoachPage, ErrorNote, ScoreBar, SpeakButton, Spinner } from './CoachUI';

const TYPE_LABELS = {
  fix: 'Исправь свою фразу',
  choice: 'Выбери вариант',
  gap: 'Заполни пропуск',
  translate: 'Переведи',
  speak: 'Ответь голосом',
};

const VERDICT_META = {
  correct: { title: 'Верно', className: 'c-bg-good', icon: Check },
  almost: { title: 'Почти', className: 'c-bg-warn', icon: Check },
  incorrect: { title: 'Не совсем', className: 'c-bg-bad', icon: X },
};

function PromptText({ item }) {
  if (item.type === 'gap' || item.type === 'choice') {
    const parts = item.prompt.split(/_{2,}/);
    return (
      <span>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 && <span className="inline-block min-w-[3.5rem] border-b-2 mx-1 align-baseline" style={{ borderColor: 'var(--c-accent)' }}>&nbsp;</span>}
          </React.Fragment>
        ))}
      </span>
    );
  }
  return <span>{item.prompt}</span>;
}

export function WorkoutLauncher() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    coachApi.nextWorkout()
      .then(({ id }) => navigate(`/coach/workout/${id}`, { replace: true }))
      .catch((startError) => setError(startError.message));
  }, [navigate]);
  return (
    <CoachPage narrow>
      <BackLink to="/" label="Главная" />
      {error ? (
        <Card className="p-6">
          <p className="c-text">{error}</p>
          <Link to="/coach/new?mode=chat" className="c-btn-primary inline-flex mt-4 px-5 py-2.5 rounded-xl font-bold">Поговорить с Лусией</Link>
        </Card>
      ) : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}
    </CoachPage>
  );
}

export default function CoachWorkout() {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [typeInstead, setTypeInstead] = useState(false);
  const [spotScores, setSpotScores] = useState({});
  const [regenerating, setRegenerating] = useState(false);
  const recorder = useVoiceRecorder();
  const inputRef = useRef(null);

  const load = useCallback(async (wait = true) => {
    try {
      const detail = await coachApi.workout(workoutId, wait);
      setWorkout(detail);
      return detail;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    }
  }, [workoutId]);

  useEffect(() => {
    load(true).then((detail) => {
      if (!detail) return;
      const firstOpen = detail.items.findIndex((item) => !item.result?.final);
      setIndex(firstOpen === -1 ? detail.items.length : firstOpen);
    });
  }, [load]);

  useEffect(() => {
    if (workout?.status !== 'generating') return undefined;
    const timer = setTimeout(() => load(true), 1500);
    return () => clearTimeout(timer);
  }, [workout, load]);

  const item = workout?.items?.[index];

  useEffect(() => {
    if (!item) return;
    setValue(item.type === 'fix' ? item.prompt : '');
    setShowHint(false);
    setFeedback(null);
    setRevealed(false);
    setTypeInstead(false);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (payload) => {
    if (checking) return;
    setChecking(true);
    setError('');
    try {
      const response = await coachApi.answer(workout.id, item.id, payload);
      setFeedback(response);
      if (response.spot) setSpotScores((scores) => ({ ...scores, [item.spot_key]: response.spot.score }));
      setWorkout((current) => ({
        ...current,
        items: current.items.map((entry) => (entry.id === item.id ? { ...entry, result: response.result, answers: response.item.answers, explanation_ru: response.item.explanation_ru } : entry)),
      }));
    } catch (answerError) {
      setError(answerError.message);
    } finally {
      setChecking(false);
    }
  };

  const submitText = () => {
    const answer = value.trim();
    if (!answer) return;
    submit({ answer });
  };

  const toggleVoice = async () => {
    unlockCoachAudio();
    if (recorder.isRecording) {
      const recording = await recorder.stop();
      if (!recording || recording.durationMs < 700) return;
      const audio = await blobToBase64(recording.blob);
      submit({ audio, mimeType: recording.mimeType });
      return;
    }
    await recorder.start();
  };

  const retry = () => {
    setFeedback(null);
    setShowHint(true);
    if (item.type !== 'fix') setValue('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const reveal = async () => {
    setRevealed(true);
    try {
      const response = await coachApi.answer(workout.id, item.id, { giveUp: true });
      setFeedback((current) => ({ ...current, result: response.result, item: response.item }));
      setWorkout((current) => ({
        ...current,
        items: current.items.map((entry) => (entry.id === item.id ? { ...entry, result: response.result } : entry)),
      }));
    } catch {
      // Revealing locally is enough.
    }
  };

  const next = () => setIndex((current) => current + 1);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const { id } = await coachApi.createWorkout(workout?.spot_keys || []);
      setWorkout(null);
      navigate(`/coach/workout/${id}`, { replace: true });
    } catch (regenError) {
      setError(regenError.message);
      setRegenerating(false);
    }
  };

  const summary = useMemo(() => {
    if (!workout) return null;
    const results = workout.items.map((entry) => entry.result).filter(Boolean);
    const firstTry = results.filter((result) => result.first_verdict !== 'incorrect').length;
    const bySpot = new Map();
    for (const entry of workout.items) {
      if (!bySpot.has(entry.spot_key)) bySpot.set(entry.spot_key, { title: entry.spot_title_ru, total: 0, good: 0 });
      const spot = bySpot.get(entry.spot_key);
      spot.total += 1;
      if (entry.result && entry.result.first_verdict !== 'incorrect') spot.good += 1;
    }
    return { firstTry, total: workout.items.length, spots: [...bySpot.entries()] };
  }, [workout]);

  if (!workout) {
    return <CoachPage narrow><BackLink to="/" label="Главная" />{error ? <ErrorNote message={error} /> : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}</CoachPage>;
  }

  if (workout.status === 'generating') {
    return (
      <CoachPage narrow>
        <BackLink to="/" label="Главная" />
        <Card className="p-8 text-center">
          <Spinner className="w-7 h-7 mx-auto c-accent" />
          <div className="font-extrabold c-text text-lg mt-4">Собираю тренировку</div>
          <div className="c-muted text-sm mt-1">Беру твои фразы из разговоров, придумываю похожие задания и даю их на проверку «носителю». Около 20–40 секунд.</div>
        </Card>
      </CoachPage>
    );
  }

  if (workout.status === 'failed') {
    return (
      <CoachPage narrow>
        <BackLink to="/" label="Главная" />
        <Card className="p-6">
          <p className="c-text font-semibold">Не получилось собрать задания — нейросеть перегружена.</p>
          <button type="button" onClick={regenerate} disabled={regenerating} className="c-btn-primary mt-4 px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">{regenerating && <Spinner />} Попробовать ещё раз</button>
          <div className="mt-3"><ErrorNote message={error} /></div>
        </Card>
      </CoachPage>
    );
  }

  if (index >= workout.items.length) {
    return (
      <CoachPage narrow>
        <BackLink to="/" label="Главная" />
        <Card className="p-6 sm:p-8">
          <div className="text-sm font-bold c-accent">Тренировка завершена</div>
          <div className="text-3xl font-extrabold c-text mt-1">{summary.firstTry} из {summary.total} <span className="text-lg c-muted font-bold">с первой попытки</span></div>
          <div className="mt-6 space-y-4">
            {summary.spots.map(([key, spot]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-semibold c-text">{spot.title}</span>
                  <span className="c-muted">{spot.good}/{spot.total}{spotScores[key] !== undefined ? ` · освоено ${spotScores[key]}%` : ''}</span>
                </div>
                <ScoreBar score={spotScores[key] ?? (spot.good / spot.total) * 100} size="sm" />
              </div>
            ))}
          </div>
          <p className="c-muted text-sm mt-6">Лучшее закрепление — применить это в живом разговоре. Лусия незаметно даст тебе такие возможности.</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Link to="/coach/new?mode=chat" className="c-btn-primary px-5 py-2.5 rounded-xl font-bold text-center">Поговорить и применить</Link>
            <Link to="/" className="c-btn-ghost px-5 py-2.5 rounded-xl font-semibold text-center">На главную</Link>
          </div>
        </Card>
      </CoachPage>
    );
  }

  const result = feedback?.result || item.result;
  const answered = Boolean(result);
  const verdict = result ? VERDICT_META[result.verdict] : null;
  const answers = feedback?.item?.answers || item.answers || [];
  const explanation = feedback?.item?.explanation_ru || item.explanation_ru;
  const canRetry = answered && !result.final && !revealed;
  const voiceMode = item.type === 'speak' && !typeInstead && isVoiceRecordingSupported();
  const isSpanishPrompt = item.type !== 'translate';

  return (
    <CoachPage narrow>
      <BackLink to="/" label="Главная" />
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1"><ScoreBar score={(index / workout.items.length) * 100} size="sm" /></div>
        <span className="text-xs font-bold c-muted">{index + 1}/{workout.items.length}</span>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full c-bg-accent">{item.spot_title_ru}</span>
          {item.source === 'own' && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full c-panel">твоя фраза из разговора</span>}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider c-muted">{TYPE_LABELS[item.type]}</div>
        {item.instruction_ru && item.instruction_ru !== TYPE_LABELS[item.type] && <div className="text-sm c-muted mt-0.5">{item.instruction_ru}</div>}
        <div className={`mt-3 text-[19px] leading-relaxed c-text font-semibold ${item.type === 'fix' ? 'c-bad' : ''}`}>
          <PromptText item={item} />
          {isSpanishPrompt && <SpeakButton text={item.prompt.replace(/_{2,}/g, '…')} speechKey={`w-${workout.id}-${item.id}`} className="ml-2 align-middle" />}
        </div>

        {!answered && (
          <div className="mt-5">
            {item.type === 'choice' && (
              <div className="grid gap-2">
                {item.options.map((option, optionIndex) => (
                  <button key={option} type="button" disabled={checking} onClick={() => submit({ choiceIndex: optionIndex })} className="c-btn-ghost text-left px-4 py-3 rounded-xl text-[16px] font-semibold disabled:opacity-60">
                    {option}
                  </button>
                ))}
              </div>
            )}

            {item.type !== 'choice' && voiceMode && (
              <div className="flex flex-col items-center gap-3 py-2">
                <button type="button" onClick={toggleVoice} disabled={checking || recorder.state === 'requesting'} className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-transform active:scale-95 ${recorder.isRecording ? 'animate-pulse' : ''}`} style={{ background: recorder.isRecording ? '#dc2647' : 'var(--c-accent)' }}>
                  {checking ? <Spinner className="w-7 h-7" /> : recorder.isRecording ? <Square className="w-7 h-7" /> : <Mic className="w-8 h-8" />}
                </button>
                <div className="text-sm c-muted">{recorder.isRecording ? `Говори… ${Math.floor(recorder.elapsedMs / 1000)} с — нажми, чтобы закончить` : checking ? 'Слушаю и проверяю…' : 'Нажми и скажи ответ вслух'}</div>
                <button type="button" onClick={() => setTypeInstead(true)} className="text-xs c-muted underline underline-offset-2 inline-flex items-center gap-1"><Keyboard className="w-3.5 h-3.5" /> Лучше напишу</button>
                {recorder.error && <ErrorNote message={recorder.error} />}
              </div>
            )}

            {item.type !== 'choice' && !voiceMode && (
              <div>
                {item.type === 'gap' ? (
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && submitText()}
                    placeholder="Пропущенное слово"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="c-input w-full rounded-xl px-4 py-3 text-[17px]"
                  />
                ) : (
                  <textarea
                    ref={inputRef}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        submitText();
                      }
                    }}
                    rows={3}
                    placeholder="Escribí en español…"
                    autoCorrect="off"
                    spellCheck={false}
                    className="c-input w-full rounded-xl px-4 py-3 text-[17px] resize-none"
                  />
                )}
                <div className="flex items-center justify-between gap-3 mt-3">
                  <button type="button" onClick={() => setShowHint((shown) => !shown)} className="text-sm c-muted inline-flex items-center gap-1.5 hover:opacity-80">
                    <Lightbulb className="w-4 h-4" /> Подсказка
                  </button>
                  <button type="button" onClick={submitText} disabled={checking || !value.trim()} className="c-btn-primary px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">
                    {checking ? <Spinner /> : <Send className="w-4 h-4" />} Проверить
                  </button>
                </div>
              </div>
            )}
            {showHint && item.hint_ru && <div className="mt-3 c-panel rounded-xl px-4 py-2.5 text-sm c-text">{item.hint_ru}</div>}
          </div>
        )}

        {answered && verdict && (
          <div className="mt-5 animate-fade-in">
            <div className={`rounded-xl px-4 py-3 ${verdict.className}`}>
              <div className="font-extrabold inline-flex items-center gap-1.5"><verdict.icon className="w-4 h-4" /> {verdict.title}
                {result.spot_delta ? <span className="text-xs font-bold ml-1 opacity-80">{result.spot_delta > 0 ? `+${result.spot_delta}` : result.spot_delta}</span> : null}
              </div>
              {result.answer && item.type !== 'choice' && <div className="text-[14px] mt-1 opacity-90">Ты: «{result.answer}»</div>}
              {result.feedback_ru && <div className="text-[14px] mt-1 c-text">{result.feedback_ru}</div>}
            </div>
            {(result.verdict !== 'correct' || item.type === 'speak') && !canRetry && (() => {
              const norm = (text) => String(text || '').toLowerCase().replace(/[¿?¡!.,;:"«»]/g, '').replace(/\s+/g, ' ').trim();
              // "Almost" and speaking answers: show her own sentence, minimally fixed.
              // Wrong answers: show the reference answer plus other accepted variants.
              const ownFixed = (result.verdict === 'almost' || item.type === 'speak') && result.corrected;
              const main = ownFixed ? result.corrected : answers[0];
              const others = item.type === 'choice' || item.type === 'speak'
                ? []
                : answers.filter((answer) => norm(answer) !== norm(main)).slice(0, 2);
              if (!main) return null;
              return (
                <div className="mt-3 text-[15px]">
                  <span className="c-muted">{ownFixed ? (item.type === 'speak' ? 'Твой ответ, но правильно: ' : 'Исправленный вариант: ') : 'Правильно: '}</span>
                  <span className="font-semibold c-good">{main}</span>
                  {others.length > 0 && <div className="text-[13px] c-muted mt-1">Также верно: {others.join(' · ')}</div>}
                </div>
              );
            })()}
            {explanation && !canRetry && <div className="mt-3 text-[13px] c-muted leading-snug">{explanation}</div>}

            <div className="flex flex-wrap gap-2 mt-5">
              {canRetry ? (
                <>
                  <button type="button" onClick={retry} className="c-btn-primary px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Ещё попытка</button>
                  <button type="button" onClick={reveal} className="c-btn-ghost px-5 py-2.5 rounded-xl font-semibold inline-flex items-center gap-2"><Eye className="w-4 h-4" /> Показать ответ</button>
                </>
              ) : (
                <button type="button" onClick={next} className="c-btn-primary px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">Дальше <ArrowRight className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        )}
        {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      </Card>
    </CoachPage>
  );
}
