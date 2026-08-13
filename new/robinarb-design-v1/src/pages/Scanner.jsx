import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../api';
import Calculator from '../components/Calculator';
import CounterNavigationHint from '../components/CounterNavigationHint';
import { leagueDisplayItems, leagueDisplayTitle } from '../utils/leagueDisplay';
import { formatCounterOutcome, formatPinOutcome } from '../utils/outcomes';
import {
  bookmakerFilterMatchesOption,
  buildScannerPresentation,
  formatAge,
  formatFortedProfit,
  formatOvervalue,
  formatRelative,
  hasExactRobinQuote,
  pinnacleDisplayOdds,
  profitClass,
  robinPriceTitle,
} from '../utils/scannerPresentation';
import { isCardActivationKey, scannerPollDelayMs } from '../utils/polling';

const EMPTY_FILTERS = { sports: [], markets: [], bookmakers: [] };
const FILTERS_STORAGE_KEY = '*******************';
const INITIAL_NOW_MS = Date.now();
const ROBIN_WORK_ENABLED = true;

function loadStoredFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* ignore */ }
  return null;
}

function saveStoredFilters(state) {
  try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const PINNACLE_BOOKMAKER_RE = /pin(?:nacle)?|ps3838/i;

export default function Scanner({ balance, onBetPlaced, showToast, hiddenVersion = 0, onHiddenChanged, verifyMode = 'betslip' }) {
  const stored = loadStoredFilters() || {};
  const [arbs, setArbs] = useState([]);
  const [sport, setSport] = useState(stored.sport || '');
  const [market, setMarket] = useState(stored.market || '');
  const [bookmaker, setBookmaker] = useState(stored.bookmaker || '');
  const [search, setSearch] = useState(stored.search || '');
  const [minProfit, setMinProfit] = useState(typeof stored.minProfit === 'number' || typeof stored.minProfit === 'string' ? stored.minProfit : 0);
  const [sortBy, setSortBy] = useState(stored.sortBy || 'robin');
  const [liveMode, setLiveMode] = useState(stored.liveMode || 'all');
  const robinWork = ROBIN_WORK_ENABLED;
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCalc, setSelectedCalc] = useState(null);
  const [hideTarget, setHideTarget] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [lastUpdate, setLastUpdate] = useState(null);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState(null);
  const [feedStaleAfterSec, setFeedStaleAfterSec] = useState(30);
  const [nowMs, setNowMs] = useState(INITIAL_NOW_MS);
  const [source, setSource] = useState('unknown');
  const [totalCount, setTotalCount] = useState(0);
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTERS);
  const [refreshing, setRefreshing] = useState(false);

  const searchRef = useRef(null);
  const fetchSequenceRef = useRef(0);
  const isLiveSource = source === 'forted' || source === 'listener';
  const feedUpdatedMs = Number(feedUpdatedAt) > 0 ? Number(feedUpdatedAt) * 1000 : 0;
  const feedAgeSec = feedUpdatedMs ? Math.max(0, (nowMs - feedUpdatedMs) / 1000) : Number.POSITIVE_INFINITY;
  const isFeedFresh = isLiveSource && feedAgeSec <= feedStaleAfterSec;

  useEffect(() => {
    saveStoredFilters({ sport, market, bookmaker, search, minProfit, sortBy, liveMode });
  }, [sport, market, bookmaker, search, minProfit, sortBy, liveMode]);

  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fetchArbs = useCallback((opts = {}) => {
    // A user hide/restore changes hiddenVersion and intentionally refreshes
    // this callback even though the value is not sent to the API.
    void hiddenVersion;
    const isRefresh = Boolean(opts.refresh);
    const isExplicit = Boolean(opts.explicit);
    const signal = opts.signal;
    const requestSequence = ++fetchSequenceRef.current;
    if (isRefresh) setRefreshing(true);
    return api.getArbs({ refresh: isRefresh, robinWork, signal })
      .then(data => {
        if (requestSequence !== fetchSequenceRef.current) return null;
        setArbs(data.arbs);
        setSelectedCalc((current) => {
          if (!current) return current;
          const fresh = data.arbs.find((item) => item.id === current.id);
          // A chosen fork owns a high-priority exact verifier. A background
          // scanner tick must never close the calculator just because the
          // feed blinked. When it still exists, however, keep its event/counter
          // data current even while the exact Robin quote is warming up.
          return fresh || current;
        });
        setLastUpdate(new Date());
        setFeedUpdatedAt(Number(data.updated_at) || null);
        setFeedStaleAfterSec(Math.max(5, Number(data.feed_stale_after_sec) || 30));
        setSource(data.source || 'mock');
        setTotalCount(data.total_count ?? data.count ?? 0);
        const nextFilters = data.filters || EMPTY_FILTERS;
        setFilterOptions(nextFilters);
        setBookmaker((current) => {
          if (!current) return current;
          const bookmakerOptions = (nextFilters.bookmakers || [])
            .filter((option) => !PINNACLE_BOOKMAKER_RE.test(option));
          if (bookmakerOptions.length === 0) return current;
          return bookmakerOptions.some((option) => bookmakerFilterMatchesOption(current, option))
            ? current
            : '';
        });
        setLoading(false);
        return data;
      })
      .catch(err => {
        if (requestSequence !== fetchSequenceRef.current) return null;
        if (err?.code !== 'REQUEST_ABORTED' && (isRefresh || isExplicit)) {
          showToast(err.message, 'error');
        }
        setLoading(false);
        return null;
      })
      .finally(() => {
        if (isRefresh && requestSequence === fetchSequenceRef.current) setRefreshing(false);
      });
  }, [robinWork, hiddenVersion, showToast]);

  useEffect(() => {
    let stopped = false;
    let timer = null;
    let controller = null;
    let inFlight = false;
    let runAgain = false;

    const poll = async () => {
      if (stopped || paused || document.hidden) return;
      if (inFlight) {
        runAgain = true;
        return;
      }

      clearTimeout(timer);
      timer = null;
      inFlight = true;
      controller = new AbortController();
      const data = await fetchArbs({ signal: controller.signal });
      controller = null;
      inFlight = false;

      if (stopped || paused || document.hidden) return;
      if (runAgain) {
        runAgain = false;
        poll();
        return;
      }

      // Pending background exact pricing does not benefit from a 750ms GET
      // loop. Back off to four seconds until it settles; profile/feed changes
      // still recreate or explicitly trigger the loop immediately.
      const pricingPending = robinWork && (
        data === null || data?.robin_work?.pricing_pending === true
      );
      const delay = scannerPollDelayMs({
        hidden: document.hidden,
        robinWork,
        pricingPending,
      });
      if (delay !== null) timer = setTimeout(poll, delay);
    };

    const handleVisibilityChange = () => {
      clearTimeout(timer);
      timer = null;
      if (document.hidden) {
        runAgain = false;
        controller?.abort();
        return;
      }
      if (paused) return;
      if (inFlight) {
        runAgain = true;
      } else {
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!paused && !document.hidden) poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchArbs, paused, robinWork]);

  const resetLocalFilters = () => {
    setSport('');
    setMarket('');
    setBookmaker('');
    setSearch('');
    setMinProfit(0);
    setSortBy('robin');
    setLiveMode('all');
  };

  const openCalculatorFromKeyboard = (event, arb) => {
    // Nested controls keep their native keyboard behavior. Only activation
    // while the card/row itself owns focus opens the calculator.
    if (event.target !== event.currentTarget || !isCardActivationKey(event.key)) return;
    event.preventDefault();
    setSelectedCalc(arb);
  };

  const { sortedArbs, groupedArbs } = useMemo(() => buildScannerPresentation(arbs, {
    sport,
    market,
    bookmaker,
    liveMode,
    search,
    minProfit,
    sortBy,
    robinWork,
  }), [arbs, sport, market, bookmaker, liveMode, search, minProfit, sortBy, robinWork]);

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const hideArb = async (scope) => {
    if (!hideTarget) return;
    const targetId = hideTarget.id;
    const targetMatch = hideTarget.match;

    // Optimistic UI updates
    setHideTarget(null);
    if (selectedCalc?.id === targetId) setSelectedCalc(null);

    // Instantly remove the hidden arb(s) from the local arbs state list
    setArbs((prevArbs) => {
      if (scope === 'match') {
        return prevArbs.filter((a) => a.match !== targetMatch);
      } else {
        return prevArbs.filter((a) => a.id !== targetId);
      }
    });

    try {
      await api.hideArb(targetId, scope);
      onHiddenChanged?.();
      fetchArbs({ explicit: true });
      showToast(scope === 'match' ? 'Match hidden' : 'Fork hidden');
    } catch (error) {
      showToast(error.message, 'error');
      // If error, force a full refresh to restore state
      fetchArbs({ explicit: true });
    }
  };

  const hasActiveFilters = Boolean(sport || market || bookmaker || search || (Number(minProfit) !== 0) || liveMode !== 'all');

  return (
    <>
      <div className="page-header scanner-page-header">
        <div>
          <div className="page-kicker">LIVE OPPORTUNITY DESK</div>
          <h1>Scanner</h1>
        </div>
        <div className={`feed-health ${isFeedFresh ? 'ready' : isLiveSource ? 'delayed' : 'offline'}`}>
          <i />
          <span>{isFeedFresh ? 'Live Forted feed' : isLiveSource ? 'Forted feed delayed' : 'Feed unavailable'}</span>
        </div>
        <p>
          {feedUpdatedMs > 0
            ? <span>Updated {formatRelative(new Date(feedUpdatedMs), nowMs)}</span>
            : lastUpdate && <span>Response {formatRelative(lastUpdate, nowMs)}</span>}
          <span> · {groupedArbs.length}{totalCount ? ` / ${totalCount}` : ''} matches · {sortedArbs.length}{arbs.length ? ` / ${arbs.length}` : ''} forks</span>
          {paused && <span> · Paused</span>}
        </p>
      </div>

      <div className="filters filters-grid">
        <select value={liveMode} onChange={e => setLiveMode(e.target.value)} title="Live / prematch filter">
          <option value="all">All forks</option>
          <option value="live">Live only</option>
          <option value="prematch">Prematch only</option>
        </select>
        <select value={sport} onChange={e => setSport(e.target.value)}>
          <option value="">All sports</option>
          {filterOptions.sports.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select value={market} onChange={e => setMarket(e.target.value)}>
          <option value="">All markets</option>
          {filterOptions.markets.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select value={bookmaker} onChange={e => setBookmaker(e.target.value)}>
          <option value="">All bookmakers</option>
          {filterOptions.bookmakers.filter(option => !PINNACLE_BOOKMAKER_RE.test(option)).map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <input
          type="search"
          className="filter-search"
          placeholder="Search match, league, bookmaker  ( press / )"
          value={search}
          onChange={e => setSearch(e.target.value)}
          ref={searchRef}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort opportunities">
          <option value="robin">Sort: RobinBet profit</option>
          <option value="profit">Sort: Forted profit</option>
          <option value="newest">Sort: newest</option>
        </select>
        <label className="filter-min" title="Filters visible forks by RobinBet profit">
          <span>Min Robin</span>
          <div className="filter-min-input">
            <input
              type="number"
              step="0.1"
              min="-10"
              value={minProfit === 0 ? '0' : minProfit}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || val === '-') {
                  setMinProfit(val);
                } else {
                  const num = parseFloat(val);
                  setMinProfit(isNaN(num) ? '' : num);
                }
              }}
              placeholder="0"
            />
            <span>%</span>
          </div>
        </label>
        <div className="filter-actions">
          <span
            className="filter-settings on"
            title="Внешнее плечо ставится первым и подтверждается вручную. Auto-accept отключён, чтобы не принять наше плечо без фактического хеджа."
          >
            <span>Безопасный Donor-поток</span>
          </span>
          <button className="btn btn-link" onClick={resetLocalFilters} disabled={!hasActiveFilters}>Reset</button>
          <button
            className={`btn btn-link admin-toggle ${paused ? 'on' : ''}`}
            onClick={() => setPaused((value) => !value)}
            title={paused ? 'Resume live updates' : 'Pause live updates'}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            className="btn btn-verify"
            onClick={() => fetchArbs({ refresh: true })}
            title="Refresh now (force upstream poll)"
            disabled={refreshing}
          >{refreshing ? '…' : '↻'}</button>
        </div>
      </div>

      {selectedCalc && (
        <Calculator
          arb={selectedCalc}
          balance={balance}
          onClose={() => setSelectedCalc(null)}
          onBetPlaced={onBetPlaced}
          showToast={showToast}
          variant="sticky"
          verifyMode={verifyMode}
        />
      )}

      {/* Card-based layout for mobile + compact desktop */}
      <div className="arb-cards">
        {loading && arbs.length === 0 ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Loading Scanner...</span>
          </div>
        ) : sortedArbs.length === 0 ? (
          <div className="empty-msg empty-state">
            <div className="empty-state-title">No opportunities match your filters</div>
            <div className="empty-state-hint">
              {hasActiveFilters
                ? 'Try lowering Min profit % or clearing filters.'
                : 'Waiting for the next live fork — the feed updates every few seconds.'}
            </div>
            {hasActiveFilters && (
              <button className="btn btn-primary" onClick={resetLocalFilters}>Clear filters</button>
            )}
          </div>
        ) : groupedArbs.map(group => {
          const arb = group.primary;
          const extras = group.extras;
          const isExpanded = expandedGroups.has(group.key);
          const leagueItems = leagueDisplayItems(arb);
          const pinPick = formatPinOutcome(arb);
          const pinOdds = pinnacleDisplayOdds(arb);
          const counterPick = formatCounterOutcome(arb);
          const exactRobinQuote = hasExactRobinQuote(arb);
          return (
          <div
            key={group.key}
            className={`arb-card${isExpanded ? ' arb-card-expanded' : ''}${robinWork && !exactRobinQuote ? ' robin-not-selected' : ''}`}
            onClick={() => setSelectedCalc(arb)}
            onKeyDown={(event) => openCalculatorFromKeyboard(event, arb)}
            role="button"
            tabIndex={0}
            aria-label={`Open calculator for ${arb.match}: ${arb.display_market || arb.market}`}
          >
            <div className="arb-card-top">
              <span
                className={`profit-badge ${profitClass(arb.profit_capped ? -0.01 : arb.profit_pct)}`}
                title={arb.profit_capped ? 'Forted range: upstream caps the exact value at 0' : 'Forted profit'}
              >
                Feed {formatFortedProfit(arb)}
              </span>
              <span className={`profit-badge robin-badge ${exactRobinQuote ? profitClass(arb.robin_profit_pct || 0) : ''}`} title={robinPriceTitle(arb)}>
                Robin {exactRobinQuote ? `${Number(arb.robin_profit_pct ?? 0).toFixed(2)}%` : '—'}
              </span>
              <span className="arb-sport">{arb.sport}</span>
              {leagueItems.length > 0 && (
                <span className="league-source-row" title={leagueDisplayTitle(leagueItems)}>
                  {leagueItems.map((item) => (
                    <span className="league-chip" key={`${item.code}-${item.label}`}>
                      <span className="league-chip-book">{item.code}</span>
                      <span className="league-chip-name">{item.label}</span>
                    </span>
                  ))}
                </span>
              )}
              {arb.is_live && <span className="live-badge" title="In-play">LIVE</span>}
              {robinWork && !exactRobinQuote && (
                <span
                  className="feed-badge"
                  title={arb.robin_work_verification_block_reason || 'Exact BIA verification is unavailable'}
                >
                  NO EXACT QUOTE
                </span>
              )}
              {formatOvervalue(arb.pin_overvalue) && (
                <span className="feed-badge ov" title={`Pinnacle overvalue: ${arb.pin_overvalue}%`}>
                  {formatOvervalue(arb.pin_overvalue)}
                </span>
              )}
              {arb.match_time && <span className="feed-badge">{arb.match_time}</span>}
              <span className="age-badge">{formatAge(arb.age_sec)}</span>
              <button
                className="btn-hide-arb"
                onClick={(e) => { e.stopPropagation(); setHideTarget(arb); }}
                title="Hide"
              >
                ×
              </button>
              {extras.length > 0 && (
                <button
                  className={`btn btn-extras-toggle${isExpanded ? ' on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                  title={`${extras.length} more fork${extras.length === 1 ? '' : 's'} on this match`}
                >
                  {isExpanded ? '−' : '+'}{extras.length}
                </button>
              )}
            </div>
            <div className="arb-card-match">{arb.match}</div>
            <div className="arb-card-market">
              {arb.display_market || arb.market}
              {Array.isArray(arb?.multi_leg?.legs) && arb.multi_leg.legs.length > 2 && (
                <span className="feed-badge" style={{ marginLeft: 6 }}>{arb.multi_leg.legs.length} плеча</span>
              )}
            </div>
            <div className="arb-route" aria-label={`Fork: ${arb.bk2_label || arb.bk2} ${counterPick} against Robin ${pinPick}`}>
              <div className="arb-route-leg counter">
                <span className="arb-route-step">1 · {Array.isArray(arb?.counter_legs) && arb.counter_legs.length > 1 ? 'Все внешние плечи' : 'Внешнее плечо'}</span>
                {Array.isArray(arb?.counter_legs) && arb.counter_legs.length > 1 ? arb.counter_legs.map((leg) => (
                  <strong key={leg.index}>{leg.label || leg.bookmaker} · {leg.selection} @{Number(leg.odds).toFixed(3)}</strong>
                )) : (
                  <>
                    <strong>{arb.bk2_label || arb.bk2} · {counterPick}</strong>
                    <b>@{arb.bk2_odds.toFixed(3)}</b>
                  </>
                )}
              </div>
              <span className="arb-route-arrow">↔</span>
              <div className="arb-route-leg robin">
                <span className="arb-route-step">2 · Наше плечо</span>
                <strong>Robin · {pinPick}</strong>
                <b>@{exactRobinQuote ? Number(arb.robin_odds).toFixed(3) : '—'}</b>
              </div>
            </div>
            <div className="arb-pin-reference">
              Parser PIN ориентир: {pinPick} @{pinOdds.toFixed(3)} · точная BIA Single-цена откроется в калькуляторе
            </div>
            <CounterNavigationHint guidance={arb.counter_navigation} compact />
            <div className="arb-card-actions" onClick={e => e.stopPropagation()}>
              <a
                href={arb.counter_navigation?.url || arb.bk2_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-link"
                title={arb.counter_navigation?.provider_label
                  ? `${arb.bk2_label || arb.bk2} · ${arb.counter_navigation.provider_label}`
                  : (arb.bk2_label || arb.bk2)}
              >
                Открыть {arb.bk2_label || arb.bk2} ↗
              </a>
            </div>

            {isExpanded && extras.length > 0 && (
              <div className="arb-card-extras" onClick={e => e.stopPropagation()}>
                {extras.map(extra => {
                  const extraPinPick = formatPinOutcome(extra);
                  const extraPinOdds = pinnacleDisplayOdds(extra);
                  const extraCounterPick = formatCounterOutcome(extra);
                  const extraExactRobinQuote = hasExactRobinQuote(extra);
                  return (
                    <div
                      key={extra.id}
                      className={`arb-extra-row${robinWork && !extraExactRobinQuote ? ' robin-not-selected' : ''}`}
                      onClick={() => setSelectedCalc(extra)}
                      onKeyDown={(event) => openCalculatorFromKeyboard(event, extra)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open calculator for ${extra.match}: ${extra.display_market || extra.market}`}
                      title="Open calculator"
                    >
                      <div className="arb-extra-main">
                        <span
                          className={`profit-badge sm ${profitClass(extra.profit_capped ? -0.01 : extra.profit_pct)}`}
                          title={extra.profit_capped ? 'Forted range: upstream caps the exact value at 0' : 'Forted profit'}
                        >
                          {formatFortedProfit(extra)}
                        </span>
                        <span className="arb-extra-market" title={`${extra.market} · PIN: ${extraPinPick} / ${extra.bk2}: ${extraCounterPick}`}>
                          <span className="arb-extra-market-label">{extra.display_market || extra.market}</span>
                          {robinWork && !extraExactRobinQuote && (
                            <span
                              className="arb-extra-feed"
                              title={extra.robin_work_verification_block_reason || 'Exact BIA verification is unavailable'}
                            >
                              ROBIN PREVIEW ONLY
                            </span>
                          )}
                          {formatOvervalue(extra.pin_overvalue) && (
                            <span className="arb-extra-feed">{formatOvervalue(extra.pin_overvalue)}</span>
                          )}
                          <span className="arb-extra-leg">PIN: {extraPinPick}</span>
                          <span className="arb-extra-leg-sep">·</span>
                          <span className="arb-extra-leg">{extra.bk2}: {extraCounterPick}</span>
                        </span>
                      </div>
                      <div className="arb-extra-odds">
                        <span className="arb-extra-odd" title="Pinnacle">{extraPinOdds.toFixed(3)}</span>
                        <span className="arb-extra-odd" title={extra.bk2}>{extra.bk2_odds.toFixed(3)}</span>
                        <span className="arb-extra-odd robin" title="Robin">{extraExactRobinQuote ? Number(extra.robin_odds).toFixed(3) : '—'}</span>
                      </div>
                      <div className="arb-extra-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="btn-hide-arb sm"
                          onClick={() => setHideTarget(extra)}
                          title="Hide"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {hideTarget && (
        <div className="modal-overlay" onClick={() => setHideTarget(null)}>
          <div className="modal hide-choice-modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              Hide
              <button className="modal-close" onClick={() => setHideTarget(null)}>×</button>
            </h2>
            <div className="hide-choice-match">{hideTarget.match}</div>
            <div className="hide-choice-meta">
              {[hideTarget.market, hideTarget.side1, hideTarget.bk2, hideTarget.bk2_odds?.toFixed?.(3)].filter(Boolean).join(' · ')}
            </div>
            <div className="hide-choice-actions">
              <button className="btn btn-link" onClick={() => hideArb('fork')}>Hide fork</button>
              <button className="btn btn-primary" onClick={() => hideArb('match')}>Hide match</button>
            </div>
          </div>
        </div>
      )}


    </>
  );
}
