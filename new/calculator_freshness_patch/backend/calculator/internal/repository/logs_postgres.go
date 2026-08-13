package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"livebets/calculator/internal/entity"
	"livebets/calculator/pkg/rdbms"
	"time"

	"github.com/jackc/pgx/v5"
)

type LogsStorage interface {
	InsertLogBetAccept(ctx context.Context, keyMatch, keyOutcome string, pair entity.AcceptBet, priceRecord *entity.PriceRecord, percent float64, userId int, isLive bool, sport, bookmaker, strategy string) error
	GetInitializeCalcBet(ctx context.Context) (percents []entity.TotalPercentByKey, err error)
	InsertLogTestBetAccept(ctx context.Context, keyMatch, keyOutcome string, pair entity.AcceptBet, priceRecord *entity.PriceRecord, percent float64, strategy string) error
	UpdateBetROI1min(ctx context.Context, keyOutcome string, betTime time.Time, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec *float64) error
	UpdateTestBetROI1min(ctx context.Context, keyOutcome string, betTime time.Time, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec *float64) error
	CheckStrategyLimit(ctx context.Context, keyMatch, strategy string) (bool, error)
	// Global limits (new)
	CheckGlobalMatchLimit(ctx context.Context, keyMatch string) (float64, bool, error)
	CheckBookmakerMatchLimit(ctx context.Context, keyMatch, bookmaker string, maxBets int) (int, bool, error)
	// CLV (Closing Line Value)
	UpdateBetCLV(ctx context.Context, keyOutcome string, betTime time.Time, coefPinnacle5min, roi5min, coefPinnacle1min, roi1min *float64) error
	GetPendingCLVBets(ctx context.Context) ([]CLVPendingBet, error)
	// Safe opposite bets
	GetExistingBetsForMatch(ctx context.Context, keyMatch string) ([]ExistingBet, error)
}

// ExistingBet contains outcome and percent data for a previously accepted bet on a match
type ExistingBet struct {
	Outcome   string  `json:"outcome"`
	Percent   float64 `json:"percent"`
	SportName string  `json:"sportName"`
}

type LogsPGStorage struct {
	handler rdbms.Executor
}

func NewLogsPGStorage(handler rdbms.Executor) LogsStorage {
	return &LogsPGStorage{
		handler: handler,
	}
}

func (l *LogsPGStorage) InsertLogBetAccept(ctx context.Context, keyMatch, keyOutcome string, pair entity.AcceptBet, priceRecord *entity.PriceRecord, percent float64, userId int, isLive bool, sport, bookmaker, strategy string) error {
	// Default strategy if not provided
	if strategy == "" {
		strategy = "frontend"
	}

	// CLV: extract match_start_time from Pinnacle match (First = Pinnacle)
	var matchStartTime *time.Time
	if !pair.Pair.First.MatchDate.IsZero() {
		t := pair.Pair.First.MatchDate
		matchStartTime = &t
	}

	query := fmt.Sprintf(`
		INSERT INTO %s (key_match, key_outcome, data, correct_data, percent, user_id, is_live, sport, bookmaker, strategy, match_start_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, LogBetAccept)

	bytePair, err := json.Marshal(pair)
	if err != nil {
		return err
	}

	bytePriceRecord, err := json.Marshal(priceRecord)
	if err != nil {
		return err
	}

	if tag, err := l.handler.Exec(ctx, query, keyMatch, keyOutcome, bytePair, bytePriceRecord, percent, userId, isLive, sport, bookmaker, strategy, matchStartTime); err != nil {
		log.Printf("[Repository.InsertLogBetAccept] Exec error: %v", err)
		return err
	} else {
		log.Printf("[Repository.InsertLogBetAccept] Exec OK: keyMatch=%s keyOutcome=%s userId=%d isLive=%t sport=%s bookmaker=%s strategy=%s tag=%v", keyMatch, keyOutcome, userId, isLive, sport, bookmaker, strategy, tag)
	}

	return nil
}

func (l *LogsPGStorage) InsertLogTestBetAccept(ctx context.Context, keyMatch, keyOutcome string, pair entity.AcceptBet, priceRecord *entity.PriceRecord, percent float64, strategy string) error {
	// Default strategy if not provided
	if strategy == "" {
		strategy = "test"
	}

	// CLV: extract match_start_time from Pinnacle match (First = Pinnacle)
	var matchStartTime *time.Time
	if !pair.Pair.First.MatchDate.IsZero() {
		t := pair.Pair.First.MatchDate
		matchStartTime = &t
	}

	query := fmt.Sprintf(`
		INSERT INTO %s (key_match, key_outcome, data, correct_data, percent, strategy, match_start_time) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, LogTestBetAccept)

	bytePair, err := json.Marshal(pair)
	if err != nil {
		return err
	}

	bytePriceRecord, err := json.Marshal(priceRecord)
	if err != nil {
		return err
	}

	if tag, err := l.handler.Exec(ctx, query, keyMatch, keyOutcome, bytePair, bytePriceRecord, percent, strategy, matchStartTime); err != nil {
		log.Printf("[Repository.InsertLogTestBetAccept] Exec error: %v", err)
		return err
	} else {
		log.Printf("[Repository.InsertLogTestBetAccept] Exec OK: keyMatch=%s keyOutcome=%s strategy=%s tag=%v", keyMatch, keyOutcome, strategy, tag)
	}

	return nil
}

// CheckStrategyLimit checks if a bet with given strategy already exists for this match
// Returns true if limit NOT reached (can bet), false if limit reached (cannot bet)
func (l *LogsPGStorage) CheckStrategyLimit(ctx context.Context, keyMatch, strategy string) (bool, error) {
	query := fmt.Sprintf(`
		SELECT COUNT(*) FROM %s 
		WHERE key_match = $1 AND strategy = $2 
		AND created_at > NOW() - INTERVAL '72 hours'
	`, LogBetAccept)

	var count int
	err := l.handler.QueryRow(ctx, query, keyMatch, strategy).Scan(&count)
	if err != nil {
		log.Printf("[Repository.CheckStrategyLimit] Query error: %v", err)
		return true, err // On error, allow bet (fail-open)
	}

	// If count >= 1, limit reached (cannot bet)
	canBet := count < 1
	log.Printf("[Repository.CheckStrategyLimit] keyMatch=%s strategy=%s count=%d canBet=%v", keyMatch, strategy, count, canBet)
	return canBet, nil
}

func (l *LogsPGStorage) GetInitializeCalcBet(ctx context.Context) (percents []entity.TotalPercentByKey, err error) {
	query := fmt.Sprintf(`
		SELECT key_match, sum(percent) as totalPercent FROM %s 
		WHERE created_at >= NOW() - INTERVAL '72 HOURS'
		GROUP BY key_match
	`, LogBetAccept)

	rows, err := l.handler.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	defer rows.Close()

	for rows.Next() {
		var percent entity.TotalPercentByKey

		if err = rows.Scan(&percent.KeyMatch, &percent.TotalPercent); err != nil {
			return nil, err
		}

		percents = append(percents, percent)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return
}

// UpdateBetROI1min обновляет ROI через 1 минуту и 15 секунд для реальной ставки
// FIX 1.4: Added created_at filter to avoid updating ALL rows with same key_outcome
func (l *LogsPGStorage) UpdateBetROI1min(ctx context.Context, keyOutcome string, betTime time.Time, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec *float64) error {
	query := fmt.Sprintf(`
		UPDATE %s 
		SET roi_1min = $1,
		    coef_donor_original = $2,
		    coef_pinnacle_1min = $3,
		    ev_profit_1min = $4,
		    roi_15sec = $5,
		    coef_pinnacle_15sec = $6,
		    ev_profit_15sec = $7
		WHERE key_outcome = $8
		  AND created_at >= $9::timestamptz - INTERVAL '5 seconds'
		  AND created_at <= $9::timestamptz + INTERVAL '5 seconds'
	`, LogBetAccept)
	
	_, err := l.handler.Exec(ctx, query, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec, keyOutcome, betTime)
	return err
}

// UpdateTestBetROI1min обновляет ROI через 1 минуту и 15 секунд для тестовой ставки
// FIX 1.4: Added created_at filter to avoid updating ALL rows with same key_outcome
func (l *LogsPGStorage) UpdateTestBetROI1min(ctx context.Context, keyOutcome string, betTime time.Time, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec *float64) error {
	query := fmt.Sprintf(`
		UPDATE %s 
		SET roi_1min = $1,
		    coef_donor_original = $2,
		    coef_pinnacle_1min = $3,
		    ev_profit_1min = $4,
		    roi_15sec = $5,
		    coef_pinnacle_15sec = $6,
		    ev_profit_15sec = $7
		WHERE key_outcome = $8
		  AND created_at >= $9::timestamptz - INTERVAL '5 seconds'
		  AND created_at <= $9::timestamptz + INTERVAL '5 seconds'
	`, LogTestBetAccept)
	
	_, err := l.handler.Exec(ctx, query, roi1min, coefDonorOriginal, coefPinnacle1min, evProfit1min, roi15sec, coefPinnacle15sec, evProfit15sec, keyOutcome, betTime)
	return err
}

// CheckGlobalMatchLimit checks total percent bet on a match across all sources
// Returns: (totalPercent, canBet, error)
// canBet = true if totalPercent < 100 (still room for more bets)
func (l *LogsPGStorage) CheckGlobalMatchLimit(ctx context.Context, keyMatch string) (float64, bool, error) {
	query := fmt.Sprintf(`
		SELECT COALESCE(SUM(percent), 0) 
		FROM %s 
		WHERE key_match = $1 AND created_at > NOW() - INTERVAL '72 hours'
	`, LogBetAccept)

	var totalPercent float64
	err := l.handler.QueryRow(ctx, query, keyMatch).Scan(&totalPercent)
	if err != nil {
		log.Printf("[Repository.CheckGlobalMatchLimit] Query error: %v", err)
		return 0, true, err // On error, allow bet (fail-open)
	}

	// Limit: 100% of Kelly = full bet amount used
	canBet := totalPercent < 100.0
	log.Printf("[Repository.CheckGlobalMatchLimit] keyMatch=%s totalPercent=%.2f canBet=%v", keyMatch, totalPercent, canBet)
	return totalPercent, canBet, nil
}

// CheckBookmakerMatchLimit checks how many bets placed on match at specific bookmaker
// Returns: (count, canBet, error)
// canBet = true if count < maxBets
func (l *LogsPGStorage) CheckBookmakerMatchLimit(ctx context.Context, keyMatch, bookmaker string, maxBets int) (int, bool, error) {
	query := fmt.Sprintf(`
		SELECT COUNT(*) 
		FROM %s 
		WHERE key_match = $1 AND bookmaker = $2 AND created_at > NOW() - INTERVAL '72 hours'
	`, LogBetAccept)

	var count int
	err := l.handler.QueryRow(ctx, query, keyMatch, bookmaker).Scan(&count)
	if err != nil {
		log.Printf("[Repository.CheckBookmakerMatchLimit] Query error: %v", err)
		return 0, true, err // On error, allow bet (fail-open)
	}

	canBet := count < maxBets
	log.Printf("[Repository.CheckBookmakerMatchLimit] keyMatch=%s bookmaker=%s count=%d maxBets=%d canBet=%v", 
		keyMatch, bookmaker, count, maxBets, canBet)
	return count, canBet, nil
}

// CLVPendingBet represents a prematch bet pending CLV capture
type CLVPendingBet struct {
	KeyOutcome     string
	MatchStartTime time.Time
	BetCreatedAt   time.Time
	Data           []byte // AcceptBet JSON
}

// UpdateBetCLV updates CLV columns for a bet
func (l *LogsPGStorage) UpdateBetCLV(ctx context.Context, keyOutcome string, betTime time.Time, coefPinnacle5min, roi5min, coefPinnacle1min, roi1min *float64) error {
	query := fmt.Sprintf(`
		UPDATE %s 
		SET coef_pinnacle_5min_before = COALESCE($1, coef_pinnacle_5min_before),
		    roi_5min_before = COALESCE($2, roi_5min_before),
		    coef_pinnacle_1min_before = COALESCE($3, coef_pinnacle_1min_before),
		    roi_1min_before = COALESCE($4, roi_1min_before)
		WHERE key_outcome = $5
		  AND created_at >= $6::timestamptz - INTERVAL '5 seconds'
		  AND created_at <= $6::timestamptz + INTERVAL '5 seconds'
	`, LogBetAccept)

	_, err := l.handler.Exec(ctx, query, coefPinnacle5min, roi5min, coefPinnacle1min, roi1min, keyOutcome, betTime)
	return err
}

// GetPendingCLVBets returns prematch bets that still need CLV capture
func (l *LogsPGStorage) GetPendingCLVBets(ctx context.Context) ([]CLVPendingBet, error) {
	query := fmt.Sprintf(`
		SELECT key_outcome, match_start_time, created_at, data
		FROM %s
		WHERE is_live = false
		  AND match_start_time IS NOT NULL
		  AND match_start_time > now()
		  AND coef_pinnacle_5min_before IS NULL
		ORDER BY match_start_time ASC
		LIMIT 500
	`, LogBetAccept)

	rows, err := l.handler.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bets []CLVPendingBet
	for rows.Next() {
		var b CLVPendingBet
		if err := rows.Scan(&b.KeyOutcome, &b.MatchStartTime, &b.BetCreatedAt, &b.Data); err != nil {
			return nil, err
		}
		bets = append(bets, b)
	}
	return bets, rows.Err()
}

// GetExistingBetsForMatch returns all accepted bets for a match within 72 hours.
// Used by safe-opposite logic to check if candidate bet is safe-opposite to existing ones.
func (l *LogsPGStorage) GetExistingBetsForMatch(ctx context.Context, keyMatch string) ([]ExistingBet, error) {
	query := fmt.Sprintf(`
		SELECT data, percent, sport
		FROM %s
		WHERE key_match = $1 AND created_at > NOW() - INTERVAL '72 hours'
		ORDER BY created_at DESC
	`, LogBetAccept)

	rows, err := l.handler.Query(ctx, query, keyMatch)
	if err != nil {
		log.Printf("[Repository.GetExistingBetsForMatch] Query error: %v", err)
		return nil, err
	}
	defer rows.Close()

	var bets []ExistingBet
	for rows.Next() {
		var dataJSON []byte
		var b ExistingBet
		if err := rows.Scan(&dataJSON, &b.Percent, &b.SportName); err != nil {
			log.Printf("[Repository.GetExistingBetsForMatch] Scan error: %v", err)
			continue
		}
		// Parse outcome from stored AcceptBet JSON
		var acceptBet entity.AcceptBet
		if err := json.Unmarshal(dataJSON, &acceptBet); err != nil {
			log.Printf("[Repository.GetExistingBetsForMatch] Unmarshal error: %v", err)
			continue
		}
		b.Outcome = acceptBet.Pair.Outcome.Outcome
		if b.SportName == "" {
			b.SportName = acceptBet.Pair.SportName
		}
		bets = append(bets, b)
	}
	log.Printf("[Repository.GetExistingBetsForMatch] keyMatch=%s found %d existing bets", keyMatch, len(bets))
	return bets, rows.Err()
}
