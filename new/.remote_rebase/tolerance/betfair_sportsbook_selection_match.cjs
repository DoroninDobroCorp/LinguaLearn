"use strict";

// Pure helpers for the Story 2.4 fix: "Handicap/Totals selection matching --
// клик по odds-кнопке". Live diagnosis (2026-07-15, dev) confirmed the exact
// root cause: Betfair renders a handicap/totals runner as TWO SEPARATE
// buttons -- a name/line button ("James Kent Trotter (+4.5)", "Over 2.5")
// and a numeric odds button ("1.67") -- while Moneyline/Match Odds renders
// name+odds COMBINED in one button ("Team A 2.10"). clickExactSelection
// (betfair_sportsbook_basket_worker.cjs) used to click whichever button's
// raw text matched the wanted selection via climbToMarketContainer
// (betfair_sportsbook_market_boundary.cjs) -- on handicap/totals that is the
// name button, and clicking it does NOT add anything to the betslip
// (confirmed live: sportsbookBettingState STATE_LEN 0 after the click).
//
// climbToMarketContainer itself is untouched by this fix -- it already
// reliably (4 rounds of Story 2.2b hardening) finds the correct, unambiguous
// NAME/line button scoped to the right market. What was missing is knowing
// WHICH button to actually click:
//   - Moneyline/Match Odds: name+odds are the SAME button -> click it.
//   - Handicap/Totals: a SEPARATE odds button sits next to the name button
//     -> climb from the name button to find it.
//
// Kept dependency-free and Playwright-free (like betfair_sportsbook_market_
// boundary.cjs / betfair_sportsbook_market_identity.cjs) so the ACTUAL
// algorithm can be unit tested with node:test, both as pure string functions
// and (for findAdjacentOddsButton) against a synthetic fake-DOM tree, and
// also passed as-is into Playwright's evaluateHandle() to run for real in
// the browser -- it only touches its own arguments (node.parentElement,
// node.querySelectorAll(), button.innerText) and never closes over anything
// from the outer module scope, so its source is safe to serialize into the
// page (same constraint documented in betfair_sportsbook_market_boundary.cjs).

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

// A rendered button is an "odds button" iff its ENTIRE (trimmed) text is a
// bare positive decimal number -- Betfair never renders a handicap/total
// line or a team/participant name as pure digits.
const ODDS_TEXT_RE = /^\d+(?:[.,]\d+)?$/;

function isOddsButtonText(text) {
  return ODDS_TEXT_RE.test(String(text || "").trim());
}

function oddsEquivalent(actual, expected, tolerance = 0.01) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  return Math.abs(actualNumber - expectedNumber) <= tolerance + Number.EPSILON;
}

function parseNumber(raw) {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Best-effort numeric line carried only in the market's own name, e.g.
// "Over/Under 2.5 Goals", "Handicap -1.5" -- used as a fallback when the
// runner/selection text itself does not repeat the line.
//
// Fix-round-1 (P1): the naive "first number anywhere in the string" used to
// pick up ordinal/period prefixes ("1st Half ...", "2nd Set ...", "Game 3
// ...") instead of the actual line, e.g. "1st Half Over/Under 2.5 Goals"
// resolved to line 1. A number only counts as the market's line when it
// appears AFTER an Over/Under/Handicap keyword -- everything before that
// keyword (ordinals, period/game numbers) is ignored. No keyword present ->
// null (fail-closed) rather than guessing at an unrelated number.
const LINE_KEYWORD_RE = /\b(?:over|under|handicap)\b/i;

// Fix-round-2 (P2): the naive "first number anywhere after the keyword" used
// to pick up structural/market-shape numbers that are NOT the line itself,
// e.g. "Handicap 2-Way -4.5" resolved to line 2 (from the "2-Way" market
// type suffix) instead of the actual -4.5. A genuine Betfair line always
// renders with a sign (-4.5, +1.5) or a decimal point/comma (2.5, 21.5) --
// "2-Way"/"3-Way" and similar bare unsigned integers never are one. Collect
// every candidate matching that shape after the keyword; only a SINGLE
// unambiguous candidate counts as the line, anything else (none, or more
// than one) fails closed to null rather than guessing.
const LINE_NUMBER_RE = /[-+]\d+(?:[.,]\d+)?|\d+[.,]\d+/g;

function extractMarketLine(marketName) {
  const str = String(marketName || "");
  const keywordMatch = str.match(LINE_KEYWORD_RE);
  if (!keywordMatch) return null;
  const rest = str.slice(keywordMatch.index + keywordMatch[0].length);
  const candidates = rest.match(LINE_NUMBER_RE);
  if (!candidates || candidates.length !== 1) return null;
  return parseNumber(candidates[0]);
}

// Canonical identity of a betting outcome, derived from its display text (a
// wanted `selection` string, or a candidate button's own innerText) and the
// market name it belongs to.
//   side:         "over" | "under" | "participant"
//   participant:  normalized name text (side === "participant" only)
//   line:         numeric handicap/total line, or null when the market has
//                 none (e.g. Moneyline/Match Odds)
//   embeddedOdds: true when the SAME text also carries its own odds value
//                 appended after the name (Moneyline's single combined
//                 button) -- the caller uses this to know there is no
//                 separate odds button to pair with.
function canonicalOutcomeKey(marketName, text, wantedText) {
  let norm = normalizeText(text);
  let line = null;
  let embeddedOdds = false;

  // Some Betfair layouts combine a handicap/total label and its odds in one
  // button ("Player (-3.5) 2.2"). Strip only an exact wanted-label prefix
  // followed by one bare decimal price before parsing the line.
  if (wantedText !== undefined && wantedText !== null) {
    const wantedNorm = normalizeText(wantedText);
    if (wantedNorm && norm.startsWith(`${wantedNorm} `)) {
      const tail = norm.slice(wantedNorm.length).trim();
      if (/^\d+(?:[.,]\d+)?$/.test(tail)) {
        norm = wantedNorm;
        embeddedOdds = true;
      }
    }
  }
  // 1) Parenthesised signed line -- the confirmed handicap shape:
  //    "James Kent Trotter (+4.5)" / "Liam Draxl (-4.5)".
  const parenMatch = norm.match(/\(([-+]?\d+(?:[.,]\d+)?)\)\s*$/);
  if (parenMatch) {
    line = parseNumber(parenMatch[1]);
    norm = norm.slice(0, parenMatch.index).trim();
  }

  // 2) Over/Under totals -- side is the keyword; a line rendered inline
  //    ("over 2.5") takes precedence, otherwise fall back to the market name.
  const overUnderMatch = norm.match(
    /^(over|under)\b\s*(?:\(?([-+]?\d+(?:[.,]\d+)?)\)?)?(?:\s+(\d+(?:[.,]\d+)?))?$/
  );
  if (overUnderMatch) {
    if (overUnderMatch[2]) line = parseNumber(overUnderMatch[2]);
    // Confirmed live compact button shape: "Under\n+93.5\n2". The first
    // number is the total line and the second is the price rendered in the
    // same button, so this button itself is the click target.
    if (overUnderMatch[3]) embeddedOdds = true;
    if (line === null) line = extractMarketLine(marketName);
    return { side: overUnderMatch[1], participant: null, line, embeddedOdds };
  }

  // 3) Bare signed trailing line with no parens, e.g. "Team A -4.5".
  if (line === null) {
    const signedMatch = norm.match(/([-+]\d+(?:[.,]\d+)?)\s*$/);
    if (signedMatch) {
      line = parseNumber(signedMatch[1]);
      norm = norm.slice(0, signedMatch.index).trim();
    }
  }

  // 4) Odds embedded in the SAME button after the name (Moneyline), e.g.
  //    "Team A 2.10" -- an UNSIGNED trailing number with no parens/sign
  //    already consumed above.
  //
  //    Fix-round-1 (P2): this used to blindly strip ANY bare trailing
  //    number, even from the WANTED selection text itself -- so a
  //    participant genuinely named "Team 1" (trailing digit is part of the
  //    name, not odds) got mangled to "Team", no longer matching the
  //    rendered combined button "Team 1 2.10" (whose own participant
  //    correctly kept "Team 1") and rejecting a valid Moneyline runner.
  //
  //    A trailing number is embedded odds ONLY relative to a known wanted
  //    selection text (`wantedText`, passed by the caller comparing a
  //    RENDERED candidate against the wanted key) -- and only the part
  //    strictly ADDITIONAL beyond that wanted text. Without a wanted
  //    reference there is no safe way to tell a trailing-digit name from
  //    odds, so nothing is stripped (money-safe default: never guess).
  //
  //    Fix-round-2 (P2): the prefix check used a bare `startsWith`, with no
  //    token boundary -- a rendered "Team 10" against wanted "Team 1"
  //    satisfied "team 10".startsWith("team 1") (plain substring match), so
  //    a genuinely DIFFERENT participant ("Team 10") got canonicalized as
  //    "team 1" with a bogus embedded-odds tail of "0". The wanted
  //    participant must be followed by an actual token boundary (a space)
  //    for anything after it to be considered a separate embedded-odds
  //    tail at all -- "Team 10" no longer collapses onto "Team 1".
  if (wantedText !== undefined && wantedText !== null) {
    const wantedParticipant = canonicalOutcomeKey(marketName, wantedText).participant;
    if (wantedParticipant && norm.startsWith(`${wantedParticipant} `)) {
      const tail = norm.slice(wantedParticipant.length).trim();
      if (/^\d+(?:[.,]\d+)?$/.test(tail)) {
        embeddedOdds = true;
        norm = wantedParticipant;
      }
    }
  }

  if (line === null) line = extractMarketLine(marketName);

  return { side: "participant", participant: norm, line, embeddedOdds };
}

function linesEqual(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(a - b) < 0.001;
}

// Ambiguous-line safety (AC-2): two outcomes are the SAME only when the
// side matches AND (for participant outcomes) the name matches AND the line
// matches. "Team A (+1.5)" and "Team A (-1.5)" are two DIFFERENT outcomes.
function outcomeKeysEqual(a, b) {
  if (a.side !== b.side) return false;
  if (a.side === "participant" && a.participant !== b.participant) return false;
  return linesEqual(a.line, b.line);
}

// Bridges an already-resolved NAME/line button to its paired odds button
// (Handicap/Totals only -- callers must not invoke this for a Moneyline-style
// combined button, see canonicalOutcomeKey's `embeddedOdds`). `nameNode` is
// the button climbToMarketContainer already unambiguously resolved.
//
// Fix-round-1 (P1) and fix-round-2 (P1) both assumed a runner has its own
// per-runner ROW CONTAINER wrapping exactly its name+odds buttons, and tried
// to climb/prove that container's boundary. A live structural DOM dump
// (2026-07-15, Game Handicap -4.5) proved that model wrong: Betfair does NOT
// wrap each runner in its own row. Every button of the whole market -- every
// runner's name AND odds -- is a direct sibling of ONE shared container, in
// strict render order:
//   [name1][odds1][name2][odds2] ... [nameN][oddsN]
// There is no per-runner boundary to find or prove; fix-round-2's "exactly
// one other direct child, itself a bare odds-shaped button" check never
// holds on this shape once a market has more than one runner (there are
// always more than one "other direct child" once a second runner's buttons
// are siblings too) -- so it fail-closed to null on every real handicap
// market, which is the "Selection not found" regression this fix addresses.
//
// Fix-round-3 assumed the whole market's buttons (every runner's name AND
// odds) sit as FLAT siblings of one shared container, with a runner's own
// odds being its name button's bare `nextElementSibling`. A PRECISE
// structural DOM dump (2026-07-15, Game Handicap -4.5, captured node-by-node
// rather than eyeballed) proved that wrong too: Betfair DOES wrap each
// runner in its own per-runner container after all --
//   div.runnerLine                                     <- per-runner container
//     |- button.runnerInnerContent "James Kent Trotter (+4.5)"  <- name button
//     `- div.sportsbookButton "1.67"                    <- a DIV wrapper, NOT a button
//          `- button.button "1.67"                      <- the REAL odds button, INSIDE the wrapper
// name.parentElement is div.runnerLine (exactly this one runner's name +
// odds-wrapper, nothing else). name.nextElementSibling is the wrapper DIV,
// not a button -- which is exactly why fix-round-3 (which only ever checked
// whether the next sibling itself was a bare odds-shaped <button>) always
// found null on this shape: the real odds <button> is one level deeper,
// INSIDE that wrapper div, not a sibling of the name button at all.
//
// Fix-round-4: climb from the name button to its parentElement (the
// per-runner `runnerLine`) and search for the odds button WITHIN that
// runnerLine only, via `querySelectorAll("button")` -- a scoped, bounded
// search of exactly this one runner's own subtree, excluding the name
// button itself. This transparently covers BOTH confirmed real shapes:
//   - wrapped (the precise dump above): odds <button> nested one level
//     inside a `div.sportsbookButton` wrapper -> querySelectorAll finds it
//     via a normal descendant search.
//   - simple (older/alternate layout, kept for robustness): odds <button>
//     is itself a DIRECT child of runnerLine, no wrapper div -> also found
//     by the same querySelectorAll("button") scan.
// Money-safe: `runnerLine` is per-runner by construction (it is exactly
// `nameNode.parentElement`, nothing shared with any other runner), so the
// search can never cross into a neighbouring runner's own name/odds pair.
//   - normal runner:    exactly one odds-shaped <button> found inside
//     runnerLine (besides the name button itself) -> that is its own odds.
//   - suspended runner:  zero odds-shaped <button>s inside runnerLine (no
//     odds rendered at all for it) -> null, fail-closed. Never reaches into
//     a sibling runnerLine to borrow a neighbour's price.
//   - more than one odds-shaped <button> inside runnerLine (an
//     unanticipated/ambiguous shape) -> null with `ambiguous: true` rather
//     than guessing which one is the real odds button.
// Also fails closed to null when `nameNode` has no `parentElement` at all
// (orphan/root node, no runnerLine to search). `arg` is accepted but unused
// -- kept so the existing evaluateHandle(findAdjacentOddsButton,
// { maxDepth: 5 }) call sites do not need to change.
//
// Fix-round-5 (P1): fix-round-4 climbed to `nameNode.parentElement` and
// TRUSTED it to be the per-runner `runnerLine` boundary -- it never actually
// validated that. codex re-review found the hole: if a target runner's name
// button ever shares its immediate parent with a NEIGHBOURING runner (e.g.
// one shared list/row container instead of each runner having its own
// `div.runnerLine`), the querySelectorAll("button") scan below would happily
// pick up the neighbour's own odds button and return it as the target's own
// price -- a silent wrong-runner match (`ambiguous: false`, money-unsafe;
// reproduced with [suspended target name, neighbour label, neighbour
// sportsbookButton-wrapper > odds] all under one shared parent). Fix:
// validate `parentElement` actually IS a per-runner boundary -- its
// `className` must contain the confirmed `runnerLine` marker (from the
// precise dump, `class ~ "_XXXrunnerLine"`, case-insensitive) -- BEFORE
// searching it at all. An unrecognised/shared parent shape never falls back
// to searching anyway; it fails closed to null.
//
// Fix-round-6 (P1): fix-round-5's boundary check, `/runnerline/i.test(
// runnerLine.className)`, is a SUBSTRING test over the WHOLE className
// string -- it matches "runnerline" ANYWHERE in the string, not just as a
// genuine per-runner marker. codex re-review found a common/shared parent
// classed `"_a1b2-runnerLinesContainer"` still contains the substring
// "runnerline" (inside "runnerLinesContainer") and would WRONGLY pass the
// boundary check -- the exact wrong-runner leak fix-round-5 was meant to
// close, reached via a different className shape. Fix: split className into
// individual class tokens (on whitespace) and require at least one TOKEN to
// itself END WITH "runnerLine" (case-insensitive), plus `tagName ===
// "DIV"`. Anchoring to the end of the token rejects "runnerLinesContainer"
// and "runnerLines" (plural) -- neither ends with "runnerLine" -- while
// still accepting "_a1b2runnerLine" and dash-separated "_HASH-runnerLine".
function findAdjacentOddsButton(nameNode, arg) {
  void arg;
  const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const isOdds = (text) => /^\d+(?:[.,]\d+)?$/.test(norm(text));
  const isButton = (node) =>
    !!node && typeof node.tagName === "string" && node.tagName.toUpperCase() === "BUTTON";

  const runnerLine = nameNode && nameNode.parentElement;
  if (!runnerLine || typeof runnerLine.querySelectorAll !== "function") {
    return { button: null, ambiguous: false };
  }

  const isDiv =
    typeof runnerLine.tagName === "string" && runnerLine.tagName.toUpperCase() === "DIV";
  const hasRunnerLineToken = String(runnerLine.className || "")
    .split(/\s+/)
    .some((token) => /runnerline$/i.test(token));
  const isPerRunnerBoundary = isDiv && hasRunnerLineToken;
  if (!isPerRunnerBoundary) {
    return { button: null, ambiguous: false };
  }

  const candidates = Array.from(runnerLine.querySelectorAll("button")).filter(
    (button) => button !== nameNode && isButton(button) && isOdds(button.innerText)
  );

  if (candidates.length === 1) return { button: candidates[0], ambiguous: false };
  if (candidates.length > 1) return { button: null, ambiguous: true };
  return { button: null, ambiguous: false };
}

module.exports = {
  normalizeText,
  isOddsButtonText,
  oddsEquivalent,
  extractMarketLine,
  canonicalOutcomeKey,
  outcomeKeysEqual,
  findAdjacentOddsButton,
};
