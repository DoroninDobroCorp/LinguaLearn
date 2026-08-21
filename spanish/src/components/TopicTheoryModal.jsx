import React, { useState, useEffect, useRef } from 'react';
import {
  X, BookOpen, Bot, Sparkles, Send, Volume2, CheckCircle2,
  AlertTriangle, Lightbulb, ChevronRight, Loader2, ArrowRight,
  RotateCcw, Copy, Check, HelpCircle, XCircle, Target, Award, Compass,
  MessageSquare, Dumbbell, Languages, Lock
} from 'lucide-react';
import { profileApiUrl, profileFetch, getAssetUrl } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import MateoCharacter from './MateoCharacter';

function normalizeExerciseText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkExerciseAnswer(userInput, correctAnswer, acceptableAnswers = []) {
  const normUser = normalizeExerciseText(userInput);
  const normCorrect = normalizeExerciseText(correctAnswer);
  if (normUser === normCorrect) return true;

  if (Array.isArray(acceptableAnswers)) {
    for (const alt of acceptableAnswers) {
      if (normalizeExerciseText(alt) === normUser) return true;
    }
  }
  return false;
}

function FormattedMessage({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed text-sm">
      {lines.map((line, lIdx) => {
        if (!line.trim()) return <div key={lIdx} className="h-1.5" />;

        const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ') || line.trim().startsWith('• ');
        const cleanLine = isBullet ? line.trim().replace(/^[*•\-]\s*/, '') : line;
        const parts = cleanLine.split(/(\*\*.*?\*\*)/g);

        return (
          <div key={lIdx} className={isBullet ? 'flex items-start space-x-2 ml-1' : ''}>
            {isBullet && <span className="text-purple-400 mt-1 text-xs">•</span>}
            <p className="flex-1">
              {parts.map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={pIdx} className="font-bold text-fuchsia-300">
                      {part.slice(2, -2)}
                    </strong>
                  );
                }
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                  return (
                    <em key={pIdx} className="italic text-sky-300">
                      {part.slice(1, -1)}
                    </em>
                  );
                }
                return part;
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function TopicTheoryModal({ topicId, topicName, isOpen, onClose, onStartPractice }) {
  const { isDark } = useTheme();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('theory'); // 'theory' | 'exercises' | 'tutor'
  const [theoryData, setTheoryData] = useState(null);
  const [loadingTheory, setLoadingTheory] = useState(true);
  const [lesson, setLesson] = useState(null);
  const [vocabularyConfirmed, setVocabularyConfirmed] = useState(true);
  const [theoryViewed, setTheoryViewed] = useState(false);

  // Quiz state inside theory modal
  const [quizAnswers, setQuizAnswers] = useState({});

  // Scenario state
  const [scenarioAnswer, setScenarioAnswer] = useState(null);

  // Short text state
  const [shortTextAnswers, setShortTextAnswers] = useState({});

  // Additional Topic Exercises Tab state
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [exerciseAnswers, setExerciseAnswers] = useState({});
  const [userExInput, setUserExInput] = useState('');
  const [userTileOrder, setUserTileOrder] = useState([]);

  // AI Tutor State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (isOpen && (topicId || topicName)) {
      fetchTheory();
      setQuizAnswers({});
      setScenarioAnswer(null);
      setShortTextAnswers({});
      setExerciseIndex(0);
      setExerciseAnswers({});
      setUserExInput('');
      setUserTileOrder([]);
      setLesson(null);
      setVocabularyConfirmed(true);
      setTheoryViewed(false);
      setActiveTab('theory');
    }
  }, [isOpen, topicId, topicName]);

  useEffect(() => {
    if (activeTab === 'tutor' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const fetchTheory = async () => {
    try {
      setLoadingTheory(true);
      const url = topicId
        ? profileApiUrl(`/spanish/api/curriculum/topics/${topicId}/theory`)
        : profileApiUrl(`/spanish/api/curriculum/topics/1/theory`);
      const res = await profileFetch(url);
      if (res.ok) {
        const data = await res.json();
        setTheoryData(data.theory || null);
        const nextLesson = data.lesson || null;
        const alreadyIntroduced = Boolean(nextLesson?.isIntroduced);
        setLesson(nextLesson);
        setVocabularyConfirmed(!nextLesson || alreadyIntroduced);
        setActiveTab(nextLesson && !alreadyIntroduced && nextLesson.starterVocabulary?.length ? 'vocabulary' : 'theory');
      }
    } catch (error) {
      console.error('Error fetching topic theory:', error);
    } finally {
      setLoadingTheory(false);
    }
  };

  const handleSendTutorMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sendingMessage) return;

    const userText = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setSendingMessage(true);

    try {
      const targetId = topicId || theoryData?.id || 1;
      const res = await profileFetch(profileApiUrl(`/spanish/api/curriculum/topics/${targetId}/tutor-chat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: messages
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'model', content: data.reply }]);
      }
    } catch (error) {
      console.error('Error in tutor chat:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleQuizAnswer = async (qIdx, optIdx, correctIdx) => {
    if (quizAnswers[qIdx] !== undefined) return;
    const isCorrect = optIdx === correctIdx;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setQuizAnswers(prev => ({ ...prev, [qIdx]: optIdx }));

    try {
      const targetId = topicId || theoryData?.id || 1;
      await profileFetch(profileApiUrl('/spanish/api/a1/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: targetId,
          correct: isCorrect,
          quality: isCorrect ? 4 : 1,
          activityType: 'theory_quiz',
          eventId: globalThis.crypto?.randomUUID?.() || `theory-${targetId}-${qIdx}-${Date.now()}`,
        }),
      });
      window.dispatchEvent(new CustomEvent('gamification_updated'));
    } catch (error) {
      console.error('Error recording theory quiz attempt:', error);
    }
  };

  const handleExerciseOptionSelect = async (ex, optIdx) => {
    if (exerciseAnswers[ex.id]) return;
    const isCorrect = optIdx === ex.correctIndex || optIdx === ex.correctOptionIndex || ex.options?.[optIdx] === ex.correctAnswer;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();

    setExerciseAnswers(prev => ({
      ...prev,
      [ex.id]: { selected: optIdx, correct: isCorrect }
    }));

    try {
      const targetId = topicId || theoryData?.id || 1;
      await profileFetch(profileApiUrl('/spanish/api/a1/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: targetId,
          correct: isCorrect,
          quality: isCorrect ? 5 : 1,
          activityType: 'topic_practice_exercise',
          eventId: globalThis.crypto?.randomUUID?.() || `ex-${ex.id}-${Date.now()}`,
        }),
      });
      window.dispatchEvent(new CustomEvent('gamification_updated'));
    } catch (error) {
      console.error('Error recording exercise attempt:', error);
    }
  };

  const handleExerciseTextSubmit = async (ex) => {
    if (exerciseAnswers[ex.id] || !userExInput.trim()) return;
    const isCorrect = checkExerciseAnswer(userExInput, ex.correctAnswer, ex.acceptableAnswers);
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();

    setExerciseAnswers(prev => ({
      ...prev,
      [ex.id]: { input: userExInput, correct: isCorrect }
    }));

    try {
      const targetId = topicId || theoryData?.id || 1;
      await profileFetch(profileApiUrl('/spanish/api/a1/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: targetId,
          correct: isCorrect,
          quality: isCorrect ? 5 : 1,
          activityType: 'topic_practice_exercise',
          eventId: globalThis.crypto?.randomUUID?.() || `ex-${ex.id}-${Date.now()}`,
        }),
      });
      window.dispatchEvent(new CustomEvent('gamification_updated'));
    } catch (error) {
      console.error('Error recording exercise attempt:', error);
    }
  };

  if (!isOpen) return null;

  const quizList = theoryData?.quiz || theoryData?.quickCheckQuiz || [];
  const mistakesList = theoryData?.typicalMistakes || theoryData?.commonMistakes || [];
  const goalsList = theoryData?.goalsRu || theoryData?.learningObjectives || [];
  const examplesList = theoryData?.examples || [];
  const exercisesList = theoryData?.exercises || [];
  const currentEx = exercisesList[exerciseIndex];
  const starterVocabulary = lesson?.starterVocabulary || [];
  const exercisesUnlocked = !lesson || lesson.isIntroduced || (vocabularyConfirmed && theoryViewed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-850 rounded-3xl max-w-4xl w-full h-[92vh] shadow-2xl border border-purple-100 dark:border-gray-700 flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-purple-100 dark:border-gray-700 flex items-center justify-between bg-white/80 dark:bg-gray-800/80 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-md flex-shrink-0">
              {theoryData?.icon || '📖'}
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white truncate">
                {theoryData?.russianTitle || topicName}
              </h2>
              <div className="flex items-center space-x-2 text-xs text-purple-600 dark:text-purple-400 font-semibold truncate">
                <span className="truncate">{topicName || theoryData?.topicName}</span>
                {theoryData?.level && (
                  <span className="bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded-full flex-shrink-0">
                    {theoryData.level}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-purple-100 dark:border-gray-700 px-6 bg-gray-50/80 dark:bg-gray-800/50 flex-wrap">
          {starterVocabulary.length > 0 && (
            <button
              onClick={() => setActiveTab('vocabulary')}
              className={`py-3 px-4 sm:px-5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'vocabulary'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Languages className="w-4 h-4" />
              <span>1. Слова ({starterVocabulary.length})</span>
            </button>
          )}
          <button
            onClick={() => {
              if (!vocabularyConfirmed) return;
              setActiveTab('theory');
            }}
            disabled={!vocabularyConfirmed}
            className={`py-3 px-4 sm:px-5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 disabled:opacity-40 ${
              activeTab === 'theory'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>2. Правило и квиз</span>
            {!vocabularyConfirmed && <Lock className="w-3 h-3" />}
          </button>

          {exercisesList.length > 0 && (
            <button
              onClick={() => exercisesUnlocked && setActiveTab('exercises')}
              disabled={!exercisesUnlocked}
              className={`py-3 px-4 sm:px-5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 disabled:opacity-40 ${
                activeTab === 'exercises'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              <span>3. Упражнения ({exercisesList.length})</span>
              {!exercisesUnlocked && <Lock className="w-3 h-3" />}
            </button>
          )}

          <button
            onClick={() => setActiveTab('tutor')}
            className={`py-3 px-4 sm:px-5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'tutor'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>AI-Репетитор</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {loadingTheory ? (
            <div className="flex items-center justify-center h-64 text-purple-600">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-3 font-semibold text-sm">Загрузка материалов темы...</span>
            </div>
          ) : activeTab === 'vocabulary' ? (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="font-black text-emerald-900 dark:text-emerald-100">Шаг 1 из 3 — слова для этого правила</div>
                <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-1">
                  Сначала познакомьтесь с этими словами. Именно этот материал встретится в объяснении и контролируемой практике.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {starterVocabulary.map((item) => (
                  <div key={item.word} className="p-4 rounded-2xl border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-lg text-purple-800 dark:text-purple-200">{item.word}</div>
                        <div className="font-semibold text-gray-700 dark:text-gray-200">{item.translation}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakSpanish(item.word)}
                        className="p-2 rounded-xl bg-purple-50 dark:bg-gray-700 text-purple-600"
                        aria-label={`Прослушать ${item.word}`}
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    {item.example && <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{item.example}</div>}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setVocabularyConfirmed(true);
                  setActiveTab('theory');
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-black shadow-lg"
              >
                Слова просмотрены — перейти к правилу
              </button>
            </div>
          ) : activeTab === 'theory' ? (
            theoryData ? (
              <div className="space-y-6">
                {/* Mateo Guide Intro */}
                <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800">
                  <MateoCharacter
                    mood="thinking"
                    speechText={
                      language === 'ru'
                        ? `Привет! Давай разберем тему «${theoryData.russianTitle || topicName}». Я подготовил для тебя цели, правила, типичные ловушки и проверочный квиз!`
                        : `¡Hola! Veamos juntos «${theoryData.topicName}». ¡Tengo objetivos, reglas, trampas y mini-quiz!`
                    }
                    size="sm"
                  />
                </div>

                {/* 1. Measurable Learning Goals */}
                {goalsList.length > 0 && (
                  <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
                    <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-extrabold text-sm mb-2.5">
                      <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>После этого урока вы сможете:</span>
                    </div>
                    <ul className="space-y-1.5 text-xs sm:text-sm text-indigo-950 dark:text-indigo-200">
                      {goalsList.map((g, gIdx) => (
                        <li key={gIdx} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 2. Summary Box */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800/50 text-gray-800 dark:text-gray-200 text-sm sm:text-base leading-relaxed">
                  💡 <span className="font-semibold">{theoryData.summary}</span>
                </div>

                {/* 3. Mnemonic Rule */}
                {theoryData.mnemonicRule && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-amber-200">Золотое правило:</div>
                      <div>{theoryData.mnemonicRule}</div>
                    </div>
                  </div>
                )}

                {/* 4. Sections & Tables */}
                {(theoryData.sections || []).map((sec, sIdx) => (
                  <div key={sIdx} className="space-y-3 pt-2">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-fuchsia-500" />
                      {sec.title}
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {sec.content}
                    </p>

                    {(sec.tables || []).map((tbl, tIdx) => (
                      <div key={tIdx} className="overflow-x-auto rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm my-3">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-purple-100 dark:bg-gray-800 text-purple-900 dark:text-purple-200 font-bold">
                            <tr>
                              {tbl.headers.map((h, hIdx) => (
                                <th key={hIdx} className="p-3 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-purple-50 dark:divide-gray-700 bg-white dark:bg-gray-850">
                            {tbl.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-purple-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-3 text-gray-800 dark:text-gray-200">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{cell}</span>
                                      {cIdx <= 1 && typeof cell === 'string' && cell.length > 1 && !cell.includes(' ') && (
                                        <button
                                          onClick={() => speakSpanish(cell.split('(')[0])}
                                          className="text-gray-400 hover:text-purple-600 p-1 transition-colors"
                                          title="Прослушать"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
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
                    ))}
                  </div>
                ))}

                {/* 5. Examples with Audio */}
                {examplesList.length > 0 && (
                  <div className="p-4 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 space-y-2.5">
                    <h4 className="font-extrabold text-sky-900 dark:text-sky-200 text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-sky-600" />
                      Живые примеры употребления:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {examplesList.map((ex, eIdx) => (
                        <div key={eIdx} className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-sky-100 dark:border-gray-700 flex items-start justify-between gap-2 text-xs sm:text-sm">
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              <span>{ex.es}</span>
                              <button
                                onClick={() => speakSpanish(ex.es)}
                                className="text-gray-400 hover:text-purple-600 transition-colors"
                                title="Прослушать"
                              >
                                <Volume2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-gray-600 dark:text-gray-400 mt-0.5">{ex.ru}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. Typical Mistakes of Russian Speakers */}
                {mistakesList.length > 0 && (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span>Типичные ошибки русскоязычных учеников:</span>
                    </div>
                    <div className="space-y-2">
                      {mistakesList.map((m, mIdx) => (
                        <div key={mIdx} className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-800/80 text-xs sm:text-sm space-y-1">
                          <div className="text-red-600 dark:text-red-400 font-semibold line-through">❌ {m.mistake}</div>
                          <div className="text-green-600 dark:text-green-400 font-bold">✅ {m.correction}</div>
                          <div className="text-gray-600 dark:text-gray-400 text-xs">{m.explanation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7. Dialect Notes */}
                {theoryData.dialectNote && (
                  <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-sm flex items-start gap-3">
                    <span className="text-xl">🧉</span>
                    <div>
                      <div className="font-bold">Колорит и диалекты (Рио-де-ла-Плата / Испания):</div>
                      <div className="mt-0.5 text-xs sm:text-sm">{theoryData.dialectNote}</div>
                    </div>
                  </div>
                )}

                {/* 8. Mini-Scenario Real-Life Application */}
                {theoryData.miniScenario && (
                  <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                    <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-900 dark:text-emerald-200">
                      <Compass className="w-4 h-4 text-emerald-600" />
                      <span>Мини-сценарий: {theoryData.miniScenario.title}</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 italic">
                      📍 {theoryData.miniScenario.setting} — {theoryData.miniScenario.situation}
                    </div>

                    {theoryData.miniScenario.dialog && (
                      <div className="space-y-1.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-emerald-100 dark:border-gray-700 text-xs sm:text-sm">
                        {theoryData.miniScenario.dialog.map((d, dIdx) => (
                          <div key={dIdx} className="flex items-start gap-2">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400 w-24 flex-shrink-0">{d.speaker}:</span>
                            <span className="text-gray-800 dark:text-gray-200">{d.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {theoryData.miniScenario.options && (
                      <div className="space-y-2 pt-1">
                        <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                          👉 {theoryData.miniScenario.prompt}
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {theoryData.miniScenario.options.map((opt, optIdx) => {
                            const isAnswered = scenarioAnswer !== null;
                            const isCorrect = optIdx === theoryData.miniScenario.correctIndex;
                            let btnCls = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200';
                            if (isAnswered) {
                              if (isCorrect) btnCls = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                              else if (optIdx === scenarioAnswer) btnCls = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                              else btnCls = 'opacity-40';
                            }
                            return (
                              <button
                                key={optIdx}
                                onClick={() => setScenarioAnswer(optIdx)}
                                disabled={isAnswered}
                                className={`p-2.5 text-left rounded-xl border text-xs font-semibold transition-all ${btnCls}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {scenarioAnswer !== null && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                            💡 {theoryData.miniScenario.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 9. Short Text / Reading practice */}
                {theoryData.shortText && (
                  <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-3">
                    <div className="flex items-center gap-2 font-extrabold text-sm text-amber-900 dark:text-amber-200">
                      <BookOpen className="w-4 h-4 text-amber-600" />
                      <span>Короткий текст для чтения: {theoryData.shortText.title}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 p-3 rounded-xl bg-white dark:bg-gray-800 border border-amber-100 dark:border-gray-700 leading-relaxed">
                      {theoryData.shortText.text}
                    </p>

                    <div className="space-y-3 pt-1">
                      {(theoryData.shortText.questions || []).map((stq, stIdx) => {
                        const answered = shortTextAnswers[stIdx] !== undefined;
                        const sel = shortTextAnswers[stIdx];
                        return (
                          <div key={stIdx} className="space-y-1.5 text-xs sm:text-sm">
                            <div className="font-bold text-gray-900 dark:text-white">
                              {stIdx + 1}. {stq.question}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {stq.options.map((opt, optIdx) => {
                                let bClass = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200';
                                if (answered) {
                                  if (optIdx === stq.correctIndex) bClass = 'bg-green-100 dark:bg-green-900/60 border-green-500 font-bold';
                                  else if (optIdx === sel) bClass = 'bg-red-100 dark:bg-red-900/60 border-red-500';
                                  else bClass = 'opacity-40';
                                }
                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => setShortTextAnswers(prev => ({ ...prev, [stIdx]: optIdx }))}
                                    disabled={answered}
                                    className={`p-2 text-left rounded-xl border text-xs font-semibold ${bClass}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                            {answered && (
                              <div className="text-[11px] text-gray-500 italic">💡 {stq.explanation}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 10. Productive Task with Rubric */}
                {theoryData.productiveTask && (
                  <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2.5">
                    <div className="flex items-center gap-2 font-extrabold text-sm text-purple-900 dark:text-purple-200">
                      <Award className="w-4 h-4 text-purple-600" />
                      <span>Продуктивное задание ({theoryData.productiveTask.type === 'writing' ? 'Письмо ✍️' : 'Говорение 🎙️'}): {theoryData.productiveTask.title}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 p-3 rounded-xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-gray-700 whitespace-pre-line leading-relaxed">
                      {theoryData.productiveTask.prompt}
                    </div>
                    {theoryData.productiveTask.rubric?.criteria && (
                      <div className="text-xs space-y-1 pt-1">
                        <div className="font-bold text-gray-600 dark:text-gray-400">Критерии оценивания (0–100 баллов):</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {theoryData.productiveTask.rubric.criteria.map((crit, crIdx) => (
                            <div key={crIdx} className="p-2 rounded-lg bg-white/70 dark:bg-gray-800 border border-purple-100 dark:border-gray-700 text-[11px]">
                              <span className="font-bold text-purple-700 dark:text-purple-300">{crit.name} ({crit.points || crit.max} б.):</span> {crit.description}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 11. Quick Check Quiz (12 Questions with Explanations) */}
                {quizList.length > 0 && (
                  <div className="pt-6 border-t border-purple-100 dark:border-gray-700 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-purple-600" />
                        <span>Проверочный квиз ({quizList.length} вопросов):</span>
                      </h3>
                      <span className="text-xs text-purple-600 font-bold">
                        {Object.keys(quizAnswers).length} / {quizList.length} пройдено
                      </span>
                    </div>

                    <div className="space-y-4">
                      {quizList.map((q, qIdx) => {
                        const answered = quizAnswers[qIdx] !== undefined;
                        const selectedOpt = quizAnswers[qIdx];
                        const typeLabel = q.type === 'recognition' ? 'Узнавание' : q.type === 'application' ? 'Применение' : 'Перенос в контекст';

                        return (
                          <div key={qIdx} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                                {qIdx + 1}. {q.question}
                              </span>
                              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex-shrink-0">
                                {typeLabel}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, optIdx) => {
                                let btnClass = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                                if (answered) {
                                  if (optIdx === q.correctIndex) {
                                    btnClass = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                                  } else if (optIdx === selectedOpt) {
                                    btnClass = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                                  } else {
                                    btnClass = 'opacity-40';
                                  }
                                }

                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => handleQuizAnswer(qIdx, optIdx, q.correctIndex)}
                                    disabled={answered}
                                    className={`p-3 text-left rounded-xl border text-xs font-semibold transition-all ${btnClass}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            {answered && (
                              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 italic p-2 rounded-lg bg-white/60 dark:bg-gray-750 border border-gray-100 dark:border-gray-700">
                                💡 {q.explanations?.[selectedOpt] || q.explanation || (selectedOpt === q.correctIndex ? 'Правильно!' : 'Неверный вариант.')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <BookOpen className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-lg mb-1">
                  Теория по теме «{topicName}»
                </h4>
                <p className="text-sm max-w-md mx-auto mb-4">
                  Вы можете задать любой вопрос нашему AI-репетитору во вкладке «AI-Репетитор»!
                </p>
              </div>
            )
          ) : activeTab === 'exercises' ? (
            /* EXERCISES PRACTICE TAB (24+ Exercises) */
            currentEx ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-purple-50 dark:bg-gray-800 p-4 rounded-2xl border border-purple-100 dark:border-gray-700">
                  <div>
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                      Упражнение {exerciseIndex + 1} из {exercisesList.length}
                    </span>
                    <h3 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white mt-0.5">
                      {currentEx.type === 'multiple-choice' ? 'Выбор правильного ответа' :
                       currentEx.type === 'fill-in' ? 'Вставка слова в пропуск' :
                       currentEx.type === 'sentence-builder' ? 'Сборка фразы из слов' :
                       currentEx.type === 'transformation' ? 'Трансформация формы' : 'Перевод на испанский'}
                    </h3>
                  </div>

                  <div className="text-xs font-bold text-gray-500">
                    Отвечено: {Object.keys(exerciseAnswers).length}/{exercisesList.length}
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 space-y-5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[11px] font-extrabold uppercase">
                      {currentEx.type}
                    </span>
                    {currentEx.spiralReview && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[11px] font-extrabold">
                        🔄 Спиральное повторение
                      </span>
                    )}
                  </div>

                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-relaxed">
                    {currentEx.question}
                  </p>

                  {/* Multiple Choice Options */}
                  {currentEx.options && currentEx.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {currentEx.options.map((opt, optIdx) => {
                        const isAns = exerciseAnswers[currentEx.id] !== undefined;
                        const isSelected = exerciseAnswers[currentEx.id]?.selected === optIdx;
                        const isCorrectOpt = optIdx === currentEx.correctIndex || opt === currentEx.correctAnswer;

                        let btnCls = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                        if (isAns) {
                          if (isCorrectOpt) btnCls = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                          else if (isSelected) btnCls = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                          else btnCls = 'opacity-40';
                        }

                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleExerciseOptionSelect(currentEx, optIdx)}
                            disabled={isAns}
                            className={`p-3.5 text-left rounded-2xl border text-xs sm:text-sm font-semibold transition-all shadow-sm ${btnCls}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Text Input for Fill-in, Transformation, Translation */}
                  {(!currentEx.options || currentEx.options.length === 0) && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={userExInput}
                          onChange={(e) => setUserExInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleExerciseTextSubmit(currentEx); }}
                          disabled={Boolean(exerciseAnswers[currentEx.id])}
                          placeholder="Введите ответ на испанском..."
                          className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border border-purple-200 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                        />
                        <button
                          onClick={() => handleExerciseTextSubmit(currentEx)}
                          disabled={Boolean(exerciseAnswers[currentEx.id]) || !userExInput.trim()}
                          className="px-5 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl text-sm shadow disabled:opacity-50"
                        >
                          Проверить
                        </button>
                      </div>

                      {exerciseAnswers[currentEx.id] && (
                        <div className={`p-3 rounded-xl text-xs sm:text-sm font-bold ${
                          exerciseAnswers[currentEx.id].correct
                            ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200'
                            : 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200'
                        }`}>
                          {exerciseAnswers[currentEx.id].correct ? '✅ Отлично! Ответ верный.' : `❌ Правильный ответ: ${currentEx.correctAnswer}`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explanation */}
                  {exerciseAnswers[currentEx.id] && currentEx.explanation && (
                    <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 text-xs sm:text-sm text-purple-900 dark:text-purple-200 leading-relaxed">
                      💡 {currentEx.explanation}
                    </div>
                  )}

                  {/* Exercise Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => {
                        setExerciseIndex(prev => Math.max(0, prev - 1));
                        setUserExInput('');
                      }}
                      disabled={exerciseIndex === 0}
                      className="px-4 py-2 text-xs font-bold text-gray-500 disabled:opacity-30"
                    >
                      Предыдущее
                    </button>

                    <button
                      onClick={() => {
                        setExerciseIndex(prev => (prev + 1) % exercisesList.length);
                        setUserExInput('');
                      }}
                      className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5"
                    >
                      <span>Следующее задание</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Упражнения загружаются...
              </div>
            )
          ) : (
            /* AI Tutor Chat Tab */
            <div className="flex flex-col h-full space-y-4">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl p-4 bg-purple-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-purple-200 dark:border-gray-700">
                    ¡Hola! Я твой личный репетитор по теме «{topicName}». Готов разобрать любые вопросы, привести примеры или дать тренировочные упражнения. Чем могу помочь?
                  </div>
                </div>

                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
                        m.role === 'user'
                          ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white'
                          : 'bg-purple-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-purple-200 dark:border-gray-700'
                      }`}
                    >
                      <FormattedMessage content={m.content} />
                    </div>
                  </div>
                ))}

                {sendingMessage && (
                  <div className="flex justify-start">
                    <div className="bg-purple-50 dark:bg-gray-800 rounded-2xl p-4 flex items-center space-x-2">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      <span className="text-xs text-gray-500">Репетитор думает...</span>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              <form onSubmit={handleSendTutorMessage} className="flex gap-2 pt-2 border-t border-purple-100 dark:border-gray-700">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Спроси что угодно по теме ${topicName}...`}
                  disabled={sendingMessage}
                  className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none text-sm text-gray-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sendingMessage}
                  className="p-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl shadow disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-purple-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 font-bold text-sm hover:underline"
          >
            Закрыть
          </button>

          {exercisesList.length > 0 && activeTab === 'theory' && (
            <button
              onClick={() => {
                setTheoryViewed(true);
                setActiveTab('exercises');
              }}
              className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs sm:text-sm flex items-center gap-2"
            >
              <span>
                {exercisesUnlocked
                  ? `Тренировать упражнения (${exercisesList.length})`
                  : 'Правило прочитано — перейти к упражнениям'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
