# Интеграция расчёта Robin-маржи через собственный парсер Pinnacle

Документ описывает, как подключить будущий парсер Пиннакла (быстрый, локальный, без походов в публичный API) для расчёта маржи и подстановки `robin_odds` по правилам из `MARGIN_RULES.md`.

## Контекст

Сейчас (до парсера) у нас есть два внешних источника цен Пиннакла:

1. **Arcadia** (`backend/pinnacle_arcadia.py`) — гостевой публичный REST-API. По `matchup_id` отдаёт сразу все markets/prices. Кеш 25 секунд. Покрывает: `moneyline`, `total`, `team_total`, `spread` на period 0/1.
2. **BIA-only gateway на :8770** (`BIA_GATEWAY_BASE`) — `/verify` создаёт/обновляет выбранную BIA Single-корзину и возвращает исполнимую `pin88`-цену. Это execution proof, а не массовый источник Robin-маржи.

Дёргать их синхронно на каждом форке Forted нельзя — фид тикает раз в 0.25–3 сек, форков сотни.

После того как появится свой парсер, эта проблема снимается: парсер уже держит у себя локально все цены по матчу и отдаёт их «бесплатно».

## Что должен уметь парсер (контракт)

Минимально для нашей задачи:

```python
def get_all_prices(
    sport: str,
    home: str,
    away: str,
    *,
    matchup_id: int | None = None,
    period: int = 0,
    is_live: bool = True,
) -> dict[str, dict]:
    """
    Возвращает все доступные цены Пиннакла по матчу.

    Структура:
    {
        "moneyline": {"home": 1.85, "draw": 3.40, "away": 4.10},
        "total":     {"<line>": {"over": ..., "under": ...}, ...},
        "team_total":{"home": {"<line>": {"over":..., "under":...}}, "away": {...}},
        "spread":    {"<line>": {"home": ..., "away": ...}, ...},
        "double_chance": {"1X": ..., "X2": ..., "12": ...},
        "btts":      {"yes": ..., "no": ...},
        "odd_even":  {"odd": ..., "even": ...},
        "draw_no_bet": {"home": ..., "away": ...},
        "to_qualify": {"home": ..., "away": ...},
        "correct_score": {"0:0": ..., "1:0": ..., ...},
        "ht_ft": {...},
        "sets_total": {...}, "sets_handicap": {...},
        "corners_total": {...}, "corners_handicap": {...},
        "bookings_total": {...}, "bookings_handicap": {...},
        ...
    }

    Парсер обязан:
      - возвращать данные за <50ms (in-memory),
      - не дёргать сеть,
      - возвращать None / пустой dict если матч не найден.
    """
```

Важно: парсер должен класть цены в **decimal** формате (десятичные коэффициенты ≥ 1.01), а не american.

## Где живёт точка интеграции

Создать новый модуль:

- `backend/robin_margin.py` — содержит:
  - `compute_robin_odds(pin_odds, m_pin)` — формула с floor;
  - `fallback_by_odds(pin_odds)` — таблица из `MARGIN_RULES.md`;
  - `classify_outcome(parsed)` → `'A' | 'B' | 'C' | 'D'`;
  - `compute_robin_odds_for_arb(arb)` — главная функция, которая:
      1. Парсит `raw_selection`,
      2. Классифицирует группу,
      3. Дёргает источник цен (см. ниже про абстракцию),
      4. Считает маржу,
      5. Возвращает `robin_odds` (или fallback).

В `server.py` заменить три места на вызов `compute_robin_odds_for_arb(...)` (строки ~1789, ~2073, ~2530).

## Абстракция источника цен

Чтобы потом легко переключить с Arcadia/betslip на парсер, ввести интерфейс:

```python
class PinnaclePriceSource(Protocol):
    def get_market_prices(
        self,
        sport: str,
        home: str,
        away: str,
        market_type: str,            # 'moneyline' | 'total' | 'spread' | 'btts' | ...
        *,
        line: float | None = None,
        team: str | None = None,     # 'home' | 'away' | None
        period: int = 0,
        matchup_id: int | None = None,
    ) -> dict[str, float] | None:
        """Возвращает все цены этого рынка, например {'over': 1.91, 'under': 1.95}."""
```

Реализации:

1. `ArcadiaPriceSource` — обёртка вокруг `pinnacle_arcadia._default_cache`. Поддерживает A/B-группы (moneyline, total, team_total, spread).
2. `BetslipPriceSource` — историческая идея массового чтения `POST {BIA_GATEWAY_BASE}/verify`. В production так не используется: gateway создаёт BIA Single только для выбранного Calculator intent.
3. `LocalParserPriceSource` — обёртка вокруг будущего парсера. Когда появится, должна заменить и Arcadia, и Betslip.

В `compute_robin_odds_for_arb` источник выбирается через `os.getenv("ROBIN_MARGIN_SOURCE", "arcadia")`:

- `arcadia` — текущий дефолт, только A/B-группы; D-группа уходит в fallback (Group C);
- `betslip` — добавляет D-группу через `/verify`;
- `parser` — всё через локальный парсер (целевая конфигурация).

## План внедрения парсера (когда он появится)

1. **Дописать `LocalParserPriceSource`**:
   - в конструкторе сохранить ссылку на клиент парсера;
   - реализовать `get_market_prices(...)` через `parser.get_all_prices(...)`;
   - вернуть `dict[str, float]` под ту же сигнатуру, что у Arcadia.
2. **Включить через env**:
   ```
   ROBIN_MARGIN_SOURCE=parser
   ```
3. **Снять ограничение «только топ-N в фоне»** — теперь маржу можно считать **синхронно на каждом форке** прямо в `_fork_to_arb` / `_feed_fork_to_arb`, потому что парсер отдаёт цены без сети.
4. **Удалить fallback Betslip-источника** для D-группы (если парсер покрывает все рынки), либо оставить как страховку при `parser == None`.
5. **Поправить тесты**:
   - в `backend/test_app_api.py` есть моки для `bk1_odds`/`robin_odds` — проверить, что новые формулы не ломают ожидаемые значения;
   - добавить юнит-тесты на `compute_robin_odds()` и `fallback_by_odds()` — это чистые функции.

## Чек-лист подключения парсера

- [ ] Парсер экспортирует `get_all_prices(sport, home, away, matchup_id=None, period=0, is_live=True)`.
- [ ] Цены — desimal float ≥ 1.01.
- [ ] Покрытие рынков ≥ список в `MARGIN_RULES.md` (группы A, B, D).
- [ ] Latency `get_all_prices()` < 50ms.
- [ ] Реализован `LocalParserPriceSource(PinnaclePriceSource)` в `backend/robin_margin.py`.
- [ ] Переключение через `ROBIN_MARGIN_SOURCE=parser` в `.env` работает без изменений в `server.py`.
- [ ] Fallback на Group C при отсутствии данных — сохранён.
- [ ] Floor `ROBIN_MIN_BUMP` (0.01) — соблюдается всегда.
- [ ] Юнит-тесты на `compute_robin_odds`, `fallback_by_odds`, `classify_outcome` — зелёные.
- [ ] E2E проверка: на лайв-фиде Robin-маржа в среднем ≈ `ROBIN_TARGET_MARGIN` (3%) для групп A/B/D, и ниже — для C.

## Что не трогать при внедрении

- **Логика identification betslip** (`pinnacle_selection_id`, `pinnacle_odds_id`, `pinnacle_line_id`) — она используется в `/api/verify` для размещения, к расчёту маржи отношения не имеет.
- **Sticky-OK кэш** в `/api/verify` — он работает с `last_verified_pinnacle_odds`, не с `robin_odds`.
- **Forted relay / feed listener** — расчёт маржи не должен блокировать приём фрейма; вызов парсера — синхронный, но дешёвый.

## Минимальный diff в `server.py` (после готовности парсера)

```python
# было:
robin_odds = pin_odds + 0.04

# стало:
from robin_margin import compute_robin_odds_for_arb
robin_odds = compute_robin_odds_for_arb({
    "sport": sport,
    "home": home, "away": away,
    "pin_odds": pin_odds,
    "raw_selection": raw_pin_segment,
    "matchup_id": pin_market_metadata.get("matchup_id"),
    "period": int(pin_market_metadata.get("period_number") or 0),
    "is_live": is_live_flag,
})
```

`compute_robin_odds_for_arb` сама выбирает источник, считает маржу, применяет floor и fallback. Пересчёт `robin_profit_pct` оставляется как есть — формула не меняется, меняется только `robin_odds`.
