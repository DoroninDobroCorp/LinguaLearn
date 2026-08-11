# LinguaLearn Capture: установка на второй MacBook

Эта инструкция устанавливает тот же общий macOS-агент для Codex, Telegram, WhatsApp, браузеров и других доступных приложений. Реальные токены в GitHub не хранятся.

## 1. Скачать проект

На втором MacBook откройте Terminal:

```bash
xcode-select --install
git clone git@github.com:DoroninDobroCorp/LinguaLearn.git
cd LinguaLearn/macos/LinguaLearnCapture
```

Если проект уже клонирован:

```bash
cd LinguaLearn
git pull --ff-only
cd macos/LinguaLearnCapture
```

## 2. Установить приложение и Codex hook

```bash
./Scripts/install.sh --all
```

Installer собирает arm64 app, создаёт отдельный случайный локальный ingress token, устанавливает crash-restarting LaunchAgent и аккуратно добавляет UserPromptSubmit hook, не заменяя другие hooks.

## 3. Безопасно перенести серверный token

На уже работающем первом Mac скопируйте token в clipboard без вывода на экран:

```bash
jq -r '.bearerToken' "$HOME/Library/Application Support/LinguaLearnCapture/config.json" | pbcopy
```

Передайте clipboard на второй Mac через Universal Clipboard либо другой доверенный приватный канал. Не отправляйте token в чат и не коммитьте его.

На втором Mac выполните:

```bash
pbpaste | /usr/bin/python3 ./Scripts/configure-installed.py \
  --config "$HOME/Library/Application Support/LinguaLearnCapture/config.json" \
  --token-stdin \
  --api-url "https://145.239.82.124.sslip.io/english/api/writing/analyze" \
  --app-url "https://145.239.82.124.sslip.io/english"
```

После этого очистите clipboard:

```bash
printf '' | pbcopy
```

## 4. Запустить

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.lingualearn.capture.plist"
launchctl kickstart -k "gui/$(id -u)/com.lingualearn.capture"
```

Если `bootstrap` пишет, что service уже загружен, достаточно второй команды.

## 5. Выдать два разрешения

В System Settings → Privacy & Security включите `~/Applications/LinguaLearnCapture.app` в:

1. Accessibility.
2. Input Monitoring.

Затем перезапустите агент:

```bash
launchctl kickstart -k "gui/$(id -u)/com.lingualearn.capture"
```

Это единственные действия, которые macOS намеренно требует подтвердить лично.

## 6. Проверить установку

Из корня репозитория:

```bash
./macos/LinguaLearnCapture/Scripts/doctor.sh
```

Ожидаются `PASS` для app, signature, LaunchAgent, config, queue, Accessibility, Input Monitoring, event tap и production API. Токены doctor не выводит.

## 7. Необязательный точный Codex hook

В Codex откройте `/hooks`, найдите `lingualearn_capture.py` и нажмите Trust. Без Trust продолжает работать общий Accessibility-путь; hook даёт более точную доставку именно для Codex.

## 8. Как пользоваться

- Обычная отправка: пишите английское предложение и отправляйте Enter/Send. Сразу появится `Checking your English…`, затем результат.
- Результат закрывается через 6 секунд. Нажмите `Keep open`, чтобы читать без ограничения времени.
- До отправки: нажмите `Control+Option+G`, дождитесь результата и выберите `Replace draft`. Preview не влияет на curriculum; оценка меняется только после фактической отправки.
- Короткие одиночные слова, URL, email, команды, code и secure/password fields игнорируются.

Если что-то не работает, сначала сохраните вывод `doctor.sh`, но никогда не публикуйте `config.json` или token.
