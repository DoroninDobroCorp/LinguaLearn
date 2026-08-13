\pset pager off

WITH x AS (
    SELECT *,
           NULLIF(data #>> '{pair,outcome,roi}', '')::numeric AS roi,
           NULLIF(data #>> '{pair,outcome,outcome}', '') AS outcome,
           NULLIF(data #>> '{pair,outcome,score1,value}', '')::numeric AS p_odd,
           NULLIF(data #>> '{pair,outcome,score2,value}', '')::numeric AS d_odd
    FROM calculator.log_bet_accept
)
SELECT count(*) AS n,
       min(roi) AS min_roi,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY roi) AS p50,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY roi) AS p90,
       percentile_cont(0.99) WITHIN GROUP (ORDER BY roi) AS p99,
       max(roi) AS max_roi,
       count(*) FILTER (WHERE roi >= 10) AS ge10,
       count(*) FILTER (WHERE roi >= 30) AS ge30,
       count(*) FILTER (WHERE roi >= 100) AS ge100
FROM x;

WITH x AS (
    SELECT id, created_at, data, bookmaker, sport, is_live, strategy,
           NULLIF(data #>> '{pair,outcome,roi}', '')::numeric AS roi,
           NULLIF(data #>> '{pair,outcome,outcome}', '') AS outcome,
           NULLIF(data #>> '{pair,outcome,score1,value}', '')::numeric AS p_odd,
           NULLIF(data #>> '{pair,outcome,score2,value}', '')::numeric AS d_odd
    FROM calculator.log_bet_accept
)
SELECT id, created_at, round(roi, 2) AS roi, outcome, p_odd, d_odd,
       bookmaker, sport, is_live, strategy,
       data #>> '{pair,first,homeName}' AS p_home,
       data #>> '{pair,first,awayName}' AS p_away,
       data #>> '{pair,second,homeName}' AS d_home,
       data #>> '{pair,second,awayName}' AS d_away,
       data #>> '{pair,first,createdAt}' AS p_at,
       data #>> '{pair,second,createdAt}' AS d_at
FROM x
ORDER BY roi DESC NULLS LAST
LIMIT 30;

WITH x AS (
    SELECT id, created_at, data, bookmaker, sport, is_live, strategy,
           NULLIF(data #>> '{pair,outcome,roi}', '')::numeric AS roi
    FROM calculator.log_bet_accept
)
SELECT id, created_at, round(roi, 2) AS roi,
       data #>> '{pair,outcome,outcome}' AS outcome,
       data #>> '{pair,outcome,score1,value}' AS p_odd,
       data #>> '{pair,outcome,score2,value}' AS d_odd,
       bookmaker, sport, is_live, strategy,
       data #>> '{pair,first,homeName}' AS p_home,
       data #>> '{pair,first,awayName}' AS p_away
FROM x
ORDER BY created_at DESC
LIMIT 30;

WITH x AS (
    SELECT id,
           created_at,
           NULLIF(data #>> '{pair,createdAt}', '')::timestamptz AS payload_created_at,
           NULLIF(data #>> '{pair,first,createdAt}', '')::timestamptz AS pinnacle_created_at,
           real_profit,
           result_attempts,
           is_live,
           data #>> '{pair,first,homeName}' AS home_name,
           data #>> '{pair,first,awayName}' AS away_name
    FROM calculator.log_bet_accept
)
SELECT count(*) AS timestamp_mismatch_count,
       min(created_at - payload_created_at) AS min_shift,
       max(created_at - payload_created_at) AS max_shift
FROM x
WHERE payload_created_at IS NOT NULL
  AND abs(extract(epoch FROM (created_at - payload_created_at))) > 300;

WITH x AS (
    SELECT id,
           created_at,
           NULLIF(data #>> '{pair,createdAt}', '')::timestamptz AS payload_created_at,
           real_profit,
           result_attempts,
           is_live,
           data #>> '{pair,first,homeName}' AS home_name,
           data #>> '{pair,first,awayName}' AS away_name
    FROM calculator.log_bet_accept
)
SELECT id, created_at, payload_created_at,
       created_at - payload_created_at AS shifted_by,
       is_live, result_attempts, real_profit, home_name, away_name
FROM x
WHERE payload_created_at IS NOT NULL
  AND abs(extract(epoch FROM (created_at - payload_created_at))) > 300
ORDER BY shifted_by DESC, id
LIMIT 100;
