# Pinnacle parser-only: контракт подключения `secret` к Big Value

Этот документ задаёт единственный разрешённый способ вернуть источник Pinnacle в Big Value. Он дополняет обязательную политику из `AGENTS.md`.

## Непереговорное правило

- Запрещены официальный, partner, guest, Arcadia, REST и любые другие provider API Pinnacle/PS3838/Pin888.
- Запрещены API keys, API login/password, API fallback, bet service и маршруты `verify`, `place`, `balance`.
- Парсер работает только на SSH-хосте `secret` через настоящую browser-сессию: DOM и сетевые/site-WebSocket события, которые загружает сама страница.
- Логин, cookies, browser profile, локальное состояние и диагностические снимки остаются только на `secret`.
- При потере browser-feed система работает fail-closed: данные перестают обновляться и протухают. Переход на API запрещён.

Перед любым deployment обязательно выполнить на `serverforvovka`:

```bash
bash /srv/big_value/scripts/check_no_pinnacle_api.sh
```

## Разрешённая архитектура

```text
dev: Piwi browser parser
  -> secret: central aggregator
secret: browser/DOM/site-WS Pin parser
  -> secret: central aggregator
  -> reverse SSH
  -> serverforvovka:127.0.0.1:19014 (aggregated feed)
  -> neutral adapter (если envelope требует распаковки)
  -> Analyzer live 127.0.0.1:7200
  -> Analyzer prematch 127.0.0.1:7201
```

На `serverforvovka` разрешены только reverse-SSH transport общего feed на `127.0.0.1:19014`, нейтральная нормализация и внутренний WS ingress Analyzer. Внутренний ingress token Analyzer не является API букмекера. Никакой локальный Pin/Pinnacle/Piwi browser runtime или аккаунт Pinnacle на этом сервере не допускается. Piwi размещён на `dev` в `/srv/piwi247`; Pin и агрегатор размещены на `secret`.

## Контракт WS Analyzer

- Live: `ws://127.0.0.1:7200/`.
- Prematch: `ws://127.0.0.1:7201/`.
- Авторизация: заголовок `X-API-Key: <INTERNAL_INGRESS_TOKEN>`; это внутренний token Big Value.
- Одно WS-сообщение содержит ровно один полный объект `GameData`, без envelope.
- Максимальный размер сообщения: 5 MiB.
- Лимит приёма: 5000 сообщений/сек, burst 10000.
- Клиент обязан отвечать `pong` на ping и переподключаться с ограниченным backoff.
- Analyzer заменяет матч целиком по ключу `Source + SportName + Pid`. Частичные delta нельзя отправлять напрямую.

Если parser на `secret` выдаёт `init/state/update/status`, нейтральный adapter обязан:

1. собрать полный snapshot каждого события;
2. разделить live и prematch по `isLive`;
3. отправить каждый `GameData` отдельным сообщением;
4. при `stale` прекратить освежать `CreatedAt` и `_market_ts`, а закрытые рынки удалить из следующего полного snapshot.

## Обязательные данные

Минимальный пример предназначен только для изолированного тестового Analyzer:

```json
{
  "Pid": 9000000000001,
  "LeagueName": "Synthetic League",
  "homeName": "Synthetic Home",
  "awayName": "Synthetic Away",
  "MatchId": "synthetic-live-001",
  "isLive": true,
  "HomeScore": 0,
  "AwayScore": 0,
  "HasScore": true,
  "Periods": [
    {
      "Win1x2": {
        "Win1": {"value": 2.1},
        "WinNone": {"value": 3.2},
        "Win2": {"value": 3.4}
      },
      "Games": {},
      "Totals": {
        "2.5": {
          "WinMore": {"value": 1.91},
          "WinLess": {"value": 1.91}
        }
      },
      "Handicap": {},
      "FirstTeamTotals": {},
      "SecondTeamTotals": {},
      "_market_ts": {
        "Win1x2": 0,
        "Totals": 0
      }
    }
  ],
  "Source": "Pinnacle",
  "SportName": "Soccer",
  "CreatedAt": "NOW_RFC3339_UTC",
  "trace_id": "synthetic-live-001"
}
```

Для реального теста нули в `_market_ts` заменяются текущим Unix timestamp.

Правила полей:

- `Source` — строго `Pinnacle`.
- `Pid` — положительный стабильный `int64`; для JavaScript безопаснее значение не выше `2^53-1`.
- `MatchId` — непустой, стабильный и не переиспользуется для другого матча.
- `homeName` и `awayName` различаются; длина 2–100 символов.
- `LeagueName` имеет длину 2–200 символов.
- `CreatedAt` и prematch `matchDate` — RFC3339 UTC.
- Для prematch: `isLive=false`, `HasScore=false`, `matchDate` находится в будущем.
- Разрешённые `SportName`: `Soccer`, `Tennis`, `Basketball`, `Volleyball`, `Handball`, `Hockey`, `TableTennis`, `AmericanFootball`, `Baseball`, `Esports`.
- Decimal odds: `0` означает отсутствующий/закрытый исход; действующий коэффициент конечен и больше `1.0`.
- Линии нормализуются как `2.5`, `-1.5`, `0`: без запятых и лишних нулей.
- Закрытый рынок удаляется из следующего полного snapshot. Флаги `Removed`, `Deleted`, `Stale` не заменяют это правило.

## Периоды и свежесть

- `Periods[0]` — весь матч.
- `Periods[1]` — первый тайм/период/сет, `Periods[2]` — второй; далее следующие периоды.
- Для баскетбола `Periods[0]` включает overtime.
- `_market_ts` обязателен для каждой заполненной группы `Win1x2`, `Totals`, `Handicap`, `FirstTeamTotals`, `SecondTeamTotals` во всех периодах.
- `_market_ts` отражает последнее фактическое подтверждение рынка браузером, а не heartbeat.
- `CreatedAt` нельзя искусственно обновлять после потери browser-feed.
- Live: целевой snapshot каждые 1–2 секунды; cache TTL 7 секунд, betting freshness 5 секунд.
- Prematch: целевой snapshot каждые 30–60 секунд; cache TTL и betting freshness 90 секунд.

## Приёмочные проверки

Synthetic payload никогда не отправляется в production Analyzer: тестовая лига может попасть в PostgreSQL. Проверки данных выполняются на изолированном экземпляре.

1. На production входах `7200/7201` соединение без token и с ложным token получает `401`.
2. В изолированном Analyzer внутренний token разрешает WS upgrade.
3. Новый live snapshot появляется в диагностическом endpoint; повторный snapshot того же `Pid` заменяет коэффициент.
4. Рынок, удалённый из следующего полного snapshot, не сохраняется из старого состояния.
5. Старые `CreatedAt` и `_market_ts` приводят к протуханию данных, а не к ложной свежести.
6. Prematch с прошедшим `matchDate`, `Pid=0`, одинаковыми командами или пустым `Source` отклоняется.
7. Тестовый feed проходит полный маршрут `dev/secret -> central aggregator -> reverse SSH :19014 -> adapter -> isolated Analyzer`.
8. По firewall/packet capture между серверами наблюдается только SSH transport; исходящих соединений к provider API нет.
9. После подключения production feed отдельно проверяются live/prematch counts, возраст последнего snapshot, validation errors и dropped messages.
10. Только после этих проверок источник допускается к сопоставлению и расчёту вилок.

## Мониторинг и восстановление

Обычный `/health` Analyzer подтверждает процесс и PostgreSQL, но не свежесть источника. При подключении parser-only feed нужен отдельный watchdog для:

- состояния SSH tunnel и обоих WS-направлений;
- времени последнего live/prematch snapshot;
- максимального возраста `CreatedAt` и `_market_ts`;
- количества событий live/prematch;
- validation/dropped/reconnect counters.

Watchdog может только остановить публикацию, закрыть рынки или поднять тревогу. Он не имеет права переключаться на API.
