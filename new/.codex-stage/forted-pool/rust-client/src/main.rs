#![allow(dead_code, unused_imports, unused_variables, unused_mut, unused_assignments, clippy::await_holding_lock)]
use anyhow::Result;
use clap::Parser;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::time::{Duration, Instant};
use tracing::{debug, info, warn};

async fn tg_send(token: &str, chat_id: &str, text: &str) {
    if token.is_empty() || chat_id.is_empty() {
        return;
    }
    let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
    let body = serde_json::json!({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_notification": false
    });
    let client = reqwest::Client::new();
    if let Err(e) = client.post(&url).json(&body).send().await {
        tracing::warn!("TG send error: {}", e);
    }
}

mod cli;
mod config;
mod network;
mod relay;
mod sinks;
mod parser;
pub mod storage;
pub mod lifecycle;
pub mod odds_api;
pub mod value_betting;
pub mod forks_api;
pub mod alerts;
pub mod telemetry;
mod db;
mod stats;
mod analysis;
mod web;
mod monitor;
mod alert;
mod bk_api;
mod dedup;
mod pipeline;
mod scheduler;
mod export;
mod logging;
mod bk_links;
pub mod sports;
mod pairs;
pub mod profit;
pub mod report;
pub mod session;
pub mod notifications;
pub mod odds;
pub mod detector;
pub mod sources;
pub mod telegram;
pub mod timeseries;
pub mod normalizer;
pub mod bot;

#[cfg(test)]
mod integration_tests;

#[derive(Parser, Debug)]
#[command(name = "forted-client", about = "Multi-server fork capture client")]
struct Args {
    /// Path to TOML config file
    #[arg(short, long)]
    config: Option<String>,

    /// Quick mode: single server address (IP:port)
    #[arg(short, long)]
    server: Option<String>,

    /// Capture duration in seconds (0 = unlimited)
    #[arg(short, long, default_value_t = 3600)]
    duration: u64,

    /// SQLite database path
    #[arg(long, default_value = "forks.db")]
    db: String,

    /// Path to auth header binary file
    #[arg(long)]
    auth_header: Option<String>,

    /// Path to auth payload binary file
    #[arg(long)]
    auth_payload: Option<String>,

    /// Enable DB rotation (hourly by default)
    #[arg(long)]
    rotate: bool,

    /// Rotation interval in seconds (default: 3600)
    #[arg(long, default_value_t = 3600)]
    rotate_interval: u64,

    /// Enable web dashboard on this port (default: 0 = disabled)
    #[arg(long, default_value_t = 0)]
    web_port: u16,

    /// Snapshot mode: подключиться к серверам, собрать N секунд, вывести срез живых вилок и выйти
    #[arg(long)]
    snapshot: bool,

    /// Сколько секунд собирать фреймы в snapshot режиме (по умолчанию 15)
    #[arg(long, default_value_t = 15)]
    collect_secs: u64,

    /// Telegram bot token for alerts (optional)
    #[arg(long, default_value = "")]
    tg_token: String,

    /// Telegram chat ID for alerts (optional)
    #[arg(long, default_value = "")]
    tg_chat: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("forted_client=info")
        .init();

    let args = Args::parse();
    info!("Forted Client v{}", env!("CARGO_PKG_VERSION"));

    // Build config from file or CLI args
    let cfg = if let Some(config_path) = &args.config {
        config::Config::load(config_path)?
    } else if let Some(server) = &args.server {
        let auth_h = args.auth_header.clone().unwrap_or_else(||
            "../results/definitive_capture/out_0018_148_251_13_174_443.bin".to_string()
        );
        let auth_p = args.auth_payload.clone().unwrap_or_else(||
            "../results/definitive_capture/out_0019_148_251_13_174_443.bin".to_string()
        );
        config::Config::from_cli(server.clone(), args.duration, args.db.clone(), auth_h, auth_p)
    } else {
        // Default: try config.toml, fall back to single server
        match config::Config::load("config.toml") {
            Ok(c) => c,
            Err(_) => {
                info!("No config.toml found, using defaults (single server)");
                let auth_h = args.auth_header.clone().unwrap_or_else(||
                    "../results/definitive_capture/out_0018_148_251_13_174_443.bin".to_string()
                );
                let auth_p = args.auth_payload.clone().unwrap_or_else(||
                    "../results/definitive_capture/out_0019_148_251_13_174_443.bin".to_string()
                );
                config::Config::from_cli(
                    "148.251.13.174:443".to_string(),
                    args.duration,
                    args.db.clone(),
                    auth_h,
                    auth_p,
                )
            }
        }
    };

    info!(
        "Config: {} servers, duration={}s, db={}",
        cfg.servers.len(),
        cfg.capture.duration,
        cfg.capture.db_path
    );

    // Snapshot mode: собрать N секунд, оставить только живые в финальный момент, выйти
    if args.snapshot {
        relay::run_snapshot(&cfg, args.collect_secs).await;
        return Ok(());
    }

    // Story 11.26: Glitchtip/Sentry init (no-op если DSN пустой)
    let _sentry_guard = telemetry::init(&cfg.telemetry);

    // Database setup: either rotating or single file
    let rotator = if args.rotate {
        let rot_cfg = db::rotation::RotationConfig {
            base_dir: std::path::Path::new(&cfg.capture.db_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| ".".to_string()),
            interval_secs: args.rotate_interval,
            ..Default::default()
        };
        let r = db::rotation::DbRotator::new(rot_cfg)?;
        info!("DB rotation enabled (every {}s)", args.rotate_interval);
        Some(r)
    } else {
        None
    };

    let database = if let Some(ref rot) = rotator {
        rot.current_db()
    } else {
        Arc::new(db::Database::new(&cfg.capture.db_path)?)
    };
    info!("Database initialized: {}", cfg.capture.db_path);

    let shared_stats = stats::new_shared();
    let shutdown = Arc::new(AtomicBool::new(false));
    let duration = cfg.capture.duration;
    let stats_interval = cfg.capture.stats_interval;

    // Telegram setup
    let tg_token = args.tg_token.clone();
    let tg_chat = args.tg_chat.clone();
    let tg_enabled = !tg_token.is_empty() && !tg_chat.is_empty();

    if tg_enabled {
        let startup_msg = format!(
            "🚀 <b>Forted Capture STARTED</b>\n\nServers: {}\nDuration: {}h\nDB: {}",
            cfg.servers.len(),
            cfg.capture.duration / 3600,
            cfg.capture.db_path
        );
        tg_send(&tg_token, &tg_chat, &startup_msg).await;
        info!("Telegram alerts enabled → chat {}", tg_chat);
    }

    // Spawn web dashboard if requested
    // Story 16.43: full-state ForkPool для SSE-выдачи (/stream/forks). Создаём всегда
    // (feed из capture loops), не зависит от ClickHouse. TTL 30с (как Python SERVER_TTL).
    // Forted relay присылает частичные пачки по лигам; полный цикл наблюдался
    // дольше прежних 30 секунд. Храним строку для стабильного UI, а downstream
    // использует fork.last_seen, чтобы разрешать действия только по свежей цене.
    let fork_pool_ttl_secs = std::env::var("FORK_POOL_TTL_SECS")
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| (15.0..=300.0).contains(value))
        .unwrap_or(90.0);
    let fork_pool = Arc::new(forks_api::state_pool::ForkPool::new(fork_pool_ttl_secs));

    // Story 16.53: best-effort загрузка clone-map (data?t=Clones) для репликации «+N»
    // (clone_count в SSE). Конфиг-эндпоинт без auth; падение fetch не критично (clone_count→None).
    {
        let pool = Arc::clone(&fork_pool);
        tokio::spawn(async move {
            const MAX_BODY: u64 = 4 * 1024 * 1024; // 4 MB cap — внешний недоверенный эндпоинт
            let url = "https://svc.forted.ru/data?t=Clones";
            match reqwest::Client::new().get(url).timeout(std::time::Duration::from_secs(15)).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if resp.content_length().map(|cl| cl > MAX_BODY).unwrap_or(false) {
                        warn!("Clone-map: тело > {} байт, пропуск", MAX_BODY);
                    } else {
                        match resp.text().await {
                            Ok(txt) if txt.len() as u64 <= MAX_BODY => {
                                pool.load_clones(&txt);
                                info!("Clone-map загружен (Story 16.53)");
                            }
                            Ok(_) => warn!("Clone-map: тело превысило лимит, пропуск"),
                            Err(e) => warn!("Clone-map: чтение тела не удалось: {}", e),
                        }
                    }
                }
                Ok(resp) => warn!("Clone-map: HTTP {}", resp.status()),
                Err(e) => warn!("Clone-map fetch не удался: {} (clone_count будет None)", e),
            }
        });
    }

    // Story 16.44 AC-3: transient-режим выдачи. STORAGE_DISABLED=1 → capture→pool→SSE
    // БЕЗ записи в SQLite/PG/CH (чистая трансляция как Python). Обходит SQLite hot-path hang.
    let storage_enabled = std::env::var("STORAGE_DISABLED").ok().as_deref() != Some("1");
    if !storage_enabled {
        info!("STORAGE_DISABLED=1 — transient-режим: capture→ForkPool→SSE без записи в БД");
    }

    // Story 16.44 AC-1: SQLite-sink — blocking-запись в отдельном потоке (вне async
    // hot-path). Создаётся только в storage-режиме. capacity 4096 frame-задач.
    let sqlite_sink = if storage_enabled {
        Some(sinks::SqliteSink::start(Arc::clone(&database), 4096))
    } else {
        None
    };

    // Story 15.2: PostgreSQL backend (перемещён выше для PgSink/SinkControl AC-2).
    let pg_backend = if !cfg.storage.postgres_url.is_empty() {
        match db::postgres::PgRealBackend::new(&cfg.storage.postgres_url).await {
            Ok(pg) => {
                info!("PostgreSQL backend connected: {}", cfg.storage.postgres_url);
                Some(pg)
            }
            Err(e) => {
                warn!("PostgreSQL недоступен ({}), fallback на SQLite only: {}", cfg.storage.postgres_url, e);
                None
            }
        }
    } else {
        info!("PostgreSQL backend: не сконфигурирован (postgres_url пуст), используем SQLite only");
        None
    };

    // Story 16.44 AC-2: PG-sink (один worker вместо per-fork spawn). None если PG нет.
    let pg_sink = pg_backend
        .clone()
        .map(Arc::new)
        .map(|pg| sinks::PgSink::start(pg, 8192));

    // Story 16.44 AC-4: 3 НЕЗАВИСИМЫХ флага записи (sqlite/clickhouse/pg) — toggle
    // раздельно через /admin/sinks. По умолчанию все = storage_enabled (STORAGE_DISABLED=1
    // → все off). CH реально пишет только если ch_client сконфигурирован.
    let sink_control = sinks::SinkControl::new(
        storage_enabled, // sqlite
        storage_enabled, // clickhouse
        storage_enabled, // pg
        sqlite_sink,
        pg_sink,
    );
    // Story 16.44 AC-5: контроллер hot-reload профиля (заполняется из /admin/profile).
    let reload_controller = sinks::admin::ReloadController::new();

    let web_port = args.web_port;
    if web_port > 0 {
        let (router, _broadcaster) = web::dashboard::create_router(Arc::clone(&database), Arc::clone(&shared_stats));
        // Story 16.43: SSE /stream/forks на web_port (full-state, Python-совместимый,
        // НЕ требует CH в отличие от /ws/forks на web_port+1). Bearer token из env.
        let router = forks_api::sse::register_sse_routes(router, forks_api::sse::SseState {
            pool: Arc::clone(&fork_pool),
            token: std::env::var("ACCESS_TOKEN").ok().filter(|s| !s.is_empty()),
        });
        // Story 16.44 AC-4/AC-5: control-API /admin/status + /admin/sinks + /admin/profile.
        let router = sinks::admin::register_admin_routes(router, sinks::admin::AdminState {
            control: Arc::clone(&sink_control),
            reload: Arc::clone(&reload_controller),
            token: std::env::var("ACCESS_TOKEN").ok().filter(|s| !s.is_empty()),
        });
        // Story 16.16 AC-3 fix: bind_addr из config (default 127.0.0.1) вместо hardcoded 0.0.0.0.
        // Production VPS: либо firewall (ufw deny), либо nginx reverse-proxy.
        let bind_addr = &cfg.capture.web_bind_addr;
        let listener_addr = format!("{}:{}", bind_addr, web_port);
        info!("Starting web dashboard + SSE /stream/forks on http://{}/", listener_addr);
        tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(&listener_addr)
                .await
                .expect("Failed to bind web dashboard port");
            axum::serve(listener, router).await.ok();
        });
    }

    // ClickHouse dual_write setup (AC-5) + Story 11.25 auth
    let ch_creds = storage::ch_params::ChCreds::new(
        cfg.storage.clickhouse_user.clone(),
        cfg.storage.clickhouse_password.clone(),
    );
    // Story 16.44 #36: env CLICKHOUSE_URL включает CH без правки config (для Вовки).
    // ch_client создаётся; реальная запись гейтится clickhouse_on() (/admin/sinks).
    let ch_url_env = std::env::var("CLICKHOUSE_URL").ok().filter(|s| !s.is_empty());
    let ch_enabled_cfg = cfg.storage.dual_write || ch_url_env.is_some();
    let ch_url = ch_url_env.unwrap_or_else(|| cfg.storage.clickhouse_url.clone());
    let ch_client = if ch_enabled_cfg {
        info!(
            "ClickHouse enabled → {}/{} (auth: {})",
            ch_url, cfg.storage.clickhouse_db,
            if ch_creds.is_configured() { "yes" } else { "none" },
        );
        if !ch_creds.is_configured() {
            tracing::warn!(
                "dual_write=true но CH credentials не сконфигурированы (config + env CH_USER/CH_PASSWORD пусты); \
                 production CH с require_auth ответит HTTP 401 на каждый INSERT"
            );
        }
        // Story 12.1 sec: Basic Auth поверх plain HTTP к non-localhost = creds в открытом виде.
        let is_local = ch_url.contains("localhost") || ch_url.contains("127.0.0.1");
        if !is_local && ch_url.starts_with("http://") {
            tracing::warn!(
                "CH URL ({}) использует plain HTTP к non-localhost адресу — Basic Auth credentials \
                 видны on-path. Используй https:// либо SSH-tunnel к localhost:8123",
                ch_url
            );
        }
        Some(storage::ChClient::new_with_creds(
            ch_url.clone(),
            cfg.storage.clickhouse_db.clone(),
            ch_creds.clone(),
        ))
    } else {
        None
    };

    // Story 15.1: CH TTL — применяем при старте (fire-and-forget, не блокируем старт)
    if cfg.storage.dual_write {
        let ttl_url = cfg.storage.clickhouse_url.clone();
        let ttl_db = cfg.storage.clickhouse_db.clone();
        let ttl_creds = ch_creds.clone();
        tokio::spawn(async move {
            storage::apply_ch_ttl(&ttl_url, &ttl_db, &ttl_creds, 30).await;
        });
    }

    // Story 15.5: shared filtered_forks counter (written by relay, read by /metrics)
    // filtered_skipped_counter() returns Arc<AtomicU64> directly (cloned from the shared field).
    #[allow(clippy::manual_map)]
    let filtered_forks_total = match &pg_backend {
        Some(pg) => Some(pg.filtered_skipped_counter()),
        None => None,
    };

    // Story 15.1: SQLite frame rotation — при старте + каждые 24h
    // Всегда (и при --rotate тоже): это cleaning по age, не file rotation.
    {
        let db_for_rotation = Arc::clone(&database);
        let days = cfg.storage.sqlite_rotation_days;
        tokio::spawn(async move {
            loop {
                // Run immediately at startup ("при старте"), then every 24h
                match db_for_rotation.rotate_old_frames(days) {
                    Ok(n) if n > 0 => info!("SQLite rotation at startup: removed {} frames older than {} days", n, days),
                    Ok(_) => debug!("SQLite rotation: no old frames to remove"),
                    Err(e) => tracing::warn!("SQLite rotation error: {}", e),
                }
                tokio::time::sleep(Duration::from_secs(86_400)).await;
            }
        });
    }

    // Story 11.16: Lifecycle Tracker — init + spawn death detector
    // Story 12.1: передаём CH creds для HTTP Basic Auth (lifecycle делает свои queries).
    let lifecycle_tracker = if cfg.storage.dual_write {
        let tracker = lifecycle::LifecycleTracker::new_with_creds(
            cfg.storage.clickhouse_url.clone(),
            cfg.storage.clickhouse_db.clone(),
            ch_creds.clone(),
        );
        lifecycle::spawn_death_detector(
            Arc::clone(&tracker),
            Duration::from_secs(30),
            Duration::from_secs(300),
        );
        info!("Lifecycle tracker started (scan=30s, grace=300s)");
        Some(tracker)
    } else {
        None
    };

    // Story 11.17: odds WS broadcast hub
    let odds_hub = odds_api::ws::OddsBroadcastHub::new(1024);

    // Story 11.22: Telegram sender + HotForkDetector
    let tg_sender = alerts::tg_sender::TgSender::new(tg_token.clone(), tg_chat.clone());
    let hot_detector = alerts::hot_fork::HotForkDetector::new(
        alerts::hot_fork::HotForkConfig::default(),
    );

    // Buffer drain фон-таск (каждую минуту отправляем summary overflow)
    {
        let hot_clone = Arc::clone(&hot_detector);
        let tg_clone = Arc::clone(&tg_sender);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            interval.tick().await;
            loop {
                interval.tick().await;
                if let Some(summary) = hot_clone.drain_buffer_summary().await {
                    tg_clone.send(&summary).await;
                }
            }
        });
    }

    // Metrics + lifecycle API + odds timeline API + WS (AC-5/6 of 11.16, AC-1..4 of 11.17)
    if web_port > 0 {
        // Story 15.3: создаём ForksBroadcastHub до if-let чтобы использовать его и для LISTEN и для WS
        let forks_ws_hub = forks_api::ws::ForksBroadcastHub::new(1024);

        // Story 15.3: подключаем backends к hub для initial snapshot.
        // audit C1 follow-up: вызываем ВСЕГДА (CH fallback должен работать и без PG).
        forks_ws_hub.with_backends(
            pg_backend.clone().map(Arc::new),
            cfg.storage.clickhouse_url.clone(),
            cfg.storage.clickhouse_db.clone(),
        );

        // Story 15.3: PG LISTEN task — подписывается на pg_notify и транслирует вилки
        if let Some(_pg) = pg_backend.clone() {
            let pg_url = cfg.storage.postgres_url.clone();
            let hub = Arc::clone(&forks_ws_hub);
            tokio::spawn(forks_api::ws::pg_listen_task(pg_url, hub));
        }

        if let Some(ch) = ch_client.clone() {
            let ch_metrics = Arc::clone(&ch.metrics);
            let lf_tracker = lifecycle_tracker.clone();
            let hub_clone = Arc::clone(&odds_hub);
            let ch_url = cfg.storage.clickhouse_url.clone();
            let ch_db = cfg.storage.clickhouse_db.clone();
            let ch_creds_clone = ch_creds.clone();
            // Story 15.3: используем тот же hub что и для PG LISTEN
            let forks_hub = Arc::clone(&forks_ws_hub);
            // Metrics endpoint — читает real filtered_forks counter из pg_backend
        let pg_for_metrics = pg_backend.clone();
        let fft_for_metrics = pg_for_metrics
            .as_ref()
            .map(|pg| pg.filtered_skipped_counter());

        tokio::spawn(async move {
            let mut app = axum::Router::new().route(
                "/metrics",
                axum::routing::get(move || {
                    let fft = fft_for_metrics.clone();
                    async move {
                        let ch_json = ch_metrics.to_json();
                        let fft_val = fft.as_ref()
                            .map(|c| c.load(Ordering::Relaxed))
                            .unwrap_or(0);
                        let body = format!(
                            "{}\n# HELP filtered_forks_total Forks skipped by write_filter profit_min\n\
                             # TYPE filtered_forks_total counter\nfiltered_forks_total{{reason=\"profit_min\"}} {}\n",
                            ch_json, fft_val
                        );
                        axum::response::Response::builder()
                            .header("Content-Type", "text/plain; charset=utf-8")
                            .body(axum::body::Body::from(body))
                            .unwrap_or_else(|_| axum::response::Response::builder()
                                .header("Content-Type", "text/plain")
                                .body(axum::body::Body::from(format!("{}\nfiltered_forks_total 0\n", ch_json)))
                                .unwrap())
                    }
                }),
            );
            if let Some(lf) = lf_tracker {
                    app = lifecycle::api::register_routes(app, lf);
                }
                let odds_state = odds_api::OddsApiState::new_with_creds(ch_url.clone(), ch_db.clone(), ch_creds_clone.clone());
                app = odds_api::register_routes(app, odds_state);
                app = odds_api::ws::register_ws_routes(app, hub_clone);
                let vb_state = value_betting::api::ValueBetsState::new_with_creds(ch_url.clone(), ch_db.clone(), ch_creds_clone.clone());
                app = value_betting::api::register_routes(app, vb_state);
                let forks_state = forks_api::ForksApiState::new_with_creds(
                    ch_url.clone(),
                    ch_db.clone(),
                    ch_creds_clone.clone(),
                    normalizer::NormalizerService::default(),
                );
                app = forks_api::register_routes(app, forks_state);
                // Story 15.3: регистрируем /ws/forks endpoint — тот же hub что и для PG LISTEN
                app = forks_api::ws::register_ws_routes(app, forks_hub);
                // Story 16.16 AC-3 fix: API port также bind на configured addr (не hardcoded 0.0.0.0)
                let addr = format!("{}:{}", cfg.capture.web_bind_addr, web_port + 1);
                if let Ok(listener) = tokio::net::TcpListener::bind(&addr).await {
                    info!("API: metrics + lifecycle + odds/timeline + /ws/odds + /ws/forks на http://localhost:{}/", web_port + 1);
                    axum::serve(listener, app).await.ok();
                }
            });
        }
    }

    // Story 12.6: разрешаем глобальный proxy один раз; per-server override резолвится в loop.
    // Config::load уже валидировал, но используем context-обёртку чтобы не паниковать в CLI mode.
    let global_proxy = match network::ProxyKind::parse(&cfg.network.proxy_url) {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Invalid network.proxy_url '{}': {:#}", cfg.network.proxy_url, e);
            return Err(e);
        }
    };
    if let Some(ref p) = global_proxy {
        info!("Network: global proxy enabled → {:?}", p);
    }

    // Story 16.44 AC-5: spawn capture-флота вынесен в closure — переиспользуется
    // при hot-reload профиля (close-before-open). Захватывает shared-зависимости
    // по ссылке, клонит Arc внутри (Fn — вызывается многократно).
    let write_filter_arc = std::sync::Arc::new(cfg.write_filter.clone());

    let spawn_fleet = |servers: Vec<config::ServerConfig>, fleet_shutdown: Arc<AtomicBool>| -> Vec<tokio::task::JoinHandle<()>> {
        let mut handles = Vec::new();
        for srv in servers {
            let db_clone = Arc::clone(&database);
            let stats_clone = Arc::clone(&shared_stats);
            let fsd = Arc::clone(&fleet_shutdown);
            let ch_clone = ch_client.clone();
            let lf_clone = lifecycle_tracker.clone();
            let hub_clone = Arc::clone(&odds_hub);
            let hot_clone = Arc::clone(&hot_detector);
            let tg_clone = Arc::clone(&tg_sender);
            let pg_clone = pg_backend.clone().map(Arc::new);
            let fft_clone = filtered_forks_total.clone();
            let fork_pool_clone = Arc::clone(&fork_pool);
            let control_clone = Arc::clone(&sink_control);
            let wf = std::sync::Arc::clone(&write_filter_arc);

            // Per-server proxy override > global.
            let server_proxy = match &srv.proxy_url {
                None => global_proxy.clone(),
                Some(url) => match network::ProxyKind::parse(url) {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::error!("[{}] Invalid proxy_url: {:#}", srv.addr, e);
                        global_proxy.clone()
                    }
                },
            };

            info!("Spawning capture task for {}", srv.addr);
            handles.push(tokio::spawn(async move {
                relay::run_server_loop(
                    srv, db_clone, stats_clone, fsd, duration,
                    ch_clone, lf_clone, Some(hub_clone),
                    Some(hot_clone), Some(tg_clone),
                    server_proxy, pg_clone, wf,
                    fft_clone,
                    Some(fork_pool_clone),
                    control_clone,
                ).await;
            }));
        }
        handles
    };

    // fleet_shutdown отдельный от global shutdown: hot-reload останавливает только
    // текущий флот (close-before-open), не весь процесс.
    let mut fleet_shutdown = Arc::new(AtomicBool::new(false));
    let mut handles = spawn_fleet(cfg.servers.clone(), Arc::clone(&fleet_shutdown));

    // Ctrl+C handler
    let shutdown_signal = Arc::clone(&shutdown);
    tokio::spawn(async move {
        if let Ok(()) = tokio::signal::ctrl_c().await {
            info!("Ctrl+C received, shutting down...");
            shutdown_signal.store(true, Ordering::Relaxed);
        }
    });

    // Periodic stats printer + Telegram hourly updates
    let stats_printer = Arc::clone(&shared_stats);
    let shutdown_printer = Arc::clone(&shutdown);
    let tg_token_bg = tg_token.clone();
    let tg_chat_bg = tg_chat.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(stats_interval));
        interval.tick().await; // skip first immediate tick
        let mut tg_tick: u64 = 0;
        let mut last_tg_hour: u64 = 0;
        loop {
            interval.tick().await;
            if shutdown_printer.load(Ordering::Relaxed) {
                break;
            }
            stats_printer.lock().unwrap().print_periodic();
            tg_tick += stats_interval;
            let current_hour = tg_tick / 3600;
            // Send TG update every hour
            if tg_enabled && current_hour > last_tg_hour {
                last_tg_hour = current_hour;
                let (frames, forks, fps, errors, reconnects) = {
                    let s = stats_printer.lock().unwrap();
                    (s.total_frames(), s.total_forks(), s.forks_per_second(),
                     s.total_errors(), s.total_reconnects())
                };
                let msg = format!(
                    "📊 <b>Hourly Stats</b> ({}h elapsed)\n\nFrames: {}\nForks: {}\nForks/s: {:.1}\nErrors: {}\nReconnects: {}",
                    current_hour, frames, forks, fps, errors, reconnects,
                );
                tg_send(&tg_token_bg, &tg_chat_bg, &msg).await;
            }
        }
    });

    // Wait for duration deadline or shutdown.
    // audit H7: duration=0 = unlimited (как трактует relay loop). Раньше main
    // ставил deadline=now+0 и завершался мгновенно (обходили через TOML 86400).
    let unlimited = duration == 0;
    let deadline = Instant::now() + Duration::from_secs(duration);
    loop {
        if shutdown.load(Ordering::Relaxed) {
            fleet_shutdown.store(true, Ordering::Relaxed); // пропагируем global → флот
            break;
        }
        if !unlimited && Instant::now() >= deadline {
            info!("Duration reached, signalling shutdown...");
            shutdown.store(true, Ordering::Relaxed);
            fleet_shutdown.store(true, Ordering::Relaxed);
            break;
        }

        // Story 16.44 AC-5/AC-6: hot-reload профиля. close-before-open — сначала
        // останавливаем и ДОЖИДАЕМСЯ закрытия всех старых сессий (один аккаунт =
        // одна сессия, нет overlap), затем коннектимся с новым профилем.
        if let Some(new_path) = reload_controller.take() {
            info!("[reload] hot-reload профиля → {}", new_path);
            match config::Config::load(&new_path) {
                Ok(new_cfg) => {
                    // 1. Закрыть старый флот и ДОЖДАТЬСЯ (AC-6: нет overlap сессий).
                    //    Timeout (review #1): зависший reconnect не должен заклинить reload.
                    fleet_shutdown.store(true, Ordering::Relaxed);
                    let old = std::mem::take(&mut handles);
                    let n_old = old.len();
                    let join_all = async move {
                        for h in old {
                            let _ = h.await;
                        }
                    };
                    if tokio::time::timeout(Duration::from_secs(20), join_all).await.is_err() {
                        warn!("[reload] timeout закрытия старого флота ({} сессий) — продолжаю", n_old);
                    } else {
                        info!("[reload] старый флот закрыт ({} сессий)", n_old);
                    }
                    // review #2: если за время join пришёл global shutdown — не поднимаем новый флот.
                    if shutdown.load(Ordering::Relaxed) {
                        info!("[reload] прерван global shutdown — новый флот не поднимаю");
                        break;
                    }
                    // 2. Очистить ForkPool (новый профиль = другие BK/маржа).
                    fork_pool.clear();
                    // 3. Поднять новый флот с новым auth/профилем.
                    fleet_shutdown = Arc::new(AtomicBool::new(false));
                    handles = spawn_fleet(new_cfg.servers.clone(), Arc::clone(&fleet_shutdown));
                    info!("[reload] новый флот поднят: {} серверов", new_cfg.servers.len());
                }
                Err(e) => {
                    warn!("[reload] не удалось загрузить config {}: {} — оставляю текущий", new_path, e);
                }
            }
        }

        // Check DB rotation
        if let Some(ref rot) = rotator {
            if let Ok(true) = rot.check_rotation() {
                info!("DB rotated to new file");
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    // Wait for all server tasks to finish (with timeout)
    info!("Waiting for server tasks to finish...");
    let shutdown_deadline = tokio::time::sleep(Duration::from_secs(15));
    tokio::pin!(shutdown_deadline);

    tokio::select! {
        _ = async {
            for handle in handles {
                let _ = handle.await;
            }
        } => {
            info!("All server tasks completed");
        }
        _ = &mut shutdown_deadline => {
            info!("Shutdown timeout, some tasks may still be running");
        }
    }

    // Story 16.44 AC-1/AC-7: graceful flush SQLite-sink — дописать очередь принятых
    // frames до выхода (без потери данных), затем join worker-потока.
    if let Some(sink) = &sink_control.sqlite_sink {
        info!("Flushing SQLite sink (sent={}, dropped={})...", sink.sent(), sink.dropped());
        sink.shutdown_and_join();
        info!("SQLite sink flushed");
    }

    // Print final summary
    info!("");
    let final_stats = shared_stats.lock().unwrap();
    final_stats.print_summary();
    drop(final_stats);
    info!("");
    database.print_summary()?;

    // Telegram final summary
    if tg_enabled {
        let s = shared_stats.lock().unwrap();
        let elapsed_h = s.elapsed_secs() / 3600.0;
        let msg = format!(
            "✅ <b>Forted Capture DONE</b>\n\nDuration: {:.1}h\nFrames: {}\nForks: {}\nForks/s: {:.1}\nErrors: {}\nReconnects: {}",
            elapsed_h,
            s.total_frames(),
            s.total_forks(),
            s.forks_per_second(),
            s.total_errors(),
            s.total_reconnects(),
        );
        drop(s);
        tg_send(&tg_token, &tg_chat, &msg).await;
    }

    Ok(())
}
