import React from 'react';
import { Plus, X, Tag, Check } from 'lucide-react';

export default function AddWordModal({
  newWord,
  setNewWord,
  groups = [],
  busy,
  onAddWord,
  onClose
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-indigo-100 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Plus className="h-5 w-5 text-indigo-600" />
          Add New Word
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <input
          placeholder="English word (e.g. apple)"
          value={newWord.word}
          onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
          className="w-full px-4 py-3 border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none"
        />
        <input
          placeholder="Translation (e.g. яблоко)"
          value={newWord.translation}
          onChange={(e) => setNewWord({ ...newWord, translation: e.target.value })}
          className="w-full px-4 py-3 border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none"
        />
        <textarea
          placeholder="Example sentence (optional)"
          value={newWord.example}
          onChange={(e) => setNewWord({ ...newWord, example: e.target.value })}
          className="w-full px-4 py-2 border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none"
          rows={2}
        />

        {groups.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Assign to groups (optional):</p>
            <div className="flex flex-wrap gap-2">
              {groups.map((group) => {
                const isSelected = (newWord.groupIds || []).includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      const current = newWord.groupIds || [];
                      const next = isSelected ? current.filter((id) => id !== group.id) : [...current, group.id];
                      setNewWord({ ...newWord, groupIds: next });
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <Tag className="h-3 w-3" />
                    {group.name}
                    {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onAddWord}
          disabled={busy || !newWord.word.trim() || !newWord.translation.trim()}
          className="w-full rounded-xl bg-green-600 hover:bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50 transition-colors shadow"
        >
          Add Word
        </button>
      </div>
    </div>
  );
}
