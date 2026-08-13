package service

import (
	"context"
	"fmt"
	"livebets/auto_matcher/cmd/config"
	"livebets/auto_matcher/internal/api"
	"livebets/auto_matcher/internal/entity"
	"livebets/auto_matcher/internal/repository"
	"livebets/auto_matcher/pkg/rdbms"

	"github.com/rs/zerolog"
)

type OnlineMatcherService struct {
	txStorage           rdbms.TxStorage[repository.MatchStorage]
	analyzerAPI         *api.AnalizerAPI
	analyzerPrematchAPI *api.AnalizerPrematchAPI
	logger              *zerolog.Logger
}

// GetCurrentMatchData returns the same Analyzer dataset that the current
// matcher mode uses. Safety checks must never validate prematch candidates
// against the live cache (or vice versa).
func (o *OnlineMatcherService) GetCurrentMatchData(traceID string) ([]entity.MatchData, error) {
	if config.GetMode() == "prematch" {
		return o.analyzerPrematchAPI.GetOnlineMatchData(traceID)
	}
	return o.analyzerAPI.GetOnlineMatchData(traceID)
}

func NewOnlineMatcherService(
	txStorage rdbms.TxStorage[repository.MatchStorage],
	analyzerAPI *api.AnalizerAPI,
	analyzerPrematchAPI *api.AnalizerPrematchAPI,
	logger *zerolog.Logger,
) *OnlineMatcherService {
	return &OnlineMatcherService{
		txStorage:           txStorage,
		analyzerAPI:         analyzerAPI,
		analyzerPrematchAPI: analyzerPrematchAPI,
		logger:              logger,
	}
}

// extractMatchData extracts league and team names from match data for specific bookmakers and sport
// Returns empty arrays if one or both bookmakers are NOT in live data (prevents matching with stale DB data)
func extractMatchData(matchData []entity.MatchData, firstBookmakerName, secondBookmakerName, sportName string) (matchLeagues []string, matchTeams []string) {
	hasFirst := false
	hasSecond := false

	for _, val := range matchData {
		if val.SportName == sportName {
			if val.Bookmaker == firstBookmakerName {
				hasFirst = true
				matchLeagues = append(matchLeagues, val.LeagueName)
				matchTeams = append(matchTeams, val.HomeName, val.AwayName)
			}
			if val.Bookmaker == secondBookmakerName {
				hasSecond = true
				matchLeagues = append(matchLeagues, val.LeagueName)
				matchTeams = append(matchTeams, val.HomeName, val.AwayName)
			}
		}
	}

	// If at least one bookmaker is NOT in live data → return EMPTY arrays
	// This prevents matching with stale database entries from inactive bookmakers
	if !hasFirst || !hasSecond {
		return nil, nil
	}

	return matchLeagues, matchTeams
}

// convertTeamsPairsToResponse converts map of team pairs to slice response
func convertTeamsPairsToResponse(pairs map[string]entity.UnMatchedTeamsPair) []entity.UnMatchedTeamsPairResponse {
	result := make([]entity.UnMatchedTeamsPairResponse, 0, len(pairs))

	for _, val := range pairs {
		teamsFirst := make([]entity.UnMatchedTeam, 0, len(val.TeamsFirst))
		for _, firstT := range val.TeamsFirst {
			teamsFirst = append(teamsFirst, firstT)
		}

		teamsSecond := make([]entity.UnMatchedTeam, 0, len(val.TeamsSecond))
		for _, secondT := range val.TeamsSecond {
			teamsSecond = append(teamsSecond, secondT)
		}

		result = append(result, entity.UnMatchedTeamsPairResponse{
			LeagueIDFirst:       val.LeagueIDFirst,
			LeagueIDSecond:      val.LeagueIDSecond,
			BookmakerNameFirst:  val.BookmakerNameFirst,
			BookmakerNameSecond: val.BookmakerNameSecond,
			LeagueNameFirst:     val.LeagueNameFirst,
			LeagueNameSecond:    val.LeagueNameSecond,
			TeamsFirst:          teamsFirst,
			TeamsSecond:         teamsSecond,
			SportName:           val.SportName,
		})
	}

	return result
}

// groupTeamsPairs groups teams into pairs by league match ID
func groupTeamsPairs(unMatchedTeams []entity.UnMatchedTeamsByLeaguesPG, firstBookmakerName, sportName string) map[string]entity.UnMatchedTeamsPair {
	pairs := make(map[string]entity.UnMatchedTeamsPair)

	// Index teams by LeagueMatchID for O(n) grouping
	type teamsByMatch struct {
		first  []entity.UnMatchedTeamsByLeaguesPG
		second []entity.UnMatchedTeamsByLeaguesPG
	}
	byMatch := make(map[int64]*teamsByMatch)

	for _, t := range unMatchedTeams {
		m, ok := byMatch[t.LeagueMatchID]
		if !ok {
			m = &teamsByMatch{}
			byMatch[t.LeagueMatchID] = m
		}
		if t.BookmakerName == firstBookmakerName {
			m.first = append(m.first, t)
		} else {
			m.second = append(m.second, t)
		}
	}

	for _, m := range byMatch {
		if len(m.first) == 0 || len(m.second) == 0 {
			continue
		}
		for _, t1 := range m.first {
			for _, t2 := range m.second {
				key := fmt.Sprintf("%s%s%s%s", t1.BookmakerName, t2.BookmakerName,
					t1.LeagueName, t2.LeagueName)

				teamsFirst := make(map[int64]entity.UnMatchedTeam)
				teamsSecond := make(map[int64]entity.UnMatchedTeam)

				if existingPair, ok := pairs[key]; ok {
					teamsFirst = existingPair.TeamsFirst
					teamsSecond = existingPair.TeamsSecond
				}

				teamsFirst[t1.TeamID] = entity.UnMatchedTeam{
					TeamID:   t1.TeamID,
					TeamName: t1.TeamName,
				}
				teamsSecond[t2.TeamID] = entity.UnMatchedTeam{
					TeamID:   t2.TeamID,
					TeamName: t2.TeamName,
				}

				pairs[key] = entity.UnMatchedTeamsPair{
					LeagueIDFirst:       t1.LeagueID,
					LeagueIDSecond:      t2.LeagueID,
					BookmakerNameFirst:  t1.BookmakerName,
					BookmakerNameSecond: t2.BookmakerName,
					LeagueNameFirst:     t1.LeagueName,
					LeagueNameSecond:    t2.LeagueName,
					TeamsFirst:          teamsFirst,
					TeamsSecond:         teamsSecond,
					SportName:           sportName,
				}
			}
		}
	}

	return pairs
}

func (o *OnlineMatcherService) GetOnlineUnmatchLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName, traceID string) ([]entity.League, error) {
	// Get match data from analyzer
	matchData, err := o.analyzerAPI.GetOnlineMatchData(traceID)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchLeagues] get match data error")
		return nil, err
	}
	if len(matchData) == 0 {
		return nil, nil
	}

	// Extract leagues and teams from match data
	matchLeaguesByBookmakers, matchTeamsByBookmakers := extractMatchData(matchData, firstBookmakerName, secondBookmakerName, sportName)

	leagues, err := o.txStorage.Storage().GetUnMachedLeaguesByLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName, matchLeaguesByBookmakers, matchTeamsByBookmakers)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchLeagues] get leagues error")
		return nil, err
	}

	return leagues, nil
}

// extractTeamsByLeague extracts teams grouped by league from match data
func extractTeamsByLeague(matchData []entity.MatchData, sportName string) map[string]map[string]bool {
	teamsByLeague := make(map[string]map[string]bool)
	for _, val := range matchData {
		if val.SportName == sportName {
			key := val.Bookmaker + "|" + val.LeagueName
			if teamsByLeague[key] == nil {
				teamsByLeague[key] = make(map[string]bool)
			}
			teamsByLeague[key][val.HomeName] = true
			teamsByLeague[key][val.AwayName] = true
		}
	}
	return teamsByLeague
}

func (o *OnlineMatcherService) GetOnlineUnmatchLeaguesWithTeams(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName, traceID string) ([]entity.LeagueWithTeams, error) {
	matchData, err := o.analyzerAPI.GetOnlineMatchData(traceID)
	if err != nil {
		return nil, err
	}
	if len(matchData) == 0 {
		return nil, nil
	}

	matchLeaguesByBookmakers, matchTeamsByBookmakers := extractMatchData(matchData, firstBookmakerName, secondBookmakerName, sportName)
	leagues, err := o.txStorage.Storage().GetUnMachedLeaguesByLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName, matchLeaguesByBookmakers, matchTeamsByBookmakers)
	if err != nil {
		return nil, err
	}

	leagueIDs := make([]int64, len(leagues))
	for i, l := range leagues {
		leagueIDs[i] = l.ID
	}
	pairedIDs, err := o.txStorage.Storage().GetLeagueIDsWithPairs(ctx, leagueIDs)
	if err != nil {
		return nil, err
	}

	teamsByLeague := extractTeamsByLeague(matchData, sportName)

	result := make([]entity.LeagueWithTeams, 0, len(leagues))
	for _, league := range leagues {
		key := league.BookmakerName + "|" + league.LeagueName
		teams := make([]string, 0)
		if teamsMap, ok := teamsByLeague[key]; ok {
			for team := range teamsMap {
				teams = append(teams, team)
			}
		}
		result = append(result, entity.LeagueWithTeams{
			ID:            league.ID,
			BookmakerName: league.BookmakerName,
			SportName:     league.SportName,
			LeagueName:    league.LeagueName,
			Teams:         teams,
			HasPair:       pairedIDs[league.ID],
		})
	}
	return result, nil
}

func (o *OnlineMatcherService) GetOnlineUnmatchLeaguesWithTeamsPrematch(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName, traceID string) ([]entity.LeagueWithTeams, error) {
	matchData, err := o.analyzerPrematchAPI.GetOnlineMatchData(traceID)
	if err != nil {
		return nil, err
	}
	if len(matchData) == 0 {
		return nil, nil
	}

	matchLeaguesByBookmakers, matchTeamsByBookmakers := extractMatchData(matchData, firstBookmakerName, secondBookmakerName, sportName)
	leagues, err := o.txStorage.Storage().GetUnMachedLeaguesByLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName, matchLeaguesByBookmakers, matchTeamsByBookmakers)
	if err != nil {
		return nil, err
	}

	leagueIDs := make([]int64, len(leagues))
	for i, l := range leagues {
		leagueIDs[i] = l.ID
	}
	pairedIDs, err := o.txStorage.Storage().GetLeagueIDsWithPairs(ctx, leagueIDs)
	if err != nil {
		return nil, err
	}

	teamsByLeague := extractTeamsByLeague(matchData, sportName)

	result := make([]entity.LeagueWithTeams, 0, len(leagues))
	for _, league := range leagues {
		key := league.BookmakerName + "|" + league.LeagueName
		teams := make([]string, 0)
		if teamsMap, ok := teamsByLeague[key]; ok {
			for team := range teamsMap {
				teams = append(teams, team)
			}
		}
		result = append(result, entity.LeagueWithTeams{
			ID:            league.ID,
			BookmakerName: league.BookmakerName,
			SportName:     league.SportName,
			LeagueName:    league.LeagueName,
			Teams:         teams,
			HasPair:       pairedIDs[league.ID],
		})
	}
	return result, nil
}

func (o *OnlineMatcherService) GetOnlineUnmatchTeams(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName, traceID string) ([]entity.UnMatchedTeamsPairResponse, error) {
	// Get match data from analyzer
	matchData, err := o.analyzerAPI.GetOnlineMatchData(traceID)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchTeams] get match data error")
		return nil, err
	}
	if len(matchData) == 0 {
		return nil, nil
	}

	// Extract leagues and teams from match data
	matchLeaguesByBookmakers, matchTeamsByBookmakers := extractMatchData(matchData, firstBookmakerName, secondBookmakerName, sportName)

	unMatchedTeams, err := o.txStorage.Storage().GetUnMatchedTeamsByLeaguesByTeams(ctx, sportName, firstBookmakerName, secondBookmakerName, matchLeaguesByBookmakers, matchTeamsByBookmakers)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchTeams] get teams error")
		return nil, err
	}

	// Group teams into pairs by league
	pairs := groupTeamsPairs(unMatchedTeams, firstBookmakerName, sportName)

	return convertTeamsPairsToResponse(pairs), nil
}

func (o *OnlineMatcherService) GetOnlineUnmatchLeaguesPrematch(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName, traceID string) ([]entity.League, error) {
	// Get match data from analyzer prematch
	matchData, err := o.analyzerPrematchAPI.GetOnlineMatchData(traceID)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchLeaguesPrematch] get match data error")
		return nil, err
	}
	if len(matchData) == 0 {
		return nil, nil
	}

	// Extract leagues and teams from match data
	matchLeaguesByBookmakers, matchTeamsByBookmakers := extractMatchData(matchData, firstBookmakerName, secondBookmakerName, sportName)

	leagues, err := o.txStorage.Storage().GetUnMachedLeaguesByLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName, matchLeaguesByBookmakers, matchTeamsByBookmakers)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchLeaguesPrematch] get leagues error")
		return nil, err
	}

	return leagues, nil
}

func (o *OnlineMatcherService) GetOnlineUnmatchTeamsPrematch(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName, traceID string) ([]entity.UnMatchedTeamsPairResponse, error) {
	// Get match data from analyzer prematch
	matchData, err := o.analyzerPrematchAPI.GetOnlineMatchData(traceID)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] get match data error")
		return nil, err
	}
	if len(matchData) == 0 {
		o.logger.Debug().Str("sport", sportName).Str("bk1", firstBookmakerName).Str("bk2", secondBookmakerName).
			Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] no match data from analyzer")
		return nil, nil
	}

	// Extract leagues and teams from match data
	matchLeaguesByBookmakers, matchTeamsByBookmakers := extractMatchData(matchData, firstBookmakerName, secondBookmakerName, sportName)

	// DEBUG: Log extracted data
	o.logger.Debug().Str("sport", sportName).Str("bk1", firstBookmakerName).Str("bk2", secondBookmakerName).
		Int("total_matches", len(matchData)).
		Int("extracted_leagues", len(matchLeaguesByBookmakers)).
		Int("extracted_teams", len(matchTeamsByBookmakers)).
		Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] extracted match data")

	if len(matchLeaguesByBookmakers) == 0 || len(matchTeamsByBookmakers) == 0 {
		o.logger.Debug().Str("sport", sportName).Str("bk1", firstBookmakerName).Str("bk2", secondBookmakerName).
			Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] extractMatchData returned empty - one bookmaker missing?")
		return nil, nil
	}

	unMatchedTeams, err := o.txStorage.Storage().GetUnMatchedTeamsByLeaguesByTeams(ctx, sportName, firstBookmakerName, secondBookmakerName, matchLeaguesByBookmakers, matchTeamsByBookmakers)
	if err != nil {
		o.logger.Error().Err(err).Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] get teams error")
		return nil, err
	}

	// DEBUG: Log SQL result
	o.logger.Debug().Str("sport", sportName).Str("bk1", firstBookmakerName).Str("bk2", secondBookmakerName).
		Int("sql_unmatched_teams", len(unMatchedTeams)).
		Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] SQL returned teams")

	// Group teams into pairs by league
	pairs := groupTeamsPairs(unMatchedTeams, firstBookmakerName, sportName)

	// DEBUG: Log grouped pairs
	o.logger.Debug().Str("sport", sportName).Str("bk1", firstBookmakerName).Str("bk2", secondBookmakerName).
		Int("grouped_pairs", len(pairs)).
		Msg("[OnlineMatcherService.GetOnlineUnmatchTeamsPrematch] grouped into pairs")

	return convertTeamsPairsToResponse(pairs), nil
}
