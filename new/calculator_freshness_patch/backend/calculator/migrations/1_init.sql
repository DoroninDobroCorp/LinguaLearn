-- +migrate Up
CREATE TABLE IF NOT EXISTS calculator.log_bet_attempt(
	key_match VARCHAR(255) NOT NULL,
	key_outcome VARCHAR(255) NOT NULL,
	data JSONB NOT NULL,
	created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculator.log_bet_accept(
	key_match VARCHAR(255) NOT NULL,
	key_outcome VARCHAR(255) NOT NULL,
	data JSONB NOT NULL,
	correct_data JSONB NULL,
	percent NUMERIC NOT NULL,
	created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

ALTER TABLE calculator.log_bet_accept ADD COLUMN ev_profit NUMERIC;
ALTER TABLE calculator.log_bet_accept ADD COLUMN real_profit NUMERIC;

ALTER TABLE calculator.log_bet_accept ADD COLUMN user_id BIGINT;
ALTER TABLE calculator.log_bet_accept ADD COLUMN is_live BOOLEAN;
ALTER TABLE calculator.log_bet_accept ADD COLUMN sport TEXT;
ALTER TABLE calculator.log_bet_accept ADD COLUMN bookmaker TEXT;

-- +migrate Down
DROP TABLE calculator.log_bet_attempt;
DROP TABLE calculator.log_bet_accept;