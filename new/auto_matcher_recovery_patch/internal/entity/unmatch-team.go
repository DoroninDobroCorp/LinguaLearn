package entity

type UnMatchedTeamsByLeaguesPG struct {
	LeagueID      int64  `json:"leagueID"`
	BookmakerName string `json:"bookmakerName"`
	SportName     string `json:"sportName"`
	LeagueName    string `json:"leagueName"`
	LeagueMatchID int64  `json:"leagueMatchID"`
	TeamID        int64  `json:"teamID"`
	TeamName      string `json:"teamName"`
}

type UnMatchedTeamsPairResponse struct {
	LeagueIDFirst       int64           `json:"leagueIDFirst"`
	LeagueIDSecond      int64           `json:"leagueIDSecond"`
	BookmakerNameFirst  string          `json:"bookmakerNameFirst"`
	BookmakerNameSecond string          `json:"bookmakerNameSecond"`
	LeagueNameFirst     string          `json:"leagueNameFirst"`
	LeagueNameSecond    string          `json:"leagueNameSecond"`
	TeamsFirst          []UnMatchedTeam `json:"teamsFirst"`
	TeamsSecond         []UnMatchedTeam `json:"teamsSecond"`
	SportName           string          `json:"sportName"`
}

type UnMatchedTeamsPair struct {
	LeagueIDFirst       int64                   `json:"leagueIDFirst"`
	LeagueIDSecond      int64                   `json:"leagueIDSecond"`
	BookmakerNameFirst  string                  `json:"bookmakerNameFirst"`
	BookmakerNameSecond string                  `json:"bookmakerNameSecond"`
	LeagueNameFirst     string                  `json:"leagueNameFirst"`
	LeagueNameSecond    string                  `json:"leagueNameSecond"`
	TeamsFirst          map[int64]UnMatchedTeam `json:"teamsFirst"`
	TeamsSecond         map[int64]UnMatchedTeam `json:"teamsSecond"`
	SportName           string                  `json:"sportName"`
}

type UnMatchedTeam struct {
	TeamID   int64  `json:"teamID"`
	TeamName string `json:"teamName"`
}
