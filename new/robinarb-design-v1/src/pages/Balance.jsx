import { useState } from 'react';
import { api } from '../api';

const EMPTY_IN_PLAY = {
  pinnacle: { count: 0, stake_sum: 0 },
  robinbet: { count: 0, stake_sum: 0 },
  total: { count: 0, stake_sum: 0 },
};

export default function Balance({ balance, sessionUser, showToast, onMutate }) {
  const inPlay = balance.in_play || EMPTY_IN_PLAY;
  const cashbackPl = Number(balance.cashback_pl || 0);
  const cashbackPlLabel = `${cashbackPl >= 0 ? '+' : '-'}$${Math.abs(cashbackPl).toFixed(2)}`;

  const [settlingCashback, setSettlingCashback] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const handleSettleCashback = async () => {
    setSettlingCashback(true);
    try {
      const res = await api.settleCashback();
      showToast?.(res.message, 'success');
      onMutate?.();
    } catch (err) {
      showToast?.(err.message || 'Failed to settle cashback', 'error');
    } finally {
      setSettlingCashback(false);
    }
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1>Balance</h1>
          <p style={{ marginTop: '2px' }}>Your balances and active bets for {sessionUser?.display_name || 'this user'}.</p>
        </div>
        <button
          className="btn btn-link btn-verify"
          style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', height: 'fit-content' }}
          onClick={() => setShowHelpModal(true)}
        >
          Help / Помощь
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="label">Total balance</div>
          <div className="value positive">${balance.total.toFixed(2)}</div>
          {inPlay.total.count > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              In play: {inPlay.total.count} bet{inPlay.total.count === 1 ? '' : 's'} · ${inPlay.total.stake_sum.toFixed(2)}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="label">Pinnacle 50%</div>
          <div className="value">${balance.pinnacle_cashback.toFixed(2)}</div>
          {inPlay.pinnacle.count > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              In play: {inPlay.pinnacle.count} · ${inPlay.pinnacle.stake_sum.toFixed(2)}
            </div>
          )}
          <div style={{ fontSize: '0.72rem', color: cashbackPl >= 0 ? 'var(--positive)' : 'var(--accent-warn)', marginTop: 4 }}>
            Cashback PnL: {cashbackPlLabel}
          </div>
          {(sessionUser?.role === 'superuser' || sessionUser?.role === 'admin') && (() => {
            const isAvailable = cashbackPl > 0;
            return (
              <button
                className="btn btn-link btn-pin"
                style={{
                  marginTop: 6,
                  fontSize: '0.7rem',
                  padding: '3px 8px',
                  width: '100%',
                  justifyContent: 'center',
                  opacity: isAvailable ? 1 : 0.4,
                  cursor: isAvailable ? 'pointer' : 'default',
                  pointerEvents: isAvailable ? 'auto' : 'none',
                }}
                onClick={handleSettleCashback}
                disabled={settlingCashback || !isAvailable}
              >
                {settlingCashback ? 'Settling…' : 'Settle & Reset Cashback / Рассчитать и обнулить кешбэк'}
              </button>
            );
          })()}
        </div>
        <div className="stat-card">
          <div className="label">RobinBet</div>
          <div className="value robin">${balance.robinbet.toFixed(2)}</div>
          {inPlay.robinbet.count > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              In play: {inPlay.robinbet.count} · ${inPlay.robinbet.stake_sum.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal user-guide-modal" onClick={(e) => e.stopPropagation()} style={{ width: '600px', maxWidth: '95vw' }}>
            <h2>
              Guide / Инструкция
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>×</button>
            </h2>

            <div className="guide-columns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
              <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.85rem' }}>English</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45', marginBottom: '8px' }}>
                  Open Scanner and choose a fork. Calculator opens immediately with parser previews while it verifies only that selected outcome in one BIA Single basket.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45', marginBottom: '8px' }}>
                  First place the displayed external bookmaker leg. Then enter its actual stake and odds in Calculator; do not enter the planned values if the bookmaker accepted something different.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45', marginBottom: '8px' }}>
                  PIN is enabled only with a fresh exact BIA Single price. Robin is calculated from the complete parser market and is enabled only when that exact market binding is ready.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45' }}>
                  Confirm the fixed external leg, review any final price recalculation, and accept PIN or Robin. PIN credits its configured cashback; accepted bets remain in play until settlement.
                </p>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '16px' }}>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.85rem' }}>Русский</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45', marginBottom: '8px' }}>
                  Откройте Scanner и выберите вилку. Calculator появится сразу с parser preview и будет проверять только выбранный исход в одной BIA Single-корзине.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45', marginBottom: '8px' }}>
                  Сначала поставьте показанное внешнее плечо. Затем внесите в Calculator фактически принятые букмекером сумму и коэффициент, даже если они отличаются от предварительного плана.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45', marginBottom: '8px' }}>
                  PIN доступен только по свежей точной цене BIA Single. Robin рассчитывается из полного parser-рынка и доступен только после точной привязки этого рынка.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.45' }}>
                  Подтвердите зафиксированное внешнее плечо, проверьте финальный пересчёт цены и примите PIN или Robin. PIN начисляет настроенный cashback; ставка остаётся in-play до расчёта.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
