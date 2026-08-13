import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../api';
import Calculator from '../components/Calculator';
import PinnaclePricePopup from '../components/PinnaclePricePopup';
import BookmakerSwitch from '../components/BookmakerSwitch';
import CounterNavigationHint from '../components/CounterNavigationHint';
import { leagueDisplayItems, leagueDisplayTitle } from '../utils/leagueDisplay';
import { formatCounterOutcome, formatPinOutcome } from '../utils/outcomes';

const EMPTY_FILTERS = { sports: [], markets: [], bookmakers: [] };
const EMPTY_UPSTREAM_DRAFT = { sportsText: '', bookmakersText: '', mode: '', filterId: '' };
const FILTERS_STORAGE_KEY = '*******************';
const ROBIN_WORK_KEY = 'robinarb.robinWork';
const ROBIN_WORK_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

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

function splitFilterList(value) {
  return value
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatAge(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function formatRelative(date, nowMs) {
  if (!date) return '';
  const diff = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function profitClass(pct) {
  const val = Number(pct ?? 0);
  if (val < 0) return 'negative';
  if (val > 2) return 'high';
  return 'low';
}

function formatFortedProfit(arb) {
  if (arb?.profit_capped) {
    const min = Number(arb.profit_range_min ?? -3);
    const max = Number(arb.profit_range_max ?? 0);
    return `${min.toFixed(0)}..${max.toFixed(0)}%`;
  }
  return `${Number(arb?.profit_pct ?? 0).toFixed(2)}%`;
}

function formatOvervalue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n > 0 ? '+' : ''}${n}% OV`;
}

function normalizeGroupPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

function bookmakerFilterMatchesOption(filterValue, option) {
  const filter = normalizeFilterValue(filterValue);
  const candidate = normalizeFilterValue(option);
  if (!filter || !candidate) return false;
  return candidate.includes(filter) || filter.includes(candidate);
}

function arbMatchesClientSearch(arb, query) {
  const needle = normalizeFilterValue(query);
  if (!needle) return true;
  const haystack = [
    arb.match,
    arb.league,
    arb.bk1_event_name,
    arb.bk2_event_name,
    ...(Array.isArray(arb.league_sources)
      ? arb.league_sources.flatMap((source) => [source?.league, source?.event_name, source?.bookmaker])
      : []),
    arb.sport,
    arb.market,
    arb.display_market,
    arb.bk2,
    arb.side1,
    arb.side2,
    arb.home,
    arb.away,
    arb.team1_en,
    arb.team2_en,
  ].map(normalizeFilterValue).join(' ');
  return haystack.includes(needle);
}

function arbGroupKey(arb) {
  const sport = normalizeGroupPart(arb.league || arb.sport);
  const bookmaker = normalizeGroupPart(arb.bk2);
  const home = normalizeGroupPart(arb.home || arb.team1_en);
  const away = normalizeGroupPart(arb.away || arb.team2_en);
  const match = normalizeGroupPart(arb.match);
  const eventDate = normalizeGroupPart(String(arb.event_dt || '').split(/\s+/)[0]);

  if (home || away) {
    return ['event', sport, eventDate, home, away, bookmaker].join('|');
  }
  if (match) {
    return ['match', sport, eventDate, match, bookmaker].join('|');
  }
  return ['id', normalizeGroupPart(arb.event_id), bookmaker].join('|');
}

function loadAutoAccept() {
  try { return localStorage.getItem('robinarb.autoAccept') === '1'; } catch { return false; }
}

function loadRobinWork() {
  try { return localStorage.getItem(ROBIN_WORK_KEY) === '1'; } catch { return false; }
}

const QUICK_PROFIT_STAKE = 1000;
const QUICK_STAKE_KEY = 'robinarb.quickStake';
const QUICK_BETS_HIDDEN_KEY = 'robinarb.quickBetsHidden';
const QUICK_STAKE_MAX = 50;
const QUICK_STAKE_DEFAULT = QUICK_STAKE_MAX;
const PINNACLE_BOOKMAKER_RE = /pin(?:nacle)?|ps3838/i;

function loadQuickStake() {
  try {
    const raw = localStorage.getItem(QUICK_STAKE_KEY);
    if (!raw) return QUICK_STAKE_DEFAULT;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > QUICK_STAKE_MAX) return QUICK_STAKE_DEFAULT;
    return parsed;
  } catch { return QUICK_STAKE_DEFAULT; }
}

function loadQuickBetsHidden() {
  try { return localStorage.getItem(QUICK_BETS_HIDDEN_KEY) === '1'; } catch { return false; }
}

function parseQuickStakeInput(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 10 ? parsed : null;
}

function normalizeQuickStakeInput(value) {
  const parsed = parseQuickStakeInput(value);
  return parsed === null ? String(QUICK_STAKE_DEFAULT) : String(parsed);
}

function formatStakeLabel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '$—';
  return parsed % 1 === 0 ? `$${parsed.toFixed(0)}` : `$${parsed.toFixed(2)}`;
}

function quickPinProfit(arb, stake = QUICK_PROFIT_STAKE) {
  const odds1 = pinnacleDisplayOdds(arb);
  const odds2 = Number(arb.bk2_odds);
  if (!(odds1 > 1 && odds2 > 1 && stake > 0)) return null;
  const inv1 = 1 / odds1;
  const inv2 = 1 / odds2;
  const total = inv1 + inv2;
  const s1 = (stake * inv1) / total;
  return s1 * odds1 - stake;
}

function pinnacleDisplayOdds(arb) {
  const verified = Number(arb?.robin_work_verified_pin_odds);
  if (!arb?.robin_work_verification_blocked && Number.isFinite(verified) && verified > 1) {
    return verified;
  }
  return Number(arb?.bk1_odds);
}

function quickRobinProfit(arb, stake = QUICK_PROFIT_STAKE) {
  const robinOdds = Number(arb.robin_odds);
  const odds2 = Number(arb.bk2_odds);
  if (!(robinOdds > 1 && odds2 > 1 && stake > 0)) return null;
  const inv1 = 1 / robinOdds;
  const inv2 = 1 / odds2;
  const total = inv1 + inv2;
  const s1 = (stake * inv1) / total;
  return s1 * robinOdds - stake;
}

export default function Scanner({ balance, sessionUser, onBetPlaced, showToast, hiddenVersion = 0, onHiddenChanged, verifyMode = 'betslip' }) {
  const stored = loadStoredFilters() || {};
  const [arbs, setArbs] = useState([]);
  const [sport, setSport] = useState(stored.sport || '');
  const [market, setMarket] = useState(stored.market || '');
  const [bookmaker, setBookmaker] = useState(stored.bookmaker || '');
  const [search, setSearch] = useState(stored.search || '');
  const [minProfit, setMinProfit] = useState(typeof stored.minProfit === 'number' || typeof stored.minProfit === 'string' ? stored.minProfit : 0);
  const [sortBy, setSortBy] = useState(stored.sortBy || 'robin');
  const [liveMode, setLiveMode] = useState(stored.liveMode || 'all');
  const [autoAccept, setAutoAccept] = useState(loadAutoAccept());
  const [robinWork, setRobinWork] = useState(loadRobinWork());
  const [robinWorkIdleNotice, setRobinWorkIdleNotice] = useState(false);
  const [robinWorkMeta, setRobinWorkMeta] = useState({ enabled: false, top_n: 5, selected: [] });
  const [quickStakeInput, setQuickStakeInput] = useState(() => String(loadQuickStake()));
  const [quickBetsHidden, setQuickBetsHidden] = useState(loadQuickBetsHidden());
  const [quickConfirm, setQuickConfirm] = useState(null);
  const [quickPlacing, setQuickPlacing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCalc, setSelectedCalc] = useState(null);
  const [selectedPinnacle, setSelectedPinnacle] = useState(null);
  const [hideTarget, setHideTarget] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [lastUpdate, setLastUpdate] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [source, setSource] = useState('unknown');
  const [totalCount, setTotalCount] = useState(0);
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [fortedFilters, setFortedFilters] = useState(null);
  const [fortedDraft, setFortedDraft] = useState(EMPTY_UPSTREAM_DRAFT);
  const [savingForted, setSavingForted] = useState(false);
  const [showAdmin, setShowAdmin] = useState(() => {
    try { return localStorage.getItem('robinarb.showAdmin') === '1'; } catch { return false; }
  });
  const canManageForted = sessionUser?.role === 'admin' || sessionUser?.role === 'superuser';

  const toggleAdmin = () => {
    setShowAdmin((value) => {
      const next = !value;
      try { localStorage.setItem('robinarb.showAdmin', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const searchRef = useRef(null);
  const robinWorkRef = useRef(robinWork);
  const robinWorkIdleTimerRef = useRef(null);
  const fetchSequenceRef = useRef(0);
  const isLiveSource = source === 'forted' || source === 'listener';

  useEffect(() => {
    saveStoredFilters({ sport, market, bookmaker, search, minProfit, sortBy, liveMode });
  }, [sport, market, bookmaker, search, minProfit, sortBy, liveMode]);

  useEffect(() => {
    try { localStorage.setItem('robinarb.autoAccept', autoAccept ? '1' : '0'); } catch { /* ignore */ }
  }, [autoAccept]);

  useEffect(() => {
    try { localStorage.setItem(ROBIN_WORK_KEY, robinWork ? '1' : '0'); } catch { /* ignore */ }
  }, [robinWork]);

  useEffect(() => {
    robinWorkRef.current = robinWork;
  }, [robinWork]);

  useEffect(() => {
    if (!robinWork) {
      if (robinWorkIdleTimerRef.current) clearTimeout(robinWorkIdleTimerRef.current);
      robinWorkIdleTimerRef.current = null;
      return undefined;
    }

    let lastActivityAt = 0;
    const resetIdleTimer = () => {
      const now = Date.now();
      if (now - lastActivityAt < 1000) return;
      lastActivityAt = now;
      if (robinWorkIdleTimerRef.current) clearTimeout(robinWorkIdleTimerRef.current);
      robinWorkIdleTimerRef.current = setTimeout(() => {
        if (!robinWorkRef.current) return;
        setRobinWork(false);
        setRobinWorkIdleNotice(true);
      }, ROBIN_WORK_IDLE_TIMEOUT_MS);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resetIdleTimer();
    };

    resetIdleTimer();
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdleTimer, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimer));
      document.removeEventListener('visibilitychange', handleVisibility);
      if (robinWorkIdleTimerRef.current) clearTimeout(robinWorkIdleTimerRef.current);
      robinWorkIdleTimerRef.current = null;
    };
  }, [robinWork, showToast]);

  useEffect(() => {
    const parsed = parseQuickStakeInput(quickStakeInput);
    if (parsed === null) return;
    try { localStorage.setItem(QUICK_STAKE_KEY, String(parsed)); } catch { /* ignore */ }
  }, [quickStakeInput]);

  useEffect(() => {
    try { localStorage.setItem(QUICK_BETS_HIDDEN_KEY, quickBetsHidden ? '1' : '0'); } catch { /* ignore */ }
  }, [quickBetsHidden]);

  useEffect(() => {
    if (!bookmaker) return;
    const bookmakerOptions = (filterOptions.bookmakers || [])
      .filter((option) => !PINNACLE_BOOKMAKER_RE.test(option));
    if (bookmakerOptions.length === 0) return;
    if (bookmakerOptions.some((option) => bookmakerFilterMatchesOption(bookmaker, option))) return;
    setBookmaker('');
  }, [bookmaker, filterOptions.bookmakers]);

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
    const isRefresh = Boolean(opts.refresh);
    const isExplicit = Boolean(opts.explicit);
    const requestSequence = ++fetchSequenceRef.current;
    if (isRefresh) setRefreshing(true);
    return api.getArbs({ refresh: isRefresh, robinWork })
      .then(data => {
        if (requestSequence !== fetchSequenceRef.current) return;
        setArbs(data.arbs);
        setLastUpdate(new Date());
        setSource(data.source || 'mock');
        setTotalCount(data.total_count ?? data.count ?? 0);
        setFilterOptions(data.filters || EMPTY_FILTERS);
        setRobinWorkMeta(data.robin_work || { enabled: false, top_n: 5, selected: [] });
        setFortedFilters(data.forted_filters || null);
        setLoading(false);
      })
      .catch(err => {
        if (requestSequence !== fetchSequenceRef.current) return;
        if (isRefresh || isExplicit) {
          showToast(err.message, 'error');
        }
        setLoading(false);
      })
      .finally(() => {
        if (isRefresh && requestSequence === fetchSequenceRef.current) setRefreshing(false);
      });
  }, [robinWork, hiddenVersion, showToast]);

  useEffect(() => {
    if (!fortedFilters) {
      return;
    }
    setFortedDraft({
      sportsText: fortedFilters.sports.join(', '),
      bookmakersText: fortedFilters.bookmakers.join(', '),
      mode: fortedFilters.mode || '',
      filterId: fortedFilters.filter_id || '',
    });
  }, [fortedFilters]);

  const availableSports = fortedFilters?.available_sports || [];
  const selectedDraftSports = useMemo(
    () => new Set(splitFilterList(fortedDraft.sportsText).map((value) => value.toLowerCase())),
    [fortedDraft.sportsText],
  );

  const handleApplyFortedFilters = async () => {
    setSavingForted(true);
    try {
      const payload = {
        sports: splitFilterList(fortedDraft.sportsText),
        bookmakers: splitFilterList(fortedDraft.bookmakersText),
        mode: fortedDraft.mode.trim() || undefined,
        filter_id: fortedDraft.filterId.trim() || undefined,
      };
      const data = await api.updateFortedFilters(payload);
      setFortedFilters(data.filters);
      await fetchArbs({ explicit: true });
      showToast(data.updated ? 'Upstream filters applied' : 'Upstream filters already match the current settings');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingForted(false);
    }
  };

  const handleReloadFortedFilters = async () => {
    setSavingForted(true);
    try {
      const data = await api.getFortedFilters();
      setFortedFilters(data.filters);
      showToast('Forted settings synchronized');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingForted(false);
    }
  };

  const updateDraftField = (field) => (event) => {
    setFortedDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  const toggleDraftSport = (sportName) => {
    setFortedDraft((current) => {
      const values = splitFilterList(current.sportsText);
      const exists = values.some((value) => value.toLowerCase() === sportName.toLowerCase());
      const next = exists
        ? values.filter((value) => value.toLowerCase() !== sportName.toLowerCase())
        : [...values, sportName];
      return { ...current, sportsText: next.join(', ') };
    });
  };

  useEffect(() => {
    let stopped = false;
    let timer;
    const poll = async () => {
      await fetchArbs();
      if (!stopped && !paused) {
        timer = setTimeout(poll, robinWork ? 5000 : 2000);
      }
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
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

  const robinSortValue = useCallback((arb) => {
    const value = robinWork ? (arb.robin_work_rank_profit_pct ?? arb.robin_profit_pct) : arb.robin_profit_pct;
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [robinWork]);

  const visibleArbs = useMemo(() => {
    const sportFilter = normalizeFilterValue(sport);
    const marketFilter = normalizeFilterValue(market);
    const bookmakerFilter = normalizeFilterValue(bookmaker);
    const minRobinProfit = typeof minProfit === 'number' ? minProfit : (parseFloat(minProfit) || 0);
    return arbs.filter((arb) => {
      if (sportFilter && normalizeFilterValue(arb.sport) !== sportFilter) return false;
      if (marketFilter && normalizeFilterValue(arb.market) !== marketFilter) return false;
      if (bookmakerFilter && !bookmakerFilterMatchesOption(bookmakerFilter, arb.bk2)) return false;
      if (liveMode === 'live' && !arb.is_live) return false;
      if (liveMode === 'prematch' && arb.is_live) return false;
      if (!arbMatchesClientSearch(arb, search)) return false;
      if (minRobinProfit !== 0 && robinSortValue(arb) < minRobinProfit) return false;
      return true;
    });
  }, [arbs, sport, market, bookmaker, liveMode, search, minProfit, robinSortValue]);

  const sortedArbs = useMemo(() => {
    const list = [...visibleArbs];
    if (sortBy === 'newest') {
      list.sort((a, b) => (a.age_sec || 0) - (b.age_sec || 0));
    } else if (sortBy === 'robin') {
      list.sort((a, b) => robinSortValue(b) - robinSortValue(a));
    } else {
      list.sort((a, b) => (b.profit_pct || 0) - (a.profit_pct || 0));
    }
    return list;
  }, [visibleArbs, sortBy, robinSortValue]);

  const groupedArbs = useMemo(() => {
    const groups = new Map();
    const sortValue = (arb) => {
      if (sortBy === 'newest') return -(arb.age_sec || 0);
      if (sortBy === 'robin') return robinSortValue(arb);
      return arb.profit_pct || 0;
    };
    for (const arb of sortedArbs) {
      const key = arbGroupKey(arb);
      const entry = groups.get(key);
      if (entry) {
        entry.items.push(arb);
      } else {
        groups.set(key, { key, items: [arb] });
      }
    }
    const result = [];
    for (const entry of groups.values()) {
      entry.items.sort((a, b) => sortValue(b) - sortValue(a));
      result.push({
        key: entry.key,
        primary: entry.items[0],
        extras: entry.items.slice(1),
      });
    }
    result.sort((a, b) => sortValue(b.primary) - sortValue(a.primary));
    return result;
  }, [sortedArbs, sortBy, robinSortValue]);

  const quickStake = parseQuickStakeInput(quickStakeInput);
  const quickStakeValid = quickStake !== null;
  const quickStakeLabel = quickStakeValid ? formatStakeLabel(quickStake) : '$—';

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const buildQuickBet = (arb, side) => {
    if (!quickStakeValid) {
      showToast('Set quick stake ≥ $10 first', 'error');
      return null;
    }
    if (quickStake > QUICK_STAKE_MAX) {
      showToast('Временный лимит на ставку 50 евро, изменится после успешной серии ставок без багов, очень скоро', 'error');
      return null;
    }
    const account = side === 'pinnacle' ? 'pinnacle_cashback' : 'robinbet';
    const userBalance = balance ? (balance[account] || 0) : 0;
    if (quickStake > userBalance) {
      showToast(`Недостаточно средств. Ваш баланс ${side === 'pinnacle' ? 'PIN' : 'RobinBet'}: $${userBalance.toFixed(2)}`, 'error');
      return null;
    }
    const odds = side === 'pinnacle' ? pinnacleDisplayOdds(arb) : Number(arb.robin_odds);
    if (!(odds > 1)) {
      showToast('Quick odds are unavailable for this fork', 'error');
      return null;
    }
    const pinPick = formatPinOutcome(arb);
    const counterPick = formatCounterOutcome(arb);
    return {
      arb,
      side,
      stake: quickStake,
      odds,
      book: side === 'pinnacle' ? 'Pinnacle' : 'RobinBet',
      pick: pinPick,
      counterBook: arb.bk2_label || arb.bk2 || 'Counter',
      counterPick,
    };
  };

  const placeQuickBet = async (quickBet) => {
    if (!quickBet || quickPlacing) return;
    if (quickBet.side === 'pinnacle' && verifyMode === 'betslip') {
      setQuickConfirm(null);
      setSelectedPinnacle(quickBet.arb);
      return;
    }
    setQuickPlacing(true);
    try {
      let quoteId = null;
      let odds = quickBet.odds;
      if (verifyMode === 'betslip') {
        const verify = await api.verify(quickBet.arb.id, { verifyMode });
        if (!verify?.verified || verify?.sticky || verify?.keepingPrevious || !verify?.quote_id) {
          throw new Error(verify?.detail || 'Live price check failed. Try again.');
        }
        if (quickBet.side === 'pinnacle') {
          odds = Number(verify.current_odds);
        }
        quoteId = verify.quote_id;
      }
      await api.placeBet(
        quickBet.arb.id,
        quickBet.side,
        quickBet.stake,
        odds,
        quoteId,
        { verifyMode },
      );
      setQuickConfirm(null);
      onBetPlaced?.();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setQuickPlacing(false);
    }
  };

  const beginQuickBet = (arb, side) => {
    const quickBet = buildQuickBet(arb, side);
    if (!quickBet) return;
    if (autoAccept) {
      placeQuickBet(quickBet);
    } else {
      setQuickConfirm(quickBet);
    }
  };

  const hideArb = async (scope) => {
    if (!hideTarget) return;
    const targetId = hideTarget.id;
    const targetMatch = hideTarget.match;

    // Optimistic UI updates
    setHideTarget(null);
    if (selectedCalc?.id === targetId) setSelectedCalc(null);
    if (selectedPinnacle?.id === targetId) setSelectedPinnacle(null);

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
  const canSwitchBookmaker = canManageForted;

  return (
    <>
      <div className="page-header">
        <h1>📡 Scanner</h1>
          <p>
          {isLiveSource ? '🟢 Live Forted feed' : '🟡 Feed unavailable'}
          {lastUpdate && <span> · updated {formatRelative(lastUpdate, nowMs)}</span>}
          <span> · {groupedArbs.length}{totalCount ? ` / ${totalCount}` : ''} matches · {sortedArbs.length}{arbs.length ? ` / ${arbs.length}` : ''} forks</span>
          {paused && <span> · ⏸ paused</span>}
          {fortedFilters && (
            <span> · upstream: {fortedFilters.bookmakers_count} bookmakers / {fortedFilters.sports_count} sports</span>
          )}
        </p>
        {canSwitchBookmaker && (
          <BookmakerSwitch
            showToast={showToast}
            onSwitchComplete={() => fetchArbs({ refresh: true })}
          />
        )}
      </div>

      <div className="filters filters-grid">
        <select value={liveMode} onChange={e => setLiveMode(e.target.value)} title="Live / prematch filter">
          <option value="all">All forks</option>
          <option value="live">🔴 Live only</option>
          <option value="prematch">📅 Prematch only</option>
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
        {!quickBetsHidden && (
          <label className="filter-min" title="Stake used by the quick PIN / RobinBet buttons">
            <span>Quick stake</span>
            <div className={`filter-min-input ${quickStakeValid ? '' : 'invalid'}`}>
              <span>$</span>
              <input
                type="number"
                step="50"
                min="10"
                value={quickStakeInput}
                onChange={e => setQuickStakeInput(e.target.value)}
                onBlur={e => setQuickStakeInput(normalizeQuickStakeInput(e.target.value))}
                placeholder={String(QUICK_STAKE_DEFAULT)}
              />
            </div>
          </label>
        )}
        <div className="filter-actions">
          <label
            className={`filter-settings robin-work-toggle ${robinWork ? 'on' : ''}`}
            title={`RobinWork: recalculate real Robin price for top ${robinWorkMeta.top_n || 5}`}
          >
            <input
              type="checkbox"
              checked={robinWork}
              onChange={(e) => setRobinWork(e.target.checked)}
            />
            <span>RobinWork</span>
          </label>
          <label className={`filter-settings ${autoAccept ? 'on' : ''}`} title="Skip bet confirmation prompt — accept immediately">
            <input
              type="checkbox"
              checked={autoAccept}
              onChange={(e) => setAutoAccept(e.target.checked)}
            />
            <span>Auto-accept</span>
          </label>
          <label
            className={`filter-settings quick-visibility-toggle ${quickBetsHidden ? 'on muted' : ''}`}
            title={quickBetsHidden ? 'Show quick PIN / RobinBet buttons on fork cards' : 'Hide quick PIN / RobinBet buttons on fork cards'}
          >
            <input
              type="checkbox"
              checked={quickBetsHidden}
              onChange={(e) => setQuickBetsHidden(e.target.checked)}
            />
            <span>{quickBetsHidden ? 'Show quick' : 'Hide quick'}</span>
          </label>
          <button className="btn btn-link" onClick={resetLocalFilters} disabled={!hasActiveFilters}>Reset</button>
          <button
            className={`btn btn-link admin-toggle ${paused ? 'on' : ''}`}
            onClick={() => setPaused((value) => !value)}
            title={paused ? 'Resume live updates' : 'Pause live updates'}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            className="btn btn-verify"
            onClick={() => fetchArbs({ refresh: true })}
            title="Refresh now (force upstream poll)"
            disabled={refreshing}
          >{refreshing ? '…' : '↻'}</button>
          {canManageForted && (
            <button
              className={`btn btn-link admin-toggle ${showAdmin ? 'on' : ''}`}
              onClick={toggleAdmin}
              title="Upstream Forted controls"
            >
              ⚙ Upstream
            </button>
          )}
        </div>
      </div>

      {canManageForted && showAdmin && (
      <section className="control-panel">
        <div className="control-panel-header">
          <div>
            <h3>Upstream Forted Filters</h3>
            <p>
              These settings control the Forted intake. Saving reconnects the listener and refreshes the scanner feed
              with the updated upstream scope.
            </p>
          </div>
          <div className="control-panel-meta">
            <span className="source-pill">{isLiveSource ? 'Live feed' : 'Mirror mode'}</span>
            {fortedFilters && <span className="source-pill">mode {fortedFilters.mode}</span>}
          </div>
        </div>

        <div className="forted-grid">
          <label className="field-block field-block-wide">
            <span>Sports</span>
            <textarea
              rows="2"
              value={fortedDraft.sportsText}
              onChange={updateDraftField('sportsText')}
              placeholder="Tennis, Soccer, Basketball"
            />
            {availableSports.length > 0 && (
              <div className="field-hint-box">
                <div className="field-hint-title">Full sports catalog</div>
                <div className="suggestion-chips">
                  {availableSports.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`suggestion-chip ${selectedDraftSports.has(option.toLowerCase()) ? 'active' : ''}`}
                      onClick={() => toggleDraftSport(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </label>

          <label className="field-block field-block-wide">
            <span>Bookmakers</span>
            <textarea
              rows="2"
              value={fortedDraft.bookmakersText}
              onChange={updateDraftField('bookmakersText')}
              placeholder="bet365.com, leonbets.ru"
            />
          </label>

          <label className="field-block">
            <span>Mode</span>
            <input value={fortedDraft.mode} onChange={updateDraftField('mode')} placeholder="0" />
          </label>

          <label className="field-block">
            <span>Filter ID</span>
            <input value={fortedDraft.filterId} onChange={updateDraftField('filterId')} placeholder="5925" />
          </label>
        </div>

        {fortedFilters && (
          <div className="forted-summary">
            <span>Active now: {fortedFilters.bookmakers_count} bookmakers</span>
            <span>{fortedFilters.sports_count} sports</span>
            <span>{fortedFilters.available_sports_count} supported sports</span>
            <span>filter {fortedFilters.filter_id}</span>
          </div>
        )}

        <div className="panel-actions">
          <button className="btn btn-primary" onClick={handleApplyFortedFilters} disabled={savingForted}>
            {savingForted ? 'Applying...' : 'Apply upstream filters'}
          </button>
          <button className="btn btn-link" onClick={handleReloadFortedFilters} disabled={savingForted}>
            Reload
          </button>
        </div>
      </section>
      )}

      {selectedCalc && (
        <Calculator
          arb={selectedCalc}
          balance={balance}
          onClose={() => setSelectedCalc(null)}
          onBetPlaced={onBetPlaced}
          showToast={showToast}
          variant="sticky"
          verifyMode={verifyMode}
          autoAccept={autoAccept}
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
          const isNotSelected = (selectedCalc && selectedCalc.id === arb.id)
            ? false
            : (robinWork ? !arb.robin_work_selected : true);
          return (
          <div
            key={group.key}
            className={`arb-card${isExpanded ? ' arb-card-expanded' : ''}${isNotSelected ? ' robin-not-selected' : ''}`}
            onClick={() => setSelectedCalc(arb)}
          >
            <div className="arb-card-top">
              <span
                className={`profit-badge ${profitClass(arb.profit_capped ? -0.01 : arb.profit_pct)}`}
                title={arb.profit_capped ? 'Forted range: upstream caps the exact value at 0' : 'Forted profit'}
              >
                {formatFortedProfit(arb)}
              </span>
              <span className={`profit-badge robin-badge ${profitClass(arb.robin_profit_pct || 0)}`} title="RobinBet profit with current Robin price">
                {Number(arb.robin_profit_pct ?? 0).toFixed(2)}%
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
              {arb.robin_work_verification_blocked && (
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
              <span className="arb-card-market-label">{arb.display_market || arb.market}</span>
              <span className="arb-card-leg" title={`Pinnacle: ${pinPick}`}>
                <span className="arb-card-leg-book">PIN</span>
                <span className="arb-card-leg-pick">{pinPick}</span>
              </span>
              <span className="arb-card-leg-sep">·</span>
              <span className="arb-card-leg" title={`${arb.bk2_label || arb.bk2}: ${counterPick}`}>
                <span className="arb-card-leg-book">{arb.bk2_label || arb.bk2}</span>
                <span className="arb-card-leg-pick">{counterPick}</span>
              </span>
            </div>
            <div className="arb-card-odds">
              <div className="odds-col" title={`Pinnacle: ${pinPick}`}>
                <div className="odds-val">{pinOdds.toFixed(3)}</div>
                <div className="odds-label">Pinnacle · {pinPick}</div>
              </div>
              <div className="odds-col" title={`${arb.bk2_label || arb.bk2}: ${counterPick}`}>
                <div className="odds-val">{arb.bk2_odds.toFixed(3)}</div>
                <div className="odds-label">{arb.bk2_label || arb.bk2} · {counterPick}</div>
              </div>
              <div className="odds-col robin-col" title={`RobinBet on Pinnacle outcome: ${pinPick}`}>
                <div className="odds-val">{arb.robin_odds.toFixed(3)}</div>
                <div className="odds-label">Robin · {pinPick}</div>
              </div>
            </div>
            <CounterNavigationHint guidance={arb.counter_navigation} compact />
            <div className="arb-card-actions" onClick={e => e.stopPropagation()}>
              {!quickBetsHidden && (
                <>
                  <button
                    className="btn btn-pin-quote"
                    onClick={() => beginQuickBet(arb, 'pinnacle')}
                    title={`Quick ${verifyMode === 'betslip' ? 'Pinnacle basket' : 'Pinnacle'} bet: ${pinPick} · ${quickStakeLabel}`}
                    disabled={!quickStakeValid || quickPlacing}
                  >
                    <span className="price-button-value">{pinOdds.toFixed(3)}</span>
                    <span className="price-button-meta">
                      {(() => {
                        const p = quickStakeValid ? quickPinProfit(arb, quickStake) : null;
                        return p !== null ? `${p >= 0 ? '+' : ''}$${p.toFixed(1)} @ ${quickStakeLabel}` : 'PIN';
                      })()}
                    </span>
                  </button>
                  <button
                    className="btn btn-robin-quote"
                    onClick={() => beginQuickBet(arb, 'robinbet')}
                    title={`Quick RobinBet bet: ${pinPick} · ${quickStakeLabel}`}
                    disabled={!quickStakeValid || quickPlacing}
                  >
                    <span className="price-button-value">{arb.robin_odds.toFixed(3)}</span>
                    <span className="price-button-meta">
                      {(() => {
                        const p = quickStakeValid ? quickRobinProfit(arb, quickStake) : null;
                        return p !== null ? `${p >= 0 ? '+' : ''}$${p.toFixed(1)} @ ${quickStakeLabel}` : 'Robin';
                      })()}
                    </span>
                  </button>
                </>
              )}
              <a
                href={arb.counter_navigation?.url || arb.bk2_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-link"
                title={arb.counter_navigation?.provider_label
                  ? `${arb.bk2_label || arb.bk2} · ${arb.counter_navigation.provider_label}`
                  : (arb.bk2_label || arb.bk2)}
              >
                {arb.counter_navigation?.provider_short_label || (arb.bk2_label || arb.bk2).slice(0, 7)} ↗
              </a>
            </div>

            {isExpanded && extras.length > 0 && (
              <div className="arb-card-extras" onClick={e => e.stopPropagation()}>
                {extras.map(extra => {
                  const extraPinPick = formatPinOutcome(extra);
                  const extraPinOdds = pinnacleDisplayOdds(extra);
                  const extraCounterPick = formatCounterOutcome(extra);
                  const isExtraNotSelected = (selectedCalc && selectedCalc.id === extra.id)
                    ? false
                    : (robinWork ? !extra.robin_work_selected : true);
                  return (
                    <div
                      key={extra.id}
                      className={`arb-extra-row${isExtraNotSelected ? ' robin-not-selected' : ''}`}
                      onClick={() => setSelectedCalc(extra)}
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
                          {extra.robin_work_verification_blocked && (
                            <span
                              className="arb-extra-feed"
                              title={extra.robin_work_verification_block_reason || 'Exact BIA verification is unavailable'}
                            >
                              NO EXACT QUOTE
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
                        <span className="arb-extra-odd robin" title="Robin">{extra.robin_odds.toFixed(3)}</span>
                      </div>
                      <div className="arb-extra-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="btn-hide-arb sm"
                          onClick={() => setHideTarget(extra)}
                          title="Hide"
                        >
                          ×
                        </button>
                        {!quickBetsHidden && (
                          <>
                            <button
                              className="btn btn-pin-quote sm"
                              onClick={() => beginQuickBet(extra, 'pinnacle')}
                              title={`Quick ${verifyMode === 'betslip' ? 'Pinnacle basket' : 'Pinnacle'} bet: ${extraPinPick} · ${quickStakeLabel}`}
                              disabled={!quickStakeValid || quickPlacing}
                            >
                              <span className="price-button-value">{extraPinOdds.toFixed(3)}</span>
                              <span className="price-button-meta">PIN</span>
                            </button>
                            <button
                              className="btn btn-robin-quote sm"
                              onClick={() => beginQuickBet(extra, 'robinbet')}
                              title={`Quick RobinBet bet: ${extraPinPick} · ${quickStakeLabel}`}
                              disabled={!quickStakeValid || quickPlacing}
                            >
                              <span className="price-button-value">{extra.robin_odds.toFixed(3)}</span>
                              <span className="price-button-meta">Robin</span>
                            </button>
                          </>
                        )}
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

      {selectedPinnacle && (
        <PinnaclePricePopup
          arb={selectedPinnacle}
          balance={balance}
          onClose={() => setSelectedPinnacle(null)}
          onBetPlaced={onBetPlaced}
          showToast={showToast}
          defaultStake={quickStake || QUICK_STAKE_DEFAULT}
          verifyMode={verifyMode}
          autoAccept={autoAccept}
        />
      )}

      {quickConfirm && (
        <div className="modal-overlay" onClick={() => setQuickConfirm(null)}>
          <div className="modal quick-bet-modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              Quick bet
              <button className="modal-close" onClick={() => setQuickConfirm(null)}>×</button>
            </h2>
            <div className="quick-bet-match">{quickConfirm.arb.match}</div>
            <div className="calc-placement-strip pin-popup-placement" title={`${quickConfirm.book} · ${quickConfirm.pick} / ${quickConfirm.counterBook} · ${quickConfirm.counterPick}`}>
              <div className={`calc-placement-leg ${quickConfirm.side === 'pinnacle' ? 'pin' : 'robin'}`}>
                <span>Ставить в {quickConfirm.book}</span>
                <strong>{quickConfirm.pick}</strong>
              </div>
              <div className="calc-placement-leg counter">
                <span>{quickConfirm.counterBook}</span>
                <strong>{quickConfirm.counterPick}</strong>
              </div>
            </div>
            <div className="quick-bet-summary">
              <span>{quickConfirm.book}</span>
              <b>{formatStakeLabel(quickConfirm.stake)} @ {quickConfirm.odds.toFixed(3)}</b>
              <span>Return ${(quickConfirm.stake * quickConfirm.odds).toFixed(2)}</span>
            </div>
            <div className="quick-bet-note">
              {quickConfirm.side === 'robinbet'
                ? 'RobinBet checks the live Pinnacle price before accepting. If the fork moved, the bet is rejected.'
                : 'Pinnacle opens the live price popup before any accept.'}
            </div>
            <div className="action-buttons">
              <button className="btn btn-link" onClick={() => setQuickConfirm(null)} disabled={quickPlacing}>Cancel</button>
              <button
                className={`btn ${quickConfirm.side === 'pinnacle' ? 'btn-pin' : 'btn-robin'} btn-accept-big`}
                onClick={() => placeQuickBet(quickConfirm)}
                disabled={quickPlacing}
                style={{ flex: 2 }}
              >
                {quickPlacing ? 'Accepting…' : `Accept ${quickConfirm.pick}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {robinWorkIdleNotice && (
        <div className="modal-overlay">
          <div className="modal idle-notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="robinwork-idle-title" style={{ border: '2px solid #ff4444' }}>
            <h2 id="robinwork-idle-title" style={{ color: '#ff4444', textAlign: 'center', fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 16px 0', lineHeight: '1.4' }}>
              !!! ЗАНОВО ВКЛЮЧИТЕ РЕЖИМ ROBINWORK !!! <br/>
              !!! RE-ENABLE ROBINWORK MODE !!!
            </h2>
            <div className="action-buttons" style={{ marginTop: '20px' }}>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: '40px', fontSize: '1rem' }} onClick={() => setRobinWorkIdleNotice(false)}>OK, ПОНЯЛ / OK, I UNDERSTAND</button>
            </div>
          </div>
        </div>
      )}

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
