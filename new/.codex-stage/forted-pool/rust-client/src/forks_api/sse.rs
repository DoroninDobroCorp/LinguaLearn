//! Story 16.43: SSE endpoint /stream/forks (axum) — консолидация выдачи на Rust.
//!
//! Байт-совместим с Python live_web_server SSE-контрактом, чтобы Вовкин
//! sse_consumer.py подключался без изменений:
//!   - wire: `event: state\ndata: <payload>\n\n` (+ `event: heartbeat`)
//!   - Accept-Encoding: gzip → Content-Encoding: x-sse-gzip-chunked, payload =
//!     base64(gzip(json)) per-event (каждый data: — self-contained blob).
//!   - без Accept-Encoding gzip → plain JSON (backward compat).
//!   - Bearer auth (Authorization header ИЛИ ?token=), token из env ACCESS_TOKEN.
//!   - full-state снапшот из ForkPool (build_snapshot), push при изменении revision,
//!     иначе heartbeat каждые SSE_HEARTBEAT_INTERVAL сек.

use super::state_pool::ForkPool;
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use base64::Engine;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const POLL_INTERVAL_MS: u64 = 100;
// A state event contains the complete fork pool (hundreds of entries). Relay
// revisions can arrive around ten times per second, while consumers need only
// the newest full state. Sending every revision creates a TCP/SSE backlog: a
// consumer remains connected but sees snapshots tens of seconds late. Coalesce
// revisions, but keep the default latency below a UI poll. The single-slot
// channel still guarantees that a slow consumer receives only the newest full
// state. Operators may tune this in the bounded 100..2000 ms range.
const DEFAULT_STATE_MIN_INTERVAL_MS: u64 = 250;
const HEARTBEAT_SECS: u64 = 20;
const GZIP_LEVEL: u32 = 6;

fn state_min_interval_ms() -> u64 {
    std::env::var("FORTED_SSE_STATE_MIN_INTERVAL_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| (100..=2_000).contains(value))
        .unwrap_or(DEFAULT_STATE_MIN_INTERVAL_MS)
}

#[derive(Clone)]
pub struct SseState {
    pub pool: Arc<ForkPool>,
    /// None = auth отключён (dev). Some = требуется Bearer/token match.
    pub token: Option<String>,
}

pub fn register_sse_routes(router: Router, state: SseState) -> Router {
    let sse_routes = Router::new()
        .route("/stream/forks", get(sse_forks_handler))
        .with_state(state);
    router.merge(sse_routes)
}

#[derive(serde::Deserialize)]
pub struct SseQuery {
    token: Option<String>,
}

fn check_auth(headers: &HeaderMap, q: &SseQuery, expected: &str) -> bool {
    // Authorization: Bearer <token>
    if let Some(v) = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok()) {
        if let Some(tok) = v.strip_prefix("Bearer ") {
            if tok.trim() == expected {
                return true;
            }
        }
    }
    // ?token=<token> (для browser EventSource без заголовков)
    if let Some(t) = &q.token {
        if t == expected {
            return true;
        }
    }
    false
}

fn accept_gzip(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT_ENCODING)
        .and_then(|h| h.to_str().ok())
        .map(|s| {
            s.split(',')
                .any(|t| t.trim().split(';').next().unwrap_or("").trim().eq_ignore_ascii_case("gzip"))
        })
        .unwrap_or(false)
}

fn gzip_b64(json: &str) -> String {
    let mut enc = GzEncoder::new(Vec::new(), Compression::new(GZIP_LEVEL));
    let _ = enc.write_all(json.as_bytes());
    let compressed = enc.finish().unwrap_or_default();
    base64::engine::general_purpose::STANDARD.encode(compressed)
}

/// Формирует один SSE-event на wire (как Python _write_event).
fn make_event(event_type: &str, json: &str, use_gzip: bool) -> Vec<u8> {
    if use_gzip {
        let encoded = gzip_b64(json);
        format!("event: {}\ndata: {}\n\n", event_type, encoded).into_bytes()
    } else {
        format!("event: {}\ndata: {}\n\n", event_type, json).into_bytes()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

async fn sse_forks_handler(
    State(st): State<SseState>,
    Query(q): Query<SseQuery>,
    headers: HeaderMap,
) -> Response {
    // Auth (fail-closed если token задан).
    if let Some(expected) = &st.token {
        if !check_auth(&headers, &q, expected) {
            return (StatusCode::UNAUTHORIZED, "401 Unauthorized: missing or invalid token").into_response();
        }
    }
    let use_gzip = accept_gzip(&headers);
    let state_min_interval = Duration::from_millis(state_min_interval_ms());

    // Full-state events supersede one another. Keep at most one waiting event;
    // on a full channel we retain the old revision marker and retry by building
    // the newest state after the consumer drains it. A deep FIFO would deliver
    // obsolete snapshots and turn backpressure into visible feed latency.
    let (mut tx, rx) = futures::channel::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(1);
    let pool = st.pool.clone();

    tokio::spawn(async move {
        let mut last_revision = pool.revision();
        let mut last_hb = Instant::now();
        let mut last_state = Instant::now();
        let mut active_servers = 0usize;
        let mut total_forks = 0usize;

        // Initial full-state snapshot.
        {
            let snap = pool.build_snapshot();
            if let Ok(json) = serde_json::to_string(&snap) {
                active_servers = snap.servers.values().filter(|s| s.status == "live").count();
                total_forks = snap.stats.total;
                if tx.try_send(Ok(make_event("state", &json, use_gzip))).is_err() {
                    return; // disconnected или full на initial — клиент не готов
                }
            }
        }

        let mut tick = tokio::time::interval(Duration::from_millis(POLL_INTERVAL_MS));
        loop {
            tick.tick().await;
            if tx.is_closed() {
                break;
            }
            let revision = pool.revision();
            if revision == last_revision {
                if last_hb.elapsed().as_secs() >= HEARTBEAT_SECS {
                    last_hb = Instant::now();
                    let hb = format!(
                        "{{\"type\":\"heartbeat\",\"ts\":{},\"active_servers\":{},\"total_forks\":{}}}",
                        now_ms(), active_servers, total_forks
                    );
                    match tx.try_send(Ok(make_event("heartbeat", &hb, use_gzip))) {
                        Ok(_) => {}
                        Err(e) if e.is_disconnected() => break,
                        Err(_) => {}
                    }
                }
                continue;
            }
            if last_state.elapsed() < state_min_interval {
                continue;
            }
            let snap = pool.build_snapshot();
            let json = match serde_json::to_string(&snap) {
                Ok(j) => j,
                Err(_) => continue,
            };
            match tx.try_send(Ok(make_event("state", &json, use_gzip))) {
                Ok(_) => {
                    last_revision = revision;
                    active_servers = snap.servers.values().filter(|s| s.status == "live").count();
                    total_forks = snap.stats.total;
                    last_hb = Instant::now();
                    last_state = Instant::now();
                }
                Err(e) if e.is_disconnected() => break,
                // Keep the old revision so the latest full state is retried.
                Err(_) => {}
            }
        }
    });

    let body = Body::from_stream(rx);
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .header("X-Accel-Buffering", "no");
    if use_gzip {
        // Custom contract: per-event gzip (не whole-stream). Consumer декомпрессирует
        // base64+gzip каждый data: chunk отдельно (sse_consumer.py понимает этот заголовок).
        builder = builder.header(header::CONTENT_ENCODING, "x-sse-gzip-chunked");
    }
    builder.body(body).unwrap_or_else(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "sse build error").into_response()
    })
}

#[cfg(test)]
mod tests {
    use super::DEFAULT_STATE_MIN_INTERVAL_MS;

    #[test]
    fn default_state_interval_is_below_one_second() {
        assert!(DEFAULT_STATE_MIN_INTERVAL_MS < 1_000);
        assert!(DEFAULT_STATE_MIN_INTERVAL_MS >= 100);
    }
}
