import { useEffect, useRef, useState, useMemo } from 'react';
import { api } from '../api';
import { leagueDisplayItems, leagueDisplayTitle } from '../utils/leagueDisplay';
import { formatCounterOutcome, formatPinOutcome } from '../utils/outcomes';
import CounterNavigationHint from './CounterNavigationHint';

const PRESETS = [100, 500, 1000, 2500, 5000];
const POLL_MS = 2000;
const FRESH_MS = 25000;
const ACCEPT_FRESH_MS = 3000;
const ACCEPT_TIMEOUT_MS = 50000;
const FAIL_GRACE_MS = 20000;
const ODDS_TOL = 0.001;
const FALLBACK_ROBIN_TICKS = 0.04;
const BETSLIP_VERIFY_WINDOW_MS = 180000;
const CALCULATOR_CLIENT_KEY = 'robinarb.calculatorClientId';
// Fixed delay used by the legacy instant accept mode. Live betslip mode still
// requires a fresh quote_id/current_odds before submitting.
const INSTANT_DELAY_MS = 4000;

function loadAutoAccept() {
  try { return localStorage.getItem('robinarb.autoAccept') === '1'; } catch { return false; }
}

function loadCalculatorClientId() {
  try {
    const existing = sessionStorage.getItem(CALCULATOR_CLIENT_KEY);
    if (existing) return existing;
    const next = `calc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CALCULATOR_CLIENT_KEY, next);
    return next;
  } catch {
    return `calc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function floorMoney(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.floor((num + Number.EPSILON) * 100) / 100;
}

function formatStake(value, digits = 0) {
  const num = finiteNumber(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '—';
}

function signedMoney(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return '—';
  return `${num >= 0 ? '+' : '-'}$${Math.abs(num).toFixed(2)}`;
}

function signedPct(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return '—';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

function edgeTone(value) {
  const num = finiteNumber(value);
  if (!Number.isFinite(num)) return 'neutral';
  if (num >= 0) return 'positive';
  return 'negative';
}

function totalModeEdge(primaryOdds, counterOdds, totalStake) {
  if (!(primaryOdds > 1 && counterOdds > 1 && totalStake > 0)) return null;
  const primaryInv = 1 / primaryOdds;
  const counterInv = 1 / counterOdds;
  const totalInv = primaryInv + counterInv;
  if (!(totalInv > 0)) return null;
  const primaryStake = totalStake * primaryInv / totalInv;
  const counterStake = totalStake * counterInv / totalInv;
  const payout = primaryStake * primaryOdds;
  const profit = payout - totalStake;
  return {
    primaryStake,
    counterStake,
    totalStake,
    payout,
    profit,
    net: profit,
    roiPct: profit / totalStake * 100,
  };
}

function donorModeEdge(primaryOdds, counterOdds, counterStake) {
  if (!(primaryOdds > 1 && counterOdds > 1 && counterStake > 0)) return null;
  const counterReturn = counterStake * counterOdds;
  const primaryStake = counterReturn / primaryOdds;
  const totalStake = primaryStake + counterStake;
  const profit = counterReturn - totalStake;
  return {
    primaryStake,
    counterStake,
    totalStake,
    payout: counterReturn,
    profit,
    net: profit,
    roiPct: profit / totalStake * 100,
  };
}

export default function Calculator({ arb, balance, onClose, onBetPlaced, showToast, variant, verifyMode = 'betslip', autoAccept = loadAutoAccept() }) {
  const preverifiedPinOdds = Number(arb.robin_work_verified_pin_odds);
  const initialPinOdds = !arb.robin_work_verification_blocked && Number.isFinite(preverifiedPinOdds) && preverifiedPinOdds > 1
    ? preverifiedPinOdds
    : Number(arb.bk1_odds);
  const [stakeTotal, setStakeTotal] = useState(1000);
  const [mode, setMode] = useState('donor'); // donor by default per UX request
  const [donorStake, setDonorStake] = useState(500);
  const [donorOdds, setDonorOdds] = useState(arb.bk2_odds);
  const [calc, setCalc] = useState(null);
  const [openedAt] = useState(Date.now());
  const [verified, setVerified] = useState(null);
  const [verifiedAt, setVerifiedAt] = useState(0);
  const [, setLastResultAt] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [successDetails, setSuccessDetails] = useState(null);
  // Pre-confirm dialog (asks user before kicking off live verify + place).
  const [preConfirm, setPreConfirm] = useState(null); // { side, odds, stake, net }
  const [pendingAccept, setPendingAccept] = useState(null); // { side, expectedOdds }
  const [confirmChange, setConfirmChange] = useState(null); // { side, from, to, quoteId|null }
  const [edgePulse, setEdgePulse] = useState({ pin: '', robin: '' });
  const cancelRef = useRef(false);
  const verifiedAtRef = useRef(0);
  const inflightRef = useRef(false);
  const calcRequestRef = useRef(0);
  const calcRef = useRef(null);
  const verifiedRef = useRef(null);
  useEffect(() => {
    verifiedRef.current = verified;
  }, [verified]);

  const verifyStartedAtRef = useRef(Date.now());
  const expiredNoticeRef = useRef(false);
  const calculatorClientIdRef = useRef(loadCalculatorClientId());
  const pinOddsRef = useRef(initialPinOdds || 0);
  const robinDisplayRef = useRef(Number(arb.robin_odds) || initialPinOdds + FALLBACK_ROBIN_TICKS || 0);
  const previousEdgeRef = useRef({ pin: null, robin: null });
  const edgePulseTimersRef = useRef({ pin: null, robin: null });

  useEffect(() => { verifiedAtRef.current = verifiedAt; }, [verifiedAt]);
  useEffect(() => { verifiedRef.current = verified; }, [verified]);

  useEffect(() => {
    setVerified(null); setVerifiedAt(0); setLastResultAt(0); setCalc(null);
    setPreConfirm(null); setPendingAccept(null); setConfirmChange(null);
    setEdgePulse({ pin: '', robin: '' });
    setDonorOdds(arb.bk2_odds);
    verifiedAtRef.current = 0;
    verifyStartedAtRef.current = Date.now();
    expiredNoticeRef.current = false;
    previousEdgeRef.current = { pin: null, robin: null };
  }, [arb.id, arb.bk2_odds]);

  useEffect(() => () => {
    Object.values(edgePulseTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  useEffect(() => {
    const requestId = ++calcRequestRef.current;
    const livePin = verified?.verified && Number(verified.current_odds) > 1 ? Number(verified.current_odds) : null;
    const liveRobin = verified?.verified && Number(verified.robin_odds) > 1 ? Number(verified.robin_odds) : null;

    if (mode === 'donor') {
      if (donorStake >= 1 && donorOdds > 1) {
        api.calculate(arb.id, 0, {
          counterStake: donorStake,
          counterOdds: donorOdds,
          livePinnacleOdds: livePin,
          liveRobinOdds: liveRobin,
        })
          .then((result) => {
            if (requestId === calcRequestRef.current) setCalc(result);
          })
          .catch(() => {
            if (requestId === calcRequestRef.current) setCalc(null);
          });
      } else {
        setCalc(null);
      }
    } else if (stakeTotal >= 10) {
      api.calculate(arb.id, stakeTotal, {
        livePinnacleOdds: livePin,
        liveRobinOdds: liveRobin,
      })
        .then((result) => {
          if (requestId === calcRequestRef.current) setCalc(result);
        })
        .catch(() => {
          if (requestId === calcRequestRef.current) setCalc(null);
        });
    } else {
      setCalc(null);
    }
  }, [arb.id, stakeTotal, mode, donorStake, donorOdds, verified?.current_odds, verified?.robin_odds]);

  useEffect(() => {
    cancelRef.current = false;
    let timer;
    const liveBetslipMode = verifyMode === 'betslip';
    const notifyExpired = () => {
      if (expiredNoticeRef.current) return;
      expiredNoticeRef.current = true;
      showToast?.('Please choose fork again', 'error');
    };
    const tick = async () => {
      if (cancelRef.current) return;
      if (liveBetslipMode && Date.now() - verifyStartedAtRef.current >= BETSLIP_VERIFY_WINDOW_MS) {
        setVerified({
          verified: false,
          status: 'CALCULATOR_EXPIRED',
          current_odds: arb.bk1_odds,
          feed_odds: arb.bk1_odds,
          detail: 'Please choose fork again.',
          source: 'calculator-guard',
        });
        setPendingAccept(null);
        setPreConfirm(null);
        setConfirmChange(null);
        notifyExpired();
        return;
      }
      if (inflightRef.current) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      inflightRef.current = true;
      try {
        const result = await api.verify(arb.id, {
          verifyMode,
          verifyScope: liveBetslipMode ? 'calculator' : null,
          clientId: liveBetslipMode ? calculatorClientIdRef.current : null,
        });
        if (cancelRef.current) return;
        if (result?.status === 'CALCULATOR_EXPIRED') {
          setVerified(result);
          setPendingAccept(null);
          setPreConfirm(null);
          setConfirmChange(null);
          notifyExpired();
          return;
        }
        if (result?.should_stop_refresh || result?.status === 'EXPIRED' || result?.error_code === 'VERIFY_WINDOW_EXPIRED') {
          setVerified(result);
          setPendingAccept(null);
          setPreConfirm(null);
          setConfirmChange(null);
          notifyExpired();
          return;
        }
        if (result?.verified) {
          setVerified(result);
          setVerifiedAt(Date.now());
        } else {
          const realPriceDiff = result?.status === 'PRICE_DIFF';
          const prevAge = Date.now() - verifiedAtRef.current;
          if (!realPriceDiff && verifiedAtRef.current && prevAge <= FRESH_MS) {
            setVerified((prev) => ({
              ...(prev || {}),
              ...result,
              verified: true,
              keepingPrevious: true,
              previous_odds: prev?.current_odds,
              current_odds: prev?.current_odds,
              status: 'CACHED_AFTER_FAILED_CHECK',
              live_detail: result?.detail || result?.status || 'Live check failed',
            }));
          } else {
            setVerified(result);
          }
        }
        setLastResultAt(Date.now());
      } catch (error) {
        if (cancelRef.current) return;
        const prevAge = Date.now() - verifiedAtRef.current;
        const fallback = {
          verified: false,
          status: 'ERROR',
          current_odds: arb.bk1_odds,
          feed_odds: arb.bk1_odds,
          detail: error?.message || 'Live price check failed',
          source: 'verify-error',
          timestamp: Date.now() / 1000,
        };
        if (verifiedAtRef.current && prevAge <= FRESH_MS) {
          setVerified((prev) => ({
            ...(prev || {}),
            ...fallback,
            verified: true,
            keepingPrevious: true,
            previous_odds: prev?.current_odds,
            current_odds: prev?.current_odds,
            status: 'CACHED_AFTER_FAILED_CHECK',
            live_detail: fallback.detail,
          }));
        } else {
          setVerified(fallback);
        }
        setLastResultAt(Date.now());
      } finally {
        inflightRef.current = false;
      }
      if (!cancelRef.current) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelRef.current = true;
      clearTimeout(timer);
      if (liveBetslipMode) {
        api.releaseCalculatorVerify(arb.id, calculatorClientIdRef.current).catch(() => {});
      }
    };
  }, [arb.id, arb.bk1_odds, verifyMode, showToast]);

  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 700);
    return () => clearInterval(iv);
  }, []);

  const submitBet = async (side, odds, quoteId, stake) => {
    // 1. Ограничение максимальной ставки
    const MAX_STAKE_LIMIT = 50.0;
    if (stake > MAX_STAKE_LIMIT) {
      showToast('Временный лимит на ставку 50 евро, изменится после успешной серии ставок без багов, очень скоро', 'error');
      return;
    }

    // 2. Ограничение баланса пользователя
    const account = side === 'pinnacle' ? 'pinnacle_cashback' : 'robinbet';
    const userBalance = balance ? (balance[account] || 0) : 0;
    if (stake > userBalance) {
      showToast(`Недостаточно средств. Ваш баланс ${side === 'pinnacle' ? 'PIN' : 'RobinBet'}: $${userBalance.toFixed(2)}`, 'error');
      return;
    }

    setPlacing(true);
    try {
      await api.placeBet(arb.id, side, stake, odds, quoteId, { verifyMode });
      const details = {
        side,
        odds,
        stake,
        selection: pinOutcomeText,
        potentialReturn: Number(stake * odds),
      };
      setSuccessDetails(details);
      setPlacing(false);
      verifyStartedAtRef.current = Date.now();
      expiredNoticeRef.current = false;
      onBetPlaced();
    } catch (error) {
      // Match-limit gate (HTTP 409 with structured payload) — show the
      // remaining headroom so the user can re-submit with the right size
      // instead of staring at a generic "stake exceeds limit" message.
      const payload = error?.payload;
      const remaining = payload?.adjusted_stake ?? payload?.remaining;
      const limitErr = payload?.error === 'stake_above_remaining' || payload?.error === 'match_limit_exceeded';
      const pinnaclePlaceErr = payload?.error === 'pinnacle_place_rejected'
        || payload?.error === 'pinnacle_place_http_error'
        || payload?.error === 'pinnacle_place_request_failed';
      let msg = error.message;
      if (limitErr && Number.isFinite(Number(remaining))) {
        msg = `Available up to $${Number(remaining).toFixed(2)}. Lower the stake and try again.`;
      } else if (pinnaclePlaceErr) {
        const code = payload?.pinnacle_error_code ? ` (${payload.pinnacle_error_code})` : '';
        msg = payload?.user_message || `Pinnacle: ${error.message}${code}`;
      }
      showToast(msg, 'error');
      setPlacing(false);
    }
  };

  useEffect(() => {
    if (!pendingAccept || placing || confirmChange) return undefined;
    if (pendingAccept.instant) return undefined; // instant mode has its own fixed-delay timer
    const timer = setTimeout(() => {
      setPendingAccept(null);
      showToast?.('Возможно цена изменилась, попробуйте ещё раз', 'error');
    }, ACCEPT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingAccept, placing, confirmChange, showToast]);

  const verifiedPinOdds = Number(verified?.current_odds);
  const pinOdds = verified?.verified && Number.isFinite(verifiedPinOdds) && verifiedPinOdds > 1
    ? verifiedPinOdds
    : initialPinOdds;
  const verifiedRobinOdds = Number(verified?.robin_odds);
  const calcRobinOdds = Number(calc?.robinbet?.odds);
  const arbRobinOdds = Number(arb.robin_odds);
  const robinDisplay = [verifiedRobinOdds, calcRobinOdds, arbRobinOdds, pinOdds + FALLBACK_ROBIN_TICKS]
    .find((value) => Number.isFinite(value) && value > 1) || (pinOdds + FALLBACK_ROBIN_TICKS);
  const verifiedRobinQuoteReady = Boolean(
    verified?.verified
    && verified?.robin_quote_verified === true
    && Number.isFinite(verifiedRobinOdds)
    && verifiedRobinOdds > 1
  );
  const exactRobinMode = verifyMode !== 'demo';
  const robinQuoteUnavailable = Boolean(
    exactRobinMode
    && verified
    && !verifiedRobinQuoteReady
  );
  const isRobinCalculating = exactRobinMode
    ? !verified
    : (!arb.robin_work_selected && !verified);
  const isRobinBlocked = isRobinCalculating || robinQuoteUnavailable;
  const robinQuoteDetail = verified?.robin_quote_detail
    || verified?.detail
    || 'No exact Robin quote for this verified Pinnacle outcome.';
  const ageMs = verifiedAt ? nowMs - verifiedAt : Infinity;
  const isFresh = Boolean(verified?.verified) && ageMs <= FRESH_MS;

  const donorStakeNumForCalc = Number(donorStake) || 0;
  const donorOddsNumForCalc = Number(donorOdds) || 0;

  const localCalc = useMemo(() => {
    if (mode === 'donor') {
      if (donorStakeNumForCalc >= 1 && donorOddsNumForCalc > 1 && pinOdds > 1 && robinDisplay > 1) {
        const donorReturn = donorStakeNumForCalc * donorOddsNumForCalc;
        const pinStake = Math.round((donorReturn / pinOdds) * 100) / 100;
        const robinStake = Math.round((donorReturn / robinDisplay) * 100) / 100;
        const pinTotal = pinStake + donorStakeNumForCalc;
        const robinTotal = robinStake + donorStakeNumForCalc;
        const pinProfit = Math.round((donorReturn - pinTotal) * 100) / 100;
        const robinProfit = Math.round((donorReturn - robinTotal) * 100) / 100;
        const cashback = Math.round((pinStake * 0.5) * 100) / 100;
        return {
          mode: 'donor',
          donor_stake: donorStakeNumForCalc,
          donor_odds: donorOddsNumForCalc,
          donor_return: donorReturn,
          total_stake: pinTotal,
          pinnacle: {
            stake: pinStake,
            odds: pinOdds,
            return: Math.round((pinStake * pinOdds) * 100) / 100,
            profit: pinProfit,
            cashback_50pct: cashback,
            net_with_cashback: Math.round((pinProfit + cashback) * 100) / 100,
          },
          counter: {
            stake: donorStakeNumForCalc,
            odds: donorOddsNumForCalc,
            return: donorReturn,
          },
          robinbet: {
            stake: robinStake,
            odds: robinDisplay,
            return: Math.round((robinStake * robinDisplay) * 100) / 100,
            counter_stake: donorStakeNumForCalc,
            profit: robinProfit,
          }
        };
      }
    } else {
      if (stakeTotal >= 10 && pinOdds > 1 && Number(arb.bk2_odds) > 1 && robinDisplay > 1) {
        const inv1 = 1 / pinOdds;
        const inv2 = 1 / Number(arb.bk2_odds);
        const ti = inv1 + inv2;
        const s1 = Math.round((stakeTotal * inv1 / ti) * 100) / 100;
        const s2 = Math.round((stakeTotal * inv2 / ti) * 100) / 100;
        const profitPin = Math.round((s1 * pinOdds - stakeTotal) * 100) / 100;
        const cashback = Math.round((s1 * 0.5) * 100) / 100;

        const ri1 = 1 / robinDisplay;
        const ri2 = 1 / Number(arb.bk2_odds);
        const rt = ri1 + ri2;
        const rs1 = Math.round((stakeTotal * ri1 / rt) * 100) / 100;
        const rs2 = Math.round((stakeTotal * ri2 / rt) * 100) / 100;
        const rprofit = Math.round((rs1 * robinDisplay - stakeTotal) * 100) / 100;

        return {
          mode: 'standard',
          total_stake: stakeTotal,
          pinnacle: {
            stake: s1,
            odds: pinOdds,
            return: Math.round((s1 * pinOdds) * 100) / 100,
            profit: profitPin,
            cashback_50pct: cashback,
            net_with_cashback: Math.round((profitPin + cashback) * 100) / 100,
          },
          counter: {
            stake: s2,
            odds: Number(arb.bk2_odds),
            return: Math.round((s2 * Number(arb.bk2_odds)) * 100) / 100,
          },
          robinbet: {
            stake: rs1,
            odds: robinDisplay,
            return: Math.round((rs1 * robinDisplay) * 100) / 100,
            profit: rprofit,
            counter_stake: rs2,
          }
        };
      }
    }
    return null;
  }, [mode, donorStakeNumForCalc, donorOddsNumForCalc, pinOdds, robinDisplay, stakeTotal, arb.bk2_odds]);

  const activeCalc = useMemo(() => {
    if (!localCalc) return null;
    return {
      ...localCalc,
      match_limits: calc?.match_limits || null,
      profit_pct: calc?.profit_pct ?? arb.profit_pct,
      robin_profit_pct: calc?.robin_profit_pct ?? arb.robin_profit_pct,
    };
  }, [localCalc, calc, arb.profit_pct, arb.robin_profit_pct]);

  useEffect(() => { calcRef.current = activeCalc; }, [activeCalc]);

  useEffect(() => {
    pinOddsRef.current = pinOdds;
    robinDisplayRef.current = robinDisplay;
  }, [pinOdds, robinDisplay]);

  useEffect(() => {
    if (!pendingAccept || !activeCalc || placing || confirmChange) return;
    if (pendingAccept.instant) return; // instant mode skips the live-match handshake entirely
    if (!verified?.verified || verified?.keepingPrevious || verified?.sticky) return;
    if (!verified?.quote_id) return;
    if (pendingAccept.side === 'robinbet' && !verifiedRobinQuoteReady) {
      setPendingAccept(null);
      showToast?.(robinQuoteDetail, 'error');
      return;
    }
    const ageMs = Date.now() - verifiedAt;
    if (ageMs > ACCEPT_FRESH_MS) return;

    const livePin = Number(verified.current_odds);
    const liveRobin = Number(robinDisplay);
    const liveOdds = pendingAccept.side === 'pinnacle' ? livePin : liveRobin;
    const expected = pendingAccept.expectedOdds;
    const tol = Math.max(ODDS_TOL, expected * 0.001);
    if (!Number.isFinite(liveOdds) || liveOdds <= 1) return;
    const matches = Math.abs(liveOdds - expected) <= tol;

    setPendingAccept(null);

    if (pendingAccept.side === 'pinnacle') {
      const stake = activeCalc.pinnacle.stake;
      if (matches) submitBet('pinnacle', livePin, verified.quote_id, stake);
      else setConfirmChange({ side: 'pinnacle', from: expected, to: livePin, quoteId: verified.quote_id });
    } else {
      if (matches) submitBet('robinbet', liveOdds, verified.quote_id, activeCalc.robinbet.stake);
      else setConfirmChange({ side: 'robinbet', from: expected, to: liveOdds, quoteId: verified.quote_id });
    }
  }, [verified, verifiedAt, pendingAccept, placing, confirmChange, activeCalc, robinDisplay, verifiedRobinQuoteReady, robinQuoteDetail, showToast]);

  // Demo submit: fixed delay, no price-match check or betslip quote. Owner
  // mode disables this path and keeps the strict verify-match-then-submit flow.
  useEffect(() => {
    if (!pendingAccept?.instant || placing) return undefined;
    const timer = setTimeout(() => {
      const currentCalc = calcRef.current;
      if (!currentCalc) {
        setPendingAccept(null);
        return;
      }
      const side = pendingAccept.side;
      const stake = side === 'pinnacle' ? currentCalc.pinnacle.stake : currentCalc.robinbet.stake;
      if (side === 'pinnacle') {
        const liveOdds = Number(verifiedRef.current?.current_odds);
        const fallbackPinOdds = Number(pinOddsRef.current);
        const oddsToUse = Number.isFinite(liveOdds) && liveOdds > 1 ? liveOdds : fallbackPinOdds;
        const quoteId = null;
        setPendingAccept(null);
        submitBet('pinnacle', oddsToUse, quoteId, stake);
      } else {
        const oddsToUse = Number(robinDisplayRef.current);
        setPendingAccept(null);
        submitBet('robinbet', oddsToUse, null, stake);
      }
    }, INSTANT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pendingAccept, placing]);

  const Row = ({ label, value, color }) => (
    <div className="calc-row">
      <span className="label">{label}</span>
      <span className="value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
  void Row;

  const isSticky = variant === 'sticky';
  const wrapClass = isSticky ? 'sticky-calc' : 'modal-overlay';
  const innerClass = isSticky ? 'sticky-calc-inner' : 'modal';
  const handleWrapClick = isSticky ? undefined : onClose;

  const verifyStatus = verified?.status || '';
  const sinceOpen = nowMs - openedAt;
  const inGrace = !verifiedAt && sinceOpen <= FRESH_MS;
  const sinceLastFresh = verifiedAtRef.current ? nowMs - verifiedAtRef.current : Infinity;
  const inFailGrace = verifiedAtRef.current && sinceLastFresh <= FAIL_GRACE_MS;
  const instantAccept = verifyMode === 'demo';
  let statusText;
  let statusColor;
  if (instantAccept) {
    statusText = `feed · ${pinOdds.toFixed(3)}`;
    statusColor = 'var(--text-muted)';
  } else if (isFresh && verified?.keepingPrevious) {
    statusText = `cached · live check failed · ${(ageMs / 1000).toFixed(1)}s`;
    statusColor = 'var(--accent-warn)';
  } else if (isFresh && verified?.sticky) {
    statusText = `cached · replayed quote · ${(ageMs / 1000).toFixed(1)}s`;
    statusColor = 'var(--accent-warn)';
  } else if (isFresh) {
    statusText = `live ${(ageMs / 1000).toFixed(1)}s · ${pinOdds.toFixed(3)}`;
    statusColor = 'var(--positive)';
  } else if (verified?.verified) {
    statusText = `stale ${(ageMs / 1000).toFixed(1)}s`;
    statusColor = 'var(--accent-warn)';
  } else if (verifyStatus === 'CALCULATOR_EXPIRED') {
    statusText = 'Please choose fork again';
    statusColor = 'var(--accent-warn)';
  } else if (verifyStatus === 'CALCULATOR_LOCKED') {
    statusText = 'active in another tab';
    statusColor = 'var(--text-muted)';
  } else if (inGrace) {
    statusText = 'verifying…';
    statusColor = 'var(--text-muted)';
  } else if (verifyStatus === 'PRICE_DIFF') {
    const live = Number(verified?.current_odds);
    const feedOdds = Number(verified?.feed_odds || arb.bk1_odds);
    statusText = Number.isFinite(live) && Number.isFinite(feedOdds)
      ? `⚠ price changed: ${feedOdds.toFixed(3)} → ${live.toFixed(3)}`
      : '⚠ price changed';
    statusColor = 'var(--accent-warn)';
  } else if (verifyStatus === 'MISMATCH') {
    statusText = '⚠ wrong leg returned — verifier ignored';
    statusColor = 'var(--accent-warn)';
  } else if (inFailGrace) {
    statusText = `cached ${(sinceLastFresh / 1000).toFixed(1)}s · ${pinOdds.toFixed(3)}`;
    statusColor = 'var(--text-muted)';
  } else if (verifyStatus === 'STALE') {
    statusText = '⚠ feed stale — refresh scanner';
    statusColor = 'var(--accent-warn)';
  } else if (verifyStatus === 'UNAVAILABLE' || verifyStatus === 'UNSUPPORTED') {
    statusText = '⚠ no quote';
    statusColor = 'var(--negative, var(--accent-warn))';
  } else if (verifyStatus === 'ERROR') {
    statusText = '⚠ verify timeout/error';
    statusColor = 'var(--accent-warn)';
  } else if (verified) {
    statusText = '⚠ no quote';
    statusColor = 'var(--accent-warn)';
  } else {
    statusText = 'verifying…';
    statusColor = 'var(--text-muted)';
  }
  const statusBadge = statusText;
  const edgeAgeText = verifiedAt
    ? `${Math.max(0, ageMs / 1000).toFixed(1)}s`
    : 'feed';

  const beginAccept = (side) => {
    if (!activeCalc) return;
    if (side === 'robinbet' && isRobinBlocked) {
      showToast?.(robinQuoteUnavailable ? robinQuoteDetail : 'Robin quote is still verifying.', 'error');
      return;
    }
    const stake = side === 'pinnacle' ? activeCalc.pinnacle.stake : activeCalc.robinbet.stake;

    // 1. Ограничение максимальной ставки
    const MAX_STAKE_LIMIT = 50.0;
    if (stake > MAX_STAKE_LIMIT) {
      showToast('Временный лимит на ставку 50 евро, изменится после успешной серии ставок без багов, очень скоро', 'error');
      return;
    }

    // 2. Ограничение баланса пользователя
    const account = side === 'pinnacle' ? 'pinnacle_cashback' : 'robinbet';
    const userBalance = balance ? (balance[account] || 0) : 0;
    if (stake > userBalance) {
      showToast(`Недостаточно средств. Ваш баланс ${side === 'pinnacle' ? 'PIN' : 'RobinBet'}: $${userBalance.toFixed(2)}`, 'error');
      return;
    }

    if (instantAccept) {
      // Instant mode: skip preConfirm + match handshake entirely. The
      // dedicated effect above will fire submitBet after INSTANT_DELAY_MS.
      setPendingAccept({ side, instant: true });
      return;
    }
    const odds = side === 'pinnacle' ? pinOdds : robinDisplay;
    const net = stake * odds - stake;
    if (autoAccept) {
      setPendingAccept({ side, expectedOdds: odds });
    } else {
      setPreConfirm({ side, odds, stake, net });
    }
  };

  // Keep pre-confirm odds in sync with live verify ticks so user always sees
  // the fresh price they'd be accepting.
  useEffect(() => {
    if (!preConfirm) return;
    const liveOdds = preConfirm.side === 'pinnacle' ? pinOdds : robinDisplay;
    if (Math.abs(liveOdds - preConfirm.odds) < 1e-6) return;
    const stake = preConfirm.stake;
    setPreConfirm({
      ...preConfirm,
      previousOdds: preConfirm.previousOdds ?? preConfirm.odds,
      odds: liveOdds,
      net: stake * liveOdds - stake,
    });
  }, [preConfirm, pinOdds, robinDisplay]);

  const confirmPreAccept = () => {
    if (!preConfirm) return;
    const { side } = preConfirm;
    const odds = side === 'pinnacle' ? pinOdds : robinDisplay;
    setPreConfirm(null);
    setPendingAccept({ side, expectedOdds: odds });
  };

  const waiting = Boolean(pendingAccept) || placing;
  const matchLimits = activeCalc?.match_limits?.enabled ? activeCalc.match_limits : null;
  const pinReady = finiteNumber(matchLimits?.pin?.ready_to_accept);
  const robinReady = finiteNumber(matchLimits?.robin?.ready_to_accept);
  const maxDonorPin = finiteNumber(matchLimits?.max_donor_stake_for_pin);
  const maxDonorRobin = finiteNumber(matchLimits?.max_donor_stake_for_robin);
  const donorStakeNum = finiteNumber(donorStake);
  const donorCaps = [maxDonorPin, maxDonorRobin].filter((value) => Number.isFinite(value) && value > 0.01);
  const minDonorCap = donorCaps.length ? Math.min(...donorCaps) : NaN;
  const donorOverPin = mode === 'donor' && Number.isFinite(maxDonorPin) && donorStakeNum > maxDonorPin + 0.01;
  const donorOverRobin = mode === 'donor' && Number.isFinite(maxDonorRobin) && donorStakeNum > maxDonorRobin + 0.01;
  const counterOddsForEdge = finiteNumber(mode === 'donor' ? donorOdds : (activeCalc?.counter?.odds ?? arb.bk2_odds));
  const currentEdge = (() => {
    const pinCurrentOdds = finiteNumber(pinOdds);
    const robinCurrentOdds = finiteNumber(robinDisplay);
    if (mode === 'donor') {
      return {
        pin: donorModeEdge(pinCurrentOdds, counterOddsForEdge, donorStakeNum),
        robin: donorModeEdge(robinCurrentOdds, counterOddsForEdge, donorStakeNum),
      };
    }
    const totalStakeNum = finiteNumber(stakeTotal);
    return {
      pin: totalModeEdge(pinCurrentOdds, counterOddsForEdge, totalStakeNum),
      robin: totalModeEdge(robinCurrentOdds, counterOddsForEdge, totalStakeNum),
    };
  })();

  useEffect(() => {
    const nextValues = {
      pin: currentEdge.pin?.roiPct,
      robin: currentEdge.robin?.roiPct,
    };

    const markPulse = (side, direction) => {
      setEdgePulse((prev) => ({ ...prev, [side]: direction }));
      if (edgePulseTimersRef.current[side]) clearTimeout(edgePulseTimersRef.current[side]);
      edgePulseTimersRef.current[side] = setTimeout(() => {
        setEdgePulse((prev) => ({ ...prev, [side]: '' }));
        edgePulseTimersRef.current[side] = null;
      }, 650);
    };

    for (const side of ['pin', 'robin']) {
      const next = finiteNumber(nextValues[side]);
      const prev = finiteNumber(previousEdgeRef.current[side]);
      if (Number.isFinite(next) && Number.isFinite(prev) && Math.abs(next - prev) >= 0.01) {
        markPulse(side, next > prev ? 'up' : 'down');
      }
      previousEdgeRef.current[side] = Number.isFinite(next) ? next : null;
    }
  }, [currentEdge.pin?.roiPct, currentEdge.robin?.roiPct]);

  const resetAcceptState = () => {
    setPreConfirm(null);
    setPendingAccept(null);
    setConfirmChange(null);
  };

  const clearCalcForInput = () => {
    setCalc(null);
    resetAcceptState();
  };

  const applyDonorMaximum = (value, label = 'максимум') => {
    const nextStake = floorMoney(value);
    if (!Number.isFinite(nextStake) || nextStake <= 0) return;
    const stakeChanged = !Number.isFinite(donorStakeNum) || Math.abs(donorStakeNum - nextStake) > 0.005;
    const modeChanged = mode !== 'donor';
    setMode('donor');
    setDonorStake(nextStake);
    if (stakeChanged || modeChanged) setCalc(null);
    resetAcceptState();
    showToast?.(
      stakeChanged || modeChanged
        ? `Поставил ${label}: $${nextStake.toFixed(2)}. Пересчитываю плечи.`
        : `Уже стоит ${label}: $${nextStake.toFixed(2)}.`,
      'success',
    );
  };

  const pinOutcomeText = formatPinOutcome(arb);
  const counterOutcomeText = formatCounterOutcome(arb);
  const marketLabel = String(arb.market || '').trim();
  const leagueItems = leagueDisplayItems(arb);
  const pinPlaceText = `Pinnacle · ${pinOutcomeText}`;
  const counterPlaceText = `${arb.bk2_label || arb.bk2 || 'Counter'} · ${counterOutcomeText}`;
  const robinPlaceText = `Robin · ${pinOutcomeText}`;
  const placeTextForSide = (side) => (side === 'pinnacle' ? pinPlaceText : robinPlaceText);

  // Компактная плашка "рынок · исход" под заголовком ноги. Inline-стили,
  // чтобы не править index.css. Цвет акцента берём из родителя секции.
  const OutcomePill = ({ pick, accent }) => (
    <div
      className="calc-outcome"
      title={`Исход: ${marketLabel ? marketLabel + ' · ' : ''}${pick}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: '2px 0 4px',
        fontSize: '0.72rem',
        lineHeight: 1.2,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: '0.78rem' }}>🎯</span>
      {marketLabel && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
            fontSize: '0.66rem',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          {marketLabel}
        </span>
      )}
      <span
        style={{
          fontWeight: 700,
          color: accent || 'var(--text-primary)',
          fontSize: '0.78rem',
        }}
      >
        {pick}
      </span>
    </div>
  );

  return (
    <div className={wrapClass} onClick={handleWrapClick}>
      <div className={innerClass} onClick={(event) => event.stopPropagation()}>
        <h2>
          🧮 {arb.match}
          <span style={{ fontSize: '0.7rem', color: statusColor, fontWeight: 500, marginLeft: 8 }}>{statusBadge}</span>
          <button className="modal-close" onClick={onClose} title="Close">✕</button>
        </h2>

        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          <div>{arb.sport} · {arb.market} · Robin {isRobinCalculating ? '…' : robinQuoteUnavailable ? 'unavailable' : robinDisplay.toFixed(3)}</div>
          {leagueItems.length > 0 && (
            <div className="league-source-row compact" title={leagueDisplayTitle(leagueItems)}>
              {leagueItems.map((item) => (
                <span className="league-chip" key={`${item.code}-${item.label}`}>
                  <span className="league-chip-book">{item.code}</span>
                  <span className="league-chip-name">{item.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {robinQuoteUnavailable && (
          <div style={{ fontSize: '0.7rem', color: 'var(--accent-warn)', marginBottom: 6 }}>
            Robin unavailable: {robinQuoteDetail}
          </div>
        )}

        <div className="calc-placement-strip" title={`${pinPlaceText} / ${counterPlaceText}`}>
          <div className="calc-placement-leg pin">
            <span>Pinnacle</span>
            <strong>{pinOutcomeText}</strong>
          </div>
          <div className="calc-placement-leg counter">
            <span>{arb.bk2_label || arb.bk2 || 'Counter'}</span>
            <strong>{counterOutcomeText}</strong>
          </div>
          <div className="calc-placement-leg robin">
            <span>Robin</span>
            <strong>{pinOutcomeText}</strong>
          </div>
        </div>
        <CounterNavigationHint guidance={arb.counter_navigation} />

        <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', gap: 2, marginRight: 4 }}>
            <button
              className={`btn ${mode === 'donor' ? 'btn-primary' : 'btn-link'}`}
              style={{ fontSize: '0.66rem', padding: '2px 6px' }}
              onClick={() => {
                if (mode !== 'donor') clearCalcForInput();
                setMode('donor');
              }}
              title="Enter donor stake → size Pinnacle leg"
            >Donor</button>
            <button
              className={`btn ${mode === 'total' ? 'btn-primary' : 'btn-link'}`}
              style={{ fontSize: '0.66rem', padding: '2px 6px' }}
              onClick={() => {
                if (mode !== 'total') clearCalcForInput();
                setMode('total');
              }}
              title="Split total stake across both legs"
            >Total</button>
          </div>
          {mode === 'total' ? (
            <>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={`btn ${stakeTotal === preset ? 'btn-primary' : 'btn-link'}`}
                  style={{ fontSize: '0.66rem', padding: '2px 6px' }}
                  onClick={() => {
                    clearCalcForInput();
                    setStakeTotal(preset);
                  }}
                >
                  ${preset}
                </button>
              ))}
              <input
                className="stake-input"
                type="number"
                value={stakeTotal}
                onChange={(event) => {
                  clearCalcForInput();
                  setStakeTotal(event.target.value === '' ? '' : parseFloat(event.target.value) || 0);
                }}
                min="10" step="100"
                style={{ flex: 1, margin: 0, padding: '3px 6px', fontSize: '0.76rem', minWidth: 80 }}
              />
            </>
          ) : (
            <>
              <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{arb.bk2_label || arb.bk2}:</span>
              <input
                className="stake-input"
                type="number"
                value={donorStake}
                onChange={(event) => {
                  clearCalcForInput();
                  setDonorStake(event.target.value === '' ? '' : parseFloat(event.target.value) || 0);
                }}
                min="1" step="50"
                style={{ width: 80, margin: 0, padding: '3px 6px', fontSize: '0.76rem' }}
              />
              {Number.isFinite(minDonorCap) && (
                <button
                  className={`btn ${(donorOverPin || donorOverRobin) ? 'btn-primary' : 'btn-link'}`}
                  type="button"
                  onClick={() => applyDonorMaximum(minDonorCap)}
                  title="Подставить максимум донора, чтобы наше плечо прошло полностью"
                  style={{ fontSize: '0.66rem', padding: '2px 6px' }}
                >
                  Max ${formatStake(minDonorCap)}
                </button>
              )}
              <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>@</span>
              <input
                className="stake-input"
                type="number"
                value={donorOdds}
                onChange={(event) => {
                  clearCalcForInput();
                  setDonorOdds(event.target.value === '' ? '' : parseFloat(event.target.value) || 0);
                }}
                min="1.01" step="0.01"
                style={{ width: 64, margin: 0, padding: '3px 6px', fontSize: '0.76rem' }}
              />
            </>
          )}
        </div>

        {(currentEdge.pin || currentEdge.robin) && (
          <div className="calc-edge-strip" title="Current arb size at the latest shown prices">
            <div className={`calc-edge-card pin ${edgeTone(currentEdge.pin?.roiPct)} ${edgePulse.pin ? `pulse-${edgePulse.pin}` : ''}`}>
              <div className="calc-edge-label">
                <span>PIN</span>
                <span>@{pinOdds.toFixed(3)}</span>
              </div>
              <div className="calc-edge-main">{signedPct(currentEdge.pin?.roiPct)}</div>
              <div className="calc-edge-sub">
                {signedMoney(currentEdge.pin?.net)}
                <span>PIN ${formatStake(currentEdge.pin?.primaryStake, 2)}</span>
              </div>
              <div className="calc-edge-meta">
                <span>{edgeAgeText}</span>
              </div>
            </div>
            <div className={`calc-edge-card robin ${edgeTone(currentEdge.robin?.roiPct)} ${edgePulse.robin ? `pulse-${edgePulse.robin}` : ''}`}>
              <div className="calc-edge-label">
                <span>Robin {isRobinCalculating ? <span className="robin-spin-icon" style={{ display: 'inline-flex', animation: 'spin 1s linear infinite', marginLeft: 4 }}>🔄</span> : robinQuoteUnavailable ? <span style={{ color: 'var(--accent-warn)', marginLeft: 4 }}>⚠</span> : <span style={{ color: 'var(--positive)', marginLeft: 4 }}>✅</span>}</span>
                <span>@{isRobinCalculating ? '...' : robinQuoteUnavailable ? '—' : robinDisplay.toFixed(3)}</span>
              </div>
              <div className="calc-edge-main">{isRobinCalculating ? '⏳...' : robinQuoteUnavailable ? 'unavailable' : signedPct(currentEdge.robin?.roiPct)}</div>
              <div className="calc-edge-sub">
                {isRobinCalculating ? 'расчет...' : robinQuoteUnavailable ? 'exact quote required' : signedMoney(currentEdge.robin?.net)}
                <span>Robin {isRobinBlocked ? '$—' : `$${formatStake(currentEdge.robin?.primaryStake, 2)}`}</span>
              </div>
              <div className="calc-edge-meta">
                <span>{edgeAgeText}</span>
              </div>
            </div>
          </div>
        )}

        {activeCalc && (
          <div className="calc-grid-compact">
            <div className="calc-section pin">
              <div className="calc-section-head" style={{ color: 'var(--accent-warn)' }}>
                <span>🏷 PIN</span>
                <span
                  className="calc-profit"
                  style={{ color: activeCalc.pinnacle.profit >= 0 ? 'var(--positive)' : 'var(--accent-warn)' }}
                  title="Чистый размер вилки: PIN payout − обе ставки, без cashback"
                >
                  {activeCalc.pinnacle.profit >= 0 ? '+' : ''}${Number(activeCalc.pinnacle.profit).toFixed(2)}
                </span>
              </div>
              <OutcomePill pick={pinOutcomeText} accent="var(--accent-warn)" />
              <div className="calc-inline">
                <span>${activeCalc.pinnacle.stake}</span>
                <span className="dim">@</span>
                <span>{Number(activeCalc.pinnacle.odds).toFixed(3)}</span>
              </div>
            </div>
            <div className="calc-section counter">
              <div className="calc-section-head" style={{ color: 'var(--accent-robin)' }}>
                <span>📊 {arb.bk2_label || arb.bk2}</span>
                <span className="calc-profit dim">→${Number(activeCalc.counter.return).toFixed(2)}</span>
              </div>
              <OutcomePill pick={counterOutcomeText} accent="var(--accent-robin)" />
              <div className="calc-inline">
                <span>${activeCalc.counter.stake}</span>
                <span className="dim">@</span>
                <span>{Number(arb.bk2_odds).toFixed(3)}</span>
              </div>
            </div>
            <div className="calc-section robin">
              <div className="calc-section-head" style={{ color: 'var(--positive)' }}>
                <span>🦅 Robin {isRobinCalculating ? <span className="robin-spin-icon" style={{ display: 'inline-flex', animation: 'spin 1s linear infinite', marginLeft: 4 }}>🔄</span> : robinQuoteUnavailable ? <span style={{ color: 'var(--accent-warn)', marginLeft: 4 }}>⚠</span> : <span style={{ color: 'var(--positive)', marginLeft: 4 }}>✅</span>}</span>
                <span
                  className="calc-profit"
                  style={{ color: activeCalc.robinbet.profit >= 0 ? 'var(--positive)' : 'var(--accent-warn)' }}
                  title="Прибыль вилки Robin: Robin payout − обе ставки"
                >
                  {isRobinCalculating ? '⏳...' : robinQuoteUnavailable ? 'unavailable' : `${activeCalc.robinbet.profit >= 0 ? '+' : ''}$${Number(activeCalc.robinbet.profit).toFixed(2)}`}
                </span>
              </div>
              <OutcomePill pick={pinOutcomeText} accent="var(--positive)" />
              <div className="calc-inline" style={{ opacity: isRobinBlocked ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <span>{isRobinCalculating ? '$...' : robinQuoteUnavailable ? '$—' : `$${activeCalc.robinbet.stake}`}</span>
                <span className="dim">@</span>
                <span>{isRobinCalculating ? '...' : robinQuoteUnavailable ? '—' : Number(activeCalc.robinbet.odds).toFixed(3)}</span>
              </div>
            </div>
          </div>
        )}

        {matchLimits && (() => {
          const ml = matchLimits;
          const cap = finiteNumber(ml.max_stake_per_match);
          const used = finiteNumber(ml.pin?.stats?.total_staked) || 0;
          const hasCap = Number.isFinite(cap);
          const exhausted = (Number.isFinite(pinReady) && pinReady <= 0.01) && (Number.isFinite(robinReady) && robinReady <= 0.01);
          return (
            <div
              className="calc-section"
              style={{
                marginTop: 6,
                padding: '4px 8px',
                fontSize: '0.7rem',
                lineHeight: 1.35,
                background: exhausted ? 'rgba(220, 50, 50, 0.08)' : 'rgba(80, 160, 255, 0.06)',
                border: `1px solid ${exhausted ? 'var(--accent-warn)' : 'var(--border-color, rgba(255,255,255,0.1))'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ color: exhausted ? 'var(--accent-warn)' : 'var(--text-secondary)' }}>
                  Match limit
                  {hasCap ? `: ${used.toFixed(0)} / ${cap.toFixed(0)} used` : ': no cap'}
                </span>
                {hasCap && (
                  <span style={{ color: exhausted ? 'var(--accent-warn)' : 'var(--positive)' }}>
                    Available: PIN ${Number.isFinite(pinReady) ? pinReady.toFixed(0) : '-'} · Robin ${Number.isFinite(robinReady) ? robinReady.toFixed(0) : '-'}
                  </span>
                )}
              </div>
              {(donorOverPin || donorOverRobin) && (
                <div
                  style={{
                    marginTop: 5,
                    color: 'var(--accent-warn)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    Counter stake ${formatStake(donorStakeNum, 2)} is above the current limit. Use:
                  </span>
                  {donorOverPin && Number.isFinite(maxDonorPin) && (
                    <button
                      className="btn btn-pin"
                      type="button"
                      onClick={() => applyDonorMaximum(maxDonorPin, 'максимум PIN')}
                      style={{ fontSize: '0.66rem', padding: '2px 6px' }}
                    >
                      PIN ${formatStake(maxDonorPin, 2)}
                    </button>
                  )}
                  {donorOverRobin && Number.isFinite(maxDonorRobin) && (
                    <button
                      className="btn btn-robin"
                      type="button"
                      onClick={() => applyDonorMaximum(maxDonorRobin, 'максимум Robin')}
                      style={{ fontSize: '0.66rem', padding: '2px 6px' }}
                    >
                      Robin ${formatStake(maxDonorRobin, 2)}
                    </button>
                  )}
                  {Number.isFinite(minDonorCap)
                    && donorOverPin
                    && donorOverRobin
                    && Number.isFinite(maxDonorPin)
                    && Number.isFinite(maxDonorRobin)
                    && Math.abs(maxDonorPin - maxDonorRobin) > 0.01 && (
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => applyDonorMaximum(minDonorCap)}
                        style={{ fontSize: '0.66rem', padding: '2px 6px' }}
                      >
                        Both ${formatStake(minDonorCap, 2)}
                      </button>
                    )}
                </div>
              )}
            </div>
          );
        })()}

        <div className="action-buttons action-buttons-large">
          <a href={arb.bk1_url} target="_blank" rel="noreferrer" className="btn btn-link" style={{ flex: '0 0 auto' }}>PIN ↗</a>
          <a href={arb.bk2_url} target="_blank" rel="noreferrer" className="btn btn-link" style={{ flex: '0 0 auto' }}>{arb.bk2_label || arb.bk2} ↗</a>
          <button
            className="btn btn-pin btn-accept-big"
            onClick={() => beginAccept('pinnacle')}
            disabled={!activeCalc || waiting}
          >
            {placing && pendingAccept?.side !== 'robinbet' ? '⏳' : pendingAccept?.side === 'pinnacle' ? '⏳ wait live…' : `🏷 ${pinOutcomeText} · $${formatStake(activeCalc?.pinnacle?.stake, 2)} @${pinOdds.toFixed(3)}`}
          </button>
          <button
            className="btn btn-robin btn-accept-big"
            onClick={() => beginAccept('robinbet')}
            disabled={!activeCalc || waiting || isRobinBlocked}
          >
            {isRobinCalculating ? (
              <span>⏳ Расчет цены Robin / Recalculating...</span>
            ) : robinQuoteUnavailable ? (
              <span>⚠ No exact Robin quote</span>
            ) : pendingAccept?.side === 'robinbet' ? (
              '⏳ wait live…'
            ) : (
              `🦅 ${pinOutcomeText} · $${formatStake(activeCalc?.robinbet?.stake, 2)} @${robinDisplay.toFixed(3)}`
            )}
          </button>
          {pendingAccept && !placing && (
            <button className="btn btn-link" onClick={() => setPendingAccept(null)} style={{ flex: '0 0 auto', fontSize: '0.7rem' }}>Cancel</button>
          )}
        </div>

        {preConfirm && (() => {
          const isPin = preConfirm.side === 'pinnacle';
          const oddsChanged = preConfirm.previousOdds !== undefined && Math.abs(preConfirm.previousOdds - preConfirm.odds) > ODDS_TOL;
          const direction = oddsChanged ? (preConfirm.odds > preConfirm.previousOdds ? 'up' : 'down') : null;
          return (
            <div className="modal-overlay" onClick={() => setPreConfirm(null)} style={{ zIndex: 150 }}>
              <div
                className={`modal preconfirm-modal ${oddsChanged ? 'odds-changed' : ''}`}
                style={{ width: 380, padding: 14 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Подтвердите ставку</h2>
                <div style={{ fontSize: '0.9rem', marginBottom: 6 }}>
                  {isPin ? '🏷 Pinnacle' : '🦅 RobinBet'} · <b>{pinOutcomeText}</b> · <b>${preConfirm.stake.toFixed(2)}</b> @{' '}
                  <b className={oddsChanged ? `odds-pulse ${direction}` : ''} style={{ fontSize: '1.05rem' }}>
                    {preConfirm.odds.toFixed(3)}
                  </b>
                </div>
                {oddsChanged && (
                  <div className="odds-change-banner">
                    ⚠ Цена изменилась: <s>{preConfirm.previousOdds.toFixed(3)}</s> → <b>{preConfirm.odds.toFixed(3)}</b>
                  </div>
                )}
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  {arb.match} · {marketLabel || arb.market} · {placeTextForSide(preConfirm.side)} · Counter {counterPlaceText} · Net ${preConfirm.net.toFixed(2)}
                </div>
                <div className="action-buttons">
                  <button className="btn btn-link" onClick={() => setPreConfirm(null)} disabled={placing}>Отмена</button>
                  <button
                    className={`btn ${isPin ? 'btn-pin' : 'btn-robin'} btn-accept-big`}
                    onClick={confirmPreAccept}
                    disabled={placing}
                    style={{ flex: 2 }}
                  >
                    Принять @ {preConfirm.odds.toFixed(3)}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {confirmChange && activeCalc && (() => {
          const isPin = confirmChange.side === 'pinnacle';
          const stake = isPin ? activeCalc.pinnacle.stake : activeCalc.robinbet.stake;
          const finalOdds = confirmChange.to;
          const finalReturn = stake * finalOdds;
          const net = finalReturn - stake;
          return (
            <div className="modal-overlay" onClick={() => setConfirmChange(null)} style={{ zIndex: 200 }}>
              <div className="modal" style={{ width: 360, padding: 14 }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ fontSize: '0.95rem', marginBottom: 8 }}>{isPin ? 'Цена в Pinnacle изменилась' : 'Цена в RobinBet изменилась'}</h2>
                <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                  {isPin ? 'PIN' : 'Robin'}: <b>{confirmChange.from.toFixed(3)}</b> → <b style={{ color: 'var(--accent-warn)' }}>{confirmChange.to.toFixed(3)}</b>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Side: {placeTextForSide(confirmChange.side)} · Counter {counterPlaceText} · Stake ${stake} · Return ${finalReturn.toFixed(2)} · Net ${net.toFixed(2)}
                </div>
                <div className="action-buttons">
                  <button className="btn btn-link" onClick={() => setConfirmChange(null)} disabled={placing}>Cancel</button>
                  <button
                    className={`btn ${isPin ? 'btn-pin' : 'btn-robin'}`}
                    onClick={async () => {
                      const { side, quoteId } = confirmChange;
                      setConfirmChange(null);
                      await submitBet(side, finalOdds, quoteId, stake);
                    }}
                    disabled={placing}
                  >
                    {placing ? 'Accepting…' : `Accept @ ${finalOdds.toFixed(3)}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {successDetails && (() => {
          const isPin = successDetails.side === 'pinnacle';
          return (
            <div className="modal-overlay" onClick={() => { setSuccessDetails(null); }} style={{ zIndex: 300 }}>
              <div className="modal success-modal" style={{ width: 380, padding: 16 }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ fontSize: '1rem', color: 'var(--positive)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✅</span> Ставка успешно размещена!
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', marginBottom: 16 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Букмекер:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{isPin ? '🏷 Pinnacle' : '🦅 RobinBet'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Исход:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{successDetails.selection}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Ставка:</span>{' '}
                    <span style={{ fontWeight: 600 }}>${successDetails.stake.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Коэффициент:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{successDetails.odds.toFixed(3)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Возможная выплата:</span>{' '}
                    <span style={{ fontWeight: 600, color: 'var(--positive)' }}>${successDetails.potentialReturn.toFixed(2)}</span>
                  </div>
                  {isPin && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--positive)', background: 'rgba(0, 214, 126, 0.1)', padding: '6px', borderRadius: '4px' }}>
                      🎁 Возможный кэшбэк: <b>${(successDetails.stake * 0.5).toFixed(2)}</b> (начисляется в случае проигрыша Pinnacle-плеча)
                    </div>
                  )}
                </div>
                <div className="action-buttons">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSuccessDetails(null);
                    }}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    OK / Закрыть
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
