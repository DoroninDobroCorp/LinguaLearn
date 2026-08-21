# ТЗ: завершение английских клиентов и нативная приёмка

> Актуальный аудит и доказанные ограничения: [`NATIVE_CLIENTS_AUDIT_2026-08-21_RU.md`](NATIVE_CLIENTS_AUDIT_2026-08-21_RU.md). Публичный Mac 0.1.1 предшествует последним изменениям исходников и должен быть перевыпущен новой версией после нативной приёмки.

Назначение: закрыть оставшиеся объёмные, но прямолинейные работы после завершения серверной архитектуры и критических частей Mac/Android. Содержание английского курса не создавать и не редактировать.

## Канонические каталоги

- macOS: `/srv/LinguaLearn/macos/LinguaLearnCapture`
- iOS: `/srv/LinguaLearn/ios/LinguaLearn`
- Android: `/srv/LinguaLearn/android/LinguaLearn`
- Windows: `/srv/LinguaLearn/windows/LinguaLearnAgent`
- Web/server: `/srv/LinguaLearn/english`

Каталог `english/android/LinguaLearn` — старый неканонический дубль. Не переносить из него код и не считать его сборкой Android. Не менять серверную 4-tier assessment policy, exact-once, preview isolation, progress undo и user isolation без новых серверных тестов.

## Что уже готово и не надо переписывать

- API и OpenAPI contract, session/device auth, user isolation, exact-once `eventId`.
- 4 класса результата: `clear_error`, `mechanical_only`, `acceptable`, `correct`; только clear error может давать отрицательный прогресс.
- Preview mode не меняет прогресс.
- Mac automatic capture не показывает большую панель загрузки; большая карточка только для явной ошибки, короткий chip — для остальных результатов.
- Mac хранит device token только в Keychain; старый plaintext config мигрируется и очищается.
- Android делает сеть вне UI-потока, сохраняет тот же eventId при retry и не удаляет очередь при отсутствующем token/client.
- iOS keyboard работает только по явной команде проверки, а не отправляет каждый `textDidChange`.
- Нативные клиенты имеют фильтры sensitive fields и HTTPS production endpoint.

## P0: реальная приёмка Mac — выполнить первой

Нужен Mac с актуальным Xcode/Command Line Tools. На Linux-сервере этот пункт нельзя честно закрыть.

1. Получить код с сервера без перезаписи рабочей ветки.
2. В каталоге Mac выполнить `swift test`, `swift build -c release`, `Scripts/build-app.sh`.
3. Создать тестовый device token через веб-интерфейс. Не вставлять token в `config.json`; pairing должен сохранить его в Keychain.
4. Установить приложение скриптом, выдать Accessibility permission и запустить `Scripts/doctor.sh`.
5. Ручная матрица приложений: Notes, Telegram, Slack, браузерное поле textarea, почтовый редактор. Для каждого:
   - корректное английское предложение;
   - объективная грамматическая ошибка;
   - опечатка/пунктуация;
   - допустимый вариант стиля;
   - русский текст, URL, email, код;
   - password/secure field.
6. Проверить automatic send capture:
   - отправка не блокируется;
   - нет большой loading-панели;
   - clear error показывает подробную карточку;
   - correct/acceptable/mechanical показывает один chip примерно на 1.8 секунды;
   - серия быстрых успешных отправок заменяет chip и не создаёт очередь из chip;
   - при `showOnlyWhenChanged=true` успешные chip скрыты, ошибки остаются.
7. Проверить preview hotkey:
   - большая панель loading допустима;
   - Replace заменяет только неизменившийся draft;
   - Copy работает;
   - запрос имеет `previewOnly=true`;
   - число evidence/score до и после preview одинаковое.
8. Отключить сеть, отправить 3 разных предложения, вернуть сеть:
   - события доходят с исходными eventId ровно один раз;
   - порядок и UI не зависают;
   - raw pending queue не попадает в логи.
9. Проверить Keychain:
   - `config.json` содержит только `"bearerToken": "CHANGE_ME"`;
   - token отсутствует в логах, crash output и plist;
   - удалить запись Keychain и убедиться, что приложение просит pairing, а не использует fallback.
10. Перезапустить приложение и Mac; повторить один automatic и один preview запрос.
11. Подготовить подписанный `.app`/DMG только после зелёной матрицы. Не заявлять notarization, если Apple-подпись реально не выполнена.

Артефакт приёмки: `macos/LinguaLearnCapture/MAC_ACCEPTANCE_REPORT.md` с версией macOS, Xcode, commit SHA, таблицей сценариев и путями к скриншотам без пользовательского текста/токенов.

## P1: Android

Использовать Android Studio/JDK 17/SDK 34.

1. `./gradlew testDebugUnitTest assembleDebug lintDebug`.
2. Исправить только реальные ошибки компиляции/линта, не ослаблять static tests.
3. Проверить контейнер и IME на API 26, 30 и 34.
4. Pairing должен получать настоящий server device token. Любые строки `mock_token` и локальная генерация `ll_dev_` в production UI удалить; создание/revoke делать API-вызовами.
5. Проверить, что token хранится через `EncryptedTokenStorage`, и контейнер с IME читают одну каноническую запись.
6. Проверить full keyboard: буквы, shift, backspace, пробел, enter, switch keyboard; `Check` вызывается явно и не ломает ввод.
7. Проверить password/PIN, denylist, pause, русский текст, URL/email/code — сеть не вызывается.
8. Offline: очередь переживает kill/reboot, WorkManager получает реальный ApiClient/token, 2xx semantic rejection удаляется как завершённая, 408/429/5xx остаются, 400/401/403/422 становятся terminal с понятным статусом.
9. Добавить экран «неотправленные события»: количество, последняя ошибка, Retry now, Delete all с подтверждением. Не показывать raw text в списке.
10. Зашифровать содержимое durable queue через Android Keystore/EncryptedSharedPreferences. При недоступности Keystore — fail closed, без plaintext fallback.
11. Обновить README: убрать обещания, которых нет; добавить точные шаги pairing/IME/privacy.
12. Создать `ANDROID_ACCEPTANCE_REPORT.md` с тестовой матрицей и SHA APK.

## P1: iPhone/iPad

1. Сгенерировать/проверить Xcode project через существующий `project.yml`; не менять bundle/app-group IDs без причины.
2. Запустить все `LinguaLearnTests` на simulator и минимум одном физическом iPhone.
3. Проверить shared Keychain/App Group между container app и keyboard extension.
4. Login/signup/device-token/revoke должны обращаться к реальному API; убрать mock success/token, если они остались.
5. Keyboard не должен автоматически отправлять каждый draft. Только явные Check/Send-trigger, с отдельным previewOnly.
6. Full Access off: показать понятное состояние без утечки/краша. Full Access on: HTTPS request, timeout/retry, exact eventId.
7. SecureTextEntry, phone/PIN/password, denied apps и pause не отправляют текст.
8. Offline queue переживает перезапуск и не хранит token/raw text в UserDefaults без защиты.
9. Проверить Replace только для неизменившегося draft; иначе Copy и объяснение.
10. Обновить README и создать `IOS_ACCEPTANCE_REPORT.md`.

## P2: Windows

1. На Windows 11 с .NET SDK выполнить `dotnet test`, `dotnet build -c Release`, запуск packaged app.
2. Проверить global hotkey, tray, UIAutomation/Enter hook в Notepad, Telegram, Slack, browser textarea и Outlook.
3. Парольные поля, русский текст, URL/email/code не отправляются.
4. Token только DPAPI/Credential Locker; plaintext fallback запрещён.
5. Offline retry сохраняет исходный eventId и не дублирует progress.
6. Popup policy привести к Mac: большая карточка для clear error, compact chip для остальных, preview отдельно.
7. Проверить Replace stale-draft guard.
8. Обновить README и создать `WINDOWS_ACCEPTANCE_REPORT.md`.

## P2: Web и документация

- Не добавлять уроки английского.
- Проверить responsive страницы Login, Devices, Inbox, Today, Settings, Export/Delete.
- Удалить mock-кнопки и неподключённые состояния только там, где реальный endpoint уже есть.
- Все destructive действия требуют confirmation; revoke/delete проверять повторно после refresh.
- Привести `english/ENGLISH_ARCHITECTURE.md` и README клиентов к фактическому коду. Не писать «готово», «signed», «deployed» без артефакта.
- В документации всегда называть канонический Android путь `android/LinguaLearn`.

## Общие критерии приёмки

- `cd english && npm test && npm run build`.
- Linux Node suite допускает пропуск только тестов, которым действительно нужен браузер/другая ОС; причина записана.
- На каждой нативной ОС: unit tests, release build, реальный device test и отчёт с commit SHA.
- Ни один fixture/report/log не содержит токен, пароль, cookie или реальный пользовательский текст.
- Повтор одного `eventId` не создаёт второй sample/evidence/score delta.
- Preview не меняет progress.
- 2xx `accepted=false` считается обработанным семантическим отказом, а не сетевой ошибкой.
- 408/429/5xx/transport retry; постоянные 4xx не блокируют очередь бесконечно.
- Нельзя менять или наполнять английский курс в рамках этого ТЗ.

## Формат финального отчёта исполнителя

Для каждой платформы указать: что было mock и заменено, команды и числа тестов, реальные устройства/версии ОС, SHA артефакта, сценарии manual QA, известные ограничения. Отдельно перечислить все пункты, которые не удалось выполнить; отсутствие нужной ОС или сертификата — `BLOCKED`, а не `PASS`.
