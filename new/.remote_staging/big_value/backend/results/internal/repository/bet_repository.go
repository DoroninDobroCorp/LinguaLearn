package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"livebets/results/internal/entity"
)

type GroupCaptureResult struct {
	OutcomeStatus string
	EVProfit      sql.NullFloat64
	RealProfit    sql.NullFloat64
}

func (p *PostgresClient) GetYesterdayBets() ([]*entity.LogBetAccept, error) {
	query := `
        SELECT id, key_match, key_outcome, data, COALESCE(correct_data, '{}'::jsonb) AS correct_data, percent, created_at, is_live, ev_profit, real_profit,
               roi_1min, coef_donor_original, coef_pinnacle_1min, ev_profit_1min
        FROM Calculator.log_bet_accept
        WHERE created_at >= NOW() - INTERVAL '24 HOURS' AND real_profit IS NULL`
	rows, err := p.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bets []*entity.LogBetAccept
	for rows.Next() {
		var bet entity.LogBetAccept
		var dataBytes, correctDataBytes []byte

		if err := rows.Scan(&bet.ID, &bet.KeyMatch, &bet.KeyOutcome, &dataBytes, &correctDataBytes, &bet.Percent, &bet.CreatedAt, &bet.IsLive, &bet.EVProfit, &bet.RealProfit,
			&bet.ROI1min, &bet.CoefDonorOriginal, &bet.CoefPinnacle1min, &bet.EvProfit1min); err != nil {
			return nil, err
		}

		if err := json.Unmarshal(dataBytes, &bet.Data); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(correctDataBytes, &bet.CorrectData); err != nil {
			return nil, err
		}
		bets = append(bets, &bet)
	}
	return bets, nil
}

// UpdateBetProfits updates ev_profit and real_profit for a specific bet by ID
func (p *PostgresClient) UpdateBetProfits(betID int64, evProfit, realProfit float64) error {
	query := `
		UPDATE Calculator.log_bet_accept
		SET ev_profit = $2, real_profit = $3
		WHERE id = $1
	`
	_, err := p.DB.Exec(query, betID, evProfit, realProfit)
	return err
}

func (p *PostgresClient) GetYesterdayTestBets() ([]*entity.LogBetAccept, error) {
	query := `
        SELECT key_match, key_outcome, data, COALESCE(correct_data, '{}'::jsonb) AS correct_data, percent, created_at, ev_profit, real_profit,
               roi_1min, coef_donor_original, coef_pinnacle_1min, ev_profit_1min
        FROM Calculator.log_test_bet_accept
        WHERE created_at >= NOW() - INTERVAL '24 HOURS' AND real_profit IS NULL
    `
	rows, err := p.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bets []*entity.LogBetAccept
	for rows.Next() {
		var bet entity.LogBetAccept
		var dataBytes, correctDataBytes []byte

		if err := rows.Scan(&bet.KeyMatch, &bet.KeyOutcome, &dataBytes, &correctDataBytes, &bet.Percent, &bet.CreatedAt, &bet.EVProfit, &bet.RealProfit,
			&bet.ROI1min, &bet.CoefDonorOriginal, &bet.CoefPinnacle1min, &bet.EvProfit1min); err != nil {
			return nil, err
		}

		if err := json.Unmarshal(dataBytes, &bet.Data); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(correctDataBytes, &bet.CorrectData); err != nil {
			return nil, err
		}
		bets = append(bets, &bet)
	}
	return bets, nil
}

func (p *PostgresClient) GetPendingGroupCaptureBets() ([]*entity.GenericBet, error) {
	query := `
        SELECT id, mkey, okey, prices_json, created_at, 
               CASE 
                   WHEN trigger_type = 'AVG' THEN avg_price 
                   ELSE med_price 
               END as coefficient,
               sport_name,
               pinnacle_match_id,
               roi
        FROM calculator.log_group_capture
        WHERE outcome_status = 'PENDING' 
          AND pinnacle_match_id IS NOT NULL AND pinnacle_match_id != ''
          AND created_at >= NOW() - INTERVAL '48 HOURS'`

	rows, err := p.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bets []*entity.GenericBet
	for rows.Next() {
		var bet entity.GenericBet
		var pricesBytes []byte
		bet.TableName = "log_group_capture"

		err := rows.Scan(
			&bet.ID, &bet.Mkey, &bet.Okey, &pricesBytes, &bet.CreatedAt, &bet.Coefficient,
			&bet.SportName,
			&bet.PinnacleMatchID,
			&bet.ROI,
		)
		if err != nil {
			return nil, err
		}

		if err := json.Unmarshal(pricesBytes, &bet.PricesJSON); err != nil {
			return nil, err
		}
		bets = append(bets, &bet)
	}
	return bets, nil
}

func (p *PostgresClient) GetFinishedGroupBets() ([]*entity.GenericBet, error) {
	query := `
        SELECT 
            id, mkey, okey, prices_json, created_at, 
            COALESCE(
                CASE 
                   WHEN trigger_type = 'AVG' THEN avg_price 
                   ELSE med_price 
                END, 0
            ) as coefficient,
            sport_name,
            pinnacle_match_id,
            COALESCE(roi, 0) as roi,
            ev_profit,
            real_profit,
            csv_filename
        FROM 
            calculator.log_group_capture
        WHERE 
            outcome_status != 'PENDING' 
            AND ev_profit IS NOT NULL 
            AND real_profit IS NOT NULL
            AND csv_filename IS NOT NULL AND csv_filename != ''`

	rows, err := p.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bets []*entity.GenericBet
	for rows.Next() {
		var bet entity.GenericBet
		var pricesBytes []byte
		var evProfit, realProfit sql.NullFloat64
		var csvFilename sql.NullString

		err := rows.Scan(
			&bet.ID, &bet.Mkey, &bet.Okey, &pricesBytes, &bet.CreatedAt,
			&bet.Coefficient,
			&bet.SportName,
			&bet.PinnacleMatchID,
			&bet.ROI,
			&evProfit,
			&realProfit,
			&csvFilename,
		)
		if err != nil {
			return nil, err
		}

		if err := json.Unmarshal(pricesBytes, &bet.PricesJSON); err != nil {
			log.Printf("Warning: couldn't unmarshal prices_json for bet ID %d: %v", bet.ID, err)
			bet.PricesJSON = make(map[string]interface{})
		}

		if evProfit.Valid {
			bet.EVProfit = evProfit.Float64
		}
		if realProfit.Valid {
			bet.RealProfit = realProfit.Float64
		}
		if csvFilename.Valid {
			bet.CsvFilename = csvFilename.String
		}

		bets = append(bets, &bet)
	}
	return bets, nil
}

func (p *PostgresClient) UpdateGenericBetResult(tableName string, id int64, status string, evProfit, realProfit float64) error {
	query := fmt.Sprintf(`
		UPDATE calculator.%s
		SET outcome_status = $2, ev_profit = $3, real_profit = $4
		WHERE id = $1
	`, tableName)

	_, err := p.DB.Exec(query, id, status, evProfit, realProfit)
	return err
}

// UpdateTestBetProfits updates ev_profit and real_profit for a specific test bet by ID
func (p *PostgresClient) UpdateTestBetProfits(keyOutcome string, evProfit, realProfit float64) error {
	query := `
		UPDATE Calculator.log_test_bet_accept
		SET ev_profit = $2, real_profit = $3
		WHERE key_outcome = $1
	`
	_, err := p.DB.Exec(query, keyOutcome, evProfit, realProfit)
	return err
}

func (p *PostgresClient) GetTestBets() ([]entity.LogBetAccept, error) {
	query := "SELECT key_match, key_outcome, created_at, data, ev_profit, real_profit FROM Calculator.log_test_bet_accept"
	rows, err := p.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bets []entity.LogBetAccept
	for rows.Next() {
		var bet entity.LogBetAccept
		var dataBytes []byte

		if err := rows.Scan(&bet.KeyMatch, &bet.KeyOutcome, &bet.CreatedAt, &dataBytes, &bet.EVProfit, &bet.RealProfit); err != nil {
			return nil, err
		}

		if err := json.Unmarshal(dataBytes, &bet.Data); err != nil {
		}

		pair := bet.Data["pair"].(map[string]interface{})
		outcome := pair["outcome"].(map[string]interface{})

		if bet.RealProfit == nil || outcome["roi"].(float64) > 12 || !pair["isLive"].(bool) {
			continue
		}

		bets = append(bets, bet)
	}
	return bets, nil
}

func (p *PostgresClient) FixTestDB() error {
	bets, err := p.GetTestBets()
	if err != nil {
		return err
	}

	query := "DELETE FROM Calculator.log_test_bet_accept WHERE key_outcome = $1"

	for _, bet := range bets {
		pair := bet.Data["pair"].(map[string]interface{})

		if pair["sportName"].(string) == "Tennis" {
			_, err := p.DB.Exec(query, bet.KeyOutcome)
			if err != nil {
				return err
			}
		}
	}

	return err
}

// CleanupUnprocessedTestBets удаляет тестовые ставки без результатов старше N дней
func (p *PostgresClient) CleanupUnprocessedTestBets(daysOld int) (int, error) {
	query := `
		DELETE FROM Calculator.log_test_bet_accept
		WHERE ev_profit IS NULL 
		  AND real_profit IS NULL
		  AND created_at < NOW() - INTERVAL '%d days'
	`
	query = fmt.Sprintf(query, daysOld)

	result, err := p.DB.Exec(query)
	if err != nil {
		return 0, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	return int(rowsAffected), nil
}

// CountUnprocessedTestBets подсчитывает тестовые ставки без результатов старше N дней (для dry-run)
func (p *PostgresClient) CountUnprocessedTestBets(daysOld int) (int, error) {
	query := `
		SELECT COUNT(*) 
		FROM Calculator.log_test_bet_accept
		WHERE ev_profit IS NULL 
		  AND real_profit IS NULL
		  AND created_at < NOW() - INTERVAL '%d days'
	`
	query = fmt.Sprintf(query, daysOld)

	var count int
	err := p.DB.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

// CleanupUnprocessedGroupBets удаляет групповые ставки без результатов старше N дней
func (p *PostgresClient) CleanupUnprocessedGroupBets(daysOld int) (int, error) {
	query := `
		DELETE FROM calculator.log_group_capture
		WHERE outcome_status = 'PENDING'
		  AND ev_profit IS NULL 
		  AND real_profit IS NULL
		  AND created_at < NOW() - INTERVAL '%d days'
	`
	query = fmt.Sprintf(query, daysOld)

	result, err := p.DB.Exec(query)
	if err != nil {
		return 0, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	return int(rowsAffected), nil
}

// CountUnprocessedGroupBets подсчитывает групповые ставки без результатов старше N дней (для dry-run)
func (p *PostgresClient) CountUnprocessedGroupBets(daysOld int) (int, error) {
	query := `
		SELECT COUNT(*) 
		FROM calculator.log_group_capture
		WHERE outcome_status = 'PENDING'
		  AND ev_profit IS NULL 
		  AND real_profit IS NULL
		  AND created_at < NOW() - INTERVAL '%d days'
	`
	query = fmt.Sprintf(query, daysOld)

	var count int
	err := p.DB.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (p *PostgresClient) GetGroupCaptureResultByMkey(mkey string) (*GroupCaptureResult, error) {
	query := `
        SELECT outcome_status, ev_profit, real_profit 
        FROM calculator.log_group_capture 
        WHERE mkey = $1
        ORDER BY created_at DESC 
        LIMIT 1`

	row := p.DB.QueryRow(query, mkey)

	var result GroupCaptureResult
	err := row.Scan(&result.OutcomeStatus, &result.EVProfit, &result.RealProfit)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &result, nil
}

type BetRepository interface {
	GetYesterdayBets() ([]*entity.LogBetAccept, error)
	GetYesterdayTestBets() ([]*entity.LogBetAccept, error)
	GetPendingGroupCaptureBets() ([]*entity.GenericBet, error)
	GetTestBets() ([]entity.LogBetAccept, error)
	GetGroupCaptureResultByMkey(mkey string) (*GroupCaptureResult, error)
	UpdateBetProfits(betID int64, evProfit, realProfit float64) error
	UpdateTestBetProfits(keyOutcome string, evProfit, realProfit float64) error
}
