# RobinArb Deployment

## Layout

- `/srv/forted-source` — standalone Forted feed source
- `/srv/robinarb/current` — RobinArb frontend + backend consumer

## 1. Forted Source

Files required in `/srv/forted-source`:

- `forted_feed_shim.py`
- `rust-client/target/release/forted-client`
- `rust-client/config_pin_vbet.toml`
- `requirements.txt`
- `.env.example`
- `.env`

Setup:

```bash
cd /srv/forted-source
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Run the feed shim manually, assuming the Rust producer is already running on
`127.0.0.1:3055`:

```bash
cd /srv/forted-source
. .venv/bin/activate
FORTED_FEED_PORT=9015 python forted_feed_shim.py
```

Expected endpoints:

- `GET http://127.0.0.1:9015/health`
- `GET http://127.0.0.1:9015/stream/forks`
- `GET http://127.0.0.1:9015/api/forks/feed?limit=200`

Keep this service bound to `127.0.0.1`. Do not expose port `9015` publicly; external consumers should use the authenticated reverse-proxy path instead.

Systemd:

```bash
sudo cp /srv/forted-source/infra/systemd/forted-rust.service /etc/systemd/system/forted-rust.service
sudo cp /srv/forted-source/infra/systemd/forted-source-shim.service /etc/systemd/system/forted-source.service
sudo systemctl daemon-reload
sudo systemctl enable --now forted-rust.service forted-source.service
sudo systemctl status forted-rust.service forted-source.service --no-pager
```

## 2. RobinArb consumer

Backend env for `/srv/robinarb/current/backend/.env`:

```bash
BIA_GATEWAY_BASE=http://127.0.0.1:8770
PINNACLE_API_VERIFY_SSL=1
PINNACLE_ALLOW_UNVERIFIED_TLS=0
PINNACLE_ALLOW_INSECURE_HTTP=0
FORTED_ENABLED=0
FORTED_FEED_URL=http://127.0.0.1:9015/api/forks/feed
FORTED_FEED_USE_SSE=1
FORTED_FEED_STREAM_URL=http://127.0.0.1:9015/stream/forks
FORTED_ALLOW_INSECURE_HTTP=0
FORTED_FEED_TIMEOUT=10
FORTED_FEED_DEAD_TIMEOUT=30
FORTED_FEED_POLL_INTERVAL=1
FORTED_FEED_LIMIT=200
FORTED_FEED_KEY=
FORTED_FEED_BEARER_TOKEN=
ROBINARB_FEED_MIN_PROFIT=-3.0
ROBINARB_FEED_ONLINE_ONLY=0
ROBINARB_FEED_STALE_AFTER=45
ROBINARB_FEED_FUTURE_SKEW=60
ROBINARB_VERIFIED_ODDS_TTL=20
ROBINARB_ODDS_TOLERANCE=0.001
ROBINARB_VERIFY_PINNACLE_STREAM_FIRST=1
ROBINARB_PINNACLE_STREAM_QUOTE_TTL=5
ROBINARB_ROBIN_WORK_TOP_N=5
ROBINARB_HIDDEN_ARBS_TTL=86400
ROBINARB_ALLOW_MOCK_FALLBACK=0
ROBINARB_CORS_ORIGINS=https://robinarb.com,https://www.robinarb.com
ROBINARB_FEED_KEYS=replace-with-a-long-random-secret
ROBINARB_ALLOW_DEMO_USERS=0
ROBINARB_DEMO_USERS=owner:replace-with-strong-password:20000:12000:Owner
ROBIN_FALLBACK_BUMP=0.04
ROBIN_MARGIN_STREAM_CACHE_TTL=15
ROBIN_MARGIN_STREAM_CACHE_MAX_IDLE=21600
ROBIN_MARGIN_HUB_REFRESH=0
PIN888_SNAPSHOT_CACHE_TTL=1
```

`ROBINARB_ALLOW_DEMO_USERS=0` disables built-in demo logins in production. Always set `ROBINARB_DEMO_USERS` with real passwords before exposing the site.
Keep `BIA_GATEWAY_BASE` on loopback when RobinArb and the gateway are colocated. For a remote deployment, put the BIA gateway behind authenticated HTTPS; never point this variable at Pinnacle directly.

Backend restart:

```bash
cd /srv/robinarb/current/backend
. .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart robinarb.service
sudo systemctl status robinarb.service --no-pager
curl -fsS http://127.0.0.1:8899/api/health
```

Frontend rebuild:

```bash
cd /srv/robinarb/current
npm install
VITE_API_BASE=/api npm run build
```

## 3. External feed consumers

Use SSE push for latency-sensitive consumers:

```bash
curl -N 'https://54-38-65-155.sslip.io/forted-feed/stream/forks' \
	-H 'X-Forted-Key: <your-feed-secret>'
```

The legacy HTTP snapshot remains available for old consumers:

```bash
curl -fsS 'https://54-38-65-155.sslip.io/forted-feed/api/forks/feed?limit=200&min_profit=0' \
	-H 'X-Forted-Key: <your-feed-secret>'
```

The external `/forted-feed/api/forks/feed` endpoint also accepts `min_profit=0`
and `online=1` for executable-only snapshots. The raw feed may include negative
Forted margins by design for analysis.

## 4. Production checks

```bash
curl -fsS http://127.0.0.1:9015/health
timeout 3 curl -fsS -N 'http://127.0.0.1:9015/stream/forks' | head
curl -fsS 'http://127.0.0.1:9015/api/forks/feed?limit=5'
curl -fsS http://127.0.0.1:8899/api/health
```

Healthy target state:

- `forted-rust.service` and `forted-source.service` are `active (running)`
- RobinArb `/api/health` reports `status=ok`
- admin-only RobinArb `/api/health/details` reports `source=listener`
- admin-only RobinArb `/api/health/details` reports `mock_fallback_enabled=false`
- admin-only RobinArb `/api/health/details` reports `forted_feed_url=http://127.0.0.1:9015/api/forks/feed`
- admin-only RobinArb `/api/health/details` reports `forted_feed_use_sse=true`
