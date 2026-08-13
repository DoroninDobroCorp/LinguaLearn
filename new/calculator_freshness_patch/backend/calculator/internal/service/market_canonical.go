package service

import (
	"math"
	"strings"
)

// MarketFamily identifies the type of betting market.
type MarketFamily string

const (
	FamilyTotal         MarketFamily = "total"
	FamilyTeamTotal     MarketFamily = "team_total"
	FamilyHandicap      MarketFamily = "handicap"
	FamilyBTTS          MarketFamily = "btts"
	FamilyMainWin       MarketFamily = "main_win"      // 1, 2 in 2-way
	FamilyDoubleChance  MarketFamily = "double_chance"  // DC 1X, DC X2
	FamilyDrawNoBet     MarketFamily = "draw_no_bet"    // DNB 1, DNB 2
	FamilyUnsupported   MarketFamily = "unsupported"
)

// MarketSide indicates which "direction" the bet is on.
type MarketSide string

const (
	SideOver  MarketSide = "over"
	SideUnder MarketSide = "under"
	SideHome  MarketSide = "home"
	SideAway  MarketSide = "away"
	SideYes   MarketSide = "yes"
	SideNo    MarketSide = "no"
)

// CanonicalMarket is the parsed, canonical representation of an outcome string.
type CanonicalMarket struct {
	Family    MarketFamily `json:"family"`
	Side      MarketSide   `json:"side"`
	Line      float64      `json:"line"`      // The numeric line (e.g., 2.5 for T>2.5, -1.5 for H1 -1.5)
	TeamAxis  int          `json:"teamAxis"`  // 1 or 2 for team-specific markets, 0 for general
	IsPeriod  bool         `json:"isPeriod"`  // true if P1/P2/1H/2H prefixed
	RawPeriod string       `json:"rawPeriod"` // "P1", "2H", etc.
	Eligible  bool         `json:"eligible"`  // false = excluded from safe-opposite logic
	Raw       string       `json:"raw"`       // Original outcome string
}

// ParseCanonicalMarket parses an outcome string into its canonical form.
// Period markets are parsed but marked as ineligible for safe-opposite.
func ParseCanonicalMarket(outcome string, sportName string) CanonicalMarket {
	cm := CanonicalMarket{Raw: outcome, Eligible: true}
	o := outcome

	// Strip period prefix
	for _, prefix := range []string{"P1 ", "P2 ", "P3 ", "P4 ", "P5 ", "1H ", "2H "} {
		if strings.HasPrefix(o, prefix) {
			cm.IsPeriod = true
			cm.RawPeriod = strings.TrimSpace(prefix)
			cm.Eligible = false // periods excluded from safe-opposite
			o = o[len(prefix):]
			break
		}
	}

	// General totals: T> X, T< X
	if strings.HasPrefix(o, "T> ") || strings.HasPrefix(o, "T< ") {
		cm.Family = FamilyTotal
		cm.TeamAxis = 0
		if o[1] == '>' {
			cm.Side = SideOver
		} else {
			cm.Side = SideUnder
		}
		cm.Line = parseFloat(o[3:])
		return cm
	}

	// Team/Individual totals: IT1> X, IT1< X, IT2> X, IT2< X, T1> X, T2> X
	if len(o) >= 4 {
		teamTotalPrefixes := []struct {
			prefix string
			team   int
		}{
			{"IT1>", 1}, {"IT1<", 1}, {"IT2>", 2}, {"IT2<", 2},
			{"T1>", 1}, {"T1<", 1}, {"T2>", 2}, {"T2<", 2},
		}
		for _, tp := range teamTotalPrefixes {
			if strings.HasPrefix(o, tp.prefix) {
				cm.Family = FamilyTeamTotal
				cm.TeamAxis = tp.team
				if strings.Contains(tp.prefix, ">") {
					cm.Side = SideOver
				} else {
					cm.Side = SideUnder
				}
				// Line starts after prefix (may have space)
				lineStr := strings.TrimSpace(o[len(tp.prefix):])
				cm.Line = parseFloat(lineStr)
				return cm
			}
		}
	}

	// Handicaps: H1 X, H2 X
	if strings.HasPrefix(o, "H1 ") || strings.HasPrefix(o, "H2 ") {
		cm.Family = FamilyHandicap
		if o[1] == '1' {
			cm.Side = SideHome
			cm.TeamAxis = 1
		} else {
			cm.Side = SideAway
			cm.TeamAxis = 2
		}
		cm.Line = parseFloat(o[3:])
		return cm
	}

	// BTTS Yes/No
	if o == "BTTS Yes" || o == "BTTS No" {
		cm.Family = FamilyBTTS
		if strings.HasSuffix(o, "Yes") {
			cm.Side = SideYes
		} else {
			cm.Side = SideNo
		}
		return cm
	}

	// Win family canonicalization:
	// In 2-way sports, 1 vs 2 is safe (no draw). Keep as FamilyMainWin with eligible=true.
	// In 3-way sports (Soccer), 1 vs 2 is NOT safe (draw = both lose).
	if o == "1" || o == "2" {
		if isTwoWaySport(sportName) {
			cm.Family = FamilyMainWin
			cm.Eligible = true // 2-way: safe opposite
		} else {
			cm.Family = FamilyMainWin
			cm.Eligible = false // 3-way: not safe
		}
		if o == "1" {
			cm.Side = SideHome
			cm.TeamAxis = 1
		} else {
			cm.Side = SideAway
			cm.TeamAxis = 2
		}
		return cm
	}

	// Double Chance: DC 1X ≡ H1 0.5, DC X2 ≡ H2 0.5
	if strings.HasPrefix(o, "DC ") {
		dc := o[3:]
		cm.Family = FamilyHandicap // canonicalize to handicap
		switch dc {
		case "1X":
			cm.Side = SideHome
			cm.TeamAxis = 1
			cm.Line = 0.5
		case "X2":
			cm.Side = SideAway
			cm.TeamAxis = 2
			cm.Line = 0.5
		default:
			cm.Family = FamilyDoubleChance
			cm.Eligible = false
		}
		return cm
	}

	// Draw No Bet: DNB 1 ≡ H1 0, DNB 2 ≡ H2 0
	if strings.HasPrefix(o, "DNB") {
		cm.Family = FamilyHandicap // canonicalize to handicap
		rest := strings.TrimSpace(o[3:])
		switch rest {
		case "1", "Home":
			cm.Side = SideHome
			cm.TeamAxis = 1
			cm.Line = 0
		case "2", "Away":
			cm.Side = SideAway
			cm.TeamAxis = 2
			cm.Line = 0
		default:
			cm.Family = FamilyDrawNoBet
			cm.Eligible = false
		}
		return cm
	}

	// Everything else is unsupported for safe-opposite
	cm.Family = FamilyUnsupported
	cm.Eligible = false
	return cm
}

// IsSafeOpposite checks if two canonical markets cannot lose simultaneously.
// Both markets must be eligible, same family axis, and their loss regions must not overlap.
func IsSafeOpposite(existing, candidate CanonicalMarket) bool {
	// Both must be eligible
	if !existing.Eligible || !candidate.Eligible {
		return false
	}

	// Period markets excluded
	if existing.IsPeriod || candidate.IsPeriod {
		return false
	}

	// Must be same family (after canonicalization)
	if existing.Family != candidate.Family {
		return false
	}

	switch existing.Family {
	case FamilyTotal:
		return isSafeOppositeTotal(existing, candidate)
	case FamilyTeamTotal:
		return isSafeOppositeTeamTotal(existing, candidate)
	case FamilyHandicap:
		return isSafeOppositeHandicap(existing, candidate)
	case FamilyBTTS:
		return isSafeOppositeBTTS(existing, candidate)
	case FamilyMainWin:
		// 2-way: 1 vs 2 is always safe (binary complement, no draw)
		return existing.Side != candidate.Side
	default:
		return false
	}
}

// Totals: Over A + Under B is safe if B >= A
// Both must be on same axis (general total, same team total)
func isSafeOppositeTotal(a, b CanonicalMarket) bool {
	if a.Side == b.Side {
		return false // same direction = not opposite
	}
	var overLine, underLine float64
	if a.Side == SideOver {
		overLine = a.Line
		underLine = b.Line
	} else {
		overLine = b.Line
		underLine = a.Line
	}
	// Safe if underLine >= overLine (no gap where both lose)
	return underLine >= overLine-epsilon
}

// Team totals: same as totals but must be same team axis
func isSafeOppositeTeamTotal(a, b CanonicalMarket) bool {
	if a.TeamAxis != b.TeamAxis {
		return false // different teams = independent
	}
	return isSafeOppositeTotal(a, b)
}

// Handicaps: H1 a + H2 b is safe if b >= -a
// After canonicalization, DC/DNB/Win are on the handicap axis too.
func isSafeOppositeHandicap(a, b CanonicalMarket) bool {
	if a.Side == b.Side {
		return false // same side = not opposite
	}
	var homeLine, awayLine float64
	if a.Side == SideHome {
		homeLine = a.Line
		awayLine = b.Line
	} else {
		homeLine = b.Line
		awayLine = a.Line
	}
	// H1 homeLine + H2 awayLine: safe if awayLine >= -homeLine
	return awayLine >= -homeLine-epsilon
}

// BTTS: Yes + No is always safe (binary complement)
func isSafeOppositeBTTS(a, b CanonicalMarket) bool {
	return a.Side != b.Side
}

// isTwoWaySport returns true for sports where match result has only 2 outcomes (no draw).
func isTwoWaySport(sport string) bool {
	s := strings.ToLower(sport)
	switch s {
	case "tennis", "basketball", "volleyball", "esports", "table tennis",
		"badminton", "baseball", "american football", "cricket", "darts",
		"snooker", "mma", "boxing":
		return true
	default:
		return false
	}
}

const epsilon = 0.001

func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	var f float64
	_, _ = math.Inf(0), math.NaN() // unused import guard
	for i, c := range s {
		if c == '-' && i == 0 {
			continue
		}
		if c == '.' {
			continue
		}
		if c < '0' || c > '9' {
			s = s[:i]
			break
		}
	}
	n := 0
	neg := false
	if len(s) > 0 && s[0] == '-' {
		neg = true
		s = s[1:]
	}
	parts := strings.SplitN(s, ".", 2)
	for _, c := range parts[0] {
		n = n*10 + int(c-'0')
	}
	f = float64(n)
	if len(parts) == 2 && len(parts[1]) > 0 {
		dec := 0
		div := 1
		for _, c := range parts[1] {
			dec = dec*10 + int(c-'0')
			div *= 10
		}
		f += float64(dec) / float64(div)
	}
	if neg {
		f = -f
	}
	return f
}
