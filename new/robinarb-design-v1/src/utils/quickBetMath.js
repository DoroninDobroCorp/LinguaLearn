export function sameDisplayedOdds(left, right) {
  const first = Number(left);
  const second = Number(right);
  if (!(first > 1 && second > 1)) return false;
  return Math.round(first * 1000) === Math.round(second * 1000);
}

// Demo execution is permitted only through a server-issued, one-shot quote.
// Keep this validation shared by every UI entry point so no component can
// accidentally revive the old quoteId=null client-only simulation path.
export function simulationQuoteDetails(quote, side) {
  if (
    quote?.verified !== true
    || quote?.simulation_only !== true
    || quote?.donor_plan_required !== true
    || !quote?.quote_id
    || !quote?.counter_binding
  ) return null;
  const primaryOdds = Number(side === 'robinbet' ? quote.robin_odds : quote.current_odds);
  const counterOdds = Number(quote.counter_odds);
  if (!(primaryOdds > 1 && counterOdds > 1)) return null;
  return {
    quoteId: quote.quote_id,
    primaryOdds,
    counterOdds,
    counterBinding: quote.counter_binding,
  };
}

export function calcPlanMatchesOdds(calc, side, liveOdds) {
  const price = Number(liveOdds);
  const planPrice = Number(side === 'robinbet' ? calc?.robinbet?.odds : calc?.pinnacle?.odds);
  return sameDisplayedOdds(planPrice, price);
}

export function calcPlanMatchesInputs(calc, inputs) {
  if (!calc || !inputs) return false;
  if (inputs.mode === 'donor') {
    return calc.mode === 'donor'
      && Math.round(Number(calc.donor_stake) * 100) === Math.round(Number(inputs.counterStake) * 100)
      && sameDisplayedOdds(calc.donor_odds, inputs.counterOdds);
  }
  const totalMatches = calc.mode === 'standard'
    && Math.round(Number(calc.requested_total_stake ?? calc.total_stake) * 100)
      === Math.round(Number(inputs.totalStake) * 100);
  if (!totalMatches) return false;
  const counterPrice = Number(inputs.counterOdds);
  return !(counterPrice > 1) || sameDisplayedOdds(calc?.counter?.odds, counterPrice);
}
