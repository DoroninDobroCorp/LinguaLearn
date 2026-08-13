package service

// ============================================================
// УЛУЧШЕННЫЙ LLM МАТЧИНГ ЛИГ (с образцами команд)
// ============================================================
// СТАТУС: ОТКЛЮЧЕНО (лиги матчатся вручную через UI)
// Вызов: llm-matcher.go:420 (закомментирован)
// Используется: llm-matcher-online.go -> matchLeaguesOnlineWithLLM()
//
// Чтобы включить LLM матчинг лиг:
// 1. Раскомментировать строки 418-429 в llm-matcher.go
// 2. Проверить что model zai-glm-4.7 доступна
// ============================================================

import (
	"context"
	"encoding/json"
	"fmt"
	"livebets/auto_matcher/internal/entity"
)

// getSampleTeamsFromLeague получает 3-5 образцов команд из КОНКРЕТНОЙ лиги
func (s *LLMMatcherService) getSampleTeamsFromLeague(ctx context.Context, leagueID int64, bookmaker, leagueName, sportName, traceID string) ([]string, error) {
	// Use the dataset selected by MODE. Prematch league samples must not be
	// taken from the unrelated live cache.
	matchData, err := s.onlineMatcherService.GetCurrentMatchData(traceID)
	if err != nil {
		return nil, err
	}

	// Собираем уникальные команды ТОЛЬКО из этой конкретной лиги
	teamsMap := make(map[string]bool)
	for _, match := range matchData {
		// Фильтруем по букмекеру, спорту И названию лиги
		if match.Bookmaker == bookmaker &&
			match.SportName == sportName &&
			match.LeagueName == leagueName {
			if match.HomeName != "" {
				teamsMap[match.HomeName] = true
			}
			if match.AwayName != "" {
				teamsMap[match.AwayName] = true
			}
		}
	}

	// Конвертируем в массив (берём ВСЕ команды из live матчей)
	teams := make([]string, 0, len(teamsMap))
	for team := range teamsMap {
		teams = append(teams, team)
	}

	return teams, nil
}

// convertToLeaguesWithSamples конвертирует лиги и добавляет образцы команд
func (s *LLMMatcherService) convertToLeaguesWithSamples(ctx context.Context, leagues []entity.League, traceID string) ([]entity.LeagueWithSamples, error) {
	result := make([]entity.LeagueWithSamples, 0, len(leagues))

	for _, league := range leagues {
		// Передаём название лиги и спорт для точной фильтрации
		samples, err := s.getSampleTeamsFromLeague(ctx, league.ID, league.BookmakerName, league.LeagueName, league.SportName, traceID)
		if err != nil {
			s.logger.Warn().Err(err).Int64("league_id", league.ID).Msg("Failed to get sample teams, using empty")
			samples = []string{}
		}

		result = append(result, entity.LeagueWithSamples{
			ID:            league.ID,
			BookmakerName: league.BookmakerName,
			SportName:     league.SportName,
			LeagueName:    league.LeagueName,
			SampleTeams:   samples,
		})
	}

	return result, nil
}

// sendLeaguesToLLMImproved - улучшенная версия с образцами команд
func (s *LLMMatcherService) sendLeaguesToLLMImproved(ctx context.Context, leagues1, leagues2 []entity.League, bookmakerPair [2]string, traceID string) ([]entity.ResponsePairLeague, error) {
	// Конвертируем лиги с добавлением образцов команд
	leaguesWithSamples1, err := s.convertToLeaguesWithSamples(ctx, leagues1, traceID)
	if err != nil {
		return nil, fmt.Errorf("failed to convert BK1 leagues: %w", err)
	}

	leaguesWithSamples2, err := s.convertToLeaguesWithSamples(ctx, leagues2, traceID)
	if err != nil {
		return nil, fmt.Errorf("failed to convert BK2 leagues: %w", err)
	}

	request := entity.RequestLeaguesWithSamples{
		BK1Leagues: leaguesWithSamples1,
		BK2Leagues: leaguesWithSamples2,
	}

	reqBytes, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	requestText := string(reqBytes)

	// Log request
	s.llmLogger.Info().
		Str("type", "leagues_improved").
		Str("provider", s.provider.GetProviderName()).
		Str("bookmaker_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("leagues1_count", len(leaguesWithSamples1)).
		Int("leagues2_count", len(leaguesWithSamples2)).
		Str("request", requestText).
		Msg("Sending improved request to LLM")

	// Call LLM provider with automatic API key rotation
	responseText, err := s.callLLMWithRetry(ctx, "leagues", LeagueMatchingImprovedSystemPrompt, requestText)
	if err != nil {
		s.llmLogger.Error().Err(err).Msg("LLM API error for improved leagues")
		return nil, err
	}

	// Log response
	s.llmLogger.Info().
		Str("type", "leagues_improved").
		Str("provider", s.provider.GetProviderName()).
		Str("bookmaker_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Str("response", responseText).
		Msg("Received response from LLM")

	// Clean markdown formatting if present
	responseText = cleanMarkdownJSON(responseText)

	// Parse response
	var pairedLeagues []entity.ResponsePairLeague
	if err = json.Unmarshal([]byte(responseText), &pairedLeagues); err != nil {
		s.llmLogger.Error().Err(err).Str("response", responseText).Msg("Failed to parse LLM response")
		return nil, err
	}

	s.llmLogger.Info().
		Str("type", "leagues_improved").
		Str("provider", s.provider.GetProviderName()).
		Int("pairs_count", len(pairedLeagues)).
		Msg("Successfully matched leagues (stage 1)")

	return pairedLeagues, nil
}

// validateLeaguePairWithLLM - второй этап: проверка предложенной пары
func (s *LLMMatcherService) validateLeaguePairWithLLM(ctx context.Context, league1, league2 entity.LeagueWithSamples) (bool, string, error) {
	request := entity.LeagueValidationRequest{
		League1Name: league1.LeagueName,
		League2Name: league2.LeagueName,
		Teams1:      league1.SampleTeams,
		Teams2:      league2.SampleTeams,
	}

	reqBytes, err := json.Marshal(request)
	if err != nil {
		return false, "", err
	}

	requestText := string(reqBytes)

	// Log validation request
	s.llmLogger.Info().
		Str("type", "league_validation").
		Str("league1", league1.LeagueName).
		Str("league2", league2.LeagueName).
		Str("request", requestText).
		Msg("Sending validation request to LLM")

	// Call LLM
	responseText, err := s.callLLMWithRetry(ctx, "leagues", LeagueValidationSystemPrompt, requestText)
	if err != nil {
		s.llmLogger.Error().Err(err).Msg("LLM API error for validation")
		return false, "", err
	}

	// Log response
	s.llmLogger.Info().
		Str("type", "league_validation").
		Str("response", responseText).
		Msg("Received validation response from LLM")

	// Clean and parse
	responseText = cleanMarkdownJSON(responseText)

	var validation entity.LeagueValidationResponse
	if err = json.Unmarshal([]byte(responseText), &validation); err != nil {
		s.llmLogger.Error().Err(err).Str("response", responseText).Msg("Failed to parse validation response")
		return false, "", err
	}

	return validation.IsValid, validation.Reason, nil
}
