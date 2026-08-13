package service

import (
	"testing"
)

func TestParseCanonicalMarket(t *testing.T) {
	tests := []struct {
		name      string
		outcome   string
		sport     string
		wantFam   MarketFamily
		wantSide  MarketSide
		wantLine  float64
		wantTeam  int
		wantElig  bool
		wantPer   bool
	}{
		// General totals
		{"Over 2.5", "T> 2.5", "Soccer", FamilyTotal, SideOver, 2.5, 0, true, false},
		{"Under 2.5", "T< 2.5", "Soccer", FamilyTotal, SideUnder, 2.5, 0, true, false},
		{"Over 120.5", "T> 120.5", "Basketball", FamilyTotal, SideOver, 120.5, 0, true, false},
		{"Under 0.5", "T< 0.5", "Soccer", FamilyTotal, SideUnder, 0.5, 0, true, false},

		// Team totals
		{"IT1 Over 1.5", "IT1> 1.5", "Soccer", FamilyTeamTotal, SideOver, 1.5, 1, true, false},
		{"IT2 Under 2.5", "IT2< 2.5", "Soccer", FamilyTeamTotal, SideUnder, 2.5, 2, true, false},
		{"T1 Over", "T1> 0.5", "Soccer", FamilyTeamTotal, SideOver, 0.5, 1, true, false},

		// Handicaps
		{"H1 -1.5", "H1 -1.5", "Soccer", FamilyHandicap, SideHome, -1.5, 1, true, false},
		{"H2 1.5", "H2 1.5", "Soccer", FamilyHandicap, SideAway, 1.5, 2, true, false},
		{"H1 0", "H1 0", "Soccer", FamilyHandicap, SideHome, 0, 1, true, false},
		{"H2 -0.5", "H2 -0.5", "Soccer", FamilyHandicap, SideAway, -0.5, 2, true, false},

		// BTTS
		{"BTTS Yes", "BTTS Yes", "Soccer", FamilyBTTS, SideYes, 0, 0, true, false},
		{"BTTS No", "BTTS No", "Soccer", FamilyBTTS, SideNo, 0, 0, true, false},

		// Win — 2-way sport (binary complement, eligible)
		{"1 tennis", "1", "Tennis", FamilyMainWin, SideHome, 0, 1, true, false},
		{"2 tennis", "2", "Tennis", FamilyMainWin, SideAway, 0, 2, true, false},
		{"1 basketball", "1", "Basketball", FamilyMainWin, SideHome, 0, 1, true, false},

		// Win — 3-way sport (NOT eligible)
		{"1 soccer", "1", "Soccer", FamilyMainWin, SideHome, 0, 1, false, false},
		{"2 soccer", "2", "Soccer", FamilyMainWin, SideAway, 0, 2, false, false},

		// Double Chance → handicap
		{"DC 1X", "DC 1X", "Soccer", FamilyHandicap, SideHome, 0.5, 1, true, false},
		{"DC X2", "DC X2", "Soccer", FamilyHandicap, SideAway, 0.5, 2, true, false},

		// Draw No Bet → handicap
		{"DNB 1", "DNB 1", "Soccer", FamilyHandicap, SideHome, 0, 1, true, false},
		{"DNB 2", "DNB 2", "Soccer", FamilyHandicap, SideAway, 0, 2, true, false},
		{"DNB Home", "DNB Home", "Soccer", FamilyHandicap, SideHome, 0, 1, true, false},

		// Period — parsed but NOT eligible
		{"P1 total", "P1 T> 0.5", "Soccer", FamilyTotal, SideOver, 0.5, 0, false, true},
		{"2H handicap", "2H H1 -1.5", "Soccer", FamilyHandicap, SideHome, -1.5, 1, false, true},

		// Unsupported
		{"OE", "OE Odd", "Soccer", FamilyUnsupported, "", 0, 0, false, false},
		{"Corners", "CT> 8.5", "Soccer", FamilyUnsupported, "", 0, 0, false, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cm := ParseCanonicalMarket(tc.outcome, tc.sport)
			if cm.Family != tc.wantFam {
				t.Errorf("Family: got %q, want %q", cm.Family, tc.wantFam)
			}
			if tc.wantSide != "" && cm.Side != tc.wantSide {
				t.Errorf("Side: got %q, want %q", cm.Side, tc.wantSide)
			}
			if tc.wantLine != 0 && abs(cm.Line-tc.wantLine) > 0.01 {
				t.Errorf("Line: got %v, want %v", cm.Line, tc.wantLine)
			}
			if cm.TeamAxis != tc.wantTeam {
				t.Errorf("TeamAxis: got %d, want %d", cm.TeamAxis, tc.wantTeam)
			}
			if cm.Eligible != tc.wantElig {
				t.Errorf("Eligible: got %v, want %v", cm.Eligible, tc.wantElig)
			}
			if cm.IsPeriod != tc.wantPer {
				t.Errorf("IsPeriod: got %v, want %v", cm.IsPeriod, tc.wantPer)
			}
		})
	}
}

// Golden fixture cases from the safe opposite bets plan
func TestIsSafeOpposite(t *testing.T) {
	tests := []struct {
		name     string
		existing string
		cand     string
		sport    string
		want     bool
		reason   string
	}{
		// Totals — SAFE cases
		{"T>120.5 + T<120.5 = safe", "T> 120.5", "T< 120.5", "Basketball", true, "exact opposite"},
		{"T>120.5 + T<123.5 = safe", "T> 120.5", "T< 123.5", "Basketball", true, "under >= over"},
		{"T>2.5 + T<3.5 = safe", "T> 2.5", "T< 3.5", "Soccer", true, "under > over"},
		{"T>2.5 + T<2.5 = safe", "T> 2.5", "T< 2.5", "Soccer", true, "exact"},

		// Totals — UNSAFE cases
		{"T>120.5 + T<118.5 = unsafe", "T> 120.5", "T< 118.5", "Basketball", false, "under < over = gap"},
		{"T>3.5 + T<2.5 = unsafe", "T> 3.5", "T< 2.5", "Soccer", false, "gap exists"},

		// Totals — same direction = not opposite
		{"T>2.5 + T>3.5 = not opposite", "T> 2.5", "T> 3.5", "Soccer", false, "same direction"},

		// Team totals — SAFE (same team)
		{"IT1>1.5 + IT1<2.5 = safe", "IT1> 1.5", "IT1< 2.5", "Soccer", true, "same team opposite"},

		// Team totals — UNSAFE (different teams)
		{"IT1>1.5 + IT2<2.5 = unsafe", "IT1> 1.5", "IT2< 2.5", "Soccer", false, "different teams"},

		// Handicaps — SAFE
		{"H1-1.5 + H2 1.5 = safe", "H1 -1.5", "H2 1.5", "Soccer", true, "b >= -a"},
		{"H1-1.5 + H2 3.5 = safe", "H1 -1.5", "H2 3.5", "Soccer", true, "b > -a"},
		{"H1 0 + H2 0 = safe", "H1 0", "H2 0", "Soccer", true, "zero handicap"},

		// Handicaps — UNSAFE
		{"H1-1.5 + H2 0.5 = unsafe", "H1 -1.5", "H2 0.5", "Soccer", false, "b < -a"},

		// BTTS — SAFE
		{"BTTS Yes + No = safe", "BTTS Yes", "BTTS No", "Soccer", true, "binary complement"},

		// BTTS — same = not opposite
		{"BTTS Yes + Yes = not opposite", "BTTS Yes", "BTTS Yes", "Soccer", false, "same side"},

		// Win 2-way — SAFE (canonicalized to H1-0.5 + H2-0.5)
		{"1 + 2 tennis = safe", "1", "2", "Tennis", true, "2-way → H1-0.5 + H2-0.5"},

		// Win 3-way — UNSAFE (draw = both lose)
		{"1 + 2 soccer = unsafe", "1", "2", "Soccer", false, "3-way not eligible"},

		// Cross-family equivalences
		{"DC 1X + H2 -0.5 = safe", "DC 1X", "H2 -0.5", "Soccer", true, "DC→H1 0.5 + H2 -0.5: b>=-a"},
		{"DNB 1 + H2 0 = safe", "DNB 1", "H2 0", "Soccer", true, "DNB→H1 0 + H2 0: b>=-a"},
		{"DNB 1 + 2 tennis = diff family", "DNB 1", "2", "Tennis", false, "DNB→handicap, 2→main_win: diff families"},

		// Period — excluded
		{"P1 T>1.5 + P1 T<2.5 = excluded", "P1 T> 1.5", "P1 T< 2.5", "Soccer", false, "period markets excluded"},

		// Unsupported markets
		{"OE vs BTTS = unsupported", "OE Odd", "BTTS No", "Soccer", false, "unsupported family"},

		// Cross-family = not safe
		{"total vs handicap", "T> 2.5", "H1 -1.5", "Soccer", false, "different families"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			existing := ParseCanonicalMarket(tc.existing, tc.sport)
			candidate := ParseCanonicalMarket(tc.cand, tc.sport)
			got := IsSafeOpposite(existing, candidate)
			if got != tc.want {
				t.Errorf("IsSafeOpposite(%q, %q) [%s] = %v, want %v (%s)\n  existing: %+v\n  candidate: %+v",
					tc.existing, tc.cand, tc.sport, got, tc.want, tc.reason, existing, candidate)
			}
		})
	}
}

func TestParseFloat(t *testing.T) {
	tests := []struct {
		input string
		want  float64
	}{
		{"2.5", 2.5},
		{"-1.5", -1.5},
		{"0", 0},
		{"0.5", 0.5},
		{"120.5", 120.5},
		{"-0.5", -0.5},
		{"3.5", 3.5},
	}
	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			got := parseFloat(tc.input)
			if abs(got-tc.want) > 0.001 {
				t.Errorf("parseFloat(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestIsTwoWaySport(t *testing.T) {
	twoWay := []string{"Tennis", "Basketball", "Volleyball", "Esports", "Table Tennis", "MMA"}
	threeWay := []string{"Soccer", "Hockey", "Handball"}

	for _, s := range twoWay {
		if !isTwoWaySport(s) {
			t.Errorf("%q should be 2-way", s)
		}
	}
	for _, s := range threeWay {
		if isTwoWaySport(s) {
			t.Errorf("%q should be 3-way", s)
		}
	}
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
