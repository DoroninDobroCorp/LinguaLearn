package service

import (
	"context"
	"fmt"
	"livebets/parse_sansabet/cmd/config"
	"livebets/parse_sansabet/internal/api"
	"livebets/parse_sansabet/internal/entity"
	"livebets/pkg/domain"
	pkgutils "livebets/pkg/utils"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// PrematchService handles prematch parsing via ASP.NET API
type PrematchService struct {
	sAPI             *api.SansabetAPI
	sendChan         chan<- entity.ResponseGame
	logger           *zerolog.Logger
	verifiedOutcomes *config.VerifiedOutcomesConfig
}

func NewPrematchService(
	sAPI *api.SansabetAPI,
	sendChan chan<- entity.ResponseGame,
	logger *zerolog.Logger,
) *PrematchService {
	verifiedConfig, err := config.LoadVerifiedOutcomesDefault()
	if err != nil {
		logger.Error().Err(err).Msg("⚠️ Failed to load verified outcomes config")
		logger.Warn().Msg("⚠️ All markets will be parsed (no filtering)")
		verifiedConfig = nil
	} else {
		logger.Info().Msg("✅ Verified outcomes filtering enabled")
	}

	return &PrematchService{
		sAPI:             sAPI,
		sendChan:         sendChan,
		logger:           logger,
		verifiedOutcomes: verifiedConfig,
	}
}

// Run starts the prematch parsing loop
func (s *PrematchService) Run(ctx context.Context, interval time.Duration, wg *sync.WaitGroup) {
	defer wg.Done()

	s.logger.Info().Dur("interval", interval).Msg("[PREMATCH] Starting ASP.NET prematch service")

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Initial fetch
	s.fetchAndSend(ctx)

	for {
		select {
		case <-ticker.C:
			s.fetchAndSend(ctx)
		case <-ctx.Done():
			s.logger.Info().Msg("[PREMATCH] Shutting down")
			return
		}
	}
}

func (s *PrematchService) fetchAndSend(ctx context.Context) {
	start := time.Now()
	s.logger.Info().Msg("[PREMATCH] Fetching sports and leagues...")

	sports, err := s.sAPI.GetPrematchSports(ctx)
	if err != nil {
		s.logger.Error().Err(err).Msg("[PREMATCH] Failed to get sports")
		prematchErrorsCounter.Inc()
		return
	}

	// Collect all league IDs for Football, Basketball, Tennis
	var leagueIDs []struct {
		LID     int
		Name    string
		SportID int
	}

	for _, sport := range sports {
		sid := sport.SID
		if sid == 0 && sport.G != 0 {
			sid = sport.G
		}

		// Process target sports: Football, Basketball, Tennis, Hockey, Handball, Volleyball, Esports
		if sid != entity.PrematchSportFootball &&
			sid != entity.PrematchSportBasketball &&
			sid != entity.PrematchSportTennis &&
			sid != entity.PrematchSportHockey &&
			sid != entity.PrematchSportHandball &&
			sid != entity.PrematchSportVolleyball &&
			sid != entity.PrematchSportEsports {
			continue
		}

		// Collect leagues from main L array
		for _, league := range sport.L {
			leagueIDs = append(leagueIDs, struct {
				LID     int
				Name    string
				SportID int
			}{league.LID, league.NW, sid})
		}

		// Collect leagues from sub-sports S array
		for _, sub := range sport.S {
			for _, league := range sub.L {
				leagueIDs = append(leagueIDs, struct {
					LID     int
					Name    string
					SportID int
				}{league.LID, league.NW, sid})
			}
		}
	}

	s.logger.Info().Int("leagues", len(leagueIDs)).Msg("[PREMATCH] Found leagues to parse")

	// Phase 1: Fetch matches from ALL leagues in batches (saves ~250 API calls)
	const leagueBatchSize = 25
	var allMatches []struct {
		pair       entity.PrematchPair
		leagueName string
		sportID    int
	}
	var totalMatches, skippedBeyond24h int
	cutoff := time.Now().Add(24 * time.Hour)
	seenTeamPairs := make(map[string]int64)

	// Group leagues by sport for batching
	type sportLeagues struct {
		sportID int
		lids    []int
		lnames  map[int]string
	}
	sportGroups := make(map[int]*sportLeagues)
	for _, league := range leagueIDs {
		sg, ok := sportGroups[league.SportID]
		if !ok {
			sg = &sportLeagues{sportID: league.SportID, lnames: make(map[int]string)}
			sportGroups[league.SportID] = sg
		}
		sg.lids = append(sg.lids, league.LID)
		sg.lnames[league.LID] = league.Name
	}

	for _, sg := range sportGroups {
		for i := 0; i < len(sg.lids); i += leagueBatchSize {
			end := i + leagueBatchSize
			if end > len(sg.lids) {
				end = len(sg.lids)
			}
			batchIDs := sg.lids[i:end]

			leagueData, err := s.sAPI.GetPrematchLeagueMatchesBatch(ctx, batchIDs)
			if err != nil {
				s.logger.Debug().Err(err).Int("batch_size", len(batchIDs)).Msg("[PREMATCH] Failed to get league batch")
				continue
			}

			var loggedDPOnce bool
			for _, ld := range leagueData {
				for _, pair := range ld.P {
					totalMatches++
					if !loggedDPOnce {
						s.logger.Info().Str("dp_sample", pair.DP).Str("match", pair.PN).Msg("[PREMATCH] DP field sample")
						loggedDPOnce = true
					}

					if !isWithin24Hours(pair.DP, cutoff) {
						skippedBeyond24h++
						continue
					}

					allMatches = append(allMatches, struct {
						pair       entity.PrematchPair
						leagueName string
						sportID    int
					}{pair, ld.LN, sg.sportID})
				}
			}
		}
	}

	s.logger.Info().Int("total_matches", totalMatches).Int("valid_matches", len(allMatches)).Msg("[PREMATCH] Phase 1 complete: leagues fetched")

	// Separate player prop events from regular matches
	type playerPropEvent struct {
		pair       entity.PrematchPair
		leagueName string
		sportID    int
		market     string // e.g. "Points", "Assists"
	}
	var regularMatches []struct {
		pair       entity.PrematchPair
		leagueName string
		sportID    int
	}
	// playerPropsByTeam: normalized team name → list of player prop events
	playerPropsByTeam := make(map[string][]playerPropEvent)
	var playerPropCount int

	for _, m := range allMatches {
		ppMarket := isPlayerPropLeague(m.leagueName)
		if ppMarket != "" {
			// Player prop event: "PlayerName : TeamName"
			parts := strings.SplitN(m.pair.PN, " : ", 2)
			if len(parts) == 2 {
				teamKey := strings.ToLower(strings.TrimSpace(parts[1]))
				playerPropsByTeam[teamKey] = append(playerPropsByTeam[teamKey], playerPropEvent{
					pair:       m.pair,
					leagueName: m.leagueName,
					sportID:    m.sportID,
					market:     ppMarket,
				})
				playerPropCount++
			}
			continue
		}
		regularMatches = append(regularMatches, m)
	}

	if playerPropCount > 0 {
		s.logger.Info().
			Int("player_props", playerPropCount).
			Int("teams_with_pp", len(playerPropsByTeam)).
			Msg("[PREMATCH] Player props separated")
	}

	// Phase 2: Build basic games and only fetch GetFullOdds for matches WITH basic odds
	var sentMatches, fullOddsFetched, skippedNoFullOdds int
	sem := make(chan struct{}, 40) // concurrency limiter for GetFullOdds (40 workers → ~30s cycle)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, m := range regularMatches {
		game := s.pairToResponseGame(m.pair, m.leagueName, m.sportID)
		if game == nil {
			continue
		}

		// Skip if no basic odds — match likely inactive, no need for GetFullOdds
		// Exception: Basketball and Hockey get their main Win1x2 from GetFullOdds (market 170/44),
		// not from basic odds. Don't skip them based on missing basic Win1x2.
		if game.SportName != entity.SportBasketball && game.SportName != entity.SportHockey {
			if game.Periods[0].Win1x2.Win1.Value == 0 && game.Periods[0].Win1x2.Win2.Value == 0 {
				continue
			}
		}

		// Deduplication
		home := strings.ToLower(strings.TrimSpace(game.HomeName))
		away := strings.ToLower(strings.TrimSpace(game.AwayName))
		var teamKey string
		if home < away {
			teamKey = home + "|" + away + "|" + m.leagueName
		} else {
			teamKey = away + "|" + home + "|" + m.leagueName
		}
		if existingPid, exists := seenTeamPairs[teamKey]; exists {
			s.logger.Warn().
				Int64("pid", m.pair.PID).
				Int64("existing_pid", existingPid).
				Str("match", m.pair.PN).
				Msg("[PREMATCH] DUPLICATE match skipped")
			continue
		}
		seenTeamPairs[teamKey] = m.pair.PID

		// Find player prop events matching this team
		var matchPP []playerPropEvent
		if len(playerPropsByTeam) > 0 {
			homeLower := strings.ToLower(strings.TrimSpace(game.HomeName))
			awayLower := strings.ToLower(strings.TrimSpace(game.AwayName))
			// Player props are keyed by team name (awayName in player prop events)
			matchPP = append(matchPP, playerPropsByTeam[homeLower]...)
			matchPP = append(matchPP, playerPropsByTeam[awayLower]...)
		}

		// Fetch full odds concurrently (only for sports that use additional markets)
		wg.Add(1)
		go func(g *entity.ResponseGame, pair entity.PrematchPair, sportID int, ppEvents []playerPropEvent) {
			defer wg.Done()

			sportName := prematchSportIDToName(sportID)

			// Skip GetFullOdds for Esports — they only use basic odds from GetLiga
			needsFullOdds := sportName != entity.SportEsports

			if needsFullOdds {
				sem <- struct{}{}
				defer func() { <-sem }()

				fullOdds, err := s.sAPI.GetPrematchFullOdds(ctx, pair.PID)
				if err == nil {
					switch sportName {
					case entity.SportBasketball:
						s.parseFullOddsBasketball(fullOdds, g.Periods)
					case entity.SportHockey:
						s.parseFullOddsHockey(fullOdds, g.Periods)
					case entity.SportSoccer:
						s.parseFullOddsSoccer(fullOdds, g.Periods, sportName)
					case entity.SportHandball:
						s.parseFullOddsHandball(fullOdds, g.Periods)
					case entity.SportTennis:
						s.parseFullOddsTennis(fullOdds, g.Periods)
					case entity.SportVolleyball:
						s.parseFullOddsVolleyball(fullOdds, g.Periods)
					}
					mu.Lock()
					fullOddsFetched++
					mu.Unlock()
				}

				// Fetch player props for this match
				for _, pp := range ppEvents {
					ppOdds, err := s.sAPI.GetPrematchFullOdds(ctx, pp.pair.PID)
					if err != nil {
						continue
					}
					parts := strings.SplitN(pp.pair.PN, " : ", 2)
					if len(parts) < 2 {
						continue
					}
					playerName := normalizePlayerName(parts[0])
					prop := s.parsePlayerPropOdds(ppOdds, playerName, pp.market)
					if prop != nil {
						g.Periods[0].PlayerProps = append(g.Periods[0].PlayerProps, *prop)
					}
				}
			} else {
				mu.Lock()
				skippedNoFullOdds++
				mu.Unlock()
			}

			if s.verifiedOutcomes != nil {
				s.filterUnverifiedMarkets(g)
			}

			// Validate and clean data before sending (same as live path)
			if !ValidateAndCleanGame(g) {
				return
			}

			select {
			case s.sendChan <- *g:
				mu.Lock()
				sentMatches++
				mu.Unlock()
			case <-ctx.Done():
				return
			}
		}(game, m.pair, m.sportID, matchPP)
	}

	wg.Wait()

	elapsed := time.Since(start)
	s.logger.Info().
		Int("total_matches", totalMatches).
		Int("sent_matches", sentMatches).
		Int("full_odds_fetched", fullOddsFetched).
		Int("skipped_no_full_odds", skippedNoFullOdds).
		Int("skipped_beyond_24h", skippedBeyond24h).
		Dur("elapsed", elapsed).
		Msg("[PREMATCH] Cycle complete")

	prematchMatchesCounter.Add(float64(sentMatches))
}

func (s *PrematchService) pairToResponseGame(pair entity.PrematchPair, leagueName string, sportID int) *entity.ResponseGame {
	sportName := prematchSportIDToName(sportID)
	if sportName == "" {
		return nil
	}

	home, away := parseTeamNames(pair.PN)
	if home == "" || away == "" {
		return nil
	}

	periodsCount := getPeriodsCount(sportName)
	periods := make([]entity.ResponsePeriod, periodsCount)
	for i := range periods {
		periods[i] = entity.ResponsePeriod{
			Win1x2:           entity.Win1x2Struct{},
			Games:            make(map[string]*entity.Win1x2Struct),
			Totals:           make(map[string]*entity.WinLessMore),
			Handicap:         make(map[string]*entity.WinHandicap),
			ThreeWayHandicap: make(map[string]*entity.ThreeWayHcap),
			FirstTeamTotals:  make(map[string]*entity.WinLessMore),
			SecondTeamTotals: make(map[string]*entity.WinLessMore),
		}
	}

	// Parse basic odds from GetLiga
	s.parseBasicOdds(pair.T, periods, sportName)

	now := time.Now()
	matchDate := parseMatchDate(pair.DP)
	return &entity.ResponseGame{
		Pid:           pair.PID,
		LeagueName:    leagueName,
		HomeName:      home,
		AwayName:      away,
		MatchId:       fmt.Sprintf("%d", pair.PID),
		IsLive:        false,
		HomeScore:     0,
		AwayScore:     0,
		Periods:       periods,
		Source:        string(domain.Sansabet),
		SportName:     sportName,
		CreatedAt:     now,
		LastUpdatedAt: now,
		MatchDate:     matchDate,
		TraceID:       pkgutils.GenerateUUID(),
		Raw:           entity.EventRaw{MatchName: pair.PN},
	}
}

func (s *PrematchService) filterUnverifiedMarkets(game *entity.ResponseGame) {
	if s.verifiedOutcomes == nil || game == nil {
		return
	}

	sportKey := strings.ToLower(string(game.SportName))
	for i := range game.Periods {
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "Win1x2") {
			game.Periods[i].Win1x2 = entity.Win1x2Struct{}
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "Totals") {
			game.Periods[i].Totals = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "Handicap") {
			game.Periods[i].Handicap = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "FirstTeamTotals") {
			game.Periods[i].FirstTeamTotals = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "SecondTeamTotals") {
			game.Periods[i].SecondTeamTotals = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "Games") {
			game.Periods[i].Games = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "SetsTotal") {
			game.Periods[i].SetsTotal = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "SetsHandicap") {
			game.Periods[i].SetsHandicap = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "BTTS") {
			game.Periods[i].BTTS = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "OddEven") {
			game.Periods[i].OddEven = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "DoubleChance") {
			game.Periods[i].DoubleChance = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "DrawNoBet") {
			game.Periods[i].DrawNoBet = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "ThreeWayHandicap") {
			game.Periods[i].ThreeWayHandicap = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "HalfTimeFullTime") {
			game.Periods[i].HalfTimeFullTime = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "FirstTeamToScore") {
			game.Periods[i].FirstTeamToScore = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "CorrectScore") {
			game.Periods[i].CorrectScore = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "ExactTotalGoals") {
			game.Periods[i].ExactTotalGoals = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "TotalGoalsRange") {
			game.Periods[i].TotalGoalsRange = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "HomeExactGoals") {
			game.Periods[i].HomeExactGoals = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "AwayExactGoals") {
			game.Periods[i].AwayExactGoals = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "HomeWinToNil") {
			game.Periods[i].HomeWinToNil = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "AwayWinToNil") {
			game.Periods[i].AwayWinToNil = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "EitherTeamToScore") {
			game.Periods[i].EitherTeamToScore = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "WinnerTotalCombo") {
			game.Periods[i].WinnerTotalCombo = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "BTTSTotalCombo") {
			game.Periods[i].BTTSTotalCombo = nil
		}
		if !s.verifiedOutcomes.IsMarketVerified(sportKey, "BTTSWinnerCombo") {
			game.Periods[i].BTTSWinnerCombo = nil
		}
	}
}

func (s *PrematchService) parseBasicOdds(odds []entity.PrematchOdd, periods []entity.ResponsePeriod, sportName entity.SportName) {
	for _, odd := range odds {
		if odd.K <= 1.0 {
			continue
		}

		// 1X2 Match (TID: 1=Win1, 2=Draw, 10=Win2)
		// For Basketball: TID 1/2/10 = Regulation Time (without OT) → store in Period 7 (Regulation)
		// The 2-way winner (TID 927/928) comes from GetFullOdds and goes to Period 0
		// For Hockey: 1/2/10 = Regulation (3-way), goes to Period 4, not Period 0
		regPeriod := 0
		if sportName == entity.SportHockey {
			regPeriod = PeriodHockeyRegulation // Period 4
		} else if sportName == entity.SportBasketball {
			regPeriod = PeriodBasketballRegulation // Period 7
		}
		switch odd.TID {
		case 1:
			periods[regPeriod].Win1x2.Win1 = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "1x2", "Win1", regPeriod)}
		case 2:
			periods[regPeriod].Win1x2.WinNone = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "1x2", "WinNone", regPeriod)}
		case 10:
			periods[regPeriod].Win1x2.Win2 = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "1x2", "Win2", regPeriod)}
		}

		// Football totals (soccer only — handball uses market 54 with lines ~60)
		if sportName == entity.SportSoccer {
			switch odd.TID {
			case 70: // 0-2 golova = Under 2.5
				ensureTotals(&periods[0], "2.5")
				periods[0].Totals["2.5"].WinLess = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinLess", 0)}
			case 74: // 3+ = Over 2.5
				ensureTotals(&periods[0], "2.5")
				periods[0].Totals["2.5"].WinMore = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinMore", 0)}
			case 89: // 4+ = Over 3.5
				ensureTotals(&periods[0], "3.5")
				periods[0].Totals["3.5"].WinMore = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinMore", 0)}
			case 64: // 1+ I poluvreme = Over 0.5 1st half
				if len(periods) > 1 {
					ensureTotals(&periods[1], "0.5")
					periods[1].Totals["0.5"].WinMore = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinMore", 1)}
				}
			case 65: // 2+ I poluvreme = Over 1.5 1st half
				if len(periods) > 1 {
					ensureTotals(&periods[1], "1.5")
					periods[1].Totals["1.5"].WinMore = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinMore", 1)}
				}
			case 67: // Over 1.5 2nd half
				if len(periods) > 2 {
					ensureTotals(&periods[2], "1.5")
					periods[2].Totals["1.5"].WinMore = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinMore", 2)}
				}
			case 68: // Over 2.5 2nd half
				if len(periods) > 2 {
					ensureTotals(&periods[2], "2.5")
					periods[2].Totals["2.5"].WinMore = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "total", "WinMore", 2)}
				}
			}
		}

		// Tennis set winner (TID: 691=Set1 Win1, 692=Set1 Win2)
		// Must go to Win1x2, not Games — matches PS3838 and live path behavior
		if sportName == entity.SportTennis {
			if len(periods) > 1 {
				if odd.TID == 691 {
					periods[1].Win1x2.Win1 = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "1x2", "Win1", 1)}
				}
				if odd.TID == 692 {
					periods[1].Win1x2.Win2 = entity.OddValue{Value: odd.K, Raw: betCtx(int64(odd.TID), "", "1x2", "Win2", 1)}
				}
			}
		}
	}
}

// parseFullOddsBasketball extracts additional markets from GetTipoviV2 response
// Market ID 170 = "Pobednik (sa produžetkom)" = Winner with overtime
// Uses TipID (numeric) for unified mapping with live API
func (s *PrematchService) parseFullOddsBasketball(tipovi []entity.PrematchTipovi, periods []entity.ResponsePeriod) {
	for _, market := range tipovi {
		switch market.ID {
		case 170: // Winner with OT (TipID 927/928) → Period 0 Win1x2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 927:
					periods[0].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 0)}
				case 928:
					periods[0].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 0)}
				}
			}

		case 45: // Winner 1H (TipID 521/522) → HC 0.0 Period 5 (Half1)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				ensureMapEntry(periods[PeriodHalf1].Handicap, "0.0")
				switch odd.TipID {
				case 521:
					periods[PeriodHalf1].Handicap["0.0"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodHalf1)}
				case 522:
					periods[PeriodHalf1].Handicap["0.0"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodHalf1)}
				}
			}

		case 166: // Winner Q1 (TipID 919/920) → HC 0.0 Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				ensureMapEntry(periods[PeriodQuarter1].Handicap, "0.0")
				switch odd.TipID {
				case 919:
					periods[PeriodQuarter1].Handicap["0.0"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodQuarter1)}
				case 920:
					periods[PeriodQuarter1].Handicap["0.0"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodQuarter1)}
				}
			}

		case 167: // Winner Q2 (TipID 921/922) → HC 0.0 Period 2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				ensureMapEntry(periods[PeriodQuarter2].Handicap, "0.0")
				switch odd.TipID {
				case 921:
					periods[PeriodQuarter2].Handicap["0.0"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodQuarter2)}
				case 922:
					periods[PeriodQuarter2].Handicap["0.0"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodQuarter2)}
				}
			}

		case 168: // Winner Q3 (TipID 923/924) → HC 0.0 Period 3
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				ensureMapEntry(periods[PeriodQuarter3].Handicap, "0.0")
				switch odd.TipID {
				case 923:
					periods[PeriodQuarter3].Handicap["0.0"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodQuarter3)}
				case 924:
					periods[PeriodQuarter3].Handicap["0.0"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodQuarter3)}
				}
			}

		case 9: // Dupla Šansa (TipID 83/85) → HC ±0.5 in Period 7 (Regulation)
			// DC 1X = Home+0.5 (HC "0.5" Win1), DC X2 = Away+0.5 (HC "-0.5" Win2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 83: // 1X → HC +0.5 Win1
					ensureMapEntry(periods[PeriodBasketballRegulation].Handicap, "0.5")
					periods[PeriodBasketballRegulation].Handicap["0.5"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodBasketballRegulation)}
				case 85: // X2 → HC -0.5 Win2
					ensureMapEntry(periods[PeriodBasketballRegulation].Handicap, "-0.5")
					periods[PeriodBasketballRegulation].Handicap["-0.5"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodBasketballRegulation)}
				}
			}

		case 10: // Dupla Šansa 1H (TipID 307/309) → HC ±0.5 in Period 5 (Half1)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 307: // 1X → HC +0.5 Win1
					ensureMapEntry(periods[PeriodHalf1].Handicap, "0.5")
					periods[PeriodHalf1].Handicap["0.5"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodHalf1)}
				case 309: // X2 → HC -0.5 Win2
					ensureMapEntry(periods[PeriodHalf1].Handicap, "-0.5")
					periods[PeriodHalf1].Handicap["-0.5"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodHalf1)}
				}
			}

		case 11: // Dupla Šansa 2H (TipID 310/312) → HC ±0.5 in Period 6 (Half2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 310: // 1X → HC +0.5 Win1
					ensureMapEntry(periods[PeriodHalf2].Handicap, "0.5")
					periods[PeriodHalf2].Handicap["0.5"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodHalf2)}
				case 312: // X2 → HC -0.5 Win2
					ensureMapEntry(periods[PeriodHalf2].Handicap, "-0.5")
					periods[PeriodHalf2].Handicap["-0.5"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodHalf2)}
				}
			}

		case 53: // Odd/Even (TipID 115/116) → Period 7 (Regulation)
			if periods[PeriodBasketballRegulation].OddEven == nil {
				periods[PeriodBasketballRegulation].OddEven = &entity.YesNo{}
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 115:
					periods[PeriodBasketballRegulation].OddEven.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "odd_even", "Yes", PeriodBasketballRegulation)}
				case 116:
					periods[PeriodBasketballRegulation].OddEven.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "odd_even", "No", PeriodBasketballRegulation)}
				}
			}

		case 54: // Total Points (103/105 regulation) → Period 7 only (regulation, no OT)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 105, 451, 453, 1204, 1206, 1227, 1229: // Over variants
						ensureTotals(&periods[PeriodBasketballRegulation], line)
						periods[PeriodBasketballRegulation].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodBasketballRegulation)}
					case 103, 450, 452, 1203, 1205, 1226, 1228: // Under variants
						ensureTotals(&periods[PeriodBasketballRegulation], line)
						periods[PeriodBasketballRegulation].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodBasketballRegulation)}
					}
				}
			}

		case 55: // Total Points 1H (165/167) → Period 5 (Half1)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 167:
						ensureTotals(&periods[PeriodHalf1], line)
						periods[PeriodHalf1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodHalf1)}
					case 165:
						ensureTotals(&periods[PeriodHalf1], line)
						periods[PeriodHalf1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodHalf1)}
					}
				}
			}

		case 90: // Total Points Q1 (726/727) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 727:
						ensureTotals(&periods[PeriodQuarter1], line)
						periods[PeriodQuarter1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodQuarter1)}
					case 726:
						ensureTotals(&periods[PeriodQuarter1], line)
						periods[PeriodQuarter1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodQuarter1)}
					}
				}
			}

		case 91: // Total Points Q2 (728/729) → Period 2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 729:
						ensureTotals(&periods[PeriodQuarter2], line)
						periods[PeriodQuarter2].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodQuarter2)}
					case 728:
						ensureTotals(&periods[PeriodQuarter2], line)
						periods[PeriodQuarter2].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodQuarter2)}
					}
				}
			}

		case 42: // Handicap match — ALL lines are regulation (market name "Hendikep", no "sa produžetkom")
			// TipIDs: 121/123 (main), 446-449, 1195-1202 (alts) — all regulation
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				var isWin1 bool
				switch odd.TipID {
				case 121, 446, 448, 1195, 1197, 1199, 1201: // Win1
					isWin1 = true
				case 123, 447, 449, 1196, 1198, 1200, 1202: // Win2
					isWin1 = false
				default:
					continue
				}
				hcpLine := odd.G
				var lineStr string
				if isWin1 {
					lineStr = formatLine(hcpLine)
				} else {
					lineStr = formatLine(-hcpLine)
				}
				ensureMapEntry(periods[PeriodBasketballRegulation].Handicap, lineStr)
				if isWin1 {
					periods[PeriodBasketballRegulation].Handicap[lineStr].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodBasketballRegulation)}
				} else {
					periods[PeriodBasketballRegulation].Handicap[lineStr].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodBasketballRegulation)}
				}
			}

		case 43: // Handicap 1H (162/164) → Period 5 (Half1)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				var isWin1 bool
				switch odd.TipID {
				case 162:
					isWin1 = true
				case 164:
					isWin1 = false
				default:
					continue
				}
				hcpLine := odd.G
				var lineStr string
				if isWin1 {
					lineStr = formatLine(hcpLine)
				} else {
					lineStr = formatLine(-hcpLine)
				}
				ensureMapEntry(periods[PeriodHalf1].Handicap, lineStr)
				if isWin1 {
					periods[PeriodHalf1].Handicap[lineStr].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodHalf1)}
				} else {
					periods[PeriodHalf1].Handicap[lineStr].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodHalf1)}
				}
			}

		case 103: // Handicap Q1 (756/757) → Period 1
			s.parseQuarterHandicap(market.T, &periods[PeriodQuarter1], 756, 757, PeriodQuarter1)
		case 104: // Handicap Q2 (758/759) → Period 2
			s.parseQuarterHandicap(market.T, &periods[PeriodQuarter2], 758, 759, PeriodQuarter2)
		case 105: // Handicap Q3 (760/761) → Period 3
			s.parseQuarterHandicap(market.T, &periods[PeriodQuarter3], 760, 761, PeriodQuarter3)
		case 106: // Handicap Q4 (762/763) → Period 4
			s.parseQuarterHandicap(market.T, &periods[PeriodQuarter4], 762, 763, PeriodQuarter4)

		case 59: // IT1 Team Total (168/169) → Period 7 (Regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 168:
						ensureTeamTotals(&periods[PeriodBasketballRegulation], line, true)
						periods[PeriodBasketballRegulation].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodBasketballRegulation)}
					case 169:
						ensureTeamTotals(&periods[PeriodBasketballRegulation], line, true)
						periods[PeriodBasketballRegulation].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodBasketballRegulation)}
					}
				}
			}

		case 60: // IT2 Team Total (170/171) → Period 7 (Regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 170:
						ensureTeamTotals(&periods[PeriodBasketballRegulation], line, false)
						periods[PeriodBasketballRegulation].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodBasketballRegulation)}
					case 171:
						ensureTeamTotals(&periods[PeriodBasketballRegulation], line, false)
						periods[PeriodBasketballRegulation].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodBasketballRegulation)}
					}
				}
			}

		case 98: // IT1 1H (746/747) → Period 5 (Half1)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 747:
						ensureTeamTotals(&periods[PeriodHalf1], line, true)
						periods[PeriodHalf1].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodHalf1)}
					case 746:
						ensureTeamTotals(&periods[PeriodHalf1], line, true)
						periods[PeriodHalf1].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodHalf1)}
					}
				}
			}

		case 99: // IT2 1H (748/749) → Period 5 (Half1)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 749:
						ensureTeamTotals(&periods[PeriodHalf1], line, false)
						periods[PeriodHalf1].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodHalf1)}
					case 748:
						ensureTeamTotals(&periods[PeriodHalf1], line, false)
						periods[PeriodHalf1].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodHalf1)}
					}
				}
			}

		case 242: // Winner 2H (TipID 686/687) → HC 0.0 Period 6 (Half2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				ensureMapEntry(periods[PeriodHalf2].Handicap, "0.0")
				switch odd.TipID {
				case 686:
					periods[PeriodHalf2].Handicap["0.0"].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodHalf2)}
				case 687:
					periods[PeriodHalf2].Handicap["0.0"].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodHalf2)}
				}
			}

		case 102: // Total Points 2H (TipID 754/755) → Period 6 (Half2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 755:
						ensureTotals(&periods[PeriodHalf2], line)
						periods[PeriodHalf2].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodHalf2)}
					case 754:
						ensureTotals(&periods[PeriodHalf2], line)
						periods[PeriodHalf2].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodHalf2)}
					}
				}
			}

		case 100: // IT1 2H (TipID 750/751) → Period 6 (Half2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 751:
						ensureTeamTotals(&periods[PeriodHalf2], line, true)
						periods[PeriodHalf2].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodHalf2)}
					case 750:
						ensureTeamTotals(&periods[PeriodHalf2], line, true)
						periods[PeriodHalf2].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodHalf2)}
					}
				}
			}

		case 101: // IT2 2H (TipID 752/753) → Period 6 (Half2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 753:
						ensureTeamTotals(&periods[PeriodHalf2], line, false)
						periods[PeriodHalf2].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodHalf2)}
					case 752:
						ensureTeamTotals(&periods[PeriodHalf2], line, false)
						periods[PeriodHalf2].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodHalf2)}
					}
				}
			}

		case 83: // 1X2 Q1 (704/705/706) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 704:
					periods[PeriodQuarter1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodQuarter1)}
				case 705:
					periods[PeriodQuarter1].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodQuarter1)}
				case 706:
					periods[PeriodQuarter1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodQuarter1)}
				}
			}

		case 84: // 1X2 Q2 (707/708/709) → Period 2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 707:
					periods[PeriodQuarter2].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodQuarter2)}
				case 708:
					periods[PeriodQuarter2].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodQuarter2)}
				case 709:
					periods[PeriodQuarter2].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodQuarter2)}
				}
			}

		case 85: // 1X2 Q3 (710/711/712) → Period 3
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 710:
					periods[PeriodQuarter3].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodQuarter3)}
				case 711:
					periods[PeriodQuarter3].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodQuarter3)}
				case 712:
					periods[PeriodQuarter3].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodQuarter3)}
				}
			}

		case 86: // 1X2 Q4 (713/714/715) → Period 4
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 713:
					periods[PeriodQuarter4].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodQuarter4)}
				case 714:
					periods[PeriodQuarter4].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodQuarter4)}
				case 715:
					periods[PeriodQuarter4].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodQuarter4)}
				}
			}

		case 207: // IT1 Q1 (1164/1165) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 1165:
						ensureTeamTotals(&periods[PeriodQuarter1], line, true)
						periods[PeriodQuarter1].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodQuarter1)}
					case 1164:
						ensureTeamTotals(&periods[PeriodQuarter1], line, true)
						periods[PeriodQuarter1].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodQuarter1)}
					}
				}
			}

		case 208: // IT2 Q1 (1166/1167) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 1167:
						ensureTeamTotals(&periods[PeriodQuarter1], line, false)
						periods[PeriodQuarter1].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodQuarter1)}
					case 1166:
						ensureTeamTotals(&periods[PeriodQuarter1], line, false)
						periods[PeriodQuarter1].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodQuarter1)}
					}
				}
			}

		case 209: // IT1 Q2 (1168/1169) → Period 2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 1169:
						ensureTeamTotals(&periods[PeriodQuarter2], line, true)
						periods[PeriodQuarter2].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodQuarter2)}
					case 1168:
						ensureTeamTotals(&periods[PeriodQuarter2], line, true)
						periods[PeriodQuarter2].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodQuarter2)}
					}
				}
			}

		case 210: // IT2 Q2 (1170/1171) → Period 2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 1171:
						ensureTeamTotals(&periods[PeriodQuarter2], line, false)
						periods[PeriodQuarter2].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodQuarter2)}
					case 1170:
						ensureTeamTotals(&periods[PeriodQuarter2], line, false)
						periods[PeriodQuarter2].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodQuarter2)}
					}
				}
			}

		case 7: // Prvo Poluvreme (1st Half 3-way 1X2 with draw)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 93:
					periods[PeriodHalf1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodHalf1)}
				case 94:
					periods[PeriodHalf1].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodHalf1)}
				case 95:
					periods[PeriodHalf1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodHalf1)}
				}
			}

		case 8: // Drugo Poluvreme (2nd Half 3-way 1X2 with draw)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 96:
					periods[PeriodHalf2].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodHalf2)}
				case 97:
					periods[PeriodHalf2].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodHalf2)}
				case 98:
					periods[PeriodHalf2].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodHalf2)}
				}
			}
		}
	}
}

// parseQuarterHandicap parses quarter-level handicap markets for basketball prematch
func (s *PrematchService) parseQuarterHandicap(odds []entity.PrematchTipoviOdd, period *entity.ResponsePeriod, win1TipID, win2TipID int64, periodIdx int) {
	for _, odd := range odds {
		if odd.Kvota <= 1.0 {
			continue
		}
		var isWin1 bool
		switch odd.TipID {
		case win1TipID:
			isWin1 = true
		case win2TipID:
			isWin1 = false
		default:
			continue
		}
		hcpLine := odd.G
		var lineStr string
		if isWin1 {
			lineStr = formatLine(hcpLine)
		} else {
			lineStr = formatLine(-hcpLine)
		}
		ensureMapEntry(period.Handicap, lineStr)
		if isWin1 {
			period.Handicap[lineStr].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", periodIdx)}
		} else {
			period.Handicap[lineStr].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", periodIdx)}
		}
	}
}

// parseFullOddsHockey extracts additional markets from GetTipoviV2 for Hockey
// Handles hockey-specific market semantics (e.g. Market 44 = Regulation DNB, not OT Winner)
func (s *PrematchService) parseFullOddsHockey(tipovi []entity.PrematchTipovi, periods []entity.ResponsePeriod) {
	for _, market := range tipovi {
		switch market.ID {
		case 44: // Winner = Regulation DNB (TipID 106/107) → Period 4 DrawNoBet (draw = refund)
			if periods[PeriodHockeyRegulation].DrawNoBet == nil {
				periods[PeriodHockeyRegulation].DrawNoBet = &entity.DrawNoBetStruct{}
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 106:
					periods[PeriodHockeyRegulation].DrawNoBet.Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "dnb", "Home", PeriodHockeyRegulation)}
				case 107:
					periods[PeriodHockeyRegulation].DrawNoBet.Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "dnb", "Away", PeriodHockeyRegulation)}
				}
			}

		case 170: // Winner incl. OT (TipID 927/928) → Period 0 Win1x2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 927:
					periods[0].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 0)}
				case 928:
					periods[0].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 0)}
				}
			}

		case 7: // 1st Period 1X2 (TipID 93/94/95) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 93:
					periods[PeriodHockeyP1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", PeriodHockeyP1)}
				case 94:
					periods[PeriodHockeyP1].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", PeriodHockeyP1)}
				case 95:
					periods[PeriodHockeyP1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", PeriodHockeyP1)}
				}
			}

		case 45: // Winner 1st Period 2-way (TipID 521/522) → P1 DrawNoBet (push on draw = H0)
			if periods[PeriodHockeyP1].DrawNoBet == nil {
				periods[PeriodHockeyP1].DrawNoBet = &entity.DrawNoBetStruct{}
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 521:
					periods[PeriodHockeyP1].DrawNoBet.Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "dnb", "Home", PeriodHockeyP1)}
				case 522:
					periods[PeriodHockeyP1].DrawNoBet.Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "dnb", "Away", PeriodHockeyP1)}
				}
			}

		case 9: // Double Chance (TipID 83/84/85) → Period 4 (regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getDoubleChanceMapping(odd.TipID, entity.SportHockey); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].DoubleChance == nil {
						periods[mapping.periodIndex].DoubleChance = &entity.DoubleChanceStruct{}
					}
					switch mapping.dcType {
					case "1X":
						periods[mapping.periodIndex].DoubleChance.W1X = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W1X", mapping.periodIndex)}
					case "X2":
						periods[mapping.periodIndex].DoubleChance.WX2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "WX2", mapping.periodIndex)}
					case "12":
						periods[mapping.periodIndex].DoubleChance.W12 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W12", mapping.periodIndex)}
					}
				}
			}

		case 193: // Double Chance 1st Period (TipID 1114/1115/1116) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getDoubleChanceMapping(odd.TipID, entity.SportHockey); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].DoubleChance == nil {
						periods[mapping.periodIndex].DoubleChance = &entity.DoubleChanceStruct{}
					}
					switch mapping.dcType {
					case "1X":
						periods[mapping.periodIndex].DoubleChance.W1X = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W1X", mapping.periodIndex)}
					case "X2":
						periods[mapping.periodIndex].DoubleChance.WX2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "WX2", mapping.periodIndex)}
					case "12":
						periods[mapping.periodIndex].DoubleChance.W12 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W12", mapping.periodIndex)}
					}
				}
			}

		case 25: // BTTS (TipID 112/113 match, 141/142 P1) → Period 0 / Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getBTTSMapping(odd.TipID, entity.SportHockey); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].BTTS == nil {
						periods[mapping.periodIndex].BTTS = &entity.YesNo{}
					}
					if mapping.isYes {
						periods[mapping.periodIndex].BTTS.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "btts", "Yes", mapping.periodIndex)}
					} else {
						periods[mapping.periodIndex].BTTS.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "btts", "No", mapping.periodIndex)}
					}
				}
			}

		case 53: // Odd/Even (TipID 115/116) → Period 0
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getOddEvenMapping(odd.TipID, entity.SportHockey); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].OddEven == nil {
						periods[mapping.periodIndex].OddEven = &entity.YesNo{}
					}
					if mapping.isYes {
						periods[mapping.periodIndex].OddEven.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "odd_even", "Yes", mapping.periodIndex)}
					} else {
						periods[mapping.periodIndex].OddEven.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "odd_even", "No", mapping.periodIndex)}
					}
				}
			}

		case 54: // Total Goals (TipID 103/105, 172/175/176/177) → Period 4 (regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 105: // Over (main line)
					if odd.G != 0 {
						line := formatLine(odd.G)
						ensureTotals(&periods[PeriodHockeyRegulation], line)
						periods[PeriodHockeyRegulation].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodHockeyRegulation)}
					}
				case 103: // Under (main line)
					if odd.G != 0 {
						line := formatLine(odd.G)
						ensureTotals(&periods[PeriodHockeyRegulation], line)
						periods[PeriodHockeyRegulation].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodHockeyRegulation)}
					}
				case 172: // Over 4.5
					ensureTotals(&periods[PeriodHockeyRegulation], "4.5")
					periods[PeriodHockeyRegulation].Totals["4.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodHockeyRegulation)}
				case 175: // Under 4.5
					ensureTotals(&periods[PeriodHockeyRegulation], "4.5")
					periods[PeriodHockeyRegulation].Totals["4.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodHockeyRegulation)}
				case 176: // Over 6.5
					ensureTotals(&periods[PeriodHockeyRegulation], "6.5")
					periods[PeriodHockeyRegulation].Totals["6.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodHockeyRegulation)}
				case 177: // Under 6.5
					ensureTotals(&periods[PeriodHockeyRegulation], "6.5")
					periods[PeriodHockeyRegulation].Totals["6.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodHockeyRegulation)}
				}
			}

		case 55: // Total Goals 1st Period (TipID 165/167) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 167: // Over P1
					if odd.G != 0 {
						line := formatLine(odd.G)
						ensureTotals(&periods[PeriodHockeyP1], line)
						periods[PeriodHockeyP1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", PeriodHockeyP1)}
					}
				case 165: // Under P1
					if odd.G != 0 {
						line := formatLine(odd.G)
						ensureTotals(&periods[PeriodHockeyP1], line)
						periods[PeriodHockeyP1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", PeriodHockeyP1)}
					}
				}
			}

		case 59: // IT1 Team Total (TipID 168/169) → Period 4 (regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 168: // T1 Over
						ensureTeamTotals(&periods[PeriodHockeyRegulation], line, true)
						periods[PeriodHockeyRegulation].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodHockeyRegulation)}
					case 169: // T1 Under
						ensureTeamTotals(&periods[PeriodHockeyRegulation], line, true)
						periods[PeriodHockeyRegulation].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodHockeyRegulation)}
					}
				}
			}

		case 60: // IT2 Team Total (TipID 170/171) → Period 4 (regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 170: // T2 Over
						ensureTeamTotals(&periods[PeriodHockeyRegulation], line, false)
						periods[PeriodHockeyRegulation].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodHockeyRegulation)}
					case 171: // T2 Under
						ensureTeamTotals(&periods[PeriodHockeyRegulation], line, false)
						periods[PeriodHockeyRegulation].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodHockeyRegulation)}
					}
				}
			}

		case 98: // IT1 1st Period (TipID 746/747) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 747: // T1 Over P1
						ensureTeamTotals(&periods[PeriodHockeyP1], line, true)
						periods[PeriodHockeyP1].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", PeriodHockeyP1)}
					case 746: // T1 Under P1
						ensureTeamTotals(&periods[PeriodHockeyP1], line, true)
						periods[PeriodHockeyP1].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", PeriodHockeyP1)}
					}
				}
			}

		case 99: // IT2 1st Period (TipID 748/749) → Period 1
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 749: // T2 Over P1
						ensureTeamTotals(&periods[PeriodHockeyP1], line, false)
						periods[PeriodHockeyP1].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", PeriodHockeyP1)}
					case 748: // T2 Under P1
						ensureTeamTotals(&periods[PeriodHockeyP1], line, false)
						periods[PeriodHockeyP1].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", PeriodHockeyP1)}
					}
				}
			}

		case 42: // Handicap match (TipID 121/123) → Period 4 (regulation)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				var isWin1 bool
				switch odd.TipID {
				case 121:
					isWin1 = true
				case 123:
					isWin1 = false
				default:
					continue
				}
				hcpLine := odd.G
				var lineStr string
				if isWin1 {
					lineStr = formatLine(hcpLine)
				} else {
					lineStr = formatLine(-hcpLine)
				}
				ensureMapEntry(periods[PeriodHockeyRegulation].Handicap, lineStr)
				if isWin1 {
					periods[PeriodHockeyRegulation].Handicap[lineStr].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", PeriodHockeyRegulation)}
				} else {
					periods[PeriodHockeyRegulation].Handicap[lineStr].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", PeriodHockeyRegulation)}
				}
			}

		case 2: // Konačan Ishod - Kombinacije (Winner + Total Combos) → Regulation (no OT)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if key := prematchWinnerTotalComboKeyHockey(odd.TipID); key != "" {
					if periods[PeriodHockeyRegulation].WinnerTotalCombo == nil {
						periods[PeriodHockeyRegulation].WinnerTotalCombo = make(map[string]*entity.OddValue)
					}
					periods[PeriodHockeyRegulation].WinnerTotalCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "wtc", "sel", PeriodHockeyRegulation)}
				}
			}
		}
	}
}

// parseFullOddsSoccer extracts additional markets from GetTipoviV2 for Soccer and Handball.
// Uses TipID (numeric) for unified mapping with live API
func (s *PrematchService) parseFullOddsSoccer(tipovi []entity.PrematchTipovi, periods []entity.ResponsePeriod, sport entity.SportName) {
	for _, market := range tipovi {
		switch market.ID {
		case 9, 10, 11: // Dupla Šansa (Double Chance) + 1H/2H
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getDoubleChanceMapping(odd.TipID, sport); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].DoubleChance == nil {
						periods[mapping.periodIndex].DoubleChance = &entity.DoubleChanceStruct{}
					}
					switch mapping.dcType {
					case "1X":
						periods[mapping.periodIndex].DoubleChance.W1X = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W1X", mapping.periodIndex)}
					case "X2":
						periods[mapping.periodIndex].DoubleChance.WX2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "WX2", mapping.periodIndex)}
					case "12":
						periods[mapping.periodIndex].DoubleChance.W12 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W12", mapping.periodIndex)}
					}
				}
			}

		case 25: // Oba tima daju gol (BTTS)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getBTTSMapping(odd.TipID, sport); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].BTTS == nil {
						periods[mapping.periodIndex].BTTS = &entity.YesNo{}
					}
					if mapping.isYes {
						periods[mapping.periodIndex].BTTS.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "btts", "Yes", mapping.periodIndex)}
					} else {
						periods[mapping.periodIndex].BTTS.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "btts", "No", mapping.periodIndex)}
					}
				}
			}

		case 44: // Winner (Draw No Bet)
			if periods[0].DrawNoBet == nil {
				periods[0].DrawNoBet = &entity.DrawNoBetStruct{}
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 106:
					periods[0].DrawNoBet.Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "dnb", "Home", 0)}
				case 107:
					periods[0].DrawNoBet.Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "dnb", "Away", 0)}
				}
			}

		case 53: // Par/Nepar (Odd/Even Total)
			if periods[0].OddEven == nil {
				periods[0].OddEven = &entity.YesNo{}
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 115:
					periods[0].OddEven.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "odd_even", "Yes", 0)}
				case 116:
					periods[0].OddEven.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, "", "odd_even", "No", 0)}
				}
			}

		// NOTE: IT1/IT2 (markets 27, 32) handled below with prematch-specific TipIDs
		// (100/99/110/139/365 for IT1, 102/101/111/140/387 for IT2)

		case 59: // IT1 Team Total (TipID 168/169) → Period 0
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 168:
						ensureFirstTeamTotals(&periods[0], line)
						periods[0].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
					case 169:
						ensureFirstTeamTotals(&periods[0], line)
						periods[0].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 0)}
					}
				}
			}

		case 60: // IT2 Team Total (TipID 170/171) → Period 0
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G != 0 {
					line := formatLine(odd.G)
					switch odd.TipID {
					case 170:
						ensureSecondTeamTotals(&periods[0], line)
						periods[0].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
					case 171:
						ensureSecondTeamTotals(&periods[0], line)
						periods[0].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 0)}
					}
				}
			}

		case 14: // Ukupno Golova (Total Goals) — 0-X = Under, X+ = Over
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 105: // Over match
					if odd.G != 0 {
						line := formatLine(odd.G)
						ensureTotals(&periods[0], line)
						periods[0].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
					}
				case 103: // Under match
					if odd.G != 0 {
						line := formatLine(odd.G)
						ensureTotals(&periods[0], line)
						periods[0].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
					}
				// Prematch-specific TipIDs: 0-X = Under (X+0.5), X+ = Over (X-0.5)
				case 69: // 0-1 gol = Under 1.5
					ensureTotals(&periods[0], "1.5")
					periods[0].Totals["1.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				case 73: // 2+ = Over 1.5
					ensureTotals(&periods[0], "1.5")
					periods[0].Totals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 70: // 0-2 = Under 2.5
					ensureTotals(&periods[0], "2.5")
					periods[0].Totals["2.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				case 74: // 3+ = Over 2.5
					ensureTotals(&periods[0], "2.5")
					periods[0].Totals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 71: // 0-3 = Under 3.5
					ensureTotals(&periods[0], "3.5")
					periods[0].Totals["3.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				case 89: // 4+ = Over 3.5
					ensureTotals(&periods[0], "3.5")
					periods[0].Totals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 332: // 0-4 = Under 4.5
					ensureTotals(&periods[0], "4.5")
					periods[0].Totals["4.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				case 91: // 5+ = Over 4.5
					ensureTotals(&periods[0], "4.5")
					periods[0].Totals["4.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 192: // 6+ = Over 5.5
					ensureTotals(&periods[0], "5.5")
					periods[0].Totals["5.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 92: // 7+ = Over 6.5
					ensureTotals(&periods[0], "6.5")
					periods[0].Totals["6.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				}
			}

		case 17: // Ukupno Golova - Prvo Pol. (1st Half Total)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 167: // Over 1H
						if odd.G != 0 {
							line := formatLine(odd.G)
							ensureTotals(&periods[1], line)
							periods[1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
						}
					case 165: // Under 1H
						if odd.G != 0 {
							line := formatLine(odd.G)
							ensureTotals(&periods[1], line)
							periods[1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 1)}
						}
					// Prematch-specific TipIDs
					case 344: // 0 gol. I = Under 0.5 1H
						ensureTotals(&periods[1], "0.5")
						periods[1].Totals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 1)}
					case 64: // 1+ I = Over 0.5 1H
						ensureTotals(&periods[1], "0.5")
						periods[1].Totals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					case 65: // 2+ I = Over 1.5 1H
						ensureTotals(&periods[1], "1.5")
						periods[1].Totals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					case 66: // 3+ I = Over 2.5 1H
						ensureTotals(&periods[1], "2.5")
						periods[1].Totals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					case 345: // 4+ I = Over 3.5 1H
						ensureTotals(&periods[1], "3.5")
						periods[1].Totals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					}
				}
			}

		case 7: // Prvo Poluvreme (1st Half 1X2)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 93:
					periods[1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 1)}
				case 94:
					periods[1].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", 1)}
				case 95:
					periods[1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 1)}
				}
			}

		case 8: // Drugo Poluvreme (2nd Half 1X2)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 96:
						periods[2].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 2)}
					case 97:
						periods[2].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", 2)}
					case 98:
						periods[2].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 2)}
					}
				}
			}

		case 42: // Hendikep (European 3-way Handicap match)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				line := fmt.Sprintf("%.0f", odd.G)
				if periods[0].ThreeWayHandicap == nil {
					periods[0].ThreeWayHandicap = make(map[string]*entity.ThreeWayHcap)
				}
				if periods[0].ThreeWayHandicap[line] == nil {
					periods[0].ThreeWayHandicap[line] = &entity.ThreeWayHcap{}
				}
				switch odd.TipID {
				case 121:
					periods[0].ThreeWayHandicap[line].Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "3wh", "Home", 0)}
				case 122:
					periods[0].ThreeWayHandicap[line].Draw = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "3wh", "Draw", 0)}
				case 123:
					periods[0].ThreeWayHandicap[line].Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "3wh", "Away", 0)}
				}
			}

		case 43: // Hendikep Poluvreme (European 3-way Handicap 1st half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					line := fmt.Sprintf("%.0f", odd.G)
					if periods[1].ThreeWayHandicap == nil {
						periods[1].ThreeWayHandicap = make(map[string]*entity.ThreeWayHcap)
					}
					if periods[1].ThreeWayHandicap[line] == nil {
						periods[1].ThreeWayHandicap[line] = &entity.ThreeWayHcap{}
					}
					switch odd.TipID {
					case 162:
						periods[1].ThreeWayHandicap[line].Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "3wh", "Home", 1)}
					case 163:
						periods[1].ThreeWayHandicap[line].Draw = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "3wh", "Draw", 1)}
					case 164:
						periods[1].ThreeWayHandicap[line].Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "3wh", "Away", 1)}
					}
				}
			}

		case 45: // Winner - Poluvreme (Draw No Bet 1st Half)
			if len(periods) > 1 {
				if periods[1].DrawNoBet == nil {
					periods[1].DrawNoBet = &entity.DrawNoBetStruct{}
				}
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 521:
						periods[1].DrawNoBet.Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dnb", "Home", 1)}
					case 522:
						periods[1].DrawNoBet.Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dnb", "Away", 1)}
					}
				}
			}

		case 46: // Prvi Daje Gol (First Team To Score)
			if periods[0].FirstTeamToScore == nil {
				periods[0].FirstTeamToScore = &entity.FirstTeamToScoreStruct{}
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 44:
					periods[0].FirstTeamToScore.Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "fts", "Home", 0)}
				case 45:
					periods[0].FirstTeamToScore.Neither = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "fts", "Neither", 0)}
				case 46:
					periods[0].FirstTeamToScore.Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "fts", "Away", 0)}
				}
			}

		case 3: // Poluvreme/Kraj (HT/FT)
			htftMap := map[int64]string{
				75: "1/1", 76: "1/X", 77: "1/2",
				78: "X/1", 79: "X/X", 80: "X/2",
				81: "2/1", 82: "2/X", 126: "2/2",
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if key, ok := htftMap[odd.TipID]; ok {
					if periods[0].HalfTimeFullTime == nil {
						periods[0].HalfTimeFullTime = make(map[string]*entity.OddValue)
					}
					periods[0].HalfTimeFullTime[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "htft", "sel", 0)}
				}
			}

		case 20: // Ukupno Golova - Drugo Pol. (2nd Half Total)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 755: // Over 2H
						if odd.G != 0 {
							line := formatLine(odd.G)
							ensureTotals(&periods[2], line)
							periods[2].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 2)}
						}
					case 754: // Under 2H
						if odd.G != 0 {
							line := formatLine(odd.G)
							ensureTotals(&periods[2], line)
							periods[2].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 2)}
						}
					case 347: // 0 gol. II = Under 0.5 2H
						ensureTotals(&periods[2], "0.5")
						periods[2].Totals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 2)}
					case 348: // 1+ II = Over 0.5 2H
						ensureTotals(&periods[2], "0.5")
						periods[2].Totals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 2)}
					case 67: // 2+ II = Over 1.5 2H
						ensureTotals(&periods[2], "1.5")
						periods[2].Totals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 2)}
					case 68: // 3+ II = Over 2.5 2H
						ensureTotals(&periods[2], "2.5")
						periods[2].Totals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 2)}
					case 349: // 4+ II = Over 3.5 2H
						ensureTotals(&periods[2], "3.5")
						periods[2].Totals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 2)}
					}
				}
			}

		case 15: // Ukupno Golova - Opseg (Total Goals Range)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				key := prematchTotalGoalsRangeKey(odd.TipID)
				if key == "" {
					continue
				}
				if periods[0].TotalGoalsRange == nil {
					periods[0].TotalGoalsRange = make(map[string]*entity.OddValue)
				}
				periods[0].TotalGoalsRange[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "tgr", "sel", 0)}
				// Also populate standard Totals from 0-X and X+ patterns
				prematchTotalGoalsRangeToTotals(&periods[0], odd.TipID, odd.Kvota)
			}

		case 18: // Golova 1p. ops. (Total Goals Range 1st Half)
			if len(periods) <= 1 {
				continue
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				key := prematchTotalGoalsRangeKey1H(odd.TipID)
				if key == "" {
					continue
				}
				if periods[1].TotalGoalsRange == nil {
					periods[1].TotalGoalsRange = make(map[string]*entity.OddValue)
				}
				periods[1].TotalGoalsRange[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "tgr", "sel", 1)}
			}

		case 21: // Golova 2p. ops. (Total Goals Range 2nd Half)
			if len(periods) <= 2 {
				continue
			}
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				key := prematchTotalGoalsRangeKey2H(odd.TipID)
				if key == "" {
					continue
				}
				if periods[2].TotalGoalsRange == nil {
					periods[2].TotalGoalsRange = make(map[string]*entity.OddValue)
				}
				periods[2].TotalGoalsRange[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "tgr", "sel", 2)}
			}

		case 225: // Ukupno Golova - Tačno (Exact Total Goals)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				key := prematchExactTotalGoalsKey(odd.TipID)
				if key == "" {
					continue
				}
				if periods[0].ExactTotalGoals == nil {
					periods[0].ExactTotalGoals = make(map[string]*entity.OddValue)
				}
				periods[0].ExactTotalGoals[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "etg", "sel", 0)}
			}

		case 56: // Tačan Rezultat (Correct Score match)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				key := prematchCorrectScoreKey(odd.TipID)
				if key == "" {
					continue
				}
				if periods[0].CorrectScore == nil {
					periods[0].CorrectScore = make(map[string]*entity.OddValue)
				}
				periods[0].CorrectScore[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "cs", "sel", 0)}
			}

		case 57: // Tačan Rezultat - Poluvreme (Correct Score 1st Half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					key := prematchCorrectScoreHTKey(odd.TipID)
					if key == "" {
						continue
					}
					if periods[1].CorrectScore == nil {
						periods[1].CorrectScore = make(map[string]*entity.OddValue)
					}
					periods[1].CorrectScore[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "cs", "sel", 1)}
				}
			}

		case 40: // Sigurna Pobeda (Win To Nil)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 117: // Home Win To Nil
					if periods[0].HomeWinToNil == nil {
						periods[0].HomeWinToNil = &entity.YesNo{}
					}
					periods[0].HomeWinToNil.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "hwn", "Yes", 0)}
				case 118: // Away Win To Nil
					if periods[0].AwayWinToNil == nil {
						periods[0].AwayWinToNil = &entity.YesNo{}
					}
					periods[0].AwayWinToNil.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "awn", "Yes", 0)}
				}
			}

		case 27: // Tim 1 Golova (Home Team Goals) → FirstTeamTotals + HomeExactGoals
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 100: // T1 0 = Under 0.5 IT1
					ensureFirstTeamTotals(&periods[0], "0.5")
					periods[0].FirstTeamTotals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 0)}
					ensureHomeExactGoals(&periods[0])
					periods[0].HomeExactGoals["0"] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "heg", "sel", 0)}
				case 99: // T1 1+ = Over 0.5 IT1
					ensureFirstTeamTotals(&periods[0], "0.5")
					periods[0].FirstTeamTotals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
				case 110: // T1 2+ = Over 1.5 IT1
					ensureFirstTeamTotals(&periods[0], "1.5")
					periods[0].FirstTeamTotals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
				case 139: // T1 3+ = Over 2.5 IT1
					ensureFirstTeamTotals(&periods[0], "2.5")
					periods[0].FirstTeamTotals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
				case 365: // T1 4+ = Over 3.5 IT1
					ensureFirstTeamTotals(&periods[0], "3.5")
					periods[0].FirstTeamTotals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
				}
			}

		case 32: // Tim 2 Golova (Away Team Goals) → SecondTeamTotals + AwayExactGoals
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 102: // T2 0 = Under 0.5 IT2
					ensureSecondTeamTotals(&periods[0], "0.5")
					periods[0].SecondTeamTotals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 0)}
					ensureAwayExactGoals(&periods[0])
					periods[0].AwayExactGoals["0"] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "aeg", "sel", 0)}
				case 101: // T2 1+ = Over 0.5 IT2
					ensureSecondTeamTotals(&periods[0], "0.5")
					periods[0].SecondTeamTotals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
				case 111: // T2 2+ = Over 1.5 IT2
					ensureSecondTeamTotals(&periods[0], "1.5")
					periods[0].SecondTeamTotals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
				case 140: // T2 3+ = Over 2.5 IT2
					ensureSecondTeamTotals(&periods[0], "2.5")
					periods[0].SecondTeamTotals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
				case 387: // T2 4+ = Over 3.5 IT2
					ensureSecondTeamTotals(&periods[0], "3.5")
					periods[0].SecondTeamTotals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
				}
			}

		case 29: // Tim 1 Golova - Prvo Pol. (Home Goals 1st Half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 136: // T1 0 I = Under 0.5 IT1 1H
						ensureFirstTeamTotals(&periods[1], "0.5")
						periods[1].FirstTeamTotals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 1)}
					case 135: // T1 1+ I = Over 0.5 IT1 1H
						ensureFirstTeamTotals(&periods[1], "0.5")
						periods[1].FirstTeamTotals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 1)}
					case 108: // T1 2+ I = Over 1.5 IT1 1H
						ensureFirstTeamTotals(&periods[1], "1.5")
						periods[1].FirstTeamTotals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 1)}
					case 377: // T1 3+ I = Over 2.5 IT1 1H
						ensureFirstTeamTotals(&periods[1], "2.5")
						periods[1].FirstTeamTotals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 1)}
					case 378: // T1 4+ I = Over 3.5 IT1 1H
						ensureFirstTeamTotals(&periods[1], "3.5")
						periods[1].FirstTeamTotals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 1)}
					}
				}
			}

		case 34: // Tim 2 Golova - Prvo Pol. (Away Goals 1st Half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 138: // T2 0 I = Under 0.5 IT2 1H
						ensureSecondTeamTotals(&periods[1], "0.5")
						periods[1].SecondTeamTotals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 1)}
					case 137: // T2 1+ I = Over 0.5 IT2 1H
						ensureSecondTeamTotals(&periods[1], "0.5")
						periods[1].SecondTeamTotals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 1)}
					case 109: // T2 2+ I = Over 1.5 IT2 1H
						ensureSecondTeamTotals(&periods[1], "1.5")
						periods[1].SecondTeamTotals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 1)}
					case 399: // T2 3+ I = Over 2.5 IT2 1H
						ensureSecondTeamTotals(&periods[1], "2.5")
						periods[1].SecondTeamTotals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 1)}
					case 400: // T2 4+ I = Over 3.5 IT2 1H
						ensureSecondTeamTotals(&periods[1], "3.5")
						periods[1].SecondTeamTotals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 1)}
					}
				}
			}

		case 30: // Tim 1 Golova - Drugo Pol. (Home Goals 2nd Half)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 505: // T1 0 II = Under 0.5 IT1 2H
						ensureFirstTeamTotals(&periods[2], "0.5")
						periods[2].FirstTeamTotals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 2)}
					case 506: // T1 1+ II = Over 0.5 IT1 2H
						ensureFirstTeamTotals(&periods[2], "0.5")
						periods[2].FirstTeamTotals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 2)}
					case 507: // T1 2+ II = Over 1.5 IT1 2H
						ensureFirstTeamTotals(&periods[2], "1.5")
						periods[2].FirstTeamTotals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 2)}
					case 508: // T1 3+ II = Over 2.5 IT1 2H
						ensureFirstTeamTotals(&periods[2], "2.5")
						periods[2].FirstTeamTotals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 2)}
					case 509: // T1 4+ II = Over 3.5 IT1 2H
						ensureFirstTeamTotals(&periods[2], "3.5")
						periods[2].FirstTeamTotals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 2)}
					}
				}
			}

		case 35: // Tim 2 Golova - Drugo Pol. (Away Goals 2nd Half)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 513: // T2 0 II = Under 0.5 IT2 2H
						ensureSecondTeamTotals(&periods[2], "0.5")
						periods[2].SecondTeamTotals["0.5"].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 2)}
					case 514: // T2 1+ II = Over 0.5 IT2 2H
						ensureSecondTeamTotals(&periods[2], "0.5")
						periods[2].SecondTeamTotals["0.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 2)}
					case 515: // T2 2+ II = Over 1.5 IT2 2H
						ensureSecondTeamTotals(&periods[2], "1.5")
						periods[2].SecondTeamTotals["1.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 2)}
					case 516: // T2 3+ II = Over 2.5 IT2 2H
						ensureSecondTeamTotals(&periods[2], "2.5")
						periods[2].SecondTeamTotals["2.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 2)}
					case 517: // T2 4+ II = Over 3.5 IT2 2H
						ensureSecondTeamTotals(&periods[2], "3.5")
						periods[2].SecondTeamTotals["3.5"].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 2)}
					}
				}
			}

		case 2: // Konačan Ishod - Kombinacije (Winner + Total Combos)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				// Full match combos → periods[0]
				if key := prematchWinnerTotalComboKey(odd.TipID); key != "" {
					if periods[0].WinnerTotalCombo == nil {
						periods[0].WinnerTotalCombo = make(map[string]*entity.OddValue)
					}
					periods[0].WinnerTotalCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "wtc", "sel", 0)}
					continue
				}
				// 1st Half combos → periods[1]
				if len(periods) > 1 {
					if key := prematchWinnerTotalComboKey1H(odd.TipID); key != "" {
						if periods[1].WinnerTotalCombo == nil {
							periods[1].WinnerTotalCombo = make(map[string]*entity.OddValue)
						}
						periods[1].WinnerTotalCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "wtc", "sel", 1)}
						continue
					}
				}
				// 2nd Half combos → periods[2]
				if len(periods) > 2 {
					if key := prematchWinnerTotalComboKey2H(odd.TipID); key != "" {
						if periods[2].WinnerTotalCombo == nil {
							periods[2].WinnerTotalCombo = make(map[string]*entity.OddValue)
						}
						periods[2].WinnerTotalCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "wtc", "sel", 2)}
						continue
					}
				}
			}

		case 26: // GG/NG - KOMBINACIJE (BTTS + Total Combo, BTTS + Winner Combo)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if key := prematchBTTSTotalComboKey(odd.TipID); key != "" {
					if periods[0].BTTSTotalCombo == nil {
						periods[0].BTTSTotalCombo = make(map[string]*entity.OddValue)
					}
					periods[0].BTTSTotalCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "btc", "sel", 0)}
				} else if key := prematchBTTSWinnerComboKey(odd.TipID); key != "" {
					if periods[0].BTTSWinnerCombo == nil {
						periods[0].BTTSWinnerCombo = make(map[string]*entity.OddValue)
					}
					periods[0].BTTSWinnerCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "bwc", "sel", 0)}
				}
			}
		}
	}
}

// parseFullOddsHandball extracts additional markets from GetTipoviV2 for Handball.
// Separated from Soccer because:
//   - Totals use market ID 54 "Ukupno Poena" (vs soccer ID 14 "Ukupno Golova")
//   - Handicap is 2-way Asian (half-integer lines, no draw) stored in Handicap map
//     (vs soccer 3-way European stored in ThreeWayHandicap)
//   - WinnerTotalCombo uses market ID 61 with dynamic lines (vs soccer market 2 with fixed TipIDs)
//   - Half totals use IDs 55/102 (vs soccer embedded in ID 14)
//
// All markets are regulation time (no overtime in group/league stages).
func (s *PrematchService) parseFullOddsHandball(tipovi []entity.PrematchTipovi, periods []entity.ResponsePeriod) {
	for _, market := range tipovi {
		switch market.ID {

		case 54: // Ukupno Poena (Total Points match) — all alt lines via G value
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 || odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 103, 450, 1226, 1205, 452: // Under
					ensureTotals(&periods[0], line)
					periods[0].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				case 105, 451, 1227, 1206, 453: // Over
					ensureTotals(&periods[0], line)
					periods[0].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				}
			}

		case 55: // Ukupno Poena - Poluvreme (Total Points 1st Half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 || odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 165: // Under
						ensureTotals(&periods[1], line)
						periods[1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 1)}
					case 167: // Over
						ensureTotals(&periods[1], line)
						periods[1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					}
				}
			}

		case 102: // Ukupno Poena - Drugo Poluvreme (Total Points 2nd Half)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 || odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 754: // Under
						ensureTotals(&periods[2], line)
						periods[2].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 2)}
					case 755: // Over
						ensureTotals(&periods[2], line)
						periods[2].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 2)}
					}
				}
			}

		case 42: // Hendikep (Asian 2-way Handicap match)
			// Handball handicap lines are half-integers (no draw possible).
			// Store as Asian Handicap: Home at [G].Win1, Away at [-G].Win2 —
			// matches Pinnacle's convention of two separate map entries per line.
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 121, 446, 448: // Home
					homeLine := formatLine(odd.G)
					if periods[0].Handicap == nil {
						periods[0].Handicap = make(map[string]*entity.WinHandicap)
					}
					ensureMapEntry(periods[0].Handicap, homeLine)
					periods[0].Handicap[homeLine].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", 0)}
				case 123, 447, 449: // Away
					awayLine := formatLine(-odd.G)
					if periods[0].Handicap == nil {
						periods[0].Handicap = make(map[string]*entity.WinHandicap)
					}
					ensureMapEntry(periods[0].Handicap, awayLine)
					periods[0].Handicap[awayLine].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", 0)}
				}
			}

		case 43: // Hendikep Poluvreme (Asian 2-way Handicap 1st Half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 162: // Home
						homeLine := formatLine(odd.G)
						if periods[1].Handicap == nil {
							periods[1].Handicap = make(map[string]*entity.WinHandicap)
						}
						ensureMapEntry(periods[1].Handicap, homeLine)
						periods[1].Handicap[homeLine].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", 1)}
					case 164: // Away
						awayLine := formatLine(-odd.G)
						if periods[1].Handicap == nil {
							periods[1].Handicap = make(map[string]*entity.WinHandicap)
						}
						ensureMapEntry(periods[1].Handicap, awayLine)
						periods[1].Handicap[awayLine].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", 1)}
					}
				}
			}

		case 9: // Dupla Šansa (Double Chance match)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if periods[0].DoubleChance == nil {
					periods[0].DoubleChance = &entity.DoubleChanceStruct{}
				}
				switch odd.TipID {
				case 83:
					periods[0].DoubleChance.W1X = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W1X", 0)}
				case 84:
					periods[0].DoubleChance.WX2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "WX2", 0)}
				case 85:
					periods[0].DoubleChance.W12 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W12", 0)}
				}
			}

		case 10: // Dupla Šansa Prvo Pol. (Double Chance 1st Half)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					if periods[1].DoubleChance == nil {
						periods[1].DoubleChance = &entity.DoubleChanceStruct{}
					}
					switch odd.TipID {
					case 307:
						periods[1].DoubleChance.W1X = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W1X", 1)}
					case 308:
						periods[1].DoubleChance.WX2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "WX2", 1)}
					case 309:
						periods[1].DoubleChance.W12 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dc", "W12", 1)}
					}
				}
			}

		case 53: // Par/Nepar (Odd/Even Total)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if periods[0].OddEven == nil {
					periods[0].OddEven = &entity.YesNo{}
				}
				switch odd.TipID {
				case 115: // Odd = Yes
					periods[0].OddEven.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "odd_even", "Yes", 0)}
				case 116: // Even = No
					periods[0].OddEven.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "odd_even", "No", 0)}
				}
			}

		case 59: // Ukupno Poena Tim 1 (IT1 match)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 || odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 168: // Over
					ensureTeamTotals(&periods[0], line, true)
					periods[0].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
				case 169: // Under
					ensureTeamTotals(&periods[0], line, true)
					periods[0].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 0)}
				}
			}

		case 60: // Ukupno Poena Tim 2 (IT2 match)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 || odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 170: // Over
					ensureTeamTotals(&periods[0], line, false)
					periods[0].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
				case 171: // Under
					ensureTeamTotals(&periods[0], line, false)
					periods[0].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 0)}
				}
			}

		case 98: // IT1 1H (746=Under, 747=Over)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 || odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 747:
						ensureTeamTotals(&periods[1], line, true)
						periods[1].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 1)}
					case 746:
						ensureTeamTotals(&periods[1], line, true)
						periods[1].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 1)}
					}
				}
			}

		case 99: // IT2 1H (748=Under, 749=Over)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 || odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 749:
						ensureTeamTotals(&periods[1], line, false)
						periods[1].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 1)}
					case 748:
						ensureTeamTotals(&periods[1], line, false)
						periods[1].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 1)}
					}
				}
			}

		case 100: // IT1 2H (750=Under, 751=Over)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 || odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 751:
						ensureTeamTotals(&periods[2], line, true)
						periods[2].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 2)}
					case 750:
						ensureTeamTotals(&periods[2], line, true)
						periods[2].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 2)}
					}
				}
			}

		case 101: // IT2 2H (752=Under, 753=Over)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 || odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 753:
						ensureTeamTotals(&periods[2], line, false)
						periods[2].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 2)}
					case 752:
						ensureTeamTotals(&periods[2], line, false)
						periods[2].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 2)}
					}
				}
			}

		case 7: // Prvo Poluvreme (1st Half Win1x2)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 93:
						periods[1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 1)}
					case 94:
						periods[1].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", 1)}
					case 95:
						periods[1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 1)}
					}
				}
			}

		case 8: // Drugo Poluvreme (2nd Half Win1x2)
			if len(periods) > 2 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 96:
						periods[2].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 2)}
					case 97:
						periods[2].Win1x2.WinNone = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "WinNone", 2)}
					case 98:
						periods[2].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 2)}
					}
				}
			}

		case 25: // Oba tima daju gol (BTTS)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if mapping, ok := getBTTSMapping(odd.TipID, entity.SportHandball); ok {
					if mapping.periodIndex >= len(periods) {
						continue
					}
					if periods[mapping.periodIndex].BTTS == nil {
						periods[mapping.periodIndex].BTTS = &entity.YesNo{}
					}
					if mapping.isYes {
						periods[mapping.periodIndex].BTTS.Yes = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "btts", "Yes", mapping.periodIndex)}
					} else {
						periods[mapping.periodIndex].BTTS.No = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "btts", "No", mapping.periodIndex)}
					}
				}
			}

		case 44: // Winner (Draw No Bet)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if periods[0].DrawNoBet == nil {
					periods[0].DrawNoBet = &entity.DrawNoBetStruct{}
				}
				switch odd.TipID {
				case 106:
					periods[0].DrawNoBet.Home = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dnb", "Home", 0)}
				case 107:
					periods[0].DrawNoBet.Away = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "dnb", "Away", 0)}
				}
			}

		case 61: // Konačan Ishod i Ukupno Poena (Winner + Total Combo with dynamic line)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 || odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				var key string
				switch odd.TipID {
				case 454:
					key = "Home & Under " + line
				case 455:
					key = "Home & Over " + line
				case 627:
					key = "Draw & Under " + line
				case 628:
					key = "Draw & Over " + line
				case 456:
					key = "Away & Under " + line
				case 457:
					key = "Away & Over " + line
				}
				if key != "" {
					if periods[0].WinnerTotalCombo == nil {
						periods[0].WinnerTotalCombo = make(map[string]*entity.OddValue)
					}
					periods[0].WinnerTotalCombo[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "wtc", "sel", 0)}
				}
			}
		}
	}
}

// parseFullOddsTennis extracts additional markets from GetTipoviV2 for Tennis
// Uses TipID (numeric) for unified mapping with live API
func (s *PrematchService) parseFullOddsTennis(tipovi []entity.PrematchTipovi, periods []entity.ResponsePeriod) {
	for _, market := range tipovi {
		switch market.ID {
		case 1: // Konačan ishod (Match Winner)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 1:
					periods[0].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 0)}
				case 10:
					periods[0].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 0)}
				}
			}

		case 64: // Ukupno Gemova (Total Games)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 666: // Over
					ensureTotals(&periods[0], line)
					periods[0].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 665: // Under
					ensureTotals(&periods[0], line)
					periods[0].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				}
			}

		case 235: // Hendikep Gemova (Games Handicap)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				ensureMapEntry(periods[0].Handicap, line)
				switch odd.TipID {
				case 1193: // Player 1 handicap
					periods[0].Handicap[line].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", 0)}
				case 1194: // Player 2 handicap
					periods[0].Handicap[line].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", 0)}
				}
			}

		case 68: // Pobednik - Prvi Set (1st Set Winner)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 691:
						periods[1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 1)}
					case 692:
						periods[1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 1)}
					}
				}
			}

		case 172: // Ukupno Poena - Prvi Set (1st Set Total)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					if odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 1070: // Over
						ensureTotals(&periods[1], line)
						periods[1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					case 1069: // Under
						ensureTotals(&periods[1], line)
						periods[1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 1)}
					}
				}
			}

		case 59: // IT1 Player 1 Total Games (TipID 168/169)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 168:
					ensureTeamTotals(&periods[0], line, true)
					periods[0].FirstTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinMore", 0)}
				case 169:
					ensureTeamTotals(&periods[0], line, true)
					periods[0].FirstTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it1", "WinLess", 0)}
				}
			}

		case 60: // IT2 Player 2 Total Games (TipID 170/171)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 170:
					ensureTeamTotals(&periods[0], line, false)
					periods[0].SecondTeamTotals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinMore", 0)}
				case 171:
					ensureTeamTotals(&periods[0], line, false)
					periods[0].SecondTeamTotals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "it2", "WinLess", 0)}
				}
			}

		case 56: // Tačan Rezultat (Correct Score) — e.g. 2:0, 2:1, 0:2, 1:2
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				tv := odd.TipVnes
				if len(tv) < 2 {
					continue
				}
				key := string(tv[0]) + ":" + string(tv[1])
				if periods[0].CorrectScore == nil {
					periods[0].CorrectScore = make(map[string]*entity.OddValue)
				}
				periods[0].CorrectScore[key] = &entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "cs", "sel", 0)}
			}
		}
	}
}

// parseFullOddsVolleyball extracts additional markets from GetTipoviV2 for Volleyball
func (s *PrematchService) parseFullOddsVolleyball(tipovi []entity.PrematchTipovi, periods []entity.ResponsePeriod) {
	for _, market := range tipovi {
		switch market.ID {
		case 1: // Konačan ishod (Match Winner)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				switch odd.TipID {
				case 1:
					periods[0].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 0)}
				case 10:
					periods[0].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 0)}
				}
			}

		case 54: // Ukupno Poena (Total Points)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				switch odd.TipID {
				case 105: // Over
					ensureTotals(&periods[0], line)
					periods[0].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 0)}
				case 103: // Under
					ensureTotals(&periods[0], line)
					periods[0].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 0)}
				}
			}

		case 236: // Hendikep Poena (Points Handicap)
			for _, odd := range market.T {
				if odd.Kvota <= 1.0 {
					continue
				}
				if odd.G == 0 {
					continue
				}
				line := formatLine(odd.G)
				ensureMapEntry(periods[0].Handicap, line)
				switch odd.TipID {
				case 1275: // Team 1 handicap
					periods[0].Handicap[line].Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win1", 0)}
				case 1276: // Team 2 handicap
					periods[0].Handicap[line].Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "handicap", "Win2", 0)}
				}
			}

		case 68: // Pobednik - Prvi Set (1st Set Winner)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					switch odd.TipID {
					case 691:
						periods[1].Win1x2.Win1 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win1", 1)}
					case 692:
						periods[1].Win1x2.Win2 = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "1x2", "Win2", 1)}
					}
				}
			}

		case 172: // Ukupno Poena - Prvi Set (1st Set Total)
			if len(periods) > 1 {
				for _, odd := range market.T {
					if odd.Kvota <= 1.0 {
						continue
					}
					if odd.G == 0 {
						continue
					}
					line := formatLine(odd.G)
					switch odd.TipID {
					case 1070: // Over
						ensureTotals(&periods[1], line)
						periods[1].Totals[line].WinMore = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinMore", 1)}
					case 1069: // Under
						ensureTotals(&periods[1], line)
						periods[1].Totals[line].WinLess = entity.OddValue{Value: odd.Kvota, Raw: betCtx(odd.TipID, formatLine(odd.G), "total", "WinLess", 1)}
					}
				}
			}
		}
	}
}

// Helper functions

func prematchSportIDToName(sid int) entity.SportName {
	switch sid {
	case entity.PrematchSportFootball:
		return entity.SportSoccer
	case entity.PrematchSportBasketball:
		return entity.SportBasketball
	case entity.PrematchSportTennis:
		return entity.SportTennis
	case entity.PrematchSportHockey:
		return entity.SportHockey
	case entity.PrematchSportHandball:
		return entity.SportHandball
	case entity.PrematchSportVolleyball:
		return entity.SportVolleyball
	case entity.PrematchSportEsports:
		return entity.SportEsports
	}
	return ""
}

func parseTeamNames(pn string) (home, away string) {
	parts := strings.Split(pn, " : ")
	if len(parts) == 2 {
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	}
	return "", ""
}

func getPeriodsCount(sportName entity.SportName) int {
	switch sportName {
	case entity.SportSoccer, entity.SportHandball:
		return 3
	case entity.SportTennis:
		return 6
	case entity.SportBasketball:
		return 8 // Match + 4 Quarters + 1H + 2H + Regulation
	case entity.SportVolleyball:
		return 6
	case entity.SportTableTennis:
		return 8 // Match + 7 Sets
	case entity.SportHockey:
		return 5
	case entity.SportAmericanFootball:
		return 7 // Match + 4 Quarters + 2 Halves
	case entity.SportBaseball:
		return 10 // Match + 9 Innings
	case entity.SportEsports:
		return 1 // Match only
	}
	return 3
}

func ensureTotals(period *entity.ResponsePeriod, line string) {
	if period.Totals == nil {
		period.Totals = make(map[string]*entity.WinLessMore)
	}
	if period.Totals[line] == nil {
		period.Totals[line] = &entity.WinLessMore{}
	}
}

func ensureGames(period *entity.ResponsePeriod, line string) {
	if period.Games == nil {
		period.Games = make(map[string]*entity.Win1x2Struct)
	}
	if period.Games[line] == nil {
		period.Games[line] = &entity.Win1x2Struct{}
	}
}

func ensureTeamTotals(period *entity.ResponsePeriod, line string, isFirst bool) {
	if isFirst {
		if period.FirstTeamTotals == nil {
			period.FirstTeamTotals = make(map[string]*entity.WinLessMore)
		}
		if period.FirstTeamTotals[line] == nil {
			period.FirstTeamTotals[line] = &entity.WinLessMore{}
		}
	} else {
		if period.SecondTeamTotals == nil {
			period.SecondTeamTotals = make(map[string]*entity.WinLessMore)
		}
		if period.SecondTeamTotals[line] == nil {
			period.SecondTeamTotals[line] = &entity.WinLessMore{}
		}
	}
}

const (
	// Keep a small tolerance for parser-cycle latency and clock skew, but do not
	// keep re-fetching listings which are hours into the past. Analyzer applies
	// its own stricter MatchDate guard before exposing a prematch pair.
	prematchPastGrace = 5 * time.Minute
)

// isWithin24Hours checks both sides of the prematch window. DP values which can
// be parsed must not be older than the small grace interval or more than 24
// hours ahead of the reference time represented by cutoff - 24 hours.
func isWithin24Hours(dp string, cutoff time.Time) bool {
	matchTime := parseMatchDate(dp)
	if matchTime.IsZero() {
		// Preserve the existing availability behaviour for missing or new DP
		// formats; Analyzer still applies its freshness guards to these records.
		return true
	}

	windowStart := cutoff.Add(-24*time.Hour - prematchPastGrace)
	return !matchTime.Before(windowStart) && !matchTime.After(cutoff)
}

// parseMatchDate extracts match start time from DP field (same formats as isWithin24Hours)
func parseMatchDate(dp string) time.Time {
	dp = strings.TrimSpace(dp)
	if dp == "" {
		return time.Time{}
	}
	if matchTime, ok := parseDotNetMatchDate(dp); ok {
		return matchTime
	}
	if t, err := time.Parse("02.01.2006 15:04", dp); err == nil {
		return t
	}
	// The current Sansabet API commonly returns only a calendar date (for
	// example "08.08.2026").  Keep those events valid through the end of that
	// day, matching isWithin24Hours, instead of serializing Go's year-one zero
	// value and disabling Analyzer's prematch expiry guard entirely.
	if t, err := time.Parse("02.01.2006", dp); err == nil {
		return t.Add(24*time.Hour - time.Nanosecond)
	}
	if t, err := time.Parse(time.RFC3339, dp); err == nil {
		return t
	}
	return time.Time{}
}

// parseDotNetMatchDate parses /Date(<unix-ms>[+|-HHMM])/. The optional suffix
// is display-offset metadata; the epoch milliseconds already identify the
// absolute instant and must not be shifted by that suffix.
func parseDotNetMatchDate(dp string) (time.Time, bool) {
	const prefix = "/Date("
	const suffix = ")/"
	if !strings.HasPrefix(dp, prefix) || !strings.HasSuffix(dp, suffix) {
		return time.Time{}, false
	}

	value := dp[len(prefix) : len(dp)-len(suffix)]
	// Start at index 1 so a negative Unix epoch remains part of the value.
	for i := 1; i < len(value); i++ {
		if value[i] == '+' || value[i] == '-' {
			value = value[:i]
			break
		}
	}

	ms, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return time.Time{}, false
	}
	return time.UnixMilli(ms), true
}

// --- Helper functions for new prematch markets ---

func ensureFirstTeamTotals(period *entity.ResponsePeriod, line string) {
	if period.FirstTeamTotals == nil {
		period.FirstTeamTotals = make(map[string]*entity.WinLessMore)
	}
	if period.FirstTeamTotals[line] == nil {
		period.FirstTeamTotals[line] = &entity.WinLessMore{}
	}
}

func ensureSecondTeamTotals(period *entity.ResponsePeriod, line string) {
	if period.SecondTeamTotals == nil {
		period.SecondTeamTotals = make(map[string]*entity.WinLessMore)
	}
	if period.SecondTeamTotals[line] == nil {
		period.SecondTeamTotals[line] = &entity.WinLessMore{}
	}
}

func ensureHomeExactGoals(period *entity.ResponsePeriod) {
	if period.HomeExactGoals == nil {
		period.HomeExactGoals = make(map[string]*entity.OddValue)
	}
}

func ensureAwayExactGoals(period *entity.ResponsePeriod) {
	if period.AwayExactGoals == nil {
		period.AwayExactGoals = make(map[string]*entity.OddValue)
	}
}

// prematchCorrectScoreKey maps TipID → "H:A" for Correct Score (match)
// TipVnes encoding: first digit = home goals, second digit = away goals
func prematchCorrectScoreKey(tipID int64) string {
	csMap := map[int64]string{
		442: "0:0", 443: "0:1", 444: "0:2", 445: "0:3",
		211: "0:4", 212: "0:5", 213: "0:6", 214: "0:7", 215: "0:8", 216: "0:9",
		217: "1:0", 218: "1:1", 219: "1:2", 220: "1:3",
		221: "1:4", 222: "1:5", 223: "1:6", 224: "1:7", 225: "1:8",
		227: "2:0", 228: "2:1", 229: "2:2", 230: "2:3",
		231: "2:4", 232: "2:5",
		237: "3:0", 238: "3:1", 239: "3:2", 240: "3:3", 241: "3:4",
		247: "4:0", 248: "4:1", 249: "4:2", 250: "4:3",
		257: "5:0", 258: "5:1", 259: "5:2",
		267: "6:0", 268: "6:1",
		277: "7:0", 278: "7:1",
		287: "8:0", 288: "8:1",
		297: "9:0",
	}
	return csMap[tipID]
}

// prematchCorrectScoreHTKey maps TipID → "H:A" for Correct Score 1st Half
func prematchCorrectScoreHTKey(tipID int64) string {
	csMap := map[int64]string{
		527: "0:0", 528: "0:1", 529: "0:2", 530: "0:3",
		537: "1:0", 538: "1:1", 539: "1:2", 540: "1:3",
		547: "2:0", 548: "2:1", 549: "2:2", 550: "2:3",
		557: "3:0", 558: "3:1", 559: "3:2",
	}
	return csMap[tipID]
}

// prematchExactTotalGoalsKey maps TipID → goal count string
func prematchExactTotalGoalsKey(tipID int64) string {
	m := map[int64]string{
		1136: "1",
		340:  "2",
		341:  "3",
		342:  "4",
	}
	return m[tipID]
}

// prematchTotalGoalsRangeKey maps TipID → range string (e.g., "1-2", "2-3")
func prematchTotalGoalsRangeKey(tipID int64) string {
	m := map[int64]string{
		333: "1-2", 334: "1-3", 335: "1-4", 336: "1-5", 337: "1-6",
		72: "2-3", 178: "2-4", 201: "2-5", 338: "2-6",
		157: "3-4", 202: "3-5", 488: "3-6",
		339: "4-5", 90: "4-6",
	}
	return m[tipID]
}

// prematchTotalGoalsRangeKey1H maps TipID → range string for 1st Half
func prematchTotalGoalsRangeKey1H(tipID int64) string {
	m := map[int64]string{
		179: "0-1", 495: "0-2",
		343: "1-2", 1140: "1-3",
		181: "2-3", 643: "2-4",
	}
	return m[tipID]
}

// prematchTotalGoalsRangeKey2H maps TipID → range string for 2nd Half
func prematchTotalGoalsRangeKey2H(tipID int64) string {
	m := map[int64]string{
		180: "0-1", 500: "0-2", 1336: "0-3",
		441: "1-2", 1162: "1-3",
		182: "2-3", 655: "2-4",
	}
	return m[tipID]
}

// prematchTotalGoalsRangeToTotals also populates standard Totals from range patterns
func prematchTotalGoalsRangeToTotals(period *entity.ResponsePeriod, tipID int64, kvota float64) {
	// 0-X patterns → Under (X+0.5): NOT present in range market, they're in main Ukupno Golova
	// X+ patterns → Over (X-0.5): NOT present in range market either
	// Range patterns like "1-2" can't be directly converted to Asian totals
}

// prematchWinnerTotalComboKey maps TipID → combo string matching PS3838 format.
// Sansabet format: "N+" means N or more goals = Over (N-0.5); "0-N" means Under (N+0.5).
func prematchWinnerTotalComboKey(tipID int64) string {
	m := map[int64]string{
		// Home Win & Over: 3+=O2.5, 4+=O3.5, 5+=O4.5
		131: "Home & Over 2.5", 153: "Home & Over 3.5", 414: "Home & Over 4.5",
		// Home Win & Under: 0-2=U2.5, 0-3=U3.5, 0-4=U4.5
		197: "Home & Under 2.5", 411: "Home & Under 3.5", 931: "Home & Under 4.5",
		// Away Win & Over: 3+=O2.5, 4+=O3.5, 5+=O4.5
		132: "Away & Over 2.5", 154: "Away & Over 3.5", 420: "Away & Over 4.5",
		// Away Win & Under: 0-2=U2.5, 0-3=U3.5, 0-4=U4.5
		198: "Away & Under 2.5", 417: "Away & Under 3.5", 939: "Away & Under 4.5",
		// Draw & combos: 0-2=U2.5, 2+=O1.5, 4+=O3.5
		423: "Draw & Under 2.5", 424: "Draw & Over 1.5", 425: "Draw & Over 3.5",
	}
	return m[tipID]
}

// prematchWinnerTotalComboKeyHockey maps hockey TipID → combo string matching PS3838 format.
// Hockey uses 5.5/6.5 total lines (vs soccer 2.5/3.5/4.5).
func prematchWinnerTotalComboKeyHockey(tipID int64) string {
	m := map[int64]string{
		186: "Home & Under 5.5", 188: "Home & Over 5.5", 190: "Home & Over 6.5",
		187: "Away & Under 5.5", 189: "Away & Over 5.5", 191: "Away & Over 6.5",
	}
	return m[tipID]
}

// prematchWinnerTotalComboKey1H maps TipID → combo string for 1st Half totals
func prematchWinnerTotalComboKey1H(tipID int64) string {
	m := map[int64]string{
		415: "Home & Over 0.5", 155: "Home & Over 1.5",
		421: "Away & Over 0.5", 156: "Away & Over 1.5",
		947: "Draw & Over 1.5",
	}
	return m[tipID]
}

// prematchWinnerTotalComboKey2H maps TipID → combo string for 2nd Half totals
func prematchWinnerTotalComboKey2H(tipID int64) string {
	m := map[int64]string{
		936: "Home & Over 0.5", 937: "Home & Over 1.5",
		944: "Away & Over 0.5", 945: "Away & Over 1.5",
	}
	return m[tipID]
}

// prematchBTTSTotalComboKey maps TipID → BTTS+Total combo key matching PS3838 format.
func prematchBTTSTotalComboKey(tipID int64) string {
	m := map[int64]string{
		114:  "Yes & Over 2.5", // GG i 3+
		185:  "Yes & Over 3.5", // GG i 4+
		1325: "Yes & Over 4.5", // GG & 5+
		503:  "No & Under 2.5", // NG & 0-2
		504:  "No & Over 2.5",  // NG & 3+
	}
	return m[tipID]
}

// prematchBTTSWinnerComboKey maps TipID → BTTS+Winner combo key matching PS3838 format.
func prematchBTTSWinnerComboKey(tipID int64) string {
	m := map[int64]string{
		193:  "Yes & Home", // 1 & GG
		194:  "Yes & Away", // 2 & GG
		1362: "Yes & Draw", // X i GG
	}
	return m[tipID]
}

// parsePlayerPropOdds extracts Over/Under line from full odds for a player prop event.
// Player prop events use standard total markets (Market 54 for basketball).
func (s *PrematchService) parsePlayerPropOdds(tipovi []entity.PrematchTipovi, playerName string, market string) *entity.PlayerProp {
	var bestOver, bestUnder float64
	var line float64

	for _, mkt := range tipovi {
		for _, odd := range mkt.T {
			if odd.Kvota <= 1.0 || odd.G == 0 {
				continue
			}
			switch odd.TipID {
			case 105, 451, 453, 930, 1204, 1206, 1227, 1229: // Over variants
				if odd.Kvota > bestOver {
					bestOver = odd.Kvota
					line = odd.G
				}
			case 103, 450, 452, 929, 1203, 1205, 1226, 1228: // Under variants
				if odd.Kvota > bestUnder {
					bestUnder = odd.Kvota
					line = odd.G
				}
			}
		}
	}

	if bestOver == 0 && bestUnder == 0 {
		return nil
	}

	return &entity.PlayerProp{
		PlayerName: playerName,
		Market:     market,
		Line:       line,
		Over:       entity.OddValue{Value: bestOver},
		Under:      entity.OddValue{Value: bestUnder},
	}
}
