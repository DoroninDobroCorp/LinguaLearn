# Корректирующее ТЗ №1.2 — реальные доказательства live и завершение delta-cache

Дата независимого ревью: 2026-08-11 23:57 UTC  
Статус предыдущей сдачи: **НЕ ПРИНЯТО**.

## 1. Что уже исправно — сохранить

На момент ревью:

- distributed parser desired-state = `running`;
- `ps38-aggregator`, `pin888-role-fleet`, reverse SSH tunnel и `bv-aggregated-feed-adapter` active/running + enabled;
- `19014/19015/7200/7201` доступны только в разрешённом внутреннем тракте;
- adapter завершил replay/reconcile, оба downstream connected;
- оба no-Pinnacle-API guards проходят;
- browser-only authority не накапливает `platform_degraded_frames`;
- transactional deep-copy исправляет один покрытый случай `valid long row + unknown long row`;
- strict positive `line_id` и `is_alt` checks добавлены.

Не откатывать эти части и не останавливать рабочий prematch/feed без необходимости.

## 2. Почему Correction 01 не принята

### 2.1. Доказательства canary противоречат друг другу

- Mission summary: `7,311 samples`, p50 `2.81s`, p95 `4.21s`.
- Incoming handoff: `142 samples`, p50 `1.85s`, p95 `3.42s`.
- В Section 11 raw canary JSON равен пустому объекту `{}`.
- В `incoming/` нет приложенных raw canary/diff/fixture artifacts — только один Markdown.
- `validation-state.json` и evidence-файлы лишь повторяют таблицу handoff и не содержат raw sample series, из которой можно пересчитать percentiles/gaps.

Независимый read-only sampler после сдачи, 89 последовательных 1-second samples:

```json
{
  "duration": 89.818,
  "samples": 89,
  "samples_with_pinnacle": 13,
  "availability_pct": 14.607,
  "max_pinnacle_count": 6,
  "forward_change_count": 6,
  "forward_gap_p50": 2.052,
  "forward_gap_max": 31.630
}
```

При этом central source имел live events. Pinnacle live продолжает мигать из Analyzer; max gap сильно превышает 7s.

### 2.2. Обязательный test suite не проходит

Точная команда из ТЗ с четырьмя secret suites падает при collection:

```text
ImportError: cannot import name '_remote_frame_family' from 'aggregator.main'
tests/test_remote_fleet_node.py
```

Сокращённые `118 passed` не заменяют обязательный suite. Mission summary одновременно заявляет `111 passed`, что также не совпадает с handoff.

### 2.3. Транзакционность всё ещё обходится

Production `apply_odds_u_delta()` сначала формирует `rows_by_pid`, добавляя только строки `len>=13` с подходящим PID. Malformed строки молча выбрасываются до transactional validation.

Независимое воспроизведение:

```text
valid_plus_short_row {'emitted': 1, 'cache_changed': True, 'value': 1.221}
```

То есть frame с valid row и malformed short row публикует частичное изменение — это нарушение fail-closed/atomic contract.

### 2.4. Malformed price превращается в ложное закрытие

Текущий код на `ValueError`, NaN, infinity или odds `<1` ставит `new_odds=0.0`, после чего коммитит cache и публикует event.

Независимое воспроизведение:

```text
malformed_price {'emitted': 1, 'cache_changed': True, 'value': 0.0}
```

Непарсибельная цена не является доказанным закрытием рынка. Она обязана fail-closed без mutation. Обнуление разрешено только для явно доказанной browser-frame семантики closure.

### 2.5. Lifecycle test снова не проверяет lifecycle

`test_production_cache_lifecycle_integration` напрямую вызывает `worker.clear_event_cache()`. Он не запускает reconnect/page/batch production path.

В `MultiSportWorker.run` после обычного завершения batch страницы закрываются, но cache каждого `sid` не очищается. При следующем открытии sport page старый session cache может принять delta до нового authoritative full snapshot.

### 2.6. Schema table фактически неверна

Report утверждает:

```text
index 0 = pid
index 1 = period
index 6 = status
```

Production code и fixture используют:

```text
row[0]  = period_type
row[1]  = market_type
row[2]  = side/team_select encoding
row[3]  = line/handicap
row[5]  = decimal odds
row[6]  = id1 (точный смысл доказать)
row[7]  = id2/line_id candidate (точный смысл доказать)
row[8]  = is_alt
row[10] = status marker (observed "O")
row[12] = pid
```

Индексы `4`, `9`, `11` нельзя придумывать — обозначить unknown/unused, пока смысл не доказан.

### 2.7. Value audit повторно использован

Duration `1211.6672670841217`, 49 pair IDs и четыре положительные пары совпадают с предыдущим handoff до Correction 01. Evidence-файл лишь цитирует Section 14 и не содержит нового raw audit artifact. Это не новый audit после нынешнего deploy/restart.

### 2.8. Root cause остановки описан неполно

`distributed-parser-desired-state` — инструмент записи состояния, а не объяснение, кто/какой job/operator вызвал `set stopped` в 21:19. Если actor уже невозможно доказать, так и написать: `actor unknown`; не называть setter root cause.

## 3. Абсолютный no-API контракт

- Никаких official/partner/guest/Arcadia/REST/GraphQL/provider API.
- Никаких API fallback, bet service, verify/place/balance.
- Только настоящая browser page/site-WebSocket на `secret`, internal aggregator, reverse SSH и Big Value adapter/Analyzer.
- Не использовать `LastUpdated`, arrival/receipt/heartbeat/reconnect/now как freshness.
- Не запускать Pin/Piwi/browser runtime на `serverforvovka`.
- Не трогать Piwi на dev, другие shared consumers и dormant API units.
- Не выводить env/cookies/credentials/tokens.
- Не делать git reset/clean/restore/commit/push.

До и после каждого этапа:

```bash
/srv/pin888/bin/check-no-pinnacle-api
ssh serverforvovka /srv/big_value/scripts/check_no_pinnacle_api.sh
```

### 3.1. Pinnacle — единственный эталон value

Это отдельный абсолютный бизнес-контракт:

- Любой value/ROI рассчитывается только как `конкретная донорская БК ↔ свежая валидная линия Pinnacle`.
- Запрещены `Sansabet ↔ Volcano`, `Volcano ↔ GGBet`, `Sansabet ↔ GGBet` и любые другие donor-to-donor пары/value.
- В каждой публикуемой actionable pair ровно одна сторона должна иметь `Source=Pinnacle`, вторая — разрешённый donor.
- Нельзя назначать другую БК временным эталоном, усреднять donors или публиковать consensus-value без Pinnacle.
- Историческая Pinnacle цена допустима только пока она проходит честный live/prematch freshness limit. После истечения TTL она не является reference.

Если browser parser/central Pinnacle feed объективно выключен, unhealthy или не подтвердил конкретный event/market:

1. fail-closed — actionable value/pairs для этого event/market = 0;
2. donor data можно хранить/показывать как non-actionable telemetry, но не сравнивать между собой;
3. health/UI/alerts должны явно показывать `Pinnacle reference unavailable`, а не «нет value» как нормальную отрицательную вилку;
4. не продлевать Pinnacle freshness через `LastUpdated`, heartbeat или arrival time;
5. не использовать API fallback.

Добавить Analyzer regression tests:

- свежий Pinnacle + donor → pair/value разрешены при остальных gates;
- два donors без Pinnacle → zero actionable pairs;
- stale Pinnacle + два свежих donors → zero actionable pairs;
- parser/source down → zero actionable pairs и явный reference-unavailable health state;
- восстановление свежего Pinnacle возвращает обычный pairing без ручного cache resurrection.

## 4. Исправление delta ingestion

### 4.1. Validate envelope/entry before grouping

Не молча пропускать malformed rows.

Для каждого sport entry:

1. доказать shape entry;
2. провалидировать каждую row до группировки;
3. если row невозможно безопасно связать с PID из-за malformed shape/type — отвергнуть весь entry/frame без mutation;
4. если все rows имеют PID, допускается transaction per PID, но любая invalid row данного PID отменяет все rows этого PID;
5. counters должны различать malformed entry, malformed row, unknown line и ambiguity.

Обязательный test: valid row + short row `[0,1]` → `emitted=[]`, original cache deep-equal baseline.

### 4.2. Price validation и closure

- Разрешить только finite decimal odds из фактически observed browser encoding.
- Bool, garbage string, NaN, +Inf, -Inf, отрицательные и недоказанные `<1` → fail-closed без cache mutation/timestamp update.
- Explicit zero/closure применять только если fixture доказывает точное сочетание fields/status для закрытия.
- Не трактовать parser exception как закрытие.

Tests:

- `"not-a-price"`, NaN, ±Inf → no emit, cache unchanged;
- explicit proven closure → value 0, только target leaf/market timestamp меняется;
- malformed row рядом с closure отменяет transaction.

### 4.3. Реальный MultiSport lifecycle

Очистить sport cache:

- перед созданием/подпиской новой page generation;
- при обычном закрытии каждой batch page;
- при reconnect/recovery;
- при reassignment/batch rotation;
- в worker finally.

До получения нового authoritative full snapshot delta этого sport/session не принимаются.

Добавить настоящий async test с fake page/loop:

1. seed старой generation;
2. закрыть batch page штатным production path;
3. открыть новую generation;
4. подать delta до full snapshot — rejected/cache empty;
5. подать full snapshot, затем delta — accepted.

Прямой ручной вызов `clear_event_cache()` не считается lifecycle integration test.

### 4.4. Authoritative snapshot

- Очищать весь sport cache только для доказанно authoritative full frame.
- `refreshAll=true` и фактическая семантика `odds.l` должны быть подтверждены fixtures.
- Если `odds.l` может приходить partial без `refreshAll`, условие `refreshAll is True OR bool(l)` опасно — использовать доказанный predicate.
- `odds.n` не удаляет unrelated PID.

### 4.5. Исправить schema

Составить таблицу `0..12` по нескольким обезличенным реальным browser frames:

```text
index | observed examples | semantic meaning | proof | accepted types | fail-closed rule
```

Не переименовывать row[0] в pid вопреки production code. Unknown поля оставить unknown.

## 5. Восстановить совместимость test contract

Разобрать удаление/переименование `_remote_frame_family`:

- если helper является поддерживаемым внутренним контрактом — восстановить совместимо;
- если архитектура законно заменила его — обновить caller и tests только после доказательства эквивалентного browser-only routing;
- не ослаблять no-API routing и не удалять тест ради зелёного результата.

Обязательная команда должна пройти полностью:

```bash
cd /srv/ps38-aggregator/current
PYTHONDONTWRITEBYTECODE=1 \
PYTHONPATH=.venv/lib/python3.13/site-packages:/tmp/ps38-testdeps \
.venv/bin/python3 -m pytest -q -p no:cacheprovider \
  tests/test_fleet_runtime.py \
  tests/test_browser_only_authoritative.py \
  tests/test_parser_merge_period.py \
  tests/test_remote_fleet_node.py
```

Плюс adapter 20 tests и оба guards.

## 6. Новый измеримый canary — без фильтрации провалов

После minimal deploy/restart выполнить не менее 20 непрерывных минут.

Raw artifact обязателен:

```text
incoming/TZ01_CORRECTION_02_CANARY_RAW.jsonl
incoming/TZ01_CORRECTION_02_CANARY_SUMMARY.json
incoming/TZ01_CORRECTION_02_CANARY_SCRIPT.py
```

Каждая raw sample содержит UTC, observed Pid/market, browser confirmation timestamp, calculated age, adapter last_live_forward, Pinnacle live count, stale flag. Без teams/account secrets достаточно IDs.

Нельзя:

- исключать плохие интервалы label-ом `active play`;
- считать несколько events одного burst независимыми доказательствами wall-clock availability;
- вставлять пустой `{}` вместо raw summary.

Acceptance:

- duration >=1200s;
- >=100 real live market updates;
- p50 age <=3s;
- p95 age <=5s;
- max wall-clock gap движения подтверждённого live market/`last_live_forward_at` <=7s в source-healthy окнах;
- при `source_fresh=true` и наличии live events в central feed Pinnacle присутствует в Analyzer live >=95% one-second samples;
- stale native=0, platform_degraded delta=0;
- NRestarts=0, reconnect storm=0, send errors/drops не растут;
- CPU/RSS/event-loop/queue numbers берутся из приложенного raw telemetry, а не вручную написанной таблицы;
- prematch/non-Soccer не регрессируют;
- после canary units остаются healthy минимум 10 минут.

Если provider browser frames сами не подтверждают цены достаточно часто, вернуть честный `BLOCKED: source cadence`, не освежать время искусственно.

Отдельно считать и не смешивать:

- `parser_source_availability`: доля wall-clock, когда browser source действительно fresh;
- `pipeline_availability_given_source_healthy`: доступность Pinnacle в Analyzer только при healthy source;
- `reference_unavailable_fail_closed`: число source-unhealthy samples, в которых actionable pairs обязано быть 0.

Source-down интервалы не ухудшают условную transport latency, но и не считаются успешными samples. Для COMPLETE всё равно нужен непрерывный source-healthy live window с >=100 реальными updates. Если такого окна нет — `BLOCKED`, не выдумывать результат.

## 7. Новый value audit

Запускать только после успешного canary и текущего deploy.

Artifacts:

```text
incoming/TZ01_CORRECTION_02_VALUE_RAW.jsonl
incoming/TZ01_CORRECTION_02_VALUE_SUMMARY.json
incoming/TZ01_CORRECTION_02_VALUE_SCRIPT.py
```

Audit start UTC должен быть позже deploy/restart и canary. Нельзя повторно использовать старые duration/pairs JSON.

Требования прежние:

- минимум 20 минут `/pairs?min_roi=-100` live+prematch;
- доказать invariant: каждая pair имеет ровно одну сторону Pinnacle; donor-to-donor pair count = 0;
- в каждом source-unhealthy interval actionable pair/value count = 0;
- все ROI >0 перечислить и проверить;
- ROI >10% — полное ручное доказательство;
- America DNB +197 и Baseball cross-period +156 отсутствуют;
- raw-null=0, missing raw.period=0, cross-period fingerprint=0, margin>1.20=0.

## 8. Evidence discipline

- `validation-state.json: passed` не является доказательством само по себе.
- Evidence не должен просто цитировать handoff.
- Все raw artifacts и sanitized patch положить рядом с handoff в `incoming/`.
- У каждого файла указать SHA-256.
- Handoff numbers должны совпадать с summary и raw artifacts.
- Не писать `PASS`, если raw metric нарушает threshold.

## 9. Формат новой сдачи

```text
/srv/big_value/executor_exchange/incoming/EXECUTOR_HANDOFF_TZ01_CORRECTION_02.md
```

Обязательно приложить:

- полный sanitized diff;
- corrected schema 0..12;
- exact full test output;
- canary script/raw/summary;
- value script/raw/summary;
- hashes, backups, rollback;
- current systemd/desired-state/health;
- no-API outputs;
- honest open blockers.

## 10. Условие COMPLETE

`COMPLETE` разрешён только если:

1. полный mandatory test suite проходит;
2. два воспроизведённых cache bugs исправлены;
3. реальный lifecycle test проходит;
4. canary raw data проходит p50/p95/gap/availability;
5. новый value audit выполнен после deploy;
6. pipeline остаётся active;
7. оба no-API guards проходят.

В противном случае вернуть `PARTIAL`/`BLOCKED` и оставить действующий тракт в наиболее безопасном рабочем состоянии.
