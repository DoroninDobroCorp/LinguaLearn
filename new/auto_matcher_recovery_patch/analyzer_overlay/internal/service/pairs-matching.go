package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"livebets/analazer/cmd/config"
	"livebets/analazer/internal/entity"
	priceStorage "livebets/analazer/internal/price-storage"
	"livebets/analazer/internal/repository"
	"livebets/analazer/internal/service/capture"
	"livebets/analazer/internal/service/tracker"
	bikeymap "livebets/analazer/pkg/bikey-map"
	"livebets/analazer/pkg/rdbms"
	"livebets/analazer/pkg/recovery"
	redis_client "livebets/analazer/pkg/redis"
	"livebets/analazer/pkg/utils"
	pkgutils "livebets/analazer/pkg/utils"
	"livebets/analazer/pkg/validation"
	"livebets/pkg/cache"
	"livebets/pkg/domain"
	pkgredis "livebets/pkg/redis"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/rs/zerolog"
)

const (
	roiLogMin       = 10.0
	roiSuspicionMax = 30.0

	// rawDataSaveInterval — минимальный интервал между сохранениями raw_data для одного матча+исхода
	rawDataSaveInterval = 5 * time.Minute
	// roiLogSampleInterval — минимальный интервал между ROI-лог записями для одного матча+исхода
	roiLogSampleInterval = 30 * time.Second
	// publicFilterLogInterval — минимальный интервал между public-filter diagnostic logs
	publicFilterLogInterval = 30 * time.Second
	// maxPrematchStartDelta prevents a shared team UUID from pairing two
	// different fixtures or provider schedules. A larger discrepancy must be
	// resolved in mapping data, never hidden inside price comparison.
	maxPrematchStartDelta = 30 * time.Minute
)

var (
	roiLoggerOnce sync.Once
	roiLogger     *zerolog.Logger
	roiLoggerErr  error

	// rawDataLastSave — дедупликация сохранений raw_data: key → last save time
	rawDataLastSave sync.Map // map[string]time.Time
	// roiLogLastWrite — дедупликация ROI-логов: key → last write time
	roiLogLastWrite sync.Map // map[string]time.Time
	// publicFilterLogLastWrite — дедупликация public filter diagnostic logs
	publicFilterLogLastWrite sync.Map // map[string]time.Time

	publicFilterPairsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "analyzer_public_filter_pairs_total",
			Help: "Total number of pairs hidden by analyzer public filtering",
		},
		[]string{"consumer", "reason", "sport", "mode"},
	)
	publicFilterOutcomesTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "analyzer_public_filter_outcomes_total",
			Help: "Total number of outcomes hidden by analyzer public filtering",
		},
		[]string{"consumer", "reason", "sport", "mode"},
	)
)

func prematchStartTimesCompatible(isLive bool, first, second time.Time) bool {
	if isLive || first.IsZero() || second.IsZero() {
		return true
	}
	// Some donor feeds expose only the calendar date. Their parser represents
	// that explicitly as the final nanosecond of the UTC day, so compare the
	// date rather than pretending that 23:59:59.999 is an exact kickoff time.
	if isDateOnlyMatchTime(first) || isDateOnlyMatchTime(second) {
		firstYear, firstMonth, firstDay := first.UTC().Date()
		secondYear, secondMonth, secondDay := second.UTC().Date()
		return firstYear == secondYear && firstMonth == secondMonth && firstDay == secondDay
	}
	delta := first.Sub(second)
	if delta < 0 {
		delta = -delta
	}
	return delta <= maxPrematchStartDelta
}

func isDateOnlyMatchTime(value time.Time) bool {
	utc := value.UTC()
	return utc.Hour() == 23 && utc.Minute() == 59 && utc.Second() == 59 && utc.Nanosecond() == int(time.Second-time.Nanosecond)
}

type hitInfo struct {
	Src    string
	League string
	Home   string
	Away   string
	ID     string
	At     string
}

// DBWriteTask represents a task for asynchronous DB insertion
type DBWriteTask struct {
	Source     string
	SportName  string
	LeagueName string
	HomeName   string
	AwayName   string
}

// uuidCacheEntry stores cached UUID results with timestamp
type uuidCacheEntry struct {
	result    map[string]string
	timestamp time.Time
}

// PairsSnapshot — атомарный снимок состояния пар, формируется в updatePairsCache
// send() читает готовый снимок вместо обхода нескольких кэшей (устраняет race condition)
type PairsSnapshot struct {
	LivePairedInfo     []entity.PairInfo
	PrematchPairedInfo []entity.PairInfo
}

type PairsMatchingService struct {
	txStorage       rdbms.TxStorage[repository.PairsMatchingStorage]
	redisClient     *redis_client.Redis
	matchDataCache  cache.MemoryCacheInterface[string, entity.GameData]
	matchKeysCache  cache.MemoryCacheInterface[string, cache.MemoryCacheInterface[string, string]]
	matchPairsCache bikeymap.BiKeyMapInterface[string, string]
	pairs           cache.MemoryCacheInterface[string, entity.ResponsePair]
	lowOddsPairs    cache.MemoryCacheInterface[string, entity.ResponsePair]
	receiveChan     <-chan entity.ReceivedMsg
	sendChan        chan<- entity.WebSocketMessage
	lowOddsSendChan chan<- entity.WebSocketMessage
	priceStorage    *priceStorage.PriceStorage
	logger          *zerolog.Logger
	validator       *validation.Validator
	cfg             config.PairsMatching // Config for thresholds and timeouts
	// lastChange хранит последнюю известную цену и время последнего изменения по ключу матча/исхода/источника
	lastChange sync.Map // map[string]lastChangeEntry, concurrent access from 24 workers
	// captureMgr управляет CSV-захватом цен по сигналу расхождения
	captureMgr *capture.PriceCaptureManager

	groupSignals *GroupSignalsService

	// highROITestTracker отслеживает тестовые сигналы (ROI >= 10%, держится 20+ сек)
	highROITestTracker *tracker.HighROITestTracker

	// DroidAnalyzer — отложенная фича для периодов тестирования (DroidEnabled=false по умолчанию)
	droidAnalyzer *DroidAnalyzer

	// Optimization: Async DB Write
	dbWriteChan chan DBWriteTask

	// Optimization: Cache for GetUUIDKeysWithPositions
	uuidCache    map[string]uuidCacheEntry
	uuidCacheMux sync.RWMutex

	// outcomeLastSeen tracks when each outcome was last received from parser
	// Key: "source|matchId|outcomeKey" → time.Time
	// Used to detect stale outcomes (disappeared from bookmaker but still in cache)
	// Works for both full-snapshot and delta parsers
	outcomeLastSeen sync.Map

	// pairFirstSeen tracks when each pair key was first seen in the pairs cache.
	// Used for stability filter: live pairs must exist ≥ min_stability_seconds before
	// being sent to frontend. Prevents flicker from transient pairs during score changes.
	pairFirstSeen sync.Map // map[string]time.Time

	// pairsSnapshot — атомарный снимок pairedInfo, обновляется в updatePairsCache
	pairsSnapshot atomic.Value // *PairsSnapshot
}

// lastChangeEntry описывает состояние последнего изменения цены
type lastChangeEntry struct {
	Price     float64
	ChangedAt time.Time
}

// updateOutcomeLastSeen extracts all outcomes from GameData and updates their timestamps
// Uses per-market timestamps from MarketTs when available (set by parser based on
// when PS3838 last confirmed each market type). Falls back to `now` if MarketTs is missing.
func (p *PairsMatchingService) updateOutcomeLastSeen(source, matchId string, gameData entity.GameData, now time.Time) {
	if gameData.Periods == nil || len(gameData.Periods) == 0 {
		return
	}

	// For Pinnacle we require explicit per-market timestamps for base markets.
	// If _market_ts key is missing, don't mark outcome as fresh.
	strictBaseTS := strings.EqualFold(source, "Pinnacle")

	// Helper: resolve timestamp for a given market key within a period.
	// strict=true means "no _market_ts => unknown freshness".
	marketTime := func(period entity.PeriodData, marketKey string, strict bool) (time.Time, bool) {
		if period.MarketTs != nil {
			if ts, ok := period.MarketTs[marketKey]; ok && ts > 0 {
				return time.Unix(int64(ts), int64((ts-float64(int64(ts)))*1e9)), true
			}
		}
		if strict {
			return time.Time{}, false
		}
		return now, true
	}

	// Helper to store outcome timestamp (also stores equivalent market keys).
	// Keeps the fresher (later) timestamp when multiple sources provide the same key.
	storeOutcome := func(outcomeKey string, ts time.Time) {
		key := fmt.Sprintf("%s|%s|%s", source, matchId, outcomeKey)
		if existing, loaded := p.outcomeLastSeen.Load(key); loaded {
			if et, ok := existing.(time.Time); ok && et.After(ts) {
				return // existing timestamp is fresher
			}
		}
		p.outcomeLastSeen.Store(key, ts)

		// Also store equivalent keys so stale check finds them via DonorOriginalKey
		prefix := ""
		baseKey := outcomeKey
		if len(outcomeKey) > 3 && outcomeKey[0] == 'P' && outcomeKey[1] >= '0' && outcomeKey[1] <= '9' && outcomeKey[2] == ' ' {
			prefix = outcomeKey[:3]
			baseKey = outcomeKey[3:]
		}
		canonical := getCanonicalKey(baseKey)
		if eqs, ok := equivalentMarkets[canonical]; ok {
			for _, eq := range eqs {
				if eq != baseKey {
					eqKey := fmt.Sprintf("%s|%s|%s%s", source, matchId, prefix, eq)
					if existing, loaded := p.outcomeLastSeen.Load(eqKey); loaded {
						if et, ok := existing.(time.Time); ok && et.After(ts) {
							continue
						}
					}
					p.outcomeLastSeen.Store(eqKey, ts)
				}
			}
		}
	}

	// Extract outcomes from first period (main markets)
	p0 := gameData.Periods[0]

	// 1X2
	if tsWin, ok := marketTime(p0, "Win1x2", strictBaseTS); ok {
		if p0.Win1x2.Win1.Value > 0 {
			storeOutcome("1", tsWin)
		}
		if p0.Win1x2.WinNone.Value > 0 {
			storeOutcome("X", tsWin)
		}
		if p0.Win1x2.Win2.Value > 0 {
			storeOutcome("2", tsWin)
		}
	}

	// Totals
	if tsTotals, ok := marketTime(p0, "Totals", strictBaseTS); ok {
		for k, t := range p0.Totals {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("T> %s", normKey), tsTotals)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("T< %s", normKey), tsTotals)
			}
		}
	}

	// First Team Totals
	if tsIT1, ok := marketTime(p0, "FirstTeamTotals", strictBaseTS); ok {
		for k, t := range p0.FirstTeamTotals {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("IT1> %s", normKey), tsIT1)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("IT1< %s", normKey), tsIT1)
			}
		}
	}

	// Second Team Totals
	if tsIT2, ok := marketTime(p0, "SecondTeamTotals", strictBaseTS); ok {
		for k, t := range p0.SecondTeamTotals {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("IT2> %s", normKey), tsIT2)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("IT2< %s", normKey), tsIT2)
			}
		}
	} else if strictBaseTS && len(p0.SecondTeamTotals) > 0 {
		var mtsKeys []string
		if p0.MarketTs != nil {
			for mk := range p0.MarketTs {
				mtsKeys = append(mtsKeys, mk)
			}
		}
		p.logger.Warn().
			Str("source", source).
			Str("matchId", matchId).
			Str("period", "P0").
			Int("it2_lines", len(p0.SecondTeamTotals)).
			Strs("market_ts_keys", mtsKeys).
			Msg("[FLICKER_DIAG] P0 IT2 data but no _market_ts SecondTeamTotals")
	}

	// Handicap
	if tsHcap, ok := marketTime(p0, "Handicap", strictBaseTS); ok {
		for k, h := range p0.Handicap {
			if h == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if h.Win1.Value > 0 {
				storeOutcome(fmt.Sprintf("H1 %s", normKey), tsHcap)
			}
			if h.Win2.Value > 0 {
				storeOutcome(fmt.Sprintf("H2 %s", normKey), tsHcap)
			}
			// DNB = Handicap 0 equivalence (Pinnacle has no DrawNoBet market)
			if normKey == "0" {
				if h.Win1.Value > 0 {
					storeOutcome("DNB 1", tsHcap)
				}
				if h.Win2.Value > 0 {
					storeOutcome("DNB 2", tsHcap)
				}
			}
		}
	}

	// Sets Total (Tennis, Volleyball)
	if tsST, ok := marketTime(p0, "SetsTotal", false); ok {
		for k, t := range p0.SetsTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome("Sets T> "+normKey, tsST)
			}
			if t.WinLess.Value > 0 {
				storeOutcome("Sets T< "+normKey, tsST)
			}
		}
	}
	// Sets Handicap (Tennis, Volleyball)
	if tsSH, ok := marketTime(p0, "SetsHandicap", false); ok {
		for k, h := range p0.SetsHandicap {
			if h == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if h.Win1.Value > 0 {
				storeOutcome("Sets H1 "+normKey, tsSH)
			}
			if h.Win2.Value > 0 {
				storeOutcome("Sets H2 "+normKey, tsSH)
			}
		}
	}
	// Corners Total
	if tsCT, ok := marketTime(p0, "CornersTotal", false); ok {
		for k, t := range p0.CornersTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("CT> %s", normKey), tsCT)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("CT< %s", normKey), tsCT)
			}
		}
	}
	// Corners Handicap
	if tsCH, ok := marketTime(p0, "CornersHandicap", false); ok {
		for k, h := range p0.CornersHandicap {
			if h == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if h.Win1.Value > 0 {
				storeOutcome(fmt.Sprintf("CH1 %s", normKey), tsCH)
			}
			if h.Win2.Value > 0 {
				storeOutcome(fmt.Sprintf("CH2 %s", normKey), tsCH)
			}
		}
	}
	// Corners First/Second Team Totals
	if tsCIT1, ok := marketTime(p0, "CornersFirstTeamTotal", false); ok {
		for k, t := range p0.CornersFirstTeamTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("CIT1> %s", normKey), tsCIT1)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("CIT1< %s", normKey), tsCIT1)
			}
		}
	}
	if tsCIT2, ok := marketTime(p0, "CornersSecondTeamTotal", false); ok {
		for k, t := range p0.CornersSecondTeamTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("CIT2> %s", normKey), tsCIT2)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("CIT2< %s", normKey), tsCIT2)
			}
		}
	}
	// Bookings Total
	if tsBkT, ok := marketTime(p0, "BookingsTotal", false); ok {
		for k, t := range p0.BookingsTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("BkT> %s", normKey), tsBkT)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("BkT< %s", normKey), tsBkT)
			}
		}
	}
	// Bookings Handicap
	if tsBkH, ok := marketTime(p0, "BookingsHandicap", false); ok {
		for k, h := range p0.BookingsHandicap {
			if h == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if h.Win1.Value > 0 {
				storeOutcome(fmt.Sprintf("BkH1 %s", normKey), tsBkH)
			}
			if h.Win2.Value > 0 {
				storeOutcome(fmt.Sprintf("BkH2 %s", normKey), tsBkH)
			}
		}
	}
	// Bookings First/Second Team Totals
	if tsBkIT1, ok := marketTime(p0, "BookingsFirstTeamTotal", false); ok {
		for k, t := range p0.BookingsFirstTeamTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("BkIT1> %s", normKey), tsBkIT1)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("BkIT1< %s", normKey), tsBkIT1)
			}
		}
	}
	if tsBkIT2, ok := marketTime(p0, "BookingsSecondTeamTotal", false); ok {
		for k, t := range p0.BookingsSecondTeamTotal {
			if t == nil {
				continue
			}
			normKey := normalizeOutcomeKey(k)
			if t.WinMore.Value > 0 {
				storeOutcome(fmt.Sprintf("BkIT2> %s", normKey), tsBkIT2)
			}
			if t.WinLess.Value > 0 {
				storeOutcome(fmt.Sprintf("BkIT2< %s", normKey), tsBkIT2)
			}
		}
	}

	// Specials for period 0 — use strict=false: specials arrive via MORE_BET
	// every ~11s, so _market_ts may be absent between refreshes. Falling back
	// to `now` ensures specials outcomes are tracked (not filtered as unseen).
	trackSpecialsLastSeen(p0, "", storeOutcome,
		func(marketKey string) (time.Time, bool) {
			return marketTime(p0, marketKey, false)
		},
	)

	// Player Props for period 0
	for _, prop := range p0.PlayerProps {
		normName := normalizePlayerPropName(prop.PlayerName)
		lineStr := formatLine(prop.Line)
		if prop.Over.Value > 0 {
			storeOutcome(fmt.Sprintf("PP %s %s> %s", normName, prop.Market, lineStr), now)
		}
		if prop.Under.Value > 0 {
			storeOutcome(fmt.Sprintf("PP %s %s< %s", normName, prop.Market, lineStr), now)
		}
	}

	// Period markets (P1, P2, etc.)
	for i := 1; i < len(gameData.Periods); i++ {
		period := gameData.Periods[i]
		prefix := fmt.Sprintf("P%d ", i)

		// Period Win1x2
		if pTsWin, ok := marketTime(period, "Win1x2", strictBaseTS); ok {
			if period.Win1x2.Win1.Value > 0 {
				storeOutcome(fmt.Sprintf("%s1", prefix), pTsWin)
			}
			if period.Win1x2.WinNone.Value > 0 {
				storeOutcome(fmt.Sprintf("%sX", prefix), pTsWin)
			}
			if period.Win1x2.Win2.Value > 0 {
				storeOutcome(fmt.Sprintf("%s2", prefix), pTsWin)
			}
		}
		// Period Totals
		if pTsTotals, ok := marketTime(period, "Totals", strictBaseTS); ok {
			for k, t := range period.Totals {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sT> %s", prefix, normKey), pTsTotals)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sT< %s", prefix, normKey), pTsTotals)
				}
			}
		}

		// Period Handicap
		if pTsHcap, ok := marketTime(period, "Handicap", strictBaseTS); ok {
			for k, h := range period.Handicap {
				if h == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if h.Win1.Value > 0 {
					storeOutcome(fmt.Sprintf("%sH1 %s", prefix, normKey), pTsHcap)
				}
				if h.Win2.Value > 0 {
					storeOutcome(fmt.Sprintf("%sH2 %s", prefix, normKey), pTsHcap)
				}
				// DNB = Handicap 0 equivalence for periods
				if normKey == "0" {
					if h.Win1.Value > 0 {
						storeOutcome(fmt.Sprintf("%sDNB 1", prefix), pTsHcap)
					}
					if h.Win2.Value > 0 {
						storeOutcome(fmt.Sprintf("%sDNB 2", prefix), pTsHcap)
					}
				}
			}
		}

		// Period Games
		if pTsGames, ok := marketTime(period, "Games", false); ok {
			for k, g := range period.Games {
				if g == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if g.Win1.Value > 0 {
					storeOutcome(fmt.Sprintf("%s1G %s", prefix, normKey), pTsGames)
				}
				if g.Win2.Value > 0 {
					storeOutcome(fmt.Sprintf("%s2G %s", prefix, normKey), pTsGames)
				}
			}
		}

		// Period IT1/IT2
		if pTsIT1, ok := marketTime(period, "FirstTeamTotals", strictBaseTS); ok {
			for k, t := range period.FirstTeamTotals {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sIT1> %s", prefix, normKey), pTsIT1)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sIT1< %s", prefix, normKey), pTsIT1)
				}
			}
		}
		if pTsIT2, ok := marketTime(period, "SecondTeamTotals", strictBaseTS); ok {
			for k, t := range period.SecondTeamTotals {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sIT2> %s", prefix, normKey), pTsIT2)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sIT2< %s", prefix, normKey), pTsIT2)
				}
			}
		} else if strictBaseTS && len(period.SecondTeamTotals) > 0 {
			var mtsKeys []string
			if period.MarketTs != nil {
				for mk := range period.MarketTs {
					mtsKeys = append(mtsKeys, mk)
				}
			}
			p.logger.Warn().
				Str("source", source).
				Str("matchId", matchId).
				Str("period", prefix).
				Int("it2_lines", len(period.SecondTeamTotals)).
				Strs("market_ts_keys", mtsKeys).
				Msg("[FLICKER_DIAG] IT2 data but no _market_ts SecondTeamTotals")
		}

		// Period Corners Total
		if pTsCT, ok := marketTime(period, "CornersTotal", false); ok {
			for k, t := range period.CornersTotal {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCT> %s", prefix, normKey), pTsCT)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCT< %s", prefix, normKey), pTsCT)
				}
			}
		}
		// Period Corners Handicap
		if pTsCH, ok := marketTime(period, "CornersHandicap", false); ok {
			for k, h := range period.CornersHandicap {
				if h == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if h.Win1.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCH1 %s", prefix, normKey), pTsCH)
				}
				if h.Win2.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCH2 %s", prefix, normKey), pTsCH)
				}
			}
		}
		// Period Corners First/Second Team Totals
		if pTsCIT1, ok := marketTime(period, "CornersFirstTeamTotal", false); ok {
			for k, t := range period.CornersFirstTeamTotal {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCIT1> %s", prefix, normKey), pTsCIT1)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCIT1< %s", prefix, normKey), pTsCIT1)
				}
			}
		}
		if pTsCIT2, ok := marketTime(period, "CornersSecondTeamTotal", false); ok {
			for k, t := range period.CornersSecondTeamTotal {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCIT2> %s", prefix, normKey), pTsCIT2)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sCIT2< %s", prefix, normKey), pTsCIT2)
				}
			}
		}
		// Period Bookings Total
		if pTsBkT, ok := marketTime(period, "BookingsTotal", false); ok {
			for k, t := range period.BookingsTotal {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkT> %s", prefix, normKey), pTsBkT)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkT< %s", prefix, normKey), pTsBkT)
				}
			}
		}
		// Period Bookings Handicap
		if pTsBkH, ok := marketTime(period, "BookingsHandicap", false); ok {
			for k, h := range period.BookingsHandicap {
				if h == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if h.Win1.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkH1 %s", prefix, normKey), pTsBkH)
				}
				if h.Win2.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkH2 %s", prefix, normKey), pTsBkH)
				}
			}
		}
		// Period Bookings First/Second Team Totals
		if pTsBkIT1, ok := marketTime(period, "BookingsFirstTeamTotal", false); ok {
			for k, t := range period.BookingsFirstTeamTotal {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkIT1> %s", prefix, normKey), pTsBkIT1)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkIT1< %s", prefix, normKey), pTsBkIT1)
				}
			}
		}
		if pTsBkIT2, ok := marketTime(period, "BookingsSecondTeamTotal", false); ok {
			for k, t := range period.BookingsSecondTeamTotal {
				if t == nil {
					continue
				}
				normKey := normalizeOutcomeKey(k)
				if t.WinMore.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkIT2> %s", prefix, normKey), pTsBkIT2)
				}
				if t.WinLess.Value > 0 {
					storeOutcome(fmt.Sprintf("%sBkIT2< %s", prefix, normKey), pTsBkIT2)
				}
			}
		}
		// Specials for period i — each market resolves its own timestamp
		// from MarketTs (set by parser from MORE_BET _{key}_ts).
		// Previously all specials shared a single BTTS timestamp, causing
		// phantom freshness when one market was stale but another was fresh.
		trackSpecialsLastSeen(period, prefix, storeOutcome,
			func(marketKey string) (time.Time, bool) {
				return marketTime(period, marketKey, false)
			},
		)
	}
}

// trackSpecialsLastSeen tracks BTTS, OddEven, DoubleChance, DrawNoBet, FirstTeamToScore,
// CorrectScore, WinningMargin etc. in outcomeLastSeen so the stale filter doesn't
// discard them. Keys must match DonorOriginalKey from extractAllDonorMarkets.
// Each market group resolves its own timestamp via resolveTs(marketKey) to avoid
// one market's freshness leaking into another (e.g. BTTS fresh ≠ 3WH fresh).
func trackSpecialsLastSeen(period entity.PeriodData, prefix string,
	storeOutcome func(string, time.Time),
	resolveTs func(string) (time.Time, bool)) {

	if period.BTTS != nil {
		if ts, ok := resolveTs("BTTS"); ok {
			if period.BTTS.Yes.Value > 0 {
				storeOutcome(prefix+"BTTS Yes", ts)
			}
			if period.BTTS.No.Value > 0 {
				storeOutcome(prefix+"BTTS No", ts)
			}
		}
	}
	if period.OddEven != nil {
		if ts, ok := resolveTs("OddEven"); ok {
			if period.OddEven.Yes.Value > 0 {
				storeOutcome(prefix+"OE Odd", ts)
			}
			if period.OddEven.No.Value > 0 {
				storeOutcome(prefix+"OE Even", ts)
			}
		}
	}
	if period.HomeOddEven != nil {
		if ts, ok := resolveTs("HomeOddEven"); ok {
			if period.HomeOddEven.Yes.Value > 0 {
				storeOutcome(prefix+"HOE Odd", ts)
			}
			if period.HomeOddEven.No.Value > 0 {
				storeOutcome(prefix+"HOE Even", ts)
			}
		}
	}
	if period.AwayOddEven != nil {
		if ts, ok := resolveTs("AwayOddEven"); ok {
			if period.AwayOddEven.Yes.Value > 0 {
				storeOutcome(prefix+"AOE Odd", ts)
			}
			if period.AwayOddEven.No.Value > 0 {
				storeOutcome(prefix+"AOE Even", ts)
			}
		}
	}
	if period.DoubleChance != nil {
		if ts, ok := resolveTs("DoubleChance"); ok {
			if period.DoubleChance.W1X.Value > 0 {
				storeOutcome(prefix+"DC 1X", ts)
			}
			if period.DoubleChance.WX2.Value > 0 {
				storeOutcome(prefix+"DC X2", ts)
			}
			if period.DoubleChance.W12.Value > 0 {
				storeOutcome(prefix+"DC 12", ts)
			}
		}
	}
	if period.DrawNoBet != nil {
		if ts, ok := resolveTs("DrawNoBet"); ok {
			if period.DrawNoBet.Home.Value > 0 {
				storeOutcome(prefix+"DNB 1", ts)
			}
			if period.DrawNoBet.Away.Value > 0 {
				storeOutcome(prefix+"DNB 2", ts)
			}
		}
	}
	if period.FirstTeamToScore != nil {
		if ts, ok := resolveTs("FirstTeamToScore"); ok {
			if period.FirstTeamToScore.Home.Value > 0 {
				storeOutcome(prefix+"FTS Home", ts)
			}
			if period.FirstTeamToScore.Away.Value > 0 {
				storeOutcome(prefix+"FTS Away", ts)
			}
			if period.FirstTeamToScore.Neither.Value > 0 {
				storeOutcome(prefix+"FTS Neither", ts)
			}
		}
	}
	if period.EitherTeamToScore != nil {
		if ts, ok := resolveTs("EitherTeamToScore"); ok {
			if period.EitherTeamToScore.Yes.Value > 0 {
				storeOutcome(prefix+"ETS Yes", ts)
			}
			if period.EitherTeamToScore.No.Value > 0 {
				storeOutcome(prefix+"ETS No", ts)
			}
		}
	}
	if period.HomeTeamToScore != nil {
		if ts, ok := resolveTs("HomeTeamToScore"); ok {
			if period.HomeTeamToScore.Yes.Value > 0 {
				storeOutcome(prefix+"HTS Yes", ts)
			}
			if period.HomeTeamToScore.No.Value > 0 {
				storeOutcome(prefix+"HTS No", ts)
			}
		}
	}
	if period.AwayTeamToScore != nil {
		if ts, ok := resolveTs("AwayTeamToScore"); ok {
			if period.AwayTeamToScore.Yes.Value > 0 {
				storeOutcome(prefix+"ATS Yes", ts)
			}
			if period.AwayTeamToScore.No.Value > 0 {
				storeOutcome(prefix+"ATS No", ts)
			}
		}
	}
	if ts, ok := resolveTs("CorrectScore"); ok {
		for key, odd := range period.CorrectScore {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"CS "+normalizeCSKey(key), ts)
			}
		}
	}
	if ts, ok := resolveTs("HalfTimeFullTime"); ok {
		for key, odd := range period.HalfTimeFullTime {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"HT/FT "+key, ts)
			}
		}
	}
	if period.ThreeWayHandicap != nil {
		if ts, ok := resolveTs("ThreeWayHandicap"); ok {
			for line, twh := range period.ThreeWayHandicap {
				if twh == nil {
					continue
				}
				normLine := normalize3WHLine(line)
				if twh.Home.Value > 0 {
					storeOutcome(prefix+"3WH "+normLine+" 1", ts)
				}
				if twh.Away.Value > 0 {
					storeOutcome(prefix+"3WH "+normLine+" 2", ts)
				}
				if twh.Draw.Value > 0 {
					storeOutcome(prefix+"3WH "+normLine+" X", ts)
				}
			}
		}
	}
	if ts, ok := resolveTs("MethodOfVictory"); ok {
		for key, odd := range period.MethodOfVictory {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"MOV "+key, ts)
			}
		}
	}
	if period.HomeWinToNil != nil {
		if ts, ok := resolveTs("HomeWinToNil"); ok {
			if period.HomeWinToNil.Yes.Value > 0 {
				storeOutcome(prefix+"HWN Yes", ts)
			}
			if period.HomeWinToNil.No.Value > 0 {
				storeOutcome(prefix+"HWN No", ts)
			}
		}
	}
	if period.AwayWinToNil != nil {
		if ts, ok := resolveTs("AwayWinToNil"); ok {
			if period.AwayWinToNil.Yes.Value > 0 {
				storeOutcome(prefix+"AWN Yes", ts)
			}
			if period.AwayWinToNil.No.Value > 0 {
				storeOutcome(prefix+"AWN No", ts)
			}
		}
	}
	if period.HomeWinMap != nil {
		if ts, ok := resolveTs("HomeWinMap"); ok {
			if period.HomeWinMap.Yes.Value > 0 {
				storeOutcome(prefix+"HomeWinMap Yes", ts)
			}
			if period.HomeWinMap.No.Value > 0 {
				storeOutcome(prefix+"HomeWinMap No", ts)
			}
		}
	}
	if period.AwayWinMap != nil {
		if ts, ok := resolveTs("AwayWinMap"); ok {
			if period.AwayWinMap.Yes.Value > 0 {
				storeOutcome(prefix+"AwayWinMap Yes", ts)
			}
			if period.AwayWinMap.No.Value > 0 {
				storeOutcome(prefix+"AwayWinMap No", ts)
			}
		}
	}
	if period.MapOvertime != nil {
		if ts, ok := resolveTs("MapOvertime"); ok {
			if period.MapOvertime.Yes.Value > 0 {
				storeOutcome(prefix+"MapOT Yes", ts)
			}
			if period.MapOvertime.No.Value > 0 {
				storeOutcome(prefix+"MapOT No", ts)
			}
		}
	}
	if ts, ok := resolveTs("BaronsTotal"); ok {
		for key, wlm := range period.BaronsTotal {
			if wlm != nil {
				if wlm.WinMore.Value > 0 {
					storeOutcome(prefix+"BaronsT>"+key, ts)
				}
				if wlm.WinLess.Value > 0 {
					storeOutcome(prefix+"BaronsT<"+key, ts)
				}
			}
		}
	}
	if ts, ok := resolveTs("DragonsTotal"); ok {
		for key, wlm := range period.DragonsTotal {
			if wlm != nil {
				if wlm.WinMore.Value > 0 {
					storeOutcome(prefix+"DragonsT>"+key, ts)
				}
				if wlm.WinLess.Value > 0 {
					storeOutcome(prefix+"DragonsT<"+key, ts)
				}
			}
		}
	}
	if ts, ok := resolveTs("TurretsTotal"); ok {
		for key, wlm := range period.TurretsTotal {
			if wlm != nil {
				if wlm.WinMore.Value > 0 {
					storeOutcome(prefix+"TurretsT>"+key, ts)
				}
				if wlm.WinLess.Value > 0 {
					storeOutcome(prefix+"TurretsT<"+key, ts)
				}
			}
		}
	}
	if period.FirstBaron != nil {
		if ts, ok := resolveTs("FirstBaron"); ok {
			if period.FirstBaron.Home.Value > 0 {
				storeOutcome(prefix+"1stBaron Home", ts)
			}
			if period.FirstBaron.Away.Value > 0 {
				storeOutcome(prefix+"1stBaron Away", ts)
			}
		}
	}
	if period.FirstBlood != nil {
		if ts, ok := resolveTs("FirstBlood"); ok {
			if period.FirstBlood.Home.Value > 0 {
				storeOutcome(prefix+"1stBlood Home", ts)
			}
			if period.FirstBlood.Away.Value > 0 {
				storeOutcome(prefix+"1stBlood Away", ts)
			}
		}
	}
	if period.FirstInhibitor != nil {
		if ts, ok := resolveTs("FirstInhibitor"); ok {
			if period.FirstInhibitor.Home.Value > 0 {
				storeOutcome(prefix+"1stInhib Home", ts)
			}
			if period.FirstInhibitor.Away.Value > 0 {
				storeOutcome(prefix+"1stInhib Away", ts)
			}
		}
	}
	if ts, ok := resolveTs("FirstToKills"); ok {
		for key, tw := range period.FirstToKills {
			if tw != nil {
				if tw.Home.Value > 0 {
					storeOutcome(prefix+"1stTo"+key+"K Home", ts)
				}
				if tw.Away.Value > 0 {
					storeOutcome(prefix+"1stTo"+key+"K Away", ts)
				}
			}
		}
	}
	if period.BothTeamsBaron != nil {
		if ts, ok := resolveTs("BothTeamsBaron"); ok {
			if period.BothTeamsBaron.Yes.Value > 0 {
				storeOutcome(prefix+"BTBaron Yes", ts)
			}
			if period.BothTeamsBaron.No.Value > 0 {
				storeOutcome(prefix+"BTBaron No", ts)
			}
		}
	}
	if period.BothTeamsDragon != nil {
		if ts, ok := resolveTs("BothTeamsDragon"); ok {
			if period.BothTeamsDragon.Yes.Value > 0 {
				storeOutcome(prefix+"BTDragon Yes", ts)
			}
			if period.BothTeamsDragon.No.Value > 0 {
				storeOutcome(prefix+"BTDragon No", ts)
			}
		}
	}
	if period.BothTeamsInhibitor != nil {
		if ts, ok := resolveTs("BothTeamsInhibitor"); ok {
			if period.BothTeamsInhibitor.Yes.Value > 0 {
				storeOutcome(prefix+"BTInhib Yes", ts)
			}
			if period.BothTeamsInhibitor.No.Value > 0 {
				storeOutcome(prefix+"BTInhib No", ts)
			}
		}
	}
	if period.ElderDragon != nil {
		if ts, ok := resolveTs("ElderDragon"); ok {
			if period.ElderDragon.Yes.Value > 0 {
				storeOutcome(prefix+"Elder Yes", ts)
			}
			if period.ElderDragon.No.Value > 0 {
				storeOutcome(prefix+"Elder No", ts)
			}
		}
	}
	if ts, ok := resolveTs("WinAndOverRounds"); ok {
		for key, yn := range period.WinAndOverRounds {
			if yn != nil {
				if yn.Yes.Value > 0 {
					storeOutcome(prefix+"WOR "+key+" Yes", ts)
				}
				if yn.No.Value > 0 {
					storeOutcome(prefix+"WOR "+key+" No", ts)
				}
			}
		}
	}
	if period.ToQualify != nil {
		if ts, ok := resolveTs("ToQualify"); ok {
			if period.ToQualify.Home.Value > 0 {
				storeOutcome(prefix+"TQ Home", ts)
			}
			if period.ToQualify.Away.Value > 0 {
				storeOutcome(prefix+"TQ Away", ts)
			}
		}
	}
	if ts, ok := resolveTs("WinnerTotalCombo"); ok {
		for key, odd := range period.WinnerTotalCombo {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"WTC "+key, ts)
			}
		}
	}
	if ts, ok := resolveTs("BTTSWinnerCombo"); ok {
		for key, odd := range period.BTTSWinnerCombo {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"BWC "+key, ts)
			}
		}
	}
	if ts, ok := resolveTs("BTTSTotalCombo"); ok {
		for key, odd := range period.BTTSTotalCombo {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"BTC "+key, ts)
			}
		}
	}
	if ts, ok := resolveTs("OddEvenTotalCombo"); ok {
		for key, odd := range period.OddEvenTotalCombo {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"OET "+key, ts)
			}
		}
	}
	if ts, ok := resolveTs("ExactTotalGoals"); ok {
		for key, odd := range period.ExactTotalGoals {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"ETG "+key, ts)
				// Derived canonical keys (mirrors canonicalizePinnacleMarkets)
				kl := strings.ToLower(strings.TrimSpace(key))
				if kl == "0" {
					storeOutcome(prefix+"T< 0.5", ts)
				} else if strings.HasSuffix(kl, "+") {
					if n, err := strconv.ParseFloat(strings.TrimSuffix(kl, "+"), 64); err == nil && n > 0 {
						storeOutcome(prefix+"T> "+formatLine(n-0.5), ts)
					}
				}
			}
		}
	}
	if ts, ok := resolveTs("TotalGoalsRange"); ok {
		for key, odd := range period.TotalGoalsRange {
			if odd != nil && odd.Value > 0 {
				normKey := normalizeTGRKey(key)
				storeOutcome(prefix+"TGR "+normKey, ts)
				// Derived canonical keys (mirrors canonicalizePinnacleMarkets)
				kl := strings.ToLower(strings.TrimSpace(normKey))
				if strings.HasSuffix(kl, "+") {
					if n, err := strconv.ParseFloat(strings.TrimSuffix(kl, "+"), 64); err == nil && n > 0 {
						storeOutcome(prefix+"T> "+formatLine(n-0.5), ts)
					}
				} else if strings.HasPrefix(kl, "0-") {
					parts := strings.SplitN(kl, "-", 2)
					if len(parts) == 2 {
						if n, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64); err == nil && n > 0 {
							storeOutcome(prefix+"T< "+formatLine(n+0.5), ts)
						}
					}
				}
			}
		}
	}
	if ts, ok := resolveTs("HomeExactGoals"); ok {
		for key, odd := range period.HomeExactGoals {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"HEG "+key, ts)
				// Derived canonical keys
				kl := strings.ToLower(strings.TrimSpace(key))
				if kl == "0" {
					storeOutcome(prefix+"IT1< 0.5", ts)
				} else if strings.HasSuffix(kl, "+") {
					if n, err := strconv.ParseFloat(strings.TrimSuffix(kl, "+"), 64); err == nil && n > 0 {
						storeOutcome(prefix+"IT1> "+formatLine(n-0.5), ts)
					}
				}
			}
		}
	}
	if ts, ok := resolveTs("AwayExactGoals"); ok {
		for key, odd := range period.AwayExactGoals {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"AEG "+key, ts)
				// Derived canonical keys
				kl := strings.ToLower(strings.TrimSpace(key))
				if kl == "0" {
					storeOutcome(prefix+"IT2< 0.5", ts)
				} else if strings.HasSuffix(kl, "+") {
					if n, err := strconv.ParseFloat(strings.TrimSuffix(kl, "+"), 64); err == nil && n > 0 {
						storeOutcome(prefix+"IT2> "+formatLine(n-0.5), ts)
					}
				}
			}
		}
	}
	if ts, ok := resolveTs("WinningMargin"); ok {
		for key, odd := range period.WinningMargin {
			if odd != nil && odd.Value > 0 {
				storeOutcome(prefix+"WM "+key, ts)
				// Derived canonical keys
				kl := strings.ToLower(key)
				if strings.Contains(kl, "no goal") || key == "0" {
					storeOutcome(prefix+"T< 0.5", ts)
				} else if strings.Contains(key, "+") {
					hcpKey := convertWMPlusToHandicap(key, prefix)
					if hcpKey != "" {
						storeOutcome(hcpKey, ts)
					}
				}
			}
		}
	}
}

// normalizeOutcomeKey normalizes numeric keys like "2.00" -> "2.0" for consistent matching
func normalizeOutcomeKey(s string) string {
	if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
		return formatLine(f)
	}
	return s
}

func getROILogger(fallback *zerolog.Logger) *zerolog.Logger {
	roiLoggerOnce.Do(func() {
		dir := "/logs/roi"
		if err := os.MkdirAll(dir, 0755); err != nil {
			roiLoggerErr = err
			return
		}
		path := filepath.Join(dir, "roi_mapping.log")
		file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			roiLoggerErr = err
			return
		}
		// Буферизированная запись — снижает количество syscalls и нагрузку на диск
		bw := bufio.NewWriterSize(file, 64*1024) // 64KB буфер
		// Фоновый flush каждые 5 секунд чтобы не терять данные
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			for range ticker.C {
				bw.Flush()
			}
		}()
		logger := zerolog.New(bw).With().Timestamp().Logger()
		roiLogger = &logger
	})
	if roiLoggerErr != nil || roiLogger == nil {
		return fallback
	}
	return roiLogger
}

// logROIMapping writes detailed mapping logs for ROI >= roiLogMin
func (p *PairsMatchingService) logROIMapping(first, second entity.GameData, outcomes []entity.Outcome, meta map[string]OddsWithMarketV2) {
	if len(outcomes) == 0 {
		return
	}

	now := time.Now()
	// Skip logging if either side's data is stale — prevents noisy false ROI entries
	maxAge := time.Duration(p.cfg.MaxPriceAgeSeconds) * time.Second
	if now.Sub(first.CreatedAt) > maxAge || now.Sub(second.CreatedAt) > maxAge {
		return
	}

	logger := getROILogger(p.logger)
	for _, out := range outcomes {
		if out.ROI < roiLogMin {
			continue
		}

		// Rate-limit: не логировать один и тот же матч+исход чаще чем раз в 30 сек
		dedupKey := fmt.Sprintf("roi|%s|%s|%s", first.MatchId, second.MatchId, out.Outcome)
		if lastWrite, ok := roiLogLastWrite.Load(dedupKey); ok {
			if now.Sub(lastWrite.(time.Time)) < roiLogSampleInterval {
				continue
			}
		}
		roiLogLastWrite.Store(dedupKey, now)

		level := "high"
		if out.ROI < roiSuspicionMax {
			level = "suspicion"
		}

		ev := logger.Info()
		if level == "high" {
			ev = logger.Warn()
		}

		ev = ev.
			Str("event", "roi_mapping").
			Str("roi_level", level).
			Float64("roi", out.ROI).
			Float64("margin", out.Margin).
			Str("outcome", out.Outcome).
			Bool("is_live", first.IsLive).
			Str("sport", first.SportName).
			Str("pinnacle", first.Source).
			Str("donor", second.Source).
			Str("match_id_pinnacle", first.MatchId).
			Str("match_id_donor", second.MatchId).
			Str("home_pinnacle", first.HomeName).
			Str("away_pinnacle", first.AwayName).
			Str("home_donor", second.HomeName).
			Str("away_donor", second.AwayName).
			Str("league_pinnacle", first.LeagueName).
			Str("league_donor", second.LeagueName).
			Float64("pinnacle_odds", out.Score1.Value).
			Float64("donor_odds", out.Score2.Value).
			Int("market_type", out.MarketType).
			Float64("donor_score_home", second.HomeScore).
			Float64("donor_score_away", second.AwayScore).
			Int("age_pinnacle_sec", int(now.Sub(first.CreatedAt).Seconds())).
			Int("age_donor_sec", int(now.Sub(second.CreatedAt).Seconds()))

		if first.TraceID != "" {
			ev = ev.Str("trace_id", first.TraceID)
		}
		if out.Score1.Raw != nil {
			ev = ev.Str("pinnacle_raw", fmt.Sprintf("%v", out.Score1.Raw))
		}
		if out.Score2.Raw != nil {
			ev = ev.Str("donor_raw", fmt.Sprintf("%v", out.Score2.Raw))
		}
		if meta != nil {
			if m, ok := meta[out.Outcome]; ok {
				ev = ev.
					Str("donor_key", m.DonorOriginalKey).
					Str("canonical_key", m.CanonicalKey).
					Bool("equivalence_applied", m.DonorOriginalKey != m.CanonicalKey)
				if len(m.PinnacleSources) > 0 {
					ev = ev.Strs("pinnacle_sources", m.PinnacleSources)
				}
				if m.PinnacleBestSource != "" {
					ev = ev.Str("pinnacle_best_source", m.PinnacleBestSource)
				}
			} else {
				ev = ev.Bool("v2_meta_missing", true)
			}
		}

		ev.Msg("[ROI_MAPPING]")
	}
}

// isOutcomeStale checks if an outcome is stale (not seen recently from parser)
// Returns true if outcome should be considered stale and filtered out
func (p *PairsMatchingService) isOutcomeStale(source, matchId, outcomeKey string, maxAge time.Duration) bool {
	key := fmt.Sprintf("%s|%s|%s", source, matchId, outcomeKey)
	lastSeen, ok := p.outcomeLastSeen.Load(key)
	if !ok {
		// Never seen this outcome - consider it stale
		return true
	}
	return time.Since(lastSeen.(time.Time)) > maxAge
}

// GetOutcomeAge returns how many seconds ago the outcome was last seen
// Returns -1 if outcome was never seen
func (p *PairsMatchingService) GetOutcomeAge(source, matchId, outcomeKey string) float64 {
	key := fmt.Sprintf("%s|%s|%s", source, matchId, outcomeKey)
	lastSeen, ok := p.outcomeLastSeen.Load(key)
	if !ok {
		return -1
	}
	return time.Since(lastSeen.(time.Time)).Seconds()
}

// GetOutcomeAgeWithFallback returns outcome age, trying PinnacleBestSource as fallback
// for synthesized outcomes (e.g. 3WH, DC) whose keys differ from Pinnacle native markets.
// Returns -1 only if both lookups fail.
func (p *PairsMatchingService) GetOutcomeAgeWithFallback(source, matchId, outcomeKey, pinnacleBestSource string) float64 {
	age := p.GetOutcomeAge(source, matchId, outcomeKey)
	if age < 0 && pinnacleBestSource != "" {
		age = p.GetOutcomeAge(source, matchId, pinnacleBestSource)
	}
	return age
}

// cleanLastChange removes stale entries from lastChange map.
// Called with a long TTL (4 hours) to avoid accumulation without disrupting change detection.
// After cleanup, the next price update for a given key is treated as "first seen" again —
// this causes at most one missed change-detection cycle (~30-60 sec) per key, harmless.
func (p *PairsMatchingService) cleanLastChange(maxAge time.Duration) {
	now := time.Now()
	p.lastChange.Range(func(key, value interface{}) bool {
		if now.Sub(value.(lastChangeEntry).ChangedAt) > maxAge {
			p.lastChange.Delete(key)
		}
		return true
	})
}

// cleanOutcomeLastSeen removes stale entries from outcomeLastSeen map
// Called periodically from cleanCaches
func (p *PairsMatchingService) cleanOutcomeLastSeen(maxAge time.Duration) {
	now := time.Now()
	p.outcomeLastSeen.Range(func(key, value interface{}) bool {
		if now.Sub(value.(time.Time)) > maxAge {
			p.outcomeLastSeen.Delete(key)
		}
		return true
	})
	// Также чистим dedup-кэши логов от устаревших записей
	rawDataLastSave.Range(func(key, value interface{}) bool {
		if now.Sub(value.(time.Time)) > 10*time.Minute {
			rawDataLastSave.Delete(key)
		}
		return true
	})
	roiLogLastWrite.Range(func(key, value interface{}) bool {
		if now.Sub(value.(time.Time)) > 2*time.Minute {
			roiLogLastWrite.Delete(key)
		}
		return true
	})
}

// logPinnacleMultiplePairs выводит LOG1: компактный список команд Pinnacle с >1 парой,
// затем отдельными строками выводит актуальные записи матчей за недавний период для любых из этих команд.
func (p *PairsMatchingService) logPinnacleMultiplePairs(ctx context.Context, cfg config.PairsMatching, wgMatchWork *sync.WaitGroup) {
	defer wgMatchWork.Done()
	defer recovery.RecoverPanic(p.logger, "logPinnacleMultiplePairs")

	// ОПТИМИЗАЦИЯ 2025-11-09: Интервал из конфига (default 20 сек для live, 60 для prematch)
	// Этот worker вызывает тяжелый SQL GetPinnacleMultiPairDetails, не должен работать слишком часто
	intervalSec := cfg.LogPinnacleInterval
	if intervalSec <= 0 {
		intervalSec = 20 // default 20 sec for backward compatibility
	}
	interval := time.Duration(intervalSec) * time.Second
	recentWindow := interval * 7 // "за последние итерации" — берем 7 интервалов (временно для тестов)
	ticker := time.NewTicker(interval)

	for {
		select {
		case <-ticker.C:
			// 1) Получаем список проблемных команд Pinnacle
			pairs, err := p.txStorage.Storage().GetPinnacleTeamsWithMultiplePairs(ctx)
			if err != nil {
				// p.logger.Error().Err(err).Msg("[LOG1] fetch pinnacle multi-pair teams error")
				continue
			}

			if len(pairs) == 0 {
				// p.logger.Info().Msg("[LOG1] нет Pinnacle-команд с более чем одной парой")
				continue
			}

			// Подготовим алиасы для сопоставления по всем БК (без ограничений по конторам)
			// Оптимизированный нормалайзер с кэшированием
			// TEST: Verify match finding still works correctly after optimization
			normalize := func(s string) string {
				// Use caching to avoid recomputing same strings
				return pkgutils.NormalizeWithCache(s, func(input string) string {
					// Use string builder pool for efficient string building
					sb := pkgutils.GetStringBuilder()
					defer pkgutils.PutStringBuilder(sb)

					input = strings.ToLower(input)

					// Apply all replacements in one pass using builder
					for _, r := range input {
						switch r {
						case '.':
							continue // skip dots
						case '\u00A0': // NBSP
							sb.WriteRune(' ')
						case '\u2019', '`':
							sb.WriteRune('\'')
						case '\u2011', '\u2013', '\u2014': // various hyphens
							sb.WriteRune('-')
						// Diacritics
						case 'á', 'à', 'ä', 'â', 'ã':
							sb.WriteRune('a')
						case 'é', 'è', 'ë', 'ê':
							sb.WriteRune('e')
						case 'í', 'ì', 'ï', 'î':
							sb.WriteRune('i')
						case 'ó', 'ò', 'ö', 'ô', 'õ':
							sb.WriteRune('o')
						case 'ú', 'ù', 'ü', 'û':
							sb.WriteRune('u')
						case 'ñ':
							sb.WriteRune('n')
						case 'ç':
							sb.WriteRune('c')
						default:
							sb.WriteRune(r)
						}
					}

					// Clean up slashes and whitespace
					result := sb.String()
					result = strings.ReplaceAll(result, " / ", "/")
					result = strings.ReplaceAll(result, " /", "/")
					result = strings.ReplaceAll(result, "/ ", "/")
					result = strings.Join(strings.Fields(result), " ")
					return result
				})
			}

			// Извлечение исходов и их цен из GameData для LOG3 (основной период + основные рынки)
			extractOutcomes := func(gd entity.GameData) map[string]float64 {
				res := make(map[string]float64)
				if gd.Periods == nil || len(gd.Periods) == 0 {
					return res
				}
				// normalize numeric keys like "2.00" -> "2.0" for stable cross-book matching
				normKeyFloat1 := func(s string) string {
					if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
						return formatLine(f)
					}
					return s
				}
				p0 := gd.Periods[0]
				// 1X2
				if v := p0.Win1x2.Win1.Value; v > 0 {
					res["1"] = v
				}
				if v := p0.Win1x2.WinNone.Value; v > 0 {
					res["X"] = v
				}
				if v := p0.Win1x2.Win2.Value; v > 0 {
					res["2"] = v
				}
				// Totals
				for k, t := range p0.Totals {
					if t == nil {
						continue
					}
					k = normKeyFloat1(k)
					if v := t.WinMore.Value; v > 0 {
						res[fmt.Sprintf("T> %s", k)] = v
					}
					if v := t.WinLess.Value; v > 0 {
						res[fmt.Sprintf("T< %s", k)] = v
					}
				}
				// IT1 / IT2 Totals
				for k, t := range p0.FirstTeamTotals {
					if t == nil {
						continue
					}
					k = normKeyFloat1(k)
					if v := t.WinMore.Value; v > 0 {
						res[fmt.Sprintf("IT1> %s", k)] = v
					}
					if v := t.WinLess.Value; v > 0 {
						res[fmt.Sprintf("IT1< %s", k)] = v
					}
				}
				for k, t := range p0.SecondTeamTotals {
					if t == nil {
						continue
					}
					k = normKeyFloat1(k)
					if v := t.WinMore.Value; v > 0 {
						res[fmt.Sprintf("IT2> %s", k)] = v
					}
					if v := t.WinLess.Value; v > 0 {
						res[fmt.Sprintf("IT2< %s", k)] = v
					}
				}
				// Handicap
				for k, h := range p0.Handicap {
					if h == nil {
						continue
					}
					k = normKeyFloat1(k)
					if v := h.Win1.Value; v > 0 {
						res[fmt.Sprintf("H1 %s", k)] = v
					}
					if v := h.Win2.Value; v > 0 {
						res[fmt.Sprintf("H2 %s", k)] = v
					}
				}
				return res
			}

			// Небольшой epsilon для сравнения float при определении фактического изменения цены
			const epsilon float64 = 1e-4
			// Нормализация названий видов спорта: сводим синонимы к одному значению
			normalizeSport := func(s string) string {
				s = strings.TrimSpace(strings.ToLower(s))
				switch s {
				case "soccer", "football", "futbol", "fútbol":
					return "soccer"
				default:
					return s
				}
			}
			type groupKey struct{ sport, pinn string }
			aliasSetByGroup := make(map[groupKey]map[string]struct{}) // [group]set(alias_name lower)

			for _, it := range pairs {
				gk := groupKey{sport: strings.ToLower(it.Sport), pinn: it.Team}
				if _, ok := aliasSetByGroup[gk]; !ok {
					aliasSetByGroup[gk] = map[string]struct{}{}
				}
				// добавляем само название Pinnacle как алиас (lower, на случай подстановок источника)
				aliasSetByGroup[gk][normalize(it.Team)] = struct{}{}
			}

			// 1b) Подтянем детальные пары алиасов (все конторы)
			details, err := p.txStorage.Storage().GetPinnacleMultiPairDetails(ctx)
			if err != nil {
				// p.logger.Error().Err(err).Msg("[LOG1] fetch pinnacle multi-pair details error")
			} else {
				for _, d := range details {
					gk := groupKey{sport: strings.ToLower(d.Sport), pinn: d.PinnTeam}
					bucket, ok := aliasSetByGroup[gk]
					if !ok {
						// если команда есть в деталях, но её не было в агрегации >1, пропустим
						continue
					}
					// Добавляем алиас команды независимо от БК (lower)
					bucket[normalize(d.AliasTeam)] = struct{}{}
				}
			}

			// 2) Убираем сводный список команд из LOG1 (для читаемости во время отладки StarCasino)

			// 3) Пробегаем актуальные записи по кэшу за последнее время и печатаем отдельными строками
			now := time.Now()
			data := p.matchDataCache.ReadAll()
			// агрегируем источники и детали матчей, найденные по каждой группе
			sourcesByGroup := make(map[groupKey]map[string]struct{})
			groupHits := make(map[groupKey]map[string]hitInfo) // [group][src] -> details
			// также агрегируем на уровне матча (sport + unordered teams), чтобы объединять попадания из разных Pinnacle-якорей
			sourcesByMatch := make(map[string]map[string]struct{})
			matchHits := make(map[string]map[string]hitInfo) // [matchKey][src] -> details
			// агрегатор исходов: [matchKey][outcomeKey][src] -> price
			outcomesByMatch := make(map[string]map[string]map[string]float64)
			// ремап исходов, если ориентация home/away у источника отличается от канонического порядка (mkey использует лекс. порядок команд)
			remapOutcomesIfFlipped := func(in map[string]float64, flipped bool) map[string]float64 {
				if !flipped {
					return in
				}
				out := make(map[string]float64, len(in))
				for k, v := range in {
					switch {
					case k == "1":
						out["2"] = v
					case k == "2":
						out["1"] = v
					case k == "DC 1X":
						out["DC X2"] = v
					case k == "DC X2":
						out["DC 1X"] = v
					case k == "DNB 1":
						out["DNB 2"] = v
					case k == "DNB 2":
						out["DNB 1"] = v
					case strings.HasPrefix(k, "IT1>"):
						out["IT2> "+strings.TrimSpace(strings.TrimPrefix(k, "IT1>"))] = v
					case strings.HasPrefix(k, "IT1<"):
						out["IT2< "+strings.TrimSpace(strings.TrimPrefix(k, "IT1<"))] = v
					case strings.HasPrefix(k, "IT2>"):
						out["IT1> "+strings.TrimSpace(strings.TrimPrefix(k, "IT2>"))] = v
					case strings.HasPrefix(k, "IT2<"):
						out["IT1< "+strings.TrimSpace(strings.TrimPrefix(k, "IT2<"))] = v
					case strings.HasPrefix(k, "H1 "):
						out["H2 "+strings.TrimSpace(strings.TrimPrefix(k, "H1 "))] = v
					case strings.HasPrefix(k, "H2 "):
						out["H1 "+strings.TrimSpace(strings.TrimPrefix(k, "H2 "))] = v
					default:
						// Тоталы (T>, T<) и X не зависят от ориентации
						out[k] = v
					}
				}
				return out
			}
			{
				have := map[string]map[string]int{}
				for _, dm := range data {
					h := normalize(dm.HomeName)
					a := normalize(dm.AwayName)
					if strings.Contains(h, "pantoja") || strings.Contains(a, "pantoja") || strings.Contains(h, "san cristobal") || strings.Contains(a, "san cristobal") {
						sp := normalizeSport(string(dm.SportName))
						if _, ok := have[dm.Source]; !ok {
							have[dm.Source] = map[string]int{}
						}
						have[dm.Source][sp]++
					}
				}
				// if len(have) > 0 {
				// 	p.logger.Info().Msg(fmt.Sprintf("[LOG_PANTOJA_SRC] %v", have))
				// }
			}

			for _, m := range data {
				// Фильтр по времени
				homeNorm := normalize(m.HomeName)
				awayNorm := normalize(m.AwayName)
				// таргетная отладка только для кейса pantoja/san cristobal
				isPantojaDebug := strings.Contains(homeNorm, "pantoja") || strings.Contains(awayNorm, "pantoja") || strings.Contains(homeNorm, "san cristobal") || strings.Contains(awayNorm, "san cristobal")
				if !isPantojaDebug {
					if !m.CreatedAt.IsZero() && now.Sub(m.CreatedAt) > recentWindow {
						continue
					}
				}
				sport := strings.TrimSpace(strings.ToLower(string(m.SportName)))
				src := m.Source
				// нормализуем имена команд к lower
				homeLower := homeNorm
				awayLower := awayNorm

				matched := false
				for gk, aliasSet := range aliasSetByGroup {
					// Матчим только по спорту (регистронезависимо). Лиги у разных БК могут отличаться
					if normalizeSport(gk.sport) != normalizeSport(sport) {
						// if isPantojaDebug {
						// 	p.logger.Info().Msg(fmt.Sprintf("[LOG_PANTOJA_SPORT_SKIP] src=%s | sport=%s -> %s | gk.sport=%s -> %s",
						// 		src, sport, normalizeSport(sport), gk.sport, normalizeSport(gk.sport)))
						// }
						continue
					}
					// проверяем по всем алиасам
					_, inHome := aliasSet[homeLower]
					_, inAway := aliasSet[awayLower]

					// if isPantojaDebug {
					// 	p.logger.Info().Msg(fmt.Sprintf("[LOG_PANTOJA_DBG] src=%s | sport=%s | gk={sport=%s pinn=%s} | inHome=%v inAway=%v | aliases_size=%d",
					// 		src, sport, gk.sport, gk.pinn, inHome, inAway, len(aliasSet)))
					// }

					if inHome || inAway {
						// if isPantojaDebug {
						// 	p.logger.Info().Msg(fmt.Sprintf("[LOG_PANTOJA_HIT] pinn=%q | src=%s | id=%v | %s vs %s",
						// 		gk.pinn, src, m.MatchId, m.HomeName, m.AwayName))
						// }
						matched = true
						if _, ok := sourcesByGroup[gk]; !ok {
							sourcesByGroup[gk] = map[string]struct{}{}
						}
						sourcesByGroup[gk][src] = struct{}{}
						if _, ok := groupHits[gk]; !ok {
							groupHits[gk] = make(map[string]hitInfo)
						}
						groupHits[gk][src] = hitInfo{
							Src:    src,
							League: m.LeagueName,
							Home:   m.HomeName,
							Away:   m.AwayName,
							ID:     fmt.Sprintf("%v", m.MatchId),
							At:     m.CreatedAt.Format(time.RFC3339),
						}
						// агрегируем на уровне матча
						nHome := homeLower
						nAway := awayLower
						if nAway < nHome { // приводим к безпорядковому ключу
							nHome, nAway = nAway, nHome
						}
						mkey := fmt.Sprintf("%s|%s|%s", normalizeSport(sport), nHome, nAway)
						if _, ok := sourcesByMatch[mkey]; !ok {
							sourcesByMatch[mkey] = make(map[string]struct{})
						}
						sourcesByMatch[mkey][src] = struct{}{}
						if _, ok := matchHits[mkey]; !ok {
							matchHits[mkey] = make(map[string]hitInfo)
						}
						matchHits[mkey][src] = hitInfo{
							Src:    src,
							League: m.LeagueName,
							Home:   m.HomeName,
							Away:   m.AwayName,
							ID:     fmt.Sprintf("%v", m.MatchId),
							At:     m.CreatedAt.Format(time.RFC3339),
						}
						// Накапливаем исходы и их цены для LOG3
						if _, ok := outcomesByMatch[mkey]; !ok {
							outcomesByMatch[mkey] = make(map[string]map[string]float64)
						}
						// если исходный home отличается от nHome, то перевернуты роли — ремапим исходы
						flipped := homeLower != nHome
						for oKey, price := range remapOutcomesIfFlipped(extractOutcomes(m), flipped) {
							if _, ok := outcomesByMatch[mkey][oKey]; !ok {
								outcomesByMatch[mkey][oKey] = make(map[string]float64)
							}
							outcomesByMatch[mkey][oKey][src] = price

							// Обновление времени последнего изменения для ключа (mkey|oKey|src)
							lcKey := fmt.Sprintf("%s|%s|%s", mkey, oKey, src)
							if raw, ok := p.lastChange.Load(lcKey); !ok {
								p.lastChange.Store(lcKey, lastChangeEntry{Price: price, ChangedAt: m.CreatedAt})
							} else {
								entry := raw.(lastChangeEntry)
								// предыдущая цена из lastChange — устойчивый источник между тиками
								prev := entry.Price
								if math.Abs(prev-price) > epsilon {
									entry.Price = price
									entry.ChangedAt = m.CreatedAt
									p.lastChange.Store(lcKey, entry)
									// Детектор снижения + триггер CSV-захвата
									if p.captureMgr != nil && p.captureMgr.Cfg.Enable {
										skipTrigger := false
										dropPct := 0.03
										if p.captureMgr.Cfg.DropPct > 0 {
											dropPct = p.captureMgr.Cfg.DropPct
										}
										if prev > 0 {
											relDrop := (prev - price) / prev
											if relDrop < dropPct {
												skipTrigger = true
											}
										}
										// фильтр по диапазону коэффициента
										if price < 1.1 || price > 4.0 {
											// вне интересующего диапазона — пропускаем триггер
											skipTrigger = true
										}
										if !skipTrigger {
											bySrc := outcomesByMatch[mkey][oKey]
											if len(bySrc) >= p.captureMgr.Cfg.MinBooks {
												// найти max и min и проверить, что новая цена — действительно минимум группы
												var maxV, minV float64
												first := true
												for _, v := range bySrc {
													if first {
														maxV, minV, first = v, v, false
													} else {
														if v > maxV {
															maxV = v
														}
														if v < minV {
															minV = v
														}
													}
												}
												// новая цена должна быть минимальной
												ratio := 0.0
												if minV > 0 {
													ratio = maxV / minV
												}
												// использовать MinRatio если задан, иначе Threshold (обратная совместимость)
												minRatio := p.captureMgr.Cfg.Threshold
												if p.captureMgr.Cfg.MinRatio > 0 {
													minRatio = p.captureMgr.Cfg.MinRatio
												}
												if ratio >= minRatio {
													// отладочное логирование решения
													// p.logger.Info().Msg(fmt.Sprintf("[CAPTURE_DBG_TRIGGER] mkey=%s | oKey=%s | src=%s | prev=%.3f new=%.3f | max=%.3f min=%.3f ratio=%.3f books=%d", mkey, oKey, src, prev, price, maxV, minV, ratio, len(bySrc)))
													_ = p.captureMgr.StartIfEligible(mkey, oKey, bySrc, src, prev, price, maxV, minV, ratio, time.Now())
												}
											}
										}
									}
									p.captureMgr.AppendIfActive(mkey, oKey, src, prev, price, outcomesByMatch[mkey][oKey], time.Now())
								}
							}
						}
						// 	p.logger.Info().Msg(fmt.Sprintf("[LOG2_DBG] mkey=%s | size=%d (added %s)", mkey, len(sourcesByMatch[mkey]), src))
						// }
						// логируем конкретную запись
						// p.logger.Info().Msg(fmt.Sprintf("[LOG1] LIVE=%v | %s | %s | %s vs %s | id=%v | src=%s | at=%s",
						// 	m.IsLive, sport, m.LeagueName, m.HomeName, m.AwayName, m.MatchId, src, m.CreatedAt.Format(time.RFC3339)))
						break
					}
				}
				if !matched {
					continue
				}
			}

			// 4) LOG2: группы, где есть цены от 3+ букмекеров. Сводка по матч-ключу (объединяет попадания разных Pinnacle-якорей).
			// ОТКЛЮЧЕНО ПОСЛЕ ВАЛИДАЦИИ LOG3. Оставлено закомментированным для возможной отладки в будущем.
			// for mkey, srcs := range sourcesByMatch {
			// 	if len(srcs) >= 3 {
			// 		// собираем краткие детали по источникам
			// 		details := make([]string, 0, len(srcs))
			// 		for src := range srcs {
			// 			if info, ok := matchHits[mkey][src]; ok {
			// 				details = append(details, fmt.Sprintf("%s[id=%s|%s vs %s|%s]", info.Src, info.ID, info.Home, info.Away, info.League))
			// 			} else {
			// 				details = append(details, src)
			// 			}
			// 		}
			// 		p.logger.Info().Msg(fmt.Sprintf("[LOG2] %s | sources=%d | %s", mkey, len(srcs), strings.Join(details, "; ")))
			// 	}
			//            // 5) LOG3: для каждого матча вывести все исходы, которые присутствуют у 3+ букмекеров, с ценами по каждому БК
			// for mkey, outcomes := range outcomesByMatch {
			//     for oKey, bySrc := range outcomes {
			//         if len(bySrc) < 3 {
			//             continue
			//         }
			//         // отсортируем источники для стабильного вывода
			//         srcs := make([]string, 0, len(bySrc))
			//         for s := range bySrc {
			//             srcs = append(srcs, s)
			//         }
			//         // Здесь был экспериментальный блок LOG3; отключён как нестабильный.
			//         // p.logger.Info().Msg(fmt.Sprintf("[LOG7] %s | %s | books=%d", mkey, oKey, len(bySrc)))
			//     }
			// }
			// Краткая сводка: количество матч-групп, где есть цены от 3+ букмекеров
			// Используем sourcesByMatch, который агрегирует источники по matchKey
			{
				countGroups3Plus := 0
				for _, srcs := range sourcesByMatch {
					if len(srcs) >= 3 {
						countGroups3Plus++
					}
				}
				// Выводим краткую метрику в стиле существующих счетчиков
				// fmt.Printf("Match Groups3+ - %d\n", countGroups3Plus)
			}

			nowForSignals := time.Now()
			for mkey, outcomes := range outcomesByMatch {
				sportName := strings.Split(mkey, "|")[0]
				currentMatchHits := matchHits[mkey]
				for oKey, bySrc := range outcomes {
					// Передаем собранные данные в сервис групповых сигналов
					p.groupSignals.OnOutcomes(mkey, oKey, bySrc, nowForSignals, sportName, outcomes, currentMatchHits)
				}
			}
			// Закрываем просроченные сессии для обоих менеджеров
			if p.captureMgr != nil {
				p.captureMgr.CloseExpired(nowForSignals)
			}
			if p.groupSignals != nil {
				p.groupSignals.CloseExpired(nowForSignals)
			}

		case <-ctx.Done():
			ticker.Stop()
			return
		}
		// ...
	}
}

func NewPairsMatchingService(
	cfg config.PairsMatching,
	txStorage rdbms.TxStorage[repository.PairsMatchingStorage],
	redisClient *redis_client.Redis,
	receiveChan <-chan entity.ReceivedMsg,
	sendChan chan<- entity.WebSocketMessage,
	lowOddsSendChan chan<- entity.WebSocketMessage,
	priceStorage *priceStorage.PriceStorage,
	logger *zerolog.Logger,
) *PairsMatchingService {
	matchDataCache := cache.NewMemoryCache[string, entity.GameData]()
	matchKeysCache := cache.NewMemoryCache[string, cache.MemoryCacheInterface[string, string]]()
	matchPairsCache := bikeymap.NewBiKeyMap[string, string]()
	pairs := cache.NewMemoryCache[string, entity.ResponsePair]()
	lowOddsPairs := cache.NewMemoryCache[string, entity.ResponsePair]()
	// Capture manager ОТКЛЮЧЕН - файлы не используются (реальные ставки идут через calculator)
	capCfg := capture.PriceCaptureConfig{
		Enable:          false,
		Threshold:       1.05,
		SessionDuration: 3 * time.Minute,
		MinBooks:        3,
		Epsilon:         1e-4,
		OutputDir:       "logs/bets/analyzer_captures", // Отдельная директория для analyzer (не используется tg_livebot)
		MaxConcurrent:   50,
		Cooldown:        5 * time.Minute,
		// new thresholds
		DropPct:          0.03,  // 3%
		MinRatio:         1.10,  // 1.10
		SecondDropPct:    0.03,  // 3%
		MaxRisePct:       0.015, // 1.5%
		SpecialOutputDir: "logs/bets/captures_special",
	}
	// allow overriding from environment
	capCfg = capture.LoadPriceCaptureConfigFromEnv(capCfg)
	capMgr := capture.NewPriceCaptureManager(capCfg, logger)

	groupCfg := GroupSignalsConfig{ // ОТКЛЮЧЕНО - групповые сигналы не используются
		Enable:          false,
		MinSources:      3,
		MinRatio:        1.13, // PROD: требуем минимум 13% разницы между макс и мин ценой
		HoldSeconds:     3,
		SessionDuration: 3 * time.Minute,
		OutputDir:       "logs/bets/groups", // Используем отдельную папку для групповых
		Epsilon:         0.0001,
		MaxConcurrent:   50,
		Cooldown:        5 * time.Minute,
	}
	// Позволяем переопределить значения из переменных окружения
	groupCfg = LoadGroupSignalsConfigFromEnv(groupCfg)
	groupSignalsSvc := NewGroupSignalsService(groupCfg, &cfg, txStorage)

	return &PairsMatchingService{
		txStorage:          txStorage,
		redisClient:        redisClient,
		receiveChan:        receiveChan,
		matchDataCache:     matchDataCache,
		matchKeysCache:     matchKeysCache,
		matchPairsCache:    matchPairsCache,
		pairs:              pairs,
		lowOddsPairs:       lowOddsPairs,
		sendChan:           sendChan,
		lowOddsSendChan:    lowOddsSendChan,
		priceStorage:       priceStorage,
		logger:             logger,
		validator:          validation.NewValidator(),
		cfg:                cfg,
		captureMgr:         capMgr,
		groupSignals:       groupSignalsSvc,
		highROITestTracker: tracker.NewHighROITestTracker(),
		droidAnalyzer:      NewDroidAnalyzer(logger),
		dbWriteChan:        make(chan DBWriteTask, 1000),
		uuidCache:          make(map[string]uuidCacheEntry),
	}
}

func (p *PairsMatchingService) Run(ctx context.Context, cfg config.PairsMatching, wg *sync.WaitGroup) {
	defer wg.Done()
	wgMatchWork := &sync.WaitGroup{}

	for i := 0; i < cfg.ReceiveWorkersCount; i++ {
		wgMatchWork.Add(1)
		go p.workerMatchData(ctx, wgMatchWork)
	}

	wgMatchWork.Add(1)
	go p.cleanCaches(ctx, cfg, wgMatchWork)

	wgMatchWork.Add(1)
	go p.updateKeysCache(ctx, cfg, wgMatchWork)

	wgMatchWork.Add(1)
	go p.updatePairsCache(ctx, cfg, wgMatchWork)

	wgMatchWork.Add(1)
	go p.send(ctx, cfg, wgMatchWork)

	if cfg.EnableLowOdds {
		wgMatchWork.Add(1)
		go p.sendLowOdds(ctx, cfg, wgMatchWork)
	}

	wgMatchWork.Add(1)
	go p.workerDBWrite(ctx, wgMatchWork)

	// LOG1 worker: periodically log Pinnacle teams having more than one pair
	wgMatchWork.Add(1)
	go p.logPinnacleMultiplePairs(ctx, cfg, wgMatchWork)

	wgMatchWork.Wait()
	p.logger.Info().Msg("[PairsMatchingService.Run] workers stopped")
}

func (p *PairsMatchingService) workerDBWrite(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()
	defer recovery.RecoverPanic(p.logger, "workerDBWrite")

	p.logger.Info().Msg("[PairsMatchingService] workerDBWrite started")

	for {
		select {
		case task := <-p.dbWriteChan:
			if task.Source == "" || task.SportName == "" || task.LeagueName == "" {
				continue
			}

			leagueID, err := p.txStorage.Storage().InsertLeague(ctx, task.Source, task.SportName, task.LeagueName)
			if err != nil {
				p.logger.Error().Err(err).Msg("[PairsMatchingService.workerDBWrite] insert league error")
				continue
			}

			if leagueID != nil {
				if err := p.txStorage.Storage().InsertTeam(ctx, *leagueID, task.HomeName); err != nil {
					p.logger.Error().Err(err).Msg("[PairsMatchingService.workerDBWrite] insert home team error")
				}
				if err := p.txStorage.Storage().InsertTeam(ctx, *leagueID, task.AwayName); err != nil {
					p.logger.Error().Err(err).Msg("[PairsMatchingService.workerDBWrite] insert away team error")
				}
			}

		case <-ctx.Done():
			p.logger.Info().Msg("[PairsMatchingService] workerDBWrite stopped")
			return
		}
	}
}

func (p *PairsMatchingService) cleanCaches(ctx context.Context, cfg config.PairsMatching, wgMatchWork *sync.WaitGroup) {
	defer wgMatchWork.Done()
	defer recovery.RecoverPanic(p.logger, "cleanCaches")

	cleanCacheInterval := time.Duration(time.Duration(cfg.ClearCacheInterval) * time.Second)
	cleanCacheTicker := time.NewTicker(cleanCacheInterval)

	for {
		select {
		case <-cleanCacheTicker.C:
			// OPTIMIZED: Batch delete operations to reduce lock contention
			// TEST: Verify no valid data is deleted, only expired entries

			// Collect keys to delete (avoid deleting while iterating)
			toDelete := make([]string, 0, 100)
			now := time.Now()
			timeout := time.Duration(cfg.MatchDataTimeout) * time.Second

			p.matchDataCache.Iterate(func(matchKey string, matchValue entity.GameData) bool {
				if shouldEvictMatchData(cfg, matchValue, now) {
					toDelete = append(toDelete, matchKey)
				}
				return true
			})

			// DIAGNOSTIC: Re-check entries before delete to detect race condition
			// Between Iterate (RLock) and Delete (Lock), workerMatchData may have
			// written fresh data. Count how many entries are no longer stale.
			actuallyDeleted := 0
			savedByRecheck := 0
			for _, key := range toDelete {
				if val, ok := p.matchDataCache.Read(key); ok {
					if shouldEvictMatchData(cfg, val, time.Now()) {
						// Still stale → delete
						p.matchDataCache.Delete(key)
						p.matchKeysCache.Delete(key)
						p.matchPairsCache.Delete(key)
						actuallyDeleted++
					} else {
						// Was stale during Iterate, now FRESH → race condition proven!
						savedByRecheck++
					}
				}
			}

			// Clean up orphaned keys (keys without match data)
			orphanedKeys := make([]string, 0, 50)
			p.matchKeysCache.Iterate(func(key string, _ cache.MemoryCacheInterface[string, string]) bool {
				if _, ok := p.matchDataCache.Read(key); !ok {
					orphanedKeys = append(orphanedKeys, key)
				}
				return true
			})

			if len(orphanedKeys) > 0 {
				for _, key := range orphanedKeys {
					p.matchKeysCache.Delete(key)
					p.matchPairsCache.Delete(key)
				}
			}

			p.logger.Info().
				Int("candidates", len(toDelete)).
				Int("actually_deleted", actuallyDeleted).
				Int("saved_by_recheck", savedByRecheck).
				Int("orphans_deleted", len(orphanedKeys)).
				Msg("[cleanCaches] Cycle complete")

			keysCachePair, _ := p.matchPairsCache.ReadAll()
			for key, pairedKey := range keysCachePair {
				// Check BOTH keys exist in matchDataCache
				// If either is missing, the pair is invalid
				_, ok1 := p.matchDataCache.Read(key)
				_, ok2 := p.matchDataCache.Read(pairedKey)
				if !ok1 || !ok2 {
					p.matchPairsCache.Delete(key)
				}
			}

			// Clean stale entries from outcomeLastSeen map
			// Use MatchDataTimeout as the max age for outcomes
			p.cleanOutcomeLastSeen(timeout)

			// Clean stale entries from lastChange map every 4 hours.
			// Long TTL avoids disrupting price-change detection for active matches.
			p.cleanLastChange(4 * time.Hour)

			// Clean stale entries from pairFirstSeen (pairs no longer in cache)
			p.pairFirstSeen.Range(func(key, _ interface{}) bool {
				if _, ok := p.pairs.Read(key.(string)); !ok {
					p.pairFirstSeen.Delete(key)
				}
				return true
			})

		case <-ctx.Done():
			cleanCacheTicker.Stop()
			return
		}
	}
}

func (p *PairsMatchingService) workerMatchData(ctx context.Context, wgMatchWork *sync.WaitGroup) {
	defer wgMatchWork.Done()
	defer recovery.RecoverPanic(p.logger, "workerMatchData")

	p.logger.Info().
		Bool("enable_low_odds", p.cfg.EnableLowOdds).
		Float64("threshold", p.cfg.LowOddsThreshold).
		Msg("DEBUG: workerMatchData started")

	for {
		select {
		case msg := <-p.receiveChan:

			var gameData entity.GameData
			err := json.Unmarshal(msg, &gameData)
			if err != nil {
				p.logger.Error().Err(err).Str("raw_msg", string(msg)).Msg("[PairsMatchingService.worker] game data unmarshal error")
				continue
			}

			// Гарантируем непустое время получения, если парсер не проставил CreatedAt
			if gameData.CreatedAt.IsZero() {
				gameData.CreatedAt = time.Now()
			}

			// Generate TraceID if missing (orphan request)
			if gameData.TraceID == "" {
				gameData.TraceID = "orphan-" + pkgutils.GenerateUUID() // Simple UUID gen
			}

			// Validate input data
			if err := p.validator.Validate(gameData); err != nil {
				p.logger.Error().Err(err).
					Str("trace_id", gameData.TraceID). // Log trace_id explicitly
					Str("source", gameData.Source).
					Str("sport", string(gameData.SportName)).
					Msg("[PairsMatchingService.worker] validation failed")
				continue
			}

			// Additional validation: home and away teams must be different
			if err := validation.ValidateTeamNames(gameData.HomeName, gameData.AwayName); err != nil {
				p.logger.Error().Err(err).
					Str("source", gameData.Source).
					Str("home", gameData.HomeName).
					Str("away", gameData.AwayName).
					Msg("[PairsMatchingService.worker] team names validation failed")
				continue
			}

			if gameData.Periods == nil {
				continue
			}

			key := createKeyMatchData(gameData.Source, string(gameData.SportName), gameData.Pid)

			_, ok := p.matchDataCache.Read(key)
			if !ok {
				if gameData.Source == "" || gameData.SportName == "" || gameData.LeagueName == "" {
					continue
				}

				// Optimization: Async DB Write
				select {
				case p.dbWriteChan <- DBWriteTask{
					Source:     gameData.Source,
					SportName:  string(gameData.SportName),
					LeagueName: gameData.LeagueName,
					HomeName:   gameData.HomeName,
					AwayName:   gameData.AwayName,
				}:
				default:
					// Drop if full, not critical (will retry next time match is received)
					p.logger.Warn().Msg("[PairsMatchingService.workerMatchData] dbWriteChan full, skipping insert")
				}
			}

			p.matchDataCache.Write(key, gameData)

			// TRACE: log FTT/STT when data stored in matchDataCache
			if debugTraceMatches(gameData.HomeName, gameData.AwayName, gameData.LeagueName) {
				for pi, pd := range gameData.Periods {
					fttCount := len(pd.FirstTeamTotals)
					sttCount := len(pd.SecondTeamTotals)
					if fttCount > 0 || sttCount > 0 {
						fttInfo := ""
						for line, tt := range pd.FirstTeamTotals {
							fttInfo += fmt.Sprintf("%s(O=%.3f,U=%.3f) ", line, tt.WinMore.Value, tt.WinLess.Value)
						}
						hcpInfo := ""
						cnt := 0
						for line, hcp := range pd.Handicap {
							if cnt >= 3 {
								break
							}
							hcpInfo += fmt.Sprintf("%s(W1=%.3f,W2=%.3f) ", line, hcp.Win1.Value, hcp.Win2.Value)
							cnt++
						}
						fmt.Printf("[TRACE STORE] source=%s %s vs %s p=%d FTT=%d STT=%d FTT=%s HCP=%s\n",
							gameData.Source, gameData.HomeName, gameData.AwayName, pi, fttCount, sttCount, fttInfo, hcpInfo)
					}
				}
			}

			// Track when each outcome was last seen (for stale outcome detection)
			// Per-market timestamps from MarketTs are used when available;
			// time.Now() is the fallback for markets without explicit timestamps.
			p.updateOutcomeLastSeen(gameData.Source, gameData.MatchId, gameData, time.Now())

			// DIAG: detect sparse live events (possible end-of-match)
			if gameData.IsLive && len(gameData.Periods) > 0 {
				pd := gameData.Periods[0]
				has1x2 := pd.Win1x2.Win1.Value > 0 || pd.Win1x2.Win2.Value > 0
				nTotals := len(pd.Totals)
				nHandicap := len(pd.Handicap)
				totalMarkets := nTotals + nHandicap
				if has1x2 {
					totalMarkets++
				}
				if totalMarkets > 0 && totalMarkets <= 2 && !has1x2 {
					totalLines := ""
					for k := range pd.Totals {
						totalLines += k + " "
					}
					p.logger.Warn().
						Str("source", gameData.Source).
						Str("match", gameData.HomeName+" vs "+gameData.AwayName).
						Str("sport", string(gameData.SportName)).
						Int64("pid", gameData.Pid).
						Float64("homeScore", gameData.HomeScore).
						Float64("awayScore", gameData.AwayScore).
						Int("totals", nTotals).
						Int("handicap", nHandicap).
						Str("totalLines", totalLines).
						Str("createdAt", gameData.CreatedAt.Format("15:04:05")).
						Msg("[SPARSE_DATA] Live event with very few markets (possible end-of-match)")
				}
			}

			// Process match
			keyPair, ok := p.matchPairsCache.ReadKey(key)
			if ok {
				// Получаем orderFlag из values
				orderFlag, okFlag := p.matchPairsCache.ReadValue(key)
				if !okFlag {
					continue
				}

				match1, ok1 := p.matchDataCache.Read(key)
				match2, ok2 := p.matchDataCache.Read(keyPair)

				if ok1 && ok2 {
					// Skip if both matches are from the same bookmaker
					if match1.Source == match2.Source {
						continue
					}

					// Skip if IsLive status differs (prevents comparing live vs prematch odds)
					if match1.IsLive != match2.IsLive {
						continue
					}

					// PREMATCH IDENTITY GUARD: team UUIDs alone are not enough. A
					// proven start-time mismatch means these are different fixtures.
					if !prematchStartTimesCompatible(match1.IsLive, match1.MatchDate, match2.MatchDate) {
						p.matchPairsCache.Delete(key)
						p.logger.Warn().
							Str("home1", match1.HomeName).
							Str("away1", match1.AwayName).
							Str("home2", match2.HomeName).
							Str("away2", match2.AwayName).
							Time("start1", match1.MatchDate).
							Time("start2", match2.MatchDate).
							Msg("[PREMATCH_START_MISMATCH] Removed mapped pair")
						continue
					}

					// PREMATCH STALE GUARD: Skip matches whose scheduled start time has passed.
					// When MatchDate < now, the match has likely gone live but prematch analyzer
					// still has stale cached data. Delete existing pair immediately to prevent
					// autobetting from picking up stale prematch pairs with wrong odds.
					if !match1.IsLive {
						now := time.Now()
						if (!match1.MatchDate.IsZero() && match1.MatchDate.Before(now)) ||
							(!match2.MatchDate.IsZero() && match2.MatchDate.Before(now)) {
							var pinnSrc, pinnMid, pinnSport, donorSrc, donorMid string
							if match1.Source == string(domain.Pinnacle) {
								pinnSrc, pinnMid, pinnSport = match1.Source, match1.MatchId, string(match1.SportName)
								donorSrc, donorMid = match2.Source, match2.MatchId
							} else {
								pinnSrc, pinnMid, pinnSport = match2.Source, match2.MatchId, string(match2.SportName)
								donorSrc, donorMid = match1.Source, match1.MatchId
							}
							pairKey := pinnSrc + "|" + pinnMid + "|" + pinnSport + "|" + donorSrc + "|" + donorMid
							p.pairs.Delete(pairKey)
							p.pairFirstSeen.Delete(pairKey)
							p.lowOddsPairs.Delete(pairKey)
							p.logger.Info().
								Str("home", match1.HomeName).
								Str("away", match1.AwayName).
								Str("pairKey", pairKey).
								Msg("[PREMATCH_STALE] Deleted pair for match past scheduled start time")
							continue
						}
					}

					// SAFETY CHECK: Verify leagues are from related competitions
					// This prevents invalid cross-country pairs from stale matchPairsCache
					if !areLeaguesRelated(match1.LeagueName, match2.LeagueName) {
						p.logger.Warn().
							Str("key1", key).
							Str("key2", keyPair).
							Str("league1", match1.LeagueName).
							Str("league2", match2.LeagueName).
							Str("home1", match1.HomeName).
							Str("home2", match2.HomeName).
							Str("source1", match1.Source).
							Str("source2", match2.Source).
							Msg("[INVALID_PAIR] Skipping cross-country pair, cleaning stale cache")
						p.matchPairsCache.Delete(key)
						continue
					}

					// SAFETY CHECK: Verify sports match between both matches
					// This prevents cross-sport pairs (e.g., Soccer vs Basketball with similar team names)
					if !areSportsCompatible(string(match1.SportName), string(match2.SportName)) {
						p.logger.Warn().
							Str("key1", key).
							Str("key2", keyPair).
							Str("sport1", string(match1.SportName)).
							Str("sport2", string(match2.SportName)).
							Str("league1", match1.LeagueName).
							Str("league2", match2.LeagueName).
							Str("home1", match1.HomeName).
							Str("home2", match2.HomeName).
							Str("source1", match1.Source).
							Str("source2", match2.Source).
							Msg("[INVALID_PAIR] Skipping cross-sport pair, cleaning stale cache")
						p.matchPairsCache.Delete(key)
						continue
					}

					// Only for PINNACLE pairs
					var value1 entity.GameData = match1 // value1 always IS PINNACLE
					var value2 entity.GameData = match2
					if match2.Source == string(domain.Pinnacle) {
						value1 = match2
						value2 = match1
					}

					// ИЗМЕНЕНО: Используем orderFlag из БД вместо fuzzy matching
					// Если orderFlag == "reverse" → переворачиваем команды и коэффициенты
					// Гарантия: orderFlag определен через точное совпадение названий в БД (GetUUIDKeysWithPositions)
					if orderFlag == "reverse" {
						value2 = reverseTeamsAndCoefs(value2)
					}

					// STALE DATA GUARD: skip pair if either bookmaker's data is too old.
					// This prevents false ROI from events that ended on one side but linger on the other.
					{
						staleMaxAge := time.Duration(p.cfg.MaxPriceAgeSeconds) * time.Second
						pinnacleAge := time.Since(value1.CreatedAt)
						donorAge := time.Since(value2.CreatedAt)
						if pinnacleAge > staleMaxAge || donorAge > staleMaxAge {
							continue
						}
					}

					// LIVE SCORE MISMATCH GUARD: only compare scores when both
					// bookmakers report real score data (HasScore=true). When either
					// side lacks scores (e.g. Pinnacle Tennis), skip the guard —
					// other freshness checks (CreatedAt, _market_ts) still protect.
					if value1.IsLive && value1.HasScore && value2.HasScore &&
						(int(value1.HomeScore) != int(value2.HomeScore) || int(value1.AwayScore) != int(value2.AwayScore)) {
						continue
					}

					// 1. Standard Search
					var filtered []entity.Outcome
					var pinnacleAllOdds map[string]PinnacleOddEntry
					if p.cfg.EnableEquivalencesV2 {
						// V2: Use market equivalences (Win=H-0.5, DC=H+0.5, etc.)
						// Pinnacle: takes BEST price from equivalent markets
						// Donor: compares EACH market against Pinnacle's best
						//
						// Счет Pinnacle теперь парсится корректно.
						// Используем счет донора (value2) для расчета marketType.
						commonOutcomesV2, pao := findCommonOutcomesV2(value2.Periods, value1.Periods, int(value2.HomeScore), int(value2.AwayScore), string(value1.SportName))
						pinnacleAllOdds = pao
						// TRACE: log IT outcomes
						if debugTraceMatches(value1.HomeName, value1.AwayName, value2.HomeName, value2.AwayName) {
							itCount := 0
							for k, v := range commonOutcomesV2 {
								if len(k) >= 3 && (k[:3] == "IT1" || k[:3] == "IT2") {
									itCount++
									fmt.Printf("[TRACE OUTCOME] %s vs %s key=%s donor=%.3f pinn=%.3f donorSrc=%s pinnSrc=%s\n",
										value2.HomeName, value2.AwayName, k,
										v.Odds[0].Value, v.Odds[1].Value,
										v.DonorOriginalKey, v.PinnacleBestSource)
								}
							}
							if itCount > 0 {
								fmt.Printf("[TRACE OUTCOME] %s vs %s: %d IT outcomes of %d total\n",
									value2.HomeName, value2.AwayName, itCount, len(commonOutcomesV2))
							}
						}
						if commonOutcomesV2 != nil && len(commonOutcomesV2) > 0 {
							// Filter stale donor outcomes (markets no longer sent by parser)
							maxAge := time.Duration(p.cfg.MaxPriceAgeSeconds) * time.Second
							for k, v := range commonOutcomesV2 {
								key := v.DonorOriginalKey
								if key == "" {
									key = k
								}
								if p.isOutcomeStale(value2.Source, value2.MatchId, key, maxAge) {
									delete(commonOutcomesV2, k)
								}
							}
							filtered = p.calculateAndFilterCommonOutcomes(commonOutcomesV2, pinnacleAllOdds, value2.Source, value1.SportName, value1.IsLive)
							p.logROIMapping(value1, value2, filtered, commonOutcomesV2)

							// DEBUG: Log P1 signals with high ROI for monitoring
							// NOTE: Счет Pinnacle теперь парсится. Пары с разным счетом отфильтрованы выше.
							// Это нормально - используем счет донора для marketType.
							for _, out := range filtered {
								if strings.HasPrefix(out.Outcome, "P1 ") && out.ROI > 15.0 {
									p.logger.Debug().
										Str("match", value1.HomeName+" vs "+value1.AwayName).
										Str("outcome", out.Outcome).
										Float64("roi", out.ROI).
										Str("donor", value2.Source).
										Str("pinnacle_created", value1.CreatedAt.Format("15:04:05")).
										Str("donor_created", value2.CreatedAt.Format("15:04:05")).
										Float64("pinnacle_price", out.Score1.Value).
										Float64("donor_price", out.Score2.Value).
										Float64("donor_score_home", value2.HomeScore).
										Float64("donor_score_away", value2.AwayScore).
										Int("pinnacle_periods", len(value1.Periods)).
										Int("donor_periods", len(value2.Periods)).
										Msg("[P1_HIGH_ROI] High ROI P1 signal (score from donor)")
								}
							}
						}

					}
					// 2. Low Odds Search
					var lowFiltered []entity.Outcome
					if p.cfg.EnableLowOdds {
						// ВАЖНО: Используем счет донора (value2), т.к. счет Pinnacle не парсится
						lowCommon := findLowOddsOutcomes(value2.Periods, value1.Periods, int(value2.HomeScore), int(value2.AwayScore), p.cfg.LowOddsThreshold)
						if lowCommon != nil && len(lowCommon) > 0 {
							lowFiltered = p.calculateAndFilterLowOddsOutcomes(lowCommon, pinnacleAllOdds, value2.Source, value1.SportName)
						}
					}

					if len(filtered) == 0 && len(lowFiltered) == 0 {
						// No common outcomes found - delete stale pair from cache
						// This ensures calculator won't get outdated data
						pairKey := value1.Source + "|" + string(value1.MatchId) + "|" + string(value1.SportName) + "|" + value2.Source + "|" + string(value2.MatchId)
						p.pairs.Delete(pairKey)
						p.pairFirstSeen.Delete(pairKey)
						p.lowOddsPairs.Delete(pairKey)
						continue
					}

					result := entity.ResponsePair{
						First: entity.ResponseMatch{
							Bookmaker:       value1.Source,
							LeagueName:      value1.LeagueName,
							HomeScore:       value1.HomeScore,
							AwayScore:       value1.AwayScore,
							HomeName:        value1.HomeName,
							AwayName:        value1.AwayName,
							MatchID:         value1.MatchId,
							CreatedAt:       value1.CreatedAt,
							Raw:             value1.Raw,
							ExternalEventId: value1.Pid,
							MatchDate:       value1.MatchDate,
						},
						Second: entity.ResponseMatch{
							Bookmaker:       value2.Source,
							LeagueName:      value2.LeagueName,
							HomeScore:       value2.HomeScore,
							AwayScore:       value2.AwayScore,
							HomeName:        value2.HomeName,
							AwayName:        value2.AwayName,
							MatchID:         value2.MatchId,
							CreatedAt:       value2.CreatedAt,
							Raw:             value2.Raw,
							ExternalEventId: value2.Pid,
							MatchDate:       value2.MatchDate,
						},
						Outcome:   filtered,
						IsLive:    value1.IsLive,
						SportName: string(value1.SportName),
						CreatedAt: time.Now(),
						TraceID:   value1.TraceID, // Propagate TraceID
					}

					// Fill per-outcome age from outcomeLastSeen (has per-market timestamps)
					for i := range result.Outcome {
						age := p.GetOutcomeAgeWithFallback(value1.Source, value1.MatchId, result.Outcome[i].Outcome, result.Outcome[i].PinnacleBestSource)
						if age < 0 {
							// Unknown per-outcome freshness must be treated as stale.
							age = 999
						}
						result.Outcome[i].OutcomeAge = age
					}

					// Process Standard
					if len(filtered) > 0 {
						p.pairs.Write(value1.Source+"|"+string(value1.MatchId)+"|"+string(value1.SportName)+"|"+value2.Source+"|"+string(value2.MatchId), result)

						// Add data to price storage
						for _, out := range filtered {
							p.logger.Debug().
								Str("trace_id", value1.TraceID).
								Str("match_id", value1.MatchId).
								Str("outcome", out.Outcome).
								Str("event", "match_processed").
								Msg("Match processed successfully")

							fullKey := utils.GenerateFullMatchKey(value1.Source, value2.Source, value1.MatchId, value2.MatchId, string(value1.SportName), out.Outcome)
							p.priceStorage.Write(fullKey, result.CreatedAt, entity.FullPriceRecord{
								First: entity.PriceRecord{
									Bookmaker: value1.Source,
									Score:     out.Score1.Value,
									CreatedAt: value1.CreatedAt,
								},
								Second: entity.PriceRecord{
									Bookmaker: value2.Source,
									Score:     out.Score2.Value,
									CreatedAt: value2.CreatedAt,
								},
								Outcome: out.Outcome,
								ROI:     out.ROI,
								Margin:  out.Margin,
							})
						}
					}

					// Process Low Odds
					if len(lowFiltered) > 0 {
						lowResult := result
						lowResult.Outcome = lowFiltered
						// Fill per-outcome age for low odds
						for i := range lowResult.Outcome {
							age := p.GetOutcomeAgeWithFallback(value1.Source, value1.MatchId, lowResult.Outcome[i].Outcome, lowResult.Outcome[i].PinnacleBestSource)
							if age < 0 {
								age = 999
							}
							lowResult.Outcome[i].OutcomeAge = age
						}
						p.lowOddsPairs.Write(value1.Source+"|"+string(value1.MatchId)+"|"+string(value1.SportName)+"|"+value2.Source+"|"+string(value2.MatchId), lowResult)
					}
				}
			}
		case <-ctx.Done():
			return
		}
	}
}

func (p *PairsMatchingService) send(ctx context.Context, cfg config.PairsMatching, wgWork *sync.WaitGroup) {
	defer wgWork.Done()
	defer recovery.RecoverPanic(p.logger, "send")
	interval := time.Duration(time.Duration(cfg.SendInterval) * time.Millisecond)
	ticker := time.NewTicker(interval)

	type counterHold struct {
		value        int
		pendingValue int
		pendingSince time.Time
		hasPending   bool
	}
	stabilizeCount := func(state *counterHold, raw int, now time.Time, hold time.Duration) int {
		if state.value == 0 || raw >= state.value {
			state.value = raw
			state.hasPending = false
			return state.value
		}

		if !state.hasPending {
			state.pendingSince = now
			state.hasPending = true
		}
		state.pendingValue = raw

		if now.Sub(state.pendingSince) >= hold {
			state.value = state.pendingValue
			state.hasPending = false
		}

		return state.value
	}
	type modeCounterState struct {
		analyzed counterHold
		paired   counterHold
		received counterHold
	}
	stabilizeSnapshot := func(state *modeCounterState, rawAnalyzed, rawPaired, rawReceived int, now time.Time, hold time.Duration) (int, int, int) {
		analyzed := stabilizeCount(&state.analyzed, rawAnalyzed, now, hold)
		paired := stabilizeCount(&state.paired, rawPaired, now, hold)
		received := stabilizeCount(&state.received, rawReceived, now, hold)
		return analyzed, paired, received
	}

	const counterDropHold = 45 * time.Second
	var liveCounterState modeCounterState
	var prematchCounterState modeCounterState

	for {
		select {
		case <-ticker.C:
			pairs := p.pairs.ReadAll()
			var results []entity.ResponsePair
			now := time.Now()

			for key, val := range pairs {
				if time.Since(val.CreatedAt) > (time.Duration(cfg.PairTimeout) * time.Second) {
					p.pairs.Delete(key)
					p.pairFirstSeen.Delete(key)
				} else {
					filteredVal, ok := p.buildPublicPair(key, val, now, cfg, true, "send")
					if !ok {
						continue
					}
					val = filteredVal
					firstAge := now.Sub(val.First.CreatedAt)
					secondAge := now.Sub(val.Second.CreatedAt)

					// DIAG: detect sparse live pairs (possible end-of-match ghost)
					if val.IsLive && len(val.Outcome) <= 2 {
						outcomeNames := ""
						for _, o := range val.Outcome {
							outcomeNames += o.Outcome + fmt.Sprintf("(roi=%.1f) ", o.ROI)
						}
						p.logger.Warn().
							Str("match", val.First.HomeName+" vs "+val.First.AwayName).
							Str("sport", val.SportName).
							Str("pinnacle_pid", val.First.MatchID).
							Str("donor", val.Second.Bookmaker).
							Str("donor_pid", val.Second.MatchID).
							Float64("homeScore", val.First.HomeScore).
							Float64("awayScore", val.First.AwayScore).
							Int("outcomes", len(val.Outcome)).
							Str("outcomeDetails", outcomeNames).
							Float64("pinnacleAge", firstAge.Seconds()).
							Float64("donorAge", secondAge.Seconds()).
							Msg("[SPARSE_PAIR] Live pair with ≤2 outcomes (possible end-of-match)")
					}

					// TRACK HIGH ROI SIGNALS (только после stale check!)
					for _, outcome := range val.Outcome {
						if outcome.ROI >= 15.0 {
							// DroidAnalyzer: отложенная фича (включается через DroidEnabled=true)
							if outcome.ROI >= GetROIThreshold() {
								go p.analyzeHighROI(val, outcome)
							}
							p.highROITestTracker.Track(val, outcome, time.Now())

							// Сохранение сырых данных при ROI >= 30%
							if outcome.ROI >= 30.0 {
								go p.saveRawDataForHighROI(val, outcome)
							}
						}
					}

					// Записываем возраст данных (максимум из двух букмекеров)
					dataAge := firstAge
					if secondAge > dataAge {
						dataAge = secondAge
					}
					val.DataAge = dataAge.Seconds()

					results = append(results, val)

					// ОТКЛЮЧЕНО: generatePairCSV создавал файлы которые не используются
					// Реальные ставки создаются calculator'ом
					// Тестовые сигналы создаются через highROITestTracker
					// p.generatePairCSV(val, "logs/bets/pairs")

					msg, err := json.Marshal(val)
					if err != nil {
						p.logger.Error().Err(err).Msg("[PairsMatchingService.send] value marshall error")
					}

					redisKey := pkgredis.GetRKeyPairs(val.IsLive, val.First.Bookmaker, val.Second.Bookmaker)
					err = p.redisClient.Publish(ctx, redisKey, msg)
					if err != nil {
						p.logger.Error().Err(err).Msg("[PairsMatchingService.send] write msg to redis error")
					}
				}
			}

			// Count total unique matches in matchDataCache (all analyzed matches, not just profitable)
			// ✅ ОПТИМИЗАЦИЯ: Iterate() вместо ReadAll() — не копируем ~2700 тяжёлых GameData структур
			// Separate Live and Prematch matches
			// ✅ ИЗМЕНЕНО 2025-11-22: Считаем только доноров (не Pinnacle)
			// Добавляем ВСЕ записи от доноров (дедупликация будет в sender.go ПОСЛЕ фильтрации)
			liveMatchInfos := make([]entity.MatchInfo, 0)
			prematchMatchInfos := make([]entity.MatchInfo, 0)

			p.matchDataCache.Iterate(func(_ string, match entity.GameData) bool {
				// ✅ Пропускаем Pinnacle - считаем только доноров
				if match.Source == string(domain.Pinnacle) {
					return true
				}

				matchInfo := entity.MatchInfo{
					Bookmaker: match.Source,
					SportName: match.SportName,
					IsLive:    match.IsLive,
					MatchID:   match.MatchId,
				}

				if match.IsLive {
					liveMatchInfos = append(liveMatchInfos, matchInfo)
				} else {
					prematchMatchInfos = append(prematchMatchInfos, matchInfo)
				}
				return true
			})

			// Собираем allPairsInfo из p.pairs (ВСЕ пары где был анализ) - для подсчета X
			// X должен показывать матчи где вызывался findCommonOutcomes, даже если Outcome пустой
			allPairsInfo := make([]entity.PairInfo, 0)
			uniqueMatchesInPairs := make(map[string]entity.PairInfo) // ключ = matchID из второго букмекера
			for _, pair := range pairs {
				// Используем MatchID второго букмекера (донор) как ключ для уникальности
				matchKey := pair.Second.MatchID
				if _, exists := uniqueMatchesInPairs[matchKey]; !exists {
					uniqueMatchesInPairs[matchKey] = entity.PairInfo{
						FirstBookmaker:  pair.First.Bookmaker,
						SecondBookmaker: pair.Second.Bookmaker,
						SportName:       pair.SportName,
						IsLive:          pair.IsLive,
					}
				}
			}
			// Преобразуем map в slice для дальнейшей работы
			for _, pairInfo := range uniqueMatchesInPairs {
				allPairsInfo = append(allPairsInfo, pairInfo)
			}

			// Читаем AllPairedInfo из атомарного снимка (формируется в updatePairsCache)
			// Это устраняет race condition: send() больше не обходит matchPairsCache напрямую
			var livePairedInfo, prematchPairedInfo []entity.PairInfo
			if snap, ok := p.pairsSnapshot.Load().(*PairsSnapshot); ok && snap != nil {
				livePairedInfo = snap.LivePairedInfo
				prematchPairedInfo = snap.PrematchPairedInfo
			}

			// Send TWO separate messages - one for Live, one for Prematch
			// Live message
			livePairs := filterPairsByMode(results, true)
			livePairsInfo := filterPairInfoByMode(allPairsInfo, true)

			nowMs := time.Now().UnixMilli()

			rawLiveAnalyzed := len(livePairsInfo)
			rawLivePaired := max(len(livePairedInfo), len(livePairsInfo))
			rawLiveReceived := len(liveMatchInfos)
			liveAnalyzedCount, livePairedCount, liveReceivedCount := stabilizeSnapshot(&liveCounterState, rawLiveAnalyzed, rawLivePaired, rawLiveReceived, now, counterDropHold)

			liveMessage := entity.WebSocketMessage{
				Pairs:                livePairs,
				TotalAnalyzedMatches: liveAnalyzedCount,  // X: stabilized for UI
				TotalPairedMatches:   livePairedCount,    // Y: stabilized for UI
				TotalReceivedMatches: liveReceivedCount,  // Z: stabilized for UI
				TotalPairsBeforeROI:  len(livePairsInfo), // Старое поле (оставляем)
				AllMatches:           liveMatchInfos,
				AllPairsInfo:         livePairsInfo,  // для X (где был анализ)
				AllPairedInfo:        livePairedInfo, // для Y (все пары в БД)
				IsLiveMode:           true,
				ServerTimestamp:      nowMs,
			}

			// Логирование когда пары пропадают (для отладки)
			if len(liveMessage.Pairs) == 0 && len(liveMatchInfos) > 0 {
				p.logger.Warn().
					Int("analyzed_matches", len(liveMatchInfos)).
					Int("total_results", len(results)).
					Int("live_filtered", len(livePairs)).
					Msg("[PAIRS_DISAPPEARED] Sending 0 pairs but have matches analyzed")
			}

			p.logger.Info().
				Int("live_pairs_count", len(liveMessage.Pairs)).
				Int("X_totalAnalyzedMatches", liveMessage.TotalAnalyzedMatches).
				Int("Y_totalPairedMatches", liveMessage.TotalPairedMatches).
				Int("Z_totalReceivedMatches", liveMessage.TotalReceivedMatches).
				Int("live_pairs_before_roi", len(livePairsInfo)).
				Msg("Sending Live WebSocket message")

			// ВРЕМЕННОЕ ЛОГИРОВАНИЕ JSON для отладки
			if jsonBytes, err := json.Marshal(liveMessage); err == nil {
				p.logger.Debug().Str("json_message", string(jsonBytes[:min(500, len(jsonBytes))])).Msg("[DEBUG] WebSocket JSON preview")
			}

			p.sendChan <- liveMessage

			// Prematch message
			prematchPairs := filterPairsByMode(results, false)
			prematchPairsInfo := filterPairInfoByMode(allPairsInfo, false)

			rawPrematchAnalyzed := len(prematchPairsInfo)
			rawPrematchPaired := max(len(prematchPairedInfo), len(prematchPairsInfo))
			rawPrematchReceived := len(prematchMatchInfos)
			prematchAnalyzedCount, prematchPairedCount, prematchReceivedCount := stabilizeSnapshot(&prematchCounterState, rawPrematchAnalyzed, rawPrematchPaired, rawPrematchReceived, now, counterDropHold)

			prematchMessage := entity.WebSocketMessage{
				Pairs:                prematchPairs,
				TotalAnalyzedMatches: prematchAnalyzedCount,  // X: stabilized for UI
				TotalPairedMatches:   prematchPairedCount,    // Y: stabilized for UI
				TotalReceivedMatches: prematchReceivedCount,  // Z: stabilized for UI
				TotalPairsBeforeROI:  len(prematchPairsInfo), // Старое поле (оставляем)
				AllMatches:           prematchMatchInfos,
				AllPairsInfo:         prematchPairsInfo,  // для X (где был анализ)
				AllPairedInfo:        prematchPairedInfo, // для Y (из snapshot)
				IsLiveMode:           false,
				ServerTimestamp:      nowMs,
			}
			p.logger.Info().
				Int("prematch_pairs_count", len(prematchMessage.Pairs)).
				Int("prematch_pairs_before_roi", len(prematchPairsInfo)).
				Int("prematch_analyzed_matches", len(prematchMatchInfos)).
				Msg("Sending Prematch WebSocket message")
			p.sendChan <- prematchMessage

			// 2. Test signal CSV generation retired вместе с testbets контуром.

			// 3. Чистим старые сигналы в трекере (если не обновлялись > 1 мин)
			p.highROITestTracker.Cleanup(1*time.Minute, time.Now())
		case <-ctx.Done():
			ticker.Stop()
			return
		}
	}
}

func publicFilterMode(isLive bool) string {
	if isLive {
		return "live"
	}
	return "prematch"
}

func publicFilterShouldLog(key string, now time.Time) bool {
	if lastWrite, ok := publicFilterLogLastWrite.Load(key); ok {
		if now.Sub(lastWrite.(time.Time)) < publicFilterLogInterval {
			return false
		}
	}
	publicFilterLogLastWrite.Store(key, now)
	return true
}

func (p *PairsMatchingService) notePublicPairDrop(consumer, reason string, val entity.ResponsePair, now time.Time, firstAge, secondAge, threshold float64) {
	sport := val.SportName
	if sport == "" {
		sport = "unknown"
	}
	mode := publicFilterMode(val.IsLive)
	publicFilterPairsTotal.WithLabelValues(consumer, reason, sport, mode).Inc()

	dedupKey := fmt.Sprintf("pair|%s|%s|%s|%s|%s", consumer, reason, val.First.MatchID, val.Second.MatchID, sport)
	if !publicFilterShouldLog(dedupKey, now) {
		return
	}

	p.logger.Warn().
		Str("consumer", consumer).
		Str("reason", reason).
		Str("sport", sport).
		Str("mode", mode).
		Str("match", val.First.HomeName+" vs "+val.First.AwayName).
		Str("pinnacle_match_id", val.First.MatchID).
		Str("donor_match_id", val.Second.MatchID).
		Float64("first_age_sec", firstAge).
		Float64("second_age_sec", secondAge).
		Float64("max_age_sec", threshold).
		Int("outcomes", len(val.Outcome)).
		Msg("[PUBLIC_FILTER_DROP] pair_hidden")
}

func (p *PairsMatchingService) notePublicOutcomeDrop(consumer, reason string, val entity.ResponsePair, outcome entity.Outcome, now time.Time, rawAge, seenAge, threshold float64) {
	sport := val.SportName
	if sport == "" {
		sport = "unknown"
	}
	mode := publicFilterMode(val.IsLive)
	publicFilterOutcomesTotal.WithLabelValues(consumer, reason, sport, mode).Inc()

	dedupKey := fmt.Sprintf("outcome|%s|%s|%s|%s|%s", consumer, reason, val.First.MatchID, outcome.Outcome, sport)
	if !publicFilterShouldLog(dedupKey, now) {
		return
	}

	p.logger.Warn().
		Str("consumer", consumer).
		Str("reason", reason).
		Str("sport", sport).
		Str("mode", mode).
		Str("match", val.First.HomeName+" vs "+val.First.AwayName).
		Str("matchId", val.First.MatchID).
		Str("outcome", outcome.Outcome).
		Str("pinnacle_best_source", outcome.PinnacleBestSource).
		Float64("seenAge_raw", rawAge).
		Float64("seenAge", seenAge).
		Float64("maxAge", threshold).
		Msg("[PUBLIC_FILTER_DROP] outcome_hidden")
}

func (p *PairsMatchingService) buildPublicPair(key string, val entity.ResponsePair, now time.Time, cfg config.PairsMatching, applyStability bool, consumer string) (entity.ResponsePair, bool) {
	maxAge := time.Duration(cfg.MaxPriceAgeSeconds) * time.Second
	if now.Sub(val.CreatedAt) > time.Duration(cfg.PairTimeout)*time.Second {
		p.notePublicPairDrop(consumer, "pair_timeout", val, now, now.Sub(val.First.CreatedAt).Seconds(), now.Sub(val.Second.CreatedAt).Seconds(), maxAge.Seconds())
		return entity.ResponsePair{}, false
	}
	if !prematchStartTimesCompatible(val.IsLive, val.First.MatchDate, val.Second.MatchDate) {
		p.notePublicPairDrop(consumer, "start_time_mismatch", val, now, val.First.MatchDate.Sub(val.Second.MatchDate).Abs().Seconds(), 0, maxPrematchStartDelta.Seconds())
		return entity.ResponsePair{}, false
	}

	firstAge := now.Sub(val.First.CreatedAt)
	secondAge := now.Sub(val.Second.CreatedAt)

	if firstAge > maxAge || secondAge > maxAge {
		p.notePublicPairDrop(consumer, "bookmaker_age", val, now, firstAge.Seconds(), secondAge.Seconds(), maxAge.Seconds())
		return entity.ResponsePair{}, false
	}

	if applyStability && cfg.MinStabilitySeconds > 0 && val.IsLive {
		if _, loaded := p.pairFirstSeen.LoadOrStore(key, now); loaded {
			firstSeen, _ := p.pairFirstSeen.Load(key)
			if now.Sub(firstSeen.(time.Time)).Seconds() < cfg.MinStabilitySeconds {
				p.notePublicPairDrop(consumer, "stability", val, now, firstAge.Seconds(), secondAge.Seconds(), cfg.MinStabilitySeconds)
				return entity.ResponsePair{}, false
			}
		} else {
			p.notePublicPairDrop(consumer, "stability", val, now, firstAge.Seconds(), secondAge.Seconds(), cfg.MinStabilitySeconds)
			return entity.ResponsePair{}, false
		}
	}

	var freshOutcomes []entity.Outcome
	for i := range val.Outcome {
		rawAge := p.GetOutcomeAgeWithFallback(val.First.Bookmaker, val.First.MatchID, val.Outcome[i].Outcome, val.Outcome[i].PinnacleBestSource)
		seenAge := rawAge
		if seenAge < 0 {
			if val.IsLive {
				seenAge = maxAge.Seconds() + 1
			} else {
				seenAge = firstAge.Seconds()
			}
		}

		// Use maxAge (15s live, 120s prematch) for per-outcome filtering.
		// Specials (BTTS, DC, CS, 3WH) refresh every ~11s via MORE_BET
		// (PS3838 server-side caching). bettingMaxAge (5s) filtered them
		// as stale. Base markets refresh every ~1s from per-event FO,
		// so their outcomeAge never reaches 5s regardless of threshold.
		outcomeThreshold := maxAge
		if seenAge > outcomeThreshold.Seconds() && val.IsLive && rawAge >= 0 {
			p.notePublicOutcomeDrop(consumer, "outcome_stale", val, val.Outcome[i], now, rawAge, seenAge, outcomeThreshold.Seconds())
		}
		if seenAge > outcomeThreshold.Seconds() {
			continue
		}

		outcome := val.Outcome[i]
		outcome.OutcomeAge = seenAge
		freshOutcomes = append(freshOutcomes, outcome)
	}
	if len(freshOutcomes) == 0 {
		p.notePublicPairDrop(consumer, "all_outcomes_stale", val, now, firstAge.Seconds(), secondAge.Seconds(), maxAge.Seconds())
		return entity.ResponsePair{}, false
	}

	val.Outcome = freshOutcomes
	dataAge := firstAge
	if secondAge > dataAge {
		dataAge = secondAge
	}
	val.DataAge = dataAge.Seconds()

	return val, true
}

func (p *PairsMatchingService) updateKeysCache(ctx context.Context, cfg config.PairsMatching, wgMatchWork *sync.WaitGroup) {
	defer wgMatchWork.Done()
	defer recovery.RecoverPanic(p.logger, "updateKeysCache")

	updateKeysCacheInterval := time.Duration(time.Duration(cfg.UpdateKeysCacheInterval) * time.Second)
	updateKeysCacheTicker := time.NewTicker(updateKeysCacheInterval)

	for {
		select {
		case <-updateKeysCacheTicker.C:

			data := p.matchDataCache.ReadAll()

			// Collect matches that need DB query (Cache Miss)
			// Batch size 100 to prevent huge SQL queries
			const batchSize = 100
			var batch []repository.MatchQuery
			var batchKeys []string // To update cache later

			for keyMatch, valueMatch := range data {
				// Optimization: Check internal cache first
				cacheKey := fmt.Sprintf("%s|%s|%s|%s|%s", valueMatch.Source, valueMatch.SportName, valueMatch.LeagueName, valueMatch.HomeName, valueMatch.AwayName)

				p.uuidCacheMux.RLock()
				cached, found := p.uuidCache[cacheKey]
				p.uuidCacheMux.RUnlock()

				// TTL = 2x update interval + jitter spread by interval to stagger expiry
				// prematch: 60s + rand(30) = 60-90s, live: 6s + rand(3) = 6-9s
				jitterMax := max(cfg.UpdateKeysCacheInterval, 3)
				ttl := time.Duration(cfg.UpdateKeysCacheInterval*2)*time.Second + time.Duration(rand.Intn(jitterMax))*time.Second

				if found && time.Since(cached.timestamp) < ttl {
					// Cache Hit: Use cached data immediately
					if len(cached.result) > 0 {
						newKeys := cache.NewMemoryCache[string, string]()
						for uuid, position := range cached.result {
							newKeys.Write(uuid, position)
						}
						p.matchKeysCache.Write(keyMatch, newKeys)
					}
					// Negative results: don't delete matchKeysCache — let natural TTL expire
					// Aggressive deletion creates blind spots for newly paired matches
				} else {
					// Cache Miss: Add to batch
					batch = append(batch, repository.MatchQuery{
						Source:     valueMatch.Source,
						SportName:  string(valueMatch.SportName),
						LeagueName: valueMatch.LeagueName,
						HomeName:   valueMatch.HomeName,
						AwayName:   valueMatch.AwayName,
						MatchKey:   keyMatch, // Pass original key to map back results
					})
					// Store cacheKey to update cache later (using parallel slice)
					batchKeys = append(batchKeys, cacheKey)

					// Process batch if full
					if len(batch) >= batchSize {
						p.processMatchBatch(ctx, batch, batchKeys)
						batch = batch[:0]
						batchKeys = batchKeys[:0]
					}
				}
			}

			// Process remaining items in batch
			if len(batch) > 0 {
				p.processMatchBatch(ctx, batch, batchKeys)
			}

		case <-ctx.Done():
			updateKeysCacheTicker.Stop()
			return
		}
	}
}

// processMatchBatch handles a batch of matches by querying DB and updating caches
func (p *PairsMatchingService) processMatchBatch(ctx context.Context, batch []repository.MatchQuery, batchKeys []string) {
	results, err := p.txStorage.Storage().GetUUIDKeysForMatchesBatch(ctx, batch)
	if err != nil {
		p.logger.Error().Err(err).Int("batch_size", len(batch)).Msg("[processMatchBatch] batch query error — matchKeysCache NOT updated for this batch")
		return
	}

	// Update caches
	p.uuidCacheMux.Lock()
	defer p.uuidCacheMux.Unlock()

	now := time.Now()
	var keysWritten, keysNoResult int

	for i, matchQuery := range batch {
		mKey := matchQuery.MatchKey
		cacheKey := batchKeys[i]

		uuidsWithPositions := results[mKey] // Can be nil if no result found

		// 1. Update Internal UUID Cache
		p.uuidCache[cacheKey] = uuidCacheEntry{
			result:    uuidsWithPositions, // Empty map if not found (important to cache negative result)
			timestamp: now,
		}

		// 2. Update MatchKeys Cache
		if len(uuidsWithPositions) > 0 {
			newKeys := cache.NewMemoryCache[string, string]()
			for uuid, position := range uuidsWithPositions {
				newKeys.Write(uuid, position)
			}
			p.matchKeysCache.Write(mKey, newKeys)
			keysWritten++
		} else {
			// DB returned no results — do NOT delete from matchKeysCache
			// Deletion causes race conditions: updatePairsCache sees partial state
			// Cleanup of orphaned keys is handled by cleanCaches (by timeout)
			keysNoResult++
		}
	}

	if keysNoResult > 0 {
		p.logger.Debug().
			Int("keys_no_result", keysNoResult).
			Msg("[processMatchBatch] keys without DB result (preserved)")
	}

	// Evict expired uuidCache entries to bound memory (max TTL = 5 min)
	const maxAge = 5 * time.Minute
	for key, entry := range p.uuidCache {
		if now.Sub(entry.timestamp) > maxAge {
			delete(p.uuidCache, key)
		}
	}
}

// tryAutoCreateTeamPair пытается автоматически создать пару для непарной команды
// Проверяет что лиги спарены, логирует конфликты если пара уже существует
func (p *PairsMatchingService) tryAutoCreateTeamPair(ctx context.Context, match1, match2 entity.GameData, pairedUUID string) {
	// Получаем league_id для обеих лиг
	leagueID1, err := p.txStorage.Storage().InsertLeague(ctx, match1.Source, string(match1.SportName), match1.LeagueName)
	if err != nil || leagueID1 == nil {
		p.logger.Warn().Err(err).
			Str("source1", match1.Source).
			Str("league1", match1.LeagueName).
			Msg("[AutoPair] Failed to get league_id for match1")
		return
	}

	leagueID2, err := p.txStorage.Storage().InsertLeague(ctx, match2.Source, string(match2.SportName), match2.LeagueName)
	if err != nil || leagueID2 == nil {
		p.logger.Warn().Err(err).
			Str("source2", match2.Source).
			Str("league2", match2.LeagueName).
			Msg("[AutoPair] Failed to get league_id for match2")
		return
	}

	// Проверяем что лиги спарены
	leaguesPaired, err := p.txStorage.Storage().CheckLeaguesPaired(ctx, *leagueID1, *leagueID2)
	if err != nil {
		p.logger.Warn().Err(err).
			Int64("league1_id", *leagueID1).
			Int64("league2_id", *leagueID2).
			Msg("[AutoPair] Failed to check leagues paired")
		return
	}

	if !leaguesPaired {
		p.logger.Debug().
			Str("league1", match1.LeagueName).
			Str("league2", match2.LeagueName).
			Str("source1", match1.Source).
			Str("source2", match2.Source).
			Msg("[AutoPair] Leagues are not paired, skipping auto-pairing")
		return
	}

	// Определяем какая команда спарена (по pairedUUID)
	// Проверяем home команды
	homeTeam1ID, _ := p.txStorage.Storage().GetTeamID(ctx, *leagueID1, match1.HomeName)
	homeTeam2ID, _ := p.txStorage.Storage().GetTeamID(ctx, *leagueID2, match2.HomeName)
	awayTeam1ID, _ := p.txStorage.Storage().GetTeamID(ctx, *leagueID1, match1.AwayName)
	awayTeam2ID, _ := p.txStorage.Storage().GetTeamID(ctx, *leagueID2, match2.AwayName)

	// Создаем пару для непарной команды
	var team1ID, team2ID *int64
	var team1Name, team2Name string

	// Проверяем home команды
	if homeTeam1ID != nil && homeTeam2ID != nil {
		// Проверим, спарена ли уже home команда
		paired, _ := p.txStorage.Storage().CheckTeamAlreadyPaired(ctx, *homeTeam1ID)
		if !paired {
			team1ID = homeTeam1ID
			team2ID = homeTeam2ID
			team1Name = match1.HomeName
			team2Name = match2.HomeName
		}
	}

	// Если home не нужно парить, проверим away
	if team1ID == nil && awayTeam1ID != nil && awayTeam2ID != nil {
		paired, _ := p.txStorage.Storage().CheckTeamAlreadyPaired(ctx, *awayTeam1ID)
		if !paired {
			team1ID = awayTeam1ID
			team2ID = awayTeam2ID
			team1Name = match1.AwayName
			team2Name = match2.AwayName
		}
	}

	if team1ID == nil || team2ID == nil {
		// Нет непарных команд для автосоздания
		return
	}

	// Проверяем, не спарена ли уже вторая команда
	alreadyPaired, err := p.txStorage.Storage().CheckTeamAlreadyPaired(ctx, *team2ID)
	if err != nil {
		p.logger.Warn().Err(err).
			Int64("team2_id", *team2ID).
			Msg("[AutoPair] Failed to check if team2 already paired")
		return
	}

	if alreadyPaired {
		p.logger.Warn().
			Str("team1", team1Name).
			Str("team2", team2Name).
			Str("source1", match1.Source).
			Str("source2", match2.Source).
			Int64("team1_id", *team1ID).
			Int64("team2_id", *team2ID).
			Msg("[AutoPair] CONFLICT: team2 is already paired with another team")
		// Все равно создаем вторую пару (по вашему требованию)
	}

	// Создаем пару
	err = p.txStorage.Storage().InsertTeamsPair(ctx, *team1ID, *team2ID)
	if err != nil {
		p.logger.Error().Err(err).
			Str("team1", team1Name).
			Str("team2", team2Name).
			Int64("team1_id", *team1ID).
			Int64("team2_id", *team2ID).
			Msg("[AutoPair] Failed to insert team pair")
		return
	}

	p.logger.Info().
		Str("team1", team1Name).
		Str("team2", team2Name).
		Str("source1", match1.Source).
		Str("source2", match2.Source).
		Str("league1", match1.LeagueName).
		Str("league2", match2.LeagueName).
		Int64("team1_id", *team1ID).
		Int64("team2_id", *team2ID).
		Msg("[AutoPair] ✅ Successfully auto-created team pair")
}

func (p *PairsMatchingService) updatePairsCache(ctx context.Context, cfg config.PairsMatching, wgMatchWork *sync.WaitGroup) {
	defer wgMatchWork.Done()
	defer recovery.RecoverPanic(p.logger, "updatePairsCache")

	updatePairsCacheInterval := time.Duration(time.Duration(cfg.UpdatePairsCacheInterval) * time.Second)
	updatePairsCacheTicker := time.NewTicker(updatePairsCacheInterval)

	for {
		select {
		case <-updatePairsCacheTicker.C:
			startTime := time.Now()
			matchKeys := p.matchKeysCache.ReadAll()
			totalMatches := len(matchKeys)

			// ОПТИМИЗАЦИЯ 2025-12-02: Используем индекс вместо O(N²) перебора
			// Шаг 1: Строим индекс UUID → список {matchKey, position}
			type matchInfo struct {
				matchKey string
				position string // "home" или "away"
			}
			uuidIndex := make(map[string][]matchInfo)

			for matchKey, uuidsCache := range matchKeys {
				if uuidsCache == nil {
					continue
				}
				uuids := uuidsCache.ReadAll()
				for uuid, position := range uuids {
					uuidIndex[uuid] = append(uuidIndex[uuid], matchInfo{
						matchKey: matchKey,
						position: position,
					})
				}
			}

			// Шаг 2: Находим пары через общие UUID
			// candidatePairs хранит пары матчей и их общие UUID с позициями
			type uuidPosInfo struct {
				pos1 string
				pos2 string
			}
			type pairKey struct {
				key1, key2 string
			}
			candidatePairs := make(map[pairKey][]uuidPosInfo)

			for uuid, matches := range uuidIndex {
				// Если у UUID только 1 матч - пропускаем (нет пары)
				if len(matches) < 2 {
					continue
				}

				// Для каждой пары матчей с этим UUID
				for i := 0; i < len(matches); i++ {
					for j := i + 1; j < len(matches); j++ {
						m1, m2 := matches[i], matches[j]

						// Нормализуем порядок ключей для консистентности
						k1, k2 := m1.matchKey, m2.matchKey
						p1, p2 := m1.position, m2.position
						if k1 > k2 {
							k1, k2 = k2, k1
							p1, p2 = p2, p1
						}

						pk := pairKey{key1: k1, key2: k2}
						candidatePairs[pk] = append(candidatePairs[pk], uuidPosInfo{
							pos1: p1,
							pos2: p2,
						})
						_ = uuid // используется для построения индекса
					}
				}
			}

			// Шаг 3: Валидируем пары (та же логика что была)
			pairsFound := 0
			pairsSkippedSameBookmaker := 0
			pairsSkippedOneUUID := 0
			pairsSkippedConflict := 0
			pairsSkippedOneTeamPrematch := 0
			pairsSkippedStartTime := 0
			newPairKeys := make(map[string]bool)

			for pk, uuidInfos := range candidatePairs {
				// КРИТИЧНО: Должны совпадать ОБЕ команды (2+ общих UUID)
				if len(uuidInfos) < 2 {
					pairsSkippedOneUUID++
					continue
				}

				// Проверяем что матчи от РАЗНЫХ букмекеров
				match1, ok1 := p.matchDataCache.Read(pk.key1)
				match2, ok2 := p.matchDataCache.Read(pk.key2)
				if !ok1 || !ok2 {
					continue
				}
				if match1.Source == match2.Source {
					pairsSkippedSameBookmaker++
					continue
				}

				// CRITICAL: One side MUST be Pinnacle. All analysis goes through Pinnacle only.
				// Pairs like GGBet<->Sansabet must never exist.
				if match1.Source != string(domain.Pinnacle) && match2.Source != string(domain.Pinnacle) {
					continue
				}

				if match1.IsLive != match2.IsLive {
					continue
				}
				if !prematchStartTimesCompatible(match1.IsLive, match1.MatchDate, match2.MatchDate) {
					pairsSkippedStartTime++
					p.matchPairsCache.Delete(pk.key1)
					continue
				}

				// PREMATCH FIX: одна команда может иметь несколько UUID (из разных league name вариантов).
				// Для prematch требуем чтобы shared UUID покрывали ОБЕ позиции (home + away),
				// иначе пара создаётся по одной команде (Rapid Wien II → St. Polten вместо Austria Salzburg).
				// Для live это не критично — одна команда не играет 2 матча одновременно.
				if !match1.IsLive || !match2.IsLive {
					hasHomePos := false
					hasAwayPos := false
					for _, info := range uuidInfos {
						if info.pos1 == "home" {
							hasHomePos = true
						} else if info.pos1 == "away" {
							hasAwayPos = true
						}
					}
					if !hasHomePos || !hasAwayPos {
						pairsSkippedOneTeamPrematch++
						continue
					}
				}

				// КЛЮЧЕВАЯ ЛОГИКА: определяем нужно ли переворачивать
				// Если positions совпадают (оба "home" или оба "away") → прямой порядок
				// Если positions противоположные → обратный порядок
				firstNeedReverse := (uuidInfos[0].pos1 != uuidInfos[0].pos2)

				// СТРОГАЯ ПРОВЕРКА: Все общие UUID должны давать ОДИНАКОВЫЙ результат
				hasConflict := false
				for _, info := range uuidInfos[1:] {
					needReverse := (info.pos1 != info.pos2)
					if needReverse != firstNeedReverse {
						hasConflict = true
						break
					}
				}

				if hasConflict {
					pairsSkippedConflict++
					p.logger.Warn().
						Str("key1", pk.key1).
						Str("key2", pk.key2).
						Int("uuids_count", len(uuidInfos)).
						Msg("[PAIRS_CONFLICT] Different UUIDs give different reverse flags, skipping pair for safety")
					continue
				}

				// Сохраняем в кэш: "direct" если не нужно переворачивать, "reverse" если нужно
				orderFlag := "direct"
				if firstNeedReverse {
					orderFlag = "reverse"
				}

				p.matchPairsCache.WriteBothKeys(pk.key1, pk.key2, orderFlag)
				newPairKeys[pk.key1] = true
				newPairKeys[pk.key2] = true
				pairsFound++
			}

			// NOTE: Stale pair removal is handled by cleanCaches (every 30s, 120s timeout).
			// Do NOT aggressively delete here - matchDataCache may temporarily miss keys
			// during PS3838 parser sport-by-sport refresh cycle, causing Y to blink.
			pairsRemoved := 0

			// Build atomic PairsSnapshot for send() — consistent pairedInfo
			// Eliminates race condition: send() no longer iterates matchPairsCache directly
			snapshot := &PairsSnapshot{}
			snapshotPairs, _ := p.matchPairsCache.ReadAll()
			seenPairsSnapshot := make(map[string]bool)
			for key1 := range snapshotPairs {
				key2, ok2 := snapshotPairs[key1]
				if !ok2 {
					continue
				}
				match1, ok1 := p.matchDataCache.Read(key1)
				match2, ok3 := p.matchDataCache.Read(key2)

				// Y stabilization: if matchPairsCache has the pair but matchDataCache
				// temporarily lacks one side (PS3838 parser refreshes sports sequentially,
				// causing ~1-2s gaps), still count it. cleanCaches (120s timeout) handles
				// truly stale pairs.
				if !ok1 && !ok3 {
					continue // Both sides gone - pair is truly stale
				}

				var pinnacle, donor entity.GameData
				var hasBothSides bool
				if ok1 && ok3 {
					hasBothSides = true
					if match1.Source == string(domain.Pinnacle) {
						pinnacle = match1
						donor = match2
					} else {
						pinnacle = match2
						donor = match1
					}
				} else {
					// One side temporarily missing - use available data for counting
					hasBothSides = false
					if ok1 {
						pinnacle = match1 // might actually be donor, but we only need SportName/IsLive
					} else {
						pinnacle = match2
					}
					donor = pinnacle // reuse for dedup key
				}

				dedupeKey := donor.MatchId
				if !hasBothSides {
					dedupeKey = key1 + ":" + key2 // unique key when MatchId unavailable
				}
				if _, exists := seenPairsSnapshot[dedupeKey]; !exists {
					seenPairsSnapshot[dedupeKey] = true
					pi := entity.PairInfo{
						FirstBookmaker:  "Pinnacle",
						SecondBookmaker: donor.Source,
						SportName:       string(pinnacle.SportName),
						IsLive:          pinnacle.IsLive,
					}
					if !hasBothSides {
						pi.SecondBookmaker = "refreshing"
					}
					if pinnacle.IsLive {
						snapshot.LivePairedInfo = append(snapshot.LivePairedInfo, pi)
					} else {
						snapshot.PrematchPairedInfo = append(snapshot.PrematchPairedInfo, pi)
					}
				}
			}
			p.pairsSnapshot.Store(snapshot)

			elapsed := time.Since(startTime)
			p.logger.Info().
				Int("total_matches", totalMatches).
				Int("unique_uuids", len(uuidIndex)).
				Int("candidate_pairs", len(candidatePairs)).
				Int("pairs_found", pairsFound).
				Int("skipped_same_bookmaker", pairsSkippedSameBookmaker).
				Int("skipped_one_uuid", pairsSkippedOneUUID).
				Int("skipped_one_team_prematch", pairsSkippedOneTeamPrematch).
				Int("skipped_start_time", pairsSkippedStartTime).
				Int("skipped_conflict", pairsSkippedConflict).
				Int("stale_removed", pairsRemoved).
				Dur("elapsed_ms", elapsed).
				Msg("[updatePairsCache] Optimized O(N) completed")

		case <-ctx.Done():
			updatePairsCacheTicker.Stop()
			return
		}
	}

}

func (p *PairsMatchingService) GetMatchData(ctx context.Context) map[string]entity.GameData {
	matchDataMap := p.matchDataCache.ReadAll()
	filtered := make(map[string]entity.GameData, len(matchDataMap))
	now := time.Now()

	for key, match := range matchDataMap {
		if shouldEvictMatchData(p.cfg, match, now) {
			continue
		}
		filtered[key] = match
	}

	return filtered
}

func (p *PairsMatchingService) GetCacheKeys(ctx context.Context) map[string]map[string]string {
	cacheKeys := p.matchKeysCache.ReadAll()
	newMap := make(map[string]map[string]string)
	for key, value := range cacheKeys {
		newMap[key] = value.ReadAll()
	}

	return newMap
}

func (p *PairsMatchingService) GetCachePairs(ctx context.Context) (map[string]string, map[string]string) {
	return p.matchPairsCache.ReadAll()
}

func (p *PairsMatchingService) GetPairs(ctx context.Context) map[string]entity.ResponsePair {
	return p.pairs.ReadAll()
}

func (p *PairsMatchingService) GetPublicPairs(ctx context.Context) map[string]entity.ResponsePair {
	pairs := p.pairs.ReadAll()
	filtered := make(map[string]entity.ResponsePair, len(pairs))
	now := time.Now()

	for key, val := range pairs {
		publicPair, ok := p.buildPublicPair(key, val, now, p.cfg, true, "http")
		if !ok {
			continue
		}
		filtered[key] = publicPair
	}

	return filtered
}

func (p *PairsMatchingService) GetConfig() config.PairsMatching {
	return p.cfg
}

func liveMatchDataTimeout(cfg config.PairsMatching) time.Duration {
	if cfg.LiveMatchDataTimeout > 0 {
		return time.Duration(cfg.LiveMatchDataTimeout) * time.Second
	}

	return 7 * time.Second
}

func matchDataTimeout(cfg config.PairsMatching, match entity.GameData) time.Duration {
	if match.IsLive {
		return liveMatchDataTimeout(cfg)
	}

	return time.Duration(cfg.MatchDataTimeout) * time.Second
}

func shouldEvictMatchData(cfg config.PairsMatching, match entity.GameData, now time.Time) bool {
	if !match.CreatedAt.IsZero() && now.Sub(match.CreatedAt) > matchDataTimeout(cfg, match) {
		return true
	}

	if !match.IsLive && !match.MatchDate.IsZero() && match.MatchDate.Before(now) {
		return true
	}

	return false
}

func createKeyMatchData(bookmaker, sportName string, pid int64) string {
	return fmt.Sprintf("%s%s%d", bookmaker, sportName, pid)
}

// generatePairCSV создает CSV файл для пары Pinnacle vs Other БК
func (p *PairsMatchingService) generatePairCSV(pair entity.ResponsePair, outputDir string) {
	if outputDir == "" {
		outputDir = "logs/bets/pairs"
	}

	// Ensure directory exists
	_ = os.MkdirAll(outputDir, 0o755)

	// Находим исход с максимальным ROI
	if len(pair.Outcome) == 0 {
		return
	}

	maxROI := 0.0
	var bestOutcome entity.Outcome
	for _, outcome := range pair.Outcome {
		if outcome.ROI > maxROI {
			maxROI = outcome.ROI
			bestOutcome = outcome
		}
	}

	// Фильтр ROI >= 15%
	minROI := 15.0
	if p.cfg.MinROIThreshold > 0 {
		minROI = p.cfg.MinROIThreshold
	}
	if maxROI < minROI {
		return
	}

	// Формирование имени файла
	mkey := fmt.Sprintf("%s|%s|%s", pair.SportName, pair.First.HomeName, pair.First.AwayName)
	fname := fmt.Sprintf("%s_%s__%s__roi%.1f__%s_vs_%s__pair.csv",
		time.Now().Format("20060102_150405"),
		capture.SanitizeFileComponent(mkey),
		capture.SanitizeFileComponent(bestOutcome.Outcome),
		maxROI,
		pair.Second.Bookmaker,
		pair.First.Bookmaker, // Pinnacle
	)

	path := filepath.Join(outputDir, fname)
	f, err := os.Create(path)
	if err != nil {
		p.logger.Error().Err(err).Str("file", path).Msg("[PAIRS_CSV_ERROR] Failed to create file")
		return
	}
	defer f.Close()

	bw := bufio.NewWriter(f)
	defer bw.Flush()

	// Header
	fmt.Fprintf(bw, "Section,Time,%s,%s,ROI,Margin,Ratio\n",
		pair.Second.Bookmaker, pair.First.Bookmaker)

	// Before Bet (текущее состояние)
	ratio := bestOutcome.Score2.Value / bestOutcome.Score1.Value
	if bestOutcome.Score1.Value > 0 {
		fmt.Fprintf(bw, "Before Bet,%s,%.3f,%.3f,%.2f,%.3f,%.3f\n",
			pair.CreatedAt.Format("2006-01-02 15:04:05"),
			bestOutcome.Score2.Value,
			bestOutcome.Score1.Value,
			bestOutcome.ROI,
			bestOutcome.Margin,
			ratio,
		)
	}

	p.logger.Info().Msg(fmt.Sprintf("[PAIRS_CSV_SUCCESS] Created: %s (roi=%.2f, %s vs %s)",
		fname, maxROI, pair.Second.Bookmaker, pair.First.Bookmaker))
}

// createTestSignalCSV kept as an explicit no-op so legacy call sites fail closed if restored.
func (p *PairsMatchingService) createTestSignalCSV(sig *tracker.HighROITestSignal) {
	p.logger.Warn().
		Str("bookmaker2", sig.Bookmaker2).
		Float64("roi", sig.Roi).
		Msg("[TEST_CSV_RETIRED] Skipping retired test signal CSV generation")
}

// filterPairsByMode filters pairs based on Live/Prematch mode
func filterPairsByMode(pairs []entity.ResponsePair, isLive bool) []entity.ResponsePair {
	filtered := make([]entity.ResponsePair, 0)
	for _, pair := range pairs {
		if pair.IsLive == isLive {
			filtered = append(filtered, pair)
		}
	}
	return filtered
}

// filterPairInfoByMode filters pair info based on Live/Prematch mode
func filterPairInfoByMode(pairsInfo []entity.PairInfo, isLive bool) []entity.PairInfo {
	filtered := make([]entity.PairInfo, 0)
	for _, pairInfo := range pairsInfo {
		if pairInfo.IsLive == isLive {
			filtered = append(filtered, pairInfo)
		}
	}
	return filtered
}

func (p *PairsMatchingService) GetOnlineMatchData(ctx context.Context) []entity.MatchData {
	matchDataMap := p.matchDataCache.ReadAll()
	now := time.Now()

	var matchData []entity.MatchData
	for _, match := range matchDataMap {
		if shouldEvictMatchData(p.cfg, match, now) {
			continue
		}
		matchData = append(matchData, entity.MatchData{
			LeagueName: match.LeagueName,
			HomeName:   match.HomeName,
			AwayName:   match.AwayName,
			MatchID:    match.MatchId,
			Bookmaker:  match.Source,
			SportName:  string(match.SportName),
			MatchDate:  match.MatchDate,
			CreatedAt:  match.CreatedAt,
		})
	}

	return matchData
}

func (p *PairsMatchingService) sendLowOdds(ctx context.Context, cfg config.PairsMatching, wgWork *sync.WaitGroup) {
	defer wgWork.Done()
	defer recovery.RecoverPanic(p.logger, "sendLowOdds")
	interval := time.Duration(time.Duration(cfg.SendInterval) * time.Millisecond)
	ticker := time.NewTicker(interval)

	for {
		select {
		case <-ticker.C:
			pairs := p.lowOddsPairs.ReadAll()
			var results []entity.ResponsePair
			now := time.Now()
			maxAge := time.Duration(cfg.MaxPriceAgeSeconds) * time.Second

			for key, val := range pairs {
				if time.Since(val.CreatedAt) > (time.Duration(cfg.PairTimeout) * time.Second) {
					p.lowOddsPairs.Delete(key)
				} else {
					firstAge := now.Sub(val.First.CreatedAt)
					secondAge := now.Sub(val.Second.CreatedAt)

					if firstAge > maxAge || secondAge > maxAge {
						continue
					}

					// Refresh per-outcome age and filter stale outcomes
					var freshOutcomes []entity.Outcome
					for i := range val.Outcome {
						seenAge := p.GetOutcomeAgeWithFallback(val.First.Bookmaker, val.First.MatchID, val.Outcome[i].Outcome, val.Outcome[i].PinnacleBestSource)
						if seenAge < 0 {
							seenAge = firstAge.Seconds()
						}
						if seenAge > maxAge.Seconds() {
							continue
						}
						val.Outcome[i].OutcomeAge = seenAge
						freshOutcomes = append(freshOutcomes, val.Outcome[i])
					}
					if len(freshOutcomes) == 0 {
						continue
					}
					val.Outcome = freshOutcomes

					dataAge := firstAge
					if secondAge > dataAge {
						dataAge = secondAge
					}
					val.DataAge = dataAge.Seconds()
					results = append(results, val)
				}
			}

			// Split by mode
			livePairs := filterPairsByMode(results, true)
			if len(livePairs) > 0 {
				p.lowOddsSendChan <- entity.WebSocketMessage{
					Pairs:      livePairs,
					IsLiveMode: true,
				}
			}

			prematchPairs := filterPairsByMode(results, false)
			if len(prematchPairs) > 0 {
				p.lowOddsSendChan <- entity.WebSocketMessage{
					Pairs:      prematchPairs,
					IsLiveMode: false,
				}
			}

		case <-ctx.Done():
			ticker.Stop()
			return
		}
	}
}

// ClearParserData removes all cached data for a specific parser (bookmaker)
// Called when parser is disabled via Runner to immediately stop showing its data
func (p *PairsMatchingService) ClearParserData(ctx context.Context, parserName string, isLive bool) int {
	deleted := 0

	// Clear from matchDataCache (primary data store)
	data := p.matchDataCache.ReadAll()
	for key, match := range data {
		if match.Source == parserName && match.IsLive == isLive {
			p.matchDataCache.Delete(key)
			p.matchKeysCache.Delete(key)
			p.matchPairsCache.Delete(key)
			deleted++
		}
	}

	// Also clear matchKeysCache entries by prefix (catches zombie keys after matchData expired)
	keysData := p.matchKeysCache.ReadAll()
	for key := range keysData {
		if strings.HasPrefix(key, parserName) {
			p.matchKeysCache.Delete(key)
			p.matchPairsCache.Delete(key)
		}
	}

	// Clear from pairs cache
	pairs := p.pairs.ReadAll()
	for key, pair := range pairs {
		if (pair.First.Bookmaker == parserName || pair.Second.Bookmaker == parserName) && pair.IsLive == isLive {
			p.pairs.Delete(key)
			p.pairFirstSeen.Delete(key)
		}
	}

	// Clear from lowOddsPairs cache
	lowPairs := p.lowOddsPairs.ReadAll()
	for key, pair := range lowPairs {
		if (pair.First.Bookmaker == parserName || pair.Second.Bookmaker == parserName) && pair.IsLive == isLive {
			p.lowOddsPairs.Delete(key)
		}
	}

	// Clear outcomeLastSeen for this parser (prevents stale outcome tracking)
	prefix := parserName + "|"
	p.outcomeLastSeen.Range(func(key, value interface{}) bool {
		if k, ok := key.(string); ok && strings.HasPrefix(k, prefix) {
			p.outcomeLastSeen.Delete(key)
		}
		return true
	})

	p.logger.Info().
		Str("parser", parserName).
		Bool("isLive", isLive).
		Int("deleted_matches", deleted).
		Msg("[ClearParserData] Cleared parser data from caches")

	return deleted
}

// areLeaguesRelated checks if two leagues could plausibly be the same competition
// Returns false for obvious cross-country mismatches (e.g., England vs Spain)
// This is a SAFETY CHECK to prevent invalid pairs from stale matchPairsCache data
// manualLeagueEquivalences maps variant league names to a canonical form.
// This allows pairs like "scotland league one" (Pinnacle) vs "Scotland League 1" (Sansabet)
// to be recognized as the same competition without changing cross-country detection logic.
var manualLeagueEquivalences = map[string]string{
	// Scottish leagues: Pinnacle uses words, Sansabet uses numbers
	"scotland league one":   "scotland league 1",
	"scotland league two":   "scotland league 2",
	"scotland cup":          "scotland fa cup",
	"scottish league one":   "scotland league 1",
	"scottish league two":   "scotland league 2",
	"scottish cup":          "scotland fa cup",
	"scottish fa cup":       "scotland fa cup",
	"scotland championship": "scottish championship",
	"scotland premiership":  "scottish premiership",
	// English leagues: number vs word variants
	"england league one": "england league 1",
	"england league two": "england league 2",
	"english league one": "england league 1",
	"english league two": "england league 2",
}

// normalizeLeagueName applies manual equivalence mappings to a lowercased league name.
func normalizeLeagueName(league string) string {
	if canonical, ok := manualLeagueEquivalences[league]; ok {
		return canonical
	}
	return league
}

func areLeaguesRelated(league1, league2 string) bool {
	l1 := strings.ToLower(league1)
	l2 := strings.ToLower(league2)

	// Apply manual equivalences before any comparison
	l1 = normalizeLeagueName(l1)
	l2 = normalizeLeagueName(l2)

	// If after normalization both leagues are identical, they are the same competition
	if l1 == l2 {
		return true
	}

	// Define country markers
	countries := map[string][]string{
		"england":       {"england", "engle", "eng ", "english", "premier league", "fa cup", "efl", "league one", "league two", "national league"},
		"spain":         {"spain", "špan", "spanish", "laliga", "la liga", "primera", "segunda", "tercera", "rfef"},
		"germany":       {"germany", "german", "bundesliga", "nemac", "deutsch"},
		"italy":         {"italy", "italian", "serie", "ital"},
		"france":        {"france", "french", "ligue", "franc"},
		"portugal":      {"portugal", "portug", "primeira", "liga portugal"},
		"netherlands":   {"netherlands", "dutch", "eredivisie", "holland", "holand"},
		"scotland":      {"scotland", "scottish"},
		"iran":          {"iran", "persian"},
		"australia":     {"australia", "australian", "a-league"},
		"international": {"champions league", "europa league", "conference league", "international clubs", "world cup", "euro 202"},
	}

	// Find country for each league
	var country1, country2 string
	for country, markers := range countries {
		for _, marker := range markers {
			if strings.Contains(l1, marker) {
				country1 = country
			}
			if strings.Contains(l2, marker) {
				country2 = country
			}
		}
	}

	// If we couldn't determine country for either league, allow the pair (be conservative)
	if country1 == "" || country2 == "" {
		return true
	}

	// Same country = related
	if country1 == country2 {
		return true
	}

	// International competitions can match with any country
	if country1 == "international" || country2 == "international" {
		return true
	}

	// Different countries = NOT related (this is the key safety check)
	return false
}

// areSportsCompatible checks if two sports are the same or compatible variations
// Returns false for obvious cross-sport mismatches (e.g., Soccer vs Basketball)
// This prevents invalid pairs when teams have similar names across different sports
func areSportsCompatible(sport1, sport2 string) bool {
	s1 := strings.ToLower(strings.TrimSpace(sport1))
	s2 := strings.ToLower(strings.TrimSpace(sport2))

	// Exact match
	if s1 == s2 {
		return true
	}

	// Define sport groups (variations of the same sport)
	sportGroups := map[string][]string{
		"soccer":            {"soccer", "football", "futbol", "fútbol"},
		"basketball":        {"basketball"},
		"tennis":            {"tennis"},
		"hockey":            {"hockey", "ice hockey", "icehockey"},
		"volleyball":        {"volleyball"},
		"handball":          {"handball"},
		"american_football": {"americanfootball", "american football", "nfl", "ncaa football"},
		"baseball":          {"baseball"},
		"rugby":             {"rugby", "rugby union", "rugby league"},
		"cricket":           {"cricket"},
		"table_tennis":      {"tabletennis", "table tennis", "ping pong"},
		"badminton":         {"badminton"},
		"esports":           {"esports", "e-sports", "esport"},
	}

	// Find group for each sport
	var group1, group2 string
	for group, variations := range sportGroups {
		for _, v := range variations {
			if s1 == v || strings.Contains(s1, v) {
				group1 = group
			}
			if s2 == v || strings.Contains(s2, v) {
				group2 = group
			}
		}
	}

	// If we couldn't determine group for either sport, be conservative and allow
	// (unknown sports might be valid matches)
	if group1 == "" || group2 == "" {
		return true
	}

	// Same group = compatible
	return group1 == group2
}

// analyzeHighROI создаёт задачу для Droid (отложенная фича, DroidEnabled=false по умолчанию)
// Включается на период тестирования для анализа аномальных ROI сигналов
func (p *PairsMatchingService) analyzeHighROI(pair entity.ResponsePair, outcome entity.Outcome) {
	sig := HighROISignalInfo{
		ROI:         outcome.ROI,
		SportName:   pair.SportName,
		Bookmaker1:  pair.First.Bookmaker,
		Bookmaker2:  pair.Second.Bookmaker,
		Outcome:     outcome.Outcome,
		OutcomeType: ExtractOutcomeType(outcome.Outcome),
		HomeName:    pair.First.HomeName,
		AwayName:    pair.First.AwayName,
		LeagueName:  pair.First.LeagueName,
		Price1:      outcome.Score1.Value,
		Price2:      outcome.Score2.Value,
		Margin:      outcome.Margin,
		IsLive:      pair.IsLive,
		MatchID1:    pair.First.MatchID,
		MatchID2:    pair.Second.MatchID,
	}

	if !p.droidAnalyzer.ShouldCreateTask(sig) {
		return
	}

	p.logger.Warn().
		Float64("roi", outcome.ROI).
		Str("sport", pair.SportName).
		Str("bookmaker", pair.Second.Bookmaker).
		Str("outcome", outcome.Outcome).
		Msg("[HIGH_ROI_ALERT] Creating Droid task")

	if err := p.droidAnalyzer.CreateTask(sig); err != nil {
		p.logger.Error().Err(err).Msg("[DROID] Failed to create task")
	}
}

// saveRawDataForHighROI сохраняет сырые данные парсеров при аномально высоком ROI
func (p *PairsMatchingService) saveRawDataForHighROI(pair entity.ResponsePair, outcome entity.Outcome) {
	// Порог сохранения (30% ROI)
	if outcome.ROI < 30.0 {
		return
	}

	// Rate-limit: не сохранять один и тот же матч+исход чаще чем раз в 5 минут
	dedupKey := fmt.Sprintf("%s|%s|%s", pair.First.MatchID, pair.Second.MatchID, outcome.Outcome)
	now := time.Now()
	if lastSave, ok := rawDataLastSave.Load(dedupKey); ok {
		if now.Sub(lastSave.(time.Time)) < rawDataSaveInterval {
			return
		}
	}
	rawDataLastSave.Store(dedupKey, now)

	// Создаем директорию
	outputDir := "logs/raw_data"
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		p.logger.Error().Err(err).Msg("[RAW_SAVE] Failed to create directory")
		return
	}

	// Формируем имя файла
	// Пример: 20260205_120000_Soccer_ROI137_Sansabet_vs_Pinnacle.json
	timestamp := time.Now().Format("20060102_150405")
	safeOutcome := strings.ReplaceAll(outcome.Outcome, "/", "-")
	safeOutcome = strings.ReplaceAll(safeOutcome, " ", "_")

	filename := fmt.Sprintf("%s_%s_ROI%.0f_%s_vs_%s_%s.json",
		timestamp,
		pair.SportName,
		outcome.ROI,
		pair.Second.Bookmaker, // Donor
		pair.First.Bookmaker,  // Pinnacle
		safeOutcome,
	)

	fullPath := filepath.Join(outputDir, filename)

	// Собираем полный дамп данных
	dumpData := map[string]interface{}{
		"meta": map[string]interface{}{
			"timestamp":   time.Now(),
			"roi":         outcome.ROI,
			"margin":      outcome.Margin,
			"sport":       pair.SportName,
			"outcome_key": outcome.Outcome,
			"market_type": outcome.MarketType,
			"is_live":     pair.IsLive,
			"trace_id":    pair.TraceID,
		},
		"match_info": map[string]interface{}{
			"pinnacle_match": pair.First.HomeName + " vs " + pair.First.AwayName,
			"donor_match":    pair.Second.HomeName + " vs " + pair.Second.AwayName,
			"pinnacle_id":    pair.First.MatchID,
			"donor_id":       pair.Second.MatchID,
		},
		"prices": map[string]interface{}{
			"pinnacle_coef": outcome.Score1.Value,
			"donor_coef":    outcome.Score2.Value,
		},
		// САМОЕ ГЛАВНОЕ: Сырые данные от парсеров
		"raw_data": map[string]interface{}{
			"pinnacle": pair.First.Raw,
			"donor":    pair.Second.Raw,
		},
	}

	// Сериализуем в компактный JSON (без отступов — экономит ~30% размера и CPU)
	fileData, err := json.Marshal(dumpData)
	if err != nil {
		p.logger.Error().Err(err).Msg("[RAW_SAVE] JSON Marshal error")
		return
	}

	// Записываем файл
	if err := os.WriteFile(fullPath, fileData, 0644); err != nil {
		p.logger.Error().Err(err).Str("file", fullPath).Msg("[RAW_SAVE] Write file error")
		return
	}

	p.logger.Info().
		Str("file", filename).
		Float64("roi", outcome.ROI).
		Msg("[RAW_SAVE] 💾 High ROI Raw Data Saved Successfully")
}
