package domain

import "time"

// GameData represents a game with odds from a bookmaker
type GameData struct {
	// Match identification
	Pid        int64  `json:"Pid"`
	MatchId    string `json:"MatchId"`
	LeagueName string `json:"LeagueName"`
	HomeName   string `json:"homeName"`
	AwayName   string `json:"awayName"`
	IsLive     bool   `json:"isLive"`

	// Current score
	HomeScore float64 `json:"HomeScore"`
	AwayScore float64 `json:"AwayScore"`
	HasScore  bool    `json:"HasScore"`

	// Odds data
	Periods []PeriodData `json:"Periods"`

	// Metadata
	Source    Parser    `json:"Source"`
	SportName SportName `json:"SportName"`
	CreatedAt time.Time `json:"CreatedAt"`
	TraceID   string    `json:"trace_id,omitempty"`

	// Raw data from bookmaker API (for debugging)
	Raw interface{} `json:"Raw,omitempty"`
}
