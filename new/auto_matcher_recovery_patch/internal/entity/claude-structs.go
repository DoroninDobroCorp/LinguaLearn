package entity

type RequestLeagues struct {
	BK1Leagues []League `json:"BK1_leagues"`
	BK2Leagues []League `json:"BK2_leagues"`
}

// LeagueWithSamples - лига с образцами команд для улучшенного матчинга
type LeagueWithSamples struct {
	ID            int64    `json:"id"`
	BookmakerName string   `json:"bookmakerName"`
	SportName     string   `json:"sportName"`
	LeagueName    string   `json:"leagueName"`
	SampleTeams   []string `json:"sampleTeams"` // Примеры 3-5 команд из лиги
}

// RequestLeaguesWithSamples - запрос для матчинга лиг с примерами команд
type RequestLeaguesWithSamples struct {
	BK1Leagues []LeagueWithSamples `json:"BK1_leagues"`
	BK2Leagues []LeagueWithSamples `json:"BK2_leagues"`
}

type ResponsePairLeague struct {
	BK1LeagueID int64   `json:"BK1_league_id"`
	BK2LeagueID int64   `json:"BK2_league_id"`
	Confidence  float64 `json:"confidence"`  // 0.0-1.0, уровень уверенности LLM
	Reason      string  `json:"reason"`      // Объяснение почему эта пара предложена
}

// LeagueValidationRequest - запрос для проверки предложенной пары лиг
type LeagueValidationRequest struct {
	League1Name string   `json:"league1_name"`
	League2Name string   `json:"league2_name"`
	Teams1      []string `json:"teams1_sample"`
	Teams2      []string `json:"teams2_sample"`
}

// LeagueValidationResponse - ответ валидации (YES/NO + причина)
type LeagueValidationResponse struct {
	IsValid bool   `json:"is_valid"`
	Reason  string `json:"reason"`
}

type RequestTeams struct {
	BK1Teams []UnMatchedTeam `json:"BK1_teams"`
	BK2Teams []UnMatchedTeam `json:"BK2_teams"`
}

type ResponsePairTeam struct {
	BK1TeamID int64 `json:"BK1_team_id"`
	BK2TeamID int64 `json:"BK2_team_id"`
}

// Batch team matching structures
type LeaguePairWithTeams struct {
	PairID         int    `json:"pair_id"`
	BK1LeagueID    int64  `json:"bk1_league_id"`
	BK2LeagueID    int64  `json:"bk2_league_id"`
	BK1LeagueName  string `json:"bk1_league_name"`
	BK2LeagueName  string `json:"bk2_league_name"`
	BK1Teams       []UnMatchedTeam `json:"bk1_teams"`
	BK2Teams       []UnMatchedTeam `json:"bk2_teams"`
}

type RequestTeamsBatch struct {
	LeaguePairs []LeaguePairWithTeams `json:"league_pairs"`
}

type ResponsePairTeamBatch struct {
	BK1TeamName string  `json:"BK1_team_name"` // ИЗМЕНЕНО: Название команды вместо ID
	BK2TeamName string  `json:"BK2_team_name"` // ИЗМЕНЕНО: Название команды вместо ID
	PairID      int     `json:"pair_id"`
	Confidence  float64 `json:"confidence"` // 0.0-1.0, уровень уверенности LLM
	Reason      string  `json:"reason"`     // Объяснение почему эта пара предложена
}
