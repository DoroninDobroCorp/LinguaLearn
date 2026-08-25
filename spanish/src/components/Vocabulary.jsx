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
  Star,
  Undo2,
  ChevronDown,
  ChevronUp,
  Folder,
  FolderPlus,
  Tag,
  Edit2,
  GraduationCap,
  CheckCircle2,
  ArrowUpDown,
  Layers
} from 'lucide-react';
import { useSpeechPractice } from '../hooks/useSpeechPractice';
import VocabularyDecksModal from './VocabularyDecksModal';
import { profileApiUrl, profileFetch } from '../utils/api';
import {
  getVoicePracticeSpanishContent,
  getVisibleSpanishContent,
  shouldStopSpeakingOnCardFlip,
} from '../utils/speechPractice';
import { scoreTypedAnswer } from '../utils/answerMatching';
import { buildOnceEachChoices } from '../utils/vocabularyRounds';
import {
  formatOfflineCacheTime,
  readOfflineVocabularyCache,
  writeOfflineVocabularyCache,
} from '../utils/offlineVocabularyCache';


function isResumableStudyMode(mode) {
  return mode === 'once_all' || mode === 'favorites_once' || (typeof mode === 'string' && (mode.startsWith('group_once:') || mode.startsWith('groups_once:')));
}

function isAutomaticSpanishTypingCard(card) {
  return card?.response_mode === 'typing';
}

const INITIAL_STATS = {
  total_entries: 0,
  due_entries: 0,
  total_cards: 0,
  due_cards: 0,
  learned_cards: 0,
  favorite_entries: 0,
  permanently_learned_entries: 0,
  active_entries: 0,
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
    description: 'Marked learned forever and excluded from practice',
  },
  favorites: {
    label: 'Favorites',
    description: 'Saved to your favorites',
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
  return Boolean(entry?.learned_permanently_at);
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
    case 'favorites':
      return Boolean(entry?.is_favorite);
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
  return !entry?.learned_permanently_at && !isEntryBlocked(entry)
    && Array.isArray(entry?.cards)
    && entry.cards.some((card) => card.is_reviewable && card.is_due);
}

function isEntryEligibleForPracticeAll(entry) {
  return !entry?.learned_permanently_at && !isEntryBlocked(entry)
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
  const isSingleGroup = typeof mode === 'string' && mode.startsWith('group_once:');
  const isMultiGroup = typeof mode === 'string' && mode.startsWith('groups_once:');
  const isGroupMode = isSingleGroup || isMultiGroup;
  const targetGroupIds = isSingleGroup
    ? [Number(mode.split(':')[1])]
    : isMultiGroup
    ? mode.split(':')[1].split(',').map(Number).filter(Boolean)
    : [];
  const exactOnce = mode === 'once_all' || mode === 'favorites_once' || isGroupMode;
  const practiceOnly = mode === 'practice_all' || exactOnce;
  const eligibleEntries = entries.filter((entry) => {
    if (mode === 'favorites_once' && !entry.is_favorite) return false;
    if (isGroupMode && targetGroupIds.length > 0) {
      const entryGids = (entry.group_ids || []).concat((entry.groups || []).map((g) => g.id));
      const match = targetGroupIds.some((id) => entryGids.includes(id));
      if (!match) return false;
    }
    return practiceOnly ? isEntryEligibleForPracticeAll(entry) : isEntryEligibleForRandomStudy(entry);
  });

  const choices = exactOnce
    ? buildOnceEachChoices(eligibleEntries, (entry) => buildStudyVariantsForEntry(entry, { practiceOnly }))
    : eligibleEntries.map((entry) => ({ entry, variant: null }));

  return choices
    .map(({ entry, variant }) => {
      const selectedVariants = variant ? [variant] : buildStudyVariantsForEntry(entry, { practiceOnly });
      return {
        entryId: entry.id,
        word: entry.word,
        translation: entry.translation,
        example: entry.example,
        isFavorite: Boolean(entry.is_favorite),
        groups: entry.groups || [],
        group_ids: entry.group_ids || [],
        dueCardCount: Number(entry?.card_summary?.due_cards) || 0,
        totalVariants: selectedVariants.length,
        remainingVariants: selectedVariants,
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
      is_favorite: selectedEntry.isFavorite,
      groups: selectedEntry.groups || [],
      group_ids: selectedEntry.group_ids || [],
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
      lap: 1,
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

function restorePersistedReviewSession(saved, liveEntries) {
  const mode = saved?.mode;
  const state = saved?.state;
  const isGroupMode = typeof mode === 'string' && mode.startsWith('group_once:');
  const targetGroupId = isGroupMode ? Number(mode.split(':')[1]) : null;

  if (!isResumableStudyMode(mode) || state?.session?.mode !== mode || !Array.isArray(state.session.entries)) {
    return null;
  }
  const liveById = new Map(liveEntries.map((entry) => [Number(entry.id), entry]));
  const remainingEntries = state.session.entries
    .filter((item) => {
      const live = liveById.get(Number(item.entryId));
      if (!live || live.learned_permanently_at) return false;
      if (mode === 'favorites_once' && !live.is_favorite) return false;
      if (isGroupMode) {
        const match = (live.group_ids || []).includes(targetGroupId) || (live.groups || []).some((g) => g.id === targetGroupId);
        if (!match) return false;
      }
      return true;
    })
    .map((item) => {
      const live = liveById.get(Number(item.entryId));
      return {
        ...item,
        word: live.word,
        translation: live.translation,
        example: live.example,
        isFavorite: Boolean(live.is_favorite),
        groups: live.groups || [],
        group_ids: live.group_ids || [],
      };
    });
  const currentEntry = remainingEntries.find((item) => Number(item.entryId) === Number(state.currentCard?.id));
  const fallback = currentEntry ? null : pickNextSessionCard(remainingEntries, mode);
  const currentCard = currentEntry
    ? {
        ...state.currentCard,
        word: currentEntry.word,
        translation: currentEntry.translation,
        example: currentEntry.example,
        is_favorite: currentEntry.isFavorite,
        groups: currentEntry.groups,
        group_ids: currentEntry.group_ids,
      }
    : fallback?.card || null;
  return {
    session: {
      ...state.session,
      mode,
      entries: remainingEntries,
      totalEntries: Math.max(Number(state.session.totalEntries) || 0, remainingEntries.length),
      isComplete: remainingEntries.length === 0,
    },
    currentCard,
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
  const [todayVocabProgress, setTodayVocabProgress] = useState(0);

  const fetchDailyVocabProgress = useCallback(async () => {
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/gamification'));
      if (res.ok) {
        const data = await res.json();
        const quest = (data.dailyQuests || []).find(q => q.id === 'quest_vocab');
        if (quest) {
          setTodayVocabProgress(quest.current || 0);
        }
      }
    } catch (e) {
      console.error('Error fetching vocab quest progress:', e);
    }
  }, []);

  useEffect(() => {
    fetchDailyVocabProgress();
    const handleUpdate = () => fetchDailyVocabProgress();
    window.addEventListener('gamification_updated', handleUpdate);
    return () => window.removeEventListener('gamification_updated', handleUpdate);
  }, [fetchDailyVocabProgress]);
  const [queueStats, setQueueStats] = useState({ total_due: 0, returned: 0, limit: 40 });
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState({ word: '', translation: '', example: '', groupIds: [] });
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
  const [studySessionHydrated, setStudySessionHydrated] = useState(false);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState(() => new Set());
  const [pendingLearnedIds, setPendingLearnedIds] = useState(() => new Set());
  const [groups, setGroups] = useState([]);
  const [selectedGroupFilterIds, setSelectedGroupFilterIds] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [selectedStudyGroupIds, setSelectedStudyGroupIds] = useState([]);
  const [isGroupsStudyExpanded, setIsGroupsStudyExpanded] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showDecksModal, setShowDecksModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [activeGroupMenuWordId, setActiveGroupMenuWordId] = useState(null);
  const [pendingGroupWordIds, setPendingGroupWordIds] = useState(() => new Set());


  const fetchGroups = useCallback(async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary/groups'));
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
        return data.groups || [];
      }
    } catch (e) {
      console.error('Error fetching groups:', e);
    }
    return [];
  }, []);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const timeA = a.last_practiced_at ? new Date(a.last_practiced_at).getTime() : 0;
      const timeB = b.last_practiced_at ? new Date(b.last_practiced_at).getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [groups]);

  const touchGroups = useCallback((groupIds) => {
    if (!Array.isArray(groupIds) || groupIds.length === 0) return;
    const nowIso = new Date().toISOString();
    const idSet = new Set(groupIds.map(Number));
    setGroups((prev) =>
      prev.map((g) => (idSet.has(g.id) ? { ...g, last_practiced_at: nowIso } : g))
    );
    profileFetch(profileApiUrl('/spanish/api/vocabulary/groups/touch-batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds }),
    }).catch(() => {});
  }, []);

  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setIsSubmitting(true);
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary/groups'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        setNewGroupName('');
        setNotice(`Created group "${name}".`);
        await refreshVocabulary();
      }
    } catch (err) {
      setError(`Failed to create group: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateGroup = async (groupId) => {
    const name = editingGroupName.trim();
    if (!name) return;
    setIsSubmitting(true);
    try {
      const response = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/groups/${groupId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        setEditingGroupId(null);
        setEditingGroupName('');
        setNotice('Group renamed.');
        await refreshVocabulary();
      }
    } catch (err) {
      setError(`Failed to rename group: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteGroup = async (group) => {
    if (!confirm(`Delete group "${group.name}"? Words in this group will not be deleted.`)) return;
    setIsSubmitting(true);
    try {
      const response = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/groups/${group.id}`), {
        method: 'DELETE',
      });
      if (response.ok) {
        setNotice(`Deleted group "${group.name}".`);
        if (selectedGroupFilter === group.id) setSelectedGroupFilter('all');
        if (reviewSession.mode === `group_once:${group.id}`) startReviewSession('due');
        await refreshVocabulary();
      }
    } catch (err) {
      setError(`Failed to delete group: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleWordGroup = (entry, groupId) => {
    const entryId = Number(entry.id);
    const targetGroupId = Number(groupId);

    // 1. Calculate next group IDs
    const currentGroupIds = (entry.groups || []).map((g) => g.id);
    const hasGroup = currentGroupIds.includes(targetGroupId);
    const nextGroupIds = hasGroup
      ? currentGroupIds.filter((id) => id !== targetGroupId)
      : [...currentGroupIds, targetGroupId];

    const targetGroup = groups.find((g) => g.id === targetGroupId);
    const nextGroups = hasGroup
      ? (entry.groups || []).filter((g) => g.id !== targetGroupId)
      : targetGroup ? [...(entry.groups || []), targetGroup] : entry.groups || [];

    // 2. OPTIMISTIC UPDATE (0ms): update entries state immediately
    setEntries((items) => items.map((item) => {
      if (item.id === entryId) {
        return {
          ...item,
          groups: nextGroups,
          group_ids: nextGroupIds,
        };
      }
      return item;
    }));

    // 3. OPTIMISTIC UPDATE (0ms): update groups word_count & word_ids immediately
    setGroups((prevGroups) => prevGroups.map((g) => {
      if (g.id === targetGroupId) {
        const wordIds = new Set(g.word_ids || []);
        if (hasGroup) {
          wordIds.delete(entryId);
        } else {
          wordIds.add(entryId);
        }
        return {
          ...g,
          word_count: wordIds.size,
          word_ids: Array.from(wordIds),
        };
      }
      return g;
    }));

    // 4. Update current study card if active
    if (currentCard && currentCard.id === entryId) {
      setReviewSession((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => e.entryId === entryId ? { ...e, groups: nextGroups, group_ids: nextGroupIds } : e),
      }));
      setReviewQueue((prev) => prev.map((c) => c.id === entryId ? { ...c, groups: nextGroups, group_ids: nextGroupIds } : c));
    }

    // 5. Non-blocking background queue per entryId
    const previousPromise = groupMutationQueueRef.current.get(entryId) || Promise.resolve();
    const nextPromise = previousPromise
      .catch(() => undefined)
      .then(async () => {
        const response = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${entryId}/groups`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: nextGroupIds }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update word group');
        }
      })
      .catch((err) => {
        console.error('Group update error:', err);
        setError(`Failed to save group change: ${err.message}`);
        refreshVocabulary().catch(() => undefined);
      })
      .finally(() => {
        if (groupMutationQueueRef.current.get(entryId) === nextPromise) {
          groupMutationQueueRef.current.delete(entryId);
        }
      });

    groupMutationQueueRef.current.set(entryId, nextPromise);
  };

  const toggleEntryExpanded = (entryId) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };
  const fileInputRef = useRef(null);
  const autoPlayedCardKeyRef = useRef('');
  const typingInputRef = useRef(null);
  const latestRefreshIdRef = useRef(0);
  const studySessionSaveChainRef = useRef(Promise.resolve());
  const restartNextStudySessionSaveRef = useRef(false);
  const favoriteMutationIdsRef = useRef(new Set());
  const groupMutationQueueRef = useRef(new Map());
  const learnedMutationIdsRef = useRef(new Set());
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
    const refreshId = ++latestRefreshIdRef.current;
    const [entriesResponse, queueResponse, groupsResponse] = await Promise.all([
      profileFetch(profileApiUrl('/spanish/api/vocabulary')),
      profileFetch(profileApiUrl('/spanish/api/vocabulary/review-queue?limit=40')),
      profileFetch(profileApiUrl('/spanish/api/vocabulary/groups')),
    ]);

    if (refreshId !== latestRefreshIdRef.current) {
      return;
    }

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
    const groupsData = groupsResponse.ok ? await groupsResponse.json() : { groups: [] };
    const nextEntries = entriesData.entries || [];
    const nextStats = entriesData.stats || INITIAL_STATS;
    const nextQueueStats = queueData.stats || { total_due: 0, returned: 0, limit: 40 };
    const nextGroups = groupsData.groups || [];

    setEntries(nextEntries);
    setStats(nextStats);
    setQueueStats(nextQueueStats);
    setGroups(nextGroups);
    setOfflineSnapshot(null);
    writeOfflineVocabularyCache({
      entries: nextEntries,
      stats: nextStats,
      queueStats: nextQueueStats,
      groups: nextGroups,
    });
    return { entries: nextEntries, stats: nextStats, queueStats: nextQueueStats, groups: nextGroups };
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

  const startReviewSession = useCallback(async (mode = 'due', sourceEntries = entries, { forceRestart = false } = {}) => {
    if (typeof mode === 'string') {
      if (mode.startsWith('group_once:')) {
        const gid = Number(mode.split(':')[1]);
        if (Number.isFinite(gid)) touchGroups([gid]);
      } else if (mode.startsWith('groups_once:')) {
        const gids = mode.split(':')[1].split(',').map(Number).filter(Boolean);
        if (gids.length > 0) touchGroups(gids);
      }
    }

    if (!forceRestart && reviewSession.mode === mode && reviewSession.entries.length > 0) {
      resetPractice();
      setShowAnswer(false);
      setTypedAnswer('');
      setTypingFeedback(null);
      setNotice(`Continuing the saved round with ${reviewSession.entries.length} words left.`);
      return;
    }

    let savedSession = null;
    if (!forceRestart && isResumableStudyMode(mode)) {
      try {
        const response = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/study-session?mode=${encodeURIComponent(mode)}`));
        if (response.ok) {
          const data = await response.json();
          savedSession = data.session;
          const restored = restorePersistedReviewSession(savedSession, sourceEntries);
          if (restored?.currentCard) {
            setReviewSession(restored.session);
            setReviewQueue([restored.currentCard]);
            resetPractice();
            setShowAnswer(false);
            setTypedAnswer('');
            setTypingFeedback(null);
            setError('');
            setNotice(`Resumed the saved round with ${restored.session.entries.length} words left.`);
            return;
          }
        }
      } catch (loadError) {
        setError(`Could not check the saved vocabulary round: ${loadError.message}`);
        return;
      }
    }

    const nextState = createReviewSession(sourceEntries, mode);
    restartNextStudySessionSaveRef.current = forceRestart || Boolean(savedSession);
    setReviewSession(nextState.session);
    setReviewQueue(nextState.currentCard ? [nextState.currentCard] : []);
    resetPractice();
    setShowAnswer(false);
    setTypedAnswer('');
    setTypingFeedback(null);
  }, [entries, resetPractice, reviewSession.entries.length, reviewSession.mode]);

  const restartReviewSession = useCallback((mode) => {
    if (!window.confirm('Restart this exact-once round? Saved progress in the current round will be cleared.')) return;
    startReviewSession(mode, entries, { forceRestart: true });
  }, [entries, startReviewSession]);

  const advanceCurrentSessionCard = useCallback((completedCard = currentCard, { removeEntry = false } = {}) => {
    if (!completedCard) {
      return;
    }

    // Instantly update local quest progress
    setTodayVocabProgress(prev => Math.min(10, prev + 1));

    // Report vocabulary practice towards daily missions & XP on server
    try {
      profileFetch(profileApiUrl('/spanish/api/gamification/record-practice'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vocab_review', count: 1 })
      }).then(() => {
        window.dispatchEvent(new CustomEvent('gamification_updated'));
      }).catch((e) => console.error('Error reporting practice:', e));
    } catch (e) {
      console.error('Error dispatching practice:', e);
    }

    let nextState = removeEntry
      ? removeEntryFromReviewSession(reviewSession, completedCard.id)
      : advanceReviewSession(reviewSession, completedCard);

    // Infinite loop for group rounds: when the round finishes, automatically start next shuffled lap!
    const isGroupRound = typeof reviewSession.mode === 'string' && (reviewSession.mode.startsWith('group_once:') || reviewSession.mode.startsWith('groups_once:'));
    if (isGroupRound && (!nextState.currentCard || nextState.session.entries.length === 0)) {
      const nextLap = (reviewSession.lap || 1) + 1;
      const freshRound = createReviewSession(entries, reviewSession.mode);
      if (freshRound.currentCard) {
        nextState = {
          session: {
            ...freshRound.session,
            lap: nextLap,
          },
          currentCard: freshRound.currentCard,
        };
        setNotice(`🎉 Круг ${nextLap - 1} завершен! Начинаем круг ${nextLap} (${freshRound.session.totalEntries} слов в случайном порядке).`);
      }
    }

    setReviewSession(nextState.session);
    setReviewQueue(nextState.currentCard ? [nextState.currentCard] : []);
    resetPractice();
    setShowAnswer(false);
    setTypedAnswer('');
    setTypingFeedback(null);
  }, [currentCard, entries, resetPractice, reviewSession]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');
      setNotice('');
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false && loadOfflineVocabularySnapshot()) {
          setStudySessionHydrated(true);
          return;
        }

        const loaded = await refreshVocabulary();
        let restored = null;
        try {
          const sessionResponse = await profileFetch(profileApiUrl('/spanish/api/vocabulary/study-session'));
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            restored = restorePersistedReviewSession(sessionData.session, loaded.entries);
          }
        } catch (sessionError) {
          console.warn('Could not restore vocabulary study session:', sessionError);
        }
        if (!cancelled) {
          if (restored) {
            setReviewSession(restored.session);
            setReviewQueue(restored.currentCard ? [restored.currentCard] : []);
            setNotice(restored.currentCard ? 'Resumed your saved vocabulary round.' : 'Your saved vocabulary round is complete.');
          }
          setShowAnswer(false);
          setStudySessionHydrated(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error('Error loading vocabulary:', loadError);
          if (!loadOfflineVocabularySnapshot()) {
            setError(loadError.message || 'Failed to load vocabulary');
          }
          setStudySessionHydrated(true);
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
    if (isLoading || !studySessionHydrated) {
      return;
    }

    if (reviewQueue.length > 0 || reviewSession.totalEntries > 0 || reviewSession.isComplete) {
      return;
    }

    const nextState = createReviewSession(entries, 'due');
    setReviewSession(nextState.session);
    setReviewQueue(nextState.currentCard ? [nextState.currentCard] : []);
  }, [entries, isLoading, reviewQueue.length, reviewSession.isComplete, reviewSession.totalEntries, studySessionHydrated]);

  useEffect(() => {
    if (!studySessionHydrated || !isResumableStudyMode(reviewSession.mode)) return undefined;
    const payload = {
      mode: reviewSession.mode,
      state: { session: reviewSession, currentCard: reviewQueue[0] || null },
      restart: restartNextStudySessionSaveRef.current,
    };
    restartNextStudySessionSaveRef.current = false;
    const save = studySessionSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await profileFetch(profileApiUrl('/spanish/api/vocabulary/study-session'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const error = new Error(data.error || 'Failed to save vocabulary round');
          error.code = data.code;
          throw error;
        }
      });
    studySessionSaveChainRef.current = save;
    save.catch((saveError) => {
      console.error('Error saving vocabulary study session:', saveError);
      if (saveError.code === 'STUDY_SESSION_REGRESSION') {
        setNotice('The server kept the newer saved position and ignored an older delayed update.');
      } else {
        setError(`Round progress is still on this page, but server save failed: ${saveError.message}`);
      }
    });
    return undefined;
  }, [reviewQueue, reviewSession, studySessionHydrated]);

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
  const favoriteCandidateCount = useMemo(
    () => entries.filter((entry) => entry.is_favorite && isEntryEligibleForPracticeAll(entry)).length,
    [entries],
  );
  const remainingSessionEntries = reviewSession.entries.length;
  const continuingOnceRound = reviewSession.mode === 'once_all' && remainingSessionEntries > 0;
  const continuingFavoritesRound = reviewSession.mode === 'favorites_once' && remainingSessionEntries > 0;
  const completedSessionEntries = Math.max(0, reviewSession.totalEntries - remainingSessionEntries);
  const reviewProgressPercent = reviewSession.totalEntries > 0
    ? Math.min(100, Math.round((completedSessionEntries / reviewSession.totalEntries) * 100))
    : 100;
  const reviewRoundCompleted = reviewSession.isComplete && reviewSession.mode === 'due' && reviewSession.totalEntries > 0;
  const practiceRoundCompleted = reviewSession.isComplete && reviewSession.mode === 'practice_all' && reviewSession.totalEntries > 0;
  const onceRoundCompleted = reviewSession.isComplete && reviewSession.mode === 'once_all' && reviewSession.totalEntries > 0;
  const favoritesRoundCompleted = reviewSession.isComplete && reviewSession.mode === 'favorites_once' && reviewSession.totalEntries > 0;

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

  const filteredEntries = useMemo(() => {
    let result = entries.filter((entry) => matchesEntryFilter(entry, entryFilter));
    if (selectedGroupFilterIds.length > 0) {
      result = result.filter((entry) => (entry.groups || []).some((g) => selectedGroupFilterIds.includes(g.id)));
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'newest') return Number(b.id) - Number(a.id);
      if (sortBy === 'word_asc') return a.word.localeCompare(b.word, 'es');
      if (sortBy === 'translation_asc') return (a.translation || '').localeCompare(b.translation || '', 'ru');
      if (sortBy === 'due_desc') return (b.card_summary?.due_cards || 0) - (a.card_summary?.due_cards || 0);
      return 0;
    });

    return result;
  }, [entries, entryFilter, selectedGroupFilterIds, sortBy]);

  const filteredEntryLabel = ENTRY_FILTERS[entryFilter]?.label || ENTRY_FILTERS.all.label;

  const isSingleGroupRound = typeof reviewSession.mode === 'string' && reviewSession.mode.startsWith('group_once:');
  const isMultiGroupRound = typeof reviewSession.mode === 'string' && reviewSession.mode.startsWith('groups_once:');
  const isCurrentGroupRound = isSingleGroupRound || isMultiGroupRound;
  const currentGroupName = useMemo(() => {
    if (isSingleGroupRound) {
      const gid = Number(reviewSession.mode.split(':')[1]);
      return groups.find((g) => g.id === gid)?.name || 'Group';
    }
    if (isMultiGroupRound) {
      const gids = reviewSession.mode.split(':')[1].split(',').map(Number).filter(Boolean);
      const names = groups.filter((g) => gids.includes(g.id)).map((g) => g.name);
      return names.length > 0 ? names.join(' + ') : 'Selected Groups';
    }
    return 'Group';
  }, [isSingleGroupRound, isMultiGroupRound, reviewSession.mode, groups]);

  const dueLabel = useMemo(() => {
    if (reviewSession.totalEntries > 0 && currentCard) {
      const wordLabel = `${remainingSessionEntries} ${remainingSessionEntries === 1 ? 'word' : 'words'} left`;
      if (reviewSession.mode === 'favorites_once') return `${wordLabel} in favorites round`;
      if (reviewSession.mode === 'once_all') return `${wordLabel} in exact-once round`;
      if (isCurrentGroupRound) return `${wordLabel} in «${currentGroupName}» group round`;
      return reviewSession.mode === 'practice_all' ? `${wordLabel} in random practice` : `${wordLabel} in this round`;
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

      setNewWord({ word: '', translation: '', example: '', groupIds: [] });
      setShowAddForm(false);
      await refreshVocabulary();
    } catch (submitError) {
      console.error('Error adding word:', submitError);
      setError(submitError.message || 'Failed to add word');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReview = (endpoint, body) => {
    if (!currentCard) return false;
    if (isOfflineRuntime()) {
      setNotice('Offline practice only: this answer does not change the spaced repetition timer.');
      return true;
    }

    setError('');
    setNotice('');

    // Fire the POST request asynchronously in the background
    profileFetch(profileApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update review card');
        }
        await refreshVocabulary();
      })
      .catch((reviewError) => {
        console.error('Error updating review card in background:', reviewError);
        setError(`Sync error: ${reviewError.message || 'Failed to save progress'}`);
      });

    // Instantly reset the practice UI state to be ready for the next card
    resetPractice();
    setShowAnswer(false);
    return true;
  };

  const handleReview = (grade) => {
    if (!currentCard) return;

    if (currentCard.submits_review) {
      const success = submitReview(`/spanish/api/vocabulary/${currentCard.id}/review`, {
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

  const handleLearned = () => {
    if (!currentCard) return;
    if (isOfflineRuntime()) {
      setError('Marking a word learned forever needs internet.');
      return;
    }
    if (!window.confirm(`Mark “${currentCard.word}” learned forever? It will leave every study queue, but you can restore it from the Learned list.`)) return;
    const learnedCard = currentCard;
    const entryId = Number(learnedCard.id);
    if (learnedMutationIdsRef.current.has(entryId)) return;
    learnedMutationIdsRef.current.add(entryId);
    setPendingLearnedIds((ids) => new Set(ids).add(entryId));
    setError('');
    setEntries((items) => items.map((item) => item.id === learnedCard.id
      ? { ...item, learned_permanently_at: new Date().toISOString() }
      : item));
    advanceCurrentSessionCard(learnedCard, { removeEntry: true });
    setNotice('Saved as learned forever. Syncing…');

    profileFetch(profileApiUrl(`/spanish/api/vocabulary/${learnedCard.id}/permanent-learned`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learned: true }),
      })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to mark word learned forever');
        }
        await refreshVocabulary();
        setNotice('Saved as learned forever. You can restore it from the Learned list.');
      })
      .catch((learnError) => {
        setEntries((items) => items.map((item) => item.id === learnedCard.id
          ? { ...item, learned_permanently_at: null }
          : item));
        setError(`The next card is ready, but saving “learned forever” failed: ${learnError.message}`);
      })
      .finally(() => {
        learnedMutationIdsRef.current.delete(entryId);
        setPendingLearnedIds((ids) => {
          const next = new Set(ids);
          next.delete(entryId);
          return next;
        });
      });
  };

  const updateFavorite = (entry, favorite) => {
    if (isOfflineRuntime()) {
      setError('Updating favorites needs internet.');
      return;
    }
    const entryId = Number(entry.id);
    if (favoriteMutationIdsRef.current.has(entryId)) return;
    favoriteMutationIdsRef.current.add(entryId);
    setPendingFavoriteIds((ids) => new Set(ids).add(entryId));
    setError('');
    setEntries((items) => items.map((item) => item.id === entry.id ? { ...item, is_favorite: favorite } : item));
    setReviewQueue((queue) => queue.map((card) => card.id === entry.id ? { ...card, is_favorite: favorite } : card));
    setReviewSession((session) => ({
      ...session,
      entries: session.entries.map((item) => item.entryId === entry.id ? { ...item, isFavorite: favorite } : item),
    }));
    setNotice(favorite ? 'Added to favorites. Saving…' : 'Removed from favorites. Saving…');

    profileFetch(profileApiUrl(`/spanish/api/vocabulary/${entry.id}/favorite`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite }),
      })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update favorite');
        }
        await refreshVocabulary();
        setNotice(favorite ? 'Added to favorites.' : 'Removed from favorites.');
      })
      .catch((favoriteError) => {
        setEntries((items) => items.map((item) => item.id === entry.id ? { ...item, is_favorite: !favorite } : item));
        setReviewQueue((queue) => queue.map((card) => card.id === entry.id ? { ...card, is_favorite: !favorite } : card));
        setReviewSession((session) => ({
          ...session,
          entries: session.entries.map((item) => item.entryId === entry.id ? { ...item, isFavorite: !favorite } : item),
        }));
        setError(`Favorite changed instantly, but server save failed: ${favoriteError.message}`);
      })
      .finally(() => {
        favoriteMutationIdsRef.current.delete(entryId);
        setPendingFavoriteIds((ids) => {
          const next = new Set(ids);
          next.delete(entryId);
          return next;
        });
      });
  };

  const toggleLearnedForever = async (entry) => {
    const isLearned = Boolean(entry.learned_permanently_at);
    const targetLearned = !isLearned;
    const entryId = Number(entry.id);
    if (learnedMutationIdsRef.current.has(entryId)) return;
    learnedMutationIdsRef.current.add(entryId);
    setPendingLearnedIds((ids) => new Set(ids).add(entryId));
    setError('');

    setEntries((items) => items.map((item) => item.id === entryId
      ? {
          ...item,
          learned_permanently_at: targetLearned ? new Date().toISOString() : null,
          is_favorite: targetLearned ? false : item.is_favorite,
          groups: targetLearned ? [] : item.groups,
        }
      : item));

    if (targetLearned && (entry.groups || []).length > 0) {
      const removedGroupIds = (entry.groups || []).map((g) => g.id);
      setGroups((curr) => curr.map((g) => removedGroupIds.includes(g.id) ? { ...g, word_count: Math.max(0, (g.word_count || 1) - 1) } : g));
    }

    if (targetLearned && currentCard && currentCard.id === entryId) {
      advanceCurrentSessionCard(currentCard, { removeEntry: true });
    }

    try {
      const response = await profileFetch(profileApiUrl(`/spanish/api/vocabulary/${entryId}/permanent-learned`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learned: targetLearned }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update learned state');
      }
      setNotice(targetLearned ? `Marked "${entry.word}" as learned forever.` : `Restored "${entry.word}" to study queues.`);
    } catch (err) {
      setError(err.message || 'Failed to update learned status');
      await refreshVocabulary().catch(() => undefined);
    } finally {
      learnedMutationIdsRef.current.delete(entryId);
      setPendingLearnedIds((ids) => {
        const next = new Set(ids);
        next.delete(entryId);
        return next;
      });
    }
  };

  const restoreLearnedEntry = (entry) => toggleLearnedForever(entry);

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

        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="mb-3 text-sm font-semibold text-indigo-900">Choose a study round</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => startReviewSession('due')} disabled={dueStudyCandidateCount === 0} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-indigo-700 shadow-sm disabled:opacity-45">
              Due now ({dueStudyCandidateCount})
            </button>
            <button type="button" onClick={() => startReviewSession('once_all')} disabled={!continuingOnceRound && practiceAllCandidateCount === 0} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-45">
              {continuingOnceRound ? `Continue all words (${remainingSessionEntries} left)` : `All words — once each (${practiceAllCandidateCount})`}
            </button>
            <button type="button" onClick={() => startReviewSession('favorites_once')} disabled={!continuingFavoritesRound && favoriteCandidateCount === 0} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-45">
              <Star className="mr-1 inline h-4 w-4" /> {continuingFavoritesRound ? `Continue favorites (${remainingSessionEntries} left)` : `Favorites only (${favoriteCandidateCount})`}
            </button>
          </div>

          {groups.length > 0 && (
            <div className="pt-4 border-t border-indigo-200/80 mt-4 space-y-3">
              {/* Collapsible Accordion Header */}
              <div
                onClick={() => setIsGroupsStudyExpanded(prev => !prev)}
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none p-2 rounded-xl hover:bg-indigo-100/70 transition-all border border-transparent hover:border-indigo-200"
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-indigo-600" />
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                    Study by Group (Select one or multiple groups)
                  </p>
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-200/80 px-2 py-0.5 rounded-full">
                    {selectedStudyGroupIds.length > 0
                      ? `✓ ${selectedStudyGroupIds.length} selected`
                      : `${groups.length} groups`}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {isGroupsStudyExpanded && (
                    <div className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelectedStudyGroupIds(groups.map((g) => g.id))}
                        className="text-indigo-700 hover:text-indigo-900 font-bold underline"
                      >
                        Select all
                      </button>
                      <span className="text-indigo-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedStudyGroupIds([])}
                        className="text-indigo-700 hover:text-indigo-900 font-bold underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="p-1 rounded-lg bg-white/70 border border-indigo-200 text-indigo-700 hover:bg-white transition-colors">
                    {isGroupsStudyExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Collapsible Body */}
              {isGroupsStudyExpanded && (
                <div className="space-y-3 pt-1 animate-fadeIn">
                  {/* Group selection chips */}
                  <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto p-1">
                    {sortedGroups.map((group) => {
                      const isSelected = selectedStudyGroupIds.includes(group.id);
                      const isCurrentMode = reviewSession.mode === `group_once:${group.id}` ||
                        (typeof reviewSession.mode === 'string' && reviewSession.mode.startsWith('groups_once:') &&
                          reviewSession.mode.split(':')[1].split(',').map(Number).includes(group.id));
                      const isRecentlyPracticed = Boolean(group.last_practiced_at);
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudyGroupIds((prev) =>
                              prev.includes(group.id) ? prev.filter((id) => id !== group.id) : [...prev, group.id]
                            );
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all shadow-sm ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-300'
                              : isCurrentMode
                              ? 'border-purple-400 bg-purple-100 text-purple-950 ring-1 ring-purple-300'
                              : isRecentlyPracticed
                              ? 'border-indigo-300 bg-indigo-50/70 text-indigo-950 hover:border-indigo-500 hover:bg-indigo-100/70'
                              : 'border-indigo-200 bg-white text-indigo-900 hover:border-indigo-400 hover:bg-indigo-50/60'
                          }`}
                          title={
                            isCurrentMode
                              ? 'Currently active in-progress round'
                              : isSelected
                              ? 'Selected for next round'
                              : isRecentlyPracticed
                              ? `Practiced recently: ${new Date(group.last_practiced_at).toLocaleString()}`
                              : 'Click to select'
                          }
                        >
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] font-bold border ${
                            isSelected ? 'bg-white text-indigo-700 border-white' : isCurrentMode ? 'bg-purple-200 border-purple-400 text-purple-900' : 'border-indigo-300 text-transparent'
                          }`}>
                            {isSelected ? '✓' : isCurrentMode ? '⏳' : ''}
                          </span>
                          {isRecentlyPracticed && !isSelected && !isCurrentMode && (
                            <span className="text-[11px]" title={`Practiced: ${new Date(group.last_practiced_at).toLocaleDateString()}`}>🕒</span>
                          )}
                          <span>{group.name}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isSelected
                              ? 'bg-indigo-800 text-white'
                              : isCurrentMode
                              ? 'bg-purple-200 text-purple-900'
                              : 'bg-indigo-100 text-indigo-900'
                          }`}>
                            {isCurrentMode && !isSelected ? `${group.word_count || 0} (in round)` : (group.word_count || 0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Action button to launch study */}
                  <div className="pt-2">
                    {selectedStudyGroupIds.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedStudyGroupIds.length === 1) {
                            startReviewSession(`group_once:${selectedStudyGroupIds[0]}`);
                          } else {
                            startReviewSession(`groups_once:${selectedStudyGroupIds.join(',')}`);
                          }
                        }}
                        className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm shadow-md hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>
                          {selectedStudyGroupIds.length === 1
                            ? `Study 1 Group (${groups.find((g) => g.id === selectedStudyGroupIds[0])?.name || ''}) — ${groups.find((g) => g.id === selectedStudyGroupIds[0])?.word_count || 0} words`
                            : `Study ${selectedStudyGroupIds.length} Selected Groups Combined (${(() => {
                                const wordIds = new Set();
                                for (const gid of selectedStudyGroupIds) {
                                  const grp = groups.find((g) => g.id === gid);
                                  (grp?.word_ids || []).forEach((wid) => wordIds.add(wid));
                                  entries.forEach((e) => {
                                    const egids = (e.group_ids || []).concat((e.groups || []).map((g) => g.id));
                                    if (egids.includes(gid)) wordIds.add(e.id);
                                  });
                                }
                                return wordIds.size;
                              })()} words)`}
                        </span>
                      </button>
                    ) : (
                      <p className="text-xs text-indigo-700 font-medium">
                        💡 Click on any group chip above to select it, or select multiple groups to study them together in one practice round.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-xs text-indigo-700">The once-each and group modes use a saved snapshot. Adding or deleting other words does not reset completed progress.</p>
          {(continuingOnceRound || continuingFavoritesRound || (isCurrentGroupRound && remainingSessionEntries > 0)) && (
            <button type="button" onClick={() => restartReviewSession(reviewSession.mode)} className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700">
              Restart this round from the beginning
            </button>
          )}
        </div>

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


      {showGroupManager && (
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-indigo-100 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Folder className="h-5 w-5 text-indigo-600" />
              Manage Word Groups
            </h3>
            <button
              type="button"
              onClick={() => setShowGroupManager(false)}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New group name (e.g. Цвета, Глаголы)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              className="flex-1 px-4 py-2 border-2 border-slate-200 focus:border-indigo-500 rounded-xl text-sm outline-none"
            />
            <button
              type="button"
              onClick={createGroup}
              disabled={isSubmitting || !newGroupName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <FolderPlus className="h-4 w-4" />
              Create
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-2">No groups created yet. Create one above!</p>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  {editingGroupId === group.id ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input
                        type="text"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        className="flex-1 px-3 py-1 border rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => updateGroup(group.id)}
                        className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroupId(null)}
                        className="px-2 py-1 text-slate-500 text-xs rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-indigo-500" />
                      <span className="font-semibold text-slate-800 text-sm">{group.name}</span>
                      <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-full">
                        {group.word_count || 0} words
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {editingGroupId !== group.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGroupId(group.id);
                          setEditingGroupName(group.name);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white"
                        title="Rename group"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteGroup(group)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white"
                      title="Delete group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
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
                {isCurrentGroupRound ? `${isMultiGroupRound ? 'Groups' : 'Group'}: ${currentGroupName} · Круг ${reviewSession.lap || 1} (бесконечный режим)` : currentCard.session_mode === 'favorites_once' ? 'Favorites — once each' : currentCard.session_mode === 'once_all' ? 'All words — once each' : currentCard.session_mode === 'practice_all' ? 'Random practice round' : 'Due round'}
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
              {isCurrentGroupRound && (
                <button
                  type="button"
                  onClick={() => startReviewSession('due')}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors shadow-sm"
                  title="Остановить тренировку группы"
                >
                  <span>🛑 Закончить тренировку</span>
                </button>
              )}
            </div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${reviewProgressPercent}%` }}
            />
          </div>

          {/* Daily Quest Progress Live Banner */}
          <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 via-pink-50 to-amber-50 border border-purple-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-2.5">
              <span className="text-xl">📇</span>
              <div>
                <div className="text-xs font-black text-gray-900 flex items-center gap-2">
                  <span>Миссия на сегодня: Повторение слов</span>
                  {todayVocabProgress >= 10 && (
                    <span className="text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full">
                      ✓ Выполнено (+30 XP)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-600 font-medium">
                  Повторено сегодня: <strong>{todayVocabProgress}</strong> из 10 карточек
                </div>
              </div>
            </div>
            <div className="w-24 sm:w-32 bg-gray-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-400 to-purple-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((todayVocabProgress / 10) * 100))}%` }}
              />
            </div>
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
                      disabled={isVoicePracticeBusy}
                      className={`rounded-xl px-3 py-2.5 text-xs font-semibold text-white transition-all shadow-md flex min-h-[3.25rem] items-center justify-center gap-1.5 text-center leading-tight disabled:opacity-60 sm:min-h-[4rem] sm:flex-col sm:gap-1 sm:px-3 sm:py-3 sm:text-sm ${action.className}`}
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span>{action.label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => updateFavorite(currentCard, !currentCard.is_favorite)}
                  disabled={pendingFavoriteIds.has(Number(currentCard.id)) || isVoicePracticeBusy}
                  className={`rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-all shadow-md flex min-h-[3.25rem] items-center justify-center gap-1.5 text-center leading-tight disabled:opacity-60 sm:min-h-[4rem] sm:flex-col sm:gap-1 sm:px-3 sm:py-3 sm:text-sm ${currentCard.is_favorite ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50'}`}
                >
                  <Star className={`h-4 w-4 sm:h-5 sm:w-5 ${currentCard.is_favorite ? 'fill-current' : ''}`} />
                  <span>{currentCard.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</span>
                </button>
              </div>


                {/* Group selector dropdown on flashcard */}
                {groups.length > 0 && (
                  <div className="relative inline-block w-full">
                    <button
                      type="button"
                      onClick={() => setActiveGroupMenuWordId(activeGroupMenuWordId === currentCard.id ? null : currentCard.id)}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold text-xs inline-flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5 text-indigo-600" />
                        Manage word groups ({((currentCard.groups || []).length)})
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {activeGroupMenuWordId === currentCard.id && (
                      <div className="absolute bottom-full mb-1 left-0 w-full bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-20 space-y-1">
                        {groups.map((group) => {
                          const isAttached = (currentCard.groups || []).some((g) => g.id === group.id);
                          return (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => toggleWordGroup(currentCard, group.id)}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                                isAttached ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <span>{group.name}</span>
                              {isAttached ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              <button
                type="button"
                onClick={handleLearned}
                disabled={pendingLearnedIds.has(Number(currentCard.id)) || isVoicePracticeBusy}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-all shadow-md flex items-center justify-center gap-2 leading-tight disabled:opacity-60 sm:text-base"
              >
                <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                Learned forever — remove from study queues
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
            {favoritesRoundCompleted
              ? 'Favorites round finished!'
              : onceRoundCompleted
                ? 'Every active word appeared exactly once.'
                : reviewRoundCompleted
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
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold text-gray-800">Vocabulary entries ({filteredEntries.length})</h3>

              {/* Sort by dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 border-2 border-indigo-200 rounded-xl px-2.5 py-1 shadow-sm">
                <ArrowUpDown className="h-3.5 w-3.5 text-indigo-600" />
                <span className="text-xs font-bold text-slate-600">Сортировка:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-xs font-bold text-indigo-950 focus:outline-none cursor-pointer"
                >
                  <option value="newest">✨ Сначала новые</option>
                  <option value="word_asc">🔤 Испанский (A–Z)</option>
                  <option value="translation_asc">🇷🇺 Перевод (А–Я)</option>
                  <option value="due_desc">⏳ Сначала к повторению</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGroupManager((v) => !v)}
              className="px-3.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Folder className="h-4 w-4 text-indigo-600" />
              <span>Manage Groups ({groups.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDecksModal(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm hover:scale-105"
              title="Создать автоматические колоды по 25 слов из частотных списков CEFR"
            >
              <Layers className="h-4 w-4" />
              <span>Частотные колоды</span>
            </button>

          </div>
          {/* Multi-group filter row for entries list */}
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mr-1">
                <Tag className="h-3.5 w-3.5 text-indigo-600" />
                <span>Фильтр групп:</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupFilterIds([])}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  selectedGroupFilterIds.length === 0
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
                }`}
              >
                Все ({entries.length})
              </button>
              {groups.map((g) => {
                const isSelected = selectedGroupFilterIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupFilterIds((prev) =>
                        prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                        : 'bg-white text-indigo-950 hover:bg-indigo-50 border border-indigo-200/70'
                    }`}
                  >
                    <span>{g.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-indigo-100 text-indigo-900'
                    }`}>
                      {g.word_count || 0}
                    </span>
                  </button>
                );
              })}
              {selectedGroupFilterIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedGroupFilterIds([])}
                  className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline ml-auto"
                >
                  Сбросить ({selectedGroupFilterIds.length} выбр.)
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">
              Showing {filteredEntryLabel.toLowerCase()} entries. Filter by review state or by the last answer grade across both directions.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ENTRY_FILTERS).map(([key, config]) => {
                const isSelected = entryFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEntryFilter(key)}
                    title={config.description}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {config.label} ({entryCounts[key] ?? 0})
                  </button>
                );
              })}
            </div>
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
                        {entry.is_favorite && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"><Star className="h-3.5 w-3.5 fill-current" /> Favorite</span>
                        )}
                        {entry.learned_permanently_at && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"><Check className="h-3.5 w-3.5" /> Learned forever</span>
                        )}
                        {entry.needs_completion && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Needs translation
                          </span>
                        )}
                        {(entry.groups || []).map((g) => (
                          <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200/60 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                            <Tag className="h-3 w-3" />
                            {g.name}
                          </span>
                        ))}
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

                    <div className="flex items-center gap-1.5 self-end lg:self-start relative">
                      {/* Groups popup menu button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveGroupMenuWordId(activeGroupMenuWordId === entry.id ? null : entry.id)}
                          title="Assign groups / status for this word"
                          className={`p-2 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold ${
                            (entry.groups || []).length > 0
                              ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                        >
                          <Tag className="h-4 w-4" />
                          <span className="hidden sm:inline">Groups ({(entry.groups || []).length})</span>
                        </button>
                        {activeGroupMenuWordId === entry.id && (
                          <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2.5 z-30 space-y-1.5 animate-fadeIn">
                            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Add to Groups</p>
                              <button
                                type="button"
                                onClick={() => setActiveGroupMenuWordId(null)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {groups.length === 0 ? (
                              <p className="text-xs text-slate-500 italic px-2 py-1.5">No custom groups created yet.</p>
                            ) : (
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {groups.map((group) => {
                                  const isAttached = (entry.groups || []).some((g) => g.id === group.id);
                                  return (
                                    <button
                                      key={group.id}
                                      type="button"
                                      onClick={() => toggleWordGroup(entry, group.id)}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                                        isAttached ? 'bg-indigo-50 text-indigo-900 border border-indigo-200' : 'hover:bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      <span className="truncate">{group.name}</span>
                                      {isAttached ? (
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold">✓ In group</span>
                                      ) : (
                                        <Plus className="h-3.5 w-3.5 text-slate-400" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div className="pt-1.5 border-t border-slate-100 space-y-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveGroupMenuWordId(null);
                                  setShowGroupManager(true);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 hover:bg-indigo-50 flex items-center gap-1.5"
                              >
                                <FolderPlus className="h-3.5 w-3.5" />
                                <span>Manage all groups…</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  toggleLearnedForever(entry);
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                                  entry.learned_permanently_at ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <GraduationCap className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Learned forever</span>
                                </span>
                                {entry.learned_permanently_at ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Direct Learned Forever toggle button */}
                      <button
                        type="button"
                        onClick={() => toggleLearnedForever(entry)}
                        disabled={pendingLearnedIds.has(Number(entry.id)) || isSubmitting}
                        className={`p-2 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold ${
                          entry.learned_permanently_at
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                        title={entry.learned_permanently_at ? 'Learned forever (Click to return to study)' : 'Mark as fully learned / Изучено навсегда'}
                      >
                        <GraduationCap className="h-4 w-4" />
                        <span className="hidden xl:inline">{entry.learned_permanently_at ? 'Learned' : 'Learn'}</span>
                      </button>

                      {/* Favorite star toggle button */}
                      <button
                        type="button"
                        onClick={() => updateFavorite(entry, !entry.is_favorite)}
                        disabled={pendingFavoriteIds.has(Number(entry.id))}
                        className={`p-2 rounded-xl transition-colors disabled:opacity-60 ${entry.is_favorite ? 'bg-amber-100 text-amber-600' : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'}`}
                        title={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star className={`h-4 w-4 ${entry.is_favorite ? 'fill-current' : ''}`} />
                      </button>

                      {/* Expand details button */}
                      <button
                        type="button"
                        onClick={() => toggleEntryExpanded(entry.id)}
                        className="p-2 text-slate-500 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center"
                        title={isExpanded ? 'Hide details' : 'Show details'}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => deleteWord(entry.id)}
                        disabled={isSubmitting}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-60"
                        title="Delete entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Vocabulary Decks Generator Modal */}
      <VocabularyDecksModal
        isOpen={showDecksModal}
        onClose={() => setShowDecksModal(false)}
        onDecksCreated={() => {
          fetchGroups();
          fetchVocabulary();
        }}
      />
    </div>
  );
}

export default Vocabulary;