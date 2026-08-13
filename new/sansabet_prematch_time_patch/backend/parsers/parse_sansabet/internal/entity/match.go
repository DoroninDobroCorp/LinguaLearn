package entity

import "time"

type RequestedEvent struct {
	H    MatchInfo
	P    map[string]interface{}
	R    map[string]interface{}
	S    []map[string]interface{}
	M    []interface{}
	Last time.Time
}

type MatchInfo struct {
	SLID       int64     `json:"SLID"`
	ID         int64     `json:"PID"`
	Starts     time.Time `json:"Pocetok"`
	MatchName  string    `json:"ParNaziv"`
	LeagueName string    `json:"LigaNaziv"`
	Country    string    `json:"NG"`
	SportId    string    `json:"S"`
	MS         string    `json:"MS"`
	TM         int       `json:"TM"` // Current period: 1=1st half, 2=2nd half (Soccer)
}
