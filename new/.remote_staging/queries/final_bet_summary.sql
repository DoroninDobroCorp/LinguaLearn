\pset pager off

WITH accepted AS (
    SELECT created_at,
           data,
           NULLIF(data #>> '{pair,outcome,roi}', '')::numeric AS roi,
           NULLIF(data #>> '{pair,createdAt}', '')::timestamptz AS payload_created_at
    FROM calculator.log_bet_accept
)
SELECT count(*) AS accepted_bets,
       min(roi) AS min_roi,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY roi) AS p50_roi,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY roi) AS p90_roi,
       percentile_cont(0.99) WITHIN GROUP (ORDER BY roi) AS p99_roi,
       max(roi) AS max_roi,
       count(*) FILTER (WHERE roi >= 10) AS roi_ge_10,
       count(*) FILTER (WHERE roi >= 30) AS roi_ge_30,
       count(*) FILTER (WHERE roi >= 100) AS roi_ge_100,
       count(*) FILTER (
           WHERE payload_created_at IS NOT NULL
             AND abs(extract(epoch FROM (created_at - payload_created_at))) > 300
       ) AS timestamp_mismatches
FROM accepted;

SELECT count(*) AS timestamp_backup_rows
FROM calculator.log_bet_accept_created_at_backup_20260808;
