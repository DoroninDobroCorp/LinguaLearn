import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  Brain,
  Check,
  Clock3,
  Download,
  Keyboard,
  Languages,
  Mic,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Square,
  Trash2,
  TrendingUp,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { useSpeechPractice } from '../hooks/useSpeechPractice';
import { profileApiUrl, profileFetch } from '../utils/api';
import {
  getVoicePracticeSpanishContent,
  getVisibleSpanishContent,
  shouldStopSpeakingOnCardFlip,
} from '../utils/speechPractice';
import { scoreTypedAnswer } from '../utils/answerMatching';

const TYPING_MODE_STORAGE_KEY = 'spanishVocabTypingMode';

function readStoredTypingMode() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TYPING_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistTypingMode(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TYPING_MODE_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Storage may be unavailable (private mode); non-fatal.
  }
}

const INITIAL_STATS = {
  total_entries: 0,
  due_entries: 0,
  total_cards: 0,
  due_cards: 0,
  learned_cards: 0,
  mastered_entries: 0,
  pending_completion_entries: 0,
  unreviewable_cards: 0,
  directions: {
    source_to_target: {
      label: 'Spanish → Translation',
      total_cards: 0,
      due_cards: 0,
      learning_cards: 0,
      review_cards: 0,
      learned_cards: 0,
      unreviewable_cards: 0,
    },
    target_to_source: {
      label: 'Translation → Spanish',
      total_cards: 0,
      due_cards: 0,
      learning_cards: 0,
      review_cards: 0,
      learned_cards: 0,
      unreviewable_cards: 0,
    },
  },
};

const DIRECTION_ORDER = ['source_to_target', 'target_to_source'];

const REVIEW_ACTIONS = [
  {
    key: 'dont_know',
    label: "Don't Know",
    icon: X,
    className: 'bg-red-500 hover:bg-red-600',
  },
  {
    key: 'hard',
    label: 'Hard',
    icon: AlertCircle,
    className: 'bg-orange-500 hover:bg-orange-600',
  },
  {
    key: 'good',
    label: 'Good',
    icon: Check,
    className: 'bg-blue-500 hover:bg-blue-600',
  },
  {
    key: 'easy',
    label: 'Easy',
    icon: TrendingUp,
    className: 'bg-green-500 hover:bg-green-600',
  },
];

const STATUS_STYLES = {
  new: 'bg-sky-100 text-sky-700 border border-sky-200',
  learning: 'bg-amber-100 text-amber-700 border border-amber-200',
  review: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  snoozed: 'bg-slate-100 text-slate-700 border border-slate-200',
  learned: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

function formatRelativeTime(value) {
  if (!value) return 'Not scheduled';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';

  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return 'Due now';

  const totalMinutes = Math.ceil(diffMs / (1000 * 60));
  if (totalMinutes < 60) return `In ${totalMinutes}m`;

  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (totalHours < 24) return `In ${totalHours}h`;

  const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (totalDays <= 45) return `In ${totalDays}d`;

  return date.toLocaleDateString();
}

function statusLabel(status) {
  switch (status) {
    case 'new':
      return 'New';
    case 'learning':
      return 'Learning';
    case 'review':
      return 'Review';
    case 'snoozed':
      return 'Snoozed';
    case 'learned':
      return 'Learned';
    default:
      return status;
  }
}

function VoiceActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  title,
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function Vocabulary() {
  const [entries, setEntries] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [queueStats, setQueueStats] = useState({ total_due: 0, returned: 0, limit: 40 });
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState({ word: '', translation: '', example: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [typingMode, setTypingMode] = useState(() => readStoredTypingMode());
  const [typedAnswer, setTypedAnswer] = useState('');
  const [typingFeedback, setTypingFeedback] = useState(null);
  const fileInputRef = useRef(null);
  const autoPlayedCardKeyRef = useRef('');
  const typingInputRef = useRef(null);
  const {
    capabilities: speechCapabilities,
    selectedVoice,
    playbackSupport,
    isSpeaking,
    ttsError,
    speakText,
    stopSpeaking,
    isRecording,
    isRecordingStarting,
    hasRecording,
    recordingError,
    startRecording,
    stopRecording,
    playRecording,
    clearRecording,
    resetPractice,
  } = useSpeechPractice();

  const currentCard = reviewQueue[0] || null;
  const visibleSpanish = useMemo(
    () => getVisibleSpanishContent(currentCard, showAnswer),
    [currentCard, showAnswer],
  );
  const isVoicePracticeBusy = isRecording || isRecordingStarting;
  const practiceSpanish = useMemo(
    () => getVoicePracticeSpanishContent({
      card: currentCard,
      showAnswer,
      isRecording,
      isStarting: isRecordingStarting,
    }),
    [currentCard, isRecording, isRecordingStarting, showAnswer],
  );

  const toggleShowAnswer = useCallback(() => {
    if (isVoicePracticeBusy) {
      return;
    }

    const nextShowAnswer = !showAnswer;
    if (shouldStopSpeakingOnCardFlip({
      card: currentCard,
      showAnswer,
      isSpeaking,
    })) {
      stopSpeaking();
    }

    setShowAnswer(nextShowAnswer);
  }, [currentCard, isSpeaking, isVoicePracticeBusy, showAnswer, stopSpeaking]);

  const refreshVocabulary = async () => {
    const [entriesResponse, queueResponse] = await Promise.all([
      profileFetch(profileApiUrl('/spanish/api/vocabulary')),
      profileFetch(profileApiUrl('/spanish/api/vocabulary/review-queue?limit=40')),
    ]);

    if (!entriesResponse.ok) {
      const data = await entriesResponse.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to fetch vocabulary');
    }

    if (!queueResponse.ok) {
      const data = await queueResponse.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to fetch review queue');
    }

    const entriesData = await entriesResponse.json();
    const queueData = await queueResponse.json();

    setEntries(entriesData.entries || []);
    setStats(entriesData.stats || INITIAL_STATS);
    setReviewQueue(queueData.cards || []);
    setQueueStats(queueData.stats || { total_due: 0, returned: 0, limit: 40 });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');
      setNotice('');
      try {
        await refreshVocabulary();
        if (!cancelled) {
          setShowAnswer(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error('Error loading vocabulary:', loadError);
          setError(loadError.message || 'Failed to load vocabulary');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    resetPractice();
  }, [currentCard?.card_id, currentCard?.direction, resetPractice]);

  useEffect(() => {
    setTypedAnswer('');
    setTypingFeedback(null);
  }, [currentCard?.card_id, currentCard?.direction]);

  useEffect(() => {
    if (typingMode && !showAnswer && currentCard && typingInputRef.current) {
      typingInputRef.current.focus();
    }
  }, [currentCard?.card_id, currentCard?.direction, typingMode, showAnswer, currentCard]);

  const toggleTypingMode = useCallback(() => {
    setTypingMode((prev) => {
      const next = !prev;
      persistTypingMode(next);
      return next;
    });
    setTypedAnswer('');
    setTypingFeedback(null);
  }, []);

  const checkTypedAnswer = useCallback(() => {
    if (!currentCard) return;
    const result = scoreTypedAnswer(typedAnswer, currentCard.answer);
    if (result.status === 'empty') {
      return;
    }
    setTypingFeedback(result);
    setShowAnswer(true);
  }, [currentCard, typedAnswer]);

  useEffect(() => {
    const currentCardKey = currentCard
      ? `${currentCard.card_id ?? currentCard.id ?? 'unknown'}:${currentCard.direction ?? 'unknown'}`
      : '';

    if (!currentCardKey) {
      autoPlayedCardKeyRef.current = '';
      return;
    }

    if (autoPlayedCardKeyRef.current === currentCardKey) {
      return;
    }

    if (!visibleSpanish.text) {
      autoPlayedCardKeyRef.current = currentCardKey;
      return;
    }

    if (isVoicePracticeBusy || !playbackSupport.supported) {
      return;
    }

    if (speakText(visibleSpanish.text)) {
      autoPlayedCardKeyRef.current = currentCardKey;
    }
  }, [
    currentCard,
    isVoicePracticeBusy,
    playbackSupport.supported,
    speakText,
    visibleSpanish.text,
  ]);

  const effectiveDueTotal = Number.isFinite(stats.due_entries)
    ? stats.due_entries
    : queueStats.total_due;

  const dueLabel = useMemo(() => {
    if (effectiveDueTotal > reviewQueue.length) {
      return `${reviewQueue.length} loaded of ${effectiveDueTotal} due`;
    }
    return `${effectiveDueTotal} due now`;
  }, [effectiveDueTotal, reviewQueue.length]);

  const speechVoiceLabel = selectedVoice
    ? `${selectedVoice.name}${selectedVoice.lang ? ` (${selectedVoice.lang})` : ''}`
    : 'a local Spanish voice on this device';

  const typingModeToggle = (
    <button
      type="button"
      onClick={toggleTypingMode}
      aria-pressed={typingMode}
      title="Type the answer instead of flipping the card"
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border transition-colors ${typingMode ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
    >
      <Keyboard className="h-4 w-4" />
      {typingMode ? 'Typing mode: on' : 'Typing mode: off'}
    </button>
  );

  const addWord = async () => {
    if (!newWord.word.trim() || !newWord.translation.trim()) return;

    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWord),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add word');
      }

      setNewWord({ word: '', translation: '', example: '' });
      setShowAddForm(false);
      await refreshVocabulary();
    } catch (submitError) {
      console.error('Error adding word:', submitError);
      setError(submitError.message || 'Failed to add word');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReview = async (endpoint, body) => {
    if (!currentCard) return;

    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await profileFetch(profileApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update review card');
      }

      resetPractice();
      await refreshVocabulary();
      setShowAnswer(false);
    } catch (reviewError) {
      console.error('Error updating review card:', reviewError);
      setError(reviewError.message || 'Failed to update review card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReview = async (grade) => {
    if (!currentCard) return;
    await submitReview(`/spanish/api/vocabulary/${currentCard.id}/review`, { grade });
  };

  const handleLearned = async () => {
    if (!currentCard) return;
    await submitReview(`/spanish/api/vocabulary/${currentCard.id}/learned`);
  };

  const deleteWord = async (entryId) => {
    if (!window.confirm('Delete this vocabulary entry and its review progress?')) return;

    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${entryId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete word');
      }

      await refreshVocabulary();
      setShowAnswer(false);
    } catch (deleteError) {
      console.error('Error deleting word:', deleteError);
      setError(deleteError.message || 'Failed to delete word');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    setIsSubmitting(true);
    setError('');
    setNotice('');

    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary/export'));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to export vocabulary');
      }

      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `spanish-vocabulary-profile-${payload.profile?.id || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setNotice(`Exported ${payload.entries?.length || 0} vocabulary ${payload.entries?.length === 1 ? 'entry' : 'entries'}.`);
    } catch (exportError) {
      console.error('Error exporting vocabulary:', exportError);
      setError(exportError.message || 'Failed to export vocabulary');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');

    try {
      const parsed = JSON.parse(await file.text());
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import vocabulary');
      }

      await refreshVocabulary();
      setShowAnswer(false);
      setNotice(
        `Imported ${data.summary?.imported_entries || 0} entries. `
        + `${data.summary?.created_entries || 0} new, ${data.summary?.merged_entries || 0} merged, `
        + `${data.summary?.payload_duplicates_merged || 0} duplicate payload entries folded together.`,
      );
    } catch (importError) {
      console.error('Error importing vocabulary:', importError);
      setError(importError.message || 'Failed to import vocabulary');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
      />

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2 flex items-center">
              <BookMarked className="h-8 w-8 mr-3 text-indigo-600" />
              Vocabulary Cards
            </h2>
            <p className="text-gray-600">
              Each word stays one learning card. Reverse prompts appear inside practice when they are due.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={isSubmitting}
              className="px-4 py-3 bg-white text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-all shadow-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              <Download className="h-5 w-5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="px-4 py-3 bg-white text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-50 transition-all shadow-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              <Upload className="h-5 w-5" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((value) => !value)}
              className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md font-semibold flex items-center justify-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>{showAddForm ? 'Hide form' : 'Add vocabulary'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-gradient-to-r from-indigo-100 to-indigo-200 rounded-xl p-4">
            <p className="text-sm text-indigo-700">Entries</p>
            <p className="text-3xl font-bold text-indigo-900">{stats.total_entries}</p>
          </div>
          <div className="bg-gradient-to-r from-purple-100 to-purple-200 rounded-xl p-4">
            <p className="text-sm text-purple-700">Learning cards</p>
            <p className="text-3xl font-bold text-purple-900">{stats.total_entries}</p>
          </div>
          <div className="bg-gradient-to-r from-orange-100 to-orange-200 rounded-xl p-4">
            <p className="text-sm text-orange-700">Due now</p>
            <p className="text-3xl font-bold text-orange-900">{effectiveDueTotal}</p>
          </div>
          <div className="bg-gradient-to-r from-green-100 to-green-200 rounded-xl p-4">
            <p className="text-sm text-green-700">Fully snoozed / learned</p>
            <p className="text-3xl font-bold text-green-900">{stats.mastered_entries}</p>
          </div>
        </div>

        <div className="grid gap-4 mt-4 md:grid-cols-2">
          {DIRECTION_ORDER.map((direction) => {
            const directionStats = stats.directions?.[direction] || INITIAL_STATS.directions[direction];
            return (
              <div
                key={direction}
                className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{directionStats.label}</p>
                    <p className="text-xs text-slate-500">{directionStats.total_cards} words available in this direction</p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold">
                    <Clock3 className="h-4 w-4" />
                    {directionStats.due_cards} words due
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                    {directionStats.learning_cards + directionStats.review_cards} active
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    {directionStats.learned_cards} learned
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700">
                    {directionStats.unreviewable_cards} blocked
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {stats.pending_completion_entries > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5" />
          <p>
            {stats.pending_completion_entries} {stats.pending_completion_entries === 1 ? 'entry needs' : 'entries need'} a
            translation before they can rejoin the review queue. Delete and re-add incomplete legacy items after filling in the missing translation.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-4 flex items-start gap-3">
          <Check className="h-5 w-5 mt-0.5" />
          <p>{notice}</p>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <h3 className="text-xl font-bold text-gray-800">Add vocabulary entry</h3>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              placeholder="Spanish word or phrase"
              value={newWord.word}
              onChange={(event) => setNewWord((prev) => ({ ...prev, word: event.target.value }))}
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Translation / meaning"
              value={newWord.translation}
              onChange={(event) => setNewWord((prev) => ({ ...prev, translation: event.target.value }))}
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>

          <textarea
            placeholder="Example sentence (optional)"
            value={newWord.example}
            onChange={(event) => setNewWord((prev) => ({ ...prev, example: event.target.value }))}
            className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-500 resize-none"
            rows="3"
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={addWord}
              disabled={isSubmitting || !newWord.word.trim() || !newWord.translation.trim()}
              className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              Add entry
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isLoading && (
        <div className="bg-white rounded-2xl shadow-2xl p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Practice mode</p>
              <p className="text-sm text-slate-600">
                {currentCard
                  ? 'Typing mode is active on the current review card when you want to answer before revealing.'
                  : 'Typing mode is ready and will appear as soon as a due review card is available.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {typingModeToggle}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center text-gray-600">
          Loading vocabulary cards...
        </div>
      ) : currentCard ? (
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
            <div>
              <p className="text-sm text-gray-500">Word review queue</p>
              <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Brain className="h-6 w-6 text-indigo-600" />
                {dueLabel}
              </h3>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">
                <Languages className="h-4 w-4" />
                {currentCard.direction_label}
              </span>
              {currentCard.due_card_count > 1 && (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-semibold">
                  <RotateCcw className="h-4 w-4" />
                  {currentCard.due_card_count} practice directions due
                </span>
              )}
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${STATUS_STYLES[currentCard.status] || STATUS_STYLES.review}`}>
                {statusLabel(currentCard.status)}
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${queueStats.total_due ? ((queueStats.total_due - reviewQueue.length + 1) / queueStats.total_due) * 100 : 100}%` }}
            />
          </div>

          <div
            role={typingMode ? undefined : 'button'}
            tabIndex={typingMode ? -1 : 0}
            onClick={typingMode ? undefined : toggleShowAnswer}
            onKeyDown={typingMode ? undefined : (event) => {
              if (isVoicePracticeBusy) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleShowAnswer();
              }
            }}
            aria-disabled={isVoicePracticeBusy}
            className={`bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-10 min-h-[320px] flex flex-col items-center justify-center border-4 border-indigo-200 transition-all text-center ${typingMode ? 'cursor-default' : (isVoicePracticeBusy ? 'cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400')}`}
          >
            <p className="text-sm uppercase tracking-wide text-indigo-600 font-semibold mb-3">
              {currentCard.prompt_label}
            </p>
            <p className="text-4xl md:text-5xl font-bold text-indigo-900 mb-6 break-words">
              {currentCard.prompt}
            </p>

            {typingMode && !showAnswer && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  checkTypedAnswer();
                }}
                className="w-full max-w-xl flex flex-col items-center gap-3"
                onClick={(event) => event.stopPropagation()}
              >
                <label className="text-sm uppercase tracking-wide text-indigo-600 font-semibold">
                  Type the {currentCard.answer_label.toLowerCase()}
                </label>
                <input
                  ref={typingInputRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder={`Your ${currentCard.answer_label.toLowerCase()}…`}
                  className="w-full px-4 py-3 text-xl text-center text-indigo-900 bg-white border-2 border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!typedAnswer.trim() || isSubmitting || isVoicePracticeBusy}
                    className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTypingFeedback(null); setShowAnswer(true); }}
                    disabled={isSubmitting || isVoicePracticeBusy}
                    className="px-5 py-2 rounded-xl bg-white text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Show answer
                  </button>
                </div>
              </form>
            )}

            {showAnswer ? (
              <div className="space-y-4 max-w-2xl animate-fadeIn mt-2">
                {typingFeedback && (
                  <div
                    className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                      typingFeedback.status === 'correct'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : typingFeedback.status === 'close'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {typingFeedback.status === 'correct' && '¡Correcto! Nicely typed.'}
                    {typingFeedback.status === 'close' && 'Almost — watch the spelling / accent.'}
                    {typingFeedback.status === 'wrong' && 'Not quite — study the answer below.'}
                  </div>
                )}
                <div>
                  <p className="text-sm uppercase tracking-wide text-purple-600 font-semibold mb-2">
                    {currentCard.answer_label}
                  </p>
                  <p className="text-3xl text-purple-800 font-semibold break-words">{currentCard.answer}</p>
                </div>

                {currentCard.example && (
                  <p className="text-lg text-gray-700 italic">“{currentCard.example}”</p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-4 w-4" />
                    Reviewed {currentCard.review_count} times
                  </span>
                  <span>Next due: {formatRelativeTime(currentCard.next_review_at)}</span>
                </div>
              </div>
            ) : (
              !typingMode && <p className="text-gray-500 text-lg">Click to reveal the answer</p>
            )}
          </div>

          {practiceSpanish.text ? (
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <VoiceActionButton
                  icon={Volume2}
                  label={isSpeaking ? 'Replay Spanish' : 'Listen in Spanish'}
                  onClick={() => speakText(practiceSpanish.text)}
                  disabled={isSubmitting || isVoicePracticeBusy || !playbackSupport.supported}
                  className="bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                />
                {isSpeaking && (
                  <VoiceActionButton
                    icon={Square}
                    label="Stop audio"
                    onClick={stopSpeaking}
                    disabled={isSubmitting}
                    className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                  />
                )}
                <VoiceActionButton
                  icon={Mic}
                  label={hasRecording ? 'Record a new take' : 'Repeat aloud'}
                  onClick={startRecording}
                  disabled={isSubmitting || isVoicePracticeBusy || !speechCapabilities.recordingSupported}
                  className="bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                />
                {isVoicePracticeBusy && (
                  <VoiceActionButton
                    icon={Square}
                    label={isRecording ? 'Stop recording' : 'Cancel mic setup'}
                    onClick={stopRecording}
                    disabled={isSubmitting}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  />
                )}
                <VoiceActionButton
                  icon={Play}
                  label="Play my take"
                  onClick={playRecording}
                  disabled={isSubmitting || isVoicePracticeBusy || !hasRecording}
                  className="bg-white text-purple-700 border border-purple-200 hover:bg-purple-100"
                />
                <VoiceActionButton
                  icon={Trash2}
                  label="Clear take"
                  onClick={clearRecording}
                  disabled={isSubmitting || isVoicePracticeBusy || !hasRecording}
                  className="bg-white text-rose-700 border border-rose-200 hover:bg-rose-100"
                />
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {isRecordingStarting && (
                  <p className="text-emerald-700">Waiting for microphone access… keep this Spanish side open or cancel setup.</p>
                )}
                <p className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-emerald-600" />
                  <span>Private on this device: your microphone take stays in this browser until you clear it.</span>
                </p>
                <p>
                  Listen only uses {speechVoiceLabel}. This free version is for listen, repeat aloud, and playback only.
                </p>
                {!playbackSupport.supported && (
                  <p className="text-amber-700">{playbackSupport.message}</p>
                )}
                {!speechCapabilities.recordingSupported && (
                  <p className="text-amber-700">Local recording needs microphone permission plus MediaRecorder support.</p>
                )}
                {ttsError && <p className="text-red-700">{ttsError}</p>}
                {recordingError && <p className="text-red-700">{recordingError}</p>}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              Reveal the Spanish side to listen or record a private repeat-aloud take.
            </p>
          )}

          {showAnswer && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                {REVIEW_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => handleReview(action.key)}
                      disabled={isSubmitting || isVoicePracticeBusy}
                      className={`px-4 py-4 text-white rounded-xl transition-all shadow-md font-bold flex flex-col items-center space-y-1 disabled:opacity-60 ${action.className}`}
                    >
                      <Icon className="h-6 w-6" />
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleLearned}
                disabled={isSubmitting || isVoicePracticeBusy}
                className="w-full px-4 py-4 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-all shadow-md font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <RotateCcw className="h-5 w-5" />
                Learned — hide this word for 15 days
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
          <RotateCcw className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-2">All caught up! 🎉</h3>
          <p className="text-gray-600">No words are due right now.</p>
          <p className="mt-3 text-sm text-slate-500">When the next review card appears, typing mode will let you answer before revealing the solution.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-800">Vocabulary entries ({entries.length})</h3>
          <p className="text-sm text-gray-500">
            Each entry is one learning card. Spanish and reverse prompts are tracked inside the same word.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No vocabulary yet. Add your first entry above.</p>
        ) : (
          <div className="space-y-3 max-h-[34rem] overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-all"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <p className="font-bold text-gray-900 text-xl">{entry.word}</p>
                      <button
                        type="button"
                        onClick={() => speakText(entry.word)}
                        disabled={isVoicePracticeBusy || !playbackSupport.supported}
                        className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white p-2 text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={playbackSupport.supported ? `Listen to ${entry.word}` : playbackSupport.message}
                        aria-label={playbackSupport.supported ? `Listen to ${entry.word}` : playbackSupport.message}
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                      <span className="text-gray-400">→</span>
                      <p className="text-gray-700 text-lg">{entry.translation || 'Missing translation'}</p>
                      {entry.needs_completion && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Needs translation
                        </span>
                      )}
                    </div>

                    {entry.example && (
                      <p className="text-sm text-gray-500 italic mb-3">“{entry.example}”</p>
                    )}

                    {entry.needs_completion && (
                      <p className="text-sm text-amber-700 mb-3">
                        This legacy entry is hidden from due counts until it has both sides filled in.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 text-sm text-gray-600 mb-3">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200">
                        <Brain className="h-4 w-4 text-indigo-500" />
                        {entry.card_summary.total_reviews} reviews
                      </span>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200">
                        <Clock3 className="h-4 w-4 text-orange-500" />
                        {entry.card_summary.due_cards} practice directions due
                      </span>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {entry.cards.map((card) => (
                        <div key={card.id} className="rounded-xl bg-white border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="font-semibold text-gray-800 text-sm">{card.direction_label}</p>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[card.status] || STATUS_STYLES.review}`}>
                              {statusLabel(card.status)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>Reviews: <span className="font-semibold text-gray-800">{card.review_count}</span></p>
                            <p>Next: <span className="font-semibold text-gray-800">{formatRelativeTime(card.next_review_at)}</span></p>
                            {card.learned_until && card.status === 'learned' && (
                              <p>Suppressed until <span className="font-semibold text-gray-800">{formatRelativeTime(card.learned_until)}</span></p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteWord(entry.id)}
                    disabled={isSubmitting}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors self-start disabled:opacity-60"
                    title="Delete entry"
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
