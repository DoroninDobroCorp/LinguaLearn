package service

import "livebets/parse_sansabet/internal/entity"

// getMarketTypeByTipID returns the market type name for a given TipID and sport
// This maps Sansabet TipIDs to our standard market type names for filtering
func getMarketTypeByTipID(tipID int64, sport entity.SportName) string {
	// Win1x2 markets
	if _, ok := getWin1x2Mapping(tipID, sport); ok {
		return "Win1x2"
	}

	// Games markets (set winners in tennis)
	if _, ok := getGamesMapping(tipID, sport); ok {
		return "Games"
	}

	// Totals markets
	if _, ok := getTotalsMapping(tipID, sport); ok {
		return "Totals"
	}

	// Team Totals (FirstTeamTotals and SecondTeamTotals)
	if mapping, ok := getTeamTotalsMapping(tipID, sport); ok {
		if mapping.team == "first" {
			return "FirstTeamTotals"
		} else if mapping.team == "second" {
			return "SecondTeamTotals"
		}
	}

	// BTTS (Both Teams To Score)
	if _, ok := getBTTSMapping(tipID, sport); ok {
		return "BTTS"
	}

	// Odd/Even (Total)
	if _, ok := getOddEvenMapping(tipID, sport); ok {
		return "OddEven"
	}

	// Double Chance
	if _, ok := getDoubleChanceMapping(tipID, sport); ok {
		return "DoubleChance"
	}

	// Draw No Bet
	if _, ok := getDrawNoBetMapping(tipID, sport); ok {
		return "DrawNoBet"
	}

	// Handicap (relative/absolute)
	if isHandicapTipID(tipID, sport) {
		return "Handicap"
	}

	// Sets Handicap (volleyball/tennis)
	if _, ok := getSetsHandicapMapping(tipID, sport); ok {
		return "SetsHandicap"
	}

	// Basketball 2-way winners → HC 0.0 (not in win1x2 mappings)
	if sport == entity.SportBasketball {
		switch tipID {
		case 919, 920, 921, 922, 923, 924, 925, 926, // Q1-Q4 2-way
			521, 522, // 1H 2-way
			686, 687: // 2H 2-way
			return "Handicap"
		}
	}

	// Three-way handicap
	if _, ok := getThreeWayHandicapMapping(tipID, sport); ok {
		return "ThreeWayHandicap"
	}

	// Winner + Total Combo (Soccer, Handball)
	if _, ok := getWinnerTotalComboKey(tipID, sport); ok {
		return "WinnerTotalCombo"
	}

	// Unknown TipID
	return ""
}
