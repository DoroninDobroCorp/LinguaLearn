# LinguaLearn: что осталось сделать человеку

Последняя автоматическая проверка: **12 августа 2026**.

Код, production backend/frontend, continuous voice mode и macOS‑агент установлены. Автоматические тесты проходят, оба системных разрешения уже выданы. Остались только доверие Codex command hook (штатное ручное security-действие) и короткая проверка настоящим сообщением/микрофоном.

## Текущее состояние

- Production: <https://145.239.82.124.sslip.io/english/>
- macOS app: `~/Applications/LinguaLearnCapture.app`
- menu-bar process и restart-after-crash LaunchAgent работают.
- Config, durable queue и hook inbox защищены modes `0600/0700`.
- Popup включён для ошибочных **и правильных** предложений.
- Сразу после capture показывается `Checking your English…`; результат закрывается через 6 секунд, а `Keep open` останавливает таймер.
- `Control+Option+G` проверяет focused draft до отправки; `Replace draft` безопасно подставляет исправление. Preview не меняет curriculum.
- Фоновый score: `+1` за центральную правильно использованную конструкцию, `−2` за каждую отдельную реальную grammar error. Одно событие не начисляется повторно при HTTP retry.
- Встроенный text/voice chat сохраняет прежний более сильный вес `+5/−10`.
- На момент последней проверки `Accessibility`, `Input Monitoring` и event tap включены и здоровы. Остался только необязательный, но более надёжный для Codex ручной `Trust` command hook.

## 1. Сначала запустить doctor

Откройте Terminal и выполните:

```bash
cd /Users/vladimirdoronin/VovkaNowEngineer/work_fold/new/lingualearn-implementation
./macos/LinguaLearnCapture/Scripts/doctor.sh
```

Скрипт не выводит Bearer/ingress tokens. До ручной настройки нормальны четыре строки `MANUAL`. Строк `FAIL` быть не должно.

## 2. Разрешить системный capture

1. Нажмите иконку LinguaLearn Capture с пузырём текста в menu bar.
2. Выберите `Request capture permissions…`.
3. Откройте System Settings → Privacy & Security → Accessibility.
4. Включите `LinguaLearnCapture`. Если app нет в списке, добавьте через `+`:

   `~/Applications/LinguaLearnCapture.app`

5. Аналогично включите app в Privacy & Security → Input Monitoring.
6. Если macOS попросит перезапуск, выполните:

```bash
launchctl kickstart -k "gui/$(id -u)/com.lingualearn.capture"
```

7. Ещё раз запустите `doctor.sh`.

Готовый runtime должен показывать:

```json
{
  "accessibilityTrusted": true,
  "inputMonitoringGranted": true,
  "eventTapRunning": true,
  "paused": false,
  "storageHealthy": true
}
```

Accessibility используется для чтения только focused message composer и Send button. Input Monitoring нужен для Return/click и точной preview-комбинации `Control+Option+G`. Все остальные события пропускаются без изменения; агент не восстанавливает текст из отдельных нажатий и не ведёт keylog.

## 3. Доверить Codex hook

1. В Codex откройте команду `/hooks`.
2. Найдите `UserPromptSubmit` command:

   `/usr/bin/python3 "/Users/vladimirdoronin/.codex/hooks/lingualearn_capture.py"`

3. Просмотрите определение и нажмите Trust.
4. Убедитесь, что status больше не `untrusted`.

Не обходите этот экран изменением внутренних файлов Codex: explicit Trust — штатная защита command hooks. Формат hook сверялся с [официальной документацией OpenAI](https://learn.chatgpt.com/docs/hooks).

Hook сначала атомарно сохраняет prompt в локальный `hook-inbox`, а уже затем передаёт его агенту. Поэтому сообщение не теряется при restart/offline/pause. Он использует ту же очередь, API, popup и curriculum, что общий macOS capture.

## 4. Проверить Telegram и другие чаты

Используйте Saved Messages/чат с самим собой, чтобы не отправлять тест другому человеку. Эти предложения являются настоящей практикой и могут изменить реальный curriculum.

### Базовая проверка

Отправьте через Enter:

```text
Yesterday I go home.
```

Ожидается одна native popup card:

- Original: `Yesterday I go home.`
- Better version: `Yesterday I went home.`
- краткое объяснение на русском;
- grammar topic и изменение score примерно `−2`.

Для одного физического send должна быть одна карточка и одно изменение каждой темы. Сетевой retry не начисляет второй раз. Если намеренно отправить ту же фразу как новое сообщение позже, это новая практика и она учитывается снова.

### Исправить до отправки

1. Напишите английский черновик, но не нажимайте Enter.
2. Нажмите `Control+Option+G`.
3. Сразу увидите `Checking your English…`; дождитесь результата Gemini.
4. Нажмите `Replace draft`. Карточка останется открытой, а исправленный текст появится в composer.
5. Проверьте текст и отправьте Enter.

Preview не меняет curriculum. Progress начисляется один раз после реальной отправки. Если вы изменили черновик, пока Gemini думал, `Replace draft` намеренно откажется перезаписывать его — используйте `Copy corrected`.

### Проверить фильтр

| Текст | Ожидание |
|---|---|
| `Hello.` | пропустить: только одно слово |
| `How are you` | пропустить: нет `.`, `!` или `?` |
| `That was great! 😊` | принять и показать Correct popup |
| `I have been working here for two years.` | принять; Correct popup и максимум один central success `+1` |
| URL, email, shell/code | пропустить |

### Проверить кнопку Send

Введите новое предложение и нажмите мышью доступную кнопку Send. Агент принимает клик, если macOS видит в том же процессе semantic `AXButton` с меткой Send/Submit/Post либо безымянную pressable `AXButton`, а исходный composer после клика очистился.

Icon-only `AXButton` теперь поддерживается. Полностью custom-canvas кнопка без Accessibility button role по-прежнему не угадывается; в таком приложении сначала проверьте Enter. Web/Electron editor может отдавать focused дочерний элемент или пересоздаваться после Send — агент обходит короткую same-process цепочку родителей и подтверждает пустой replacement composer. Это остаётся единым macOS‑агентом, а не отдельной системой для каждого мессенджера.

### WhatsApp

WhatsApp Desktop во время аудита на Mac не был установлен. Для WhatsApp Web используйте Chrome/Safari и тот же тест в чате с собой. Обработка остаётся общей на уровне macOS/browser Accessibility.

## 5. Проверить Codex

После `/hooks` → Trust отправьте в отдельной безопасной задаче:

```text
I am interesting in this idea.
```

Codex prompt должен уйти как обычно, а LinguaLearn popup отдельно предложит `I am interested in this idea.` Hook fail-open и ничего не добавляет в контекст модели.

Точный Codex hook работает независимо от общего AX capture, но для самого hook ручной Trust обязателен. Общий AX-путь остаётся включён как fallback.

## 6. Проверить continuous voice dialogue

1. Откройте <https://145.239.82.124.sslip.io/english/>.
2. Переключитесь с Text на Voice.
3. Нажмите Start и разрешите браузеру microphone access.
4. Скажите обычным голосом:

   `Hi. Yesterday I go to the city, and I want to talk about it.`

5. Проверьте одновременно:

   - появляется user transcript;
   - ассистент отвечает потоковым голосом, а не создаёт аудиосообщение;
   - отображается assistant transcript;
   - после turn boundary приходит topic update/toast;
   - можно продолжить разговор без повторного Start.

6. Проверьте Stop и повторный Start.

Live session автоматически обновляется примерно через 15 минут. Если браузер блокирует звук, проверьте site microphone permission, output volume и autoplay/audio permission.

## 7. Проверить curriculum

После одного настоящего сообщения обновите страницу Curriculum. Для ambient capture ожидаются лёгкие изменения `+1/−2`; для text/voice practice внутри приложения — `+5/−10`.

Одно ошибочное предложение может затронуть несколько **разных** действительно проявленных grammar topics, но каждую не более одного раза. Ошибочное ambient‑предложение не получает параллельные бонусы за случайно правильные фрагменты; правильное получает максимум один central success.

## 8. Если popup не появился

1. Запустите `doctor.sh`.
2. Проверьте, что три значения permission/event tap равны `true`.
3. Проверьте menu bar: capture не должен быть Paused.
4. Перезапустите агент:

```bash
launchctl kickstart -k "gui/$(id -u)/com.lingualearn.capture"
```

5. Проверьте локальный health:

```bash
curl -s http://127.0.0.1:43119/health | jq
```

После реального Return/click health также показывает безопасную диагностику без текста сообщения:

- `lastInputEvent`: увиденный `returnKey` или `leftMouseDown`;
- `lastCaptureDecision`: последний этап, например `awaitingComposerClear`, `capturedOriginalCleared`, `focusedEditableNotFound`;
- `lastCaptureSourceApp`: только bundle identifier приложения;
- `lastInputEventAt`: время события.

Если этих полей нет, агент после последнего запуска ещё не видел физический Return/click/hotkey. Синтетические нажатия средств автоматизации могут не попадать в системный event tap; финальная проверка должна быть сделана настоящей клавиатурой/мышью.

6. Проверьте production:

```bash
curl -s https://145.239.82.124.sslip.io/english/api/health | jq
```

7. Проверьте pending queue и hook inbox, не раскрывая их содержимое:

```bash
jq length "$HOME/Library/Application Support/LinguaLearnCapture/pending-events.json"
find "$HOME/Library/Application Support/LinguaLearnCapture/hook-inbox" \
  -maxdepth 1 -type f -name '*.json' | wc -l
```

Не удаляйте pending files: они обеспечивают durable delivery и exactly-once retry.

## 9. Pause, privacy и безопасная остановка

- `Pause new capture` сохраняет состояние и прекращает новые AX events.
- Уже принятая durable queue продолжает доставку, чтобы не потерять сообщения.
- Codex hook во время pause оставляет события в inbox до Resume.
- Config и очереди находятся в `~/Library/Application Support/LinguaLearnCapture/` с доступом только текущему пользователю.
- Terminal, IDE, password managers и secure/passcode fields находятся в denylist/secure filter.

Чтобы временно полностью остановить агент:

```bash
launchctl bootout "gui/$(id -u)/com.lingualearn.capture"
```

Чтобы вернуть его:

```bash
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.lingualearn.capture.plist"
```

Старые app‑сборки сохранены как `~/Applications/LinguaLearnCapture.app.backup-*`. Серверные backup находятся в `/srv/backups/`; не восстанавливайте их поверх production без отдельной диагностики.

## 10. Definition of done

- [ ] `doctor.sh` не показывает `FAIL`.
- [ ] Accessibility = `true`.
- [ ] Input Monitoring = `true`.
- [ ] eventTapRunning = `true`.
- [ ] Codex hook trusted.
- [ ] Telegram/WhatsApp self-message даёт одну корректную popup card.
- [ ] `Hello.` и короткий фрагмент без пунктуации пропускаются; chat-фраза из 4+ английских слов принимается и без точки.
- [ ] Codex English prompt даёт popup и не мешает ответу модели.
- [ ] Voice mode слышит реальный микрофон, показывает оба transcript и отвечает голосом непрерывно.
- [ ] Curriculum после reload изменился ожидаемым весом ровно один раз на физическое событие.

После этих пунктов можно считать систему operational. Если что-то не совпало, сохраните вывод `doctor.sh` и точное название приложения/способ отправки (Enter или click), но не присылайте config/token contents.
