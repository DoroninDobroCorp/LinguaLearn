package repository

import (
	"context"
	"fmt"
	"livebets/auto_matcher/internal/entity"
	"livebets/auto_matcher/pkg/rdbms"

	"github.com/jackc/pgx/v5"
)

type MatchStorage interface {
	GetUnMatchedTeamsByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (teams []entity.UnMatchedTeamsByLeaguesPG, err error)
	GetMatchedTeamsByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (teams []entity.MatchedTeamsByLeaguesPG, err error)

	CheckTeams(ctx context.Context, firstTeamID, secondTeamID int64) (bool, error)
	CheckTeamsPair(ctx context.Context, firstTeamID, secondTeamID int64) (bool, error)
	InsertTeamsPair(ctx context.Context, firstTeamID, secondTeamID int64) error

	CheckLeagues(ctx context.Context, firstLeagueID, secondLeagueID int64) (bool, error)
	CheckLeaguesPair(ctx context.Context, firstLeagueID, secondLeagueID int64) (bool, error)
	InsertLeaguesPair(ctx context.Context, firstLeagueID, secondLeagueID int64) error

	GetUnMachedLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (leagues []entity.League, err error)
	GetMatchedLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (leagues []entity.LeagueMatchPG, err error)
	GetAllLeaguesByBookmaker(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (leagues []entity.League, err error)

	GetBookmakers(ctx context.Context) (bookmakers []string, err error)
	GetSports(ctx context.Context) (sports []string, err error)

	GetUnMachedLeaguesByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string, inputLeagues, inputTeams []string) (leagues []entity.League, err error)
	GetUnMatchedTeamsByLeaguesByTeams(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string, inputLeagues, inputTeams []string) (teams []entity.UnMatchedTeamsByLeaguesPG, err error)

	// Методы для LLM matcher (не зависят от analyzer live data)
	CheckLeaguePairExists(ctx context.Context, sportName, bookmakerName, leagueName, otherBookmakerName string) (bool, error)
	CheckTeamPairExists(ctx context.Context, leagueID int64, teamName string, otherLeagueID int64) (bool, error)
	GetAllUnmatchedTeamsByLeaguePairs(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (teams []entity.UnMatchedTeamsByLeaguesPG, err error)

	// Методы для управления парами лиг через UI
	GetAllLeaguePairs(ctx context.Context, page, limit int, sportFilter, bookmakerFilter string) (pairs []entity.LeaguePairFull, total int64, err error)
	DeleteLeaguePairWithCascade(ctx context.Context, pairID int64) error
	BulkDeleteLeaguePairs(ctx context.Context, pairIDs []int64) error

	// Методы для получения команд
	GetTeamNamesByLeagueID(ctx context.Context, leagueID int64) ([]string, error)
	GetLeagueIDsWithPairs(ctx context.Context, leagueIDs []int64) (map[int64]bool, error)

	// Метод для проверки статуса маппинга
	GetMappingStatus(ctx context.Context, bookmaker, sport, league, homeTeam, awayTeam string) (*entity.MappingStatus, error)
}

type MatchPGStorage struct {
	handler rdbms.Executor
}

func NewHandMatchPGStorage(handler rdbms.Executor) MatchStorage {
	return &MatchPGStorage{
		handler: handler,
	}
}

func (m *MatchPGStorage) GetBookmakers(ctx context.Context) (bookmakers []string, err error) {
	query := fmt.Sprintf(`SELECT DISTINCT bookmaker_name FROM %s;`, LeaguesTable)
	rows, err := m.handler.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var bookmaker string

		if err = rows.Scan(&bookmaker); err != nil {
			return nil, err
		}

		bookmakers = append(bookmakers, bookmaker)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetSports(ctx context.Context) (sports []string, err error) {
	query := fmt.Sprintf(`SELECT DISTINCT sport_name FROM %s;`, LeaguesTable)
	rows, err := m.handler.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var sport string

		if err = rows.Scan(&sport); err != nil {
			return nil, err
		}

		sports = append(sports, sport)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetUnMachedLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (leagues []entity.League, err error) {
	query := fmt.Sprintf(`
		SELECT DISTINCT l.id, l.bookmaker_name, l.sport_name, l.league_name
		FROM %s AS l
        LEFT JOIN %s AS lm ON l.id = lm.league1_id OR l.id = lm.league2_id
        LEFT JOIN %s AS l2 ON l2.id = lm.league1_id OR l2.id = lm.league2_id
		WHERE l.sport_name = $1 AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3) 
    	AND ((l2.bookmaker_name <> $2 AND l2.bookmaker_name <> $3) OR lm.id IS NULL)
	`, LeaguesTable, LeaguesMergeTable, LeaguesTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var league entity.League

		err = rows.Scan(
			&league.ID,
			&league.BookmakerName,
			&league.SportName,
			&league.LeagueName,
		)
		if err != nil {
			return nil, err
		}

		leagues = append(leagues, league)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetMatchedLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (leagues []entity.LeagueMatchPG, err error) {
	query := fmt.Sprintf(`
		SELECT l.id, l.bookmaker_name, l.sport_name, l.league_name, lm.id
		FROM %s AS l
		INNER JOIN %s AS lm ON l.id = lm.league1_id OR l.id = lm.league2_id
		WHERE l.sport_name = $1 AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3)
	`, LeaguesTable, LeaguesMergeTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var league entity.LeagueMatchPG

		err = rows.Scan(
			&league.ID,
			&league.BookmakerName,
			&league.SportName,
			&league.LeagueName,
			&league.LeagueMatchID,
		)
		if err != nil {
			return nil, err
		}

		leagues = append(leagues, league)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetAllLeaguesByBookmaker(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (leagues []entity.League, err error) {
	query := fmt.Sprintf(`
		SELECT l.id, l.bookmaker_name, l.sport_name, l.league_name FROM %s AS l
		WHERE l.sport_name = $1 AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3)
	`, LeaguesTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var league entity.League

		err = rows.Scan(
			&league.ID,
			&league.BookmakerName,
			&league.SportName,
			&league.LeagueName,
		)
		if err != nil {
			return nil, err
		}

		leagues = append(leagues, league)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetUnMatchedTeamsByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (teams []entity.UnMatchedTeamsByLeaguesPG, err error) {
	query := fmt.Sprintf(`
		SELECT l.id, l.bookmaker_name, l.sport_name, l.league_name, lm.id, t.id, t.team_name
		FROM %s AS l
		INNER JOIN %s AS lm ON l.id = lm.league1_id OR l.id = lm.league2_id
		INNER JOIN %s AS t ON l.id = t.league_id
		LEFT JOIN %s AS tm ON t.id = tm.team1_id OR t.id = tm.team2_id
        LEFT JOIN %s AS t2 ON t2.id = tm.team1_id OR t2.id = tm.team2_id
        LEFT JOIN %s AS l2 ON l2.id = t2.league_id
		WHERE l.sport_name = $1 AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3)
        AND ((l2.bookmaker_name <> $2 AND l2.bookmaker_name <> $3) OR tm.uuid IS NULL)
	`, LeaguesTable, LeaguesMergeTable, TeamsTable, TeamsMergeTable, TeamsTable, LeaguesTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var team entity.UnMatchedTeamsByLeaguesPG

		err = rows.Scan(
			&team.LeagueID,
			&team.BookmakerName,
			&team.SportName,
			&team.LeagueName,
			&team.LeagueMatchID,
			&team.TeamID,
			&team.TeamName,
		)
		if err != nil {
			return nil, err
		}

		teams = append(teams, team)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetMatchedTeamsByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) (teams []entity.MatchedTeamsByLeaguesPG, err error) {
	query := fmt.Sprintf(`
		SELECT l.id, l.bookmaker_name, l.sport_name, l.league_name, lm.id, t.id, t.team_name, tm.uuid
		FROM %s AS l
		INNER JOIN %s AS lm ON l.id = lm.league1_id OR l.id = lm.league2_id
		INNER JOIN %s AS t ON l.id = t.league_id
		INNER JOIN %s AS tm ON t.id = tm.team1_id OR t.id = tm.team2_id
		WHERE l.sport_name = $1 AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3);
	`, LeaguesTable, LeaguesMergeTable, TeamsTable, TeamsMergeTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var team entity.MatchedTeamsByLeaguesPG

		err = rows.Scan(
			&team.LeagueID,
			&team.BookmakerName,
			&team.SportName,
			&team.LeagueName,
			&team.LeagueMatchID,
			&team.TeamID,
			&team.TeamName,
			&team.TeamMatch,
		)
		if err != nil {
			return nil, err
		}

		teams = append(teams, team)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) CheckTeams(ctx context.Context, firstTeamID, secondTeamID int64) (bool, error) {
	query := fmt.Sprintf(`
		SELECT id FROM %s WHERE id IN ($1, $2)
	`, TeamsTable)

	rows, err := m.handler.Query(ctx, query, firstTeamID, secondTeamID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64

		if err = rows.Scan(&id); err != nil {
			return false, err
		}

		ids = append(ids, id)
	}

	if err = rows.Err(); err != nil {
		return false, err
	}

	if len(ids) != 2 {
		return false, nil
	}

	return true, nil
}

func (m *MatchPGStorage) CheckTeamsPair(ctx context.Context, firstTeamID, secondTeamID int64) (bool, error) {
	query := fmt.Sprintf(`
		SELECT EXISTS(
			SELECT 1 FROM %s
			WHERE (team1_id = $1 AND team2_id = $2) OR (team1_id = $2 AND team2_id = $1)
		)
	`, TeamsMergeTable)

	var exists bool
	err := m.handler.QueryRow(ctx, query, firstTeamID, secondTeamID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (m *MatchPGStorage) InsertTeamsPair(ctx context.Context, firstTeamID, secondTeamID int64) error {
	query := fmt.Sprintf("INSERT INTO %s (team1_id, team2_id) VALUES ($1, $2)", TeamsMergeTable)
	_, err := m.handler.Exec(ctx, query, firstTeamID, secondTeamID)
	if err != nil {
		return err
	}
	return nil
}

func (m *MatchPGStorage) CheckLeagues(ctx context.Context, firstLeagueID, secondLeagueID int64) (bool, error) {
	query := fmt.Sprintf(`
		SELECT id FROM %s WHERE id IN ($1, $2)
	`, LeaguesTable)

	rows, err := m.handler.Query(ctx, query, firstLeagueID, secondLeagueID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64

		if err = rows.Scan(&id); err != nil {
			return false, err
		}

		ids = append(ids, id)
	}

	if err = rows.Err(); err != nil {
		return false, err
	}

	if len(ids) != 2 {
		return false, nil
	}

	return true, nil
}

func (m *MatchPGStorage) CheckLeaguesPair(ctx context.Context, firstLeagueID, secondLeagueID int64) (bool, error) {
	query := fmt.Sprintf(`
		SELECT EXISTS(
			SELECT 1 FROM %s
			WHERE (league1_id = $1 AND league2_id = $2) OR (league1_id = $2 AND league2_id = $1)
		)
	`, LeaguesMergeTable)

	var exists bool
	err := m.handler.QueryRow(ctx, query, firstLeagueID, secondLeagueID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (m *MatchPGStorage) InsertLeaguesPair(ctx context.Context, firstLeagueID, secondLeagueID int64) error {
	query := fmt.Sprintf("INSERT INTO %s (league1_id, league2_id) VALUES ($1, $2)", LeaguesMergeTable)
	_, err := m.handler.Exec(ctx, query, firstLeagueID, secondLeagueID)
	if err != nil {
		return err
	}
	return nil
}

func (m *MatchPGStorage) GetUnMachedLeaguesByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string, inputLeagues, inputTeams []string) (leagues []entity.League, err error) {
	query := fmt.Sprintf(`
		SELECT DISTINCT l.id, l.bookmaker_name, l.sport_name, l.league_name
		FROM %s AS l
		INNER JOIN %s AS t ON l.id = t.league_id
		WHERE l.sport_name = $1
		  AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3)
		  AND l.league_name = ANY ($4)
		  AND t.team_name = ANY ($5)
		  AND NOT EXISTS (
			SELECT 1
			FROM %s AS lm
			INNER JOIN %s AS l2 ON (l2.id = lm.league1_id OR l2.id = lm.league2_id) AND l2.id != l.id
			WHERE (lm.league1_id = l.id OR lm.league2_id = l.id)
			  AND l2.bookmaker_name IN ($2, $3)
			  AND l2.bookmaker_name != l.bookmaker_name
		  )
	`, LeaguesTable, TeamsTable, LeaguesMergeTable, LeaguesTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName, inputLeagues, inputTeams)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var league entity.League

		err = rows.Scan(
			&league.ID,
			&league.BookmakerName,
			&league.SportName,
			&league.LeagueName,
		)
		if err != nil {
			return nil, err
		}

		leagues = append(leagues, league)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

func (m *MatchPGStorage) GetUnMatchedTeamsByLeaguesByTeams(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string, inputLeagues, inputTeams []string) (teams []entity.UnMatchedTeamsByLeaguesPG, err error) {
	// Fixed: Check if team is matched within the SAME league pair, not just by name
	// Old logic: excluded teams if (league_name, team_name) was matched with ANY team from other bookmaker
	// New logic: exclude teams only if matched with team from the PAIRED league (via leagues_merge)
	query := fmt.Sprintf(`
		SELECT DISTINCT l.id, l.bookmaker_name, l.sport_name, l.league_name, lm.id, t.id, t.team_name
		FROM %s AS l
		LEFT JOIN %s AS t ON l.id = t.league_id
		LEFT JOIN %s AS lm ON l.id = lm.league1_id OR l.id = lm.league2_id
		LEFT JOIN %s AS l2 ON (l2.id = lm.league1_id OR l2.id = lm.league2_id) AND l2.id != l.id
		WHERE l.sport_name = $1 
		  AND (l.bookmaker_name = $2 OR l.bookmaker_name = $3)
		  AND (l2.bookmaker_name = $2 OR l2.bookmaker_name = $3)
		  AND l2.bookmaker_name != l.bookmaker_name
		  AND l.league_name = ANY ($4)
		  AND t.team_name = ANY ($5)
		  AND lm.id IS NOT NULL
		  AND NOT EXISTS (
		      SELECT 1
		      FROM %s AS tm_check
		      INNER JOIN %s AS t_other ON 
		          (tm_check.team1_id = t.id AND tm_check.team2_id = t_other.id) OR
		          (tm_check.team2_id = t.id AND tm_check.team1_id = t_other.id)
		      WHERE t_other.league_id = l2.id
		  )
	`, LeaguesTable, TeamsTable, LeaguesMergeTable, LeaguesTable, TeamsMergeTable, TeamsTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName, inputLeagues, inputTeams)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var team entity.UnMatchedTeamsByLeaguesPG

		err = rows.Scan(
			&team.LeagueID,
			&team.BookmakerName,
			&team.SportName,
			&team.LeagueName,
			&team.LeagueMatchID,
			&team.TeamID,
			&team.TeamName,
		)
		if err != nil {
			return nil, err
		}

		teams = append(teams, team)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

// CheckLeaguePairExists проверяет существует ли пара лиг в БД (для LLM matcher)
// НЕ зависит от live данных analyzer
func (m *MatchPGStorage) CheckLeaguePairExists(ctx context.Context, sportName, bookmakerName, leagueName, otherBookmakerName string) (bool, error) {
	query := fmt.Sprintf(`
		SELECT EXISTS(
			SELECT 1
			FROM %s l1
			INNER JOIN %s lm ON l1.id = lm.league1_id OR l1.id = lm.league2_id
			INNER JOIN %s l2 ON (l2.id = lm.league1_id OR l2.id = lm.league2_id) AND l2.id != l1.id
			WHERE l1.sport_name = $1 
			  AND l1.bookmaker_name = $2 
			  AND l1.league_name = $3
			  AND l2.bookmaker_name = $4
		)
	`, LeaguesTable, LeaguesMergeTable, LeaguesTable)

	var exists bool
	err := m.handler.QueryRow(ctx, query, sportName, bookmakerName, leagueName, otherBookmakerName).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

// CheckTeamPairExists проверяет существует ли пара команд в БД (для LLM matcher)
// НЕ зависит от live данных analyzer
func (m *MatchPGStorage) CheckTeamPairExists(ctx context.Context, leagueID int64, teamName string, otherLeagueID int64) (bool, error) {
	query := fmt.Sprintf(`
		SELECT EXISTS(
			SELECT 1
			FROM %s t1
			INNER JOIN %s tm ON t1.id = tm.team1_id OR t1.id = tm.team2_id
			INNER JOIN %s t2 ON (t2.id = tm.team1_id OR t2.id = tm.team2_id) AND t2.id != t1.id
			WHERE t1.league_id = $1 
			  AND t1.team_name = $2
			  AND t2.league_id = $3
		)
	`, TeamsTable, TeamsMergeTable, TeamsTable)

	var exists bool
	err := m.handler.QueryRow(ctx, query, leagueID, teamName, otherLeagueID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

// GetAllUnmatchedTeamsByLeaguePairs возвращает ВСЕ unmatched команды из БД (для LLM matcher)
// НЕ зависит от live данных analyzer - работает с БД напрямую
func (m *MatchPGStorage) GetAllUnmatchedTeamsByLeaguePairs(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) ([]entity.UnMatchedTeamsByLeaguesPG, error) {
	query := fmt.Sprintf(`
		WITH league_pairs AS (
			SELECT DISTINCT
				lm.id as league_match_id,
				l1.id as league1_id,
				l1.league_name as league1_name,
				l1.bookmaker_name as bookmaker1_name,
				l2.id as league2_id,
				l2.league_name as league2_name,
				l2.bookmaker_name as bookmaker2_name
			FROM %s lm
			INNER JOIN %s l1 ON lm.league1_id = l1.id
			INNER JOIN %s l2 ON lm.league2_id = l2.id
			WHERE l1.sport_name = $1
			  AND ((l1.bookmaker_name = $2 AND l2.bookmaker_name = $3) 
			    OR (l1.bookmaker_name = $3 AND l2.bookmaker_name = $2))
		)
		SELECT DISTINCT
			t.id as team_id,
			t.team_name,
			t.league_id,
			l.bookmaker_name,
			l.league_name,
			lp.league_match_id
		FROM %s t
		INNER JOIN %s l ON t.league_id = l.id
		INNER JOIN league_pairs lp ON (t.league_id = lp.league1_id OR t.league_id = lp.league2_id)
		LEFT JOIN %s tm ON t.id = tm.team1_id OR t.id = tm.team2_id
		WHERE tm.uuid IS NULL
		ORDER BY lp.league_match_id, l.bookmaker_name, t.team_name
	`, LeaguesMergeTable, LeaguesTable, LeaguesTable, TeamsTable, LeaguesTable, TeamsMergeTable)

	rows, err := m.handler.Query(ctx, query, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	var teams []entity.UnMatchedTeamsByLeaguesPG
	for rows.Next() {
		var team entity.UnMatchedTeamsByLeaguesPG
		err = rows.Scan(
			&team.TeamID,
			&team.TeamName,
			&team.LeagueID,
			&team.BookmakerName,
			&team.LeagueName,
			&team.LeagueMatchID,
		)
		if err != nil {
			return nil, err
		}
		teams = append(teams, team)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return teams, nil
}

// GetAllLeaguePairs возвращает все пары лиг с пагинацией и фильтрами
func (m *MatchPGStorage) GetAllLeaguePairs(ctx context.Context, page, limit int, sportFilter, bookmakerFilter string) (pairs []entity.LeaguePairFull, total int64, err error) {
	offset := (page - 1) * limit

	// Базовый запрос для подсчёта
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM %s lm
		JOIN %s l1 ON lm.league1_id = l1.id
		JOIN %s l2 ON lm.league2_id = l2.id
		WHERE 1=1
	`, LeaguesMergeTable, LeaguesTable, LeaguesTable)

	// Базовый запрос для данных
	dataQuery := fmt.Sprintf(`
		SELECT 
			lm.id,
			l1.id as league1_id,
			l1.league_name as league1_name,
			l1.bookmaker_name as league1_bookmaker,
			l2.id as league2_id,
			l2.league_name as league2_name,
			l2.bookmaker_name as league2_bookmaker,
			l1.sport_name,
			lm.created_at,
			COALESCE((
				SELECT COUNT(*)
				FROM %s tm
				JOIN %s t1 ON tm.team1_id = t1.id
				JOIN %s t2 ON tm.team2_id = t2.id
				WHERE (t1.league_id = l1.id AND t2.league_id = l2.id)
				   OR (t1.league_id = l2.id AND t2.league_id = l1.id)
			), 0) as team_pairs_count
		FROM %s lm
		JOIN %s l1 ON lm.league1_id = l1.id
		JOIN %s l2 ON lm.league2_id = l2.id
		WHERE 1=1
	`, TeamsMergeTable, TeamsTable, TeamsTable, LeaguesMergeTable, LeaguesTable, LeaguesTable)

	args := []interface{}{}
	argIndex := 1

	// Добавляем фильтры
	if sportFilter != "" {
		filter := fmt.Sprintf(" AND l1.sport_name = $%d", argIndex)
		countQuery += filter
		dataQuery += filter
		args = append(args, sportFilter)
		argIndex++
	}

	if bookmakerFilter != "" {
		filter := fmt.Sprintf(" AND (l1.bookmaker_name = $%d OR l2.bookmaker_name = $%d)", argIndex, argIndex)
		countQuery += filter
		dataQuery += filter
		args = append(args, bookmakerFilter)
		argIndex++
	}

	// Получаем общее количество
	err = m.handler.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Добавляем сортировку и пагинацию
	dataQuery += fmt.Sprintf(" ORDER BY lm.created_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limit, offset)

	rows, err := m.handler.Query(ctx, dataQuery, args...)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []entity.LeaguePairFull{}, total, nil
		}
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var pair entity.LeaguePairFull
		var createdAt interface{}

		err = rows.Scan(
			&pair.ID,
			&pair.League1ID,
			&pair.League1Name,
			&pair.League1Bookmaker,
			&pair.League2ID,
			&pair.League2Name,
			&pair.League2Bookmaker,
			&pair.SportName,
			&createdAt,
			&pair.TeamPairsCount,
		)
		if err != nil {
			return nil, 0, err
		}

		// Форматируем дату
		if t, ok := createdAt.(interface{ Format(string) string }); ok {
			pair.CreatedAt = t.Format("2006-01-02 15:04:05")
		}

		pairs = append(pairs, pair)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, err
	}

	if pairs == nil {
		pairs = []entity.LeaguePairFull{}
	}

	return pairs, total, nil
}

// DeleteLeaguePairWithCascade удаляет пару лиг и все связанные пары команд
func (m *MatchPGStorage) DeleteLeaguePairWithCascade(ctx context.Context, pairID int64) error {
	// Сначала получаем league_id для удаления связанных команд
	var league1ID, league2ID int64
	query := fmt.Sprintf(`SELECT league1_id, league2_id FROM %s WHERE id = $1`, LeaguesMergeTable)
	err := m.handler.QueryRow(ctx, query, pairID).Scan(&league1ID, &league2ID)
	if err != nil {
		return fmt.Errorf("league pair not found: %w", err)
	}

	// Удаляем связанные пары команд (симметрично — оба направления)
	deleteTeamsQuery := fmt.Sprintf(`
		DELETE FROM %s 
		WHERE (team1_id IN (SELECT id FROM %s WHERE league_id = $1)
		       AND team2_id IN (SELECT id FROM %s WHERE league_id = $2))
		   OR (team1_id IN (SELECT id FROM %s WHERE league_id = $2)
		       AND team2_id IN (SELECT id FROM %s WHERE league_id = $1))
	`, TeamsMergeTable, TeamsTable, TeamsTable, TeamsTable, TeamsTable)

	// Выполняем оба DELETE через batch для атомарности
	batch := &pgx.Batch{}
	batch.Queue(deleteTeamsQuery, league1ID, league2ID)
	batch.Queue(fmt.Sprintf(`DELETE FROM %s WHERE id = $1`, LeaguesMergeTable), pairID)

	br := m.handler.SendBatch(ctx, batch)
	defer br.Close()

	if _, err := br.Exec(); err != nil {
		return fmt.Errorf("failed to delete team pairs: %w", err)
	}
	if _, err := br.Exec(); err != nil {
		return fmt.Errorf("failed to delete league pair: %w", err)
	}

	return nil
}

// BulkDeleteLeaguePairs удаляет несколько пар лиг с каскадным удалением команд
func (m *MatchPGStorage) BulkDeleteLeaguePairs(ctx context.Context, pairIDs []int64) error {
	if len(pairIDs) == 0 {
		return nil
	}

	for _, pairID := range pairIDs {
		if err := m.DeleteLeaguePairWithCascade(ctx, pairID); err != nil {
			return fmt.Errorf("failed to delete pair %d: %w", pairID, err)
		}
	}

	return nil
}

// GetTeamNamesByLeagueID returns all team names for a given league ID
func (m *MatchPGStorage) GetTeamNamesByLeagueID(ctx context.Context, leagueID int64) ([]string, error) {
	query := fmt.Sprintf(`SELECT DISTINCT team_name FROM %s WHERE league_id = $1 ORDER BY team_name`, TeamsTable)
	rows, err := m.handler.Query(ctx, query, leagueID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	var teams []string
	for rows.Next() {
		var teamName string
		if err = rows.Scan(&teamName); err != nil {
			return nil, err
		}
		teams = append(teams, teamName)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return teams, nil
}

// GetMappingStatus checks if league and teams are mapped to Pinnacle
func (m *MatchPGStorage) GetMappingStatus(ctx context.Context, bookmaker, sport, league, homeTeam, awayTeam string) (*entity.MappingStatus, error) {
	result := &entity.MappingStatus{}

	// Check if league is mapped to Pinnacle
	leagueQuery := fmt.Sprintf(`
		SELECT 
			l1.id,
			l2.league_name as pinnacle_league
		FROM %s l1
		INNER JOIN %s lm ON l1.id = lm.league1_id OR l1.id = lm.league2_id
		INNER JOIN %s l2 ON (l2.id = lm.league1_id OR l2.id = lm.league2_id) AND l2.id != l1.id
		WHERE l1.sport_name = $1 
		  AND l1.bookmaker_name = $2 
		  AND l1.league_name = $3
		  AND l2.bookmaker_name = 'Pinnacle'
		LIMIT 1
	`, LeaguesTable, LeaguesMergeTable, LeaguesTable)

	var leagueID int64
	var pinnacleLeague string
	err := m.handler.QueryRow(ctx, leagueQuery, sport, bookmaker, league).Scan(&leagueID, &pinnacleLeague)
	if err != nil {
		if err == pgx.ErrNoRows {
			result.LeagueMapped = false
			result.HomeTeamMapped = false
			result.AwayTeamMapped = false
			return result, nil
		}
		return nil, err
	}

	result.LeagueMapped = true
	result.PinnacleLeague = pinnacleLeague

	// Get Pinnacle league ID for team checks
	pinnacleLeagueQuery := fmt.Sprintf(`
		SELECT l2.id
		FROM %s l1
		INNER JOIN %s lm ON l1.id = lm.league1_id OR l1.id = lm.league2_id
		INNER JOIN %s l2 ON (l2.id = lm.league1_id OR l2.id = lm.league2_id) AND l2.id != l1.id
		WHERE l1.id = $1 AND l2.bookmaker_name = 'Pinnacle'
		LIMIT 1
	`, LeaguesTable, LeaguesMergeTable, LeaguesTable)

	var pinnacleLeagueID int64
	err = m.handler.QueryRow(ctx, pinnacleLeagueQuery, leagueID).Scan(&pinnacleLeagueID)
	if err != nil {
		return nil, err
	}

	// Check home team mapping
	homeTeamQuery := fmt.Sprintf(`
		SELECT 
			t2.team_name as pinnacle_team
		FROM %s t1
		INNER JOIN %s tm ON t1.id = tm.team1_id OR t1.id = tm.team2_id
		INNER JOIN %s t2 ON (t2.id = tm.team1_id OR t2.id = tm.team2_id) AND t2.id != t1.id
		WHERE t1.league_id = $1 
		  AND t1.team_name = $2
		  AND t2.league_id = $3
		LIMIT 1
	`, TeamsTable, TeamsMergeTable, TeamsTable)

	var pinnacleHomeTeam string
	err = m.handler.QueryRow(ctx, homeTeamQuery, leagueID, homeTeam, pinnacleLeagueID).Scan(&pinnacleHomeTeam)
	if err != nil {
		if err != pgx.ErrNoRows {
			return nil, err
		}
		result.HomeTeamMapped = false
	} else {
		result.HomeTeamMapped = true
		result.PinnacleHomeTeam = pinnacleHomeTeam
	}

	// Check away team mapping
	var pinnacleAwayTeam string
	err = m.handler.QueryRow(ctx, homeTeamQuery, leagueID, awayTeam, pinnacleLeagueID).Scan(&pinnacleAwayTeam)
	if err != nil {
		if err != pgx.ErrNoRows {
			return nil, err
		}
		result.AwayTeamMapped = false
	} else {
		result.AwayTeamMapped = true
		result.PinnacleAwayTeam = pinnacleAwayTeam
	}

	return result, nil
}

func (m *MatchPGStorage) GetLeagueIDsWithPairs(ctx context.Context, leagueIDs []int64) (map[int64]bool, error) {
	if len(leagueIDs) == 0 {
		return map[int64]bool{}, nil
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT league_id FROM (
			SELECT league1_id AS league_id FROM %s WHERE league1_id = ANY($1)
			UNION
			SELECT league2_id AS league_id FROM %s WHERE league2_id = ANY($1)
		) sub
	`, LeaguesMergeTable, LeaguesMergeTable)

	rows, err := m.handler.Query(ctx, query, leagueIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64]bool)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result[id] = true
	}
	return result, rows.Err()
}
