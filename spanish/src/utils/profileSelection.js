export function resolveProfileSelection(profiles, currentProfileId, hasPinToken = () => false) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return null;
  }

  const currentProfile = profiles.find((profile) => profile.id === currentProfileId) || null;
  const unlockedFallback = profiles.find((profile) => !profile.is_locked) || null;

  if (!currentProfile) {
    return unlockedFallback?.id ?? profiles[0].id;
  }

  if (currentProfile.is_locked && !hasPinToken(currentProfile.id)) {
    return unlockedFallback?.id ?? currentProfile.id;
  }

  return currentProfile.id;
}

export function getProfileSwitchAction(profile, currentProfileId, hasPinToken = () => false) {
  if (!profile) {
    return { type: 'none', shouldSwitch: false };
  }

  const unlockedForSession = profile.is_locked && hasPinToken(profile.id);

  if (profile.is_locked && !unlockedForSession) {
    return {
      type: 'unlock',
      shouldSwitch: profile.id !== currentProfileId,
    };
  }

  if (profile.id === currentProfileId) {
    return { type: 'none', shouldSwitch: false };
  }

  return { type: 'switch', shouldSwitch: true };
}

export function getProfileSwitchErrorMessage(error) {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message
    : 'Failed to switch profile';
}

export function getNextProfileViewVersion(currentVersion, activeProfileId, updatedProfileId) {
  return activeProfileId === updatedProfileId ? currentVersion + 1 : currentVersion;
}
