import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  ArrowRight,
  Check,
  Mic,
  Square,
  Lightbulb,
} from "lucide-react";
import { booksApi } from "../../utils/booksApi";
import { blobToBase64 } from "../../utils/coachApi";
import {
  useVoiceRecorder,
  isVoiceRecordingSupported,
} from "../../hooks/useVoiceRecorder";
import {
  BackLink,
  Card,
  CoachPage,
  ErrorNote,
  Spinner,
  SpeakButton,
} from "../coach/CoachUI";
const btn =
  "c-btn-primary px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50";
const secondary =
  "c-panel px-4 py-2.5 rounded-xl font-semibold text-sm c-text disabled:opacity-50";
export function BookReminder({ text }) {
  return (
    <aside
      className="c-bg-accent rounded-2xl p-4 text-sm leading-relaxed mt-4"
      aria-label="Можно попросить изменения"
    >
      {text ||
        "Наталия, ты можешь попросить любые изменения, которые тебе хочется: темы, темп, задания, объяснения, голос и оформление. Расскажи об этом в чате, где мы настраиваем LinguaLearn."}
    </aside>
  );
}
function ProgressBar({ percent }) {
  return (
    <div
      className="h-2 c-track rounded-full overflow-hidden mt-3"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, background: "var(--c-accent)" }}
      />
    </div>
  );
}
export function BooksHomeCard() {
  return (
    <Card className="p-5 mt-4">
      <Link to="/books" className="flex items-center justify-between gap-3">
        <span>
          <span className="font-extrabold c-text text-lg">Мои книги</span>
          <span className="block c-muted text-sm mt-1">
            Nivel 2 и грамматика A1–B2 · занятия, прогресс и повторение
          </span>
        </span>
        <BookOpen className="w-7 h-7 c-accent shrink-0" />
      </Link>
      <BookReminder />
    </Card>
  );
}
export function BooksHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    booksApi
      .dashboard()
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  if (!data)
    return (
      <CoachPage>
        <BackLink />
        <ErrorNote message={error} onRetry={load} />
        {!error && <Spinner />}
      </CoachPage>
    );
  const next = data.lessons.find((l) => l.id === data.next_lesson);
  return (
    <CoachPage>
      <BackLink label="Главная" />
      <h1 className="text-3xl font-extrabold c-text">Мои книги</h1>
      <p className="c-muted mt-2">
        Два маршрута в твоём темпе. Открытая страница не считается освоенной
        темой.
      </p>
      <BookReminder text={data.reminder} />
      <Card className="p-5 mt-4">
        <div className="text-sm c-muted">
          {next.progress.due ? "Пора повторить" : "Предложение на сегодня"}
        </div>
        <h2 className="font-bold c-text text-lg mt-1">{next.title}</h2>
        <Link to={`/books/lesson/${next.id}`} className={`${btn} mt-3`}>
          Продолжить <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="text-xs c-muted mt-2">
          {data.due.length
            ? `Тем для повторения: ${data.due.length}`
            : "Занятие можно прервать и продолжить позже."}
        </p>
      </Card>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {data.books.map((b) => (
          <Card key={b.id} className="p-5">
            <BookOpen className="w-6 h-6 c-accent mb-3" />
            <h2 className="font-extrabold c-text text-xl">{b.title}</h2>
            <p className="text-sm c-muted mt-1">{b.subtitle}</p>
            <ProgressBar percent={b.percent} />
            <div className="font-semibold c-text text-sm mt-2">
              Пройдено {b.completed} из {b.total} занятий · {b.percent}%
            </div>
            <p className="c-muted text-sm mt-1">
              Закреплено: {b.mastered} · изучала раньше: {b.self_reported}
            </p>
            <p className="text-sm c-text mt-3">
              Дальше:{" "}
              {data.lessons.find((l) => l.id === b.current_lesson)?.title}
            </p>
            <div className="flex gap-2 flex-wrap mt-3">
              <Link to={`/books/lesson/${b.current_lesson}`} className={btn}>
                Продолжить книгу
              </Link>
              <Link to={`/books/${b.id}`} className={secondary}>
                Оглавление
              </Link>
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-5 mt-4 text-sm c-muted leading-relaxed">
        «Пройдено» — чтение и завершённая практика. «Закреплено» — не менее 80%
        самостоятельно, новая успешная проверка спустя минимум 3 дня и
        подтверждённое применение темы в разговоре. Это показатели занятий, а не
        сертификат уровня языка.
      </Card>
    </CoachPage>
  );
}
export function BookOutline() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [startId, setStartId] = useState("");
  const [markEarlier, setMarkEarlier] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setData(null);
    setError("");
    booksApi
      .dashboard()
      .then((d) => {
        setData(d);
        setStartId(d.books.find((b) => b.id === bookId)?.current_lesson || "");
      })
      .catch((e) => setError(e.message));
  }, [bookId]);
  const book = data?.books.find((b) => b.id === bookId);
  const lessons = data?.lessons.filter((l) => l.book_id === bookId) || [];
  const start = async () => {
    setSaving(true);
    try {
      await booksApi.start(bookId, startId, markEarlier);
      navigate(`/books/lesson/${startId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <CoachPage>
      <BackLink to="/books" label="Все книги" />
      <ErrorNote message={error} />
      {!data && !error && <Spinner />}
      {data && !book && <p className="c-text">Книга не найдена.</p>}
      {book && (
        <>
          <h1 className="text-2xl font-extrabold c-text">{book.title}</h1>
          <p className="c-muted mt-1">{book.subtitle}</p>
          <ProgressBar percent={book.percent} />
          <p className="c-text text-sm mt-2">
            Пройдено {book.completed}/{book.total} · закреплено {book.mastered}
          </p>
          <details className="c-card rounded-2xl p-4 mt-4">
            <summary className="font-bold c-text cursor-pointer">
              Выбрать точку старта / уже занималась
            </summary>
            <label className="block text-sm c-muted mt-3">
              Продолжить с занятия
              <select
                aria-label="Точка старта"
                value={startId}
                onChange={(e) => setStartId(e.target.value)}
                className="c-panel block w-full mt-1 rounded-lg p-2 c-text"
              >
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.unit}. {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex gap-2 text-sm c-muted mt-3">
              <input
                type="checkbox"
                checked={markEarlier}
                onChange={(e) => setMarkEarlier(e.target.checked)}
              />
              Отметить предыдущие занятия «изучала раньше» (без проверенного
              результата)
            </label>
            <button className={`${btn} mt-3`} onClick={start} disabled={saving}>
              Сохранить и открыть
            </button>
          </details>
          {[...new Set(lessons.map((l) => l.group))].map((group) => (
            <section key={group} className="mt-6">
              <h2 className="font-bold c-muted mb-2">{group}</h2>
              <div className="grid gap-2">
                {lessons
                  .filter((l) => l.group === group)
                  .map((l) => (
                    <Link
                      to={`/books/lesson/${l.id}`}
                      key={l.id}
                      className="c-card rounded-xl p-4 flex justify-between items-start gap-3"
                    >
                      <span>
                        <b className="c-text">
                          {bookId === "gramatica" ? `${l.unit}. ` : ""}
                          {l.title}
                        </b>
                        <span className="block text-xs c-muted mt-1">
                          Страницы книги: {l.printed_pages[0]}
                          {l.printed_pages.length > 1
                            ? `–${l.printed_pages.at(-1)}`
                            : ""}
                        </span>
                      </span>
                      <span className="text-xs c-muted text-right shrink-0">
                        {l.progress.status}
                        {l.progress.best_score !== null && (
                          <span className="block">
                            Самостоятельно: {l.progress.best_score}%
                          </span>
                        )}
                        {l.progress.due && (
                          <span className="block c-accent font-bold">
                            Повторить
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </CoachPage>
  );
}
function SourcePage({ lesson, page }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url;
    setSrc("");
    setError("");
    booksApi
      .page(lesson.book_id, page, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob);
          setSrc(url);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [lesson.book_id, page, retry]);
  return (
    <div className="mt-3">
      <ErrorNote message={error} onRetry={() => setRetry((x) => x + 1)} />
      {!src && !error && (
        <div className="p-10 flex justify-center">
          <Spinner />
        </div>
      )}
      {src && (
        <>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs c-accent underline"
          >
            Открыть страницу крупнее
          </a>
          <img
            src={src}
            alt={`Оригинальная страница PDF ${page}`}
            className="w-full h-auto mt-2 rounded-lg border"
          />
        </>
      )}
    </div>
  );
}
export function BookLesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(null);
  const [tab, setTab] = useState("read");
  const [run, setRun] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState({});
  const currentLesson = useRef(lessonId);
  currentLesson.current = lessonId;
  const isCurrent = () => currentLesson.current === lessonId;
  const load = useCallback(async () => {
    const d = await booksApi.lesson(lessonId);
    if (currentLesson.current === lessonId) setDetail(d);
    return d;
  }, [lessonId]);
  useEffect(() => {
    let active = true;
    currentLesson.current = lessonId;
    if (isCurrent()) setBusy(false);
    setDetail(null);
    setRun(null);
    setJob(null);
    setTab("read");
    setError("");
    setAdded({});
    load()
      .then((d) => {
        if (!active) return;
        setPage(d.progress.resume_page);
        if (d.preparation?.status === "generating") setJob(d.preparation);
        if (d.progress.active_run || d.progress.last_run)
          booksApi
            .run(d.progress.active_run || d.progress.last_run)
            .then((r) => {
              if (active) setRun(r);
            })
            .catch((e) => active && setError(e.message));
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
      if (currentLesson.current === lessonId) currentLesson.current = "";
    };
  }, [load]);
  useEffect(() => {
    if (!job?.id || job.status !== "generating") return;
    let active = true;
    const timer = setInterval(
      () =>
        booksApi
          .preparation(job.id)
          .then(async (j) => {
            if (!active) return;
            setJob(j);
            if (j.status === "ready") {
              const r = await booksApi.run(j.run_id);
              if (active) {
                setRun(r);
                setJob(null);
                load().catch(() => {});
              }
            }
            if (j.status === "failed") setError(j.error);
          })
          .catch((e) => {
            if (active) if (isCurrent()) setError(e.message);
          }),
      2500,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.status, load]);
  const prepare = async (kind) => {
    setBusy(true);
    setError("");
    setTab("practice");
    try {
      const j = await booksApi.prepare(lessonId, kind);
      if (!isCurrent()) return;
      if (j.status === "ready") {
        const ready = await booksApi.run(j.run_id);
        if (!isCurrent()) return;
        setRun(ready);
        setJob(null);
      } else setJob(j);
    } catch (e) {
      if (isCurrent()) setError(e.message);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const reading = async (data) => {
    setBusy(true);
    setError("");
    try {
      await booksApi.reading(lessonId, data);
      await load();
      return isCurrent();
    } catch (e) {
      if (isCurrent()) setError(e.message);
      return false;
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const talk = async (mode) => {
    setBusy(true);
    setError("");
    try {
      const s = await booksApi.conversation(lessonId, run?.id, mode);
      if (!isCurrent()) return;
      navigate(mode === "call" ? `/coach/call/${s.id}` : `/coach/chat/${s.id}`);
    } catch (e) {
      if (isCurrent()) setError(e.message);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const addWord = async (index) => {
    try {
      const result = await booksApi.word(run.id, index);
      if (!isCurrent()) return;
      setAdded((a) => ({
        ...a,
        [index]: result.duplicate ? "Уже в словаре" : "Добавлено",
      }));
    } catch (e) {
      if (isCurrent()) setError(e.message);
    }
  };
  if (!detail)
    return (
      <CoachPage>
        <BackLink to="/books" />
        <ErrorNote
          message={error}
          onRetry={() => load().catch((e) => setError(e.message))}
        />
        {!error && <Spinner />}
      </CoachPage>
    );
  const { lesson, progress } = detail;
  const generating = job?.status === "generating";
  return (
    <CoachPage>
      <BackLink to={`/books/${lesson.book_id}`} label="Оглавление" />
      <h1 className="text-2xl font-extrabold c-text">{lesson.title}</h1>
      <p className="c-muted text-sm mt-1">
        {lesson.book_id === "gramatica"
          ? `Грамматика · раздел ${lesson.unit}`
          : `Nivel 2 · Unidad ${lesson.unit}`}{" "}
        · {progress.status}
      </p>
      <BookReminder />
      <div className="flex gap-2 mt-4 flex-wrap">
        {[
          ["read", "1. Книга"],
          ["practice", "2. Практика"],
          ["talk", "3. Разговор"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={tab === id ? btn : secondary}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      {tab === "read" && (
        <Card className="p-4 mt-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-sm c-text">
              Страница PDF{" "}
              <select
                aria-label="Страница PDF"
                value={page ?? lesson.pages[0]}
                onChange={(e) => {
                  const p = Number(e.target.value);
                  setPage(p);
                  reading({ page: p });
                }}
                className="c-panel p-2 rounded-lg ml-1"
              >
                {lesson.pages.map((p, i) => (
                  <option key={p} value={p}>
                    {p} · в книге {lesson.printed_pages[i]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs c-muted">Оригинал книги</span>
          </div>
          {lesson.book_id === "gramatica" && (
            <p className="text-xs c-muted mt-2">
              На скане могут быть старые обведённые ответы. Они не считаются
              твоими результатами.
            </p>
          )}
          {lesson.audio_missing && (
            <p className="text-xs c-muted mt-2">
              В книге есть задание с аудио. Оригинальная запись не приложена; в
              практике доступны задания без неё. Озвучка приложения
              синтезированная.
            </p>
          )}
          <SourcePage lesson={lesson} page={page ?? lesson.pages[0]} />
          <div className="flex gap-2 mt-4 flex-wrap">
            <button
              className={btn}
              disabled={busy}
              onClick={async () => {
                if (await reading({ done: true })) setTab("practice");
              }}
            >
              Прочитала, перейти к практике
            </button>
            <button
              className={secondary}
              disabled={busy}
              onClick={() => reading({ selfReported: !progress.self_reported })}
            >
              {progress.self_reported
                ? "Убрать «изучала раньше»"
                : "Я изучала это раньше"}
            </button>
          </div>
          <p className="text-xs c-muted mt-2">
            Чтение и отметка «изучала раньше» не добавляют проверенное освоение.
          </p>
        </Card>
      )}
      {tab === "practice" && (
        <>
          <div className="mt-4 flex gap-2 flex-wrap">
            {(!run || run.completed_at) && (
              <button
                className={btn}
                disabled={busy || generating}
                onClick={() =>
                  prepare(run?.completed_at ? "review" : "practice")
                }
              >
                {busy || generating ? <Spinner /> : null}
                {run?.completed_at
                  ? "Новые задания для повторения"
                  : "Подготовить занятие"}
              </button>
            )}
            {!run && (
              <button
                className={secondary}
                disabled={busy || generating}
                onClick={() => prepare("diagnostic")}
              >
                Проверить, что я уже знаю
              </button>
            )}
          </div>
          {generating && (
            <Card className="p-5 mt-3">
              <div className="flex items-center gap-2 c-text">
                <Spinner /> Готовлю и проверяю задания по этому разделу…
              </div>
              <p className="c-muted text-sm mt-2">
                Можно вернуться к книге. Подготовка продолжится на сервере.
              </p>
            </Card>
          )}
          {run && (
            <>
              <Card className="p-5 mt-4">
                <h2 className="font-bold c-text text-lg">Правило коротко</h2>
                <p className="whitespace-pre-line c-text leading-relaxed mt-2">
                  {run.theory_ru}
                </p>
                <p className="text-xs c-muted mt-2">
                  В Аргентине обычно говорят vos; формы с tú тоже правильны.
                </p>
                <p className="text-xs c-muted mt-2">
                  Объяснение приложения по материалу книги
                </p>
                {run.examples.map((x, i) => (
                  <div key={i} className="c-panel rounded-xl p-3 mt-2">
                    <span className="c-text">{x.es}</span>
                    <SpeakButton
                      text={x.es}
                      speechKey={`book-${run.id}-${i}`}
                      className="ml-2"
                    />
                    <p className="text-sm c-muted mt-1">{x.ru}</p>
                  </div>
                ))}
              </Card>
              <BookPractice
                key={run.id}
                initial={run}
                onUpdate={async () => {
                  const updated = await booksApi.run(run.id);
                  if (!isCurrent()) return;
                  setRun(updated);
                  await load();
                }}
                onError={(message) => {
                  if (isCurrent()) setError(message);
                }}
              />
              {run.vocabulary.length > 0 && (
                <Card className="p-5 mt-4">
                  <h2 className="font-bold c-text mb-2">Слова из занятия</h2>
                  {run.vocabulary.map((w, i) => (
                    <div
                      key={i}
                      className="flex gap-3 justify-between items-center py-2 border-b c-border"
                    >
                      <span className="c-text text-sm">
                        <b>{w.word}</b> — {w.translation}
                      </span>
                      <button
                        className={secondary}
                        disabled={Boolean(added[i])}
                        onClick={() => addWord(i)}
                      >
                        {added[i] || "В словарь"}
                      </button>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}
        </>
      )}
      {tab === "talk" && (
        <Card className="p-5 mt-4">
          <h2 className="font-bold c-text text-lg">
            Используй тему в своей истории
          </h2>
          <p className="c-muted text-sm mt-2">
            Лусия предложит ситуацию по занятию. Пиши или говори о своей жизни.
            После завершения разговора разбор покажет, что получилось.
          </p>
          {lesson.book_id === "gramatica" &&
            [123, 124, 125].includes(lesson.unit) && (
              <p className="c-bg-accent rounded-xl p-3 mt-3 text-sm">
                Этот урок проверяет написание: применение темы подтверждается
                только письменными сообщениями.
              </p>
            )}
          {run?.conversation_goal_es && (
            <p className="c-panel p-3 rounded-xl mt-3 c-text">
              {run.conversation_goal_es}
            </p>
          )}
          <div className="flex gap-2 flex-wrap mt-4">
            <button
              className={btn}
              disabled={busy}
              onClick={() => talk("chat")}
            >
              Чат и голосовые
            </button>
            <button
              className={secondary}
              disabled={
                busy ||
                (lesson.book_id === "gramatica" &&
                  [123, 124, 125].includes(lesson.unit))
              }
              onClick={() => talk("call")}
            >
              Живой звонок
            </button>
          </div>
          <p className="text-xs c-muted mt-3">
            Применение темы засчитывается по подтверждённым удачным фразам в
            завершённом разборе.
          </p>
          {progress.talks.map((t) => (
            <Link
              className="block text-sm c-accent underline mt-2"
              key={t.session_id}
              to={
                t.status === "analyzed"
                  ? `/coach/report/${t.session_id}`
                  : `/coach/chat/${t.session_id}`
              }
            >
              Разговор по теме ·{" "}
              {t.status === "analyzed" ? "разбор готов" : "продолжить"}
            </Link>
          ))}
          {progress.talks
            .filter((t) => t.status === "analyzed" && !t.application_checked)
            .map((t) => (
              <button
                key={`check-${t.session_id}`}
                className={`${secondary} mt-3`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await booksApi.checkApplication(lessonId, t.session_id);
                    await load();
                  } catch (e) {
                    if (isCurrent()) setError(e.message);
                  } finally {
                    if (isCurrent()) setBusy(false);
                  }
                }}
              >
                Повторить проверку применения темы
              </button>
            ))}
        </Card>
      )}
      <Card className="p-4 mt-4 text-sm c-muted">
        <p>
          Самостоятельно:{" "}
          {progress.best_score === null
            ? "ещё нет проверки"
            : `${progress.best_score}%`}
          .{" "}
          {progress.applied
            ? "Применение в разговоре подтверждено."
            : "Применение в разговоре ещё не подтверждено."}
        </p>
        {progress.history?.length > 0 && (
          <details className="mt-3">
            <summary className="font-bold c-accent cursor-pointer">
              История проверок · {progress.practice_count}
            </summary>
            {progress.history.map((h) => (
              <button
                key={h.id}
                className="block c-accent underline text-sm mt-2"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const historical = await booksApi.run(h.id);
                    if (!isCurrent()) return;
                    setRun(historical);
                    setTab("practice");
                  } catch (e) {
                    if (isCurrent()) setError(e.message);
                  } finally {
                    if (isCurrent()) setBusy(false);
                  }
                }}
                disabled={busy}
              >
                {new Date(h.completed_at).toLocaleDateString("ru-RU")} ·{" "}
                {h.score}% самостоятельно
              </button>
            ))}
          </details>
        )}
        {progress.due_at && (
          <p className="mt-1">
            {progress.due ? "Пора повторить" : "Следующее повторение"}:{" "}
            {new Date(progress.due_at).toLocaleDateString("ru-RU")}
          </p>
        )}
        <p className="mt-2">
          Закрепление: 80% без подсказок, новая успешная проверка через 3 дня
          или позже и применение в разговоре.
        </p>
      </Card>
      {lesson.next_lesson && (
        <Link
          to={`/books/lesson/${lesson.next_lesson}`}
          className={`${btn} mt-4`}
        >
          Следующее занятие <ArrowRight className="w-4 h-4" />
        </Link>
      )}
      {lesson.grammar_links.length > 0 && (
        <Card className="p-4 mt-4">
          <h2 className="font-bold c-text text-sm">
            Грамматика к этому занятию
          </h2>
          <div className="flex gap-2 flex-wrap mt-2">
            {lesson.grammar_links.map((id) => (
              <Link className={secondary} key={id} to={`/books/lesson/${id}`}>
                Раздел {Number(id.split("-")[1])}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </CoachPage>
  );
}
function BookPractice({ initial, onUpdate, onError }) {
  const [run, setRun] = useState(initial);
  const [index, setIndex] = useState(() => {
    const n = initial.items.findIndex((i) => !i.result);
    return n < 0 ? initial.items.length : n;
  });
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const recorder = useVoiceRecorder();
  const item = run.items[index];
  useEffect(() => setRun(initial), [initial]);
  useEffect(() => {
    setValue("");
    setHint("");
  }, [index]);
  const apply = async (result) => {
    setRun((r) => ({
      ...r,
      items: r.items.map((x) => (x.id === item.id ? { ...x, result } : x)),
    }));
    await onUpdate();
  };
  const submit = async (body) => {
    setBusy(true);
    onError("");
    try {
      await apply(await booksApi.answer(run.id, item.id, body));
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const assist = async (reveal) => {
    setBusy(true);
    try {
      const r = await (reveal ? booksApi.reveal : booksApi.hint)(
        run.id,
        item.id,
      );
      setHint(r.hint);
      setRun((x) => ({
        ...x,
        items: x.items.map((i) =>
          i.id === item.id ? { ...i, assisted: true } : i,
        ),
      }));
      if (r.result) await apply(r.result);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const voice = async () => {
    try {
      if (recorder.isRecording) {
        const clip = await recorder.stop();
        if (clip)
          await submit({
            audio: await blobToBase64(clip.blob),
            mimeType: clip.mimeType,
          });
      } else await recorder.start();
    } catch (e) {
      onError(e.message);
    }
  };
  if (!item)
    return (
      <Card className="p-5 mt-4">
        <h2 className="font-bold c-text text-lg">Практика завершена</h2>
        <p className="c-muted mt-2">
          Самостоятельно с первой попытки: {run.score ?? initial.score ?? "…"}%.
          Ответы после подсказки не увеличивают этот показатель.
        </p>
        <p className="c-muted text-sm mt-2">
          Перейди к разговору или вернись позже для новых заданий.
        </p>
        <details className="mt-3">
          <summary className="c-accent font-bold cursor-pointer">
            Мои ответы и разбор
          </summary>
          {run.items.map((x) => (
            <div className="c-panel rounded-xl p-3 mt-2 text-sm" key={x.id}>
              <p className="c-text">{x.prompt}</p>
              <p className="c-muted mt-1">Твой ответ: {x.result?.answer}</p>
              <p className="c-text mt-1">
                {x.result?.corrected} · {x.result?.feedback_ru}
              </p>
            </div>
          ))}
        </details>
      </Card>
    );
  return (
    <Card className="p-5 mt-4">
      <div className="flex justify-between gap-2 text-xs c-muted">
        <span>
          Задание {index + 1} из {run.items.length}
        </span>
        <span>
          {item.source_kind === "book"
            ? "Из книги"
            : item.source_kind === "adapted"
              ? "По тексту книги"
              : "Дополнительное"}{" "}
          · {item.reference}
        </span>
      </div>
      <h2 className="text-lg font-bold c-text mt-4 whitespace-pre-line">
        {item.prompt}
      </h2>
      {!item.result && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) submit({ answer: value });
            }}
            className="mt-4"
          >
            {item.type === "choice" ? (
              <div className="grid gap-2">
                {item.options.map((o) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={o}
                    onClick={() => submit({ answer: o })}
                    className={`${secondary} text-left`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <label className="sr-only" htmlFor={`book-answer-${run.id}`}>
                  Твой ответ
                </label>
                <textarea
                  id={`book-answer-${run.id}`}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={busy}
                  rows={2}
                  maxLength={1600}
                  className="c-panel c-text p-3 rounded-xl w-full"
                  placeholder="Ответ по-испански"
                />
                <div className="flex gap-2 flex-wrap mt-2">
                  <button
                    type="submit"
                    disabled={busy || !value.trim() || recorder.isRecording}
                    className={btn}
                  >
                    {busy ? <Spinner /> : <Check className="w-4 h-4" />}
                    Проверить
                  </button>
                  {!run.requires_written && isVoiceRecordingSupported() && (
                    <button
                      type="button"
                      onClick={voice}
                      disabled={busy}
                      className={secondary}
                    >
                      {recorder.isRecording ? (
                        <Square className="w-4 h-4 inline mr-1" />
                      ) : (
                        <Mic className="w-4 h-4 inline mr-1" />
                      )}
                      {recorder.isRecording
                        ? "Остановить и проверить"
                        : "Ответить голосом"}
                    </button>
                  )}
                </div>
              </>
            )}
          </form>
          <div className="flex gap-2 flex-wrap mt-3">
            <button
              disabled={busy || recorder.isRecording}
              className="text-sm c-accent underline"
              onClick={() => assist(false)}
            >
              <Lightbulb className="w-4 h-4 inline" /> Подсказка
            </button>
            <button
              disabled={busy || recorder.isRecording}
              className="text-sm c-muted underline"
              onClick={() => assist(true)}
            >
              Показать ответ
            </button>
          </div>
          {(item.assisted || hint) && (
            <p className="text-xs c-muted mt-2">
              Использована подсказка — это практика без самостоятельного зачёта.
            </p>
          )}
          {hint && (
            <p className="c-panel rounded-xl p-3 c-text text-sm mt-2">{hint}</p>
          )}
          {recorder.error && <ErrorNote message={recorder.error} />}
        </>
      )}
      {item.result && (
        <div className="mt-4">
          <div
            className={`rounded-xl p-4 ${item.result.verdict === "correct" ? "c-bg-good" : "c-bg-warn"}`}
          >
            <b>
              {item.result.verdict === "correct" ? "Верно" : "Разберём ответ"}
            </b>
            <p className="mt-1">{item.result.corrected}</p>
            <p className="text-sm mt-1">{item.result.feedback_ru}</p>
          </div>
          <button
            className={`${btn} mt-3`}
            onClick={() => setIndex((x) => x + 1)}
          >
            Дальше <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </Card>
  );
}
