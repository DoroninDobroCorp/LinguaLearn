-- +migrate Up
-- Add strategy column for tracking bet source (fast/slow/fast_high/slow_high/frontend/manual)
-- This enables per-strategy limits across all bookmakers

ALTER TABLE calculator.log_bet_accept 
ADD COLUMN IF NOT EXISTS strategy VARCHAR(50) DEFAULT 'legacy';

ALTER TABLE calculator.log_test_bet_accept 
ADD COLUMN IF NOT EXISTS strategy VARCHAR(50) DEFAULT 'legacy';

-- Index for fast lookups: check if strategy already used for this match
CREATE INDEX IF NOT EXISTS idx_log_bet_accept_strategy_match 
ON calculator.log_bet_accept(key_match, strategy, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_test_bet_accept_strategy_match 
ON calculator.log_test_bet_accept(key_match, strategy, created_at DESC);

-- +migrate Down
DROP INDEX IF EXISTS idx_log_bet_accept_strategy_match;
DROP INDEX IF EXISTS idx_log_test_bet_accept_strategy_match;

ALTER TABLE calculator.log_bet_accept DROP COLUMN IF EXISTS strategy;
ALTER TABLE calculator.log_test_bet_accept DROP COLUMN IF EXISTS strategy;
