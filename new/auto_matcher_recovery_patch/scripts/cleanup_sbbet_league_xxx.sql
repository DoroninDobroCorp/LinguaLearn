-- ================================================================
-- УДАЛЕНИЕ ЛИГИ "league XXXX" И СВЯЗАННЫХ КОМАНД ДЛЯ SBBET
-- ================================================================
-- Использование:
--   docker exec postgres_livebets psql -U matchingTeams -d matchingTeams \
--     -f /scripts/cleanup_sbbet_league_xxx.sql
-- ================================================================

BEGIN;

-- Статистика ДО очистки
DO $$
DECLARE
    sbbet_leagues_count int;
    sbbet_teams_count int;
    bad_leagues_count int;
    total_leagues_merge int;
    total_teams_merge int;
BEGIN
    SELECT COUNT(*) INTO sbbet_leagues_count 
    FROM analyzer.leagues 
    WHERE bookmaker_name = 'Sbbet';
    
    SELECT COUNT(*) INTO sbbet_teams_count 
    FROM analyzer.teams t
    JOIN analyzer.leagues l ON t.league_id = l.id
    WHERE l.bookmaker_name = 'Sbbet';
    
    SELECT COUNT(*) INTO bad_leagues_count 
    FROM analyzer.leagues 
    WHERE bookmaker_name = 'Sbbet' 
    AND (league_name ~ '^league [0-9]+$' OR league_name ~ '^league_[0-9]+$');
    
    SELECT COUNT(*) INTO total_leagues_merge FROM analyzer.leagues_merge;
    SELECT COUNT(*) INTO total_teams_merge FROM analyzer.teams_merge;
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'ТЕКУЩЕЕ СОСТОЯНИЕ БД:';
    RAISE NOTICE 'Всего лиг Sbbet:           % шт.', sbbet_leagues_count;
    RAISE NOTICE 'Всего команд Sbbet:        % шт.', sbbet_teams_count;
    RAISE NOTICE 'Лиг "league XXXX":         % шт. (будут удалены)', bad_leagues_count;
    RAISE NOTICE 'Всего пар лиг:             % шт.', total_leagues_merge;
    RAISE NOTICE 'Всего пар команд:          % шт.', total_teams_merge;
    RAISE NOTICE '=================================================';
END $$;

-- Шаг 1: Получаем ID плохих лиг
CREATE TEMP TABLE bad_league_ids AS
SELECT id FROM analyzer.leagues 
WHERE bookmaker_name = 'Sbbet' 
AND (league_name ~ '^league [0-9]+$' OR league_name ~ '^league_[0-9]+$');

-- Показать что будет удалено
SELECT 'Примеры лиг для удаления:' as info;
SELECT id, league_name, sport_name FROM analyzer.leagues 
WHERE id IN (SELECT id FROM bad_league_ids) LIMIT 10;

-- Шаг 2: Удаляем пары команд, связанные с этими лигами
DELETE FROM analyzer.teams_merge
WHERE team1_id IN (
    SELECT t.id FROM analyzer.teams t
    WHERE t.league_id IN (SELECT id FROM bad_league_ids)
)
OR team2_id IN (
    SELECT t.id FROM analyzer.teams t
    WHERE t.league_id IN (SELECT id FROM bad_league_ids)
);

-- Шаг 3: Удаляем пары лиг, связанные с этими лигами
DELETE FROM analyzer.leagues_merge
WHERE league1_id IN (SELECT id FROM bad_league_ids)
   OR league2_id IN (SELECT id FROM bad_league_ids);

-- Шаг 4: Удаляем команды из этих лиг
DELETE FROM analyzer.teams
WHERE league_id IN (SELECT id FROM bad_league_ids);

-- Шаг 5: Удаляем сами лиги
DELETE FROM analyzer.leagues
WHERE id IN (SELECT id FROM bad_league_ids);

-- Удаляем временную таблицу
DROP TABLE bad_league_ids;

-- Статистика ПОСЛЕ очистки
DO $$
DECLARE
    sbbet_leagues_count int;
    sbbet_teams_count int;
    bad_leagues_count int;
    total_leagues_merge int;
    total_teams_merge int;
BEGIN
    SELECT COUNT(*) INTO sbbet_leagues_count 
    FROM analyzer.leagues 
    WHERE bookmaker_name = 'Sbbet';
    
    SELECT COUNT(*) INTO sbbet_teams_count 
    FROM analyzer.teams t
    JOIN analyzer.leagues l ON t.league_id = l.id
    WHERE l.bookmaker_name = 'Sbbet';
    
    SELECT COUNT(*) INTO bad_leagues_count 
    FROM analyzer.leagues 
    WHERE bookmaker_name = 'Sbbet' 
    AND (league_name ~ '^league [0-9]+$' OR league_name ~ '^league_[0-9]+$');
    
    SELECT COUNT(*) INTO total_leagues_merge FROM analyzer.leagues_merge;
    SELECT COUNT(*) INTO total_teams_merge FROM analyzer.teams_merge;
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'ОЧИСТКА ЗАВЕРШЕНА:';
    RAISE NOTICE 'Лиг Sbbet осталось:        % шт.', sbbet_leagues_count;
    RAISE NOTICE 'Команд Sbbet осталось:     % шт.', sbbet_teams_count;
    RAISE NOTICE 'Лиг "league XXXX":         % шт. (должно быть 0)', bad_leagues_count;
    RAISE NOTICE 'Всего пар лиг:             % шт.', total_leagues_merge;
    RAISE NOTICE 'Всего пар команд:          % шт.', total_teams_merge;
    RAISE NOTICE '=================================================';
END $$;

COMMIT;

-- Финальная проверка
SELECT 
    (SELECT COUNT(*) FROM analyzer.leagues WHERE bookmaker_name = 'Sbbet') as sbbet_leagues_remaining,
    (SELECT COUNT(*) FROM analyzer.leagues WHERE bookmaker_name = 'Sbbet' AND league_name ~ '^league [0-9]+$') as bad_leagues_remaining;
