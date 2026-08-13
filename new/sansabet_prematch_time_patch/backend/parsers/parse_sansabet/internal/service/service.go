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

type GeneralService struct {
	sAPI             *api.SansabetAPI
	sendChan         chan<- entity.ResponseGame
	data             map[int64]*entity.ResponseGame
	mu               sync.RWMutex // Защита concurrent доступа к data map
	logger           *zerolog.Logger
	verifiedOutcomes *config.VerifiedOutcomesConfig // Фильтр проверенных исходов
	unknownTipIDs    sync.Map                       // Sampled unknown TipID logging: key="sport:tipID"
}

func NewGeneralService(
	sAPI *api.SansabetAPI,
	sendChan chan<- entity.ResponseGame,
	logger *zerolog.Logger,
) *GeneralService {
	data := make(map[int64]*entity.ResponseGame)

	// Load verified outcomes configuration for filtering
	verifiedConfig, err := config.LoadVerifiedOutcomesDefault()
	if err != nil {
		logger.Error().Err(err).Msg("⚠️ Failed to load verified outcomes config")
		logger.Warn().Msg("⚠️ All markets will be parsed (no filtering)")
		verifiedConfig = nil
	} else {
		logger.Info().Msg("✅ Verified outcomes filtering enabled")
	}

	return &GeneralService{
		sAPI:             sAPI,
		sendChan:         sendChan,
		data:             data,
		logger:           logger,
		verifiedOutcomes: verifiedConfig,
	}
}

func scoreToString(value interface{}) string {
	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	case fmt.Stringer:
		return v.String()
	case float64:
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case uint:
		return strconv.FormatUint(uint64(v), 10)
	case uint64:
		return strconv.FormatUint(v, 10)
	case uint32:
		return strconv.FormatUint(uint64(v), 10)
	case bool:
		if v {
			return "1"
		}
		return "0"
	default:
		return ""
	}
}

func (s *GeneralService) Run(ctx context.Context, cfg config.SansabetConfig, sportID entity.Sport, wg *sync.WaitGroup) {
	defer wg.Done()

	// Select intervals based on parse_live flag
	matchInterval := time.Duration(cfg.IntervalMatch) * time.Second
	oddsInterval := time.Duration(cfg.IntervalODDS) * time.Second
	if !cfg.ParseLive {
		// Prematch mode: use slower intervals
		matchInterval = time.Duration(cfg.PrematchIntervalMatch) * time.Second
		oddsInterval = time.Duration(cfg.PrematchIntervalODDS) * time.Second
	}

	matchTicker := time.NewTicker(matchInterval)
	oddsTicker := time.NewTicker(oddsInterval)

	cleanupInterval := 5 * time.Minute
	cleanupTicker := time.NewTicker(cleanupInterval)

	for {
		select {
		case <-cleanupTicker.C:
			s.mu.Lock()
			// Удаляем матчи без обновлений > 30 минут (возможно "зависшие" в API)
			// Live матчи обновляются каждые 2 сек, так что 30 мин = точно завершен
			staleThreshold := 30 * time.Minute
			deletedCount := 0
			for id, match := range s.data {
				if time.Since(match.LastUpdatedAt) > staleThreshold {
					delete(s.data, id)
					deletedCount++
				}
			}
			activeMatchesGauge.WithLabelValues(string(sportID)).Set(float64(len(s.data)))
			s.mu.Unlock()
			if deletedCount > 0 {
				s.logger.Info().Msgf("[Service.Run] Cleanup: removed %d stale matches (no updates >%v) for sport %s", deletedCount, staleThreshold, sportID)
			}

		case <-matchTicker.C:
			events, err := s.sAPI.GetAllMatches(ctx)
			if err != nil {
				s.logger.Error().Err(err).Msgf("[Service.Run] error get all matches.")
				apiErrorsCounter.WithLabelValues("get_matches").Inc()
				continue
			}
			if events == nil {
				s.logger.Warn().Msgf("[Service.Run] GetAllMatches returned nil")
				continue
			}

			s.mu.Lock()
			matchCount := 0
			for _, event := range *events {

				// Фильтр по виду спорта
				if event.H.SportId != string(sportID) {
					continue
				}

				// Filter by parse_live at matches level
				// Live mode: only "IP" matches
				// Prematch mode: only non-"IP" matches
				if cfg.ParseLive && event.H.MS != "IP" {
					continue // Live mode: skip prematch
				}
				if !cfg.ParseLive && event.H.MS == "IP" {
					continue // Prematch mode: skip live
				}

				splitedName := strings.Split(event.H.MatchName, " : ")
				if len(splitedName) != 2 {
					continue
				}
				homeName, awayName := splitedName[0], splitedName[1]

				// Skip player prop events (e.g. "Durant Kevin : Houston Rockets")
				if isPlayerPropLeague(event.H.LeagueName) != "" {
					continue
				}

				// Skip existing matches - don't overwrite data filled by oddsTicker
				if s.data[event.H.ID] != nil {
					continue
				}

				now := time.Now()
				s.data[event.H.ID] = &entity.ResponseGame{
					Pid:           event.H.ID,
					LeagueName:    event.H.LeagueName,
					HomeName:      homeName,
					AwayName:      awayName,
					MatchId:       fmt.Sprintf("%d", event.H.ID),
					CreatedAt:     now,
					LastUpdatedAt: now,
					Raw: entity.EventRaw{
						MatchName: event.H.MatchName,
						FullEvent: event.H,
					},
				}
				matchCount++
			}
			activeMatchesGauge.WithLabelValues(string(sportID)).Set(float64(len(s.data)))
			matchesProcessedCounter.WithLabelValues(string(sportID)).Add(float64(matchCount))
			s.mu.Unlock()
		case <-oddsTicker.C:
			s.logger.Info().Msg("⏰ oddsTicker triggered")

			var eventsOdds *[]entity.EventOdds
			var err error

			if cfg.ParseLive {
				// LIVE mode: use GetAllMatchesODDS with match IDs
				s.mu.RLock()
				matchIds := make([]int64, 0, len(s.data))
				for _, match := range s.data {
					matchIds = append(matchIds, match.Pid)
				}
				s.mu.RUnlock()

				s.logger.Info().Int("matchIds_count", len(matchIds)).Msg("📊 [LIVE] Collected match IDs for odds fetch")

				eventsOdds, err = s.sAPI.GetAllMatchesODDS(ctx, matchIds)
			} else {
				// PREMATCH mode: use GetFullMatchODDS (the ONLY endpoint with prematch odds!)
				s.logger.Info().Msg("📊 [PREMATCH] Using GetFullMatchODDS endpoint")
				eventsOdds, err = s.sAPI.GetFullMatchODDS(ctx)
			}

			if err != nil {
				s.logger.Error().Err(err).Msgf("[Service.Run] error get odds for all matches.")
				apiErrorsCounter.WithLabelValues("get_odds").Inc()
				continue
			}

			s.logger.Info().Int("events_count", len(*eventsOdds)).Msg("🔍 Processing odds batch")

			for _, event := range *eventsOdds {
				s.logger.Debug().Int64("event_id", event.H.ID).Str("ms", event.H.MS).Msg("🔍 Processing event")

				// For PREMATCH mode: filter by sport early (GetFullMatchODDS returns ALL sports)
				if !cfg.ParseLive {
					if event.H.SportId != string(sportID) {
						continue
					}
					// Also filter by MS - only prematch (not live)
					if event.H.MS == "IP" {
						continue
					}
				}

				// Setting sport - map Sansabet sport codes to standard names
				var sport entity.SportName
				switch event.H.SportId {
				case string(entity.FootballID):
					sport = entity.SportSoccer
				case string(entity.TennisID):
					sport = entity.SportTennis
				case string(entity.BasketballID):
					sport = entity.SportBasketball
				case string(entity.VolleyballID):
					sport = entity.SportVolleyball
				case string(entity.HandballID):
					sport = entity.SportHandball
				case string(entity.TableTennisID):
					sport = entity.SportTableTennis
				case string(entity.HockeyID):
					sport = entity.SportHockey
				case string(entity.AmericanFootballID):
					sport = entity.SportAmericanFootball
				case string(entity.BaseballID):
					sport = entity.SportBaseball
				default:
					// Skip unknown sports
					continue
				}

				// Add score with validation
				var scoreStr string
				if score, ok := event.R["G"]; ok {
					scoreStr = scoreToString(score)
				} else if score, ok := event.R["P"]; ok {
					scoreStr = scoreToString(score)
				} else if score, ok := event.R["S"]; ok {
					scoreStr = scoreToString(score)
				}

				var homeScore, awayScore float64
				hasScore := false
				if scoreStr != "" {
					scores := strings.Split(scoreStr, "-")
					if len(scores) == 2 {
						homeScore, _ = strconv.ParseFloat(strings.TrimSpace(scores[0]), 64)
						awayScore, _ = strconv.ParseFloat(strings.TrimSpace(scores[1]), 64)
						hasScore = true
					} else {
						s.logger.Warn().Str("scoreStr", scoreStr).Msgf("[Service.Run] Invalid score format for match %d", event.H.ID)
						invalidScoreCounter.WithLabelValues(string(sportID)).Inc()
					}
				}

				// Parse outcomes - initialize periods based on sport
				var periods []entity.ResponsePeriod
				switch sport {
				case entity.SportSoccer, entity.SportHandball:
					periods = make([]entity.ResponsePeriod, 3) // Match + 2 Halves
				case entity.SportTennis:
					periods = make([]entity.ResponsePeriod, 6) // Match + 5 Sets
				case entity.SportBasketball:
					periods = make([]entity.ResponsePeriod, 8) // Match + 4 Quarters + 1H + 2H + Regulation
				case entity.SportVolleyball:
					periods = make([]entity.ResponsePeriod, 6) // Match + 5 Sets
				case entity.SportTableTennis:
					periods = make([]entity.ResponsePeriod, 8) // Match + 7 Sets
				case entity.SportHockey:
					periods = make([]entity.ResponsePeriod, 5) // Match + 3 Periods + Regulation
				case entity.SportAmericanFootball:
					periods = make([]entity.ResponsePeriod, 7) // Match + 4 Quarters + 2 Halves
				case entity.SportBaseball:
					periods = make([]entity.ResponsePeriod, 10) // Match + 9 Innings (F5 = period 5)
				default:
					periods = make([]entity.ResponsePeriod, 3)
				}

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

				// DEBUG: Log outcomes count
				if len(event.M) == 0 {
					s.logger.Debug().Int64("event_id", event.H.ID).Str("sport", event.H.SportId).Msg("⚠️ No outcomes (event.M empty)")
				} else {
					s.logger.Debug().Int64("event_id", event.H.ID).Int("outcomes_count", len(event.M)).Msg("📊 Processing outcomes")
				}

				for _, outcome := range event.M {
					// Skip suspended/closed markets - only process OPEN markets
					// When a market is closed on Sansabet website, MS changes from "OPEN" to other values
					if outcome.MS != "" && outcome.MS != "OPEN" {
						s.logger.Debug().
							Int64("event_id", event.H.ID).
							Str("outcome_ms", outcome.MS).
							Str("line", outcome.B).
							Msg("⏭️ Skipping non-OPEN market")
						continue
					}

					for _, odd := range outcome.S {
						// FILTER: Skip unverified markets (check TipID)
						if s.verifiedOutcomes != nil {
							marketType := getMarketTypeByTipID(odd.N, sport)
							if marketType == "" {
								// Log unknown TipIDs once per sport:tipID combo for diagnostics
								tipKey := fmt.Sprintf("%s:%d", sport, odd.N)
								if _, loaded := s.unknownTipIDs.LoadOrStore(tipKey, true); !loaded {
									s.logger.Warn().
										Int64("tipID", odd.N).
										Str("sport", string(sport)).
										Str("match", event.H.MatchName).
										Msg("⚠️ Unknown TipID (first occurrence, will not repeat)")
								}
								continue
							}
							sportID := event.H.SportId
							if !s.verifiedOutcomes.IsMarketVerified(sportID, marketType) {
								continue // Skip this odd - market type not verified
							}
						}
						// Process 1x2
						if mapping, ok := getWin1x2Mapping(odd.N, sport); ok {
							setWin1x2Value(&periods[mapping.periodIndex].Win1x2, mapping.oddType, odd.O, odd.N, mapping.periodIndex)
							continue
						}

						// Basketball 2-way quarter/half winners → HC 0.0
						// These are equivalent to handicap 0 (push on draw).
						// Kept separate from 3-way Win1x2 to avoid overwriting WinNone.
						if sport == entity.SportBasketball {
							var hcPeriod int = -1
							var isWin1 bool
							switch odd.N {
							case 919:
								hcPeriod = PeriodQuarter1; isWin1 = true
							case 920:
								hcPeriod = PeriodQuarter1
							case 921:
								hcPeriod = PeriodQuarter2; isWin1 = true
							case 922:
								hcPeriod = PeriodQuarter2
							case 923:
								hcPeriod = PeriodQuarter3; isWin1 = true
							case 924:
								hcPeriod = PeriodQuarter3
							case 925:
								hcPeriod = PeriodQuarter4; isWin1 = true
							case 926:
								hcPeriod = PeriodQuarter4
							case 521:
								hcPeriod = PeriodHalf1; isWin1 = true
							case 522:
								hcPeriod = PeriodHalf1
							case 686:
								hcPeriod = PeriodHalf2; isWin1 = true
							case 687:
								hcPeriod = PeriodHalf2
							}
							if hcPeriod >= 0 {
								ensureMapEntry(periods[hcPeriod].Handicap, "0.0")
								if isWin1 {
									periods[hcPeriod].Handicap["0.0"].Win1 = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "0.0", "handicap", "Win1", hcPeriod)}
								} else {
									periods[hcPeriod].Handicap["0.0"].Win2 = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "0.0", "handicap", "Win2", hcPeriod)}
								}
								continue
							}
						}

						// Process games
						if mapping, ok := getGamesMapping(odd.N, sport); ok {
							ensureMapEntry(periods[mapping.periodIndex].Games, outcome.B)
							setWin1x2Value(periods[mapping.periodIndex].Games[outcome.B], mapping.oddType, odd.O, odd.N, mapping.periodIndex)
							continue
						}

						// Process totals
						if mapping, ok := getTotalsMapping(odd.N, sport); ok {
							ensureMapEntry(periods[mapping.periodIndex].Totals, outcome.B)
							setTotalValue(periods[mapping.periodIndex].Totals[outcome.B], mapping.oddType, odd.O, odd.N, mapping.periodIndex)
							continue
						}

						// Process team totals
						if mapping, ok := getTeamTotalsMapping(odd.N, sport); ok {
							var totalsMap map[string]*entity.WinLessMore
							if mapping.team == "first" {
								totalsMap = periods[mapping.periodIndex].FirstTeamTotals
							} else {
								totalsMap = periods[mapping.periodIndex].SecondTeamTotals
							}
							// Sansabet IT lines are ABSOLUTE for ALL sports
							// (proven by raw API: at score 3-0, FTT line=3.5 with
							// Over=1.53 — needs just 1 more goal, not 4+).
							// No score adjustment needed.
							lineKey := outcome.B
							ensureMapEntry(totalsMap, lineKey)
							setTotalValue(totalsMap[lineKey], mapping.oddType, odd.O, odd.N, mapping.periodIndex)
							continue
						}

						// Process BTTS (Yes/No)
						if mapping, ok := getBTTSMapping(odd.N, sport); ok {
							if periods[mapping.periodIndex].BTTS == nil {
								periods[mapping.periodIndex].BTTS = &entity.YesNo{}
							}
							if mapping.isYes {
								periods[mapping.periodIndex].BTTS.Yes = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "", "btts", "Yes", mapping.periodIndex)}
							} else {
								periods[mapping.periodIndex].BTTS.No = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "", "btts", "No", mapping.periodIndex)}
							}
							continue
						}

						// Process Odd/Even (Total)
						if mapping, ok := getOddEvenMapping(odd.N, sport); ok {
							if periods[mapping.periodIndex].OddEven == nil {
								periods[mapping.periodIndex].OddEven = &entity.YesNo{}
							}
							if mapping.isYes {
								periods[mapping.periodIndex].OddEven.Yes = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "", "odd_even", "Yes", mapping.periodIndex)}
							} else {
								periods[mapping.periodIndex].OddEven.No = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "", "odd_even", "No", mapping.periodIndex)}
							}
							continue
						}

						// V2: Process Double Chance first (stores as-is, no conversion to Handicap)
						if processDoubleChance(odd.N, odd.O, &periods, sport) {
							continue // Handled as Double Chance, skip handicap processing
						}

						// Process Draw No Bet
						if processDrawNoBet(odd.N, odd.O, &periods, sport) {
							continue // Handled as Draw No Bet, skip handicap processing
						}

						// Process Sets Handicap (volleyball/tennis)
						if processSetsHandicap(odd.N, outcome.B, odd.O, &periods, sport) {
							continue
						}

						// Process handicaps
						processHandicap(odd.N, outcome.B, odd.O, &periods, homeScore, awayScore, sport)

						// Process 3-Way Handicap (Football, Hockey) and Sansabet Ostatak (734/735/736, 737/738/739)
						// Ostatak (rest-of-match) raw line is the encoded current score (e.g. 1.2 = score 1-2),
						// NOT a handicap. The full-match equivalent 3WH line = awayScore - homeScore.
						if mapping, ok := getThreeWayHandicapMapping(odd.N, sport); ok {
							euroLine, _ := strconv.ParseFloat(outcome.B, 64)
							lineValue := euroLine
							if isRestOfMatchThreeWayTipID(odd.N, sport) {
								lineValue = awayScore - homeScore
							}
							lineStr := formatLine(lineValue)
							ensureMapEntry(periods[mapping.periodIndex].ThreeWayHandicap, lineStr)
							switch mapping.hcpType {
							case "home":
								periods[mapping.periodIndex].ThreeWayHandicap[lineStr].Home = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, outcome.B, "3wh", "Home", mapping.periodIndex)}
							case "draw":
								periods[mapping.periodIndex].ThreeWayHandicap[lineStr].Draw = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, outcome.B, "3wh", "Draw", mapping.periodIndex)}
							case "away":
								periods[mapping.periodIndex].ThreeWayHandicap[lineStr].Away = entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, outcome.B, "3wh", "Away", mapping.periodIndex)}
							}
							continue
						}

						// Process Winner + Total Combo (Soccer, Handball)
						if key, ok := getWinnerTotalComboKey(odd.N, sport); ok {
							if periods[PeriodMatch].WinnerTotalCombo == nil {
								periods[PeriodMatch].WinnerTotalCombo = make(map[string]*entity.OddValue)
							}
							periods[PeriodMatch].WinnerTotalCombo[key] = &entity.OddValue{Value: odd.O, Raw: betCtx(odd.N, "", "wtc", key, PeriodMatch)}
							continue
						}
					}
				}

				// Модифицируем s.data под write lock
				s.mu.Lock()

				// Проверяем существование матча
				gameData, exists := s.data[event.H.ID]

				if !exists {
					// For PREMATCH mode with GetFullMatchODDS: create gameData on the fly
					if !cfg.ParseLive {
						// Skip player prop events
						if isPlayerPropLeague(event.H.LeagueName) != "" {
							s.mu.Unlock()
							continue
						}
						// Parse team names from MatchName "Team1 : Team2"
						splitedName := strings.Split(event.H.MatchName, " : ")
						if len(splitedName) != 2 {
							s.mu.Unlock()
							continue
						}
						homeName, awayName := splitedName[0], splitedName[1]

						now := time.Now()
						gameData = &entity.ResponseGame{
							Pid:           event.H.ID,
							LeagueName:    event.H.LeagueName,
							HomeName:      homeName,
							AwayName:      awayName,
							MatchId:       fmt.Sprintf("%d", event.H.ID),
							CreatedAt:     now,
							LastUpdatedAt: now,
							Raw: entity.EventRaw{
								MatchName: event.H.MatchName,
							},
						}
						s.data[event.H.ID] = gameData
					} else {
						// LIVE mode: skip if not in s.data
						s.mu.Unlock()
						continue
					}
				}

				// Проверяем статус матча:
				// В LIVE режиме: удаляем завершенные матчи (MS != "IP")
				// В PREMATCH режиме: НЕ удаляем (там всегда MS != "IP")
				if cfg.ParseLive && event.H.MS != "IP" {
					delete(s.data, event.H.ID)
					s.mu.Unlock()
					continue
				}

				// Обновляем все поля
				now := time.Now()
				gameData.HomeScore = homeScore
				gameData.AwayScore = awayScore
				gameData.HasScore = hasScore
				gameData.Periods = periods
				gameData.SportName = sport

				// CRITICAL FIX: Clear stale period data based on current period (TM field)
				// TM field indicates current period: Soccer(1-2), Basketball(1-5), Hockey(1-3), etc.
				// When TM > period_index, that period's markets are STALE
				clearPeriod := func(idx int) {
					if idx < len(periods) {
						periods[idx] = entity.ResponsePeriod{
							Win1x2:           entity.Win1x2Struct{},
							Games:            make(map[string]*entity.Win1x2Struct),
							Totals:           make(map[string]*entity.WinLessMore),
							Handicap:         make(map[string]*entity.WinHandicap),
							ThreeWayHandicap: make(map[string]*entity.ThreeWayHcap),
							FirstTeamTotals:  make(map[string]*entity.WinLessMore),
							SecondTeamTotals: make(map[string]*entity.WinLessMore),
						}
					}
				}

				tm := event.H.TM
				switch sport {
				case entity.SportSoccer, entity.SportHandball:
					// TM=1: 1st half, TM=2: 2nd half
					// Clear P1 when in 2nd half
					if tm >= 2 {
						clearPeriod(1) // P1 = 1st half
					s.logger.Debug().Int("TM", tm).Str("match", gameData.HomeName+" vs "+gameData.AwayName).Msg("CLEARED P1: match in 2nd half")
					} else {
					s.logger.Debug().Int("TM", tm).Str("match", gameData.HomeName+" vs "+gameData.AwayName).Msg("TM_DEBUG: soccer match period")
					}
				case entity.SportBasketball:
					// TM=1: 1st half (Q1/Q2), TM=2: 2nd half (Q3/Q4)
					// TM represents halves, not quarters.
					// When in 2nd half: Q1, Q2, and 1st Half are finished.
					if tm >= 2 {
						clearPeriod(PeriodQuarter1)
						clearPeriod(PeriodQuarter2)
						clearPeriod(PeriodHalf1) // 1st Half
					}
				case entity.SportHockey:
					// Hockey TM is 0-based: TM=0→P1, TM=1→P2, TM=2→P3
					// Clear finished periods (period index = TM value for finished periods)
					for i := 1; i <= tm && i <= 3; i++ {
						clearPeriod(i) // P1-P3
					}
				case entity.SportVolleyball:
					// TM=1-5: sets
					// Clear finished sets
					for i := 1; i < tm && i <= 5; i++ {
						clearPeriod(i) // S1-S5
					}
				case entity.SportTennis:
					// TM=1-5: sets
					// Clear finished sets
					for i := 1; i < tm && i <= 5; i++ {
						clearPeriod(i) // S1-S5
					}
				}
				gameData.Periods = periods
				gameData.LastUpdatedAt = now // Обновляем время последнего обновления (для cleanup)
				gameData.CreatedAt = now     // Обновляем CreatedAt чтобы Analyzer видел свежие данные
				gameData.Source = string(domain.Sansabet)
				gameData.IsLive = (event.H.MS == "IP") // Проверяем реальный статус
				gameData.TraceID = pkgutils.GenerateUUID()

				// Filter by parse_live setting
				if cfg.ParseLive && !gameData.IsLive {
					// Live mode: skip prematch matches
					s.logger.Debug().Str("match", gameData.HomeName+" vs "+gameData.AwayName).Bool("isLive", gameData.IsLive).Msg("FILTERED: live mode skip prematch")
					s.mu.Unlock()
					continue
				}
				if !cfg.ParseLive && gameData.IsLive {
					// Prematch mode: skip live matches
					s.logger.Debug().Str("match", gameData.HomeName+" vs "+gameData.AwayName).Bool("isLive", gameData.IsLive).Msg("FILTERED: prematch mode skip live")
					s.mu.Unlock()
					continue
				}

				// Check if periods have any actual data (markets)
				// If all markets are closed/suspended, periods will be empty - skip sending
				hasAnyMarkets := false
				periodsInfo := ""
				for i, p := range periods {
					t := len(p.Totals)
					h := len(p.Handicap)
					th := len(p.ThreeWayHandicap)
					w := 0
					if p.Win1x2.Win1.Value > 0 || p.Win1x2.Win2.Value > 0 || p.Win1x2.WinNone.Value > 0 {
						w = 1
					}
					b := 0
					if p.BTTS != nil && (p.BTTS.Yes.Value > 0 || p.BTTS.No.Value > 0) {
						b = 1
					}
					oe := 0
					if p.OddEven != nil && (p.OddEven.Yes.Value > 0 || p.OddEven.No.Value > 0) {
						oe = 1
					}
					dc := 0
					if p.DoubleChance != nil && (p.DoubleChance.W1X.Value > 0 || p.DoubleChance.WX2.Value > 0 || p.DoubleChance.W12.Value > 0) {
						dc = 1
					}
					dnb := 0
					if p.DrawNoBet != nil && (p.DrawNoBet.Home.Value > 0 || p.DrawNoBet.Away.Value > 0) {
						dnb = 1
					}
					if t > 0 || h > 0 || th > 0 || w > 0 || b > 0 || oe > 0 || dc > 0 || dnb > 0 {
						hasAnyMarkets = true
						if periodsInfo != "" {
							periodsInfo += ","
						}
						periodsInfo += fmt.Sprintf("P%d:T=%d,H=%d,3WH=%d,W=%d,B=%d,OE=%d,DC=%d,DNB=%d", i, t, h, th, w, b, oe, dc, dnb)
					}
				}

				// Skip matches with no active markets (all markets closed/suspended)
				if !hasAnyMarkets {
					s.logger.Info().
						Str("match", gameData.HomeName+" vs "+gameData.AwayName).
						Int64("event_id", event.H.ID).
						Msg("⏭️ Skipping match with no active markets (all closed/suspended)")
					s.mu.Unlock()
					continue
				}

				// Копируем данные для отправки
				gameCopy := *gameData
				s.mu.Unlock()

				// Validate and clean data before sending
				if !ValidateAndCleanGame(&gameCopy) {
					s.logger.Debug().Str("match", gameCopy.HomeName+" vs "+gameCopy.AwayName).Msg("⏭️ Skipped by validation")
					continue
				}

				outcomeCount := CountOutcomes(&gameCopy)
				s.logger.Info().Str("match", gameCopy.HomeName+" vs "+gameCopy.AwayName).Bool("isLive", gameCopy.IsLive).Int("outcomes", outcomeCount).Msg("✅ SENDING to analyzer")

				// DIAG: detect sparse live matches (possible end-of-match ghost)
				// If live match has very few outcomes and no 1x2 — likely dying match
				if gameCopy.IsLive && outcomeCount > 0 && outcomeCount <= 4 {
					has1x2 := false
					var totLines []string
					if len(gameCopy.Periods) > 0 {
						p0 := gameCopy.Periods[0]
						has1x2 = p0.Win1x2.Win1.Value > 0 || p0.Win1x2.Win2.Value > 0
						for k := range p0.Totals {
							totLines = append(totLines, k)
						}
					}
					if !has1x2 {
						s.logger.Warn().
							Str("match", gameCopy.HomeName+" vs "+gameCopy.AwayName).
							Str("sport", string(gameCopy.SportName)).
							Int64("pid", gameCopy.Pid).
							Float64("homeScore", gameCopy.HomeScore).
							Float64("awayScore", gameCopy.AwayScore).
							Int("outcomes", outcomeCount).
							Strs("totalLines", totLines).
							Str("periodsInfo", periodsInfo).
							Str("MS", event.H.MS).
							Int("TM", event.H.TM).
							Msg("[SPARSE_MATCH] Live match with very few markets and no 1x2 (possible end-of-match)")
					}
				}

				// Отправляем в канал без удержания lock (non-blocking для graceful shutdown)
				select {
				case s.sendChan <- gameCopy:
					oddsProcessedCounter.WithLabelValues(string(sportID)).Inc()
				case <-ctx.Done():
					return
				}
			}
		case <-ctx.Done():
			matchTicker.Stop()
			oddsTicker.Stop()
			cleanupTicker.Stop()
			return
		}
	}
}
