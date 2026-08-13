-- +migrate Up
CREATE TABLE IF NOT EXISTS calculator.log_test_bet_accept(
	key_match VARCHAR(255) NOT NULL,
	key_outcome VARCHAR(255) NOT NULL,
	data JSONB NOT NULL,
	correct_data JSONB NULL,
	percent NUMERIC NOT NULL,
	created_at timestamp with time zone NOT NULL DEFAULT NOW(),
    ev_profit NUMERIC,
    real_profit NUMERIC
);

-- +migrate Down
DROP TABLE calculator.log_test_bet_accept;