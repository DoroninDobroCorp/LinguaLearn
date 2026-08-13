-- +migrate Up
-- Create log_group_capture table for GROUP strategy captures
CREATE TABLE IF NOT EXISTS calculator.log_group_capture (
    id BIGSERIAL PRIMARY KEY,
    mkey VARCHAR(255) NOT NULL,
    okey VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(10),
    wave VARCHAR(10),
    bucket VARCHAR(10),
    books_count INT,
    ratio NUMERIC,
    avg_price NUMERIC,
    med_price NUMERIC,
    prices_json JSONB,
    csv_filename VARCHAR(500),
    sport_name VARCHAR(50),
    pinnacle_match_id VARCHAR(100),
    coef NUMERIC,
    margin NUMERIC,
    roi NUMERIC,
    bookmaker_name VARCHAR(50),
    outcome_status VARCHAR(20) DEFAULT 'PENDING',
    ev_profit NUMERIC,
    real_profit NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_group_capture_mkey ON calculator.log_group_capture(mkey);
CREATE INDEX IF NOT EXISTS idx_log_group_capture_status ON calculator.log_group_capture(outcome_status);
CREATE INDEX IF NOT EXISTS idx_log_group_capture_pinnacle_match_id ON calculator.log_group_capture(pinnacle_match_id);
CREATE INDEX IF NOT EXISTS idx_log_group_capture_created_at ON calculator.log_group_capture(created_at DESC);

-- +migrate Down
DROP TABLE IF EXISTS calculator.log_group_capture;
