# Корректирующее ТЗ №1.3 — честный provenance, deployment Analyzer и source-aware canary

Дата независимого ревью: 2026-08-12 14:14 UTC  
Вердикт по Correction 02: **НЕ ПРИНЯТО**.

## 1. Что из Correction 02 принято и должно быть сохранено

Следующие исправления независимо воспроизведены:

- полный обязательный parser suite проходит: `124 passed in 19.35s`;
- `valid row + short malformed row` теперь fail-closed, cache unchanged;
- garbage/NaN/±Inf/negative odds fail-closed, cache unchanged;
- corrected `odds.u` index table соответствует production code;
- оба no-Pinnacle-API guard проходят;
- delta transaction, strict `line_id/is_alt` и snapshot barrier в коде присутствуют.

Не откатывать эти изменения.

## 2. Почему mission всё ещё не COMPLETE

### 2.1. Raw canary сам зафиксировал FAIL

Фактический `TZ01_CORRECTION_02_CANARY_SUMMARY.json`:

```text
p50 price age                 2.7845s  PASS
p95 price age                12.8874s  FAIL (>5s)
active subset p95            12.8181s  FAIL (>5s)
max update gap               33.3038s  FAIL (>7s)
pipeline availability given source healthy 70.96% FAIL (<95%)
CPU                          82.3%
reported memory              3442.85MB
```

Сам JSON содержит:

```json
"p95_age_le_5s": false,
"max_gap_le_7s": false
```

Mission summary заявил p95 `4.821s`, которого нет в приложенном raw/summary.

Canary script создаёт `active_gaps = gaps <= 7` и затем сообщает max active gap <=7. Это круговая фильтрация критерия. Нельзя удалять провальные gaps, чтобы доказать отсутствие провальных gaps.

### 2.2. Неверная source-health модель canary

Script считает source healthy как:

```python
source_healthy = adapter_health.upstream_connected
```

Соединение adapter с broadcaster не доказывает свежесть browser source. Broadcaster может быть подключён и раздавать старый cache/heartbeat.

Также pipeline availability измеряется наличием `/pairs`, хотя отсутствие pair может быть вызвано DB mapping/отсутствием donor. Для transport availability нужно проверять Pinnacle в Analyzer `/match-data`, а actionable `/pairs` проверять отдельно.

### 2.3. Parser сейчас объективно выключен

На момент ревью:

```text
desired-state=stopped
ps38-aggregator.service inactive/dead disabled
pin888-role-fleet.service inactive/dead disabled
serverforvovka-aggregator-feed-tunnel.service inactive/dead disabled
9014/19100 not listening
```

Adapter-процесс формально active, но:

```text
upstream_connected=false
initialized=false
status=starting
last_live_forward_at=2026-08-12T05:07:58Z
```

Владелец явно предупредил: browser parser иногда объективно выключен. Поэтому:

- **не включать parser автоматически**, если desired-state установлен `stopped` внешним controller/владельцем;
- source-down является допустимым operational состоянием только при fail-closed value;
- в source-down нельзя объявлять live canary успешным;
- для canary дождаться явно разрешённого source-running окна либо вернуть `BLOCKED: parser intentionally unavailable`.

### 2.4. Pinnacle-only Analyzer source не deployed

Go source содержит новые:

- exactly-one-Pinnacle gates;
- `pinnacle_reference_available` health;
- telemetry gauges.

Но running containers `analyzer` и `analyzer_prematch` запущены `2026-08-10T03:11:07Z`, до этих изменений. Текущий `/health` содержит только Postgres и **не содержит** заявленных полей Pinnacle reference.

Значит source tests проходят, но production binary/image не обновлён.

### 2.5. Fabricated raw provenance

Текущий helper:

```python
if "value" in node:
    raw = node.setdefault("raw", {})
    raw["period"] = p_idx
```

создаёт `raw={"period": ...}` у leaf, который раньше не имел provenance. Adapter сейчас считает любой непустой raw достаточным. Это маскирует unprovenanced price и искусственно делает `raw_null_count=0`.

`period` можно дополнять только в уже существующем доказанном raw. Никогда нельзя создавать provenance из позиции leaf в output tree.

### 2.6. Value audit не может быть принят после failed canary

Value audit полезен и donor-to-donor count=0, однако критерий Correction 02 требовал сначала успешный canary. Кроме того positive Basketball outcomes имели age ~7–12s, а live acceptance/gating требует отдельной проверки честной freshness.

## 3. Абсолютные контракты

### 3.1. No Pinnacle API

- Никаких official/partner/guest/Arcadia/REST/GraphQL/provider API.
- Никаких API fallback, bet service, verify/place/balance.
- Только browser DOM/site-WebSocket на `secret`, internal aggregator, reverse SSH и Big Value.
- Не использовать LastUpdated/arrival/heartbeat/reconnect/now как price freshness.
- Не трогать Piwi/dev, другие consumers и dormant API units.
- Не выводить credentials/env/cookies/tokens.
- Не делать git reset/clean/restore/commit/push.

### 3.2. Pinnacle — единственный reference

- Actionable pair/value только `ровно одна сторона Pinnacle + ровно один donor`.
- Donor-to-donor и Pinnacle-to-Pinnacle запрещены.
- При source off/missing/stale actionable pairs = 0.
- Donor telemetry можно хранить, но donors нельзя сравнивать друг с другом.
- Другую БК нельзя назначать временным reference.

Оба guards запускать до/после каждого этапа.

## 4. Исправить provenance без фабрикации

### 4.1. Parser worker

Изменить `_ensure_raw_period_in_node`:

- не использовать `setdefault("raw", {})`;
- если raw отсутствует/не dict/пустой — ничего не создавать;
- добавлять `period=p_idx` только если raw уже содержит доказанный минимум provenance;
- minimum для base leaf: finite/valid `event_id`, `bet_type`, `team_select`, `line_id`; `handicap` по семантике рынка;
- delta может добавить `period` только после точного leaf match к уже provenanced cached leaf.

Лучший вариант — исправлять raw.period в parser construction в момент разбора исходной browser line, где period известен, а не постобходом output tree.

### 4.2. Big Value adapter defense-in-depth

Усилить `has_unprovenanced_price`:

- непустой dict недостаточен;
- для каждого positive Pinnacle leaf требовать корректные `event_id`, `bet_type`, `team_select`, `line_id`, `period`;
- required types, finite values, period соответствует containing period;
- `raw={"period":0}` → reject;
- unprovenanced closed/zero leaf не должен становиться positive.

Tests:

1. positive leaf без raw остаётся без raw и adapter rejects;
2. `raw={"period":0}` rejects;
3. missing event_id/bet_type/team_select/line_id each rejects;
4. raw.period != containing period rejects;
5. real full-frame leaf passes;
6. real delta-updated leaf passes;
7. cross-period injection remains rejected.

## 5. Собрать и deploy Pinnacle-only Analyzer

Сначала полный Go test scope:

```bash
cd /srv/big_value/backend/analyzer
go test ./...
go vet ./...
```

Добавить/сохранить tests:

- fresh Pinnacle + donor → allowed;
- donor + donor → rejected at worker/cache/public gates;
- Pinnacle + Pinnacle → rejected;
- stale/missing Pinnacle + fresh donors → zero public/actionable;
- source unavailable health explicit;
- source recovery returns pairs only from newly fresh Pinnacle data, не resurrect old cache.

После tests:

1. build/recreate только `analyzer` и `analyzer_prematch` по существующему deployment path;
2. записать old/new image IDs и binary build timestamp;
3. не менять parser desired-state;
4. проверить оба modes.

Обязательная runtime проверка **прямо в текущем source-down состоянии**:

- `/pairs?min_roi=-100` live=0 и prematch=0;
- `/health` содержит `pinnacle_reference_available=false`;
- component message `Pinnacle reference unavailable`;
- donor match-data может присутствовать, но actionable pair/value=0;
- donor-to-donor=0.

Когда source снова разрешён и fresh:

- health переключается на available;
- каждая public pair имеет exactly one Pinnacle;
- старый Pinnacle cache не воскресает без нового confirmation.

## 6. Source-aware canary v3

Запускать только в явно разрешённом source-running окне. Не менять `stopped` самостоятельно.

### 6.1. Source healthy

Каждый one-second observation должен одновременно доказать:

- secret `19100/health source_fresh=true` и `any_source_fresh=true`;
- relevant live sport имеет live events и honest live source age в пределах configured source threshold;
- central browser event имеет valid PriceConfirmedAt/_market_ts;
- adapter upstream/downstream connected.

`upstream_connected` один не равен source healthy.

### 6.2. Pipeline availability

При source healthy проверять `/match-data` Analyzer live:

- существует хотя бы один fresh `Source=Pinnacle` event;
- availability = healthy observations with fresh Pinnacle match-data / all source-healthy observations.

Не использовать `/pairs` для transport availability. `/pairs` зависит от donor/mapping.

Отдельно:

- source-down observation → health unavailable + pairs 0;
- donor-to-donor pairs всегда 0.

### 6.3. Latency/gaps

- p50/p95 считать по всем valid source-healthy live confirmations;
- wall-clock gap считать по движению unique `(pid, period, market, market_ts)` confirmations или `last_live_forward_at`;
- **не удалять gaps >7s**;
- не создавать `active subset` предикатом `gap<=7`;
- bursts нескольких events не подменяют wall-clock continuity;
- если browser source сам не подтверждает конкретные markets достаточно часто — `BLOCKED: source cadence`, не подделывать timestamp.

Acceptance:

- continuous source-healthy window >=1200s;
- >=100 unique confirmed market updates;
- p50<=3s;
- p95<=5s;
- max wall-clock gap<=7s;
- pipeline availability given source healthy>=95%;
- stale native=0, degraded delta=0, drops/errors/reconnect storm=0;
- non-Soccer/prematch не регрессируют.

### 6.4. Process telemetry

Измерять process/cgroup, а не host totals:

- aggregator MainPID + children CPU/RSS;
- fleet MainPID + browser children CPU/RSS;
- adapter MainPID CPU/RSS;
- event-loop/queue latency из реального instrumented source.

`psutil.virtual_memory().used` нельзя подписывать как RSS aggregator.

## 7. Новый value audit

Только после passing canary:

- минимум 20 минут live+prematch;
- donor-to-donor=0, Pinnacle-to-Pinnacle=0;
- каждая pair exactly-one-Pinnacle;
- source-down intervals actionable pairs=0;
- каждый ROI>0 разобрать по sport/event/orientation/score/period/market/line/raw/age/margin/mapping;
- ROI>10% полное ручное доказательство;
- known America +197 и Baseball +156 отсутствуют;
- никакого fabricated provenance;
- raw required fields complete, raw.period соответствует period;
- margin>1.20=0.

## 8. Честная работа с intentional parser-off

Parser иногда выключен объективно — это допустимо.

- Не считать intentional source-off аварией Big Value.
- Не пытаться автоматически включать его без authority.
- Big Value должен явно показывать unavailable и fail-closed.
- Mission может быть `PARTIAL/BLOCKED`, пока нет разрешённого 20-min source window.
- Нельзя объявлять `COMPLETE` на старых canary данных.

## 9. Артефакты Correction 03

Ответ:

```text
/srv/big_value/executor_exchange/incoming/EXECUTOR_HANDOFF_TZ01_CORRECTION_03.md
```

Приложить:

- sanitized patch;
- full parser + adapter + Go tests;
- Analyzer image IDs before/after;
- source-down runtime health/pairs proof;
- canary v3 script/raw/summary (если было разрешённое окно);
- value v3 script/raw/summary только после passing canary;
- process-specific telemetry;
- guards, hashes, backups/rollback;
- current desired-state и honest blockers.

## 10. COMPLETE criteria

`COMPLETE` только если:

1. provenance не фабрикуется;
2. adapter проверяет required raw fields;
3. Pinnacle-only Analyzer код реально deployed;
4. source-down fail-closed виден в runtime health;
5. source-aware canary проходит **все** p50/p95/gap/availability thresholds без фильтрации;
6. новый value audit выполнен после passing canary;
7. оба no-API guards проходят.

Если parser остаётся intentional `stopped`, корректный результат — `PARTIAL / BLOCKED: waiting for authorized source-running window`, а не `COMPLETE`.
