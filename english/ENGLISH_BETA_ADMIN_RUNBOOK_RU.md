# Руководство администратора LinguaLearn English Beta (Admin Runbook)

Данный документ описывает регламент эксплуатации, администрирования, резервного копирования, обновления и устранения неполадок системы **LinguaLearn English** в рамках закрытого бета-тестирования на 10–20 пользователей.

---

## 1. Архитектура и инфраструктурные границы

* **Сервер**: Ubuntu Linux (`serverforvovka`).
* **Рабочая директория**: `/srv/LinguaLearn/english`.
* **Сервис бэкенда**: `english-backend.service` (Node.js Express на порту `3001`).
* **Фронтенд**: Статическая сборка Vite React в `/srv/LinguaLearn/english/dist/`, обслуживаемая Nginx по пути `/english/`.
* **API Проксирование**: Nginx маршрутизирует `/english/api/` -> `http://127.0.0.1:3001/api/`.
* **База данных**: SQLite3 (`/srv/LinguaLearn/english/server/english_learning.db`), режим WAL, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`.

### ⚠️ Критическое правило изоляции (Spanish Module Boundary)
Испанский модуль (`/srv/LinguaLearn/spanish`), сервис `spanish-backend.service` на порту **3003** и веб-маршрут `/spanish/` являются **строго неприкосновенными**. Любые изменения файлов, перезапуски или модификации базы данных испанского модуля категорически запрещены.

---

## 2. Утилита администрирования (Admin CLI)

Все операции управления пользователями, инвайтами и метриками осуществляются через скрипт `server/scripts/admin.js`:

```bash
# Переход в директорию проекта
cd /srv/LinguaLearn/english
```

### Команды CLI:

1. **Инициализация владельца (Bootstrap Owner)**:
   ```bash
   node server/scripts/admin.js bootstrap-owner
   ```
   Создает первичную учетную запись владельца (`role = 'owner'`) или проверяет ее существование.

2. **Создание инвайт-кода для нового бета-тестировщика**:
   ```bash
   node server/scripts/admin.js create-invite
   ```
   Генерирует уникальный одноразовый инвайт-код (вида `INV-XXXX-XXXX`), который передается новому пользователю для регистрации на `/login`.

3. **Просмотр списка пользователей (List Users)**:
   ```bash
   node server/scripts/admin.js list-users
   ```
   Выводит форматированную таблицу со списком пользователей: `id`, `email`, `role`, `status`, количество подключенных устройств и дату последней активности. При этом хеши паролей и токены сессий строго скрыты.

4. **Деактивация пользователя (Deactivate User)**:
   ```bash
   node server/scripts/admin.js deactivate-user --email="user@example.com"
   ```
   Устанавливает статус пользователя `deactivated` и немедленно принудительно удаляет все его активные сессии из таблицы `sessions`.

5. **Сброс пароля пользователя (Reset Password)**:
   ```bash
   node server/scripts/admin.js reset-password --email="user@example.com" --password="NewSecurePassword123!"
   ```
   Хеширует новый пароль через bcrypt, обновляет запись в базе и завершает все активные сессии пользователя для обеспечения безопасности.

6. **Агрегированные метрики системы (System Metrics)**:
   ```bash
   node server/scripts/admin.js metrics
   ```
   Выводит общую статистику системы: количество пользователей, активных устройств, число проанализированных предложений, пройденных сессий тренировок и обратной связи без раскрытия персональных данных и сырого текста.

---

## 3. Обслуживание базы данных и резервное копирование

### Транзакционное онлайн-резервное копирование базы данных:
Перед обновлением сервиса, накатыванием миграций или ручными изменениями выполните скрипт горячего резервного копирования:

```bash
cd /srv/LinguaLearn/english
node server/scripts/backupDatabase.js
```
*Скрипт использует API SQLite Online Backup (`VACUUM INTO`), проверяет `PRAGMA integrity_check;` и `PRAGMA foreign_key_check;`, сохраняет копию с хэшем Git коммита в `/srv/backups/lingualearn/` и подтверждает успешность восстановления.*

### Проверка целостности базы данных вручную:
```bash
sqlite3 server/english_learning.db "PRAGMA integrity_check;"
sqlite3 server/english_learning.db "PRAGMA foreign_key_check;"
```

### Периодическая очистка сырого текста (Retention Cleanup Systemd Service & Timer):
Очистка устаревшего текста (`original_text = NULL`, `retention_purged = 1`) управляется автоматическим ежедневным таймером `systemd` (запуск в 03:00 UTC):

```bash
# Ручной запуск очистки текста при необходимости
node server/scripts/retentionCleanup.js

# Проверка статуса таймера очистки в systemd
systemctl status lingualearn-retention.timer
```

### Оценка качества анализа и модельный бенчмарк (Gemini 3.5 Flash-Lite Eval Harness):
Скрипты для бенчмаркинга качества грамматического анализа, точности исправлений и задержек моделей Gemini:

```bash
# Оценка точности исправлений предложений
node server/scripts/evalWritingAnalysis.js

# Запуск полного модельного бенчмарка Gemini 3.5 Flash-Lite
node server/scripts/evalGeminiModel.js
```

---

## 4. Регламент развертывания (Production Deployment Runbook)

При выкатке новой версии системы на сервере выполните следующие шаги:

```bash
cd /srv/LinguaLearn/english

# Шаг 1: Создание горячего резервного копирования базы данных
node server/scripts/backupDatabase.js

# Шаг 2: Прогон полного набора автоматических тестов бэкенда
node --test tests/*.test.mjs

# Шаг 3: Прогон кроссплатформенных контрактов интеграционного тестирования (Mac, iOS, Android, Windows)
node tests/e2e-cross-platform-contract.test.mjs

# Шаг 4: Прогон сквозных тестов изоляции
node tests/e2e-beta-isolation.test.mjs

# Шаг 5: Сборка фронтенда Vite (генерация директории dist)
npm run build

# Шаг 6: Перезапуск системного сервиса бэкенда
sudo systemctl restart english-backend.service

# Шаг 7: Проверка статуса сервиса
systemctl status english-backend.service --no-pager

# Шаг 8: Верификация шлюзов безопасности и API
curl -s -o /dev/null -w "Health check status: %{http_code}\n" http://localhost:3001/health
curl -s -i http://localhost:3001/api/curriculum | head -n 5  # Должен возвращать HTTP 401

# Шаг 9: Верификация сохранности испанского модуля
curl -s -o /dev/null -w "Spanish backend status: %{http_code}\n" http://localhost:3003/health
```

---

## 5. Мониторинг, логирование и устранение неполадок

### Просмотр логов бэкенда в реальном времени:
```bash
journalctl -u english-backend.service -f -n 100
```

### Мониторинг задержек Gemini 2.5 Flash:
Сервер логирует структурированные метрики времени отклика:
`{"type":"writing_analysis_latency","eventId":"...","userId":1,"latencyMs":{"queue":...,"model":...,"db":...,"total":...}}`.
По ним можно отслеживать p50/p95 времени ответа нейросети.

### Снятие блокировки по Rate Limit:
Если пользователь превысил 10 неудачных попыток входа за 15 минут, блокировка сбрасывается автоматически по истечении тайм-аута. При необходимости срочного сброса перезапустите сервис `english-backend.service` (лимиты хранятся в оперативной памяти).

### Процедура экстренного отката (Rollback):
В случае обнаружения критической ошибки после деплоя:
```bash
# 1. Остановка сервиса
sudo systemctl stop english-backend.service

# 2. Восстановление базы данных из бэкапа
cp server/english_learning.db.backup-<TIMESTAMP> server/english_learning.db

# 3. Пересборка или возврат предыдущей версии кода
git checkout <PREVIOUS_STABLE_COMMIT>
npm run build

# 4. Запуск сервиса
sudo systemctl start english-backend.service
```
