#!/bin/bash
# ================================================================
# МОНИТОРИНГ АВТОМАТЧИНГА
# ================================================================
# Проверяет логи auto_matcher на ключевые события
# ================================================================

echo "========================================"
echo "📊 МОНИТОРИНГ АВТОМАТЧИНГА"
echo "========================================"

# Проверка что контейнер работает
echo ""
echo "1️⃣  Статус контейнера:"
docker ps --filter name=auto_matcher --format "table {{.Names}}\t{{.Status}}" | head -2

if ! docker ps --filter name=auto_matcher | grep -q auto_matcher; then
    echo "❌ Контейнер auto_matcher НЕ работает!"
    exit 1
fi

echo "✅ Контейнер работает"

# Проверка health API
echo ""
echo "2️⃣  Health API:"
HEALTH=$(curl -s http://localhost:7050/health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "$HEALTH" | jq .
    echo "✅ Health API отвечает"
else
    echo "⚠️ Health API не отвечает"
fi

# Последние сопоставления команд
echo ""
echo "3️⃣  Последние TEAM MATCHED (последние 10):"
docker logs auto_matcher 2>&1 | grep "TEAM MATCHED" | tail -10

# Отклонённые пары
echo ""
echo "4️⃣  Отклонённые пары (последние 10):"
docker logs auto_matcher 2>&1 | grep -E "REJECTED|team name not found" | tail -10

# Honduras Reserve League специально
echo ""
echo "5️⃣  Honduras Reserve League - проверка:"
docker logs auto_matcher 2>&1 | grep -i "honduras" | grep -E "victoria|olancho|espana" | tail -20

# Ошибки
echo ""
echo "6️⃣  Ошибки (последние 10):"
docker logs auto_matcher 2>&1 | grep -i "error" | tail -10

# Статистика из БД
echo ""
echo "7️⃣  Статистика пар в БД:"
docker exec postgres_livebets psql -U matchingTeams -d matchingTeams -c "
SELECT 
    (SELECT COUNT(*) FROM analyzer.leagues_merge) as leagues_pairs,
    (SELECT COUNT(*) FROM analyzer.teams_merge) as teams_pairs;
"

# Honduras пары специально
echo ""
echo "8️⃣  Honduras Reserve League - пары в БД:"
docker exec postgres_livebets psql -U matchingTeams -d matchingTeams -c "
SELECT 
    t1.team_name as team1,
    t2.team_name as team2,
    l1.bookmaker_name as bk1,
    l2.bookmaker_name as bk2,
    tm.created_at
FROM analyzer.teams_merge tm
JOIN analyzer.teams t1 ON tm.team1_id = t1.id
JOIN analyzer.teams t2 ON tm.team2_id = t2.id
JOIN analyzer.leagues l1 ON t1.league_id = l1.id
JOIN analyzer.leagues l2 ON t2.league_id = l2.id
WHERE (t1.team_name ILIKE '%victoria%' OR t2.team_name ILIKE '%victoria%'
       OR t1.team_name ILIKE '%olancho%' OR t2.team_name ILIKE '%olancho%'
       OR t1.team_name ILIKE '%espana%' OR t2.team_name ILIKE '%espana%')
  AND l1.sport_name = 'Soccer'
ORDER BY tm.created_at DESC
LIMIT 10;
"

echo ""
echo "========================================"
echo "✅ МОНИТОРИНГ ЗАВЕРШЁН"
echo "========================================"
echo ""
echo "💡 Для live мониторинга:"
echo "   docker logs auto_matcher -f | grep -E 'TEAM MATCHED|REJECTED|victoria|olancho'"
echo ""
