import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { formatCounterOutcome } from '../utils/outcomes';
import FortedOperations from '../components/FortedOperations';

const STATUS_TABS = ['accepted', 'won', 'lost', 'all'];

const getBetDisplayCashback = (bet) => {
  if (bet.side !== 'pinnacle') return 0;
  if (bet.status === 'won') {
    const profit = bet.stake * (bet.odds - 1);
    return -0.5 * profit;
  }
  return 0.5 * bet.stake;
};

export default function Admin({ showToast, onMutate }) {
  const [activeTab, setActiveTab] = useState('bets');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [bets, setBets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState(null);
  const [impersonateUsername, setImpersonateUsername] = useState('');
  const [impersonating, setImpersonating] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'trader',
    pinnacle_cashback: 0,
    robinbet: 0,
  });
  const [newPinnacle, setNewPinnacle] = useState(0);
  const [newRobin, setNewRobin] = useState(0);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = useCallback(() => {
    api.getAdminUsers()
      .then((data) => setUsers(data.users || []))
      .catch((err) => showToast?.(err.message, 'error'));
  }, [showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const fetchBets = useCallback(() => {
    setLoading(true);
    api.getAdminBets({ status: statusFilter, username: userFilter || undefined })
      .then((data) => setBets(data.bets))
      .catch((err) => showToast?.(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [statusFilter, userFilter, showToast]);

  useEffect(() => {
    if (activeTab === 'bets') {
      fetchBets();
    }
  }, [activeTab, fetchBets]);

  const handleSettle = async (bet, outcome) => {
    setSettlingId(bet.id);
    try {
      await api.settleBetAdmin(bet.id, outcome, bet.username);
      showToast?.(`Bet ${bet.id} → ${outcome}`, 'success');
      await fetchBets();
      fetchUsers();
      onMutate?.();
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setSettlingId(null);
    }
  };

  const handleRevert = async (bet) => {
    setSettlingId(bet.id);
    try {
      await api.settleBetAdmin(bet.id, 'accepted', bet.username);
      showToast?.(`Bet ${bet.id} reverted to accepted`, 'success');
      await fetchBets();
      fetchUsers();
      onMutate?.();
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setSettlingId(null);
    }
  };

  const handleImpersonate = async (uname) => {
    const target = uname || impersonateUsername;
    if (!target) return;
    setImpersonating(true);
    try {
      await api.impersonateUser(target);
      showToast?.(`Logged in as ${target}`, 'success');
      window.location.href = '/';
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setImpersonating(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.adminCreateUser(createForm);
      showToast?.(`User ${createForm.username} created successfully!`, 'success');
      setShowCreateModal(false);
      setCreateForm({
        username: '',
        display_name: '',
        password: '',
        role: 'trader',
        pinnacle_cashback: 0,
        robinbet: 0,
      });
      fetchUsers();
      onMutate?.();
    } catch (error) {
      showToast?.(error.message, 'error');
    }
  };

  const handleUpdateBalance = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.adminUpdateUserBalance(selectedUser.username, {
        pinnacle_cashback: Number(newPinnacle),
        robinbet: Number(newRobin),
      });
      showToast?.(`Balance for ${selectedUser.username} updated!`, 'success');
      setShowBalanceModal(false);
      fetchUsers();
      onMutate?.();
    } catch (error) {
      showToast?.(error.message, 'error');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.adminResetUserPassword(selectedUser.username, {
        new_password: newPassword,
      });
      showToast?.(`Password for ${selectedUser.username} updated successfully!`, 'success');
      setShowPasswordModal(false);
      fetchUsers();
    } catch (error) {
      showToast?.(error.message, 'error');
    }
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <h1>Admin Panel / Панель администратора</h1>
        <p>Manage users, adjust balances, and settle placement outcomes.</p>
      </div>

      {/* Main navigation tabs */}
      <div className="history-tabs" style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
        <button
          className={`history-tab ${activeTab === 'bets' ? 'active' : ''}`}
          onClick={() => setActiveTab('bets')}
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          Bets Settlement / Расчёт ставок
        </button>
        <button
          className={`history-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('users');
            fetchUsers();
          }}
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          User Management / Пользователи
        </button>
        <button
          className={`history-tab ${activeTab === 'operations' ? 'active' : ''}`}
          onClick={() => setActiveTab('operations')}
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          Operations / Источники
        </button>
      </div>

      {activeTab === 'operations' ? (
        <FortedOperations showToast={showToast} />
      ) : activeTab === 'bets' ? (
        <>
          <div className="history-tabs" style={{ flexWrap: 'wrap', marginBottom: '16px' }}>
            {STATUS_TABS.map((value) => (
              <button
                key={value}
                className={`history-tab ${statusFilter === value ? 'active' : ''}`}
                onClick={() => setStatusFilter(value)}
              >
                {value === 'accepted' ? 'In play' : value === 'won' ? 'Won' : value === 'lost' ? 'Lost' : 'All'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={impersonateUsername}
                onChange={(e) => setImpersonateUsername(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="">-- Impersonate User --</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>{u.display_name || u.username} ({u.role || 'trader'})</option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={() => handleImpersonate()}
                disabled={impersonating || !impersonateUsername}
              >
                Go
              </button>
            </div>
            <input
              type="search"
              list="admin-users-list"
              placeholder="Filter by username"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              style={{
                marginLeft: '12px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-primary)'
              }}
            />
            <datalist id="admin-users-list">
              {users.map((u) => (
                <option key={u.username} value={u.username}>{`${u.display_name || u.username} · ${u.bet_count || 0} bets`}</option>
              ))}
            </datalist>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <span>Loading admin panel...</span>
            </div>
          ) : bets.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>
              No bets match the current filters.
            </p>
          ) : (
            bets.map((bet) => {
              const status = bet.status || 'accepted';
              const counterOutcome = formatCounterOutcome({ bk2: bet.counter_bk, bk2_selection: bet.counter_selection });
              const statusColor = status === 'won'
                ? 'var(--positive)'
                : status === 'lost'
                  ? 'var(--accent-warn)'
                  : 'var(--text-secondary)';
              return (
                <div key={`${bet.username}-${bet.id}`} className={`bet-card ${bet.side === 'pinnacle' ? 'side-pin' : 'side-robin'}`}>
                  <div className="bet-card-header">
                    <span className="match-name">
                      @{bet.username} · {bet.match}
                    </span>
                    <span className="sport-tag">{bet.sport}</span>
                  </div>
                  <div className="bet-details">
                    <div>
                      <div className="detail-label">Side</div>
                      <div className="detail-value">{bet.side === 'pinnacle' ? 'PIN' : 'Robin'} · {bet.selection}</div>
                    </div>
                    {bet.counter_bk && (
                      <div>
                        <div className="detail-label">Counter</div>
                        <div className="detail-value">
                          {bet.counter_bk}
                          {bet.counter_odds ? ` @ ${Number(bet.counter_odds).toFixed(3)}` : ''}
                          {bet.counter_selection ? ` · ${counterOutcome}` : ''}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="detail-label">Odds / Stake</div>
                      <div className="detail-value">{Number(bet.odds).toFixed(3)} · ${bet.stake.toFixed(2)}</div>
                    </div>
                    {bet.side === 'pinnacle' && (
                      <div>
                        <div className="detail-label">Cashback</div>
                        <div
                          className="detail-value"
                          style={{ color: getBetDisplayCashback(bet) >= 0 ? 'var(--positive)' : 'var(--negative)' }}
                        >
                          {getBetDisplayCashback(bet) >= 0 ? '+' : '-'}${Math.abs(getBetDisplayCashback(bet)).toFixed(2)}
                          {(bet.status || 'accepted') === 'accepted' && ' (pending)'}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="detail-label">Status</div>
                      <div className="detail-value" style={{ color: statusColor }}>{status.toUpperCase()}</div>
                    </div>
                    <div>
                      <div className="detail-label">Placed</div>
                      <div className="detail-value">{new Date(bet.placed_at * 1000).toLocaleString()}</div>
                    </div>
                    {bet.settled_at && (
                      <div>
                        <div className="detail-label">Settled</div>
                        <div className="detail-value">{new Date(bet.settled_at * 1000).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                  {(bet.pinnacle_odds || bet.robin_odds || bet.margin || bet.pinnacle_verify_odds || bet.pinnacle_hub_event_id || bet.line_source || bet.pinnacle_live_place) && (
                    <div className="bet-audit-details" style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--border)', fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                      {bet.pinnacle_hub_event_id && (
                        <div><span style={{color: 'var(--text-muted)'}}>Event ID:</span> <strong>{bet.pinnacle_hub_event_id}</strong></div>
                      )}
                      {bet.pinnacle_odds && (
                        <div><span style={{color: 'var(--text-muted)'}}>Pin Odds (Feed):</span> <strong>{Number(bet.pinnacle_odds).toFixed(3)}</strong></div>
                      )}
                      {bet.pinnacle_verify_odds && (
                        <div><span style={{color: 'var(--text-muted)'}}>Pin Odds (Verify):</span> <strong>{Number(bet.pinnacle_verify_odds).toFixed(3)}</strong></div>
                      )}
                      {bet.robin_odds && (
                        <div><span style={{color: 'var(--text-muted)'}}>Robin Odds:</span> <strong>{Number(bet.robin_odds).toFixed(3)}</strong></div>
                      )}
                      {bet.margin !== undefined && bet.margin !== null && (
                        <div><span style={{color: 'var(--text-muted)'}}>Pinnacle Margin:</span> <strong>{(bet.margin * 100).toFixed(2)}%</strong></div>
                      )}
                      {bet.line_source && (
                        <div><span style={{color: 'var(--text-muted)'}}>Line Source:</span> <strong>{bet.line_source}</strong></div>
                      )}
                      {bet.price_signature && (
                        <div style={{ width: '100%', wordBreak: 'break-all' }}><span style={{color: 'var(--text-muted)'}}>Price Sig:</span> <code>{bet.price_signature}</code></div>
                      )}
                      {bet.pinnacle_live_place && (
                        <div style={{ width: '100%', wordBreak: 'break-all', marginTop: 4, padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                          <span style={{color: 'var(--text-muted)'}}>Pinnacle API Placement:</span>{' '}
                          <code>Status: {bet.pinnacle_live_place.status || 'N/A'} | HTTP: {bet.pinnacle_live_place.http_status || 'N/A'} | Req ID: {bet.pinnacle_live_place.unique_request_id || 'N/A'} | Odds: {bet.pinnacle_live_place.current_odds || 'N/A'} (Expected: {bet.pinnacle_live_place.expected_odds || 'N/A'})</code>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="action-buttons" style={{ marginTop: 8 }}>
                    {status === 'accepted' ? (
                      <>
                        <button
                          className="btn btn-link"
                          onClick={() => handleSettle(bet, 'won')}
                          disabled={settlingId === bet.id}
                          style={{ flex: 1, color: 'var(--positive)' }}
                        >
                          {settlingId === bet.id ? '…' : 'Mark Won'}
                        </button>
                        <button
                          className="btn btn-link"
                          onClick={() => handleSettle(bet, 'lost')}
                          disabled={settlingId === bet.id}
                          style={{ flex: 1, color: 'var(--accent-warn)' }}
                        >
                          {settlingId === bet.id ? '…' : 'Mark Lost'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-link"
                        onClick={() => handleRevert(bet)}
                        disabled={settlingId === bet.id}
                        style={{ flex: 1 }}
                      >
                        {settlingId === bet.id ? '…' : '↺ Revert to in-play'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      ) : (
        /* User management tab content */
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              ＋ Create User / Создать пользователя
            </button>
          </div>

          <div className="users-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {users.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>No users found.</p>
            ) : (
              users.map((u) => {
                const uBalance = u.balance || { pinnacle_cashback: 0, robinbet: 0, cashback_pl: 0 };
                return (
                  <div key={u.username} className="bet-card side-pin" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {u.display_name || u.username} <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 'normal' }}>(@{u.username})</span>
                      </span>
                      <span className="sport-tag" style={{ background: u.role === 'admin' ? 'var(--accent-warn)' : 'var(--accent)' }}>
                        {(u.role || 'trader').toUpperCase()}
                      </span>
                    </div>

                    <div className="bet-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', width: '100%', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', paddingTop: '10px', paddingBottom: '10px' }}>
                      <div>
                        <div className="detail-label">Pinnacle Cashback</div>
                        <div className="detail-value" style={{ color: 'var(--positive)' }}>${Number(uBalance.pinnacle_cashback).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="detail-label">RobinBet Balance</div>
                        <div className="detail-value" style={{ color: 'var(--robin)' }}>${Number(uBalance.robinbet).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="detail-label">Cashback PnL</div>
                        <div className="detail-value" style={{ color: Number(uBalance.cashback_pl) >= 0 ? 'var(--positive)' : 'var(--accent-warn)' }}>
                          {Number(uBalance.cashback_pl) >= 0 ? '+' : '-'}${Math.abs(Number(uBalance.cashback_pl)).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="detail-label">Bets Placed</div>
                        <div className="detail-value">{u.bet_count || 0} bets</div>
                      </div>
                    </div>

                    <div className="action-buttons" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <button
                        className="btn btn-link"
                        onClick={() => handleImpersonate(u.username)}
                        disabled={impersonating}
                        style={{ flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        Impersonate
                      </button>
                      <button
                        className="btn btn-link"
                        onClick={() => {
                          setSelectedUser(u);
                          setNewPinnacle(uBalance.pinnacle_cashback);
                          setNewRobin(uBalance.robinbet);
                          setShowBalanceModal(true);
                        }}
                        style={{ flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--positive)' }}
                      >
                        Edit Balance
                      </button>
                      <button
                        className="btn btn-link"
                        onClick={() => {
                          setSelectedUser(u);
                          setNewPassword('');
                          setShowPasswordModal(true);
                        }}
                        style={{ flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--accent-warn)' }}
                      >
                        Reset Pwd
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* MODAL: Create User */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '450px', maxWidth: '95vw' }}>
            <h2>
              Create User / Создать пользователя
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </h2>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Username / Логин</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. client1"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Display Name / Отображаемое имя</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Password / Пароль (min 6 chars)</label>
                <input
                  type="password"
                  required
                  placeholder="••••••"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Role / Роль</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                >
                  <option value="trader">trader / трейдер</option>
                  <option value="admin">admin / администратор</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pinnacle Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.pinnacle_cashback}
                    onChange={(e) => setCreateForm({ ...createForm, pinnacle_cashback: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>RobinBet Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.robinbet}
                    onChange={(e) => setCreateForm({ ...createForm, robinbet: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" style={{ marginTop: '8px', width: '100%', padding: '10px', justifyContent: 'center' }}>
                Create Account / Создать аккаунт
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Balance */}
      {showBalanceModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowBalanceModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px', maxWidth: '95vw' }}>
            <h2>
              Edit Balance / Балансы: @{selectedUser.username}
              <button className="modal-close" onClick={() => setShowBalanceModal(false)}>×</button>
            </h2>
            <form onSubmit={handleUpdateBalance} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pinnacle Cashback Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newPinnacle}
                  onChange={(e) => setNewPinnacle(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>RobinBet Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newRobin}
                  onChange={(e) => setNewRobin(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              <button className="btn btn-primary" type="submit" style={{ marginTop: '8px', width: '100%', padding: '10px', justifyContent: 'center' }}>
                Save Balances / Сохранить
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reset Password */}
      {showPasswordModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px', maxWidth: '95vw' }}>
            <h2>
              Reset Password / Сброс пароля: @{selectedUser.username}
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>×</button>
            </h2>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>New Password / Новый пароль (min 6 chars)</label>
                <input
                  type="password"
                  required
                  placeholder="••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              <button className="btn btn-primary" type="submit" style={{ marginTop: '8px', width: '100%', padding: '10px', justifyContent: 'center' }}>
                Reset Password / Обновить пароль
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
