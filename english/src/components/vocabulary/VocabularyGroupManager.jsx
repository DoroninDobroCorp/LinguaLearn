import React from 'react';
import { Folder, Sparkles, X, FolderPlus, Tag, Edit2, Trash2 } from 'lucide-react';

export default function VocabularyGroupManager({
  groups = [],
  newGroupName,
  setNewGroupName,
  editingGroupId,
  setEditingGroupId,
  editingGroupName,
  setEditingGroupName,
  busy,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onClose,
  onOpenFrequencyModal
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-indigo-100 animate-fade-in space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Folder className="h-5 w-5 text-indigo-600" />
          Manage Word Groups
        </h3>
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
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Create new group input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="New group name (e.g., Colors, Travel, Verbs)"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreateGroup()}
          className="flex-1 px-4 py-2 border-2 border-slate-200 focus:border-indigo-500 rounded-xl text-sm outline-none"
        />
        <button
          type="button"
          onClick={onCreateGroup}
          disabled={busy || !newGroupName.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <FolderPlus className="h-4 w-4" />
          Create
        </button>
      </div>

      {/* Existing groups list */}
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
                    onClick={() => onUpdateGroup(group.id)}
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
                  onClick={() => onDeleteGroup(group)}
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
  );
}
