export function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

export function floorMoney(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.floor((num + Number.EPSILON) * 100) / 100;
}

export function safeDefaultDonorStake(
  counterOdds,
  localOdds,
  maxLocalStake = 50,
  fallback = 10,
) {
  const counterPrice = finiteNumber(counterOdds);
  const localPrices = (Array.isArray(localOdds) ? localOdds : [localOdds])
    .map(finiteNumber)
    .filter((value) => Number.isFinite(value) && value > 1);
  if (!(counterPrice > 1 && maxLocalStake > 0) || !localPrices.length) return fallback;
  const safeCap = localPrices.reduce(
    (lowest, localPrice) => Math.min(lowest, maxLocalStake * localPrice / counterPrice),
    maxLocalStake,
  );
  return Math.max(1, floorMoney(safeCap));
}

export function roundMoney(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function formatStake(value, digits = 0) {
  const num = finiteNumber(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '—';
}

export function signedMoney(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return '—';
  return `${num >= 0 ? '+' : '-'}$${Math.abs(num).toFixed(2)}`;
}

export function signedPct(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return '—';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export function edgeTone(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return 'neutral';
  if (num >= 0) return 'positive';
  return 'negative';
}

export function donorModeEdge(primaryOdds, counterOdds, counterStake) {
  if (!(primaryOdds > 1 && counterOdds > 1 && counterStake > 0)) return null;
  const roundedCounterStake = roundMoney(counterStake);
  const counterReturn = roundedCounterStake * counterOdds;
  const primaryStake = roundMoney(counterReturn / primaryOdds);
  const totalStake = roundMoney(primaryStake + roundedCounterStake);
  const payout = floorMoney(Math.min(
    primaryStake * primaryOdds,
    counterReturn,
  ));
  const profit = roundMoney(payout - totalStake);
  return {
    primaryStake,
    counterStake: roundedCounterStake,
    totalStake,
    payout,
    profit,
    net: profit,
    roiPct: profit / totalStake * 100,
  };
}
