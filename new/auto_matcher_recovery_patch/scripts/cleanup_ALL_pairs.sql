-- ================================================================
-- ПОЛНАЯ ОЧИСТКА ВСЕХ ПАР (лиги + команды)
-- ================================================================
-- Использование:
--   docker exec postgres_livebets psql -U matchingTeams -d matchingTeams \
--     -f /srv/big_value/backend/auto_matcher/scripts/cleanup_ALL_pairs.sql
-- ================================================================

BEGIN;

-- Статистика ДО очистки
DO $$
DECLARE
    leagues_count int;
    teams_count int;
BEGIN
    SELECT COUNT(*) INTO leagues_count FROM analyzer.leagues_merge;
    SELECT COUNT(*) INTO teams_count FROM analyzer.teams_merge;
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'ТЕКУЩЕЕ СОСТОЯНИЕ БД:';
    RAISE NOTICE 'Пар лиг:   % шт.', leagues_count;
    RAISE NOTICE 'Пар команд: % шт.', teams_count;
    RAISE NOTICE '=================================================';
END $$;

-- УДАЛЯЕМ ВСЕ ПАРЫ КОМАНД
DELETE FROM analyzer.teams_merge;

-- УДАЛЯЕМ ВСЕ ПАРЫ ЛИГ
DELETE FROM analyzer.leagues_merge;

-- Статистика ПОСЛЕ очистки
DO $$
DECLARE
    leagues_count int;
    teams_count int;
BEGIN
    SELECT COUNT(*) INTO leagues_count FROM analyzer.leagues_merge;
    SELECT COUNT(*) INTO teams_count FROM analyzer.teams_merge;
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'ОЧИСТКА ЗАВЕРШЕНА:';
    RAISE NOTICE 'Пар лиг:   % шт. (должно быть 0)', leagues_count;
    RAISE NOTICE 'Пар команд: % шт. (должно быть 0)', teams_count;
    RAISE NOTICE '=================================================';
    
    IF leagues_count > 0 OR teams_count > 0 THEN
        RAISE EXCEPTION 'ОШИБКА: Не все пары удалены!';
    END IF;
END $$;

COMMIT;

-- Проверка что БД пустая
SELECT 
    (SELECT COUNT(*) FROM analyzer.leagues_merge) as leagues_pairs,
    (SELECT COUNT(*) FROM analyzer.teams_merge) as teams_pairs;
