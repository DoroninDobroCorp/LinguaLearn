import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getActiveProfileId, setActiveProfileId, profileApiUrl, PROFILE_RESET_EVENT } from '../utils/api';

const ProfileContext = createContext();

const AVATAR_OPTIONS = ['👤', '👩', '👨', '👧', '👦', '🧑', '👵', '👴', '🐱', '🐶', '🦊', '🌟'];

export function ProfileProvider({ children }) {
  const [profileId, setProfileId] = useState(getActiveProfileId);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/spanish/api/profiles');
      if (!res.ok) throw new Error('Failed to fetch profiles');
      const data = await res.json();
      setProfiles(data.profiles);

      // If the stored profileId doesn't exist in DB, reset to default
      if (data.profiles.length > 0 && !data.profiles.find(p => p.id === profileId)) {
        setProfileId(1);
        setActiveProfileId(1);
      }
    } catch (err) {
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Recover from stale/deleted profile: any API call that gets
  // PROFILE_NOT_FOUND dispatches this event via profileFetch.
  useEffect(() => {
    const handleProfileReset = () => {
      setProfileId(1);
      fetchProfiles();
    };
    window.addEventListener(PROFILE_RESET_EVENT, handleProfileReset);
    return () => window.removeEventListener(PROFILE_RESET_EVENT, handleProfileReset);
  }, [fetchProfiles]);

  const switchProfile = useCallback((id) => {
    setActiveProfileId(id);
    setProfileId(id);
  }, []);

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

  const deleteProfile = useCallback(async (id) => {
    if (id === 1) throw new Error('Cannot delete the default profile');
    const res = await fetch(`/spanish/api/profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete profile');
    }
    // If we just deleted the active profile, switch to default
    if (id === profileId) {
      switchProfile(1);
    }
    setProfiles(prev => prev.filter(p => p.id !== id));
  }, [profileId, switchProfile]);

  const activeProfile = profiles.find(p => p.id === profileId) || null;

  return (
    <ProfileContext.Provider value={{
      profileId,
      profiles,
      activeProfile,
      loading,
      switchProfile,
      createProfile,
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
