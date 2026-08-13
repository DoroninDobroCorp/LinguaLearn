import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const SYSTEM_LIMIT = 200;
const SYSTEM_CATEGORIES = [
  ['all', 'All'],
  ['verification', 'Verification'],
  ['pricing_anomaly', 'Price anomalies'],
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

function rootCauseLabel(value) {
  return String(value || 'unknown')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
          <span className="system-rejection-activity active">CURRENT</span>
          <span className="system-rejection-category">{item.category || 'system'}</span>
          <span className="system-rejection-root-cause">
            {rootCauseLabel(item.root_cause)}
          </span>
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
            item.profile && `Profile ${item.profile}`,
            item.odds_label,
            item.source,
          ].filter(Boolean).join(' · ')}
        </div>
        <div className="system-rejection-reason">
          {item.reason || 'Exact RobinWork verification did not produce an actionable quote.'}
        </div>
        {(context.diagnostic_category || context.parser_event_found !== undefined
          || context.raw_offer_group_count !== undefined) && (
          <div className="system-rejection-upstream-evidence">
            {[
              context.diagnostic_category && `Upstream: ${rootCauseLabel(context.diagnostic_category)}`,
              context.parser_event_found !== undefined
                && `Parser event: ${context.parser_event_found ? 'found' : 'missing'}`,
              context.raw_offer_group_count !== undefined
                && `Offer groups: ${context.raw_offer_group_count}`,
            ].filter(Boolean).join(' · ')}
          </div>
        )}
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
  const [systemFilters, setSystemFilters] = useState({
    rootCause: 'all',
    bookmaker: 'all',
    profile: 'all',
  });
  const [systemFacets, setSystemFacets] = useState({
    root_causes: [],
    bookmakers: [],
    profiles: [],
  });
  const [systemPageMeta, setSystemPageMeta] = useState({ totalCount: 0, truncated: false });
  const [loading, setLoading] = useState({ user: false, system: false });
  const [loaded, setLoaded] = useState({ user: false, system: false });

  const loadTab = useCallback(async (
    tab,
    requestedCategory = 'all',
    { background = false, filters = {} } = {},
  ) => {
    const normalizedTab = normalizeTab(tab);
    if (!background) {
      setLoading((current) => ({ ...current, [normalizedTab]: true }));
    }
    try {
      if (normalizedTab === 'system') {
        const data = await api.getVerificationRejections({
          limit: SYSTEM_LIMIT,
          category: requestedCategory,
          rootCause: filters.rootCause || 'all',
          bookmaker: filters.bookmaker || 'all',
          profile: filters.profile || 'all',
        });
        const unavailable = data?.unavailable === true || data?.read_only !== true;
        setSystemUnavailable(unavailable);
        setSystemFacets({
          root_causes: Array.isArray(data?.facets?.root_causes) ? data.facets.root_causes : [],
          bookmakers: Array.isArray(data?.facets?.bookmakers) ? data.facets.bookmakers : [],
          profiles: Array.isArray(data?.facets?.profiles) ? data.facets.profiles : [],
        });
        const candidates = Array.isArray(data?.items)
          ? data.items
          : (Array.isArray(data?.rejections) ? data.rejections : []);
        // Fail closed if an older backend ever returns retained history: this
        // view is for currently blocked opportunities only.
        const currentBlocked = unavailable ? [] : candidates.filter((item) => (
          item?.robin_work_verification_blocked === true && item?.active === true
        ));
        setSystemItems(currentBlocked);
        setSystemPageMeta({
          totalCount: Number.isFinite(Number(data?.total_count)) ? Number(data.total_count) : currentBlocked.length,
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
      if (!background) showToast(error.message, 'error');
    } finally {
      if (!background) {
        setLoading((current) => ({ ...current, [normalizedTab]: false }));
      }
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

  useEffect(() => {
    if (!open || activeTab !== 'system') return undefined;
    const timer = window.setInterval(() => {
      loadTab('system', systemCategory, { background: true, filters: systemFilters });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [open, activeTab, systemCategory, systemFilters, loadTab]);

  if (!open) return null;

  const selectTab = (tab) => {
    const nextTab = normalizeTab(tab);
    setActiveTab(nextTab);
    if (!loaded[nextTab] || (nextTab === 'system' && systemUnavailable)) {
      loadTab(nextTab, nextTab === 'system' ? systemCategory : 'all', {
        filters: nextTab === 'system' ? systemFilters : {},
      });
    }
  };

  const selectSystemCategory = (category) => {
    const clearedFilters = { rootCause: 'all', bookmaker: 'all', profile: 'all' };
    setSystemCategory(category);
    setSystemFilters(clearedFilters);
    loadTab('system', category, { filters: clearedFilters });
  };

  const selectSystemFilter = (field, value) => {
    const nextFilters = { ...systemFilters, [field]: value };
    setSystemFilters(nextFilters);
    loadTab('system', systemCategory, { filters: nextFilters });
  };

  const downloadSystemDiagnostics = async () => {
    try {
      const data = await api.getVerificationRejections({
        limit: 1000,
        category: systemCategory,
        ...systemFilters,
      });
      const exported = {
        generated_at: new Date().toISOString(),
        source: 'current_snapshot',
        category: systemCategory,
        filters: systemFilters,
        total_count: data?.total_count || 0,
        facets: data?.facets || {},
        items: Array.isArray(data?.items) ? data.items : [],
      };
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `robinarb-current-blocks-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error.message, 'error');
    }
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
              Current system blocks only. This view is read-only: blocked opportunities cannot be restored, accepted, or bet. Historical diagnostics remain server-side for mapping coverage analysis.
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
            <div className="system-rejection-dimensions" aria-label="System log diagnostics filters">
              <label>
                Cause
                <select
                  value={systemFilters.rootCause}
                  onChange={(event) => selectSystemFilter('rootCause', event.target.value)}
                  disabled={loading.system}
                >
                  <option value="all">All causes</option>
                  {systemFacets.root_causes.map((facet) => (
                    <option key={facet.value} value={facet.value}>
                      {rootCauseLabel(facet.value)} ({facet.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bookmaker
                <select
                  value={systemFilters.bookmaker}
                  onChange={(event) => selectSystemFilter('bookmaker', event.target.value)}
                  disabled={loading.system}
                >
                  <option value="all">All bookmakers</option>
                  {systemFacets.bookmakers.map((facet) => (
                    <option key={facet.value} value={facet.value}>
                      {facet.value} ({facet.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profile
                <select
                  value={systemFilters.profile}
                  onChange={(event) => selectSystemFilter('profile', event.target.value)}
                  disabled={loading.system}
                >
                  <option value="all">All profiles</option>
                  {systemFacets.profiles.map((facet) => (
                    <option key={facet.value} value={facet.value}>
                      {facet.value} ({facet.count})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="system-rejection-export"
                onClick={downloadSystemDiagnostics}
                disabled={loading.system || systemUnavailable}
              >
                Export JSON
              </button>
            </div>
            {systemPageMeta.truncated && (
              <p className="system-rejection-truncated">
                Showing {systemItems.length} of {systemPageMeta.totalCount} current blocks in this category.
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
            {activeTab === 'system' ? 'No current system blocks' : 'Nothing hidden'}
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
