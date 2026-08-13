package entity

import "time"

type Outcome struct {
	Outcome    string  `json:"outcome" validate:"required,min=1"`
	ROI        float64 `json:"roi"`
	Margin     float64 `json:"margin"`
	Score1     Odd     `json:"score1" validate:"required"`
	Score2     Odd     `json:"score2" validate:"required"`
	MarketType int     `json:"marketType"`
	OutcomeAge float64 `json:"outcomeAge"`
}

type Odd struct {
	Value float64     `json:"value" validate:"gte=0"`
	Raw   interface{} `json:"raw"`
}

type Match struct {
	Bookmaker  string    `json:"bookmaker" validate:"required,min=2"`
	LeagueName string    `json:"leagueName" validate:"required,min=2"`
	HomeScore  float64   `json:"homeScore" validate:"gte=0"`
	AwayScore  float64   `json:"awayScore" validate:"gte=0"`
	HomeName   string    `json:"homeName" validate:"required,min=2"`
	AwayName   string    `json:"awayName" validate:"required,min=2"`
	MatchID    string    `json:"matchId" validate:"required,min=1"`
	CreatedAt  time.Time `json:"createdAt"`
	MatchDate  time.Time `json:"matchDate,omitempty"` // Scheduled start time (CLV capture)
}

type Pair struct {
	First     Match     `json:"first" validate:"required"`
	Second    Match     `json:"second" validate:"required"`
	Outcome   []Outcome `json:"outcome" validate:"required,min=1,dive"`
	IsLive    bool      `json:"isLive"`
	SportName string    `json:"sportName" validate:"required,min=2"`
	CreatedAt time.Time `json:"createdAt"`
	TraceID   string    `json:"trace_id,omitempty"`
}

type PairOneOutcome struct {
	First     Match     `json:"first" validate:"required"`
	Second    Match     `json:"second" validate:"required"`
	Outcome   Outcome   `json:"outcome" validate:"required"`
	IsLive    bool      `json:"isLive"`
	SportName string    `json:"sportName" validate:"required,min=2"`
	CreatedAt time.Time `json:"createdAt"`
	TraceID   string    `json:"trace_id,omitempty"`
}
