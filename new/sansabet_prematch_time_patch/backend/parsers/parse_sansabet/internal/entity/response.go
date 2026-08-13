package entity

import "time"

const ParserName = "Sansabet"

// SportName moved to sport.go

type ResponseGame struct {
	// Get from matches
	Pid        int64  `json:"Pid"`
	LeagueName string `json:"LeagueName"`
	HomeName   string `json:"homeName"`
	AwayName   string `json:"awayName"`
	MatchId    string `json:"MatchId"`
	IsLive     bool   `json:"isLive"`

	// Get from odds
	HomeScore float64          `json:"HomeScore"`
	AwayScore float64          `json:"AwayScore"`
	HasScore  bool             `json:"HasScore"`
	Periods   []ResponsePeriod `json:"Periods"`

	// Get from config
	Source        string    `json:"Source"`
	SportName     SportName `json:"SportName"`
	CreatedAt     time.Time `json:"CreatedAt"`
	LastUpdatedAt time.Time `json:"LastUpdatedAt"` // Время последнего обновления odds
	MatchDate     time.Time `json:"matchDate,omitempty"` // Scheduled start time (prematch filtering)
	TraceID       string    `json:"trace_id,omitempty"`

	Raw EventRaw `json:"Raw"`
}

type ResponsePeriod struct {
	Win1x2           Win1x2Struct             `json:"Win1x2"`
	Games            map[string]*Win1x2Struct `json:"Games"`
	Totals           map[string]*WinLessMore  `json:"Totals"`
	Handicap         map[string]*WinHandicap  `json:"Handicap"`
	ThreeWayHandicap  map[string]*ThreeWayHcap `json:"ThreeWayHandicap,omitempty"`
	FirstTeamTotals  map[string]*WinLessMore  `json:"FirstTeamTotals"`
	SecondTeamTotals map[string]*WinLessMore  `json:"SecondTeamTotals"`

	// Additional markets (new)
	DoubleChance *DoubleChanceStruct     `json:"DoubleChance,omitempty"`
	DrawNoBet    *DrawNoBetStruct        `json:"DrawNoBet,omitempty"`
	BTTS         *YesNo                  `json:"BTTS,omitempty"`         // Both Teams To Score (GG/NG)
	OddEven      *YesNo                  `json:"OddEven,omitempty"`      // Total Odd/Even
	SetsTotal    map[string]*WinLessMore `json:"SetsTotal,omitempty"`    // Tennis/Volleyball sets
	SetsHandicap map[string]*WinHandicap `json:"SetsHandicap,omitempty"` // Tennis/Volleyball sets handicap

	// Extended markets
	HalfTimeFullTime  map[string]*OddValue         `json:"HalfTimeFullTime,omitempty"`  // HT/FT combos (1/1, 1/X, etc.)
	FirstTeamToScore  *FirstTeamToScoreStruct       `json:"FirstTeamToScore,omitempty"`  // First goal scorer side
	CorrectScore      map[string]*OddValue          `json:"CorrectScore,omitempty"`      // Correct Score ("1:0", "0:0", etc.)
	ExactTotalGoals   map[string]*OddValue          `json:"ExactTotalGoals,omitempty"`   // Exact Total Goals ("1", "2", "3", "4")
	TotalGoalsRange   map[string]*OddValue          `json:"TotalGoalsRange,omitempty"`   // Total Goals Range ("1-2", "2-3", etc.)
	HomeExactGoals    map[string]*OddValue          `json:"HomeExactGoals,omitempty"`    // Home Exact Goals ("0", "1", "2", "3")
	AwayExactGoals    map[string]*OddValue          `json:"AwayExactGoals,omitempty"`    // Away Exact Goals ("0", "1", "2", "3")
	HomeWinToNil      *YesNo                        `json:"HomeWinToNil,omitempty"`      // Home Win To Nil
	AwayWinToNil      *YesNo                        `json:"AwayWinToNil,omitempty"`      // Away Win To Nil
	EitherTeamToScore *YesNo                        `json:"EitherTeamToScore,omitempty"` // Either Team To Score
	WinnerTotalCombo  map[string]*OddValue          `json:"WinnerTotalCombo,omitempty"`  // Winner+Total combo ("H1 O2.5", etc.)
	BTTSTotalCombo    map[string]*OddValue          `json:"BTTSTotalCombo,omitempty"`    // BTTS+Total combo ("Yes & Over 2.5", etc.)
	BTTSWinnerCombo   map[string]*OddValue          `json:"BTTSWinnerCombo,omitempty"`   // BTTS+Winner combo ("Yes & Home", etc.)

	// Player props (basketball, etc.)
	PlayerProps []PlayerProp `json:"PlayerProps,omitempty"`
}

// YesNo represents Yes/No type markets (BTTS, Odd/Even, etc.)
type YesNo struct {
	Yes OddValue `json:"Yes"`
	No  OddValue `json:"No"`
}

// DoubleChance for Football (1X, 12, X2)
type DoubleChanceStruct struct {
	W1X OddValue `json:"W1X"` // Home or Draw
	W12 OddValue `json:"W12"` // Home or Away (no Draw)
	WX2 OddValue `json:"WX2"` // Draw or Away
}

// DrawNoBet (DNB) for Football (Home/Away)
type DrawNoBetStruct struct {
	Home OddValue `json:"Home"`
	Away OddValue `json:"Away"`
}

// FirstTeamToScoreStruct represents which team scores first
type FirstTeamToScoreStruct struct {
	Home    OddValue `json:"Home"`
	Away    OddValue `json:"Away"`
	Neither OddValue `json:"Neither"`
}

type ThreeWayHcap struct {
	Home OddValue `json:"Home"`
	Draw OddValue `json:"Draw"`
	Away OddValue `json:"Away"`
}

// PlayerProp represents a player-specific prop bet (points, rebounds, assists, etc.)
type PlayerProp struct {
	PlayerName string  `json:"PlayerName"`
	Market     string  `json:"Market"` // "Points", "Rebounds", "Assists", "3PT", etc.
	Line       float64 `json:"Line"`
	Over       OddValue `json:"Over"`
	Under      OddValue `json:"Under"`
}

type WinHandicap struct {
	Win1 OddValue `json:"Win1"`
	Win2 OddValue `json:"Win2"`
}

type WinLessMore struct {
	WinMore OddValue `json:"WinMore"`
	WinLess OddValue `json:"WinLess"`
}

type Win1x2Struct struct {
	Win1    OddValue `json:"Win1"`
	WinNone OddValue `json:"WinNone"`
	Win2    OddValue `json:"Win2"`
}

type OddValue struct {
	Value float64     `json:"value"`
	Raw   interface{} `json:"raw"`
}

type EventRaw struct {
	MatchName    string      `json:"match_name"`
	FullEvent    interface{} `json:"full_event,omitempty"`
	AllPeriods   interface{} `json:"all_periods,omitempty"`
}

type OddRaw struct {
	Line        string `json:"line"`
	BetNum      int64  `json:"bet_num"`
	MarketType  string `json:"market_type,omitempty"`
	OutcomeType string `json:"outcome_type,omitempty"`
	PeriodIndex int    `json:"period_index"`
}
