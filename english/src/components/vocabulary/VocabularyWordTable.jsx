import React from 'react';
import { Tag, Check, Plus, Star, Undo2, Trash2 } from 'lucide-react';

export default function VocabularyWordTable({
  words = [],
  activeWords = [],
  learnedWords = [],
  visibleWords = [],
  groups = [],
  filter,
  setFilter,
  sortBy,
  setSortBy,
  selectedGroupFilterIds = [],
  setSelectedGroupFilterIds,
  mastered,
  activeGroupMenuWordId,
  setActiveGroupMenuWordId,
  pendingFavoriteIds = new Set(),
  pendingLearnedIds = new Set(),
  busy,
  onToggleWordGroup,
  onToggleFavorite,
  onSetLearnedForever,
  onDeleteWord
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100 space-y-4">
      {/* Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            ['active', `Active (${activeWords.length})`],
            ['favorites', `Favorites (${words.filter((w) => w.is_favorite).length})`],
            ['learned', `Learned (${learnedWords.length})`],
            ['all', `All (${words.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none"
          >
            <option value="newest">✨ Сначала новые</option>
            <option value="word_asc">🔤 Английский (A–Z)</option>
            <option value="translation_asc">🇷🇺 Перевод (А–Я)</option>
          </select>
        </div>
      </div>

      {/* Multi-group filter row for entries list */}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mr-1">
            <Tag className="h-3.5 w-3.5 text-indigo-600" />
            <span>Filter groups:</span>
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
            All ({words.length})
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
              Clear ({selectedGroupFilterIds.length} sel.)
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">{mastered} active words have reached SRS level 5.</p>

      {/* Word rows */}
      <div className="space-y-2 max-h-[36rem] overflow-y-auto pr-1">
        {visibleWords.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8 italic">No words match the selected filters.</p>
        ) : (
          visibleWords.map((word) => (
            <div
              key={word.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50/80 hover:bg-slate-100/80 border border-slate-100 rounded-xl transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-900 text-lg">{word.word}</p>
                  {word.is_favorite && <Star className="h-4 w-4 fill-amber-500 text-amber-500" />}
                  {word.learned_permanently_at && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Learned forever
                    </span>
                  )}
                </div>
                <p className="text-gray-700 text-sm font-medium">{word.translation}</p>
                {word.example && <p className="text-xs text-slate-500 italic">“{word.example}”</p>}

                {/* Group tags */}
                {(word.groups || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(word.groups || []).map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100/70 text-indigo-800 border border-indigo-200/50"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-center relative">
                {/* Group quick toggle button */}
                {groups.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveGroupMenuWordId(activeGroupMenuWordId === word.id ? null : word.id)}
                      title="Manage groups for this word"
                      className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      <Tag className="h-4 w-4" />
                    </button>
                    {activeGroupMenuWordId === word.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-20 space-y-1">
                        <p className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">Groups:</p>
                        {groups.map((group) => {
                          const isAttached = (word.groups || []).some((g) => g.id === group.id);
                          return (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => onToggleWordGroup(word, group.id)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
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

                {/* Favorite button */}
                <button
                  type="button"
                  onClick={() => onToggleFavorite(word)}
                  disabled={pendingFavoriteIds.has(Number(word.id))}
                  title={word.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                    word.is_favorite ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                  }`}
                >
                  <Star className={`h-4 w-4 ${word.is_favorite ? 'fill-current' : ''}`} />
                </button>

                {/* Learned Forever toggle */}
                {word.learned_permanently_at ? (
                  <button
                    type="button"
                    onClick={() => onSetLearnedForever(word, false)}
                    disabled={pendingLearnedIds.has(Number(word.id))}
                    title="Restore to study"
                    className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetLearnedForever(word, true)}
                    disabled={pendingLearnedIds.has(Number(word.id))}
                    title="Mark learned forever"
                    className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => onDeleteWord(word)}
                  disabled={busy}
                  title="Delete word"
                  className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
