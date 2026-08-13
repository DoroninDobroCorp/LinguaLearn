package service

import (
	"context"
	"fmt"
	"livebets/auto_matcher/cmd/config"
	"livebets/auto_matcher/internal/entity"
	"strings"
	"time"
)

// matchLeaguesOnlineWithLLM матчит лиги используя УЛУЧШЕННЫЙ метод с образцами команд и двухэтапной валидацией
func (s *LLMMatcherService) matchLeaguesOnlineWithLLM(ctx context.Context, leagues []entity.League, sport string, bookmakerPair [2]string, traceID string) {
	if len(leagues) == 0 {
		return
	}

	// Группируем лиги по букмекерам
	leaguesByBookmaker := make(map[string][]entity.League)
	for _, league := range leagues {
		leaguesByBookmaker[league.BookmakerName] = append(leaguesByBookmaker[league.BookmakerName], league)
	}

	leagues1 := leaguesByBookmaker[bookmakerPair[0]]
	leagues2 := leaguesByBookmaker[bookmakerPair[1]]

	if len(leagues1) == 0 || len(leagues2) == 0 {
		s.logger.Info().
			Str("sport", sport).
			Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
			Msg("[LLMMatcherService] No leagues to match for this bookmaker pair")
		return
	}

	s.logger.Info().
		Str("sport", sport).
		Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("leagues_bk1", len(leagues1)).
		Int("leagues_bk2", len(leagues2)).
		Msg("[LLMMatcherService] Matching leagues with IMPROVED LLM (with team samples)")

	// ШАГ 1: Вызываем УЛУЧШЕННЫЙ LLM для матчинга лиг (с образцами команд)
	matchedPairs, err := s.sendLeaguesToLLMImproved(ctx, leagues1, leagues2, bookmakerPair, traceID)
	if err != nil {
		s.logger.Error().Err(err).Msg("[LLMMatcherService] LLM improved league matching failed")
		return
	}

	if len(matchedPairs) == 0 {
		s.logger.Info().
			Str("sport", sport).
			Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
			Msg("[LLMMatcherService] LLM returned 0 pairs - no confident matches found")
		return
	}

	// Convert the exact candidate set used in the request. IDs outside this
	// set are hallucinations and are rejected below.
	leaguesWithSamples1, err := s.convertToLeaguesWithSamples(ctx, leagues1, traceID)
	if err != nil {
		s.logger.Error().Err(err).Msg("[LLMMatcherService] Failed to convert leagues1 for validation")
		return
	}
	leaguesWithSamples2, err := s.convertToLeaguesWithSamples(ctx, leagues2, traceID)
	if err != nil {
		s.logger.Error().Err(err).Msg("[LLMMatcherService] Failed to convert leagues2 for validation")
		return
	}

	matchData, matchDataErr := s.onlineMatcherService.GetCurrentMatchData(traceID)
	if matchDataErr != nil {
		// Fail closed for automatic writes. LLM candidates may still be queued
		// for manual review, but no mapping can be created without fixtures.
		s.logger.Warn().Err(matchDataErr).
			Str("sport", sport).
			Msg("[LLMMatcherService] Fixture evidence unavailable; automatic league mapping disabled")
		matchData = nil
	}
	now := time.Now()
	prematch := config.GetMode() == "prematch"

	// An LLM response is only a candidate. Automatic writes require strict,
	// deterministic fixture evidence; all other valid candidates are pending.
	created := 0
	rejected := 0
	pendingCount := 0

	for _, pair := range matchedPairs {
		// Находим лиги с образцами
		var league1WithSamples, league2WithSamples *entity.LeagueWithSamples
		for i := range leaguesWithSamples1 {
			if leaguesWithSamples1[i].ID == pair.BK1LeagueID {
				league1WithSamples = &leaguesWithSamples1[i]
				break
			}
		}
		for i := range leaguesWithSamples2 {
			if leaguesWithSamples2[i].ID == pair.BK2LeagueID {
				league2WithSamples = &leaguesWithSamples2[i]
				break
			}
		}

		if league1WithSamples == nil || league2WithSamples == nil {
			s.logger.Error().
				Int64("league1_id", pair.BK1LeagueID).
				Int64("league2_id", pair.BK2LeagueID).
				Msg("[LLMMatcherService] ❌ Cannot find league with samples")
			rejected++
			continue
		}

		if !validLLMConfidence(pair.Confidence, minimumLLMCandidateConfidence) {
			rejected++
			s.logger.Warn().
				Str("league1", league1WithSamples.LeagueName).
				Str("league2", league2WithSamples.LeagueName).
				Float64("confidence", pair.Confidence).
				Msg("[LLMMatcherService] Rejected league candidate with invalid/insufficient confidence")
			continue
		}

		// SAFETY CHECK: Prevent singles/doubles mismatch (Tennis)
		// One league has "doubles" but other doesn't = REJECT
		l1Lower := strings.ToLower(league1WithSamples.LeagueName)
		l2Lower := strings.ToLower(league2WithSamples.LeagueName)
		l1HasDoubles := strings.Contains(l1Lower, "double")
		l2HasDoubles := strings.Contains(l2Lower, "double")
		if l1HasDoubles != l2HasDoubles {
			rejected++
			s.logger.Warn().
				Str("league1", league1WithSamples.LeagueName).
				Str("league2", league2WithSamples.LeagueName).
				Msg("[LLMMatcherService] ❌ REJECTED: Singles/Doubles mismatch!")
			continue
		}

		canAutoCreate := matchDataErr == nil &&
			validLLMConfidence(pair.Confidence, minimumAutomaticLeagueConfidence) &&
			strictExactLeagueFixtureEvidence(
				matchData,
				sport,
				bookmakerPair,
				[2]string{league1WithSamples.LeagueName, league2WithSamples.LeagueName},
				now,
				prematch,
			)
		if canAutoCreate {
			createdNow, createErr := s.handMatchService.CreateLeaguesPair(ctx, pair.BK1LeagueID, pair.BK2LeagueID)
			if createErr != nil {
				s.logger.Error().Err(createErr).
					Int64("league1_id", pair.BK1LeagueID).
					Int64("league2_id", pair.BK2LeagueID).
					Msg("[LLMMatcherService] Failed to create strictly evidenced league pair")
				rejected++
				continue
			}
			if createdNow {
				created++
			}
			s.logger.Info().
				Str("sport", sport).
				Str("league1", league1WithSamples.LeagueName).
				Str("league2", league2WithSamples.LeagueName).
				Msg("[LLMMatcherService] League mapping accepted with strict fixture evidence")
			continue
		}

		if s.pendingPairManager == nil {
			rejected++
			s.logger.Warn().
				Str("league1", league1WithSamples.LeagueName).
				Str("league2", league2WithSamples.LeagueName).
				Msg("[LLMMatcherService] No strict fixture evidence and no review queue; rejecting league candidate")
			continue
		}

		pendingPair := entity.PendingLeaguePair{
			BK1LeagueID:   pair.BK1LeagueID,
			BK2LeagueID:   pair.BK2LeagueID,
			BK1LeagueName: league1WithSamples.LeagueName,
			BK2LeagueName: league2WithSamples.LeagueName,
			BK1Bookmaker:  bookmakerPair[0],
			BK2Bookmaker:  bookmakerPair[1],
			SportName:     sport,
			SampleTeams1:  league1WithSamples.SampleTeams,
			SampleTeams2:  league2WithSamples.SampleTeams,
			Confidence:    pair.Confidence,
			Reason:        pair.Reason,
			LLMProvider:   s.provider.GetProviderName(),
		}
		if saveErr := s.pendingPairManager.SavePendingLeaguePair(pendingPair); saveErr != nil {
			s.logger.Error().Err(saveErr).Msg("[LLMMatcherService] Failed to save pending league pair")
			rejected++
			continue
		}
		pendingCount++
		s.logger.Info().
			Str("league1", league1WithSamples.LeagueName).
			Str("league2", league2WithSamples.LeagueName).
			Float64("confidence", pair.Confidence).
			Msg("[LLMMatcherService] League candidate queued: strict fixture evidence was not sufficient")
	}

	// Итоговая статистика
	s.logger.Info().
		Str("sport", sport).
		Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("proposed_by_llm", len(matchedPairs)).
		Int("created", created).
		Int("pending", pendingCount).
		Int("rejected", rejected).
		Msgf("[LLMMatcherService] 📊 LEAGUE MATCHING SUMMARY: %d created, %d pending review, %d rejected from %d proposed",
			created, pendingCount, rejected, len(matchedPairs))
}

// matchTeamsOnlineWithLLM матчит команды используя данные из GetOnlineUnmatchTeams
func (s *LLMMatcherService) matchTeamsOnlineWithLLM(ctx context.Context, teamPairs []entity.UnMatchedTeamsPairResponse, sport string, bookmakerPair [2]string, traceID string) {
	if len(teamPairs) == 0 {
		return
	}

	s.logger.Info().
		Str("sport", sport).
		Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("league_pairs", len(teamPairs)).
		Msg("[LLMMatcherService] Batch matching teams for multiple league pairs")

	matchData, matchDataErr := s.onlineMatcherService.GetCurrentMatchData(traceID)
	if matchDataErr != nil {
		s.logger.Warn().Err(matchDataErr).
			Str("sport", sport).
			Msg("[LLMMatcherService] Fixture evidence unavailable; automatic team mapping disabled")
		matchData = nil
	}
	now := time.Now()
	prematch := config.GetMode() == "prematch"

	// Exact names are not sufficient by themselves. Automatically map them
	// only when one current fixture pair also proves opponent, orientation,
	// sport, leagues, bookmakers and scheduled start.
	exactCreated := 0
	exactFailed := 0
	exactRejected := 0
	for i := range teamPairs {
		bk1NameCount := make(map[string]int, len(teamPairs[i].TeamsFirst))
		for _, t1 := range teamPairs[i].TeamsFirst {
			bk1NameCount[exactMappingName(t1.TeamName)]++
		}
		bk2Index := make(map[string][]entity.UnMatchedTeam, len(teamPairs[i].TeamsSecond))
		for _, t2 := range teamPairs[i].TeamsSecond {
			key := exactMappingName(t2.TeamName)
			bk2Index[key] = append(bk2Index[key], t2)
		}

		matchedBK1 := make(map[int64]bool)
		matchedBK2 := make(map[int64]bool)

		for _, t1 := range teamPairs[i].TeamsFirst {
			key := exactMappingName(t1.TeamName)
			candidates := bk2Index[key]
			if key == "" || bk1NameCount[key] != 1 || len(candidates) != 1 {
				continue
			}
			t2 := candidates[0]
			hasEvidence := matchDataErr == nil && strictExactTeamFixtureEvidence(
				matchData,
				sport,
				bookmakerPair,
				[2]string{teamPairs[i].LeagueNameFirst, teamPairs[i].LeagueNameSecond},
				[2]string{t1.TeamName, t2.TeamName},
				now,
				prematch,
			)
			if !hasEvidence {
				exactRejected++
				s.logger.Debug().
					Str("team1", t1.TeamName).
					Str("team2", t2.TeamName).
					Str("league1", teamPairs[i].LeagueNameFirst).
					Str("league2", teamPairs[i].LeagueNameSecond).
					Msg("[ExactMatch] Exact name rejected: strict current-fixture evidence missing or ambiguous")
				continue
			}

			createdNow, createErr := s.handMatchService.CreateTeamsPair(ctx, t1.TeamID, t2.TeamID)
			if createErr != nil {
				exactFailed++
				s.logger.Warn().Err(createErr).
					Str("team", t1.TeamName).
					Int64("t1_id", t1.TeamID).
					Int64("t2_id", t2.TeamID).
					Msg("[ExactMatch] Failed to create exact team pair")
			} else if createdNow {
				exactCreated++
				matchedBK1[t1.TeamID] = true
				matchedBK2[t2.TeamID] = true
				s.logger.Info().
					Str("sport", sport).
					Str("team", t1.TeamName).
					Str("league1", teamPairs[i].LeagueNameFirst).
					Str("league2", teamPairs[i].LeagueNameSecond).
					Msg("[ExactMatch] ✅ TEAM MATCHED (exact name)")
			}
		}

		// Убираем уже смёрженные команды из списков для LLM
		if len(matchedBK1) > 0 || len(matchedBK2) > 0 {
			filtered1 := make([]entity.UnMatchedTeam, 0, len(teamPairs[i].TeamsFirst))
			for _, t := range teamPairs[i].TeamsFirst {
				if !matchedBK1[t.TeamID] {
					filtered1 = append(filtered1, t)
				}
			}
			teamPairs[i].TeamsFirst = filtered1

			filtered2 := make([]entity.UnMatchedTeam, 0, len(teamPairs[i].TeamsSecond))
			for _, t := range teamPairs[i].TeamsSecond {
				if !matchedBK2[t.TeamID] {
					filtered2 = append(filtered2, t)
				}
			}
			teamPairs[i].TeamsSecond = filtered2
		}
	}

	if exactCreated > 0 || exactFailed > 0 || exactRejected > 0 {
		s.logger.Info().
			Str("sport", sport).
			Int("exact_created", exactCreated).
			Int("exact_failed", exactFailed).
			Int("exact_rejected_no_evidence", exactRejected).
			Msg("[ExactMatch] Exact-name mapping summary")
	}

	// Конвертируем оставшиеся в формат LeaguePairWithTeams для LLM
	leaguePairsForLLM := make([]entity.LeaguePairWithTeams, 0, len(teamPairs))

	for _, pair := range teamPairs {
		// Пропускаем лиги, где не осталось команд после exact-match
		if len(pair.TeamsFirst) == 0 || len(pair.TeamsSecond) == 0 {
			continue
		}
		leaguePairsForLLM = append(leaguePairsForLLM, entity.LeaguePairWithTeams{
			PairID:        len(leaguePairsForLLM) + 1,
			BK1LeagueID:   pair.LeagueIDFirst,
			BK2LeagueID:   pair.LeagueIDSecond,
			BK1LeagueName: pair.LeagueNameFirst,
			BK2LeagueName: pair.LeagueNameSecond,
			BK1Teams:      pair.TeamsFirst,
			BK2Teams:      pair.TeamsSecond,
		})
	}

	// Если после exact-match не осталось команд для LLM — выходим
	if len(leaguePairsForLLM) == 0 {
		return
	}

	// Вызываем LLM для batch матчинга
	matches, err := s.sendTeamsBatchToLLM(ctx, leaguePairsForLLM, bookmakerPair)
	if err != nil {
		s.logger.Error().Err(err).Msg("[LLMMatcherService] LLM team batch matching failed")
		return
	}

	// LLM names are resolved only against the exact request. LLM-only aliases
	// are review candidates and never become active mappings automatically.
	rejected := 0
	pendingCount := 0

	for _, match := range matches {
		// Находим контекст (лигу)
		var leaguePair *entity.LeaguePairWithTeams
		for i := range leaguePairsForLLM {
			if leaguePairsForLLM[i].PairID == match.PairID {
				leaguePair = &leaguePairsForLLM[i]
				break
			}
		}

		if leaguePair == nil {
			s.logger.Warn().
				Int("pair_id", match.PairID).
				Str("team1_name", match.BK1TeamName).
				Str("team2_name", match.BK2TeamName).
				Msg("[LLMMatcherService] ⚠️ League pair not found for match")
			rejected++
			continue
		}

		// КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Ищем team_id по НАЗВАНИЯМ (case-insensitive)
		var team1ID, team2ID int64
		team1Found := false
		team2Found := false

		for _, t := range leaguePair.BK1Teams {
			if strings.EqualFold(strings.TrimSpace(t.TeamName), strings.TrimSpace(match.BK1TeamName)) {
				team1ID = t.TeamID
				team1Found = true
				break
			}
		}

		for _, t := range leaguePair.BK2Teams {
			if strings.EqualFold(strings.TrimSpace(t.TeamName), strings.TrimSpace(match.BK2TeamName)) {
				team2ID = t.TeamID
				team2Found = true
				break
			}
		}

		if !team1Found {
			s.logger.Warn().
				Str("team_name", match.BK1TeamName).
				Str("league", leaguePair.BK1LeagueName).
				Msg("[LLMMatcherService] ⚠️ BK1 team name not found in request (LLM hallucination?)")
			rejected++
			continue
		}

		if !team2Found {
			s.logger.Warn().
				Str("team_name", match.BK2TeamName).
				Str("league", leaguePair.BK2LeagueName).
				Msg("[LLMMatcherService] ⚠️ BK2 team name not found in request (LLM hallucination?)")
			rejected++
			continue
		}

		if !validLLMConfidence(match.Confidence, minimumLLMCandidateConfidence) {
			rejected++
			s.logger.Warn().
				Str("team1", match.BK1TeamName).
				Str("team2", match.BK2TeamName).
				Float64("confidence", match.Confidence).
				Msg("[LLMMatcherService] Rejected team candidate with invalid/insufficient confidence")
			continue
		}

		// SAFETY CHECK: Prevent singles/doubles mismatch in Tennis
		// One team has "/" (doubles pair) but other doesn't = REJECT
		// NOTE: Only apply this check for Tennis! Other sports may have "/" in team names (e.g., "Bodø/Glimt")
		if sport == "Tennis" {
			t1HasSlash := strings.Contains(match.BK1TeamName, "/")
			t2HasSlash := strings.Contains(match.BK2TeamName, "/")
			if t1HasSlash != t2HasSlash {
				rejected++
				s.logger.Warn().
					Str("team1", match.BK1TeamName).
					Str("team2", match.BK2TeamName).
					Msg("[LLMMatcherService] ❌ REJECTED: Tennis Singles/Doubles mismatch!")
				continue
			}
		}

		if s.pendingPairManager == nil {
			rejected++
			s.logger.Warn().
				Str("team1_name", match.BK1TeamName).
				Str("team2_name", match.BK2TeamName).
				Msg("[LLMMatcherService] No review queue; refusing LLM-only team mapping")
			continue
		}

		pendingPair := entity.PendingTeamPair{
			BK1TeamID:     team1ID,
			BK2TeamID:     team2ID,
			BK1TeamName:   match.BK1TeamName,
			BK2TeamName:   match.BK2TeamName,
			BK1Bookmaker:  bookmakerPair[0],
			BK2Bookmaker:  bookmakerPair[1],
			LeaguePairID:  match.PairID,
			BK1LeagueName: leaguePair.BK1LeagueName,
			BK2LeagueName: leaguePair.BK2LeagueName,
			SportName:     sport,
			Confidence:    match.Confidence,
			Reason:        match.Reason,
			LLMProvider:   s.provider.GetProviderName(),
		}
		if saveErr := s.pendingPairManager.SavePendingTeamPair(pendingPair); saveErr != nil {
			rejected++
			s.logger.Error().Err(saveErr).Msg("[LLMMatcherService] Failed to save pending team pair")
			continue
		}
		pendingCount++
		s.logger.Info().
			Str("team1", match.BK1TeamName).
			Str("team2", match.BK2TeamName).
			Float64("confidence", match.Confidence).
			Msg("[LLMMatcherService] LLM-only team candidate queued for manual review")
	}

	if rejected > 0 || pendingCount > 0 {
		s.logger.Info().
			Str("sport", sport).
			Int("created_from_llm", 0).
			Int("pending", pendingCount).
			Int("rejected", rejected).
			Int("total_from_llm", len(matches)).
			Msg("[LLMMatcherService] Team candidate summary")
	}
}
