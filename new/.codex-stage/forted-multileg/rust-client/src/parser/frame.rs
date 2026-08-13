#![allow(clippy::all, clippy::pedantic)]

use serde::Serialize;

const SEP: char = '\u{00AE}'; // ® separator
const DICT_SEP: char = '\u{00A9}'; // © separator for dictionaries

#[derive(Debug, Serialize, Clone)]
pub struct ParsedFrame {
    pub timestamp: String,
    pub bookmakers: Vec<BookmakerStatus>,
    pub forks: Vec<Fork>,
    pub reference_data: Option<ReferenceData>,
    pub license_info: Option<LicenseInfo>,
    pub line_count: usize,
    pub decoded_size: usize,
    pub frame_type: FrameType,
}

impl ParsedFrame {
    /// Only frames carrying at least one `SB=` block are confirmed fork
    /// snapshots. Some Forted servers send bookmaker-status frames without
    /// the legacy `®zero` marker; those parse as Relay but must not clear the
    /// last fork snapshot. ForkPool TTL handles a server that stops sending
    /// confirmed fork snapshots altogether.
    pub fn is_fork_snapshot(&self) -> bool {
        self.frame_type == FrameType::Relay && !self.forks.is_empty()
    }
}

/// Distinguishes DE relay frames (with forks) from RU prematch frames (BK status only).
#[derive(Debug, Serialize, Clone, PartialEq)]
pub enum FrameType {
    /// DE relay: contains forks + optionally BK status
    Relay,
    /// RU prematch: BK status + license, no forks (header ends with ®zero)
    BkStatus,
    /// Unknown/empty frame
    Unknown,
}

/// License/session info from RU prematch servers (line 69 of BK status frames).
#[derive(Debug, Serialize, Clone)]
pub struct LicenseInfo {
    pub raw_line: String,
    pub registration_date: String,
    pub prematch_expiry: String,
    pub live_expiry: String,
    pub license_flags: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Fork {
    pub sport: String,
    pub profit: f64,
    pub fork_timestamp: String,
    pub is_live: u8,
    pub stake_types: String,
    /// Raw market category/period code from `SB=` parts[25] (for example
    /// `1т`, `1п`, `1с`, or `УГЛ 1т`).
    pub market_code: String,
    pub fork_number: String,
    pub filter_id: String,
    pub score: String,
    pub match_time: String,
    pub event_id: String,
    pub event_hash: String,
    pub num_sources: u8,
    pub dd_hash: String,
    pub inf: String,
    pub lif: String,
    pub login_url: String,
    pub ov: String,
    /// Сырое поле `AL=` (`event_id;alt_count;related_event_id`) — альтернативные линии
    /// группы исходов (Story 16.47/16.50). См. [`Fork::alt_count`]. НЕ «+N» counter.
    pub al: String,
    /// Реальные котировочные decimal-коэффициенты по исходам из непрерывного
    /// блока SB=, начиная с Rust parts[9]. Десятичный разделитель — запятая.
    /// All-or-nothing: минимум два валидных значения (>1.0), иначе пусто.
    pub odds: Vec<f32>,
    pub sources: Vec<ForkSource>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ForkSource {
    pub bookmaker: String,
    pub event_name: String,
    pub team1: String,
    pub team2: String,
    pub team1_en: String,
    pub team2_en: String,
    pub match_date: String,
    pub bet_link: String,
    pub source_hash: String,
}

/// Парсит реальные decimal-коэффициенты исходов из полей `SB=` (Rust-индексация
/// после среза ведущего `;`): `parts[9]`=odds_0, `parts[10]`=odds_1. Десятичный
/// разделитель — запятая ("1,02"→1.02). `parts[9]` (Python: parts[10]) и `parts[11]`
/// (Python) — НЕ путать с `parts[9]`(Python)="1" (плейсхолдер, не коэф).
///
/// Коэффициенты идут подряд и заканчиваются пустым/нечисловым полем. Это доказано
/// реальным трёхплечевым кадром `Ф1(-0,25);X;2`, где parts[9..12] равны
/// `1,934;4,2;3,4`. Не ограничиваем массив двумя значениями: иначе downstream
/// превращает настоящую трёхплечевую вилку в опасную псевдопару.
///
/// Подтверждено эмпирически (67/67 forks): surebet-формула из этих коэфов даёт
/// frame profit точно. См. [`surebet_profit`].
pub fn parse_sb_odds(parts: &[&str]) -> Vec<f32> {
    let mut odds = Vec::new();
    for raw in parts.iter().skip(9) {
        let parsed = raw.trim().replace(',', ".").parse::<f32>().ok();
        match parsed {
            Some(value) if value.is_finite() && value > 1.0 => odds.push(value),
            _ => break,
        }
    }
    (odds.len() >= 2).then_some(odds).unwrap_or_default()
}

/// Арбитражная (surebet) маржа в процентах из двух decimal-коэффициентов:
/// `profit% = (1 / (1/o0 + 1/o1) − 1) × 100`. Отрицательна для коридоров/value.
/// Используется как sanity-инвариант парсинга odds (Story 16.46).
pub fn surebet_profit(o0: f32, o1: f32) -> f64 {
    let (o0, o1) = (o0 as f64, o1 as f64);
    (1.0 / (1.0 / o0 + 1.0 / o1) - 1.0) * 100.0
}

/// Парсит сырое поле `OV=` в массив целых per-outcome.
///
/// Поле фрейма `OV=` — целые, по одному на исход (длина обычно == числу элементов
/// в `ST=`). Значение приходит ГОТОВЫМ С СЕРВЕРА (RE Forted.exe: `DeserializeSurebet`
/// пишет `Outcome.OvervalueLevel`, `RecalcPercent` не пересчитывает); в нативном
/// клиенте показывается строкой «Завышенность: N%». Бывает отрицательным (undervalue).
///
/// **All-or-nothing семантика (Story 16.45, фикс GPT-5.5 review):** индекс значения
/// = индексу исхода. Если ХОТЯ БЫ один токен битый — вернуть пустой `Vec`, а не
/// выкидывать токен молча: иначе оставшиеся значения сдвигаются и привязываются к
/// чужим исходам. Завершающий `;` (пустой хвост) допустим и игнорируется.
pub fn parse_overvalue(ov: &str) -> Vec<i32> {
    let s = ov.trim().trim_end_matches(';');
    if s.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    for tok in s.split(';') {
        match tok.trim().parse::<i32>() {
            Ok(v) => out.push(v),
            // битый токен → весь массив отбрасываем (сохранность индексов)
            Err(_) => return Vec::new(),
        }
    }
    out
}

impl Fork {
    /// "Завышенность" (Overvalue) по каждому исходу вилки. См. [`parse_overvalue`].
    pub fn overvalue(&self) -> Vec<i32> {
        parse_overvalue(&self.ov)
    }

    /// Story 16.58 (A3): из `INF=` формата A (`0#/Sport/sport_id/sub/line$0$event_id$0$$`)
    /// возвращает (sport_id, inf_event_id). sport_id — путь[2] (после `0#`/Sport).
    /// inf_event_id — число между `$0$`...`$0$`. NB: источник event_id НЕ подтверждён
    /// (вероятно Forted/Pinnacle-внутренний, НЕ id soft-БК — его bet-link id отдельный). None если формат иной.
    pub fn inf_sport_id(&self) -> Option<String> {
        if !self.inf.starts_with("0#/") { return None; }
        let path: Vec<&str> = self.inf.split('$').next()?.split('/').collect();
        // ["0#","Sport","sport_id","sub","line"]; sport_id всегда числовой (напр. 33) →
        // валидируем (симметрично inf_event_id), чтобы не вернуть market-токен формата B.
        path.get(2)
            .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
            .map(|s| s.to_string())
    }
    pub fn inf_event_id(&self) -> Option<String> {
        // between first "$0$" and following "$0$"
        let parts: Vec<&str> = self.inf.split("$0$").collect();
        // ["0#/.../line", "<event_id>", "", ""] → event_id = parts[1]
        parts.get(1)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
            .map(|s| s.to_string())
    }

    /// Exact tennis child-market coordinates recovered from `INF=`.
    ///
    /// Live frames carry variants such as:
    /// `Game Winner**Set 1 Game 8 Winner / Player**...` and
    /// `...$0$Set 2 Game 5 Winner**Player$0$$`.  `ST=` contains only the
    /// game number (`гейм 8 П1;гейм 8 П2`), so the set must come from INF;
    /// guessing it would verify/place a different BIA market.
    pub fn tennis_set_game_numbers(&self) -> (Option<i32>, Option<i32>) {
        fn number_after(text: &str, marker: &str) -> Option<i32> {
            let lower = text.to_lowercase();
            let start = lower.find(marker)? + marker.len();
            let digits: String = lower[start..]
                .chars()
                .skip_while(|c| c.is_whitespace())
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if digits.is_empty() {
                None
            } else {
                digits.parse::<i32>().ok().filter(|n| *n > 0)
            }
        }

        let set_number = number_after(&self.inf, "set ");
        let game_number = number_after(&self.inf, "game ")
            .or_else(|| number_after(&self.stake_types, "game "))
            .or_else(|| number_after(&self.stake_types, "гейм "));
        (set_number, game_number)
    }

    /// Best-effort market/period description carried inside `INF=`.
    ///
    /// Forted often uses the same short `ST=` value for full-match and child
    /// markets.  Some bookmaker adapters preserve the missing coordinates in
    /// a human-readable or key/value fragment of `INF=`.  Return only that
    /// fragment; numeric event paths and opaque identifiers are deliberately
    /// excluded from the API.
    pub fn market_hint(&self) -> Option<String> {
        const KEYWORDS: &[&str] = &[
            "period=", "winner", "result", "handicap", "spread", "total",
            "money line", "moneyline", "draw no bet", "double chance",
            "half", "quarter", "set ", "game ", "inning", "corner", "card",
        ];
        self.inf
            .split("$0$")
            .map(|part| part.trim_matches(|c: char| c == '$' || c.is_whitespace()))
            .filter(|part| !part.is_empty())
            .find_map(|part| {
                let lower = part.to_lowercase();
                if !KEYWORDS.iter().any(|keyword| lower.contains(keyword)) {
                    return None;
                }
                let clean: String = part
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(320)
                    .collect();
                (!clean.is_empty()).then_some(clean)
            })
    }

    /// Story 16.58 (A4): `LIF=` (`h;m;s`) → оценка остатка времени до старта в секундах.
    /// **Оценка** (см. FORTED_INF_LIF_DECODE.md): prematch → реальный отсчёт; live → ~0.
    /// None если формат не h;m;s или все нули недоступны.
    pub fn time_to_start_secs(&self) -> Option<i32> {
        let p: Vec<&str> = self.lif.split(';').collect();
        if p.len() < 3 { return None; }
        let h: i32 = p[0].trim().parse().ok()?;
        let m: i32 = p[1].trim().parse().ok()?;
        let s: i32 = p[2].trim().parse().ok()?;
        Some(h * 3600 + m * 60 + s)
    }

    /// Счётчик альтернативных линий из `AL=` (`event_id;alt_count;related_event_id`):
    /// средний элемент. `None` если AL= пустой/битый/нет среднего элемента (Story 16.50).
    /// NB: это НЕ «+N»/AlsoCount counter (тот считается client-side, Story 16.49).
    pub fn alt_count(&self) -> Option<i32> {
        self.al.split(';').nth(1).and_then(|s| s.trim().parse::<i32>().ok())
    }

    /// Число исходов вилки по `ST=` (типы ставок через `;`).
    /// Используется для сверки длины с `overvalue()`. Завершающий `;` игнорируется
    /// (симметрично [`parse_overvalue`]) — иначе ложный warn о рассинхроне.
    pub fn outcome_count(&self) -> usize {
        let s = self.stake_types.trim().trim_end_matches(';');
        if s.is_empty() {
            return 0;
        }
        s.split(';').count()
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct BookmakerStatus {
    pub domain: String,
    pub name: String,
    pub active: bool,
    pub commission: String,
    pub last_update: String,
    pub currency: String,
    pub online: bool,
}

/// Reference data from RU servers (dictionaries + BK metadata)
#[derive(Debug, Serialize, Clone)]
pub struct ReferenceData {
    pub add_names: Vec<DictEntry>,
    pub bet_names: Vec<DictEntry>,
    pub bet_equals: Vec<DictEntry>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DictEntry {
    pub key: String,
    pub value: String,
}

impl ReferenceData {
    pub fn new() -> Self {
        Self { add_names: Vec::new(), bet_names: Vec::new(), bet_equals: Vec::new() }
    }

    pub fn is_empty(&self) -> bool {
        self.add_names.is_empty() && self.bet_names.is_empty() && self.bet_equals.is_empty()
    }
}

/// Parse a ©-separated dictionary string into key-value pairs
fn parse_dict(val: &str) -> Vec<DictEntry> {
    let parts: Vec<&str> = val.split(DICT_SEP).collect();
    let mut entries = Vec::new();
    let mut i = 0;
    while i + 1 < parts.len() {
        let key = parts[i].trim().to_string();
        let value = parts[i + 1].trim().to_string();
        if !key.is_empty() || !value.is_empty() {
            entries.push(DictEntry { key, value });
        }
        i += 2;
    }
    entries
}

pub fn parse_frame(text: &str) -> ParsedFrame {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let line_count = lines.len();

    let mut result = ParsedFrame {
        timestamp: String::new(),
        bookmakers: Vec::new(),
        forks: Vec::new(),
        reference_data: None,
        license_info: None,
        line_count,
        decoded_size: text.len(),
        frame_type: FrameType::Unknown,
    };

    let mut current_fork: Option<Fork> = None;
    let mut ref_data = ReferenceData::new();
    let mut _is_bk_status_frame = false;

    for line in &lines {
        let clean = line.trim().trim_start_matches(SEP);

        if clean.starts_with("surebets") {
            let parts: Vec<&str> = clean.split(SEP).collect();
            if parts.len() >= 2 {
                result.timestamp = parts[1].to_string();
            }
            // Detect RU prematch BK-status-only frames: "surebets®timestamp®zero"
            if parts.len() >= 3 && parts[2] == "zero" {
                _is_bk_status_frame = true;
                result.frame_type = FrameType::BkStatus;
            } else {
                result.frame_type = FrameType::Relay;
            }
        // License info line: starts with ® and contains registration/expiry dates
        } else if clean.starts_with("0") && clean.contains("True") && clean.contains(SEP) {
            // License line format: 0®True®reg_date®prematch_expiry®live_expiry®...
            let parts: Vec<&str> = clean.split(SEP).collect();
            if parts.len() >= 5 {
                result.license_info = Some(LicenseInfo {
                    raw_line: clean.to_string(),
                    registration_date: parts.get(2).copied().unwrap_or("").to_string(),
                    prematch_expiry: parts.get(3).copied().unwrap_or("").to_string(),
                    live_expiry: parts.get(4).copied().unwrap_or("").to_string(),
                    license_flags: parts.iter().skip(5).cloned().collect::<Vec<&str>>().join("®"),
                });
            }
        } else if clean.starts_with("SB=") {
            if let Some(fork) = current_fork.take() {
                result.forks.push(fork);
            }

            let raw = clean.trim_start_matches("SB=").trim_start_matches(';');
            let parts: Vec<&str> = raw.split(';').collect();

            let sport = parts.first().copied().unwrap_or("").to_string();
            let profit = parts.get(1)
                .and_then(|s| s.replace(',', ".").parse::<f64>().ok())
                .unwrap_or(0.0);
            let fork_ts = parts.get(2).copied().unwrap_or("").to_string();
            let is_live = parts.get(3)
                .and_then(|s| s.parse::<u8>().ok())
                .unwrap_or(0);
            // Story 16.48: SB= parts[8] — константа "1" (плейсхолдер), НЕ счётчик
            // источников (подтверждено: parts[8]=='1' во всех дампах; ни [7], ни [8] не
            // кодируют надёжно число S=). Реальное num_sources = sources.len(),
            // выставляется в пост-обработке после парсинга всех S=-строк (ниже).
            let event_id = parts.get(15).copied().unwrap_or("").to_string();
            let event_hash = parts.get(17).copied().unwrap_or("").to_string();
            let market_code = parts.get(25).copied().unwrap_or("").trim().to_string();
            // Story 16.46: реальные decimal-коэффициенты исходов из SB= parts[9]/[10].
            let odds = parse_sb_odds(&parts);

            current_fork = Some(Fork {
                sport,
                profit,
                fork_timestamp: fork_ts,
                is_live,
                stake_types: String::new(),
                market_code,
                fork_number: String::new(),
                filter_id: String::new(),
                score: String::new(),
                match_time: String::new(),
                event_id,
                event_hash,
                num_sources: 0, // Story 16.48: реальное значение = sources.len(), ставится в пост-обработке
                dd_hash: String::new(),
                inf: String::new(),
                lif: String::new(),
                login_url: String::new(),
                ov: String::new(),
                al: String::new(),
                odds,
                sources: Vec::new(),
            });
        // Reference data dictionaries (RU server .206)
        } else if clean.starts_with("AddNames=") {
            ref_data.add_names = parse_dict(clean.trim_start_matches("AddNames="));
        } else if clean.starts_with("BetNames=") {
            ref_data.bet_names = parse_dict(clean.trim_start_matches("BetNames="));
        } else if clean.starts_with("BetEquals=") {
            ref_data.bet_equals = parse_dict(clean.trim_start_matches("BetEquals="));
        } else if let Some(eq_pos) = clean.find('=') {
            let key = &clean[..eq_pos];
            let val = &clean[eq_pos + 1..];

            if let Some(ref mut fork) = current_fork {
                match key {
                    "ST" => fork.stake_types = val.to_string(),
                    "FNUM" => fork.fork_number = val.to_string(),
                    "FID" => fork.filter_id = val.to_string(),
                    "SC" => fork.score = val.to_string(),
                    "TIM" => fork.match_time = val.to_string(),
                    "DD" => fork.dd_hash = val.to_string(),
                    "INF" => fork.inf = val.to_string(),
                    "LIF" => fork.lif = val.to_string(),
                    "L" => fork.login_url = val.to_string(),
                    "OV" => fork.ov = val.to_string(),
                    "AL" => fork.al = val.to_string(),
                    "MOBL" => {
                        if let Some(src) = fork.sources.last_mut() {
                            src.bet_link = val.to_string();
                        }
                    }
                    _ if key.starts_with('S') && key.len() <= 2 => {
                        let parts: Vec<&str> = val.trim_end_matches(';').split(';').collect();
                        fork.sources.push(ForkSource {
                            event_name: parts.first().copied().unwrap_or("").to_string(),
                            bookmaker: parts.get(1).copied().unwrap_or("").to_string(),
                            team1: String::new(),
                            team2: String::new(),
                            team1_en: String::new(),
                            team2_en: String::new(),
                            match_date: String::new(),
                            bet_link: String::new(),
                            source_hash: String::new(),
                        });
                    }
                    _ if key.starts_with('M') && key.len() <= 2 => {
                        if let Some(src) = fork.sources.last_mut() {
                            let parts: Vec<&str> = val.split(';').collect();
                            // M=team1_ru;team2_ru;date;team1_en;team2_en;bool;hash
                            src.team1 = parts.first().copied().unwrap_or("").to_string();
                            src.team2 = parts.get(1).copied().unwrap_or("").to_string();
                            src.match_date = parts.get(2).copied().unwrap_or("").to_string();
                            src.team1_en = parts.get(3).copied().unwrap_or("").to_string();
                            src.team2_en = parts.get(4).copied().unwrap_or("").to_string();
                            src.source_hash = parts.get(6).copied().unwrap_or("").to_string();
                        }
                    }
                    _ => {}
                }
            }

            // Bookmaker status lines (domain.tld=Name;active;...)
            if key.contains('.') && key.len() > 3 {
                let parts: Vec<&str> = val.split(';').collect();
                if parts.len() >= 4 {
                    result.bookmakers.push(BookmakerStatus {
                        domain: key.to_string(),
                        name: parts[0].to_string(),
                        online: parts[1] == "1",
                        commission: parts[2].to_string(),
                        last_update: parts.get(3).copied().unwrap_or("").to_string(),
                        currency: parts.get(4).copied().unwrap_or("").to_string(),
                        active: parts.get(5).map_or(false, |s| *s == "1"),
                    });
                }
            }
        }
    }

    if let Some(fork) = current_fork {
        result.forks.push(fork);
    }

    // Post-process: propagate team1/team2 from source 0 to sources 1+ if empty.
    for fork in &mut result.forks {
        // Story 16.48: num_sources = реальное число распарсенных источников.
        fork.num_sources = fork.sources.len().min(u8::MAX as usize) as u8;
        if fork.sources.len() > 1 {
            let (team1, team2, t1en, t2en) = if let Some(src0) = fork.sources.first() {
                (src0.team1.clone(), src0.team2.clone(),
                 src0.team1_en.clone(), src0.team2_en.clone())
            } else {
                continue;
            };
            for src in fork.sources.iter_mut().skip(1) {
                if src.team1.is_empty() && !team1.is_empty() {
                    src.team1 = team1.clone();
                }
                if src.team2.is_empty() && !team2.is_empty() {
                    src.team2 = team2.clone();
                }
                if src.team1_en.is_empty() && !t1en.is_empty() {
                    src.team1_en = t1en.clone();
                }
                if src.team2_en.is_empty() && !t2en.is_empty() {
                    src.team2_en = t2en.clone();
                }
            }
        }
    }

    if !ref_data.is_empty() {
        result.reference_data = Some(ref_data);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty() {
        let frame = parse_frame("");
        assert!(frame.forks.is_empty());
        assert!(frame.bookmakers.is_empty());
    }

    #[test]
    fn test_parse_fork_line() {
        let input = "surebets\u{00AE}17.04.2026 19:03:27\n\
                      SB=;Хоккей - Чехия;97,917;17.04.2026 19:03:17;0;1\n\
                      ST=Ф1(1,5);Ф2(-1,5)\n\
                      S=Хоккей. Чехия;tennisi.com;\n\
                      M=Team A;Team B;17.04.2026 18:30:00\n";

        let frame = parse_frame(input);
        assert_eq!(frame.timestamp, "17.04.2026 19:03:27");
        assert_eq!(frame.forks.len(), 1);

        let fork = &frame.forks[0];
        assert_eq!(fork.sport, "Хоккей - Чехия");
        assert!((fork.profit - 97.917).abs() < 0.001);
        assert_eq!(fork.is_live, 0);
        assert_eq!(fork.stake_types, "Ф1(1,5);Ф2(-1,5)");
        assert_eq!(fork.sources.len(), 1);
        assert_eq!(fork.sources[0].bookmaker, "tennisi.com");
        assert_eq!(fork.sources[0].team1, "Team A");
        assert_eq!(fork.sources[0].team2, "Team B");
    }

    #[test]
    fn test_team_propagation_to_source1() {
        // Protocol sends M with teams for source 0, M1 with only date for source 1
        let input = "SB=;Футбол - Бельгия;2,5;17.04.2026 19:00:00;1;1\n\
                      ST=П1;П2\n\
                      S=Football - Belgium;betfair.com;\n\
                      M=Льерс;Локерен Темсе;17.04.2026 22:00:00\n\
                      S1=Футбол - Бельгия;marathonbet.com;\n\
                      M1=;;17.04.2026 22:00:00\n";

        let frame = parse_frame(input);
        assert_eq!(frame.forks.len(), 1);
        let fork = &frame.forks[0];
        assert_eq!(fork.sources.len(), 2);

        // Source 0: teams directly from M line
        assert_eq!(fork.sources[0].team1, "Льерс");
        assert_eq!(fork.sources[0].team2, "Локерен Темсе");
        assert_eq!(fork.sources[0].bookmaker, "betfair.com");

        // Source 1: teams propagated from source 0
        assert_eq!(fork.sources[1].team1, "Льерс");
        assert_eq!(fork.sources[1].team2, "Локерен Темсе");
        assert_eq!(fork.sources[1].bookmaker, "marathonbet.com");
        assert_eq!(fork.sources[1].match_date, "17.04.2026 22:00:00");
    }

    #[test]
    fn test_team_propagation_three_sources() {
        // 3-way fork: S, M, S1, M1, S2, M2
        let input = "SB=;Теннис;1,5;17.04.2026 19:00:00;1;1\n\
                      ST=П1;П2;Тотал\n\
                      S=Tennis - ATP;betfair.com;\n\
                      M=Djokovic;Nadal;17.04.2026 15:00:00\n\
                      S1=Теннис - АТП;1xbet.com;\n\
                      M1=;;17.04.2026 15:00:00\n\
                      S2=Tennis;pinnaclesports.com;\n\
                      M2=;;17.04.2026 15:00:00\n";

        let frame = parse_frame(input);
        let fork = &frame.forks[0];
        assert_eq!(fork.sources.len(), 3);

        for i in 0..3 {
            assert_eq!(fork.sources[i].team1, "Djokovic", "source {} team1", i);
            assert_eq!(fork.sources[i].team2, "Nadal", "source {} team2", i);
        }
    }

    #[test]
    fn test_english_team_names_from_protocol() {
        // Real protocol: M=team1_ru;team2_ru;date;team1_en;team2_en;False;hash
        let input = "SB=;Американский футбол - Австралия;50,581;18.04.2026 14:52:51;0;1\n\
                      ST=ТМ(153,5);ТБ(26,5)\n\
                      S=Australian Rules - AFL;goalbet.com;\n\
                      M=Аделаида Кроус;Сент Килда;18.04.2026 13:15:00;Adelaide Crows;St Kilda;False;-176555538\n\
                      S1=Aussie Rules - Australia - AFL;n1bet.com;\n\
                      M1=;;18.04.2026 13:35:00;Adelaide Crows;St. Kilda Saints;False;937101897\n";

        let frame = parse_frame(input);
        let fork = &frame.forks[0];
        assert_eq!(fork.sources.len(), 2);

        // Source 0: has both RU and EN team names
        assert_eq!(fork.sources[0].team1, "Аделаида Кроус");
        assert_eq!(fork.sources[0].team2, "Сент Килда");
        assert_eq!(fork.sources[0].team1_en, "Adelaide Crows");
        assert_eq!(fork.sources[0].team2_en, "St Kilda");
        assert_eq!(fork.sources[0].source_hash, "-176555538");

        // Source 1: RU teams propagated from source 0, EN names from own M1 line
        assert_eq!(fork.sources[1].team1, "Аделаида Кроус");
        assert_eq!(fork.sources[1].team2, "Сент Килда");
        assert_eq!(fork.sources[1].team1_en, "Adelaide Crows");
        assert_eq!(fork.sources[1].team2_en, "St. Kilda Saints");
        assert_eq!(fork.sources[1].source_hash, "937101897");
    }

    #[test]
    fn test_reference_data_parsing() {
        // Simulate RU server .206 frame with dictionaries
        let input = "surebets\u{00AE}18.04.2026 15:03:05\u{00AE}zero\n\
                      AddNames=\u{00A9}1т\u{00A9}Голы, 1 тайм\u{00A9}2т\u{00A9}Голы, 2 тайм\u{00A9}УГЛ\u{00A9}Угловые\n\
                      BetNames=1\u{00A9}Победа первой\u{00A9}X\u{00A9}Ничья\u{00A9}2\u{00A9}Победа второй\n\
                      BetEquals=0\u{00A9}\u{00A9}1\u{00A9}0 голов\u{00A9}2\u{00A9}0-1 голов\n";

        let frame = parse_frame(input);
        assert!(frame.forks.is_empty());
        assert!(frame.reference_data.is_some());

        let rd = frame.reference_data.unwrap();
        // AddNames starts with empty key + "1т"
        assert!(rd.add_names.len() >= 3, "Expected >=3 add_names, got {}", rd.add_names.len());
        assert_eq!(rd.bet_names.len(), 3);
        assert_eq!(rd.bet_names[0].key, "1");
        assert_eq!(rd.bet_names[0].value, "Победа первой");
        assert_eq!(rd.bet_names[1].key, "X");
        assert_eq!(rd.bet_names[1].value, "Ничья");
        assert_eq!(rd.bet_equals.len(), 3);
        assert_eq!(rd.bet_equals[1].key, "1");
        assert_eq!(rd.bet_equals[1].value, "0 голов");
    }

    #[test]
    fn test_inf_lif_ov_login_url() {
        let input = "SB=;Футбол - Россия;3,5;18.04.2026 15:00:00;1;1\n\
                      ST=П1;П2\n\
                      S=Football - Russia;betcity.ru;\n\
                      M=ЦСКА;Спартак;18.04.2026 15:00:00;CSKA;Spartak;False;123456\n\
                      INF=$0$corner_handicap*period=ft_corners*handicap=-6.5*away$0$$\n\
                      LIF=0;3;54\n\
                      L=http://betcityru.com/livebetssh.php?id=22500024\n\
                      OV=77;86\n";

        let frame = parse_frame(input);
        assert_eq!(frame.forks.len(), 1);
        let fork = &frame.forks[0];
        assert_eq!(fork.inf, "$0$corner_handicap*period=ft_corners*handicap=-6.5*away$0$$");
        assert_eq!(fork.lif, "0;3;54");
        assert_eq!(fork.login_url, "http://betcityru.com/livebetssh.php?id=22500024");
        assert_eq!(fork.ov, "77;86");
        // OV декодируется в массив целых per-outcome (AC-1).
        assert_eq!(fork.overvalue(), vec![77, 86]);
    }

    fn fork_with_ov(ov: &str, st: &str) -> Fork {
        Fork {
            sport: String::new(),
            profit: 0.0,
            fork_timestamp: String::new(),
            is_live: 0,
            stake_types: st.to_string(),
            market_code: String::new(),
            fork_number: String::new(),
            filter_id: String::new(),
            score: String::new(),
            match_time: String::new(),
            event_id: String::new(),
            event_hash: String::new(),
            num_sources: 0,
            dd_hash: String::new(),
            inf: String::new(),
            lif: String::new(),
            login_url: String::new(),
            ov: ov.to_string(),
            al: String::new(),
            odds: Vec::new(),
            sources: Vec::new(),
        }
    }

    #[test]
    fn test_overvalue_basic() {
        assert_eq!(fork_with_ov("363;5", "1X;2").overvalue(), vec![363, 5]);
        assert_eq!(fork_with_ov("272;0", "1;X2").overvalue(), vec![272, 0]);
    }

    #[test]
    fn test_overvalue_negative() {
        // Отрицательная завышенность (undervalue) сохраняется — парсим i32, не u32.
        assert_eq!(fork_with_ov("-4;39", "ТМ(10,5);ТБ(10,5)").overvalue(), vec![-4, 39]);
        assert_eq!(fork_with_ov("72;41;9", "1;X;2").overvalue(), vec![72, 41, 9]);
    }

    #[test]
    fn test_overvalue_empty() {
        assert_eq!(fork_with_ov("", "1;2").overvalue(), Vec::<i32>::new());
    }

    #[test]
    fn test_overvalue_garbage_returns_empty() {
        // All-or-nothing: битый токен в середине НЕ должен сдвигать индексы —
        // безопаснее вернуть пустой массив, чем привязать значение к чужому исходу.
        assert_eq!(fork_with_ov("12;abc;7", "1;X;2").overvalue(), Vec::<i32>::new());
    }

    #[test]
    fn test_overvalue_trailing_separator() {
        // Завершающий ';' (пустой хвост) допустим и игнорируется.
        assert_eq!(fork_with_ov("363;5;", "1X;2").overvalue(), vec![363, 5]);
    }

    #[test]
    fn test_num_sources_counts_real_sources() {
        // Story 16.48: num_sources = sources.len(), НЕ placeholder parts[8]="1".
        // 2 источника (S= + S1=):
        let two = "SB=;Футбол - Бельгия;2,5;17.04.2026 19:00:00;1;1;0;0;2;1;1,5;3,1\n\
                   ST=П1;П2\n\
                   S=Football;betfair.com;\n\
                   M=A;B;17.04.2026 22:00:00\n\
                   S1=Football;marathonbet.com;\n\
                   M1=;;17.04.2026 22:00:00\n";
        let f = parse_frame(two);
        assert_eq!(f.forks.len(), 1);
        assert_eq!(f.forks[0].num_sources, 2, "должно быть 2, не placeholder");
        assert_eq!(f.forks[0].sources.len(), 2);
        // 1 источник:
        let one = "SB=;Теннис;1,5;17.04.2026 19:00:00;1;1;0;0;2;1;2,0;2,0\n\
                   ST=П1;П2\n\
                   S=Tennis;tennisi.com;\n\
                   M=X;Y;17.04.2026 18:30:00\n";
        let f1 = parse_frame(one);
        assert_eq!(f1.forks[0].num_sources, 1);
    }

    #[test]
    fn test_inf_sport_event_id() {
        let mut f = fork_with_ov("", "1;2");
        f.inf = "0#/Tennis/33/271036/1631581426$0$6778044316$0$$".into();
        assert_eq!(f.inf_sport_id().as_deref(), Some("33"));
        assert_eq!(f.inf_event_id().as_deref(), Some("6778044316"));
        // иной формат → None
        f.inf = "".into();
        assert_eq!(f.inf_sport_id(), None);
        assert_eq!(f.inf_event_id(), None);
        // malformed sport_id position
        f.inf = "0#/Basketball/4/548/1631595475$0$6782340147$0$$".into();
        assert_eq!(f.inf_sport_id().as_deref(), Some("4"));
        assert_eq!(f.inf_event_id().as_deref(), Some("6782340147"));
    }

    #[test]
    fn test_time_to_start_secs() {
        let mut f = fork_with_ov("", "1;2");
        f.lif = "1;28;55".into();
        assert_eq!(f.time_to_start_secs(), Some(1*3600 + 28*60 + 55));
        f.lif = "0;0;11".into();
        assert_eq!(f.time_to_start_secs(), Some(11));
        f.lif = "".into();
        assert_eq!(f.time_to_start_secs(), None);
        f.lif = "abc".into();
        assert_eq!(f.time_to_start_secs(), None);
    }

    #[test]
    fn test_alt_count_from_al() {
        // Story 16.50: AL= "event_id;alt_count;related" → alt_count = средний элемент.
        let mut f = fork_with_ov("", "1;2");
        f.al = "12474937;7;12474940".into();
        assert_eq!(f.alt_count(), Some(7));
        f.al = "12474950;4;".into();
        assert_eq!(f.alt_count(), Some(4));
        f.al = String::new();
        assert_eq!(f.alt_count(), None);
        f.al = "12473968".into(); // нет среднего элемента
        assert_eq!(f.alt_count(), None);
        f.al = "id;abc;x".into(); // мусор в счётчике
        assert_eq!(f.alt_count(), None);
    }

    #[test]
    fn test_parse_frame_extracts_al() {
        let input = "SB=;Футбол;2,5;01.06.2026 5:00:00;0;1;0;0;2;1;1,5;3,1\n\
                      ST=П1;П2\n\
                      S=Football;bk1.com;\n\
                      M=A;B;01.06.2026 3:00:00\n\
                      AL=12474937;7;12474940\n";
        let fr = parse_frame(input);
        assert_eq!(fr.forks.len(), 1);
        assert_eq!(fr.forks[0].al, "12474937;7;12474940");
        assert_eq!(fr.forks[0].alt_count(), Some(7));
    }

    #[test]
    fn test_outcome_count() {
        assert_eq!(fork_with_ov("363;5", "1X;2").outcome_count(), 2);
        assert_eq!(fork_with_ov("72;41;9", "1;X;2").outcome_count(), 3);
        assert_eq!(fork_with_ov("5", "").outcome_count(), 0);
    }

    // ── Story 16.46: реальные decimal-коэффициенты из SB= ──────────────

    /// Хелпер: собрать parts как в Rust SB= (после среза ведущего ';').
    fn sb_parts(profit: &str, o0: &str, o1: &str) -> Vec<String> {
        // [0]=sport [1]=profit [2]=ts [3]=is_live ... [8]=ph [9]=o0 [10]=o1
        let mut p = vec!["Спорт".into(), profit.into(), "ts".into(), "0".into(),
                         "1".into(), "0".into(), "0".into(), "2".into(), "1".into()];
        p.push(o0.into());
        p.push(o1.into());
        p
    }

    #[test]
    fn test_parse_sb_odds_comma() {
        let p = sb_parts("0,980", "1,02", "101");
        let refs: Vec<&str> = p.iter().map(|s| s.as_str()).collect();
        assert_eq!(parse_sb_odds(&refs), vec![1.02_f32, 101.0_f32]);
    }

    #[test]
    fn test_parse_sb_odds_empty_or_garbage() {
        // пусто
        let p = sb_parts("1,0", "", "");
        let refs: Vec<&str> = p.iter().map(|s| s.as_str()).collect();
        assert_eq!(parse_sb_odds(&refs), Vec::<f32>::new());
        // мусор во втором
        let p = sb_parts("1,0", "1,93", "abc");
        let refs: Vec<&str> = p.iter().map(|s| s.as_str()).collect();
        assert_eq!(parse_sb_odds(&refs), Vec::<f32>::new());
    }

    #[test]
    fn test_parse_sb_odds_rejects_placeholder() {
        // odds <= 1.0 (плейсхолдер "1") не принимается → пусто
        let p = sb_parts("1,0", "1", "101");
        let refs: Vec<&str> = p.iter().map(|s| s.as_str()).collect();
        assert_eq!(parse_sb_odds(&refs), Vec::<f32>::new());
    }

    #[test]
    fn test_parse_sb_odds_rejects_non_finite() {
        // "inf"/"NaN" не должны проходить guard и попадать в SSE/DB/EV.
        for bad in ["inf", "-inf", "NaN", "infinity"] {
            let p = sb_parts("1,0", "1,93", bad);
            let refs: Vec<&str> = p.iter().map(|s| s.as_str()).collect();
            assert_eq!(parse_sb_odds(&refs), Vec::<f32>::new(), "bad={}", bad);
        }
    }

    #[test]
    fn test_surebet_invariant_matches_frame_profit() {
        // Реальные значения из frame_dumps: profit вычисляется из odds точно.
        assert!((surebet_profit(1.02, 101.0) - 0.980).abs() < 0.05);
        assert!((surebet_profit(1.45, 3.55) - 2.950).abs() < 0.05);
        assert!((surebet_profit(1.218, 4.8) - (-2.851)).abs() < 0.05);
        assert!((surebet_profit(1.93, 2.1) - 0.571).abs() < 0.05);
    }

    #[test]
    fn test_parse_frame_extracts_odds() {
        // Полный SB= кадр: odds распарсились, surebet-инвариант сходится с profit.
        let input = "SB=;Футбол - Бразилия;0,980;01.06.2026 5:19:17;0;1;0;0;2;1;1,02;101;;;;;evid;0;hash\n\
                      ST=ТМ(5,5);ТБ(4,5)\n\
                      S=Football;ladbrokes.com;\n\
                      M=A;B;01.06.2026 3:30:00\n";
        let frame = parse_frame(input);
        assert_eq!(frame.forks.len(), 1);
        let f = &frame.forks[0];
        assert_eq!(f.odds, vec![1.02_f32, 101.0_f32]);
        assert!((surebet_profit(f.odds[0], f.odds[1]) - f.profit).abs() < 0.1);
    }

    #[test]
    fn test_bookmaker_status_full_fields() {
        // Simulate RU server .208 frame with BK status lines
        let input = "surebets\u{00AE}18.04.2026 15:03:03\u{00AE}zero\n\
                      betcity.ru=BetCity;0;0;18.04.2026 15:02:24;;1\n\
                      betfair.com=Betfair;0;0,025;18.04.2026 15:02:57;GBP;1\n\
                      leonbets.ru=Леон;1;0;18.04.2026 15:02:56;;1\n";

        let frame = parse_frame(input);
        assert_eq!(frame.bookmakers.len(), 3);

        let betfair = frame.bookmakers.iter().find(|b| b.domain == "betfair.com").unwrap();
        assert_eq!(betfair.name, "Betfair");
        assert!(!betfair.online); // 0 = offline
        assert_eq!(betfair.commission, "0,025");
        assert_eq!(betfair.last_update, "18.04.2026 15:02:57");
        assert_eq!(betfair.currency, "GBP");
        assert!(betfair.active); // 1 = active

        let leon = frame.bookmakers.iter().find(|b| b.domain == "leonbets.ru").unwrap();
        assert!(leon.online); // 1 = online
        assert!(leon.active);
    }

    #[test]
    fn test_frame_type_relay() {
        // DE relay frame: surebets®timestamp (no "zero")
        let input = "surebets\u{00AE}17.04.2026 19:03:27\n\
                      SB=;Хоккей;2,5;17.04.2026 19:00:00;0;1\n\
                      ST=П1;П2\n";

        let frame = parse_frame(input);
        assert_eq!(frame.frame_type, FrameType::Relay);
    }

    #[test]
    fn test_frame_type_bk_status() {
        // RU prematch frame: surebets®timestamp®zero
        let input = "surebets\u{00AE}18.04.2026 15:03:03\u{00AE}zero\n\
                      betcity.ru=BetCity;0;0;18.04.2026 15:02:24;;1\n";

        let frame = parse_frame(input);
        assert_eq!(frame.frame_type, FrameType::BkStatus);
        assert!(frame.forks.is_empty());
        assert_eq!(frame.bookmakers.len(), 1);
    }

    #[test]
    fn test_status_variant_without_zero_is_not_a_fork_snapshot() {
        // Seen live: status frames may omit the literal `zero` marker.
        let input = "surebets\u{00AE}18.04.2026 15:03:03\nbetcity.ru=BetCity;0;0;18.04.2026 15:02:24;;1\n";
        let frame = parse_frame(input);
        assert_eq!(frame.frame_type, FrameType::Relay);
        assert!(frame.forks.is_empty());
        assert_eq!(frame.bookmakers.len(), 1);
        assert!(!frame.is_fork_snapshot());
    }

    #[test]
    fn test_relay_with_sb_is_a_fork_snapshot() {
        let input = "surebets\u{00AE}17.04.2026 19:03:27\nSB=;Хоккей;2,5;17.04.2026 19:00:00;0;1\nST=П1;П2\n";
        assert!(parse_frame(input).is_fork_snapshot());
    }

    #[test]
    fn test_tennis_set_game_coordinates_from_inf_variants() {
        let mut fork = Fork {
            sport: "Теннис".into(), profit: 1.0, fork_timestamp: String::new(),
            is_live: 1, stake_types: "гейм 8 П1;гейм 8 П2".into(),
            market_code: String::new(),
            fork_number: String::new(), filter_id: String::new(), score: String::new(),
            match_time: String::new(), event_id: String::new(), event_hash: String::new(),
            num_sources: 2, dd_hash: String::new(),
            inf: "Game Winner**Set 1 Game 8 Winner / Player**Player$0$13#/&//Tennis/33/226801/1632494715$0$$".into(),
            lif: String::new(), login_url: String::new(), ov: String::new(),
            al: String::new(), odds: vec![], sources: vec![],
        };
        assert_eq!(fork.tennis_set_game_numbers(), (Some(1), Some(8)));

        fork.inf = "23#/&//Tennis/33/288041/1632491913$0$Set 2 Game 5 Winner**Player$0$$".into();
        fork.stake_types = "гейм 5 П1;гейм 5 П2".into();
        assert_eq!(fork.tennis_set_game_numbers(), (Some(2), Some(5)));

        // Some bookmakers omit the child-market description from INF. Keep
        // the known game but never invent the missing set.
        fork.inf = "27#/&//Tennis/33/198735/1632499035$0$$0$$".into();
        fork.stake_types = "гейм 9 П1;гейм 9 П2".into();
        assert_eq!(fork.tennis_set_game_numbers(), (None, Some(9)));
    }

    #[test]
    fn test_market_hint_from_inf_without_exposing_opaque_event_path() {
        let mut fork = fork_with_ov("", "П1;П2");
        fork.inf = "$0$corner_handicap*period=ft_corners*handicap=-6.5*away$0$$".into();
        assert_eq!(
            fork.market_hint().as_deref(),
            Some("corner_handicap*period=ft_corners*handicap=-6.5*away")
        );

        fork.inf = "23#/&//Tennis/33/288041/1632491913$0$Set 2 Game 5 Winner**Player$0$$".into();
        assert_eq!(fork.market_hint().as_deref(), Some("Set 2 Game 5 Winner**Player"));

        fork.inf = "0#/Tennis/33/271036/1631581426$0$6778044316$0$$".into();
        assert_eq!(fork.market_hint(), None);
    }

    #[test]
    fn test_market_code_from_sb_part_25() {
        let input = "SB=;Баскетбол;1,5;14.07.2026 4:28:41;0;1;0;0;0;1;1,28;4,06;;;;;2312971;0;-1575946619;0;0;0;0;0;0;0;1п;149607889;-327852488;0;;0;0\n\
                     ST=П1;П2\n";
        let frame = parse_frame(input);
        assert_eq!(frame.forks[0].market_code, "1п");
    }

    #[test]
    fn test_three_way_sb_odds_are_not_truncated() {
        let input = "SB=;Футбол - Товарищеские матчи;1,243;06.08.2026 19:53:29;0;5;0;0;0;1;1,934;4,2;3,4;;;;2662577;0;1631249122;0;0;0;0;0;0;0;;-50336547;-269000734;0;;0;0\n\
                     ST=Ф1(-0,25);X;2\n";
        let frame = parse_frame(input);

        assert_eq!(frame.forks[0].stake_types, "Ф1(-0,25);X;2");
        assert_eq!(frame.forks[0].odds, vec![1.934, 4.2, 3.4]);
    }

    #[test]
    fn test_license_info_parsing() {
        let input = "surebets\u{00AE}18.04.2026 15:03:03\u{00AE}zero\n\
                      betcity.ru=BetCity;0;0;18.04.2026 15:02:24;;1\n\
                      0\u{00AE}True\u{00AE}15.04.2025\u{00AE}24.04.2026\u{00AE}24.04.2026\u{00AE}0\u{00AE}t\n";

        let frame = parse_frame(input);
        assert!(frame.license_info.is_some());
        let lic = frame.license_info.unwrap();
        assert_eq!(lic.registration_date, "15.04.2025");
        assert_eq!(lic.prematch_expiry, "24.04.2026");
        assert_eq!(lic.live_expiry, "24.04.2026");
    }
}
