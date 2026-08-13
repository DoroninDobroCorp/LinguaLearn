# RobinArb MVP

> ⚠️ Суть проекта (обновлено 2026-07-22). Раздел ниже описывает БИЗНЕС-МОДЕЛЬ. Технический
> сканер/раннеры — это лишь инструментарий под неё. Если правишь модель — сначала сверься с
> владельцем (в доке легко закрепить неверное).

## Суть одной строкой
RobinArb — это **шарп-книга для вилочников**. Мы котируем цену от Пиннакла (убираем его вигориш и
накидываем свою меньшую маржу), отдаём вилочнику цену **чуть лучше Пиннакла** и принимаем у него
**одно плечо**. Пиннакл для нас — эталон истинной цены и площадка контроля/лей-оффа, **никогда не
money-плечо**.

## Ценообразование (ядро — `robin_margin.py`, см. `MARGIN_RULES.md`)
```
o_true  = o_pin * (1 + M_pin)                # цена Пиннакла без его вигориша = честная
o_robin = o_true / (1 + ROBIN_TARGET_MARGIN) # накидываем СВОЮ маржу (дефолт 2.5%)
o_robin = max(o_robin, o_pin + MIN_BUMP)     # но никогда не хуже Пиннакла + мин. бамп
```
Итог: цена лучше Пиннакла для клиента, но с нашей зашитой маржой. Экономика дома = разрыв между
`o_robin` и честной ценой; риск на матч режется Kelly-капом на lay-equivalent (`_kelly_match_cap`).
Метрики дома: `robin_house_*` (server.py), `aggregate_house_pnl` (storage.py).

## Роли
- **Клиент** — вилочник. Ставит у нас ОДНО плечо по цене `o_robin`. Мы для него — книга.
- **Поставщик** — даёт букмекерские аккаунты, через которые мы гоняем свои ставки.
- **Мы сами себе клиент** — можем ставить на своих/поставщиковых акках.

Money-плечо (где ценность) — всегда counter/soft-бук (Betfair SB, Paddy, Ladbrokes, BCGame, OneWin).
**Пиннакл — всегда НЕ money-плечо:** только эталон цены, статистика и (для книги) контроль/лей-офф.

## Три активности — что готово vs куда идём

| # | Активность | Плечи | Статус |
|---|-----------|-------|--------|
| A | **Книга** (основная бизнес-модель) — принимаем плечо клиента-вилочника по `o_robin` | клиент ставит 1 плечо у нас | ценообразование ГОТОВО; фронт-витрина приёма клиентского плеча — VISION (в работе, приоритет #1) |
| B | **Быстрые первые $5 — value одним плечом** на своих/поставщиковых акках | ставим ТОЛЬКО money-плечо (soft-бук); Пиннакл = проверка цены | НУЖЕН single-leg режим (сейчас раннеры ставят оба) |
| C | **Сбор статистики / валидация математики** | ОБА плеча по МИНИМУМУ, не уравновешивая — чтобы ловить отказы Пиннакла и считать house-P&L «как будто клиент поставил у нас» | движок готов (двухногие раннеры, 14 логфиксов — `backend/AUTOPLACE_LOGIC_TZ.md`); нужен флаг «плоский мин-стейк» + лог отказов |

Порядок: сначала **C** (доверяем математике на реальных мин-ставках) → потом **B** (заработок одним
плечом) и **A** (фронт-витрина для клиентов). Реестры C держать раздельно: симулированный house-P&L
для валидации математики отдельно от реального кэша $1-пар (он шумит из-за неуравновешенных сумм).

## Текущий инструментарий (то, что реально собрано)
- Forted-relay intake, фильтры по спорту/рынку/буку/профиту (сканер-UI)
- Robin-цена (`robin_margin`) + live-verify Пиннакла перед приёмом локального ордера
- двухногая авто-простановка (раннеры в `backend/`, режим «оба плеча»)
- учёт house P&L, Kelly-кап принимаемого стейка, сбор виртуальной статистики (`stats_collector`)

## Local Run

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8899 --reload
```

### Frontend

```bash
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8899` in development.

## Production Environment

Frontend reads `VITE_API_BASE`. If not set, it uses `/api`.

Backend supports these key env vars:

- `BIA_GATEWAY_BASE` — BIA-only quote/placement gateway, normally `http://127.0.0.1:8770`; never a direct Pinnacle endpoint
- `PINNACLE_API_TIMEOUT` — legacy-named HTTP timeout used by the BIA gateway client
- `PINNACLE_API_VERIFY_SSL` — legacy-named TLS verification switch for a remote BIA gateway
- `PINNACLE_ALLOW_INSECURE_HTTP` — legacy-named explicit opt-in for a remote plain-HTTP BIA gateway
- `PINNACLE_ALLOW_UNVERIFIED_TLS` — legacy-named explicit opt-in for a remote BIA gateway without valid TLS
- `FORTED_FEED_URL` — legacy normalized HTTP snapshot endpoint, e.g. `http://127.0.0.1:9015/api/forks/feed`; kept as fallback
- `FORTED_FEED_USE_SSE` / `FORTED_FEED_STREAM_URL` — preferred push feed from the Forted source service. When `FORTED_FEED_URL` points to `/api/forks/feed`, RobinArb derives the sibling `/stream/forks` URL unless this is set explicitly.
- `FORTED_FEED_KEY` / `FORTED_FEED_BEARER_TOKEN` — optional Forted source service auth for non-loopback consumer deployments
- `FORTED_CONTROL_URL` / `FORTED_CONTROL_TOKEN` — Forted profile-control HTTP API used by the admin bookmaker switch; defaults to the local legacy `FORTED_LWS_URL` path for adjacent deployments
- `FORTED_CONTROL_TIMEOUT` / `FORTED_CONTROL_RETRIES` / `FORTED_CONTROL_RETRY_BACKOFF` — bounded timeout and transient retry policy for Forted profile-control calls
- `FORTED_ALLOW_INSECURE_HTTP` — explicit opt-in required for remote `http://` normalized feed endpoints
- `FORTED_FEED_TIMEOUT` / `FORTED_FEED_DEAD_TIMEOUT` / `FORTED_FEED_POLL_INTERVAL` / `FORTED_FEED_LIMIT` — stream connect/read timeouts, poll fallback interval, and snapshot size
- `ROBINARB_FEED_MIN_PROFIT` / `ROBINARB_FEED_ONLINE_ONLY` — local consumer filtering. RobinArb defaults to `-3.0` so the scanner can show Forted value/RobinWork rows; set `0` if this consumer should show executable positive-margin rows only.
- `ROBINARB_FEED_MAX_PROFIT` / `ROBINARB_FEED_PROFIT_MISMATCH_TOLERANCE` — reject mathematically impossible giant margins and replace a corrupted reported percentage with the value implied by the two odds.
- `ROBINARB_FEED_STALE_AFTER` — live opportunity TTL before stale forks are hidden and local acceptance is rejected
- `ROBINARB_LIVE_FEED_STALE_AFTER` — shorter live-fork grace window used while merging sparse Forted snapshots; stale rows remain ineligible for verification and placement.
- `ROBINARB_FEED_FUTURE_SKEW` — accepted source timestamp clock skew before future-dated forks are dropped
- `ROBINARB_VERIFIED_ODDS_TTL` — one-time `quote_id` lifetime after successful live Pinnacle verify
- `ROBINARB_ODDS_TOLERANCE` — maximum odds drift tolerated when consuming a verified local PIN quote
- `ROBINARB_MAX_STAKE_LIMIT` — emergency absolute per-order stake cap, default `50`
- `ROBINARB_VERIFY_PINNACLE_STREAM_FIRST` / `ROBINARB_PINNACLE_STREAM_QUOTE_TTL` — use the pin888 FULL_ODDS stream snapshot for local quotes before falling back to Pinnacle betslip REST
- `ROBINARB_ROBIN_WORK_TOP_N` — number of top RobinWork opportunities that may use real margin recalculation, default `5`
- `ROBINARB_PINNACLE_CLIENT_RATE_LIMIT_PER_MIN` / `ROBINARB_PINNACLE_CLIENT_MIN_INTERVAL_SEC` — shared PS3838 account guard. Basket verify/place requests have foreground priority.
- `ROBINARB_PINNACLE_CLIENT_LOW_PRIORITY_QUIET_SEC` — time after a basket request during which background RobinWork `/market-margin` calls yield locally, default `2.1` seconds.
- `ROBINARB_STATS_ENABLED` / `ROBINARB_STATS_DIR` — background virtual-bet statistics collector and output directory, default `backend/stats_data`
- `ROBINARB_STATS_MIN_PROFIT` — Forted profit cutoff for virtual stats, default `-1`; the collector can bootstrap one initial sample below this if no qualifying data appears
- `ROBINARB_STATS_LIVE_DURATION_SEC` / `ROBINARB_STATS_LIVE_INTERVAL_SEC` — live price follow-up window and cadence, default `120` seconds and `2` seconds
- `ROBINARB_STATS_PREMATCH_DURATION_SEC` / `ROBINARB_STATS_PREMATCH_INTERVAL_SEC` — prematch price follow-up window and cadence, default `1200` seconds and `10` seconds
- `ROBINARB_STATS_MAX_ACTIVE` / `ROBINARB_STATS_RETRY_COOLDOWN_SEC` — max simultaneous virtual monitors and retry cooldown for rejected same-match candidates
- `ROBINARB_HIDDEN_ARBS_TTL` — per-user hidden fork/match lifetime in seconds, default `86400`
- `PIN888_SNAPSHOT_CACHE_TTL` — local TTL for cached pin888 FULL_ODDS snapshots, default `1`
- `ROBINARB_ALLOW_MOCK_FALLBACK` — set `0` in production so the UI never shows fake arbs if the feed is down
- `ROBINARB_CORS_ORIGINS` — comma-separated allowed origins for production browsers
- `ROBINARB_FEED_KEYS` — optional `;` or `,` separated machine-to-machine secrets for `GET /api/forks/feed` via `X-Robinarb-Feed-Key`
- `ROBINARB_ALLOW_DEMO_USERS` / `ROBINARB_DEMO_USERS` — disable built-in demo users in production and provide real credentials
- `FORTED_CREDS` — Forted account credentials
- `FORTED_FILTER_BOOKMAKERS` — `;` or `,` separated upstream bookmaker list
- `FORTED_FILTER_SPORTS` — `;` or `,` separated upstream sports list
- `FORTED_FILTER_ID` — Forted filter id, default `5925`
- `FORTED_SERVER_MODE` — relay mode, default `0`
- `FORTED_SOCKS5_HOST` / `FORTED_SOCKS5_PORT` — optional SOCKS5 transport for the Forted relay path
- `ROBIN_FALLBACK_BUMP` — old Robin fallback bump used when live margin cannot be calculated, default `0.04`
- `ROBIN_MARGIN_STREAM_CACHE_TTL` / `ROBIN_MARGIN_STREAM_CACHE_MAX_IDLE` / `ROBIN_MARGIN_HUB_REFRESH` — cache Robin prices per fork until Pinnacle market prices change, prune idle forks, and opt into rate-limited MORE_BET board refresh only when needed

For a split deployment, treat RobinArb as a Forted client: point `FORTED_FEED_STREAM_URL` and `FORTED_FEED_URL` at the source service, and point `FORTED_CONTROL_URL` at the same service's profile-control API. Keep `FORTED_FEED_URL` configured as the HTTP snapshot fallback. Prefer HTTPS or a private network/tunnel for remote Forted hosts; plain remote HTTP requires `FORTED_ALLOW_INSECURE_HTTP=1`.

For remote machine consumers, keep the source private on `127.0.0.1:9015` and use the authenticated reverse-proxy feed:

- `GET /forted-feed/stream/forks` with `X-Forted-Key: <secret>` for SSE push
- `GET /forted-feed/api/forks/feed?limit=200&min_profit=0` with `X-Forted-Key: <secret>` for legacy HTTP snapshots

For direct server-to-server access without a client-owned domain, use a private network or SSH tunnel rather than public plain HTTP.

Important Forted limitation from the adjacent research project:

- free-tier Forted relay access only exposes bookmaker activity/status frames, not paid fork data
- the research relay path expects a captured static keepalive packet and may require a SOCKS5 runtime such as the Forted local proxy at `127.0.0.1:2080`
- without paid relay access or direct bookmaker scraping through that proxy path, RobinArb will stay on fallback arb data; public `/api/health` stays minimal and admin-only `/api/health/details` exposes Forted diagnostics

See `DEPLOY.md` for the production layout, source-service setup, and restart checklist.
