import React, { useState, useRef, useEffect } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import { ChevronDown, Plus, Trash2, UserCircle } from 'lucide-react';

function ProfileSelector() {
  const {
    profileId, profiles, activeProfile,
    switchProfile, createProfile, deleteProfile, avatarOptions,
  } = useProfile();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('👤');
  const [error, setError] = useState(null);
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
        setShowCreate(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSwitch = (id) => {
    if (id !== profileId) {
      switchProfile(id);
    }
    setOpen(false);
    setShowCreate(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const profile = await createProfile(newName.trim(), newEmoji);
      setNewName('');
      setNewEmoji('👤');
      setShowCreate(false);
      switchProfile(profile.id);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    if (!confirm(`Delete profile "${profile.name}"? All their data will be lost.`)) return;
    try {
      await deleteProfile(id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-pink-100 dark:hover:bg-gray-700 transition-all duration-200"
        aria-label="Switch profile"
      >
        <span className="text-lg">{activeProfile?.avatar_emoji || '👤'}</span>
        <span className="font-medium text-sm hidden sm:inline max-w-[100px] truncate">
          {activeProfile?.name || 'Profile'}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 z-[100] overflow-hidden animate-slide-up">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Profiles
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {profiles.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSwitch(p.id)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                  p.id === profileId
                    ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xl flex-shrink-0">{p.avatar_emoji}</span>
                  <span className={`font-medium truncate ${
                    p.id === profileId
                      ? 'text-fuchsia-700 dark:text-fuchsia-300'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}>
                    {p.name}
                  </span>
                  {p.id === profileId && (
                    <span className="text-xs bg-fuchsia-200 dark:bg-fuchsia-800 text-fuchsia-700 dark:text-fuchsia-200 px-2 py-0.5 rounded-full flex-shrink-0">
                      active
                    </span>
                  )}
                </div>
                {p.id !== 1 && (
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {!showCreate ? (
            <div className="border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center space-x-2 w-full px-4 py-3 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="font-medium text-sm">Add Profile</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="border-t border-gray-100 dark:border-slate-700 p-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name..."
                maxLength={30}
                autoFocus
                className="w-full px-3 py-2 text-sm border-2 border-fuchsia-300 dark:border-fuchsia-600 rounded-lg focus:outline-none focus:border-fuchsia-500 bg-white dark:bg-slate-700 dark:text-gray-100"
              />
              <div className="flex flex-wrap gap-2">
                {avatarOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewEmoji(emoji)}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                      newEmoji === emoji
                        ? 'bg-fuchsia-200 dark:bg-fuchsia-700 ring-2 ring-fuchsia-400 scale-110'
                        : 'bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex space-x-2">
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="flex-1 px-3 py-2 text-sm font-semibold bg-gradient-to-r from-fuchsia-400 to-purple-400 text-fuchsia-900 rounded-lg hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError(null); }}
                  className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfileSelector;
