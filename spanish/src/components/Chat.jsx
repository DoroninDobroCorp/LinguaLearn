import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { profileApiUrl } from '../utils/api';

// Компонент интерактивного упражнения
function ExerciseWidget({ exercise, onAnswer }) {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (submitted) return;
    
    let answer;
    if (exercise.type === 'multiple-choice') {
      answer = selectedOption;
    } else {
      answer = userAnswer.trim();
    }
    
    if (!answer) return;
    
    setSubmitted(true);
    const isCorrect = answer.toLowerCase() === exercise.correctAnswer.toLowerCase();
    onAnswer(answer, isCorrect, exercise);
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-5 my-3 shadow-md">
      <div className="flex items-center space-x-2 mb-3">
        <span className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-xs font-semibold">
          {exercise.type === 'multiple-choice' ? '📝 Quiz' : exercise.type === 'fill-blank' ? '✍️ Fill in' : '💭 Open Question'}
        </span>
        <span className="px-3 py-1 bg-pink-200 text-pink-800 rounded-full text-xs font-semibold">
          {exercise.level}
        </span>
      </div>
      
      <p className="text-lg font-medium text-gray-800 mb-4">{exercise.question}</p>
      
      {exercise.type === 'multiple-choice' && (
        <div className="space-y-2 mb-4">
          {exercise.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => !submitted && setSelectedOption(option)}
              disabled={submitted}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                submitted
                  ? option.toLowerCase() === exercise.correctAnswer.toLowerCase()
                    ? 'bg-green-200 border-2 border-green-500 text-green-900'
                    : option === selectedOption
                    ? 'bg-red-200 border-2 border-red-500 text-red-900'
                    : 'bg-gray-100 text-gray-500'
                  : selectedOption === option
                  ? 'bg-purple-200 border-2 border-purple-500 text-purple-900'
                  : 'bg-white border-2 border-gray-300 hover:border-purple-400 text-gray-800'
              }`}
            >
              <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>
              {option}
              {submitted && option.toLowerCase() === exercise.correctAnswer.toLowerCase() && (
                <CheckCircle className="inline ml-2 h-5 w-5 text-green-600" />
              )}
              {submitted && option === selectedOption && option.toLowerCase() !== exercise.correctAnswer.toLowerCase() && (
                <XCircle className="inline ml-2 h-5 w-5 text-red-600" />
              )}
            </button>
          ))}
        </div>
      )}
      
      {(exercise.type === 'fill-blank' || exercise.type === 'open') && (
        <input
          type="text"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={submitted}
          placeholder="Type your answer..."
          className={`w-full px-4 py-3 rounded-lg border-2 mb-4 ${
            submitted
              ? userAnswer.toLowerCase() === exercise.correctAnswer.toLowerCase()
                ? 'bg-green-100 border-green-500 text-green-900'
                : 'bg-red-100 border-red-500 text-red-900'
              : 'border-purple-300 focus:border-purple-500 focus:outline-none'
          }`}
        />
      )}
      
      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={exercise.type === 'multiple-choice' ? !selectedOption : !userAnswer.trim()}
          className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md font-semibold"
        >
          Submit Answer
        </button>
      )}
      
      {submitted && (
        <div className={`mt-3 p-3 rounded-lg ${
          userAnswer.toLowerCase() === exercise.correctAnswer.toLowerCase() || selectedOption?.toLowerCase() === exercise.correctAnswer.toLowerCase()
            ? 'bg-green-100 text-green-800'
            : 'bg-orange-100 text-orange-800'
        }`}>
          {userAnswer.toLowerCase() === exercise.correctAnswer.toLowerCase() || selectedOption?.toLowerCase() === exercise.correctAnswer.toLowerCase() ? (
            <p className="font-semibold">✅ Correct!</p>
          ) : (
            <p className="font-semibold">💡 The correct answer was: <span className="underline">{exercise.correctAnswer}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Загрузка истории чата при монтировании
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch(profileApiUrl('/spanish/api/chat/history'));
        const data = await response.json();
        
        if (data.history.length > 0) {
          setMessages(data.history);
        } else {
          // Приветственное сообщение только если история пустая
          setMessages([{
            role: 'assistant',
            content: 'Hey there! I\'m your Spanish learning assistant. Ready to help you practice, give you exercises, or just chat in Spanish. What would you like to work on today?'
          }]);
        }
      } catch (error) {
        console.error('Error loading chat history:', {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        // Приветственное сообщение в случае ошибки
        setMessages([{
          role: 'assistant',
          content: 'Hey there! I\'m your Spanish learning assistant. Ready to help you practice, give you exercises, or just chat in Spanish. What would you like to work on today?'
        }]);
      }
    };
    
    loadHistory();
  }, []);
  
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };
  
  const sendMessage = async (messageText) => {
    const userMessage = messageText || input.trim();
    if (!userMessage || loading) return;
    
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    
    try {
      const response = await fetch(profileApiUrl('/spanish/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      
      const data = await response.json();
      
      // Обработка изменений тем
      if (data.topicChanges && data.topicChanges.length > 0) {
        data.topicChanges.forEach(change => {
          if (change.isNew) {
            showToast(`🆕 New topic: ${change.name} (${change.level})`, 'new');
          } else if (change.success) {
            showToast(`✅ ${change.name} +${change.scoreChange} (${change.newScore}/100)`, 'success');
          } else {
            showToast(`❌ ${change.name} ${change.scoreChange} (${change.newScore}/100)`, 'error');
          }
        });
      }
      
      // Парсинг упражнений
      const exerciseMatch = data.response.match(/\[EXERCISE: ({.*?})\]/s);
      let exercise = null;
      let cleanResponse = data.response;
      
      if (exerciseMatch) {
        try {
          exercise = JSON.parse(exerciseMatch[1]);
          cleanResponse = data.response.replace(/\[EXERCISE: ({.*?})\]/s, '').trim();
        } catch (e) {
          console.error('Error parsing exercise:', e);
        }
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: cleanResponse,
        exercise: exercise 
      }]);
    } catch (error) {
      console.error('Chat error details:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        userMessage: userMessage
      });
      
      let errorMessage = 'Oops! Something went wrong. Please try again.';
      
      if (error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('API')) {
        errorMessage = 'API error. The service might be temporarily unavailable.';
      }
      
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: errorMessage }
      ]);
      
      showToast('⚠️ Error occurred. Check console for details.', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleExerciseAnswer = (answer, isCorrect, exercise) => {
    // Отправляем ответ пользователя
    const feedback = `My answer: ${answer}`;
    sendMessage(feedback);
  };
  
  const clearChat = async () => {
    if (!confirm('Clear chat history?')) return;
    
    try {
      await fetch(profileApiUrl('/spanish/api/chat/clear'), { method: 'DELETE' });
      setMessages([
        {
          role: 'assistant',
          content: 'Chat cleared! Let\'s start fresh. What would you like to do?'
        }
      ]);
    } catch (error) {
      console.error('Error clearing chat:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      showToast('⚠️ Failed to clear chat. Please try again.', 'error');
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(null);
    }
  };
  
  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white rounded-2xl shadow-2xl overflow-hidden relative">
      {/* Toast notifications */}
      <div className="absolute top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg animate-slideIn flex items-center space-x-2 min-w-[250px] ${
              toast.type === 'new' 
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                : toast.type === 'success'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                : 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
            }`}
          >
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        ))}
      </div>
      
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-300 to-violet-300 px-6 py-4 flex justify-between items-center">
        <h2 className="text-xl font-bold text-fuchsia-900">Chat with Assistant</h2>
        <button
          onClick={clearChat}
          className="flex items-center space-x-2 px-3 py-2 bg-fuchsia-400 hover:bg-fuchsia-500 text-fuchsia-900 rounded-lg transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-sm">Clear</span>
        </button>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx}>
            <div
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-md ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-fuchsia-400 to-pink-300 text-fuchsia-900'
                    : 'bg-gradient-to-r from-violet-300 to-violet-200 text-purple-900'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
            
            {/* Интерактивное упражнение */}
            {msg.role === 'assistant' && msg.exercise && (
              <div className="flex justify-start mt-2">
                <div className="max-w-[70%]">
                  <ExerciseWidget 
                    exercise={msg.exercise} 
                    onAnswer={handleExerciseAnswer}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gradient-to-r from-violet-300 to-violet-200 text-purple-900 rounded-2xl px-5 py-3 shadow-md">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="bg-gradient-to-r from-pink-200 to-violet-200 px-6 py-4">
        <div className="flex space-x-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 resize-none rounded-xl px-4 py-3 bg-white border-2 border-pink-300 focus:border-fuchsia-400 focus:outline-none shadow-sm"
            rows="1"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(null)}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-gradient-to-r from-fuchsia-400 to-purple-400 text-fuchsia-900 rounded-xl hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
