package entity

import "time"

// PendingLeaguePair - лига в очереди на ручную проверку
type PendingLeaguePair struct {
	ID          string    `json:"id"`           // UUID
	Timestamp   time.Time `json:"timestamp"`
	Status      string    `json:"status"`       // "pending", "approved", "rejected"
	
	// Информация о паре
	BK1LeagueID   int64    `json:"bk1_league_id"`
	BK2LeagueID   int64    `json:"bk2_league_id"`
	BK1LeagueName string   `json:"bk1_league_name"`
	BK2LeagueName string   `json:"bk2_league_name"`
	BK1Bookmaker  string   `json:"bk1_bookmaker"`
	BK2Bookmaker  string   `json:"bk2_bookmaker"`
	SportName     string   `json:"sport_name"`
	
	// Образцы команд для проверки
	SampleTeams1 []string `json:"sample_teams_1"`
	SampleTeams2 []string `json:"sample_teams_2"`
	
	// LLM решение
	Confidence float64 `json:"confidence"` // 0.0-1.0
	Reason     string  `json:"reason"`
	LLMProvider string `json:"llm_provider"`
	
	// Решение пользователя
	ReviewedBy string    `json:"reviewed_by,omitempty"`
	ReviewedAt time.Time `json:"reviewed_at,omitempty"`
	RejectReason string  `json:"reject_reason,omitempty"` // Если отклонено, причина
}

// PendingTeamPair - команда в очереди на ручную проверку
type PendingTeamPair struct {
	ID          string    `json:"id"`        // UUID
	Timestamp   time.Time `json:"timestamp"`
	Status      string    `json:"status"`    // "pending", "approved", "rejected"
	
	// Информация о паре
	BK1TeamID   int64  `json:"bk1_team_id"`
	BK2TeamID   int64  `json:"bk2_team_id"`
	BK1TeamName string `json:"bk1_team_name"`
	BK2TeamName string `json:"bk2_team_name"`
	BK1Bookmaker string `json:"bk1_bookmaker"`
	BK2Bookmaker string `json:"bk2_bookmaker"`
	
	// Контекст (лига)
	LeaguePairID int   `json:"league_pair_id"`
	BK1LeagueName string `json:"bk1_league_name"`
	BK2LeagueName string `json:"bk2_league_name"`
	SportName     string `json:"sport_name"`
	
	// LLM решение
	Confidence float64 `json:"confidence"` // 0.0-1.0
	Reason     string  `json:"reason"`
	LLMProvider string `json:"llm_provider"`
	
	// Решение пользователя
	ReviewedBy string    `json:"reviewed_by,omitempty"`
	ReviewedAt time.Time `json:"reviewed_at,omitempty"`
	RejectReason string  `json:"reject_reason,omitempty"`
}
