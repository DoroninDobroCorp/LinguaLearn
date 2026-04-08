import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProfileSwitchErrorMessage,
  getProfileSwitchAction,
  getNextProfileViewVersion,
  resolveProfileSelection,
} from '../src/utils/profileSelection.js';

describe('Profile selection helpers', () => {
  it('keeps the current locked profile selected when every profile is locked', () => {
    const profiles = [
      { id: 1, is_locked: true },
      { id: 2, is_locked: true },
    ];

    const selectedProfileId = resolveProfileSelection(profiles, 2, () => false);

    assert.equal(selectedProfileId, 2);
  });

  it('falls back to an unlocked profile when the current locked profile has no token', () => {
    const profiles = [
      { id: 1, is_locked: true },
      { id: 2, is_locked: false },
      { id: 3, is_locked: true },
    ];

    const selectedProfileId = resolveProfileSelection(profiles, 3, () => false);

    assert.equal(selectedProfileId, 2);
  });

  it('treats the active locked profile as an unlock action instead of a no-op', () => {
    assert.deepEqual(
      getProfileSwitchAction({ id: 7, is_locked: true }, 7),
      { type: 'unlock', shouldSwitch: false },
    );
    assert.deepEqual(
      getProfileSwitchAction({ id: 8, is_locked: true }, 7),
      { type: 'unlock', shouldSwitch: true },
    );
  });

  it('switches normally when a locked profile already has a session unlock token', () => {
    const hasPinToken = (profileId) => profileId === 8;

    assert.deepEqual(
      getProfileSwitchAction({ id: 7, is_locked: true }, 7, hasPinToken),
      { type: 'unlock', shouldSwitch: false },
    );
    assert.deepEqual(
      getProfileSwitchAction({ id: 8, is_locked: true }, 7, hasPinToken),
      { type: 'switch', shouldSwitch: true },
    );
    assert.deepEqual(
      getProfileSwitchAction({ id: 8, is_locked: true }, 8, hasPinToken),
      { type: 'none', shouldSwitch: false },
    );
  });

  it('bumps the active view version when the current profile regains session access', () => {
    assert.equal(getNextProfileViewVersion(0, 7, 7), 1);
    assert.equal(getNextProfileViewVersion(1, 7, 8), 1);
  });

  it('returns a fallback error message when a profile switch fails without a server message', () => {
    assert.equal(getProfileSwitchErrorMessage(new Error('Network down')), 'Network down');
    assert.equal(getProfileSwitchErrorMessage({}), 'Failed to switch profile');
  });
});
