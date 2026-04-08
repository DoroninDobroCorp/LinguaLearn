import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  clearActiveProfileToken,
  clearProfilePinToken,
  getActiveProfileId,
  getProfilePinToken,
  hasProfilePinToken,
  PROFILE_RESET_EVENT,
  PROFILE_UNLOCK_TOKEN_HEADER,
  profileApiUrl,
  profileFetch,
  setActiveProfileId,
  setActiveProfileToken,
  setProfilePinToken,
} from '../utils/api';
import { getNextProfileViewVersion, resolveProfileSelection } from '../utils/profileSelection';

const ProfileContext = createContext();

const AVATAR_OPTIONS = ['👤', '👩', '👨', '👧', '👦', '🧑', '👵', '👴', '🐱', '🐶', '🦊', '🌟'];

export function ProfileProvider({ children }) {
  const [profileId, setProfileId] = useState(getActiveProfileId);
  const [profileViewVersion, setProfileViewVersion] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectProfileSession = useCallback(async (id) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const pinToken = getProfilePinToken(id);
    if (pinToken) {
      headers.set(PROFILE_UNLOCK_TOKEN_HEADER, pinToken);
    }

    const res = await fetch(`/spanish/api/profiles/${id}/select`, {
      method: 'POST',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'PROFILE_LOCKED') {
        clearProfilePinToken(id);
        clearActiveProfileToken(id);
      }

      const error = new Error(data.error || 'Failed to select profile');
      if (typeof data.code === 'string' && data.code) {
        error.code = data.code;
      }
      throw error;
    }

    if (data.unlockToken) {
      setProfilePinToken(id, data.unlockToken);
    }
    if (data.activeProfileToken) {
      setActiveProfileToken(id, data.activeProfileToken);
    } else {
      clearActiveProfileToken(id);
    }

    return data.profile;
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/spanish/api/profiles');
      if (!res.ok) throw new Error('Failed to fetch profiles');
      const data = await res.json();
      setProfiles(data.profiles);

      const nextProfileId = resolveProfileSelection(data.profiles, profileId, hasProfilePinToken);
      const selectedProfile = data.profiles.find((profile) => profile.id === nextProfileId) || null;

      if (selectedProfile && (!selectedProfile.is_locked || hasProfilePinToken(selectedProfile.id))) {
        try {
          await selectProfileSession(selectedProfile.id);
        } catch (error) {
          console.error('Error syncing active profile session:', error);
        }
      }

      if (Number.isInteger(nextProfileId) && nextProfileId !== profileId) {
        setProfileId(nextProfileId);
        setActiveProfileId(nextProfileId);
      }
    } catch (err) {
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId, selectProfileSession]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Recover from stale/deleted profile: any API call that gets
  // PROFILE_NOT_FOUND dispatches this event via profileFetch.
  // We don't hardcode a fallback ID — fetchProfiles will reset to the
  // first actually-existing profile from the server response.
  useEffect(() => {
    const handleProfileReset = () => {
      fetchProfiles();
    };
    window.addEventListener(PROFILE_RESET_EVENT, handleProfileReset);
    return () => window.removeEventListener(PROFILE_RESET_EVENT, handleProfileReset);
  }, [fetchProfiles]);

  const switchProfile = useCallback(async (id) => {
    await selectProfileSession(id);
    setActiveProfileId(id);
    setProfileId(id);
  }, [selectProfileSession]);

  const createProfile = useCallback(async (name, avatarEmoji) => {
    const res = await fetch('/spanish/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatarEmoji }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create profile');
    }
    const profile = await res.json();
    setProfiles(prev => [...prev, profile]);
    return profile;
  }, []);

  const unlockProfile = useCallback(async (id, pin) => {
    const res = await fetch(`/spanish/api/profiles/${id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to unlock profile');
    }

    if (data.unlockToken) {
      setProfilePinToken(id, data.unlockToken);
    }
    if (data.activeProfileToken) {
      setActiveProfileToken(id, data.activeProfileToken);
    }

    setProfileViewVersion((prev) => getNextProfileViewVersion(prev, getActiveProfileId(), id));

    return data.profile;
  }, []);

  const updateProfilePin = useCallback(async (id, newPin, currentPin = '') => {
    const res = await profileFetch(profileApiUrl(`/spanish/api/profiles/${id}/pin`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPin, currentPin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile PIN');
    }

    if (data.unlockToken) {
      setProfilePinToken(id, data.unlockToken);
    } else {
      clearProfilePinToken(id);
    }
    if (data.activeProfileToken) {
      setActiveProfileToken(id, data.activeProfileToken);
    }
    setProfiles((prev) => prev.map((profile) => (profile.id === id ? data.profile : profile)));
    setProfileViewVersion((prev) => getNextProfileViewVersion(prev, getActiveProfileId(), id));
    return data.profile;
  }, []);

  const clearPin = useCallback(async (id, currentPin) => {
    const res = await profileFetch(profileApiUrl(`/spanish/api/profiles/${id}/pin`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to clear profile PIN');
    }

    clearProfilePinToken(id);
    clearActiveProfileToken(id);
    if (data.activeProfileToken) {
      setActiveProfileToken(id, data.activeProfileToken);
    }
    setProfiles((prev) => prev.map((profile) => (profile.id === id ? data.profile : profile)));
    setProfileViewVersion((prev) => getNextProfileViewVersion(prev, getActiveProfileId(), id));
    return data.profile;
  }, []);

  const deleteProfile = useCallback(async (id, pin = '') => {
    if (id === 1) throw new Error('Cannot delete the default profile');
    const res = await fetch(`/spanish/api/profiles/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pin ? { pin } : {}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete profile');
    }
    clearProfilePinToken(id);
    clearActiveProfileToken(id);
    setProfiles(prev => prev.filter(p => p.id !== id));

    if (id === profileId) {
      await fetchProfiles();
    }
  }, [fetchProfiles, profileId]);

  const activeProfile = profiles.find(p => p.id === profileId) || null;
  const profileViewKey = `${profileId}:${profileViewVersion}`;

  return (
    <ProfileContext.Provider value={{
      profileId,
      profileViewKey,
      profiles,
      activeProfile,
      loading,
        switchProfile,
        createProfile,
        unlockProfile,
        updateProfilePin,
        clearPin,
        deleteProfile,
        avatarOptions: AVATAR_OPTIONS,
      }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
}
