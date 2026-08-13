import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api } from './api';
import Scanner from './pages/Scanner';
import History from './pages/History';
import Balance from './pages/Balance';
import Admin from './pages/Admin';
import Stats from './pages/Stats';
import Reviews from './pages/Reviews';
import HiddenArbsModal from './components/HiddenArbsModal';
import PasswordChangeModal from './components/PasswordChangeModal';

const TELEGRAM_CONTACT = 'https://t.me/BohdanCryp';

const EMPTY_IN_PLAY = {
  pinnacle: { count: 0, stake_sum: 0 },
  robinbet: { count: 0, stake_sum: 0 },
  total: { count: 0, stake_sum: 0 },
};

const EMPTY_BALANCE = {
  pinnacle_cashback: 0,
  robinbet: 0,
  cashback_pl: 0,
  total: 0,
  user: null,
  in_play: EMPTY_IN_PLAY,
};

function LoginScreen({ onLogin, busy, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin({ username, password });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-kicker">RobinArb</div>
        <h1>Sign in to RobinArb</h1>
        <p className="auth-copy">Access is managed manually for each RobinArb workspace.</p>
        <p className="auth-note">
          Need access or a new account? Contact <a href={TELEGRAM_CONTACT} target="_blank" rel="noreferrer">@BohdanCryp</a> on Telegram.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Enter your username"
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-code">404</div>
      <h1>Page not found</h1>
      <p>This page is not available for your account.</p>
    </div>
  );
}

export default function App() {
  const [balance, setBalance] = useState(EMPTY_BALANCE);
  const [sessionUser, setSessionUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [hiddenModalOpen, setHiddenModalOpen] = useState(false);
  const [hiddenModalInitialTab, setHiddenModalInitialTab] = useState('user');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [hiddenVersion, setHiddenVersion] = useState(0);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const resetSession = useCallback((message = 'Session expired. Please sign in again.') => {
    api.clearToken();
    setSessionUser(null);
    setBalance(EMPTY_BALANCE);
    setAuthError(message);
  }, []);

  const refreshBalance = useCallback(() => {
    if (!sessionUser) {
      return;
    }
    api.getBalance().then((data) => {
      setBalance({ ...EMPTY_BALANCE, ...data, in_play: data.in_play || EMPTY_IN_PLAY });
    }).catch((error) => {
      if (error.status === 401) {
        resetSession();
      }
    });
  }, [sessionUser, resetSession]);

  useEffect(() => {
    if (!api.hasToken()) {
      setAuthLoading(false);
      return;
    }

    api.getMe()
      .then((data) => {
        setSessionUser(data.user);
        setBalance({ ...EMPTY_BALANCE, ...(data.balance || {}) });
      })
      .catch(() => {
        api.clearToken();
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!sessionUser) {
      return undefined;
    }
    refreshBalance();
    const iv = setInterval(refreshBalance, 10000);
    return () => clearInterval(iv);
  }, [sessionUser, refreshBalance]);

  const handleLogin = async ({ username, password }) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const data = await api.login(username, password);
      setSessionUser(data.user);
      setBalance({ ...EMPTY_BALANCE, ...(data.balance || {}) });
      showToast(`Signed in as ${data.user.display_name}`);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      api.clearToken();
    }
    setSessionUser(null);
    setBalance(EMPTY_BALANCE);
    setAuthError('');
    showToast('Signed out');
  };

  const openHiddenModal = (tab) => {
    setHiddenModalInitialTab(tab);
    setHiddenModalOpen(true);
  };

  if (authLoading) {
    return <div className="auth-shell auth-shell-loading">Checking saved session...</div>;
  }

  if (!sessionUser) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} busy={authBusy} error={authError} />
        {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      </>
    );
  }

  const inPlay = balance.in_play || EMPTY_IN_PLAY;
  const pinInPlay = inPlay.pinnacle || EMPTY_IN_PLAY.pinnacle;
  const robinInPlay = inPlay.robinbet || EMPTY_IN_PLAY.robinbet;
  const totalInPlay = inPlay.total || EMPTY_IN_PLAY.total;
  const isAdmin = sessionUser.role === 'admin';
  const scannerElement = (
    <Scanner
      balance={balance}
      sessionUser={sessionUser}
      onBetPlaced={() => { refreshBalance(); showToast('Bet placed successfully'); }}
      showToast={showToast}
      hiddenVersion={hiddenVersion}
      onHiddenChanged={() => setHiddenVersion((value) => value + 1)}
      verifyMode="betslip"
    />
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="robin">Robin</span><span>Arb</span>
        </div>
        <nav>
          <NavLink to="/" end>
            <span>📡</span> <span>Scanner</span>
          </NavLink>
          <NavLink to="/history">
            <span>📋</span> <span>History</span>
          </NavLink>
          <NavLink to="/balance">
            <span>💰</span> <span>Balance</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin">
              <span>🛠</span> <span>Admin</span>
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/stats">
              <span>📈</span> <span>Stats</span>
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/reviews">
              <span>▣</span> <span>Reviews</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-name">{sessionUser.display_name}</div>
          <div className="sidebar-user-meta">@{sessionUser.username}</div>
          <button className="btn btn-link sidebar-hidden" onClick={() => openHiddenModal('user')}>Hidden by me</button>
          <button className="btn btn-link sidebar-hidden sidebar-system-blocked" onClick={() => openHiddenModal('system')}>System blocked</button>
          <button className="btn btn-link sidebar-hidden" style={{ marginTop: 4 }} onClick={() => setPasswordModalOpen(true)}>Change password</button>
          <button className="btn btn-link sidebar-logout" onClick={handleLogout}>Sign out</button>
        </div>
        <div className="sidebar-balance">
          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Account balance</div>
          <div className="total">
            ${balance.total.toFixed(2)}
            {totalInPlay.count > 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>
                ({totalInPlay.count} · ${totalInPlay.stake_sum.toFixed(0)})
              </span>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: '0.75rem' }}>
            <div>
              PIN 50%: ${balance.pinnacle_cashback.toFixed(2)}
              {pinInPlay.count > 0 && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({pinInPlay.count} · ${pinInPlay.stake_sum.toFixed(0)})
                </span>
              )}
            </div>
            <div>
              RobinBet: ${balance.robinbet.toFixed(2)}
              {robinInPlay.count > 0 && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({robinInPlay.count} · ${robinInPlay.stake_sum.toFixed(0)})
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={scannerElement} />
          <Route path="/history" element={<History />} />
          <Route path="/balance" element={<Balance balance={balance} sessionUser={sessionUser} showToast={showToast} onMutate={refreshBalance} />} />
          {isAdmin && (
            <Route path="/admin" element={<Admin showToast={showToast} onMutate={refreshBalance} />} />
          )}
          {isAdmin && (
            <Route path="/stats" element={<Stats showToast={showToast} />} />
          )}
          {isAdmin && (
            <Route path="/reviews/*" element={<Reviews />} />
          )}
          {isAdmin && (
            <Route path="/rewievs/*" element={<Navigate to="/reviews" replace />} />
          )}
          {!isAdmin && <Route path="/admin/*" element={<Navigate to="/" replace />} />}
          {!isAdmin && <Route path="/stats/*" element={<Navigate to="/" replace />} />}
          {!isAdmin && <Route path="/reviews/*" element={<Navigate to="/" replace />} />}
          {!isAdmin && <Route path="/rewievs/*" element={<Navigate to="/" replace />} />}
          <Route path="/owner/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {hiddenModalOpen && (
        <HiddenArbsModal
          open
          initialTab={hiddenModalInitialTab}
          onClose={() => setHiddenModalOpen(false)}
          onRestored={() => setHiddenVersion((value) => value + 1)}
          showToast={showToast}
        />
      )}
      <PasswordChangeModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        showToast={showToast}
      />
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
