# Аудит английского и честный остаток нативной приёмки

Дата аудита: 2026-08-21. Источник истины: Linux production `/srv/LinguaLearn` на `serverforvovka`. Содержание английского курса не менялось.

## Что подтверждено на сервере

- `cd english && npm test`: 277 passed, 0 failed, 7 platform-only skipped.
- English production build проходит; `english-backend.service` healthy, Gemini настроен, writing/chat используют `gemini-3.5-flash-lite`.
- Mac Python hook: 5/5 тестов прошли.
- Общий контракт, exact-once eventId, preview isolation, 4-tier assessment, строгий evidence guard, user isolation и web UI покрыты Node-набором.
- Публичный Sparkle appcast и ZIP версии 0.1.1 доступны.
- Android debug APK существует; SHA256 совпадает с историческим отчётом: `623205d5579f42e19071d22c2a77bebbf642a0da525ced3378a2c5c6b45f7e92`.

## Важное несоответствие Mac-релиза

Публичный appcast 0.1.1 имеет дату 2026-08-14, а последние изменения Mac-клиента находятся в более позднем commit `076d201` от 2026-08-21. Поэтому опубликованный ZIP нельзя считать доказанной сборкой текущих исходников. Пользоваться им можно как предыдущей beta, но окончательная приёмка требует новой сборки (следующая версия, не перезапись 0.1.1), подписи, проверки и обновления appcast.

Исторические `MAC/IOS/ANDROID/WINDOWS_ACCEPTANCE_REPORT.md` относятся к commit `076d201` и не были воспроизведены в этом Linux-аудите. Не переносить их PASS-статусы на новый commit автоматически.

## Реальные внешние блокеры

- macOS/iOS: на сервере нет Xcode, simulator, Keychain/Accessibility и Apple signing environment.
- Android: Gradle 8.14.3 запускается, но `testDebugUnitTest` блокируется отсутствующим Android SDK (`sdk.dir`/`ANDROID_HOME`).
- Windows: на сервере нет Windows/.NET desktop runtime для WPF/UIAutomation.
- Физическую матрицу Notes/Telegram/Slack/browser/Mail и реальные устройства нельзя честно заменить static grep-тестом.

## Точное задание следующему исполнителю

Полный порядок и критерии находятся в `english/NATIVE_CLIENTS_FINISH_TZ_RU.md`. Начать с Mac, потому что это основной пользовательский сценарий:

1. На Mac получить текущий commit, выполнить `swift test`, release build, `Scripts/build-app.sh` и `Scripts/doctor.sh`.
2. Пройти реальную матрицу automatic-send и preview в Notes, Telegram, Slack, Safari/Chrome textarea и Mail; отдельно secure fields, русский текст, URL/email/code, offline queue и stale-draft Replace.
3. Проверить pairing настоящим device token и Keychain, затем выпустить новую версию выше 0.1.1. Не изменять старый ZIP/appcast задним числом.
4. Зафиксировать SHA commit, SHA256 ZIP, версию macOS/Xcode, codesign/notarization факты и обезличенные screenshots. Только после этого заменить статус Mac на PASS.
5. Затем Android на SDK 34: `./gradlew testDebugUnitTest assembleDebug lintDebug`, emulator API 26/30/34 и физическое устройство.
6. Затем iOS simulator + физический iPhone, App Group/Keychain/Full Access/keyboard extension.
7. Затем Windows 11: `dotnet test`, release build и реальная UIAutomation-матрица.

Запрещено объявлять платформу принятой только по наличию исходников, regex-тестам или старому отчёту. Простые UI/README/скриншоты можно выполнять дешёвой моделью; решения по capture, secure storage, retry/exact-once, stale-draft replacement и signing должен проверять сильный инженер.
