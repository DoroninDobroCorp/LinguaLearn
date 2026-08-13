import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const SYSTEM_LIMIT = 200;
const SYSTEM_CATEGORIES = [
  ['all', 'All'],
  ['verification', 'Verification'],
  ['safety_filter', 'Safety'],
  ['feed_filter', 'Feed'],
];

function normalizeTab(value) {
  return value === 'system' ? 'system' : 'user';
}

function formatMoment(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'unknown';
  return timestamp.toLocaleString();
}

function rejectionContext(item) {
  return item?.context && typeof item.context === 'object' && !Array.isArray(item.context)
    ? item.context
    : {};
}

function SystemRejectionItem({ item }) {
  const context = rejectionContext(item);
  const contextKeys = Object.keys(context);
  const firstSeen = item.first_seen_at ?? item.first_seen;
  const lastSeen = item.last_seen_at ?? item.last_seen;
  const occurrences = Math.max(1, Number.parseInt(item.occurrences, 10) || 1);
  const errorCode = item.error_code || item.code || 'VERIFICATION_BLOCKED';
  const stage = item.stage || 'exact-verification';

  return (
    <div className="hidden-item system-rejection-item">
      <div className="hidden-item-main">
        <div className="system-rejection-badges">
          <span className="feed-badge system-blocked">SYSTEM</span>
          <span className={`system-rejection-activity ${item.active ? 'active' : 'history'}`}>
            {item.active ? 'ACTIVE' : 'HISTORY'}
          </span>
          <span className="system-rejection-category">{item.category || 'system'}</span>
          <span className="system-rejection-stage">{stage}</span>
          <code className="system-rejection-code">{errorCode}</code>
        </div>
        <div className="hidden-item-title">{item.match || 'Unknown match'}</div>
        <div className="hidden-item-meta system-rejection-meta">
          {[
            item.sport,
            item.league,
            item.market,
            item.selection,
            item.counter_bk,
            item.counter_selection,
            item.odds_label,
            item.source,
          ].filter(Boolean).join(' · ')}
        </div>
        <div className="system-rejection-reason">
          {item.reason || 'Exact RobinWork verification did not produce an actionable quote.'}
        </div>
        <div className="system-rejection-times">
          <span>First: {formatMoment(firstSeen)}</span>
          <span>Last: {formatMoment(lastSeen)}</span>
          <strong>×{occurrences}</strong>
        </div>
        {contextKeys.length > 0 && (
          <details className="system-rejection-context">
            <summary>Mapping context</summary>
            <pre>{JSON.stringify(context, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default function HiddenArbsModal({ open, initialTab = 'user', onClose, onRestored, showToast }) {
  const [activeTab, setActiveTab] = useState(() => normalizeTab(initialTab));
  const [userItems, setUserItems] = useState([]);
  const [systemItems, setSystemItems] = useState([]);
  const [systemUnavailable, setSystemUnavailable] = useState(false);
  const [systemCategory, setSystemCategory] = useState('all');
  const [systemPageMeta, setSystemPageMeta] = useState({ totalCount: 0, truncated: false });
  const [loading, setLoading] = useState({ user: false, system: false });
  const [loaded, setLoaded] = useState({ user: false, system: false });

  const loadTab = useCallback(async (tab, requestedCategory = 'all') => {
    const normalizedTab = normalizeTab(tab);
    setLoading((current) => ({ ...current, [normalizedTab]: true }));
    try {
      if (normalizedTab === 'system') {
        const data = await api.getVerificationRejections({
          limit: SYSTEM_LIMIT,
          category: requestedCategory,
        });
        setSystemUnavailable(data?.unavailable === true);
        const candidates = Array.isArray(data?.items)
          ? data.items
          : (Array.isArray(data?.rejections) ? data.rejections : []);
        // `robin_work_selected === false` is not a verification failure: a
        // structurally exact quote may simply rank outside the current top N.
        setSystemItems(candidates.filter((item) => item?.robin_work_verification_blocked === true));
        setSystemPageMeta({
          totalCount: Number.isFinite(Number(data?.total_count)) ? Number(data.total_count) : candidates.length,
          truncated: data?.truncated === true,
        });
      } else {
        const data = await api.getHiddenArbs();
        setUserItems(Array.isArray(data?.items) ? data.items : []);
      }
      setLoaded((current) => ({ ...current, [normalizedTab]: true }));
    } catch (error) {
      if (normalizedTab === 'system') {
        setSystemUnavailable(true);
        setSystemPageMeta({ totalCount: 0, truncated: false });
      }
      showToast(error.message, 'error');
    } finally {
      setLoading((current) => ({ ...current, [normalizedTab]: false }));
    }
  }, [showToast]);

  useEffect(() => {
    if (!open) return;
    const requestedTab = normalizeTab(initialTab);
    const backgroundTab = requestedTab === 'system' ? 'user' : 'system';
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      loadTab(requestedTab, 'all');
      // Prime the other tab as well so its badge never claims there are zero
      // records merely because the user has not opened it yet.
      loadTab(backgroundTab, 'all');
    });
    return () => {
      cancelled = true;
    };
  }, [open, initialTab, loadTab]);

  if (!open) return null;

  const selectTab = (tab) => {
    const nextTab = normalizeTab(tab);
    setActiveTab(nextTab);
    if (!loaded[nextTab] || (nextTab === 'system' && systemUnavailable)) {
      loadTab(nextTab, nextTab === 'system' ? systemCategory : 'all');
    }
  };

  const selectSystemCategory = (category) => {
    setSystemCategory(category);
    loadTab('system', category);
  };

  const restoreItem = async (item) => {
    try {
      await api.restoreHiddenArb(item.id);
      setUserItems((current) => current.filter((entry) => entry.id !== item.id));
      onRestored?.();
      showToast('Restored');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const items = activeTab === 'system' ? systemItems : userItems;
  const isLoading = loading[activeTab];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal hidden-modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          Hidden &amp; blocked
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </h2>

        <div className="hidden-tabs" role="tablist" aria-label="Hidden opportunities">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'user'}
            className={`hidden-tab ${activeTab === 'user' ? 'active' : ''}`}
            onClick={() => selectTab('user')}
          >
            Hidden by me <span>{loaded.user ? userItems.length : '…'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'system'}
            className={`hidden-tab ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => selectTab('system')}
          >
            System blocked <span>{loaded.system ? systemPageMeta.totalCount : '…'}</span>
          </button>
        </div>

        {activeTab === 'system' && (
          <>
            <p className="system-rejection-note">
              Read-only system log. Exact-verification blocks remain visible in the Scanner; feed and safety filters may be withheld. Nothing here can be restored or bet from this list.
            </p>
            <div className="system-rejection-filters" aria-label="System log category">
              {SYSTEM_CATEGORIES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={systemCategory === value ? 'active' : ''}
                  onClick={() => selectSystemCategory(value)}
                  disabled={loading.system}
                >
                  {label}
                </button>
              ))}
            </div>
            {systemPageMeta.truncated && (
              <p className="system-rejection-truncated">
                Showing the newest {systemItems.length} of {systemPageMeta.totalCount} records in this category.
              </p>
            )}
          </>
        )}

        {isLoading ? (
          <div className="empty-msg">Loading...</div>
        ) : activeTab === 'system' && systemUnavailable ? (
          <div className="empty-msg system-rejection-unavailable">
            System diagnostics are temporarily unavailable. Scanner safety remains active; try this log again shortly.
          </div>
        ) : items.length === 0 ? (
          <div className="empty-msg">
            {activeTab === 'system' ? 'No system blocks recorded' : 'Nothing hidden'}
          </div>
        ) : (
          <div className="hidden-list">
            {activeTab === 'system'
              ? systemItems.map((item) => (
                <SystemRejectionItem key={item.id} item={item} />
              ))
              : userItems.map((item) => (
                <div key={item.id} className="hidden-item">
                  <div className="hidden-item-main">
                    <span className={`feed-badge ${item.scope === 'match' ? 'muted' : 'robin-work'}`}>
                      {item.scope === 'match' ? 'MATCH' : 'FORK'}
                    </span>
                    <div className="hidden-item-title">{item.match || 'Unknown match'}</div>
                    <div className="hidden-item-meta">
                      {[item.sport, item.market, item.selection, item.counter_bk, item.odds_label].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button className="btn btn-link" type="button" onClick={() => restoreItem(item)}>Restore</button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
