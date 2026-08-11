# LinguaLearn Capture for macOS

Ручное завершение security permissions и real-device E2E описано в [`../../LINGUALEARN_MANUAL_FINISH_RU.md`](../../LINGUALEARN_MANUAL_FINISH_RU.md). Перед тестом запустите `./Scripts/doctor.sh`.

Нативный menu-bar агент, который получает уже отправленные английские предложения из приложений macOS или проверяет focused draft по горячей клавише, отправляет текст в writing API LinguaLearn и показывает исправление в неактивирующем popup. Внешних зависимостей нет: только Swift, AppKit, macOS Accessibility, NaturalLanguage и Network.

## Как работает захват

1. Один системный `CGEventTap` замечает Return/Enter или левый клик. Shift/Option/Control+Return и key-repeat игнорируются. Все события проходят без изменения, кроме точной комбинации `Control+Option+G`, которая запускает preview и подавляется, чтобы не печатать лишний символ.
2. Агент определяет frontmost bundle ID и сначала применяет denylist/allowlist.
3. Для клика Accessibility hit-test должен найти в том же процессе `AXButton` с точной семантической меткой Send/Submit/Post (включая перечисленные русские эквиваленты) либо безымянную кнопку с `AXPress`. В обоих случаях capture происходит только после подтверждённой очистки исходного composer. `Send later`, `Forward`, ссылки и menu items не подходят.
4. Через Accessibility читается только settable string value focused editable element или ближайшего same-process родителя. Это поддерживает content-editable поля Electron/WebKit и их replacement после Send. Нажатия клавиш не записываются и текст по ним не восстанавливается.
5. Secure/password/passcode fields, Terminal, IDE и password managers пропускаются до чтения значения.
6. После Return или принятого клика агент ждёт до 900 ms. Событие считается отправленным **только если тот же composer стал пустым**. Если поле осталось заполненным, текст отбрасывается.
7. Локальный фильтр принимает английский текст с минимум двумя словами и `.`, `!` или `?`; длинная chat-фраза из четырёх и более английских слов также принимается без финальной пунктуации. Одиночные слова и короткие фрагменты, URL, email, пути, код и текст с не-латинскими буквами отбрасываются до API.
8. Каждый подтверждённый AX send получает новый UUID, который сохраняется вместе с durable event и повторно используется при сетевых retry. Короткий двухсекундный source-aware cache убирает повторные callbacks; только `codex` и `com.openai.codex` считаются одним источником для корреляции hook ↔ AX. Поэтому два намеренно повторённых сообщения или одинаковый текст в Telegram и WhatsApp остаются двумя практиками.
9. Принятое событие записывается в очередь `~/Library/Application Support/LinguaLearnCapture/pending-events.json` с mode `0600` (по умолчанию до 1000 pending событий). Оно удаляется только после успешного ответа API; при offline/5xx/429 агент повторяет запрос с backoff и не теряет предложение после исчерпания быстрых retry.
10. Process-wide file lock и `LSMultipleInstancesProhibited` не позволяют двум экземплярам одновременно установить event tap и начислить два раза за один физический send.

По умолчанию `allowAllNonDenied: true`: работает одно общее правило для всех приложений, кроме denylist. Чтобы перейти в строгий allowlist-режим, установите `allowAllNonDenied: false` и перечислите bundle IDs в `allowedBundleIdentifiers`. В обоих списках поддерживается suffix-wildcard `*`, например `com.jetbrains.*`.

## Codex: точный источник вместо эвристики

Codex `UserPromptSubmit` hook получает `prompt` и `turn_id` непосредственно перед отправкой. Скрипт `Hooks/lingualearn_capture.py`:

- использует допустимый `turn_id` как стабильный `eventId` (для необычного ID — стабильный SHA-256 alias) и один раз фиксирует `sentAt`;
- **до сетевого handoff** атомарно публикует JSON с mode `0600` в `~/Library/Application Support/LinguaLearnCapture/hook-inbox/`;
- с общим budget 650 ms передаёт тот же JSON на `127.0.0.1:<ingressPort>/capture` и читает только HTTP status;
- удаляет spool только после `200` (filtered/duplicate) или `202` (normal queue приняла durable ownership); при offline/paused/full/storage error файл остаётся;
- никогда не вызывает удалённый API прямо из синхронного Codex hook;
- fail-open: ошибка агента не блокирует prompt и ничего не печатает в контекст модели.

Menu-bar агент сразу при старте и затем каждые три секунды импортирует оставшиеся spool-файлы в обычную durable analysis queue. `queued`, `duplicate` и `filtered` удаляются из inbox; `paused`, `queueFull` и `storageUnavailable` сохраняются до следующей попытки. Повреждённый/подменённый JSON не блокирует остальные события, а перемещается с mode `0600` в `hook-inbox/quarantine/`. Loopback listener привязан именно к `127.0.0.1` и проверяет `X-LinguaLearn-Ingress-Token` из config.

Формат hook и поля `UserPromptSubmit` сверены с [официальной документацией OpenAI Hooks](https://learn.chatgpt.com/docs/hooks). После установки Codex потребует открыть `/hooks` и явно доверить новый command hook.

## API-контракт

Запрос на настраиваемый `apiURL` (обычно `/english/api/writing/analyze`):

```json
{
  "eventId": "turn-or-ax-id",
  "sourceApp": "codex",
  "text": "Yesterday I go home.",
  "sentAt": "2026-08-10T01:02:03Z"
}
```

Headers: `Content-Type: application/json` и `Authorization: Bearer <bearerToken>`.

Текущий response:

```json
{
  "accepted": true,
  "originalText": "Yesterday I go home.",
  "correctedText": "Yesterday I went home.",
  "summaryRu": "После yesterday здесь нужен Past Simple.",
  "errors": [
    {
      "original": "go",
      "correction": "went",
      "explanationRu": "Нужна форма прошедшего времени.",
      "topic": "Past Simple",
      "level": "A2"
    }
  ],
  "topicEvidence": [
    {
      "topic": "Past Simple",
      "level": "A2",
      "outcome": "error",
      "scoreDelta": -2,
      "newScore": 38
    }
  ]
}
```

Для обратной совместимости popup также понимает старый `topicChanges`.

## Сборка и тесты

Требуются Xcode 26 / Swift 6 на arm64 Mac:

```bash
cd macos/LinguaLearnCapture
swift test
/usr/bin/python3 -m unittest discover -s Tests/HookTests -p 'test_*.py'
./Scripts/build-app.sh
```

`build-app.sh` делает release arm64 binary и проверяет architecture/signature. Если в Keychain есть Apple Development certificate, он автоматически используется как стабильная подпись, чтобы Accessibility trust сохранялся между сборками. На Mac без сертификата используется ad-hoc fallback; identity можно задать явно через `LINGUALEARN_CODESIGN_IDENTITY`.

## Установка

Installer ничего не запускает автоматически. Сначала можно проверить действия:

```bash
./Scripts/install.sh --dry-run
```

Полная user-level установка:

```bash
./Scripts/install.sh --all
```

Она:

- собирает и кладёт app в `~/Applications/LinguaLearnCapture.app`; существующий app перемещает в timestamped backup;
- создаёт config с случайным 256-bit ingress token, только если config ещё не существует;
- устанавливает user LaunchAgent с `RunAtLoad` и restart-on-crash; обычный Quit завершается с кодом 0 и поэтому не перезапускается до следующего входа или ручного запуска;
- копирует hook в `~/.codex/hooks/lingualearn_capture.py`;
- атомарно **мерджит**, а не заменяет, `~/.codex/hooks.json`; существующий файл предварительно сохраняет в timestamped backup;
- повторный запуск не добавляет второй идентичный hook.

После установки:

1. Откройте `~/Library/Application Support/LinguaLearnCapture/config.json`.
2. Заполните `apiURL`, `appURL` и `bearerToken`; не меняйте сгенерированный `ingressToken` без необходимости.
3. Запустите `~/Applications/LinguaLearnCapture.app`.
4. Разрешите Accessibility и Input Monitoring в System Settings → Privacy & Security. Первое нужно только для focused composer/Send control, второе — для Return/click/preview-hotkey events; агент не ведёт keylog и не восстанавливает текст из отдельных клавиш. Агент появляется только в menu bar (`LSUIElement`), в Dock его нет.
5. В Codex откройте `/hooks`, проверьте точную команду и trust hook.

Можно установить только app или только hook через `--app-only` / `--hook-only`. Для custom config path и build output поддерживаются `LINGUALEARN_CAPTURE_CONFIG` и `LINGUALEARN_BUILD_OUTPUT`.

## Popup и управление

После подтверждённой отправки сразу появляется `Checking your English…`, поэтому долгая работа Gemini не выглядит как потерянное событие. Готовый popup не активирует приложение-источник и показывает original, better/correct version, до трёх объяснений, grammar topic chips и кнопки Copy corrected / Open LinguaLearn / Keep open / Dismiss. Результат закрывается через 6 секунд; `Keep open` останавливает таймер до ручного Dismiss. Pending backlog ограничен 20 свежими результатами. По умолчанию карточка появляется и для правильного предложения (`showOnlyWhenChanged: false`).

### Проверка черновика до отправки

Поставьте курсор в английский message composer и нажмите `Control+Option+G`:

1. Комбинация подавляется и не попадает в текст.
2. Немедленно появляется `Checking your English…`.
3. Preview анализируется Gemini без изменения curriculum.
4. В результате доступны `Replace draft`, `Copy corrected`, `Keep open` и `Dismiss`.
5. `Replace draft` срабатывает только если исходный черновик не менялся во время анализа. После замены проверьте текст и отправьте обычным Enter; только реальная отправка изменит curriculum.

Меню позволяет Pause/Resume, запросить Accessibility + Input Monitoring permissions, открыть config и reload после изменения. Pause сохраняется в `captureEnabled`, останавливает новый AX‑захват и заставляет loopback ingress отвечать `503 Paused`; уже записанная durable queue продолжает доставку, а hook inbox ждёт Resume, чтобы ранее принятые предложения не потерялись.

## Ограничения MVP

- У macOS нет универсального события «сообщение отправлено». Общий AX путь поддерживает Return/Enter и клик по доступной semantic Send/Submit/Post button, но всегда требует очистки исходного composer.
- Безымянная icon-only кнопка поддерживается, если macOS публикует её как pressable `AXButton` и composer после клика очистился. Полностью custom-canvas control без AX button role или приложение, которое вообще не публикует focused editable value, остаётся недоступным общему Accessibility capture. Для Codex дополнительный точный hook закрывает этот случай после ручного Trust; для остальных при необходимости можно добавить маленькие profiles, не создавая отдельные агенты.
- `/health` содержит только безопасную capture-диагностику (`lastInputEvent`, `lastCaptureDecision`, bundle ID и timestamp), но никогда не исходный текст.
- Если приложение удаляет и пересоздаёт Accessibility element вместо очистки, строгая проверка намеренно пропустит событие, чтобы не анализировать неотправленный draft.
- Queue и Codex hook inbox содержат исходные предложения на локальном диске до принятия следующей durable стадией. Файлы доступны только текущему пользователю (`0600`), каталоги имеют `0700`, но содержимое пока не шифруется Keychain-derived key.
- Apple Development подпись подходит для личной локальной установки; ad-hoc остаётся fallback. Для распространения другим пользователям нужны Developer ID signing и notarization.
