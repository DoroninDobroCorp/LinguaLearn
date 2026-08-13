package handler

import (
	"fmt"
	"livebets/calculator/internal/entity"
	"livebets/calculator/pkg/utils"
	"livebets/calculator/pkg/validation"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type ReqCalcBet struct {
	UserID string                `json:"userId" validate:"required,min=1"`
	Pair   entity.PairOneOutcome `json:"pair" validate:"required"`
}

const retiredTestBetFlowError = "test bet flow has been retired"

func rejectRetiredTestBet(c *gin.Context, route string) {
	log.Printf("[%s] rejected retired test-bet flow", route)
	c.JSON(http.StatusGone, gin.H{"error": retiredTestBetFlowError})
}

type ResCalcBet struct {
	UsersCount int                  `json:"usersCount"`
	CalcBet    entity.CalculatedBet `json:"calcBet"`
}

type ReqRollbackCalcBet struct {
	UserID   string  `json:"userId" validate:"required"`
	KeyMatch string  `json:"keyMatch" validate:"required"`
	Percent  float64 `json:"percent" validate:"required,gt=0"`
	IsLive   bool    `json:"isLive"`
}

func (h *Handler) LogBetAccept(c *gin.Context) {
	var input entity.AcceptBet

	if err := c.BindJSON(&input); err != nil {
		log.Printf("[Handler.LogBetAccept] bind json error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON format"})
		return
	}

	// FAIL_ strategies (failed bet attempts) — set defaults for Sum/Coef to pass validation
	// These values won't reach DB (skipped in service layer), only used for CSV generation
	isFail := strings.HasPrefix(input.Strategy, "FAIL_")
	if isFail {
		if input.Sum <= 0 {
			input.Sum = 1
		}
		if input.Coef < 1.0 {
			input.Coef = 1.01
		}
	}

	// Validate input
	validator := validation.New()
	if err := validator.Validate(input); err != nil {
		log.Printf("[Handler.LogBetAccept] validation error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Additional business rule validation
	if input.Sum <= 0 {
		log.Printf("[Handler.LogBetAccept] invalid sum: %.2f", input.Sum)
		c.JSON(http.StatusBadRequest, gin.H{"error": "sum must be positive"})
		return
	}

	if input.Coef < 1.0 {
		log.Printf("[Handler.LogBetAccept] invalid coef: %.3f", input.Coef)
		c.JSON(http.StatusBadRequest, gin.H{"error": "coefficient must be at least 1.0"})
		return
	}

	if input.IsTest {
		rejectRetiredTestBet(c, "Handler.LogBetAccept")
		return
	}

	log.Printf("[Handler.LogBetAccept] payload: userId=%d, sport=%s, isLive=%t, sum=%.2f, coef=%.3f, time=%s, first={bk:%s match:%s} second={bk:%s match:%s} outcome=%s",
		input.UserId, input.Pair.SportName, input.Pair.IsLive, input.Sum, input.Coef, input.Time,
		input.Pair.First.Bookmaker, input.Pair.First.MatchID, input.Pair.Second.Bookmaker, input.Pair.Second.MatchID, input.Pair.Outcome.Outcome,
	)

	// Log stale data warning but NEVER reject — bet is already placed, CSV must be generated
	if reason := checkPriceFreshness(input.Pair); reason != "" {
		log.Printf("[Handler.LogBetAccept] STALE DATA WARNING (bet already placed, recording anyway): %s", reason)
	}

	if err := h.logsService.LogBetAccept(c, input); err != nil {
		log.Printf("[Handler.LogBetAccept] service error: %v", err)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	log.Printf("[Handler.LogBetAccept] OK")
	c.Status(http.StatusOK)
}

const (
	liveMaxPriceAge                  = 5 * time.Second
	defaultPrematchMaxPriceAge       = 90 * time.Second
	prematchMaxPriceAgeSecondsEnvKey = "CALCULATOR_PREMATCH_MAX_PRICE_AGE_SECONDS"
)

// maxPriceAge returns the maximum allowed age for price data before betting.
// Live keeps its strict 5-second limit. Prematch defaults to 90 seconds and can
// be tightened or adjusted with CALCULATOR_PREMATCH_MAX_PRICE_AGE_SECONDS.
// Missing, zero, negative, and malformed values fail back to the safe default.
func maxPriceAge(isLive bool) time.Duration {
	if isLive {
		return liveMaxPriceAge
	}

	rawSeconds := strings.TrimSpace(os.Getenv(prematchMaxPriceAgeSecondsEnvKey))
	seconds, err := strconv.ParseUint(rawSeconds, 10, 31)
	if err != nil || seconds == 0 {
		return defaultPrematchMaxPriceAge
	}
	return time.Duration(seconds) * time.Second
}

// checkPriceFreshness validates that both sides of a pair have fresh prices.
// Returns error string if stale, empty string if OK.
func checkPriceFreshness(pair entity.PairOneOutcome) string {
	return checkPriceFreshnessAt(pair, time.Now())
}

func checkPriceFreshnessAt(pair entity.PairOneOutcome, now time.Time) string {
	maxAge := maxPriceAge(pair.IsLive)

	if pair.First.CreatedAt.IsZero() || pair.Second.CreatedAt.IsZero() {
		return fmt.Sprintf("missing CreatedAt (first=%v, second=%v)", pair.First.CreatedAt, pair.Second.CreatedAt)
	}

	firstAge := now.Sub(pair.First.CreatedAt)
	secondAge := now.Sub(pair.Second.CreatedAt)

	if firstAge > maxAge {
		return fmt.Sprintf("first side too old: %v > %v (%s)", firstAge.Round(time.Millisecond), maxAge, pair.First.Bookmaker)
	}
	if secondAge > maxAge {
		return fmt.Sprintf("second side too old: %v > %v (%s)", secondAge.Round(time.Millisecond), maxAge, pair.Second.Bookmaker)
	}
	// Per-outcome freshness: OutcomeAge is set by analyzer from outcomeLastSeen timestamps.
	// Live: reject if outcome data is older than 15s. Specials (BTTS, DC, CS, 3WH)
	// refresh every ~11s via PS3838 MORE_BET. Base markets refresh every ~1s (per-event FO).
	// Match-level CreatedAt check above (5s) still catches stale base data.
	if pair.IsLive && pair.Outcome.OutcomeAge > 15.0 {
		return fmt.Sprintf("outcome too old: %.1fs > 15s (%s)", pair.Outcome.OutcomeAge, pair.Outcome.Outcome)
	}
	return ""
}

func (h *Handler) GetCalcBet(c *gin.Context) {
	var input ReqCalcBet

	if err := c.BindJSON(&input); err != nil {
		log.Printf("[Handler.GetCalcBet] bind json error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON format"})
		return
	}

	// Validate input
	validator := validation.New()
	if err := validator.Validate(input); err != nil {
		log.Printf("[Handler.GetCalcBet] validation error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// CRITICAL: Reject stale prices before calculating bet
	if reason := checkPriceFreshness(input.Pair); reason != "" {
		log.Printf("[Handler.GetCalcBet] STALE DATA REJECTED: %s", reason)
		c.JSON(http.StatusOK, &ResCalcBet{
			UsersCount: 0,
			CalcBet:    entity.CalculatedBet{},
		})
		return
	}

	calcBet, usersCount := h.logsService.CalcSumBet(c, input.UserID, input.Pair)

	// Min bet filter: don't send to user if calculated bet is too small
	minBet := h.logsService.GetMinBetAmount()
	if calcBet.AdjustedAmount < minBet {
		log.Printf("[Handler.GetCalcBet] bet too small: %.2f < %.2f (min), not sending to user",
			calcBet.AdjustedAmount, minBet)
		// FIX 1.2: Rollback usersCache entry — user was added in CalcSumBet but bet is rejected
		keyMatch := utils.GenerateFullMatchKey(input.Pair.First.Bookmaker, input.Pair.First.LeagueName, input.Pair.First.HomeName, input.Pair.First.AwayName, input.Pair.SportName, "")
		_ = h.logsService.RollbackCalcBet(c, keyMatch, input.UserID, 0, input.Pair.IsLive)
		c.JSON(http.StatusOK, &ResCalcBet{
			UsersCount: 0,
			CalcBet:    entity.CalculatedBet{}, // Empty bet = skip
		})
		return
	}

	c.JSON(http.StatusOK, &ResCalcBet{
		UsersCount: usersCount,
		CalcBet:    calcBet,
	})
}

func (h *Handler) LogTestBetAccept(c *gin.Context) {
	var input entity.AcceptBet

	if err := c.BindJSON(&input); err != nil {
		log.Printf("[Handler.LogTestBetAccept] bind json error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON format"})
		return
	}

	rejectRetiredTestBet(c, "Handler.LogTestBetAccept")
}

func (h *Handler) RollbackCalcBet(c *gin.Context) {
	var input ReqRollbackCalcBet

	if err := c.BindJSON(&input); err != nil {
		log.Printf("[Handler.RollbackCalcBet] bind json error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON format"})
		return
	}

	// Validate input
	validator := validation.New()
	if err := validator.Validate(input); err != nil {
		log.Printf("[Handler.RollbackCalcBet] validation error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[Handler.RollbackCalcBet] payload: userId=%s, keyMatch=%s, percent=%.2f, isLive=%t",
		input.UserID, input.KeyMatch, input.Percent, input.IsLive)

	if err := h.logsService.RollbackCalcBet(c, input.KeyMatch, input.UserID, input.Percent, input.IsLive); err != nil {
		log.Printf("[Handler.RollbackCalcBet] service error: %v", err)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	log.Printf("[Handler.RollbackCalcBet] OK")
	c.JSON(http.StatusOK, gin.H{"status": "rollback completed"})
}

type ReqCheckStrategyLimit struct {
	KeyMatch string `json:"keyMatch"` // Optional: direct keyMatch
	Strategy string `json:"strategy" validate:"required"`
	// Alternative: provide pair data and we'll generate keyMatch
	Bookmaker  string `json:"bookmaker"`
	LeagueName string `json:"leagueName"`
	HomeName   string `json:"homeName"`
	AwayName   string `json:"awayName"`
	SportName  string `json:"sportName"`
}

type ResCheckStrategyLimit struct {
	Allowed  bool   `json:"allowed"`
	KeyMatch string `json:"keyMatch"`
	Strategy string `json:"strategy"`
}

// ReqCheckBettingLimits - request for comprehensive limit check
type ReqCheckBettingLimits struct {
	KeyMatch    string  `json:"keyMatch"`
	Bookmaker   string  `json:"bookmaker"`
	Strategy    string  `json:"strategy"`
	Odds        float64 `json:"odds"`
	ExpectedROI float64 `json:"expectedROI"`
	// Alternative: provide pair data and we'll generate keyMatch
	LeagueName string `json:"leagueName"`
	HomeName   string `json:"homeName"`
	AwayName   string `json:"awayName"`
	SportName  string `json:"sportName"`
	// Safe opposite: candidate outcome to check
	Outcome string `json:"outcome"`
}

func (h *Handler) CheckStrategyLimit(c *gin.Context) {
	var input ReqCheckStrategyLimit

	if err := c.BindJSON(&input); err != nil {
		log.Printf("[Handler.CheckStrategyLimit] bind json error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON format"})
		return
	}

	// Validate input
	validator := validation.New()
	if err := validator.Validate(input); err != nil {
		log.Printf("[Handler.CheckStrategyLimit] validation error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Generate keyMatch from pair data if not provided directly
	keyMatch := input.KeyMatch
	if keyMatch == "" && input.Bookmaker != "" && input.HomeName != "" && input.AwayName != "" {
		keyMatch = utils.GenerateFullMatchKey(
			input.Bookmaker,
			input.LeagueName,
			input.HomeName,
			input.AwayName,
			input.SportName,
			"",
		)
		log.Printf("[Handler.CheckStrategyLimit] Generated keyMatch from pair data")
	}

	if keyMatch == "" {
		log.Printf("[Handler.CheckStrategyLimit] error: keyMatch is empty and no pair data provided")
		c.JSON(http.StatusBadRequest, gin.H{"error": "keyMatch or pair data (bookmaker, homeName, awayName) required"})
		return
	}

	log.Printf("[Handler.CheckStrategyLimit] payload: keyMatch=%s, strategy=%s", keyMatch, input.Strategy)

	allowed, err := h.logsService.CheckStrategyLimit(c, keyMatch, input.Strategy)
	if err != nil {
		log.Printf("[Handler.CheckStrategyLimit] service error: %v", err)
		// On error, allow bet (fail-open) - already handled in repository
	}

	log.Printf("[Handler.CheckStrategyLimit] OK: allowed=%v", allowed)
	c.JSON(http.StatusOK, &ResCheckStrategyLimit{
		Allowed:  allowed,
		KeyMatch: keyMatch,
		Strategy: input.Strategy,
	})
}

// CheckBettingLimits - comprehensive limit check (global + bookmaker + strategy)
// POST /check-betting-limits
func (h *Handler) CheckBettingLimits(c *gin.Context) {
	var input ReqCheckBettingLimits

	if err := c.BindJSON(&input); err != nil {
		log.Printf("[Handler.CheckBettingLimits] bind json error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON format"})
		return
	}

	// Bookmaker is required for bookmaker-level limit check
	if input.Bookmaker == "" {
		log.Printf("[Handler.CheckBettingLimits] error: bookmaker is required")
		c.JSON(http.StatusBadRequest, gin.H{"error": "bookmaker is required"})
		return
	}

	// Generate keyMatch from pair data if not provided directly
	// IMPORTANT: For global limits, we use Pinnacle as first bookmaker (always)
	// This ensures same keyMatch regardless of which donor bookmaker is used
	keyMatch := input.KeyMatch
	if keyMatch == "" && input.HomeName != "" && input.AwayName != "" {
		// DEBUG: Log raw input data BEFORE hashing for troubleshooting keyMatch mismatches
		log.Printf("[Handler.CheckBettingLimits] RAW INPUT: league='%s', home='%s', away='%s', sport='%s', bookmaker='%s'",
			input.LeagueName, input.HomeName, input.AwayName, input.SportName, input.Bookmaker)

		keyMatch = utils.GenerateFullMatchKey(
			"Pinnacle", // Always use Pinnacle as first bookmaker for global key
			input.LeagueName,
			input.HomeName,
			input.AwayName,
			input.SportName,
			"",
		)
		log.Printf("[Handler.CheckBettingLimits] Generated keyMatch=%s from pair data (Pinnacle-based)", keyMatch)
	}

	if keyMatch == "" {
		log.Printf("[Handler.CheckBettingLimits] error: keyMatch is empty and no pair data provided")
		c.JSON(http.StatusBadRequest, gin.H{"error": "keyMatch or pair data (homeName, awayName) required"})
		return
	}

	log.Printf("[Handler.CheckBettingLimits] LOOKUP: keyMatch=%s, bookmaker=%s, strategy=%s",
		keyMatch, input.Bookmaker, input.Strategy)

	result, err := h.logsService.CheckBettingLimits(c, keyMatch, input.Bookmaker, input.Strategy, input.Odds, input.ExpectedROI, input.Outcome, input.SportName)
	if err != nil {
		log.Printf("[Handler.CheckBettingLimits] service error: %v", err)
		// On error, return allowed=true (fail-open)
		c.JSON(http.StatusOK, &entity.LimitCheckResult{
			Allowed:   true,
			KeyMatch:  keyMatch,
			Bookmaker: input.Bookmaker,
			Strategy:  input.Strategy,
		})
		return
	}

	log.Printf("[Handler.CheckBettingLimits] OK: allowed=%v, reason=%s, globalPercent=%.2f, remainingPercent=%.2f, remainingAmount=%.2f",
		result.Allowed, result.Reason, result.GlobalPercentUsed, result.RemainingPercent, result.RemainingAmount)
	c.JSON(http.StatusOK, result)
}
