import React, { useState, useEffect } from 'react';
import {
  BookOpen, Sparkles, Volume2, CheckCircle2, ChevronRight,
  RotateCcw, ArrowLeft, Plus, Check, Award, Compass, Heart, HelpCircle
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { soundEngine, speakSpanish } from '../utils/soundEffects';

export default function Stories() {
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');

  // Word popover state
  const [selectedWord, setSelectedWord] = useState(null);
  const [addedWordMap, setAddedWordMap] = useState({});

  // Question state
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [questionAnswered, setQuestionAnswered] = useState(false);
  const [isQuestionCorrect, setIsQuestionCorrect] = useState(false);

  // Completion state
  const [finishedStory, setFinishedStory] = useState(false);

  const fetchStories = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/stories'));
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
      }
    } catch (err) {
      console.error('Error fetching stories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const openStory = (story) => {
    setSelectedStory(story);
    const startChapterId = story.progress?.currentChapterId || story.chapters[0]?.id;
    const startChapter = story.chapters.find(c => c.id === startChapterId) || story.chapters[0];
    setCurrentChapter(startChapter);
    setSelectedWord(null);
    setSelectedAnswer(null);
    setQuestionAnswered(false);
    setFinishedStory(Boolean(story.progress?.isFinished));
  };

  const chooseOption = async (choice) => {
    soundEngine.playTileClick();
    const nextChapter = selectedStory.chapters.find(c => c.id === choice.targetChapterId);
    if (!nextChapter) return;

    setCurrentChapter(nextChapter);
    setSelectedWord(null);
    setSelectedAnswer(null);
    setQuestionAnswered(false);

    const isEnd = Boolean(nextChapter.isEnd);
    if (isEnd) {
      setFinishedStory(true);
      soundEngine.playLevelUp();
    }

    try {
      await profileFetch(profileApiUrl(`/spanish/api/stories/${selectedStory.id}/progress`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: nextChapter.id,
          isFinished: isEnd,
          xp: isEnd ? (selectedStory.xpReward || 100) : 35
        })
      });
      fetchStories();
    } catch (err) {
      console.error('Error saving story progress:', err);
    }
  };

  const handleAnswerQuestion = (idx) => {
    if (questionAnswered || !currentChapter?.question) return;
    setSelectedAnswer(idx);
    setQuestionAnswered(true);
    const correct = idx === currentChapter.question.correctIndex;
    setIsQuestionCorrect(correct);
    if (correct) {
      soundEngine.playCorrect();
    } else {
      soundEngine.playWrong();
    }
  };

  const addWordToVocabulary = async (vocab) => {
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/vocabulary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: vocab.word,
          translation: vocab.translation,
          example: `${currentChapter.title}: ${vocab.word} - ${vocab.note || ''}`
        })
      });
      if (res.ok) {
        soundEngine.playCorrect();
        setAddedWordMap(prev => ({ ...prev, [vocab.word]: true }));
      }
    } catch (err) {
      console.error('Error adding word to vocabulary:', err);
    }
  };

  const filteredStories = stories.filter(s => {
    if (filterLevel !== 'all' && s.level.toLowerCase() !== filterLevel.toLowerCase()) return false;
    return true;
  });

  // Render Story Reader
  if (selectedStory && currentChapter) {
    const isEnd = Boolean(currentChapter.isEnd);

    return (
      <div className="max-w-4xl mx-auto px-4 py-6 animate-fadeIn">
        {/* Top bar navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSelectedStory(null)}
            className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 font-semibold text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a las Historias</span>
          </button>

          <div className="flex items-center space-x-3">
            <span className="text-xs bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 px-2.5 py-1 rounded-full font-bold">
              {selectedStory.level}
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {selectedStory.dialect}
            </span>
          </div>
        </div>

        {/* Story Book Container */}
        <div className="glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 relative overflow-hidden bg-white/90 dark:bg-gray-850/90 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-purple-100 dark:border-gray-700 pb-6 mb-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-3xl">{selectedStory.coverEmoji}</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                  {selectedStory.title}
                </h1>
              </div>
              <h2 className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {currentChapter.title}
              </h2>
            </div>

            {/* Audio narrator button */}
            <button
              onClick={() => speakSpanish(currentChapter.text, selectedStory.dialect)}
              className="p-3 bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 text-purple-700 dark:text-purple-300 rounded-2xl transition-transform active:scale-95 shadow-sm"
              title="Escuchar audio en español"
            >
              <Volume2 className="w-6 h-6" />
            </button>
          </div>

          {/* Narrative Text */}
          <div className="text-lg sm:text-xl text-gray-800 dark:text-gray-200 leading-relaxed space-y-4 font-serif">
            <p>{currentChapter.text}</p>

            {/* Dialogue quotes */}
            {currentChapter.dialogue && currentChapter.dialogue.map((d, idx) => (
              <div
                key={idx}
                className="my-4 p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-l-4 border-purple-500 text-gray-900 dark:text-white italic"
              >
                <span className="font-bold not-italic text-purple-700 dark:text-purple-300 mr-2">
                  — {d.speaker}:
                </span>
                «{d.text}»
              </div>
            ))}
          </div>

          {/* Clickable Vocabulary Highlights Chips */}
          {currentChapter.vocabHighlights && currentChapter.vocabHighlights.length > 0 && (
            <div className="mt-8 pt-6 border-t border-purple-100 dark:border-gray-700">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Vocabulario clave (Toca para traducir y guardar):
              </div>
              <div className="flex flex-wrap gap-2">
                {currentChapter.vocabHighlights.map((vocab, i) => {
                  const isAdded = Boolean(addedWordMap[vocab.word]);
                  const isSelected = selectedWord?.word === vocab.word;

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        soundEngine.playTileClick();
                        setSelectedWord(isSelected ? null : vocab);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center space-x-1.5 ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-md scale-105'
                          : 'bg-purple-50 dark:bg-gray-700 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-gray-600 border border-purple-200 dark:border-gray-600'
                      }`}
                    >
                      <span>{vocab.word}</span>
                      <span className="text-xs opacity-75 font-normal">({vocab.translation})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Word Popover Details Card */}
          {selectedWord && (
            <div className="my-6 p-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xl animate-fadeIn">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold">{selectedWord.word}</span>
                    <button
                      onClick={() => speakSpanish(selectedWord.word, selectedStory.dialect)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                      title="Pronunciar"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-lg font-medium text-purple-100 mt-1">
                    Перевод: {selectedWord.translation}
                  </div>
                  {selectedWord.note && (
                    <div className="text-xs text-purple-200 mt-1 italic">
                      💡 {selectedWord.note}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => addWordToVocabulary(selectedWord)}
                  disabled={addedWordMap[selectedWord.word]}
                  className={`px-4 py-2 rounded-xl text-xs font-bold shadow transition-all flex items-center space-x-1.5 ${
                    addedWordMap[selectedWord.word]
                      ? 'bg-green-500 text-white cursor-default'
                      : 'bg-white text-purple-900 hover:bg-purple-50 active:scale-95'
                  }`}
                >
                  {addedWordMap[selectedWord.word] ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>¡Guardado en Vocabulario!</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>+ Guardar palabra</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Chapter Question (Comprehension Check) */}
          {currentChapter.question && !isEnd && (
            <div className="my-8 p-6 rounded-2xl bg-purple-50/70 dark:bg-gray-800/70 border border-purple-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 text-purple-700 dark:text-purple-300 font-bold text-sm mb-3">
                <HelpCircle className="w-4 h-4" />
                <span>Comprueba tu comprensión:</span>
              </div>
              <p className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                {currentChapter.question.prompt}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentChapter.question.options.map((opt, idx) => {
                  let btnStyle = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                  if (questionAnswered) {
                    if (idx === currentChapter.question.correctIndex) {
                      btnStyle = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                    } else if (idx === selectedAnswer) {
                      btnStyle = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                    } else {
                      btnStyle = 'opacity-50';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswerQuestion(idx)}
                      disabled={questionAnswered}
                      className={`p-3 text-left rounded-xl border-2 text-sm transition-all ${btnStyle}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Branching Choices */}
          {!isEnd && currentChapter.choices && (
            <div className="mt-8 pt-6 border-t border-purple-100 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Compass className="w-5 h-5 text-fuchsia-500" />
                ¿Qué decides hacer ahora? (Elige tu camino):
              </h3>

              <div className="space-y-3">
                {currentChapter.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => chooseOption(choice)}
                    className="w-full text-left p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 to-fuchsia-500/10 hover:from-purple-500/20 hover:to-fuchsia-500/20 border-2 border-purple-300 dark:border-purple-700/60 hover:border-purple-500 dark:hover:border-purple-400 transition-all transform hover:-translate-y-0.5 active:scale-[0.99] flex items-center justify-between group shadow-sm"
                  >
                    <div className="pr-4">
                      <div className="font-bold text-gray-900 dark:text-white text-base">
                        {choice.text}
                      </div>
                      {choice.consequence && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {choice.consequence}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-6 h-6 text-purple-500 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* End of Story Celebration */}
          {isEnd && (
            <div className="mt-8 p-8 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-purple-600 text-white text-center shadow-2xl animate-fadeIn">
              <div className="text-5xl mb-3">🎉</div>
              <h3 className="text-2xl sm:text-3xl font-extrabold mb-2">
                ¡Felicitaciones! Has completado la historia
              </h3>
              <p className="text-sm text-emerald-100 max-w-md mx-auto mb-6">
                Has descubierto el final y practicado español en un contexto auténtico.
              </p>

              <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full text-sm font-bold mb-6">
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>+{selectedStory.xpReward || 100} XP ganados</span>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={() => openStory(selectedStory)}
                  className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-all text-sm flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Releer con otras decisiones</span>
                </button>
                <button
                  onClick={() => setSelectedStory(null)}
                  className="px-6 py-2.5 bg-white text-gray-900 font-bold rounded-xl shadow-lg hover:bg-gray-100 transition-transform active:scale-95 text-sm"
                >
                  Ver más historias
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Catalog
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Title banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient flex items-center gap-3">
            <BookOpen className="h-9 w-9 text-fuchsia-500" />
            Cuentos Interactivos
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-base">
            Lee historias apasionantes, toma decisiones que cambian el final y aprende vocabulario con traducción en 1 toque.
          </p>
        </div>

        {/* Filter by level */}
        <div className="flex items-center space-x-2 bg-white/80 dark:bg-gray-800/80 p-1.5 rounded-2xl border border-purple-200 dark:border-gray-700 shadow-sm">
          {['all', 'A1', 'A2', 'B1'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterLevel === lvl
                  ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-purple-600'
              }`}
            >
              {lvl === 'all' ? 'Todos los niveles' : `Nivel ${lvl}`}
            </button>
          ))}
        </div>
      </div>

      {/* Stories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStories.map((story) => {
          const isFinished = Boolean(story.progress?.isFinished);
          const hasStarted = story.progress?.completedChapters?.length > 0;

          return (
            <div
              key={story.id}
              className="glass-card rounded-3xl p-6 shadow-xl border border-purple-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-gray-800/80 group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-100 to-purple-100 dark:from-fuchsia-950/40 dark:to-purple-950/40 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                    {story.coverEmoji}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
                      {story.level}
                    </span>
                    {isFinished && (
                      <span className="flex items-center space-x-1 text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Completado</span>
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {story.title}
                </h3>
                <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold mb-3">
                  📍 {story.dialect}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-6">
                  {story.summary}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-semibold mb-4 pt-4 border-t border-purple-50 dark:border-gray-700">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    +{story.xpReward} XP
                  </span>
                  <span>{story.chapters.length} capítulos</span>
                </div>

                <button
                  onClick={() => openStory(story)}
                  className="w-full py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center space-x-2 text-sm"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>{isFinished ? 'Releer Historia' : hasStarted ? 'Continuar Historia' : 'Comenzar Historia'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
