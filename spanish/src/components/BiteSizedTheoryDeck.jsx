import React, { useState, useMemo } from 'react';
import {
  BookOpen, ArrowRight, ArrowLeft, CheckCircle2, XCircle,
  Lightbulb, AlertTriangle, Target, Compass, Sparkles, Volume2,
  Trophy, Award, Zap, MessageSquare, PenTool, FileText
} from 'lucide-react';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import ThematicTopicScene from './ThematicTopicScene';

export default function BiteSizedTheoryDeck({
  theoryData,
  topicName,
  onFinishTheory,
  onStartExercises
}) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [scenarioAnswer, setScenarioAnswer] = useState(null);
  const [shortTextAnswer, setShortTextAnswer] = useState(null);

  const topicId = theoryData?.id || 27;

  // Generate granular micro-slides (1 concept/paragraph per slide)
  const slides = useMemo(() => {
    if (!theoryData) return [];
    const list = [];

    // 1. Intro Slide with Full Hero Scene
    list.push({
      type: 'intro',
      badge: '🎯 Обзор темы',
      title: theoryData.russianTitle || topicName || 'Введение в тему',
      icon: theoryData.icon || '📖',
      body: theoryData.summary,
      highlight: theoryData.mnemonicRule ? { label: 'Золотое правило', text: theoryData.mnemonicRule } : null
    });

    // 2. Goals Slide
    if (Array.isArray(theoryData.goalsRu) && theoryData.goalsRu.length > 0) {
      list.push({
        type: 'goals',
        badge: '🚀 Результат урока',
        title: 'Что вы освоите в этом уроке:',
        items: theoryData.goalsRu
      });
    }

    // 3. Granular Section & Table Slides
    if (Array.isArray(theoryData.sections)) {
      theoryData.sections.forEach((sec, sIdx) => {
        const secTitle = sec.title || `Правило ${sIdx + 1}`;

        // Rule paragraph (1 concept)
        if (sec.content) {
          list.push({
            type: 'concept',
            badge: `💡 Правило ${sIdx + 1}`,
            title: secTitle,
            body: sec.content
          });
        }

        // Tables chunked into 2 rows per slide for zero visual clutter
        if (Array.isArray(sec.tables)) {
          sec.tables.forEach((table) => {
            const rows = table.rows || [];
            const headers = table.headers || [];
            const chunkSize = 2;
            for (let r = 0; r < rows.length; r += chunkSize) {
              const subRows = rows.slice(r, r + chunkSize);
              list.push({
                type: 'table_chunk',
                badge: `📊 Таблица (${r + 1}–${Math.min(r + chunkSize, rows.length)} из ${rows.length})`,
                title: secTitle,
                table: {
                  headers,
                  rows: subRows
                }
              });
            }
          });
        }
      });
    }

    // 4. Examples in speech (2 per slide)
    const examples = Array.isArray(theoryData.examples) ? theoryData.examples : [];
    if (examples.length > 0) {
      for (let e = 0; e < examples.length; e += 2) {
        list.push({
          type: 'examples_chunk',
          badge: `🗣️ Живая речь (${e + 1}–${Math.min(e + 2, examples.length)} из ${examples.length})`,
          title: 'Примеры употребления в диалоге:',
          examples: examples.slice(e, e + 2)
        });
      }
    }

    // 5. Mistakes (chunked into 1 per slide for high focus)
    const mistakes = Array.isArray(theoryData.typicalMistakes) ? theoryData.typicalMistakes : [];
    if (mistakes.length > 0) {
      mistakes.forEach((m, mIdx) => {
        list.push({
          type: 'single_mistake',
          badge: `⚠️ Ловушка ${mIdx + 1} из ${mistakes.length}`,
          title: 'Как не ошибиться:',
          mistake: m,
          trapAlert: mIdx === 0 ? theoryData.trapAlert : null
        });
      });
    }

    // 6. Dialect note
    if (theoryData.dialectNote) {
      list.push({
        type: 'dialect',
        badge: '🌎 Живой диалект',
        title: 'Колорит и диалекты (Рио-де-ла-Плата / Испания):',
        body: theoryData.dialectNote
      });
    }

    // 7. Mini Scenario
    if (theoryData.miniScenario) {
      list.push({
        type: 'mini_scenario',
        badge: '🎭 Мини-сценарий',
        title: theoryData.miniScenario.title || 'Практика в реальной ситуации',
        scenario: theoryData.miniScenario
      });
    }

    // 8. Short Reading Text
    if (theoryData.shortText) {
      list.push({
        type: 'short_text',
        badge: '📖 Чтение и понимание',
        title: theoryData.shortText.title || 'Текст для чтения',
        shortText: theoryData.shortText
      });
    }

    // 9. Step-by-step quiz slide
    const quiz = Array.isArray(theoryData.quiz) ? theoryData.quiz : [];
    if (quiz.length > 0) {
      list.push({
        type: 'quiz',
        badge: '🎯 Проверка знаний',
        title: 'Проверочный квиз по правилу',
        quizList: quiz.slice(0, 8)
      });
    }

    return list;
  }, [theoryData, topicName]);

  const currentSlide = slides[slideIdx] || slides[0];
  const totalSlides = slides.length;

  const handleNextSlide = () => {
    soundEngine.playTileClick();
    if (slideIdx < totalSlides - 1) {
      setSlideIdx(i => i + 1);
    }
  };

  const handlePrevSlide = () => {
    soundEngine.playTileClick();
    if (slideIdx > 0) {
      setSlideIdx(i => i - 1);
    }
  };

  const handleQuizAnswer = (qIndex, optIndex, correctIndex) => {
    if (quizAnswers[qIndex] !== undefined) return;
    const isCorrect = optIndex === correctIndex;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();

    setQuizAnswers(prev => ({ ...prev, [qIndex]: optIndex }));
  };

  if (!theoryData || totalSlides === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        Материалы теории загружаются...
      </div>
    );
  }

  const progressPercent = Math.round(((slideIdx + 1) / totalSlides) * 100);

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
      {/* Top Header Indicators */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-extrabold text-xs">
            Слайд {slideIdx + 1} из {totalSlides}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
            {currentSlide.badge}
          </span>
        </div>

        {/* Dots Navigation */}
        <div className="flex items-center gap-1">
          {slides.map((_, dotIdx) => (
            <button
              key={dotIdx}
              onClick={() => { soundEngine.playTileClick(); setSlideIdx(dotIdx); }}
              className={`h-2 rounded-full transition-all ${
                dotIdx === slideIdx
                  ? 'w-5 bg-purple-600'
                  : 'w-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-purple-300'
              }`}
              title={`Перейти к слайду ${dotIdx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* MICRO-CARD CONTAINER */}
      <div className="min-h-[360px] flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-white dark:bg-gray-800 border-2 border-purple-100 dark:border-gray-700 shadow-xl relative">
        
        {/* SLIDE 1: Intro with Full Hero Mascot Scene */}
        {currentSlide.type === 'intro' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Thematic Hero Scene */}
            <ThematicTopicScene
              topicId={topicId}
              topicTitle={theoryData.russianTitle || topicName}
              size="hero"
            />

            {currentSlide.body && (
              <p className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-200 leading-relaxed p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-800">
                {currentSlide.body}
              </p>
            )}

            {currentSlide.highlight && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-amber-950 dark:text-amber-200">
                  <strong className="font-extrabold text-amber-900 dark:text-amber-300">
                    {currentSlide.highlight.label}:{' '}
                  </strong>
                  {currentSlide.highlight.text}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SLIDE 2: Goals */}
        {currentSlide.type === 'goals' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-extrabold text-sm">
                <Target className="w-5 h-5" />
                <span>Цели этого урока:</span>
              </div>
              <ThematicTopicScene topicId={topicId} size="mini" />
            </div>

            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              {currentSlide.title}
            </h2>

            <ul className="space-y-3 pt-2">
              {currentSlide.items.map((item, idx) => (
                <li key={idx} className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3 text-xs sm:text-sm text-emerald-950 dark:text-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="font-bold">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SLIDE 3: Single Concept Paragraph */}
        {currentSlide.type === 'concept' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="inline-block px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-extrabold text-xs">
                {currentSlide.badge}
              </div>
              <ThematicTopicScene topicId={topicId} size="mini" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
              {currentSlide.title}
            </h2>

            <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 text-sm sm:text-base text-gray-800 dark:text-gray-100 leading-relaxed font-medium">
              {currentSlide.body}
            </div>
          </div>
        )}

        {/* SLIDE 4: Micro Table (2 rows) */}
        {currentSlide.type === 'table_chunk' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-600" />
                <span>{currentSlide.title}</span>
              </h2>
              <ThematicTopicScene topicId={topicId} size="mini" />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-purple-200 dark:border-gray-700 shadow-sm">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-purple-50 dark:bg-gray-750 text-purple-900 dark:text-purple-200 font-black border-b border-purple-200 dark:border-gray-700">
                  <tr>
                    {currentSlide.table.headers.map((h, hIdx) => (
                      <th key={hIdx} className="p-3.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {currentSlide.table.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-purple-50/40 dark:hover:bg-gray-750 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className={`p-3.5 ${cIdx === 0 ? 'font-black text-purple-900 dark:text-purple-200 text-sm sm:text-base' : 'text-gray-700 dark:text-gray-300'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span>{cell}</span>
                            {cIdx === 0 && cell.length > 2 && (
                              <button
                                onClick={() => speakSpanish(cell.split('(')[0].replace(/[¡!¿?]/g, '').trim())}
                                className="p-1.5 text-purple-500 hover:text-purple-700 rounded-xl hover:bg-purple-100 dark:hover:bg-gray-700 transition-all flex-shrink-0"
                                title="Озвучить"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SLIDE: Real Speech Examples */}
        {currentSlide.type === 'examples_chunk' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <span>{currentSlide.title}</span>
              </h2>
              <ThematicTopicScene topicId={topicId} size="mini" />
            </div>

            <div className="space-y-3">
              {currentSlide.examples.map((ex, exIdx) => (
                <div key={exIdx} className="p-4 rounded-2xl bg-purple-50/60 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 flex items-start justify-between gap-3 shadow-sm">
                  <div>
                    <div className="font-extrabold text-base text-purple-950 dark:text-purple-200 flex items-center gap-2">
                      <span>«{ex.es}»</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 italic">
                      {ex.ru}
                    </div>
                  </div>
                  <button
                    onClick={() => speakSpanish(ex.es)}
                    className="p-2 rounded-xl bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-300 shadow-sm hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                    title="Озвучить"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SLIDE: Single Mistake Card */}
        {currentSlide.type === 'single_mistake' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-rose-900 dark:text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>{currentSlide.badge}</span>
              </h2>
              <span className="text-2xl">⚠️</span>
            </div>

            {currentSlide.trapAlert && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs sm:text-sm text-rose-950 dark:text-rose-200">
                <strong className="font-black text-rose-900 dark:text-rose-300">Ловушка: </strong>
                {currentSlide.trapAlert}
              </div>
            )}

            <div className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-750/70 space-y-3">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-sm sm:text-base">
                <XCircle className="w-5 h-5 flex-shrink-0" />
                <span>{currentSlide.mistake.mistake || currentSlide.mistake.wrong}</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-sm sm:text-base">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <span>{currentSlide.mistake.correction || currentSlide.mistake.correct}</span>
              </div>
              {(currentSlide.mistake.explanation || currentSlide.mistake.why) && (
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 pl-7 italic border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                  {currentSlide.mistake.explanation || currentSlide.mistake.why}
                </p>
              )}
            </div>
          </div>
        )}

        {/* SLIDE: Dialect */}
        {currentSlide.type === 'dialect' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="inline-block px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 font-extrabold text-xs">
              🌎 Живой диалект
            </div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-sky-600" />
              <span>{currentSlide.title}</span>
            </h2>

            <div className="p-5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sm sm:text-base text-sky-950 dark:text-sky-200 leading-relaxed font-medium">
              {currentSlide.body}
            </div>
          </div>
        )}

        {/* SLIDE: Mini Scenario */}
        {currentSlide.type === 'mini_scenario' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-black text-sm">
              <Compass className="w-5 h-5 text-emerald-600" />
              <span>{currentSlide.title}</span>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
              📍 {currentSlide.scenario.setting} — {currentSlide.scenario.situation}
            </div>

            {currentSlide.scenario.dialog && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-gray-750 border border-emerald-100 dark:border-gray-700 text-xs sm:text-sm">
                {currentSlide.scenario.dialog.map((d, dIdx) => (
                  <div key={dIdx} className="flex items-start gap-2">
                    <span className="font-extrabold text-emerald-800 dark:text-emerald-300 w-24 flex-shrink-0">{d.speaker}:</span>
                    <span className="text-gray-800 dark:text-gray-200">{d.text}</span>
                  </div>
                ))}
              </div>
            )}

            {currentSlide.scenario.options && (
              <div className="space-y-2 pt-1">
                <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                  👉 {currentSlide.scenario.prompt}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {currentSlide.scenario.options.map((opt, optIdx) => {
                    const isAnswered = scenarioAnswer !== null;
                    const isCorrect = optIdx === (currentSlide.scenario.correctIndex ?? currentSlide.scenario.correct ?? currentSlide.scenario.correctOption ?? 0);
                    let btnCls = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200';
                    if (isAnswered) {
                      if (isCorrect) btnCls = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                      else if (optIdx === scenarioAnswer) btnCls = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                      else btnCls = 'opacity-40';
                    }
                    return (
                      <button
                        key={optIdx}
                        onClick={() => {
                          if (scenarioAnswer !== null) return;
                          setScenarioAnswer(optIdx);
                          if (isCorrect) soundEngine.playCorrect();
                          else soundEngine.playWrong();
                        }}
                        disabled={isAnswered}
                        className={`p-3 rounded-xl border text-left text-xs sm:text-sm font-semibold transition-all shadow-sm ${btnCls}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SLIDE: Short Reading Text */}
        {currentSlide.type === 'short_text' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-black text-sm">
              <FileText className="w-5 h-5" />
              <span>{currentSlide.title}</span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 text-xs sm:text-sm leading-relaxed text-gray-800 dark:text-gray-200 font-medium">
              «{currentSlide.shortText.text}»
            </div>

            {currentSlide.shortText.questions && currentSlide.shortText.questions.length > 0 && (() => {
              const targetQ = currentSlide.shortText.questions[0];
              const correctIdx = targetQ.correctIndex ?? targetQ.correct ?? targetQ.correctOption ?? targetQ.answerIndex ?? 0;
              return (
                <div className="space-y-2 pt-1">
                  <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                    1. {targetQ.question}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targetQ.options.map((opt, oIdx) => {
                      const isAnswered = shortTextAnswer !== null;
                      const isCorrect = oIdx === correctIdx;
                      let btnCls = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-purple-300';
                      if (isAnswered) {
                        if (isCorrect) btnCls = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                        else if (oIdx === shortTextAnswer) btnCls = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                        else btnCls = 'opacity-40 border-gray-200 dark:border-gray-700';
                      }
                      return (
                        <button
                          key={oIdx}
                          onClick={() => {
                            if (shortTextAnswer !== null) return;
                            setShortTextAnswer(oIdx);
                            if (isCorrect) soundEngine.playCorrect();
                            else soundEngine.playWrong();
                          }}
                          disabled={isAnswered}
                          className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all shadow-sm ${btnCls}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {shortTextAnswer !== null && targetQ.explanation && (
                    <div className="p-3 rounded-xl bg-purple-50 dark:bg-gray-750 border border-purple-200 text-xs text-purple-950 dark:text-purple-200 flex items-start gap-2 animate-fadeIn mt-2">
                      <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span>{targetQ.explanation}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* SLIDE: Step by step Quiz */}
        {currentSlide.type === 'quiz' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>Вопрос {quizIdx + 1} из {currentSlide.quizList.length}</span>
              </h2>
              <ThematicTopicScene topicId={topicId} size="mini" />
            </div>

            {currentSlide.quizList[quizIdx] && (
              <div className="space-y-4">
                <p className="text-base sm:text-lg font-extrabold text-purple-900 dark:text-purple-200">
                  {currentSlide.quizList[quizIdx].question}
                </p>

                <div className="space-y-2.5">
                  {currentSlide.quizList[quizIdx].options.map((opt, oIdx) => {
                    const ans = quizAnswers[quizIdx];
                    const isSelected = ans === oIdx;
                    const isCorrect = oIdx === (currentSlide.quizList[quizIdx].correctIndex ?? currentSlide.quizList[quizIdx].correct ?? currentSlide.quizList[quizIdx].correctOption ?? 0);

                    let btnStyle = 'border-purple-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-gray-800 dark:text-gray-100 hover:border-purple-300';
                    if (ans !== undefined) {
                      if (isCorrect) {
                        btnStyle = 'border-green-500 bg-green-50 dark:bg-green-950/50 text-green-900 dark:text-green-100 font-black';
                      } else if (isSelected) {
                        btnStyle = 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100 font-bold';
                      } else {
                        btnStyle = 'opacity-40 border-gray-200';
                      }
                    }

                    return (
                      <button
                        key={oIdx}
                        onClick={() => handleQuizAnswer(quizIdx, oIdx, currentSlide.quizList[quizIdx].correctIndex ?? currentSlide.quizList[quizIdx].correct ?? currentSlide.quizList[quizIdx].correctOption ?? 0)}
                        disabled={ans !== undefined}
                        className={`w-full p-3.5 rounded-2xl border-2 text-left font-bold text-sm transition-all flex items-center justify-between shadow-sm active:scale-98 ${btnStyle}`}
                      >
                        <span>{opt}</span>
                        {ans !== undefined && isCorrect && (
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                        )}
                        {ans !== undefined && isSelected && !isCorrect && (
                          <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {quizAnswers[quizIdx] !== undefined && (
                  <div className="p-3 rounded-xl bg-purple-50 dark:bg-gray-750 border border-purple-200 text-xs text-purple-950 dark:text-purple-200 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span>{currentSlide.quizList[quizIdx].explanation}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setQuizIdx(i => Math.max(0, i - 1))}
                    disabled={quizIdx === 0}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  >
                    ← Предыдущий вопрос
                  </button>

                  {quizIdx < currentSlide.quizList.length - 1 ? (
                    <button
                      onClick={() => setQuizIdx(i => i + 1)}
                      disabled={quizAnswers[quizIdx] === undefined}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs disabled:opacity-40"
                    >
                      Следующий вопрос →
                    </button>
                  ) : (
                    <button
                      onClick={onStartExercises}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black text-xs shadow-md"
                    >
                      Перейти к упражнениям 🏋️
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BOTTOM NAVIGATION BUTTONS */}
        {currentSlide.type !== 'quiz' && (
          <div className="flex items-center justify-between gap-4 pt-6 border-t border-purple-50 dark:border-gray-750 mt-6">
            <button
              onClick={handlePrevSlide}
              disabled={slideIdx === 0}
              className="px-5 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-xs sm:text-sm hover:bg-gray-50 disabled:opacity-30 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>

            <button
              onClick={handleNextSlide}
              className="flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-xs sm:text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>{slideIdx < totalSlides - 1 ? 'Дальше ➔' : 'К проверочному квизу 🎯'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
