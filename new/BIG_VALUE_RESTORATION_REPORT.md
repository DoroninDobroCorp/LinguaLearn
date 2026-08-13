# Big Value — восстановление, аудит вилок и production-проверка

Дата завершения: 2026-08-09  
Основной сервер: `serverforvovka`  
Production-проект: `/srv/big_value`  
Источник Pinnacle: `secret`, `/opt/ps38-aggregator/current`  
Проверенный commit Big Value: `f9529d975d5022dea3b1e1a956c17e4cafeab7ad`

## Итог

Контур Big Value восстановлен и приведён в безопасное рабочее состояние:

- live- и prematch-анализаторы, Results, Calculator, Auto Matcher, PostgreSQL и Redis работают;
- Sansabet и Volcano стабильно передают реальные live/prematch-события;
- центральный канал доставки Pinnacle с `secret` в оба анализатора восстановлен, включён и автоматически переживает краткие перезапуски источника;
- исправлены слишком большой допуск устаревшей цены и изменяемое время создания принятой ставки; существующая защита score-sensitive эквивалентностей подтверждена на реальном ложном сценарии и закреплена регрессионными тестами;
- проверены реальные принятые ставки и большой исторический журнал ROI;
- исправлены даты prematch-событий Sansabet и Volcano;
- GGBet переведён на актуальный официальный GraphQL-контракт, перестал бесконечно перелогиниваться и честно сообщает `degraded`, когда официальный каталог пуст;
- устранена аварийная причина заполнения диска на `secret`: безграничная SQLite-provenance база безопасно архивирована, проверена и отключена;
- все изменённые модули пересобраны, перезапущены и протестированы.

Остаётся один внешний блокер: центральный агрегатор Pinnacle сейчас отдаёт корректный пустой inventory, потому что оба доступных Pin888-аккаунта не могут получать линию. Один аккаунт явно сообщает `account suspended`, второй не проходит вход; официальных Pinnacle API credentials нет. Big Value правильно не создаёт вилки без второй стороны сравнения и не подменяет Pinnacle запаздывающим публичным зеркалом.

Текущий результат API вилок:

- live `/pairs`: `0`;
- prematch `/pairs`: `0`;
- live/prematch `/cache-pairs`: `0`;
- причина: пустая сторона Pinnacle, а не падение анализатора или доноров.

## Production-состояние после работ

| Контур | Состояние | Проверка |
|---|---|---|
| Analyzer live | healthy | HTTP 200, PostgreSQL `ok` |
| Analyzer prematch | healthy | HTTP 200, PostgreSQL `ok` |
| Results | healthy | HTTP 200 |
| Calculator | healthy | HTTP 200, PostgreSQL `ok` |
| Auto Matcher live/prematch | healthy | HTTP 200, LLM и PostgreSQL `ok` |
| PostgreSQL | healthy | `pg_isready`: accepting connections |
| Redis | healthy | `PONG` |
| Sansabet live/prematch | healthy | HTTP 200, свежие события |
| Volcano live/prematch | healthy | HTTP 200, sender errors/reconnects = 0 |
| GGBet live/prematch | degraded ожидаемо | официальный источник подключён, но возвращает 0 событий |
| Pinnacle tunnel | active + enabled | локальный health через `127.0.0.1:9012`: `ok`, 3 клиента |
| Pinnacle forwarder live | active + enabled | соединён с source и analyzer live |
| Pinnacle forwarder prematch | active + enabled | соединён с source и analyzer prematch |
| Pin888 remote fleet | inactive + disabled | остановлен из-за нерабочих аккаунтов |
| Parser duty rotation | inactive + disabled | не может снова запускать Pin888 fleet |
| Piwi producer | inactive + disabled | ранее получал 403/не давал авторитетную линию |
| `ps38-aggregator` на `secret` | active | health `ok`, 3 клиента |

За финальные 15 минут во всех затронутых приложениях найдено `0` маркеров `error/fatal/panic/exception`. У всех текущих контейнеров restart count равен нулю, кроме старого `tg_prematch_bot=4`; эти четыре рестарта произошли до данной работы, контейнер сейчас работает. Единственные `unhealthy` контейнеры — два GGBet, и их HTTP 503 намеренно отражает пустой внешний каталог.

Ресурсы после работ:

- `serverforvovka`: 64 GiB свободно на диске, 18 GiB доступной RAM;
- `secret`: 45 GiB свободно, использование корневого диска 17% вместо 91% до очистки.

## Реальные данные доноров

Финальный read-only аудит `/match-data` выполнен непосредственно на production.

### Live

- 81 событие: Sansabet 35, Volcano 46;
- возраст данных: min 1,55 с, p50 1,57 с, p90 1,92 с, max 1,93 с;
- 1 728 активных коэффициентов;
- диапазон коэффициентов: 1,01–71,00;
- нечисловых, бесконечных и коэффициентов `<= 1` — 0;
- будущих `CreatedAt` — 0;
- 35 отсутствующих `matchDate` относятся только к Sansabet live; live-eviction использует `CreatedAt`/счёт, поэтому scheduled time здесь не влияет на срок жизни события.

Максимальный текущий коэффициент 71 — реальная длинная позиция Sansabet `DoubleChance X2` при счёте 7:0. Это не самостоятельная вилочная ошибка. Для такого сценария специально проверена защита: после начала матча `DoubleChance X2` не может канонизироваться в `Handicap 2 +0.5`.

### Prematch

- 1 215 событий: Sansabet 704, Volcano 511;
- возраст данных: min 2,44 с, p50 2,70 с, p90 22,77 с, p99 22,78 с, max 68,24 с;
- 136 116 активных коэффициентов;
- диапазон коэффициентов: 1,01–151,00;
- невалидных коэффициентов — 0;
- отсутствующих/нулевых `matchDate` — 0;
- максимальные 151 относятся преимущественно к рынку `CorrectScore`, то есть к легитимным редким исходам.

## Разбор крупных вилок

### Исторический журнал кандидатов

Проанализирован `/srv/big_value/logs/roi/roi_mapping.log`:

- 317 834 JSON-строки, 75 повреждённых;
- 138 809 записей с ROI `>=30%`;
- 96 922 с ROI `>=50%`;
- 57 993 с ROI `>=100%`;
- 29 439 с ROI `>=200%`;
- 53 720 уникальных кандидатов с ROI `>=30%`;
- 44 695 записей использовали equivalence matching;
- 94 114 использовали native matching;
- возраст цены: p50 12 с, p90 71 с, p99 2 856 с, максимум 6 490 с.

Две основные причины огромных исторических ROI:

1. Score-sensitive equivalence после изменения счёта. Характерный ложный пример: Soccer при счёте 5:1, Sansabet `DoubleChance X2` около 102 сопоставлялся с Pinnacle `Handicap 2 +0.5` около 1,168. До начала матча рынки эквивалентны, после забитых голов — уже нет.
2. Очень старая сторона пары. Конфигурация допускала цену возрастом до 10 000 секунд, а в журнале реально встречались значения до 6 490 секунд.

### Что сделано против ложных крупных ROI

- публичный допуск возраста цены анализатора уменьшен с 10 000 до 15 секунд;
- конфигурационный betting-age приведён с 10 000 к 5 секундам;
- отдельно подтверждено, что фактический Calculator использует собственный gate: 5 секунд для live и 60 секунд для prematch; поле `max_price_age_for_betting_seconds` самого Analyzer сейчас не участвует в решении Calculator, поэтому оно не заявляется как единственная защита;
- существующий `canUseScoreSensitiveEquivalence` проверен таблицей регрессий;
- добавлен точный regression case со счётом 5:1: `DoubleChance X2` остаётся native и не превращается в `Handicap 2 +0.5` ни для Pinnacle, ни для донора;
- подтверждено, что при 0:0 безопасная prematch-эквивалентность продолжает работать;
- исправлены вводившие в заблуждение комментарии рядом с equivalence mapping.

### Реально принятые ставки

Отдельно проверена production-таблица `calculator.log_bet_accept`, а не только лог кандидатов:

- всего 444 принятые ставки;
- min ROI: 3,0080%;
- median: 4,7747%;
- p90: 10,0625%;
- p99: 19,2952%;
- max: 22,5826%;
- ROI `>=10%`: 46;
- ROI `>=30%`: 0;
- ROI `>=100%`: 0.

То есть огромные исторические кандидаты не превратились в реальные ставки. Максимальная фактически принятая ставка имела ROI 22,58%, а не сотни процентов.

## Изменения Big Value

### 1. Центральная доставка Pinnacle

Создан и установлен отдельный production-транспорт:

- `backend/parsers/central_pinnacle_forwarder.py`;
- `backend/parsers/test_central_pinnacle_forwarder.py`;
- `scripts/systemd/bv-central-pinnacle-feed.service`;
- `scripts/systemd/bv-central-pinnacle-live.service`;
- `scripts/systemd/bv-central-pinnacle-prematch.service`.

Схема:

`secret:9014` → постоянный SSH tunnel `serverforvovka:9012` → отдельные live/prematch forwarder → analyzer ports 7200/7201.

Forwarder:

- разделяет source и destination reconnect, поэтому падение одной стороны не убивает другую;
- имеет bounded backoff;
- после reconnect повторно отправляет актуальный буфер;
- обрабатывает `init/state/heartbeat`;
- уважает live/prematch scope;
- при исчезновении события отправляет tombstone с сохранением финального счёта и очищенными рынками;
- помечает данные stale при потере source и снимает флаг после восстановления.

Все три unit включены в автозапуск. Краткие разрывы при обслуживании агрегатора 22:46 и 22:50 UTC были автоматически восстановлены; после 22:51 reconnect-ошибок нет.

### 2. Analyzer

Изменены:

- `backend/analyzer/configs/common.yml`;
- `backend/analyzer/internal/service/equivalences.go`;
- добавлен `backend/analyzer/internal/service/equivalences_score_sensitive_test.go`.

Результат:

- устаревшие цены больше не остаются публичными часами;
- score-sensitive equivalence защищена воспроизводимым тестом на реальном типе ложной вилки;
- live и prematch Analyzer пересобраны, перезапущены и healthy.

### 3. Results и неизменяемое время ставки

Изменены:

- `backend/results/internal/service/bet_service.go`;
- `backend/results/internal/repository/bet_repository.go`;
- добавлен `backend/results/internal/service/bet_service_time_test.go`;
- исправлен `backend/.dockerignore`.

Корень проблемы: legacy Results при каждом retry переписывал `calculator.log_bet_accept.created_at`. Из-за этого:

- prematch timeout 72 часа фактически никогда не наступал;
- старая ставка могла выглядеть созданной сегодня;
- возраст обработки переставал быть достоверным.

Исправление:

- оригинальное время берётся из неизменяемого `pair.createdAt` payload;
- значение БД используется только как fallback для legacy-записей;
- retry больше не обновляет `created_at`;
- удалён неиспользуемый/опасный repository API `UpdateBetTime`;
- возраст processing рассчитывается от оригинального времени.

В БД транзакционно исправлены 42 исторические строки. До изменения создана таблица:

`calculator.log_bet_accept_created_at_backup_20260808`

Финальный SQL-аудит:

- строк в backup: 42;
- timestamp mismatches `>5 минут`: 0.

В `.dockerignore` удалено ошибочное правило `**/results`, которое исключало исходники Results из Docker build context и делало пересборку production image невозможной.

### 4. Sansabet prematch

Изменены:

- `backend/parsers/parse_sansabet/internal/service/prematch_service.go`;
- добавлен `backend/parsers/parse_sansabet/internal/service/prematch_match_date_test.go`.

API Sansabet сейчас отдаёт часть дат как `DD.MM.YYYY` без времени. Старый parser превращал их в zero time. Теперь:

- RFC3339 и полноценные datetime сохраняются;
- date-only трактуется как конец указанного UTC-дня, что совпадает с существующей семантикой 24-часового prematch-фильтра;
- после rebuild у текущих prematch-событий нет нулевых `matchDate`.

### 5. Volcano

Изменены:

- `backend/parsers/parse_volcano/main.py`;
- добавлен `backend/parsers/parse_volcano/test_match_date.py`.

Parser теперь передаёт канонический RFC3339 `matchDate` из `start_at`, сохраняя legacy `StartAt` для совместимости. Live и prematch контейнеры пересобраны и healthy.

### 6. GGBet

Изменены:

- `backend/parsers/parse_ggbet/main.py`;
- добавлен `backend/parsers/parse_ggbet/test_main.py`.

Исправлено:

- установлен актуальный официальный persisted-query contract и `marketStatusesForSportEvent`;
- `payload.data=null`, GraphQL `next`, частичные errors и `matches=null` больше не роняют цикл;
- пустой официальный ответ считается пустым каталогом, а не transport crash;
- health возвращает 503/degraded, если соединение есть, но свежих событий нет;
- пустой live/prematch опрашивается раз в 60 секунд без агрессивного loop;
- auth token сохраняется при transport/idle close, поэтому Chromium не запускается на каждом пустом цикле.

Финальный снимок после 68 циклов для каждого режима:

- `connected=true`;
- `errors=0`;
- `ws_reconnects=0`;
- sender errors/reconnects = 0;
- `events_tracked=0`.

Официальные страницы GGBet live/sports и официальный GraphQL одновременно отдавали 0 событий. Поэтому контейнеры оставлены работающими для автоматического восстановления источника, но их health намеренно не маскирует отсутствие данных.

## Изменения на Pinnacle-стороне

Код источника менялся только там, где дефект был воспроизведён и покрыт проверками.

### Auth/runtime detection

Исправлен порядок fatal-auth markers в:

- `secret:/opt/ps38-aggregator/current/aggregator/fleet/worker.py`;
- `serverforvovka:/opt/ps38-remote-fleet/current/aggregator/fleet/worker.py`;
- соответствующих `tests/test_fleet_runtime.py` на обоих узлах.

До исправления текст страницы с предложением `balance/deposit` мог ошибочно считаться доказательством успешной авторизации, даже если страница одновременно сообщала, что аккаунт suspended/closed. Теперь отрицательные признаки доступа проверяются раньше положительных; отдельно добавлен fail для `NO_ODDS_CHANNEL`.

На node прошли runtime-тесты и прямые assertions. На `secret` отсутствует pytest, поэтому выполнены AST/syntax-проверка и прямые assertions на тех же случаях. Агрегатор не перезапускался только ради изменения worker: текущий source всё равно не имеет рабочего fleet account.

Для remote fleet установлен проверенный domain override:

`/etc/systemd/system/pin888-remote-fleet.service.d/60-working-domain.conf`

Он указывает канонический storefront `www.ps3838.com`. Два существующих аккаунта после этого всё равно не дали линию: один suspended, второй не авторизуется.

### Защита от повторного запуска заблокированных аккаунтов

Остановлены и отключены:

- `pin888-remote-fleet.service`;
- `parser-duty-rotation.service`.

Во время финальной проверки было обнаружено, что сохранённый `enabled` state и работающий rotation daemon снова запускали fleet каждые восемь минут. Сначала остановлен rotation, затем fleet; оба unit удалены из `multi-user.target.wants`. Повторная проверка показала `inactive+disabled`, новых запусков нет.

`pin888-bet-service.service` оставлен активным как пассивный компонент. Он не может поставить ставку без свежей parser session и почти не потребляет ресурсов.

### Provenance SQLite и диск `secret`

Обнаружена отдельная production-угроза:

- `/opt/ps38-aggregator/logs/provenance.sqlite3` вырос до 26,6 GB;
- около 120 млн строк размножались по пяти таблицам для каждого frame;
- корневой диск был заполнен на 91%; оставалось около 5,5 GB;
- создание индексов при старте могло блокировать health-port и перезапуск сервиса.

Введён systemd drop-in:

`/etc/systemd/system/ps38-aggregator.service.d/99-disable-unbounded-provenance-sqlite.conf`

Он снимает `MSP_STORE_SQLITE_PATH` после EnvironmentFile. Bounded in-memory provenance остаётся активной; безграничное durable per-frame зеркало отключено.

Старая БД:

1. остановлена для консистентного копирования;
2. сжата и перенесена с `secret` на `serverforvovka`;
3. полностью проверена командой `gzip -t`;
4. проверена SHA-256;
5. только затем удалены исходные DB/WAL/SHM;
6. завершён старый read-only SQL-процесс, удерживавший deleted inode.

Архив:

`/srv/big_value-backups/20260809-big-value-restore/central-pinnacle/provenance.sqlite3.secret-pre-retention-20260809.gz`

- размер: 3 721 833 040 bytes;
- SHA-256: `f5cd42b0a9067475838c9af59f8925175a58bca94ecfdf25dfd89569e7465fd8`.

Финально старого SQLite-файла и процесса-владельца deleted inode на `secret` нет. `ps38-aggregator` healthy; health watchdog/recycle/load/RSS timers активны.

В ходе исследования был отдельно разработан и прямыми тестами проверен вариант retention для SQLite store, но он не оставлен в production: безопаснее полностью выключить текущую per-frame схему до появления bounded aggregate design. `aggregator/store.py` и его тест восстановлены байт-в-байт из backup; в отчёте этот prototype не заявляется как production-изменение.

## Выполненные тесты

Все проверки выполнялись на удалённых production-узлах или внутри тех же Docker images.

### Сборка и unit/regression

- `docker compose -f docker-compose.master.yml config -q` — успешно;
- Analyzer: полный `go test ./...` — успешно;
- Results: полный `go test ./...` — успешно;
- Sansabet: полный `go test ./...` — успешно;
- GGBet: 3/3 unittest — успешно;
- Volcano: 2/2 unittest — успешно;
- central Pinnacle forwarder: 3/3 pytest — успешно;
- `python3 -m py_compile central_pinnacle_forwarder.py` — успешно;
- `git diff --check` по всем изменённым tracked-файлам — успешно.

### Integration/production

- HTTP health Analyzer live/prematch, Results, Calculator и Auto Matcher — 200;
- HTTP health Sansabet/Volcano live/prematch — 200;
- GGBet — ожидаемый 503 с точным `status=degraded`, не ложный green;
- PostgreSQL — accepting connections;
- Redis — PONG;
- central Pinnacle tunnel health — `ok`, 3 клиента;
- live/prematch `/match-data` — реальные свежие события, 0 невалидных коэффициентов;
- live/prematch `/pairs` и `/cache-pairs` — согласованно 0 при пустом Pinnacle inventory;
- 15-минутный аудит логов затронутых приложений — 0 error markers;
- container restart audit — новые рестарты отсутствуют;
- full gzip integrity и SHA-256 provenance archive — успешно;
- после исправления БД — 0 timestamp mismatch.

## Резервные копии

Backups Big Value вынесены из Git worktree:

- `/srv/big_value-backups/20260808-big-value-restore/`;
- `/srv/big_value-backups/20260809-big-value-restore/`.

Там находятся исходные версии `.dockerignore`, Analyzer config/comments, GGBet, Sansabet, Volcano, Results service/repository и проверенный provenance archive.

Worker backups сохранены отдельно:

- `secret:/opt/ps38-aggregator/current/aggregator/fleet/worker.py.bak-20260808-big-value-restore`;
- `secret:/opt/ps38-aggregator/current/tests/test_fleet_runtime.py.bak-20260808-big-value-restore`;
- `serverforvovka:/opt/ps38-remote-fleet/current/aggregator/fleet/worker.py.bak-20260808-big-value-restore`;
- `serverforvovka:/opt/ps38-remote-fleet/current/tests/test_fleet_runtime.py.bak-20260808-big-value-restore`.

Все 42 исправленные database timestamp сохранены в `calculator.log_bet_accept_created_at_backup_20260808`.

## Изменённые production-файлы

### Tracked Big Value

- `backend/.dockerignore`
- `backend/analyzer/configs/common.yml`
- `backend/analyzer/internal/service/equivalences.go`
- `backend/parsers/parse_ggbet/main.py`
- `backend/parsers/parse_sansabet/internal/service/prematch_service.go`
- `backend/parsers/parse_volcano/main.py`
- `backend/results/internal/repository/bet_repository.go`
- `backend/results/internal/service/bet_service.go`

Итог tracked diff этих файлов: 164 additions, 102 deletions; `git diff --check` чистый.

### Добавленные Big Value

- `backend/analyzer/internal/service/equivalences_score_sensitive_test.go`
- `backend/parsers/central_pinnacle_forwarder.py`
- `backend/parsers/test_central_pinnacle_forwarder.py`
- `backend/parsers/parse_ggbet/test_main.py`
- `backend/parsers/parse_sansabet/internal/service/prematch_match_date_test.go`
- `backend/parsers/parse_volcano/test_match_date.py`
- `backend/results/internal/service/bet_service_time_test.go`
- `scripts/systemd/bv-central-pinnacle-feed.service`
- `scripts/systemd/bv-central-pinnacle-live.service`
- `scripts/systemd/bv-central-pinnacle-prematch.service`

### Вне Git worktree

- worker/test на `secret` и remote-fleet node;
- Pin888 domain drop-in;
- aggregator SQLite-disable drop-in;
- три установленных systemd unit центральной доставки;
- database repair + backup table;
- внешние backup directories.

## Что намеренно не делалось

- Не выполнялись `git reset`, checkout чужих файлов или очистка большого pre-existing dirty worktree.
- Не создавался commit: пользователь этого не просил.
- Не подменялась линия Pinnacle публичным guest mirror: оно запаздывает и может создавать ложные вилки.
- Не включался официальный Pinnacle API без credentials.
- Не оставлялся непроверенный SQLite retention prototype.
- Не маскировалось отсутствие GGBet/Pinnacle событий ложным healthy.
- Не запускался автобеттинг без свежей Pinnacle session.

В `/srv/big_value` до начала работы уже было много изменённых, удалённых и новых файлов. Они сохранены. В список выше включены только файлы, относящиеся к этой работе; прочие записи `git status` принадлежат существующему рабочему дереву.

## Что нужно для появления реальных вилок

### Pinnacle

Нужен хотя бы один из вариантов:

1. новый рабочий PS3838/Pin888 account с доступом к odds channel;
2. официальные Pinnacle API credentials;
3. другой доказанно свежий и авторитетный источник Pinnacle.

После безопасного обновления account file и отдельной ручной проверки входа можно вернуть fleet:

```bash
sudo systemctl enable --now pin888-remote-fleet.service
sudo systemctl enable --now parser-duty-rotation.service
```

До появления валидного аккаунта эти команды выполнять нельзя. Центральный tunnel и оба forwarder уже работают, поэтому после появления inventory Big Value автоматически начнёт получать Pinnacle и рассчитывать пары.

### GGBet

Дополнительных действий сейчас не требуется. Контейнеры подключены к официальному контракту и продолжат 60-секундный polling; health автоматически станет green только после получения реальных свежих событий.

## Заключение

Внутренние дефекты Big Value, которые можно было воспроизвести и исправить без выдумывания линии, устранены. Донорские парсеры, matching, freshness, Results, database timestamps, transport и эксплуатационная устойчивость проверены повторно на production. Большие исторические вилки разобраны до конкретных рынков и времён; защитные сценарии закреплены тестами. Система не публикует ложные пары при пустом Pinnacle и готова автоматически возобновить расчёт после появления рабочего авторитетного источника.
