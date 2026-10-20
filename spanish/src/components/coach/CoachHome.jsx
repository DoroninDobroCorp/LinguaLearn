import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Phone, Dumbbell, ChevronRight, Sparkles, ArrowRight, Settings } from 'lucide-react';
import { coachApi } from '../../utils/coachApi';
import { useProfile } from '../../contexts/ProfileContext';
import CoachOnboarding from './CoachOnboarding';
import { Card, CoachPage, ErrorNote, ScoreBar, SectionTitle, Spinner, StatusPill, formatDate, plural } from './CoachUI';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Buenas noches';
  if (hour < 12) return 'Buen día';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function Sparkline({ points }) {
  const values = points.map((point) => point.errors_per_100_words).filter((value) => value !== null && value !== undefined);
  if (values.length < 2) return null;
  const width = 120;
  const height = 36;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${(height - 4 - (value / max) * (height - 8)).toFixed(1)}`).join(' ');
  const improving = values[values.length - 1] <= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={improving ? 'var(--c-good)' : 'var(--c-bad)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScoresGrid({ scores }) {
  if (!scores) return null;
  const rows = [
    ['Грамматика', scores.grammar],
    ['Словарь', scores.vocabulary],
    ['Беглость', scores.fluency],
    ['Диалог', scores.interaction],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="flex justify-between text-xs mb-1"><span className="c-muted">{label}</span><span className="font-bold c-text">{value}/5</span></div>
          <ScoreBar score={(value / 5) * 100} size="sm" tone={value >= 4 ? 'good' : value === 3 ? 'warn' : 'bad'} />
        </div>
      ))}
    </div>
  );
}

export default function CoachHome() {
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [startingWorkout, setStartingWorkout] = useState(false);

  const load = useCallback(() => {
    setError('');
    coachApi.dashboard().then(setData).catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data?.open_workout?.status !== 'generating') return undefined;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [data, load]);

  const openWorkout = async () => {
    if (data?.open_workout && data.open_workout.status !== 'failed') {
      navigate(`/coach/workout/${data.open_workout.id}`);
      return;
    }
    setStartingWorkout(true);
    try {
      const { id } = await coachApi.nextWorkout();
      navigate(`/coach/workout/${id}`);
    } catch (workoutError) {
      setError(workoutError.message);
    } finally {
      setStartingWorkout(false);
    }
  };

  if (error && !data) {
    return <CoachPage narrow><ErrorNote message={error} onRetry={load} /></CoachPage>;
  }
  if (!data) {
    return <CoachPage narrow><div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div></CoachPage>;
  }
  if (!data.learner.onboarded) {
    return (
      <CoachPage narrow>
        <CoachOnboarding initialName={activeProfile?.name} initial={data.learner} onDone={() => navigate('/coach/new?mode=chat')} />
      </CoachPage>
    );
  }

  const { learner, spots, focus, sessions, active_session: activeSession, open_workout: workout, last_report: lastReport, trend, totals } = data;
  const visibleSpots = spots.filter((spot) => spot.status !== 'mastered').slice(0, 5);
  const masteredCount = spots.filter((spot) => spot.status === 'mastered').length;
  const lastTrend = trend[trend.length - 1];

  return (
    <CoachPage>
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[26px] sm:text-3xl font-extrabold c-text leading-tight">{greeting()}, {learner.display_name}</h1>
          <Link to="/coach/settings" className="c-muted hover:opacity-80 p-1.5 -mr-1.5 mt-0.5" aria-label="Настройки разговоров"><Settings className="w-5 h-5" /></Link>
        </div>
        <p className="c-muted mt-1 text-[15px]">
          {totals.sessions
            ? `${totals.sessions} ${plural(totals.sessions, 'разговор', 'разговора', 'разговоров')} · ${totals.words} ${plural(totals.words, 'слово', 'слова', 'слов')} по-испански`
            : 'Начни с короткого разговора — 5–10 минут достаточно для первого разбора.'}
        </p>
      </header>

      {activeSession && (
        <Link to={`/coach/chat/${activeSession.id}`} className="c-card rounded-2xl px-4 py-3 mb-3 flex items-center justify-between gap-3 hover:opacity-95">
          <span className="text-sm c-text"><b>Незаконченный разговор</b> <span className="c-muted">· {formatDate(activeSession.started_at)}</span></span>
          <span className="text-sm font-bold c-accent inline-flex items-center gap-1">Продолжить <ChevronRight className="w-4 h-4" /></span>
        </Link>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Link to="/coach/new?mode=chat" className="c-card rounded-2xl p-5 flex items-start gap-4 hover:-translate-y-0.5 transition-transform">
          <span className="w-11 h-11 rounded-xl c-bg-accent flex items-center justify-center flex-shrink-0"><MessageCircle className="w-5 h-5" /></span>
          <span>
            <span className="block font-extrabold c-text text-[17px]">Поболтать с Лусией</span>
            <span className="block c-muted text-sm mt-0.5">Текстом и голосовыми, с подсказками и исправлениями</span>
          </span>
        </Link>
        <Link to="/coach/new?mode=call" className="c-card rounded-2xl p-5 flex items-start gap-4 hover:-translate-y-0.5 transition-transform">
          <span className="w-11 h-11 rounded-xl c-bg-good flex items-center justify-center flex-shrink-0"><Phone className="w-5 h-5" /></span>
          <span>
            <span className="block font-extrabold c-text text-[17px]">Позвонить</span>
            <span className="block c-muted text-sm mt-0.5">Живой разговор голосом, как по телефону. Разбор — после звонка</span>
          </span>
        </Link>
      </div>

      {(workout || spots.length > 0) && (
        <Card className="mt-3 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-4">
            <span className="w-11 h-11 rounded-xl c-bg-warn flex items-center justify-center flex-shrink-0"><Dumbbell className="w-5 h-5" /></span>
            <div>
              <div className="font-extrabold c-text text-[17px]">Тренировка на твои ошибки</div>
              <div className="c-muted text-sm mt-0.5">
                {workout?.status === 'generating' && 'Собираю задания из твоих фраз…'}
                {workout?.status === 'ready' && `${workout.total} заданий${workout.answered ? ` · сделано ${workout.answered}` : ''} · ~${Math.max(3, Math.round(workout.total * 0.7))} мин`}
                {(!workout || workout.status === 'failed') && `Темы: ${focus.map((spot) => spot.title_ru).join(', ')}`}
              </div>
            </div>
          </div>
          <button type="button" onClick={openWorkout} disabled={startingWorkout} className="c-btn-primary px-5 py-2.5 rounded-xl font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap">
            {(startingWorkout || workout?.status === 'generating') && <Spinner />}
            {workout?.status === 'ready' && workout.answered ? 'Продолжить' : 'Начать'}
          </button>
        </Card>
      )}

      {error && <div className="mt-3"><ErrorNote message={error} /></div>}

      <SectionTitle action={spots.length > 0 && <Link to="/coach/spots" className="text-sm font-semibold c-accent">Все темы</Link>}>
        Над чем работаем
      </SectionTitle>
      {visibleSpots.length === 0 ? (
        <Card className="p-5">
          <p className="c-text text-[15px] leading-relaxed">
            {spots.length
              ? `Все отмеченные темы освоены (${masteredCount}). Поговори ещё — посмотрим, что всплывёт.`
              : 'Пока пусто. После первого разговора здесь появятся твои реальные слабые места — с твоими же фразами и прогрессом по каждой теме.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-2.5">
          {visibleSpots.map((spot) => (
            <Link key={spot.id} to={`/coach/spots/${spot.id}`} className="c-card rounded-2xl p-4 block hover:opacity-95">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold c-text">{spot.title_ru}</div>
                  {spot.example && (
                    <div className="text-sm mt-1 truncate">
                      <span className="line-through c-bad opacity-80">{spot.example.original}</span>
                      <span className="c-faint mx-1.5">→</span>
                      <span className="c-good font-semibold">{spot.example.corrected}</span>
                    </div>
                  )}
                </div>
                <StatusPill status={spot.status} />
              </div>
              <div className="flex items-center gap-3 mt-3">
                <ScoreBar score={spot.score} size="sm" />
                <span className="text-xs font-bold c-muted w-9 text-right">{spot.score}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totals.sessions > 0 && (
        <>
          <SectionTitle>Прогресс</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs c-muted">Ошибок на 100 слов (последний разговор)</div>
                  <div className="text-3xl font-extrabold c-text mt-1">{lastTrend?.errors_per_100_words ?? '—'}</div>
                </div>
                <Sparkline points={trend} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="c-panel rounded-xl py-2"><div className="font-extrabold c-text">{totals.minutes}</div><div className="text-[11px] c-muted">минут</div></div>
                <div className="c-panel rounded-xl py-2"><div className="font-extrabold c-text">{totals.workouts}</div><div className="text-[11px] c-muted">{plural(totals.workouts, 'тренировка', 'тренировки', 'тренировок')}</div></div>
                <div className="c-panel rounded-xl py-2"><div className="font-extrabold c-text">{masteredCount}</div><div className="text-[11px] c-muted">освоено</div></div>
              </div>
            </Card>
            {lastReport && (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs c-muted">Последний разбор</div>
                  {lastReport.cefr_estimate && <span className="text-xs font-bold px-2 py-0.5 rounded-full c-bg-accent">≈ {lastReport.cefr_estimate}</span>}
                </div>
                <ScoresGrid scores={lastReport.scores} />
                {lastReport.next_topic_ru && (
                  <Link to="/coach/new?mode=chat" className="mt-4 flex items-start gap-2 text-sm c-text hover:opacity-90">
                    <Sparkles className="w-4 h-4 c-accent flex-shrink-0 mt-0.5" />
                    <span><span className="c-muted">Идея для следующего разговора: </span>{lastReport.next_topic_ru}</span>
                  </Link>
                )}
              </Card>
            )}
          </div>

          <SectionTitle>История</SectionTitle>
          <div className="grid gap-2">
            {sessions.filter((session) => session.status !== 'empty').map((session) => {
              const title = session.scenario?.title_ru || session.topic?.title_ru || 'Разговор';
              const emoji = session.scenario?.emoji || session.topic?.emoji || '💬';
              const to = session.status === 'active'
                ? (session.mode === 'call' ? `/coach/report/${session.id}` : `/coach/chat/${session.id}`)
                : `/coach/report/${session.id}`;
              return (
                <Link key={session.id} to={to} className="c-card rounded-2xl px-4 py-3 flex items-center gap-3 hover:opacity-95">
                  <span className="text-xl w-7 text-center">{emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold c-text text-sm">
                      {title} <span className="c-muted font-normal">· {session.mode === 'call' ? 'звонок' : 'чат'} · {formatDate(session.started_at)}</span>
                    </span>
                    <span className="block c-muted text-xs truncate mt-0.5">
                      {session.status === 'analyzed' ? session.summary_ru : session.status === 'active' ? 'не завершён' : session.status === 'failed' ? 'разбор не удался — открой, чтобы повторить' : 'разбирается…'}
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 c-faint flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </CoachPage>
  );
}
