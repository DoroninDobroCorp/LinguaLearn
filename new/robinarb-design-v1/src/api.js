const BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'robinarb.authToken';

let authToken = '';
if (typeof window !== 'undefined') {
  authToken = window.localStorage.getItem(TOKEN_KEY) || '';
}

function setAuthToken(token) {
  authToken = token || '';
  if (typeof window === 'undefined') {
    return;
  }

  if (authToken) {
    window.localStorage.setItem(TOKEN_KEY, authToken);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

function requestTimeoutMs(path, explicit) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (path.startsWith('/verify')) return 45000;
  if (path.startsWith('/bet')) return 60000;
  if (path.startsWith('/arbs')) return 30000;
  if (path.startsWith('/forted')) return 60000;
  return 20000;
}

function formatRequestError(path) {
  if (path.startsWith('/verify')) {
    return 'Price check timed out. Refresh the fork and try again.';
  }
  if (path.startsWith('/bet')) {
    return 'Bet request timed out. Bet was not confirmed in RobinArb; refresh balance/history before retrying.';
  }
  return 'Request timed out. Please try again.';
}

async function request(path, options = {}, config = {}) {
  const { auth = true, timeoutMs } = config;
  const { headers: optionHeaders, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs(path, timeoutMs));
  const headers = {
    'Content-Type': 'application/json',
    ...(auth && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(optionHeaders || {}),
  };
  let resp;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    const externallyAborted = error?.name === 'AbortError' && externalSignal?.aborted && !timedOut;
    const requestTimedOut = error?.name === 'AbortError' && timedOut;
    const wrapped = new Error(
      requestTimedOut
        ? formatRequestError(path)
        : externallyAborted
          ? 'Request cancelled'
          : (error?.message || 'Network request failed')
    );
    wrapped.status = 0;
    wrapped.code = requestTimedOut
      ? 'REQUEST_TIMEOUT'
      : externallyAborted
        ? 'REQUEST_ABORTED'
        : 'NETWORK_ERROR';
    throw wrapped;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    let detail = err.detail;
    let payload = null;
    let message;
    if (detail && typeof detail === 'object') {
      payload = detail;
      // The backend returns structured 409s for the match-limit gate
      // ({error, reason, remaining, adjusted_stake, ...}). Surface the
      // human-readable `reason` as the Error message and keep the rest on
      // `error.payload` for callers (e.g. the calculator's accept handler)
      // that want to render an "accept smaller stake" prompt.
      message = detail.user_message || detail.reason || detail.error || `HTTP ${resp.status}`;
    } else {
      message = detail || `HTTP ${resp.status}`;
    }
    const error = new Error(message);
    error.status = resp.status;
    if (payload) error.payload = payload;
    throw error;
  }
  return resp.json();
}

async function download(path, filename) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const api = {
  hasToken: () => Boolean(authToken),

  clearToken: () => setAuthToken(''),

  login: async (username, password) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, { auth: false });
    setAuthToken(data.token);
    return data;
  },

  logout: async () => {
    try {
      return await request('/auth/logout', {
        method: 'POST',
      });
    } finally {
      setAuthToken('');
    }
  },

  getMe: () => request('/auth/me'),

  getArbs: ({ sport, market, bookmaker, search, minProfit, live, refresh, robinWork, signal } = {}) => {
    const params = new URLSearchParams();
    if (sport) params.set('sport', sport);
    if (market) params.set('market', market);
    if (bookmaker) params.set('bookmaker', bookmaker);
    if (search) params.set('search', search);
    if (minProfit !== undefined && minProfit !== null && minProfit !== '' && Number(minProfit) !== 0) params.set('min_profit', minProfit);
    if (live && live !== 'all') params.set('live', live);
    if (refresh) params.set('refresh', '1');
    if (robinWork) params.set('robin_work', '1');
    return request(`/arbs?${params}`, { signal });
  },

  getFortedFilters: () => request('/forted/filters'),

  updateFortedFilters: (payload) =>
    request('/forted/filters', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminBets: ({ status, username } = {}) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (username) params.set('username', username);
    return request(`/admin/bets?${params}`);
  },

  getAdminUsers: () => request('/admin/users'),

  settleBetAdmin: (betId, outcome, username) =>
    request(`/admin/bets/${betId}/settle`, {
      method: 'POST',
      body: JSON.stringify({ outcome, username }),
    }),

  getAdminStatsSummary: () => request('/admin/stats/summary'),

  getAdminStatsRecords: ({ category, mode, margin, verifyStatus, search } = {}) => {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (mode && mode !== 'all') params.set('mode', mode);
    if (margin && margin !== 'all') params.set('margin', margin);
    if (verifyStatus && verifyStatus !== 'all') params.set('verify_status', verifyStatus);
    if (search) params.set('search', search);
    return request(`/admin/stats/records?${params}`);
  },

  getAdminStatsRecord: (recordId) => request(`/admin/stats/records/${encodeURIComponent(recordId)}`),

  settleAdminStatsRecord: (recordId, result) =>
    request(`/admin/stats/records/${encodeURIComponent(recordId)}/settle`, {
      method: 'POST',
      body: JSON.stringify({ result }),
    }),

  downloadAdminStatsCsv: () => download('/admin/stats/download', 'robinarb_stats.csv'),

  downloadAdminStatsRecordJsonl: (recordId) =>
    download(`/admin/stats/records/${encodeURIComponent(recordId)}/download`, `${recordId}.jsonl`),

  downloadAdminStatsRecordPriceCsv: (recordId) =>
    download(`/admin/stats/records/${encodeURIComponent(recordId)}/price_changes.csv`, `${recordId}_price_changes.csv`),

  calculate: (arbId, stakeTotal, options = {}) =>
    request('/calc', {
      method: 'POST',
      body: JSON.stringify({
        arb_id: arbId,
        stake_total: stakeTotal,
        counter_stake: options.counterStake ?? null,
        counter_odds: options.counterOdds ?? null,
        live_pinnacle_odds: options.livePinnacleOdds ?? null,
        live_robin_odds: options.liveRobinOdds ?? null,
      }),
    }),

  verify: (arbId, options = {}) =>
    request('/verify', {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify({
        arb_id: arbId,
        verify_mode: options.verifyMode ?? null,
        verify_scope: options.verifyScope ?? null,
        client_id: options.clientId ?? null,
      }),
    }),

  releaseCalculatorVerify: (arbId, clientId) =>
    request('/verify/calculator/release', {
      method: 'POST',
      body: JSON.stringify({
        arb_id: arbId,
        client_id: clientId,
      }),
    }, { timeoutMs: 5000 }),

  getHiddenArbs: () => request('/hidden-arbs'),

  getVerificationRejections: ({
    limit = 200,
    category = 'all',
    rootCause = 'all',
    bookmaker = 'all',
    profile = 'all',
  } = {}) => {
    const params = new URLSearchParams();
    const parsedLimit = Number.parseInt(limit, 10);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      params.set('limit', String(Math.min(parsedLimit, 1000)));
    }
    if (category && category !== 'all') params.set('category', category);
    if (rootCause && rootCause !== 'all') params.set('root_cause', rootCause);
    if (bookmaker && bookmaker !== 'all') params.set('bookmaker', bookmaker);
    if (profile && profile !== 'all') params.set('profile', profile);
    const query = params.toString();
    return request(`/verification-rejections${query ? `?${query}` : ''}`);
  },

  hideArb: (arbId, scope) =>
    request('/hidden-arbs', {
      method: 'POST',
      body: JSON.stringify({ arb_id: arbId, scope }),
    }),

  restoreHiddenArb: (itemId) =>
    request(`/hidden-arbs/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),

  getBalance: () => request('/balance'),

  placeBet: (arbId, side, stake, odds, quoteId, options = {}) =>
    request('/bet', {
      method: 'POST',
      body: JSON.stringify({
        arb_id: arbId,
        side,
        stake,
        odds,
        quote_id: quoteId,
        verify_mode: options.verifyMode ?? null,
        donor_stake: options.donorStake ?? null,
        donor_odds: options.donorOdds ?? null,
      }),
    }),

  getBets: (side) => {
    const params = side ? `?side=${side}` : '';
    return request(`/bets${params}`);
  },

  getBookmaker: ({ signal } = {}) => request('/forted/bookmaker', { signal }),

  switchBookmaker: (profile) =>
    request('/forted/bookmaker', {
      method: 'POST',
      body: JSON.stringify({ profile }),
    }),

  settleCashback: () =>
    request('/auth/settle_cashback', {
      method: 'POST',
    }),

  impersonateUser: async (username) => {
    const data = await request('/admin/impersonate', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    setAuthToken(data.token);
    return data;
  },

  changePassword: (oldPassword, newPassword) =>
    request('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }),

  adminCreateUser: (payload) =>
    request('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminUpdateUserBalance: (username, payload) =>
    request(`/admin/users/${encodeURIComponent(username)}/balance`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminResetUserPassword: (username, payload) =>
    request(`/admin/users/${encodeURIComponent(username)}/password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
