# Корректирующее ТЗ №1.1 — доведение browser-only Pinnacle feed до фактической приёмки

Дата ревью: 2026-08-11 21:57 UTC  
Основание: проверка `EXECUTOR_HANDOFF_TZ01.md` и текущего production после заявленного `COMPLETE / VERIFIED`.

## 1. Вердикт ревью

Предыдущая работа **не принята**. Продолжать с текущего production-состояния, не откатывать и не перетирать файлы вслепую.

Причины отказа:

1. На момент контрольной проверки рабочий тракт остановлен:
   - `secret:/var/lib/parify-platform/distributed-parser/desired-state = stopped`;
   - `pin888-role-fleet.service` — `inactive/dead`, `disabled`;
   - `serverforvovka-aggregator-feed-tunnel.service` — `inactive/dead` с `21:19:14 UTC`;
   - `bv-aggregated-feed-adapter.service` — `inactive/dead` с `21:19:13 UTC`;
   - `serverforvovka:127.0.0.1:19014` и `:19015` не слушают;
   - `secret:19100/health` сообщает `ok=false`, `source_fresh=false`, все sports stale;
   - `secret:9014/health` показывает `clients=0`.
2. Собственный canary handoff не прошёл обязательные пороги исходного ТЗ:
   - p50 `3.796 s` при требовании `<=3.0 s`;
   - p95 `10.283 s` при требовании `<=5.0 s`;
   - max gaps по 3-минутным окнам `10.085–22.068 s` при запрете устойчивого gap `>7 s`.
   Эти значения были ошибочно помечены `PASS`.
3. Handoff назвал diff полным, но не приложил diff основного `worker.py`.
4. Handoff заявил `Zero uncommitted repository changes`, хотя `/srv/big_value` содержит большой заранее существовавший dirty worktree. Его нельзя сбрасывать или очищать.
5. После зафиксированных в handoff post-hash произошёл недокументированный drift:
   - handoff `worker.py`: `d305456a...`, current: `402cb0a3...`;
   - handoff `main.py`: `eabbf820...`, current: `0b23a62b...`.
   Текущий drift уменьшает sleeps в worker и заменяет заявленный 50% duty-cycle в `main.py` на `await asyncio.sleep(0)`. Это должно быть явно разобрано и протестировано.
6. В `apply_odds_u_delta()` обнаружены два непокрытых correctness-дефекта:
   - строки одного PID применяются к живому cache по очереди; если поздняя строка invalid/ambiguous, функция возвращает без публикации, но ранние изменения уже остаются в cache — нет транзакционной атомарности;
   - `clear_event_cache()` существует, но production lifecycle его не вызывает при reconnect/page reopen/session generation. Имеющийся тест лишь вручную вызывает метод и не доказывает реальное поведение.
7. Дополнительные fail-closed gaps:
   - при положительном delta `line_id` leaf с отсутствующим/нулевым `line_id` сейчас может пройти вместо строгого exact match;
   - `is_alt` сравнивается нестрого: nonzero delta может совпасть с leaf, где `is_alt=0`;
   - full snapshot не доказывает атомарную замену sport cache и удаление исчезнувших PID.

Положительное, которое нужно сохранить:

- оба no-Pinnacle-API guard проходят;
- 110 заявленных Python tests воспроизводимо проходят (`110 passed in 19.18s`), но набор неполон;
- `serverforvovka` SSH config действительно валиден: `sshd -t` проходит, effective `PerSourcePenaltyExemptList=80.78.27.118`;
- browser-only authority tests и основной intent выглядят совместимыми;
- предыдущий value-аудит не выявил giant ROI, но он не заменяет новый аудит после устойчивого восстановления.

## 2. Абсолютные запреты

Они остаются без изменений и имеют приоритет над всем остальным.

- Никаких Pinnacle/PS3838/Pin888 official, partner, guest, Arcadia, REST, GraphQL или иных provider API.
- Никаких API fallback, bet-service, `verify/place/balance`, API key/token.
- Разрешены только настоящая browser page, её DOM/site-WebSocket на `secret`, внутренний aggregator, reverse SSH и Big Value adapter/Analyzer.
- Не использовать `LastUpdated`, arrival/receipt time, heartbeat, reconnect time или `now()` как подтверждение цены.
- Freshness только из валидного `frame["time"]` реально затронувшего рынок browser site-WS кадра.
- Не запускать Pin/Piwi/browser runtime на `serverforvovka`; Piwi на `dev` не трогать.
- Не размаскировать и не запускать dormant API units на `secret`.
- Не выводить secret env, cookies, пароли, токены или proxy credentials.
- Не делать `git reset`, `git clean`, `git restore`, commit/push и не менять чужой dirty worktree.
- Shared parser используется другими потребителями: не менять envelope, IDs, source identity и существующие поля несовместимым образом.
- Не писать synthetic события в production Analyzer.

До изменений, после каждого deployment-этапа и в финале:

```bash
/srv/pin888/bin/check-no-pinnacle-api
ssh serverforvovka /srv/big_value/scripts/check_no_pinnacle_api.sh
```

Обе команды обязаны завершаться с exit code 0. Guards не менять и не ослаблять.

## 3. Этап A — честный baseline и расследование остановки

До любых изменений:

1. Зафиксировать UTC, current SHA-256 всех файлов scope, owner/mode, unit states, desired-state, listeners, health, `NRestarts`.
2. Через privileged journal/audit/controller logs определить, кто и каким механизмом в `21:19:13–21:19:14 UTC` остановил tunnel и adapter и кто установил desired-state `stopped`.
3. Найти все controller/timer/path/cron/unit зависимости, способные снова выставить `stopped` или остановить services.
4. Не называть обычный `systemctl stop` crash/restart failure.
5. Зафиксировать полный current diff относительно именно тех backup/baseline, которые реально соответствуют текущему коду. Старые hash из handoff не считать current manifest.
6. Отдельно описать недокументированные изменения после handoff в `worker.py` и `main.py`: зачем они появились, кем, какое влияние на CPU, queue latency и другие consumers.

SSH transport:

- сохранить loopback reverse tunnel `secret:9014 -> serverforvovka:127.0.0.1:19014`;
- `KexAlgorithms=curve25519-sha256` и точечный `PerSourcePenaltyExemptList 80.78.27.118` сейчас настроены; не расширять exemption;
- утверждение о MTU/PQ-KEX как root cause допустимо только при наличии before/after SSH debug или packet/MTU evidence. Иначе честно назвать это подтверждённым workaround, а root cause — не доказанным.

## 4. Этап B — исправить stateful `odds.u` корректно

Scope на shared parser минимальный:

```text
/srv/ps38-aggregator/current/aggregator/fleet/worker.py
/srv/ps38-aggregator/current/tests/test_fleet_runtime.py
/srv/ps38-aggregator/current/tests/fixtures/odds_u_anonymized_fixture.json
```

Не перетирать текущий файл старым staging. Сделать review/rebase на current SHA.

### 4.1. Транзакционность

Обработка всех delta-строк одного `(sport, pid, frame)` должна быть атомарной:

1. работать с deep copy или сначала полностью построить и провалидировать mutation plan;
2. если хотя бы одна строка malformed, unknown, ambiguous, regressed или unprovenanced — original cached event остаётся byte/deep-equal прежнему;
3. не публиковать частичный event;
4. только после полной успешной валидации commit cache + emit full normalized GameData.

Обязательный regression test: две строки для одного PID, первая валидна, вторая unknown/ambiguous. Результат пустой, cache полностью равен deep-copied baseline, timestamp тоже не изменён.

### 4.2. Строгая идентификация leaf

- При положительном `target_line_id` требовать точное равенство с provenanced leaf `line_id`; leaf `0/missing` не является совпадением.
- Если delta несёт определённый `is_alt`, требовать точное совместимое значение; `delta is_alt=1` не может совпасть с leaf `0/missing`.
- Строго проверять типы `period`, `bet_type`, `team_select`, `pid`, price и status; bool не принимать как int.
- Не создавать новую линию из delta.
- Unknown/ambiguous — fail-closed без mutation.

Добавить отдельные tests для zero/missing leaf line_id, alt mismatch, wrong sport/pid/period и non-finite price.

### 4.3. Реальный cache lifecycle

Подключить очистку cache к production paths, а не только тестировать метод вручную:

- новая browser/session generation;
- reconnect/WS replacement;
- page close/reopen/recovery;
- sport assignment сменился или sport page удалена;
- worker завершился/перезапускается.

Для authoritative `refreshAll` snapshot сделать атомарную замену cache соответствующего sport/session и удалить PID, которых больше нет в authoritative snapshot. Не считать любой `odds.n` полным snapshot без доказательства его семантики: partial/new-event frame не должен стирать sport cache.

Обязательные loop-level tests:

1. seed -> reconnect/recover -> delta до нового full snapshot отвергается;
2. authoritative full refresh с PID A/B, затем refresh только с B -> A удалён;
3. partial `n` добавляет/обновляет только доказанное и не удаляет остальные PID;
4. single и multi worker имеют одинаковый lifecycle contract.

### 4.4. Доказанная schema

Handoff должен содержать настоящую таблицу каждого используемого индекса `odds.u`:

```text
index | semantic field | observed type | доказательство | fail-closed rule
```

Недостаточно написать абстрактный tuple. Для неизвестных индексов написать `unknown/not used`, а не угадывать. Доказательства — несколько обезличенных реальных browser site-WS fixtures + существующий raw provenance/parser mapping. Никаких cookies/account data.

### 4.5. Timestamp/provenance

- `_market_ts` менять только для реально затронутого period/market.
- `PriceConfirmedAt` только из того же `frame["time"]`.
- Untouched market timestamps не двигать.
- Explicit close/zero должен убрать прежнюю положительную цену.
- Не использовать `LastUpdated`, frame arrival, `time.time()` или broadcaster heartbeat.
- Не обновлять event/cache timestamp при rejected delta.

## 5. Этап C — разобрать post-handoff latency drift

Current production содержит незаявленные tuning changes:

- worker sleep `0.5 -> 0.05/0.2`;
- aggregator normalization duty-cycle `await asyncio.sleep(max(...)) -> await asyncio.sleep(0)`, при этом комментарий по-прежнему обещает 50% rest duty cycle.

Требования:

1. Не считать это автоматически верным или неверным.
2. Исправить противоречие code/comment.
3. Сравнить безопасно минимум два режима на fixture/load replay, не обращаясь к provider API:
   - queue latency / live age p50/p95/max gap;
   - process CPU, RSS, event-loop lag;
   - poster dropped/errors;
   - prematch/non-Soccer throughput;
   - impact на других consumers shared aggregator.
4. Выбрать минимальный bounded вариант. Нельзя добиваться latency бесконтрольным busy-loop/starvation.
5. Если acceptance p95 невозможно выполнить без рискованной shared-архитектурной переделки — вернуть честный blocker, не ставить `PASS`.

## 6. Этап D — восстановить и закрепить runtime

После passing tests и backups:

1. Вернуть distributed parser desired-state в штатное `running` через существующий управляющий механизм, а не обходным файлом, и устранить найденную причину повторной остановки.
2. `pin888-role-fleet.service`: enabled + active/running.
3. `ps38-aggregator.service`: enabled + active/running, source fresh.
4. `serverforvovka-aggregator-feed-tunnel.service`: enabled + active/running.
5. `bv-aggregated-feed-adapter.service`: enabled + active/running.
6. Убедиться, что `19014/19015/7200/7201` слушают только в разрешённом scope; legacy ports не возвращаются.
7. Adapter обязан завершить replay + snapshot reconcile, оба Analyzer downstream connected.
8. `9014/health clients>=1`; prematch и live Pinnacle появляются в Analyzer только с честной freshness.
9. Сделать один контролируемый reconnect/restart именно релевантного unit и доказать автоматическое восстановление без ручной login петли и без stale-cache reuse.
10. Не трогать Piwi, другие Pin roles и unrelated services.

Не оставлять систему в `desired-state=stopped` или с inactive adapter/tunnel после отчёта.

## 7. Тесты до deployment

Минимум:

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

Также:

- syntax/compile без записи secrets;
- Big Value adapter unit tests;
- оба no-API guards;
- diff scan на provider API markers;
- новые тесты обязаны ловить перечисленные в §4 дефекты на старой реализации и проходить на новой.

В отчёте указать точный command/output. Не писать лишь «31 assertions» без test names/counts.

## 8. Production acceptance canary

Начинать только когда весь pipeline active и source fresh. Минимум 20 непрерывных минут и не менее 100 реальных live samples.

Метрики считаются по `PriceConfirmedAt` и затронутому `_market_ts`, а не по `LastUpdated`:

- p50 `<=3.0 s` — иначе FAIL;
- p95 `<=5.0 s` — иначе FAIL;
- ни одного устойчивого gap `>7 s` — иначе FAIL;
- stale native browser updates = 0 при валидной свежей цене;
- `NRestarts=0`, reconnect storm=0, HTTP 429=0;
- queue drops/send errors не растут;
- CPU/RSS/event-loop lag стабильны и приведены числами;
- prematch и non-Soccer coverage не регрессировали;
- touched `_market_ts` движется, untouched не освежается;
- после canary services остаются active ещё минимум 10 минут и проходят повторный health snapshot.

Запрещено помечать превышение порога как `PASS`, добавляя произвольное пояснение. Если live window отсутствует, результат `BLOCKED: no live sample`, не `COMPLETE`.

## 9. Value/ROI аудит после успешного canary

Только после §8 провести минимум 20 минут по live и prematch `/pairs?min_roi=-100`.

Для каждого ROI `>0`, отдельно для каждого `>10%` доказать:

- тот же sport/league/event и home/away;
- prematch start delta `<=30 min`;
- live score/period совпадают;
- market/line semantics совпадают;
- каждая положительная Pinnacle цена имеет `raw`, корректный `raw.period` и `_market_ts`;
- age в пределах live/prematch limit;
- native implied margin `<=1.20`;
- DB mapping не связывает разные events.

Обязательные zero-regressions:

- America de Cali DNB2 около `+197%` не возвращается;
- Baseball cross-period draw около `+156%` не возвращается;
- positive Pinnacle leaf без raw = 0;
- missing `raw.period` = 0;
- cross-period injection fingerprint = 0;
- published native margin `>1.20` = 0.

Предыдущий ROI audit можно использовать только как историческую ссылку, не как замену новому после исправлений/restart.

## 10. Новый handoff

Положить результат строго сюда:

```text
/srv/big_value/executor_exchange/incoming/EXECUTOR_HANDOFF_TZ01_CORRECTION_01.md
```

Не использовать `outgoing/` для ответа исполнителя.

Handoff обязан содержать:

1. errata к прошлому ложному `COMPLETE`;
2. baseline/current UTC и root cause остановки в 21:19;
3. полный список изменений, включая post-handoff drift;
4. SHA-256 before/after и owner/mode;
5. полный sanitized diff **включая worker.py**;
6. точную index schema `odds.u`;
7. команды и полный итог tests;
8. no-API guard outputs;
9. systemd desired-state, ActiveState, enablement, timestamps, NRestarts;
10. replay/reconcile и health evidence;
11. 20-минутный canary с честным PASS/FAIL для каждого порога;
12. CPU/RSS/event-loop/queue telemetry;
13. prematch/non-Soccer regression;
14. новый 20-минутный value audit;
15. backups и проверенный rollback;
16. открытые blockers/риски;
17. `git status --short` как есть, без ложного заявления о clean tree.

Приложить sanitized patch/diff/fixture рядом в `incoming/`.

## 11. Условие завершения

Писать `COMPLETE` разрешено только если одновременно:

- pipeline работает сейчас и остаётся работающим;
- все correctness/lifecycle tests проходят;
- оба no-API guards проходят;
- p50/p95/gap соответствуют строгим порогам;
- новый value audit чист;
- полный reproducible handoff находится в `incoming/`.

Иначе статус только `PARTIAL` или `BLOCKED` с точной причиной. Никакого «PASS» при численном нарушении порога.
