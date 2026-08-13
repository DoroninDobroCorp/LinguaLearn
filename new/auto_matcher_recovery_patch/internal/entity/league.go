package entity

type League struct {
	ID            int64  `json:"id"`
	BookmakerName string `json:"bookmakerName"`
	SportName     string `json:"sportName"`
	LeagueName    string `json:"leagueName"`
}

type LeagueMatchPG struct {
	ID            int64  `json:"id"`
	BookmakerName string `json:"bookmakerName"`
	SportName     string `json:"sportName"`
	LeagueName    string `json:"leagueName"`
	LeagueMatchID int64  `json:"leaguesMatchID"`
}

type LeaguesMatchPair struct {
	LeagueIDFirst       int64  `json:"leagueIDFirst"`
	LeagueIDSecond      int64  `json:"leagueIDSecond"`
	BookmakerNameFirst  string `json:"bookmakerNameFirst"`
	BookmakerNameSecond string `json:"bookmakerNameSecond"`
	LeagueNameFirst     string `json:"leagueNameFirst"`
	LeagueNameSecond    string `json:"leagueNameSecond"`
	SportName           string `json:"sportName"`
}

// LeaguePairFull - полная информация о паре лиг для UI управления
type LeaguePairFull struct {
	ID                  int64  `json:"id"`
	League1ID           int64  `json:"league1Id"`
	League1Name         string `json:"league1Name"`
	League1Bookmaker    string `json:"league1Bookmaker"`
	League2ID           int64  `json:"league2Id"`
	League2Name         string `json:"league2Name"`
	League2Bookmaker    string `json:"league2Bookmaker"`
	SportName           string `json:"sportName"`
	CreatedAt           string `json:"createdAt"`
	TeamPairsCount      int    `json:"teamPairsCount"`
}

// LeaguePairsResponse - ответ с пагинацией для списка пар лиг
type LeaguePairsResponse struct {
	Pairs      []LeaguePairFull `json:"pairs"`
	Total      int64            `json:"total"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
	TotalPages int              `json:"totalPages"`
}

// LeagueWithTeams - лига с командами для hover tooltip
type LeagueWithTeams struct {
	ID            int64    `json:"id"`
	BookmakerName string   `json:"bookmakerName"`
	SportName     string   `json:"sportName"`
	LeagueName    string   `json:"leagueName"`
	Teams         []string `json:"teams"`
	HasPair       bool     `json:"hasPair"`
}

// MappingStatus - статус маппинга лиги и команд с Pinnacle
type MappingStatus struct {
	LeagueMapped     bool   `json:"leagueMapped"`
	HomeTeamMapped   bool   `json:"homeTeamMapped"`
	AwayTeamMapped   bool   `json:"awayTeamMapped"`
	PinnacleLeague   string `json:"pinnacleLeague,omitempty"`
	PinnacleHomeTeam string `json:"pinnacleHomeTeam,omitempty"`
	PinnacleAwayTeam string `json:"pinnacleAwayTeam,omitempty"`
}
