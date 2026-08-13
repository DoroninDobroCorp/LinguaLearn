# Пошаговое руководство для владельца продукта (NEXT_STEPS_FOR_OWNER_RU.md)

Настоящее руководство предназначено для владельца продукта **LinguaLearn English** и содержит исчерпывающие пошаговые инструкции по администрированию системы, развертыванию кроссплатформенных клиентов (Mac, iOS, Android, Windows), обслуживанию базы данных, проведению тестирования, запуску продакшен-сервисов и подготовке приложений к публикации в магазинах.

---

## 1. Обзор системы и архитектурные границы

**LinguaLearn English** — это персонализированная обучающая платформа для изучающих английский язык (уровни B1-B2). Система автоматически анализирует письменную речь пользователя на разных устройствах, выявляет грамматические и лексические ошибки с помощью моделей Google Gemini, ведет доказательную базу прогресса (`user_topic_progress`) и генерирует ежедневные короткие сессии тренировок (`Today Practice`).

### Инфраструктура продакшена:
* **Remote Server**: Ubuntu Linux (`serverforvovka`).
* **Директория бэкенда**: `/srv/LinguaLearn/english`.
* **Порт бэкенда**: `http://127.0.0.1:3001` (сервис `english-backend.service`).
* **Веб-интерфейс (SPA)**: Статическая Vite-сборка в `/srv/LinguaLearn/english/dist/`, доступная по Nginx `/english/`.
* **База данных**: SQLite3 в `/srv/LinguaLearn/english/server/english_learning.db` (WAL mode, foreign keys active).
* **Неприкосновенная граница (Spanish Module Boundary)**:
  Испанский модуль в `/srv/LinguaLearn/spanish` (`spanish-backend.service`, порт 3003) является **100% автономным**. Изменения в нем запрещены.

---

## 2. Администрирование пользователей и CLI утилита

Управление пользователями, бета-инвайтами и метриками осуществляется через консольный скрипт `server/scripts/admin.js`:

```bash
ssh serverforvovka
cd /srv/LinguaLearn/english
```

### Пошаговые команды CLI:

1. **Первичная инициализация владельца (Bootstrap Owner)**:
   ```bash
   node server/scripts/admin.js bootstrap-owner
   ```
   *Проверяет наличие или создает первичный аккаунт владельца со статусом `owner`.*

2. **Выпуск инвайт-кодов для бета-тестировщиков (Create Invite)**:
   ```bash
   node server/scripts/admin.js create-invite
   ```
   *Генерирует уникальный одноразовый код (вида `INV-XXXX-XXXX`). Передайте этот код новому пользователю для регистрации на страницах `/english/login` или `/english/signup`.*

3. **Просмотр списка бета-пользователей (List Users)**:
   ```bash
   node server/scripts/admin.js list-users
   ```
   *Отображает форматированную таблицу пользователей с их ID, email, ролями, статусами, количеством привязанных устройств и временем последней активности. Пароли и токены автоматически маскируются.*

4. **Деактивация пользователя при необходимости (Deactivate User)**:
   ```bash
   node server/scripts/admin.js deactivate-user --email="user@example.com"
   ```
   *Переводит учетную запись в статус `deactivated` и атомарно аннулирует все ее активные сессии в базе данных.*

5. **Безопасный сброс пароля (Reset Password)**:
   ```bash
   node server/scripts/admin.js reset-password --email="user@example.com" --password="NewStrongPassword123!"
   ```
   *Хеширует новый пароль с использованием bcrypt и сбрасывает все активные токены сессий данного пользователя.*

6. **Просмотр агрегированных системных метрик (System Metrics)**:
   ```bash
   node server/scripts/admin.js metrics
   ```
   *Выводит обезличенную статистику использования: общее число предложений, процент исправленных ошибок, активность по тренировкам и количество устройств.*

---

## 3. Регламент развертывания и сборки (Production Deployment)

Перед каждым обновлением бэкенда или веб-клиента выполняйте следующий стандартный цикл развертывания:

### Пошаговый алгоритм:

1. **Подключение к серверу и переход в директорию проекта**:
   ```bash
   ssh serverforvovka
   cd /srv/LinguaLearn/english
   ```

2. **Создание горячей резервной копии SQLite базы данных**:
   ```bash
   node server/scripts/backupDatabase.js
   ```
   *Скрипт использует API SQLite Online Backup (`VACUUM INTO`), проверяет прагмы целостности `PRAGMA integrity_check;` и `PRAGMA foreign_key_check;` и сохраняет снимок с хэшем коммита в `/srv/backups/lingualearn/`.*

3. **Запуск автоматических тестов бэкенда, кроссплатформенных контрактов и строгой коррекции**:
   ```bash
   node --test tests/*.test.mjs
   node tests/e2e-cross-platform-contract.test.mjs
   node tests/e2e-followup-strict-corrections.test.mjs
   ```
   *Все тесты должны завершаться со 100% успехом (exit code 0).*

4. **Сборка фронтенд-приложения Vite**:
   ```bash
   npm run build
   ```
   *Генерирует оптимизированные клиентские бандлы в директории `dist/`.*

5. **Перезапуск продакшен-сервиса бэкенда**:
   ```bash
   sudo systemctl restart english-backend.service
   ```

6. **Проверка здоровья продакшен-сервиса (Health Check)**:
   ```bash
   curl -sf http://localhost:3001/health
   ```
   *Должен возвращать HTTP статус `200 OK` с сообщением `{"status":"ok"}`.*

7. **Проверка неприкосновенности испанского модуля**:
   ```bash
   curl -sf http://localhost:3003/health
   ```
   *Должен возвращать HTTP статус `200 OK`.*

---

## 4. Развертывание клиентских приложений на устройствах (Mac, iOS, Android, Windows)

Все клиенты используют единый специфицированный API-контракт версии 1 (`schemaVersion: 1`), определенный в `docs/openapi-writing-analysis-v1.json`, и аутентифицируются по токенам устройств `Authorization: Bearer ll_dev_...`.

### 4.1. Mac Desktop Client (`macos/LinguaLearnCapture`)
- **Сборка и локальный запуск**:
  ```bash
  cd macos/LinguaLearnCapture
  swift build -c release
  ```
- **Привязка устройства**:
  1. Войдите в веб-кабинет на `/english/settings/devices`.
  2. Нажмите «Сгенерировать токен устройства» и введите название (например, "MacBook Pro Owner").
  3. Скопируйте полученный токен `ll_dev_...`.
  4. Сохраните токен в конфигурации клиента: `defaults write ai.factory.lingualearn.capture DeviceToken "ll_dev_..."`.

### 4.2. iOS App & Custom Keyboard Extension (`ios/LinguaLearn`)
- **Структура**: Проект Xcode содержащий Container App и Keyboard Extension.
- **Подготовка сборки**:
  ```bash
  cd ios/LinguaLearn
  xcodegen generate # Использование project.yml
  ```
- **Конфигурация App Group**:
  Настройте единый App Group Идентификатор `group.ai.factory.lingualearn` для контейнерного приложения и расширения клавиатуры.
- **Распространение**:
  Соберите архив `.ipa` и загрузите в Apple TestFlight для внутреннего бета-тестирования владельца и команды.

### 4.3. Android App & IME Keyboard Service (`android/LinguaLearn`)
- **Сборка APK / Bundle**:
  ```bash
  cd android/LinguaLearn
  ./gradlew assembleRelease
  ```
- **Установка клавиатуры**:
  1. Установите полученный APK файл.
  2. В настройках Android («Язык и ввод» -> «Виртуальная клавиатура») включите **LinguaLearn IME Keyboard Service**.
  3. В приложении воспользуйтесь экраном привязки токена устройства.

### 4.4. Windows Desktop Agent (`windows/LinguaLearnAgent`)
- **Сборка .NET Приложения**:
  ```bash
  cd windows/LinguaLearnAgent
  dotnet build -c Release
  ```
- **Функционал агент-сервиса**:
  Приложение сворачивается в системный трей, отслеживает текстовые поля через UI Automation и поддерживает режим предварительного просмотра по горячим клавишам (`Ctrl+Shift+E`).

---

## 5. Обслуживание базы данных, бэкапы и автоматическая очистка

### 5.1. Регулярные бэкапы SQLite
Скрипт `server/scripts/backupDatabase.js` осуществляет транзакционное горячее резервное копирование базы данных без блокировки читателей и писателей WAL:
```bash
node server/scripts/backupDatabase.js
```
Бэкапы сохраняются в директорию `/srv/backups/lingualearn/` и содержат метаданные текущего Git коммита.

### 5.2. Автоматическая система очистки сырого текста (Retention Clean-up)
В системе развернута служба и таймер `systemd`:
* `lingualearn-retention.service`
* `lingualearn-retention.timer` (ежедневный запуск в 03:00 UTC)

Таймер проверяет настройки срока хранения каждого пользователя (0, 7 или 30 дней) и удаляет поле `original_text` (`original_text = NULL`, `retention_purged = 1`) для устаревших записей, сохраняя записи грамматических ошибок (`grammar_evidence`) для точности обучения.

Проверить статус таймера можно командой:
```bash
systemctl status lingualearn-retention.timer
```

---

## 6. Оценка качества нейросети и модельный бенчмарк

Бэкенд использует модель **Gemini 3.5 Flash-Lite** (`GEMINI_WRITING_MODEL=gemini-3.5-flash-lite`) с 4-уровневой семантической оценкой (`clear_error`, `mechanical_only`, `acceptable`, `correct`), серверным гардом доказательств (блокировка снижения баллов для опечаток и стиля; порог уверенности $\ge 0.85$ для реальных ошибок) и автоматически настроенным фолбэком на `gemini-2.5-flash`.

Для периодической оценки качества исправлений и контроля задержек запускайте скрипты тестирования:
```bash
# Оценка точности и релевантности исправлений
node server/scripts/evalWritingAnalysis.js

# Сравнительный синтетический модельный бенчмарк Gemini
node server/scripts/evalGeminiModel.js

# Живая оценка точности и отсутствия ложных штрафов по живому Gemini API (60+ B1-B2 кейсов)
node server/scripts/evalGeminiModelLive.js
```
Результаты сохраняются в форматированные отчеты `server/reports/eval-gemini-model.json` и `server/reports/eval-gemini-live.json`.

---

## 7. Опросники конфиденциальности для магазинов приложений (Store Privacy Questionnaires)

При заполнении карточек приложений в App Store, Google Play и Microsoft Store используйте следующие сведения из нашей декларации конфиденциальности (подробности в `docs/STORE_PRIVACY_QUESTIONNAIRES_RU.md`):

### 7.1. Apple App Store Privacy Nutrition Labels (`PrivacyInfo.xcprivacy`)
* **Типы собираемых данных**:
  * *User Content (Text)*: Собирается исключительно для грамматического анализа.
  * *Identifiers (Device Token)*: Используется для привязки к аккаунту.
  * *Diagnostics (Performance metrics)*: Обезличенные метрики задержки анализа.
* **Привязка к личности**: Данные привязаны к `user_id`. Данные НЕ используются для трекинга или передачи третьим лицам.
* **Срок хранения**: Настраивается пользователем (0, 7 или 30 дней).

### 7.2. Google Play Data Safety
* **Шифрование данных**: Все данные передаются по защищенному каналу HTTPS/TLS 1.3.
* **Удаление данных**: Система поддерживает удаление аккаунта (`DELETE /api/user/account`), при котором удаляются все данные из 11 связанных таблиц.
* **Отказ от трекинга**: Приложение не содержит сторонних рекламных SDK и трекеров.

### 7.3. Microsoft Store Privacy & Data Collection
* **UI Automation Edit Capture**: Отслеживание текста выполняется локально на устройстве клиента с фильтрацией паролей и личных данных перед отправкой.
* **Consent Control**: В трее предусмотрена кнопка паузы перехвата («Pause Capture»).

---

## 8. Чек-лист проверки перед передачей бета-тестировщикам

- [x] Бэкенд сервис `english-backend.service` активен на порту 3001 (`curl -sf http://localhost:3001/health` -> 200 OK).
- [x] Модуль `spanish-backend.service` на порту 3003 активен и не поврежден.
- [x] Интеграционные тесты контрактов (`node tests/e2e-cross-platform-contract.test.mjs`) пройдены на 100%.
- [x] Интеграционные тесты 4-уровневой строгой коррекции (`node tests/e2e-followup-strict-corrections.test.mjs`) пройдены на 100%.
- [x] Сборка Vite фронтенда (`dist/`) выполнена без ошибок.
- [x] Создан аккаунт владельца (`node server/scripts/admin.js bootstrap-owner`).
- [x] Сгенерированы инвайт-коды для первой группы тестировщиков.
- [x] Проверены защищенные роуты (запросы без сессии возвращают HTTP 401 Unauthorized).
- [x] Служба ежедневной очистки текста `lingualearn-retention.timer` находится в состоянии waiting.
