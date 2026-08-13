package service

import (
	"context"
	"encoding/json"
	"fmt"
	"livebets/calculator/cmd/config"
	"livebets/calculator/internal/api"
	"livebets/calculator/internal/entity"
	"livebets/calculator/internal/repository"
	"livebets/calculator/pkg/rdbms"
	"livebets/calculator/pkg/utils"
	"livebets/pkg/cache"
	"livebets/pkg/calculation/roi"
	"livebets/pkg/domain"
	"log"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// Kelly Criterion parameters moved to config
// const (
// 	risk = 12.0
// 	bank = 10000.0
// )

type UserCache struct {
	sync.RWMutex
	data map[string]map[string]entity.UserIDCache
}

// createFallbackFile создаёт минимальный CSV-файл, когда отсутствуют ценовые ряды от Анализатора
func (l *LogsService) createFallbackFile(pairAccept entity.AcceptBet, minutes, seconds int, reason string) error {
	// Определяем суффикс источника: A = autobetting, F = frontend
	sourceSuffix := "A"
	if pairAccept.Strategy == "" || pairAccept.Strategy == "frontend" {
		sourceSuffix = "F"
	}

	// Имя файла в том же формате что createBetFile: salary_home_vs_away_Bookmaker_Outcome_suffix.csv
	// Для fallback используем 0.00 так как нет данных для расчёта salary
	matchNameRaw := fmt.Sprintf("0-00(0-00)_%s_vs_%s_%s_%s_%s",
		pairAccept.Pair.Second.HomeName,
		pairAccept.Pair.Second.AwayName,
		pairAccept.Pair.Second.Bookmaker,
		pairAccept.Pair.Outcome.Outcome,
		sourceSuffix,
	)
	matchName := removeSpecialChars(replaceDotsInFileName(matchNameRaw))

	// Директория captures (то же что createBetFile)
	dir := "/logs/bets/captures"
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("[HISTORY-FALLBACK] Ошибка создания директории %s: %v", dir, err)
		return err
	}

	// Минимальный CSV с метаданными ставки
	var b strings.Builder
	b.WriteString("Section,Key,Value\n")
	b.WriteString("Meta,Sport,\n")
	b.WriteString(fmt.Sprintf("Meta,SportName,%s\n", pairAccept.Pair.SportName))
	b.WriteString(fmt.Sprintf("Meta,Outcome,%s\n", pairAccept.Pair.Outcome.Outcome))
	b.WriteString(fmt.Sprintf("Meta,Bookmaker1,%s\n", pairAccept.Pair.First.Bookmaker))
	b.WriteString(fmt.Sprintf("Meta,Bookmaker2,%s\n", pairAccept.Pair.Second.Bookmaker))
	b.WriteString(fmt.Sprintf("Meta,MatchID1,%s\n", pairAccept.Pair.First.MatchID))
	b.WriteString(fmt.Sprintf("Meta,MatchID2,%s\n", pairAccept.Pair.Second.MatchID))
	b.WriteString(fmt.Sprintf("Meta,Minutes,%d\n", minutes))
	b.WriteString(fmt.Sprintf("Meta,Seconds,%d\n", seconds))
	b.WriteString(fmt.Sprintf("Meta,Reason,%s\n", reason))
	b.WriteString(fmt.Sprintf("Bet,Sum,%.2f\n", pairAccept.Sum))
	b.WriteString(fmt.Sprintf("Bet,Coef,%.3f\n", pairAccept.Coef))
	b.WriteString(fmt.Sprintf("Bet,Time,%s\n", pairAccept.Time))

	fileName := fmt.Sprintf("%s/%s.csv", dir, matchName)
	if err := os.WriteFile(fileName, []byte(b.String()), 0644); err != nil {
		log.Printf("[HISTORY-FALLBACK] Ошибка записи файла %s: %v", fileName, err)
		return err
	}
	log.Printf("[HISTORY-FALLBACK] Создан fallback CSV: %s", fileName)
	return nil
}

// ==================================================
// LogsService - Core betting calculations service
// ==================================================
// Responsibilities:
// 1. Calculate bet amounts using Kelly Criterion
// 2. Log accepted bets to DB and create CSV history files
// 3. Manage bankroll percentage cache (prevents over-betting on same match)
// 4. Track users per match (splits bet amount between multiple users)
//
// Key caches:
// - percentCache: tracks % of bankroll already bet on each match
// - usersCache: counts users who bet on same match (divides bet amount)
type LogsService struct {
	txStorage           rdbms.TxStorage[repository.LogsStorage]                 // Database operations
	analyzerAPI         *api.AnalizerAPI                                        // Live prices from Analyzer
	analyzerPrematchAPI *api.AnalizerPrematchAPI                                // Prematch prices from Analyzer
	percentCache        cache.MemoryCacheInterface[string, entity.TotalPercent] // Bankroll % cache
	usersCache          *UserCache                                              // Users per match cache
	logger              *zerolog.Logger                                         // Structured logger
	config              *config.AppConfig                                       // App configuration
}

func NewLogsService(
	txStorage rdbms.TxStorage[repository.LogsStorage],
	analyzerAPI *api.AnalizerAPI,
	analyzerPrematchAPI *api.AnalizerPrematchAPI,
	logger *zerolog.Logger,
	cfg *config.AppConfig,
) *LogsService {
	percentCache := cache.NewMemoryCache[string, entity.TotalPercent]()
	usersCache := &UserCache{
		data:    make(map[string]map[string]entity.UserIDCache),
		RWMutex: sync.RWMutex{},
	}

	// Log current mode
	if cfg.TestingMode.Enabled {
		logger.Warn().
			Float64("edge", cfg.TestingMode.Edge).
			Int("csv_wait_live", cfg.TestingMode.CSVWaitLiveSeconds).
			Int("csv_wait_prematch", cfg.TestingMode.CSVWaitPrematchSeconds).
			Msg("🧪 TESTING MODE ENABLED - Not for production!")
	} else {
		logger.Info().
			Float64("edge", cfg.ProductionMode.Edge).
			Int("csv_wait_live", cfg.ProductionMode.CSVWaitLiveSeconds).
			Int("csv_wait_prematch", cfg.ProductionMode.CSVWaitPrematchSeconds).
			Msg("✅ PRODUCTION MODE")
	}

	return &LogsService{
		txStorage:           txStorage,
		analyzerAPI:         analyzerAPI,
		analyzerPrematchAPI: analyzerPrematchAPI,
		percentCache:        percentCache,
		usersCache:          usersCache,
		logger:              logger,
		config:              cfg,
	}
}

func (l *LogsService) GetMinBetAmount() float64 {
	return l.config.KellyCriterion.MinBetAmount
}

// CheckStrategyLimit checks if a bet with given strategy already exists for this match
// Returns true if betting is allowed, false if limit reached
func (l *LogsService) CheckStrategyLimit(ctx context.Context, keyMatch, strategy string) (bool, error) {
	return l.txStorage.Storage().CheckStrategyLimit(ctx, keyMatch, strategy)
}

// CheckBettingLimits performs comprehensive limit checks for betting
// Checks: 1) Global match limit (Kelly %), 2) Bookmaker limit, 3) Strategy limit
// Returns all limit states at once to minimize round-trips
// odds and expectedROI are optional - if provided, will calculate remainingAmount
func (l *LogsService) CheckBettingLimits(ctx context.Context, keyMatch, bookmaker, strategy string, odds, expectedROI float64, candidateOutcome, sportName string) (*entity.LimitCheckResult, error) {
	result := &entity.LimitCheckResult{
		Allowed:          true,
		KeyMatch:         keyMatch,
		Bookmaker:        bookmaker,
		Strategy:         strategy,
		BookmakerMaxBets: 1, // Currently 1 bet per bookmaker per match
		Mode:             "normal_limit",
	}

	// 1. Global match limit (Kelly % across all sources)
	globalPercent, globalOK, err := l.txStorage.Storage().CheckGlobalMatchLimit(ctx, keyMatch)
	if err != nil {
		l.logger.Error().Err(err).Str("keyMatch", keyMatch).Msg("CheckGlobalMatchLimit failed")
	}

	result.GlobalPercentUsed = globalPercent
	result.RemainingPercent = 100.0 - globalPercent
	if result.RemainingPercent < 0 {
		result.RemainingPercent = 0
	}

	if odds > 0 && expectedROI > 0 {
		kellyAmount := l.getBetSize(odds, expectedROI)
		result.KellyAmount = kellyAmount
		result.RemainingAmount = kellyAmount * result.RemainingPercent / 100.0
	}

	// Safe-opposite credit applies as soon as there is a compatible existing bet,
	// not only after gross limit reaches 100%.
	if l.config.LogsService.EnableSafeOppositeBets && candidateOutcome != "" && sportName != "" {
		safeResult := l.applySafeOppositeCredit(ctx, keyMatch, candidateOutcome, sportName, globalPercent, result)
		if safeResult != nil {
			return safeResult, nil
		}
	}

	if !globalOK {
		result.Allowed = false
		result.Reason = "global_limit_reached"
		result.Mode = "normal_limit"
		l.logger.Info().
			Str("keyMatch", keyMatch).
			Float64("globalPercent", globalPercent).
			Msg("Betting blocked: global match limit reached (100% Kelly)")
		return result, nil
	}

	l.logger.Debug().
		Str("keyMatch", keyMatch).
		Str("bookmaker", bookmaker).
		Str("strategy", strategy).
		Float64("globalPercent", globalPercent).
		Float64("remainingPercent", result.RemainingPercent).
		Msg("Betting allowed: all limits passed")

	return result, nil
}

type safeOppositeCredit struct {
	CreditPercent       float64
	PrimaryOutcome      string
	CompatibilityFamily string
}

func clampPercent(percent float64) float64 {
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func calculateSafeOppositeRemainingPercent(globalPercent, creditPercent float64) float64 {
	return clampPercent(100.0 - globalPercent + creditPercent)
}

// calculateSafeOppositeCredit sums the percent of all existing bets on the match
// that are safe-opposite to the candidate. This credit is then added to the
// current remaining limit: allowed = 100 - grossUsed + credit.
func calculateSafeOppositeCredit(existingBets []repository.ExistingBet, candidateOutcome, sportName string) *safeOppositeCredit {
	candidateCanonical := ParseCanonicalMarket(candidateOutcome, sportName)
	if !candidateCanonical.Eligible {
		return nil
	}

	credit := &safeOppositeCredit{
		CompatibilityFamily: string(candidateCanonical.Family),
	}

	var bestPercent float64
	for _, existing := range existingBets {
		existingSport := existing.SportName
		if existingSport == "" {
			existingSport = sportName
		}
		existingCanonical := ParseCanonicalMarket(existing.Outcome, existingSport)
		if !IsSafeOpposite(existingCanonical, candidateCanonical) {
			continue
		}

		credit.CreditPercent += existing.Percent
		if credit.PrimaryOutcome == "" || existing.Percent > bestPercent {
			credit.PrimaryOutcome = existing.Outcome
			bestPercent = existing.Percent
		}
	}

	if credit.CreditPercent <= 0 {
		return nil
	}

	return credit
}

// applySafeOppositeCredit applies opposite-bet credit to the available limit.
// Formula:
//
//	allowedPercent = clamp(100 - grossPercentUsed + oppositeCreditPercent, 0, 100)
//
// Example:
//
//	gross=50, oppositeCredit=50  => allowed=100
//	gross=110, oppositeCredit=30 => allowed=20
func (l *LogsService) applySafeOppositeCredit(ctx context.Context, keyMatch, candidateOutcome, sportName string, globalPercent float64, baseResult *entity.LimitCheckResult) *entity.LimitCheckResult {
	existingBets, err := l.txStorage.Storage().GetExistingBetsForMatch(ctx, keyMatch)
	if err != nil {
		l.logger.Error().Err(err).Str("keyMatch", keyMatch).Msg("GetExistingBetsForMatch failed")
		return nil
	}

	if len(existingBets) == 0 {
		return nil
	}

	credit := calculateSafeOppositeCredit(existingBets, candidateOutcome, sportName)
	if credit == nil {
		l.logger.Debug().
			Str("keyMatch", keyMatch).
			Str("candidate", candidateOutcome).
			Int("existingBets", len(existingBets)).
			Msg("Safe opposite: no compatible existing bet found")
		return nil
	}

	result := *baseResult
	result.Mode = "safe_opposite_allowed"
	result.Reason = ""
	result.SafeOppositeOf = credit.PrimaryOutcome
	result.CompatibilityFamily = credit.CompatibilityFamily
	result.SafeOppositeCreditPercent = credit.CreditPercent

	// Core rule requested by user:
	// add the opposite bet percent back into the available match limit.
	effectiveRemainingPercent := calculateSafeOppositeRemainingPercent(globalPercent, credit.CreditPercent)
	result.RemainingPercent = effectiveRemainingPercent
	if result.KellyAmount > 0 {
		result.RemainingAmount = result.KellyAmount * result.RemainingPercent / 100.0
	}

	// Informational fields: effective used after opposite-credit.
	result.WorstCasePercentUsed = clampPercent(globalPercent - credit.CreditPercent)
	result.RemainingWorstCasePercent = 100.0 - result.WorstCasePercentUsed
	if result.RemainingWorstCasePercent < 0 {
		result.RemainingWorstCasePercent = 0
	}

	if result.RemainingPercent <= 0 {
		result.Allowed = false
		result.Mode = "safe_opposite_denied"
		result.Reason = "global_limit_reached"
		l.logger.Info().
			Str("keyMatch", keyMatch).
			Str("candidate", candidateOutcome).
			Str("safeOppositeOf", credit.PrimaryOutcome).
			Float64("grossPercent", globalPercent).
			Float64("creditPercent", credit.CreditPercent).
			Msg("Safe opposite credit found, but no remaining room after applying credit")
		return &result
	}

	result.Allowed = true
	l.logger.Info().
		Str("keyMatch", keyMatch).
		Str("candidate", candidateOutcome).
		Str("safeOppositeOf", credit.PrimaryOutcome).
		Float64("grossPercent", globalPercent).
		Float64("creditPercent", credit.CreditPercent).
		Float64("effectiveRemainingPercent", result.RemainingPercent).
		Msg("Safe opposite credit applied to available match limit")

	return &result
}

// RollbackCalcBet reverts changes made by CalcSumBet if logging fails.
//
// This ensures transactional consistency:
// 1. If log_bet fails after calc_bet succeeded
// 2. Rollback prevents "ghost bets" (reserved money but no actual bet)
//
// Workflow:
// - Remove user from usersCache (free up user slot)
// - Subtract percent from percentCache (free up bankroll)
//
// Thread-safe: uses locks to prevent race conditions
func (l *LogsService) RollbackCalcBet(ctx context.Context, keyMatch, userID string, percent float64, isLive bool) error {
	l.logger.Warn().
		Str("keyMatch", keyMatch).
		Str("userID", userID).
		Float64("percent", percent).
		Msg("Rolling back calc bet")

	// STEP 1: Remove user from usersCache
	l.usersCache.Lock()
	if users, ok := l.usersCache.data[keyMatch]; ok {
		delete(users, userID)
		if len(users) == 0 {
			delete(l.usersCache.data, keyMatch)
		}
	}
	l.usersCache.Unlock()

	// STEP 2: Subtract percent from percentCache (atomic operation)
	l.percentCache.Lock()
	per, ok := l.percentCache.ReadUnsafe(keyMatch)
	if ok {
		per.TotalPercent -= percent
		if per.TotalPercent < 0 {
			per.TotalPercent = 0
		}
		l.percentCache.WriteUnsafe(keyMatch, per)
	}
	l.percentCache.Unlock()

	l.logger.Info().
		Str("keyMatch", keyMatch).
		Msg("Rollback completed successfully")

	return nil
}

func (l *LogsService) InitializeTotalBetPercents(ctx context.Context) error {
	// Add timeout for DB query
	dbCtx, cancel := context.WithTimeout(ctx, time.Duration(l.config.Timeouts.DBQuerySeconds)*time.Second)
	defer cancel()

	percents, err := l.txStorage.Storage().GetInitializeCalcBet(dbCtx)
	if err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.InitializeTotalBetPercents] get saved percent error")
		return err
	}

	for _, percent := range percents {
		// NOTE: DB might not have IsLive field (old data)
		// Default to IsLive=false (prematch) for backward compatibility
		// This gives old entries longer TTL (72h) which is safer
		l.percentCache.Write(percent.KeyMatch, entity.TotalPercent{
			TotalPercent: percent.TotalPercent,
			CreatedAt:    time.Now().UTC(), // Always use UTC
			IsLive:       false,            // Default to prematch (safer, longer TTL)
		})
	}

	return nil
}

func (l *LogsService) CleanCaches(ctx context.Context, cfg config.LogsService, wg *sync.WaitGroup) {
	defer wg.Done()

	percentCacheInterval := time.Duration(time.Duration(cfg.PercentCacheInterval) * time.Second)
	percentCacheTicker := time.NewTicker(percentCacheInterval)

	usersCacheInterval := time.Duration(time.Duration(cfg.UsersCacheInterval) * time.Second)
	usersCacheTicker := time.NewTicker(usersCacheInterval)

	for {
		select {
		case <-percentCacheTicker.C:
			percentCache := l.percentCache.ReadAll()

			// Clean cache with different TTL for live vs prematch
			for key, value := range percentCache {
				var ttl time.Duration

				if value.IsLive {
					// Live matches: 4 hours TTL
					// Match finishes in ~2h, cache clears 2h after
					ttl = time.Duration(cfg.PercentCacheTTLLive) * time.Second
				} else {
					// Prematch: 72 hours TTL
					// Bets appear 1-2 days before match, cache survives until match ends
					ttl = time.Duration(cfg.PercentCacheTTLPrematch) * time.Second
				}

				if time.Since(value.CreatedAt) > ttl {
					l.percentCache.Delete(key)
					l.logger.Debug().Str("key", key).Bool("isLive", value.IsLive).Msgf("Cleaned percentCache entry (TTL expired)")
				}
			}

		case <-usersCacheTicker.C:
			l.usersCache.Lock()

			for key, users := range l.usersCache.data {
				for userK, user := range users {
					if time.Since(user.CreatedAt) > (time.Duration(cfg.UsersCacheTimeout) * time.Second) {
						delete(l.usersCache.data[key], userK)
					}
				}

				if len(l.usersCache.data[key]) == 0 {
					delete(l.usersCache.data, key)
				}
			}

			l.usersCache.Unlock()

		case <-ctx.Done():
			percentCacheTicker.Stop()
			usersCacheTicker.Stop()
			return
		}
	}
}

// LogBetAccept processes a bet that was accepted by the system.
//
// Workflow:
// 1. Update percentCache (track money committed to this match)
// 2. Request price history from Analyzer (120sec for live, 1200sec for prematch)
// 3. Save bet to database (table: log_bet_accept_test)
// 4. Launch async CSV creation with full price history (fire-and-forget goroutine)
//
// The CSV file will be created later (after CSV_WAIT time) with extended price data.
func (l *LogsService) LogBetAccept(ctx context.Context, pairAccept entity.AcceptBet) error {
	// DEBUG: Log raw input data BEFORE hashing for troubleshooting keyMatch mismatches
	log.Printf("[LogsService.LogBetAccept] RAW INPUT: bookmaker='%s', league='%s', home='%s', away='%s', sport='%s'",
		pairAccept.Pair.First.Bookmaker, pairAccept.Pair.First.LeagueName,
		pairAccept.Pair.First.HomeName, pairAccept.Pair.First.AwayName, pairAccept.Pair.SportName)

	// FIX 1.3: Use "Pinnacle" as first bookmaker for keyMatch (same as CheckBettingLimits)
	// This ensures consistent key across all endpoints — limits work correctly
	keyMatch := utils.GenerateFullMatchKey("Pinnacle", pairAccept.Pair.First.LeagueName, pairAccept.Pair.First.HomeName, pairAccept.Pair.First.AwayName, pairAccept.Pair.SportName, "")
	keyOutcome := utils.GenerateFullMatchKey(pairAccept.Pair.First.Bookmaker, pairAccept.Pair.Second.Bookmaker, pairAccept.Pair.First.MatchID, pairAccept.Pair.Second.MatchID, pairAccept.Pair.SportName, pairAccept.Pair.Outcome.Outcome)

	log.Printf("[LogsService.LogBetAccept] SAVED: keyMatch=%s (Pinnacle-based)", keyMatch)

	// STEP 1: Update percentCache to track money committed to this match
	// This prevents betting too much on same match (risk management)
	//
	// KEY FEATURE: Prematch bets limit live bets on same match!
	// Example: Bet 100$ on match 2 days before (prematch)
	//          When match starts (live) → can't bet more (limit already used)
	//
	// THREAD-SAFE: Use Lock/Unlock for atomic read-modify-write operation
	// Prevents race condition when multiple users bet on same match simultaneously
	//
	// GLOBAL KELLY: Calculate percent from global Kelly (based on current Pinnacle odds)
	// This allows multiple small bets from different sources without hitting 100% limit
	// Example: Kelly=100 EUR, bet 3 EUR → 3% (not 100% of strategy max)
	// Calculate percent from global Kelly — used for tracking match exposure
	globalKelly := l.getBetSize(pairAccept.Pair.Outcome.Score1.Value, pairAccept.Pair.Outcome.ROI)
	var percent float64
	if globalKelly > 0 {
		percent = pairAccept.Sum / globalKelly * 100
	} else {
		// Fallback: if Kelly is 0 (edge < 0), use 100% to block further bets
		percent = 100.0
	}

	// STEP 2: Parse match time (MM:SS format)
	// Example: "35:20" → minutes=35, seconds=20
	strs := strings.Split(pairAccept.Time, ":")
	if len(strs) != 2 {
		err := fmt.Errorf("split time correct error")
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] split time correct error")
		return err
	}

	minutes, err := strconv.Atoi(strs[0])
	if err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] parse string to int error")
		return err
	}

	seconds, err := strconv.Atoi(strs[1])
	if err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] parse string to int error")
		return err
	}

	// STEP 3: Get price history from Analyzer
	// Live: 180 seconds of history (3 min - extended for better analysis)
	// Prematch: 1200 seconds (20 min) of history (slower-moving odds)
	var priceRecods *entity.ResponsePriceRecords
	if pairAccept.Pair.IsLive {
		priceRecods, err = l.analyzerAPI.GeTPricesByTimeout(entity.RequestPriceRecordsByTime{
			Bookmaker1: pairAccept.Pair.First.Bookmaker,
			Bookmaker2: pairAccept.Pair.Second.Bookmaker,
			MatchID1:   pairAccept.Pair.First.MatchID,
			MatchID2:   pairAccept.Pair.Second.MatchID,
			SportName:  pairAccept.Pair.SportName,
			Outcome:    pairAccept.Pair.Outcome.Outcome,

			Minutes:  minutes,
			Seconds:  seconds,
			LongTime: 180,
		})
		if err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices live error")
		}
	} else {
		priceRecods, err = l.analyzerPrematchAPI.GeTPricesByTimeout(entity.RequestPriceRecordsByTime{
			Bookmaker1: pairAccept.Pair.First.Bookmaker,
			Bookmaker2: pairAccept.Pair.Second.Bookmaker,
			MatchID1:   pairAccept.Pair.First.MatchID,
			MatchID2:   pairAccept.Pair.Second.MatchID,
			SportName:  pairAccept.Pair.SportName,
			Outcome:    pairAccept.Pair.Outcome.Outcome,

			Minutes:  minutes,
			Seconds:  seconds,
			LongTime: 1200,
		})
		if err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices prematch error")
		}
	}

	// STEP 4: Save to database
	// Add timeout to prevent hanging DB queries
	dbCtx, dbCancel := context.WithTimeout(ctx, time.Duration(l.config.Timeouts.DBQuerySeconds)*time.Second)
	defer dbCancel()

	// Get strategy (default to 'frontend' if not provided)
	strategy := pairAccept.Strategy
	if strategy == "" {
		strategy = "frontend"
	}

	// FAIL_ strategies: only create CSV for analysis, skip DB insert and percentCache
	isFail := strings.HasPrefix(strategy, "FAIL_")

	if priceRecods == nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices nil error")
		if !isFail {
			if err = l.txStorage.Storage().InsertLogBetAccept(dbCtx, keyMatch, keyOutcome, pairAccept, nil, percent, pairAccept.UserId, pairAccept.Pair.IsLive, pairAccept.Pair.SportName, pairAccept.Pair.Second.Bookmaker, strategy); err != nil {
				l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] insert log bet accept error")
				return err
			}
			l.updatePercentCache(keyMatch, percent, pairAccept.Pair.IsLive)
		}
		// FALLBACK: Create CSV even without price records
		go l.createFallbackFile(pairAccept, minutes, seconds, "no_prices")
		return nil
	}
	if len(priceRecods.Records) <= priceRecods.ISave {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices length records error")
		if !isFail {
			if err = l.txStorage.Storage().InsertLogBetAccept(dbCtx, keyMatch, keyOutcome, pairAccept, nil, percent, pairAccept.UserId, pairAccept.Pair.IsLive, pairAccept.Pair.SportName, pairAccept.Pair.Second.Bookmaker, strategy); err != nil {
				l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] insert log bet accept error")
				return err
			}
			l.updatePercentCache(keyMatch, percent, pairAccept.Pair.IsLive)
		}
		// FALLBACK: Create CSV even without valid ISave
		go l.createFallbackFile(pairAccept, minutes, seconds, "invalid_isave")
		return nil
	}

	// FIX: correct_data должен содержать РЕАЛЬНУЮ цену покупки, не первоначальную!
	// priceRecord.Second.Score содержит цену в момент ПОИСКА value (когда analyzer нашел возможность)
	// Но мы реально покупаем по pairAccept.Coef (может отличаться из-за движения линии)
	// Поэтому создаем корректную копию с реальной ценой покупки
	priceRecods.Records[priceRecods.ISave].Second.Score = pairAccept.Coef // FIX: update IN-PLACE so CSV/diagnostic also get real price
	correctPriceRecord := priceRecods.Records[priceRecods.ISave]

	// Пересчитываем ROI с ПРАВИЛЬНОЙ формулой (той же что используется для roi_1min)
	// ВАЖНО: Используем ту же функцию roi.Calculate() чтобы initial и roi_1min были сопоставимы!
	roiCalc := roi.NewCalculator()
	correctPriceRecord.ROI = roiCalc.Calculate(
		pairAccept.Coef,                // Коэфф донора (РЕАЛЬНАЯ цена покупки)
		correctPriceRecord.First.Score, // Коэфф Pinnacle в момент ставки
		correctPriceRecord.Margin,      // Margin
		roi.MarketType(pairAccept.Pair.Outcome.MarketType),
		domain.Parser(pairAccept.Pair.Second.Bookmaker),
		domain.SportName(pairAccept.Pair.SportName),
		pairAccept.Pair.IsLive, // Live/Prematch mode
	)

	if !isFail {
		if err = l.txStorage.Storage().InsertLogBetAccept(dbCtx, keyMatch, keyOutcome, pairAccept, &correctPriceRecord, percent, pairAccept.UserId, pairAccept.Pair.IsLive, pairAccept.Pair.SportName, pairAccept.Pair.Second.Bookmaker, strategy); err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] insert log bet accept error")
			return err
		}
		l.updatePercentCache(keyMatch, percent, pairAccept.Pair.IsLive)
	}

	// STEP 5: Launch async CSV creation (fire-and-forget)
	// This will wait (CSV_WAIT time) and then create detailed CSV with price history
	// The goroutine runs independently so we don't block the response
	correctROI := correctPriceRecord.ROI
	betCreatedAt := time.Now().UTC() // Запоминаем время создания ставки ДО async вызова
	// FIX 1.5: Use background context for async goroutine — request ctx is cancelled after HTTP response
	go l.GetPricesForFlie(context.Background(), pairAccept, minutes, seconds, correctROI, betCreatedAt, pairAccept.IsTest)

	// CLV: Capture Pinnacle closing line at 5min and 1min before match kickoff (prematch only)
	if !pairAccept.Pair.IsLive && !pairAccept.Pair.First.MatchDate.IsZero() {
		go l.CaptureClosingLine(context.Background(), pairAccept, pairAccept.Pair.First.MatchDate, keyOutcome, betCreatedAt)
	}

	return nil
}

// findRecordAfterDelay находит запись в priceRecords через указанное количество секунд после ISave
// Возвращает индекс ближайшей записи или -1 если не найдена
func findRecordAfterDelay(records *entity.ResponsePriceRecords, delaySeconds int) int {
	if records == nil || len(records.Records) <= records.ISave {
		return -1
	}

	betTime := records.Records[records.ISave].CreatedAt
	targetTime := betTime.Add(time.Duration(delaySeconds) * time.Second)
	maxTime := betTime.Add(time.Duration(delaySeconds*2) * time.Second) // не дальше 2x delay

	// Ищем ближайшую запись к targetTime (в окне [betTime+1 .. betTime+2*delay])
	bestIdx := -1
	bestDiff := time.Duration(math.MaxInt64)

	// Также отслеживаем ближайшую запись ДО targetTime (fallback если данные обрываются)
	closestBeforeIdx := -1

	for i := records.ISave + 1; i < len(records.Records); i++ {
		recordTime := records.Records[i].CreatedAt
		if recordTime.After(maxTime) {
			break // дальше 2x delay — не рассматриваем
		}
		if recordTime.After(targetTime) || recordTime.Equal(targetTime) {
			diff := recordTime.Sub(targetTime)
			if diff < bestDiff {
				bestDiff = diff
				bestIdx = i
			}
			break // записи хронологические — первая >= target = ближайшая
		} else {
			// Запись до targetTime — запоминаем последнюю (самую близкую к target)
			closestBeforeIdx = i
		}
	}

	// Если нет записи после targetTime — берём ближайшую до неё.
	// Это происходит когда матч завершился и данные обрываются раньше delay.
	if bestIdx == -1 && closestBeforeIdx != -1 {
		bestIdx = closestBeforeIdx
	}

	return bestIdx
}

// GetPricesForFile creates CSV file with price history for accepted bet.
//
// Workflow:
// 1. WAIT for prices to stabilize (CSV_WAIT: 30sec live, 60sec prematch)
// 2. Request EXTENDED price history from Analyzer (300sec live, 3600sec prematch)
// 3. Create CSV file with:
//   - "Before Bet" section (prices leading up to bet)
//   - "After Bet" section (prices after bet was placed)
//
// This CSV is used later by Results service to calculate bet outcomes.
//
// Note: Runs as goroutine (fire-and-forget), errors are logged but don't fail parent operation.
func (l *LogsService) GetPricesForFlie(ctx context.Context, pairAccept entity.AcceptBet, minutes, seconds int, correctROI float64, betCreatedAt time.Time, isTest bool) error {
	// STEP 1: Wait for prices to stabilize after bet placement
	// Testing mode: shorter wait (faster iteration)
	// Production: longer wait (more accurate data)
	var waitSeconds int
	if l.config.TestingMode.Enabled {
		if pairAccept.Pair.IsLive {
			waitSeconds = l.config.TestingMode.CSVWaitLiveSeconds
		} else {
			waitSeconds = l.config.TestingMode.CSVWaitPrematchSeconds
		}
	} else {
		if pairAccept.Pair.IsLive {
			waitSeconds = l.config.ProductionMode.CSVWaitLiveSeconds
		} else if strings.HasPrefix(pairAccept.Strategy, "FAIL_") && l.config.ProductionMode.CSVWaitPrematchFailSeconds > 0 {
			waitSeconds = l.config.ProductionMode.CSVWaitPrematchFailSeconds
		} else {
			waitSeconds = l.config.ProductionMode.CSVWaitPrematchSeconds
		}
	}

	// FIX 3.1: Interruptible sleep — allows graceful shutdown instead of blocking goroutine
	timer := time.NewTimer(time.Duration(waitSeconds) * time.Second)
	select {
	case <-timer.C:
	case <-ctx.Done():
		timer.Stop()
		l.logger.Info().Msg("[GetPricesForFlie] Context cancelled during wait, aborting CSV generation")
		return nil
	}

	bookmakerForPrices := pairAccept.Pair.Second.Bookmaker
	if bookmakerForPrices == "Ladbrokes2" {
		bookmakerForPrices = "Ladbrokes"
	}

	var priceRecods *entity.ResponsePriceRecords
	var err error
	// Подготовка параметров для Анализатора: Pinnacle всегда Bookmaker1
	b1 := pairAccept.Pair.First.Bookmaker
	b2 := bookmakerForPrices
	m1 := pairAccept.Pair.First.MatchID
	m2 := pairAccept.Pair.Second.MatchID
	if b2 == "Pinnacle" && b1 != "Pinnacle" {
		b1, b2 = b2, b1
		m1, m2 = m2, m1
	}
	// Go to analyzer correct
	if pairAccept.Pair.IsLive {
		req := entity.RequestPriceRecordsByTime{
			Bookmaker1: b1,
			Bookmaker2: b2,
			MatchID1:   m1,
			MatchID2:   m2,
			SportName:  pairAccept.Pair.SportName,
			Outcome:    pairAccept.Pair.Outcome.Outcome,

			Minutes:  minutes,
			Seconds:  seconds,
			LongTime: 180,
		}
		log.Printf("[LogsService.GetPricesForFlie] analyzer live request: %+v", req)
		priceRecods, err = l.analyzerAPI.GeTPricesByTimeout(req)
		if err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices live error")
		}
	} else {
		req := entity.RequestPriceRecordsByTime{
			Bookmaker1: b1,
			Bookmaker2: b2,
			MatchID1:   m1,
			MatchID2:   m2,
			SportName:  pairAccept.Pair.SportName,
			Outcome:    pairAccept.Pair.Outcome.Outcome,

			Minutes:  minutes,
			Seconds:  seconds,
			LongTime: 3600,
		}
		log.Printf("[LogsService.GetPricesForFlie] analyzer prematch request: %+v", req)
		priceRecods, err = l.analyzerPrematchAPI.GeTPricesByTimeout(req)
		if err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices prematch error")
		}
	}

	if priceRecods == nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices nil error")
		return nil
	}
	if len(priceRecods.Records) <= priceRecods.ISave {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices length records error")
		return nil
	}

	// ============================================================
	// КРИТИЧЕСКИ ВАЖНО: СОРТИРОВКА ПЕРЕД РАСЧЕТОМ ROI_1MIN
	// ============================================================
	// Проблема: Analyzer возвращает записи в ОБРАТНОМ порядке (новые → старые)
	// findRecordAfterDelay ожидает хронологический порядок (старые → новые)
	// Решение: Сортируем ДО расчета roi_1min, затем находим ISave по времени
	// ============================================================

	// Шаг 1: Сохраняем время ставки ДО сортировки
	betTime := priceRecods.Records[priceRecods.ISave].CreatedAt

	// Шаг 2: Сортируем records по времени (старые → новые)
	sort.Slice(priceRecods.Records, func(i, j int) bool {
		return priceRecods.Records[i].CreatedAt.Before(priceRecods.Records[j].CreatedAt)
	})

	// Шаг 3: Находим новый ISave по времени (не по индексу!)
	newISave := 0
	found := false
	for i, rec := range priceRecods.Records {
		if rec.CreatedAt.Equal(betTime) {
			newISave = i
			found = true
			break
		}
	}

	if !found {
		l.logger.Warn().
			Time("betTime", betTime).
			Int("old_iSave", priceRecods.ISave).
			Int("records_count", len(priceRecods.Records)).
			Msgf("[ROI_1MIN] Bet time not found after sorting, using first record as fallback")
		newISave = 0
	} else {
		l.logger.Debug().
			Int("old_iSave", priceRecods.ISave).
			Int("new_iSave", newISave).
			Msgf("[ROI_1MIN] Records sorted chronologically, ISave updated")
	}

	// Обновляем ISave в структуре
	priceRecods.ISave = newISave
	record := priceRecods.Records[newISave]

	//otherCoef := getPriceForSecond(priceRecods, record.CreatedAt, minutes, seconds, pairAccept.Pair.IsLive, pairAccept.Coef)
	//roi := roicalc.CalculateROI(otherCoef, record.First.Score, record.Margin, pairAccept.Pair.Outcome.MarketType, domain.Parser(pairAccept.Pair.Second.Bookmaker), domain.SportName(pairAccept.Pair.SportName))

	// ============================================================
	// РАСЧЕТ ROI ЧЕРЕЗ 1 МИНУТУ ПОСЛЕ СТАВКИ
	// ============================================================
	// ФОРМУЛА:
	// - coef_donor_original = pairAccept.Coef (РЕАЛЬНАЯ ЦЕНА ПОКУПКИ)
	// - coef_pinnacle_1min = Records[idx1min].First.Score (Pinnacle через 60 сек)
	// - roi_1min = CalculateROI(coef_donor_original, coef_pinnacle_1min, margin, ...)
	//
	// СМЫСЛ: показывает насколько быстро "съедается" value
	// Если ROI упал с 6% до 2% → value быстро исчезает
	// Если ROI остался ~6% → value держится стабильно
	// ============================================================

	var roi1min *float64
	var coefDonorOriginal *float64
	var coefPinnacle1min *float64
	var evProfit1min *float64
	var roi15sec *float64
	var coefPinnacle15sec *float64
	var evProfit15sec *float64

	// FIX 1.3: Use "Pinnacle" as first bookmaker for consistent keyMatch
	keyMatch := utils.GenerateFullMatchKey("Pinnacle", pairAccept.Pair.First.LeagueName, pairAccept.Pair.First.HomeName, pairAccept.Pair.First.AwayName, pairAccept.Pair.SportName, "")
	keyOutcome := utils.GenerateFullMatchKey(pairAccept.Pair.First.Bookmaker, pairAccept.Pair.Second.Bookmaker, pairAccept.Pair.First.MatchID, pairAccept.Pair.Second.MatchID, pairAccept.Pair.SportName, pairAccept.Pair.Outcome.Outcome)

	// Ищем запись через 15 секунд после ставки
	idx15sec := findRecordAfterDelay(priceRecods, 15)
	if idx15sec != -1 {
		record15sec := priceRecods.Records[idx15sec]

		// РЕАЛЬНАЯ цена покупки
		donorOriginal := pairAccept.Coef
		if coefDonorOriginal == nil {
			coefDonorOriginal = &donorOriginal
		}

		// Коэффициент Pinnacle через 15 секунд
		pinnacle15sec := record15sec.First.Score
		coefPinnacle15sec = &pinnacle15sec

		// Рассчитываем ROI через 15 секунд
		roiCalc := roi.NewCalculator()
		roi15secVal := roiCalc.Calculate(
			donorOriginal,
			pinnacle15sec,
			record.Margin,
			roi.MarketType(pairAccept.Pair.Outcome.MarketType),
			domain.Parser(pairAccept.Pair.Second.Bookmaker),
			domain.SportName(pairAccept.Pair.SportName),
			pairAccept.Pair.IsLive,
		)
		roi15sec = &roi15secVal

		// Рассчитываем ev_profit_15sec
		evProfit15secVal := pairAccept.Sum * roi15secVal / 100
		evProfit15sec = &evProfit15secVal

		l.logger.Info().
			Str("keyMatch", keyMatch).
			Float64("roi_15sec", roi15secVal).
			Float64("coef_pinnacle_15sec", pinnacle15sec).
			Float64("ev_profit_15sec", evProfit15secVal).
			Msgf("[ROI_15SEC] Calculated")
	}

	// Ищем запись через 60 секунд после ставки
	// Теперь records отсортированы, findRecordAfterDelay работает корректно!
	idx1min := findRecordAfterDelay(priceRecods, 60)
	if idx1min != -1 {
		record1min := priceRecods.Records[idx1min]

		// КРИТИЧНО: Берем РЕАЛЬНУЮ цену покупки, не первоначальную!
		// record.Second.Score = цена когда analyzer нашел value (может быть старая)
		// pairAccept.Coef = цена которую РЕАЛЬНО купили
		donorOriginal := pairAccept.Coef // ✅ РЕАЛЬНАЯ ЦЕНА ПОКУПКИ!
		coefDonorOriginal = &donorOriginal

		// Берем коэффициент Pinnacle через 60 секунд
		pinnacle1min := record1min.First.Score
		coefPinnacle1min = &pinnacle1min

		// Рассчитываем ROI используя функцию из пакета roi
		roiCalc := roi.NewCalculator()
		roi1minVal := roiCalc.Calculate(
			donorOriginal, // Коэфф донора (купленный)
			pinnacle1min,  // Коэфф Pinnacle через 60 сек
			record.Margin, // Margin момента ставки
			roi.MarketType(pairAccept.Pair.Outcome.MarketType),
			domain.Parser(pairAccept.Pair.Second.Bookmaker),
			domain.SportName(pairAccept.Pair.SportName),
			pairAccept.Pair.IsLive, // Live/Prematch mode
		)
		roi1min = &roi1minVal

		// Рассчитываем ev_profit_1min
		evProfit1minVal := pairAccept.Sum * roi1minVal / 100
		evProfit1min = &evProfit1minVal

		l.logger.Info().
			Str("keyMatch", keyMatch).
			Float64("roi_initial", correctROI).
			Float64("roi_1min", roi1minVal).
			Float64("coef_donor_original", donorOriginal).
			Float64("coef_pinnacle_1min", pinnacle1min).
			Float64("ev_profit_initial", pairAccept.Sum*correctROI/100).
			Float64("ev_profit_1min", evProfit1minVal).
			Msgf("[ROI_1MIN] Calculated - value change: %.2f%% → %.2f%%", correctROI, roi1minVal)
	}

	// Сохраняем в БД
	dbCtx, dbCancel := context.WithTimeout(ctx, time.Duration(l.config.Timeouts.DBQuerySeconds)*time.Second)
	defer dbCancel()

	// Передаем время создания ставки чтобы обновить конкретную ставку (если несколько ставок на один исход)
	// betCreatedAt передан как параметр из LogBetAccept (до async вызова)
	if isTest {
		if err := l.txStorage.Storage().UpdateTestBetROI1min(dbCtx, keyOutcome, betCreatedAt, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec); err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.GetPricesForFile] update roi error")
		}
	} else {
		if err := l.txStorage.Storage().UpdateBetROI1min(dbCtx, keyOutcome, betCreatedAt, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec); err != nil {
			l.logger.Error().Err(err).Msgf("[LogsService.GetPricesForFile] update roi error")
		}
	}

	// ============================================================
	// РАСЧЕТ SALARY (ЗАРПЛАТА) — ROI ОТ АНАЛИЗАТОРА
	// ============================================================
	// salary = Sum × analyzerROI / 100
	// analyzerROI — ROI из PriceRecord анализатора (record.ROI = correctROI)
	// ============================================================
	salary := pairAccept.Sum * (correctROI / 100)

	// ============================================================
	// РАСЧЕТ SALARY_DELAYED (ЗАРПЛАТА ЧЕРЕЗ N СЕК)
	// ============================================================
	// Live: 12 сек, Prematch: 120 сек
	// Формула: та же roi.Calculate() из shared пакета (livebets/pkg/calculation/roi)
	// — единая с анализатором. Меняется ТОЛЬКО цена Pinnacle (через N сек),
	// donor coef и margin фиксированы на момент ставки.
	// ============================================================
	var salary12 float64 = 0
	delaySeconds := 12
	if !pairAccept.Pair.IsLive {
		delaySeconds = 120
	}
	idxDelayed := findRecordAfterDelay(priceRecods, delaySeconds)
	if idxDelayed != -1 {
		recordDelayed := priceRecods.Records[idxDelayed]
		roiDelayed := roi.NewCalculator().Calculate(
			pairAccept.Coef,           // Та же цена покупки (момент ставки)
			recordDelayed.First.Score, // Pinnacle через N сек
			record.Margin,             // Маржа момента ставки
			roi.MarketType(pairAccept.Pair.Outcome.MarketType),
			domain.Parser(pairAccept.Pair.Second.Bookmaker),
			domain.SportName(pairAccept.Pair.SportName),
			pairAccept.Pair.IsLive,
		)
		salary12 = pairAccept.Sum * (roiDelayed / 100)
	} else {
		// Нет данных через delay секунд — fallback на salary (ROI момента ставки)
		salary12 = salary
		l.logger.Warn().
			Int("delaySeconds", delaySeconds).
			Float64("salary_fallback", salary).
			Msgf("[SALARY] No delayed price record found, using salary as fallback for salary12")
	}

	l.logger.Info().
		Float64("analyzerROI", correctROI).
		Float64("salary", salary).
		Float64("salary12", salary12).
		Int("delaySeconds", delaySeconds).
		Float64("pinnacle_at_bet", record.First.Score).
		Float64("donor_coef", pairAccept.Coef).
		Msgf("[SALARY] Calculated with analyzer ROI (delay=%ds)", delaySeconds)

	// Определяем суффикс источника: A = autobetting, F = frontend
	sourceSuffix := "A"
	if pairAccept.Strategy == "" || pairAccept.Strategy == "frontend" {
		sourceSuffix = "F"
	}

	// Формат названия: salary(salary12)_home_vs_away_Bookmaker_Outcome_A.csv
	var matchNameRaw string
	if isTest {
		matchNameRaw = fmt.Sprintf("%.2f(%.2f)_%s_vs_%s_%s_%s_%d_%s", salary, salary12, pairAccept.Pair.Second.HomeName, pairAccept.Pair.Second.AwayName, pairAccept.Pair.Second.Bookmaker, record.Outcome, int64(pairAccept.Pair.Outcome.ROI), sourceSuffix)
	} else {
		matchNameRaw = fmt.Sprintf("%.2f(%.2f)_%s_vs_%s_%s_%s_%s", salary, salary12, pairAccept.Pair.Second.HomeName, pairAccept.Pair.Second.AwayName, pairAccept.Pair.Second.Bookmaker, record.Outcome, sourceSuffix)
	}
	matchName := removeSpecialChars(replaceDotsInFileName(matchNameRaw))
	// Prefix with X for failed attempts so user can distinguish in Telegram
	if strings.HasPrefix(pairAccept.Strategy, "FAIL_") {
		matchName = "X" + matchName
	}
	if err := l.createBetFile(matchName, *priceRecods, isTest); err != nil {
		l.logger.Error().Err(err).Msgf("[LogsService.LogBetAccept] get prices length records error")
		return nil
	}

	return err
}

// updatePercentCache updates the percent cache AFTER successful DB insert.
// FIX 1.1: Previously cache was updated BEFORE DB insert, causing "stuck" limits on DB errors.
func (l *LogsService) updatePercentCache(keyMatch string, percent float64, isLive bool) {
	l.percentCache.Lock()
	per, ok := l.percentCache.ReadUnsafe(keyMatch)
	if !ok {
		l.percentCache.WriteUnsafe(keyMatch, entity.TotalPercent{
			TotalPercent: percent,
			CreatedAt:    time.Now().UTC(),
			IsLive:       isLive,
		})
	} else {
		if !per.IsLive && isLive {
			per.CreatedAt = time.Now().UTC()
		}
		per.TotalPercent += percent
		per.IsLive = isLive
		l.percentCache.WriteUnsafe(keyMatch, per)
	}
	l.percentCache.Unlock()
}

// CalcSumBet calculates optimal bet amount for a value bet opportunity.
//
// Process:
// 1. Calculate base bet using Kelly Criterion (with real ROI from Analyzer)
// 2. Adjust for bankroll already committed to this match (percentCache)
// 3. Split between multiple users betting on same match (usersCache)
//
// Returns: (CalculatedBet, usersCount)
//
//	CalculatedBet.OriginalAmount = Kelly Criterion result
//	CalculatedBet.AdjustedAmount = after bankroll adjustment AND user split
//	usersCount = number of users who will bet on this match
func (l *LogsService) CalcSumBet(ctx context.Context, userID string, pair entity.PairOneOutcome) (entity.CalculatedBet, int) {
	// FIX 1.3: Use "Pinnacle" as first bookmaker for consistent keyMatch across all endpoints
	keyMatch := utils.GenerateFullMatchKey("Pinnacle", pair.First.LeagueName, pair.First.HomeName, pair.First.AwayName, pair.SportName, "")

	// LOG TRACE ID EXPLICITLY
	if pair.TraceID != "" {
		l.logger.Info().
			Str("trace_id", pair.TraceID).
			Str("event", "calc_bet_start").
			Str("match_key", keyMatch).
			Str("user_id", userID).
			Msg("Starting bet calculation")
	}

	// STEP 1: Calculate base bet amount using Kelly Criterion
	// IMPORTANT: Analyzer always puts Pinnacle as First bookmaker
	// We pass REAL ROI from analyzer (not config edge)
	calcBet := l.calculateBet(keyMatch, pair.Outcome.Score1.Value, pair.Outcome.ROI)

	// STEP 2: Track users betting on this match
	// If multiple users want to bet on same match, we split the bet amount
	// Example: 100$ bet + 3 users = 33.33$ per user
	// This prevents over-exposure on single match
	l.usersCache.Lock()
	_, ok := l.usersCache.data[keyMatch]
	if !ok {
		l.usersCache.data[keyMatch] = make(map[string]entity.UserIDCache)
	}
	l.usersCache.data[keyMatch][userID] = entity.UserIDCache{UserID: userID, CreatedAt: time.Now().UTC()} // Always use UTC

	usersCount := len(l.usersCache.data[keyMatch])

	l.usersCache.Unlock()

	// STEP 3: Split bet amount between users
	calcBet.AdjustedAmount = calcBet.AdjustedAmount / float64(usersCount)

	return calcBet, usersCount
}

// calculateBet performs bet calculation in two stages:
// 1. Kelly Criterion calculation (getBetSize)
// 2. Bankroll adjustment (calculateAdjustedBetSize)
//
// Note: User splitting happens AFTER this in CalcSumBet
func (l *LogsService) calculateBet(keyMatch string, odds float64, realROI float64) entity.CalculatedBet {
	// STAGE 1: Calculate raw bet size using Kelly Criterion with REAL ROI from analyzer
	originalAmount := l.getBetSize(odds, realROI)

	// STAGE 2: Adjust for money already committed to this match
	// Example: Kelly says bet 100$, but we already bet 70$ on this match
	//          → adjusted amount = 30$ (remaining 30% of original)
	adjustedAmount := l.calculateAdjustedBetSize(keyMatch, originalAmount)

	// Calculate remaining percentage for diagnostics
	// Shows what % of Kelly bet is actually available to bet
	// 100% = no previous bets on this match
	// 30% = already bet 70% of Kelly amount on this match
	// 0% = hit betting limit for this match
	percentage := 100.0
	if originalAmount > 0 {
		percentage = (adjustedAmount / originalAmount) * 100
		if percentage < 0 {
			percentage = 0
		} else if percentage > 100 {
			percentage = 100
		}
	} else {
		percentage = 0
	}

	return entity.CalculatedBet{
		OriginalAmount: originalAmount,
		AdjustedAmount: adjustedAmount,
		Percentage:     percentage,
	}
}

// getBetSize рассчитывает оптимальный размер ставки на основе критерия Келли
// Теперь использует РЕАЛЬНЫЙ ROI из analyzer вместо фиксированного edge из конфига
func (l *LogsService) getBetSize(odds float64, realROI float64) float64 {
	// Используем реальный ROI из analyzer как edge
	// Ограничиваем максимум 8% для безопасности
	edge := realROI
	if edge > 8.0 {
		edge = 8.0
	}

	// Минимальный порог (для тестового режима можно использовать конфиг)
	if l.config.TestingMode.Enabled {
		configEdge := l.config.TestingMode.Edge
		if configEdge > edge {
			edge = configEdge // В тестовом режиме можем использовать больший edge
		}
	}

	if edge < 0 {
		return 0
	}

	// Преобразуем edge из процентов в десятичную дробь
	edgeDecimal := edge / 100

	// Рассчитываем фактор внутри логарифма
	logFactor := 1 - (1 / (odds / (1 + edgeDecimal)))
	if math.IsNaN(logFactor) || math.IsInf(logFactor, 0) || logFactor <= 0 {
		return 0
	}

	// Рассчитываем процент от банкролла для ставки
	betSizePercent := math.Log10(logFactor) / math.Log10(math.Pow(10, -l.config.KellyCriterion.DefaultRisk))
	if math.IsNaN(betSizePercent) || math.IsInf(betSizePercent, 0) {
		return 0
	}

	// Проверяем, что результат имеет смысл
	if betSizePercent < 0 || betSizePercent > 1 {
		return 0
	}

	// Проверяем максимальный процент ставки
	maxBetPercent := l.config.KellyCriterion.MaxBetPercent / 100
	if betSizePercent > maxBetPercent {
		betSizePercent = maxBetPercent
	}

	// Рассчитываем фактический размер ставки
	betSize := betSizePercent * l.config.KellyCriterion.DefaultBank

	// Округляем до ближайшего числа, кратного 5
	roundedBetSize := math.Round(betSize/5) * 5

	return roundedBetSize
}

func (l *LogsService) calculateAdjustedBetSize(keyMatch string, baseBetSize float64) float64 {
	// Получаем процент уже поставленных денег на матч
	totalBetPercent, ok := l.percentCache.Read(keyMatch)
	if !ok {
		totalBetPercent.TotalPercent = 0
	}

	// Вычисляем оставшийся процент от базовой суммы ставки
	remainingPercentage := 100.0
	if baseBetSize > 0 {
		remainingPercentage -= totalBetPercent.TotalPercent
		if remainingPercentage < 0 {
			remainingPercentage = 0
		} else if remainingPercentage > 100.0 {
			remainingPercentage = 100.0
		}
	}

	// Корректируем размер ставки
	adjustedBetSize := baseBetSize * remainingPercentage / 100.0

	// Округляем до ближайшего числа, кратного 5
	adjustedBetSize = math.Round(adjustedBetSize/5) * 5

	return adjustedBetSize
}

// createBetFile создает CSV файл для реальных ставок (autobetting/фронт).
// Формат: Section,Time,Price с двумя ценами (First.Score, Second.Score)
// Этот формат должен быть идентичен тестовым сигналам из analyzer.
// Формат HighBookmaker/BaseBookmaker используется только в группах (group_capture).
func (l *LogsService) createBetFile(name string, records entity.ResponsePriceRecords, isTest bool) error {
	// Запоминаем ВРЕМЯ ставки ДО сортировки (не структуру!)
	if records.ISave < 0 || records.ISave >= len(records.Records) {
		return fmt.Errorf("invalid ISave index: %d, records length: %d", records.ISave, len(records.Records))
	}
	betTime := records.Records[records.ISave].CreatedAt

	// Сортировка по времени (от старых к новым)
	sort.Slice(records.Records, func(i, j int) bool {
		return records.Records[i].CreatedAt.Before(records.Records[j].CreatedAt)
	})

	// Ищем ISave по ВРЕМЕНИ (не по сравнению структур!)
	newISave := 0
	found := false
	for i, record := range records.Records {
		if record.CreatedAt.Equal(betTime) {
			newISave = i
			found = true
			break
		}
	}

	// ============================================================================
	// ДИАГНОСТИКА (временная): Проверяем почему Before Bet может быть пустым
	// ============================================================================
	// Причины:
	// 1. Analyzer не нашел время ставки после пересортировки (betTime не найден)
	// 2. ISave указывает на первую запись (newISave=0) - нет данных до ставки
	// 3. Ставка произошла слишком быстро после начала отслеживания матча
	// ============================================================================
	if !found {
		l.logger.Warn().
			Time("betTime", betTime).
			Int("records_length", len(records.Records)).
			Int("original_iSave", records.ISave).
			Str("first_record_time", records.Records[0].CreatedAt.Format(time.RFC3339)).
			Str("last_record_time", records.Records[len(records.Records)-1].CreatedAt.Format(time.RFC3339)).
			Msgf("[createBetFile] WARNING: Bet time not found in records after sorting! newISave defaulted to 0")
	}

	beforePrices := records.Records[:newISave]
	afterPrices := records.Records[newISave:]

	// ДИАГНОСТИКА: Логируем размеры
	l.logger.Info().
		Int("total_records", len(records.Records)).
		Int("newISave", newISave).
		Int("beforePrices_count", len(beforePrices)).
		Int("afterPrices_count", len(afterPrices)).
		Str("name", name).
		Msgf("[createBetFile] CSV generation stats")

	// ДИАГНОСТИКА: Сохраняем в файл для анализа пользователем
	// Это позволит увидеть что именно получил Calculator от Analyzer
	// Файл создается рядом с CSV: название_ставки_diagnostic.log
	if err := l.saveDiagnosticLog(name, records, betTime, newISave, found, beforePrices, afterPrices, isTest); err != nil {
		l.logger.Warn().Err(err).Msgf("[createBetFile] Failed to save diagnostic log (non-critical)")
	}

	// OPTIMIZED: Use string builder pool for CSV construction
	// TEST: Verify CSV format remains identical
	csvBuilder := utils.GetStringBuilder()
	defer utils.PutStringBuilder(csvBuilder)

	// Preallocate buffer estimate: ~80 bytes per record
	estimatedSize := len(beforePrices)*80 + len(afterPrices)*80 + 200
	csvBuilder.Grow(estimatedSize)

	// Порог устаревания цены букмекера (3.5 сек)
	const staleThreshold = 3500 * time.Millisecond

	// Добавляем "До ставки" цены
	if len(beforePrices) > 0 {
		csvBuilder.WriteString("Before Bet\n")
		csvBuilder.WriteString("First_Time,First_Price,Second_Time,Second_Price,Section\n") // Заголовок с 5 колонками
		for _, price := range beforePrices {
			// ИЗМЕНЕНО 2024-12-07: Используем реальное время обновления каждого букмекера
			// ИСПРАВЛЕНО 2024-12-08: N/A показываем для того букмекера, который устарел
			firstTime := price.First.CreatedAt
			secondTime := price.Second.CreatedAt

			// Проверяем разницу между обновлениями
			timeDiff := firstTime.Sub(secondTime)

			if timeDiff > staleThreshold {
				// First (Pinnacle) свежее, Second (донор) устарел - N/A для Second
				csvBuilder.WriteString(fmt.Sprintf("%s,%.2f,%s,N/A,Before Bet\n",
					firstTime.Format(time.RFC3339), price.First.Score,
					secondTime.Format(time.RFC3339)))
			} else if timeDiff < -staleThreshold {
				// Second (донор) свежее, First (Pinnacle) устарел - N/A для First
				csvBuilder.WriteString(fmt.Sprintf("%s,N/A,%s,%.2f,Before Bet\n",
					firstTime.Format(time.RFC3339),
					secondTime.Format(time.RFC3339), price.Second.Score))
			} else {
				// Оба свежие - показываем обе цены
				csvBuilder.WriteString(fmt.Sprintf("%s,%.2f,%s,%.2f,Before Bet\n",
					firstTime.Format(time.RFC3339), price.First.Score,
					secondTime.Format(time.RFC3339), price.Second.Score))
			}
		}
	} else {
		csvBuilder.WriteString("Before Bet\n")
		csvBuilder.WriteString("First_Time,First_Price,Second_Time,Second_Price,Section\n")
		csvBuilder.WriteString("No prices found\n")
	}

	// Добавляем "После ставки" цены
	if len(afterPrices) > 0 {
		csvBuilder.WriteString("After Bet\n")
		csvBuilder.WriteString("First_Time,First_Price,Second_Time,Second_Price,Section\n") // Заголовок с 5 колонками
		for _, price := range afterPrices {
			// ИЗМЕНЕНО 2024-12-07: Используем реальное время обновления каждого букмекера
			// ИСПРАВЛЕНО 2024-12-08: N/A показываем для того букмекера, который устарел
			firstTime := price.First.CreatedAt
			secondTime := price.Second.CreatedAt

			// Проверяем разницу между обновлениями
			timeDiff := firstTime.Sub(secondTime)

			if timeDiff > staleThreshold {
				// First (Pinnacle) свежее, Second (донор) устарел - N/A для Second
				csvBuilder.WriteString(fmt.Sprintf("%s,%.2f,%s,N/A,After Bet\n",
					firstTime.Format(time.RFC3339), price.First.Score,
					secondTime.Format(time.RFC3339)))
			} else if timeDiff < -staleThreshold {
				// Second (донор) свежее, First (Pinnacle) устарел - N/A для First
				csvBuilder.WriteString(fmt.Sprintf("%s,N/A,%s,%.2f,After Bet\n",
					firstTime.Format(time.RFC3339),
					secondTime.Format(time.RFC3339), price.Second.Score))
			} else {
				// Оба свежие - показываем обе цены
				csvBuilder.WriteString(fmt.Sprintf("%s,%.2f,%s,%.2f,After Bet\n",
					firstTime.Format(time.RFC3339), price.First.Score,
					secondTime.Format(time.RFC3339), price.Second.Score))
			}
		}
	} else {
		csvBuilder.WriteString("After Bet\n")
		csvBuilder.WriteString("First_Time,First_Price,Second_Time,Second_Price,Section\n")
		csvBuilder.WriteString("No prices found\n")
	}

	// Определяем директорию и имя файла (используем смонтированный том /logs)
	var dir string
	if isTest {
		dir = "/logs/testbets"
	} else {
		dir = "/logs/bets/captures"
	}

	// Создаем директорию, если она отсутствует
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("[HISTORY] Ошибка создания директории %s: %v", dir, err)
		return err
	}

	fileName := fmt.Sprintf("%s/%s.csv", dir, name)

	if err := os.WriteFile(fileName, []byte(csvBuilder.String()), 0644); err != nil {
		log.Printf("[HISTORY] Ошибка записи файла %s: %v", fileName, err)
		return err
	}

	return nil
}

// ============================================================================
// ДИАГНОСТИЧЕСКАЯ ФУНКЦИЯ (временная, для отладки проблемы "No prices found")
// ============================================================================
// Сохраняет подробную информацию о том, что получил Calculator от Analyzer
// и почему секция "Before Bet" может быть пустой.
//
// Файл сохраняется рядом с CSV: название_ставки_diagnostic.log
//
// Причины пустой секции "Before Bet":
// 1. Analyzer вернул данные только ПОСЛЕ момента ставки (ISave указывает на первую запись)
// 2. Время ставки не найдено после пересортировки (newISave остался 0 по умолчанию)
// 3. Ставка произошла слишком быстро после начала отслеживания матча
//
// После исправления проблемы эту функцию можно удалить
// ============================================================================
func (l *LogsService) saveDiagnosticLog(
	name string,
	records entity.ResponsePriceRecords,
	betTime time.Time,
	newISave int,
	found bool,
	beforePrices []entity.PriceRecord,
	afterPrices []entity.PriceRecord,
	isTest bool,
) error {
	// FIX 3.2: Use same path as createBetFile (/logs, not ./logs)
	var dirPath string
	if isTest {
		dirPath = "/logs/testbets"
	} else {
		dirPath = "/logs/bets/captures"
	}

	// Создаем имя файла: название_ставки_diagnostic.log
	fileName := fmt.Sprintf("%s/%s_diagnostic.log", dirPath, name)

	// Формируем содержимое файла с подробной информацией
	var content strings.Builder
	content.WriteString("=" + strings.Repeat("=", 79) + "\n")
	content.WriteString("DIAGNOSTIC LOG: Why 'Before Bet' section might be empty\n")
	content.WriteString("=" + strings.Repeat("=", 79) + "\n\n")

	content.WriteString(fmt.Sprintf("Bet Name: %s\n", name))
	content.WriteString(fmt.Sprintf("Generated: %s\n\n", time.Now().Format(time.RFC3339)))

	content.WriteString("--- DATA RECEIVED FROM ANALYZER ---\n")
	content.WriteString(fmt.Sprintf("Total records from Analyzer: %d\n", len(records.Records)))
	content.WriteString(fmt.Sprintf("Original ISave from Analyzer: %d\n", records.ISave))
	content.WriteString(fmt.Sprintf("Bet time (from ISave): %s\n\n", betTime.Format(time.RFC3339)))

	if len(records.Records) > 0 {
		content.WriteString(fmt.Sprintf("First record time (oldest after sorting): %s\n", records.Records[0].CreatedAt.Format(time.RFC3339)))
		content.WriteString(fmt.Sprintf("Last record time (newest after sorting): %s\n\n", records.Records[len(records.Records)-1].CreatedAt.Format(time.RFC3339)))
	}

	content.WriteString("--- AFTER CALCULATOR PROCESSING ---\n")
	content.WriteString(fmt.Sprintf("Bet time found after re-sorting: %v\n", found))
	content.WriteString(fmt.Sprintf("New ISave position: %d\n", newISave))
	content.WriteString(fmt.Sprintf("Before Bet records count: %d\n", len(beforePrices)))
	content.WriteString(fmt.Sprintf("After Bet records count: %d\n\n", len(afterPrices)))

	content.WriteString("--- ANALYSIS ---\n")
	if len(beforePrices) == 0 {
		content.WriteString("❌ PROBLEM DETECTED: Before Bet is EMPTY!\n\n")
		content.WriteString("Possible reasons:\n")

		if !found {
			content.WriteString("1. ⚠️  Bet time NOT FOUND after re-sorting\n")
			content.WriteString("   → newISave defaulted to 0\n")
			content.WriteString("   → All records treated as 'After Bet'\n\n")
		}

		if records.ISave >= len(records.Records)-1 {
			content.WriteString("2. ⚠️  Original ISave points to LAST record\n")
			content.WriteString("   → Analyzer has NO data BEFORE bet time\n")
			content.WriteString("   → Bet was placed too soon after match tracking started\n\n")
		}

		if newISave == 0 {
			content.WriteString("3. ⚠️  newISave = 0 (bet time is FIRST record)\n")
			content.WriteString("   → No records exist before bet time\n")
			content.WriteString("   → Storage had no historical data\n\n")
		}
	} else {
		content.WriteString(fmt.Sprintf("✅ Before Bet section has data (%d records)\n", len(beforePrices)))
	}

	content.WriteString("\n--- ALL RECORDS (sorted old to new) ---\n")
	for i, record := range records.Records {
		marker := "  "
		if i == newISave {
			marker = "→ " // Указатель на момент ставки
		}
		content.WriteString(fmt.Sprintf("%s[%d] %s: First=%.2f, Second=%.2f\n",
			marker, i, record.CreatedAt.Format("15:04:05"), record.First.Score, record.Second.Score))
	}

	content.WriteString("\n" + strings.Repeat("=", 80) + "\n")

	// Записываем в файл
	if err := os.WriteFile(fileName, []byte(content.String()), 0644); err != nil {
		return fmt.Errorf("failed to write diagnostic log: %w", err)
	}

	l.logger.Info().Str("file", fileName).Msgf("[saveDiagnosticLog] Diagnostic file saved successfully")
	return nil
}

// CaptureClosingLine captures Pinnacle price at 5min and 1min before match kickoff (CLV).
// Runs as background goroutine for each prematch bet.
func (l *LogsService) CaptureClosingLine(ctx context.Context, pairAccept entity.AcceptBet, matchStartTime time.Time, keyOutcome string, betCreatedAt time.Time) {
	if pairAccept.Pair.IsLive {
		return
	}
	if matchStartTime.IsZero() {
		return
	}

	logger := l.logger.With().
		Str("keyOutcome", keyOutcome).
		Time("matchStart", matchStartTime).
		Logger()

	var coefPinnacle5min, roi5min *float64

	// 5min before capture
	capture5min := matchStartTime.Add(-5 * time.Minute)
	now := time.Now()
	if capture5min.After(now) {
		timer := time.NewTimer(capture5min.Sub(now))
		select {
		case <-timer.C:
		case <-ctx.Done():
			timer.Stop()
			logger.Info().Msg("[ClosingLine] Context cancelled, aborting CLV capture")
			return
		}

		coef, roiVal := l.fetchCurrentPinnaclePrice(pairAccept, &logger)
		if coef != nil {
			coefPinnacle5min = coef
			roi5min = roiVal
			logger.Info().Float64("pinnacle", *coef).Float64("roi", *roiVal).Msg("[ClosingLine] Captured 5min-before")

			// Save 5min result immediately
			dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			if err := l.txStorage.Storage().UpdateBetCLV(dbCtx, keyOutcome, betCreatedAt, coefPinnacle5min, roi5min, nil, nil); err != nil {
				logger.Error().Err(err).Msg("[ClosingLine] Failed to save 5min CLV")
			}
			cancel()
		}
	}

	// 1min before capture
	capture1min := matchStartTime.Add(-1 * time.Minute)
	now = time.Now()
	if capture1min.After(now) {
		timer := time.NewTimer(capture1min.Sub(now))
		select {
		case <-timer.C:
		case <-ctx.Done():
			timer.Stop()
			logger.Info().Msg("[ClosingLine] Context cancelled, aborting 1min CLV capture")
			return
		}

		coef, roiVal := l.fetchCurrentPinnaclePrice(pairAccept, &logger)
		if coef != nil {
			logger.Info().Float64("pinnacle", *coef).Float64("roi", *roiVal).Msg("[ClosingLine] Captured 1min-before")

			dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			if err := l.txStorage.Storage().UpdateBetCLV(dbCtx, keyOutcome, betCreatedAt, nil, nil, coef, roiVal); err != nil {
				logger.Error().Err(err).Msg("[ClosingLine] Failed to save 1min CLV")
			}
			cancel()
		}
	}
}

func (l *LogsService) VerifyPinnaclePrice(bookmaker1, bookmaker2, matchID1, matchID2, sportName, outcome string, isLive bool) (*entity.PriceRecord, error) {
	request := entity.RequestPriceRecordsByTime{
		Bookmaker1: bookmaker1,
		Bookmaker2: bookmaker2,
		MatchID1:   matchID1,
		MatchID2:   matchID2,
		SportName:  sportName,
		Outcome:    outcome,
		Minutes:    0,
		Seconds:    0,
		LongTime:   30,
	}

	var (
		priceRecords *entity.ResponsePriceRecords
		err          error
	)

	if isLive {
		priceRecords, err = l.analyzerAPI.GeTPricesByTimeout(request)
	} else {
		priceRecords, err = l.analyzerPrematchAPI.GeTPricesByTimeout(request)
	}
	if err != nil {
		return nil, err
	}
	if priceRecords == nil || len(priceRecords.Records) == 0 {
		return nil, nil
	}

	latest := priceRecords.Records[len(priceRecords.Records)-1]
	return &latest, nil
}

// fetchCurrentPinnaclePrice gets current Pinnacle price for the bet's outcome from prematch analyzer.
func (l *LogsService) fetchCurrentPinnaclePrice(pairAccept entity.AcceptBet, logger *zerolog.Logger) (*float64, *float64) {
	priceRecords, err := l.analyzerPrematchAPI.GeTPricesByTimeout(entity.RequestPriceRecordsByTime{
		Bookmaker1: pairAccept.Pair.First.Bookmaker,
		Bookmaker2: pairAccept.Pair.Second.Bookmaker,
		MatchID1:   pairAccept.Pair.First.MatchID,
		MatchID2:   pairAccept.Pair.Second.MatchID,
		SportName:  pairAccept.Pair.SportName,
		Outcome:    pairAccept.Pair.Outcome.Outcome,
		Minutes:    0,
		Seconds:    0,
		LongTime:   30,
	})
	if err != nil {
		logger.Warn().Err(err).Msg("[ClosingLine] Failed to fetch prices from prematch analyzer")
		return nil, nil
	}
	if priceRecords == nil || len(priceRecords.Records) == 0 {
		logger.Warn().Msg("[ClosingLine] No price records returned")
		return nil, nil
	}

	// Take the latest record
	latest := priceRecords.Records[len(priceRecords.Records)-1]
	pinnaclePrice := latest.First.Score
	if pinnaclePrice <= 0 {
		return nil, nil
	}

	// Calculate ROI with same formula used for roi_1min
	roiCalc := roi.NewCalculator()
	roiVal := roiCalc.Calculate(
		pairAccept.Coef,
		pinnaclePrice,
		latest.Margin,
		roi.MarketType(pairAccept.Pair.Outcome.MarketType),
		domain.Parser(pairAccept.Pair.Second.Bookmaker),
		domain.SportName(pairAccept.Pair.SportName),
		pairAccept.Pair.IsLive,
	)

	return &pinnaclePrice, &roiVal
}

// RecoverPendingCLV restarts CLV capture goroutines for bets whose matches haven't started yet.
func (l *LogsService) RecoverPendingCLV(ctx context.Context) {
	bets, err := l.txStorage.Storage().GetPendingCLVBets(ctx)
	if err != nil {
		l.logger.Error().Err(err).Msg("[ClosingLine] Failed to load pending CLV bets for recovery")
		return
	}
	if len(bets) == 0 {
		l.logger.Info().Msg("[ClosingLine] No pending CLV bets to recover")
		return
	}

	recovered := 0
	for _, bet := range bets {
		var pairAccept entity.AcceptBet
		if err := json.Unmarshal(bet.Data, &pairAccept); err != nil {
			l.logger.Warn().Err(err).Str("keyOutcome", bet.KeyOutcome).Msg("[ClosingLine] Failed to unmarshal bet data for recovery")
			continue
		}
		go l.CaptureClosingLine(ctx, pairAccept, bet.MatchStartTime, bet.KeyOutcome, bet.BetCreatedAt)
		recovered++
	}
	l.logger.Info().Int("count", recovered).Msg("[ClosingLine] Recovered pending CLV capture goroutines")
}
