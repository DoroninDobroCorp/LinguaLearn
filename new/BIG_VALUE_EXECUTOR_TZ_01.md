# ТЗ №1 — восстановление browser-only Pinnacle feed и честного live-потока Big Value

Дата: 2026-08-10  
Заказчик/ревьюер: владелец проекта + Codex root  
Исполнитель: внешняя модель, выбранная владельцем

## 1. Цель

Восстановить и стабилизировать разрешённый тракт линии:

```text
secret: browser page/site-WebSocket parser
  -> secret: shared central aggregator
  -> reverse SSH, только loopback
  -> serverforvovka:127.0.0.1:19014
  -> bv-aggregated-feed-adapter
  -> Analyzer live :7200 / prematch :7201
```

После работы:

1. `serverforvovka` постоянно получает общий feed с `secret`;
2. live-изменения из компактных browser-WS кадров `odds.u` обрабатываются без ожидания редкого полного snapshot;
3. freshness строится только по времени реального browser-кадра;
4. свежий авторитетный browser-WS update не маркируется `stale=true` лишь из-за отсутствия запрещённого API;
5. реальные пары/value проверены, ложные гигантские ROI не возвращаются.

## 2. Абсолютные запреты

### 2.1. Pinnacle API запрещён без исключений

Запрещено:

- официальный, partner, guest, Arcadia, REST, GraphQL или любой другой Pinnacle/PS3838/Pin888 API;
- самостоятельные HTTP-клиенты к provider endpoint;
- API key/login/password/token;
- API fallback при потере browser feed;
- bet service и маршруты `verify`, `place`, `balance`;
- восстановление удалённых `parse_serge`, `parse_ps3838`, Pin fleet или browser runtime на `serverforvovka`.

Разрешено только то сетевое взаимодействие, которое выполняет уже открытая настоящая browser-страница на `secret`: DOM и site WebSocket этой страницы.

Перед изменениями и после каждого этапа обязательно:

```bash
/srv/pin888/bin/check-no-pinnacle-api
ssh serverforvovka /srv/big_value/scripts/check_no_pinnacle_api.sh
```

Обе проверки должны завершаться успешно. Запрещено ослаблять guards.

### 2.2. Запрещено подделывать свежесть

Нельзя использовать как подтверждение цены:

- `LastUpdated` агрегатора;
- время получения/отправки сообщения;
- heartbeat;
- `time.time()`/`now()` fallback;
- время reconnect/replay;
- искусственно обновлённый `CreatedAt`.

Единственное разрешённое подтверждение — валидный Unix millisecond timestamp `frame["time"]` конкретного browser site-WS кадра. Он преобразуется в UTC/Unix seconds и применяется только к рынку, реально затронутому этим кадром.

### 2.3. Общие эксплуатационные ограничения

- Парсер на `secret` общий для нескольких проектов: нельзя менять envelope, IDs, названия источника, существующие odds или удалять совместимые поля.
- `Source` для Big Value остаётся строго `Pinnacle`.
- Не выводить cookies, токены, пароли, proxy credentials и содержимое secret env.
- Не запускать fresh-login loop.
- Не делать `git reset`, `git clean`, `git restore`, commit или push.
- Не трогать dirty worktree `/srv/big_value` вне явно указанного scope.
- Не восстанавливать Piwi/Pin runtime на `serverforvovka`.
- Не размаскировать `pncl.service`, `pncl-live-fallback.service`, `pncl-line-watchdog.service`, `pncl-line-watchdog.timer` на `secret`.
- Не отправлять synthetic события в production Analyzer.
- До любого изменения сохранять файл в timestamped backup и фиксировать SHA-256 до/после.

## 3. Текущее известное состояние

### Уже исправлено — не ломать

- Удалены Pinnacle API/gateway/bet-service пути в Big Value.
- Calculator routes `/pinnacle/{verify,place,balance}` и `/verify-ps3838-bet` возвращают 404.
- Calculator freshness: live 5 s, prematch 90 s, bypass удалён.
- Analyzer:
  - strict `_market_ts`;
  - native margin `>1.20` fail-closed;
  - prematch start delta `<=30 min`;
  - live Soccer DNB/AH0 при неравном счёте fail-closed;
  - детерминированный signed-zero handicap;
  - prematch price age 90 s.
- Cross-period contamination исправлена: период берётся по индексу, если `Number` отсутствует.
- Browser full frames уже ставят `_market_ts` от `frame["time"]`.
- Central aggregator уже имеет live-priority для `transport=browser_ws` + `payload.isLive=true`.
- Auto Matcher прошёл отдельный безопасный canary; его в этом ТЗ не менять.

### Нерешённая первопричина live

Browser site-WS присылает live `UPDATE_ODDS` примерно каждые 1–3 s. Большинство кадров имеют:

- `refreshAll=false`;
- компактные изменения в `odds.u`;
- без полного `odds.l` event tree.

Текущий `normalize_full_odds()` не может превратить такие `u`-дельты в `GameData`, поэтому consumer обновляется только на редких полных `refreshAll/odds.l` кадрах. Наблюдались gaps 16–24 s при live TTL 7 s.

### Важный transport-факт для перепроверки

Последний read-only аудит обнаружил `connection refused` на `serverforvovka:127.0.0.1:19014`, хотя раньше reverse feed работал. Не считать это постоянным фактом: сначала перепроверить. Если feed всё ещё down, сначала восстановить только reverse SSH transport, не изменяя parser/odds code.

## 4. Этап A — обязательный read-only baseline

Ничего не менять до сохранения результатов следующих проверок в handoff-отчёт.

### `serverforvovka`

Проверить:

```bash
systemctl --failed --no-pager
systemctl show bv-aggregated-feed-adapter.service \
  -p ActiveState -p SubState -p MainPID -p NRestarts -p ActiveEnterTimestamp
ss -lntp | grep -E ':(19014|19015|7200|7201)\b'
curl -fsS http://127.0.0.1:19014/health
curl -fsS http://127.0.0.1:19015/health
curl -fsS http://127.0.0.1:7005/health
curl -fsS http://127.0.0.1:7006/health
/srv/big_value/scripts/check_no_pinnacle_api.sh
```

Зафиксировать:

- наличие listener `19014` и только loopback bind;
- upstream/downstream adapter state;
- replay/reconcile counters;
- `last_live_forward_at`, `last_prematch_forward_at`;
- Pinnacle counts в live/prematch `/match-data`;
- текущие `/pairs?min_roi=-100`.

### `secret`

Проверить:

```bash
systemctl --failed --no-pager
systemctl show ps38-aggregator.service pin888-role-fleet.service \
  -p Id -p ActiveState -p SubState -p MainPID -p NRestarts -p ActiveEnterTimestamp
curl -fsS http://127.0.0.1:9014/health
curl -fsS http://127.0.0.1:19100/health
/srv/pin888/bin/check-no-pinnacle-api
```

Не выводить EnvironmentFile.

Зафиксировать SHA-256:

```text
/srv/ps38-aggregator/current/aggregator/fleet/worker.py
/srv/ps38-aggregator/current/tests/test_fleet_runtime.py
/srv/ps38-aggregator/current/aggregator/decision.py
/srv/ps38-aggregator/current/aggregator/main.py
/srv/ps38-aggregator/current/aggregator/state_machine.py
/srv/ps38-aggregator/env/ps38-aggregator.env
```

## 5. Этап B — восстановить reverse SSH transport, если `:19014` down

Выполнять только если baseline подтвердил отсутствие feed.

Требования:

1. Найти существующий разрешённый reverse-SSH service/connection, который связывает `secret:127.0.0.1:9014` с `serverforvovka:127.0.0.1:19014`.
2. Исправить только transport/service/configuration.
3. Не создавать локальный parser/forwarder/browser на `serverforvovka`.
4. Не восстанавливать старые `bv-central-pinnacle-*`, remote fleet, bet service или старые tunnels `9012/9110/9111/8769`.
5. Listener `19014` должен быть доступен только на `127.0.0.1`.
6. После восстановления adapter должен автоматически пройти replay + snapshot reconcile.

Критерии приёмки этапа:

- `curl 127.0.0.1:19014/health` → `status=ok`;
- feed показывает минимум одного consumer после подключения adapter;
- adapter: `upstream_connected=true`, `initialized=true`, оба downstream connected;
- `replay_remaining=0`, reconcile успешен;
- prematch Pinnacle появляется в Analyzer;
- нет новых listeners опасных legacy ports;
- оба no-API guard проходят.

Если для восстановления требуется новая архитектура, новый credential или изменение неочевидного shared service — остановиться и передать blocker владельцу, не импровизировать.

## 6. Этап C — stateful применение browser `odds.u`

Основной production-файл:

```text
secret:/srv/ps38-aggregator/current/aggregator/fleet/worker.py
```

Тесты:

```text
secret:/srv/ps38-aggregator/current/tests/test_fleet_runtime.py
```

### 6.1. Перед реализацией

Сохранить обезличенный fixture одного полного live кадра и следующих за ним `odds.u` кадров. Fixture не должен содержать cookie/token/account/proxy.

Составить в handoff-отчёте точную таблицу полей `u`-строки:

```text
index -> semantic field
```

Нельзя угадывать индексы. Известно лишь, что в сохранённом контракте задействованы индексы `0,1,2,3,5,6,11,12`; исполнитель обязан доказать их смысл по browser frame и существующему raw provenance.

### 6.2. Требуемая модель cache

Добавить worker-local cache нормализованных событий:

- scope — конкретный worker/browser lifecycle;
- ключ — `(sport_id, pid)`;
- запрещено shared/global cross-account состояние;
- seed только после успешно нормализованного полного browser frame;
- cached event обязан иметь исходный `raw` provenance;
- cache очищается при новой browser/session generation, reconnect, закрытии/переоткрытии sport page и смене sport assignment;
- полный snapshot атомарно заменяет cached event для этого `pid`;
- исчезнувшее из полного snapshot событие не должно бесконечно жить в cache.

### 6.3. Идентификация leaf

Каждый `u` update допускается только при единственном точном совпадении с уже существующим provenanced leaf по полям:

```text
event_id
period
bet_type / market identity
team_select / outcome identity
handicap/line
line_id
is_alt
```

Требования:

- 0 совпадений → fail-closed, событие не публиковать, увеличить диагностический counter;
- более 1 совпадения → fail-closed как ambiguity;
- malformed/non-finite/future frame time → fail-closed;
- неизвестная новая линия не создаётся из delta без полного snapshot;
- delta другого sport/pid/period не может изменить cached event;
- timestamp не может регрессировать.

### 6.4. Обновление цены и времени

При валидном единственном совпадении:

1. изменить только найденный canonical leaf;
2. сохранить/обновить его `raw` provenance значениями из реально полученной delta;
3. обновить `_market_ts` только соответствующей market group и period;
4. timestamp = только `frame["time"] / 1000`;
5. `PriceConfirmedAt` формируется из того же frame time;
6. остальные market `_market_ts` не менять;
7. `LastUpdated`, receipt time и heartbeat не использовать.

Закрытие рынка обязательно обработать fail-safe: если валидная delta явно закрывает/обнуляет уже известный leaf, старый положительный коэффициент не должен оставаться активным. Использовать реальную семантику закрытия из fixture; не изобретать её.

После применения delta публиковать полный нормализованный `GameData`, а не частичный patch.

### 6.5. Обязательные тесты

Минимальный набор:

1. full frame seed → одна `u` delta меняет ровно один leaf;
2. меняется `_market_ts` только затронутой market group;
3. `PriceConfirmedAt` равен frame time;
4. соседний market/period не меняется;
5. unknown `line_id` fail-closed;
6. ambiguous match fail-closed;
7. malformed row/time fail-closed;
8. timestamp regression fail-closed;
9. explicit close/zero убирает старую положительную цену;
10. одинаковый `pid` в другом sport не пересекается;
11. full refresh заменяет cache;
12. reconnect/page generation очищает cache;
13. event без raw provenance не принимает delta;
14. single-sport и multi-sport worker проходят один контракт;
15. реальный `Worker._loop` на fixture публикует обновлённый полный event.

Запустить relevant existing suite, а не только новые тесты. Минимально:

```bash
python -m py_compile aggregator/fleet/worker.py
pytest -q tests/test_fleet_runtime.py tests/test_parser_merge_period.py tests/test_remote_fleet_node.py
/srv/pin888/bin/check-no-pinnacle-api
```

## 7. Этап D — explicit browser-only authority

Проблема: system topology законно остаётся `API_DEGRADED`, потому API отсутствует и запрещён. Старый decision layer из этого делал `degraded=true`, а broadcaster превращал его в wire `stale=true` даже для свежей browser-цены.

Нужен explicit default-OFF policy flag:

```text
MSP_BROWSER_ONLY_AUTHORITATIVE=1
```

Требования к поведению:

- без flag поведение полностью прежнее;
- при flag и `SystemMode.API_DEGRADED` только свежий native `AuthorityClass.BROWSER_WS` winner получает:
  - `degraded=false`;
  - `fallback_state=None`;
  - wire `stale=false`;
- `SystemModeMonitor` продолжает показывать `api_degraded` и `api_health=no_api_source` — это полезная topology telemetry;
- TAB/BIA/DOM fallback не получает послабления;
- official/API candidate в degraded mode не получает послабления;
- `HARD_DEGRADED` по-прежнему ничего не публикует;
- age/data-class/provenance gates не меняются;
- flag ничего не запускает, не импортирует и не вызывает.

Основные файлы scope:

```text
aggregator/decision.py
aggregator/main.py            # только config summary/wiring
aggregator/state_machine.py   # максимум документация, без смены mode logic
tests/test_browser_only_authoritative.py
/srv/ps38-aggregator/env/ps38-aggregator.env  # одна явная строка flag
```

Обязательные тесты:

- default OFF сохраняет старый `API_DEGRADED -> stale`;
- ON + fresh native browser WS → non-stale;
- telemetry остаётся `api_degraded/no_api_source`;
- TAB/BIA/API не благословляются;
- hard degraded не публикует;
- broadcaster envelope после решения имеет `stale=false`;
- no-API guard проходит.

## 8. Этап E — безопасный deployment

Не деплоить, пока все тесты не прошли и не подготовлен rollback.

1. Повторно сверить SHA production с baseline. При drift остановиться и rebase/review, не перетирать файл.
2. Создать timestamped backup изменяемых файлов с сохранением owner/mode.
3. Установить только review-approved diff.
4. Повторить syntax/tests/no-API guards до restart.
5. Restart только минимально необходимые units:
   - worker/cache change: `pin888-role-fleet.service`;
   - decision/env change: `ps38-aggregator.service`.
6. Не перезапускать другие Pin roles и не трогать consumers других проектов.
7. Проверить `NRestarts=0`, memory, logs, clients и reconnect adapter.

Rollback должен восстанавливать точные backup-файлы и перезапускать только соответствующий unit.

## 9. Этап F — production canary

Наблюдать минимум 15 минут, а при наличии live событий — не менее 100 последовательных live samples.

### Source/transport gates

- browser source продолжает получать кадры;
- нет HTTP 429, login loop, browser reconnect storm;
- poster dropped/errors не растут;
- aggregator/role `NRestarts=0`;
- adapter upstream/downstream connected;
- prematch counts и другие sports не исчезают;
- оба no-API guards проходят.

### Live freshness gates

По реальным `PriceConfirmedAt` и `_market_ts`, не по `LastUpdated`:

- target p50 `<=3 s`;
- target p95 `<=5 s`;
- ни одного устойчивого gap `>7 s`;
- `last_live_forward_at` регулярно движется;
- Pinnacle live не мигает из Analyzer только из-за старых полных snapshots;
- touched market timestamp движется на `u` delta;
- untouched market timestamp не освежается.

Если в период canary нет live событий, не объявлять успех: сохранить сервис безопасным и дождаться окна с реальным live.

### Browser-only stale gates

- первый настоящий post-replay fresh update имеет wire `stale=false`;
- `system_mode=api_degraded` остаётся видимым;
- `stale_rate` для свежих native browser updates перестаёт быть 1.0;
- Big Value adapter больше не накапливает `platform_degraded_frames` для таких updates.

## 10. Этап G — аудит реально найденных value

После успешного live canary минимум 20 минут собирать:

```text
live:     http://127.0.0.1:7005/pairs?min_roi=-100
prematch: http://127.0.0.1:7006/pairs?min_roi=-100
```

Для каждого ROI `>0`, а для ROI `>10%` обязательно вручную доказать:

- одинаковые sport/league/event;
- home/away orientation;
- prematch start delta `<=30 min`;
- live score/period совпадают;
- market semantics и line совпадают;
- raw provenance есть у каждой положительной Pinnacle цены;
- `raw.period` корректен;
- `_market_ts` есть у соответствующего рынка;
- age укладывается в live/prematch limit;
- native implied margin `<=1.20`;
- mapping DB не связывает разные события.

Любой ROI `>30%` считать подозрительным и не объявлять реальным, пока не доказан каждый пункт.

Обязательные regressions на production data:

- не возвращается America de Cali–Atlético Nacional `DNB 2` около `+197%` при счёте 1:0;
- не возвращается Baseball cross-period draw contamination около `+156%`;
- положительные Pinnacle leaves без `raw` = 0;
- positive base outcomes с отсутствующим `raw.period` = 0;
- cross-period injection fingerprint = 0;
- margin `>1.20` не публикуется.

## 11. Что не входит в это ТЗ

Не менять в рамках данного этапа:

- GGBet — официальный каталог сейчас доказуемо пуст; это отдельное ТЗ на diagnostics;
- `admin-auth-bot.service`;
- `tg_livebot`/Telegram connection;
- Auto Matcher/LLM keys/backoff;
- Results, Calculator, frontend;
- DB mappings без обнаруженного реального ошибочного pair;
- Piwi на `dev`;
- любые API-related dormant modules, кроме проверки guards/masks.

## 12. Формат результата исполнителя

Исполнитель возвращает один `EXECUTOR_HANDOFF_TZ01.md` и приложенные patch/diff-файлы.

В handoff обязательно:

1. baseline с UTC timestamps;
2. root cause transport, если `:19014` был down;
3. точная `odds.u` schema table;
4. список изменённых файлов;
5. SHA-256 до/после;
6. полный diff без секретов;
7. команды тестов и точные результаты;
8. no-API guard outputs;
9. systemd restart timestamps/NRestarts;
10. 15-минутная canary-таблица с live age p50/p95/max;
11. prematch/non-Soccer regression counts;
12. список всех ROI `>0` и отдельный разбор ROI `>10%`;
13. доказательство отсутствия двух известных ложных giant ROI;
14. backup paths и проверенный rollback;
15. открытые blockers/риски.

Не писать «готово» без выполнения критериев. Если live-событий для canary нет или требуется расширить scope — остановиться и вернуть частичный handoff, ничего не додумывать.

## 13. Не доверять прежним staging автоматически

В workspace уже существуют ранее созданные каталоги:

```text
ps38-soccer-cadence-patch/
parser_browser_only_mode_patch/
ps38-browser-ws-live-priority-patch/
```

Они являются только материалом для сравнения. Исполнитель обязан самостоятельно проверить каждую строку, rebase на текущий production и выполнить требования этого ТЗ. Запрещено копировать их в production вслепую.
