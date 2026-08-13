import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { formatCounterOutcome } from '../utils/outcomes';

const getBetCashbackValue = (bet) => {
  if (bet.side !== 'pinnacle') return 0;
  if (bet.status === 'won') {
    const profit = bet.stake * (bet.odds - 1);
    return -0.5 * profit;
  }
  if (bet.status === 'lost') {
    return 0.5 * bet.stake;
  }
  return 0.0;
};

const getBetDisplayCashback = (bet) => {
  if (bet.side !== 'pinnacle') return 0;
  if (bet.status === 'won') {
    const profit = bet.stake * (bet.odds - 1);
    return -0.5 * profit;
  }
  return 0.5 * bet.stake;
};

export default function History() {
  const [tab, setTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBets = useCallback(() => {
    setLoading(true);
    const side = tab === 'all' ? null : tab;
    api.getBets(side)
      .then((data) => setBets(data.bets))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  const visibleBets = bets.filter((bet) => {
    if (statusFilter === 'all') return true;
    return (bet.status || 'accepted') === statusFilter;
  });

  const totalStaked = visibleBets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalCashback = visibleBets.reduce((sum, bet) => sum + getBetCashbackValue(bet), 0);
  const pinCount = visibleBets.filter((bet) => bet.side === 'pinnacle').length;
  const robinCount = visibleBets.filter((bet) => bet.side === 'robinbet').length;
  const inPlayCount = visibleBets.filter((bet) => (bet.status || 'accepted') === 'accepted').length;

  return (
    <>
      <div className="page-header">
        <h1>Bet History</h1>
        <p>Per-user betting activity, persisted across restarts.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="label">Bets shown</div>
          <div className="value">{visibleBets.length}</div>
          {inPlayCount > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {inPlayCount} in play
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="label">Total staked</div>
          <div className="value">${totalStaked.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Cashback</div>
          <div className={`value ${totalCashback >= 0 ? 'positive' : 'negative'}`}>
            {totalCashback >= 0 ? '+' : '-'}${Math.abs(totalCashback).toFixed(2)}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Pinnacle / RobinBet</div>
          <div className="value robin">{pinCount} / {robinCount}</div>
        </div>
      </div>

      <div className="history-tabs">
        {['all', 'pinnacle', 'robinbet'].map((value) => (
          <button
            key={value}
            className={`history-tab ${tab === value ? 'active' : ''}`}
            onClick={() => setTab(value)}
          >
            {value === 'all' ? 'All' : value === 'pinnacle' ? 'PIN' : 'Robin'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
          {['all', 'accepted', 'won', 'lost'].map((value) => (
            <button
              key={value}
              className={`history-tab ${statusFilter === value ? 'active' : ''}`}
              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
              onClick={() => setStatusFilter(value)}
            >
              {value === 'all' ? 'Any' : value === 'accepted' ? 'In play' : value.charAt(0).toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading history...</span>
        </div>
      ) : visibleBets.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>
          No bets match the current filters.
        </p>
      ) : (
        visibleBets.map((bet) => {
          const status = bet.status || 'accepted';
          const counterOutcome = formatCounterOutcome({ bk2: bet.counter_bk, bk2_selection: bet.counter_selection });
          const statusColor = status === 'won'
            ? 'var(--positive)'
            : status === 'lost'
              ? 'var(--accent-warn)'
              : 'var(--text-secondary)';
          return (
            <div key={bet.id} className={`bet-card ${bet.side === 'pinnacle' ? 'side-pin' : 'side-robin'}`}>
              <div className="bet-card-header">
                <span className="match-name">{bet.match}</span>
                <span className="sport-tag">{bet.sport}</span>
              </div>
              <div className="bet-details">
                <div>
                  <div className="detail-label">Book / Side</div>
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
                <div>
                  <div className="detail-label">Return</div>
                  <div className="detail-value">${bet.potential_return.toFixed(2)}</div>
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
                {bet.fork_profit_pct !== null && bet.fork_profit_pct !== undefined && (
                  <div>
                    <div className="detail-label">Fork size</div>
                    <div className="detail-value">{Number(bet.fork_profit_pct).toFixed(2)}%</div>
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
              </div>
              {status === 'accepted' && (
                <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Waiting for settlement.
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
