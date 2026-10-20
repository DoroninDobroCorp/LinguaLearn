import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Dumbbell, EyeOff, Lightbulb, AlertTriangle, MapPin } from 'lucide-react';
import { coachApi } from '../../utils/coachApi';
import { BackLink, Card, CoachPage, ErrorNote, ScoreBar, SectionTitle, SpeakButton, Spinner, StatusPill, formatDate } from './CoachUI';

const GROUPS = [
  { status: 'active', title: 'Нужно внимание' },
  { status: 'improving', title: 'Улучшается' },
  { status: 'mastered', title: 'Освоено' },
];

export function CoachSpotsList() {
  const [spots, setSpots] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    coachApi.spots().then((data) => setSpots(data.spots)).catch((loadError) => setError(loadError.message));
  }, []);

  return (
    <CoachPage narrow>
      <BackLink to="/" label="Главная" />
      <h1 className="text-2xl sm:text-3xl font-extrabold c-text">Мои темы</h1>
      <p className="c-muted text-sm mt-1">Слабые места из твоих разговоров. Процент растёт, когда ты правильно используешь тему в разговоре и в тренировках, и падает, когда ошибка повторяется.</p>
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {!spots && !error && <div className="py-16 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}
      {spots && spots.length === 0 && (
        <Card className="p-5 mt-5"><p className="c-text">Пока пусто — поговори с Лусией, и здесь появятся твои темы.</p></Card>
      )}
      {spots && GROUPS.map((group) => {
        const items = spots.filter((spot) => spot.status === group.status);
        if (!items.length) return null;
        return (
          <div key={group.status}>
            <SectionTitle>{group.title} · {items.length}</SectionTitle>
            <div className="grid gap-2.5">
              {items.map((spot) => (
                <Link key={spot.id} to={`/coach/spots/${spot.id}`} className="c-card rounded-2xl p-4 block hover:opacity-95">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold c-text">{spot.title_ru}</div>
                      {spot.title_es && <div className="text-xs c-faint mt-0.5">{spot.title_es}</div>}
                    </div>
                    <span className="text-sm font-extrabold c-text">{spot.score}%</span>
                  </div>
                  <div className="mt-2.5"><ScoreBar score={spot.score} size="sm" /></div>
                  <div className="text-xs c-muted mt-2">ошибок: {spot.error_count} · удачных употреблений: {spot.success_count}</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </CoachPage>
  );
}

export function CoachSpotDetail() {
  const { spotId } = useParams();
  const navigate = useNavigate();
  const [spot, setSpot] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [lessonError, setLessonError] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    coachApi.spot(spotId).then(setSpot).catch((loadError) => setError(loadError.message));
    coachApi.lesson(spotId).then((data) => setLesson(data.lesson)).catch((loadError) => setLessonError(loadError.message));
  }, [spotId]);

  const train = async () => {
    setStarting(true);
    try {
      const { id } = await coachApi.createWorkout([spot.spot_key]);
      navigate(`/coach/workout/${id}`);
    } catch (trainError) {
      setError(trainError.message);
      setStarting(false);
    }
  };

  const archive = async () => {
    if (!window.confirm('Скрыть эту тему? Она вернётся, если ошибка повторится в разговоре.')) return;
    await coachApi.archiveSpot(spot.id).catch(() => {});
    navigate('/coach/spots', { replace: true });
  };

  if (!spot) {
    return <CoachPage narrow><BackLink to="/coach/spots" label="Мои темы" />{error ? <ErrorNote message={error} /> : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}</CoachPage>;
  }

  return (
    <CoachPage narrow>
      <BackLink to="/coach/spots" label="Мои темы" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold c-text leading-tight">{spot.title_ru}</h1>
          {spot.title_es && <div className="text-sm c-muted mt-0.5">{spot.title_es}</div>}
        </div>
        <StatusPill status={spot.status} />
      </div>

      <Card className="p-5 mt-4">
        <div className="flex items-center gap-3">
          <ScoreBar score={spot.score} />
          <span className="font-extrabold c-text">{spot.score}%</span>
        </div>
        {spot.description_ru && <p className="c-text text-[15px] mt-3 leading-relaxed">{spot.description_ru}</p>}
        <div className="text-xs c-muted mt-2">Впервые: {formatDate(spot.first_seen_at)} · ошибок в разговорах: {spot.error_count} · правильно в разговорах: {spot.success_count} · в тренировках: {spot.drill_correct} ✓ / {spot.drill_wrong} ✗</div>
        <button type="button" onClick={train} disabled={starting} className="c-btn-primary mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold inline-flex items-center justify-center gap-2">
          {starting ? <Spinner /> : <Dumbbell className="w-4 h-4" />} Тренировка по этой теме
        </button>
      </Card>

      <SectionTitle>Правило коротко</SectionTitle>
      {!lesson && !lessonError && <Card className="p-6 flex items-center gap-3 c-muted text-sm"><Spinner /> Готовлю объяснение на твоих примерах…</Card>}
      {lessonError && <ErrorNote message={lessonError} />}
      {lesson && (
        <Card className="p-5 space-y-4">
          {lesson.pattern && <div className="c-bg-accent rounded-xl px-4 py-2.5 font-bold text-[15px]">{lesson.pattern}</div>}
          <p className="c-text text-[15px] leading-relaxed whitespace-pre-line">{lesson.rule_ru}</p>
          {lesson.contrast?.length > 0 && (
            <div className="space-y-2.5">
              {lesson.contrast.map((pair, index) => (
                <div key={index} className="c-panel rounded-xl px-4 py-3">
                  <div className="text-[15px]"><span className="line-through c-bad">{pair.wrong}</span></div>
                  <div className="text-[15px] font-semibold c-good mt-0.5">{pair.right} <SpeakButton text={pair.right} speechKey={`c-${spot.id}-${index}`} className="ml-1 align-middle" /></div>
                  {pair.note_ru && <div className="text-[13px] c-muted mt-1">{pair.note_ru}</div>}
                </div>
              ))}
            </div>
          )}
          {lesson.examples?.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider c-muted mb-2">Примеры</div>
              <ul className="space-y-2">
                {lesson.examples.map((example, index) => (
                  <li key={index} className="text-[15px]">
                    <span className="c-text">{example.es}</span>
                    <SpeakButton text={example.es} speechKey={`e-${spot.id}-${index}`} className="ml-2 align-middle" />
                    <div className="text-[13px] c-muted">{example.ru}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lesson.russian_trap_ru && <div className="flex gap-2.5 text-[14px] c-text"><AlertTriangle className="w-4 h-4 c-warn flex-shrink-0 mt-0.5" /><span><b>Ловушка для русскоязычных.</b> {lesson.russian_trap_ru}</span></div>}
          {lesson.rioplatense_note_ru && <div className="flex gap-2.5 text-[14px] c-text"><MapPin className="w-4 h-4 c-accent flex-shrink-0 mt-0.5" /><span><b>В Аргентине.</b> {lesson.rioplatense_note_ru}</span></div>}
          {lesson.tip_ru && <div className="flex gap-2.5 text-[14px] c-text"><Lightbulb className="w-4 h-4 c-good flex-shrink-0 mt-0.5" /><span>{lesson.tip_ru}</span></div>}
        </Card>
      )}

      {spot.errors?.length > 0 && (
        <>
          <SectionTitle>Твои ошибки</SectionTitle>
          <Card className="p-5 space-y-3">
            {spot.errors.map((item, index) => (
              <div key={index}>
                <div className="text-[15px]">
                  <span className="line-through c-bad">{item.original}</span>
                  <span className="c-faint mx-1.5">→</span>
                  <span className="c-good font-semibold">{item.corrected}</span>
                </div>
                <div className="text-[12px] c-faint mt-0.5">{formatDate(item.created_at)}{item.explanation_ru ? ` · ${item.explanation_ru}` : ''}</div>
              </div>
            ))}
          </Card>
        </>
      )}

      {spot.successes?.length > 0 && (
        <>
          <SectionTitle>Уже получается</SectionTitle>
          <Card className="p-5 space-y-2">
            {spot.successes.map((item, index) => (
              <div key={index} className="text-[15px] c-good">«{item.original}» <span className="text-[12px] c-faint">{formatDate(item.created_at)}</span></div>
            ))}
          </Card>
        </>
      )}

      <button type="button" onClick={archive} className="mt-6 text-sm c-muted inline-flex items-center gap-1.5 hover:opacity-80">
        <EyeOff className="w-4 h-4" /> Это не моя проблема — скрыть тему
      </button>
      {error && <div className="mt-3"><ErrorNote message={error} /></div>}
    </CoachPage>
  );
}
