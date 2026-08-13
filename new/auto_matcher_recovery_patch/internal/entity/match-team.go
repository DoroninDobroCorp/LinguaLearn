package entity

type MatchedTeamsByLeaguesPG struct {
	LeagueID      int64  `json:"leagueID"`
	BookmakerName string `json:"bookmakerName"`
	SportName     string `json:"sportName"`
	LeagueName    string `json:"leagueName"`
	LeagueMatchID int64  `json:"leagueMatchID"`
	TeamID        int64  `json:"teamID"`
	TeamName      string `json:"teamName"`
	TeamMatch     string `json:"teamMatch"`
}

type MatchedTeamsPairResponse struct {
	LeagueIDFirst       int64       `json:"leagueIDFirst"`
	LeagueIDSecond      int64       `json:"leagueIDSecond"`
	BookmakerNameFirst  string      `json:"bookmakerNameFirst"`
	BookmakerNameSecond string      `json:"bookmakerNameSecond"`
	LeagueNameFirst     string      `json:"leagueNameFirst"`
	LeagueNameSecond    string      `json:"leagueNameSecond"`
	TeamsPair           []TeamsPair `json:"teamsPair"`
	SportName           string      `json:"sportName"`
}

type TeamsPair struct {
	TeamIDFirst    int64  `json:"teamIDFirst"`
	TeamNameFirst  string `json:"teamNameFirst"`
	TeamIDSecond   int64  `json:"teamIDSecond"`
	TeamNameSecond string `json:"teamNameSecond"`
}
