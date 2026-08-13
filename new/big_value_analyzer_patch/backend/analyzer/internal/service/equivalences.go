package service

import (
	"fmt"
	"livebets/analazer/internal/entity"
	"log"

	"os"
	"strconv"
	"strings"
)

// debugTraceTeam returns the team filter for debug tracing (from env DEBUG_TRACE_TEAM).
func debugTraceTeam() string {
	return strings.ToLower(os.Getenv("DEBUG_TRACE_TEAM"))
}

// debugTraceMatches checks if any of the given strings match the trace filter.
func debugTraceMatches(texts ...string) bool {
	target := debugTraceTeam()
	if target == "" {
		return false
	}
	for _, t := range texts {
		if strings.Contains(strings.ToLower(t), target) {
			return true
		}
	}
	return false
}

// MarketEquivalent stores donor odd with original market name
type MarketEquivalent struct {
	Odd            entity.Odd
	OriginalMarket string
}

// DonorMarketWithCanonical stores donor market info with its canonical key
type DonorMarketWithCanonical struct {
	Odd                    entity.Odd
	OriginalKey            string // Original market name from donor (e.g. "DC 1X", "1", "CS 0-0")
	CanonicalKey           string // Primary canonical key for comparison
	FallbackCanonicalKey   string // Optional fallback canonical key when exact Pinnacle market is absent
	RequireStdPinnacleOdds bool   // For synthetic fallback mappings, only standard Pinnacle line is allowed
	PreferredPinnacleKey   string // Pinnacle market key to verify when RequireStdPinnacleOdds=true
}

// PinnacleCanonical stores canonicalized Pinnacle odd with source provenance
// PinnacleOddEntry stores a Pinnacle odd value with native/remapped flag.
// IsNative=true means this key is a canonical entry (same market structure).
// IsNative=false means this key is a source remap (e.g. 3WH→H1, price from different market).
type PinnacleOddEntry struct {
	Value    float64
	IsNative bool
}

type PinnacleCanonical struct {
	Odd        entity.Odd
	StdOdd     entity.Odd // Price from standard line (source == canonical key), zero if only specials
	Sources    []string   // All source market keys that map to this canonical key
	BestSource string     // Source market that provided the best odd
}

// equivalentMarkets defines groups of mathematically equivalent markets
// Key is canonical market name, value is list of equivalent market names
var equivalentMarkets = map[string][]string{
	// Win = Handicap -0.5 (team wins by any margin)
	"H1 -0.5": {"1", "H1 -0.5"},
	"H2 -0.5": {"2", "H2 -0.5"},

	// Total < 0.5 equivalents (no goals scored)
	"T< 0.5": {"T< 0.5", "CS 0-0", "CS 0:0", "ETS No", "FTS Neither", "WM NoGoal"},

	// Total > 0.5 equivalents (at least one goal)
	"T> 0.5": {"T> 0.5", "ETS Yes"},

	// Individual totals 0.5 - NO equivalence with HTS/ATS!
	// HTS/ATS (Home/Away Team To Score) are DIFFERENT markets with different margins.
	// At some bookmakers, "Team To Score" and "IT > 0.5" have different lines/margins.
	// Mixing them creates fake arbitrage with ROI up to 200%+.
	// Keep them as separate markets: IT1/IT2 vs HTS/ATS
	"IT1> 0.5": {"IT1> 0.5"},
	"IT1< 0.5": {"IT1< 0.5"},
	"IT2> 0.5": {"IT2> 0.5"},
	"IT2< 0.5": {"IT2< 0.5"},

	// Sets equivalences (Tennis/Volleyball)
	// "Will 4th set be played?" = Sets Total > 3.5
	"Sets T> 3.5": {"Sets T> 3.5", "4thSet Yes"},
	"Sets T< 3.5": {"Sets T< 3.5", "4thSet No"},
	// "Will 5th set be played?" = Sets Total > 4.5
	"Sets T> 4.5": {"Sets T> 4.5", "5thSet Yes"},
	"Sets T< 4.5": {"Sets T< 4.5", "5thSet No"},

	// "Player wins at least 1 set" = Sets Handicap +1.5 (Tennis)
	// Player 1 wins at least 1 set (Yes) = H1 +1.5 wins
	"Sets H1 1.5": {"Sets H1 1.5", "P1WinsSet Yes"},
	// Player 1 wins at least 1 set (No) = H2 -1.5 wins (opponent wins 2-0 or 3-0)
	"Sets H2 -1.5": {"Sets H2 -1.5", "P1WinsSet No"},
	// Player 2 wins at least 1 set (Yes) = H2 +1.5 wins
	"Sets H2 1.5": {"Sets H2 1.5", "P2WinsSet Yes"},
	// Player 2 wins at least 1 set (No) = H1 -1.5 wins (opponent wins 2-0 or 3-0)
	"Sets H1 -1.5": {"Sets H1 -1.5", "P2WinsSet No"},

	// "Team wins at least 1 map" = Handicap +1.5 (ESports)
	// Home team wins at least 1 map (Yes) = H1 +1.5 maps
	"H1 1.5": {"H1 1.5", "HomeWinMap Yes"},
	// Home team wins at least 1 map (No) = H2 -1.5 maps (opponent sweeps)
	"H2 -1.5": {"H2 -1.5", "HomeWinMap No"},
	// Away team wins at least 1 map (Yes) = H2 +1.5 maps
	"H2 1.5": {"H2 1.5", "AwayWinMap Yes"},
	// Away team wins at least 1 map (No) = H1 -1.5 maps (opponent sweeps)
	"H1 -1.5": {"H1 -1.5", "AwayWinMap No"},
}

// getEquivalentMarkets returns all equivalent markets for a canonical key
func getEquivalentMarkets(canonicalKey string) []string {
	if equivalents, ok := equivalentMarkets[canonicalKey]; ok {
		return equivalents
	}
	return []string{canonicalKey}
}

// findBestEquivalent finds the best (highest value) equivalent market from donor
func findBestEquivalent(donorPeriod entity.PeriodData, canonicalKey string, periodIdx int) MarketEquivalent {
	equivalents := getEquivalentMarkets(canonicalKey)
	var best MarketEquivalent

	for _, market := range equivalents {
		odd := getDonorOdd(donorPeriod, market)
		if odd.Value > best.Odd.Value {
			best = MarketEquivalent{Odd: odd, OriginalMarket: market}
		}
	}

	return best
}

// getDonorOdd extracts odd value from donor period by market name
func getDonorOdd(period entity.PeriodData, market string) entity.Odd {
	// Win 1X2
	if market == "1" {
		return period.Win1x2.Win1
	}
	if market == "X" {
		return period.Win1x2.WinNone
	}
	if market == "2" {
		return period.Win1x2.Win2
	}

	// Double Chance
	if market == "DC 1X" && period.DoubleChance != nil {
		return period.DoubleChance.W1X
	}
	if market == "DC X2" && period.DoubleChance != nil {
		return period.DoubleChance.WX2
	}
	if market == "DC 12" && period.DoubleChance != nil {
		return period.DoubleChance.W12
	}

	// Draw No Bet
	if market == "DNB 1" && period.DrawNoBet != nil {
		return period.DrawNoBet.Home
	}
	if market == "DNB 2" && period.DrawNoBet != nil {
		return period.DrawNoBet.Away
	}

	// Correct Score 0-0
	if market == "CS 0-0" || market == "CS 0:0" {
		if period.CorrectScore != nil {
			if odd, ok := period.CorrectScore["0-0"]; ok {
				return *odd
			}
			if odd, ok := period.CorrectScore["0:0"]; ok {
				return *odd
			}
		}
		return entity.Odd{}
	}

	// First Team To Score
	if market == "FTS Neither" && period.FirstTeamToScore != nil {
		return period.FirstTeamToScore.Neither
	}

	// Either Team To Score
	if market == "ETS Yes" && period.EitherTeamToScore != nil {
		return period.EitherTeamToScore.Yes
	}
	if market == "ETS No" && period.EitherTeamToScore != nil {
		return period.EitherTeamToScore.No
	}

	// Home Team To Score
	if market == "HTS Yes" && period.HomeTeamToScore != nil {
		return period.HomeTeamToScore.Yes
	}
	if market == "HTS No" && period.HomeTeamToScore != nil {
		return period.HomeTeamToScore.No
	}

	// Away Team To Score
	if market == "ATS Yes" && period.AwayTeamToScore != nil {
		return period.AwayTeamToScore.Yes
	}
	if market == "ATS No" && period.AwayTeamToScore != nil {
		return period.AwayTeamToScore.No
	}

	// Winning Margin No Goal
	if market == "WM NoGoal" && period.WinningMargin != nil {
		for key, odd := range period.WinningMargin {
			keyLower := strings.ToLower(key)
			if strings.Contains(keyLower, "no goal") || key == "0" || key == "0-0" {
				return *odd
			}
		}
	}

	// Handicaps: "H1 -0.5", "H2 0.5", etc.
	if strings.HasPrefix(market, "H1 ") {
		line := strings.TrimPrefix(market, "H1 ")
		if period.Handicap != nil {
			if hcp, ok := period.Handicap[line]; ok {
				return hcp.Win1
			}
		}
		return entity.Odd{}
	}
	if strings.HasPrefix(market, "H2 ") {
		line := strings.TrimPrefix(market, "H2 ")
		if period.Handicap != nil {
			if hcp, ok := period.Handicap[line]; ok {
				return hcp.Win2
			}
		}
		return entity.Odd{}
	}

	// Totals: "T> 0.5", "T< 2.5", etc.
	if strings.HasPrefix(market, "T> ") {
		line := strings.TrimPrefix(market, "T> ")
		if period.Totals != nil {
			if total, ok := period.Totals[line]; ok {
				return total.WinMore
			}
		}
		return entity.Odd{}
	}
	if strings.HasPrefix(market, "T< ") {
		line := strings.TrimPrefix(market, "T< ")
		if period.Totals != nil {
			if total, ok := period.Totals[line]; ok {
				return total.WinLess
			}
		}
		return entity.Odd{}
	}

	// Individual Totals: "IT1> 0.5", "IT2< 1.5", etc.
	if strings.HasPrefix(market, "IT1> ") {
		line := strings.TrimPrefix(market, "IT1> ")
		if period.FirstTeamTotals != nil {
			if total, ok := period.FirstTeamTotals[line]; ok {
				return total.WinMore
			}
		}
		return entity.Odd{}
	}
	if strings.HasPrefix(market, "IT1< ") {
		line := strings.TrimPrefix(market, "IT1< ")
		if period.FirstTeamTotals != nil {
			if total, ok := period.FirstTeamTotals[line]; ok {
				return total.WinLess
			}
		}
		return entity.Odd{}
	}
	if strings.HasPrefix(market, "IT2> ") {
		line := strings.TrimPrefix(market, "IT2> ")
		if period.SecondTeamTotals != nil {
			if total, ok := period.SecondTeamTotals[line]; ok {
				return total.WinMore
			}
		}
		return entity.Odd{}
	}
	if strings.HasPrefix(market, "IT2< ") {
		line := strings.TrimPrefix(market, "IT2< ")
		if period.SecondTeamTotals != nil {
			if total, ok := period.SecondTeamTotals[line]; ok {
				return total.WinLess
			}
		}
		return entity.Odd{}
	}

	// HomeWinMap / AwayWinMap (ESports: "Will Team Win At Least One Map?")
	if market == "HomeWinMap Yes" && period.HomeWinMap != nil {
		return period.HomeWinMap.Yes
	}
	if market == "HomeWinMap No" && period.HomeWinMap != nil {
		return period.HomeWinMap.No
	}
	if market == "AwayWinMap Yes" && period.AwayWinMap != nil {
		return period.AwayWinMap.Yes
	}
	if market == "AwayWinMap No" && period.AwayWinMap != nil {
		return period.AwayWinMap.No
	}

	return entity.Odd{}
}

// Soccer live DC/DNB <-> H+0.5/H0 is score-sensitive because PS3838 handicap parsing
// uses score adjustment for soccer only. Non-soccer sports keep absolute handicaps.
func canUseScoreSensitiveEquivalence(periodIdx int, homeScore, awayScore int, sportName string) bool {
	if sportName != "Soccer" {
		return true
	}
	if homeScore == 0 && awayScore == 0 {
		return true
	}
	if periodIdx <= 1 {
		return homeScore == awayScore
	}
	return false
}

// canonicalizePinnacleMarkets converts Pinnacle period data to canonical format
// Returns map of canonical market key -> best odd (with equivalents merged)
func canonicalizePinnacleMarkets(period entity.PeriodData, periodIdx int, homeScore, awayScore int, sportName string) map[string]PinnacleCanonical {
	result := make(map[string]PinnacleCanonical, 500)
	prefix := ""
	if periodIdx > 0 {
		prefix = fmt.Sprintf("P%d ", periodIdx)
	}
	allowScoreSensitiveEquivalence := canUseScoreSensitiveEquivalence(periodIdx, homeScore, awayScore, sportName)

	// Win1x2 → canonical handicap key.
	// 3-way (hasDraw): Win1→H1 -0.5, Win2→H2 -0.5 (must win, draw loses)
	// 2-way (no draw):
	//   Handball/Hockey: draw=push → H1 0 / H2 0 (pairs with DNB; betslip uses H0→ML fallback)
	//   Tennis/TT: ML 1 / ML 2 (moneyline ≠ game/point handicap — different units!)
	//   All other sports: OT/inherently no-draw → H1 -0.5 / H2 -0.5 (outright win = must win)
	hasDraw := period.Win1x2.WinNone.Value > 0
	// 2-way ML semantic depends on sport + context (full match vs period):
	//   Handball: always draw=push → H0 (any level)
	//   Periods (non-noDrawSport): quarter/period can end in draw → H0
	//   Full match with OT (Hockey/Basketball/Baseball/AmFootball): no draw → H-0.5
	//   No-draw sports (ESports/Volleyball): never draw → H-0.5 (any level)
	//   Tennis/TT: separate ML key (handicap is games/points, not sets/matches)
	twoWayIsH0 := sportName == "Handball" ||
		(periodIdx > 0 && sportName != "Tennis" && sportName != "ESports" &&
			sportName != "TableTennis" && sportName != "Volleyball")

	// Tennis/TT: handicap unit (games/points) differs from match unit (sets/games).
	// Moneyline (match winner) ≠ game/point handicap -0.5. Example:
	// Tennis 2-6, 7-6, 7-6 = win match (ML wins) but fewer total games (H1 -0.5 loses).
	gameBasedHcpSport := sportName == "Tennis" || sportName == "TableTennis"

	if period.Win1x2.Win1.Value > 0 {
		key := prefix + "H1 -0.5"
		if !hasDraw && twoWayIsH0 {
			key = prefix + "H1 0"
		} else if gameBasedHcpSport {
			key = prefix + "ML 1"
		}
		updateIfBetter(result, key, period.Win1x2.Win1, prefix+"1")
	}
	if period.Win1x2.Win2.Value > 0 {
		key := prefix + "H2 -0.5"
		if !hasDraw && twoWayIsH0 {
			key = prefix + "H2 0"
		} else if gameBasedHcpSport {
			key = prefix + "ML 2"
		}
		updateIfBetter(result, key, period.Win1x2.Win2, prefix+"2")
	}
	// X stays as X (no equivalent)
	if hasDraw {
		updateIfBetter(result, prefix+"X", period.Win1x2.WinNone, prefix+"X")
	}

	// Handicaps
	// Accept both complete two-way and one-sided lines. Tennis and other
	// no-draw sports always send one-sided handicaps (positive line has Win1
	// only, negative line has Win2 only). Each non-zero side is set
	// independently; updateIfBetter ensures the best price wins.
	//
	// No-draw set/map sports (ESports, Volleyball):
	// Handicap 0 ≡ moneyline (H -0.5) because draws are impossible at any level.
	// Merge via updateIfBetter so best price from Win1x2 vs Hdp0 wins.
	//
	// Tennis/TT: Handicap 0 is game/point handicap — NOT equivalent to moneyline.
	// Keep as H1 0 / H2 0, separate from ML key.
	noDrawSport := sportName == "ESports" || sportName == "Tennis" || sportName == "TableTennis" || sportName == "Volleyball"
	// === HANDICAP COMPLEMENT PAIR VALIDATION ===
	// Root cause fix: updateIfBetter keeps MAX price per key, but H1 X and H2 (-X)
	// may get prices from DIFFERENT PS3838 spread entries (FO partial updates, alt lines).
	// Fix: validate that complement pair margin is 0.95-1.15 before accepting prices.
	// Complement from parse_spreads_into: Win1@[line] <-> Win2@[invertedLine] = same hdp entry.
	hcpProcessed := make(map[string]bool)
	for line, hcp := range period.Handicap {
		if hcp == nil || (hcp.Win1.Value <= 0 && hcp.Win2.Value <= 0) {
			continue
		}
		normalizedLine := normalizeTotal(line)
		if normalizedLine == "0" && noDrawSport {
			if gameBasedHcpSport {
				if hcp.Win1.Value > 0 {
					setCanonical(result, prefix+"H1 0", hcp.Win1)
				}
				if hcp.Win2.Value > 0 {
					setCanonical(result, prefix+"H2 0", hcp.Win2)
				}
			} else {
				if hcp.Win1.Value > 0 {
					updateIfBetter(result, prefix+"H1 -0.5", hcp.Win1, prefix+"1")
				}
				if hcp.Win2.Value > 0 {
					updateIfBetter(result, prefix+"H2 -0.5", hcp.Win2, prefix+"2")
				}
			}
			continue
		}
		if hcpProcessed[normalizedLine] {
			continue
		}

		invertedLine := invertHandicapLine(normalizedLine)
		// Find a distinct complementary raw entry first. This matters for zero:
		// both "-0.0" and "0.0" normalize/invert to "0", and a map lookup or
		// range may otherwise select the current one and lose one side at random.
		invertedHcp, hasInverted := findHandicapComplement(
			period.Handicap, line, hcp, invertedLine,
		)

		// Early exit: ни одна из пар не может быть сформирована из-за нулевых коэффициентов.
		//
		// Пара A требует: hcp.Win1 > 0  И  invertedHcp.Win2 > 0
		// Пара B требует: invertedHcp.Win1 > 0  И  hcp.Win2 > 0
		//
		// Если ни одна пара не может быть даже попытана (хотя бы одно нужное значение = 0),
		// дальнейшая обработка бессмысленна и код гарантированно упрётся в [HCP_SKIP].
		// Типичный случай: Hockey HCP["0"] — Pinnacle создаёт структуру линии заранее,
		// но публикует цены позже. Такие записи приходят сотнями и сжигают CPU.
		//
		// Важно: этот guard срабатывает только при hasInverted=true (иначе below
		// отрабатывает one-sided логика, которая корректно ставит то что есть).
		// При ненулевых коэффициентах с плохой маржой [HCP_PAIR_REJECT] уже залогирован
		// выше, поэтому [HCP_SKIP] там остаётся как легитимное предупреждение.
		pairAAttemptable := hcp.Win1.Value > 0 && hasInverted && invertedHcp.Win2.Value > 0
		pairBAttemptable := hasInverted && invertedHcp.Win1.Value > 0 && hcp.Win2.Value > 0
		if hasInverted && !pairAAttemptable && !pairBAttemptable {
			hcpProcessed[normalizedLine] = true
			hcpProcessed[invertedLine] = true
			continue
		}

		// Pair A: Win1@[line] (H1 normalizedLine) + Win2@[invertedLine] (H2 invertedLine)
		// These come from same PS3838 spread entry (hdp=invertedLine_float)
		pairAok := false
		if hcp.Win1.Value > 0 && hasInverted && invertedHcp.Win2.Value > 0 {
			mA := 1.0/hcp.Win1.Value + 1.0/invertedHcp.Win2.Value
			if mA >= 1.0 && mA <= 1.15 {
				pairAok = true
				setCanonical(result, prefix+"H1 "+normalizedLine, hcp.Win1)
				setCanonical(result, prefix+"H2 "+invertedLine, invertedHcp.Win2)
			} else {
				log.Printf("[HCP_PAIR_REJECT] A: H1 %s=%.3f + H2 %s=%.3f margin=%.4f sport=%s",
					normalizedLine, hcp.Win1.Value, invertedLine, invertedHcp.Win2.Value, mA, sportName)
			}
		}

		// Pair B: Win1@[invertedLine] (H1 invertedLine) + Win2@[line] (H2 normalizedLine)
		// From another PS3838 spread entry (hdp=normalizedLine_float)
		pairBok := false
		if hasInverted && invertedHcp.Win1.Value > 0 && hcp.Win2.Value > 0 {
			mB := 1.0/invertedHcp.Win1.Value + 1.0/hcp.Win2.Value
			if mB >= 1.0 && mB <= 1.15 {
				pairBok = true
				setCanonical(result, prefix+"H1 "+invertedLine, invertedHcp.Win1)
				setCanonical(result, prefix+"H2 "+normalizedLine, hcp.Win2)
			} else {
				log.Printf("[HCP_PAIR_REJECT] B: H1 %s=%.3f + H2 %s=%.3f margin=%.4f sport=%s",
					invertedLine, invertedHcp.Win1.Value, normalizedLine, hcp.Win2.Value, mB, sportName)
			}
		}

		// Fallback: distinguish one-sided (complement absent) vs rejected (bad margin)
		if !pairAok && !pairBok {
			if !hasInverted {
				// True one-sided line — no complement exists, set what we have.
				// calculateMARGIN won't find complement → returns default 1.10
				if hcp.Win1.Value > 0 {
					setCanonical(result, prefix+"H1 "+normalizedLine, hcp.Win1)
				}
				if hcp.Win2.Value > 0 {
					setCanonical(result, prefix+"H2 "+normalizedLine, hcp.Win2)
				}
			} else {
				// Both complement pairs exist but margin is invalid — SKIP entirely.
				// Setting both sides would let calculateMARGIN compute the same bad margin.
				log.Printf("[HCP_SKIP] Skipping bad-margin pair: %s / %s sport=%s",
					normalizedLine, invertedLine, sportName)
			}
		}

		hcpProcessed[normalizedLine] = true
		if hasInverted {
			hcpProcessed[invertedLine] = true
		}
	}

	// Double Chance → canonical H +0.5 only when the score context is safe.
	// A live soccer spread can arrive in remaining-time form; at a non-level
	// score it must not be treated as the absolute/full-match DC equivalent.
	if period.DoubleChance != nil {
		if period.DoubleChance.W1X.Value > 0 {
			key := prefix + "DC 1X"
			if allowScoreSensitiveEquivalence {
				key = prefix + "H1 0.5"
			}
			updateIfBetter(result, key, period.DoubleChance.W1X, prefix+"DC 1X")
		}
		if period.DoubleChance.WX2.Value > 0 {
			key := prefix + "DC X2"
			if allowScoreSensitiveEquivalence {
				key = prefix + "H2 0.5"
			}
			updateIfBetter(result, key, period.DoubleChance.WX2, prefix+"DC X2")
		}
		// DC 12 stays as DC 12 (no equivalent)
		if period.DoubleChance.W12.Value > 0 {
			updateIfBetter(result, prefix+"DC 12", period.DoubleChance.W12, prefix+"DC 12")
		}
	}

	// Draw No Bet → canonical H 0 only when the score context is safe.
	// Some live browser feeds expose Asian handicaps for the remaining game,
	// while DNB settles on the final score including goals already scored. At a
	// non-level Soccer score those are not equivalent, so retain native DNB keys.
	if period.DrawNoBet != nil {
		homeKey := prefix + "H1 0"
		awayKey := prefix + "H2 0"
		if !allowScoreSensitiveEquivalence {
			homeKey = prefix + "DNB 1"
			awayKey = prefix + "DNB 2"
		}
		if period.DrawNoBet.Home.Value > 0 {
			updateIfBetter(result, homeKey, period.DrawNoBet.Home, prefix+"DNB 1")
		}
		if period.DrawNoBet.Away.Value > 0 {
			updateIfBetter(result, awayKey, period.DrawNoBet.Away, prefix+"DNB 2")
		}
	}

	// Correct Score: normalize to "X:Y" format for cross-bookmaker matching
	// ⚠️ KNOWN ISSUE: Women/U21 matches on Pinnacle produce expanded CS grids (up to 49 outcomes)
	// that cause false high-ROI pairs (up to 89%). Root cause NOT yet confirmed — possibly
	// parse_correct_score() merges multiple specials ("1H CS", "FT CS") into one dict,
	// or Pinnacle genuinely sends a larger grid for these leagues.
	// DO NOT add margin-based filtering here — sum(1/odds) is NOT a valid margin calculation
	// when the CS market has no "Any Other" outcome. Investigate the parser side first:
	// specials_parser.py:parse_correct_score() and how it's called per-period.
	if period.CorrectScore != nil {
		for key, odd := range period.CorrectScore {
			normKey := normalizeCSKey(key)
			if csHasHighScore(normKey) {
				continue
			}
			if normKey == "0:0" {
				canonKey := prefix + "T< 0.5"
				updateIfBetter(result, canonKey, *odd, prefix+"CS "+normKey)
			} else {
				setCanonical(result, prefix+"CS "+normKey, *odd)
			}
		}
	}

	// Totals
	for line, total := range period.Totals {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"T> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			key := prefix + "T< " + normalizedLine
			setCanonical(result, key, total.WinLess)
		}
	}

	// Either Team To Score → canonical T 0.5
	if period.EitherTeamToScore != nil {
		if period.EitherTeamToScore.Yes.Value > 0 {
			key := prefix + "T> 0.5"
			updateIfBetter(result, key, period.EitherTeamToScore.Yes, prefix+"ETS Yes")
		}
		if period.EitherTeamToScore.No.Value > 0 {
			key := prefix + "T< 0.5"
			updateIfBetter(result, key, period.EitherTeamToScore.No, prefix+"ETS No")
		}
	}

	// Team totals — PS3838 stores them in dedicated fields [3]/[4], separate from
	// match totals [1]. No overlap guard needed; data is structurally unambiguous.
	// Both FTT and STT must be present (prevents single-sided ambiguity).
	//
	// IT lines from ALL sources (PS3838, Sansabet) are ABSOLUTE (total goals
	// for the team in the match, including already scored). Proven by raw API
	// comparison: at score 3-0, both Pinnacle and Sansabet show FTT line=3.5
	// with similar odds (~1.5). No score adjustment needed.
	if len(period.FirstTeamTotals) > 0 && len(period.SecondTeamTotals) > 0 {
		for line, total := range period.FirstTeamTotals {
			lineF, err := strconv.ParseFloat(normalizeTotal(line), 64)
			if err != nil {
				continue
			}
			normalizedLine := formatLine(lineF)
			if total.WinMore.Value > 0 {
				setCanonical(result, prefix+"IT1> "+normalizedLine, total.WinMore)
			}
			if total.WinLess.Value > 0 {
				setCanonical(result, prefix+"IT1< "+normalizedLine, total.WinLess)
			}
		}

		for line, total := range period.SecondTeamTotals {
			lineF, err := strconv.ParseFloat(normalizeTotal(line), 64)
			if err != nil {
				continue
			}
			normalizedLine := formatLine(lineF)
			if total.WinMore.Value > 0 {
				setCanonical(result, prefix+"IT2> "+normalizedLine, total.WinMore)
			}
			if total.WinLess.Value > 0 {
				setCanonical(result, prefix+"IT2< "+normalizedLine, total.WinLess)
			}
		}
	}

	// Home Team To Score → canonical IT1 0.5 (exact mathematical identity)
	// HTS Yes = "home scores ≥1 goal" ≡ IT1> 0.5; HTS No = "home scores 0" ≡ IT1< 0.5
	// updateIfBetter picks best price from HTS and FirstTeamTotals 0.5
	if period.HomeTeamToScore != nil {
		if period.HomeTeamToScore.Yes.Value > 0 {
			updateIfBetter(result, prefix+"IT1> 0.5", period.HomeTeamToScore.Yes, prefix+"HTS Yes")
		}
		if period.HomeTeamToScore.No.Value > 0 {
			updateIfBetter(result, prefix+"IT1< 0.5", period.HomeTeamToScore.No, prefix+"HTS No")
		}
	}

	// Away Team To Score → canonical IT2 0.5 (exact mathematical identity)
	if period.AwayTeamToScore != nil {
		if period.AwayTeamToScore.Yes.Value > 0 {
			updateIfBetter(result, prefix+"IT2> 0.5", period.AwayTeamToScore.Yes, prefix+"ATS Yes")
		}
		if period.AwayTeamToScore.No.Value > 0 {
			updateIfBetter(result, prefix+"IT2< 0.5", period.AwayTeamToScore.No, prefix+"ATS No")
		}
	}

	// First Team To Score
	if period.FirstTeamToScore != nil {
		if period.FirstTeamToScore.Home.Value > 0 {
			setCanonical(result, prefix+"FTS Home", period.FirstTeamToScore.Home)
		}
		if period.FirstTeamToScore.Away.Value > 0 {
			setCanonical(result, prefix+"FTS Away", period.FirstTeamToScore.Away)
		}
		if period.FirstTeamToScore.Neither.Value > 0 {
			// FTS Neither → canonical T< 0.5
			key := prefix + "T< 0.5"
			updateIfBetter(result, key, period.FirstTeamToScore.Neither, prefix+"FTS Neither")
		}
	}

	// Winning Margin
	if period.WinningMargin != nil {
		for key, odd := range period.WinningMargin {
			keyLower := strings.ToLower(key)
			if strings.Contains(keyLower, "no goal") || key == "0" {
				// No Goal → canonical T< 0.5
				canonKey := prefix + "T< 0.5"
				updateIfBetter(result, canonKey, *odd, prefix+"WM "+key)
			} else if strings.Contains(key, "+") {
				// "Home By 2+" → H1 -1.5
				hcpKey := convertWMPlusToHandicap(key, prefix)
				if hcpKey != "" {
					updateIfBetter(result, hcpKey, *odd, prefix+"WM "+key)
				}
			} else if strings.EqualFold(key, "Tie") {
				// WM Range "Tie" = all draws ≡ X
				updateIfBetter(result, prefix+"X", *odd, prefix+"WM "+key)
			} else {
				// Other margins stay as is (incl. "Draw (NOT 0-0)" which excludes 0-0)
				setCanonical(result, prefix+"WM "+key, *odd)
			}
		}
	}

	// 3-Way Handicap → canonical Asian Handicap (Home/Away only, Draw has no AH equivalent)
	// 3WH line L Home ≡ H1 (L-0.5): home+L > away ↔ H1 half-line win (integer goals)
	// 3WH line L Away ≡ H2 (-L-0.5): home+L < away ↔ H2 half-line win
	// 3WH has push on exact margin (bonus for bettor), AH half-line doesn't — conservative mapping
	if period.ThreeWayHandicap != nil {
		for line, twh := range period.ThreeWayHandicap {
			normLine := normalize3WHLine(line)
			if twh.Home.Value > 0 {
				setCanonical(result, prefix+"3WH "+normLine+" 1", twh.Home)
			}
			if twh.Away.Value > 0 {
				setCanonical(result, prefix+"3WH "+normLine+" 2", twh.Away)
			}

			lineVal, err := strconv.ParseFloat(normLine, 64)
			if err == nil && allowScoreSensitiveEquivalence {
				if twh.Home.Value > 0 {
					ahLine := formatLine(lineVal - 0.5)
					updateIfBetter(result, prefix+"H1 "+ahLine, twh.Home, prefix+"3WH "+normLine+" 1")
				}
				if twh.Away.Value > 0 {
					ahLine := formatLine(-lineVal - 0.5)
					updateIfBetter(result, prefix+"H2 "+ahLine, twh.Away, prefix+"3WH "+normLine+" 2")
				}
			}
			if twh.Draw.Value > 0 {
				setCanonical(result, prefix+"3WH "+normLine+" X", twh.Draw)
			}
		}
	}

	// BTTS (no equivalent - keep as is)
	if period.BTTS != nil {
		if period.BTTS.Yes.Value > 0 {
			setCanonical(result, prefix+"BTTS Yes", period.BTTS.Yes)
		}
		if period.BTTS.No.Value > 0 {
			setCanonical(result, prefix+"BTTS No", period.BTTS.No)
		}
	}

	// OddEven (no equivalent - keep as is)
	if period.OddEven != nil {
		if period.OddEven.Yes.Value > 0 {
			setCanonical(result, prefix+"OE Odd", period.OddEven.Yes)
		}
		if period.OddEven.No.Value > 0 {
			setCanonical(result, prefix+"OE Even", period.OddEven.No)
		}
	}

	// Home/Away OddEven (no equivalent)
	if period.HomeOddEven != nil {
		if period.HomeOddEven.Yes.Value > 0 {
			setCanonical(result, prefix+"HOE Odd", period.HomeOddEven.Yes)
		}
		if period.HomeOddEven.No.Value > 0 {
			setCanonical(result, prefix+"HOE Even", period.HomeOddEven.No)
		}
	}
	if period.AwayOddEven != nil {
		if period.AwayOddEven.Yes.Value > 0 {
			setCanonical(result, prefix+"AOE Odd", period.AwayOddEven.Yes)
		}
		if period.AwayOddEven.No.Value > 0 {
			setCanonical(result, prefix+"AOE Even", period.AwayOddEven.No)
		}
	}

	// Sets (Tennis)
	for line, total := range period.SetsTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"Sets T> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"Sets T< "+normalizedLine, total.WinLess)
		}
	}
	validateHandicapPairs(result, period.SetsHandicap, prefix+"Sets H1 ", prefix+"Sets H2 ", sportName, "SETS_HCP")

	// Corners
	for line, total := range period.CornersTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"CT> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"CT< "+normalizedLine, total.WinLess)
		}
	}
	validateHandicapPairs(result, period.CornersHandicap, prefix+"CH1 ", prefix+"CH2 ", sportName, "CORNERS_HCP")
	for line, total := range period.CornersFirstTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"CIT1> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"CIT1< "+normalizedLine, total.WinLess)
		}
	}
	for line, total := range period.CornersSecondTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"CIT2> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"CIT2< "+normalizedLine, total.WinLess)
		}
	}

	// Bookings
	for line, total := range period.BookingsTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"BkT> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"BkT< "+normalizedLine, total.WinLess)
		}
	}
	validateHandicapPairs(result, period.BookingsHandicap, prefix+"BkH1 ", prefix+"BkH2 ", sportName, "BOOKINGS_HCP")
	for line, total := range period.BookingsFirstTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"BkIT1> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"BkIT1< "+normalizedLine, total.WinLess)
		}
	}
	for line, total := range period.BookingsSecondTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			setCanonical(result, prefix+"BkIT2> "+normalizedLine, total.WinMore)
		}
		if total.WinLess.Value > 0 {
			setCanonical(result, prefix+"BkIT2< "+normalizedLine, total.WinLess)
		}
	}

	// Games (Tennis)
	for line, game := range period.Games {
		normalizedLine := normalizeTotal(line)
		if game.Win1.Value > 0 {
			setCanonical(result, prefix+"1G "+normalizedLine, game.Win1)
		}
		if game.Win2.Value > 0 {
			setCanonical(result, prefix+"2G "+normalizedLine, game.Win2)
		}
	}

	// Combos and other markets (no equivalents - keep as is)
	for key, odd := range period.WinnerTotalCombo {
		if odd.Value > 0 {
			setCanonical(result, prefix+"WTC "+key, *odd)
		}
	}
	for key, odd := range period.BTTSWinnerCombo {
		if odd.Value > 0 {
			setCanonical(result, prefix+"BWC "+key, *odd)
		}
	}
	for key, odd := range period.BTTSTotalCombo {
		if odd.Value > 0 {
			setCanonical(result, prefix+"BTC "+key, *odd)
		}
	}
	for key, odd := range period.OddEvenTotalCombo {
		if odd.Value > 0 {
			setCanonical(result, prefix+"OET "+key, *odd)
		}
	}
	for key, odd := range period.TotalGoalsRange {
		if odd.Value > 0 {
			normKey := normalizeTGRKey(key)
			keyLower := strings.ToLower(strings.TrimSpace(normKey))
			if strings.HasSuffix(keyLower, "+") {
				// "4+" → T> 3.5
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					updateIfBetter(result, prefix+"T> "+line, *odd, prefix+"TGR "+normKey)
				}
			} else if strings.HasPrefix(keyLower, "0-") {
				// "0-2" → T< 2.5
				parts := strings.SplitN(keyLower, "-", 2)
				if len(parts) == 2 {
					numStr := strings.TrimSpace(parts[1])
					if n, err := strconv.ParseFloat(numStr, 64); err == nil && n > 0 {
						line := formatLine(n + 0.5)
						updateIfBetter(result, prefix+"T< "+line, *odd, prefix+"TGR "+normKey)
					}
				}
			}
			// Always keep as TGR too (normalized)
			setCanonical(result, prefix+"TGR "+normKey, *odd)
		}
	}
	for key, odd := range period.ExactTotalGoals {
		if odd.Value > 0 {
			keyLower := strings.ToLower(strings.TrimSpace(key))
			if keyLower == "0" {
				// "0" → T< 0.5
				updateIfBetter(result, prefix+"T< 0.5", *odd, prefix+"ETG 0")
			} else if strings.HasSuffix(keyLower, "+") {
				// "4+" → T> 3.5
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					updateIfBetter(result, prefix+"T> "+line, *odd, prefix+"ETG "+key)
				}
			}
			// Always keep as ETG too
			setCanonical(result, prefix+"ETG "+key, *odd)
		}
	}
	for key, odd := range period.HomeExactGoals {
		if odd.Value > 0 {
			keyLower := strings.ToLower(strings.TrimSpace(key))
			if keyLower == "0" {
				updateIfBetter(result, prefix+"IT1< 0.5", *odd, prefix+"HEG 0")
			} else if strings.HasSuffix(keyLower, "+") {
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					updateIfBetter(result, prefix+"IT1> "+line, *odd, prefix+"HEG "+key)
				}
			}
			setCanonical(result, prefix+"HEG "+key, *odd)
		}
	}
	for key, odd := range period.AwayExactGoals {
		if odd.Value > 0 {
			keyLower := strings.ToLower(strings.TrimSpace(key))
			if keyLower == "0" {
				updateIfBetter(result, prefix+"IT2< 0.5", *odd, prefix+"AEG 0")
			} else if strings.HasSuffix(keyLower, "+") {
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					updateIfBetter(result, prefix+"IT2> "+line, *odd, prefix+"AEG "+key)
				}
			}
			setCanonical(result, prefix+"AEG "+key, *odd)
		}
	}
	for key, odd := range period.HalfTimeFullTime {
		if odd.Value > 0 {
			setCanonical(result, prefix+"HT/FT "+key, *odd)
		}
	}

	// Method Of Victory
	for key, odd := range period.MethodOfVictory {
		if odd.Value > 0 {
			setCanonical(result, prefix+"MOV "+key, *odd)
		}
	}

	// Home/Away Win To Nil
	if period.HomeWinToNil != nil {
		if period.HomeWinToNil.Yes.Value > 0 {
			setCanonical(result, prefix+"HWN Yes", period.HomeWinToNil.Yes)
		}
		if period.HomeWinToNil.No.Value > 0 {
			setCanonical(result, prefix+"HWN No", period.HomeWinToNil.No)
		}
	}
	if period.AwayWinToNil != nil {
		if period.AwayWinToNil.Yes.Value > 0 {
			setCanonical(result, prefix+"AWN Yes", period.AwayWinToNil.Yes)
		}
		if period.AwayWinToNil.No.Value > 0 {
			setCanonical(result, prefix+"AWN No", period.AwayWinToNil.No)
		}
	}

	// To Qualify
	if period.ToQualify != nil {
		if period.ToQualify.Home.Value > 0 {
			setCanonical(result, prefix+"TQ Home", period.ToQualify.Home)
		}
		if period.ToQualify.Away.Value > 0 {
			setCanonical(result, prefix+"TQ Away", period.ToQualify.Away)
		}
	}

	// HomeWinMap / AwayWinMap (ESports: "Will Team Win At Least One Map?")
	// Home wins at least 1 map (Yes) ≡ H1 +1.5 maps, (No) ≡ H2 -1.5
	if period.HomeWinMap != nil {
		if period.HomeWinMap.Yes.Value > 0 {
			updateIfBetter(result, prefix+"H1 1.5", period.HomeWinMap.Yes, prefix+"H1 1.5")
		}
		if period.HomeWinMap.No.Value > 0 {
			updateIfBetter(result, prefix+"H2 -1.5", period.HomeWinMap.No, prefix+"H2 -1.5")
		}
	}
	if period.AwayWinMap != nil {
		if period.AwayWinMap.Yes.Value > 0 {
			updateIfBetter(result, prefix+"H2 1.5", period.AwayWinMap.Yes, prefix+"H2 1.5")
		}
		if period.AwayWinMap.No.Value > 0 {
			updateIfBetter(result, prefix+"H1 -1.5", period.AwayWinMap.No, prefix+"H1 -1.5")
		}
	}

	// Player Props
	for _, prop := range period.PlayerProps {
		normName := normalizePlayerPropName(prop.PlayerName)
		if prop.Over.Value > 0 {
			key := fmt.Sprintf("%sPP %s %s> %s", prefix, normName, prop.Market, formatLine(prop.Line))
			setCanonical(result, key, prop.Over)
		}
		if prop.Under.Value > 0 {
			key := fmt.Sprintf("%sPP %s %s< %s", prefix, normName, prop.Market, formatLine(prop.Line))
			setCanonical(result, key, prop.Under)
		}
	}

	// ALWAYS set StdOdd from 1X2 for canonical Win/Draw/Lose keys.
	// Problem: "H1 -0.5" and "H2 -0.5" get StdOdd from the 2-way handicap market
	// via setCanonical above. But the handicap Win2 at line -0.5 is the away+0.5
	// price (draw-or-win), NOT the Win2 (away-wins) price. When calculateMARGINv2
	// mixes these 2-way StdOdds with the 3-way 1X2 draw price for margin of "X",
	// the result is inconsistent and can be < 1.0.
	// Fix: unconditionally override StdOdd with 1X2 prices so that all 1X2 margin
	// calculations use prices from the same 3-way market.
	win1Key := prefix + "H1 -0.5"
	win2Key := prefix + "H2 -0.5"
	if !hasDraw && twoWayIsH0 {
		win1Key = prefix + "H1 0"
		win2Key = prefix + "H2 0"
	}
	if period.Win1x2.Win1.Value > 0 {
		if e, ok := result[win1Key]; ok {
			e.StdOdd = period.Win1x2.Win1
			result[win1Key] = e
		}
	}
	if period.Win1x2.Win2.Value > 0 {
		if e, ok := result[win2Key]; ok {
			e.StdOdd = period.Win1x2.Win2
			result[win2Key] = e
		}
	}
	if hasDraw && period.Win1x2.WinNone.Value > 0 {
		if e, ok := result[prefix+"X"]; ok {
			e.StdOdd = period.Win1x2.WinNone
			result[prefix+"X"] = e
		}
	}

	return result
}

// updateIfBetter updates result map only if new value is better and tracks source provenance
func updateIfBetter(result map[string]PinnacleCanonical, key string, odd entity.Odd, source string) {
	existing, ok := result[key]
	if !ok {
		// Pre-allocate Sources with capacity 8 to avoid reallocs for typical 3-7 equivalent markets
		src := make([]string, 0, 8)
		src = append(src, source)
		entry := PinnacleCanonical{
			Odd:        odd,
			Sources:    src,
			BestSource: source,
		}
		// Track standard line price (when source == canonical key)
		if source == key {
			entry.StdOdd = odd
		}
		result[key] = entry
		return
	}

	existing.Sources = appendUnique(existing.Sources, source)
	if odd.Value > existing.Odd.Value {
		existing.Odd = odd
		existing.BestSource = source
	}
	// Track standard line price
	if source == key && (existing.StdOdd.Value == 0 || odd.Value > existing.StdOdd.Value) {
		existing.StdOdd = odd
	}
	result[key] = existing
}

// setCanonical sets canonical market with same source key
func setCanonical(result map[string]PinnacleCanonical, key string, odd entity.Odd) {
	updateIfBetter(result, key, odd, key)
}

// findHandicapComplement returns a deterministic complementary handicap row.
// Distinct raw keys are preferred because spellings such as "-0.0" and "0.0"
// represent opposite sides of the same line even though both normalize to "0".
// A same-row fallback is allowed only when that row contains both prices.
func findHandicapComplement(
	handicapMap map[string]*entity.WinHandicap,
	currentKey string,
	current *entity.WinHandicap,
	invertedLine string,
) (*entity.WinHandicap, bool) {
	var best *entity.WinHandicap
	bestKey := ""
	bestValidPairs := -1
	bestAttemptablePairs := -1
	bestRelevantValue := -1.0

	for candidateKey, candidate := range handicapMap {
		if candidateKey == currentKey || candidate == nil || normalizeTotal(candidateKey) != invertedLine {
			continue
		}

		validPairs := 0
		attemptablePairs := 0
		relevantValue := 0.0
		if current != nil && current.Win1.Value > 0 && candidate.Win2.Value > 0 {
			attemptablePairs++
			relevantValue += candidate.Win2.Value
			margin := 1.0/current.Win1.Value + 1.0/candidate.Win2.Value
			if margin >= 1.0 && margin <= 1.15 {
				validPairs++
			}
		}
		if current != nil && candidate.Win1.Value > 0 && current.Win2.Value > 0 {
			attemptablePairs++
			relevantValue += candidate.Win1.Value
			margin := 1.0/candidate.Win1.Value + 1.0/current.Win2.Value
			if margin >= 1.0 && margin <= 1.15 {
				validPairs++
			}
		}

		if best == nil ||
			validPairs > bestValidPairs ||
			(validPairs == bestValidPairs && attemptablePairs > bestAttemptablePairs) ||
			(validPairs == bestValidPairs && attemptablePairs == bestAttemptablePairs && relevantValue > bestRelevantValue) ||
			(validPairs == bestValidPairs && attemptablePairs == bestAttemptablePairs && relevantValue == bestRelevantValue && candidateKey < bestKey) {
			best = candidate
			bestKey = candidateKey
			bestValidPairs = validPairs
			bestAttemptablePairs = attemptablePairs
			bestRelevantValue = relevantValue
		}
	}

	if best != nil {
		return best, true
	}
	if current != nil && normalizeTotal(currentKey) == invertedLine && current.Win1.Value > 0 && current.Win2.Value > 0 {
		return current, true
	}
	return nil, false
}

// validateHandicapPairs validates and stores handicap pairs with margin check.
// Reusable for SetsHandicap, CornersHandicap, BookingsHandicap which share the
// same Win1/Win2 pairing logic as regular Handicap.
func validateHandicapPairs(
	result map[string]PinnacleCanonical,
	handicapMap map[string]*entity.WinHandicap,
	h1Prefix, h2Prefix string,
	sportName string,
	logTag string,
) {
	processed := make(map[string]bool, len(handicapMap))
	for line, hcp := range handicapMap {
		if hcp == nil || (hcp.Win1.Value <= 0 && hcp.Win2.Value <= 0) {
			continue
		}
		normalizedLine := normalizeTotal(line)
		if processed[normalizedLine] {
			continue
		}
		invertedLine := invertHandicapLine(normalizedLine)

		invertedHcp, hasInverted := findHandicapComplement(
			handicapMap, line, hcp, invertedLine,
		)

		if !hasInverted {
			// One-sided line: no complement exists.
			// calculateMARGIN won't find complement → returns default 1.10
			if hcp.Win1.Value > 0 {
				setCanonical(result, h1Prefix+normalizedLine, hcp.Win1)
			}
			if hcp.Win2.Value > 0 {
				setCanonical(result, h2Prefix+normalizedLine, hcp.Win2)
			}
		} else {
			// Pair A: Win1@[line] + Win2@[invertedLine]
			pairAok := false
			if hcp.Win1.Value > 0 && invertedHcp.Win2.Value > 0 {
				mA := 1.0/hcp.Win1.Value + 1.0/invertedHcp.Win2.Value
				if mA >= 1.0 && mA <= 1.15 {
					pairAok = true
					setCanonical(result, h1Prefix+normalizedLine, hcp.Win1)
					setCanonical(result, h2Prefix+invertedLine, invertedHcp.Win2)
				} else {
					log.Printf("[%s_PAIR_REJECT] A: %s%s=%.3f + %s%s=%.3f margin=%.4f sport=%s",
						logTag, h1Prefix, normalizedLine, hcp.Win1.Value, h2Prefix, invertedLine, invertedHcp.Win2.Value, mA, sportName)
				}
			}

			// Pair B: Win1@[invertedLine] + Win2@[line]
			pairBok := false
			if invertedHcp.Win1.Value > 0 && hcp.Win2.Value > 0 {
				mB := 1.0/invertedHcp.Win1.Value + 1.0/hcp.Win2.Value
				if mB >= 1.0 && mB <= 1.15 {
					pairBok = true
					setCanonical(result, h1Prefix+invertedLine, invertedHcp.Win1)
					setCanonical(result, h2Prefix+normalizedLine, hcp.Win2)
				} else {
					log.Printf("[%s_PAIR_REJECT] B: %s%s=%.3f + %s%s=%.3f margin=%.4f sport=%s",
						logTag, h1Prefix, invertedLine, invertedHcp.Win1.Value, h2Prefix, normalizedLine, hcp.Win2.Value, mB, sportName)
				}
			}

			if !pairAok && !pairBok {
				log.Printf("[%s_SKIP] Skipping bad-margin pair: %s / %s sport=%s",
					logTag, normalizedLine, invertedLine, sportName)
			}
		}

		processed[normalizedLine] = true
		if hasInverted {
			processed[invertedLine] = true
		}
	}
}

// normalizeCSKey converts Pinnacle's "TeamA X, TeamB Y" format to "X:Y".
// If already in "X:Y" or "X-Y" format, returns as-is (replacing "-" with ":").
func normalizeCSKey(key string) string {
	// Already in compact format
	if len(key) <= 5 {
		return strings.ReplaceAll(key, "-", ":")
	}
	parts := strings.Split(key, ", ")
	if len(parts) != 2 {
		return strings.ReplaceAll(key, "-", ":")
	}
	tokens1 := strings.Fields(parts[0])
	tokens2 := strings.Fields(parts[1])
	if len(tokens1) == 0 || len(tokens2) == 0 {
		return key
	}
	s1 := tokens1[len(tokens1)-1]
	s2 := tokens2[len(tokens2)-1]
	if _, err := strconv.Atoi(s1); err != nil {
		return key
	}
	if _, err := strconv.Atoi(s2); err != nil {
		return key
	}
	return s1 + ":" + s2
}

// csHasHighScore returns true if any digit in "X:Y" is >= 6.
// Such outcomes come from expanded CS grids (Women/U21) with unreliable pricing.
func csHasHighScore(normKey string) bool {
	parts := strings.Split(normKey, ":")
	if len(parts) != 2 {
		return false
	}
	for _, p := range parts {
		n, err := strconv.Atoi(p)
		if err == nil && n >= 6 {
			return true
		}
	}
	return false
}

// normalizeTGRKey strips spaces around dashes: "0 - 1" → "0-1", "2 - 3" → "2-3"
func normalizeTGRKey(key string) string {
	return strings.ReplaceAll(strings.ReplaceAll(key, " - ", "-"), " -", "-")
}

// normalize3WHLine ensures positive handicap lines have "+" prefix: "1" → "+1", "-1" stays "-1"
func normalize3WHLine(line string) string {
	if line == "" {
		return line
	}
	if line[0] != '+' && line[0] != '-' {
		return "+" + line
	}
	return line
}

func appendUnique(list []string, value string) []string {
	for _, v := range list {
		if v == value {
			return list
		}
	}
	return append(list, value)
}

// convertWMPlusToHandicap converts "Home By 2+" to "H1 -1.5"
func convertWMPlusToHandicap(wmKey string, prefix string) string {
	wmKey = strings.ToLower(wmKey)

	// Extract number from "by N+"
	var n int
	if idx := strings.Index(wmKey, "by"); idx >= 0 {
		part := wmKey[idx+2:]
		part = strings.TrimSpace(part)
		part = strings.TrimSuffix(part, "+")
		part = strings.TrimSpace(part)
		n, _ = strconv.Atoi(part)
	}

	if n <= 0 {
		return ""
	}

	// "By N+" means win by N or more = H -(N-0.5)
	line := formatLine(-(float64(n) - 0.5))

	// Determine team
	if strings.Contains(wmKey, "home") || strings.HasPrefix(wmKey, "1 ") {
		return prefix + "H1 " + line
	} else if strings.Contains(wmKey, "away") || strings.HasPrefix(wmKey, "2 ") {
		return prefix + "H2 " + line
	}

	return ""
}

// reverseCanonicalMap builds reverse lookup: market -> canonical key
var reverseCanonicalMap map[string]string

func init() {
	reverseCanonicalMap = make(map[string]string)
	for canonical, markets := range equivalentMarkets {
		for _, market := range markets {
			reverseCanonicalMap[market] = canonical
		}
	}
}

// getCanonicalKey returns canonical key for a market
// If market is in equivalents group, returns canonical key
// Otherwise returns the market itself
func getCanonicalKey(market string) string {
	if canonical, ok := reverseCanonicalMap[market]; ok {
		return canonical
	}
	return market
}

// extractAllDonorMarkets extracts ALL markets from donor period with their canonical keys
// This allows comparing EACH donor market against Pinnacle's best equivalent
func extractAllDonorMarkets(period entity.PeriodData, periodIdx int, homeScore, awayScore int, sportName string) []DonorMarketWithCanonical {
	// Pre-allocate with generous capacity to avoid repeated reallocs across 88+ appends.
	// Typical market count: 10-30 base + 2×len(Handicap) + 2×len(Totals) + 2×len(PlayerProps).
	// 200 covers even the largest prematch events with many lines.
	cap := 200 + 2*len(period.Handicap) + 2*len(period.Totals) + 2*len(period.FirstTeamTotals) +
		2*len(period.SecondTeamTotals) + 2*len(period.PlayerProps)
	markets := make([]DonorMarketWithCanonical, 0, cap)
	prefix := ""
	if periodIdx > 0 {
		prefix = fmt.Sprintf("P%d ", periodIdx)
	}
	allowScoreSensitiveEquivalence := canUseScoreSensitiveEquivalence(periodIdx, homeScore, awayScore, sportName)

	// Win1x2 — settles on FINAL match result (absolute convention at any score)
	hasDraw := period.Win1x2.WinNone.Value > 0
	twoWayIsH0 := sportName == "Handball" ||
		(periodIdx > 0 && sportName != "Tennis" && sportName != "ESports" &&
			sportName != "TableTennis" && sportName != "Volleyball")

	// Tennis/TT: moneyline ≠ game/point handicap (different units)
	gameBasedHcpSport := sportName == "Tennis" || sportName == "TableTennis"

	if period.Win1x2.Win1.Value > 0 {
		origKey := prefix + "1"
		canon := prefix + "H1 -0.5"
		if !hasDraw && twoWayIsH0 {
			canon = prefix + "H1 0"
		} else if gameBasedHcpSport {
			canon = prefix + "ML 1"
		}
		markets = append(markets, DonorMarketWithCanonical{
			Odd:          period.Win1x2.Win1,
			OriginalKey:  origKey,
			CanonicalKey: canon,
		})
	}
	if period.Win1x2.WinNone.Value > 0 {
		markets = append(markets, DonorMarketWithCanonical{
			Odd:          period.Win1x2.WinNone,
			OriginalKey:  prefix + "X",
			CanonicalKey: prefix + "X", // No equivalent
		})
	}
	if period.Win1x2.Win2.Value > 0 {
		origKey := prefix + "2"
		canon := prefix + "H2 -0.5"
		if !hasDraw && twoWayIsH0 {
			canon = prefix + "H2 0"
		} else if gameBasedHcpSport {
			canon = prefix + "ML 2"
		}
		markets = append(markets, DonorMarketWithCanonical{
			Odd:          period.Win1x2.Win2,
			OriginalKey:  origKey,
			CanonicalKey: canon,
		})
	}

	// Handicaps
	// Accept both complete two-way and one-sided lines (tennis always one-sided).
	// No-draw set/map sports (ESports/Volleyball): Hdp 0 ≡ moneyline (H -0.5).
	// Tennis/TT: Hdp 0 is game/point handicap, NOT moneyline — keep as H1 0 / H2 0.
	noDrawSport := sportName == "ESports" || sportName == "Tennis" || sportName == "TableTennis" || sportName == "Volleyball"
	for line, hcp := range period.Handicap {
		normalizedLine := normalizeTotal(line)

		if normalizedLine == "0" && noDrawSport {
			if gameBasedHcpSport {
				// Tennis/TT: Hdp 0 is game/point handicap, NOT moneyline
				if hcp.Win1.Value > 0 {
					markets = append(markets, DonorMarketWithCanonical{
						Odd:          hcp.Win1,
						OriginalKey:  prefix + "H1 0",
						CanonicalKey: prefix + "H1 0",
					})
				}
				if hcp.Win2.Value > 0 {
					markets = append(markets, DonorMarketWithCanonical{
						Odd:          hcp.Win2,
						OriginalKey:  prefix + "H2 0",
						CanonicalKey: prefix + "H2 0",
					})
				}
			} else {
				// ESports/Volleyball: set/map handicap = moneyline = H -0.5
				if hcp.Win1.Value > 0 {
					markets = append(markets, DonorMarketWithCanonical{
						Odd:          hcp.Win1,
						OriginalKey:  prefix + "H1 0",
						CanonicalKey: prefix + "H1 -0.5",
					})
				}
				if hcp.Win2.Value > 0 {
					markets = append(markets, DonorMarketWithCanonical{
						Odd:          hcp.Win2,
						OriginalKey:  prefix + "H2 0",
						CanonicalKey: prefix + "H2 -0.5",
					})
				}
			}
			continue
		}
		if hcp.Win1.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          hcp.Win1,
				OriginalKey:  prefix + "H1 " + normalizedLine,
				CanonicalKey: prefix + "H1 " + normalizedLine,
			})
		}
		if hcp.Win2.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          hcp.Win2,
				OriginalKey:  prefix + "H2 " + normalizedLine,
				CanonicalKey: prefix + "H2 " + normalizedLine,
			})
		}
	}

	// Double Chance.  Keep the native DC key at unsafe live soccer scores so a
	// donor longshot cannot be compared with a remaining-time Pinnacle spread.
	if period.DoubleChance != nil {
		if period.DoubleChance.W1X.Value > 0 {
			canonicalKey := prefix + "DC 1X"
			if allowScoreSensitiveEquivalence {
				canonicalKey = prefix + "H1 0.5"
			}
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.DoubleChance.W1X,
				OriginalKey:  prefix + "DC 1X",
				CanonicalKey: canonicalKey,
			})
		}
		if period.DoubleChance.WX2.Value > 0 {
			canonicalKey := prefix + "DC X2"
			if allowScoreSensitiveEquivalence {
				canonicalKey = prefix + "H2 0.5"
			}
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.DoubleChance.WX2,
				OriginalKey:  prefix + "DC X2",
				CanonicalKey: canonicalKey,
			})
		}
		if period.DoubleChance.W12.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.DoubleChance.W12,
				OriginalKey:  prefix + "DC 12",
				CanonicalKey: prefix + "DC 12", // No equivalent
			})
		}
	}

	// Draw No Bet → H 0 only when the live score context is safe. Otherwise
	// preserve the native DNB key so it cannot match a remaining-game handicap.
	if period.DrawNoBet != nil {
		homeKey := prefix + "H1 0"
		awayKey := prefix + "H2 0"
		if !allowScoreSensitiveEquivalence {
			homeKey = prefix + "DNB 1"
			awayKey = prefix + "DNB 2"
		}
		if period.DrawNoBet.Home.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.DrawNoBet.Home,
				OriginalKey:  prefix + "DNB 1",
				CanonicalKey: homeKey,
			})
		}
		if period.DrawNoBet.Away.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.DrawNoBet.Away,
				OriginalKey:  prefix + "DNB 2",
				CanonicalKey: awayKey,
			})
		}
	}

	// Correct Score: normalize to "X:Y" format for cross-bookmaker matching
	if period.CorrectScore != nil {
		for key, odd := range period.CorrectScore {
			if odd.Value > 0 {
				normKey := normalizeCSKey(key)
				if csHasHighScore(normKey) {
					continue
				}
				originalKey := prefix + "CS " + normKey
				canonicalKey := originalKey
				if normKey == "0:0" {
					canonicalKey = prefix + "T< 0.5"
				}
				markets = append(markets, DonorMarketWithCanonical{
					Odd:          *odd,
					OriginalKey:  originalKey,
					CanonicalKey: canonicalKey,
				})
			}
		}
	}

	// Totals
	for line, total := range period.Totals {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "T> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          total.WinMore,
				OriginalKey:  key,
				CanonicalKey: key,
			})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "T< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          total.WinLess,
				OriginalKey:  key,
				CanonicalKey: key,
			})
		}
	}

	// Either Team To Score
	if period.EitherTeamToScore != nil {
		if period.EitherTeamToScore.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.EitherTeamToScore.Yes,
				OriginalKey:  prefix + "ETS Yes",
				CanonicalKey: prefix + "T> 0.5",
			})
		}
		if period.EitherTeamToScore.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.EitherTeamToScore.No,
				OriginalKey:  prefix + "ETS No",
				CanonicalKey: prefix + "T< 0.5",
			})
		}
	}

	// First/Second Team Totals — donor parsers (Sansabet etc.) provide IT from
	// separate API markets (market 14/15), no risk of match total contamination.
	// No per-line guard needed here; it's only kept in canonicalizePinnacleMarkets.
	donorFttClean := len(period.FirstTeamTotals) > 0
	donorSttClean := len(period.SecondTeamTotals) > 0

	if donorFttClean && donorSttClean {
		for line, total := range period.FirstTeamTotals {
			normalizedLine := normalizeTotal(line)
			if total.WinMore.Value > 0 {
				key := prefix + "IT1> " + normalizedLine
				markets = append(markets, DonorMarketWithCanonical{
					Odd:          total.WinMore,
					OriginalKey:  key,
					CanonicalKey: key,
				})
			}
			if total.WinLess.Value > 0 {
				key := prefix + "IT1< " + normalizedLine
				markets = append(markets, DonorMarketWithCanonical{
					Odd:          total.WinLess,
					OriginalKey:  key,
					CanonicalKey: key,
				})
			}
		}

		for line, total := range period.SecondTeamTotals {
			normalizedLine := normalizeTotal(line)
			if total.WinMore.Value > 0 {
				key := prefix + "IT2> " + normalizedLine
				markets = append(markets, DonorMarketWithCanonical{
					Odd:          total.WinMore,
					OriginalKey:  key,
					CanonicalKey: key,
				})
			}
			if total.WinLess.Value > 0 {
				key := prefix + "IT2< " + normalizedLine
				markets = append(markets, DonorMarketWithCanonical{
					Odd:          total.WinLess,
					OriginalKey:  key,
					CanonicalKey: key,
				})
			}
		}
	}

	// Home Team To Score → canonical IT1 0.5 (HTS Yes ≡ IT1> 0.5)
	if period.HomeTeamToScore != nil {
		if period.HomeTeamToScore.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.HomeTeamToScore.Yes,
				OriginalKey:  prefix + "HTS Yes",
				CanonicalKey: prefix + "IT1> 0.5",
			})
		}
		if period.HomeTeamToScore.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.HomeTeamToScore.No,
				OriginalKey:  prefix + "HTS No",
				CanonicalKey: prefix + "IT1< 0.5",
			})
		}
	}

	// Away Team To Score → canonical IT2 0.5 (ATS Yes ≡ IT2> 0.5)
	if period.AwayTeamToScore != nil {
		if period.AwayTeamToScore.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.AwayTeamToScore.Yes,
				OriginalKey:  prefix + "ATS Yes",
				CanonicalKey: prefix + "IT2> 0.5",
			})
		}
		if period.AwayTeamToScore.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.AwayTeamToScore.No,
				OriginalKey:  prefix + "ATS No",
				CanonicalKey: prefix + "IT2< 0.5",
			})
		}
	}

	// First Team To Score
	if period.FirstTeamToScore != nil {
		if period.FirstTeamToScore.Home.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.FirstTeamToScore.Home,
				OriginalKey:  prefix + "FTS Home",
				CanonicalKey: prefix + "FTS Home",
			})
		}
		if period.FirstTeamToScore.Away.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.FirstTeamToScore.Away,
				OriginalKey:  prefix + "FTS Away",
				CanonicalKey: prefix + "FTS Away",
			})
		}
		if period.FirstTeamToScore.Neither.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.FirstTeamToScore.Neither,
				OriginalKey:  prefix + "FTS Neither",
				CanonicalKey: prefix + "T< 0.5",
			})
		}
	}

	// Winning Margin
	if period.WinningMargin != nil {
		for key, odd := range period.WinningMargin {
			if odd.Value > 0 {
				keyLower := strings.ToLower(key)
				originalKey := prefix + "WM " + key
				canonicalKey := originalKey

				if strings.Contains(keyLower, "no goal") || key == "0" {
					canonicalKey = prefix + "T< 0.5"
				} else if strings.Contains(key, "+") {
					hcpKey := convertWMPlusToHandicap(key, prefix)
					if hcpKey != "" {
						canonicalKey = hcpKey
					}
				} else if strings.EqualFold(key, "Tie") {
					canonicalKey = prefix + "X"
				}

				markets = append(markets, DonorMarketWithCanonical{
					Odd:          *odd,
					OriginalKey:  originalKey,
					CanonicalKey: canonicalKey,
				})
			}
		}
	}

	// 3-Way Handicap → canonical Asian Handicap (Home/Away only)
	// 3WH L Home ≡ H1 (L-0.5), 3WH L Away ≡ H2 (-L-0.5), Draw stays as 3WH
	if period.ThreeWayHandicap != nil {
		for line, twh := range period.ThreeWayHandicap {
			normLine := normalize3WHLine(line)
			lineVal, err := strconv.ParseFloat(normLine, 64)
			if err != nil {
				// Can't parse — keep original 3WH keys
				if twh.Home.Value > 0 {
					markets = append(markets, DonorMarketWithCanonical{
						Odd:          twh.Home,
						OriginalKey:  prefix + "3WH " + normLine + " 1",
						CanonicalKey: prefix + "3WH " + normLine + " 1",
					})
				}
				if twh.Away.Value > 0 {
					markets = append(markets, DonorMarketWithCanonical{
						Odd:          twh.Away,
						OriginalKey:  prefix + "3WH " + normLine + " 2",
						CanonicalKey: prefix + "3WH " + normLine + " 2",
					})
				}
			} else {
				if twh.Home.Value > 0 {
					ahLine := formatLine(lineVal - 0.5)
					dm := DonorMarketWithCanonical{
						Odd:          twh.Home,
						OriginalKey:  prefix + "3WH " + normLine + " 1",
						CanonicalKey: prefix + "3WH " + normLine + " 1",
					}
					if allowScoreSensitiveEquivalence {
						dm.FallbackCanonicalKey = prefix + "H1 " + ahLine
						dm.RequireStdPinnacleOdds = true
						dm.PreferredPinnacleKey = prefix + "H1 " + ahLine
					}
					markets = append(markets, dm)
				}
				if twh.Away.Value > 0 {
					ahLine := formatLine(-lineVal - 0.5)
					dm := DonorMarketWithCanonical{
						Odd:          twh.Away,
						OriginalKey:  prefix + "3WH " + normLine + " 2",
						CanonicalKey: prefix + "3WH " + normLine + " 2",
					}
					if allowScoreSensitiveEquivalence {
						dm.FallbackCanonicalKey = prefix + "H2 " + ahLine
						dm.RequireStdPinnacleOdds = true
						dm.PreferredPinnacleKey = prefix + "H2 " + ahLine
					}
					markets = append(markets, dm)
				}
			}
			if twh.Draw.Value > 0 {
				markets = append(markets, DonorMarketWithCanonical{
					Odd:          twh.Draw,
					OriginalKey:  prefix + "3WH " + normLine + " X",
					CanonicalKey: prefix + "3WH " + normLine + " X",
				})
			}
		}
	}

	// BTTS
	if period.BTTS != nil {
		if period.BTTS.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.BTTS.Yes,
				OriginalKey:  prefix + "BTTS Yes",
				CanonicalKey: prefix + "BTTS Yes",
			})
		}
		if period.BTTS.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.BTTS.No,
				OriginalKey:  prefix + "BTTS No",
				CanonicalKey: prefix + "BTTS No",
			})
		}
	}

	// OddEven
	if period.OddEven != nil {
		if period.OddEven.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.OddEven.Yes,
				OriginalKey:  prefix + "OE Odd",
				CanonicalKey: prefix + "OE Odd",
			})
		}
		if period.OddEven.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.OddEven.No,
				OriginalKey:  prefix + "OE Even",
				CanonicalKey: prefix + "OE Even",
			})
		}
	}

	// Home/Away OddEven
	if period.HomeOddEven != nil {
		if period.HomeOddEven.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.HomeOddEven.Yes,
				OriginalKey:  prefix + "HOE Odd",
				CanonicalKey: prefix + "HOE Odd",
			})
		}
		if period.HomeOddEven.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.HomeOddEven.No,
				OriginalKey:  prefix + "HOE Even",
				CanonicalKey: prefix + "HOE Even",
			})
		}
	}
	if period.AwayOddEven != nil {
		if period.AwayOddEven.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.AwayOddEven.Yes,
				OriginalKey:  prefix + "AOE Odd",
				CanonicalKey: prefix + "AOE Odd",
			})
		}
		if period.AwayOddEven.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          period.AwayOddEven.No,
				OriginalKey:  prefix + "AOE Even",
				CanonicalKey: prefix + "AOE Even",
			})
		}
	}

	// Sets (Tennis)
	for line, total := range period.SetsTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "Sets T> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          total.WinMore,
				OriginalKey:  key,
				CanonicalKey: key,
			})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "Sets T< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          total.WinLess,
				OriginalKey:  key,
				CanonicalKey: key,
			})
		}
	}
	for line, hcp := range period.SetsHandicap {
		normalizedLine := normalizeTotal(line)
		if hcp.Win1.Value > 0 {
			key := prefix + "Sets H1 " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          hcp.Win1,
				OriginalKey:  key,
				CanonicalKey: key,
			})
		}
		if hcp.Win2.Value > 0 {
			key := prefix + "Sets H2 " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{
				Odd:          hcp.Win2,
				OriginalKey:  key,
				CanonicalKey: key,
			})
		}
	}

	// Corners
	for line, total := range period.CornersTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "CT> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinMore, OriginalKey: key, CanonicalKey: key})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "CT< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinLess, OriginalKey: key, CanonicalKey: key})
		}
	}
	for line, hcp := range period.CornersHandicap {
		normalizedLine := normalizeTotal(line)
		if hcp.Win1.Value > 0 {
			key := prefix + "CH1 " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: hcp.Win1, OriginalKey: key, CanonicalKey: key})
		}
		if hcp.Win2.Value > 0 {
			key := prefix + "CH2 " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: hcp.Win2, OriginalKey: key, CanonicalKey: key})
		}
	}
	for line, total := range period.CornersFirstTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "CIT1> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinMore, OriginalKey: key, CanonicalKey: key})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "CIT1< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinLess, OriginalKey: key, CanonicalKey: key})
		}
	}
	for line, total := range period.CornersSecondTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "CIT2> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinMore, OriginalKey: key, CanonicalKey: key})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "CIT2< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinLess, OriginalKey: key, CanonicalKey: key})
		}
	}

	// Bookings
	for line, total := range period.BookingsTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "BkT> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinMore, OriginalKey: key, CanonicalKey: key})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "BkT< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinLess, OriginalKey: key, CanonicalKey: key})
		}
	}
	for line, hcp := range period.BookingsHandicap {
		normalizedLine := normalizeTotal(line)
		if hcp.Win1.Value > 0 {
			key := prefix + "BkH1 " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: hcp.Win1, OriginalKey: key, CanonicalKey: key})
		}
		if hcp.Win2.Value > 0 {
			key := prefix + "BkH2 " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: hcp.Win2, OriginalKey: key, CanonicalKey: key})
		}
	}
	for line, total := range period.BookingsFirstTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "BkIT1> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinMore, OriginalKey: key, CanonicalKey: key})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "BkIT1< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinLess, OriginalKey: key, CanonicalKey: key})
		}
	}
	for line, total := range period.BookingsSecondTeamTotal {
		normalizedLine := normalizeTotal(line)
		if total.WinMore.Value > 0 {
			key := prefix + "BkIT2> " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinMore, OriginalKey: key, CanonicalKey: key})
		}
		if total.WinLess.Value > 0 {
			key := prefix + "BkIT2< " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: total.WinLess, OriginalKey: key, CanonicalKey: key})
		}
	}

	// Games (Tennis)
	for line, game := range period.Games {
		normalizedLine := normalizeTotal(line)
		if game.Win1.Value > 0 {
			key := prefix + "1G " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: game.Win1, OriginalKey: key, CanonicalKey: key})
		}
		if game.Win2.Value > 0 {
			key := prefix + "2G " + normalizedLine
			markets = append(markets, DonorMarketWithCanonical{Odd: game.Win2, OriginalKey: key, CanonicalKey: key})
		}
	}

	// Combos and other markets
	for key, odd := range period.WinnerTotalCombo {
		if odd.Value > 0 {
			k := prefix + "WTC " + key
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: k, CanonicalKey: k})
		}
	}
	for key, odd := range period.BTTSWinnerCombo {
		if odd.Value > 0 {
			k := prefix + "BWC " + key
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: k, CanonicalKey: k})
		}
	}
	for key, odd := range period.BTTSTotalCombo {
		if odd.Value > 0 {
			k := prefix + "BTC " + key
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: k, CanonicalKey: k})
		}
	}
	for key, odd := range period.OddEvenTotalCombo {
		if odd.Value > 0 {
			k := prefix + "OET " + key
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: k, CanonicalKey: k})
		}
	}
	for key, odd := range period.TotalGoalsRange {
		if odd.Value > 0 {
			normKey := normalizeTGRKey(key)
			keyLower := strings.ToLower(strings.TrimSpace(normKey))
			originalKey := prefix + "TGR " + normKey
			canonicalKey := originalKey // Default: keep as TGR

			// Convert to canonical T>/T< when possible
			if strings.HasSuffix(keyLower, "+") {
				// "4+" → T> 3.5
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					canonicalKey = prefix + "T> " + line
				}
			} else if strings.HasPrefix(keyLower, "0-") {
				// "0-2" → T< 2.5
				parts := strings.SplitN(keyLower, "-", 2)
				if len(parts) == 2 {
					numStr := strings.TrimSpace(parts[1])
					if n, err := strconv.ParseFloat(numStr, 64); err == nil && n > 0 {
						line := formatLine(n + 0.5)
						canonicalKey = prefix + "T< " + line
					}
				}
			}
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: originalKey, CanonicalKey: canonicalKey})
		}
	}
	for key, odd := range period.ExactTotalGoals {
		if odd.Value > 0 {
			keyLower := strings.ToLower(strings.TrimSpace(key))
			originalKey := prefix + "ETG " + key
			canonicalKey := originalKey // Default: keep as ETG

			// Convert to canonical T>/T< when possible
			if keyLower == "0" {
				canonicalKey = prefix + "T< 0.5"
			} else if strings.HasSuffix(keyLower, "+") {
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					canonicalKey = prefix + "T> " + line
				}
			}
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: originalKey, CanonicalKey: canonicalKey})
		}
	}
	for key, odd := range period.HomeExactGoals {
		if odd.Value > 0 {
			keyLower := strings.ToLower(strings.TrimSpace(key))
			originalKey := prefix + "HEG " + key
			canonicalKey := originalKey // Default: keep as HEG

			// Convert to canonical IT1>/IT1< when possible
			if keyLower == "0" {
				canonicalKey = prefix + "IT1< 0.5"
			} else if strings.HasSuffix(keyLower, "+") {
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					canonicalKey = prefix + "IT1> " + line
				}
			}
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: originalKey, CanonicalKey: canonicalKey})
		}
	}
	for key, odd := range period.AwayExactGoals {
		if odd.Value > 0 {
			keyLower := strings.ToLower(strings.TrimSpace(key))
			originalKey := prefix + "AEG " + key
			canonicalKey := originalKey // Default: keep as AEG

			// Convert to canonical IT2>/IT2< when possible
			if keyLower == "0" {
				canonicalKey = prefix + "IT2< 0.5"
			} else if strings.HasSuffix(keyLower, "+") {
				numStr := strings.TrimSuffix(keyLower, "+")
				if n, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil && n > 0 {
					line := formatLine(n - 0.5)
					canonicalKey = prefix + "IT2> " + line
				}
			}
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: originalKey, CanonicalKey: canonicalKey})
		}
	}
	for key, odd := range period.HalfTimeFullTime {
		if odd.Value > 0 {
			k := prefix + "HT/FT " + key
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: k, CanonicalKey: k})
		}
	}

	// Method Of Victory
	for key, odd := range period.MethodOfVictory {
		if odd.Value > 0 {
			k := prefix + "MOV " + key
			markets = append(markets, DonorMarketWithCanonical{Odd: *odd, OriginalKey: k, CanonicalKey: k})
		}
	}

	// Home/Away Win To Nil
	if period.HomeWinToNil != nil {
		if period.HomeWinToNil.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.HomeWinToNil.Yes, OriginalKey: prefix + "HWN Yes", CanonicalKey: prefix + "HWN Yes"})
		}
		if period.HomeWinToNil.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.HomeWinToNil.No, OriginalKey: prefix + "HWN No", CanonicalKey: prefix + "HWN No"})
		}
	}
	if period.AwayWinToNil != nil {
		if period.AwayWinToNil.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.AwayWinToNil.Yes, OriginalKey: prefix + "AWN Yes", CanonicalKey: prefix + "AWN Yes"})
		}
		if period.AwayWinToNil.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.AwayWinToNil.No, OriginalKey: prefix + "AWN No", CanonicalKey: prefix + "AWN No"})
		}
	}

	// To Qualify
	if period.ToQualify != nil {
		if period.ToQualify.Home.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.ToQualify.Home, OriginalKey: prefix + "TQ Home", CanonicalKey: prefix + "TQ Home"})
		}
		if period.ToQualify.Away.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.ToQualify.Away, OriginalKey: prefix + "TQ Away", CanonicalKey: prefix + "TQ Away"})
		}
	}

	// HomeWinMap / AwayWinMap (ESports: "Will Team Win At Least One Map?")
	// Canonical: HomeWinMap Yes → H1 1.5, HomeWinMap No → H2 -1.5
	if period.HomeWinMap != nil {
		if period.HomeWinMap.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.HomeWinMap.Yes, OriginalKey: prefix + "HomeWinMap Yes", CanonicalKey: prefix + "H1 1.5"})
		}
		if period.HomeWinMap.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.HomeWinMap.No, OriginalKey: prefix + "HomeWinMap No", CanonicalKey: prefix + "H2 -1.5"})
		}
	}
	if period.AwayWinMap != nil {
		if period.AwayWinMap.Yes.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.AwayWinMap.Yes, OriginalKey: prefix + "AwayWinMap Yes", CanonicalKey: prefix + "H2 1.5"})
		}
		if period.AwayWinMap.No.Value > 0 {
			markets = append(markets, DonorMarketWithCanonical{Odd: period.AwayWinMap.No, OriginalKey: prefix + "AwayWinMap No", CanonicalKey: prefix + "H1 -1.5"})
		}
	}

	// Player Props
	for _, prop := range period.PlayerProps {
		normName := normalizePlayerPropName(prop.PlayerName)
		if prop.Over.Value > 0 {
			key := fmt.Sprintf("%sPP %s %s> %s", prefix, normName, prop.Market, formatLine(prop.Line))
			markets = append(markets, DonorMarketWithCanonical{Odd: prop.Over, OriginalKey: key, CanonicalKey: key})
		}
		if prop.Under.Value > 0 {
			key := fmt.Sprintf("%sPP %s %s< %s", prefix, normName, prop.Market, formatLine(prop.Line))
			markets = append(markets, DonorMarketWithCanonical{Odd: prop.Under, OriginalKey: key, CanonicalKey: key})
		}
	}

	return markets
}

// OddsWithMarketV2 extends OddsWithMarket with original donor market name
type OddsWithMarketV2 struct {
	MarketType         int           `json:"marketType"`
	Odds               [2]entity.Odd `json:"odds"`
	DonorOriginalKey   string        `json:"donorOriginalKey"`   // Original market from donor (e.g. "DC 1X")
	CanonicalKey       string        `json:"canonicalKey"`       // Canonical key used for comparison (e.g. "H1 0.5")
	PinnacleSources    []string      `json:"pinnacleSources"`    // Source markets from Pinnacle used to build canonical
	PinnacleBestSource string        `json:"pinnacleBestSource"` // Pinnacle source that provided best odd
	PinnacleStdOdds    float64       `json:"pinnacleStdOdds"`    // Standard line price (0 if only from specials)
}

// findCommonOutcomesV2 finds common outcomes using market equivalences
// Pinnacle: takes BEST price from equivalent markets
// Donor: compares EACH market against Pinnacle's best equivalent
func findCommonOutcomesV2(donorData, pinnacleData []entity.PeriodData, homeScore, awayScore int, sportName string) (map[string]OddsWithMarketV2, map[string]PinnacleOddEntry) {
	if len(donorData) == 0 || len(pinnacleData) == 0 {
		log.Printf("[PAIRING_V2] Early return: empty data")
		return nil, nil
	}

	common := make(map[string]OddsWithMarketV2, 500)
	pinnacleAllOdds := make(map[string]PinnacleOddEntry, 1000) // ALL Pinnacle StdOdds for margin calculation

	// Process all periods
	maxPeriods := len(donorData)
	if len(pinnacleData) < maxPeriods {
		maxPeriods = len(pinnacleData)
	}

	for periodIdx := 0; periodIdx < maxPeriods; periodIdx++ {
		// 1. Canonicalize Pinnacle markets (take best price from equivalents)
		pinnacleCanonical := canonicalizePinnacleMarkets(pinnacleData[periodIdx], periodIdx, homeScore, awayScore, sportName)

		// Collect ALL Pinnacle StdOdds for margin calculation (not just common)
		for key, entry := range pinnacleCanonical {
			// Use StdOdd (canonical price) when available; fall back to Odd (best
			// synthesized price) for entries that exist ONLY via synthesis
			// (e.g. 3WH -> H1, WM -> H1, ML from Win1x2 on Tennis/TT).
			// Without this fallback, synthesized-only entries have StdOdd==0 and
			// are invisible to pinnacleAllOdds, causing calculateMARGIN to return
			// the default 1.10 instead of the real market margin.
			value := entry.StdOdd.Value
			if value == 0 {
				value = entry.Odd.Value
			}
			if value > 0 {
				pinnacleAllOdds[key] = PinnacleOddEntry{Value: value, IsNative: true}
				// Also index by source keys so synthesized outcomes
				// (e.g. "P3 2" from "P3 H2 -0.5") find margin counterparts
				for _, src := range entry.Sources {
					if src != key {
						if _, exists := pinnacleAllOdds[src]; !exists {
							pinnacleAllOdds[src] = PinnacleOddEntry{Value: value, IsNative: false}
						}
					}
				}
			}
		}

		// 2. Extract all donor markets with their canonical keys
		donorMarkets := extractAllDonorMarkets(donorData[periodIdx], periodIdx, homeScore, awayScore, sportName)

		// 3. Compare each donor market against Pinnacle's canonical
		for _, donorMarket := range donorMarkets {
			selectedCanonicalKey := donorMarket.CanonicalKey
			pinnacleEntry, pinnacleExists := pinnacleCanonical[selectedCanonicalKey]
			useFallbackStdOnly := false
			if !pinnacleExists && donorMarket.FallbackCanonicalKey != "" {
				selectedCanonicalKey = donorMarket.FallbackCanonicalKey
				pinnacleEntry, pinnacleExists = pinnacleCanonical[selectedCanonicalKey]
				useFallbackStdOnly = pinnacleExists && donorMarket.RequireStdPinnacleOdds
			}
			if !pinnacleExists {
				continue
			}

			selectedPinnacleOdd := pinnacleEntry.Odd
			selectedBestSource := pinnacleEntry.BestSource
			selectedSources := pinnacleEntry.Sources
			selectedStdOdds := pinnacleEntry.StdOdd.Value

			// Keep 3WH -> AH pairing strict: search by canonical AH line,
			// but compare/verify only against Pinnacle's standard AH market.
			if useFallbackStdOnly {
				if pinnacleEntry.StdOdd.Value <= 0 {
					continue
				}
				selectedPinnacleOdd = pinnacleEntry.StdOdd
				selectedBestSource = donorMarket.PreferredPinnacleKey
				selectedSources = []string{donorMarket.PreferredPinnacleKey}
			}

			maxVal := MAX_VALUE
			if isMultiwayMarket(selectedCanonicalKey) {
				maxVal = MAX_VALUE_MULTIWAY
			}
			if selectedPinnacleOdd.Value < MIN_VALUE || selectedPinnacleOdd.Value > maxVal {
				continue
			}

			if donorMarket.Odd.Value <= 0 {
				continue
			}

			// Use donor's original key as the map key to avoid duplicates
			// If same canonical but different original (e.g. "1" and "H1 -0.5" both map to "H1 -0.5")
			// we want to keep both as separate entries
			mapKey := donorMarket.OriginalKey

			// Calculate market type (for fallen markets detection)
			marketType := 0
			if periodIdx == 0 {
				marketType = calculateMarketType(selectedCanonicalKey, homeScore, awayScore)
			}

			common[mapKey] = OddsWithMarketV2{
				MarketType:         marketType,
				Odds:               [2]entity.Odd{donorMarket.Odd, selectedPinnacleOdd},
				DonorOriginalKey:   donorMarket.OriginalKey,
				CanonicalKey:       selectedCanonicalKey,
				PinnacleSources:    selectedSources,
				PinnacleBestSource: selectedBestSource,
				PinnacleStdOdds:    selectedStdOdds,
			}

			// TRACE: log IT pairings with prices for debugging
			if strings.HasPrefix(donorMarket.CanonicalKey, "IT") {
			}
		}
	}

	// TRACE: summary of paired market types (sampled: every 30th call)
	if len(common) > 0 {
		types := make(map[string]int)
		for _, v := range common {
			parts := strings.SplitN(v.CanonicalKey, " ", 2)
			types[parts[0]] = types[parts[0]] + 1
		}
	}

	return common, pinnacleAllOdds
}

// calculateMarketType determines market status based on current score
func calculateMarketType(canonicalKey string, homeScore, awayScore int) int {
	// Extract market type from canonical key
	if strings.HasPrefix(canonicalKey, "H1 ") {
		line := strings.TrimPrefix(canonicalKey, "H1 ")
		return checkMarketHomeHandicap(homeScore, awayScore, line)
	}
	if strings.HasPrefix(canonicalKey, "H2 ") {
		line := strings.TrimPrefix(canonicalKey, "H2 ")
		return checkMarketAwayHandicap(homeScore, awayScore, line)
	}
	if strings.HasPrefix(canonicalKey, "T> ") {
		return chechMarketTotal(homeScore, awayScore, ">")
	}
	if strings.HasPrefix(canonicalKey, "T< ") {
		return chechMarketTotal(homeScore, awayScore, "<")
	}
	if canonicalKey == "DC 1X" {
		return checkMarketHomeHandicap(homeScore, awayScore, "0.5")
	}
	if canonicalKey == "DC X2" {
		return checkMarketAwayHandicap(homeScore, awayScore, "0.5")
	}
	if canonicalKey == "DNB 1" {
		return checkMarketHomeHandicap(homeScore, awayScore, "0")
	}
	if canonicalKey == "DNB 2" {
		return checkMarketAwayHandicap(homeScore, awayScore, "0")
	}
	if canonicalKey == "X" {
		return checkMarketWinNone(homeScore, awayScore)
	}
	return 0
}

// ConvertV2ToLegacy converts OddsWithMarketV2 map to legacy OddsWithMarket format
// for backward compatibility during transition
func ConvertV2ToLegacy(v2 map[string]OddsWithMarketV2) map[string]entity.OddsWithMarket {
	result := make(map[string]entity.OddsWithMarket, len(v2))
	for key, val := range v2 {
		result[key] = entity.OddsWithMarket{
			MarketType: val.MarketType,
			Odds:       val.Odds,
		}
	}
	return result
}
