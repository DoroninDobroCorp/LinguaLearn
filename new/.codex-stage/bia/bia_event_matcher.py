"""
BIA → internal Pid event matching.

Maps BIA event metadata (home, away, competition_name, sport, event_id)
to existing internal Pids in state.events_data using deterministic
normalized-name matching, with swapped-team support and a conservative
fuzzy fallback.

Never creates new events — only matches against existing Pids.
Does not revive removed/unknown events.
"""

from __future__ import annotations

import re
from collections import defaultdict
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Any

from services.bia_neural_matcher import (
    BiaNeuralCandidate,
    BiaNeuralMatcher,
    BiaNeuralMatcherProtocol,
    config_from_module,
)

# BIA sport code → canonical sport name used in events_data
BIA_SPORT_MAP: dict[str, str] = {
    "fb": "Soccer",
    "fb_ht": "Soccer",
    "fb_htft": "Soccer",
    "fb_book": "Soccer",
    "fb_corn": "Soccer",
    "fb_corn_ht": "Soccer",
    "tennis": "Tennis",
    "basket": "Basketball",
    "basket_ht": "Basketball",
    "basket_q1": "Basketball",
    "basket_q2": "Basketball",
    "basket_q3": "Basketball",
    "basket_q4": "Basketball",
    "ih": "Hockey",
    "ice-hockey": "Hockey",
    "hand": "Handball",
    "volley": "Volleyball",
    "esports": "ESports",
    "e-sports": "ESports",
    "baseball": "Baseball",
    "af": "AmericanFootball",
    "arf": "AussieRules",
    "cricket": "Cricket",
    "darts": "Darts",
    "mma": "Combat Sports",
    "boxing": "Boxing",
    "rl": "Rugby",
    "ru": "Rugby",
    "golf": "Golf",
    "cycling": "Cycling",
    "snooker": "Snooker",
}


_GENERIC_PREFIX_RULES: tuple[str, ...] = (
    "club",
    "fc",
    "afc",
    "cf",
    "sc",
    "fk",
    "hc",    # HC Dinamo Minsk
    "bc",    # BC Žalgiris
    "kk",    # KK Partizan
)

_GENERIC_SUFFIX_RULES: tuple[str, ...] = (
    "women",
    "woman",
    "u19",
    "u20",
    "u21",
    "u23",
    "ii",        # Athletic Bilbao II (reserve/B team)
    "reserves",
    "reserve",
    "youth",
    "fc",
    "afc",
    "cf",
    "sc",
    "fk",
    "ce",        # CE = Club Esportiu (Força Lleida CE)
    "hc",        # Genève-Servette HC (ice hockey suffix)
    "bc",        # BC Žalgiris etc. sometimes appears as suffix
    "kk",        # KK sometimes as suffix
    "if",        # Hammarby IF (Swedish Idrottsförening)
    "club",
    "points",
    "kills",     # ESports: "furia kills" → "furia"
    "esports",   # ESports org suffix
    "gaming",    # ESports: "Citadel Gaming" → "citadel"
    "hk",        # Handball: Fredericia HK
    "athletic",  # Chungnam Athletic → Chungnam
    "council",   # Sports Council → strip
    "sports",    # Sports suffix
    "co",        # KK Split CO → KK Split
    "af",        # Rodez AF
    "combinatie",  # Fortuna Sittard Combinatie
    "mayenne",   # Stade Lavallois Mayenne FC
)

_ALIAS_PREFIX_RULES: tuple[str, ...] = (
    "as",
    "red bull",  # Red Bull Salzburg, Red Bull Leipzig
    "rb",        # RB Leipzig
    # German club prefixes
    "vfl",   # VfL Wolfsburg, VfL Bochum
    "vfb",   # VfB Stuttgart
    "tsg",   # TSG Hoffenheim
    "tsv",   # TSV 1860 Munich
    "sv",    # SV Darmstadt, SV Werder Bremen
    "bsc",   # Hertha BSC
    "fsv",   # FSV Mainz
    "spvgg", # SpVgg Greuther Fürth
    "eintracht",  # Eintracht Frankfurt, Eintracht Braunschweig
    # Spanish club prefixes
    "cd",    # CD Leganés
    "ud",    # UD Almería
    "sd",    # SD Eibar
    "ad",    # AD Alcorcón
    "ca",    # CA Osasuna
    # Italian
    "ac",    # AC Milan, AC Monza Brianza
    "us",    # US Lecce, US Città di Palermo
    "ssc",   # SSC Bari, SSC Napoli
    "asd",   # ASD Alcione Milano
    "hellas",  # Hellas Verona (BIA uses just "Verona")
    # French
    "aj",    # AJ Auxerre, AJ Ajaccio
    "og",    # OG Nice, OGC Nice
    "rc",    # RC Lens, RC Strasbourg
    "stade",  # Stade Rennais, Stade Brestois
    "olympique", # Olympique Lyonnais, Olympique de Marseille
    # English
    "afc",   # AFC Bournemouth
    # Belgian/Dutch/other
    "royal",  # Royal Charleroi SC, Royal Antwerp FC
    "kas",   # KAS Eupen
    "ksc",   # KSC Lokeren
    "kvc",   # KVC Westerlo
    "kv",    # KV Mechelen
    "fco",   # FCO Beerschot Wilrijk
    "rfc",   # RFC Seraing
    "en avant",  # En Avant Guingamp
    # Brazilian
    "ec",    # EC Bahia
    "cr",    # CR Vasco da Gama
    "se",    # SE Palmeiras
    "scr",   # SCR Altach
    # other
    "1",     # 1. FC Kaiserslautern
    "calcio", # Calcio Lecco
    "bw",    # BW Linz
    # Handball
    "bm",    # BM Granollers, BM Atletico Valladolid
    "cbm",   # CBM Sporting Alicante
    # Basketball
    "basket",    # Basket Zaragoza 2002 → Zaragoza
    "saski",  # Saski Baskonia
    "pallacanestro",  # Virtus Pallacanestro Bologna
    "ratiopharm",  # Ratiopharm Ulm (sponsor prefix)
    "mhp",   # MHP Riesen Ludwigsburg
    "telekom",  # Telekom Baskets Bonn
    "ewe",   # EWE Baskets Oldenburg
    "brose",  # Brose Bamberg (sponsor can be prefix too)
    "sig",    # SIG Strasbourg
    "bcm",   # BCM Gravelines-Dunkerque
    # ESports game prefixes (BIA prepends game name)
    "val",    # VAL - Gentle Mates
    "lol",    # LoL - FURIA
    "dota 2", # DOTA 2 - Nigma Galaxy
    "cs2",    # CS2 - Team X
    "csgo",
    "rl",     # Rocket League
    "mobile legends",  # Mobile Legends - ONIC
    # Polish club prefixes
    "gks",   # GKS Szombierki, GKS Tychy
    "ks",    # KS Raków Częstochowa
    "mks",   # MKS Kalisz (handball)
    "kpr",   # KPR Ostrovia (handball)
    "rks",   # RKS Radomsko
    # Scandinavian
    "il",    # IL Hødd (Norwegian)
    "if",    # IF Elfsborg (Swedish)
    "ik",    # IK Sirius (Swedish)
    "bk",    # BK Häcken (Swedish/Danish)
    "tth",   # TTH Holstebro (Danish handball)
    # Eastern European
    "nk",    # NK Maribor, NK Olimpija (Croatian/Slovenian)
    "dynamo",  # Dynamo Pardubice, Dynamo Moscow
    "dinamo",  # Dinamo Minsk, Dinamo Zagreb
    # Belgian
    "rsc",   # RSC Anderlecht
    "kaa",   # KAA Gent
    "krc",   # KRC Genk
    # Portuguese
    "cv",    # CV Oeiras, CV Lisboa (volleyball)
    "cn",    # CN Ginástica (volleyball)
    "cb",    # CB Bilbao Berri (Spanish basketball)
    # French/Italian basketball
    "cjm",   # CJM Bourges
    "aurora",  # Aurora Basket Jesi (Italian)
    "gema",  # Gema Montecatini (Italian)
    "rinascita",  # Rinascita Basket Rimini
    # South American
    "club atletico",  # Club Atlético Fenix
    "cs",    # CS Cerrito
    # Portuguese/Brazilian football
    "sl",    # SL Benfica
    "gd",    # GD Estoril Praia
    "cda",   # CDA Navalcarnero
    "cdb",   # Cdb Siello
    "mfk",   # MFK Zemplín Michalovce
    "asm",   # ASM Clermont Auvergne (rugby)
    # Sponsors appearing as prefixes in BIA/PIN names
    "enel",     # Enel Brindisi
    "biancoblu",  # Biancoblu Fortitudo Bologna
    "volksbank",  # TSV Volksbank Hartberg
    "pick",     # SC Pick Szeged
    # Other
    "team",  # Team Tvis Holstebro, Team Esbjerg
    "tvis",  # Tvis (after "team" stripped)
    "mhc",   # MHC Spartak (hockey)
)

_ALIAS_SUFFIX_RULES: tuple[str, ...] = (
    "sporting club",
    "wanderers",
    "united",
    # German residual from "von 1910" (year stripped, "von" remains)
    "von",
    # City/region names often appended/differing between sources
    "berlin",
    "linz",
    "wien",
    "graz",
    "london",
    "madrid",
    "eindhoven",  # PSV Eindhoven → PSV
    "brianza",    # Monza Brianza → Monza
    "grenland",   # Odd Grenland → Odd
    "lorraine",   # Nancy Lorraine → Nancy
    "auvergne",   # Clermont Auvergne → Clermont
    "temse",      # Lokeren Temse → Lokeren (pin888 adds)
    "vitoria gasteiz",  # Baskonia Vitoria Gasteiz → Baskonia
    "vitoria",    # standalone
    "gasteiz",
    "belgrade",   # Partizan Belgrade → Partizan
    "kaunas",     # Žalgiris Kaunas → Žalgiris
    "dublin",     # Bohemians Dublin → Bohemians
    "hove albion", # Brighton & Hove Albion → Brighton
    "prague",     # Sparta Prague → Sparta
    "praha",      # HC Sparta Praha → Sparta (Czech)
    "istanbul",   # Galatasaray Istanbul → Galatasaray
    # Finnish hockey city suffixes
    "pori",       # Ässät Pori → Ässät
    "oulu",       # Kärpät Oulu → Kärpät
    "turku",      # TPS Turku → TPS
    "tampere",    # Ilves Tampere → Ilves
    "helsinki",    # HIFK Helsinki → HIFK
    "lahti",      # Pelicans Lahti → Pelicans
    # Common club type suffixes
    "calcio",    # Frosinone Calcio
    "foot",      # Clermont Foot → clermont
    "milano",    # Alcione Milano
    "wilrijk",   # Beerschot Wilrijk
    "ov",        # Lokeren OV
    # Basketball sponsor/type suffixes
    "baskets",   # Brose Baskets Bamberg → Brose Bamberg
    "basket",    # Bilbao Basket → Bilbao; Derthona Basket → Derthona
    "basketball", # Ulm Basketball → Ulm
    "riesen",    # MHP Riesen → MHP (or standalone Riesen Ludwigsburg)
    "dordogne",  # Boulazac Basket Dordogne → Boulazac
    "sarthe",    # Le Mans Sarthe → Le Mans
    "dunkerque", # Gravelines-Dunkerque → Gravelines
    # Handball type suffixes
    "handball",  # Elverum Handball → Elverum
    "haandball", # Sandefjord Haandball → Sandefjord
    "andebol",   # Portuguese handball suffix
    "bodegao",   # Povoa Andebol Bodegao → strip
    "uminho",    # Braga UMinho → Braga
    "kzrt",      # Hungarian handball suffix
    # ESports
    "uppercut",  # FURIA Uppercut Esports → FURIA
    "ph",        # Mobile Legends Philippines tags
    # Ice hockey suffixes
    "hockey",    # Modo Hockey → Modo
    "ishockey",  # Swedish/Nordic ice hockey suffix
    "tigers ishockey",  # Frisk Asker Tigers Ishockey
    "dragons",   # Storhamar Dragons → Storhamar
    "clan",      # Glasgow Clan → Glasgow
    # Geographic suffixes
    "bretagne sud",  # Lorient Bretagne Sud → Lorient
    "bourgogne sud", # Charnay Basket Bourgogne Sud → Charnay
    "ankara",    # Halkbank Ankara → Halkbank
    "zurich lions",  # ZSC Zurich Lions → ZSC
    # Club type suffixes
    "cd",        # Xerez CD → Xerez
    "fotball",   # Asane Fotball → Asane (Norwegian)
    "basquet",   # Barcelona Bàsquet → Barcelona
    "promesas",  # Real Valladolid Promesas → Real Valladolid
    "academy",   # Basket Jesi Academy → Basket Jesi
    "kc",        # Veszprém KC → Veszprém (handball)
    "tortona",   # Derthona Tortona → Derthona
    # Basketball nicknames
    "sharks",    # Roseto Sharks → Roseto
    "crabs",     # Rimini Crabs → Rimini
    "seawolves", # Rostock Seawolves → Rostock
    # Hockey
    "lions",     # ZSC Lions → ZSC
    # Portuguese football
    "praia",     # Estoril Praia → Estoril
    # Volleyball
    "volley",    # Pineto Volley
    "volei clube",  # Portuguese volleyball suffix
)

# Suffix rules that should NOT be applied generically — only as alternatives
# "bsc" is already in prefix rules; also treat as suffix alias
_ALIAS_SUFFIX_RULES_ALT: tuple[str, ...] = (
    "bsc",
    "bk",
)

_ALL_PREFIX_RULES = _GENERIC_PREFIX_RULES + _ALIAS_PREFIX_RULES
_ALL_SUFFIX_RULES = _ALIAS_SUFFIX_RULES + _ALIAS_SUFFIX_RULES_ALT + _GENERIC_SUFFIX_RULES

# Nickname/alias dictionary — bidirectional.  Both directions are checked.
# Only add well-known unambiguous aliases where prefix/suffix rules fail.
_TEAM_ALIASES: dict[str, str] = {
    "wolves": "wolverhampton",
    "spurs": "tottenham",
    "latics": "wigan",
    "toffees": "everton",
    "potters": "stoke",
    "gunners": "arsenal",
    "hammers": "west ham",
    "magpies": "newcastle",
    "baggies": "west brom",
    "hatters": "luton",
    "canaries": "norwich",
    "blades": "sheffield",
    "rams": "derby",
    "saints": "southampton",
    "hornets": "watford",
    "swans": "swansea",
    "robins": "bristol",
    "bars": "ak bars",   # Ak Bars Kazan (hockey)
    "cska": "cska moscow",
    "lokomotiv": "lokomotiv moscow",
    # US city abbreviations (BIA uses "LA Lakers", pin888 uses "los angeles lakers")
    "la lakers": "los angeles lakers",
    "la clippers": "los angeles clippers",
    "la chargers": "los angeles chargers",
    "la rams": "los angeles rams",
    "la galaxy": "los angeles galaxy",
    "la angels": "los angeles angels",
    "la dodgers": "los angeles dodgers",
    "la kings": "los angeles kings",
    "la sparks": "los angeles sparks",
    "ny knicks": "new york knicks",
    "ny rangers": "new york rangers",
    "ny islanders": "new york islanders",
    "ny giants": "new york giants",
    "ny jets": "new york jets",
    "ny mets": "new york mets",
    "ny yankees": "new york yankees",
    "ny liberty": "new york liberty",
    "nj devils": "new jersey devils",
    "sf giants": "san francisco giants",
    "sf 49ers": "san francisco 49ers",
    "sa spurs": "san antonio spurs",
    "sj sharks": "san jose sharks",
    "sj earthquakes": "san jose earthquakes",
    "gs warriors": "golden state warriors",
    "gb packers": "green bay packers",
    "kc chiefs": "kansas city chiefs",
    "kc royals": "kansas city royals",
    "tb buccaneers": "tampa bay buccaneers",
    "tb lightning": "tampa bay lightning",
    "tb rays": "tampa bay rays",
    "ok city thunder": "oklahoma city thunder",
    "okc thunder": "oklahoma city thunder",
    # German city transliteration (ü→u gives "munchen", pin888 uses "munich")
    "bayern munchen": "bayern munich",
    "munchen": "munich",   # standalone
    "nurnberg": "nuremberg",
    "koln": "cologne",
    # Nordic/Eastern European city transliterations
    "copenhagen": "kobenhavn",  # FC København (ø→o gives kobenhavn)
    "prague": "praha",          # HC Sparta Praha
    "geneve": "geneva",         # Genève-Servette
    "goteborg": "gothenburg",   # IFK Göteborg
    # Handball abbreviations
    "ostrow wlkp": "ostrow wielkopolski",  # Polish abbreviation
    # Tennis common first-name aliases
    "stan wawrinka": "stanislas wawrinka",
    "leylah fernandez": "leylah annie fernandez",
    "juncheng shang": "juncheong shang",
    "dinamo bucuresti": "dinamo bucharest",
    # Current central-feed participant spellings/brand abbreviations. These
    # are exact pairs observed on the same sport, competition and start time.
    "pain academy": "pain acad",
    "bc lions": "british columbia lions",
    "athletics": "the athletics",
    "thundertalk": "tt",
    "hanwha life challengers": "hanwha life esports challengers",
    "kiwoom drx": "drx challengers",
    "kiwoom drx challengers": "drx challengers",
    "big": "berlin international gaming",
    "mark seban": "mark ceban",
    "ferdinand livet novkirichka": "ferdinand l novkirichka",
    "montevideo bbc": "montevideo basket ball club",
    "unicorns of love sexy edition": "unicorns of love se",
    "lokomotiv moscow": "lokomotiv moskva",
    "akron togliatti": "akron tolyatti",
    "belgrano": "belgrano de cordoba",
    "blooming": "cscd blooming",
    # Hockey name variants
    "modo hockey": "modo",
    "bilbao basket": "bilbao berri",  # Spanish basketball
    # ESports organisation name used by Pinnacle after the Fluxo/W7M pairing.
    # Keep this as an exact alias: bare W7M is a different organisation.
    "fluxo w7m": "fluxo",
    # Japanese volleyball (BIA "JT Marvelous" vs pin888 different names)
    # (handled via word overlap in fuzzy match)
}
# Build reverse index
_TEAM_ALIASES_REV: dict[str, str] = {v: k for k, v in _TEAM_ALIASES.items()}

_DEFAULT_NEURAL_MATCHER: BiaNeuralMatcher | None = None


def _default_neural_matcher() -> BiaNeuralMatcher | None:
    global _DEFAULT_NEURAL_MATCHER
    if _DEFAULT_NEURAL_MATCHER is not None:
        return _DEFAULT_NEURAL_MATCHER
    try:
        import config as _cfg
    except Exception:
        return None
    matcher = BiaNeuralMatcher(config_from_module(_cfg))
    if not matcher.available:
        return None
    _DEFAULT_NEURAL_MATCHER = matcher
    return _DEFAULT_NEURAL_MATCHER


def _is_women_context(league_name: str) -> bool:
    value = _clean_name(league_name)
    return any(token in value.split() for token in ("women", "woman", "ladies")) or "(w)" in str(league_name).lower()


def _team_category_markers(name: str) -> frozenset[str]:
    cleaned = _clean_name(name)
    words = set(cleaned.split())
    markers: set[str] = set()
    for token in ("u19", "u20", "u21", "u23"):
        if token in words:
            markers.add(token)
    if words & {"ii", "2", "b", "reserves", "reserve", "youth", "junior", "academy", "acad", "castilla", "segunda"}:
        markers.add("reserve")
    if words & {"women", "woman", "ladies"} or "(w)" in str(name).lower():
        markers.add("women")
    return frozenset(markers)


def _has_team_category_mismatch(left: str, right: str, *, league_name: str = "") -> bool:
    left_markers = set(_team_category_markers(left))
    right_markers = set(_team_category_markers(right))
    if _is_women_context(league_name):
        left_markers.discard("women")
        right_markers.discard("women")
    return left_markers != right_markers


def _has_tennis_doubles_mismatch(left: str, right: str, *, sport_name: str = "") -> bool:
    if sport_name != "Tennis":
        return False
    return ("/" in str(left or "")) != ("/" in str(right or ""))


_ESPORTS_GAME_PREFIXES: tuple[str, ...] = ("cs2", "csgo")
_ESPORTS_CATEGORY_EQUIVALENCES: frozenset[frozenset[str]] = frozenset()
_ESPORTS_IDENTITY_CONFLICTS: frozenset[frozenset[str]] = frozenset({
    frozenset(("fluxo w7m", "w7m")),
    frozenset(("fluxo w7m", "w7m esports")),
})


def _esports_category_identity(name: str) -> str:
    """Return a strict identity for explicitly approved ESports categories."""
    cleaned = _clean_name(name)
    for prefix in _ESPORTS_GAME_PREFIXES:
        if cleaned.startswith(f"{prefix} "):
            return cleaned[len(prefix) + 1:].strip()
    return cleaned


def _allowed_team_category_equivalence(left: str, right: str, *, sport_name: str) -> bool:
    if sport_name != "ESports":
        return False
    identities = frozenset((_esports_category_identity(left), _esports_category_identity(right)))
    return identities in _ESPORTS_CATEGORY_EQUIVALENCES


def _has_esports_identity_conflict(left: str, right: str, *, sport_name: str) -> bool:
    if sport_name != "ESports":
        return False
    identities = frozenset((_esports_category_identity(left), _esports_category_identity(right)))
    return identities in _ESPORTS_IDENTITY_CONFLICTS


def _unsafe_team_pair(
    bia_home: str,
    bia_away: str,
    pin_home: str,
    pin_away: str,
    *,
    swapped: bool,
    sport_name: str = "",
    league_name: str = "",
) -> bool:
    first_pin, second_pin = (pin_away, pin_home) if swapped else (pin_home, pin_away)
    if _has_esports_identity_conflict(bia_home, first_pin, sport_name=sport_name):
        return True
    if _has_esports_identity_conflict(bia_away, second_pin, sport_name=sport_name):
        return True
    if (
        _has_team_category_mismatch(bia_home, first_pin, league_name=league_name)
        and not _allowed_team_category_equivalence(bia_home, first_pin, sport_name=sport_name)
    ):
        return True
    if (
        _has_team_category_mismatch(bia_away, second_pin, league_name=league_name)
        and not _allowed_team_category_equivalence(bia_away, second_pin, sport_name=sport_name)
    ):
        return True
    if _has_tennis_doubles_mismatch(bia_home, first_pin, sport_name=sport_name):
        return True
    if _has_tennis_doubles_mismatch(bia_away, second_pin, sport_name=sport_name):
        return True
    return False


@lru_cache(maxsize=4096)
def _clean_name(name: str) -> str:
    import unicodedata
    raw = str(name or "")
    # Characters that don't decompose in NFKD — handle explicitly first
    raw = raw.replace("ø", "o").replace("Ø", "O")
    raw = raw.replace("ß", "ss")
    raw = raw.replace("ł", "l").replace("Ł", "L")
    raw = raw.replace("đ", "d").replace("Đ", "D")
    # Transliterate accented chars (Città → Citta, São → Sao)
    nfkd = unicodedata.normalize("NFKD", raw)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c))
    # Replace hyphens/dashes/slashes with spaces before stripping
    ascii_name = ascii_name.replace("-", " ").replace("–", " ").replace("—", " ").replace("/", " ")
    # Strip parenthetical codes: (PA), (RJ), (SP), (Canadian Solar), etc.
    ascii_name = re.sub(r"\s*\([^)]*\)\s*", " ", ascii_name)
    # Strip bracketed markers: [f], [m], [W], etc.
    ascii_name = re.sub(r"\s*\[[^\]]*\]\s*", " ", ascii_name)
    cleaned = re.sub(r"[^a-z0-9 ]", "", ascii_name.lower().strip())
    # Strip trailing 4-digit years: "pisa 1909" → "pisa"
    cleaned = re.sub(r"\s+\d{4}$", "", cleaned)
    # Strip trailing 1-2 digit suffixes: "clermont 63" → "clermont"
    cleaned = re.sub(r"\s+\d{1,2}$", "", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _strip_boundary_affixes(
    name: str,
    *,
    prefix_rules: tuple[str, ...],
    suffix_rules: tuple[str, ...],
) -> str:
    current = name
    while current:
        changed = False
        for rule in prefix_rules:
            prefix = f"{rule} "
            if current.startswith(prefix):
                current = current[len(prefix):].strip()
                changed = True
                break
        if changed:
            continue
        for rule in suffix_rules:
            suffix = f" {rule}"
            if current.endswith(suffix):
                current = current[:-len(suffix)].strip()
                changed = True
                break
        if not changed:
            return current
    return ""


def _strip_boundary_affixes_once(
    name: str,
    *,
    prefix_rules: tuple[str, ...],
    suffix_rules: tuple[str, ...],
) -> set[str]:
    variants: set[str] = set()
    for rule in prefix_rules:
        prefix = f"{rule} "
        if name.startswith(prefix):
            stripped = name[len(prefix):].strip()
            if stripped:
                variants.add(stripped)
    for rule in suffix_rules:
        suffix = f" {rule}"
        if name.endswith(suffix):
            stripped = name[:-len(suffix)].strip()
            if stripped:
                variants.add(stripped)
    return variants


@lru_cache(maxsize=4096)
def _normalize_name(name: str) -> str:
    """Normalize a team/player name for deterministic matching.

    Strips common suffixes/prefixes (FC, SC, etc.), lowercases,
    removes non-alphanumeric chars except spaces.
    """
    return _strip_boundary_affixes(
        _clean_name(name),
        prefix_rules=_GENERIC_PREFIX_RULES,
        suffix_rules=_GENERIC_SUFFIX_RULES,
    )


@lru_cache(maxsize=4096)
def _name_variants(name: str) -> frozenset[str]:
    cleaned = _clean_name(name)
    if not cleaned:
        return frozenset()

    pending = [cleaned]
    seen = {cleaned}
    variants: set[str] = set()

    while pending:
        current = pending.pop()
        normalized = _strip_boundary_affixes(
            current,
            prefix_rules=_GENERIC_PREFIX_RULES,
            suffix_rules=_GENERIC_SUFFIX_RULES,
        )
        if normalized:
            variants.add(normalized)
        for stripped in _strip_boundary_affixes_once(
            current,
            prefix_rules=_ALL_PREFIX_RULES,
            suffix_rules=_ALL_SUFFIX_RULES,
        ):
            if stripped in seen:
                continue
            seen.add(stripped)
            pending.append(stripped)

    # Expand via nickname aliases (bidirectional)
    alias_variants: set[str] = set()
    # Check exact aliases against every cleaned intermediate too. Generic
    # affix stripping (for example ``BC`` or ``Gaming``) must not erase a
    # deliberately registered full-name alias before it can expand.
    for v in variants | seen:
        if v in _TEAM_ALIASES:
            alias_variants.add(_TEAM_ALIASES[v])
        if v in _TEAM_ALIASES_REV:
            alias_variants.add(_TEAM_ALIASES_REV[v])
    variants |= alias_variants

    # Providers commonly omit connector words in otherwise exact participant
    # names (``Abejas de Leon`` vs ``Abejas Leon``). Add a connector-free
    # alternative without replacing the original or removing content words.
    # This stays inside deterministic exact-intersection matching; it does not
    # introduce a broad fuzzy-name path.
    connector_words = {
        "da", "de", "del", "di", "do", "dos", "du", "la", "le",
        "of", "the", "van", "von",
    }
    connector_free: set[str] = set()
    for variant in variants:
        words = variant.split()
        stripped = " ".join(word for word in words if word not in connector_words)
        if stripped and stripped != variant and len(stripped.split()) >= 2:
            connector_free.add(stripped)
    variants |= connector_free

    return frozenset(variants)


def _word_set(name: str) -> frozenset[str]:
    """Get the set of words (≥3 chars) in a name."""
    return frozenset(w for w in name.split() if len(w) >= 3)


def _similarity(a: str, b: str) -> float:
    """SequenceMatcher ratio on normalized names."""
    variants_a = _name_variants(a)
    variants_b = _name_variants(b)
    if not variants_a or not variants_b:
        return 0.0
    if variants_a.intersection(variants_b):
        return 1.0
    # Check if one name's PRIMARY variant is a leading-word prefix of the other
    # e.g. "brighton" is a prefix of "brighton hove albion"
    # Only use cleaned names (not alias-stripped variants) to avoid
    # "Manchester United" → "manchester" matching "Manchester City"
    clean_a = frozenset([_clean_name(a)]) if _clean_name(a) else frozenset()
    clean_b = frozenset([_clean_name(b)]) if _clean_name(b) else frozenset()
    for va in clean_a:
        for vb in clean_b:
            shorter, longer = (va, vb) if len(va) <= len(vb) else (vb, va)
            if len(shorter) >= 4 and longer.startswith(shorter + " "):
                return 0.95
    # Word-set overlap: handles reversed word orders
    # e.g. "hiroshima sanfrecce" vs "sanfrecce hiroshima"
    for va in variants_a:
        for vb in variants_b:
            ws_a, ws_b = _word_set(va), _word_set(vb)
            if ws_a and ws_b and len(ws_a) >= 2 and ws_a == ws_b:
                return 0.98
            # Subset check with ≥2 words in both sets — safe for multi-word names
            shorter_ws, longer_ws = (ws_a, ws_b) if len(ws_a) <= len(ws_b) else (ws_b, ws_a)
            if shorter_ws and len(shorter_ws) >= 2 and shorter_ws <= longer_ws:
                return 0.93
    # Single-word containment on clean names: "palermo" found inside "citta di palermo"
    # Clean names preserve the original structure, so "Manchester United" stays
    # "manchester united" and won't have "manchester" as a single-word to match "Manchester City"
    for va in clean_a:
        for vb in clean_b:
            ws_a2, ws_b2 = _word_set(va), _word_set(vb)
            shorter_ws, longer_ws = (ws_a2, ws_b2) if len(ws_a2) <= len(ws_b2) else (ws_b2, ws_a2)
            if shorter_ws and len(shorter_ws) == 1 and all(len(w) >= 5 for w in shorter_ws) and shorter_ws <= longer_ws:
                return 0.91
    return SequenceMatcher(None, _normalize_name(a), _normalize_name(b)).ratio()


def _match_score(
    bia_home: str,
    bia_away: str,
    pin_home: str,
    pin_away: str,
) -> tuple[float, bool]:
    """Return (score, swapped) for a BIA↔PIN name pair.

    Tries both orderings and returns the better one.
    """
    normal = min(_similarity(bia_home, pin_home), _similarity(bia_away, pin_away))
    swapped = min(_similarity(bia_home, pin_away), _similarity(bia_away, pin_home))
    if swapped > normal:
        return swapped, True
    return normal, False


def _normalize_league(name: str) -> str:
    """Normalize a league/competition name for loose comparison."""
    name = name.lower().strip()
    return re.sub(r"[^a-z0-9 ]", "", name).strip()


def _normalize_sport_name(name: str) -> str:
    """Canonicalize parser sport labels without weakening sport identity."""
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def _league_similarity(a: str, b: str) -> float:
    """SequenceMatcher ratio on normalized league names."""
    na, nb = _normalize_league(a), _normalize_league(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def build_exact_match_index(
    events_data: dict[int, dict[str, Any]],
) -> dict[tuple[str, str, str], list[tuple[int, str]]]:
    """Build a conservative exact-name index for fast BIA→Pid lookup.

    Key: (sport_name, normalized_home, normalized_away)
    Value: [(pid, league_name), ...]
    """
    index: dict[tuple[str, str, str], list[tuple[int, str]]] = defaultdict(list)
    for pid, game in list(events_data.items()):
        if not isinstance(game, dict):
            continue
        sport_name = _normalize_sport_name(game.get("SportName") or "")
        pin_home = str(game.get("homeName") or game.get("Home") or "").strip()
        pin_away = str(game.get("awayName") or game.get("Away") or "").strip()
        if not sport_name or not pin_home or not pin_away:
            continue
        home_variants = _name_variants(pin_home)
        away_variants = _name_variants(pin_away)
        if not home_variants or not away_variants:
            continue
        for norm_home in home_variants:
            for norm_away in away_variants:
                key = (sport_name, norm_home, norm_away)
                index[key].append((int(pid), str(game.get("LeagueName") or "")))
    return dict(index)


def _disambiguate_exact_candidates(
    candidates: list[tuple[int, bool, str]],
    *,
    bia_league: str,
) -> tuple[int | None, bool]:
    if len(candidates) == 1:
        pid, swapped, _league = candidates[0]
        return pid, swapped
    if not bia_league:
        return None, False
    best_pid: int | None = None
    best_swapped: bool = False
    best_league_sim = -1.0
    second_league_sim = -1.0
    for pid, swapped, league_name in candidates:
        lsim = _league_similarity(bia_league, league_name)
        if lsim > best_league_sim:
            second_league_sim = best_league_sim
            best_league_sim = lsim
            best_pid = pid
            best_swapped = swapped
        elif lsim > second_league_sim:
            second_league_sim = lsim
    if best_league_sim < 0.50:
        return None, False
    _LEAGUE_GAP = 0.15
    if (best_league_sim - second_league_sim) < _LEAGUE_GAP:
        return None, False
    return best_pid, best_swapped


def match_bia_event_exact(
    bia_home: str,
    bia_away: str,
    bia_sport: str,
    events_data: dict[int, dict[str, Any]],
    *,
    bia_league: str = "",
    exact_index: dict[tuple[str, str, str], list[tuple[int, str]]] | None = None,
) -> tuple[int | None, bool]:
    """Fast exact-name BIA event match.

    Uses normalized team names only and refuses ambiguous duplicates unless
    league context breaks the tie.
    """
    sport_name = BIA_SPORT_MAP.get(bia_sport, "")
    if not sport_name:
        return None, False
    home_variants = _name_variants(bia_home)
    away_variants = _name_variants(bia_away)
    if not home_variants or not away_variants:
        return None, False
    if exact_index is None:
        exact_index = build_exact_match_index(events_data)
    candidates: list[tuple[int, bool, str]] = []
    seen: set[tuple[int, bool]] = set()
    sport_key = _normalize_sport_name(sport_name)
    for norm_home in home_variants:
        for norm_away in away_variants:
            for pid, league_name in exact_index.get((sport_key, norm_home, norm_away), []):
                key = (pid, False)
                if key not in seen:
                    seen.add(key)
                    candidates.append((pid, False, league_name))
            for pid, league_name in exact_index.get((sport_key, norm_away, norm_home), []):
                key = (pid, True)
                if key not in seen:
                    seen.add(key)
                    candidates.append((pid, True, league_name))
    if not candidates:
        return None, False
    pid, swapped = _disambiguate_exact_candidates(candidates, bia_league=bia_league)  # type: ignore[assignment]
    if pid is None:
        return None, False
    game = events_data.get(pid, {})
    if not isinstance(game, dict):
        return None, False
    pin_home = str(game.get("homeName") or game.get("Home") or game.get("home") or "").strip()
    pin_away = str(game.get("awayName") or game.get("Away") or game.get("away") or "").strip()
    pin_league = str(game.get("LeagueName") or "")
    if _unsafe_team_pair(
        bia_home,
        bia_away,
        pin_home,
        pin_away,
        swapped=swapped,
        sport_name=sport_name,
        league_name=bia_league or pin_league,
    ):
        return None, False
    return pid, swapped


# Minimum score thresholds
_EXACT_THRESHOLD = 0.90   # deterministic match (both teams ≥ 0.90)
_FUZZY_THRESHOLD = 0.70   # conservative fuzzy fallback


_AMBIGUITY_GAP = 0.05  # second-best must be at least this far below best


def _neural_matcher_settings() -> tuple[int, float]:
    try:
        import config as _cfg
    except Exception:
        return 8, 0.55
    return (
        int(getattr(_cfg, "BIA_NEURAL_MATCHER_MAX_CANDIDATES", 8) or 8),
        float(getattr(_cfg, "BIA_NEURAL_MATCHER_MIN_CANDIDATE_SCORE", 0.55) or 0.55),
    )


def _build_neural_candidates(
    candidates: list[tuple[int, float, bool, str]],
    events_data: dict[int, dict[str, Any]],
    *,
    sport_name: str,
    max_candidates: int,
    min_candidate_score: float,
) -> list[BiaNeuralCandidate]:
    rows: list[BiaNeuralCandidate] = []
    seen: set[int] = set()
    for pid, score, swapped, pin_league in sorted(candidates, key=lambda item: item[1], reverse=True):
        if pid in seen or score < min_candidate_score:
            continue
        game = events_data.get(pid, {})
        if not isinstance(game, dict):
            continue
        pin_home = str(game.get("homeName") or game.get("Home") or game.get("home") or "").strip()
        pin_away = str(game.get("awayName") or game.get("Away") or game.get("away") or "").strip()
        if not pin_home or not pin_away:
            continue
        seen.add(pid)
        rows.append(
            BiaNeuralCandidate(
                pid=int(pid),
                home=pin_home,
                away=pin_away,
                league=str(pin_league or game.get("LeagueName") or ""),
                sport=sport_name,
                score=float(score),
                swapped=bool(swapped),
            )
        )
        if len(rows) >= max_candidates:
            break
    return rows


def _try_neural_match(
    *,
    bia_home: str,
    bia_away: str,
    bia_sport: str,
    bia_league: str,
    sport_name: str,
    candidates: list[tuple[int, float, bool, str]],
    events_data: dict[int, dict[str, Any]],
    neural_matcher: BiaNeuralMatcherProtocol | None,
    use_neural: bool | None,
) -> tuple[int | None, bool]:
    if use_neural is False:
        return None, False
    matcher = neural_matcher
    if matcher is None and use_neural is not False:
        matcher = _default_neural_matcher()
    if matcher is None:
        return None, False

    max_candidates, min_candidate_score = _neural_matcher_settings()
    neural_candidates = _build_neural_candidates(
        candidates,
        events_data,
        sport_name=sport_name,
        max_candidates=max_candidates,
        min_candidate_score=min_candidate_score,
    )
    if not neural_candidates:
        return None, False
    decision = matcher.match(
        bia_home=bia_home,
        bia_away=bia_away,
        bia_sport=bia_sport,
        bia_league=bia_league,
        candidates=neural_candidates,
    )
    if decision is None or decision.pid is None:
        return None, False
    if decision.pid not in {candidate.pid for candidate in neural_candidates}:
        return None, False
    game = events_data.get(decision.pid, {})
    if not isinstance(game, dict):
        return None, False
    pin_home = str(game.get("homeName") or game.get("Home") or game.get("home") or "").strip()
    pin_away = str(game.get("awayName") or game.get("Away") or game.get("away") or "").strip()
    pin_league = str(game.get("LeagueName") or "")
    if _unsafe_team_pair(
        bia_home,
        bia_away,
        pin_home,
        pin_away,
        swapped=decision.swapped,
        sport_name=sport_name,
        league_name=bia_league or pin_league,
    ):
        return None, False
    return decision.pid, decision.swapped


def match_bia_event(
    bia_home: str,
    bia_away: str,
    bia_sport: str,
    events_data: dict[int, dict[str, Any]],
    *,
    bia_league: str = "",
    neural_matcher: BiaNeuralMatcherProtocol | None = None,
    use_neural: bool | None = None,
) -> tuple[int | None, bool]:
    """Find the best-matching existing Pid for a BIA event.

    Returns (pid, swapped) or (None, False) if no confident match.
    When two or more candidates score above threshold with less than
    ``_AMBIGUITY_GAP`` between them the match is considered ambiguous
    and (None, False) is returned — prefer no-match over wrong-match.

    When *bia_league* is provided and team-name matching is ambiguous,
    league/competition similarity is used as a conservative tiebreaker.
    """
    sport_name = BIA_SPORT_MAP.get(bia_sport, "")
    if not sport_name or not bia_home or not bia_away:
        return None, False

    best_pid: int | None = None
    best_score: float = 0.0
    best_swapped: bool = False
    second_best_score: float = 0.0
    # Collect all candidates that clear the threshold for league disambiguation
    candidates: list[tuple[int, float, bool, str]] = []

    for pid, game in list(events_data.items()):
        if not isinstance(game, dict):
            continue
        # Filter by sport if we have a mapping
        if sport_name and _normalize_sport_name(game.get("SportName") or "") != _normalize_sport_name(sport_name):
            continue
        pin_home = str(game.get("homeName") or game.get("Home") or game.get("home") or "").strip()
        pin_away = str(game.get("awayName") or game.get("Away") or game.get("away") or "").strip()
        if not pin_home or not pin_away:
            continue

        score, swapped = _match_score(bia_home, bia_away, pin_home, pin_away)
        pin_league = str(game.get("LeagueName") or "")
        if _unsafe_team_pair(
            bia_home,
            bia_away,
            pin_home,
            pin_away,
            swapped=swapped,
            sport_name=sport_name,
            league_name=bia_league or pin_league,
        ):
            continue
        candidates.append((pid, score, swapped, pin_league))
        if score > best_score:
            second_best_score = best_score
            best_score = score
            best_pid = pid
            best_swapped = swapped
        elif score > second_best_score:
            second_best_score = score

    threshold = _EXACT_THRESHOLD if best_score >= _EXACT_THRESHOLD else _FUZZY_THRESHOLD
    if best_score < threshold:
        return _try_neural_match(
            bia_home=bia_home,
            bia_away=bia_away,
            bia_sport=bia_sport,
            bia_league=bia_league,
            sport_name=sport_name,
            candidates=candidates,
            events_data=events_data,
            neural_matcher=neural_matcher,
            use_neural=use_neural,
        )

    # Ambiguity guard: if the runner-up also clears the threshold and is
    # dangerously close to the winner, refuse the match — unless league
    # context can disambiguate.
    if second_best_score >= threshold and (best_score - second_best_score) < _AMBIGUITY_GAP:
        if not bia_league:
            return _try_neural_match(
                bia_home=bia_home,
                bia_away=bia_away,
                bia_sport=bia_sport,
                bia_league=bia_league,
                sport_name=sport_name,
                candidates=candidates,
                events_data=events_data,
                neural_matcher=neural_matcher,
                use_neural=use_neural,
            )
        # Attempt league-based disambiguation among tied candidates
        tied = [
            (pid, sc, sw, lg) for pid, sc, sw, lg in candidates
            if sc >= threshold and (best_score - sc) < _AMBIGUITY_GAP
        ]
        best_league_pid: int | None = None
        best_league_sim: float = -1.0
        best_league_swapped: bool = False
        second_league_sim: float = -1.0
        for pid, _sc, sw, pin_lg in tied:
            lsim = _league_similarity(bia_league, pin_lg)
            if lsim > best_league_sim:
                second_league_sim = best_league_sim
                best_league_sim = lsim
                best_league_pid = pid
                best_league_swapped = sw
            elif lsim > second_league_sim:
                second_league_sim = lsim
        # Only accept if league tiebreaker is decisive
        _LEAGUE_GAP = 0.15
        if best_league_sim >= 0.50 and (best_league_sim - second_league_sim) >= _LEAGUE_GAP:
            return best_league_pid, best_league_swapped
        return _try_neural_match(
            bia_home=bia_home,
            bia_away=bia_away,
            bia_sport=bia_sport,
            bia_league=bia_league,
            sport_name=sport_name,
            candidates=candidates,
            events_data=events_data,
            neural_matcher=neural_matcher,
            use_neural=use_neural,
        )

    return best_pid, best_swapped
