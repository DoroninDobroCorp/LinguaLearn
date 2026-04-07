import React, { useState, useEffect } from 'react';
import { Brain, Target, RefreshCw, CheckCircle, XCircle, Award, TrendingUp } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';

function Exercises() {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('random');
  const [exerciseType, setExerciseType] = useState('multiple-choice');
  const [currentExercise, setCurrentExercise] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });

  useEffect(() => {
    fetchTopics();
  }, []);

  const fetchTopics = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/topics'));
      const data = await response.json();
      setTopics(data.topics);
    } catch (error) {
      console.error('Error fetching topics:', error);
    }
  };

  const generateExercise = async () => {
    setLoading(true);
    setShowResult(false);
    setUserAnswer('');
    setSelectedOption(null);
    
    try {
      let prompt = '';
      
      if (selectedTopic === 'random') {
        prompt = `Generate a ${exerciseType} exercise on any Spanish topic suitable for practice.`;
      } else if (selectedTopic === 'weak') {
        const weakTopics = topics
          .filter(t => t.score < 50)
          .sort((a, b) => a.score - b.score)
          .slice(0, 5)
          .map(t => t.name);
        
        if (weakTopics.length === 0) {
          prompt = `Generate a ${exerciseType} exercise on any Spanish topic.`;
        } else {
          prompt = `Generate a ${exerciseType} exercise on one of these weak topics: ${weakTopics.join(', ')}. Focus on the weakest one.`;
        }
      } else {
        const topic = topics.find(t => t.id === parseInt(selectedTopic));
        prompt = `Generate a ${exerciseType} exercise specifically about: ${topic.name} (${topic.category}).`;
      }

      prompt += `\n\nIMPORTANT: Respond ONLY with the exercise JSON in this exact format, nothing else:
[EXERCISE: {"type": "${exerciseType}", "question": "...", ${exerciseType === 'multiple-choice' ? '"options": ["A", "B", "C", "D"], ' : ''}"correctAnswer": "...", "topic": "Topic Name", "level": "A1-C2"}]`;

      const response = await profileFetch(profileApiUrl('/spanish/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });

      const data = await response.json();
      
      // Парсинг упражнения
      const exerciseMatch = data.response.match(/\[EXERCISE: ({.*?})\]/s);
      if (exerciseMatch) {
        const exercise = JSON.parse(exerciseMatch[1]);
        setCurrentExercise(exercise);
      } else {
        console.error('No exercise found in response');
        alert('Failed to generate exercise. Please try again.');
      }
    } catch (error) {
      console.error('Error generating exercise:', error);
      alert('Error generating exercise. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = async () => {
    if (!currentExercise) return;
    
    let answer = '';
    if (exerciseType === 'multiple-choice') {
      answer = selectedOption;
    } else {
      answer = userAnswer.trim();
    }
    
    if (!answer) return;
    
    const correct = answer.toLowerCase() === currentExercise.correctAnswer.toLowerCase();
    setIsCorrect(correct);
    setShowResult(true);
    
    // Обновляем статистику
    setStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      incorrect: prev.incorrect + (correct ? 0 : 1)
    }));
    
    // Отправляем результат в backend для обновления прогресса
    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentExercise.topic,
          category: 'Practice',
          level: currentExercise.level,
          success: correct
        }),
      });
      fetchTopics(); // Обновляем список тем
    } catch (error) {
      console.error('Error updating topic:', error);
    }
  };

  const resetExercise = () => {
    setCurrentExercise(null);
    setUserAnswer('');
    setSelectedOption(null);
    setShowResult(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Статистика */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
          <Brain className="h-8 w-8 mr-3 text-purple-600" />
          Practice Exercises
        </h2>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-r from-purple-100 to-purple-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <Award className="h-8 w-8 text-purple-700" />
              <div>
                <p className="text-sm text-purple-700">Total</p>
                <p className="text-2xl font-bold text-purple-900">
                  {stats.correct + stats.incorrect}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-100 to-green-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-8 w-8 text-green-700" />
              <div>
                <p className="text-sm text-green-700">Correct</p>
                <p className="text-2xl font-bold text-green-900">{stats.correct}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-red-100 to-red-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <XCircle className="h-8 w-8 text-red-700" />
              <div>
                <p className="text-sm text-red-700">Incorrect</p>
                <p className="text-2xl font-bold text-red-900">{stats.incorrect}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Настройки упражнения */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
          <Target className="h-6 w-6 mr-2 text-pink-600" />
          Exercise Settings
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Тип упражнения */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Exercise Type
            </label>
            <select
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value)}
              className="w-full px-4 py-3 bg-purple-50 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 font-medium"
            >
              <option value="multiple-choice">📝 Multiple Choice (Quiz)</option>
              <option value="fill-blank">✍️ Fill in the Blank</option>
              <option value="open">💭 Open Question</option>
            </select>
          </div>
          
          {/* Выбор темы */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-4 py-3 bg-pink-50 border-2 border-pink-300 rounded-xl focus:outline-none focus:border-pink-500 font-medium"
            >
              <option value="random">🎲 Random Topic</option>
              <option value="weak">🎯 Focus on Weak Topics</option>
              {topics.length > 0 && <option disabled>────────────</option>}
              {topics.map(topic => (
                <option key={topic.id} value={topic.id}>
                  {topic.name} (Score: {topic.score.toFixed(0)})
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <button
          onClick={generateExercise}
          disabled={loading}
          className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-bold text-lg flex items-center justify-center space-x-3"
        >
          {loading ? (
            <>
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <TrendingUp className="h-6 w-6" />
              <span>Generate New Exercise</span>
            </>
          )}
        </button>
      </div>

      {/* Упражнение */}
      {currentExercise && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-4 border-purple-300 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <span className="px-4 py-2 bg-purple-300 text-purple-900 rounded-full text-sm font-bold">
                {currentExercise.type === 'multiple-choice' ? '📝 Quiz' : 
                 currentExercise.type === 'fill-blank' ? '✍️ Fill-in' : '💭 Open'}
              </span>
              <span className="px-4 py-2 bg-pink-300 text-pink-900 rounded-full text-sm font-bold">
                {currentExercise.level}
              </span>
              <span className="px-4 py-2 bg-indigo-300 text-indigo-900 rounded-full text-sm font-bold">
                {currentExercise.topic}
              </span>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 mb-6 border-2 border-purple-200">
            <p className="text-2xl font-bold text-gray-800 leading-relaxed">
              {currentExercise.question}
            </p>
          </div>
          
          {/* Multiple Choice */}
          {currentExercise.type === 'multiple-choice' && !showResult && (
            <div className="space-y-3 mb-6">
              {currentExercise.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedOption(option)}
                  className={`w-full text-left px-6 py-4 rounded-xl transition-all text-lg font-medium border-3 ${
                    selectedOption === option
                      ? 'bg-purple-300 border-purple-600 text-purple-900 scale-105 shadow-lg'
                      : 'bg-white border-purple-300 hover:border-purple-500 text-gray-800 hover:scale-102'
                  }`}
                >
                  <span className="font-bold mr-3 text-xl">{String.fromCharCode(65 + idx)}.</span>
                  {option}
                </button>
              ))}
            </div>
          )}
          
          {/* Multiple Choice - Результат */}
          {currentExercise.type === 'multiple-choice' && showResult && (
            <div className="space-y-3 mb-6">
              {currentExercise.options.map((option, idx) => (
                <div
                  key={idx}
                  className={`w-full text-left px-6 py-4 rounded-xl text-lg font-medium border-3 ${
                    option.toLowerCase() === currentExercise.correctAnswer.toLowerCase()
                      ? 'bg-green-200 border-green-600 text-green-900'
                      : option === selectedOption
                      ? 'bg-red-200 border-red-600 text-red-900'
                      : 'bg-gray-100 border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="font-bold mr-3 text-xl">{String.fromCharCode(65 + idx)}.</span>
                  {option}
                  {option.toLowerCase() === currentExercise.correctAnswer.toLowerCase() && (
                    <CheckCircle className="inline ml-3 h-6 w-6 text-green-700" />
                  )}
                  {option === selectedOption && option.toLowerCase() !== currentExercise.correctAnswer.toLowerCase() && (
                    <XCircle className="inline ml-3 h-6 w-6 text-red-700" />
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Fill-blank / Open */}
          {(currentExercise.type === 'fill-blank' || currentExercise.type === 'open') && (
            <div className="mb-6">
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !showResult && checkAnswer()}
                disabled={showResult}
                placeholder="Type your answer here..."
                className={`w-full px-6 py-4 rounded-xl border-3 text-lg font-medium ${
                  showResult
                    ? isCorrect
                      ? 'bg-green-100 border-green-600 text-green-900'
                      : 'bg-red-100 border-red-600 text-red-900'
                    : 'border-purple-400 focus:border-purple-600 focus:outline-none bg-white'
                }`}
              />
            </div>
          )}
          
          {/* Кнопки */}
          {!showResult ? (
            <button
              onClick={checkAnswer}
              disabled={
                (currentExercise.type === 'multiple-choice' && !selectedOption) ||
                ((currentExercise.type === 'fill-blank' || currentExercise.type === 'open') && !userAnswer.trim())
              }
              className="w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-bold text-xl"
            >
              ✓ Check Answer
            </button>
          ) : (
            <div className="space-y-4">
              {/* Результат */}
              <div className={`p-6 rounded-xl border-3 ${
                isCorrect
                  ? 'bg-green-100 border-green-500 text-green-900'
                  : 'bg-orange-100 border-orange-500 text-orange-900'
              }`}>
                {isCorrect ? (
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">Correct! 🎉</p>
                      <p className="text-lg">Great job! Keep it up!</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <XCircle className="h-10 w-10 text-orange-600" />
                    <div>
                      <p className="text-2xl font-bold">Not quite right</p>
                      <p className="text-lg">
                        The correct answer is: <span className="font-bold underline">{currentExercise.correctAnswer}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Следующее упражнение */}
              <button
                onClick={resetExercise}
                className="w-full px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg font-bold text-xl flex items-center justify-center space-x-3"
              >
                <RefreshCw className="h-6 w-6" />
                <span>Next Exercise</span>
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Подсказка если нет упражнения */}
      {!currentExercise && !loading && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-2xl p-8 text-center">
          <Brain className="h-16 w-16 mx-auto text-blue-600 mb-4" />
          <h3 className="text-2xl font-bold text-blue-900 mb-2">Ready to practice?</h3>
          <p className="text-blue-800 text-lg">
            Choose your settings above and click "Generate New Exercise" to start!
          </p>
        </div>
      )}
    </div>
  );
}

export default Exercises;
