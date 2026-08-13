package domain

// ============================================================================
// CANONICAL DATA FORMAT - ALL PARSERS MUST FOLLOW THIS SPECIFICATION!
// ============================================================================
//
// ГЛАВНОЕ ПРАВИЛО: Парсеры отправляют данные "КАК ЕСТЬ" (as-is)!
//
// НЕ ДЕЛАТЬ в парсерах:
//   - НЕ конвертировать Double Chance в Handicap ±0.5
//   - НЕ конвертировать Draw No Bet в Handicap 0.0
//   - НЕ конвертировать Correct Score в Totals
//   - НЕ конвертировать First Team To Score в Totals
//   - НЕ конвертировать Winning Margin в Handicap
//   - НЕ конвертировать Team To Score в Individual Totals
//   - НЕ конвертировать 3-Way Handicap в Asian Handicap
//
// Все эквивалентности обрабатываются в Analyzer (equivalences.go)!
// Парсер просто заполняет соответствующие структуры данными букмекера.
//
// ============================================================================
// GameData.Periods[] - Array of period data:
// ============================================================================
//
//   Periods[0] = FULL MATCH (основной матч)
//     - Soccer:     90 минут (без дополнительного времени)
//     - Basketball: ВКЛЮЧАЯ ОВЕРТАЙМ! (to match Pinnacle period 0)
//     - Tennis:     Весь матч (все сеты)
//     - Volleyball: Весь матч (все сеты)
//     - Handball:   60 минут основного времени
//
//   Periods[1] = 1st Half / 1st Quarter / Set 1
//   Periods[2] = 2nd Half / 2nd Quarter / Set 2
//   Periods[3] = 3rd Quarter / Set 3 (Basketball/Tennis only)
//   Periods[4] = 4th Quarter / Set 4 (Basketball/Tennis only)
//   Periods[5] = Set 5 (Tennis only)
//
// ============================================================================
// BASKETBALL CRITICAL: Periods[0] MUST include overtime!
// ============================================================================
//
// Pinnacle uses "including overtime" for period 0 in basketball.
// If your bookmaker has separate markets:
//   - "Match Winner (incl. OT)" → Periods[0].Win1x2
//   - "Match Winner (regular time)" → DO NOT USE for Periods[0]!
//
// ============================================================================
// KEY NORMALIZATION RULES:
// ============================================================================
//
// Totals/Handicap keys MUST be normalized:
//   - Use "2.5" not "2.50" or "2,5"
//   - Use "-1.5" not "-1.50" or "-1,5"
//   - Format: fmt.Sprintf("%.1f", value)
//
// Win1x2:
//   - Win1 = HOME team wins
//   - Win2 = AWAY team wins
//   - WinNone = Draw
//
// ============================================================================
// КУДА ЗАПИСЫВАТЬ МАРКЕТЫ:
// ============================================================================
//
// ОСНОВНЫЕ:
// Win1x2            → 1X2):   Win1, WinNone (ничья), Win2
// Handicap          → Asian Handicap (key: "-1.5", "+0.5"):   Win1, Win2
// Totals            → Total Goals (key: "2.5", "3.5"):   WinMore (over), WinLess (under)
// FirstTeamTotals   → IT1 (key: "0.5", "1.5"):   WinMore, WinLess
// SecondTeamTotals  → IT2 (key: "0.5", "1.5"):   WinMore, WinLess
//
// ТЕННИС:
// SetsTotal         → Sets Total (key: "2.5"):   WinMore, WinLess
// SetsHandicap      → Sets Handicap (key: "-1.5"):   Win1, Win2
// Games             → Games Handicap/Total by set (key: "Set 1", etc.)
//
// CORNERS (Soccer):
// CornersTotal            → (key: "9.5"):   WinMore, WinLess
// CornersHandicap         → (key: "-1.5"):   Win1, Win2
// CornersFirstTeamTotal   → IT1 Corners (key: "4.5")
// CornersSecondTeamTotal  → IT2 Corners (key: "4.5")
//
// BOOKINGS/CARDS (Soccer):
// BookingsTotal           → (key: "3.5"):   WinMore, WinLess
// BookingsHandicap        → (key: "-0.5"):   Win1, Win2
// BookingsFirstTeamTotal  → IT1 Cards (key: "1.5")
// BookingsSecondTeamTotal → IT2 Cards (key: "1.5")
//
// SPECIALS (Yes/No):
// BTTS              → Both Teams To Score:   Yes, No
// OddEven           → Total Goals Odd/Even:   Yes (odd), No (even)
// HomeOddEven       → Home Goals Odd/Even:   Yes (odd), No (even)
// AwayOddEven       → Away Goals Odd/Even:   Yes (odd), No (even)
// HomeTeamToScore   → Home Team To Score:   Yes, No
// AwayTeamToScore   → Away Team To Score:   Yes, No
// EitherTeamToScore → Either Team To Score:   Yes, No
// HomeWinToNil      → Home Win To Nil:   Yes, No
// AwayWinToNil      → Away Win To Nil:   Yes, No
//
// SPECIALS (НЕ КОНВЕРТИРОВАТЬ!):
// DoubleChance      → (1X, X2, 12):   W1X, WX2, W12
// DrawNoBet         → Draw No Bet:   Home, Away
// FirstTeamToScore  → First Team To Score:   Home, Away, Neither
// ThreeWayHandicap  → 3-Way Handicap (key: "-1", "+2"):   Home, Draw, Away
// CorrectScore      → Correct Score (key: "1:0", "0:0", "2:1")
// WinningMargin     → Winning Margin (key: "Home By 1", "Away By 2+", "Draw")
//
// OTHER SPECIALS:
// HalfTimeFullTime  → HT/FT (key: "1/1", "1/X", "X/2", "2/1", etc.)
// TotalGoalsRange   → Total Goals Range (key: "0-1", "2-3", "4-6", "7+")
// ExactTotalGoals   → Exact Total Goals (key: "0", "1", "2", "3", "4", "5", "6+")
// HomeExactGoals    → Home Exact Goals (key: "0", "1", "2", "3+")
// AwayExactGoals    → Away Exact Goals (key: "0", "1", "2", "3+")
// ToQualify         → To Qualify (Cup):   Home, Away
// MethodOfVictory   → Method of Victory (key: "Home RT", "Away ET", "Home Pen")
//
// COMBO MARKETS:
// WinnerTotalCombo  → Winner + Total (key: "Home & Over 2.5", "Away & Under 3.5")
// BTTSWinnerCombo   → BTTS + Winner (key: "Yes & Home", "No & Draw")
// BTTSTotalCombo    → BTTS + Total (key: "Yes & Over 2.5", "No & Under 1.5")
// OddEvenTotalCombo → Odd/Even + Total (key: "Odd & Over 2.5")
//
// PLAYER PROPS (Basketball, NFL, MLB):
// PlayerProps[]     → PlayerName, Market ("Points", "Rebounds"), Line, Over, Under
//
// ============================================================================

// PeriodData represents odds for a specific period (full match, half, quarter, etc.)
// See CANONICAL DATA FORMAT documentation above for correct usage!
type PeriodData struct {
	Win1x2           Win1x2Struct             `json:"Win1x2"`
	Games            map[string]*Win1x2Struct `json:"Games"`
	Totals           map[string]*WinLessMore  `json:"Totals"`
	Handicap         map[string]*WinHandicap  `json:"Handicap"`
	FirstTeamTotals  map[string]*WinLessMore  `json:"FirstTeamTotals"`
	SecondTeamTotals map[string]*WinLessMore  `json:"SecondTeamTotals"`

	// Sets markets (Tennis only)
	// Total sets (e.g., 2.5 = match goes to 3 sets)
	// Handicap sets (e.g., -1.5 = player must win 2:0)
	SetsTotal    map[string]*WinLessMore `json:"SetsTotal,omitempty"`
	SetsHandicap map[string]*WinHandicap `json:"SetsHandicap,omitempty"`

	// Corners markets (Soccer only)
	// These are populated from separate "Corners" events in Pinnacle
	// or from corner-specific markets in other bookmakers
	CornersTotal           map[string]*WinLessMore `json:"CornersTotal,omitempty"`
	CornersHandicap        map[string]*WinHandicap `json:"CornersHandicap,omitempty"`
	CornersFirstTeamTotal  map[string]*WinLessMore `json:"CornersFirstTeamTotal,omitempty"`
	CornersSecondTeamTotal map[string]*WinLessMore `json:"CornersSecondTeamTotal,omitempty"`

	// Bookings/Cards markets (Soccer only)
	// These are populated from separate "Bookings" events in Pinnacle
	BookingsTotal           map[string]*WinLessMore `json:"BookingsTotal,omitempty"`
	BookingsHandicap        map[string]*WinHandicap `json:"BookingsHandicap,omitempty"`
	BookingsFirstTeamTotal  map[string]*WinLessMore `json:"BookingsFirstTeamTotal,omitempty"`
	BookingsSecondTeamTotal map[string]*WinLessMore `json:"BookingsSecondTeamTotal,omitempty"`

	// Specials / Game Props (from Pinnacle /v1/odds/special or other bookmakers)
	// All fields use omitempty for backward compatibility
	BTTS         *YesNo              `json:"BTTS,omitempty"`         // Both Teams To Score
	OddEven      *YesNo              `json:"OddEven,omitempty"`      // Odd/Even total goals
	HomeOddEven  *YesNo              `json:"HomeOddEven,omitempty"`  // Home Team Goals Odd/Even
	AwayOddEven  *YesNo              `json:"AwayOddEven,omitempty"`  // Away Team Goals Odd/Even
	DoubleChance *DoubleChanceStruct `json:"DoubleChance,omitempty"` // 1X, X2, 12

	// Additional Specials (Soccer)
	DrawNoBet         *DrawNoBetStruct         `json:"DrawNoBet,omitempty"`         // Draw No Bet (Home/Away)
	FirstTeamToScore  *FirstTeamToScoreStruct  `json:"FirstTeamToScore,omitempty"`  // First Team To Score (Home/Away/Neither)
	CorrectScore      map[string]*Odd          `json:"CorrectScore,omitempty"`      // Correct Score (key: "1:0", "2:1", etc.)
	HalfTimeFullTime  map[string]*Odd          `json:"HalfTimeFullTime,omitempty"`  // HT/FT (key: "1/1", "1/X", "X/2", etc.)
	WinningMargin     map[string]*Odd          `json:"WinningMargin,omitempty"`     // Winning Margin (key: "Home By 1", "Away By 2+", etc.)
	TotalGoalsRange   map[string]*Odd          `json:"TotalGoalsRange,omitempty"`   // Total Goals Range (key: "0-1", "2-3", "4+", etc.)
	ExactTotalGoals   map[string]*Odd          `json:"ExactTotalGoals,omitempty"`   // Exact Total Goals (key: "0", "1", "2", etc.)
	HomeExactGoals    map[string]*Odd          `json:"HomeExactGoals,omitempty"`    // Home Team Exact Goals (key: "0", "1", "2", etc.)
	AwayExactGoals    map[string]*Odd          `json:"AwayExactGoals,omitempty"`    // Away Team Exact Goals (key: "0", "1", "2", etc.)
	HomeTeamToScore   *YesNo                   `json:"HomeTeamToScore,omitempty"`   // Home Team To Score?
	AwayTeamToScore   *YesNo                   `json:"AwayTeamToScore,omitempty"`   // Away Team To Score?
	HomeWinToNil      *YesNo                   `json:"HomeWinToNil,omitempty"`      // Home To Win To Nil?
	AwayWinToNil      *YesNo                   `json:"AwayWinToNil,omitempty"`      // Away To Win To Nil?
	EitherTeamToScore *YesNo                   `json:"EitherTeamToScore,omitempty"` // Either Team To Score?
	ToQualify         *DrawNoBetStruct         `json:"ToQualify,omitempty"`         // To Qualify (Cup matches)
	MethodOfVictory   map[string]*Odd          `json:"MethodOfVictory,omitempty"`   // Method of Victory (key: "Home Regular Time", "Away Extra Time", "Home Penalties", etc.)
	ThreeWayHandicap  map[string]*ThreeWayHcap `json:"ThreeWayHandicap,omitempty"`  // 3-Way Handicap (key: "-1", "+2", etc.)
	WinnerTotalCombo    map[string]*Odd          `json:"WinnerTotalCombo,omitempty"`    // Winner/Total combo (key: "Home & Over 2.5", etc.)
	BTTSWinnerCombo     map[string]*Odd          `json:"BTTSWinnerCombo,omitempty"`     // BTTS/Winner combo (key: "Yes & Home", etc.)
	BTTSTotalCombo      map[string]*Odd          `json:"BTTSTotalCombo,omitempty"`      // BTTS/Total combo (key: "Yes & Over 2.5", etc.)
	OddEvenTotalCombo   map[string]*Odd          `json:"OddEvenTotalCombo,omitempty"`   // Odd/Even + Total combo (key: "Odd & Over 2.5", etc.)

	// Player Props (Basketball, etc.)
	PlayerProps []PlayerProp `json:"PlayerProps,omitempty"`
}

// PlayerProp represents a player-specific prop bet
type PlayerProp struct {
	PlayerName string  `json:"PlayerName"`
	Market     string  `json:"Market"` // "Points", "Rebounds", "Assists", "3PT", "Pts+Rebs+Asts", etc.
	Line       float64 `json:"Line"`
	Over       Odd     `json:"Over"`
	Under      Odd     `json:"Under"`
}

// YesNo represents Yes/No type bets (BTTS, Odd/Even, etc.)
type YesNo struct {
	Yes Odd `json:"Yes"`
	No  Odd `json:"No"`
}

// DrawNoBetStruct represents Draw No Bet / To Qualify odds
type DrawNoBetStruct struct {
	Home Odd `json:"Home"`
	Away Odd `json:"Away"`
}

// FirstTeamToScoreStruct represents First Team To Score odds
type FirstTeamToScoreStruct struct {
	Home    Odd `json:"Home"`
	Away    Odd `json:"Away"`
	Neither Odd `json:"Neither"`
}

// ThreeWayHcap represents 3-Way Handicap odds (Home, Draw, Away with handicap applied)
type ThreeWayHcap struct {
	Home Odd `json:"Home"`
	Draw Odd `json:"Draw"`
	Away Odd `json:"Away"`
}

// DoubleChanceStruct represents double chance odds (1X, X2, 12)
type DoubleChanceStruct struct {
	W1X Odd `json:"W1X"` // Home or Draw
	WX2 Odd `json:"WX2"` // Draw or Away
	W12 Odd `json:"W12"` // Home or Away
}

// WinHandicap represents handicap odds
type WinHandicap struct {
	Win1 Odd `json:"Win1"`
	Win2 Odd `json:"Win2"`
}

// WinLessMore represents over/under (totals) odds
type WinLessMore struct {
	WinMore Odd `json:"WinMore"`
	WinLess Odd `json:"WinLess"`
}

// Win1x2Struct represents 1X2 (match result) odds
type Win1x2Struct struct {
	Win1    Odd `json:"Win1"`
	WinNone Odd `json:"WinNone"`
	Win2    Odd `json:"Win2"`
}

// Odd represents a single betting odd
type Odd struct {
	Value float64     `json:"value"`
	Mixed bool        `json:"mixed,omitempty"` // true если цена перезаписана из другого источника (используем def маржу)
	Raw   interface{} `json:"raw,omitempty"`
}
