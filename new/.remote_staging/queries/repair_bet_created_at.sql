\set ON_ERROR_STOP on
\pset pager off

BEGIN;

CREATE TABLE IF NOT EXISTS calculator.log_bet_accept_created_at_backup_20260808 (
    id bigint PRIMARY KEY,
    old_created_at timestamptz NOT NULL,
    payload_created_at timestamptz NOT NULL,
    backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO calculator.log_bet_accept_created_at_backup_20260808 (
    id,
    old_created_at,
    payload_created_at
)
SELECT id,
       created_at,
       (data #>> '{pair,createdAt}')::timestamptz
FROM calculator.log_bet_accept
WHERE NULLIF(data #>> '{pair,createdAt}', '') IS NOT NULL
  AND abs(extract(epoch FROM (
      created_at - (data #>> '{pair,createdAt}')::timestamptz
  ))) > 300
ON CONFLICT (id) DO NOTHING;

UPDATE calculator.log_bet_accept AS bets
SET created_at = backup.payload_created_at
FROM calculator.log_bet_accept_created_at_backup_20260808 AS backup
WHERE bets.id = backup.id
  AND abs(extract(epoch FROM (bets.created_at - backup.payload_created_at))) > 300;

COMMIT;

SELECT count(*) AS backup_rows
FROM calculator.log_bet_accept_created_at_backup_20260808;

SELECT count(*) AS remaining_timestamp_mismatches
FROM calculator.log_bet_accept
WHERE NULLIF(data #>> '{pair,createdAt}', '') IS NOT NULL
  AND abs(extract(epoch FROM (
      created_at - (data #>> '{pair,createdAt}')::timestamptz
  ))) > 300;

SELECT id, old_created_at, payload_created_at, old_created_at - payload_created_at AS restored_shift
FROM calculator.log_bet_accept_created_at_backup_20260808
ORDER BY restored_shift DESC, id;
