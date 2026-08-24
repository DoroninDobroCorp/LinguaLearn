import React from 'react';
import { BookMarked, Sparkles, Folder, Plus } from 'lucide-react';

export default function VocabularyStatsHeader({
  words = [],
  activeWords = [],
  dueWords = [],
  learnedWords = [],
  groups = [],
  onOpenFrequencyModal,
  onToggleGroupManager,
  onToggleAddForm
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-3xl font-bold text-gray-800 flex items-center">
          <BookMarked className="h-8 w-8 mr-3 text-indigo-600" />
          Vocabulary Practice
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFrequencyModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors shadow-sm"
            title="Сгенерировать колоды частотных слов CEFR по 25 слов"
          >
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span>Частотные колоды</span>
          </button>
          <button
            type="button"
            onClick={onToggleGroupManager}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
          >
            <Folder className="h-4 w-4" />
            Manage Groups ({groups.length})
          </button>
          <button
            type="button"
            onClick={onToggleAddForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold shadow hover:opacity-95 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add Word
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ['Total', words.length],
          ['Active', activeWords.length],
          ['Due', dueWords.length],
          ['Favorites', words.filter((w) => w.is_favorite).length],
          ['Learned', learnedWords.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-3">
            <p className="text-xs font-semibold text-indigo-700">{label}</p>
            <p className="text-2xl font-bold text-indigo-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
