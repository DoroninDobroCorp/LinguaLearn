package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	pkgutils "livebets/pkg/utils"
	"livebets/results/internal/calculator"
	"livebets/results/internal/config"
	"livebets/results/internal/entity"
	"livebets/results/internal/repository"

	"go.uber.org/zap"
)

// ============================================================
// BetService - Results calculation service
// ============================================================
// Responsibilities:
// 1. Fetch match results via FlashScore Results Service
// 2. Calculate bet outcomes (win/lose/void/pending)
// 3. Calculate profits (EV profit vs Real profit)
// 4. Update database with results
//
// Two calculation modes:
// - Test bets (log_bet_accept_test): development/testing
// - Group capture bets (log_group_capture): production analytics
type BetService struct {
	Repo            *repository.PostgresClient // Database operations
	ResultsProvider *ResultsProvider           // Fetch match results via FlashScore
	TelegramService *TelegramService           // Send notifications to Telegram
	LogToTelegram   bool                       // Enable/disable Telegram logging
	Logger          *zap.Logger
	Config          *config.Config
	isProcessing    atomic.Bool // Prevent concurrent ProcessLogBetAccept runs
}

func NewBetService(repo *repository.PostgresClient, resultsProvider *ResultsProvider, logger *zap.Logger, cfg *config.Config) *BetService {
	return &BetService{
		Repo:            repo,
		ResultsProvider: resultsProvider,
		LogToTelegram:   true,
		Logger:          logger,
		Config:          cfg,
	}
}

// originalBetCreatedAt returns the immutable acceptance time embedded in the
// calculator payload. Older result-processing code changed the database
// created_at date when rescheduling unresolved prematch bets, which made those
// rows look new forever. Keep the database timestamp as a legacy fallback only.
func originalBetCreatedAt(bet *entity.LogBetAccept) time.Time {
	if pair, ok := bet.Data["pair"].(map[string]interface{}); ok {
		if raw, ok := pair["createdAt"].(string); ok && raw != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
				return parsed
			}
		}
	}
	return bet.CreatedAt
}

type BookmakerSummary struct {
	TotalBets   int
	TotalSum    float64
	TotalProfit float64
}

func (s *BetService) printBetSummary(bet *entity.LogBetAccept, outcomeStr string, betSum, coef float64) {
	pair, ok := bet.Data["pair"].(map[string]interface{})
	if !ok {
		return
	}
	first, ok := pair["first"].(map[string]interface{})
	if !ok {
		return
	}
	// Get team names from first (homeName and awayName)
	homeName, _ := first["homeName"].(string)
	awayName, _ := first["awayName"].(string)
	s.Logger.Info("Bet summary",
		zap.String("home", homeName),
		zap.String("away", awayName),
		zap.Float64("sum", betSum),
		zap.String("outcome", outcomeStr),
		zap.Float64("coef", coef),
	)
}

// processGenericBet calculates result for a bet from group capture tables.
//
// Workflow:
// 1. Extract match info from mkey (format: "bookmaker|home|away")
// 2. Get match result from FlashScore
// 3. Calculate outcome (win/lose/void) using calculator package
// 4. Calculate profits: EV profit (expected) vs Real profit (actual)
// 5. Update database with results
//
// Note: Used for log_group_capture table processing.
func (s *BetService) processGenericBet(bet *entity.GenericBet) error {
	traceID := pkgutils.GenerateUUID()
	s.Logger.Info("Processing generic bet",
		zap.String("trace_id", traceID),
		zap.Int64("bet_id", bet.ID),
		zap.String("table", bet.TableName),
		zap.Float64("coef", bet.Coefficient),
	)

	mkeyParts := strings.Split(bet.Mkey, "|")
	if len(mkeyParts) < 3 {
		return fmt.Errorf("invalid mkey format for bet ID %d: %s", bet.ID, bet.Mkey)
	}
	homeName := mkeyParts[1]
	awayName := mkeyParts[2]
	sportName := strings.ToUpper(bet.SportName[:1]) + bet.SportName[1:]

	if bet.PinnacleMatchID == "" {
		return errors.New("matchId is empty")
	}
	if bet.Coefficient <= 0 {
		return fmt.Errorf("invalid coefficient %.2f for bet ID %d", bet.Coefficient, bet.ID)
	}

	// STEP 1: Get match result from FlashScore
	// If match not finished yet, bet stays "pending"
	// Results Service lookup by team names
	fixture, err := s.ResultsProvider.CallFixtureByTeams(homeName, awayName, sportName, bet.CreatedAt)
	if err != nil {
		s.Logger.Info("Failed to get fixture (status pending)",
			zap.Int64("bet_id", bet.ID),
			zap.Error(err),
		)
		return nil // Not an error - match just not finished yet
	}

	// STEP 2: Calculate bet outcome using calculator package
	// Compares bet prediction vs actual match result
	betSum := s.Config.BetSum // Use config value
	result := calculator.GetOutcomeResult(
		&entity.LogBetAccept{
			KeyOutcome: bet.Okey,
			Data: map[string]interface{}{
				"pair": map[string]interface{}{
					"first": map[string]interface{}{
						"matchId":  bet.PinnacleMatchID,
						"homeName": homeName,
						"awayName": awayName,
					},
				},
			},
		},
		fixture,
		bet.Okey,
		betSum,
		bet.Coefficient,
		sportName,
	)

	if result.Status == "pending" || result.Status == "unknown" || result.Status == "error" {
		s.Logger.Info("Bet skipped",
			zap.Int64("bet_id", bet.ID),
			zap.String("match", fmt.Sprintf("%s vs %s", homeName, awayName)),
			zap.String("status", result.Status),
			zap.String("okey", bet.Okey),
		)
		return nil
	}

	// STEP 3: Calculate profits
	// EV Profit = Expected profit based on ROI from analyzer
	// Real Profit = Actual profit based on bet outcome
	evProfit := betSum * bet.ROI / 100 // What we EXPECTED to make (based on value bet edge)
	var realProfit float64             // What we ACTUALLY made

	switch result.Status {
	case "win":
		realProfit = betSum * (bet.Coefficient - 1) // Win: profit = (coef-1) * bet amount
	case "lose":
		realProfit = -betSum // Lose: lost entire bet amount
	case "void":
		realProfit = 0 // Void: bet cancelled, money returned
	}

	s.Logger.Info("Updating bet",
		zap.Int64("bet_id", bet.ID),
		zap.String("status", result.Status),
		zap.Float64("ev_profit", evProfit),
		zap.Float64("real_profit", realProfit),
	)
	return s.Repo.UpdateGenericBetResult(bet.TableName, bet.ID, strings.ToUpper(result.Status), evProfit, realProfit)
}

// ProcessGroupCaptureBets - запускает обработку для таблицы log_group_capture.
func (s *BetService) ProcessGroupCaptureBets() error {
	s.Logger.Info("Starting processing for Group Capture bets...")

	// Cleanup old unprocessed group bets (older than 3 days)
	deleted, err := s.Repo.CleanupUnprocessedGroupBets(3)
	if err != nil {
		s.Logger.Error("Error cleaning up old group bets", zap.Error(err))
	} else if deleted > 0 {
		cleanupMsg := fmt.Sprintf("🧹 Cleaned up %d old group bets without results (>3 days)", deleted)
		s.Logger.Info(cleanupMsg)
		if s.LogToTelegram && s.TelegramService != nil {
			s.TelegramService.SendMessage(cleanupMsg)
		}
	}

	bets, err := s.Repo.GetPendingGroupCaptureBets()
	if err != nil {
		return fmt.Errorf("error getting group capture bets: %w", err)
	}

	s.Logger.Info("Found pending bets in log_group_capture", zap.Int("count", len(bets)))
	if s.LogToTelegram {
		s.TelegramService.SendMessage(fmt.Sprintf("Найдено %d ставок (group capture) для обработки.", len(bets)))
	}

	totalBets := len(bets)
	processedBets := 0
	for _, bet := range bets {
		if err := s.processGenericBet(bet); err != nil {
			s.Logger.Error("Error processing group capture bet", zap.Int64("bet_id", bet.ID), zap.Error(err))
			continue
		}
		processedBets += 1
	}

	logMsg := fmt.Sprintf("Finished processing for Group Capture bets. %d/%d", processedBets, totalBets)
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}
	return nil
}

// ProcessBet calculates result for a test bet from log_bet_accept_test table.
//
// Workflow:
// 1. Extract bet details (outcome, sum, coefficient) from JSON data
// 2. Get match result from FlashScore (with caching)
// 3. Calculate outcome (win/lose/void/return) using calculator package
// 4. Calculate profits: EV profit (expected) vs Real profit (actual)
// 5. Update database with results
//
// Special handling:
// - Prematch bets: keep pending without mutating their immutable created_at
// - Live bets: if not found, keep as pending (match might still be in progress)
//
// Returns: (OutcomeResult, error)
//
//	OutcomeResult.Status can be: win, lose, void, return, pending, error
func (s *BetService) ProcessBet(bet *entity.LogBetAccept) (calculator.OutcomeResult, error) {
	// Extract TraceID from Data or generate new one
	var traceID string
	if tid, ok := bet.Data["trace_id"].(string); ok && tid != "" {
		traceID = tid
	} else {
		traceID = pkgutils.GenerateUUID()
	}

	logMsg := fmt.Sprintf("[%s] Starting to process bet with key_match: %s", traceID, bet.KeyMatch)
	s.Logger.Info(logMsg)

	// STEP 1: Extract outcome from JSON bet data
	// Expected structure: bet.Data -> "pair" -> "outcome" -> "outcome"
	var outcomeStr string
	var sport string
	if pair, ok := bet.Data["pair"].(map[string]interface{}); ok {
		sport = pair["sportName"].(string)
		if outcomeObj, ok := pair["outcome"].(map[string]interface{}); ok {
			if oStr, ok := outcomeObj["outcome"].(string); ok && oStr != "" {
				outcomeStr = oStr
			} else {
				errMsg := "outcome field inside pair.outcome not found or empty"
				s.Logger.Error(errMsg)
				return calculator.OutcomeResult{Status: "error"}, errors.New(errMsg)
			}
		} else {
			errMsg := "outcome field in pair not found"
			s.Logger.Error(errMsg)
			return calculator.OutcomeResult{Status: "error"}, errors.New(errMsg)
		}
	} else {
		errMsg := "pair field not found"
		s.Logger.Error(errMsg)
		return calculator.OutcomeResult{Status: "error"}, errors.New(errMsg)
	}

	// Extract sum and coefficient
	sumVal, ok := bet.Data["sum"].(float64)
	if !ok {
		errMsg := "bet sum not found or has invalid type"
		return calculator.OutcomeResult{Status: "error"}, errors.New(errMsg)
	}
	coefVal, ok := bet.Data["coef"].(float64)
	if !ok {
		errMsg := "coefficient not found or has invalid type"
		s.Logger.Error(errMsg)
		return calculator.OutcomeResult{Status: "error"}, errors.New(errMsg)
	}
	s.printBetSummary(bet, outcomeStr, sumVal, coefVal)

	// STEP 2: Get match result from FlashScore Results Service
	// ResultsProvider has internal cache to avoid repeated lookups
	fixture, err := s.ResultsProvider.CallFixtureSettled(bet)
	if err != nil {
		s.Logger.Info("Failed to get fixture (status pending)", zap.Error(err))

		// Log bet data for debugging
		betData, _ := json.Marshal(bet.Data)
		s.Logger.Debug("Bet data", zap.String("data", string(betData)))

		// Extract match info for better logging
		var matchInfo string
		if pair, ok := bet.Data["pair"].(map[string]interface{}); ok {
			if first, ok := pair["first"].(map[string]interface{}); ok {
				home, _ := first["homeName"].(string)
				away, _ := first["awayName"].(string)
				matchInfo = fmt.Sprintf("%s vs %s", home, away)
			}
		}

		// БАГ FIX: Используем is_live из БД колонки вместо JSON
		isLive := bet.IsLive
		betAge := time.Now().UTC().Sub(originalBetCreatedAt(bet))

		// Prematch results may appear with a delay, but created_at is an audit
		// timestamp and must never be rewritten to reschedule work. The smart
		// result_attempts scheduler owns retries; unresolved legacy rows remain
		// pending for manual review after 72 hours.
		if !isLive && bet.RealProfit == nil && betAge < 72*time.Hour {
			s.Logger.Info("Prematch bet remains pending",
				zap.Int64("id", bet.ID),
				zap.String("key_outcome", bet.KeyOutcome),
				zap.String("match", matchInfo),
				zap.Duration("age", betAge),
			)
		} else if !isLive && betAge >= 72*time.Hour {
			// Prematch старше 72 часов - больше не обрабатываем
			// Будет подхвачено daily_checkup_bets для ручного заполнения
			s.Logger.Warn("Prematch bet timeout - needs manual fill",
				zap.String("key_outcome", bet.KeyOutcome),
				zap.String("match", matchInfo),
				zap.Duration("age", betAge),
			)
		} else if isLive && betAge >= 4*time.Hour {
			// Live старше 4 часов - больше не обрабатываем
			// Будет подхвачено daily_checkup_bets для ручного заполнения
			s.Logger.Warn("Live bet timeout - needs manual fill",
				zap.String("key_outcome", bet.KeyOutcome),
				zap.String("match", matchInfo),
				zap.Duration("age", betAge),
			)
		}

		return calculator.OutcomeResult{Status: "pending"}, nil
	}

	// Логируем информацию о найденном матче
	s.Logger.Info("Found fixture for bet",
		zap.String("key_match", bet.KeyMatch),
		zap.Int("fixture_id", fixture.ID),
		zap.Int("periods", len(fixture.Periods)),
	)

	for _, period := range fixture.Periods {
		s.Logger.Debug("Period score",
			zap.Int("number", period.Number),
			zap.Int("team1", period.Team1Score),
			zap.Int("team2", period.Team2Score),
		)
	}

	debugMsg := fmt.Sprintf("DEBUG: Got fixture for bet %s", bet.KeyMatch)
	s.Logger.Debug(debugMsg)

	// Calculate bet outcome
	result := calculator.GetOutcomeResult(bet, fixture, outcomeStr, sumVal, coefVal, sport)
	return result, nil
}

func (s *BetService) ProcessRecentBets() error {
	logMsg := "Processing bets for the last day"
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}

	// Get bets for the specified period
	bets, err := s.Repo.GetYesterdayBets()
	if err != nil {
		errMsg := fmt.Sprintf("Error getting recent bets: %v", err)
		s.Logger.Error(errMsg)
		if s.LogToTelegram && s.TelegramService != nil {
			s.TelegramService.SendMessage(errMsg)
		}
		return err
	}

	logMsg = fmt.Sprintf("Found %d bets for the last day", len(bets))
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}

	// Process each bet
	totalBets := len(bets)
	processedBets := 0
	skippedTimeouts := 0

	for _, bet := range bets {
		// БАГ FIX: Пропускаем устаревшие ставки
		betAge := time.Now().UTC().Sub(originalBetCreatedAt(bet))

		if bet.IsLive && betAge >= 4*time.Hour {
			s.Logger.Warn("Skipping live bet - timeout (>4h)",
				zap.String("key_outcome", bet.KeyOutcome),
				zap.Duration("age", betAge),
			)
			skippedTimeouts++
			continue
		}

		if !bet.IsLive && betAge >= 72*time.Hour {
			s.Logger.Warn("Skipping prematch bet - timeout (>72h)",
				zap.String("key_outcome", bet.KeyOutcome),
				zap.Duration("age", betAge),
			)
			skippedTimeouts++
			continue
		}

		result, err := s.ProcessBet(bet)
		if err != nil {
			s.Logger.Error("Error processing bet", zap.String("outcome", bet.KeyOutcome), zap.Error(err))
		} else {

			s.Logger.Info("Processed bet",
				zap.String("outcome", bet.KeyOutcome),
				zap.String("result", result.Status),
				zap.Float64("coef", bet.Data["coef"].(float64)),
			)
			if s.LogToTelegram && s.TelegramService != nil {
				// Build notification with team names
				var tgHome, tgAway, tgSport string
				if pair, ok := bet.Data["pair"].(map[string]interface{}); ok {
					tgSport, _ = pair["sportName"].(string)
					if first, ok := pair["first"].(map[string]interface{}); ok {
						tgHome, _ = first["homeName"].(string)
						tgAway, _ = first["awayName"].(string)
					}
				}
				sportEmoji := "🏀"
				switch strings.ToLower(tgSport) {
				case "soccer":
					sportEmoji = "⚽"
				case "tennis":
					sportEmoji = "🎾"
				case "hockey":
					sportEmoji = "🏒"
				case "volleyball":
					sportEmoji = "🏐"
				}
				resultEmoji := "❓"
				switch result.Status {
				case "win":
					resultEmoji = "✅"
				case "lose":
					resultEmoji = "❌"
				case "void", "push":
					resultEmoji = "↩️"
				case "half_win":
					resultEmoji = "🟢"
				case "half_lose":
					resultEmoji = "🟡"
				case "pending":
					resultEmoji = "⏳"
				}
				tgMsg := fmt.Sprintf("%s %s %s vs %s\n%s Outcome: `%s` @ %.2f\nResult: %s %s",
					sportEmoji, tgSport, tgHome, tgAway,
					resultEmoji, bet.CorrectData["outcome"], bet.Data["coef"],
					result.Status, resultEmoji)
				s.TelegramService.SendMessage(tgMsg)
			}

			// Извлекаем сумму ставки, коэффициент и ROI
			sumVal := bet.Data["sum"].(float64)
			coefVal := bet.Data["coef"].(float64)
			var roi float64
			if pair, ok := bet.Data["pair"].(map[string]interface{}); ok {
				if outcomeObj, ok := pair["outcome"].(map[string]interface{}); ok {
					if roiVal, ok := outcomeObj["roi"].(float64); ok {
						roi = roiVal
					}
				}
			}

			// Расчет EV прибыли
			evProfit := sumVal * roi / 100
			s.Logger.Info("Profit calc", zap.Float64("ev_profit", evProfit), zap.Float64("roi", roi))

			// Расчет прибыли
			var realProfit float64
			if result.Status == "win" {
				realProfit = sumVal * (coefVal - 1)
			} else if result.Status == "lose" {
				realProfit = -sumVal
			} else if result.Status == "return" || result.Status == "void" {
				realProfit = 0
			} else {
				s.Logger.Warn("Warning: bet status", zap.String("status", result.Status))
				continue
			}

			err = s.Repo.UpdateBetProfits(bet.ID, evProfit, realProfit)
			if err != nil {
				errorMsg := fmt.Sprintf("Failed to update profits in DB: %v", err)
				s.Logger.Error(errorMsg)
				if s.LogToTelegram && s.TelegramService != nil {
					s.TelegramService.SendMessage(errorMsg)
				}
			} else {
				debugMsg := fmt.Sprintf("Successfully updated profits for bet ID=%d key=%s. EV: %.2f, Real: %.2f", bet.ID, bet.KeyOutcome, evProfit, realProfit)
				s.Logger.Debug(debugMsg)
				if s.LogToTelegram && s.TelegramService != nil {
					s.TelegramService.SendMessage(debugMsg)
				}
			}
		}
		processedBets++
	}

	logMsg = fmt.Sprintf("Processed %d/%d bets (skipped %d timeouts)", processedBets, totalBets, skippedTimeouts)
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}

	return nil
}

func (s *BetService) ProcessTestRecentBets() error {
	logMsg := fmt.Sprintf("Processing test bets for the last day")
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}

	// Cleanup old unprocessed test bets (older than 3 days)
	deleted, err := s.Repo.CleanupUnprocessedTestBets(3)
	if err != nil {
		s.Logger.Error("Error cleaning up old test bets", zap.Error(err))
	} else if deleted > 0 {
		cleanupMsg := fmt.Sprintf("🧹 Cleaned up %d old test bets without results (>3 days)", deleted)
		s.Logger.Info(cleanupMsg)
		if s.LogToTelegram && s.TelegramService != nil {
			s.TelegramService.SendMessage(cleanupMsg)
		}
	}

	// Get test bets for the specified period
	bets, err := s.Repo.GetYesterdayTestBets()
	if err != nil {
		errMsg := fmt.Sprintf("Error getting recent test bets: %v", err)
		s.Logger.Error(errMsg)
		return err
	}

	logMsg = fmt.Sprintf("Found %d test bets for the last day", len(bets))
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}

	// Process each test bet
	totalBets := len(bets)
	processedBets := 0
	for _, bet := range bets {
		result, err := s.ProcessBet(bet)
		if err != nil {
			s.Logger.Error("Error processing test bet", zap.String("outcome", bet.KeyOutcome), zap.Error(err))
		} else {
			s.Logger.Info("Processed test bet", zap.String("outcome", bet.KeyOutcome), zap.String("result", result.Status))

			// Обновляем информацию о прибыли для тестовых ставок
			if result.Status == "win" || result.Status == "lose" {
				// Извлекаем сумму ставки и коэффициент
				sumVal, ok := bet.Data["sum"].(float64)
				if !ok {
					s.Logger.Warn("Warning: couldn't extract sum from test bet", zap.String("outcome", bet.KeyOutcome))
					sumVal = 0
				}
				coefVal, ok := bet.Data["coef"].(float64)
				if !ok {
					s.Logger.Warn("Warning: couldn't extract coefficient from test bet", zap.String("outcome", bet.KeyOutcome))
					coefVal = 0
				}

				// Расчет прибыли
				var realProfit float64
				if result.Status == "win" {
					realProfit = sumVal * (coefVal - 1)
				} else if result.Status == "lose" {
					realProfit = -sumVal
				}

				err = s.Repo.UpdateTestBetProfits(bet.KeyOutcome, realProfit, realProfit)
				if err != nil {
					s.Logger.Error("Error updating test bet profits", zap.Int64("id", bet.ID), zap.String("outcome", bet.KeyOutcome), zap.Error(err))
				}

				processedBets++
			}
		}
	}

	logMsg = fmt.Sprintf("Processed %d/%d test bets", processedBets, totalBets)
	s.Logger.Info(logMsg)
	if s.LogToTelegram && s.TelegramService != nil {
		s.TelegramService.SendMessage(logMsg)
	}

	return nil
}

// CleanupOld removes unprocessed bets older than 3 days
func (s *BetService) CleanupOld() (string, error) {
	countTest, _ := s.Repo.CountUnprocessedTestBets(3)
	countGroup, _ := s.Repo.CountUnprocessedGroupBets(3)

	if countTest == 0 && countGroup == 0 {
		return "✅ Нет записей для удаления (все ставки обработаны или моложе 3 дней)", nil
	}

	deletedTest, err := s.Repo.CleanupUnprocessedTestBets(3)
	if err != nil {
		return "", fmt.Errorf("ошибка при удалении тестовых ставок: %w", err)
	}

	deletedGroup, err := s.Repo.CleanupUnprocessedGroupBets(3)
	if err != nil {
		return "", fmt.Errorf("ошибка при удалении групповых ставок: %w", err)
	}

	return fmt.Sprintf("✅ Очистка завершена!\n🧹 Удалено:\n- Тестовые: %d\n- Групповые: %d\n- Всего: %d", deletedTest, deletedGroup, deletedTest+deletedGroup), nil
}

// ClearResultsCache clears the FlashScore results cache
func (s *BetService) ClearResultsCache() {
	s.ResultsProvider.ClearCached()
}
