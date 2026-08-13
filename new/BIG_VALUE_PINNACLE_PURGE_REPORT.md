# Big Value: отчёт об удалении Pinnacle API-стека

Дата аудита и изменений: 2026-08-09  
Сервер: `serverforvovka`  
Проект: `/srv/big_value`

## Итог

В развернутом Big Value удалены исполняемые пути к внешнему Pinnacle/PS3838/Pin888 API, аккаунтному verifier и bet service. Calculator, Telegram-боты, autobetting, frontend и Nginx больше не предоставляют и не вызывают старые `verify/place/balance` gateway. Прямые provider domains и API credentials удалены из рабочего кода и env.

Сохранён downstream-контракт Big Value: Analyzer, matching, margin/ROI, freshness, исторические данные и отображение источника `Pinnacle`. Новый источник не требует возврата API-кода: Pin parser и центральный агрегатор работают на `secret`, Piwi работает на `dev`, а `serverforvovka` принимает только общий нормализованный feed через reverse SSH на `127.0.0.1:19014`.

Постоянные правила находятся в:

- `AGENTS.md`;
- `PINNACLE_SECRET_PARSER_CONTRACT.md`;
- `scripts/check_no_pinnacle_api.sh`.

Обязательная проверка:

```bash
bash /srv/big_value/scripts/check_no_pinnacle_api.sh
```

Финальный результат проверки рабочего дерева:

```text
OK: no forbidden Pinnacle API/runtime paths found
```

## Жёсткая архитектурная граница

- Запрещены официальный, partner, guest, Arcadia, REST и любые другие provider API Pinnacle/PS3838/Pin888.
- Запрещены API keys, API login/password, API fallback, account verifier и bet service.
- Pin parser и центральный агрегатор разрешены на `secret`.
- Browser profile, cookies и аккаунт Pinnacle остаются за границей `serverforvovka`.
- `serverforvovka` получает только агрегированный нормализованный feed и передаёт его во внутренний Analyzer.
- Внутренние WS-входы Analyzer и их ingress token не являются API букмекера.
- При потере feed система работает fail-closed; переключение на API запрещено.
- Piwi перенесён на `dev` в `/srv/piwi247`; Pin browser fleet и центральный агрегатор находятся только на `secret`.
- Восстанавливать Piwi/Pin runtime на `serverforvovka` запрещено.

## Удалённый код проекта

Удалены или выведены из кода:

- прямой REST/BasicAuth parser `backend/parsers/parse_serge/**`;
- старые central-Pinnacle forwarder и systemd units;
- parser-guide verifier, Playwright login, PS3838 mapper, screenshots/reports и hardcoded credentials;
- два прямых Arcadia/Pinnacle API блока из `raw_data_proxy.py`;
- Calculator gateway и маршруты проверки, размещения ставки и баланса;
- PS38 VerifyManager и session code из prematch Telegram bot;
- autobetting `pinnacle-verifier.js`, повторная верификация и связанная конфигурация;
- frontend polling/panel verifier и старые Pinnacle monitor pages;
- Runner aliases и команды, способные воскресить Serge/Pin888/PS3838 parser;
- legacy Compose, health, monitoring и operation-инструкции запуска старого стека;
- sandbox verifier config и выключенный, но восстанавливаемый verifier flag.

Буквальное доменное имя `Pinnacle` сохранено там, где это только модель уже полученной линии: Analyzer, matching, ROI, freshness, history и frontend rendering.

## Удалённый runtime на `serverforvovka`

Остановлены, отключены и физически удалены старые Pinnacle/PS38/Pin888 components:

- `bv-central-pinnacle-feed/live/prematch`;
- `parse_serge_watchdog`;
- `parser-duty-rotation`;
- `pin888-remote-fleet`;
- `ps38-remote-fleet` и tunnel;
- `pin888-bet-service`;
- control scripts, drop-ins, profiles и desired-state resurrection paths;
- `/opt/ps38-remote-fleet` и session state;
- Docker volume `big_value_ps3838_shared_data`;
- forced-command SSH key entry и parser-specific sudo restart grants;
- публичный PS38 control key пользователя `teamlead`;
- старые dangling Docker images Calculator/frontend/Analyzer/Telegram, содержавшие предыдущий код.

Сохранён отдельный transport SSH key `ubuntu -> secret`: это транспорт общего feed, не provider credential.

Атомарный cutover Piwi завершён. С `serverforvovka` удалены `/opt/piwi247`, отдельные браузеры, systemd unit/user, test/session artifacts и legacy central-Pinnacle backup. Дополнительный disk-level аудит обнаружил старые `/root/ps38-*` account/proxy backups и `/tmp` resurrection/test artifacts; они также удалены без сохранения копии.

Piwi размещён на `dev` в `/srv/piwi247`; Pin browser fleet и центральный агрегатор остаются на `secret`. Восстанавливать любой из этих browser runtimes на `serverforvovka` запрещено.

## Nginx и статические страницы

Из активных, disabled и backup Nginx configs удалены:

- внешние `verify/place/balance` routes;
- legacy Calculator verify route;
- raw live/prematch endpoints старого parser;
- catch-all `/api/pinnacle/`;
- старый Pinnacle WS и monitor routes.

`nginx -t` прошёл, конфигурация перезагружена. Старые static monitor copies заменены версиями, которые читают только нормализованные Analyzer данные; вызов удалённого `/api/pinnacle/stats` устранён. Health JSON перегенерирован из актуальной конфигурации, stale `parse_serge` UI удалён.

## Защита Analyzer и будущий feed

- Live ingress: `127.0.0.1:7200`.
- Prematch ingress: `127.0.0.1:7201`.
- Общий feed агрегатора: reverse SSH `127.0.0.1:19014`.
- Порты больше не опубликованы на `0.0.0.0`.
- Авторизация сохраняется через внутренний `X-API-Key`.
- Логирование prefix внутренних ingress tokens удалено.
- Одно WS-сообщение содержит один полный `GameData` без envelope.
- `Source` будущей эталонной линии должен быть строго `Pinnacle`.
- Частичные delta должен собрать в полный snapshot adapter/aggregator до Analyzer.
- `_market_ts` и `CreatedAt` нельзя искусственно освежать при потере browser-feed.

Полная схема, поля, freshness и изолированные smoke tests описаны в `PINNACLE_SECRET_PARSER_CONTRACT.md`.

## Пересборка и проверки

Пересобраны и пересозданы:

- Analyzer live и prematch;
- Calculator;
- `tg_prematch_bot`;
- `tg_manager`;
- frontend admin;
- Runner binary/service.

Успешные проверки:

- `go test ./...` для Analyzer, Calculator, Runner, prematch bot и Results;
- frontend production build;
- JSON, Python syntax, Node syntax, Bash syntax и Compose config;
- Nginx config test/reload;
- removed routes возвращают `404` напрямую и через Nginx;
- Analyzer ingress без/с неверным token возвращает `401`;
- Analyzer, prematch Analyzer и Calculator healthy;
- после restart сохранились donor records: live 225, prematch 904.

Пары и records Pinnacle сейчас равны нулю: reverse-SSH transport и aggregator bridge готовы, но Sports у provider отвечает `Service Temporarily Unavailable` на обоих проверенных IP. Система корректно остаётся fail-closed и не использует API fallback.

Autobet targeted tests: 6 suites прошли, 65 tests passed. Один существующий тест `BetProcessor.handle-result.test.js` не совпадает с уже расширенным diagnostic payload; verifier removal этот блок не изменял. Полный Jest run имеет известные open timers.

## Остаточные операционные замечания

- Health generator на момент отчёта показывает `tg_livebot: unavailable` и предупреждение о swap 57.3%; это не связано с Pinnacle API purge.
- Feed-specific watchdog нужно включить после фактического cutover: SSH tunnel, live/prematch counts, возраст `CreatedAt/_market_ts`, reconnect/validation/dropped counters.
- Piwi account login подтверждён, но fresh-login loop отключён. На `dev` используется безопасный capture/bootstrap timer с сохранённой сессией.
- На момент финальной проверки `serverforvovka` слушает только внутренние `7200/7201` и reverse-SSH feed `19014`; опасные legacy ports закрыты.

## Git durability

Рабочее дерево до начала задачи уже содержало значительный набор чужих незакоммиченных изменений. Поэтому purge намеренно не был смешан с ними в автоматический commit/push.

Критически важно: текущий `origin/main` всё ещё содержит исторический legacy stack, а `AGENTS.md`, parser contract и guard пока находятся в рабочем дереве. До reviewed scoped commit нельзя выполнять `git reset --hard`, `git clean` или чистый deploy из `origin/main`: это способно вернуть удалённый код. Исторические Git commits/stashes рассматриваются только как архив и не должны разворачиваться в production.

Для долговременной гарантии следующий обязательный шаг — reviewed commit/push текущего purge и policy files без захвата посторонних изменений.

## Критерии окончательного cutover

1. **Выполнено:** Piwi/Pin migration завершена; локальный runtime, account/session backups и temp artifacts удалены с `serverforvovka`.
2. `scripts/check_no_pinnacle_api.sh` проходит после merge/deploy.
3. Independent runtime audit не находит provider API processes, routes, units, listeners, containers, images, env keys и restart vectors.
4. **Transport готов:** общий feed доступен с `secret` через reverse SSH `127.0.0.1:19014`; direct provider connections с `serverforvovka` отсутствуют. Данные появятся после восстановления Sports у provider.
5. Live и prematch snapshots проходят schema/freshness validation в изолированном тесте, затем production monitoring.
6. Purge/policy commit находится в основной ветке, а production развернут именно из него.
