import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  readOfflineVocabularyCacheSync,
  writeOfflineVocabularyCache,
  applyOfflineAddWord,
  applyOfflineDeleteWord,
  getOfflineMutations,
  removeOfflineMutation,
  clearOfflineMutations,
  syncOfflineMutations,
  resetMemoryCacheForTesting,
} from '../src/utils/offlineVocabularyCache.js';

// Setup mock localStorage
const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

describe('Offline vocabulary mutations & persistence', () => {
  beforeEach(() => {
    store.clear();
    if (typeof resetMemoryCacheForTesting === 'function') {
      resetMemoryCacheForTesting();
    }
  });

  it('adds a word offline, persisting it in cache and enqueueing a mutation', () => {
    const profileId = 8;
    writeOfflineVocabularyCache({
      entries: [
        { id: 100, word: 'hola', translation: 'привет', cards: [], card_summary: { total_cards: 0, due_cards: 0 } }
      ],
      stats: { total_words: 1, unlearned_words: 1, due_cards: 0, total_cards: 0 },
      groups: [{ id: 61, name: 'Почти выучил' }],
      profileId,
    });

    const res = applyOfflineAddWord({
      word: 'mochila',
      translation: 'рюкзак',
      example: 'Mi mochila',
      groupIds: [61]
    }, profileId);

    assert.ok(res, 'Returns result object');
    assert.ok(res.entry, 'Contains created entry');
    assert.equal(res.entry.word, 'mochila');
    assert.equal(res.entry.translation, 'рюкзак');
    assert.ok(res.entry.id < 0, 'Generates negative local ID');
    assert.equal(res.entry.group_ids[0], 61);
    assert.equal(res.entry.groups[0].name, 'Почти выучил');
    assert.equal(res.entry.cards.length, 2, 'Generates 2 review cards');
    assert.equal(res.entry.is_offline_pending, true);

    const cached = readOfflineVocabularyCacheSync(profileId);
    assert.equal(cached.entries.length, 2);
    assert.equal(cached.entries[0].word, 'mochila');
    assert.equal(cached.stats.total_words, 2);

    const mutations = getOfflineMutations(profileId);
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].type, 'ADD_WORD');
    assert.equal(mutations[0].tempId, res.entry.id);
    assert.equal(mutations[0].payload.word, 'mochila');
  });

  it('deletes an existing server word offline, removing from cache and enqueueing DELETE_WORD mutation', () => {
    const profileId = 8;
    writeOfflineVocabularyCache({
      entries: [
        { id: 2505, word: 'mochila', translation: 'рюкзак', card_summary: { total_cards: 2, due_cards: 2 } },
        { id: 3132, word: 'peligro', translation: 'опасность', card_summary: { total_cards: 2, due_cards: 2 } }
      ],
      stats: { total_words: 2, unlearned_words: 2, due_cards: 4, total_cards: 4 },
      groups: [],
      profileId,
    });

    const success = applyOfflineDeleteWord(2505, profileId);
    assert.equal(success, true);

    const cached = readOfflineVocabularyCacheSync(profileId);
    assert.equal(cached.entries.length, 1);
    assert.equal(cached.entries[0].id, 3132);
    assert.equal(cached.stats.total_words, 1);

    const mutations = getOfflineMutations(profileId);
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].type, 'DELETE_WORD');
    assert.equal(mutations[0].wordId, 2505);
  });

  it('deleting an offline-added word cancels the pending add mutation without server delete', () => {
    const profileId = 8;
    writeOfflineVocabularyCache({
      entries: [],
      stats: { total_words: 0 },
      groups: [],
      profileId,
    });

    const addRes = applyOfflineAddWord({
      word: 'perigo',
      translation: 'опасность',
    }, profileId);

    const tempId = addRes.entry.id;
    assert.equal(getOfflineMutations(profileId).length, 1);

    applyOfflineDeleteWord(tempId, profileId);

    const cached = readOfflineVocabularyCacheSync(profileId);
    assert.equal(cached.entries.length, 0);

    const mutations = getOfflineMutations(profileId);
    assert.equal(mutations.length, 0);
  });

  it('syncOfflineMutations processes pending additions and deletions', async () => {
    const profileId = 8;
    writeOfflineVocabularyCache({
      entries: [
        { id: -999, word: 'mochila', translation: 'рюкзак' },
        { id: 4000, word: 'viejo', translation: 'старый' },
      ],
      stats: { total_words: 2 },
      profileId,
    });

    store.set('spanishOfflineMutations:v1:profile:' + profileId, JSON.stringify([
      {
        id: 'mut_add_1',
        type: 'ADD_WORD',
        tempId: -999,
        payload: { word: 'mochila', translation: 'рюкзак' }
      },
      {
        id: 'mut_del_1',
        type: 'DELETE_WORD',
        wordId: 4000,
      }
    ]));

    const mockFetch = async (url, options) => {
      const urlStr = String(url);
      if (options?.method === 'POST' && urlStr.includes('/api/vocabulary')) {
        return new Response(JSON.stringify({
          id: 5555,
          word: 'mochila',
          translation: 'рюкзак',
          profile_id: profileId,
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (options?.method === 'DELETE' && urlStr.includes('/api/vocabulary/4000')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const syncResult = await syncOfflineMutations(profileId, mockFetch);
    assert.equal(syncResult.synced, 2);
    assert.equal(syncResult.remaining, 0);

    assert.equal(getOfflineMutations(profileId).length, 0);

    const cached = readOfflineVocabularyCacheSync(profileId);
    const reconciled = cached.entries.find(e => e.word === 'mochila');
    assert.ok(reconciled);
    assert.equal(reconciled.id, 5555);
    assert.equal(reconciled.is_offline_pending, false);
  });
});
