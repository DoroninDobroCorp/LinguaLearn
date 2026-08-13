import { useEffect, useRef, useState, useMemo } from 'react';
import { api } from '../api';
import { leagueDisplayItems, leagueDisplayTitle } from '../utils/leagueDisplay';
import { formatCounterOutcome, formatPinOutcome } from '../utils/outcomes';
import {
  calcPlanMatchesInputs,
  calcPlanMatchesOdds,
  simulationQuoteDetails,
} from '../utils/quickBetMath';
import {
  donorModeEdge,
  edgeTone,
  finiteNumber,
  floorMoney,
  formatStake,
  safeDefaultDonorStake,
  signedMoney,
  signedPct,
} from '../utils/calculatorEdgeMath';
import CounterNavigationHint from './CounterNavigationHint';
import { parserRobinPreviewOdds } from '../utils/robinPrice';

const FRESH_MS = 25000;
const ACCEPT_FRESH_MS = 3000;
const ACCEPT_TIMEOUT_MS = 50000;
const FAIL_GRACE_MS = 20000;
const AUTO_REFRESH_MS = 1000;
const ODDS_TOL = 0.001;
const FALLBACK_ROBIN_TICKS = 0.04;
const MAX_STAKE_LIMIT = 50.0;
const CALCULATOR_CLIENT_KEY = 'robinarb.calculatorClientId';
// Fixed delay used by the legacy instant accept mode. Live betslip mode still
// requires a fresh quote_id/current_odds before submitting.
const INSTANT_DELAY_MS = 4000;

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

export default function Calculator({ arb, balance, onClose, onBetPlaced, showToast, variant, verifyMode = 'betslip' }) {
  const isMultiLeg = Array.isArray(arb?.multi_leg?.legs) && arb.multi_leg.legs.length > 2;
  const requiresScenarioPlan = arb?.settlement_requires_scenario_plan === true;
  const preverifiedPinOdds = Number(arb.robin_work_verified_pin_odds);
  const initialPinOdds = !arb.robin_work_verification_blocked && Number.isFinite(preverifiedPinOdds) && preverifiedPinOdds > 1
    ? preverifiedPinOdds
    : Number(arb.bk1_odds);
  const initialDonorStake = safeDefaultDonorStake(
    arb.bk2_odds,
    [initialPinOdds, arb.robin_odds],
    MAX_STAKE_LIMIT,
  );
  const mode = 'donor';
  const [donorStake, setDonorStake] = useState(initialDonorStake);
  const [donorOdds, setDonorOdds] = useState(arb.bk2_odds);
  const [calc, setCalc] = useState(null);
  const [openedAt] = useState(Date.now());
  const [verified, setVerified] = useState(null);
  const [verifiedAt, setVerifiedAt] = useState(0);
  const [verifyRequestSeq, setVerifyRequestSeq] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [, setLastResultAt] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [successDetails, setSuccessDetails] = useState(null);
  // Pre-confirm dialog (asks user before kicking off live verify + place).
  const [preConfirm, setPreConfirm] = useState(null); // { side, odds, stake, net }
  const [pendingAccept, setPendingAccept] = useState(null); // { side, expectedOdds }
  const [confirmChange, setConfirmChange] = useState(null); // { side, from, to, quoteId|null }
  const [edgePulse, setEdgePulse] = useState({ pin: '', robin: '' });
  const verifiedAtRef = useRef(0);
  const calcRequestRef = useRef(0);
  const calculatorClientIdRef = useRef(loadCalculatorClientId());
  const activeBasketArbIdRef = useRef(arb.id);
  const basketSwitchPromiseRef = useRef(Promise.resolve());
  const activeVerifyPromiseRef = useRef(Promise.resolve());
  const activeVerifyAbortRef = useRef(null);
  const previousEdgeRef = useRef({ pin: null, robin: null });
  const edgePulseTimersRef = useRef({ pin: null, robin: null });

  useEffect(() => { verifiedAtRef.current = verifiedAt; }, [verifiedAt]);

  useEffect(() => {
    setVerified(null); setVerifiedAt(0); setLastResultAt(0); setCalc(null);
    setPreConfirm(null); setPendingAccept(null); setConfirmChange(null);
    setEdgePulse({ pin: '', robin: '' });
    setDonorStake(initialDonorStake);
    setDonorOdds(arb.bk2_odds);
    verifiedAtRef.current = 0;
    previousEdgeRef.current = { pin: null, robin: null };
  }, [arb.id, arb.bk2_odds, initialDonorStake]);

  useEffect(() => () => {
    Object.values(edgePulseTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  useEffect(() => {
    const requestId = ++calcRequestRef.current;
    const livePin = verified?.verified && Number(verified.current_odds) > 1 ? Number(verified.current_odds) : null;
    const liveRobin = verified?.verified && Number(verified.robin_odds) > 1 ? Number(verified.robin_odds) : null;
    // Never leave a server plan from the preceding quote active while its
    // replacement is in flight. No locally captured plan is executable.
    setCalc(null);

    if (donorStake >= 1 && (isMultiLeg || donorOdds > 1)) {
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
  }, [arb.id, donorStake, donorOdds, verified?.current_odds, verified?.robin_odds, isMultiLeg]);

  useEffect(() => {
    const previousArbId = activeBasketArbIdRef.current;
    activeBasketArbIdRef.current = arb.id;
    if (verifyMode === 'betslip' && previousArbId && previousArbId !== arb.id) {
      // Release the previous retained Single before creating the next one. The
      // calculator still changes visually at once; only exact BIA execution
      // waits for cleanup, preventing two selections from competing for the
      // shared account slot during a fast A -> B card switch.
      activeVerifyAbortRef.current?.abort();
      basketSwitchPromiseRef.current = Promise.resolve(activeVerifyPromiseRef.current)
        .catch(() => null)
        .then(() => api.releaseCalculatorVerify(
          previousArbId,
          calculatorClientIdRef.current,
        ))
        .catch(() => null);
    } else {
      basketSwitchPromiseRef.current = Promise.resolve();
    }
  }, [arb.id, verifyMode]);

  useEffect(() => {
    // BIA keeps one Single basket for this calculator intent. Repeated calls
    // read and refresh that same basket, so the visible PIN price stays live
    // without deleting/recreating selections. Once the external leg is
    // confirmed we make exactly one final refresh and freeze its quote while
    // the bound plan is recalculated/submitted.
    if (verifyMode === 'demo' || placing || confirmChange) return undefined;
    let cancelled = false;
    let timer = null;
    let stopRefresh = false;
    const verifyController = new AbortController();
    activeVerifyAbortRef.current = verifyController;
    const liveBetslipMode = verifyMode === 'betslip';
    const finalAcceptRefresh = Boolean(pendingAccept);
    const verifyOnce = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden' && !finalAcceptRefresh) {
        timer = setTimeout(verifyOnce, AUTO_REFRESH_MS);
        return;
      }
      const cycleStartedAt = performance.now();
      setVerifying(true);
      try {
        const verifyPromise = api.verify(arb.id, {
          verifyMode,
          verifyScope: liveBetslipMode ? 'calculator' : null,
          clientId: liveBetslipMode ? calculatorClientIdRef.current : null,
          signal: verifyController.signal,
        });
        activeVerifyPromiseRef.current = verifyPromise;
        const result = await verifyPromise;
        if (cancelled) return;
        if (result?.status === 'CALCULATOR_EXPIRED') {
          setVerified(result);
          setPendingAccept(null);
          setPreConfirm(null);
          setConfirmChange(null);
          showToast?.('Please choose fork again', 'error');
          stopRefresh = true;
          return;
        }
        if (result?.should_stop_refresh || result?.status === 'EXPIRED' || result?.error_code === 'VERIFY_WINDOW_EXPIRED') {
          setVerified(result);
          setPendingAccept(null);
          setPreConfirm(null);
          setConfirmChange(null);
          showToast?.('Please choose fork again', 'error');
          stopRefresh = true;
          return;
        }
        if (['STALE', 'UNSUPPORTED'].includes(result?.status)) {
          setVerified({ ...result, should_stop_refresh: true });
          setPendingAccept(null);
          setPreConfirm(null);
          setConfirmChange(null);
          stopRefresh = true;
          return;
        }
        if (result?.verified) {
          setVerified(result);
          setVerifiedAt(Date.now());
        } else {
          setVerified(result);
          setVerifiedAt(0);
        }
        setLastResultAt(Date.now());
      } catch (error) {
        if (cancelled) return;
        const fallback = {
          verified: false,
          status: 'ERROR',
          current_odds: arb.bk1_odds,
          feed_odds: arb.bk1_odds,
          detail: error?.message || 'Live price check failed',
          source: 'verify-error',
          timestamp: Date.now() / 1000,
        };
        setVerified(fallback);
        setVerifiedAt(0);
        setLastResultAt(Date.now());
      } finally {
        if (!cancelled) {
          setVerifying(false);
          if (!stopRefresh && !finalAcceptRefresh) {
            // Keep starts close to a real 1 Hz cadence. Waiting a full second
            // after the response made a 300 ms upstream check poll every
            // 1.3 s and left stale odds visible longer than necessary.
            const elapsedMs = performance.now() - cycleStartedAt;
            timer = setTimeout(
              verifyOnce,
              Math.max(0, AUTO_REFRESH_MS - elapsedMs),
            );
          }
        }
      }
    };
    const startVerify = async () => {
      if (liveBetslipMode) await basketSwitchPromiseRef.current;
      if (!cancelled) verifyOnce();
    };
    startVerify();
    return () => {
      cancelled = true;
      verifyController.abort();
      if (activeVerifyAbortRef.current === verifyController) {
        activeVerifyAbortRef.current = null;
      }
      if (timer) clearTimeout(timer);
    };
  }, [arb.id, arb.bk1_odds, verifyMode, showToast, verifyRequestSeq, pendingAccept?.side, placing, Boolean(confirmChange)]);

  useEffect(() => () => {
    if (verifyMode === 'betslip') {
      activeVerifyAbortRef.current?.abort();
      Promise.resolve(activeVerifyPromiseRef.current)
        .catch(() => null)
        .then(() => api.releaseCalculatorVerify(
          activeBasketArbIdRef.current,
          calculatorClientIdRef.current,
        ))
        .catch(() => {});
    }
  }, [verifyMode]);

  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 700);
    return () => clearInterval(iv);
  }, []);

  const requestFreshVerify = () => {
    if (verifyMode === 'demo' || verifying) return;
    setVerified(null);
    setVerifiedAt(0);
    verifiedAtRef.current = 0;
    setLastResultAt(0);
    setConfirmChange(null);
    setVerifyRequestSeq((value) => value + 1);
  };

  const submitBet = async (
    side,
    odds,
    quoteId,
    stake,
    donorStakeToUse = donorStakeNumForCalc,
    donorOddsToUse = donorOddsNumForCalc,
  ) => {
    // 1. Ограничение максимальной ставки
    if (stake > MAX_STAKE_LIMIT) {
      showToast('Временный лимит на ставку 50 евро, изменится после успешной серии ставок без багов, очень скоро', 'error');
      return;
    }

    // 2. Ограничение баланса пользователя
    const account = side === 'pinnacle' ? 'pinnacle_cashback' : 'robinbet';
    const userBalance = balance ? (balance[account] || 0) : 0;
    if (verifyMode !== 'demo' && stake > userBalance) {
      showToast(`Недостаточно средств. Ваш баланс ${side === 'pinnacle' ? 'PIN' : 'RobinBet'}: $${userBalance.toFixed(2)}`, 'error');
      return;
    }

    setPlacing(true);
    try {
      const placeResult = await api.placeBet(arb.id, side, stake, odds, quoteId, {
        verifyMode,
        donorStake: donorStakeToUse,
        donorOdds: donorOddsToUse,
      });
      const simulationOnly = placeResult?.simulation_only === true;
      const details = {
        side,
        odds,
        stake,
        selection: pinOutcomeText,
        potentialReturn: Number(stake * odds),
        simulationOnly,
      };
      setSuccessDetails(details);
      if (simulationOnly) {
        showToast?.('Simulation recorded — no real bet was placed and the balance is unchanged.');
      }
      setPlacing(false);
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
  const robinReferencePinOdds = Number(verified?.robin_reference_pin_odds);
  const calcRobinOdds = Number(calc?.robinbet?.odds);
  const arbRobinOdds = Number(arb.robin_odds);
  const parserRobinPreview = parserRobinPreviewOdds(
    verifiedRobinOdds,
    arbRobinOdds,
    arb.robin_price_source,
  );
  const robinDisplay = parserRobinPreview
    || (verifyMode === 'demo'
      ? [calcRobinOdds, arbRobinOdds, pinOdds + FALLBACK_ROBIN_TICKS]
        .find((value) => Number.isFinite(value) && value > 1)
      : NaN);
  const verifiedRobinQuoteReady = Boolean(
    verified?.verified
    && verified?.robin_quote_verified === true
    && Number.isFinite(verifiedRobinOdds)
    && verifiedRobinOdds > 1
  );
  const verifiedPinQuoteReady = Boolean(
    verified?.verified
    && verified?.quote_id
    && verified?.pin_bia_single_verified === true
    && Number.isFinite(verifiedPinOdds)
    && verifiedPinOdds > 1
  );
  const exactRobinMode = verifyMode !== 'demo';
  const robinQuoteUnavailable = Boolean(
    exactRobinMode
    && verified
    && !verifiedRobinQuoteReady
  );
  const isRobinCalculating = exactRobinMode ? !verified : false;
  const isRobinBlocked = isRobinCalculating || robinQuoteUnavailable;
  const robinPreviewOnly = Boolean(
    robinQuoteUnavailable
    && Number.isFinite(parserRobinPreview)
    && parserRobinPreview > 1
  );
  const robinShownOdds = verifiedRobinQuoteReady ? robinDisplay : parserRobinPreview;
  const robinQuoteDetail = verified?.robin_quote_detail
    || verified?.detail
    || 'No exact Robin quote for this verified Pinnacle outcome.';
  const ageMs = verifiedAt ? nowMs - verifiedAt : Infinity;
  const isFresh = Boolean(verified?.verified) && ageMs <= FRESH_MS;
  const pinSinglePriceReady = verifiedPinQuoteReady && isFresh;

  const donorStakeNumForCalc = Number(donorStake) || 0;
  const donorOddsNumForCalc = Number(donorOdds) || 0;
  const currentCalcInputs = useMemo(() => ({
    mode,
    counterStake: donorStakeNumForCalc,
    counterOdds: donorOddsNumForCalc,
  }), [donorStakeNumForCalc, donorOddsNumForCalc]);

  // The current server snapshot is authoritative for every accepted flow,
  // including ordinary two-way rows. A locally captured arb can keep the same
  // id while its counter candidate price changes, so local binary sizing is a
  // preview only and must never become an actionable plan.
  const activeCalc = calc;
  const activeCalcMatchesInputs = calcPlanMatchesInputs(activeCalc, currentCalcInputs);
  const standardPlanMatchesCounterQuote = true;
  // Multi-counter contracts still need each actual external stake/price
  // locked separately. One-counter Donor is the only executable UI mode.
  const executionPlanLocked = !isMultiLeg;

  useEffect(() => {
    if (!pendingAccept || !activeCalc || placing || confirmChange) return;
    if (pendingAccept.instant) return; // instant mode skips the live-match handshake entirely
    if (!verified?.verified || verified?.keepingPrevious || verified?.sticky) return;
    if (!verified?.quote_id) return;
    if (!executionPlanLocked || !standardPlanMatchesCounterQuote) return;
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
    // A verified quote may arrive before the asynchronous settlement plan
    // recalculation. Never submit stakes calculated for the preceding price.
    if (!activeCalcMatchesInputs) return;
    if (requiresScenarioPlan && activeCalc.settlement_aware !== true) return;
    if (!calcPlanMatchesOdds(activeCalc, pendingAccept.side, liveOdds)) return;
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
  }, [verified, verifiedAt, pendingAccept, placing, confirmChange, activeCalc, activeCalcMatchesInputs, robinDisplay, verifiedRobinQuoteReady, robinQuoteDetail, requiresScenarioPlan, executionPlanLocked, standardPlanMatchesCounterQuote, showToast]);

  // Demo submit keeps the legacy short delay, then requests a fresh one-shot
  // simulation quote and recalculates the server-authoritative donor plan for
  // that exact quote. quoteId=null is never executable.
  useEffect(() => {
    if (!pendingAccept?.instant || placing) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const side = pendingAccept.side;
        const freshQuote = await api.verify(arb.id, { verifyMode: 'demo' });
        if (cancelled) return;
        const simulation = simulationQuoteDetails(freshQuote, side);
        if (!simulation) {
          throw new Error(freshQuote?.detail || 'The server did not issue an executable simulation quote.');
        }
        const lockedInputs = {
          mode: 'donor',
          counterStake: Number(pendingAccept.donorStake),
          // Simulation has no external ticket proving a custom donor price.
          // Bind it to the current counter candidate carried by the quote.
          counterOdds: simulation.counterOdds,
        };
        const freshCalc = await api.calculate(arb.id, 0, {
          counterStake: lockedInputs.counterStake,
          counterOdds: lockedInputs.counterOdds,
          livePinnacleOdds: Number(freshQuote.current_odds),
          liveRobinOdds: Number(freshQuote.robin_odds) > 1 ? Number(freshQuote.robin_odds) : null,
        });
        if (cancelled) return;
        if (
          !calcPlanMatchesInputs(freshCalc, lockedInputs)
          || (requiresScenarioPlan && freshCalc.settlement_aware !== true)
          || !calcPlanMatchesOdds(freshCalc, side, simulation.primaryOdds)
        ) {
          throw new Error('The simulation plan is not bound to the current quote and donor inputs.');
        }
        const sidePlan = side === 'pinnacle' ? freshCalc.pinnacle : freshCalc.robinbet;
        const stake = Number(sidePlan?.stake);
        if (!(stake > 0)) throw new Error('The server did not return an executable simulation stake.');
        setVerified(freshQuote);
        setVerifiedAt(Date.now());
        setDonorOdds(simulation.counterOdds);
        setCalc(freshCalc);
        setPendingAccept(null);
        await submitBet(
          side,
          simulation.primaryOdds,
          simulation.quoteId,
          stake,
          lockedInputs.counterStake,
          lockedInputs.counterOdds,
        );
      } catch (error) {
        if (cancelled) return;
        setPendingAccept(null);
        showToast?.(error.message, 'error');
      }
    }, INSTANT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingAccept, placing, arb.id, requiresScenarioPlan, showToast]);

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
  const inGrace = !verified && !verifiedAt && sinceOpen <= FRESH_MS;
  const sinceLastFresh = verifiedAtRef.current ? nowMs - verifiedAtRef.current : Infinity;
  const inFailGrace = verifiedAtRef.current && sinceLastFresh <= FAIL_GRACE_MS;
  const instantAccept = verifyMode === 'demo';
  let statusText;
  let statusColor;
  if (instantAccept) {
    statusText = verified?.simulation_only
      ? `simulation quote · ${pinOdds.toFixed(3)}`
      : `simulation preview · ${pinOdds.toFixed(3)}`;
    statusColor = 'var(--text-muted)';
  } else if (isFresh && verified?.keepingPrevious) {
    statusText = `cached · live check failed · ${Math.max(0, ageMs / 1000).toFixed(1)}s`;
    statusColor = 'var(--accent-warn)';
  } else if (isFresh && verified?.sticky) {
    statusText = `cached · replayed quote · ${Math.max(0, ageMs / 1000).toFixed(1)}s`;
    statusColor = 'var(--accent-warn)';
  } else if (isFresh) {
    statusText = `live ${Math.max(0, ageMs / 1000).toFixed(1)}s · ${pinOdds.toFixed(3)}`;
    statusColor = 'var(--positive)';
  } else if (verified?.verified) {
    statusText = `stale ${Math.max(0, ageMs / 1000).toFixed(1)}s`;
    statusColor = 'var(--accent-warn)';
  } else if (verifyStatus === 'CALCULATOR_EXPIRED') {
    statusText = 'Please choose fork again';
    statusColor = 'var(--accent-warn)';
  } else if (verifyStatus === 'CALCULATOR_LOCKED') {
    statusText = 'active in another tab';
    statusColor = 'var(--text-muted)';
  } else if (verifyStatus === 'PROCESSING' || verified?.error_code === 'BIA_PREPARED_REFRESH_PENDING') {
    statusText = 'обновляем выбранную Single-корзину…';
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
    statusText = `cached ${Math.max(0, sinceLastFresh / 1000).toFixed(1)}s · ${pinOdds.toFixed(3)}`;
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
  const pinBasketRefreshing = Boolean(
    verifyStatus === 'PROCESSING'
    || verified?.error_code === 'BIA_PREPARED_REFRESH_PENDING'
  );
  const readinessTone = instantAccept
    ? 'ready'
    : pinBasketRefreshing
      ? 'checking'
    : verifiedRobinQuoteReady && isFresh
      ? 'ready'
      : verifiedPinQuoteReady && isFresh
        ? 'ready'
      : (robinQuoteUnavailable && !inGrace ? 'unavailable' : 'checking');
  const readinessTitle = instantAccept
    ? 'Simulation only · реальные ставки и баланс не изменяются'
    : pinBasketRefreshing
      ? 'Обновляем выбранную BIA Single-корзину…'
    : readinessTone === 'ready'
      ? verifiedRobinQuoteReady
        ? `Готово к ставке · точная цена Robin @${robinDisplay.toFixed(3)}`
        : robinPreviewOnly
          ? `PIN готов @${pinOdds.toFixed(3)} · Robin preview @${parserRobinPreview.toFixed(3)}`
          : `PIN готов @${pinOdds.toFixed(3)} · точная цена Robin пока недоступна`
      : readinessTone === 'unavailable'
        ? 'Точная PIN-котировка недоступна'
        : 'Проверяем выбранную вилку…';

  const beginAccept = (side) => {
    if (!activeCalc) return;
    if (!executionPlanLocked) {
      showToast?.(
        'Этот план содержит несколько внешних плеч. Приём закрыт, пока не будут зафиксированы сумма и цена каждого плеча.',
        'error',
      );
      return;
    }
    if (side === 'robinbet' && exactRobinMode && isRobinBlocked) {
      showToast?.(
        robinQuoteUnavailable
          ? robinQuoteDetail
          : 'The exact Pinnacle outcome and Robin quote are still verifying.',
        'error',
      );
      return;
    }
    const odds = side === 'pinnacle' ? pinOdds : robinDisplay;
    if (
      !activeCalcMatchesInputs
      || !standardPlanMatchesCounterQuote
      || (requiresScenarioPlan && activeCalc.settlement_aware !== true)
      || !calcPlanMatchesOdds(activeCalc, side, odds)
    ) {
      showToast?.('Дождитесь точного пересчёта плана по последней цене.', 'error');
      return;
    }
    const sidePlan = side === 'pinnacle' ? activeCalc.pinnacle : activeCalc.robinbet;
    const stake = sidePlan.stake;

    // 1. Ограничение максимальной ставки
    if (stake > MAX_STAKE_LIMIT) {
      showToast('Временный лимит на ставку 50 евро, изменится после успешной серии ставок без багов, очень скоро', 'error');
      return;
    }

    // 2. Ограничение баланса пользователя
    const account = side === 'pinnacle' ? 'pinnacle_cashback' : 'robinbet';
    const userBalance = balance ? (balance[account] || 0) : 0;
    if (!instantAccept && stake > userBalance) {
      showToast(`Недостаточно средств. Ваш баланс ${side === 'pinnacle' ? 'PIN' : 'RobinBet'}: $${userBalance.toFixed(2)}`, 'error');
      return;
    }

    if (instantAccept) {
      // Simulation has no real donor placement, but still carries the exact
      // donor inputs to a server-issued quote and authoritative recalculation.
      setPendingAccept({
        side,
        instant: true,
        donorStake: donorStakeNumForCalc,
        donorOdds: donorOddsNumForCalc,
      });
      return;
    }
    const guaranteedProfit = Number(sidePlan.profit);
    // The external leg is outside our transaction. Always require the user
    // to confirm that the displayed Donor stake/odds were actually placed.
    setPreConfirm({ side, odds, stake, guaranteedProfit });
  };

  // Keep pre-confirm odds in sync with live verify ticks so user always sees
  // the fresh price they'd be accepting.
  useEffect(() => {
    if (!preConfirm) return;
    const liveOdds = preConfirm.side === 'pinnacle' ? pinOdds : robinDisplay;
    if (
      !activeCalc
      || !activeCalcMatchesInputs
      || !executionPlanLocked
      || !standardPlanMatchesCounterQuote
      || (requiresScenarioPlan && activeCalc.settlement_aware !== true)
      || !calcPlanMatchesOdds(activeCalc, preConfirm.side, liveOdds)
    ) return;
    const sidePlan = preConfirm.side === 'pinnacle' ? activeCalc.pinnacle : activeCalc.robinbet;
    const stake = Number(sidePlan.stake);
    const guaranteedProfit = Number(sidePlan.profit);
    if (
      Math.abs(liveOdds - preConfirm.odds) < 1e-6
      && Math.abs(stake - preConfirm.stake) < 0.005
      && Math.abs(guaranteedProfit - preConfirm.guaranteedProfit) < 0.005
    ) return;
    setPreConfirm({
      ...preConfirm,
      previousOdds: preConfirm.previousOdds ?? preConfirm.odds,
      odds: liveOdds,
      stake,
      guaranteedProfit,
    });
  }, [preConfirm, pinOdds, robinDisplay, activeCalc, activeCalcMatchesInputs, requiresScenarioPlan, executionPlanLocked, standardPlanMatchesCounterQuote]);

  const confirmPreAccept = () => {
    if (!preConfirm) return;
    const { side } = preConfirm;
    const odds = side === 'pinnacle' ? pinOdds : robinDisplay;
    if (
      !activeCalc
      || !activeCalcMatchesInputs
      || !executionPlanLocked
      || !standardPlanMatchesCounterQuote
      || (requiresScenarioPlan && activeCalc.settlement_aware !== true)
      || !calcPlanMatchesOdds(activeCalc, side, odds)
    ) {
      showToast?.('План ещё пересчитывается по новой цене.', 'error');
      return;
    }
    setPreConfirm(null);
    setPendingAccept({ side, expectedOdds: odds });
    requestFreshVerify();
  };

  // Keep the changed-price confirmation bound to the latest quote id/price.
  // The accept button below remains closed until the corresponding server
  // settlement plan has also arrived.
  useEffect(() => {
    if (!confirmChange || !verified?.verified || verified?.keepingPrevious || verified?.sticky) return;
    const liveOdds = confirmChange.side === 'pinnacle' ? Number(verified.current_odds) : Number(robinDisplay);
    if (!(liveOdds > 1) || !verified.quote_id) return;
    if (
      Math.round(liveOdds * 1000) === Math.round(confirmChange.to * 1000)
      && verified.quote_id === confirmChange.quoteId
    ) return;
    setConfirmChange((current) => current ? {
      ...current,
      to: liveOdds,
      quoteId: verified.quote_id,
    } : current);
  }, [confirmChange, verified, robinDisplay]);

  const waiting = Boolean(pendingAccept) || placing;
  const pinAcceptPlanReady = Boolean(
    activeCalc
    && (instantAccept || (verifiedPinQuoteReady && isFresh))
    && executionPlanLocked
    && activeCalcMatchesInputs
    && standardPlanMatchesCounterQuote
    && (!requiresScenarioPlan || activeCalc.settlement_aware === true)
    && calcPlanMatchesOdds(activeCalc, 'pinnacle', pinOdds)
  );
  const robinAcceptPlanReady = Boolean(
    activeCalc
    && (instantAccept || (verifiedRobinQuoteReady && isFresh))
    && executionPlanLocked
    && activeCalcMatchesInputs
    && standardPlanMatchesCounterQuote
    && (!requiresScenarioPlan || activeCalc.settlement_aware === true)
    && calcPlanMatchesOdds(activeCalc, 'robinbet', robinDisplay)
  );
  const matchLimits = activeCalc?.match_limits?.enabled ? activeCalc.match_limits : null;
  const pinReady = finiteNumber(matchLimits?.pin?.ready_to_accept);
  const robinReady = finiteNumber(matchLimits?.robin?.ready_to_accept);
  const rawMaxDonorPin = finiteNumber(matchLimits?.max_donor_stake_for_pin);
  const rawMaxDonorRobin = finiteNumber(matchLimits?.max_donor_stake_for_robin);
  // The server caps our accepted leg at $50. Convert that leg cap back into
  // counter-stake units so the visible "Max" button never proposes a donor
  // amount which the following accept action must reject.
  const maxDonorByPinLeg = !requiresScenarioPlan && pinOdds > 1 && finiteNumber(donorOdds) > 1
    ? MAX_STAKE_LIMIT * pinOdds / finiteNumber(donorOdds)
    : NaN;
  const maxDonorByRobinLeg = !requiresScenarioPlan && robinDisplay > 1 && finiteNumber(donorOdds) > 1
    ? MAX_STAKE_LIMIT * robinDisplay / finiteNumber(donorOdds)
    : NaN;
  const maxDonorPin = [rawMaxDonorPin, maxDonorByPinLeg]
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((lowest, value) => Math.min(lowest, value), Number.POSITIVE_INFINITY);
  const maxDonorRobin = [rawMaxDonorRobin, maxDonorByRobinLeg]
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((lowest, value) => Math.min(lowest, value), Number.POSITIVE_INFINITY);
  const donorStakeNum = finiteNumber(donorStake);
  const donorCaps = [maxDonorPin, maxDonorRobin].filter((value) => Number.isFinite(value) && value > 0.01);
  const minDonorCap = donorCaps.length ? Math.min(...donorCaps) : NaN;
  const donorOverPin = Number.isFinite(maxDonorPin) && donorStakeNum > maxDonorPin + 0.01;
  const donorOverRobin = Number.isFinite(maxDonorRobin) && donorStakeNum > maxDonorRobin + 0.01;
  const counterOddsForEdge = finiteNumber(donorOdds);
  const currentEdge = (() => {
    if ((isMultiLeg || activeCalc?.settlement_aware) && activeCalc) {
      const pinTotal = finiteNumber(activeCalc.total_stake);
      const robinStake = finiteNumber(activeCalc.robinbet?.stake);
      const robinCounter = finiteNumber(activeCalc.robinbet?.counter_stake);
      const robinTotal = robinStake + robinCounter;
      return {
        pin: {
          primaryStake: finiteNumber(activeCalc.pinnacle?.stake),
          counterStake: finiteNumber(activeCalc.counter?.stake),
          totalStake: pinTotal,
          payout: finiteNumber(activeCalc.guaranteed_payout),
          profit: finiteNumber(activeCalc.pinnacle?.profit),
          net: finiteNumber(activeCalc.pinnacle?.profit),
          roiPct: finiteNumber(activeCalc.profit_pct),
        },
        robin: {
          primaryStake: robinStake,
          counterStake: robinCounter,
          totalStake: robinTotal,
          payout: finiteNumber(activeCalc.robinbet?.guaranteed_payout),
          profit: finiteNumber(activeCalc.robinbet?.profit),
          net: finiteNumber(activeCalc.robinbet?.profit),
          roiPct: finiteNumber(activeCalc.robin_profit_pct),
        },
      };
    }
    const pinCurrentOdds = finiteNumber(pinOdds);
    const robinCurrentOdds = finiteNumber(robinDisplay);
    return {
      pin: donorModeEdge(pinCurrentOdds, counterOddsForEdge, donorStakeNum),
      robin: donorModeEdge(robinCurrentOdds, counterOddsForEdge, donorStakeNum),
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
    setDonorStake(nextStake);
    if (stakeChanged) setCalc(null);
    resetAcceptState();
    showToast?.(
      stakeChanged
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
      <span className="calc-outcome-dot" aria-hidden="true" />
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
        <h2 className="calc-title">
          <span className="calc-title-copy">
            <small>LIVE CALCULATOR</small>
            <span>{arb.match}</span>
          </span>
          <span style={{ fontSize: '0.7rem', color: statusColor, fontWeight: 500, marginLeft: 8 }}>{statusBadge}</span>
          <button className="modal-close" onClick={onClose} title="Close">✕</button>
        </h2>

        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          <div>
            {arb.sport} · {arb.market} · Robin (parser){' '}
            {isRobinCalculating
              ? '…'
              : robinPreviewOnly
                ? `${parserRobinPreview.toFixed(3)} preview`
                : robinQuoteUnavailable
                  ? 'unavailable'
                  : robinDisplay.toFixed(3)}
          </div>
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

        <div className={`calc-readiness ${readinessTone}`}>
          <strong>{readinessTitle}</strong>
          <span>
            {instantAccept
              ? 'Одноразовая серверная simulation quote будет выпущена непосредственно перед записью виртуального плана.'
              : readinessTone === 'ready'
                ? robinPreviewOnly
                  ? 'PIN можно принять. Robin-расчёт из parser показан как preview; приём Robin закрыт до точной привязки полного рынка.'
                  : 'PIN обновляется в одной выбранной BIA Single-корзине. Перед приёмом сервер зафиксирует её последнюю свежую ревизию.'
              : readinessTone === 'checking'
                ? 'Проверяем только выбранную вилку; фоновые BIA-корзины не создаются.'
                : verifiedPinQuoteReady
                  ? 'PIN можно принять у нас; Robin появится только после полного рынка из parser/FULL_ODDS.'
                  : 'Не используйте старую цену. Обновите выбранную вилку или выберите другую.'}
          </span>
          {!instantAccept && (
            <button
              className="btn btn-link"
              type="button"
              onClick={requestFreshVerify}
              disabled={verifying || waiting}
              style={{ alignSelf: 'flex-start', fontSize: '0.68rem', padding: '3px 7px' }}
            >
              {verifying ? 'Проверяем…' : 'Обновить цену'}
            </button>
          )}
          {robinQuoteUnavailable && (
            <details>
              <summary>Техническая причина</summary>
              <div>{robinQuoteDetail}</div>
            </details>
          )}
        </div>

        <div className="calc-placement-strip calc-placement-actionable" title={`${robinPlaceText} / ${counterPlaceText}`}>
          <div className="calc-placement-leg counter">
            <span>1 · {isMultiLeg ? 'Поставить все внешние плечи' : `Поставить у ${arb.bk2_label || arb.bk2 || 'букмекера'}`}</span>
            {isMultiLeg ? arb.multi_leg.legs.filter((leg) => leg.role === 'external').map((leg) => (
              <strong key={leg.index}>{leg.label || leg.bookmaker} · {leg.selection} @{Number(leg.odds).toFixed(3)}</strong>
            )) : <strong>{counterOutcomeText}</strong>}
          </div>
          <span className="calc-placement-arrow">↔</span>
          <div className="calc-placement-leg robin">
            <span>2 · Принять у нас</span>
            <strong>{pinOutcomeText}</strong>
          </div>
        </div>
        <div className="calc-pin-reference">
          PIN · BIA Single: {pinOutcomeText} @{pinSinglePriceReady ? pinOdds.toFixed(3) : '—'}
          {!pinSinglePriceReady ? ` (feed preview @${pinOdds.toFixed(3)})` : ''}
          {' · '}Robin · parser market: @{Number.isFinite(robinShownOdds) ? robinShownOdds.toFixed(3) : '—'}{robinPreviewOnly ? ' preview' : ''}
          {verifiedRobinQuoteReady && Number.isFinite(robinReferencePinOdds) && robinReferencePinOdds > 1
            ? ` (parser PIN reference @${robinReferencePinOdds.toFixed(3)})`
            : ''}
        </div>
        <CounterNavigationHint guidance={arb.counter_navigation} />

        {!executionPlanLocked && (
          <div className="quote-warning" style={{ padding: '7px 9px', marginBottom: 6, fontSize: '0.72rem' }}>
            Planning only: приём нашего плеча отключён, пока не будут отдельно зафиксированы фактические сумма и цена каждого внешнего плеча.
          </div>
        )}

        <div className="calc-donor-inputs" style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.68rem' }}>Фактическое внешнее плечо</strong>
          <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
            {isMultiLeg ? 'Все внешние плечи:' : `${arb.bk2_label || arb.bk2}:`}
          </span>
          <input
            className="stake-input"
            aria-label="Фактическая сумма внешнего плеча"
            type="number"
            value={donorStake}
            onChange={(event) => {
              clearCalcForInput();
              setDonorStake(event.target.value === '' ? '' : parseFloat(event.target.value) || 0);
            }}
            min="1" step="1"
            style={{ width: 80, margin: 0, padding: '3px 6px', fontSize: '0.76rem' }}
          />
          {!isMultiLeg && Number.isFinite(minDonorCap) && (
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
          {isMultiLeg ? (
            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>распределятся автоматически по точным линиям</span>
          ) : (
            <>
              <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>@</span>
              <input
                className="stake-input"
                aria-label="Фактическая цена внешнего плеча"
                type="number"
                value={donorOdds}
                onChange={(event) => {
                  clearCalcForInput();
                  setDonorOdds(event.target.value === '' ? '' : parseFloat(event.target.value) || 0);
                }}
                min="1.01" step="0.001"
                disabled={instantAccept}
                title={instantAccept ? 'Simulation uses the current quote-bound counter price' : undefined}
                style={{ width: 72, margin: 0, padding: '3px 6px', fontSize: '0.76rem' }}
              />
            </>
          )}
        </div>

        {(currentEdge.pin || currentEdge.robin) && (
          <div className="calc-edge-strip" title="Current arb size at the latest shown prices">
            <div className={`calc-edge-card pin ${edgeTone(currentEdge.pin?.roiPct)} ${edgePulse.pin ? `pulse-${edgePulse.pin}` : ''}`}>
              <div className="calc-edge-label">
                <span>PIN</span>
                <span className="calc-edge-quote">
                  @{pinOdds.toFixed(3)}{!pinSinglePriceReady && <small> feed preview</small>}
                </span>
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
                <span>Robin {isRobinCalculating ? <span className="robin-spin-icon" style={{ marginLeft: 4 }}>↻</span> : robinQuoteUnavailable ? <span style={{ color: 'var(--accent-warn)', marginLeft: 4 }}>!</span> : <span style={{ color: 'var(--positive)', marginLeft: 4 }}>●</span>}</span>
                <span className="calc-edge-quote">
                  @{isRobinCalculating ? '...' : Number.isFinite(robinShownOdds) ? robinShownOdds.toFixed(3) : '—'}
                  {robinPreviewOnly && <small> preview</small>}
                </span>
              </div>
              <div className="calc-edge-main">{isRobinCalculating ? '…' : robinQuoteUnavailable ? 'unavailable' : signedPct(currentEdge.robin?.roiPct)}</div>
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
                <span>PIN</span>
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
                <span>{isMultiLeg ? 'Внешние плечи · план PIN' : (arb.bk2_label || arb.bk2)}</span>
                <span className="calc-profit dim">
                  {Number.isFinite(finiteNumber(activeCalc.counter?.return))
                    ? `→$${formatStake(activeCalc.counter.return, 2)}`
                    : 'выплата —'}
                </span>
              </div>
              {isMultiLeg ? activeCalc.counter_legs?.map((leg) => (
                <div key={leg.index} style={{ marginBottom: 6 }}>
                  <OutcomePill pick={`${leg.label || leg.bookmaker} · ${leg.selection}`} accent="var(--accent-robin)" />
                  <div className="calc-inline">
                    <span>${leg.stake}</span>
                    <span className="dim">@</span>
                    <span>{Number(leg.odds).toFixed(3)}</span>
                  </div>
                </div>
              )) : (
                <>
                  <OutcomePill pick={counterOutcomeText} accent="var(--accent-robin)" />
                  <div className="calc-inline">
                    <span>${activeCalc.counter.stake}</span>
                    <span className="dim">@</span>
                    <span>{Number(activeCalc.counter.odds).toFixed(3)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="calc-section robin">
              <div className="calc-section-head" style={{ color: 'var(--positive)' }}>
                <span>Robin {isRobinCalculating ? <span className="robin-spin-icon" style={{ display: 'inline-flex', animation: 'spin 1s linear infinite', marginLeft: 4 }}>↻</span> : robinQuoteUnavailable ? <span style={{ color: 'var(--accent-warn)', marginLeft: 4 }}>!</span> : <span style={{ color: 'var(--positive)', marginLeft: 4 }}>●</span>}</span>
                <span
                  className="calc-profit"
                  style={{ color: activeCalc.robinbet.profit >= 0 ? 'var(--positive)' : 'var(--accent-warn)' }}
                  title="Прибыль вилки Robin: Robin payout − обе ставки"
                >
                  {isRobinCalculating ? '…' : robinQuoteUnavailable ? 'unavailable' : `${activeCalc.robinbet.profit >= 0 ? '+' : ''}$${Number(activeCalc.robinbet.profit).toFixed(2)}`}
                </span>
              </div>
              <OutcomePill pick={pinOutcomeText} accent="var(--positive)" />
              <div className="calc-inline" style={{ opacity: isRobinBlocked ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <span>{isRobinCalculating ? '$...' : robinQuoteUnavailable ? '$—' : `$${activeCalc.robinbet.stake}`}</span>
                <span className="dim">@</span>
                <span>{isRobinCalculating ? '...' : robinPreviewOnly ? `${parserRobinPreview.toFixed(3)} preview` : robinQuoteUnavailable ? '—' : Number(activeCalc.robinbet.odds).toFixed(3)}</span>
              </div>
              {isMultiLeg && !isRobinBlocked && activeCalc.robinbet.counter_legs?.map((leg) => (
                <div className="calc-inline" key={`robin-${leg.index}`} style={{ fontSize: '0.68rem' }}>
                  <span>{leg.label || leg.bookmaker} · {leg.selection}</span>
                  <span>${leg.stake} @{Number(leg.odds).toFixed(3)}</span>
                </div>
              ))}
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
            disabled={!pinAcceptPlanReady || waiting}
          >
            {placing && pendingAccept?.side !== 'robinbet'
              ? '…'
              : pendingAccept?.side === 'pinnacle'
                ? (instantAccept ? 'simulation…' : 'wait live…')
                : `PIN · ${pinOutcomeText} · $${formatStake(activeCalc?.pinnacle?.stake, 2)} @${pinOdds.toFixed(3)}`}
          </button>
          <button
            className="btn btn-robin btn-accept-big"
            onClick={() => beginAccept('robinbet')}
            disabled={!robinAcceptPlanReady || waiting || isRobinBlocked}
          >
            {isRobinCalculating ? (
              <span>Расчёт цены Robin…</span>
            ) : robinQuoteUnavailable ? (
              <span>{robinPreviewOnly ? `⚠ Robin preview @${parserRobinPreview.toFixed(3)} · exact quote required` : '⚠ No exact Robin quote'}</span>
            ) : pendingAccept?.side === 'robinbet' ? (
              instantAccept ? 'simulation…' : 'wait live…'
            ) : (
              `Robin · ${pinOutcomeText} · $${formatStake(activeCalc?.robinbet?.stake, 2)} @${robinDisplay.toFixed(3)}`
            )}
          </button>
          {pendingAccept && !placing && (
            <button className="btn btn-link" onClick={() => setPendingAccept(null)} style={{ flex: '0 0 auto', fontSize: '0.7rem' }}>Cancel</button>
          )}
        </div>

        {preConfirm && (() => {
          const isPin = preConfirm.side === 'pinnacle';
          const currentOdds = isPin ? pinOdds : robinDisplay;
          const planReady = Boolean(
            activeCalc
            && executionPlanLocked
            && activeCalcMatchesInputs
            && standardPlanMatchesCounterQuote
            && (!requiresScenarioPlan || activeCalc.settlement_aware === true)
            && calcPlanMatchesOdds(activeCalc, preConfirm.side, currentOdds)
          );
          const oddsChanged = preConfirm.previousOdds !== undefined && Math.abs(preConfirm.previousOdds - preConfirm.odds) > ODDS_TOL;
          const direction = oddsChanged ? (preConfirm.odds > preConfirm.previousOdds ? 'up' : 'down') : null;
          return (
            <div className="modal-overlay" onClick={() => setPreConfirm(null)} style={{ zIndex: 150 }}>
              <div
                className={`modal preconfirm-modal ${oddsChanged ? 'odds-changed' : ''}`}
                style={{ width: 380, padding: 14 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Внешнее плечо зафиксировано?</h2>
                <div style={{ fontSize: '0.9rem', marginBottom: 6 }}>
                  {isPin ? 'PIN' : 'Robin'} · <b>{pinOutcomeText}</b> · <b>${preConfirm.stake.toFixed(2)}</b> @{' '}
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
                  {arb.match} · {marketLabel || arb.market} · Counter {counterPlaceText} <b>${formatStake(donorStake, 2)} @{Number(donorOdds).toFixed(3)}</b> уже должен быть поставлен. После этого меняется только {placeTextForSide(preConfirm.side)} · гарантия вилки {planReady ? signedMoney(preConfirm.guaranteedProfit) : 'пересчитывается…'}
                </div>
                <div className="action-buttons">
                  <button className="btn btn-link" onClick={() => setPreConfirm(null)} disabled={placing}>Отмена</button>
                  <button
                    className={`btn ${isPin ? 'btn-pin' : 'btn-robin'} btn-accept-big`}
                    onClick={confirmPreAccept}
                    disabled={placing || !planReady}
                    style={{ flex: 2 }}
                  >
                    Внешнее плечо поставлено · принять @ {preConfirm.odds.toFixed(3)}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {confirmChange && (() => {
          const isPin = confirmChange.side === 'pinnacle';
          const finalOdds = confirmChange.to;
          const planReady = Boolean(
            activeCalc
            && executionPlanLocked
            && activeCalcMatchesInputs
            && standardPlanMatchesCounterQuote
            && (!requiresScenarioPlan || activeCalc.settlement_aware === true)
            && calcPlanMatchesOdds(activeCalc, confirmChange.side, finalOdds)
          );
          const sidePlan = planReady
            ? (isPin ? activeCalc.pinnacle : activeCalc.robinbet)
            : null;
          const stake = Number(sidePlan?.stake);
          const quoteFresh = Boolean(
            verified?.verified
            && !verified?.keepingPrevious
            && !verified?.sticky
            && verified?.quote_id === confirmChange.quoteId
            && Date.now() - verifiedAt <= ACCEPT_FRESH_MS
          );
          const canAcceptChanged = planReady && quoteFresh;
          return (
            <div className="modal-overlay" onClick={() => setConfirmChange(null)} style={{ zIndex: 200 }}>
              <div className="modal" style={{ width: 360, padding: 14 }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ fontSize: '0.95rem', marginBottom: 8 }}>{isPin ? 'Цена в Pinnacle изменилась' : 'Цена в RobinBet изменилась'}</h2>
                <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                  {isPin ? 'PIN' : 'Robin'}: <b>{confirmChange.from.toFixed(3)}</b> → <b style={{ color: 'var(--accent-warn)' }}>{confirmChange.to.toFixed(3)}</b>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Side: {placeTextForSide(confirmChange.side)} · Counter {counterPlaceText} · {canAcceptChanged ? `Stake $${stake.toFixed(2)} · гарантия вилки ${signedMoney(sidePlan.profit)}` : 'пересчитываем точный план по новой цене…'}
                </div>
                <div className="action-buttons">
                  <button className="btn btn-link" onClick={() => setConfirmChange(null)} disabled={placing}>Cancel</button>
                  <button
                    className={`btn ${isPin ? 'btn-pin' : 'btn-robin'}`}
                    onClick={async () => {
                      if (!canAcceptChanged) return;
                      const { side, quoteId } = confirmChange;
                      setConfirmChange(null);
                      await submitBet(side, finalOdds, quoteId, stake);
                    }}
                    disabled={placing || !canAcceptChanged}
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
          const simulationOnly = successDetails.simulationOnly === true;
          return (
            <div className="modal-overlay" onClick={() => { setSuccessDetails(null); }} style={{ zIndex: 300 }}>
              <div className="modal success-modal" style={{ width: 380, padding: 16 }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ fontSize: '1rem', color: 'var(--positive)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {simulationOnly ? 'Симуляция записана' : 'Ставка успешно размещена!'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', marginBottom: 16 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Букмекер:</span>{' '}
                    <span style={{ fontWeight: 600 }}>
                      {simulationOnly ? 'Simulation · ' : ''}{isPin ? 'PIN' : 'Robin'}
                    </span>
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
                    <span style={{ color: 'var(--text-muted)' }}>{simulationOnly ? 'Расчётная выплата:' : 'Возможная выплата:'}</span>{' '}
                    <span style={{ fontWeight: 600, color: 'var(--positive)' }}>${successDetails.potentialReturn.toFixed(2)}</span>
                  </div>
                  {simulationOnly && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '6px', borderRadius: '4px' }}>
                      Реальная ставка не отправлялась; баланс и лимиты не изменены.
                    </div>
                  )}
                  {isPin && !simulationOnly && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--positive)', background: 'rgba(0, 214, 126, 0.1)', padding: '6px', borderRadius: '4px' }}>
                      Возможный кэшбэк: <b>${(successDetails.stake * 0.5).toFixed(2)}</b> (начисляется в случае проигрыша Pinnacle-плеча)
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
