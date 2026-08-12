# ТЗ автономному исполнителю: LinguaLearn English Beta + iPhone + Android + Windows

> **Обязательное продолжение:** после аудита результата `78b76d3` выполняй
> [`LINGUALEARN_FOLLOWUP_STRICT_CORRECTIONS.md`](LINGUALEARN_FOLLOWUP_STRICT_CORRECTIONS.md).
> При противоречии follow-up имеет приоритет; исходное Definition of Done ещё не достигнуто.

Ты — ведущий инженер, архитектор, QA и DevOps проекта LinguaLearn. Твоя задача — не написать обзор и не ограничиться рекомендациями, а самостоятельно довести английский модуль и его клиенты до максимально готового, воспроизводимого состояния закрытой беты, реализовать недостающие части, проверить их и задокументировать результат.

Работай автономно до достижения критериев приёмки. Не проси владельца выполнять команды, тестировать каждую мелочь или принимать промежуточные технические решения, если можешь безопасно проверить и решить это сам. Вопрос владельцу допустим только при настоящем внешнем блокере: юридическое соглашение, 2FA, неизвестный Team ID, публикация в публичный магазин, платёж или необратимое действие. Наличие ручного финального UX-теста не является причиной прекратить остальную работу.

## 1. Где находится источник истины

- Production-сервер доступен по SSH alias `serverforvovka`.
- Git-репозиторий production: `/srv/LinguaLearn`.
- Английский модуль: `/srv/LinguaLearn/english`.
- Английский backend: `english-backend.service`, localhost port `3001`, внешний префикс `/english/`.
- Испанский модуль: `/srv/LinguaLearn/spanish`, `spanish-backend.service`, port `3003`.
- Mac-клиент уже существует; сначала найди его актуальное местоположение и историю в репозитории. Ожидаемая папка — `macos/LinguaLearnCapture`, но не делай предположений вместо проверки.
- Не используй случайную локальную или устаревшую копию как источник истины. Все изменения production backend выполняй в `/srv/LinguaLearn` после проверки текущего состояния.

Перед началом прочитай полностью:

- `english/ENGLISH_ARCHITECTURE.md`
- `english/ENGLISH_BETA_ADMIN_RUNBOOK_RU.md`
- `english/ENGLISH_BETA_MANUAL_CHECKLIST_RU.md`
- `english/ENGLISH_BETA_TESTER_GUIDE_RU.md`
- README и инструкции Mac-клиента
- актуальный `git status`, `git log`, systemd units, Nginx-конфигурацию и схему БД.

## 2. Неприкосновенные ограничения

1. Испанский модуль не изменять: никаких правок файлов, миграций, сборок или перезапусков Spanish. Разрешены только read-only health-check до и после работы.
2. Не терять текущие пользовательские данные, device tokens, историю, curriculum и grammar evidence.
3. Не выполнять `git reset --hard`, destructive checkout, массовое удаление или перезапись dirty working tree.
4. Не выводить API keys, device tokens, пароли, cookies или исходные пользовательские сообщения в terminal output, git, telemetry и отчёты.
5. Не отправлять приложение на публичную модерацию App Store/Google Play/Microsoft Store без отдельного явного решения владельца. Можно подготовить полностью подписываемые проекты, archives/packages и внутренние beta builds. Если App Store Connect уже настроен и не требуется новое юридическое согласие, разрешается подготовить или загрузить internal TestFlight build, но не делать публичный release.
6. Никогда не анализировать password/secure fields. Не использовать скрытый keylogging.
7. Не обещать «100% всех приложений». Честно фиксировать ограничения нестандартных редакторов и политик каждой ОС.
8. Все изменения схемы БД — только идемпотентными миграциями, с проверенной возможностью повторного старта.
9. Production deploy — только после backup, автоматических тестов и clean build из tracked-файлов.

## 3. Текущее подтверждённое состояние и известные несоответствия

На момент постановки задачи:

- production HEAD: `374538b`;
- production находится на 21 commit впереди `origin/main`;
- `node --test tests/*.test.mjs` воспроизводимо даёт 116/116 passing;
- clean frontend build из `git archive HEAD` проходит;
- `english-backend.service` и `spanish-backend.service` активны;
- приватные English API без авторизации отвечают 401;
- в working tree было около 69 untracked-позиций, включая дубликаты исходников, cache и DB backup-файлы;
- ручной beta checklist пока не отмечен как пройденный;
- регулярный retention cleanup timer/cron не был найден;
- production SQLite работает в WAL-режиме, поэтому описанный в старом runbook простой `cp database.db` во время работы небезопасен;
- text chat и Reader используют `gemini-3.5-flash-lite`, но после большой beta-доработки writing analyzer снова имеет default `gemini-2.5-flash`;
- заявленные p50/p95 нужно подтвердить сохранённым machine-readable результатом, а не текстом без артефакта.

Не считай этот список абсолютной истиной: перепроверь каждый пункт и зафиксируй расхождения.

## 4. Общая продуктовая цель

Один аккаунт LinguaLearn должен объединять реальную письменную практику пользователя на Mac, iPhone, Android и Windows:

1. Пользователь пишет английское предложение.
2. При ручном preview до отправки сразу видит состояние `Checking…`.
3. Получает исправленный вариант, короткое русское объяснение и темы CEFR.
4. Может заменить исходный текст исправленным, скопировать его или отправить исходный — клиент никогда не отправляет исправленный текст адресату без явного действия пользователя.
5. При обычной отправке принятое предложение ровно один раз становится evidence и влияет на общий curriculum.
6. Preview не влияет на прогресс.
7. Все устройства одного пользователя обновляют один Correction Inbox, Today Practice и progress.
8. Пароли, secure fields, URL-only, code, отдельные слова и запрещённые приложения не анализируются.
9. Пользователь может поставить capture на паузу, отозвать отдельное устройство, удалить/экспортировать данные и отменить ошибочное влияние correction на progress.

Базовый кандидат-фильтр: преимущественно английская проза, минимум два английских слова и осмысленная граница предложения (`.`, `!`, `?`) либо не менее четырёх слов для preview. Не считать десятичную точку в `1.2` концом предложения. Фильтр должен быть общим и протестированным; клиенты могут сделать ранний privacy-filter, но сервер остаётся окончательным валидатором.

## 5. Этап A — привести server production в надёжное состояние

### 5.1 Безопасная инвентаризация и Git

- Зафиксируй текущие HEAD/origin, branch, remotes, dirty files, systemd, Nginx, DB files и active PIDs.
- Классифицируй каждый untracked-файл: нужный исходник, дубликат, test artifact, cache, runtime data, backup или секрет.
- Не удаляй резервные копии. Перемести их в отдельную защищённую backup-директорию вне git worktree, например `/srv/backups/lingualearn/`, с понятными именами и правами. Сначала проверь целостность.
- Добавь корректные `.gitignore` для runtime SQLite sidecars, backups, caches, Python cache, Playwright artifacts, IDE files и generated reports, но не скрывай настоящие исходники.
- Удали дубли исходников из корня `english/` только после доказательства, что они не используются и идентичны/устарели. Сохрани нужную работу.
- Получи чистый воспроизводимый `git status` без runtime-мусора.
- Сохрани 21 существующий commit, создай дополнительные небольшие логические commits. После всех проверок push в `origin/main` либо безопасную согласованную ветку с явным финальным указанием. Не оставляй production единственным местом, где хранится работа.

### 5.2 Backup и rollback

- Замени небезопасную инструкцию `cp` работающей SQLite на SQLite Online Backup (`sqlite3 .backup`, `VACUUM INTO` при подходящих условиях или `better-sqlite3` backup API).
- Проверяй `PRAGMA integrity_check` и `PRAGMA foreign_key_check` для production и backup.
- Backup должен включать timestamp, commit SHA и checksum; права не шире необходимого.
- Реально проверь процедуру восстановления на временной копии, не разрушая production.
- Обнови runbook и rollback-инструкцию. Не использовать `git checkout main~N` как долгосрочную стратегию; указывать точный verified commit/tag.

### 5.3 Retention и privacy operations

- Установи отдельные systemd service+timer для `retentionCleanup.js` раз в сутки.
- Сделай запуск idempotent, с lock от параллельного выполнения, структурированным итогом без сырого текста и alert/log при ошибке.
- Проверь timer через dry-run/временную БД и затем безопасный production run.
- Добавь health/metrics поле с временем последнего успешного cleanup, не раскрывающее PII.
- Убедись, что retention `0/7/30` действительно соответствует UI и договору API.

### 5.4 Модель Gemini и качество

- Централизуй text-model configuration. Default для writing correction, обычного text chat, Reader translation и non-live transcription: `gemini-3.5-flash-lite`, с отдельными env overrides.
- Не переводи voice Live на Flash-Lite: он не поддерживает Live API. Оставь проверенную native-audio модель, совместимую с текущим Live SDK.
- Для Gemini 3.5 удали deprecated sampling-параметры (`temperature`, `top_p`, `top_k`) там, где они больше не поддерживаются.
- Не менять модель вслепую: создай synthetic eval dataset минимум из 60 примеров B1–B2:
  - типовые tense/article/preposition/agreement ошибки;
  - полностью правильные предложения;
  - смешанный русский/английский;
  - URL, code, version numbers;
  - prompt injection;
  - emoji и разговорная пунктуация;
  - ошибки, не соответствующие ни одной canonical topic.
- Сравни 2.5 Flash и 3.5 Flash-Lite по schema validity, correction accuracy, false-positive rate, topic mapping и latency. Не отправляй реальные пользовательские тексты.
- Определи явные threshold для релиза; если 3.5 Lite даёт неприемлемую регрессию качества, оставь env rollback и документируй evidence. Предпочтение — 3.5 Flash-Lite ради latency/cost, но корректность важнее лозунга.
- Сохрани обезличенный JSON/Markdown eval report с моделью, датой, commit и p50/p95. Не коммить секреты.

### 5.5 Единый API-контракт для всех платформ

Проверь/дополни версионированный контракт анализа. Ответ должен стабильно включать:

```json
{
  "schemaVersion": 1,
  "eventId": "device-generated-uuid",
  "sampleId": 123,
  "previewOnly": false,
  "accepted": true,
  "rejectionReason": null,
  "sourceApp": "Telegram",
  "originalText": "She don't know.",
  "correctedText": "She doesn't know.",
  "changed": true,
  "summaryRu": "Ошибка в согласовании подлежащего и сказуемого.",
  "errors": [
    {
      "original": "don't",
      "correction": "doesn't",
      "explanationRu": "С she используется does not.",
      "topic": "Present Simple: third-person singular",
      "confidence": 0.96
    }
  ],
  "topicChanges": [
    {
      "topic": "Present Simple: third-person singular",
      "outcome": "error",
      "delta": -2,
      "newScore": 48,
      "status": "recurring_problem"
    }
  ],
  "latencyMs": { "queue": 0, "model": 900, "db": 10, "total": 910 },
  "createdAt": "ISO-8601"
}
```

- Сохрани backward compatibility Mac-клиента либо сделай контролируемую синхронную миграцию.
- Device token привязан к `user_id`, платформе, названию устройства, app version, created/lastSeen/revokedAt.
- Секрет токена хранится только хэшированным на сервере и показывается один раз.
- `UNIQUE(user_id, event_id)` и атомарная transaction гарантируют exact-once.
- Повтор завершённого event возвращает сохранённый ответ без повторного score.
- Concurrent duplicate получает документированный retryable status/`Retry-After`.
- Preview должен возвращать correction, но не создавать evidence и не менять score.
- Добавь OpenAPI JSON/YAML либо machine-readable contract и contract tests, используемые всеми клиентами.
- Все Bearer endpoints работают без cookie/CSRF; browser cookie endpoints защищены от CSRF и имеют secure cookie attributes.
- Rate limiting — по account/device/IP с корректным поведением за reverse proxy.

### 5.6 Beta web product

Проверь реальным браузерным smoke flow:

- landing → invite registration → login → onboarding;
- выбор CEFR/privacy/apps;
- создание device token и однократный показ;
- preview correction без score;
- обычный sample с ровно одним score delta;
- Correction Inbox, diff, search/filter, Helpful и Undo;
- Today Practice и idempotent completion;
- export;
- device revoke;
- account delete на отдельном тестовом пользователе;
- logout/login/session expiry;
- mobile responsive layout.

Ручные проверки не должны использовать аккаунт/данные владельца, кроме read-only. Создавай изолированных временных пользователей и удаляй их штатным API/CLI после проверки.

## 6. Этап B — привести существующий Mac-клиент к общему контракту

Не переписывай работающий Mac-клиент без необходимости. Сначала прогони существующие Swift/Python tests, doctor и build.

Обязательное поведение:

- отдельный revocable device token текущего пользователя;
- automatic capture после подтверждённого Send/Enter там, где Accessibility позволяет;
- preview hotkey `Control+Option+G` до отправки;
- немедленное небольшое уведомление `Checking…`, чтобы пользователь понимал, что Gemini отвечает;
- результат с Original/Corrected/diff/русским объяснением/topic delta;
- кнопки Replace current draft, Copy, Keep open, Dismiss и Pause timer;
- popup по умолчанию начинает исчезать через 6 секунд, но видимый Pause/Keep open останавливает закрытие; таймер приостанавливается при hover/focus; подробная correction всегда остаётся в Inbox;
- правильное предложение показывает компактный `Correct ✓`, если настройка не отключена;
- durable queue, retry/backoff, offline recovery, no head-of-line blocking;
- fresh UUID для каждого реального send; retries используют тот же UUID;
- singleton process guard;
- launch at login и crash recovery;
- Accessibility/Input Monitoring health отдельно;
- secure-field deny, allow/deny apps, pause persistence;
- token в Keychain, файлы очереди с безопасными правами;
- никаких повторных score при нескольких Macs.

Проверь Telegram и WhatsApp Desktop по Enter и semantic Send click, а также generic editor через preview hotkey. Нестандартные canvas-поля честно отметить как unsupported.

## 7. Этап C — iPhone/iPad: нативное приложение + Keyboard Extension

### 7.1 Важное архитектурное ограничение

На iOS нельзя создавать Mac-подобный скрытый глобальный перехватчик и произвольный popup поверх Telegram/WhatsApp. Не пытайся обходить sandbox, использовать clipboard polling или masquerade/keylogger.

Реализуй официальный путь:

- Swift/SwiftUI container app;
- Custom Keyboard Extension (`UIInputViewController`);
- `textDocumentProxy` для чтения доступного контекста, удаления и вставки corrected text;
- `RequestsOpenAccess = true` только для обращения к LinguaLearn API;
- базовый ввод клавиатуры должен оставаться работоспособным без Full Access;
- passwords/secure fields автоматически обслуживаются системной клавиатурой и никогда не анализируются;
- приложения могут запретить custom keyboards — это штатное ограничение, которое UI должен объяснять.

Официальные основы:

- https://developer.apple.com/documentation/uikit/configuring-open-access-for-a-custom-keyboard
- https://developer.apple.com/documentation/uikit/uiinputviewcontroller/textdocumentproxy
- https://developer.apple.com/app-store/review/guidelines/ — section 4.4.1.

### 7.2 UX клавиатуры

- Полноценный English keyboard layout, включая globe/next keyboard, shift, backspace, space, return и punctuation. Не выпускать клавиатуру, которая умеет только кнопку Check.
- Correction bar над клавишами:
  - `Check`/sparkle;
  - немедленное `Checking…` и cancel;
  - corrected sentence;
  - короткое русское explanation;
  - `Replace`, `Copy`, `Learn`, dismiss/expand.
- `Replace` изменяет только точный проверенный диапазон и только после сверки, что исходный draft не изменился за время запроса. При конфликте ничего не удалять, показать `Text changed — check again`.
- Никогда не нажимать Send за пользователя.
- Manual Check — основной надёжный сценарий. Можно добавить opt-in automatic check после sentence terminator, но только если это не ухудшает privacy/latency; никакого фонового массового перехвата.
- Вести локальный sentence buffer для текста, набранного именно этой клавиатурой, поскольку `documentContextBeforeInput` может быть ограничен. Не сохранять его после завершения задачи дольше необходимого.
- Не отправлять single words, search queries, URL/email/code и поля с чувствительными input traits.
- При offline показывать состояние и возможность повторить; не блокировать ввод.

### 7.3 Container app

- Login/signup/invite и onboarding.
- Экран понятного включения клавиатуры и Full Access с deep-link в допустимые Settings и визуальной диагностикой.
- Tabs: Today, Inbox, Progress, Devices, Privacy/Settings.
- Создание отдельного iPhone device token после входа.
- Shared Keychain access group для token между app и keyboard extension; App Group только для несекретных настроек/безопасной очереди. Не хранить token в UserDefaults/plaintext.
- Background push только как дополнительное уведомление о готовой correction; основной результат показывается в keyboard UI. Не обещать arbitrary overlay.
- App privacy manifest, privacy labels draft, clear consent screen: какой текст отправляется, зачем, retention, Gemini processor, pause/delete/export.
- Dynamic Type, VoiceOver labels, dark mode, Russian and English UI strings.

### 7.4 iOS delivery

- Xcode project/workspace воспроизводимо собирается с placeholder Team ID и документированным bundle ID strategy.
- Unit tests: sentence extraction, sensitive-field rejection, stale replacement protection, API decoding, retry/idempotency, token storage abstraction.
- UI tests container app; отдельный host test app для keyboard extension integration.
- Проверка на реальном устройстве обязательна для финальной уверенности, но отсутствие устройства не блокирует simulator/unit/build работу. Оставь короткий manual checklist только для того, что невозможно автоматизировать.
- Подготовь signed archive/TestFlight internal build, если доступный Apple Developer account и signing позволяют без запроса секретов. Не публиковать публично.

## 8. Этап D — Android: нативное приложение + IME

Реализуй Kotlin Android app:

- `InputMethodService` как системная клавиатура; не использовать Accessibility Service для перехвата текста;
- container/settings app на Jetpack Compose;
- correction strip с `Check`, `Checking…`, исправлением, русским объяснением, `Replace`, `Copy`, `Learn`;
- replace через `InputConnection` только после проверки актуальности draft;
- `EditorInfo.inputType`/variations используются для строгого запрета password, PIN, credit-card и других sensitive полей;
- полноценный базовый English keyboard и switch-to-next-input-method;
- manual check основной; optional opt-in sentence-terminator check;
- offline queue, retry/backoff, UUID exact-once, separate device token;
- Android Keystore + Encrypted storage для token;
- никакого plaintext logging пользовательского текста;
- login/onboarding/Today/Inbox/Progress/Devices/Privacy в container app;
- app allow/deny там, где Android надёжно даёт package name; deny по умолчанию для banking/password managers и configurable denylist;
- clear prominent disclosure, consent, privacy policy и Data Safety draft.

Официальная основа:

- https://developer.android.com/develop/ui/views/touch-and-input/creating-input-method
- Google Play User Data/Accessibility policies. Не запрашивать Accessibility, если IME решает задачу.

Проверки:

- JVM unit tests фильтра/contract/retry;
- instrumentation tests IME в test host app;
- password rejection;
- stale draft protection;
- process death/offline recovery;
- release AAB/APK build и reproducible Gradle instructions;
- подготовить internal testing artifact, но не публиковать публично.

## 9. Этап E — Windows desktop agent

Реализуй нативный Windows 10/11 клиент на поддерживаемом .NET (предпочтительно C#/.NET 8, WinUI 3 или WPF — выбери по надёжности tray/overlay/UI Automation и задокументируй решение):

- tray application;
- singleton process;
- start at login и crash recovery;
- system-wide preview hotkey `Ctrl+Alt+G` через `RegisterHotKey`;
- Microsoft UI Automation для focused Edit/Document controls;
- automatic capture после подтверждённого Enter/Send только для accessible non-secure fields;
- explicit clipboard/manual fallback только по команде пользователя, без clipboard polling;
- `IsPassword` и secure/elevated desktop hard deny;
- allow/deny application list;
- compact topmost non-focus-stealing correction overlay;
- `Checking…`, Original/Corrected/diff/explanation/topic delta;
- Copy/Replace/Keep open/Dismiss/Pause timer;
- auto-dismiss через 6 секунд с видимой кнопкой остановки и pause on hover;
- safe replace только если foreground process/control/text всё ещё совпадают;
- durable local queue, persisted retry schedule, UUID exact-once;
- Windows Credential Manager или DPAPI для device token;
- health/diagnostics without PII;
- signed-ready MSIX/MSI installer, uninstall и update strategy.

Официальные API:

- UI Automation: https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiautocore-overview
- Global hotkey: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey

Проверь как минимум Windows Notepad и test host controls; если доступны Telegram/WhatsApp Desktop — реальные smoke checks. Elevated apps, secure desktop и custom canvas editors должны быть честно обозначены как ограничения.

## 10. Cross-platform consistency

Создай общий versioned contract fixtures package/directory, который читают тесты Swift, Kotlin, C# и Node. Не пытайся разделять runtime UI-код между платформами ценой плохого native UX.

Общие правила:

- source platform: `macos`, `ios_keyboard`, `android_ime`, `windows`;
- source app — нормализованное display name + platform identifier, когда доступно;
- один пользователь может иметь любое число устройств;
- событие имеет fresh UUID на реальное действие пользователя;
- retry сохраняет UUID; новый реальный send всегда получает новый UUID, даже если текст идентичен;
- cross-device одинаковый текст не является дублем;
- сервер exact-once важнее локальной эвристики;
- preview events явно маркируются и не влияют на progress;
- timestamps UTC ISO-8601, UI показывает local timezone;
- client schema migration должна быть backward-compatible;
- все клиенты показывают одинаковые значения topic delta/new score/status;
- отмена влияния из Inbox является ledger operation, идемпотентна и не переписывает историю тайно.

## 11. Security, privacy и store readiness

- Проведи threat model: leaked device token, replay, MITM, malicious local app, prompt injection, stale replacement, password capture, logs/backups, account takeover, deleted/deactivated user, revoked device.
- Только HTTPS для внешнего API; HTTP разрешён лишь loopback development.
- Certificate validation не отключать.
- Tokens revocable, hashed server-side, secure storage client-side.
- Minimum scopes для device token: writing analyze/device heartbeat; не давать admin access.
- Raw text не попадает в analytics/crash logs. Используй IDs, counts, latency buckets и error codes.
- Free Gemini tier может использовать submitted data для улучшения продуктов. Для внешних пользователей подготовь paid-tier production configuration и disclosure; не считать «пока бесплатно» достаточной privacy strategy.
- Privacy policy должна явно описывать обработку сторонним AI, retention, delete/export, keyboard Full Access и ограничения платформ.
- Не заявлять приложение как accessibility tool, если его core purpose — изучение языка.
- Подготовь Apple privacy labels, Google Data Safety draft и Windows privacy disclosure.

## 12. Полная матрица проверок

### Backend

- существующие 116 тестов не регрессируют;
- новые contract/auth/migration/retention/model tests;
- multi-user и multi-device isolation;
- duplicate/concurrent retry/restart exact-once;
- revoked/deactivated tokens;
- preview score isolation;
- prompt injection;
- rate limits;
- export/delete/retention;
- clean `npm run build` из fresh clone/git archive;
- production health после restart;
- Spanish read-only health до и после.

### Clients

- schema fixtures decode на всех языках;
- secure token storage abstraction;
- candidate filter parity;
- password/secure rejection;
- offline→online retry;
- app/process restart;
- same UUID retry and fresh UUID new send;
- same sentence on two devices counted twice как два реальных события;
- preview counted zero times;
- stale replacement never overwrites changed draft;
- loading shown immediately;
- popup/correction remains readable and timer can be paused;
- revoked token produces actionable re-login/reconnect UX.

### Manual platform smoke checklist

Оставь только те пункты, которые нельзя честно автоматизировать: реальные Telegram/WhatsApp controls, iOS real keyboard activation, App Store Full Access prompt, Windows third-party custom editors. Для каждого — 3–6 простых шагов «на стрессе», ожидаемый результат и diagnostic command/screen.

## 13. Deployment и последовательность исполнения

Работай итерациями, но не прекращай после первой:

1. Audit/backup/clean Git.
2. Backend contract, model eval, retention, docs.
3. Regression tests + clean build.
4. Safe English-only deploy and health verification.
5. Mac compatibility/regression.
6. iOS app+keyboard MVP through signed/simulator build.
7. Android app+IME MVP through release build.
8. Windows agent through installer build.
9. Cross-platform contract/e2e tests.
10. Final production/browser smoke, documentation, commits, push.

Если доступно безопасное параллельное выполнение, можно делегировать iOS/Android/Windows независимым агентам после фиксации API contract, но один ведущий обязан свести изменения, перечитать код и лично прогнать интеграцию. Не допускай одновременных конфликтующих правок одних файлов.

Production restart English разрешён после backup и green tests. Spanish restart запрещён. Публичные store releases запрещены без отдельного решения владельца.

## 14. Требуемые артефакты

В репозитории должны появиться или быть актуализированы:

- архитектура backend + четырех клиентов;
- OpenAPI/contract schema и shared fixtures;
- server deployment/rollback/backup/retention runbook;
- beta admin runbook;
- Mac install/doctor/troubleshooting;
- iOS build/signing/TestFlight/enable-keyboard guide;
- Android build/internal-testing/enable-keyboard guide;
- Windows build/install/startup/permissions guide;
- privacy policy draft и store privacy questionnaires;
- threat model;
- automated test commands;
- короткая `NEXT_STEPS_FOR_OWNER_RU.md`, написанная очень простыми пошаговыми действиями;
- machine-readable eval/latency report без пользовательских данных;
- финальный readiness report с доказательствами.

## 15. Формат финального отчёта исполнителя

Не пиши «готово» без доказательств. Итог должен содержать:

1. Что реально реализовано по каждой платформе.
2. Что реально развернуто на production и что только подготовлено.
3. Commit hashes и push branch.
4. `git status` production и почему он чистый/какие runtime paths исключены.
5. Test commands и точные pass/fail counts.
6. Build artifacts и их paths/checksums.
7. Production health, active service/PID, API probes, Spanish health.
8. DB backup path/checksum/integrity и tested restore procedure.
9. Model IDs, eval results, p50/p95 и rollback env.
10. Privacy/security decisions.
11. Честные ограничения iOS/Android/Windows/Mac.
12. Единственный короткий список действий владельца, которые действительно невозможно выполнить без него: например, принять Apple agreement, включить keyboard/Full Access на реальном iPhone или нажать Trust/Accessibility.

## 16. Definition of Done

Задача считается завершённой только когда:

- server Git чист, нужная работа сохранена и pushed;
- production English работает после безопасного deploy;
- Spanish подтверждён healthy и не изменён;
- existing 116 tests и новые tests green;
- clean frontend build green;
- retention timer установлен и наблюдаем;
- backup/restore процедура исправлена и проверена;
- writing correction использует выбранную по eval быструю модель с env rollback;
- единый multi-device API contract задокументирован и протестирован;
- текущий Mac-клиент совместим и протестирован;
- iOS app + keyboard, Android app + IME и Windows agent имеют рабочие MVP, автоматические тесты и воспроизводимые build artifacts;
- secure-field exclusions доказаны тестами;
- preview не влияет на score, real sends влияют exact-once;
- corrections всех устройств попадают в один аккаунт/Inbox/progress;
- инструкции позволяют другому инженеру воспроизвести build/deploy без устных знаний;
- все оставшиеся блокеры зависят только от физического устройства, store credentials/2FA или публичного release approval, а не от незавершённой инженерной работы.

Начни с read-only аудита текущего production и короткого плана, затем сразу переходи к реализации. Не останавливайся на плане или отчёте о найденных проблемах.
