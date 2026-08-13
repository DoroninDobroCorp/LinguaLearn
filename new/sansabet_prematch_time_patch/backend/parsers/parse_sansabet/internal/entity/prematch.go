package entity

// ASP.NET Prematch API structures (Oblozuvanje.aspx endpoints)

// GetSportoviSoLigi response
type PrematchSport struct {
	SID int    `json:"SID"` // Sport ID (0=Football, 22=Basketball, 37=Tennis)
	G   int    `json:"G"`   // Alternative sport ID field
	SN  string `json:"SN"`  // Sport name
	L   []PrematchLeague `json:"L"` // Leagues
	S   []PrematchSubSport `json:"S"` // Sub-sports with leagues
}

type PrematchSubSport struct {
	SID int              `json:"SID"`
	L   []PrematchLeague `json:"L"`
}

type PrematchLeague struct {
	LID int    `json:"LID"` // League ID
	NW  string `json:"NW"`  // League name
	PC  int    `json:"PC"`  // Pairs/matches count
}

// GetLiga response
type PrematchLeagueData struct {
	LID int            `json:"LID"`
	LN  string         `json:"LN"` // League name
	SID int            `json:"SID"`
	P   []PrematchPair `json:"P"` // Pairs/matches
}

type PrematchPair struct {
	PID  int64         `json:"PID"`  // Pair/match ID
	PN   string        `json:"PN"`   // Pair name "Team1 : Team2"
	DP   string        `json:"DP"`   // Date/time
	DI   string        `json:"DI"`   // Display info
	S    int           `json:"S"`    // Status
	LN   string        `json:"LN"`   // League name
	IPID int64         `json:"IPID"` // Internal pair ID
	T    []PrematchOdd `json:"T"`    // Basic odds
}

type PrematchOdd struct {
	K   float64 `json:"K"`   // Coefficient/odds value
	TP  string  `json:"TP"`  // Tip type/name
	TID int     `json:"TID"` // Tip ID
	IN  string  `json:"IN"`  // Info
}

// GetTipoviV2 response (full odds for a match)
type PrematchTipovi struct {
	IgraNaziv string              `json:"IgraNaziv"` // Market name
	ID        int                 `json:"ID"`
	PID       int64               `json:"PID"`
	T         []PrematchTipoviOdd `json:"T"`
}

type PrematchTipoviOdd struct {
	ID       int64   `json:"ID"`
	ParID    int64   `json:"ParID"`
	Kvota    float64 `json:"Kvota"`    // Odds value
	TipVnes  string  `json:"TipVnes"`  // Tip type (string)
	TipID    int64   `json:"TipID"`    // Tip ID (numeric, same as live API)
	Znak     string  `json:"Znak"`     // Sign (+/-)
	ParNaziv string  `json:"ParNaziv"` // Pair name
	G        float64 `json:"G"`        // Granica (line/handicap value)
}

// Prematch Sport IDs (from GetSportoviSoLigi API)
const (
	PrematchSportFootball   = 0
	PrematchSportBasketball = 22
	PrematchSportTennis     = 37
	PrematchSportHockey     = 8
	PrematchSportHandball   = 7
	PrematchSportVolleyball = 38
	PrematchSportEsports    = 52
)
