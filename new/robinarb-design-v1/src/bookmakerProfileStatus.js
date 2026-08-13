const PROFILE_ALIASES = { pin_betfair: 'pin_paddy' };

export function canonicalBookmakerProfile(profile) {
  return PROFILE_ALIASES[profile] || profile || null;
}

function nonnegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * A control-plane acknowledgement is not enough to expose a new feed.  New
 * servers must prove the requested profile with one authoritative data epoch;
 * the explicit false branch is the bounded compatibility path for a legacy
 * unlabelled Forted source whose server-side composite proof already passed.
 */
export function bookmakerProfileStatusReady(data, expectedProfile = null) {
  if (!data || data.switching) return false;

  const expected = canonicalBookmakerProfile(
    expectedProfile || data.active_profile || data.profile || data.memory_profile,
  );
  const active = canonicalBookmakerProfile(
    data.active_profile || data.profile || data.memory_profile,
  );
  if (!expected || active !== expected || data.profile_ready !== true) return false;

  if (data.profile_authoritative === false) {
    return true;
  }
  if (data.profile_authoritative !== true || data.profile_stale === true) {
    return false;
  }

  const observed = canonicalBookmakerProfile(data.observed_active_profile);
  const generation = nonnegativeInteger(data.generation);
  const dataEpoch = nonnegativeInteger(data.data_epoch);
  return Boolean(
    data.source_instance
      && observed === expected
      && generation !== null
      && generation > 0
      && dataEpoch === generation
  );
}

export function shouldRequestBookmakerProfileSwitch(data, requestedProfile, busy = false) {
  if (busy) return false;
  const requested = canonicalBookmakerProfile(requestedProfile);
  const active = canonicalBookmakerProfile(
    data?.active_profile || data?.profile || data?.memory_profile,
  );
  return Boolean(requested && (
    requested !== active || !bookmakerProfileStatusReady(data, requested)
  ));
}
