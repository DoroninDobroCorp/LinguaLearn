import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, Lock, Plus, Trash2, X } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';
import { hasProfilePinToken } from '../utils/api';
import { getProfileSwitchAction, getProfileSwitchErrorMessage } from '../utils/profileSelection';

function emptyPinForm() {
  return {
    currentPin: '',
    newPin: '',
  };
}

function ProfileSelector() {
  const {
    profileId,
    profiles,
    activeProfile,
    switchProfile,
    createProfile,
    unlockProfile,
    updateProfilePin,
    clearPin,
    deleteProfile,
    avatarOptions,
  } = useProfile();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('👤');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pinDialog, setPinDialog] = useState(null);
  const [pinForm, setPinForm] = useState(emptyPinForm);
  const [isPinSubmitting, setIsPinSubmitting] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
        setShowCreate(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const resetPinDialog = () => {
    setPinDialog(null);
    setPinForm(emptyPinForm());
    setIsPinSubmitting(false);
  };

  const openPinDialog = (mode, profile, options = {}) => {
    setError('');
    setMessage('');
    setPinForm(emptyPinForm());
    setPinDialog({
      mode,
      profile,
      shouldSwitch: Boolean(options.shouldSwitch),
    });
  };

  const handleSwitch = async (profile) => {
    setError('');
    setMessage('');

    const action = getProfileSwitchAction(profile, profileId, hasProfilePinToken);
    if (action.type === 'none') {
      setOpen(false);
      setShowCreate(false);
      return;
    }

    if (action.type === 'unlock') {
      openPinDialog('unlock-profile', profile, { shouldSwitch: action.shouldSwitch });
      return;
    }

    try {
      await switchProfile(profile.id);
      setOpen(false);
      setShowCreate(false);
    } catch (err) {
      if (err?.code === 'PROFILE_LOCKED') {
        openPinDialog('unlock-profile', profile, { shouldSwitch: profile.id !== profileId });
        return;
      }

      setError(getProfileSwitchErrorMessage(err));
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newName.trim()) return;

    setError('');
    setMessage('');

    try {
      const profile = await createProfile(newName.trim(), newEmoji);
      setNewName('');
      setNewEmoji('👤');
      setShowCreate(false);
      await switchProfile(profile.id);
      setOpen(false);
      setMessage(`Created profile "${profile.name}".`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (profile, event) => {
    event.stopPropagation();
    if (!profile) return;

    setError('');
    setMessage('');

    if (profile.is_locked) {
      openPinDialog('delete-locked', profile);
      return;
    }

    if (!window.confirm(`Delete profile "${profile.name}"? All their data will be lost.`)) {
      return;
    }

    try {
      await deleteProfile(profile.id);
      setMessage(`Deleted profile "${profile.name}".`);
    } catch (err) {
      setError(err.message);
    }
  };

  const submitPinDialog = async (event, action = 'submit') => {
    event.preventDefault();
    if (!pinDialog?.profile) return;

    setIsPinSubmitting(true);
    setError('');
    setMessage('');

    try {
      if (pinDialog.mode === 'unlock-profile') {
        await unlockProfile(pinDialog.profile.id, pinForm.currentPin);
        if (pinDialog.shouldSwitch) {
          await switchProfile(pinDialog.profile.id);
        }
        setOpen(false);
        setShowCreate(false);
        setMessage(
          pinDialog.shouldSwitch
            ? `Unlocked "${pinDialog.profile.name}".`
            : `Unlocked "${pinDialog.profile.name}" for this session.`,
        );
        resetPinDialog();
        return;
      }

      if (pinDialog.mode === 'delete-locked') {
        await deleteProfile(pinDialog.profile.id, pinForm.currentPin);
        setMessage(`Deleted profile "${pinDialog.profile.name}".`);
        resetPinDialog();
        return;
      }

      if (pinDialog.mode === 'manage-pin') {
        if (pinDialog.profile.is_locked && action === 'clear') {
          await clearPin(pinDialog.profile.id, pinForm.currentPin);
          setMessage(`Cleared the PIN for "${pinDialog.profile.name}".`);
        } else {
          await updateProfilePin(pinDialog.profile.id, pinForm.newPin, pinForm.currentPin);
          setMessage(
            `${pinDialog.profile.is_locked ? 'Updated' : 'Added'} a PIN for "${pinDialog.profile.name}".`,
          );
        }
        resetPinDialog();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPinSubmitting(false);
    }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-purple-50/90 dark:bg-slate-800/90 hover:bg-pink-100 dark:hover:bg-slate-700 border border-purple-200 dark:border-slate-700 transition-all text-xs font-bold shadow-xs active:scale-95"
          aria-label="Сменить профиль"
        >
          <span className="text-base leading-none">{activeProfile?.avatar_emoji || '👤'}</span>
          <span className="max-w-[70px] sm:max-w-[110px] truncate text-gray-800 dark:text-gray-100 font-bold">
            {activeProfile?.name || 'Profile'}
          </span>
          {activeProfile?.is_locked && <Lock className="h-3 w-3 text-fuchsia-500 flex-shrink-0" />}
          <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        </button>

        {open && (
          <>
            {/* Mobile Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 z-[99] sm:hidden backdrop-blur-xs transition-opacity"
              onClick={() => { setOpen(false); setShowCreate(false); }}
            />

            {/* Mobile Bottom Sheet (< sm) */}
            <div className="fixed inset-x-0 bottom-0 z-[100] sm:hidden bg-white dark:bg-slate-800 rounded-t-3xl shadow-2xl border-t-2 border-fuchsia-300 dark:border-slate-700 max-h-[85vh] flex flex-col animate-slide-up pb-safe">
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto my-3 flex-shrink-0" />
              
              <div className="px-5 pb-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>👥</span> Профили обучения
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Текущий: <strong className="text-fuchsia-600 dark:text-fuchsia-400 font-bold">{activeProfile?.name}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setShowCreate(false); }}
                  className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(error || message) && (
                <div className={`px-4 py-2.5 text-xs border-b flex-shrink-0 ${
                  error
                    ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/30 dark:text-red-200 dark:border-red-900/40'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/40'
                }`}>
                  {error || message}
                </div>
              )}

              <div className="overflow-y-auto px-4 py-3 space-y-2 flex-1 min-h-0">
                {profiles.map((profile) => {
                  const isActive = profile.id === profileId;
                  return (
                    <div
                      key={profile.id}
                      onClick={() => handleSwitch(profile)}
                      className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-fuchsia-50/90 dark:bg-fuchsia-950/40 border-fuchsia-300 dark:border-fuchsia-700 shadow-xs'
                          : 'bg-gray-50/80 dark:bg-slate-700/40 border-gray-200 dark:border-slate-700 hover:bg-gray-100 active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <span className="text-2xl w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-xs border border-gray-100 dark:border-slate-600 flex-shrink-0">
                          {profile.avatar_emoji}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-base font-extrabold truncate ${
                              isActive ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-gray-800 dark:text-gray-100'
                            }`}>
                              {profile.name}
                            </span>
                            {isActive && (
                              <span className="text-[10px] bg-fuchsia-200 dark:bg-fuchsia-800 text-fuchsia-800 dark:text-fuchsia-200 px-2 py-0.5 rounded-full font-black flex-shrink-0">
                                ✓ Активен
                              </span>
                            )}
                            {profile.is_locked && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200 px-2 py-0.5 rounded-full font-bold">
                                <Lock className="h-2.5 w-2.5" /> PIN
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {profile.id !== 1 && (
                        <button
                          type="button"
                          onClick={(event) => handleDelete(profile, event)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors flex-shrink-0 ml-2"
                          aria-label={`Delete ${profile.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3 space-y-2 flex-shrink-0 bg-gray-50/50 dark:bg-slate-800/50">
                {activeProfile && (
                  <div className="flex gap-2">
                    {activeProfile.is_locked && (
                      <button
                        type="button"
                        onClick={() => openPinDialog('unlock-profile', activeProfile)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl bg-fuchsia-500 text-white hover:bg-fuchsia-600 transition-colors shadow-xs"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>Разблокировать</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openPinDialog('manage-pin', activeProfile)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-gray-200 dark:border-slate-600"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>{activeProfile.is_locked ? 'Сменить PIN' : 'Установить PIN'}</span>
                    </button>
                  </div>
                )}

                {!showCreate ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="flex items-center justify-center space-x-2 w-full py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm rounded-xl shadow-md active:scale-95 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Создать новый профиль</span>
                  </button>
                ) : (
                  <form onSubmit={handleCreate} className="space-y-3 pt-1">
                    <input
                      type="text"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Имя профиля..."
                      maxLength={30}
                      autoFocus
                      className="w-full px-3.5 py-2.5 text-base border-2 border-fuchsia-300 dark:border-fuchsia-600 rounded-xl focus:outline-none focus:border-fuchsia-500 bg-white dark:bg-slate-700 dark:text-gray-100"
                    />
                    <div className="flex flex-wrap gap-2">
                      {avatarOptions.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setNewEmoji(emoji)}
                          className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                            newEmoji === emoji
                              ? 'bg-fuchsia-200 dark:bg-fuchsia-700 ring-2 ring-fuchsia-400 scale-105'
                              : 'bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        type="submit"
                        disabled={!newName.trim()}
                        className="flex-1 py-2.5 text-sm font-bold bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl hover:from-fuchsia-600 hover:to-purple-700 disabled:opacity-50 transition-all"
                      >
                        Создать
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Desktop Dropdown (>= sm) */}
            <div className="hidden sm:block absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-fuchsia-200 dark:border-slate-700 z-[100] overflow-hidden animate-slide-up">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Profiles
                </p>
              </div>

              {(error || message) && (
                <div className={`px-4 py-3 text-xs border-b ${
                  error
                    ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/30 dark:text-red-200 dark:border-red-900/40'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/40'
                }`}>
                  {error || message}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    onClick={() => handleSwitch(profile)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                      profile.id === profileId
                        ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="text-xl flex-shrink-0">{profile.avatar_emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium truncate ${
                            profile.id === profileId
                              ? 'text-fuchsia-700 dark:text-fuchsia-300'
                              : 'text-gray-700 dark:text-gray-200'
                          }`}>
                            {profile.name}
                          </span>
                          {profile.is_locked && (
                            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-full">
                              <Lock className="h-3 w-3" />
                              PIN
                            </span>
                          )}
                          {profile.id === profileId && (
                            <span className="text-xs bg-fuchsia-200 dark:bg-fuchsia-800 text-fuchsia-700 dark:text-fuchsia-200 px-2 py-0.5 rounded-full flex-shrink-0">
                              active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {profile.id !== 1 && (
                      <button
                        onClick={(event) => handleDelete(profile, event)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
                        aria-label={`Delete ${profile.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3 space-y-2">
                {activeProfile && (
                  <>
                    {activeProfile.is_locked && (
                      <button
                        type="button"
                        onClick={() => openPinDialog('unlock-profile', activeProfile)}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-lg bg-fuchsia-500 text-white hover:bg-fuchsia-600 transition-colors"
                      >
                        <Lock className="h-4 w-4" />
                        <span>Unlock current profile</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openPinDialog('manage-pin', activeProfile)}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>{activeProfile.is_locked ? 'Manage profile PIN' : 'Add profile PIN'}</span>
                    </button>
                  </>
                )}

                {!showCreate ? (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center space-x-2 w-full px-4 py-2 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="font-medium text-sm">Add Profile</span>
                  </button>
                ) : (
                  <form onSubmit={handleCreate} className="space-y-3 pt-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
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
                        onClick={() => setShowCreate(false)}
                        className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {pinDialog && (
        <div className="fixed inset-0 z-[120] bg-slate-950/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-300 flex items-center justify-center">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {pinDialog.mode === 'unlock-profile' && `Unlock ${pinDialog.profile.name}`}
                  {pinDialog.mode === 'delete-locked' && `Delete ${pinDialog.profile.name}`}
                  {pinDialog.mode === 'manage-pin' && `${pinDialog.profile.is_locked ? 'Manage' : 'Add'} PIN`}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {pinDialog.mode === 'unlock-profile' && (
                    pinDialog.shouldSwitch
                      ? 'Enter the profile PIN before switching.'
                      : 'Enter the profile PIN to continue using this profile.'
                  )}
                  {pinDialog.mode === 'delete-locked' && 'This locked profile can only be deleted after the correct PIN is entered.'}
                  {pinDialog.mode === 'manage-pin' && (pinDialog.profile.is_locked
                    ? 'Use a 4-8 digit PIN. Enter the current PIN to update or clear it.'
                    : 'Add a simple 4-8 digit PIN for family-device protection.')}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100 dark:bg-red-900/20 dark:border-red-900/30 dark:text-red-200">
                {error}
              </div>
            )}

            <form
              onSubmit={(event) => submitPinDialog(event)}
              className="space-y-4"
            >
              {(pinDialog.mode === 'unlock-profile'
                || pinDialog.mode === 'delete-locked'
                || (pinDialog.mode === 'manage-pin' && pinDialog.profile.is_locked)) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pinForm.currentPin}
                    onChange={(event) => setPinForm((prev) => ({ ...prev, currentPin: event.target.value }))}
                    placeholder="4-8 digits"
                    className="w-full px-3 py-2 border-2 border-fuchsia-200 dark:border-fuchsia-700 rounded-lg focus:outline-none focus:border-fuchsia-500 bg-white dark:bg-slate-700 dark:text-gray-100"
                  />
                </div>
              )}

              {pinDialog.mode === 'manage-pin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    {pinDialog.profile.is_locked ? 'New PIN' : 'PIN'}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pinForm.newPin}
                    onChange={(event) => setPinForm((prev) => ({ ...prev, newPin: event.target.value }))}
                    placeholder="4-8 digits"
                    className="w-full px-3 py-2 border-2 border-fuchsia-200 dark:border-fuchsia-700 rounded-lg focus:outline-none focus:border-fuchsia-500 bg-white dark:bg-slate-700 dark:text-gray-100"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={resetPinDialog}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>

                {pinDialog.mode === 'manage-pin' && pinDialog.profile.is_locked && (
                  <button
                    type="button"
                    disabled={isPinSubmitting || !pinForm.currentPin.trim()}
                    onClick={(event) => submitPinDialog(event, 'clear')}
                    className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Clear PIN
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isPinSubmitting || (
                    pinDialog.mode === 'manage-pin'
                      ? !pinForm.newPin.trim() || (pinDialog.profile.is_locked && !pinForm.currentPin.trim())
                      : !pinForm.currentPin.trim()
                  )}
                  className={`flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    pinDialog.mode === 'delete-locked'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-fuchsia-500 hover:bg-fuchsia-600'
                  }`}
                >
                  {pinDialog.mode === 'unlock-profile' && 'Unlock profile'}
                  {pinDialog.mode === 'delete-locked' && 'Delete profile'}
                  {pinDialog.mode === 'manage-pin' && (pinDialog.profile.is_locked ? 'Update PIN' : 'Set PIN')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default ProfileSelector;
