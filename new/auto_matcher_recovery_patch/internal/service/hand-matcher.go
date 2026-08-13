package service

import (
	"context"
	"fmt"
	"livebets/auto_matcher/internal/entity"
	"livebets/auto_matcher/internal/repository"
	"livebets/auto_matcher/pkg/cache"
	"livebets/auto_matcher/pkg/rdbms"
	"livebets/auto_matcher/pkg/utils"

	"github.com/rs/zerolog"
)

type HandMatcherService struct {
	txStorage             rdbms.TxStorage[repository.MatchStorage]
	leagueCandidatesCache cache.MemoryCacheInterface[string, entity.LeagueCandidatePair]
	teamCandidatesCache   cache.MemoryCacheInterface[string, entity.TeamCandidatePair]
	logger                *zerolog.Logger
}

func NewHandMatcherService(
	txStorage rdbms.TxStorage[repository.MatchStorage],
	leagueCandidatesCache cache.MemoryCacheInterface[string, entity.LeagueCandidatePair],
	teamCandidatesCache cache.MemoryCacheInterface[string, entity.TeamCandidatePair],
	logger *zerolog.Logger,
) *HandMatcherService {
	return &HandMatcherService{
		txStorage:             txStorage,
		leagueCandidatesCache: leagueCandidatesCache,
		teamCandidatesCache:   teamCandidatesCache,
		logger:                logger,
	}
}

// AllowedSports - только эти виды спорта отображаются в UI
var AllowedSports = map[string]bool{
	"Soccer":     true,
	"Tennis":     true,
	"Basketball": true,
	"Hockey":     true,
	"Volleyball": true,
	"Handball":   true,
	"Esports":   true,
	"ESports":   true,
}

// SportNormalize — нормализация дублей (ESports → Esports)
var SportNormalize = map[string]string{
	"ESports": "Esports",
}

func (h *HandMatcherService) GetSports(ctx context.Context) ([]string, error) {
	sports, err := h.txStorage.Storage().GetSports(ctx)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetSports] get sports error")
		return nil, err
	}

	// Фильтруем только разрешенные виды спорта + дедупликация
	seen := make(map[string]bool)
	filtered := make([]string, 0, len(AllowedSports))
	for _, sport := range sports {
		if !AllowedSports[sport] {
			continue
		}
		normalized := sport
		if n, ok := SportNormalize[sport]; ok {
			normalized = n
		}
		if !seen[normalized] {
			seen[normalized] = true
			filtered = append(filtered, normalized)
		}
	}

	return filtered, nil
}

func (h *HandMatcherService) GetBookmakers(ctx context.Context) ([]string, error) {
	bookmakers, err := h.txStorage.Storage().GetBookmakers(ctx)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetBookmaker] get bookmakers error")
		return nil, err
	}

	return bookmakers, nil
}

func (h *HandMatcherService) GetMatchedLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) ([]entity.LeaguesMatchPair, error) {
	leagues, err := h.txStorage.Storage().GetMatchedLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetMatchedLeagues] get leagues error")
		return nil, err
	}
	if leagues == nil {
		return nil, nil
	}

	var result []entity.LeaguesMatchPair
	for _, valLeague1 := range leagues {
		for _, valLeague2 := range leagues {
			if valLeague1.BookmakerName != valLeague2.BookmakerName && valLeague1.BookmakerName == firstBookmakerName &&
				valLeague1.LeagueMatchID == valLeague2.LeagueMatchID {

				result = append(result, entity.LeaguesMatchPair{
					LeagueIDFirst:       valLeague1.ID,
					LeagueIDSecond:      valLeague2.ID,
					BookmakerNameFirst:  valLeague1.BookmakerName,
					BookmakerNameSecond: valLeague2.BookmakerName,
					LeagueNameFirst:     valLeague1.LeagueName,
					LeagueNameSecond:    valLeague2.LeagueName,
					SportName:           sportName,
				})
			}
		}
	}

	return result, nil
}

func (h *HandMatcherService) GetUnMachedLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) ([]entity.League, error) {
	leagues, err := h.txStorage.Storage().GetUnMachedLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetUnMachedLeagues] get leagues error")
		return nil, err
	}
	return leagues, nil
}

func (h *HandMatcherService) GetAllLeaguesByBookmaker(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) ([]entity.League, error) {
	leagues, err := h.txStorage.Storage().GetAllLeaguesByBookmaker(ctx, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetAllLeaguesByBookmaker] get leagues error")
		return nil, err
	}
	return leagues, nil
}

// buildUnmatchedTeamsPairs groups unmatched teams by league pairs
func buildUnmatchedTeamsPairs(teams []entity.UnMatchedTeamsByLeaguesPG, firstBookmakerName, sportName string) map[string]entity.UnMatchedTeamsPair {
	pairs := make(map[string]entity.UnMatchedTeamsPair)

	for _, valTeam1 := range teams {
		for _, valTeam2 := range teams {
			if valTeam1.BookmakerName != valTeam2.BookmakerName &&
				valTeam1.BookmakerName == firstBookmakerName &&
				valTeam1.LeagueMatchID == valTeam2.LeagueMatchID {

				// Create key to eliminate duplicates
				key := fmt.Sprintf("%s%s%s%s", valTeam1.BookmakerName, valTeam2.BookmakerName,
					valTeam1.LeagueName, valTeam2.LeagueName)

				teamsFirst := make(map[int64]entity.UnMatchedTeam)
				teamsSecond := make(map[int64]entity.UnMatchedTeam)

				if existingPair, ok := pairs[key]; ok {
					teamsFirst = existingPair.TeamsFirst
					teamsSecond = existingPair.TeamsSecond
				}

				teamsFirst[valTeam1.TeamID] = entity.UnMatchedTeam{
					TeamID:   valTeam1.TeamID,
					TeamName: valTeam1.TeamName,
				}
				teamsSecond[valTeam2.TeamID] = entity.UnMatchedTeam{
					TeamID:   valTeam2.TeamID,
					TeamName: valTeam2.TeamName,
				}

				pairs[key] = entity.UnMatchedTeamsPair{
					LeagueIDFirst:       valTeam1.LeagueID,
					LeagueIDSecond:      valTeam2.LeagueID,
					BookmakerNameFirst:  valTeam1.BookmakerName,
					BookmakerNameSecond: valTeam2.BookmakerName,
					LeagueNameFirst:     valTeam1.LeagueName,
					LeagueNameSecond:    valTeam2.LeagueName,
					TeamsFirst:          teamsFirst,
					TeamsSecond:         teamsSecond,
					SportName:           sportName,
				}
			}
		}
	}

	return pairs
}

// convertUnmatchedPairsToResponse converts map to slice for API response
func convertUnmatchedPairsToResponse(pairs map[string]entity.UnMatchedTeamsPair) []entity.UnMatchedTeamsPairResponse {
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

func (h *HandMatcherService) GetUnMatchedTeamsByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) ([]entity.UnMatchedTeamsPairResponse, error) {
	teams, err := h.txStorage.Storage().GetUnMatchedTeamsByLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetUnMatchedTeamsByLeagues] get teams error")
		return nil, err
	}
	if teams == nil {
		return nil, nil
	}

	pairs := buildUnmatchedTeamsPairs(teams, firstBookmakerName, sportName)
	return convertUnmatchedPairsToResponse(pairs), nil
}

// buildMatchedTeamsPairs groups matched teams by league pairs
func buildMatchedTeamsPairs(teams []entity.MatchedTeamsByLeaguesPG, firstBookmakerName, sportName string) map[string]entity.MatchedTeamsPairResponse {
	pairs := make(map[string]entity.MatchedTeamsPairResponse)

	for _, valTeam1 := range teams {
		for _, valTeam2 := range teams {
			if valTeam1.BookmakerName != valTeam2.BookmakerName &&
				valTeam1.BookmakerName == firstBookmakerName &&
				valTeam1.LeagueMatchID == valTeam2.LeagueMatchID &&
				valTeam1.TeamMatch == valTeam2.TeamMatch {

				// Create key to eliminate duplicates
				key := fmt.Sprintf("%s%s%d", valTeam1.BookmakerName, valTeam2.BookmakerName, valTeam1.LeagueMatchID)

				var teamsPair []entity.TeamsPair
				if existingPair, ok := pairs[key]; ok {
					teamsPair = existingPair.TeamsPair
				}

				teamsPair = append(teamsPair, entity.TeamsPair{
					TeamIDFirst:    valTeam1.TeamID,
					TeamNameFirst:  valTeam1.TeamName,
					TeamIDSecond:   valTeam2.TeamID,
					TeamNameSecond: valTeam2.TeamName,
				})

				pairs[key] = entity.MatchedTeamsPairResponse{
					LeagueIDFirst:       valTeam1.LeagueID,
					LeagueIDSecond:      valTeam2.LeagueID,
					BookmakerNameFirst:  valTeam1.BookmakerName,
					BookmakerNameSecond: valTeam2.BookmakerName,
					LeagueNameFirst:     valTeam1.LeagueName,
					LeagueNameSecond:    valTeam2.LeagueName,
					SportName:           sportName,
					TeamsPair:           teamsPair,
				}
			}
		}
	}

	return pairs
}

func (h *HandMatcherService) GetMatchedTeamsByLeagues(ctx context.Context, sportName, firstBookmakerName, secondBookmakerName string) ([]entity.MatchedTeamsPairResponse, error) {
	teams, err := h.txStorage.Storage().GetMatchedTeamsByLeagues(ctx, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetMatchedTeamsByLeagues] get teams error")
		return nil, err
	}
	if teams == nil {
		return nil, nil
	}

	pairs := buildMatchedTeamsPairs(teams, firstBookmakerName, sportName)

	result := make([]entity.MatchedTeamsPairResponse, 0, len(pairs))
	for _, val := range pairs {
		result = append(result, val)
	}

	return result, nil
}

func (h *HandMatcherService) CreateTeamsPair(ctx context.Context, firstTeamID, secondTeamID int64) (bool, error) {
	tx, err := h.txStorage.Begin(ctx, rdbms.TXIsoLevelSerializable)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateTeamsPair] create transaction error")
		return false, err
	}
	defer tx.Rollback(ctx)

	isExist, err := tx.Storage().CheckTeams(ctx, firstTeamID, secondTeamID)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateTeamsPair] check teams error")
		return false, err
	}
	if !isExist {
		return false, nil
	}

	isExist, err = tx.Storage().CheckTeamsPair(ctx, firstTeamID, secondTeamID)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateTeamsPair] check teams pair error")
		return false, err
	}
	if isExist {
		return false, nil
	}

	if err = tx.Storage().InsertTeamsPair(ctx, firstTeamID, secondTeamID); err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateTeamsPair] insert team pair error")
		return false, err
	}

	if err = tx.Commit(ctx); err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateTeamsPair] commit transaction error")
		return false, err
	}

	key := utils.GenerateKeyForCandidate(firstTeamID, secondTeamID)
	h.teamCandidatesCache.Delete(key)

	return true, err
}

func (h *HandMatcherService) CreateLeaguesPair(ctx context.Context, firstLeagueID, secondLeagueID int64) (bool, error) {
	tx, err := h.txStorage.Begin(ctx, rdbms.TXIsoLevelSerializable)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateLeaguesPair] create transaction error")
		return false, err
	}
	defer tx.Rollback(ctx)

	isExist, err := tx.Storage().CheckLeagues(ctx, firstLeagueID, secondLeagueID)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateLeaguesPair] check leagues error")
		return false, err
	}
	if !isExist {
		return false, nil
	}

	isExist, err = tx.Storage().CheckLeaguesPair(ctx, firstLeagueID, secondLeagueID)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateLeaguesPair] check leagues pair error")
		return false, err
	}
	if isExist {
		return false, nil
	}

	if err = tx.Storage().InsertLeaguesPair(ctx, firstLeagueID, secondLeagueID); err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateLeaguesPair] insert league pair error")
		return false, err
	}

	if err = tx.Commit(ctx); err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.CreateLeaguesPair] commit transaction error")
		return false, err
	}

	key := utils.GenerateKeyForCandidate(firstLeagueID, secondLeagueID)
	h.leagueCandidatesCache.Delete(key)

	return true, err
}

// GetAllLeaguePairs возвращает все пары лиг с пагинацией
func (h *HandMatcherService) GetAllLeaguePairs(ctx context.Context, page, limit int, sportFilter, bookmakerFilter string) (*entity.LeaguePairsResponse, error) {
	pairs, total, err := h.txStorage.Storage().GetAllLeaguePairs(ctx, page, limit, sportFilter, bookmakerFilter)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.GetAllLeaguePairs] get pairs error")
		return nil, err
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &entity.LeaguePairsResponse{
		Pairs:      pairs,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

// DeleteLeaguePair удаляет пару лиг с каскадным удалением команд
func (h *HandMatcherService) DeleteLeaguePair(ctx context.Context, pairID int64) error {
	tx, err := h.txStorage.Begin(ctx, rdbms.TXIsoLevelDefault)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.DeleteLeaguePair] create transaction error")
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.Storage().DeleteLeaguePairWithCascade(ctx, pairID)
	if err != nil {
		h.logger.Error().Err(err).Int64("pairID", pairID).Msg("[HandMatcherService.DeleteLeaguePair] delete error")
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return err
	}
	h.logger.Info().Int64("pairID", pairID).Msg("[HandMatcherService.DeleteLeaguePair] deleted league pair with cascade")
	return nil
}

// BulkDeleteLeaguePairs удаляет несколько пар лиг
func (h *HandMatcherService) BulkDeleteLeaguePairs(ctx context.Context, pairIDs []int64) error {
	tx, err := h.txStorage.Begin(ctx, rdbms.TXIsoLevelDefault)
	if err != nil {
		h.logger.Error().Err(err).Msg("[HandMatcherService.BulkDeleteLeaguePairs] create transaction error")
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.Storage().BulkDeleteLeaguePairs(ctx, pairIDs)
	if err != nil {
		h.logger.Error().Err(err).Ints64("pairIDs", pairIDs).Msg("[HandMatcherService.BulkDeleteLeaguePairs] delete error")
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return err
	}
	h.logger.Info().Ints64("pairIDs", pairIDs).Msg("[HandMatcherService.BulkDeleteLeaguePairs] deleted league pairs with cascade")
	return nil
}

// GetMappingStatus проверяет статус маппинга лиги и команд с Pinnacle
func (h *HandMatcherService) GetMappingStatus(ctx context.Context, bookmaker, sport, league, homeTeam, awayTeam string) (*entity.MappingStatus, error) {
	status, err := h.txStorage.Storage().GetMappingStatus(ctx, bookmaker, sport, league, homeTeam, awayTeam)
	if err != nil {
		h.logger.Error().Err(err).
			Str("bookmaker", bookmaker).
			Str("sport", sport).
			Str("league", league).
			Msg("[HandMatcherService.GetMappingStatus] error")
		return nil, err
	}
	return status, nil
}
