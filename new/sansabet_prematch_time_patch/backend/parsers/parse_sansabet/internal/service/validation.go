package service

import (
	"livebets/parse_sansabet/internal/entity"
	"math"
	"strconv"
	"strings"
)

// ValidateAndCleanGame validates and cleans ResponseGame before sending to analyzer.
// Returns false if data is invalid and should not be sent.
func ValidateAndCleanGame(game *entity.ResponseGame) bool {
	if game == nil {
		return false
	}

	// Validate required fields
	if game.HomeName == "" || game.AwayName == "" {
		return false
	}

	// Home and Away must be different
	if strings.EqualFold(game.HomeName, game.AwayName) {
		return false
	}

	// Validate match ID
	if game.Pid <= 0 || game.MatchId == "" {
		return false
	}

	// Validate sport name
	if game.SportName == "" {
		return false
	}

	// Validate scores are non-negative
	if game.HomeScore < 0 || game.AwayScore < 0 {
		game.HomeScore = 0
		game.AwayScore = 0
		game.HasScore = false
	}

	// Clean and validate periods
	game.Periods = cleanPeriods(game.Periods, game.SportName)

	// Must have at least one period with some data
	if len(game.Periods) == 0 {
		return false
	}
	hasAnyData := false
	for i := range game.Periods {
		if periodHasData(&game.Periods[i]) {
			hasAnyData = true
			break
		}
	}
	if !hasAnyData {
		return false
	}

	// Sport-specific validation
	switch game.SportName {
	case entity.SportTennis:
		validateTennis(game)
	case entity.SportBasketball:
		validateBasketball(game)
	case entity.SportSoccer:
		validateSoccer(game)
	}

	return true
}

// validateTennis performs tennis-specific validation
func validateTennis(game *entity.ResponseGame) {
	for i := range game.Periods {
		// Tennis is 2-way, WinNone should be 0
		game.Periods[i].Win1x2.WinNone.Value = 0

		// Validate game totals for tennis (typically 15-50 games per match)
		for line := range game.Periods[i].Totals {
			lineVal, err := strconv.ParseFloat(line, 64)
			if err == nil && (lineVal < 5 || lineVal > 60) {
				delete(game.Periods[i].Totals, line)
			}
		}
	}
}

// validateBasketball performs basketball-specific validation
func validateBasketball(game *entity.ResponseGame) {
	for i := range game.Periods {
		// Basketball period 0 may have both 2-way (OT) Win1/Win2 AND regulation draw (WinNone)
		// Don't zero WinNone — it's the regulation time draw market from Sansabet TID 2

		// Validate point totals for basketball (typically 150-250 for full game)
		if i == 0 {
			for line := range game.Periods[i].Totals {
				lineVal, err := strconv.ParseFloat(line, 64)
				if err == nil && (lineVal < 50 || lineVal > 350) {
					delete(game.Periods[i].Totals, line)
				}
			}
		}
	}
}

// validateSoccer performs soccer-specific validation
func validateSoccer(game *entity.ResponseGame) {
	for i := range game.Periods {
		// Validate goal totals (typically 0.5-6.5)
		for line := range game.Periods[i].Totals {
			lineVal, err := strconv.ParseFloat(line, 64)
			if err == nil && (lineVal < 0 || lineVal > 15) {
				delete(game.Periods[i].Totals, line)
			}
		}

		// Validate handicap lines (typically -5 to +5)
		for line := range game.Periods[i].Handicap {
			lineVal, err := strconv.ParseFloat(line, 64)
			if err == nil && math.Abs(lineVal) > 10 {
				delete(game.Periods[i].Handicap, line)
			}
		}
	}
}

// cleanPeriods removes empty markets and normalizes lines
func cleanPeriods(periods []entity.ResponsePeriod, sportName entity.SportName) []entity.ResponsePeriod {
	if len(periods) == 0 {
		return periods
	}

	// IMPORTANT: Keep ALL periods to preserve index positions!
	// Removing empty periods shifts indices (P2 becomes P1), causing false ROI.
	for i := range periods {
		cleanTotals(periods[i].Totals)
		cleanTotals(periods[i].FirstTeamTotals)
		cleanTotals(periods[i].SecondTeamTotals)
		cleanTotals(periods[i].SetsTotal)
		cleanHandicap(periods[i].Handicap)
		cleanHandicap(periods[i].SetsHandicap)
		cleanThreeWayHandicap(periods[i].ThreeWayHandicap)
		cleanGames(periods[i].Games)
		cleanWin1x2(&periods[i].Win1x2)
		cleanYesNo(&periods[i].BTTS)
		cleanYesNo(&periods[i].OddEven)
		cleanDoubleChance(&periods[i].DoubleChance)
		cleanDrawNoBet(&periods[i].DrawNoBet)
	}

	return periods
}

// periodHasData checks if period has any valid market data
func periodHasData(period *entity.ResponsePeriod) bool {
	if period == nil {
		return false
	}

	// Check Win1x2
	if period.Win1x2.Win1.Value > 0 || period.Win1x2.Win2.Value > 0 || period.Win1x2.WinNone.Value > 0 {
		return true
	}

	// Check Totals
	if len(period.Totals) > 0 {
		return true
	}

	// Check ThreeWayHandicap
	if len(period.ThreeWayHandicap) > 0 {
		return true
	}

	// Check Handicap
	if len(period.Handicap) > 0 {
		return true
	}

	// Check Team Totals
	if len(period.FirstTeamTotals) > 0 || len(period.SecondTeamTotals) > 0 {
		return true
	}

	// Check Games
	if len(period.Games) > 0 {
		return true
	}

	// Check SetsTotal
	if len(period.SetsTotal) > 0 {
		return true
	}

	// Check SetsHandicap
	if len(period.SetsHandicap) > 0 {
		return true
	}

	// Check BTTS
	if period.BTTS != nil && (period.BTTS.Yes.Value > 0 || period.BTTS.No.Value > 0) {
		return true
	}

	// Check Odd/Even
	if period.OddEven != nil && (period.OddEven.Yes.Value > 0 || period.OddEven.No.Value > 0) {
		return true
	}

	// Check Double Chance
	if period.DoubleChance != nil && (period.DoubleChance.W1X.Value > 0 || period.DoubleChance.WX2.Value > 0 || period.DoubleChance.W12.Value > 0) {
		return true
	}

	// Check Draw No Bet
	if period.DrawNoBet != nil && (period.DrawNoBet.Home.Value > 0 || period.DrawNoBet.Away.Value > 0) {
		return true
	}

	return false
}

// cleanTotals removes invalid totals entries
func cleanTotals(totals map[string]*entity.WinLessMore) {
	if totals == nil {
		return
	}

	for line, data := range totals {
		if data == nil {
			delete(totals, line)
			continue
		}

		if data.WinMore.Value <= 0 && data.WinLess.Value <= 0 {
			delete(totals, line)
		}
	}
}

// cleanHandicap removes invalid handicap entries
func cleanHandicap(handicap map[string]*entity.WinHandicap) {
	if handicap == nil {
		return
	}

	for line, data := range handicap {
		if data == nil {
			delete(handicap, line)
			continue
		}

		if data.Win1.Value <= 0 && data.Win2.Value <= 0 {
			delete(handicap, line)
		}
	}
}

// cleanThreeWayHandicap removes invalid three-way handicap entries
func cleanThreeWayHandicap(threeWay map[string]*entity.ThreeWayHcap) {
	if threeWay == nil {
		return
	}

	for line, data := range threeWay {
		if data == nil {
			delete(threeWay, line)
			continue
		}

		if data.Home.Value <= 0 && data.Draw.Value <= 0 && data.Away.Value <= 0 {
			delete(threeWay, line)
		}
	}
}

// cleanGames removes invalid games entries
func cleanGames(games map[string]*entity.Win1x2Struct) {
	if games == nil {
		return
	}

	for key, data := range games {
		if data == nil {
			delete(games, key)
			continue
		}
		if data.Win1.Value <= 0 && data.Win2.Value <= 0 && data.WinNone.Value <= 0 {
			delete(games, key)
		}
	}
}

// cleanWin1x2 validates Win1x2 odds
func cleanWin1x2(win1x2 *entity.Win1x2Struct) {
	if win1x2 == nil {
		return
	}

	// Validate minimum odds (1.01 for real odds)
	if win1x2.Win1.Value > 0 && win1x2.Win1.Value < 1.01 {
		win1x2.Win1.Value = 0
	}
	if win1x2.Win2.Value > 0 && win1x2.Win2.Value < 1.01 {
		win1x2.Win2.Value = 0
	}
	if win1x2.WinNone.Value > 0 && win1x2.WinNone.Value < 1.01 {
		win1x2.WinNone.Value = 0
	}
}

// cleanYesNo validates Yes/No odds and removes empty structs
func cleanYesNo(yesNo **entity.YesNo) {
	if yesNo == nil || *yesNo == nil {
		return
	}

	if (*yesNo).Yes.Value > 0 && (*yesNo).Yes.Value < 1.01 {
		(*yesNo).Yes.Value = 0
	}
	if (*yesNo).No.Value > 0 && (*yesNo).No.Value < 1.01 {
		(*yesNo).No.Value = 0
	}

	if (*yesNo).Yes.Value <= 0 && (*yesNo).No.Value <= 0 {
		*yesNo = nil
	}
}

// cleanDoubleChance validates double chance odds and removes empty structs
func cleanDoubleChance(dc **entity.DoubleChanceStruct) {
	if dc == nil || *dc == nil {
		return
	}

	if (*dc).W1X.Value > 0 && (*dc).W1X.Value < 1.01 {
		(*dc).W1X.Value = 0
	}
	if (*dc).WX2.Value > 0 && (*dc).WX2.Value < 1.01 {
		(*dc).WX2.Value = 0
	}
	if (*dc).W12.Value > 0 && (*dc).W12.Value < 1.01 {
		(*dc).W12.Value = 0
	}

	if (*dc).W1X.Value <= 0 && (*dc).WX2.Value <= 0 && (*dc).W12.Value <= 0 {
		*dc = nil
	}
}

// cleanDrawNoBet validates draw no bet odds and removes empty structs
func cleanDrawNoBet(dnb **entity.DrawNoBetStruct) {
	if dnb == nil || *dnb == nil {
		return
	}

	if (*dnb).Home.Value > 0 && (*dnb).Home.Value < 1.01 {
		(*dnb).Home.Value = 0
	}
	if (*dnb).Away.Value > 0 && (*dnb).Away.Value < 1.01 {
		(*dnb).Away.Value = 0
	}

	if (*dnb).Home.Value <= 0 && (*dnb).Away.Value <= 0 {
		*dnb = nil
	}
}

// CountOutcomes counts total number of valid outcomes in a game
func CountOutcomes(game *entity.ResponseGame) int {
	if game == nil {
		return 0
	}

	count := 0
	for _, period := range game.Periods {
		// Win1x2
		if period.Win1x2.Win1.Value > 0 {
			count++
		}
		if period.Win1x2.Win2.Value > 0 {
			count++
		}
		if period.Win1x2.WinNone.Value > 0 {
			count++
		}

		// Totals
		for _, data := range period.Totals {
			if data != nil {
				if data.WinMore.Value > 0 {
					count++
				}
				if data.WinLess.Value > 0 {
					count++
				}
			}
		}

		// Handicap
		for _, data := range period.Handicap {
			if data != nil {
				if data.Win1.Value > 0 {
					count++
				}
				if data.Win2.Value > 0 {
					count++
				}
			}
		}

		// ThreeWayHandicap
		for _, data := range period.ThreeWayHandicap {
			if data != nil {
				if data.Home.Value > 0 {
					count++
				}
				if data.Draw.Value > 0 {
					count++
				}
				if data.Away.Value > 0 {
					count++
				}
			}
		}

		// FirstTeamTotals
		for _, data := range period.FirstTeamTotals {
			if data != nil {
				if data.WinMore.Value > 0 {
					count++
				}
				if data.WinLess.Value > 0 {
					count++
				}
			}
		}

		// SecondTeamTotals
		for _, data := range period.SecondTeamTotals {
			if data != nil {
				if data.WinMore.Value > 0 {
					count++
				}
				if data.WinLess.Value > 0 {
					count++
				}
			}
		}

		// Games
		for _, data := range period.Games {
			if data != nil {
				if data.Win1.Value > 0 {
					count++
				}
				if data.Win2.Value > 0 {
					count++
				}
				if data.WinNone.Value > 0 {
					count++
				}
			}
		}

		// SetsTotal
		for _, data := range period.SetsTotal {
			if data != nil {
				if data.WinMore.Value > 0 {
					count++
				}
				if data.WinLess.Value > 0 {
					count++
				}
			}
		}

		// SetsHandicap
		for _, data := range period.SetsHandicap {
			if data != nil {
				if data.Win1.Value > 0 {
					count++
				}
				if data.Win2.Value > 0 {
					count++
				}
			}
		}

		// BTTS
		if period.BTTS != nil {
			if period.BTTS.Yes.Value > 0 {
				count++
			}
			if period.BTTS.No.Value > 0 {
				count++
			}
		}

		// Odd/Even
		if period.OddEven != nil {
			if period.OddEven.Yes.Value > 0 {
				count++
			}
			if period.OddEven.No.Value > 0 {
				count++
			}
		}

		// Double Chance
		if period.DoubleChance != nil {
			if period.DoubleChance.W1X.Value > 0 {
				count++
			}
			if period.DoubleChance.WX2.Value > 0 {
				count++
			}
			if period.DoubleChance.W12.Value > 0 {
				count++
			}
		}

		// Draw No Bet
		if period.DrawNoBet != nil {
			if period.DrawNoBet.Home.Value > 0 {
				count++
			}
			if period.DrawNoBet.Away.Value > 0 {
				count++
			}
		}
	}

	return count
}
