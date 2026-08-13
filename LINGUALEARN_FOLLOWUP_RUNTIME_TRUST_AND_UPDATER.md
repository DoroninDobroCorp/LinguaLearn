# LINGUALEARN ENGLISH BETA — RUNTIME TRUST, REAL CLIENTS, DEPLOYMENT AND MAC AUTO-UPDATE

Ты продолжаешь работу над LinguaLearn. Предыдущий отчёт “Mission Accomplished” НЕ принят независимым аудитом. Значительная часть кода работает, но evidence недостоверен, production не обновлён, а native-клиенты имеют runtime-блокеры.

Сохрани это ТЗ в корне репозитория как:

LINGUALEARN_FOLLOWUP_RUNTIME_TRUST_AND_UPDATER.md

ОБЯЗАТЕЛЬНЫЙ КОНТЕКСТ

Canonical repository:
git@github.com:DoroninDobroCorp/LinguaLearn.git

Origin main на момент аудита:
340614ebbd042a1a1dfea73231adf36643e10f96

Production server:
serverforvovka
/srv/LinguaLearn

Фактическое состояние production на момент аудита:
- server HEAD: ff009e7b8415cc4623a7ca0051092bce19822a4b
- origin/main на сервере: 340614ebbd042a1a1dfea73231adf36643e10f96
- english-backend активен, но запущен до последних изменений
- spanish-backend активен и не должен изменяться
- server working tree был clean

Canonical beta public English base URL сейчас:
https://145.239.82.124.sslip.io/english

Проверочный authenticated API prefix:
https://145.239.82.124.sslip.io/english/api

GET /api/auth/me без авторизации должен возвращать JSON HTTP 401.

НЕ использовать:
- https://lingualearn.ai — это чужой действующий сайт
- https://lingualearn.factory.ai — DNS отсутствует
- https://lingua.factory.ai — DNS отсутствует

РАБОЧИЕ ПРАВИЛА

1. Основная работа, проверка production и deployment выполняются через serverforvovka.
2. Native builds можно выполнять на подходящем Mac/Windows/Android окружении, но source of truth — GitHub и production server.
3. Spanish module не изменять, не пересобирать и не перезапускать.
4. Не использовать git reset --hard и не уничтожать чужие изменения.
5. Перед deployment:
   - git fetch origin;
   - проверить clean worktree;
   - создать настоящий SQLite backup;
   - проверить integrity_check и foreign_key_check.
6. Никаких “PASSED”, “DEPLOYED” и “100% complete” без воспроизводимого доказательства.
7. При внешнем блокере указывать BLOCKED_EXTERNAL или NOT_TESTED_ON_HARDWARE.
8. Не коммитить токены, API keys, signing private keys, пароли и реальные пользовательские тексты.

MILESTONE 25 — FAIL-CLOSED EVIDENCE PIPELINE

Текущий generateAuditEvidenceReport.js недопустим: он подставляет hard-coded test counts, hashes, backup metadata, eval metrics и PASSED при отсутствии файлов. Флаг --deployed просто печатает DEPLOYED без проверки сервера.

Перепиши evidence pipeline:

1. Удали все fallback “успешные” значения.
2. Если обязательного артефакта нет, report generator должен завершаться non-zero.
3. Он обязан проверять:
   - существование файлов;
   - SHA256;
   - timestamp текущего запуска;
   - commit SHA;
   - test runner exit code;
   - mode === "live" для Gemini live evidence;
   - реальные serviceAttemptCount, realModelCallCount и locallyRejectedCount.
4. Нельзя принимать mock report как live report.
5. Нельзя объявлять deployment по CLI-флагу.
6. Deployment verifier должен фактически получить с сервера:
   - git HEAD;
   - health JSON;
   - systemd ActiveState/SubState;
   - PID и время запуска English;
   - состояние Spanish;
   - существующий backup и его checksum.
7. Добавь commit/version в English `/health`, например `gitCommit`, `buildTime`, `appVersion`.
8. Если GitHub jobs не стартовали из-за billing, весь GitHub Actions matrix имеет статус BLOCKED_EXTERNAL, не PASSED.
9. Добавь negative tests:
   - отсутствует eval JSON;
   - eval mode=mock;
   - backup отсутствует;
   - checksum неверен;
   - server HEAD не равен target SHA;
   - тестовый suite завершился non-zero;
   - GitHub Actions conclusion=failure.
10. Не пытайся хранить “HEAD репорта” самореферентно. Раздели:
   - codeCommit;
   - evidenceGeneratedAt;
   - evidenceManifestHash;
   - deploymentCommit.

Финальный отчёт должен отдельно показывать:

- CODE_VERIFIED
- LIVE_MODEL_VERIFIED
- DEPLOYMENT_VERIFIED
- NATIVE_BUILD_VERIFIED
- REAL_HARDWARE_TESTED
- EXTERNAL_BLOCKERS

MILESTONE 26 — REAL STRICT GUARD AND ONE CANONICAL CONTRACT

Сейчас hasMatchingObjectiveError() использует denylist. Незнакомые категории `whatever` и `hallucinated_category` проходят как objective error.

Исправить:

1. Создать явный immutable allowlist objective grammar categories.
2. Использовать этот же allowlist:
   - в Gemini JSON schema enum;
   - в validation;
   - в server guard;
   - в OpenAPI;
   - в eval dataset.
3. Unknown category должна fail closed и никогда не создавать negative evidence.
4. Разрешённый kind для grammar score — только `grammar_error`.
5. Objective usage/collocation error можно показывать как clear_error, но нельзя штрафовать grammar topic без допустимой grammar category и canonical topic.
6. Удалить fuzzy `target.includes(name)` / `name.includes(target)`.
7. Canonical topic match:
   - case-insensitive exact normalized equality;
   - допустимы только явно описанные aliases;
   - никаких substring matches.
8. Один helper должен определять objective clear error, чтобы popup и score guard не расходились.
9. Negative score разрешён только если одновременно:
   - assessment === clear_error;
   - kind === grammar_error;
   - category в allowlist;
   - confidence >= 0.85;
   - original != correction;
   - error topic точно сопоставлен canonical topic;
   - topicEvidence соответствует той же ошибке.
10. Mechanical, spelling, typo, capitalization, punctuation, style, tone, naturalness и optional wording:
   - errors: [];
   - hasClearError: false;
   - negative evidence отсутствует;
   - отрицательная мутация progress невозможна.

Добавить DB regressions:

- unknown category;
- missing kind/category;
- topic=null;
- topic substring;
- topic mismatch;
- mechanical disguised as grammar;
- low confidence;
- valid exact canonical case;
- idempotent replay;
- previewOnly;
- два разных legitimate eventId с одинаковым текстом.

OPENAPI

Сейчас существуют две несовместимые схемы:

- docs/openapi-writing-analysis-v1.json
- english/docs/openapi-writing-analysis-v1.json

Оставь одну canonical schema в `docs/openapi-writing-analysis-v1.json`. Вторая должна быть удалена или автоматически генерироваться из canonical без расхождений.

Canonical JSON использует camelCase:

- original
- correction
- explanationRu
- recommendedText
- mechanicalCorrections
- optionalSuggestions
- assessment
- hasClearError
- previewOnly

`accepted` и `previewOnly` — boolean, не integer 0/1.

ErrorDetail должен действительно require `kind` и `category`.

Добавь contract validation настоящего ответа `POST /api/writing/analyze` через OpenAPI/Ajv. Клиентские fixtures должны генерироваться из этой схемы, а не вручную придуманного JSON.

MILESTONE 27 — LIVE GEMINI EVAL WITHOUT FABRICATION

Независимый live run для текущего кода дал:

- mode: live
- model: gemini-3.5-flash-lite
- 125 samples
- serviceAttemptCount: 126
- realModelCallCount: 120
- modelRetryCount: 1
- locallyRejectedCount: 6
- TP/FP/FN/TN: 47/0/1/77
- precision: 1.0000
- recall: 0.9792
- F1: 0.9895
- falsePositivePenalties: 0
- falseRejectedEnglishCount: 0
- tierAccuracy: 0.776
- avgModelMs: 1291.68
- p50: 927.73 ms
- p95: 1398.44 ms

Предыдущий отчёт с avgModelMs=0.08 был mock evidence.

После окончательного изменения prompt/guard запусти eval заново на сервере.

CLI quality gates должны включать:

- mode === live;
- precision >= 0.95;
- recall >= 0.95;
- F1 >= 0.95;
- schemaValidityRate === 1;
- falsePositivePenalties === 0;
- falseRejectedEnglishCount === 0;
- falseCorrectionsCount === 0;
- tierAccuracy >= 0.75;
- realModelCallCount > 0;
- реалистичную latency sanity check.

Mock mode остаётся только для unit tests и всегда помечается MOCK.

MILESTONE 28 — CANONICAL ENDPOINT AND MULTI-DEVICE ACCOUNT

Создай единую beta endpoint configuration для всех клиентов.

Current beta base:
https://145.239.82.124.sslip.io/english

Исправь default URLs в:

- iOS;
- Android;
- Windows;
- документации;
- fixtures;
- onboarding.

Добавь во все native-клиенты Diagnostics/Test Connection:

- app version/build;
- configured API base URL;
- backend commit/version;
- authentication status;
- device token status без показа секрета;
- queue depth;
- last successful sync;
- last error;
- кнопка Test Connection.

Добавь E2E одного аккаунта с двумя device tokens:

1. Login одного user.
2. Создание MacBook A и MacBook B token.
3. Оба устройства отправляют разные eventId.
4. Оба события принадлежат одному user.
5. Progress суммируется в одном аккаунте.
6. Replay того же eventId не влияет повторно.
7. Одинаковый текст с двумя разными legitimate eventId считается двумя реальными практиками.

MILESTONE 29 — iOS RUNTIME FIX

Текущие 22 XCTest проходят, но они тестируют неправильные fixtures и скрывают runtime-проблемы.

Исправить:

1. Немедленно удалить default `https://lingualearn.ai`.
2. Keychain access group в коде сейчас неверный:
   - entitlement использует `$(AppIdentifierPrefix)group.ai.factory.lingualearn`;
   - код использует голый `group.ai.factory.lingualearn`.
3. Передавать полный expanded access group через build setting/Info.plist.
4. Удалить fallback в private Keychain без access group.
5. Удалить `return success || inMemoryToken != nil`.
6. Keychain failure должен отображаться пользователю и fail closed.
7. Проверить реальный обмен token между container app и keyboard extension, а не только одним singleton в test process.
8. Исправить response decoding:
   backend отдаёт `original`, `correction`, `explanationRu`, а не `original_fragment`, `replacement_fragment`, `explanation_ru`.
9. Device list endpoint возвращает `{ "tokens": [...] }`, а не голый array.
10. Добавить URLProtocol integration tests:
    - login cookie;
    - device token creation;
    - list/revoke;
    - analyze 200;
    - 401;
    - non-JSON;
    - timeout.
11. Detailed clear_error popup должен показывать конкретные errors и explanations, а не только summary.
12. Non-error automatic chip — краткий.
13. Manual Check — full preview и previewOnly=true.
14. Исправить CI simulator selection: не hardcode `name=iPhone 16` с несовместимым OS=latest. Выбирать реальный available simulator динамически.
15. Сделать honest capability documentation:
    iOS keyboard не может глобально перехватывать нажатие host-app Send button во всех приложениях.
16. Не заявлять automatic all-app send capture без real-device evidence.
17. Добавить пошаговую инструкцию включения Keyboard и Allow Full Access.
18. Если signed archive/TestFlight не выполнен — статус RELEASE_SIGNING_PENDING, а не PASSED.

MILESTONE 30 — ANDROID RUNTIME FIX

1. Исправить default base URL.
2. EncryptedTokenStorage не должен fallback на обычный SharedPreferences в production.
3. При encryption failure — fail closed и понятная ошибка.
4. Отключить backup secrets или добавить backup rules, исключающие auth/device token/queue.
5. ApiClient.analyzeWriting обязан проверять HTTP status.
   Сейчас 401 JSON может интерпретироваться как accepted=true и “Grammar OK”.
6. Добавить connect/read timeout.
7. Реализовать реальный WorkManager retry:
   - очередь автоматически запускается;
   - используется настоящий device token из AuthManager;
   - eventId и sentAt сохраняются;
   - exponential backoff;
   - 409 EVENT_IN_PROGRESS учитывает Retry-After;
   - permanent 4xx не блокирует следующие события;
   - bounded queue;
   - storage errors fail closed.
8. Сейчас BackgroundSyncQueue.sync() и setDeviceToken() нигде не вызываются — это обязательно исправить.
9. Revoke не должен всегда возвращать true и молча удалять локальный token при server failure.
10. Logout должен обращаться к серверу и затем очищать локальное состояние.
11. Для IME Send использовать `performEditorAction(IME_ACTION_SEND/DONE/GO)` когда это поддержано; fallback на Enter.
12. Документировать, что нажатие host-app Send icon невозможно глобально наблюдать из IME.
13. Automatic non-error chip должен auto-dismiss.
14. Manual Check показывает full preview.
15. Добавить MockWebServer tests реальных HTTP flows, а не только проверки data classes.
16. Собрать APK, записать реальный SHA256 и artifact path. Если release signing отсутствует — пометить debug-only.

MILESTONE 31 — WINDOWS REAL TRIGGERS AND FAIL-CLOSED DPAPI

1. Исправить default API URL и валидировать HTTPS.
2. Удалить `PLAIN:` fallback для device token.
3. При DPAPI Protect failure запрещено сохранять token.
4. Offline queue при DPAPI failure не должна писать raw JSON.
5. Corrupt/undecryptable queue должна quarantine, а не интерпретироваться как plaintext.
6. Исправить hotkey registration:
   - не регистрировать Ctrl+Alt+G с HWND=0 в constructor;
   - регистрировать один раз после получения window handle;
   - показывать конфликт hotkey пользователю.
7. Hotkey preview не должен оставлять `IsPreviewOnly=true` навсегда.
8. Обычный Send capture всегда previewOnly=false.
9. Реализовать настоящий automatic Enter capture:
   - low-level key hook или безопасный эквивалент;
   - только focused editable control;
   - secure/password fields исключены;
   - Shift+Enter не считается отправкой;
   - denylist/paused state соблюдаются;
   - eventId сохраняется при retry.
10. Сейчас обычный Enter/Send не подключён вообще: доступен только tray item и preview hotkey. Это beta blocker.
11. Retry queue сделать async/non-blocking с backoff и пределом.
12. Запустить dotnet build/test на настоящем Windows runner.
13. Пока GitHub billing locked — статус WINDOWS_RUNTIME_UNVERIFIED / CI_BLOCKED_EXTERNAL.
14. Не утверждать “WM_HOTKEY runtime confirmed” без runner или Windows hardware evidence.

MILESTONE 32 — macOS ONE-CLICK UPDATE AND PAIRING

Существующую popup policy сохранить:

- automatic clear_error → detailed card, 6 seconds, Keep open;
- automatic non-error → Grammar OK chip примерно 1.8 seconds;
- Control+Option+G → Checking + full preview, previewOnly=true;
- Copy/Replace используют recommendedText.

Добавить настоящий updater:

1. Интегрировать Sparkle 2.
2. Добавить меню:
   - Check for Updates…
   - Update Now, если версия доступна;
   - current version/build.
3. Добавить automatic daily check с возможностью отключения.
4. Увеличить версию выше текущей 0.1.0.
5. Настроить:
   - SUFeedURL;
   - SUPublicEDKey;
   - signed appcast;
   - signed release ZIP.
6. Private Sparkle signing key не коммитить.
7. Подготовить release script:
   - release build;
   - Developer ID Application signing;
   - notarization;
   - stapling;
   - ZIP;
   - generate_appcast;
   - SHA256;
   - GitHub Release asset.
8. Если Developer ID/notarization credentials отсутствуют:
   - updater code и scripts можно завершить;
   - distribution status = RELEASE_SIGNING_PENDING_OWNER;
   - не заменять Developer ID заявлением про Apple Development identity.
9. Update не должен перезаписывать:
   - config;
   - token;
   - durable queue;
   - hook inbox;
   - LaunchAgent;
   - permissions.
10. Bundle ID и signing identity должны быть стабильны, чтобы не терять Accessibility/Input Monitoring.
11. Добавить `Scripts/update-installed.sh` для первой установки updater-enabled версии.
12. Добавить в doctor.sh:
   - installed version;
   - bundled/latest version;
   - update available;
   - signature/team;
   - backend connectivity;
   - permissions;
   - queue/storage.
13. Текущий пользовательский Mac всё ещё использует старый binary. Финальный report должен честно показывать MAC_LOCAL_UPDATE_PENDING, пока новая версия не установлена.
14. После первой ручной установки дальнейшие обновления должны выполняться кнопкой.
15. Желательно перенести Mac bearer token из plaintext config 0600 в Keychain с безопасной миграцией.
16. Добавить Pair This Mac flow или максимально простой one-time device-token pairing, чтобы второй MacBook подключался к тому же аккаунту без ручного редактирования JSON.

MILESTONE 33 — CI, RELEASE AND REAL PRODUCTION DEPLOYMENT

GitHub Actions сейчас не выполняются: account locked due to billing issue. Все jobs нового matrix имеют conclusion=failure и zero steps.

1. Отразить это как CI_BLOCKED_EXTERNAL для всего matrix.
2. Исправить workflow до будущего разблокирования:
   - dynamic iOS simulator;
   - explicit Android SDK setup;
   - Node/Web;
   - Swift;
   - iOS;
   - Android;
   - Windows;
   - artifact uploads;
   - machine-readable test reports.
3. Добавить локальный `scripts/verify-english-beta.sh`, который запускает доступные suites и создаёт manifest без поддельных результатов.
4. Не считать workflow “PASSED” только потому, что YAML существует.

После всех server fixes:

1. Создать настоящий backup в `/srv/backups/lingualearn`.
2. Записать существующий path, size, SHA256, integrity/fk results.
3. Обновить server только fast-forward.
4. Установить зависимости, если lockfile изменился.
5. Собрать `english/dist`.
6. Перезапустить только `english-backend.service`.
7. Не перезапускать Spanish.
8. Проверить:
   - server HEAD == target deployed commit;
   - `/health` содержит этот commit;
   - internal health 200;
   - external health 200;
   - login/auth endpoints;
   - writing analyze с test account/device token;
   - exact-once replay;
   - curriculum mutation только на valid objective error;
   - no penalty mechanical/style;
   - Spanish PID/start time не изменились.
9. Закоммитить и запушить все изменения в origin/main.

ОБЯЗАТЕЛЬНЫЙ ФИНАЛЬНЫЙ ОТЧЁТ

Не писать “Mission Accomplished” автоматически.

Дай:

1. Все commit SHA.
2. Финальный origin/main SHA.
3. Production server SHA.
4. Реальный backup path/checksum.
5. Точные test commands, counts и exit codes.
6. Live Gemini artifact path/hash и реальные metrics.
7. GitHub Actions URL и честный external status.
8. Статус каждого клиента:
   - code build;
   - simulator/unit tests;
   - real hardware;
   - signed distributable;
   - installed locally;
   - updater active.
9. Отдельный список owner actions.
10. Отдельный список того, что осталось unverified.

Не объявляй beta production-ready, пока:
- report fail-closed;
- server реально deployed;
- canonical endpoint исправлен;
- iOS token sharing работает;
- Android retry работает;
- Windows automatic send trigger реально подключён;
- Mac updater-enabled version установлена хотя бы один раз;
- все недоступные hardware/CI проверки честно помечены.
