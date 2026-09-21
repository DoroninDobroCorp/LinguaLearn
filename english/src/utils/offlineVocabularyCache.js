const DB_NAME = 'lingua_english_offline_db';
const DB_VERSION = 1;
const STORE_VOCABULARY = 'vocabulary';
const STORE_SESSIONS = 'study_sessions';

const memoryStorage = new Map();

function safeGetItem(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStorage.get(key) || null;
}

function safeSetItem(key, val) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStorage.set(key, val);
}

function safeRemoveItem(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  memoryStorage.delete(key);
}

let memoryCache = {
  userId: null,
  data: null,
};

export function resetMemoryCacheForTesting() {
  memoryCache = { userId: null, data: null };
  memoryStorage.clear();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_VOCABULARY)) {
        db.createObjectStore(STORE_VOCABULARY, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readOfflineVocabularyCacheSync(userId = 1) {
  const cleanUserId = Number(userId) || 1;
  if (memoryCache.userId === cleanUserId && memoryCache.data) {
    return memoryCache.data;
  }

  try {
    const raw = safeGetItem(`englishOfflineVocabulary:v1:user:${cleanUserId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.words)) {
        memoryCache = { userId: cleanUserId, data: parsed };
        return parsed;
      }
    }
  } catch {}

  return null;
}

export const readOfflineVocabularyCache = readOfflineVocabularyCacheSync;

export async function readOfflineVocabularyCacheAsync(userId = 1) {
  const cleanUserId = Number(userId) || 1;
  if (memoryCache.userId === cleanUserId && memoryCache.data) {
    return memoryCache.data;
  }

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_VOCABULARY, 'readonly');
      const store = tx.objectStore(STORE_VOCABULARY);
      const req = store.get(cleanUserId);

      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.words)) {
          memoryCache = { userId: cleanUserId, data: req.result };
          resolve(req.result);
        } else {
          resolve(readOfflineVocabularyCacheSync(cleanUserId));
        }
      };

      req.onerror = () => {
        resolve(readOfflineVocabularyCacheSync(cleanUserId));
      };
    });
  } catch {
    return readOfflineVocabularyCacheSync(cleanUserId);
  }
}

export function writeOfflineVocabularyCache({
  words = [],
  dueWords = [],
  groups = [],
  userId = 1,
} = {}) {
  const cleanUserId = Number(userId) || 1;
  const payload = {
    userId: cleanUserId,
    words,
    dueWords,
    groups,
    cachedAt: new Date().toISOString(),
  };

  memoryCache = { userId: cleanUserId, data: payload };

  openDatabase()
    .then((db) => {
      const tx = db.transaction(STORE_VOCABULARY, 'readwrite');
      const store = tx.objectStore(STORE_VOCABULARY);
      store.put(payload);
    })
    .catch(() => {});

  try {
    safeSetItem(`englishOfflineVocabulary:v1:user:${cleanUserId}`, JSON.stringify(payload));
  } catch {}

  return payload;
}

export async function saveOfflineStudySession(mode, session, currentWord, userId = 1) {
  if (!mode) return;
  const cleanUserId = Number(userId) || 1;
  const id = `session_${cleanUserId}_${mode}`;
  const record = {
    id,
    userId: cleanUserId,
    mode,
    session,
    currentWord,
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(record);
  } catch {
    try {
      safeSetItem(`english_offline_session_${id}`, JSON.stringify(record));
    } catch {}
  }
}

export async function loadOfflineStudySession(mode, userId = 1) {
  if (!mode) return null;
  const cleanUserId = Number(userId) || 1;
  const id = `session_${cleanUserId}_${mode}`;

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    try {
      const raw = safeGetItem(`english_offline_session_${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export function formatOfflineCacheTime(value) {
  if (!value) return 'недавнего времени';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'недавнего времени';
  return date.toLocaleString();
}

/* =========================================================================
 * OFFLINE MUTATIONS & PROGRESS UPDATES (Review, Learned, Favorite, Add, Delete)
 * ========================================================================= */

const MUTATION_STORAGE_KEY_PREFIX = 'englishOfflineMutations:v1:user:';

export function getOfflineMutations(userId = 1) {
  const cleanUserId = Number(userId) || 1;
  try {
    const raw = safeGetItem(`${MUTATION_STORAGE_KEY_PREFIX}${cleanUserId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function enqueueOfflineMutation(mutation, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  try {
    const list = getOfflineMutations(cleanUserId);

    if (mutation.type === 'DELETE_WORD' && Number(mutation.wordId) < 0) {
      const filtered = list.filter((m) => !(m.type === 'ADD_WORD' && m.tempId === Number(mutation.wordId)));
      safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${cleanUserId}`, JSON.stringify(filtered));
      return filtered;
    }

    const record = {
      id: mutation.id || `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      userId: cleanUserId,
      ...mutation,
    };
    list.push(record);
    safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${cleanUserId}`, JSON.stringify(list));
    return list;
  } catch (err) {
    console.warn('[OfflineCache] Failed to enqueue mutation:', err);
    return [];
  }
}

export function removeOfflineMutation(mutationId, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  try {
    const list = getOfflineMutations(cleanUserId);
    const filtered = list.filter((m) => m.id !== mutationId);
    safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${cleanUserId}`, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}

export function clearOfflineMutations(userId = 1) {
  const cleanUserId = Number(userId) || 1;
  try {
    safeRemoveItem(`${MUTATION_STORAGE_KEY_PREFIX}${cleanUserId}`);
  } catch {}
}

/**
 * Calculates new level and review scheduling matching the server's SM-2 logic.
 */
export function calculateReviewProgression(currentLevel = 0, quality = 0) {
  const qualityNum = Number(quality);
  let newLevel = Number(currentLevel) || 0;

  if (qualityNum === 0) {
    newLevel = 0;
  } else if (qualityNum === 1) {
    newLevel = Math.max(0, Math.min(5, newLevel + 0.5));
  } else if (qualityNum === 2) {
    newLevel = Math.min(5, newLevel + 1);
  } else if (qualityNum === 3) {
    newLevel = Math.min(5, newLevel + 2);
  }

  const fallbackDays = [0, 1, 3, 7][qualityNum] ?? 1;
  const nextReview = new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    newLevel,
    nextReview,
    daysAdded: fallbackDays,
  };
}

/**
 * Applies a word review locally in offline mode, updating words list, due list, and enqueuing mutation.
 */
export function applyOfflineReview({ wordId, quality, nextReview } = {}, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  const numericId = Number(wordId);
  const qualityNum = Number(quality);
  if (!Number.isFinite(numericId) || ![0, 1, 2, 3].includes(qualityNum)) return null;

  const cached = readOfflineVocabularyCacheSync(cleanUserId) || {
    userId: cleanUserId,
    words: [],
    dueWords: [],
    groups: [],
  };

  const existingWord = (cached.words || []).find((w) => Number(w.id) === numericId);
  if (!existingWord) return null;

  const { newLevel, nextReview: calcNextReview } = calculateReviewProgression(existingWord.level, qualityNum);
  const safeNextReview = typeof nextReview === 'string' && !Number.isNaN(Date.parse(nextReview)) ? nextReview : calcNextReview;
  const nowIso = new Date().toISOString();
  const todayEnd = new Date().toISOString().split('T')[0] + 'T23:59:59';

  const updatedWord = {
    ...existingWord,
    level: newLevel,
    next_review: safeNextReview,
    review_count: (Number(existingWord.review_count) || 0) + 1,
    last_reviewed: nowIso,
  };

  const updatedWords = (cached.words || []).map((w) => (Number(w.id) === numericId ? updatedWord : w));

  // Update dueWords list
  const isStillDueToday = safeNextReview <= todayEnd && !updatedWord.learned_permanently_at;
  let updatedDueWords = (cached.dueWords || []).filter((w) => Number(w.id) !== numericId);
  if (isStillDueToday) {
    updatedDueWords.push(updatedWord);
  }

  const updatedCache = writeOfflineVocabularyCache({
    words: updatedWords,
    dueWords: updatedDueWords,
    groups: cached.groups || [],
    userId: cleanUserId,
  });

  enqueueOfflineMutation({
    type: 'REVIEW_WORD',
    wordId: numericId,
    quality: qualityNum,
    nextReview: safeNextReview,
    reviewedAt: nowIso,
  }, cleanUserId);

  return {
    word: updatedWord,
    cached: updatedCache,
  };
}

export function applyOfflineLearned(wordId, isLearned, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  const numericId = Number(wordId);
  if (!Number.isFinite(numericId)) return null;

  const cached = readOfflineVocabularyCacheSync(cleanUserId) || {
    userId: cleanUserId,
    words: [],
    dueWords: [],
    groups: [],
  };

  const existingWord = (cached.words || []).find((w) => Number(w.id) === numericId);
  if (!existingWord) return null;

  const learnedVal = isLearned ? new Date().toISOString() : null;
  const updatedWord = {
    ...existingWord,
    learned_permanently_at: learnedVal,
  };

  const updatedWords = (cached.words || []).map((w) => (Number(w.id) === numericId ? updatedWord : w));
  const updatedDueWords = (cached.dueWords || []).filter((w) => (isLearned ? Number(w.id) !== numericId : true));

  const updatedCache = writeOfflineVocabularyCache({
    words: updatedWords,
    dueWords: updatedDueWords,
    groups: cached.groups || [],
    userId: cleanUserId,
  });

  enqueueOfflineMutation({
    type: 'LEARNED_WORD',
    wordId: numericId,
    learnedPermanently: Boolean(isLearned),
  }, cleanUserId);

  return {
    word: updatedWord,
    cached: updatedCache,
  };
}

export function applyOfflineFavorite(wordId, isFavorite, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  const numericId = Number(wordId);
  if (!Number.isFinite(numericId)) return null;

  const cached = readOfflineVocabularyCacheSync(cleanUserId) || {
    userId: cleanUserId,
    words: [],
    dueWords: [],
    groups: [],
  };

  const existingWord = (cached.words || []).find((w) => Number(w.id) === numericId);
  if (!existingWord) return null;

  const updatedWord = {
    ...existingWord,
    is_favorite: isFavorite ? 1 : 0,
  };

  const updatedWords = (cached.words || []).map((w) => (Number(w.id) === numericId ? updatedWord : w));
  const updatedDueWords = (cached.dueWords || []).map((w) => (Number(w.id) === numericId ? updatedWord : w));

  const updatedCache = writeOfflineVocabularyCache({
    words: updatedWords,
    dueWords: updatedDueWords,
    groups: cached.groups || [],
    userId: cleanUserId,
  });

  enqueueOfflineMutation({
    type: 'FAVORITE_WORD',
    wordId: numericId,
    isFavorite: Boolean(isFavorite),
  }, cleanUserId);

  return {
    word: updatedWord,
    cached: updatedCache,
  };
}

export function applyOfflineAddWord({ word, translation, example = '', groupIds = [] } = {}, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  if (!word || !translation) return null;

  const trimmedWord = String(word).trim();
  const trimmedTranslation = String(translation).trim();
  const trimmedExample = String(example || '').trim();
  if (!trimmedWord || !trimmedTranslation) return null;

  const cached = readOfflineVocabularyCacheSync(cleanUserId) || {
    userId: cleanUserId,
    words: [],
    dueWords: [],
    groups: [],
  };

  const localId = -Math.abs(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const nowIso = new Date().toISOString();
  const safeGroupIds = Array.isArray(groupIds) ? groupIds.map(Number).filter(Number.isFinite) : [];
  const entryGroups = safeGroupIds.map((gid) => {
    const found = (cached.groups || []).find((g) => g.id === gid);
    return found ? { id: found.id, name: found.name } : { id: gid, name: '' };
  });

  const newWord = {
    id: localId,
    user_id: cleanUserId,
    word: trimmedWord,
    normalized_word: trimmedWord.toLowerCase(),
    translation: trimmedTranslation,
    example: trimmedExample,
    level: 0,
    next_review: nowIso,
    review_count: 0,
    last_reviewed: null,
    is_favorite: 0,
    learned_permanently_at: null,
    created_at: nowIso,
    group_ids: safeGroupIds,
    groups: entryGroups,
    is_offline_pending: true,
  };

  const updatedWords = [newWord, ...(cached.words || [])];
  const updatedDueWords = [newWord, ...(cached.dueWords || [])];

  const updatedCache = writeOfflineVocabularyCache({
    words: updatedWords,
    dueWords: updatedDueWords,
    groups: cached.groups || [],
    userId: cleanUserId,
  });

  enqueueOfflineMutation({
    type: 'ADD_WORD',
    tempId: localId,
    payload: {
      word: trimmedWord,
      translation: trimmedTranslation,
      example: trimmedExample,
      groupIds: safeGroupIds,
    },
  }, cleanUserId);

  return {
    word: newWord,
    cached: updatedCache,
  };
}

export function applyOfflineDeleteWord(wordId, userId = 1) {
  const cleanUserId = Number(userId) || 1;
  const numericId = Number(wordId);
  if (!Number.isFinite(numericId)) return false;

  const cached = readOfflineVocabularyCacheSync(cleanUserId);
  if (!cached || !Array.isArray(cached.words)) {
    if (numericId > 0) {
      enqueueOfflineMutation({
        type: 'DELETE_WORD',
        wordId: numericId,
      }, cleanUserId);
    }
    return true;
  }

  const updatedWords = cached.words.filter((w) => Number(w.id) !== numericId);
  const updatedDueWords = (cached.dueWords || []).filter((w) => Number(w.id) !== numericId);

  writeOfflineVocabularyCache({
    words: updatedWords,
    dueWords: updatedDueWords,
    groups: cached.groups || [],
    userId: cleanUserId,
  });

  if (numericId < 0) {
    const list = getOfflineMutations(cleanUserId);
    const filtered = list.filter((m) => !(m.type === 'ADD_WORD' && m.tempId === numericId));
    safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${cleanUserId}`, JSON.stringify(filtered));
  } else {
    enqueueOfflineMutation({
      type: 'DELETE_WORD',
      wordId: numericId,
    }, cleanUserId);
  }

  return true;
}

export async function syncOfflineMutations(userId = 1, customFetch = fetch) {
  const cleanUserId = Number(userId) || 1;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const current = getOfflineMutations(cleanUserId);
    return { synced: 0, remaining: current.length };
  }

  const mutations = getOfflineMutations(cleanUserId);
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  let syncedCount = 0;

  for (const mutation of mutations) {
    try {
      if (mutation.type === 'REVIEW_WORD') {
        const res = await customFetch(`/english/api/vocabulary/${mutation.wordId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quality: mutation.quality,
            nextReview: mutation.nextReview,
          }),
        });

        if (res && (res.status === 200 || res.status === 404 || res.status === 409)) {
          removeOfflineMutation(mutation.id, cleanUserId);
          syncedCount++;
        } else {
          break;
        }
      } else if (mutation.type === 'LEARNED_WORD') {
        const res = await customFetch(`/english/api/vocabulary/${mutation.wordId}/learned-permanently`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ learnedPermanently: mutation.learnedPermanently }),
        });

        if (res && (res.status === 200 || res.status === 404)) {
          removeOfflineMutation(mutation.id, cleanUserId);
          syncedCount++;
        } else {
          break;
        }
      } else if (mutation.type === 'FAVORITE_WORD') {
        const res = await customFetch(`/english/api/vocabulary/${mutation.wordId}/favorite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isFavorite: mutation.isFavorite }),
        });

        if (res && (res.status === 200 || res.status === 404)) {
          removeOfflineMutation(mutation.id, cleanUserId);
          syncedCount++;
        } else {
          break;
        }
      } else if (mutation.type === 'ADD_WORD') {
        const res = await customFetch('/english/api/vocabulary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mutation.payload || {}),
        });

        if (res && (res.status === 201 || res.status === 200)) {
          const created = await res.json().catch(() => null);
          if (created && created.id) {
            const cached = readOfflineVocabularyCacheSync(cleanUserId);
            if (cached && Array.isArray(cached.words)) {
              const reconciledWords = cached.words.map((w) =>
                w.id === mutation.tempId ? { ...created, is_offline_pending: false } : w
              );
              writeOfflineVocabularyCache({
                ...cached,
                words: reconciledWords,
                userId: cleanUserId,
              });
            }
          }
          removeOfflineMutation(mutation.id, cleanUserId);
          syncedCount++;
        } else if (res && res.status === 400) {
          removeOfflineMutation(mutation.id, cleanUserId);
          syncedCount++;
        } else {
          break;
        }
      } else if (mutation.type === 'DELETE_WORD') {
        const res = await customFetch(`/english/api/vocabulary/${mutation.wordId}`, {
          method: 'DELETE',
        });

        if (res && (res.status === 200 || res.status === 404)) {
          removeOfflineMutation(mutation.id, cleanUserId);
          syncedCount++;
        } else {
          break;
        }
      }
    } catch {
      break;
    }
  }

  const remaining = getOfflineMutations(cleanUserId);
  return { synced: syncedCount, remaining: remaining.length };
}
