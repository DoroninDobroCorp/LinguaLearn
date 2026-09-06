import { getActiveProfileId, profileApiUrl, profileFetch } from './api.js';

const DB_NAME = 'lingua_spanish_offline_db';
const DB_VERSION = 2;
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
  profileId: null,
  data: null,
};

export function resetMemoryCacheForTesting() {
  memoryCache = { profileId: null, data: null };
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
        db.createObjectStore(STORE_VOCABULARY, { keyPath: 'profileId' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readOfflineVocabularyCacheSync(profileId = getActiveProfileId()) {
  if (memoryCache.profileId === profileId && memoryCache.data) {
    return memoryCache.data;
  }

  // Check localStorage as fast fallback for small profiles
  try {
    const raw = safeGetItem(`spanishOfflineVocabulary:v1:profile:${profileId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) {
        memoryCache = { profileId, data: parsed };
        return parsed;
      }
    }
  } catch {}

  return null;
}

export const readOfflineVocabularyCache = readOfflineVocabularyCacheSync;

export async function readOfflineVocabularyCacheAsync(profileId = getActiveProfileId()) {
  // 1. Check memory cache first
  if (memoryCache.profileId === profileId && memoryCache.data) {
    return memoryCache.data;
  }

  // 2. Check IndexedDB
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_VOCABULARY, 'readonly');
      const store = tx.objectStore(STORE_VOCABULARY);
      const req = store.get(profileId);

      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.entries)) {
          memoryCache = { profileId, data: req.result };
          resolve(req.result);
        } else {
          // Fallback to sync/localStorage
          resolve(readOfflineVocabularyCacheSync(profileId));
        }
      };

      req.onerror = () => {
        resolve(readOfflineVocabularyCacheSync(profileId));
      };
    });
  } catch {
    return readOfflineVocabularyCacheSync(profileId);
  }
}

export function writeOfflineVocabularyCache({
  entries = [],
  stats = null,
  queueStats = null,
  groups = [],
  profileId = getActiveProfileId(),
} = {}) {
  const payload = {
    profileId,
    entries,
    stats,
    queueStats,
    groups,
    cachedAt: new Date().toISOString(),
  };

  // 1. Always update fast memory cache
  memoryCache = { profileId, data: payload };

  // 2. Persist to native IndexedDB (hundreds of MBs capacity on iOS/Safari)
  openDatabase()
    .then((db) => {
      const tx = db.transaction(STORE_VOCABULARY, 'readwrite');
      const store = tx.objectStore(STORE_VOCABULARY);
      store.put(payload);
    })
    .catch((err) => {
      // IndexedDB might not be available or permitted
    });

  // 3. Attempt localStorage write (will gracefully be ignored if exceeds 5MB limit)
  try {
    safeSetItem(`spanishOfflineVocabulary:v1:profile:${profileId}`, JSON.stringify(payload));
  } catch {}

  return payload;
}

export async function saveOfflineStudySession(mode, session, currentCard, profileId = getActiveProfileId()) {
  if (!mode) return;
  const id = `session_${profileId}_${mode}`;
  const record = {
    id,
    profileId,
    mode,
    session,
    currentCard,
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(record);
  } catch (err) {
    try {
      safeSetItem(`lingua_offline_session_${id}`, JSON.stringify(record));
    } catch {}
  }
}

export async function loadOfflineStudySession(mode, profileId = getActiveProfileId()) {
  if (!mode) return null;
  const id = `session_${profileId}_${mode}`;

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
      const raw = safeGetItem(`lingua_offline_session_${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export function formatOfflineCacheTime(value) {
  if (!value) {
    return 'недавнего времени';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'недавнего времени';
  }

  return date.toLocaleString();
}

/* =========================================================================
 * OFFLINE MUTATIONS & OFFLINE-FIRST OPERATIONS (Add, Delete, Sync)
 * ========================================================================= */

const MUTATION_STORAGE_KEY_PREFIX = 'spanishOfflineMutations:v1:profile:';

export function getOfflineMutations(profileId = getActiveProfileId()) {
  try {
    const raw = safeGetItem(`${MUTATION_STORAGE_KEY_PREFIX}${profileId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function enqueueOfflineMutation(mutation, profileId = getActiveProfileId()) {
  try {
    const list = getOfflineMutations(profileId);

    // If deleting a word that was created offline and has not yet synced to server,
    // just cancel the ADD_WORD mutation!
    if (mutation.type === 'DELETE_WORD' && Number(mutation.wordId) < 0) {
      const filtered = list.filter(m => !(m.type === 'ADD_WORD' && m.tempId === Number(mutation.wordId)));
      safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${profileId}`, JSON.stringify(filtered));
      return filtered;
    }

    const record = {
      id: mutation.id || `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      profileId,
      ...mutation,
    };
    list.push(record);
    safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${profileId}`, JSON.stringify(list));
    return list;
  } catch (err) {
    console.warn('[OfflineCache] Failed to enqueue mutation:', err);
    return [];
  }
}

export function removeOfflineMutation(mutationId, profileId = getActiveProfileId()) {
  try {
    const list = getOfflineMutations(profileId);
    const filtered = list.filter(m => m.id !== mutationId);
    safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${profileId}`, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}

export function clearOfflineMutations(profileId = getActiveProfileId()) {
  try {
    safeRemoveItem(`${MUTATION_STORAGE_KEY_PREFIX}${profileId}`);
  } catch {}
}

export function applyOfflineAddWord({ word, translation, example = '', groupIds = [] } = {}, profileId = getActiveProfileId()) {
  if (!word || !translation) return null;

  const trimmedWord = String(word).trim();
  const trimmedTranslation = String(translation).trim();
  const trimmedExample = String(example || '').trim();
  if (!trimmedWord || !trimmedTranslation) return null;

  const cached = readOfflineVocabularyCacheSync(profileId) || {
    profileId,
    entries: [],
    stats: {
      total_words: 0,
      learned_words: 0,
      review_words: 0,
      learning_words: 0,
      unlearned_words: 0,
      due_cards: 0,
      total_cards: 0,
    },
    queueStats: { total_due: 0, returned: 0, limit: 40 },
    groups: [],
    cachedAt: new Date().toISOString(),
  };

  // Generate unique negative integer ID so Number(entry.id) is valid and won't conflict with server SQLite IDs
  const localId = -Math.abs(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const card1Id = localId * 10 - 1;
  const card2Id = localId * 10 - 2;

  const nowIso = new Date().toISOString();
  const safeGroupIds = Array.isArray(groupIds) ? groupIds.map(Number).filter(Number.isFinite) : [];
  const entryGroups = safeGroupIds.map((gid) => {
    const found = (cached.groups || []).find((g) => g.id === gid);
    return found ? { id: found.id, name: found.name } : { id: gid, name: '' };
  });

  const newEntry = {
    id: localId,
    profile_id: profileId,
    word: trimmedWord,
    translation: trimmedTranslation,
    example: trimmedExample,
    is_favorite: false,
    learned_permanently_at: null,
    created_at: nowIso,
    group_ids: safeGroupIds,
    groups: entryGroups,
    is_offline_pending: true,
    cards: [
      {
        id: card1Id,
        vocabulary_id: localId,
        profile_id: profileId,
        direction: 'source_to_target',
        direction_label: 'Spanish → Translation',
        prompt_label: 'Spanish',
        answer_label: 'Translation',
        prompt: trimmedWord,
        answer: trimmedTranslation,
        is_reviewable: true,
        word: trimmedWord,
        translation: trimmedTranslation,
        example: trimmedExample,
        state: 'new',
        status: 'new',
        is_due: true,
        review_count: 0,
        lapse_count: 0,
        interval_days: 0,
        ease_factor: 2.5,
        next_review_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: card2Id,
        vocabulary_id: localId,
        profile_id: profileId,
        direction: 'target_to_source',
        direction_label: 'Translation → Spanish',
        prompt_label: 'Translation',
        answer_label: 'Spanish',
        prompt: trimmedTranslation,
        answer: trimmedWord,
        is_reviewable: true,
        word: trimmedWord,
        translation: trimmedTranslation,
        example: trimmedExample,
        state: 'new',
        status: 'new',
        is_due: true,
        review_count: 0,
        lapse_count: 0,
        interval_days: 0,
        ease_factor: 2.5,
        next_review_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    card_summary: {
      total_cards: 2,
      reviewable_cards: 2,
      unreviewable_cards: 0,
      due_cards: 2,
      learned_cards: 0,
      learning_cards: 0,
      new_cards: 2,
      review_cards: 0,
      snoozed_cards: 0,
      total_reviews: 0,
      next_due_at: nowIso,
    },
  };

  const updatedEntries = [newEntry, ...(cached.entries || [])];
  const updatedStats = {
    ...(cached.stats || {}),
    total_words: ((cached.stats?.total_words) || 0) + 1,
    unlearned_words: ((cached.stats?.unlearned_words) || 0) + 1,
    due_cards: ((cached.stats?.due_cards) || 0) + 2,
    total_cards: ((cached.stats?.total_cards) || 0) + 2,
  };

  const updatedCache = writeOfflineVocabularyCache({
    entries: updatedEntries,
    stats: updatedStats,
    queueStats: cached.queueStats,
    groups: cached.groups,
    profileId,
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
  }, profileId);

  return {
    entry: newEntry,
    cached: updatedCache,
  };
}

export function applyOfflineDeleteWord(wordId, profileId = getActiveProfileId()) {
  const numericId = Number(wordId);
  if (!Number.isFinite(numericId)) return false;

  const cached = readOfflineVocabularyCacheSync(profileId);
  if (!cached || !Array.isArray(cached.entries)) {
    if (numericId > 0) {
      enqueueOfflineMutation({
        type: 'DELETE_WORD',
        wordId: numericId,
      }, profileId);
    }
    return true;
  }

  const existingEntry = cached.entries.find((e) => Number(e.id) === numericId);
  const updatedEntries = cached.entries.filter((e) => Number(e.id) !== numericId);

  let updatedStats = cached.stats;
  if (existingEntry && cached.stats) {
    const totalWords = Math.max(0, (cached.stats.total_words || 1) - 1);
    const unlearned = existingEntry.card_summary?.learned_cards > 0
      ? (cached.stats.unlearned_words || 0)
      : Math.max(0, (cached.stats.unlearned_words || 1) - 1);
    const learned = existingEntry.card_summary?.learned_cards > 0
      ? Math.max(0, (cached.stats.learned_words || 1) - 1)
      : (cached.stats.learned_words || 0);
    const dueCards = Math.max(0, (cached.stats.due_cards || 0) - (existingEntry.card_summary?.due_cards || 0));
    const totalCards = Math.max(0, (cached.stats.total_cards || 0) - (existingEntry.card_summary?.total_cards || 0));

    updatedStats = {
      ...cached.stats,
      total_words: totalWords,
      unlearned_words: unlearned,
      learned_words: learned,
      due_cards: dueCards,
      total_cards: totalCards,
    };
  }

  writeOfflineVocabularyCache({
    entries: updatedEntries,
    stats: updatedStats,
    queueStats: cached.queueStats,
    groups: cached.groups,
    profileId,
  });

  if (numericId < 0) {
    // If it was an unsynced offline added word, remove it from the add queue
    const list = getOfflineMutations(profileId);
    const filtered = list.filter((m) => !(m.type === 'ADD_WORD' && m.tempId === numericId));
    safeSetItem(`${MUTATION_STORAGE_KEY_PREFIX}${profileId}`, JSON.stringify(filtered));
  } else {
    enqueueOfflineMutation({
      type: 'DELETE_WORD',
      wordId: numericId,
    }, profileId);
  }

  return true;
}

export async function syncOfflineMutations(profileId = getActiveProfileId(), customFetch = profileFetch) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const current = getOfflineMutations(profileId);
    return { synced: 0, remaining: current.length };
  }

  const mutations = getOfflineMutations(profileId);
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  let syncedCount = 0;

  for (const mutation of mutations) {
    try {
      if (mutation.type === 'ADD_WORD') {
        const res = await customFetch(profileApiUrl('/spanish/api/vocabulary'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mutation.payload || {}),
        });

        if (res && (res.status === 201 || res.status === 200)) {
          const created = await res.json().catch(() => null);
          if (created && created.id) {
            const cached = readOfflineVocabularyCacheSync(profileId);
            if (cached && Array.isArray(cached.entries)) {
              const reconciledEntries = cached.entries.map((e) =>
                e.id === mutation.tempId ? { ...created, is_offline_pending: false } : e
              );
              writeOfflineVocabularyCache({
                ...cached,
                entries: reconciledEntries,
                profileId,
              });
            }
          }
          removeOfflineMutation(mutation.id, profileId);
          syncedCount++;
        } else if (res && res.status === 400) {
          // Word already exists on server, remove redundant mutation
          removeOfflineMutation(mutation.id, profileId);
          syncedCount++;
        } else {
          // Network interruption or 5xx, halt sync to preserve remaining mutations
          break;
        }
      } else if (mutation.type === 'DELETE_WORD') {
        const res = await customFetch(profileApiUrl(`/spanish/api/vocabulary/${mutation.wordId}`), {
          method: 'DELETE',
        });

        if (res && (res.status === 200 || res.status === 404)) {
          removeOfflineMutation(mutation.id, profileId);
          syncedCount++;
        } else {
          break;
        }
      }
    } catch (netErr) {
      // Offline / network failure during sync loop
      break;
    }
  }

  const remaining = getOfflineMutations(profileId);
  return { synced: syncedCount, remaining: remaining.length };
}
