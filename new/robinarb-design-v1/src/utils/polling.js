export const BOOKMAKER_SWITCH_POLL_MS = 2000;
export const BOOKMAKER_IDLE_POLL_MS = 10000;
export const SCANNER_POLL_MS = 1500;
export const ROBIN_WORK_POLL_MS = 750;
export const ROBIN_WORK_PENDING_POLL_MS = 4000;

export function bookmakerPollDelayMs(switching) {
  return switching ? BOOKMAKER_SWITCH_POLL_MS : BOOKMAKER_IDLE_POLL_MS;
}

export function scannerPollDelayMs({ hidden, robinWork, pricingPending }) {
  if (hidden) return null;
  if (robinWork && pricingPending) return ROBIN_WORK_PENDING_POLL_MS;
  return robinWork ? ROBIN_WORK_POLL_MS : SCANNER_POLL_MS;
}

export function isCardActivationKey(key) {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}
