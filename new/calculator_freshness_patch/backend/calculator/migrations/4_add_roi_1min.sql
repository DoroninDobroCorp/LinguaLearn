-- +migrate Up
-- Добавляем колонки для ROI через 1 минуту

-- Таблица тестовых ставок
ALTER TABLE calculator.log_test_bet_accept
ADD COLUMN IF NOT EXISTS roi_1min NUMERIC,
ADD COLUMN IF NOT EXISTS coef_donor_original NUMERIC,
ADD COLUMN IF NOT EXISTS coef_pinnacle_1min NUMERIC,
ADD COLUMN IF NOT EXISTS ev_profit_1min NUMERIC;

-- Таблица реальных ставок
ALTER TABLE calculator.log_bet_accept
ADD COLUMN IF NOT EXISTS roi_1min NUMERIC,
ADD COLUMN IF NOT EXISTS coef_donor_original NUMERIC,
ADD COLUMN IF NOT EXISTS coef_pinnacle_1min NUMERIC,
ADD COLUMN IF NOT EXISTS ev_profit_1min NUMERIC;

-- Таблица групповых захватов
ALTER TABLE calculator.log_group_capture
ADD COLUMN IF NOT EXISTS roi_1min NUMERIC,
ADD COLUMN IF NOT EXISTS coef_donor_original NUMERIC,
ADD COLUMN IF NOT EXISTS coef_pinnacle_1min NUMERIC,
ADD COLUMN IF NOT EXISTS ev_profit_1min NUMERIC;

-- Индексы для быстрого поиска ставок без roi_1min
CREATE INDEX IF NOT EXISTS idx_log_test_bet_accept_roi_1min_null
  ON calculator.log_test_bet_accept(key_outcome) WHERE roi_1min IS NULL;
CREATE INDEX IF NOT EXISTS idx_log_bet_accept_roi_1min_null
  ON calculator.log_bet_accept(key_outcome) WHERE roi_1min IS NULL;

-- +migrate Down
ALTER TABLE calculator.log_test_bet_accept
DROP COLUMN IF EXISTS roi_1min,
DROP COLUMN IF EXISTS coef_donor_original,
DROP COLUMN IF EXISTS coef_pinnacle_1min,
DROP COLUMN IF EXISTS ev_profit_1min;

ALTER TABLE calculator.log_bet_accept
DROP COLUMN IF EXISTS roi_1min,
DROP COLUMN IF EXISTS coef_donor_original,
DROP COLUMN IF EXISTS coef_pinnacle_1min,
DROP COLUMN IF EXISTS ev_profit_1min;

ALTER TABLE calculator.log_group_capture
DROP COLUMN IF EXISTS roi_1min,
DROP COLUMN IF EXISTS coef_donor_original,
DROP COLUMN IF EXISTS coef_pinnacle_1min,
DROP COLUMN IF EXISTS ev_profit_1min;
