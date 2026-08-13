"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isOddsButtonText,
  oddsEquivalent,
  canonicalOutcomeKey,
  outcomeKeysEqual,
  findAdjacentOddsButton,
  extractMarketLine,
} = require("./betfair_sportsbook_selection_match.cjs");

test("odds tolerance accepts one cent exactly and rejects a larger move", () => {
  assert.equal(oddsEquivalent(2.0, 2.005), true);
  assert.equal(oddsEquivalent(2.0, 2.01), true);
  assert.equal(oddsEquivalent(2.0, 2.011), false);
});

// --- minimal fake-DOM harness -----------------------------------------------
// Fix-round-4: findAdjacentOddsButton now climbs from the name button to its
// `.parentElement` (the per-runner `div.runnerLine` container confirmed by
// the 2026-07-15 PRECISE structural DOM dump) and scans it with
// `.querySelectorAll("button")`, excluding the name button itself.
// `makeElement` builds a minimal fake DOM node exposing exactly that
// surface: `.tagName`, `.innerText`, `.parentElement` (wired automatically
// from a `children` list, like a real DOM tree) and a real recursive
// `.querySelectorAll("button")`.

function makeElement({ tag = "div", text = "", children = [], className = "" } = {}) {
  const node = {
    tagName: tag.toUpperCase(),
    innerText: text,
    className,
    parentElement: null,
    children,
  };
  for (const child of children) child.parentElement = node;
  node.querySelectorAll = (selector) => {
    if (selector !== "button") {
      throw new Error(`fake DOM querySelectorAll only supports "button", got "${selector}"`);
    }
    const results = [];
    const walk = (n) => {
      for (const child of n.children) {
        if (child.tagName === "BUTTON") results.push(child);
        walk(child);
      }
    };
    walk(node);
    return results;
  };
  return node;
}

// Builds one per-runner `div.runnerLine` container matching the precise
// dump: a name button plus, depending on `oddsLayout`, its paired odds
// button --
//   "wrapped" (the confirmed real shape): odds <button> nested one level
//     inside a `div.sportsbookButton` wrapper, e.g.
//     runnerLine -> [name-button, div-wrapper -> [odds-button]]
//   "simple" (alternate/back-compat shape): odds <button> is itself a
//     direct child of runnerLine, no wrapper div, e.g.
//     runnerLine -> [name-button, odds-button]
//   "none": suspended runner, no odds rendered at all, e.g.
//     runnerLine -> [name-button]
// Fix-round-5: `runnerLine` carries the confirmed per-runner boundary class
// marker (`class ~ "_XXXrunnerLine"` in the precise dump -- the literal
// substring "runnerLine", case-insensitive) and the "wrapped" odds container
// carries the confirmed `sportsbookButton` marker, so the helper's new
// boundary validation has a real marker to check against.
function makeRunnerLine({ nameText, oddsLayout = "wrapped", oddsText = "" }) {
  const nameButton = makeElement({ tag: "button", text: nameText });
  let oddsButton = null;
  let oddsChild = null;
  if (oddsLayout === "wrapped") {
    oddsButton = makeElement({ tag: "button", text: oddsText });
    oddsChild = makeElement({
      tag: "div",
      text: oddsText,
      className: "_a1b2sportsbookButton",
      children: [oddsButton],
    });
  } else if (oddsLayout === "simple") {
    oddsButton = makeElement({ tag: "button", text: oddsText });
    oddsChild = oddsButton;
  } else if (oddsLayout !== "none") {
    throw new Error(`unknown oddsLayout: ${oddsLayout}`);
  }
  const runnerLine = makeElement({
    tag: "div",
    className: "_a1b2runnerLine",
    children: oddsChild ? [nameButton, oddsChild] : [nameButton],
  });
  return { runnerLine, nameButton, oddsButton };
}

// --- isOddsButtonText ------------------------------------------------------

test("isOddsButtonText: bare decimal odds is an odds button", () => {
  assert.equal(isOddsButtonText("2.1"), true);
});

test("isOddsButtonText: bare integer odds is an odds button", () => {
  assert.equal(isOddsButtonText("5"), true);
});

test("isOddsButtonText: comma-decimal odds is an odds button (EU format)", () => {
  assert.equal(isOddsButtonText("1,67"), true);
});

test("isOddsButtonText: a participant name is NOT an odds button", () => {
  assert.equal(isOddsButtonText("Team A"), false);
});

test("isOddsButtonText: a name+odds combined button is NOT a pure odds button", () => {
  assert.equal(isOddsButtonText("Team A 2.10"), false);
});

test("isOddsButtonText: a number with trailing text is NOT a pure odds button", () => {
  assert.equal(isOddsButtonText("2.10 Bet"), false);
});

test("isOddsButtonText: whitespace-only / empty text is not an odds button", () => {
  assert.equal(isOddsButtonText(""), false);
  assert.equal(isOddsButtonText("   "), false);
});

// --- extractMarketLine: fix-round-1 P1 (ordinal-number false positive) -----
// Old bug: grabbed the FIRST number anywhere in the market name, so "1st
// Half Over/Under 2.5 Goals" resolved to line 1 (from the "1st" ordinal)
// instead of 2.5 -- silently breaking the canonical key and either
// rejecting the correct runner (handicap:2.5 case) or, worse, letting a
// WRONG line through unchecked (handicap:null case, no cross-check).
// Fix: only a number adjacent to an Over/Under/Handicap token counts.

test("extractMarketLine: ordinal period prefix ('1st Half') is ignored, the Over/Under line is used", () => {
  assert.equal(extractMarketLine("1st Half Over/Under 2.5 Goals"), 2.5);
});

test("extractMarketLine: ordinal period prefix ('2nd Set') is ignored, the Over/Under line is used", () => {
  assert.equal(extractMarketLine("2nd Set Total Points Over/Under 21.5"), 21.5);
});

test("extractMarketLine: 'Game N' prefix is ignored, the Handicap line is used", () => {
  assert.equal(extractMarketLine("Game 3 Handicap -4.5"), -4.5);
});

test("extractMarketLine: no Over/Under/Handicap keyword present -> null (fail-closed, no blind first-number guess)", () => {
  assert.equal(extractMarketLine("1st Half Correct Score"), null);
});

test("canonicalOutcomeKey: bare 'Over' in a '1st Half Over/Under 2.5 Goals' market resolves to line 2.5, not the '1st' ordinal", () => {
  const key = canonicalOutcomeKey("1st Half Over/Under 2.5 Goals", "Over");
  assert.equal(key.side, "over");
  assert.equal(key.line, 2.5);
});

// --- extractMarketLine: fix-round-2 (P2, arbitrary-number false positive) --
// codex re-review: the old code grabbed the FIRST number anywhere after the
// keyword, not necessarily the line itself -- "Handicap 2-Way -4.5" matched
// "2" (from the structural "2-Way" market-shape suffix) instead of the
// actual line -4.5. Fix: only a number with genuine line syntax (signed,
// e.g. -4.5/+1.5, or decimal, e.g. 2.5/21.5) counts -- a bare unsigned
// integer like the "2" in "2-Way" is never a real Betfair line and is
// ignored; when more than one such candidate is found the line is
// ambiguous -> null (fail-closed), never guessing.

test("extractMarketLine: 'Handicap 2-Way -4.5' resolves to the actual line -4.5, not the '2' from '2-Way'", () => {
  assert.equal(extractMarketLine("Handicap 2-Way -4.5"), -4.5);
});

test("extractMarketLine: 'Over/Under 2.5' resolves to 2.5 (unsigned decimal is still a valid line)", () => {
  assert.equal(extractMarketLine("Over/Under 2.5"), 2.5);
});

test("extractMarketLine: bare unsigned integer after keyword with no decimal/sign is NOT a line -> null", () => {
  assert.equal(extractMarketLine("Handicap 2-Way"), null);
});

// --- canonicalOutcomeKey: Handicap (confirmed live shape) ------------------

test("canonicalOutcomeKey: handicap participant with positive parenthesised line", () => {
  const key = canonicalOutcomeKey("Game Handicap", "James Kent Trotter (+4.5)");
  assert.deepEqual(key, {
    side: "participant",
    participant: "james kent trotter",
    line: 4.5,
    embeddedOdds: false,
  });
});

test("canonicalOutcomeKey: handicap participant with negative parenthesised line", () => {
  const key = canonicalOutcomeKey("Game Handicap", "Liam Draxl (-4.5)");
  assert.deepEqual(key, {
    side: "participant",
    participant: "liam draxl",
    line: -4.5,
    embeddedOdds: false,
  });
});

test("canonicalOutcomeKey: handicap line without parens (bare signed trailing number)", () => {
  const key = canonicalOutcomeKey("Handicap", "Team B -1.5");
  assert.equal(key.side, "participant");
  assert.equal(key.participant, "team b");
  assert.equal(key.line, -1.5);
});

// --- canonicalOutcomeKey: Totals (Over/Under) -------------------------------

test("canonicalOutcomeKey: Over with its own inline line", () => {
  const key = canonicalOutcomeKey("Over/Under 2.5 Goals", "Over 2.5");
  assert.deepEqual(key, { side: "over", participant: null, line: 2.5, embeddedOdds: false });
});

test("canonicalOutcomeKey: Under with its own inline line", () => {
  const key = canonicalOutcomeKey("Over/Under 2.5 Goals", "Under 2.5");
  assert.deepEqual(key, { side: "under", participant: null, line: 2.5, embeddedOdds: false });
});

test("canonicalOutcomeKey: bare 'Over' falls back to the line in the market name", () => {
  const key = canonicalOutcomeKey("Over/Under 2.5 Goals", "Over");
  assert.equal(key.side, "over");
  assert.equal(key.line, 2.5);
});

test("canonicalOutcomeKey: Over and Under with the SAME line are different outcomes (side differs)", () => {
  const over = canonicalOutcomeKey("Over/Under 2.5 Goals", "Over 2.5");
  const under = canonicalOutcomeKey("Over/Under 2.5 Goals", "Under 2.5");
  assert.equal(outcomeKeysEqual(over, under), false);
});

// --- canonicalOutcomeKey: Moneyline / Match Odds (single combined button) --

test("canonicalOutcomeKey: wanted Moneyline selection has no embedded odds", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team A");
  assert.deepEqual(key, { side: "participant", participant: "team a", line: null, embeddedOdds: false });
});

test("canonicalOutcomeKey: rendered Moneyline button text carries embedded odds relative to the wanted selection", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team A 2.10", "Team A");
  assert.deepEqual(key, { side: "participant", participant: "team a", line: null, embeddedOdds: true });
});

test("canonicalOutcomeKey: rendered text is NOT treated as embedded-odds without a wanted-context 3rd arg (money-safe default)", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team A 2.10");
  assert.deepEqual(key, { side: "participant", participant: "team a 2.10", line: null, embeddedOdds: false });
});

// --- canonicalOutcomeKey: fix-round-1 P2 (bare trailing number = participant, not odds) ---
// Old bug: ANY unsigned trailing number was blindly stripped as "embedded
// odds", even from the WANTED selection text itself. So a real participant
// legitimately named "Team 1" got mangled to "Team" (context-free guess),
// and no longer matched the rendered combined button "Team 1 2.10" (whose
// own participant correctly kept "Team 1"), rejecting a perfectly valid
// Moneyline runner. Fix: only strip a trailing number from a RENDERED
// candidate, and only the part that is strictly ADDITIONAL beyond the
// full wanted selection text (3rd arg) -- never touch the wanted text.

test("canonicalOutcomeKey: wanted 'Team 1' (digit is part of the participant's name) is preserved as-is", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team 1");
  assert.deepEqual(key, { side: "participant", participant: "team 1", line: null, embeddedOdds: false });
});

test("canonicalOutcomeKey: rendered 'Team 1 2.10' strips only the odds tail beyond the wanted 'Team 1' text", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team 1 2.10", "Team 1");
  assert.deepEqual(key, { side: "participant", participant: "team 1", line: null, embeddedOdds: true });
});

test("outcomeKeysEqual: wanted Moneyline 'Team 1' (digit-in-name) is NOT rejected against its rendered combined button (P2 regression)", () => {
  const wanted = canonicalOutcomeKey("Match Odds", "Team 1");
  const rendered = canonicalOutcomeKey("Match Odds", "Team 1 2.10", "Team 1");
  assert.equal(outcomeKeysEqual(wanted, rendered), true);
});

// --- canonicalOutcomeKey: fix-round-2 (P2, token-boundary) ------------------
// codex re-review: the embedded-odds strip used a bare `startsWith`, no
// token boundary -- a rendered "Team 10" against wanted "Team 1"
// canonicalized to participant "team 1" + embeddedOdds:true (since "team 10"
// starts with the substring "team 1", leaving a bogus digit "0" tail that
// happens to look like embedded odds), treating a DIFFERENT participant
// ("Team 10") as the SAME one as "Team 1" -- a wrong-runner match. Fix: the
// wanted participant must be followed by a token boundary (a space) for its
// trailing number to be treated as embedded odds; "Team 10" no longer
// matches "Team 1".

test("canonicalOutcomeKey: rendered 'Team 10' is NOT the same participant as wanted 'Team 1' (token-boundary, no bare startsWith)", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team 10", "Team 1");
  assert.equal(key.embeddedOdds, false);
  assert.notEqual(key.participant, "team 1");
  assert.equal(key.participant, "team 10");
});

test("outcomeKeysEqual: wanted 'Team 1' does NOT match rendered 'Team 10' (different participant, token-boundary fail-closed)", () => {
  const wanted = canonicalOutcomeKey("Match Odds", "Team 1");
  const rendered = canonicalOutcomeKey("Match Odds", "Team 10", "Team 1");
  assert.equal(outcomeKeysEqual(wanted, rendered), false);
});

test("canonicalOutcomeKey: rendered 'Team 10 2.10' is also NOT the same participant as wanted 'Team 1' (token-boundary holds with a real odds suffix too)", () => {
  const key = canonicalOutcomeKey("Match Odds", "Team 10 2.10", "Team 1");
  assert.equal(key.embeddedOdds, false);
  assert.notEqual(key.participant, "team 1");
});

// --- outcomeKeysEqual: matching + ambiguous-line safety ---------------------

test("outcomeKeysEqual: wanted 'Team A' matches the rendered combined 'Team A 2.10' button (Moneyline)", () => {
  const wanted = canonicalOutcomeKey("Match Odds", "Team A");
  const rendered = canonicalOutcomeKey("Match Odds", "Team A 2.10", "Team A");
  assert.equal(outcomeKeysEqual(wanted, rendered), true);
});

test("outcomeKeysEqual: wanted handicap selection matches the identical rendered name button", () => {
  const wanted = canonicalOutcomeKey("Game Handicap", "James Kent Trotter (+4.5)");
  const rendered = canonicalOutcomeKey("Game Handicap", "James Kent Trotter (+4.5)");
  assert.equal(outcomeKeysEqual(wanted, rendered), true);
});

test("outcomeKeysEqual: same participant, DIFFERENT handicap lines are NOT equal (ambiguous-line safety)", () => {
  const plusLine = canonicalOutcomeKey("Game Handicap", "Team A (+1.5)");
  const minusLine = canonicalOutcomeKey("Game Handicap", "Team A (-1.5)");
  assert.equal(outcomeKeysEqual(plusLine, minusLine), false);
});

test("outcomeKeysEqual: same line, DIFFERENT participants are NOT equal", () => {
  const teamA = canonicalOutcomeKey("Game Handicap", "Team A (+1.5)");
  const teamB = canonicalOutcomeKey("Game Handicap", "Team B (+1.5)");
  assert.equal(outcomeKeysEqual(teamA, teamB), false);
});

test("outcomeKeysEqual: participant side never equals over/under side", () => {
  const participant = canonicalOutcomeKey("Match Odds", "Team A");
  const over = canonicalOutcomeKey("Over/Under 2.5 Goals", "Over 2.5");
  assert.equal(outcomeKeysEqual(participant, over), false);
});

// --- findAdjacentOddsButton: fix-round-4 (precise betfair DOM) -------------
// Fix-round-3 assumed every runner's name AND odds buttons are flat siblings
// of one shared market container, and used the name button's bare
// `nextElementSibling`. A PRECISE structural DOM dump (2026-07-15, Game
// Handicap -4.5, captured node-by-node) proved that wrong: Betfair DOES wrap
// each runner in its own per-runner container, `div.runnerLine`, but the
// odds button is not a plain sibling of the name button either -- it sits
// ONE LEVEL DEEPER, inside a `div.sportsbookButton` wrapper:
//   div.runnerLine
//     |- button.runnerInnerContent "James Kent Trotter (+4.5)"  <- name button
//     `- div.sportsbookButton "1.67"                            <- DIV wrapper, not a button
//          `- button.button "1.67"                              <- the REAL odds button
// name.parentElement is div.runnerLine; name.nextElementSibling is the
// wrapper DIV (not a button) -- exactly why fix-round-3 always found null on
// this real shape. Fix-round-4 climbs to `runnerLine` (name.parentElement)
// and scopes `querySelectorAll("button")` to it, excluding the name button
// -- which transparently finds the odds button whether it is nested in a
// wrapper div ("wrapped", the confirmed real shape) or a direct child
// ("simple", kept for robustness/back-compat).

test("findAdjacentOddsButton: normal runner -- own odds is a <button> INSIDE the div.sportsbookButton wrapper (precise real DOM shape)", () => {
  const { nameButton, oddsButton } = makeRunnerLine({
    nameText: "James Kent Trotter (+4.5)",
    oddsLayout: "wrapped",
    oddsText: "1.67",
  });
  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, oddsButton);
  assert.equal(result.ambiguous, false);
});

test("findAdjacentOddsButton: simple layout (back-compat) -- odds button is a direct child of runnerLine, no wrapper div", () => {
  const { nameButton, oddsButton } = makeRunnerLine({
    nameText: "Over 2.5",
    oddsLayout: "simple",
    oddsText: "1.90",
  });
  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, oddsButton);
  assert.equal(result.ambiguous, false);
});

test("findAdjacentOddsButton: suspended runner -- no odds button rendered anywhere in runnerLine -> null, fail-closed", () => {
  const { nameButton } = makeRunnerLine({ nameText: "Over 2.5", oddsLayout: "none" });
  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.equal(result.ambiguous, false);
});

test("findAdjacentOddsButton: 2 separate runnerLine containers -- target resolves to its OWN odds, never the neighbour's", () => {
  const r1 = makeRunnerLine({ nameText: "Liam Draxl (-4.5)", oddsLayout: "wrapped", oddsText: "2.1" });
  const r2 = makeRunnerLine({
    nameText: "James Kent Trotter (+4.5)",
    oddsLayout: "wrapped",
    oddsText: "1.67",
  });

  const result1 = findAdjacentOddsButton(r1.nameButton, { maxDepth: 5 });
  assert.equal(result1.button, r1.oddsButton);
  assert.notEqual(result1.button, r2.oddsButton);
  assert.equal(result1.ambiguous, false);

  const result2 = findAdjacentOddsButton(r2.nameButton, { maxDepth: 5 });
  assert.equal(result2.button, r2.oddsButton);
  assert.notEqual(result2.button, r1.oddsButton);
  assert.equal(result2.ambiguous, false);
});

test("findAdjacentOddsButton: MORE THAN ONE odds-shaped button inside runnerLine -> null, ambiguous:true (fail-closed, never guesses)", () => {
  const nameButton = makeElement({ tag: "button", text: "Team A (-1.5)" });
  const odds1 = makeElement({ tag: "button", text: "1.90" });
  const odds2 = makeElement({ tag: "button", text: "2.05" });
  makeElement({ tag: "div", className: "_a1b2runnerLine", children: [nameButton, odds1, odds2] });

  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.equal(result.ambiguous, true);
});

test("findAdjacentOddsButton: a non-button wrapper containing odds-shaped TEXT but no <button> inside it -> null, fail-closed", () => {
  const nameButton = makeElement({ tag: "button", text: "Over 2.5" });
  const spacer = makeElement({ tag: "div", text: "1.90" }); // odds-shaped TEXT but no <button> child
  makeElement({ tag: "div", className: "_a1b2runnerLine", children: [nameButton, spacer] });

  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.equal(result.ambiguous, false);
});

test("findAdjacentOddsButton: root/orphan node with no parentElement at all -> null, not ambiguous", () => {
  const orphan = makeElement({ tag: "button", text: "James Kent Trotter (+4.5)" });
  const result = findAdjacentOddsButton(orphan, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.equal(result.ambiguous, false);
});

// --- findAdjacentOddsButton: fix-round-5 (per-runner boundary validation) --
// codex re-review (P1): fix-round-4 climbs to `nameNode.parentElement` and
// TRUSTS it is the per-runner boundary, without ever validating that. When a
// target runner's name button happens to share its immediate parent with a
// NEIGHBOURING runner (both wrapped by one common SHARED container instead
// of each runner having its own `div.runnerLine`), the
// `querySelectorAll("button")` scan picks up the neighbour's own odds
// button and returns it as if it were the target's own price -- a silent
// wrong-runner match (`ambiguous: false`, money-unsafe). Fix: validate the
// parent's `className` actually contains the confirmed `runnerLine` marker
// BEFORE searching at all; an unrecognised/shared parent shape fails closed
// to null rather than ever searching a container that might hold a
// neighbour's own buttons.

test("findAdjacentOddsButton: target shares a SHARED (non-runnerLine) parent with a neighbour's odds -> null, NEVER the neighbour's odds", () => {
  const targetName = makeElement({ tag: "button", text: "Over 2.5" }); // suspended: no own odds
  const neighbourLabel = makeElement({ tag: "span", text: "Some other runner" });
  const neighbourOdds = makeElement({ tag: "button", text: "1.90" });
  const neighbourWrapper = makeElement({
    tag: "div",
    className: "_a1b2sportsbookButton",
    children: [neighbourOdds],
  });
  // Shared parent of BOTH runners -- deliberately NOT className-marked as
  // its own per-runner runnerLine.
  makeElement({
    tag: "div",
    className: "_a1b2marketRow",
    children: [targetName, neighbourLabel, neighbourWrapper],
  });

  const result = findAdjacentOddsButton(targetName, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.notEqual(result.button, neighbourOdds);
  assert.equal(result.ambiguous, false);
});

test("findAdjacentOddsButton: a genuine per-runner runnerLine (className marker present) still resolves its own odds normally", () => {
  const { nameButton, oddsButton } = makeRunnerLine({
    nameText: "Over 2.5",
    oddsLayout: "wrapped",
    oddsText: "1.90",
  });
  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, oddsButton);
  assert.equal(result.ambiguous, false);
});

// --- findAdjacentOddsButton: fix-round-6 (exact class-token, not substring) -
// codex re-review (P1): fix-round-5's boundary check, `/runnerline/i.test(
// runnerLine.className)`, is a SUBSTRING test over the whole className
// string -- it matches ANYWHERE the text "runnerline" appears, not just as
// a genuine per-runner marker. A common/shared parent classed
// `"_a1b2-runnerLinesContainer"` contains the substring "runnerline" (inside
// "runnerLinesContainer") and would WRONGLY pass the boundary check, letting
// the querySelectorAll("button") scan leak a neighbour's own odds button --
// the exact money-unsafe wrong-runner match fix-round-5 was meant to close,
// just reached via a different className shape. Fix: className must be
// split into individual class tokens (split on whitespace) and at least one
// TOKEN must itself END WITH "runnerLine" (case-insensitive) -- so
// "runnerLinesContainer" and "runnerLines" (plural) are correctly rejected,
// while "_a1b2runnerLine" and "_HASH-runnerLine" (dash-separated hash
// prefix) are correctly accepted. Also requires `tagName === "DIV"`.

test("findAdjacentOddsButton: shared parent classed \"...-runnerLinesContainer\" (substring \"runnerline\", not a real per-runner token) -> null, NEVER the neighbour's odds (fix-round-6)", () => {
  const targetName = makeElement({ tag: "button", text: "Over 2.5" }); // suspended: no own odds
  const neighbourLabel = makeElement({ tag: "span", text: "Some other runner" });
  const neighbourOdds = makeElement({ tag: "button", text: "1.90" });
  const neighbourWrapper = makeElement({
    tag: "div",
    className: "_a1b2sportsbookButton",
    children: [neighbourOdds],
  });
  // Shared parent's className CONTAINS the substring "runnerline" (via
  // "runnerLinesContainer") but is NOT itself a per-runner runnerLine -- a
  // naive /runnerline/i substring test wrongly treats it as one and leaks
  // the neighbour's own odds button.
  makeElement({
    tag: "div",
    className: "_a1b2-runnerLinesContainer",
    children: [targetName, neighbourLabel, neighbourWrapper],
  });

  const result = findAdjacentOddsButton(targetName, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.notEqual(result.button, neighbourOdds);
  assert.equal(result.ambiguous, false);
});

test("findAdjacentOddsButton: valid \"_HASH-runnerLine\" (dash-separated hash prefix, exact trailing class-token) still resolves its own odds normally (fix-round-6)", () => {
  const { nameButton, oddsButton } = makeRunnerLine({
    nameText: "Over 2.5",
    oddsLayout: "wrapped",
    oddsText: "1.90",
  });
  nameButton.parentElement.className = "_HASH-runnerLine";

  const result = findAdjacentOddsButton(nameButton, { maxDepth: 5 });
  assert.equal(result.button, oddsButton);
  assert.equal(result.ambiguous, false);
});

// --- findAdjacentOddsButton: Moneyline (embedded odds -- no separate call) -
// In production, Moneyline never reaches findAdjacentOddsButton at all
// (canonicalOutcomeKey's embeddedOdds short-circuits the caller straight to
// clicking the combined button). Documented here for completeness: even if
// called on a Moneyline-shaped combined button, its runnerLine contains no
// OTHER button besides itself -> still fails closed to null.
test("findAdjacentOddsButton: Moneyline combined button (embedded odds, no separate odds button in runnerLine) -> null", () => {
  const combined = makeElement({ tag: "button", text: "Team A 2.10" });
  makeElement({ tag: "div", className: "_a1b2runnerLine", children: [combined] });

  const result = findAdjacentOddsButton(combined, { maxDepth: 5 });
  assert.equal(result.button, null);
  assert.equal(result.ambiguous, false);
});
