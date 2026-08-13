function normalizeGroupPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

export function formatAge(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

export function formatRelative(date, nowMs) {
  if (!date) return '';
  const diff = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function profitClass(pct) {
  const val = Number(pct ?? 0);
  if (val < 0) return 'negative';
  if (val > 2) return 'high';
  return 'low';
}

export function formatFortedProfit(arb) {
  if (arb?.profit_capped) {
    const min = Number(arb.profit_range_min ?? -3);
    const max = Number(arb.profit_range_max ?? 0);
    return `${min.toFixed(0)}..${max.toFixed(0)}%`;
  }
  return `${Number(arb?.profit_pct ?? 0).toFixed(2)}%`;
}

export function formatOvervalue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n > 0 ? '+' : ''}${n}% OV`;
}

export function bookmakerFilterMatchesOption(filterValue, option) {
  const filter = normalizeFilterValue(filterValue);
  const candidate = normalizeFilterValue(option);
  if (!filter || !candidate) return false;
  return candidate.includes(filter) || filter.includes(candidate);
}

export function arbMatchesClientSearch(arb, query) {
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

export function arbGroupKey(arb) {
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

export function pinnacleDisplayOdds(arb) {
  const verified = Number(arb?.robin_work_verified_pin_odds);
  if (!arb?.robin_work_verification_blocked && Number.isFinite(verified) && verified > 1) {
    return verified;
  }
  return Number(arb?.bk1_odds);
}

export function hasExactRobinQuote(arb) {
  const pinOdds = Number(arb?.robin_work_verified_pin_odds);
  const robinOdds = Number(arb?.robin_odds);
  return Boolean(
    arb
    && arb.robin_work_actionable !== false
    && arb.robin_work_verification_blocked !== true
    && arb.robin_work_verification_status === 'verified'
    && Number.isFinite(pinOdds)
    && pinOdds > 1
    && Number.isFinite(robinOdds)
    && robinOdds > 1
  );
}

export function robinPriceTitle(arb) {
  if (!hasExactRobinQuote(arb)) return 'Waiting for an exact Pinnacle binding and Robin quote';
  const margin = Number(arb?.robin_price_market_margin);
  const target = Number(arb?.robin_price_target_margin);
  const effective = Number(arb?.robin_price_effective_margin);
  const improvement = Number(arb?.robin_price_improvement_pct);
  if (![margin, target, improvement].every(Number.isFinite)) {
    return 'RobinBet profit with exact current Robin price';
  }
  const floor = arb?.robin_price_floor_applied ? ' · minimum +0.01 applied' : '';
  const hold = Number.isFinite(effective) ? ` · effective hold ${(effective * 100).toFixed(2)}%` : '';
  return `Pinnacle market margin ${(margin * 100).toFixed(2)}% → Robin target ${(target * 100).toFixed(2)}%${hold} · price improvement +${improvement.toFixed(2)}%${floor}`;
}

export function robinSortValue(arb, robinWork) {
  if (robinWork && !hasExactRobinQuote(arb)) return -1_000_000;
  const value = robinWork ? (arb.robin_work_rank_profit_pct ?? arb.robin_profit_pct) : arb.robin_profit_pct;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildScannerPresentation(arbs, {
  sport = '',
  market = '',
  bookmaker = '',
  liveMode = 'all',
  search = '',
  minProfit = 0,
  sortBy = 'robin',
  robinWork = false,
} = {}) {
  const sportFilter = normalizeFilterValue(sport);
  const marketFilter = normalizeFilterValue(market);
  const bookmakerFilter = normalizeFilterValue(bookmaker);
  const minRobinProfit = typeof minProfit === 'number' ? minProfit : (parseFloat(minProfit) || 0);
  const visibleArbs = arbs.filter((arb) => {
    const exactRobinQuote = hasExactRobinQuote(arb);
    // RobinWork intentionally retains unverified rows as read-only diagnostics.
    if (!robinWork && arb.robin_work_verification_blocked === true) return false;
    if (sportFilter && normalizeFilterValue(arb.sport) !== sportFilter) return false;
    if (marketFilter && normalizeFilterValue(arb.market) !== marketFilter) return false;
    if (bookmakerFilter && !bookmakerFilterMatchesOption(bookmakerFilter, arb.bk2)) return false;
    if (liveMode === 'live' && !arb.is_live) return false;
    if (liveMode === 'prematch' && arb.is_live) return false;
    if (!arbMatchesClientSearch(arb, search)) return false;
    const robinProfit = robinSortValue(arb, robinWork);
    if (robinWork && exactRobinQuote && minRobinProfit === 0 && robinProfit <= 0) return false;
    if (minRobinProfit !== 0 && exactRobinQuote && robinProfit < minRobinProfit) return false;
    return true;
  });

  const sortedArbs = [...visibleArbs];
  const sortValue = (arb) => {
    if (sortBy === 'newest') return -(arb.age_sec || 0);
    if (sortBy === 'robin') return robinSortValue(arb, robinWork);
    return arb.profit_pct || 0;
  };
  sortedArbs.sort((a, b) => sortValue(b) - sortValue(a));

  const groups = new Map();
  for (const arb of sortedArbs) {
    const key = arbGroupKey(arb);
    const entry = groups.get(key);
    if (entry) {
      entry.items.push(arb);
    } else {
      groups.set(key, { key, items: [arb] });
    }
  }
  const groupedArbs = [];
  for (const entry of groups.values()) {
    entry.items.sort((a, b) => sortValue(b) - sortValue(a));
    groupedArbs.push({
      key: entry.key,
      primary: entry.items[0],
      extras: entry.items.slice(1),
    });
  }
  groupedArbs.sort((a, b) => sortValue(b.primary) - sortValue(a.primary));

  return { visibleArbs, sortedArbs, groupedArbs };
}
