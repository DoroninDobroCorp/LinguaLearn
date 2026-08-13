export const PARSER_ROBIN_PRICE_SOURCES = new Set([
  'pinnacle-arcadia',
  'pinnacle-exact-pair',
  'ps3838-compact',
  'ps3838-more-bet',
  'pinnacle-stream-id',
]);

export function parserRobinPreviewOdds(verifiedOdds, arbOdds, arbSource) {
  const verified = Number(verifiedOdds);
  if (Number.isFinite(verified) && verified > 1) return verified;
  const source = String(arbSource || '').trim().toLowerCase();
  const candidate = Number(arbOdds);
  return PARSER_ROBIN_PRICE_SOURCES.has(source)
    && Number.isFinite(candidate)
    && candidate > 1
    ? candidate
    : null;
}
