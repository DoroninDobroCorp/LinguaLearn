import React, { useState, useEffect } from 'react';
import { Target, ArrowRight } from 'lucide-react';
import { soundEngine } from '../../utils/soundEffects';
import { 
  createVerbDrillQuestion, 
  isVerbDrillAnswerCorrect, 
  DRILL_TYPES 
} from '../../utils/verbDrills';

export default function VerbDrillsSection() {
  const [drillType, setDrillType] = useState('past_simple');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [stats, setStats] = useState({ correct: 0, completed: 0 });

  const loadQuestion = () => {
    setCurrentQuestion(createVerbDrillQuestion(drillType));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
  };

  useEffect(() => {
    loadQuestion();
  }, [drillType]);

  const handleCheck = () => {
    if (!currentQuestion || showResult || !answer.trim()) return;
    const correct = isVerbDrillAnswerCorrect(answer, currentQuestion.correctAnswer);
    setIsCorrect(correct);
    setShowResult(true);
    setStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      completed: prev.completed + 1
    }));

    if (correct) soundEngine.playCorrect();
    else soundEngine.playWrong();

    // Record or resolve mistake in grammar memory
    try {
      if (!correct) {
        fetch('/english/api/exercises/record-mistake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: DRILL_TYPES[drillType]?.title || 'Verb Forms & Tenses',
            category: 'verb_conjugation',
            level: 'A1',
            prompt: currentQuestion.prompt,
            userWrongAnswer: answer,
            correctAnswer: currentQuestion.correctAnswer,
            ruleExplanation: 'Правильная форма глагола в английском языке'
          })
        }).catch(() => {});
      } else {
        fetch('/english/api/exercises/resolve-mistake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'verb_conjugation',
            prompt: currentQuestion.prompt
          })
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Mistake tracking error in English VerbDrills:', e);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-purple-600" />
            <span>Тренажер глагольных форм и времен</span>
          </h3>
          <p className="text-xs text-gray-500">Отработка 2-й и 3-й форм неправильных глаголов, окончаний -s и -ing.</p>
        </div>

        <select
          value={drillType}
          onChange={(e) => setDrillType(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800"
        >
          {Object.entries(DRILL_TYPES).map(([id, info]) => (
            <option key={id} value={id}>{info.title}</option>
          ))}
        </select>
      </div>

      {currentQuestion && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-purple-50 border border-purple-200 space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Вопрос:</span>
            <p className="text-lg sm:text-xl font-bold text-gray-900">{currentQuestion.prompt}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {currentQuestion.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (!showResult) {
                    setAnswer(opt);
                    const correct = isVerbDrillAnswerCorrect(opt, currentQuestion.correctAnswer);
                    setIsCorrect(correct);
                    setShowResult(true);
                    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), completed: prev.completed + 1 }));
                    if (correct) soundEngine.playCorrect();
                    else soundEngine.playWrong();
                  }
                }}
                disabled={showResult}
                className={`p-4 rounded-xl border-2 font-bold text-base transition-all ${
                  showResult
                    ? isVerbDrillAnswerCorrect(opt, currentQuestion.correctAnswer)
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                      : opt === answer
                      ? 'bg-rose-50 border-rose-500 text-rose-900'
                      : 'opacity-40 border-gray-200'
                    : 'bg-white border-gray-200 hover:border-purple-400 text-gray-800'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {showResult && (
            <div className={`p-4 rounded-xl border space-y-1 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <p className="font-bold text-sm text-gray-900">
                {isCorrect ? '✅ Правильно!' : `❌ Правильный ответ: ${currentQuestion.correctAnswer}`}
              </p>
              <p className="text-xs text-gray-600">{currentQuestion.explanation}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-gray-400">
              Счет: {stats.correct} / {stats.completed}
            </span>

            <button
              onClick={loadQuestion}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md text-sm flex items-center gap-2"
            >
              <span>Следующий глагол</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
