-- +migrate Up
-- Добавляем колонки для ROI через 15 секунд

-- Таблица тестовых ставок
ALTER TABLE calculator.log_test_bet_accept
ADD COLUMN IF NOT EXISTS roi_15sec NUMERIC,
ADD COLUMN IF NOT EXISTS coef_pinnacle_15sec NUMERIC,
ADD COLUMN IF NOT EXISTS ev_profit_15sec NUMERIC;

-- Таблица реальных ставок
ALTER TABLE calculator.log_bet_accept
ADD COLUMN IF NOT EXISTS roi_15sec NUMERIC,
ADD COLUMN IF NOT EXISTS coef_pinnacle_15sec NUMERIC,
ADD COLUMN IF NOT EXISTS ev_profit_15sec NUMERIC;

-- Таблица групповых захватов
ALTER TABLE calculator.log_group_capture
ADD COLUMN IF NOT EXISTS roi_15sec NUMERIC,
ADD COLUMN IF NOT EXISTS coef_pinnacle_15sec NUMERIC,
ADD COLUMN IF NOT EXISTS ev_profit_15sec NUMERIC;

-- Индексы для быстрого поиска ставок без roi_15sec
CREATE INDEX IF NOT EXISTS idx_log_test_bet_accept_roi_15sec_null
  ON calculator.log_test_bet_accept(key_outcome) WHERE roi_15sec IS NULL;
CREATE INDEX IF NOT EXISTS idx_log_bet_accept_roi_15sec_null
  ON calculator.log_bet_accept(key_outcome) WHERE roi_15sec IS NULL;

-- +migrate Down
ALTER TABLE calculator.log_test_bet_accept
DROP COLUMN IF EXISTS roi_15sec,
DROP COLUMN IF EXISTS coef_pinnacle_15sec,
DROP COLUMN IF EXISTS ev_profit_15sec;

ALTER TABLE calculator.log_bet_accept
DROP COLUMN IF EXISTS roi_15sec,
DROP COLUMN IF EXISTS coef_pinnacle_15sec,
DROP COLUMN IF EXISTS ev_profit_15sec;

ALTER TABLE calculator.log_group_capture
DROP COLUMN IF EXISTS roi_15sec,
DROP COLUMN IF EXISTS coef_pinnacle_15sec,
DROP COLUMN IF EXISTS ev_profit_15sec;
