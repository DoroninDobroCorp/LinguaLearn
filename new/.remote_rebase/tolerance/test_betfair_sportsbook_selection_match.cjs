"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalOutcomeKey,
  oddsEquivalent,
  outcomeKeysEqual,
} = require("./betfair_sportsbook_selection_match.cjs");

test("combined handicap button keeps runner and line while stripping odds", () => {
  const wanted = canonicalOutcomeKey("Game Handicap 3.5", "Thiago Agustin Tirante (-3.5)");
  const rendered = canonicalOutcomeKey(
    "Game Handicap 3.5",
    "Thiago Agustin Tirante (-3.5)\n2.2",
    "Thiago Agustin Tirante (-3.5)"
  );
  assert.equal(rendered.embeddedOdds, true);
  assert.equal(rendered.line, -3.5);
  assert.equal(rendered.participant, "thiago agustin tirante");
  assert.equal(outcomeKeysEqual(wanted, rendered), true);
});

test("combined handicap button does not accept a different price-like runner", () => {
  const rendered = canonicalOutcomeKey("Game Handicap 3.5", "Team 10 (-3.5) 2.2", "Team 1 (-3.5)");
  assert.equal(rendered.participant, "team 10 (-3.5) 2.2");
  assert.equal(rendered.embeddedOdds, false);
});

test("combined totals button preserves embedded-odds signal", () => {
  const rendered = canonicalOutcomeKey(
    "Set 1 Total Games Over/Under 12.5",
    "Over 12.5\n6",
    "Over 12.5"
  );
  assert.deepEqual(rendered, {
    side: "over",
    participant: null,
    line: 12.5,
    embeddedOdds: true,
  });
});

test("compact Betfair total button keeps line and recognizes embedded odds", () => {
  const wanted = canonicalOutcomeKey("1st Half Total Points", "Under (93.5)");
  const rendered = canonicalOutcomeKey(
    "1st Half Total Points",
    "Under\n+93.5\n2",
    "Under (93.5)"
  );
  assert.deepEqual(rendered, {
    side: "under",
    participant: null,
    line: 93.5,
    embeddedOdds: true,
  });
  assert.equal(outcomeKeysEqual(wanted, rendered), true);
});

test("display-odds rounding is equivalent but a real price move is not", () => {
  assert.equal(oddsEquivalent(1.33, 1.333333333333333), true);
  assert.equal(oddsEquivalent(1.36, 1.363636363636364), true);
  assert.equal(oddsEquivalent(2.0, 2.005), true);
  assert.equal(oddsEquivalent(2.0, 2.01), true);
  assert.equal(oddsEquivalent(2.0, 2.011), false);
  assert.equal(oddsEquivalent(1.34, 1.363636363636364), false);
});
