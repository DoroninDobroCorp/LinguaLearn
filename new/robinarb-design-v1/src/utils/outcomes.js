const BETFAIR_RE = /betfair/i;
const BETFAIR_EXCHANGE_RE = /betfair\.com\/exchange/i;
const AGAINST_RE = /^(?:против|against|lay)\s+/i;

function text(value) {
  return String(value || '').trim();
}

export function formatPinOutcome(arb) {
  const raw = text(arb?.bk1_outcome || arb?.bk1_selection || arb?.side1);
  if (!raw) return '-';
  // `WinNone` is the internal Pinnacle contract for a draw. Keep that
  // machine-facing value out of the execution UI while preserving any
  // period prefix used to bind the exact market (for example `P1`).
  return raw.replace(/\bWinNone$/i, 'Draw');
}

export function formatCounterOutcome(arb) {
  const raw = text(arb?.bk2_selection || arb?.side2);
  if (!raw) return '-';
  const book = text(arb?.bk2 || arb?.counter_bk || arb?.bk2_url);
  const stripped = raw.replace(AGAINST_RE, '').trim();
  const url = text(arb?.bk2_url);
  if (BETFAIR_RE.test(book) && BETFAIR_EXCHANGE_RE.test(url) && stripped && stripped !== raw) {
    return `Lay ${stripped}`;
  }
  return stripped || raw;
}
