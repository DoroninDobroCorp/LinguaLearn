import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import {
  bookmakerProfileStatusReady,
  canonicalBookmakerProfile,
  shouldRequestBookmakerProfileSwitch,
} from '../bookmakerProfileStatus';
import { bookmakerPollDelayMs } from '../utils/polling';

// The bookmaker presets exposed by the Forted filter switch ("ручка").
// All run Pinnacle × one BK at margin -3..+100.
const PRESETS = [
  { id: 'pin_vbet', label: 'Vbet' },
  { id: 'pin_ladbrokes', label: 'Ladbrokes' },
  { id: 'pin_paddy', label: 'PaddyPower' },
  { id: 'pin_production', label: 'Все буки (-3)' },
  { id: 'pin_all3', label: 'Common (вбет+бф+лэд)' },
  { id: 'pin_betfair_ladbrokes_mand', label: 'Common (бф+лэд)' },
  { id: 'pin_bcgame', label: 'BC.Game' },
  { id: 'pin_dafabet', label: 'Dafabet' },
  { id: 'pin_1win', label: '1win' },
  { id: 'pin_bc_dafa_1win', label: 'Common (BC+Dafa+1win)' },
  { id: 'pin_6mix', label: 'Все букмекеры (-3..100)' },
];

const SWITCH_STATUS_TIMEOUT_MS = 90000;

function canonicalProfile(profile) {
  return canonicalBookmakerProfile(profile);
}

export default function BookmakerSwitch({ showToast, onSwitchComplete }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [statusWarning, setStatusWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(null);
  const switchStartedAtRef = useRef(0);
  const mountedRef = useRef(false);
  const pollNowRef = useRef(null);
  const showToastRef = useRef(showToast);
  const onSwitchCompleteRef = useRef(onSwitchComplete);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    showToastRef.current = showToast;
    onSwitchCompleteRef.current = onSwitchComplete;
  }, [onSwitchComplete, showToast]);

  const refresh = useCallback(async ({ quietError = false, signal } = {}) => {
    try {
      const data = await api.getBookmaker({ signal });
      if (signal?.aborted || !mountedRef.current) return null;
      setError('');
      setStatus(data);
      return data;
    } catch (err) {
      if (signal?.aborted || err?.code === 'REQUEST_ABORTED' || !mountedRef.current) return null;
      const message = err?.message || 'Bookmaker control unavailable';
      if (!quietError) setError(message);
      return null;
    }
  }, []);

  // Forted is a global control: another tab or an overnight coverage audit
  // can switch it too. Keep the highlighted profile truthful even while this
  // component is idle instead of freezing the last locally-clicked value.
  // Schedule from completion so a slow control request can never overlap the
  // next tick. Changing idle/switching mode recreates the loop and refreshes
  // immediately; cleanup aborts the outstanding GET on unmount.
  useEffect(() => {
    let stopped = false;
    let timer = null;
    let controller = null;
    let firstPoll = true;
    const startedAt = switchStartedAtRef.current || Date.now();

    const poll = async () => {
      controller = new AbortController();
      const data = await refresh({
        quietError: busy || !firstPoll,
        signal: controller.signal,
      });
      controller = null;
      firstPoll = false;
      if (stopped) return;

      if (!busy) {
        if (bookmakerProfileStatusReady(data)) setStatusWarning('');
        timer = setTimeout(poll, bookmakerPollDelayMs(false));
        return;
      }

      const timedOut = Date.now() - startedAt > SWITCH_STATUS_TIMEOUT_MS;
      if (bookmakerProfileStatusReady(data, target)) {
        setBusy(false);
        setTarget(null);
        setStatusWarning('');
        showToastRef.current?.('Bookmaker switched', 'success');
        onSwitchCompleteRef.current?.();
      } else if (!data) {
        if (timedOut) {
          const message = 'Bookmaker switch status unavailable';
          setBusy(false);
          setTarget(null);
          setStatusWarning('');
          setError(message);
          showToastRef.current?.(message, 'error');
        } else {
          setStatusWarning('Status temporarily unavailable; retrying.');
        }
      } else if (timedOut) {
        const message = 'Still waiting for the first matching bookmaker snapshot; the scanner remains safely empty.';
        setBusy(false);
        setTarget(null);
        setStatusWarning(message);
        setError('');
      } else if (data.control_available === false) {
        setStatusWarning('Status temporarily unavailable; retrying.');
      } else if (!data.switching) {
        setStatusWarning('Control acknowledged; waiting for the matching Forted data epoch.');
      } else {
        setStatusWarning('');
      }

      timer = setTimeout(poll, bookmakerPollDelayMs(true));
    };

    pollNowRef.current = () => {
      clearTimeout(timer);
      timer = null;
      if (!controller) poll();
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      pollNowRef.current = null;
    };
  }, [busy, refresh, target]);

  const runtimeHasNoProfile = status?.runtime === 'rust'
    && !status?.runtime_active_config
    && !status?.switching;
  const activeProfile = canonicalProfile(
    (runtimeHasNoProfile ? status?.inferred_profile : null)
      || status?.active_profile
      || status?.profile
      || status?.inferred_profile
      || status?.memory_profile
  );
  const handleSwitch = async (profile) => {
    if (!shouldRequestBookmakerProfileSwitch(status, profile, busy)) return;
    setTarget(profile);
    setBusy(true);
    setStatusWarning('');
    // This is a click-handler timestamp, not render-time derived state.
    // eslint-disable-next-line react-hooks/purity
    switchStartedAtRef.current = Date.now();
    try {
      const data = await api.switchBookmaker(profile);
      if (!mountedRef.current) return;
      setError('');
      setStatus(data);
      if (bookmakerProfileStatusReady(data, profile)) {
        setBusy(false);
        setTarget(null);
        setStatusWarning('');
        onSwitchComplete?.();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err?.message || 'Bookmaker switch failed';
      setBusy(false);
      setTarget(null);
      setStatusWarning('');
      setError(message);
      showToast?.(message, 'error');
    }
  };

  const active = target || activeProfile || canonicalProfile(status?.inferred_profile);
  const targetLabel = PRESETS.find((p) => p.id === target)?.label || target;
  const activeReady = bookmakerProfileStatusReady(status, activeProfile);
  let idleReadinessWarning = '';
  if (!busy && status && !activeReady) {
    if (status.profile_stale) {
      idleReadinessWarning = 'Forted profile status is stale; rows are hidden. Click the highlighted bookmaker to retry.';
    } else if (status.switching || status.observed_active_profile !== activeProfile) {
      idleReadinessWarning = 'Waiting for the first matching bookmaker snapshot; stale rows are hidden.';
    } else if (status.profile_authoritative === true && status.data_epoch !== status.generation) {
      idleReadinessWarning = 'Waiting for the current Forted data epoch; rows remain safely hidden.';
    } else {
      idleReadinessWarning = 'The selected bookmaker feed is not ready; rows are hidden. Click it to retry.';
    }
  }
  const visibleStatusWarning = statusWarning || idleReadinessWarning;

  return (
    <div className="bookmaker-switch">
      <span className="bookmaker-switch-label">Bookmaker</span>
      <div className="bookmaker-switch-buttons">
        {PRESETS.map((preset) => {
          const isActive = active === preset.id;
          const isReady = isActive && !target && bookmakerProfileStatusReady(status, preset.id);
          return (
            <button
              key={preset.id}
              className={`btn btn-link bookmaker-pill${isActive ? ' on' : ''}${isActive && !isReady ? ' pending' : ''}`}
              onClick={() => handleSwitch(preset.id)}
              disabled={busy || Boolean(error && !status)}
              title={isReady
                ? 'Active Forted profile — exact feed ready'
                : isActive
                  ? 'Profile is selected but not ready; click to retry'
                  : `Switch to ${preset.label}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bookmaker-switch-error" title={error}>
          <span>{error}</span>
          <button className="btn btn-link" onClick={() => pollNowRef.current?.()} disabled={busy}>Retry</button>
        </div>
      )}

      {!busy && visibleStatusWarning && (
        <div className="bookmaker-switch-pending" role="status">
          {visibleStatusWarning}
        </div>
      )}

      {busy && (
        <div className="modal-overlay">
          <div className="modal bookmaker-switch-modal">
            <h2>Switching bookmaker…</h2>
            <p>
              Reconnecting the Forted feed to <strong>{targetLabel}</strong>.
              This takes a few seconds while every server re-subscribes.
            </p>
            {status && (
              <p className="bookmaker-switch-progress">
                {status.servers_ready} / {status.servers_total} servers ready
              </p>
            )}
            {statusWarning && (
              <p className="bookmaker-switch-note">{statusWarning}</p>
            )}
            <p className="bookmaker-switch-note">Please keep this window open.</p>
          </div>
        </div>
      )}
    </div>
  );
}
