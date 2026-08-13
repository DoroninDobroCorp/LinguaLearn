-- +migrate Up
-- Global betting limits: match-level and bookmaker-level constraints
-- Enables unified limit tracking across autobetting and frontend

-- Index for global match limit (all sources combined)
-- Used by CheckGlobalMatchLimit to sum percent across all strategies
CREATE INDEX IF NOT EXISTS idx_log_bet_accept_global_match 
ON calculator.log_bet_accept(key_match, created_at DESC);

-- Index for bookmaker-specific limit (1 bet per match per bookmaker)
-- Used by CheckBookmakerMatchLimit to count bets per bookmaker
CREATE INDEX IF NOT EXISTS idx_log_bet_accept_bookmaker_match 
ON calculator.log_bet_accept(key_match, bookmaker, created_at DESC);

-- +migrate Down
DROP INDEX IF EXISTS calculator.idx_log_bet_accept_global_match;
DROP INDEX IF EXISTS calculator.idx_log_bet_accept_bookmaker_match;
