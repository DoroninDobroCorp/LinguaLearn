import React, { useState, useEffect } from 'react';
import { BookMarked, Plus, RotateCcw, Trash2, Check, X, AlertCircle, TrendingUp } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';

function Vocabulary() {
  const [words, setWords] = useState([]);
  const [dueWords, setDueWords] = useState([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState({ word: '', translation: '', example: '' });
  const [stats, setStats] = useState({ total: 0, due: 0, mastered: 0 });

  useEffect(() => {
    fetchWords();
    fetchDueWords();
  }, []);

  const fetchWords = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary'));
      const data = await response.json();
      setWords(data.words || []);
      
      const mastered = (data.words || []).filter(w => w.level >= 5).length;
      setStats(prev => ({ ...prev, total: (data.words || []).length, mastered }));
    } catch (error) {
      console.error('Error fetching words:', error);
    }
  };

  const fetchDueWords = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary/due'));
      const data = await response.json();
      setDueWords(data.words || []);
      setStats(prev => ({ ...prev, due: (data.words || []).length }));
    } catch (error) {
      console.error('Error fetching due words:', error);
    }
  };

  const addWord = async () => {
    if (!newWord.word.trim() || !newWord.translation.trim()) return;
    
    try {
      await profileFetch(profileApiUrl('/spanish/api/vocabulary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWord),
      });
      
      setNewWord({ word: '', translation: '', example: '' });
      setShowAddForm(false);
      fetchWords();
      fetchDueWords();
    } catch (error) {
      console.error('Error adding word:', error);
      alert('Failed to add word. It might already exist.');
    }
  };

  const reviewWord = async (quality) => {
    if (dueWords.length === 0) return;
    
    const currentWord = dueWords[currentWordIndex];
    
    try {
      await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${currentWord.id}/review`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality }),
      });
      
      // Переход к следующему слову
      if (currentWordIndex < dueWords.length - 1) {
        setCurrentWordIndex(currentWordIndex + 1);
      } else {
        setCurrentWordIndex(0);
        fetchDueWords();
      }
      
      setShowTranslation(false);
      fetchWords();
    } catch (error) {
      console.error('Error reviewing word:', error);
    }
  };

  const deleteWord = async (id) => {
    if (!confirm('Delete this word?')) return;
    
    try {
      await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${id}`), { method: 'DELETE' });
      fetchWords();
      fetchDueWords();
    } catch (error) {
      console.error('Error deleting word:', error);
    }
  };

  const currentWord = dueWords[currentWordIndex];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Статистика */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
          <BookMarked className="h-8 w-8 mr-3 text-indigo-600" />
          Vocabulary Practice
        </h2>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-indigo-100 to-indigo-200 rounded-xl p-4">
            <p className="text-sm text-indigo-700">Total Words</p>
            <p className="text-3xl font-bold text-indigo-900">{stats.total}</p>
          </div>
          
          <div className="bg-gradient-to-r from-orange-100 to-orange-200 rounded-xl p-4">
            <p className="text-sm text-orange-700">Due Today</p>
            <p className="text-3xl font-bold text-orange-900">{stats.due}</p>
          </div>
          
          <div className="bg-gradient-to-r from-green-100 to-green-200 rounded-xl p-4">
            <p className="text-sm text-green-700">Mastered</p>
            <p className="text-3xl font-bold text-green-900">{stats.mastered}</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="mt-4 w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md font-semibold flex items-center justify-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Add New Word</span>
        </button>
      </div>

      {/* Форма добавления слова */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Add New Word</h3>
          
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Spanish word..."
              value={newWord.word}
              onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-500"
            />
            
            <input
              type="text"
              placeholder="Translation (Russian)..."
              value={newWord.translation}
              onChange={(e) => setNewWord({ ...newWord, translation: e.target.value })}
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-500"
            />
            
            <textarea
              placeholder="Example sentence (optional)..."
              value={newWord.example}
              onChange={(e) => setNewWord({ ...newWord, example: e.target.value })}
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-500 resize-none"
              rows="2"
            />
            
            <div className="flex space-x-3">
              <button
                onClick={addWord}
                disabled={!newWord.word.trim() || !newWord.translation.trim()}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                Add Word
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Карточка для повторения */}
      {dueWords.length > 0 && currentWord ? (
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600 mb-2">
              Card {currentWordIndex + 1} of {dueWords.length}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
                style={{ width: `${((currentWordIndex + 1) / dueWords.length) * 100}%` }}
              />
            </div>
          </div>
          
          <div
            className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-12 min-h-[300px] flex flex-col items-center justify-center cursor-pointer border-4 border-indigo-300 hover:border-indigo-400 transition-all"
            onClick={() => setShowTranslation(!showTranslation)}
          >
            <p className="text-5xl font-bold text-indigo-900 mb-8">{currentWord.word}</p>
            
            {showTranslation ? (
              <div className="text-center space-y-4 animate-fadeIn">
                <p className="text-3xl text-purple-800">{currentWord.translation}</p>
                {currentWord.example && (
                  <p className="text-lg text-gray-700 italic mt-4 max-w-xl">
                    "{currentWord.example}"
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-lg">Click to reveal translation</p>
            )}
          </div>
          
          {showTranslation && (
            <div className="grid grid-cols-4 gap-3 mt-6">
              <button
                onClick={() => reviewWord(0)}
                className="px-4 py-4 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-md font-bold flex flex-col items-center space-y-1"
              >
                <X className="h-6 w-6" />
                <span>Don't Know</span>
              </button>
              
              <button
                onClick={() => reviewWord(1)}
                className="px-4 py-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all shadow-md font-bold flex flex-col items-center space-y-1"
              >
                <AlertCircle className="h-6 w-6" />
                <span>Hard</span>
              </button>
              
              <button
                onClick={() => reviewWord(2)}
                className="px-4 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all shadow-md font-bold flex flex-col items-center space-y-1"
              >
                <Check className="h-6 w-6" />
                <span>Good</span>
              </button>
              
              <button
                onClick={() => reviewWord(3)}
                className="px-4 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all shadow-md font-bold flex flex-col items-center space-y-1"
              >
                <TrendingUp className="h-6 w-6" />
                <span>Easy</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
          <RotateCcw className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-2">All caught up! 🎉</h3>
          <p className="text-gray-600">No words to review right now. Great job!</p>
        </div>
      )}

      {/* Список всех слов */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h3 className="text-2xl font-bold text-gray-800 mb-4">All Words ({words.length})</h3>
        
        {words.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No words yet. Add some above!</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {words.map(word => (
              <div
                key={word.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all"
              >
                <div className="flex-1">
                  <p className="font-bold text-gray-800 text-lg">{word.word}</p>
                  <p className="text-gray-600">{word.translation}</p>
                  {word.example && (
                    <p className="text-sm text-gray-500 italic mt-1">"{word.example}"</p>
                  )}
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Level</p>
                    <p className="font-bold text-indigo-600">{word.level.toFixed(1)}/5</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Reviews</p>
                    <p className="font-bold text-purple-600">{word.review_count}</p>
                  </div>
                  
                  <button
                    onClick={() => deleteWord(word.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Vocabulary;
