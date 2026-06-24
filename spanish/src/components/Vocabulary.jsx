import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  Brain,
  Check,
  Clock3,
  Download,
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
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useSpeechPractice } from '../hooks/useSpeechPractice';
import { profileApiUrl, profileFetch } from '../utils/api';
import {
  getVoicePracticeSpanishContent,
  getVisibleSpanishContent,
  shouldStopSpeakingOnCardFlip,
} from '../utils/speechPractice';
import { scoreTypedAnswer } from '../utils/answerMatching';
import {
  formatOfflineCacheTime,
  readOfflineVocabularyCache,
  writeOfflineVocabularyCache,
} from '../utils/offlineVocabularyCache';

function isAutomaticSpanishTypingCard(card) {
  return card?.response_mode === 'typing';
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

const REVIEW_GRADE_META = {
  dont_know: {
    label: "Don't Know",
    chipClassName: 'bg-rose-100 text-rose-700 border border-rose-200',
  },
  hard: {
    label: 'Hard',
    chipClassName: 'bg-orange-100 text-orange-700 border border-orange-200',
  },
  good: {
    label: 'Good',
    chipClassName: 'bg-sky-100 text-sky-700 border border-sky-200',
  },
  easy: {
    label: 'Easy',
    chipClassName: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
};

const ENTRY_FILTERS = {
  all: {
    label: 'All',
    description: 'Every vocabulary entry',
  },
  due: {
    label: 'Due',
    description: 'Have at least one due card now',
  },
  snoozed: {
    label: 'Snoozed',
    description: 'Answered already and waiting for the next review time',
  },
  learned: {
    label: 'Learned',
    description: 'Explicitly hidden with the Learned button',
  },
  hard: {
    label: 'Hard',
    description: 'At least one direction was last answered as Hard',
  },
  good: {
    label: 'Good',
    description: 'At least one direction was last answered as Good',
  },
  easy: {
    label: 'Easy',
    description: 'At least one direction was last answered as Easy',
  },
  dont_know: {
    label: "Don't Know",
    description: "At least one direction was last answered as Don't Know",
  },
  unlearned: {
    label: 'Unlearned',
    description: 'Still active or not fully mastered',
  },
  mastered: {
    label: 'Mastered',
    description: 'Fully snoozed or learned in both directions',
  },
  blocked: {
    label: 'Blocked',
    description: 'Need completion before review',
  },
};

function isEntryMastered(entry) {
  const reviewableCards = Number(entry?.card_summary?.reviewable_cards) || 0;
  if (reviewableCards === 0) {
    return false;
  }

  const learnedOrSnoozedCards = (Number(entry?.card_summary?.learned_cards) || 0)
    + (Number(entry?.card_summary?.snoozed_cards) || 0);

  return learnedOrSnoozedCards === reviewableCards && (Number(entry?.card_summary?.due_cards) || 0) === 0;
}

function isEntryLearned(entry) {
  return (Number(entry?.card_summary?.learned_cards) || 0) > 0;
}

function isEntrySnoozed(entry) {
  return (Number(entry?.card_summary?.snoozed_cards) || 0) > 0;
}

function isEntryBlocked(entry) {
  return Boolean(entry?.needs_completion) || (Number(entry?.card_summary?.unreviewable_cards) || 0) > 0;
}

function isEntryDue(entry) {
  return (Number(entry?.card_summary?.due_cards) || 0) > 0;
}

function hasEntryLastGrade(entry, grade) {
  return Array.isArray(entry?.cards) && entry.cards.some((card) => card.last_grade === grade);
}

function isEntryUnlearned(entry) {
  return !isEntryBlocked(entry) && !isEntryMastered(entry);
}

function matchesEntryFilter(entry, filter) {
  switch (filter) {
    case 'due':
      return isEntryDue(entry);
    case 'snoozed':
      return isEntrySnoozed(entry);
    case 'learned':
      return isEntryLearned(entry);
    case 'hard':
    case 'good':
    case 'easy':
    case 'dont_know':
      return hasEntryLastGrade(entry, filter);
    case 'unlearned':
      return isEntryUnlearned(entry);
    case 'mastered':
      return isEntryMastered(entry);
    case 'blocked':
      return isEntryBlocked(entry);
    case 'all':
    default:
      return true;
  }
}

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

const INITIAL_REVIEW_SESSION = {
  mode: 'due',
  entries: [],
  totalEntries: 0,
  lastEntryId: null,
  isComplete: false,
};

function findEntryCard(entry, direction) {
  if (!Array.isArray(entry?.cards)) {
    return null;
  }

  return entry.cards.find((card) => card.direction === direction && card.is_reviewable) || null;
}

function isEntryEligibleForRandomStudy(entry) {
  return !isEntryBlocked(entry)
    && Array.isArray(entry?.cards)
    && entry.cards.some((card) => card.is_reviewable && card.is_due);
}

function isEntryEligibleForPracticeAll(entry) {
  return !isEntryBlocked(entry)
    && Array.isArray(entry?.cards)
    && entry.cards.some((card) => card.is_reviewable)
    && !entry.cards.every((card) => card.status === 'learned');
}

function buildSessionVariant(card, {
  key,
  responseMode = 'reveal',
  directionLabel = card?.direction_label,
  practiceOnly = false,
} = {}) {
  const submitsReview = !practiceOnly && responseMode === 'reveal' && Boolean(card?.is_due);

  return {
    key,
    direction: card.direction,
    direction_label: directionLabel,
    prompt_label: card.prompt_label,
    answer_label: card.answer_label,
    prompt: card.prompt,
    answer: card.answer,
    card_id: card.id,
    status: card.status,
    review_count: card.review_count,
    next_review_at: card.next_review_at,
    response_mode: responseMode,
    practice_only: practiceOnly || !submitsReview,
    submits_review: submitsReview,
  };
}

function buildStudyVariantsForEntry(entry, { practiceOnly = false } = {}) {
  const sourceCard = findEntryCard(entry, 'source_to_target');
  const reverseCard = findEntryCard(entry, 'target_to_source');
  const variants = [];

  if (sourceCard) {
    variants.push(buildSessionVariant(sourceCard, {
      key: 'source_to_target_reveal',
      responseMode: 'reveal',
      practiceOnly,
    }));
  }

  if (reverseCard) {
    variants.push(buildSessionVariant(reverseCard, {
      key: 'target_to_source_reveal',
      responseMode: 'reveal',
      practiceOnly,
    }));
    variants.push(buildSessionVariant(reverseCard, {
      key: 'target_to_source_typing',
      responseMode: 'typing',
      directionLabel: 'Type Spanish from Translation',
      practiceOnly: true,
    }));
  }

  return variants;
}

function chooseRandomItem(values = []) {
  if (values.length === 0) {
    return null;
  }

  return values[Math.floor(Math.random() * values.length)] || values[0];
}

function buildReviewSessionEntries(entries, mode = 'due') {
  const practiceOnly = mode === 'practice_all';
  const eligibleEntries = entries.filter(
    practiceOnly ? isEntryEligibleForPracticeAll : isEntryEligibleForRandomStudy,
  );

  return eligibleEntries
    .map((entry) => {
      const variants = buildStudyVariantsForEntry(entry, { practiceOnly });
      return {
        entryId: entry.id,
        word: entry.word,
        translation: entry.translation,
        example: entry.example,
        dueCardCount: Number(entry?.card_summary?.due_cards) || 0,
        totalVariants: variants.length,
        remainingVariants: variants,
      };
    })
    .filter((entry) => entry.remainingVariants.length > 0);
}

function pickNextSessionCard(sessionEntries, sessionMode = 'due', previousEntryId = null) {
  const activeEntries = sessionEntries.filter((entry) => entry.remainingVariants.length > 0);
  if (activeEntries.length === 0) {
    return null;
  }

  const candidateEntries = activeEntries.length > 1
    ? activeEntries.filter((entry) => entry.entryId !== previousEntryId)
    : activeEntries;
  const selectedEntry = chooseRandomItem(candidateEntries.length > 0 ? candidateEntries : activeEntries);
  const selectedVariant = chooseRandomItem(selectedEntry?.remainingVariants || []);

  if (!selectedEntry || !selectedVariant) {
    return null;
  }

  return {
    entryId: selectedEntry.entryId,
    card: {
      id: selectedEntry.entryId,
      entry_id: selectedEntry.entryId,
      word: selectedEntry.word,
      translation: selectedEntry.translation,
      example: selectedEntry.example,
      due_card_count: selectedEntry.dueCardCount,
      total_forms_for_word: selectedEntry.totalVariants,
      forms_remaining_for_word: selectedEntry.remainingVariants.length,
      current_form_index: (selectedEntry.totalVariants - selectedEntry.remainingVariants.length) + 1,
      session_mode: sessionMode,
      study_variant: selectedVariant.key,
      ...selectedVariant,
    },
  };
}

function createReviewSession(entries, mode = 'due') {
  const sessionEntries = buildReviewSessionEntries(entries, mode);
  const selection = pickNextSessionCard(sessionEntries, mode);

  return {
    session: {
      mode,
      entries: sessionEntries,
      totalEntries: sessionEntries.length,
      lastEntryId: selection?.entryId || null,
      isComplete: sessionEntries.length === 0,
    },
    currentCard: selection?.card || null,
  };
}

function advanceReviewSession(session, completedCard) {
  const nextEntries = session.entries
    .map((entry) => {
      if (entry.entryId !== completedCard?.id) {
        return entry;
      }

      return {
        ...entry,
        remainingVariants: entry.remainingVariants.filter((variant) => variant.key !== completedCard.study_variant),
      };
    })
    .filter((entry) => entry.remainingVariants.length > 0);

  const selection = pickNextSessionCard(nextEntries, session.mode, completedCard?.id || null);

  return {
    session: {
      ...session,
      entries: nextEntries,
      lastEntryId: selection?.entryId || completedCard?.id || null,
      isComplete: nextEntries.length === 0,
    },
    currentCard: selection?.card || null,
  };
}

function removeEntryFromReviewSession(session, entryId) {
  const nextEntries = session.entries.filter((entry) => entry.entryId !== entryId);
  const selection = pickNextSessionCard(nextEntries, session.mode, entryId);

  return {
    session: {
      ...session,
      entries: nextEntries,
      lastEntryId: selection?.entryId || entryId || null,
      isComplete: nextEntries.length === 0,
    },
    currentCard: selection?.card || null,
  };
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
  const [reviewSession, setReviewSession] = useState(INITIAL_REVIEW_SESSION);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [queueStats, setQueueStats] = useState({ total_due: 0, returned: 0, limit: 40 });
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState({ word: '', translation: '', example: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offlineSnapshot, setOfflineSnapshot] = useState(null);
  const [entryFilter, setEntryFilter] = useState('all');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [typingFeedback, setTypingFeedback] = useState(null);
  const [showTools, setShowTools] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState({});

  const toggleEntryExpanded = (entryId) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };
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
  const isOfflineRuntime = () => Boolean(offlineSnapshot) || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const automaticTypingStage = isAutomaticSpanishTypingCard(currentCard);
  const typingStageActive = automaticTypingStage;
  const hidePromptOnSpanishAnswer = showAnswer && currentCard?.response_mode === 'typing';
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
    const nextEntries = entriesData.entries || [];
    const nextStats = entriesData.stats || INITIAL_STATS;
    const nextQueueStats = queueData.stats || { total_due: 0, returned: 0, limit: 40 };

    setEntries(nextEntries);
    setStats(nextStats);
    setQueueStats(nextQueueStats);
    setOfflineSnapshot(null);
    writeOfflineVocabularyCache({
      entries: nextEntries,
      stats: nextStats,
      queueStats: nextQueueStats,
    });
  };

  const loadOfflineVocabularySnapshot = useCallback(() => {
    const cached = readOfflineVocabularyCache();
    if (!cached) {
      return false;
    }

    setEntries(cached.entries || []);
    setStats(cached.stats || INITIAL_STATS);
    setQueueStats(cached.queueStats || { total_due: 0, returned: 0, limit: 40 });
    setOfflineSnapshot(cached);
    setNotice(`Offline vocabulary loaded from ${formatOfflineCacheTime(cached.cachedAt)}. Review progress changes need internet.`);
    return true;
  }, []);

  const startReviewSession = useCallback((mode = 'due', sourceEntries = entries) => {
    const nextState = createReviewSession(sourceEntries, mode);
    setReviewSession(nextState.session);
    setReviewQueue(nextState.currentCard ? [nextState.currentCard] : []);
    resetPractice();
    setShowAnswer(false);
    setTypedAnswer('');
    setTypingFeedback(null);
  }, [entries, resetPractice]);

  const advanceCurrentSessionCard = useCallback((completedCard = currentCard, { removeEntry = false } = {}) => {
    if (!completedCard) {
      return;
    }

    const nextState = removeEntry
      ? removeEntryFromReviewSession(reviewSession, completedCard.id)
      : advanceReviewSession(reviewSession, completedCard);

    setReviewSession(nextState.session);
    setReviewQueue(nextState.currentCard ? [nextState.currentCard] : []);
    resetPractice();
    setShowAnswer(false);
    setTypedAnswer('');
    setTypingFeedback(null);
  }, [currentCard, resetPractice, reviewSession]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');
      setNotice('');
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false && loadOfflineVocabularySnapshot()) {
          return;
        }

        await refreshVocabulary();
        if (!cancelled) {
          setShowAnswer(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error('Error loading vocabulary:', loadError);
          if (!loadOfflineVocabularySnapshot()) {
            setError(loadError.message || 'Failed to load vocabulary');
          }
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
  }, [loadOfflineVocabularySnapshot]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (reviewQueue.length > 0 || reviewSession.totalEntries > 0 || reviewSession.isComplete) {
      return;
    }

    const nextState = createReviewSession(entries, 'due');
    setReviewSession(nextState.session);
    setReviewQueue(nextState.currentCard ? [nextState.currentCard] : []);
  }, [entries, isLoading, reviewQueue.length, reviewSession.isComplete, reviewSession.totalEntries]);

  useEffect(() => {
    resetPractice();
  }, [currentCard?.card_id, currentCard?.direction, currentCard?.study_variant, resetPractice]);

  useEffect(() => {
    setTypedAnswer('');
    setTypingFeedback(null);
  }, [currentCard?.card_id, currentCard?.direction, currentCard?.study_variant]);

  useEffect(() => {
    if (typingStageActive && !showAnswer && currentCard && typingInputRef.current) {
      typingInputRef.current.focus();
    }
  }, [currentCard?.card_id, currentCard?.direction, currentCard?.study_variant, typingStageActive, showAnswer, currentCard]);

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
      ? `${currentCard.card_id ?? currentCard.id ?? 'unknown'}:${currentCard.direction ?? 'unknown'}:${currentCard.study_variant ?? 'base'}`
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
  const dueStudyCandidateCount = useMemo(
    () => entries.filter((entry) => isEntryEligibleForRandomStudy(entry)).length,
    [entries],
  );
  const practiceAllCandidateCount = useMemo(
    () => entries.filter((entry) => isEntryEligibleForPracticeAll(entry)).length,
    [entries],
  );
  const remainingSessionEntries = reviewSession.entries.length;
  const completedSessionEntries = Math.max(0, reviewSession.totalEntries - remainingSessionEntries);
  const reviewProgressPercent = reviewSession.totalEntries > 0
    ? Math.min(100, Math.round((completedSessionEntries / reviewSession.totalEntries) * 100))
    : 100;
  const reviewRoundCompleted = reviewSession.isComplete && reviewSession.mode === 'due' && reviewSession.totalEntries > 0;
  const practiceRoundCompleted = reviewSession.isComplete && reviewSession.mode === 'practice_all' && reviewSession.totalEntries > 0;

  const entryCounts = useMemo(() => {
    const filterKeys = Object.keys(ENTRY_FILTERS);
    return entries.reduce((accumulator, entry) => {
      for (const filterKey of filterKeys) {
        if (matchesEntryFilter(entry, filterKey)) {
          accumulator[filterKey] += 1;
        }
      }
      return accumulator;
    }, Object.fromEntries(filterKeys.map((filterKey) => [filterKey, 0])));
  }, [entries]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesEntryFilter(entry, entryFilter)),
    [entries, entryFilter],
  );

  const filteredEntryLabel = ENTRY_FILTERS[entryFilter]?.label || ENTRY_FILTERS.all.label;

  const dueLabel = useMemo(() => {
    if (reviewSession.totalEntries > 0 && currentCard) {
      const wordLabel = `${remainingSessionEntries} ${remainingSessionEntries === 1 ? 'word' : 'words'} left`;
      return reviewSession.mode === 'practice_all'
        ? `${wordLabel} in random practice`
        : `${wordLabel} in this round`;
    }

    if (reviewRoundCompleted) {
      return 'All available words repeated';
    }

    if (practiceRoundCompleted) {
      return 'Practice-all round finished';
    }

    return `${effectiveDueTotal} due now`;
  }, [currentCard, effectiveDueTotal, practiceRoundCompleted, remainingSessionEntries, reviewRoundCompleted, reviewSession.mode, reviewSession.totalEntries]);

  const speechVoiceLabel = selectedVoice
    ? `${selectedVoice.name}${selectedVoice.lang ? ` (${selectedVoice.lang})` : ''}`
    : 'a local Spanish voice on this device';

  const summaryCards = [
    {
      key: 'all',
      title: 'Entries',
      count: entryCounts.all,
      valueClassName: 'text-indigo-900',
      cardClassName: 'bg-gradient-to-r from-indigo-100 to-indigo-200',
      textClassName: 'text-indigo-700',
    },
    {
      key: 'due',
      title: 'Due now',
      count: entryCounts.due,
      valueClassName: 'text-orange-900',
      cardClassName: 'bg-gradient-to-r from-orange-100 to-orange-200',
      textClassName: 'text-orange-700',
    },
    {
      key: 'snoozed',
      title: 'Snoozed',
      count: entryCounts.snoozed,
      valueClassName: 'text-slate-900',
      cardClassName: 'bg-gradient-to-r from-slate-100 to-slate-200',
      textClassName: 'text-slate-700',
    },
    {
      key: 'learned',
      title: 'Learned',
      count: entryCounts.learned,
      valueClassName: 'text-green-900',
      cardClassName: 'bg-gradient-to-r from-green-100 to-green-200',
      textClassName: 'text-green-700',
    },
  ];

  const addWord = async () => {
    if (!newWord.word.trim() || !newWord.translation.trim()) return;
    if (isOfflineRuntime()) {
      setError('Adding vocabulary needs internet. Offline mode can review the last synced words.');
      return;
    }

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
    if (!currentCard) return false;
    if (isOfflineRuntime()) {
      setNotice('Offline practice only: this answer does not change the spaced repetition timer.');
      return true;
    }

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
      return true;
    } catch (reviewError) {
      console.error('Error updating review card:', reviewError);
      setError(reviewError.message || 'Failed to update review card');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReview = async (grade) => {
    if (!currentCard) return;

    if (currentCard.submits_review) {
      const success = await submitReview(`/spanish/api/vocabulary/${currentCard.id}/review`, {
        grade,
        direction: currentCard.direction,
      });
      if (!success) {
        return;
      }
    } else {
      setNotice(
        currentCard.session_mode === 'practice_all'
          ? 'Practice-only round: this extra repetition does not change the spaced repetition timer.'
          : 'Extra form completed. The timer changes only for the due directions in this round.',
      );
    }

    advanceCurrentSessionCard(currentCard);
  };

  const handleLearned = async () => {
    if (!currentCard) return;
    if (isOfflineRuntime()) {
      setNotice('Marking cards learned needs internet. You can still continue offline practice.');
      advanceCurrentSessionCard(currentCard, { removeEntry: true });
      return;
    }

    const success = await submitReview(`/spanish/api/vocabulary/${currentCard.id}/learned`);
    if (!success) {
      return;
    }

    advanceCurrentSessionCard(currentCard, { removeEntry: true });
  };

  const deleteWord = async (entryId) => {
    if (isOfflineRuntime()) {
      setError('Deleting vocabulary needs internet.');
      return;
    }
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
      if (isOfflineRuntime()) {
        const cachedEntries = offlineSnapshot?.entries || entries;
        const payload = {
          format: 'lingualearn-spanish-offline-cache',
          exported_at: new Date().toISOString(),
          profile: { id: offlineSnapshot?.profileId || 'current' },
          entries: cachedEntries,
          stats: offlineSnapshot?.stats || stats || null,
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `spanish-vocabulary-offline-profile-${offlineSnapshot?.profileId || 'cache'}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        setNotice(`Exported offline cache with ${payload.entries.length} entries.`);
        return;
      }

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
    if (isOfflineRuntime()) {
      setError('Import needs internet because the server has to merge duplicates safely.');
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

          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowAddForm((value) => !value)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md font-semibold flex items-center justify-center space-x-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>{showAddForm ? 'Hide form' : 'Add vocabulary'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTools((value) => !value)}
              className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm font-semibold flex items-center justify-center space-x-1.5 text-sm"
              title="Import/Export JSON"
            >
              <Settings className="h-4 w-4 text-slate-500" />
              <span>Tools</span>
            </button>
          </div>
        </div>

        {showTools && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 animate-fade-in mt-4">
            <button
              type="button"
              onClick={handleExport}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-all shadow-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-60 text-sm"
            >
              <Download className="h-4 w-4" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-50 transition-all shadow-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-60 text-sm"
            >
              <Upload className="h-4 w-4" />
              <span>Import JSON</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {summaryCards.map((card) => {
            const isSelected = entryFilter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setEntryFilter(card.key)}
                className={`${card.cardClassName} rounded-xl p-4 text-left transition-all border-2 ${isSelected ? 'border-slate-900 shadow-md scale-[1.02]' : 'border-transparent hover:border-slate-300'}`}
              >
                <p className={`text-sm ${card.textClassName}`}>{card.title}</p>
                <p className={`text-3xl font-bold ${card.valueClassName}`}>{card.count}</p>
              </button>
            );
          })}
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

      {offlineSnapshot && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 mt-0.5" />
          <p>
            Offline mode: using the last synced vocabulary from {formatOfflineCacheTime(offlineSnapshot.cachedAt)}.
            Practice works locally; adding, deleting, importing, and syncing review timers need internet.
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

      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center text-gray-600">
          Loading vocabulary cards...
        </div>
      ) : currentCard ? (
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
            <div>
              <p className="text-sm text-gray-500">
                {currentCard.session_mode === 'practice_all' ? 'Random practice round' : 'Random word round'}
              </p>
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
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold">
                <RotateCcw className="h-4 w-4" />
                Form {currentCard.current_form_index} of {currentCard.total_forms_for_word}
              </span>
              {currentCard.due_card_count > 1 && (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-semibold">
                  <RotateCcw className="h-4 w-4" />
                  {currentCard.due_card_count} practice directions due
                </span>
              )}
              {currentCard.practice_only && (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">
                  <AlertCircle className="h-4 w-4" />
                  Practice only
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
              style={{ width: `${reviewProgressPercent}%` }}
            />
          </div>

          {currentCard.practice_only && (
            <p className="mb-4 text-sm text-slate-500 text-center">
              This form keeps the round varied. It counts toward finishing the word, but it does not change the spaced repetition timer.
            </p>
          )}

          <div
            role={typingStageActive ? undefined : 'button'}
            tabIndex={typingStageActive ? -1 : 0}
            onClick={typingStageActive ? undefined : toggleShowAnswer}
            onKeyDown={typingStageActive ? undefined : (event) => {
              if (isVoicePracticeBusy) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleShowAnswer();
              }
            }}
            aria-disabled={isVoicePracticeBusy}
            className={`bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 md:p-10 min-h-[220px] md:min-h-[320px] flex flex-col items-center justify-center border-2 md:border-4 border-indigo-200 transition-all text-center ${typingStageActive ? 'cursor-default' : (isVoicePracticeBusy ? 'cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400')}`}
          >
            {!hidePromptOnSpanishAnswer && (
              <>
                <p className="text-xs sm:text-sm uppercase tracking-wide text-indigo-600 font-semibold mb-2 sm:mb-3">
                  {currentCard.prompt_label}
                </p>
                <p className="text-2xl sm:text-3xl md:text-5xl font-bold text-indigo-900 mb-4 md:mb-6 break-words">
                  {currentCard.prompt}
                </p>
              </>
            )}

            {typingStageActive && !showAnswer && (
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
                  <p className="text-xs sm:text-sm uppercase tracking-wide text-purple-600 font-semibold mb-2">
                    {currentCard.answer_label}
                  </p>
                  <p className="text-2xl sm:text-3xl text-purple-800 font-semibold break-words">{currentCard.answer}</p>
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
              !typingStageActive && <p className="text-gray-500 text-lg">Click to reveal the answer</p>
            )}
          </div>

          {showAnswer && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {REVIEW_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => handleReview(action.key)}
                      disabled={isSubmitting || isVoicePracticeBusy}
                      className={`rounded-xl px-3 py-2.5 text-xs font-semibold text-white transition-all shadow-md flex min-h-[3.25rem] items-center justify-center gap-1.5 text-center leading-tight disabled:opacity-60 sm:min-h-[4rem] sm:flex-col sm:gap-1 sm:px-3 sm:py-3 sm:text-sm ${action.className}`}
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleLearned}
                disabled={isSubmitting || isVoicePracticeBusy}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-all shadow-md flex items-center justify-center gap-2 leading-tight disabled:opacity-60 sm:text-base"
              >
                <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                Learned — hide this word for 15 days
              </button>
            </div>
          )}

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
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
          <RotateCcw className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            {reviewRoundCompleted
              ? 'Round finished!'
              : practiceRoundCompleted
                ? 'Practice round finished!'
                : 'All caught up! 🎉'}
          </h3>
          <p className="text-gray-600">
            {reviewRoundCompleted
              ? 'You went through every currently available word in random order and kept each word in the round until all three forms were done.'
              : practiceRoundCompleted
                ? 'You repeated every active word in random order.'
                : 'No words are due right now.'}
          </p>
          {practiceAllCandidateCount > 0 && (
            <button
              type="button"
              onClick={() => startReviewSession('practice_all')}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-indigo-700"
            >
              <RotateCcw className="h-4 w-4" />
              Practice All Active Words Randomly
            </button>
          )}
          <p className="mt-3 text-sm text-slate-500">
            {practiceAllCandidateCount > 0
              ? 'This extra round skips words already marked Learned, but includes the rest in random order.'
              : dueStudyCandidateCount > 0
                ? 'Start the random round to mix words and forms again.'
                : 'When the next word becomes available, the round will randomize both the word and the form.'}
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold text-gray-800">Vocabulary entries ({filteredEntries.length})</h3>
            <p className="text-sm text-gray-500">
              Showing {filteredEntryLabel.toLowerCase()} entries. Filter by review state or by the last answer grade across both directions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ENTRY_FILTERS).map(([key, config]) => {
              const isSelected = entryFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEntryFilter(key)}
                  title={config.description}
                  className={`px-3 py-2 rounded-full text-sm font-semibold transition-colors border ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  {config.label} ({entryCounts[key] ?? 0})
                </button>
              );
            })}
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No vocabulary yet. Add your first entry above.</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No {filteredEntryLabel.toLowerCase()} entries right now.</p>
        ) : (
          <div className="space-y-3 max-h-[34rem] overflow-y-auto">
            {filteredEntries.map((entry) => {
              const lastGradeBadges = REVIEW_ACTIONS.reduce((badges, action) => {
                const count = entry.cards.filter((card) => card.last_grade === action.key).length;
                if (count > 0) {
                  badges.push({
                    key: action.key,
                    label: REVIEW_GRADE_META[action.key]?.label || action.label,
                    count,
                    className: REVIEW_GRADE_META[action.key]?.chipClassName || 'bg-slate-100 text-slate-700 border border-slate-200',
                  });
                }
                return badges;
              }, []);

              const isExpanded = expandedEntries[entry.id];
              return (
                <div
                  key={entry.id}
                  className="p-4 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-all shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
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

                      {(entry.card_summary.learned_cards > 0 || entry.card_summary.snoozed_cards > 0 || lastGradeBadges.length > 0) && (
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-3">
                          {entry.card_summary.learned_cards > 0 && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">
                              Learned {entry.card_summary.learned_cards}
                            </span>
                          )}
                          {entry.card_summary.snoozed_cards > 0 && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                              Snoozed {entry.card_summary.snoozed_cards}
                            </span>
                          )}
                          {lastGradeBadges.map((badge) => (
                            <span
                              key={badge.key}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-semibold ${badge.className}`}
                            >
                              {badge.label} {badge.count}
                            </span>
                          ))}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="grid gap-2 md:grid-cols-2 mt-3 animate-fade-in">
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
                                {card.last_grade && (
                                  <p>
                                    Last answer:{' '}
                                    <span className="font-semibold text-gray-800">
                                      {REVIEW_GRADE_META[card.last_grade]?.label || card.last_grade}
                                    </span>
                                  </p>
                                )}
                                {card.learned_until && card.status === 'learned' && (
                                  <p>Suppressed until <span className="font-semibold text-gray-800">{formatRelativeTime(card.learned_until)}</span></p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end lg:self-start">
                      <button
                        type="button"
                        onClick={() => toggleEntryExpanded(entry.id)}
                        className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center"
                        title={isExpanded ? 'Hide details' : 'Show details'}
                      >
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteWord(entry.id)}
                        disabled={isSubmitting}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-60"
                        title="Delete entry"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Vocabulary;
