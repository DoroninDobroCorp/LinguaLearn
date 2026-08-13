package entity

import "time"

type RequestedOdds struct {
}

type EventOdds struct {
	H    MatchInfo
	P    map[string]interface{}
	R    map[string]interface{}
	S    []map[string]interface{}
	M    []Outcome
	Last time.Time
}

type Outcome struct {
	MS string `json:"MS"`
	B  string `json:"B"`
	S  []Odd
}

type Odd struct {
	N int64   `json:"N"`
	O float64 `json:"O"`
}
