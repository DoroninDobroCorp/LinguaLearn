import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, ArrowRight, Check, ChevronLeft } from "lucide-react";
import { profileApiUrl, profileFetch } from "../../utils/api";
import { booksApi } from "../../utils/booksApi";
import { soundEngine } from "../../utils/soundEffects";

const button =
  "px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white disabled:opacity-50";

async function loadJson(path, body) {
  const response = await profileFetch(profileApiUrl(`/spanish/api/book-courses${path}`), body);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось открыть курс.");
  return data;
}

export function BookCoursesHome() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadJson("").then((data) => setCourses(data.courses)).catch((err) => setError(err.message));
  }, []);
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Курсы по книгам</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2">
          Два курса идут по порядку страниц. В каждом занятии есть объяснение, примеры, страница книги и проверка.
        </p>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {!courses && !error && <p className="text-gray-500">Открываю курсы…</p>}
      <div className="grid md:grid-cols-2 gap-4">
        {(courses || []).map((course) => (
          <article key={course.id} className="rounded-3xl border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
            <BookOpen className="w-6 h-6 text-fuchsia-500" />
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mt-3">{course.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{course.subtitle}</p>
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-3">{course.outcome}</p>
            <p className="font-semibold text-sm mt-3">{course.lessonCount} занятий по порядку</p>
            <Link to={`/curriculum?tab=book_${course.id}`} className={`${button} mt-4`}>
              Открыть курс <ArrowRight className="w-4 h-4" />
            </Link>
          </article>
        ))}
      </div>
      <div className="rounded-2xl p-4 bg-purple-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <b className="text-gray-900 dark:text-white">Академическая программа CEFR и срезы</b>
          <p className="text-xs text-gray-500 mt-0.5">10 проверочных срезов A1, 9 тематических модулей и 650 лемм</p>
        </div>
        <Link to="/curriculum?tab=checkpoints" className={button}>
          🎯 Перейти к срезам CEFR <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export function BookCourseOutline({ courseId }) {
  const [course, setCourse] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setCourse(null);
    loadJson("").then((data) => setCourse(data.courses.find((item) => item.id === courseId) || null)).catch((err) => setError(err.message));
  }, [courseId]);
  if (error) return <p className="text-red-600">{error}</p>;
  if (!course) return <p className="text-gray-500">Собираю оглавление…</p>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/curriculum?tab=book_courses" className="text-sm font-bold text-fuchsia-600 inline-flex items-center gap-1 hover:underline">
          <ChevronLeft className="w-4 h-4" /> Все курсы по книгам
        </Link>
        <Link to="/curriculum?tab=checkpoints" className="text-xs font-semibold text-slate-500 hover:text-fuchsia-600 inline-flex items-center gap-1">
          🎯 Срезы CEFR
        </Link>
      </div>
      <div className="rounded-3xl bg-gradient-to-r from-fuchsia-600 to-purple-700 text-white p-6">
        <h2 className="text-2xl font-black">{course.title}</h2>
        <p className="text-fuchsia-100 mt-1">{course.subtitle}</p>
        <p className="mt-3 text-sm">{course.lessonCount} занятий. Следующее открывается сразу, порядок книги сохранён.</p>
      </div>
      {course.groups.map((group) => (
        <section key={group.title}>
          <h3 className="font-black text-gray-500 mb-2">{group.title}</h3>
          <div className="grid gap-2">
            {course.lessons.filter((lesson) => group.lessonIds.includes(lesson.id)).map((lesson) => (
              <Link key={lesson.id} to={`/book-course/${course.id}/${lesson.id}`} className="rounded-2xl border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex justify-between gap-3">
                <span>
                  <b className="text-gray-900 dark:text-white">{lesson.order}. {lesson.title}</b>
                  <span className="block text-xs text-gray-500 mt-1">
                    Страницы {lesson.printedPages[0]}{lesson.printedPages.length > 1 ? `–${lesson.printedPages.at(-1)}` : ""} · {lesson.exerciseCount} заданий
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-fuchsia-500 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Exercise({ exercise, onResult }) {
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const answer = exercise.type === "choice" ? picked : value.trim();
  const submit = async (choice) => {
    const given = choice || answer;
    if (!given || result) return;
    setBusy(true);
    try {
      const data = await loadJson(`/${exercise.courseId}/lessons/${exercise.lessonId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, answer: given }),
      });
      setResult(data);
      onResult(data.correct);
      if (data.correct) soundEngine.playCorrect();
      else soundEngine.playWrong();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="rounded-2xl border border-purple-100 dark:border-gray-700 p-4 space-y-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <p className="font-bold text-gray-900 dark:text-white">{exercise.question}</p>
      {exercise.type === "choice" ? (
        <div className="grid gap-2">
          {exercise.options.map((option) => {
            const shown = result && (option === result.correctAnswer || option === picked);
            const good = result && option === result.correctAnswer;
            return (
              <button type="button" key={option} disabled={Boolean(result) || busy} onClick={() => { setPicked(option); submit(option); }}
                className={`text-left rounded-xl border px-3 py-2 font-semibold ${good ? "border-green-500 bg-green-50" : shown ? "border-red-400 bg-red-50" : "border-gray-200 dark:border-gray-600"}`}>
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={value} onChange={(event) => setValue(event.target.value)} disabled={Boolean(result)} placeholder="Ответ на испанском" className="flex-1 rounded-xl border border-purple-200 px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
          <button className={button} disabled={!value.trim() || busy || result}>Проверить</button>
        </div>
      )}
      {result && (
        <p className={`text-sm font-semibold ${result.correct ? "text-green-700" : "text-red-700"}`}>
          {result.correct ? "Верно." : `Правильный ответ: ${result.correctAnswer}`} {result.explanation}
        </p>
      )}
    </form>
  );
}

export function BookCourseLesson() {
  const { courseId, lessonId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [scores, setScores] = useState({});
  const [page, setPage] = useState(0);
  const [pageUrl, setPageUrl] = useState("");
  const [pageError, setPageError] = useState("");
  useEffect(() => {
    setData(null);
    setScores({});
    setError("");
    loadJson(`/${courseId}/lessons/${lessonId}`).then(setData).catch((err) => setError(err.message));
  }, [courseId, lessonId]);
  useEffect(() => {
    if (!data) return undefined;
    const filePage = data.lesson.filePages[page] || data.lesson.filePages[0];
    const controller = new AbortController();
    let url = "";
    setPageUrl("");
    setPageError("");
    booksApi.page(courseId, filePage, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (!controller.signal.aborted) setPageUrl(url);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setPageError(err.message);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [courseId, data, page]);
  if (error) return <p className="text-red-600 p-4">{error}</p>;
  if (!data) return <p className="text-gray-500 p-4">Открываю занятие…</p>;
  const lesson = data.lesson;
  const answered = Object.keys(scores).length;
  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      <Link to={`/curriculum?tab=book_${courseId}`} className="text-sm font-bold text-fuchsia-600 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> К оглавлению</Link>
      <div>
        <p className="text-xs font-bold uppercase text-fuchsia-600">Занятие {lesson.position} из {data.course.lessonCount} · {lesson.group}</p>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{lesson.title}</h1>
        <p className="text-sm text-gray-500 mt-1">Страницы книги {lesson.printedPages[0]}{lesson.printedPages.length > 1 ? `–${lesson.printedPages.at(-1)}` : ""}</p>
      </div>
      <section className="rounded-3xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-gray-700 p-5 space-y-3">
        <h2 className="font-black">Как это работает</h2>
        <p className="text-gray-800 dark:text-gray-100 leading-relaxed">{lesson.theory}</p>
        {lesson.examples.length > 0 && (
          <ul className="space-y-2">
            {lesson.examples.map((example) => (
              <li key={example.es} className="rounded-xl bg-purple-50 dark:bg-gray-700 px-3 py-2">
                <b>{example.es}</b>
                <span className="block text-sm text-gray-600 dark:text-gray-300">{example.ru}</span>
              </li>
            ))}
          </ul>
        )}
        {lesson.vocabulary.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {lesson.vocabulary.map((word) => (
              <span key={word.word} className="rounded-full bg-fuchsia-50 dark:bg-fuchsia-950 px-3 py-1 text-sm">{word.word}{word.translation ? ` — ${word.translation}` : ""}</span>
            ))}
          </div>
        )}
      </section>
      <section className="rounded-3xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-black">Страница книги</h2>
          <span className="text-xs text-gray-500">{page + 1} / {lesson.filePages.length}</span>
        </div>
        {pageError && <p className="text-sm text-red-600 mt-3">{pageError}</p>}
        {pageUrl && (
          <img
            src={pageUrl}
            alt={`Страница книги ${lesson.printedPages[page] || lesson.printedPages[0]}`}
            className="w-full rounded-xl border mt-3 bg-white"
            style={{ filter: "contrast(1.35) brightness(1.08)" }}
          />
        )}
        {!pageUrl && !pageError && <p className="text-sm text-gray-500 mt-3">Загружаю страницу книги…</p>}
        {lesson.filePages.length > 1 && (
          <div className="flex gap-2 mt-3">
            <button className="rounded-xl border px-3 py-2 text-sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Предыдущая</button>
            <button className="rounded-xl border px-3 py-2 text-sm" disabled={page === lesson.filePages.length - 1} onClick={() => setPage((value) => value + 1)}>Следующая</button>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-black">Проверка · {answered}/{lesson.exercises.length}</h2>
        {lesson.exercises.map((exercise) => (
          <Exercise key={exercise.id} exercise={{ ...exercise, courseId, lessonId }} onResult={(correct) => setScores((prev) => ({ ...prev, [exercise.id]: correct }))} />
        ))}
      </section>
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{answered === lesson.exercises.length ? <><Check className="inline w-4 h-4" /> Занятие пройдено в этой сессии.</> : "Ответьте на все задания занятия."}</span>
        {lesson.nextId && <Link to={`/book-course/${courseId}/${lesson.nextId}`} className={button}>Следующее занятие</Link>}
      </div>
    </div>
  );
}

