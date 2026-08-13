-- +migrate Up
-- CLV (Closing Line Value) columns for prematch bets
-- Captures Pinnacle price at 5min and 1min before match kickoff

ALTER TABLE calculator.log_bet_accept ADD COLUMN IF NOT EXISTS match_start_time TIMESTAMPTZ;
ALTER TABLE calculator.log_bet_accept ADD COLUMN IF NOT EXISTS coef_pinnacle_5min_before NUMERIC;
ALTER TABLE calculator.log_bet_accept ADD COLUMN IF NOT EXISTS coef_pinnacle_1min_before NUMERIC;
ALTER TABLE calculator.log_bet_accept ADD COLUMN IF NOT EXISTS roi_5min_before NUMERIC;
ALTER TABLE calculator.log_bet_accept ADD COLUMN IF NOT EXISTS roi_1min_before NUMERIC;

-- Index for recovery: find prematch bets with pending CLV capture
CREATE INDEX IF NOT EXISTS idx_log_bet_accept_clv_pending
  ON calculator.log_bet_accept (match_start_time)
  WHERE is_live = false
    AND match_start_time IS NOT NULL
    AND coef_pinnacle_5min_before IS NULL;

-- Same for test table
ALTER TABLE calculator.log_test_bet_accept ADD COLUMN IF NOT EXISTS match_start_time TIMESTAMPTZ;
ALTER TABLE calculator.log_test_bet_accept ADD COLUMN IF NOT EXISTS coef_pinnacle_5min_before NUMERIC;
ALTER TABLE calculator.log_test_bet_accept ADD COLUMN IF NOT EXISTS coef_pinnacle_1min_before NUMERIC;
ALTER TABLE calculator.log_test_bet_accept ADD COLUMN IF NOT EXISTS roi_5min_before NUMERIC;
ALTER TABLE calculator.log_test_bet_accept ADD COLUMN IF NOT EXISTS roi_1min_before NUMERIC;
