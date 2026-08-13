//! Story 16.43: in-memory full-state pool активных вилок для SSE-выдачи.
//!
//! Назначение: повторить семантику Python live_web_server.build_state() в Rust,
//! чтобы консолидировать выдачу (убрать Python-времянку).
//!
//! Forted шлёт частичные пачки per server: соседние frame могут содержать разные
//! лиги/рынки. Поэтому:
//!   - feed_server_snapshot() UPSERT-ит вилки по их узкому dedup-ключу и удаляет
//!     каждую вилку только по её собственному TTL;
//!   - build_snapshot() делает UNION 12 серверов + dedup по узкому ключу
//!     compute_dedup_key (sport|bks|pair|stakes, свежайший last_seen побеждает)
//!     + matches[] aggregation по match_key поверх deduped forks.
//!
//! Формат StateSnapshot байт-совместим с Python build_state() JSON (stats/servers/
//! sport_counts/forks/matches) — Вовкин sse_consumer.py не меняется.

use crate::parser::Fork;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_secs() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// match_key: sport|sorted(team_en|team).lower() — повтор Python compute_match_key.
fn compute_match_key(f: &Fork) -> String {
    let (t1, t2) = if let Some(s0) = f.sources.first() {
        let t1 = if !s0.team1_en.is_empty() { &s0.team1_en } else { &s0.team1 };
        let t2 = if !s0.team2_en.is_empty() { &s0.team2_en } else { &s0.team2 };
        (t1.trim().to_lowercase(), t2.trim().to_lowercase())
    } else {
        (String::new(), String::new())
    };
    let (a, b) = if t1 <= t2 { (t1, t2) } else { (t2, t1) };
    format!("{}|{}|{}", f.sport, a, b)
}

/// dedup_key: узкая идентичность вилки — повтор Python live_web_server.py:203,235
///   bks = sorted([bk for s in sources[:2]]); key = (sport, bks, pair, stakes).
/// КРИТИЧНО (GPT-5.5 review CRITICAL-B): дедуп по match_key (sport|team_pair)
/// схлопывал бы все stake_types/BK одного матча в один fork → matches[].outcomes
/// всегда =1 → multi-outcome (Story 16.28/29) сломан. Дедуп ДОЛЖЕН включать
/// stakes и BK-пару, а match_key остаётся только для группировки matches[].
fn compute_dedup_key(out: &ForkOut) -> String {
    let mut bks: Vec<String> = out.sources.iter().take(2).map(|s| s.bk.clone()).collect();
    bks.sort();
    let t1 = out.team1.trim().to_lowercase();
    let t2 = out.team2.trim().to_lowercase();
    let (a, b) = if t1 <= t2 { (t1, t2) } else { (t2, t1) };
    // \x1f/\x1e — separators, не встречающиеся в данных (без коллизий ключа).
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}",
        out.sport,
        bks.join("\u{1e}"),
        a,
        b,
        out.stakes
    )
}

// ── BK UI-алиасы (Story 16.60) ───────────────────────────────────────────
/// Домены, чьё имя на проводе Forted отличается от UI-выбора (общий фид/quirk).
/// Forted при выборе «dafabet» в UI подписывается на домен `12bet.com` (dafabet.com
/// сервер не вещает). Список расширяемый по мере обнаружения подобных подмен.
const BK_UI_ALIASES: &[(&str, &str)] = &[
    ("12bet.com", "Dafabet"),
    ("paddypower.com", "Betfair"),
];

/// Возвращает читаемый лейбл «<domain> (<UI-имя>)» для домена с алиасом,
/// либо пустую строку, если алиаса нет (тогда SSE-поле bk_label скрывается).
pub fn bk_display_label(domain: &str) -> String {
    for (d, ui_name) in BK_UI_ALIASES {
        if domain.eq_ignore_ascii_case(d) {
            // канонический домен из карты (не входной регистр)
            return format!("{d} ({ui_name})");
        }
    }
    String::new()
}

// ── Output structs (JSON формат как Python build_state) ──────────────────

#[derive(Serialize, Clone)]
pub struct SourceOut {
    pub bk: String,
    /// Story 16.60: читаемый лейбл с UI-именем Forted для доменов, чьё имя на проводе
    /// != UI-выбора (напр. wire `12bet.com` = UI «Dafabet»). Формат «<domain> (<UI-имя>)».
    /// Additive-поле SSE: пустое (скрыто) для доменов без алиаса. `bk` остаётся сырым доменом.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub bk_label: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub team1: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub team2: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub bet_link: String,
    /// A2 (16.58): название турнира/события у БК (из S=). Пустое скрывается.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub event_name: String,
    /// A1 (16.58): англ. имена команд (из M=). Пустые скрываются.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub team1_en: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub team2_en: String,
}

#[derive(Serialize, Clone)]
pub struct ForkOut {
    pub server: String,
    pub last_seen: f64,
    pub sport: String,
    pub profit: f64,
    pub stakes: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub market_code: String,
    pub is_live: String,
    pub score: String,
    pub event_dt: String,
    pub match_key: String,
    pub team1: String,
    pub team2: String,
    pub sources: Vec<SourceOut>,
    /// "Завышенность" (Overvalue) по каждому исходу — целые per-outcome из поля
    /// фрейма `OV=` (индекс соответствует `stakes`/исходу). Приходит с сервера.
    /// Additive-поле SSE-контракта (Story 16.45). Пустой массив при отсутствии OV.
    pub overvalue: Vec<i32>,
    /// Реальные decimal-коэффициенты исходов (odds) из SB= (Story 16.46). Индекс
    /// соответствует исходу/overvalue. Пустой массив, если коэфы не распарсились.
    pub odds: Vec<f32>,
    /// Счётчик альтернативных линий из AL= (Story 16.50). None если нет/битый.
    pub alt_count: Option<i32>,
    /// Читаемое имя категории рынка (Story 16.51), расшифровка префикса stakes по
    /// словарю AddNames (напр. "Угловые, весь матч"). None если словарь не получен/нет совпадения.
    pub market_name: Option<String>,
    /// Safe market/period fragment recovered from `INF=`; opaque ids/paths are omitted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub market_hint: Option<String>,
    /// «+N» (реплика AlsoCount, Story 16.53): число БК-клонов (зеркал) источника вилки
    /// из data?t=Clones. NB: это счётчик клон-БК, а НЕ проверка наличия именно этой
    /// ставки у каждого клона. Best-effort/source[0]; None если clone-map не загружен.
    pub clone_count: Option<i32>,
    /// A6 (16.58): время матча (TIM=). Пустое скрывается.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub match_time: String,
    /// A3 (16.58): sport_id из INF= (напр. "33"=Tennis). None если INF иного формата.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sport_id: Option<String>,
    /// A3 (16.58): event_id из INF=. NB: источник НЕ подтверждён (вероятно Forted/Pinnacle-
    /// внутренний, НЕ id soft-БК). None если нет.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inf_event_id: Option<String>,
    /// Exact tennis child-market coordinates decoded from INF. `set_number`
    /// is deliberately None when Forted omits it; consumers must not guess.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_number: Option<i32>,
    /// A4 (16.58): оценка остатка времени до старта в секундах (из LIF=). **Оценка.** None если нет.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_to_start_estimate_secs: Option<i32>,
}

#[derive(Serialize)]
pub struct ServerStat {
    pub frames: u64,
    pub forks: u64,
    pub pin: u64,
    pub status: String,
}

#[derive(Serialize)]
pub struct SportCount {
    pub sport: String,
    pub count: usize,
}

#[derive(Serialize)]
pub struct OutcomeOut {
    pub stakes: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub market_code: String,
    pub profit: f64,
    pub is_live: String,
    pub last_seen: f64,
    pub server: String,
    pub bks: Vec<String>,
    /// "Завышенность" per-outcome (см. [`ForkOut::overvalue`]). Story 16.45.
    pub overvalue: Vec<i32>,
    /// Реальные decimal-коэффициенты исходов (см. [`ForkOut::odds`]). Story 16.46.
    pub odds: Vec<f32>,
    /// Счётчик альтернативных линий (см. [`ForkOut::alt_count`]). Story 16.50.
    pub alt_count: Option<i32>,
    /// Имя категории рынка (см. [`ForkOut::market_name`]). Story 16.51.
    pub market_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub market_hint: Option<String>,
    /// «+N» реплика (см. [`ForkOut::clone_count`]). Story 16.53.
    pub clone_count: Option<i32>,
    /// A3/A4/A6 (16.58): см. одноимённые поля [`ForkOut`].
    #[serde(skip_serializing_if = "String::is_empty")]
    pub match_time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sport_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inf_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_to_start_estimate_secs: Option<i32>,
}

#[derive(Serialize)]
pub struct MatchOut {
    pub match_key: String,
    pub sport: String,
    pub team1: String,
    pub team2: String,
    pub event_dt: String,
    pub is_live: String,
    pub outcomes: Vec<OutcomeOut>,
}

#[derive(Serialize)]
pub struct Stats {
    pub total: usize,
    pub pin: usize,
    pub live: usize,
    pub pre: usize,
    pub rate: f64,
    pub runtime: u64,
    pub matches_total: usize,
    pub avg_outcomes_per_match: f64,
    pub max_outcomes_per_match: usize,
    pub multi_outcome_matches: usize,
    pub multi_outcome_ratio: f64,
}

#[derive(Serialize)]
pub struct StateSnapshot {
    pub stats: Stats,
    pub servers: HashMap<String, ServerStat>,
    pub sport_counts: Vec<SportCount>,
    pub forks: Vec<ForkOut>,
    pub matches: Vec<MatchOut>,
    /// A5 (16.58): статусы БК online/offline (домен→online) из BkStatus (.26). Пусто скрывается.
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub bk_status: HashMap<String, bool>,
    /// A7 (16.58): справочные словари. Пустые скрываются.
    #[serde(skip_serializing_if = "Dictionaries::is_empty")]
    pub dictionaries: Dictionaries,
}

/// A7 (16.58): справочные словари (расшифровка кодов). Обычно пустые (редкий .206).
#[derive(Serialize, Default)]
pub struct Dictionaries {
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub add_names: HashMap<String, String>,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub bet_names: HashMap<String, String>,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub bet_equals: HashMap<String, String>,
}
impl Dictionaries {
    fn is_empty(&self) -> bool {
        self.add_names.is_empty() && self.bet_names.is_empty() && self.bet_equals.is_empty()
    }
}

// ── Internal pool entry ──────────────────────────────────────────────────

#[derive(Clone)]
struct PooledFork {
    last_seen: f64,
    out: ForkOut,
}

struct ServerState {
    forks: HashMap<String, PooledFork>,
    updated: f64,
    frames: u64,
    forks_count: u64,
    pin_count: u64,
    status: String,
}

impl Default for ServerState {
    fn default() -> Self {
        ServerState {
            forks: HashMap::new(),
            updated: 0.0,
            frames: 0,
            forks_count: 0,
            pin_count: 0,
            status: "connecting".to_string(),
        }
    }
}

/// Full-state pool: per-server snapshots + union/dedup/aggregation.
pub struct ForkPool {
    servers: Mutex<HashMap<String, ServerState>>,
    /// Monotonic state version used by SSE to avoid rebuilding and serializing
    /// the complete snapshot when no relay data changed.
    revision: AtomicU64,
    ttl_secs: f64,
    start_ts: f64,
    /// Story 16.51: кеш словаря AddNames (код категории рынка → читаемое имя),
    /// напр. "УГЛ"→"Угловые, весь матч". Приходит редко (сервер .206), кешируется
    /// между фреймами, используется для аннотации stakes (market_name в ForkOut).
    add_names: Mutex<HashMap<String, String>>,
    /// Story 16.53: clone-map (домен БК → число БК-клонов-сиблингов) из
    /// `svc.forted.ru/data?t=Clones`. База для репликации «+N» (AlsoCount, Story 16.52):
    /// clone_count вилки = число клон-БК её источника.
    clones: Mutex<HashMap<String, i32>>,
    /// A7 (16.58): справочные словари BetNames (код исхода→имя) / BetEquals (код→тотал),
    /// приходят редко (.206), кешируются между фреймами. Отдаются в snapshot.dictionaries.
    bet_names: Mutex<HashMap<String, String>>,
    bet_equals: Mutex<HashMap<String, String>>,
    /// A5 (16.58): статус БК online/offline (домен→online) из BkStatus-кадров (.26).
    bk_status: Mutex<HashMap<String, bool>>,
}

impl ForkPool {
    pub fn new(ttl_secs: f64) -> Self {
        ForkPool {
            servers: Mutex::new(HashMap::new()),
            revision: AtomicU64::new(1),
            ttl_secs,
            start_ts: now_secs(),
            add_names: Mutex::new(HashMap::new()),
            clones: Mutex::new(HashMap::new()),
            bet_names: Mutex::new(HashMap::new()),
            bet_equals: Mutex::new(HashMap::new()),
            bk_status: Mutex::new(HashMap::new()),
        }
    }

    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::Acquire)
    }

    fn touch(&self) {
        self.revision.fetch_add(1, Ordering::Release);
    }

    /// A7 (16.58): обновить словари BetNames/BetEquals из reference_data (merge, bound).
    pub fn update_bet_dicts(&self, bet_names: &[crate::parser::DictEntry], bet_equals: &[crate::parser::DictEntry]) {
        let changed = Self::merge_dict(&self.bet_names, bet_names)
            | Self::merge_dict(&self.bet_equals, bet_equals);
        if changed {
            self.touch();
        }
    }
    fn merge_dict(target: &Mutex<HashMap<String, String>>, entries: &[crate::parser::DictEntry]) -> bool {
        if entries.is_empty() { return false; }
        const MAX: usize = 4096;
        let mut g = target.lock().unwrap();
        let mut changed = false;
        for e in entries {
            if e.key.len() > 256 || e.value.len() > 256 { continue; }
            if g.len() >= MAX && !g.contains_key(&e.key) { continue; }
            if g.get(&e.key) != Some(&e.value) {
                g.insert(e.key.clone(), e.value.clone());
                changed = true;
            }
        }
        changed
    }

    /// A5 (16.58): обновить статусы БК (домен→online) из BkStatus-кадров (.26).
    pub fn update_bk_status(&self, bks: &[crate::parser::BookmakerStatus]) {
        if bks.is_empty() { return; }
        const MAX: usize = 4096;
        let mut g = self.bk_status.lock().unwrap();
        let mut changed = false;
        for b in bks {
            if b.domain.len() > 128 { continue; }
            if g.len() >= MAX && !g.contains_key(&b.domain) { continue; }
            if g.get(&b.domain) != Some(&b.online) {
                g.insert(b.domain.clone(), b.online);
                changed = true;
            }
        }
        drop(g);
        if changed {
            self.touch();
        }
    }

    /// Story 16.53: загрузить clone-map из CSV `data?t=Clones`. Формат строки:
    /// `main_domain,clone1_domain,clone1_name,clone2_domain,clone2_name,...` — домены
    /// на позициях 0,1,3,5,... (нечётные после main + сам main), имена на чётных ≥2.
    /// Для каждого домена группы пишем число сиблингов (group_size - 1).
    /// Best-effort: парс-only, без сети (сеть — в main.rs startup).
    pub fn load_clones(&self, csv: &str) {
        const MAX_DOMAINS: usize = 50_000;
        let mut map: HashMap<String, i32> = HashMap::new();
        for line in csv.lines() {
            // НЕ фильтруем пустые поля до разбора позиций (иначе сдвиг индексов).
            let f: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            // Группа = домены (содержат '.') на позициях 0,1,3,5,... (main + нечётные).
            // Имена (чётные ≥2) и пустые поля игнорируются.
            let mut group: Vec<String> = Vec::new();
            if let Some(first) = f.first() {
                if first.contains('.') {
                    group.push(first.to_lowercase());
                }
            }
            let mut i = 1;
            while i < f.len() {
                if f[i].contains('.') {
                    group.push(f[i].to_lowercase());
                }
                i += 2;
            }
            let siblings = (group.len() as i32 - 1).max(0);
            for d in group {
                if map.len() >= MAX_DOMAINS && !map.contains_key(&d) {
                    continue;
                }
                map.insert(d, siblings);
            }
        }
        // Всегда заменяем (даже пустой результат): "нет clone-map → clone_count=None".
        let mut current = self.clones.lock().unwrap();
        if *current != map {
            *current = map;
            drop(current);
            self.touch();
        }
    }

    /// Story 16.51: обновить кеш AddNames из reference_data фрейма (merge).
    /// Bound (review-fix): пропускаем слишком длинные ключи/значения и не растим словарь
    /// сверх лимита — защита от роста памяти при недоверенном/мусорном feed.
    pub fn update_add_names(&self, entries: &[crate::parser::DictEntry]) {
        const MAX_ENTRIES: usize = 4096;
        const MAX_LEN: usize = 256;
        if entries.is_empty() {
            return;
        }
        let mut g = self.add_names.lock().unwrap();
        let mut changed = false;
        for e in entries {
            if e.key.len() > MAX_LEN || e.value.len() > MAX_LEN {
                continue;
            }
            // обновлять существующие ключи всегда; новые — только пока не достигнут лимит
            if g.len() >= MAX_ENTRIES && !g.contains_key(&e.key) {
                continue;
            }
            if g.get(&e.key) != Some(&e.value) {
                g.insert(e.key.clone(), e.value.clone());
                changed = true;
            }
        }
        drop(g);
        if changed {
            self.touch();
        }
    }


    /// Очистить пул вилок (Story 16.44 AC-5: при hot-reload профиля — новый набор
    /// BK/маржа, старые вилки больше не валидны).
    ///
    /// Story 16.51 (review-fix, контракт): кеш `add_names` НЕ очищается намеренно —
    /// это ГЛОБАЛЬНЫЙ справочник категорий рынка (напр. "УГЛ"→"Угловые"),
    /// profile-independent и universal, приходит редко (.206). Очистка при каждой
    /// смене профиля привела бы к потере редко-получаемых данных без выигрыша
    /// (имена категорий одинаковы для любого профиля). Stale/«чужих» имён быть не может.
    ///
    /// Story 16.58: по той же причине НЕ очищаются `bet_names`/`bet_equals` (словари
    /// исходов/тоталов — profile-independent) и `bk_status` (статус БК online/offline —
    /// BK-глобальный, не зависит от профиля; last-known). Все четыре кеша persist by design.
    pub fn clear(&self) {
        self.servers.lock().unwrap().clear();
        self.touch();
    }

    /// Обновить статус сервера (connecting/live/closed).
    pub fn set_status(&self, server: &str, status: &str) {
        let mut g = self.servers.lock().unwrap();
        let st = g.entry(server.to_string()).or_default();
        if st.status == status {
            return;
        }
        st.status = status.to_string();
        drop(g);
        self.touch();
    }

    /// Merge частичной пачки одного сервера. Forted обходит лиги/рынки по кругу,
    /// поэтому отсутствие вилки в одном frame НЕ означает, что она исчезла.
    /// Каждая вилка обновляется по dedup-ключу и протухает независимо.
    pub fn feed_server_snapshot(&self, server: &str, forks: &[Fork]) {
        let ts = now_secs();
        let mut pooled = Vec::with_capacity(forks.len());
        let mut pin = 0u64;
        for f in forks {
            let mk = compute_match_key(f);
            let sources: Vec<SourceOut> = f
                .sources
                .iter()
                .map(|s| SourceOut {
                    bk: s.bookmaker.clone(),
                    bk_label: bk_display_label(&s.bookmaker),
                    team1: s.team1.clone(),
                    team2: s.team2.clone(),
                    bet_link: s.bet_link.clone(),
                    event_name: s.event_name.clone(),
                    team1_en: s.team1_en.clone(),
                    team2_en: s.team2_en.clone(),
                })
                .collect();
            let is_pin = sources
                .iter()
                .any(|s| s.bk.to_lowercase().contains("pinnacle"));
            if is_pin {
                pin += 1;
            }
            let (t1, t2) = f
                .sources
                .first()
                .map(|s| {
                    let t1 = if !s.team1.is_empty() { s.team1.clone() } else { s.team1_en.clone() };
                    let t2 = if !s.team2.is_empty() { s.team2.clone() } else { s.team2_en.clone() };
                    (t1, t2)
                })
                .unwrap_or((String::new(), String::new()));
            let overvalue = f.overvalue();
            // OV должен соответствовать исходам 1:1 (длина == числу типов ставок).
            // Рассинхрон не теряем и не падаем — логируем с примером (AC-2).
            let oc = f.outcome_count();
            if !overvalue.is_empty() && oc != 0 && overvalue.len() != oc {
                // Санитизируем server-provided ST в логе: убираем control-символы и
                // обрезаем длину (защита от log forging/spam через мусорный frame).
                let st_safe: String = f
                    .stake_types
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(80)
                    .collect();
                tracing::warn!(
                    "OV/ST length mismatch on {}: OV={:?} ({} values) vs ST='{}' ({} outcomes)",
                    server, overvalue, overvalue.len(), st_safe, oc
                );
            }
            let (set_number, game_number) = f.tennis_set_game_numbers();
            let out = ForkOut {
                server: server.to_string(),
                last_seen: ts,
                sport: f.sport.clone(),
                profit: f.profit,
                stakes: f.stake_types.clone(),
                market_code: f.market_code.clone(),
                is_live: f.is_live.to_string(),
                score: f.score.clone(),
                event_dt: f.fork_timestamp.clone(),
                match_key: mk,
                team1: t1,
                team2: t2,
                sources,
                overvalue,
                odds: f.odds.clone(),
                alt_count: f.alt_count(),
                market_name: None, // Story 16.51: вычисляется в build_snapshot из текущего кеша
                market_hint: f.market_hint(),
                clone_count: None, // Story 16.53: вычисляется в build_snapshot из clone-map
                match_time: f.match_time.clone(),       // A6
                sport_id: f.inf_sport_id(),              // A3
                inf_event_id: f.inf_event_id(),          // A3
                set_number,
                game_number,
                time_to_start_estimate_secs: f.time_to_start_secs(), // A4
            };
            pooled.push(PooledFork { last_seen: ts, out });
        }
        let mut g = self.servers.lock().unwrap();
        let st = g.entry(server.to_string()).or_default();
        st.frames += 1;
        st.forks_count += pooled.len() as u64;
        st.pin_count += pin;
        st.status = "live".to_string();
        st.updated = ts;
        st.forks.retain(|_, pf| ts - pf.last_seen <= self.ttl_secs);
        for pf in pooled {
            st.forks.insert(compute_dedup_key(&pf.out), pf);
        }
        drop(g);
        self.touch();
    }

    /// Union 12 серверов + dedup по match_key (свежайший побеждает) + matches[].
    pub fn build_snapshot(&self) -> StateSnapshot {
        let now = now_secs();
        let g = self.servers.lock().unwrap();

        // Union + dedup по compute_dedup_key (sport|bks|pair|stakes), свежайший last_seen побеждает.
        let mut merged: HashMap<String, PooledFork> = HashMap::new();
        let mut servers_out: HashMap<String, ServerStat> = HashMap::new();
        let mut total_forks_raw: u64 = 0;

        for (srv, st) in g.iter() {
            servers_out.insert(
                srv.clone(),
                ServerStat {
                    frames: st.frames,
                    forks: st.forks_count,
                    pin: st.pin_count,
                    status: st.status.clone(),
                },
            );
            total_forks_raw += st.forks_count;
            for pf in st.forks.values() {
                // В partial-frame потоке свежесть принадлежит вилке, не серверу:
                // другой рынок на том же сервере не должен продлевать эту вилку.
                if now - pf.last_seen > self.ttl_secs {
                    continue;
                }
                // Дедуп по узкому ключу (sport|bks|pair|stakes), НЕ по match_key —
                // иначе теряются разные исходы/рынки одного матча (CRITICAL-B).
                merged
                    .entry(compute_dedup_key(&pf.out))
                    .and_modify(|e| {
                        if pf.last_seen > e.last_seen {
                            *e = pf.clone();
                        }
                    })
                    .or_insert_with(|| pf.clone());
            }
        }

        let mut forks: Vec<ForkOut> = merged.values().map(|p| p.out.clone()).collect();
        forks.sort_by(|a, b| {
            (&a.match_key, &a.stakes, &a.server)
                .cmp(&(&b.match_key, &b.stakes, &b.server))
        });
        // Story 16.51 (review-fix): market_name пересчитывается ЗДЕСЬ из ТЕКУЩЕГО кеша
        // AddNames, а не при feed — иначе вилка, пришедшая ДО редкого .206-словаря,
        // осталась бы None до след. relay-снапшота. Теперь всегда актуально.
        {
            // lock словарей один раз на весь build (а не на каждую вилку) — review-nit 16.51.
            let names = self.add_names.lock().unwrap();
            let clones = self.clones.lock().unwrap();
            for f in &mut forks {
                let category = f.market_code.split_whitespace().next()
                    .filter(|value| !value.is_empty())
                    .or_else(|| f.stakes.split_whitespace().next());
                f.market_name = category.and_then(|p| names.get(p).cloned());
                // Story 16.53: «+N» = число клон-БК источника вилки (best-effort, source[0]).
                f.clone_count = f.sources.first()
                    .and_then(|s| clones.get(&s.bk.to_lowercase()).copied());
            }
        }
        let total = forks.len();
        let mut pin_count = 0usize;
        let mut live_count = 0usize;
        let mut sport_cnt: HashMap<String, usize> = HashMap::new();
        for f in &forks {
            if f.sources.iter().any(|s| s.bk.to_lowercase().contains("pinnacle")) {
                pin_count += 1;
            }
            if f.is_live != "0" {
                live_count += 1;
            }
            *sport_cnt.entry(f.sport.clone()).or_insert(0) += 1;
        }

        // matches[] aggregation по match_key.
        let mut matches_by_key: HashMap<String, MatchOut> = HashMap::new();
        for f in &forks {
            if f.match_key.is_empty() {
                continue;
            }
            let outcome = OutcomeOut {
                stakes: f.stakes.clone(),
                market_code: f.market_code.clone(),
                profit: f.profit,
                is_live: f.is_live.clone(),
                last_seen: f.last_seen,
                server: f.server.clone(),
                bks: f.sources.iter().map(|s| s.bk.clone()).collect(),
                overvalue: f.overvalue.clone(),
                odds: f.odds.clone(),
                alt_count: f.alt_count,
                market_name: f.market_name.clone(),
                market_hint: f.market_hint.clone(),
                clone_count: f.clone_count,
                match_time: f.match_time.clone(),
                sport_id: f.sport_id.clone(),
                inf_event_id: f.inf_event_id.clone(),
                set_number: f.set_number,
                game_number: f.game_number,
                time_to_start_estimate_secs: f.time_to_start_estimate_secs,
            };
            matches_by_key
                .entry(f.match_key.clone())
                .and_modify(|m| m.outcomes.push(OutcomeOut {
                    stakes: f.stakes.clone(),
                    market_code: f.market_code.clone(),
                    profit: f.profit,
                    is_live: f.is_live.clone(),
                    last_seen: f.last_seen,
                    server: f.server.clone(),
                    bks: f.sources.iter().map(|s| s.bk.clone()).collect(),
                    overvalue: f.overvalue.clone(),
                    odds: f.odds.clone(),
                    alt_count: f.alt_count,
                    market_name: f.market_name.clone(),
                    market_hint: f.market_hint.clone(),
                    clone_count: f.clone_count,
                    match_time: f.match_time.clone(),
                    sport_id: f.sport_id.clone(),
                    inf_event_id: f.inf_event_id.clone(),
                    set_number: f.set_number,
                    game_number: f.game_number,
                    time_to_start_estimate_secs: f.time_to_start_estimate_secs,
                }))
                .or_insert_with(|| MatchOut {
                    match_key: f.match_key.clone(),
                    sport: f.sport.clone(),
                    team1: f.team1.clone(),
                    team2: f.team2.clone(),
                    event_dt: f.event_dt.clone(),
                    is_live: f.is_live.clone(),
                    outcomes: vec![outcome],
                });
        }
        let mut matches: Vec<MatchOut> = matches_by_key.into_values().collect();
        for m in &mut matches {
            m.outcomes.sort_by(|a, b| {
                b.profit
                    .partial_cmp(&a.profit)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| a.stakes.cmp(&b.stakes))
                    .then_with(|| a.server.cmp(&b.server))
            });
        }
        matches.sort_by(|a, b| a.match_key.cmp(&b.match_key));
        let matches_total = matches.len();
        let outcomes_counts: Vec<usize> = matches.iter().map(|m| m.outcomes.len()).collect();
        let multi_outcome_matches = outcomes_counts.iter().filter(|&&n| n > 1).count();
        let sum_outcomes: usize = outcomes_counts.iter().sum();
        let avg_outcomes = if matches_total > 0 { sum_outcomes as f64 / matches_total as f64 } else { 0.0 };
        let max_outcomes = outcomes_counts.iter().copied().max().unwrap_or(0);
        let multi_ratio = if matches_total > 0 { multi_outcome_matches as f64 / matches_total as f64 } else { 0.0 };

        let runtime = (now - self.start_ts) as u64;
        let rate = total_forks_raw as f64 / runtime.max(1) as f64;

        let mut sport_counts: Vec<SportCount> = sport_cnt
            .into_iter()
            .map(|(sport, count)| SportCount { sport, count })
            .collect();
        sport_counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.sport.cmp(&b.sport)));

        StateSnapshot {
            stats: Stats {
                total,
                pin: pin_count,
                live: live_count,
                pre: total - live_count,
                rate,
                runtime,
                matches_total,
                avg_outcomes_per_match: (avg_outcomes * 1000.0).round() / 1000.0,
                max_outcomes_per_match: max_outcomes,
                multi_outcome_matches,
                multi_outcome_ratio: (multi_ratio * 1000.0).round() / 1000.0,
            },
            servers: servers_out,
            sport_counts,
            forks,
            matches,
            bk_status: self.bk_status.lock().unwrap().clone(),
            dictionaries: Dictionaries {
                add_names: self.add_names.lock().unwrap().clone(),
                bet_names: self.bet_names.lock().unwrap().clone(),
                bet_equals: self.bet_equals.lock().unwrap().clone(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::{Fork, ForkSource};

    fn mk_source(bk: &str) -> ForkSource {
        ForkSource {
            bookmaker: bk.into(),
            event_name: String::new(),
            team1: "Alpha".into(),
            team2: "Beta".into(),
            team1_en: String::new(),
            team2_en: String::new(),
            match_date: String::new(),
            bet_link: String::new(),
            source_hash: String::new(),
        }
    }

    fn mk_fork(stakes: &str, bk1: &str, bk2: &str) -> Fork {
        Fork {
            sport: "Football".into(),
            profit: 1.0,
            fork_timestamp: String::new(),
            is_live: 0,
            stake_types: stakes.into(),
            market_code: String::new(),
            fork_number: String::new(),
            filter_id: String::new(),
            score: String::new(),
            match_time: String::new(),
            event_id: String::new(),
            event_hash: String::new(),
            num_sources: 2,
            dd_hash: String::new(),
            inf: String::new(),
            lif: String::new(),
            login_url: String::new(),
            ov: String::new(),
            al: String::new(),
            odds: Vec::new(),
            sources: vec![mk_source(bk1), mk_source(bk2)],
        }
    }

    /// CRITICAL-B регрессия: один матч с разными stake_types НЕ должен схлопываться
    /// в один fork — matches[].outcomes обязан быть >1 (multi-outcome Story 16.28/29).
    #[test]
    fn multi_outcome_not_collapsed() {
        let pool = ForkPool::new(30.0);
        let forks = vec![
            mk_fork("1X2:W1", "pinnacle", "vbet"),
            mk_fork("TOTAL:O2.5", "pinnacle", "vbet"),
        ];
        pool.feed_server_snapshot("srv1", &forks);
        let snap = pool.build_snapshot();
        assert_eq!(snap.forks.len(), 2, "разные stakes не должны схлопываться в один fork");
        assert_eq!(snap.matches.len(), 1, "оба исхода — один match_key");
        assert_eq!(snap.matches[0].outcomes.len(), 2, "matches[].outcomes должно быть 2");
        assert_eq!(snap.stats.multi_outcome_matches, 1);
    }

    /// Story 16.45: overvalue (OV) доходит до ForkOut и matches[].outcomes;
    /// рассинхрон длины OV/ST не теряет данные и не паникует.
    #[test]
    fn overvalue_propagates_to_snapshot() {
        let pool = ForkPool::new(30.0);
        let mut f = mk_fork("1;2", "pinnacle", "vbet");
        f.ov = "1;22".into(); // как на скрине: VBet 1%, Pinnacle 22%
        // mismatch-кейс: 3 значения OV против 2 исходов — данные сохраняются как есть
        let mut f2 = mk_fork("ТМ(2,5);ТБ(2,5)", "pinnacle", "vbet");
        f2.ov = "5;10;15".into();
        pool.feed_server_snapshot("srv1", &[f, f2]);
        let snap = pool.build_snapshot();
        let fork = snap.forks.iter().find(|x| x.stakes == "1;2").unwrap();
        assert_eq!(fork.overvalue, vec![1, 22], "OV должен пройти в ForkOut");
        let mism = snap.forks.iter().find(|x| x.stakes == "ТМ(2,5);ТБ(2,5)").unwrap();
        assert_eq!(mism.overvalue, vec![5, 10, 15], "рассинхрон не теряет значения");
        // matches[].outcomes тоже несут overvalue
        let has_ov = snap.matches.iter().flat_map(|m| &m.outcomes).any(|o| o.overvalue == vec![1, 22]);
        assert!(has_ov, "overvalue должен быть в matches[].outcomes");
    }

    /// Story 16.46: SSE-shape — odds сериализуются в forks[] и matches[].outcomes[],
    /// overvalue (16.45) и старые поля сохранены (additive, consumer-api-stability).
    #[test]
    fn odds_and_overvalue_in_sse_json() {
        let pool = ForkPool::new(30.0);
        let mut f = mk_fork("1;2", "pinnaclesports.com", "vbet");
        f.ov = "9;0".into();
        f.odds = vec![2.23_f32, 1.45_f32];
        pool.feed_server_snapshot("srv1", &[f]);
        let snap = pool.build_snapshot();
        let json = serde_json::to_string(&snap).expect("snapshot сериализуется");
        // Новые additive-поля присутствуют
        assert!(json.contains("\"odds\""), "forks[] должен содержать odds");
        assert!(json.contains("\"overvalue\""), "overvalue (16.45) сохранён");
        // Старые контрактные поля целы
        for field in ["\"stakes\"", "\"profit\"", "\"sources\"", "\"match_key\"", "\"outcomes\""] {
            assert!(json.contains(field), "старое поле {} не должно исчезнуть", field);
        }
        // Значения odds дошли в ForkOut и matches[].outcomes[]
        let fork = snap.forks.iter().find(|x| x.stakes == "1;2").unwrap();
        assert_eq!(fork.odds, vec![2.23_f32, 1.45_f32]);
        let has = snap.matches.iter().flat_map(|m| &m.outcomes).any(|o| o.odds == vec![2.23_f32, 1.45_f32]);
        assert!(has, "odds должны быть в matches[].outcomes[]");
    }

    /// Story 16.51: stakes аннотируются именем категории рынка из кеша AddNames.
    #[test]
    fn market_name_annotation_from_add_names() {
        use crate::parser::DictEntry;
        let pool = ForkPool::new(30.0);
        pool.update_add_names(&[
            DictEntry { key: "УГЛ".into(), value: "Угловые, весь матч".into() },
        ]);
        let corner = mk_fork("УГЛ ИТ2М(3,5)", "pinnaclesports.com", "vbet");
        let plain = mk_fork("Ф1(1,5);Ф2(-1,5)", "pinnaclesports.com", "vbet");
        pool.feed_server_snapshot("srv1", &[corner, plain]);
        let snap = pool.build_snapshot();
        let c = snap.forks.iter().find(|x| x.stakes.starts_with("УГЛ")).unwrap();
        assert_eq!(c.market_name.as_deref(), Some("Угловые, весь матч"));
        let p = snap.forks.iter().find(|x| x.stakes.starts_with("Ф1")).unwrap();
        assert_eq!(p.market_name, None, "без словарного префикса → None");
    }

    /// Story 16.51 (review-fix): словарь, пришедший ПОСЛЕ вилки, аннотирует её
    /// при следующем build_snapshot (market_name считается в build, не в feed).
    #[test]
    fn market_name_backfills_late_add_names() {
        use crate::parser::DictEntry;
        let pool = ForkPool::new(30.0);
        // вилка пришла ДО словаря
        pool.feed_server_snapshot("srv1", &[mk_fork("УГЛ ТМ(8,5)", "pinnaclesports.com", "vbet")]);
        assert_eq!(pool.build_snapshot().forks[0].market_name, None);
        // словарь пришёл позже (.206)
        pool.update_add_names(&[DictEntry { key: "УГЛ".into(), value: "Угловые".into() }]);
        // тот же снапшот теперь аннотирован
        assert_eq!(
            pool.build_snapshot().forks[0].market_name.as_deref(),
            Some("Угловые"),
            "late AddNames должен backfill-ить market_name при build"
        );
    }

    /// Story 16.53: clone_count = число клон-БК источника вилки (из data?t=Clones).
    #[test]
    fn clone_count_from_clones_map() {
        let pool = ForkPool::new(30.0);
        pool.load_clones(
            "vivarobet.com,rubet.com,Rubet,netbet.com,Netbet,olybet.eu,Olybet,efbet.net,Efbet,vbet.am,VBet\n\
             12bet.com,dafabet.com,Dafabet,mansion88.com,M88",
        );
        // vivarobet группа = 6 доменов → 5 сиблингов
        let f = mk_fork("П1;П2", "vivarobet.com", "pinnaclesports.com");
        // bk не в clone-map
        let f2 = mk_fork("П1;П2", "someunknownbk.com", "pinnaclesports.com");
        pool.feed_server_snapshot("srv1", &[f, f2]);
        let snap = pool.build_snapshot();
        let viva = snap.forks.iter().find(|x| x.sources[0].bk == "vivarobet.com").unwrap();
        assert_eq!(viva.clone_count, Some(5), "vivarobet: 5 клон-сиблингов");
        let unk = snap.forks.iter().find(|x| x.sources[0].bk == "someunknownbk.com").unwrap();
        assert_eq!(unk.clone_count, None, "БК не в clone-map → None");
        // 12bet группа = 3 домена (12bet.com, dafabet.com, mansion88.com) → 2 сиблинга
        let f3 = mk_fork("П1;П2", "dafabet.com", "pinnaclesports.com");
        pool.feed_server_snapshot("srv2", &[f3]);
        let snap2 = pool.build_snapshot();
        let daf = snap2.forks.iter().find(|x| x.sources[0].bk == "dafabet.com").unwrap();
        assert_eq!(daf.clone_count, Some(2), "dafabet (клон 12bet): 2 сиблинга");
    }

    /// Story 16.58 (A1-A7): новые поля доходят до snapshot.
    #[test]
    fn group_a_fields_in_snapshot() {
        use crate::parser::{DictEntry, BookmakerStatus};
        let pool = ForkPool::new(30.0);
        let mut f = mk_fork("1;2", "pinnaclesports.com", "vbet");
        f.sources[0].event_name = "Football - Brazilian Serie A".into(); // A2
        f.sources[0].team1_en = "Cruzeiro".into();                       // A1
        f.inf = "0#/Tennis/33/271036/1631581426$0$6778044316$0$$".into(); // A3
        f.lif = "1;28;55".into();                                         // A4
        f.match_time = "01.06.2026 21:45:00".into();                      // A6
        pool.update_bet_dicts(&[DictEntry { key: "1".into(), value: "Победа первой".into() }], &[]); // A7
        pool.update_bk_status(&[BookmakerStatus {                         // A5
            domain: "betcity.ru".into(), name: "BetCity".into(), active: true,
            commission: "0".into(), last_update: "".into(), currency: "".into(), online: false,
        }]);
        pool.feed_server_snapshot("srv1", &[f]);
        let snap = pool.build_snapshot();
        let fk = &snap.forks[0];
        assert_eq!(fk.match_time, "01.06.2026 21:45:00");              // A6
        assert_eq!(fk.sport_id.as_deref(), Some("33"));               // A3
        assert_eq!(fk.inf_event_id.as_deref(), Some("6778044316"));   // A3
        assert_eq!(fk.time_to_start_estimate_secs, Some(3600 + 28 * 60 + 55)); // A4
        assert_eq!(fk.sources[0].event_name, "Football - Brazilian Serie A"); // A2
        assert_eq!(fk.sources[0].team1_en, "Cruzeiro");               // A1
        assert_eq!(snap.bk_status.get("betcity.ru"), Some(&false));   // A5
        assert_eq!(snap.dictionaries.bet_names.get("1").map(|s| s.as_str()), Some("Победа первой")); // A7
    }

    #[test]
    fn tennis_child_coordinates_reach_forks_and_outcomes() {
        let pool = ForkPool::new(30.0);
        let mut f = mk_fork("гейм 8 П1;гейм 8 П2", "pinnaclesports.com", "vbet");
        f.inf = "Game Winner**Set 1 Game 8 Winner / Player**Player$0$13#/&//Tennis/33/226801/1632494715$0$$".into();
        pool.feed_server_snapshot("srv1", &[f]);
        let snap = pool.build_snapshot();
        assert_eq!(snap.forks[0].set_number, Some(1));
        assert_eq!(snap.forks[0].game_number, Some(8));
        assert_eq!(snap.matches[0].outcomes[0].set_number, Some(1));
        assert_eq!(snap.matches[0].outcomes[0].game_number, Some(8));
    }

    /// Идентичные вилки (тот же sport|bks|pair|stakes) дедупаются до одной.
    #[test]
    fn identical_forks_deduped() {
        let pool = ForkPool::new(30.0);
        let forks = vec![
            mk_fork("1X2:W1", "pinnacle", "vbet"),
            mk_fork("1X2:W1", "pinnacle", "vbet"),
        ];
        pool.feed_server_snapshot("srv1", &forks);
        let snap = pool.build_snapshot();
        assert_eq!(snap.forks.len(), 1, "идентичные вилки должны схлопнуться в одну");
        assert_eq!(snap.matches[0].outcomes.len(), 1);
    }

    /// Регрессия мигания: соседние frame одного relay содержат разные рынки и
    /// должны объединяться, а не стирать друг друга.
    #[test]
    fn partial_frames_from_same_server_are_merged() {
        let pool = ForkPool::new(30.0);
        pool.feed_server_snapshot(
            "srv1",
            &[mk_fork("1X2:W1", "pinnaclesports.com", "paddypower.com")],
        );
        pool.feed_server_snapshot(
            "srv1",
            &[mk_fork("TOTAL:O2.5", "pinnaclesports.com", "paddypower.com")],
        );

        let snap = pool.build_snapshot();
        assert_eq!(snap.forks.len(), 2, "partial frame не должен стирать предыдущий рынок");
    }

    #[test]
    fn empty_partial_frame_does_not_clear_current_forks() {
        let pool = ForkPool::new(30.0);
        pool.feed_server_snapshot(
            "srv1",
            &[mk_fork("1X2:W1", "pinnaclesports.com", "paddypower.com")],
        );
        pool.feed_server_snapshot("srv1", &[]);

        assert_eq!(pool.build_snapshot().forks.len(), 1);
    }

    #[test]
    fn repeated_fork_replaces_price_and_profit() {
        let pool = ForkPool::new(30.0);
        let first = mk_fork("1X2:W1", "pinnaclesports.com", "paddypower.com");
        pool.feed_server_snapshot("srv1", &[first]);
        let mut updated = mk_fork("1X2:W1", "pinnaclesports.com", "paddypower.com");
        updated.profit = 7.25;
        updated.odds = vec![2.1, 2.2];
        pool.feed_server_snapshot("srv1", &[updated]);

        let snap = pool.build_snapshot();
        assert_eq!(snap.forks.len(), 1);
        assert_eq!(snap.forks[0].profit, 7.25);
        assert_eq!(snap.forks[0].odds, vec![2.1, 2.2]);
    }

    #[test]
    fn fork_ttl_is_independent_from_server_activity() {
        let pool = ForkPool::new(30.0);
        pool.feed_server_snapshot(
            "srv1",
            &[mk_fork("1X2:W1", "pinnaclesports.com", "paddypower.com")],
        );
        {
            let mut servers = pool.servers.lock().unwrap();
            let state = servers.get_mut("srv1").unwrap();
            let stored = state.forks.values_mut().next().unwrap();
            stored.last_seen = now_secs() - 31.0;
            stored.out.last_seen = stored.last_seen;
            state.updated = now_secs();
        }

        assert!(pool.build_snapshot().forks.is_empty(), "старую вилку не продлевает свежий server status");
    }

    #[test]
    fn test_bk_display_label_dafabet_alias() {
        // Story 16.60: 12bet.com на проводе = «Dafabet» в UI Forted.
        assert_eq!(bk_display_label("12bet.com"), "12bet.com (Dafabet)");
        assert_eq!(bk_display_label("12BET.COM"), "12bet.com (Dafabet)"); // case-insensitive
        // Домены без алиаса — пустой лейбл (SSE-поле скрывается).
        assert_eq!(bk_display_label("bc.game"), "");
        assert_eq!(bk_display_label("pinnaclesports.com"), "");
    }

    #[test]
    fn test_source_out_includes_bk_label_for_dafabet() {
        // bk остаётся сырым доменом (фильтрация consumer'а цела), bk_label — additive.
        let pool = ForkPool::new(30.0);
        pool.feed_server_snapshot("srv1", &[mk_fork("1X2:W1", "pinnaclesports.com", "12bet.com")]);
        let snap = pool.build_snapshot();
        let src = snap.forks[0]
            .sources
            .iter()
            .find(|s| s.bk == "12bet.com")
            .expect("12bet.com source present");
        assert_eq!(src.bk, "12bet.com", "сырой домен не меняется");
        assert_eq!(src.bk_label, "12bet.com (Dafabet)");
    }
}
