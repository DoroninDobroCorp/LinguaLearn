-- ================================================================
-- ОЧИСТКА ТЕННИСНЫХ ПАР VOLCANO
-- ================================================================
-- Проблема: Volcano использует инициалы (A.Fery) вместо полных имён
-- Это создаёт ложные пары с ROI 50%+ для тенниса
-- ================================================================
-- Использование:
--   docker exec postgres_livebets psql -U matchingTeams -d matchingTeams \
--     -f /srv/big_value/backend/auto_matcher/scripts/cleanup_volcano_tennis_pairs.sql
-- ================================================================

BEGIN;

-- Статистика ДО очистки
DO $$
DECLARE
    tennis_teams_count int;
    tennis_leagues_count int;
BEGIN
    -- Считаем теннисные пары команд где участвует Volcano
    SELECT COUNT(*) INTO tennis_teams_count 
    FROM analyzer.teams_merge tm
    JOIN analyzer.teams t1 ON tm.team1_id = t1.id
    JOIN analyzer.teams t2 ON tm.team2_id = t2.id
    JOIN analyzer.leagues l1 ON t1.league_id = l1.id
    JOIN analyzer.leagues l2 ON t2.league_id = l2.id
    WHERE LOWER(l1.sport_name) = 'tennis'
      AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano');
    
    -- Считаем теннисные пары лиг где участвует Volcano
    SELECT COUNT(*) INTO tennis_leagues_count 
    FROM analyzer.leagues_merge lm
    JOIN analyzer.leagues l1 ON lm.league1_id = l1.id
    JOIN analyzer.leagues l2 ON lm.league2_id = l2.id
    WHERE LOWER(l1.sport_name) = 'tennis'
      AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano');
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'ТЕННИСНЫЕ ПАРЫ VOLCANO ДО ОЧИСТКИ:';
    RAISE NOTICE 'Пар команд (теннис Volcano): % шт.', tennis_teams_count;
    RAISE NOTICE 'Пар лиг (теннис Volcano):    % шт.', tennis_leagues_count;
    RAISE NOTICE '=================================================';
END $$;

-- УДАЛЯЕМ ТЕННИСНЫЕ ПАРЫ КОМАНД VOLCANO
DELETE FROM analyzer.teams_merge 
WHERE uuid IN (
    SELECT tm.uuid
    FROM analyzer.teams_merge tm
    JOIN analyzer.teams t1 ON tm.team1_id = t1.id
    JOIN analyzer.teams t2 ON tm.team2_id = t2.id
    JOIN analyzer.leagues l1 ON t1.league_id = l1.id
    JOIN analyzer.leagues l2 ON t2.league_id = l2.id
    WHERE LOWER(l1.sport_name) = 'tennis'
      AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano')
);

-- УДАЛЯЕМ ТЕННИСНЫЕ ПАРЫ ЛИГ VOLCANO
DELETE FROM analyzer.leagues_merge 
WHERE id IN (
    SELECT lm.id
    FROM analyzer.leagues_merge lm
    JOIN analyzer.leagues l1 ON lm.league1_id = l1.id
    JOIN analyzer.leagues l2 ON lm.league2_id = l2.id
    WHERE LOWER(l1.sport_name) = 'tennis'
      AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano')
);

-- Статистика ПОСЛЕ очистки
DO $$
DECLARE
    tennis_teams_count int;
    tennis_leagues_count int;
BEGIN
    SELECT COUNT(*) INTO tennis_teams_count 
    FROM analyzer.teams_merge tm
    JOIN analyzer.teams t1 ON tm.team1_id = t1.id
    JOIN analyzer.teams t2 ON tm.team2_id = t2.id
    JOIN analyzer.leagues l1 ON t1.league_id = l1.id
    JOIN analyzer.leagues l2 ON t2.league_id = l2.id
    WHERE LOWER(l1.sport_name) = 'tennis'
      AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano');
    
    SELECT COUNT(*) INTO tennis_leagues_count 
    FROM analyzer.leagues_merge lm
    JOIN analyzer.leagues l1 ON lm.league1_id = l1.id
    JOIN analyzer.leagues l2 ON lm.league2_id = l2.id
    WHERE LOWER(l1.sport_name) = 'tennis'
      AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano');
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'ОЧИСТКА ЗАВЕРШЕНА:';
    RAISE NOTICE 'Пар команд (теннис Volcano): % шт. (должно быть 0)', tennis_teams_count;
    RAISE NOTICE 'Пар лиг (теннис Volcano):    % шт. (должно быть 0)', tennis_leagues_count;
    RAISE NOTICE '=================================================';
END $$;

COMMIT;

-- Проверка
SELECT 'Оставшиеся теннисные пары Volcano' as check_type,
    (SELECT COUNT(*) 
     FROM analyzer.teams_merge tm
     JOIN analyzer.teams t1 ON tm.team1_id = t1.id
     JOIN analyzer.teams t2 ON tm.team2_id = t2.id
     JOIN analyzer.leagues l1 ON t1.league_id = l1.id
     JOIN analyzer.leagues l2 ON t2.league_id = l2.id
     WHERE LOWER(l1.sport_name) = 'tennis'
       AND (l1.bookmaker_name = 'Volcano' OR l2.bookmaker_name = 'Volcano')) as count;
