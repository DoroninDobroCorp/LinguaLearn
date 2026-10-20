import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, BookMarked, Brain, ChevronDown, ChevronUp, Dumbbell, MessageCircle, Sparkles, ThumbsUp, TrendingDown, TrendingUp } from 'lucide-react';
import { coachApi } from '../../utils/coachApi';
import { BackLink, Card, CoachPage, ErrorNote, PartnerAvatar, ScoreBar, SectionTitle, SpeakButton, Spinner, formatDate, plural } from './CoachUI';

const SEVERITY_DOT = { high: 'var(--c-bad)', medium: 'var(--c-warn)', low: 'var(--c-faint)' };

function ScoreRow({ label, value }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="c-muted">{label}</span><span className="font-bold c-text">{value}/5</span></div>
      <ScoreBar score={(value / 5) * 100} size="sm" tone={value >= 4 ? 'good' : value === 3 ? 'warn' : 'bad'} />
    </div>
  );
}

export default function CoachReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [workout, setWorkout] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [startingWorkout, setStartingWorkout] = useState(false);
  const [polls, setPolls] = useState(0);

  const load = useCallback(async () => {
    try {
      const detail = await coachApi.session(sessionId);
      setSession(detail);
      if (detail.workout_id) {
        const workoutDetail = await coachApi.workout(detail.workout_id);
        setWorkout(workoutDetail);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the analysis or the follow-up workout is still being prepared.
  useEffect(() => {
    const waiting = session && (session.status === 'analyzing' || session.status === 'active' || workout?.status === 'generating' || (session.status === 'analyzed' && !session.workout_id && session.analysis?.spot_changes?.length));
    if (!waiting || polls > 60) return undefined;
    const timer = setTimeout(() => {
      setPolls((count) => count + 1);
      load();
    }, 3500);
    return () => clearTimeout(timer);
  }, [session, workout, load, polls]);

  const retry = async () => {
    setRetrying(true);
    setError('');
    try {
      setSession(await coachApi.retryAnalysis(sessionId));
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setRetrying(false);
    }
  };

  const startWorkout = async () => {
    if (workout && workout.status !== 'failed') {
      navigate(`/coach/workout/${workout.id}`);
      return;
    }
    setStartingWorkout(true);
    try {
      const keys = (session.analysis?.next_focus?.length ? session.analysis.next_focus : session.analysis?.spot_changes || []).map((spot) => spot.spot_key).slice(0, 3);
      const { id } = await coachApi.createWorkout(keys);
      navigate(`/coach/workout/${id}`);
    } catch (workoutError) {
      setError(workoutError.message);
    } finally {
      setStartingWorkout(false);
    }
  };

  const report = session?.analysis;
  const errorsBySpot = useMemo(() => {
    const groups = new Map();
    for (const item of report?.errors || []) {
      if (!groups.has(item.spot_key)) groups.set(item.spot_key, { title: item.spot_title_ru, items: [] });
      groups.get(item.spot_key).items.push(item);
    }
    return [...groups.entries()];
  }, [report]);
  const spotIdByKey = useMemo(() => new Map((report?.spot_changes || []).map((spot) => [spot.spot_key, spot.id])), [report]);

  if (!session) {
    return <CoachPage narrow>{error ? <ErrorNote message={error} onRetry={load} /> : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}</CoachPage>;
  }

  const title = session.scenario?.title_ru || session.topic?.title_ru || 'Разговор';
  const header = (
    <>
      <BackLink to="/" label="Главная" />
      <div className="flex items-center gap-3">
        <span className="text-2xl">{session.scenario?.emoji || session.topic?.emoji || '💬'}</span>
        <div>
          <h1 className="text-2xl font-extrabold c-text leading-tight">Разбор: {title}</h1>
          <div className="text-sm c-muted">
            {session.mode === 'call' ? 'Звонок' : 'Чат'} с {session.partner?.name} · {formatDate(session.started_at)}
            {session.stats ? ` · ${session.stats.words} ${plural(session.stats.words, 'слово', 'слова', 'слов')}, ${session.stats.minutes} мин` : ''}
          </div>
        </div>
      </div>
    </>
  );

  if (session.status === 'active' || session.status === 'analyzing') {
    return (
      <CoachPage narrow>
        {header}
        <Card className="p-8 mt-6 text-center">
          <PartnerAvatar name={session.partner?.name} size={56} speaking />
          <div className="font-extrabold c-text text-lg mt-4">Готовлю разбор…</div>
          <div className="c-muted text-sm mt-1">Перечитываю разговор и отделяю настоящие ошибки от аргентинских особенностей. Обычно 15–40 секунд.</div>
        </Card>
      </CoachPage>
    );
  }

  if (session.status === 'empty') {
    return (
      <CoachPage narrow>
        {header}
        <Card className="p-6 mt-6">
          <p className="c-text">В этом разговоре не было твоих реплик — разбирать нечего.</p>
          <Link to="/coach/new" className="c-btn-primary inline-flex mt-4 px-5 py-2.5 rounded-xl font-bold">Начать новый разговор</Link>
        </Card>
      </CoachPage>
    );
  }

  if (session.status === 'failed' || !report) {
    return (
      <CoachPage narrow>
        {header}
        <Card className="p-6 mt-6">
          <p className="c-text font-semibold">Разбор не получился — нейросеть была перегружена.</p>
          <p className="c-muted text-sm mt-1">Разговор сохранён, можно повторить разбор.</p>
          <button type="button" onClick={retry} disabled={retrying} className="c-btn-primary mt-4 px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">
            {retrying && <Spinner />} Повторить разбор
          </button>
          <div className="mt-3"><ErrorNote message={error} /></div>
        </Card>
      </CoachPage>
    );
  }

  const workoutLabel = workout?.status === 'ready'
    ? `${workout.total} заданий из твоих фраз`
    : workout?.status === 'generating' ? 'Собираю задания…' : 'Задания из твоих фраз';

  return (
    <CoachPage narrow>
      {header}

      <Card className="p-5 mt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="c-text text-[15px] leading-relaxed">{report.summary_ru}</p>
          {report.cefr_estimate && <span className="text-xs font-bold px-2.5 py-1 rounded-full c-bg-accent whitespace-nowrap">≈ {report.cefr_estimate}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 mt-5">
          <ScoreRow label="Грамматика" value={report.scores.grammar} />
          <ScoreRow label="Словарь" value={report.scores.vocabulary} />
          <ScoreRow label="Беглость" value={report.scores.fluency} />
          <ScoreRow label="Диалог" value={report.scores.interaction} />
        </div>
      </Card>

      {report.spot_changes.length > 0 && (
        <Card className="p-5 mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: 'var(--c-accent)' }}>
          <div className="flex items-start gap-3">
            <Dumbbell className="w-5 h-5 c-accent flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-extrabold c-text">Закрепить прямо сейчас</div>
              <div className="text-sm c-muted">{workoutLabel} · ~5 минут</div>
            </div>
          </div>
          <button type="button" onClick={startWorkout} disabled={startingWorkout || workout?.status === 'generating'} className="c-btn-primary px-5 py-2.5 rounded-xl font-bold inline-flex items-center justify-center gap-2">
            {(startingWorkout || workout?.status === 'generating') && <Spinner />} Начать тренировку
          </button>
        </Card>
      )}

      {report.strengths_ru.length > 0 && (
        <>
          <SectionTitle>Что получилось</SectionTitle>
          <Card className="p-5 space-y-2.5">
            {report.strengths_ru.map((item, index) => (
              <div key={index} className="flex gap-2.5 text-[14px] c-text leading-snug"><ThumbsUp className="w-4 h-4 c-good flex-shrink-0 mt-0.5" /><span>{item}</span></div>
            ))}
            {report.successes.map((item, index) => (
              <div key={`s-${index}`} className="flex gap-2.5 text-[14px] c-text leading-snug">
                <TrendingUp className="w-4 h-4 c-good flex-shrink-0 mt-0.5" />
                <span><b>{item.spot_title_ru}:</b> «{item.example}» {item.note_ru && <span className="c-muted">— {item.note_ru}</span>}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>{report.errors.length ? `Твои ошибки · ${report.errors.length}` : 'Ошибки'}</SectionTitle>
      {report.errors.length === 0 ? (
        <Card className="p-5"><p className="c-text">Ошибок, которые стоило бы разбирать, не нашлось. Отличный разговор!</p></Card>
      ) : (
        <div className="space-y-3">
          {errorsBySpot.map(([key, group]) => (
            <Card key={key} className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-extrabold c-text">{group.title}</div>
                {spotIdByKey.get(key) && (
                  <Link to={`/coach/spots/${spotIdByKey.get(key)}`} className="text-xs font-bold c-accent inline-flex items-center gap-0.5 whitespace-nowrap">Правило <ArrowUpRight className="w-3.5 h-3.5" /></Link>
                )}
              </div>
              <ul className="space-y-3.5">
                {group.items.map((item, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: SEVERITY_DOT[item.severity] }} />
                    <div className="min-w-0">
                      <div className="text-[15px]">
                        <span className="line-through c-bad">{item.original}</span>
                        <span className="c-faint mx-1.5">→</span>
                        <span className="c-good font-semibold">{item.corrected}</span>
                        <SpeakButton text={item.corrected} speechKey={`r-${key}-${index}`} className="ml-2 align-middle" />
                      </div>
                      <div className="text-[13px] c-muted mt-0.5 leading-snug">{item.explanation_ru}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {report.retracted?.length > 0 && (
        <>
          <SectionTitle>Уточнения к подсказкам в чате</SectionTitle>
          <Card className="p-5 space-y-2.5">
            {report.retracted.map((item, index) => (
              <div key={index} className="text-[14px] c-text leading-snug">
                <span className="c-good font-semibold">«{item.original}»</span> — это тоже правильно. <span className="c-muted">{item.note_ru}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {report.avoidance.length > 0 && (
        <>
          <SectionTitle>Чего ты избегала</SectionTitle>
          <Card className="p-5 space-y-2.5">
            {report.avoidance.map((item, index) => (
              <div key={index} className="text-[14px] c-text leading-snug"><b>{item.spot_title_ru}.</b> <span className="c-muted">{item.note_ru}</span></div>
            ))}
          </Card>
        </>
      )}

      {report.spot_changes.length > 0 && (
        <>
          <SectionTitle>Как изменилась карта тем</SectionTitle>
          <Card className="p-5 space-y-3">
            {report.spot_changes.map((spot) => (
              <Link key={spot.id} to={`/coach/spots/${spot.id}`} className="block hover:opacity-90">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="c-text font-semibold">{spot.title_ru}{spot.is_new && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded c-bg-accent align-middle">новая</span>}</span>
                  <span className="text-xs font-bold whitespace-nowrap inline-flex items-center gap-1">
                    {spot.before !== null && spot.after > spot.before && <TrendingUp className="w-3.5 h-3.5 c-good" />}
                    {spot.before !== null && spot.after < spot.before && <TrendingDown className="w-3.5 h-3.5 c-bad" />}
                    <span className="c-muted">{spot.before !== null ? `${spot.before} → ` : ''}{spot.after}%</span>
                  </span>
                </div>
                <div className="mt-1.5"><ScoreBar score={spot.after} size="sm" /></div>
              </Link>
            ))}
          </Card>
        </>
      )}

      {report.vocabulary.length > 0 && (
        <>
          <SectionTitle action={<Link to="/vocabulary" className="text-sm font-semibold c-accent inline-flex items-center gap-1"><BookMarked className="w-4 h-4" /> Словарь</Link>}>
            Новые слова · добавлены в «Из разговоров»
          </SectionTitle>
          <Card className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
            {report.vocabulary.map((item, index) => (
              <div key={index} className="px-5 py-3" style={{ borderColor: 'var(--c-border)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-bold c-text">{item.word} <SpeakButton text={item.word} speechKey={`v-${index}`} className="ml-1 align-middle" /></span>
                  <span className="text-sm c-muted text-right">{item.translation_ru}</span>
                </div>
                {item.example && <div className="text-[13px] c-text italic mt-0.5">{item.example}</div>}
                {item.reason_ru && <div className="text-[12px] c-faint mt-0.5">{item.reason_ru}</div>}
              </div>
            ))}
          </Card>
        </>
      )}

      {report.memory_added?.length > 0 && (
        <Card className="p-4 mt-6 flex gap-3 items-start">
          <Brain className="w-5 h-5 c-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm c-text">
            <b>{session.partner?.name || 'Лусия'} запомнила:</b> {report.memory_added.join(' ')}
            <Link to="/coach/settings" className="block text-xs c-muted mt-1 underline underline-offset-2">Что она знает обо мне</Link>
          </div>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <Link to="/coach/new?mode=chat" className="c-card rounded-2xl p-4 flex items-start gap-3 hover:opacity-95">
          <MessageCircle className="w-5 h-5 c-accent flex-shrink-0 mt-0.5" />
          <span>
            <span className="block font-bold c-text">Поговорить ещё</span>
            {report.next_topic_ru && <span className="block text-[13px] c-muted mt-0.5 leading-snug">{report.next_topic_ru}</span>}
          </span>
        </Link>
        <button type="button" onClick={() => setShowTranscript((value) => !value)} className="c-card rounded-2xl p-4 flex items-start gap-3 text-left hover:opacity-95">
          <Sparkles className="w-5 h-5 c-accent flex-shrink-0 mt-0.5" />
          <span className="flex-1">
            <span className="block font-bold c-text">Весь разговор</span>
            <span className="block text-[13px] c-muted mt-0.5">{session.messages.length} {plural(session.messages.length, 'сообщение', 'сообщения', 'сообщений')}</span>
          </span>
          {showTranscript ? <ChevronUp className="w-4 h-4 c-muted" /> : <ChevronDown className="w-4 h-4 c-muted" />}
        </button>
      </div>

      {showTranscript && (
        <Card className="p-4 mt-3 space-y-2.5">
          {session.messages.map((message) => (
            <div key={message.id} className={`text-[14px] leading-snug ${message.role === 'user' ? 'text-right' : ''}`}>
              <span className={`inline-block rounded-xl px-3 py-1.5 max-w-[90%] text-left ${message.role === 'user' ? 'c-bubble-me' : 'c-bubble-them'}`}>{message.content}</span>
            </div>
          ))}
        </Card>
      )}

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
    </CoachPage>
  );
}
