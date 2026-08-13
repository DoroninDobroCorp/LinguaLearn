export function cleanLeagueName(league) {
  if (!league) return '';
  const parts = String(league).split(' - ');
  if (parts.length <= 1) return String(league).trim();
  return parts.slice(1).join(' - ').trim();
}

function bookmakerCode(bookmaker, index) {
  const raw = String(bookmaker || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || lower.includes('pinnacle') || lower.includes('ps3838')) return 'PIN';
  if (lower.includes('paddypower')) return 'PP';
  if (lower.includes('bet365')) return 'B365';
  if (lower.includes('vivaro') || lower.includes('vbet')) return 'VBET';

  const host = lower
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
  const first = host.split('.')[0] || raw;
  const chunks = first.split(/[^a-z0-9]+/).filter(Boolean);
  if (chunks.length >= 2) {
    return chunks.map((chunk) => chunk[0]).join('').slice(0, 4).toUpperCase();
  }
  const compact = first.replace(/[^a-z0-9]/g, '');
  return compact ? compact.slice(0, 4).toUpperCase() : `BK${index + 1}`;
}

function pushLeague(items, seen, bookmaker, league, index) {
  const rawLeague = String(league || '').trim();
  if (!rawLeague) return;
  const label = cleanLeagueName(rawLeague);
  if (!label) return;
  const book = String(bookmaker || '').trim() || (index === 0 ? 'Pinnacle' : `Bookmaker ${index + 1}`);
  const code = bookmakerCode(book, index);
  const key = `${code}\u0000${label.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ bookmaker: book, code, rawLeague, label });
}

export function leagueDisplayItems(arb) {
  const items = [];
  const seen = new Set();
  const explicit = Array.isArray(arb?.league_sources) ? arb.league_sources : [];

  explicit.forEach((source, index) => {
    if (!source || typeof source !== 'object') return;
    pushLeague(
      items,
      seen,
      source.bookmaker || source.book || source.name,
      source.league || source.event_name || source.eventName,
      index,
    );
  });

  if (items.length === 0) {
    pushLeague(items, seen, 'Pinnacle', arb?.bk1_event_name, 0);
    pushLeague(items, seen, arb?.bk2 || 'Bookmaker 2', arb?.bk2_event_name, 1);
    for (let idx = 3; idx <= 5; idx += 1) {
      pushLeague(items, seen, arb?.[`bk${idx}`] || `Bookmaker ${idx}`, arb?.[`bk${idx}_event_name`], idx - 1);
    }
  }

  if (items.length === 0) {
    pushLeague(items, seen, '', arb?.league, 0);
  }

  return items;
}

export function leagueDisplayTitle(items) {
  return items.map((item) => `${item.bookmaker}: ${item.rawLeague}`).join(' | ');
}
