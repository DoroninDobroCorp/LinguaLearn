-- ================================================================
-- УДАЛЕНИЕ ПРОБЛЕМНОЙ ЛИГИ Basketball: sea games women/men
-- Ошибка: мужская лига перепутана с женской (Thailand vs Indonesia)
-- ================================================================
-- Использование:
--   docker exec postgres_livebets psql -U matchingTeams -d matchingTeams \
--     -f /srv/big_value/backend/auto_matcher/scripts/cleanup_sea_games_basketball.sql
-- ================================================================

BEGIN;

-- Поиск и удаление проблемных лиг basketball с sea games и thailand/indonesia
DO $$
DECLARE
    league_id_to_delete BIGINT;
    league_name_text TEXT;
    deleted_count INTEGER := 0;
BEGIN
    -- Находим все(problem) лиги Basketball с содержанием "sea games" и командами Thailand/Indonesia
    FOR league_id_to_delete, league_name_text IN 
        SELECT 
            l.id, 
            CONCAT(l.bookmaker_name, ' | ', l.sport_name, ' | ', l.league_name)
        FROM analyzer.leagues l
        WHERE l.sport_name = 'Basketball'
        AND (
            LOWER(l.league_name) LIKE '%sea games%' 
            OR LOWER(l.league_name) LIKE '%thailand%'
            OR LOWER(l.league_name) LIKE '%indonesia%'
        )
    LOOP
        RAISE NOTICE 'НАЙДЕНА ПРОБЛЕМНАЯ ЛИГА: ID=% | %', league_id_to_delete, league_name_text;
        
        -- Сначала удаляем все слияния команд для этой лиги
        DELETE FROM analyzer.teams_merge 
        WHERE team1_id IN (SELECT id FROM analyzer.teams WHERE league_id = league_id_to_delete)
        OR team2_id IN (SELECT id FROM analyzer.teams WHERE league_id = league_id_to_delete);
        
        -- Удаляем все команды в этой лиге (каскадно через FK)
        DELETE FROM analyzer.teams WHERE league_id = league_id_to_delete;
        
        -- Удаляем все слияния лиг для этой лиги
        DELETE FROM analyzer.leagues_merge 
        WHERE league1_id = league_id_to_delete OR league2_id = league_id_to_delete;
        
        -- Удаляем саму лигу
        DELETE FROM analyzer.leagues WHERE id = league_id_to_delete;
        
        deleted_count := deleted_count + 1;
        RAISE NOTICE 'УДАЛЕНА лига ID=% и все связанные данные', league_id_to_delete;
    END LOOP;
    
    IF deleted_count > 0 THEN
        RAISE NOTICE '=================================================';
        RAISE NOTICE 'УДАЛЕНО проблемных лиг Basketball: % шт.', deleted_count;
        RAISE NOTICE 'Очистка завершена успешно';
        RAISE NOTICE '=================================================';
    ELSE
        RAISE NOTICE 'Проблемных лиг Basketball с sea games/Thailand/Indonesia не найдено';
    END IF;
END $$;

-- Проверка что проблемных лиг больше нет
DO $$
DECLARE
    remaining_leagues INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_leagues
    FROM analyzer.leagues l
    WHERE l.sport_name = 'Basketball'
    AND (
        LOWER(l.league_name) LIKE '%sea games%' 
        OR LOWER(l.league_name) LIKE '%thailand%'
        OR LOWER(l.league_name) LIKE '%indonesia%'
    );
    
    IF remaining_leagues > 0 THEN
        RAISE EXCEPTION 'ОШИБКА: Осталось % проблемных лиг Basketball', remaining_leagues;
    ELSE
        RAISE NOTICE 'Проверка пройдена: проблемных лиг Basketball не осталось';
    END IF;
END $$;

COMMIT;

-- Финальная проверка состояния
SELECT 
    'Оставшиеся лиги Basketball с sea games/Thailand/Indonesia' as check_description,
    COUNT(*) as count
FROM analyzer.leagues l
WHERE l.sport_name = 'Basketball'
AND (
    LOWER(l.league_name) LIKE '%sea games%' 
    OR LOWER(l.league_name) LIKE '%thailand%'
    OR LOWER(l.league_name) LIKE '%indonesia%'
);
