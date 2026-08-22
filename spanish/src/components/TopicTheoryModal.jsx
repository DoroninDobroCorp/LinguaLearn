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
import InteractiveVocabularyIntro from './InteractiveVocabularyIntro';
import BiteSizedTheoryDeck from './BiteSizedTheoryDeck';

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
  const [isEnrolling, setIsEnrolling] = useState(false);

  const handleEnrollVocabulary = async () => {
    try {
      setIsEnrolling(true);
      const targetId = topicId || theoryData?.id || 1;
      const res = await profileFetch(profileApiUrl(`/spanish/api/curriculum/topics/${targetId}/enroll-vocabulary`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: starterVocabulary })
      });
      if (res.ok) {
        soundEngine.playLevelUp();
        window.dispatchEvent(new CustomEvent('gamification_updated'));
      }
    } catch (e) {
      console.error('Error enrolling topic vocabulary:', e);
    } finally {
      setIsEnrolling(false);
      setVocabularyConfirmed(true);
      setActiveTab('theory');
    }
  };
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
            <InteractiveVocabularyIntro
              words={starterVocabulary}
              topicName={theoryData?.russianTitle || topicName}
              isEnrolling={isEnrolling}
              onComplete={handleEnrollVocabulary}
              onSkipToTheory={() => {
                setVocabularyConfirmed(true);
                setActiveTab('theory');
              }}
            />
          ) : activeTab === 'theory' ? (
            theoryData ? (
              <BiteSizedTheoryDeck
                theoryData={theoryData}
                topicName={theoryData.russianTitle || topicName}
                onFinishTheory={() => setExercisesUnlocked(true)}
                onStartExercises={() => {
                  setExercisesUnlocked(true);
                  if (exercisesList.length > 0) setActiveTab('exercises');
                }}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                Теоретические материалы для этой темы пока готовятся...
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
