package service

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"livebets/auto_matcher/cmd/config"
	"livebets/auto_matcher/internal/entity"
	"livebets/auto_matcher/internal/repository"
	"livebets/auto_matcher/internal/service/providers"
	"livebets/auto_matcher/pkg/rdbms"
	pkgutils "livebets/pkg/utils"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// leagueStateCache - кэш состояния лиг для отслеживания изменений
type leagueStateCache struct {
	mu     sync.Mutex
	states map[string]*leagueState
}

// leagueState - состояние конкретной комбинации спорт+букмекеры
type leagueState struct {
	hash          string    // MD5 хэш списка league IDs
	lastProcessed time.Time // Когда последний раз обрабатывали
	lastChanged   time.Time // Когда последний раз изменился hash
	leagueCount   int       // Количество лиг
}

// teamBatchCache — negative cache для team-level LLM запросов.
// Если набор команд в league pair не изменился и LLM уже ответил "нет совпадений",
// повторный вызов LLM не нужен. Если появилась хоть одна новая команда — хэш изменится.
type teamBatchCache struct {
	mu     sync.Mutex
	states map[string]*teamBatchState
}

// teamBatchState — состояние конкретного batch-запроса команд
type teamBatchState struct {
	hash          string    // MD5 хэш всех team IDs в batch
	lastProcessed time.Time // Когда последний раз вызывали LLM
	matchesFound  int       // Сколько совпадений нашёл LLM в прошлый раз
}

const teamBatchCacheTTL = 6 * time.Hour // Даже при неизменных командах перепроверяем раз в 6 часов

func newTeamBatchCache() *teamBatchCache {
	return &teamBatchCache{
		states: make(map[string]*teamBatchState),
	}
}

// shouldCallLLMForTeams проверяет, изменился ли набор команд с прошлого вызова.
// Возвращает true если нужно вызвать LLM (новые команды или TTL истёк).
func (c *teamBatchCache) shouldCallLLMForTeams(cacheKey, currentHash string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	state, exists := c.states[cacheKey]

	if !exists {
		// Первый раз — вызвать LLM
		c.states[cacheKey] = &teamBatchState{
			hash:          currentHash,
			lastProcessed: now,
		}
		return true
	}

	// Набор команд изменился → вызвать LLM
	if state.hash != currentHash {
		state.hash = currentHash
		state.lastProcessed = now
		state.matchesFound = 0
		return true
	}

	// Набор тот же, но TTL истёк → перепроверить
	if now.Sub(state.lastProcessed) > teamBatchCacheTTL {
		state.lastProcessed = now
		return true
	}

	// Набор тот же и TTL не истёк — SKIP
	return false
}

// updateAfterLLMCall обновляет кэш после вызова LLM
func (c *teamBatchCache) updateAfterLLMCall(cacheKey string, matchesFound int) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if state, exists := c.states[cacheKey]; exists {
		state.matchesFound = matchesFound
		state.lastProcessed = time.Now()
	}
}

// iterationStats - статистика итерации обработки
type iterationStats struct {
	totalCombinations int // Всего комбинаций спорт+букмекеры
	skippedNoLive     int // Пропущено - нет live матчей
	skippedNoChange   int // Пропущено - лиги не изменились
	skippedTeamCache  int // Пропущено - команды не изменились (negative cache)
	processedLLM      int // Обработано через LLM
}

// LLMProvider - алиас интерфейса из пакета providers
type LLMProvider = providers.LLMProvider

// apiKeyState отслеживает состояние отдельного API ключа
type apiKeyState struct {
	lastRequestTime time.Time
	isBlocked       bool
	blockedUntil    time.Time
	dailyTokens     int
	totalRequests   int
}

// LLMHealthStatus - статус здоровья LLM сервиса для health endpoint
type LLMHealthStatus struct {
	OK                 bool      `json:"ok"`
	Provider           string    `json:"provider"`
	TotalKeys          int       `json:"total_keys"`
	ExhaustedKeys      int       `json:"exhausted_keys"`
	AvailableKeys      int       `json:"available_keys"`
	LastSuccessTime    time.Time `json:"last_success_time,omitempty"`
	LastErrorTime      time.Time `json:"last_error_time,omitempty"`
	LastError          string    `json:"last_error,omitempty"`
	ConsecutiveErrors  int       `json:"consecutive_errors"`
	FallbackAvailable  bool      `json:"fallback_available"`
	FallbackUsed       bool      `json:"fallback_used"`
	AllKeysExhausted   bool      `json:"all_keys_exhausted"`
	ConfigurationError bool      `json:"configuration_error"`
	Message            string    `json:"message,omitempty"`
}

type LLMMatcherService struct {
	txStorage              rdbms.TxStorage[repository.MatchStorage]
	onlineMatcherService   *OnlineMatcherService
	handMatchService       *HandMatcherService
	cfg                    config.LLMMatcherConfig
	logger                 *zerolog.Logger
	llmLogger              *zerolog.Logger
	provider               LLMProvider
	fallbackProvider       LLMProvider // Gemini fallback when all rotation keys exhausted
	vertexFallbackProvider LLMProvider // Vertex AI fallback (Google Cloud $300 credits)
	decisionLogger         *DecisionLogger
	pendingPairManager     *PendingPairManager

	// League state cache для предотвращения повторной обработки
	leagueCache *leagueStateCache
	// Team batch negative cache — не вызывать LLM повторно если команды не изменились
	teamCache *teamBatchCache

	// API key rotation with rate limiting
	currentApiKeyIndex int
	apiKeyStates       map[int]*apiKeyState
	apiKeyMutex        sync.RWMutex

	// Health status tracking
	lastSuccessTime    time.Time
	lastErrorTime      time.Time
	lastError          string
	consecutiveErrors  int
	allKeysExhausted   bool
	configurationError bool
	healthMutex        sync.RWMutex
}

// newLeagueStateCache создает новый кэш состояния лиг
func newLeagueStateCache() *leagueStateCache {
	return &leagueStateCache{
		states: make(map[string]*leagueState),
	}
}

func NewLLMMatcherService(
	txStorage rdbms.TxStorage[repository.MatchStorage],
	onlineMatcherService *OnlineMatcherService,
	handMatchService *HandMatcherService,
	cfg config.LLMMatcherConfig,
	logger *zerolog.Logger,
) (*LLMMatcherService, error) {
	// Create LLM logger to separate file
	llmLogFile, err := os.OpenFile("logs/llm_matcher.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to create LLM log file, using console")
		llmLogFile = os.Stdout
	}
	llmLogger := zerolog.New(llmLogFile).With().Timestamp().Logger()

	// Support both single api_key and multiple api_keys
	if len(cfg.ApiKeys) == 0 && cfg.ApiKey != "" {
		cfg.ApiKeys = []string{cfg.ApiKey}
	}
	if len(cfg.ApiKeys) == 0 {
		return nil, fmt.Errorf("no API keys configured (use api_key or api_keys)")
	}

	logger.Info().Msgf("✅ Configured %d API key(s) for rotation", len(cfg.ApiKeys))

	// Initialize provider based on config
	var provider LLMProvider
	ctx := context.Background()

	switch strings.ToLower(cfg.Provider) {
	case "cerebras":
		cerebrasCfg := providers.CerebrasConfig{
			Model:               cfg.Cerebras.Model,
			MaxCompletionTokens: cfg.Cerebras.MaxCompletionTokens,
			Temperature:         cfg.Cerebras.Temperature,
			TopP:                cfg.Cerebras.TopP,
		}
		provider, err = providers.NewCerebrasProvider(ctx, cfg.ApiKeys[0], cerebrasCfg, &llmLogger)
		if err != nil {
			return nil, fmt.Errorf("failed to create Cerebras provider: %w", err)
		}
		logger.Info().Msg("✅ Using Cerebras Cloud provider")
	case "gemini", "":
		geminiCfg := providers.GeminiConfig{
			Model:       cfg.Gemini.Model,
			MaxTokens:   cfg.Gemini.MaxTokens,
			Temperature: cfg.Gemini.Temperature,
		}
		provider, err = providers.NewGeminiProvider(ctx, cfg.ApiKeys, geminiCfg, &llmLogger)
		if err != nil {
			return nil, fmt.Errorf("failed to create Gemini provider: %w", err)
		}
		logger.Info().Msg("✅ Using Google Gemini provider")
	default:
		return nil, fmt.Errorf("unknown LLM provider: %s (supported: gemini, cerebras)", cfg.Provider)
	}

	// Initialize Gemini fallback provider (when all rotation keys exhausted)
	var fallbackProvider LLMProvider
	fallbackApiKeys := cfg.GeminiFallback.ApiKeys
	if len(fallbackApiKeys) == 0 && cfg.GeminiFallback.ApiKey != "" {
		fallbackApiKeys = []string{cfg.GeminiFallback.ApiKey}
	}
	if cfg.GeminiFallback.Enabled && len(fallbackApiKeys) > 0 {
		model := cfg.GeminiFallback.Model
		if model == "" {
			model = "gemini-2.5-flash"
		}
		if !strings.Contains(model, "2.5") {
			logger.Error().Str("model", model).Msg("❌ INVALID GEMINI MODEL! Only 2.5+ allowed")
			return nil, fmt.Errorf("invalid Gemini fallback model: %s. Only gemini-2.5+ allowed", model)
		}

		fallbackCfg := providers.GeminiConfig{
			Model:       model,
			MaxTokens:   cfg.Gemini.MaxTokens,
			Temperature: cfg.Gemini.Temperature,
		}
		fallbackProvider, err = providers.NewGeminiProvider(ctx, fallbackApiKeys, fallbackCfg, &llmLogger)
		if err != nil {
			logger.Warn().Err(err).Msg("⚠️ Failed to create Gemini fallback provider")
			fallbackProvider = nil
		} else {
			logger.Info().Str("model", model).Int("keys_count", len(fallbackApiKeys)).Msg("✅ Gemini 2.5 fallback provider initialized")
		}
	}

	// Initialize Vertex AI fallback provider (Google Cloud)
	var vertexFallbackProvider LLMProvider
	if cfg.VertexFallback.Enabled && cfg.VertexFallback.ProjectID != "" {
		vertexCfg := providers.VertexAIConfig{
			ProjectID:          cfg.VertexFallback.ProjectID,
			Location:           cfg.VertexFallback.Location,
			Model:              cfg.VertexFallback.Model,
			ServiceAccountFile: cfg.VertexFallback.ServiceAccountFile,
			MaxTokens:          cfg.Gemini.MaxTokens,
		}
		vertexFallbackProvider, err = providers.NewVertexAIProvider(ctx, vertexCfg, &llmLogger)
		if err != nil {
			logger.Warn().Err(err).Msg("⚠️ Failed to create Vertex AI fallback provider")
			vertexFallbackProvider = nil
		} else {
			logger.Info().
				Str("project", cfg.VertexFallback.ProjectID).
				Str("location", cfg.VertexFallback.Location).
				Msg("✅ Vertex AI fallback provider initialized")
		}
	}

	// Initialize API key states for rate limiting
	apiKeyStates := make(map[int]*apiKeyState)
	for i := range cfg.ApiKeys {
		apiKeyStates[i] = &apiKeyState{
			lastRequestTime: time.Time{},
			isBlocked:       false,
			blockedUntil:    time.Time{},
			dailyTokens:     0,
			totalRequests:   0,
		}
	}

	// Initialize decision logger
	decisionLogger, err := NewDecisionLogger("logs/matching_decisions.jsonl")
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to create decision logger, decisions won't be logged")
		decisionLogger = nil // Continue without logging if it fails
	}

	// The JSONL review/approval path is fail-closed by default because its
	// storage is local to the container. Strictly evidenced automatic mappings
	// do not depend on this optional manager.
	pendingPairManager, err := newPendingPairManagerIfEnabled(cfg.PendingReviewEnabled, "logs")
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to create pending pair manager, pending pairs won't be saved")
		pendingPairManager = nil
	} else if !cfg.PendingReviewEnabled {
		logger.Info().Msg("Pending mapping review/approval path is disabled (explicit opt-in required)")
	}

	svc := &LLMMatcherService{
		txStorage:              txStorage,
		onlineMatcherService:   onlineMatcherService,
		handMatchService:       handMatchService,
		cfg:                    cfg,
		logger:                 logger,
		llmLogger:              &llmLogger,
		provider:               provider,
		fallbackProvider:       fallbackProvider,
		vertexFallbackProvider: vertexFallbackProvider,
		decisionLogger:         decisionLogger,
		pendingPairManager:     pendingPairManager,
		leagueCache:            newLeagueStateCache(),
		teamCache:              newTeamBatchCache(),
		currentApiKeyIndex:     0,
		apiKeyStates:           apiKeyStates,
	}

	return svc, nil
}

func (s *LLMMatcherService) Run(ctx context.Context, bookmakerPairs map[int64][2]string, wg *sync.WaitGroup) {
	defer wg.Done()

	// Reset all key blocks on startup (clear stale blocks from previous runs)
	s.apiKeyMutex.Lock()
	for i := range s.apiKeyStates {
		s.apiKeyStates[i].isBlocked = false
		s.apiKeyStates[i].blockedUntil = time.Time{}
	}
	s.apiKeyMutex.Unlock()
	s.logger.Info().Int("keys_count", len(s.apiKeyStates)).Msg("[LLMMatcherService] 🔓 Reset all API key blocks on startup")

	// Run immediately on startup
	s.logger.Info().Msg("[LLMMatcherService] Starting initial check immediately")
	s.processLiveMatches(ctx, bookmakerPairs)

	// Ticker for checking matches every N minutes
	ticker := time.NewTicker(time.Duration(s.cfg.CheckInterval) * time.Second)
	defer ticker.Stop()

	// Ticker for daily reset at 3 AM
	resetTicker := time.NewTicker(1 * time.Minute)
	defer resetTicker.Stop()

	for {
		select {
		case <-ticker.C:
			s.processLiveMatches(ctx, bookmakerPairs)

		case <-resetTicker.C:
			now := time.Now()
			if now.Hour() == 3 && now.Minute() == 0 {
				s.logger.Info().Msg("[LLMMatcherService] Resetting daily token counters at 3 AM")
				s.resetDailyTokenCounters()
			}

		case <-ctx.Done():
			ticker.Stop()
			resetTicker.Stop()
			return
		}
	}
}

func (s *LLMMatcherService) processLiveMatches(ctx context.Context, bookmakerPairs map[int64][2]string) {
	mode := config.GetMode()
	s.logger.Info().Str("mode", mode).Msg("[LLMMatcherService] Processing matches")

	// Get sports list
	sports, err := s.txStorage.Storage().GetSports(ctx)
	if err != nil {
		s.logger.Error().Err(err).Msg("[LLMMatcherService] Failed to get sports")
		return
	}

	// Инициализируем статистику итерации
	stats := &iterationStats{
		totalCombinations: len(sports) * len(bookmakerPairs),
	}

	s.logger.Info().Msgf("[LLMMatcherService] Processing %d sports for %d bookmaker pairs (%d combinations)",
		len(sports), len(bookmakerPairs), stats.totalCombinations)

	// НОВЫЙ ПОДХОД: используем те же API что ручные страницы
	// Обрабатываем каждую пару букмекеров + спорт ОТДЕЛЬНО
	for _, bookmakerPair := range bookmakerPairs {
		for _, sport := range sports {
			s.processBookmakerPairOnline(ctx, sport, bookmakerPair, stats)
		}
	}

	// Выводим итоговую статистику
	saved := stats.totalCombinations - stats.processedLLM
	reduction := 0.0
	if stats.totalCombinations > 0 {
		reduction = float64(saved) / float64(stats.totalCombinations) * 100
	}
	s.logger.Info().
		Int("total", stats.totalCombinations).
		Int("skipped_no_live", stats.skippedNoLive).
		Int("skipped_no_change", stats.skippedNoChange).
		Int("skipped_team_cache", stats.skippedTeamCache).
		Int("processed_llm", stats.processedLLM).
		Int("saved_requests", saved).
		Msgf("[LLMMatcherService] ✅ Iteration complete: %d LLM calls, %d saved (%.1f%% reduction)",
			stats.processedLLM, saved, reduction)
}

// processBookmakerPairOnline обрабатывает одну пару букмекеров для конкретного спорта
// Использует ТОЧНО ТЕ ЖЕ методы что и ручные страницы /online-leagues и /online-matches
func (s *LLMMatcherService) processBookmakerPairOnline(ctx context.Context, sport string, bookmakerPair [2]string, stats *iterationStats) {
	s.logger.Debug().
		Str("sport", sport).
		Str("bk1", bookmakerPair[0]).
		Str("bk2", bookmakerPair[1]).
		Msg("[LLMMatcherService] Processing bookmaker pair")

	// ШАГ 1: Получаем ONLINE UNMATCH лиги (как ручная страница /online-leagues)
	// GetOnlineUnmatchLeagues УЖЕ фильтрует по live data через extractMatchData
	traceID := pkgutils.GenerateUUID()
	mode := config.GetMode()

	var unmatchedLeagues []entity.League
	var err error
	if mode == "prematch" {
		unmatchedLeagues, err = s.onlineMatcherService.GetOnlineUnmatchLeaguesPrematch(ctx, sport, bookmakerPair[0], bookmakerPair[1], traceID)
	} else {
		unmatchedLeagues, err = s.onlineMatcherService.GetOnlineUnmatchLeagues(ctx, sport, bookmakerPair[0], bookmakerPair[1], traceID)
	}
	if err != nil {
		s.logger.Error().Err(err).
			Str("sport", sport).
			Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
			Msg("[LLMMatcherService] Failed to get online unmatched leagues")
		return
	}

	// Проверяем кэш состояния лиг - изменился ли список?
	// ВАЖНО: обновляем кэш ВСЕГДА, даже если список пустой!
	cacheKey := fmt.Sprintf("%s_%s_%s", sport, bookmakerPair[0], bookmakerPair[1])
	currentHash := s.calculateLeagueHash(unmatchedLeagues)

	shouldProcess := s.shouldProcessLeagues(cacheKey, currentHash, len(unmatchedLeagues))

	// Если нет несопоставленных лиг И hash не изменился → SKIP
	if len(unmatchedLeagues) == 0 {
		if !shouldProcess {
			s.logger.Debug().
				Str("sport", sport).
				Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
				Msg("[LLMMatcherService] ⏭️  SKIP - no unmatched leagues (cached)")
			stats.skippedNoChange++
		} else {
			s.logger.Debug().
				Str("sport", sport).
				Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
				Msg("[LLMMatcherService] ⏭️  SKIP - no unmatched leagues found")
			stats.skippedNoLive++
		}
	}

	s.logger.Info().
		Str("sport", sport).
		Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("count", len(unmatchedLeagues)).
		Msg("[LLMMatcherService] Found online unmatched leagues")

	// Автоматический LLM матчинг лиг нужен, чтобы после смены расписания появлялись актуальные league pairs.
	if len(unmatchedLeagues) > 0 {
		if shouldProcess {
			s.matchLeaguesOnlineWithLLM(ctx, unmatchedLeagues, sport, bookmakerPair, traceID)
			stats.processedLLM++
		} else {
			s.logger.Debug().
				Str("sport", sport).
				Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
				Str("hash", currentHash[:8]).
				Msg("[LLMMatcherService] SKIP - leagues unchanged since last processing")
			stats.skippedNoChange++
		}
	}

	// ШАГ 2: Получаем ONLINE UNMATCH команды (как ручная страница /online-matches)
	var unmatchedTeams []entity.UnMatchedTeamsPairResponse
	if mode == "prematch" {
		unmatchedTeams, err = s.onlineMatcherService.GetOnlineUnmatchTeamsPrematch(ctx, sport, bookmakerPair[0], bookmakerPair[1], traceID)
	} else {
		unmatchedTeams, err = s.onlineMatcherService.GetOnlineUnmatchTeams(ctx, sport, bookmakerPair[0], bookmakerPair[1], traceID)
	}
	if err != nil {
		s.logger.Error().Err(err).
			Str("sport", sport).
			Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
			Msg("[LLMMatcherService] Failed to get online unmatched teams")
		return
	}

	// Если нет несопоставленных команд → пропускаем
	if len(unmatchedTeams) == 0 {
		s.logger.Debug().
			Str("sport", sport).
			Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
			Msg("[LLMMatcherService] ⏭️  SKIP - no unmatched teams found")
		return
	}

	totalTeams := 0
	for _, pair := range unmatchedTeams {
		totalTeams += len(pair.TeamsFirst) + len(pair.TeamsSecond)
	}

	// Negative cache: проверяем, изменился ли набор команд с прошлого LLM-вызова.
	// Хэш считается от ВСЕХ team ID — если появилась хоть одна новая команда, хэш изменится.
	teamCacheKey := fmt.Sprintf("teams_%s_%s_%s", sport, bookmakerPair[0], bookmakerPair[1])
	teamHash := s.calculateTeamBatchHash(unmatchedTeams)
	if !s.teamCache.shouldCallLLMForTeams(teamCacheKey, teamHash) {
		s.logger.Debug().
			Str("sport", sport).
			Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
			Int("total_teams", totalTeams).
			Msg("[LLMMatcherService] ⏭️  SKIP - teams unchanged since last LLM call (negative cache)")
		stats.skippedTeamCache++
		return
	}

	s.logger.Info().
		Str("sport", sport).
		Str("bk_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("league_pairs", len(unmatchedTeams)).
		Int("total_teams", totalTeams).
		Msg("[LLMMatcherService] Found online unmatched teams")

	// Матчим команды через LLM (batch по лигам)
	s.matchTeamsOnlineWithLLM(ctx, unmatchedTeams, sport, bookmakerPair, traceID)
	stats.processedLLM++

	// Обновляем кэш после вызова — даже если LLM нашёл 0 совпадений, запоминаем это
	s.teamCache.updateAfterLLMCall(teamCacheKey, 0)
}

func (s *LLMMatcherService) getMatchKey(match entity.MatchData) string {
	return fmt.Sprintf("%s_%s_%s_%s_%s", match.Bookmaker, match.SportName, match.LeagueName, match.HomeName, match.AwayName)
}

// getCurrentApiKey returns the currently active API key
func (s *LLMMatcherService) getCurrentApiKey() string {
	s.apiKeyMutex.RLock()
	defer s.apiKeyMutex.RUnlock()

	if len(s.cfg.ApiKeys) == 0 {
		return ""
	}

	return s.cfg.ApiKeys[s.currentApiKeyIndex]
}

// updateKeyStateAfterRequest обновляет состояние ключа после запроса
func (s *LLMMatcherService) updateKeyStateAfterRequest(keyIndex int, totalTokens int) {
	s.apiKeyMutex.Lock()
	defer s.apiKeyMutex.Unlock()

	if state, exists := s.apiKeyStates[keyIndex]; exists {
		state.dailyTokens += totalTokens

		s.logger.Debug().
			Int("key_index", keyIndex).
			Int("request_tokens", totalTokens).
			Int("daily_tokens", state.dailyTokens).
			Msg("[RateLimiter] Updated key state")
	}
}

// resetDailyTokenCounters сбрасывает счётчики токенов для всех ключей (вызывается в 3 AM)
func (s *LLMMatcherService) resetDailyTokenCounters() {
	s.apiKeyMutex.Lock()
	defer s.apiKeyMutex.Unlock()

	for keyIndex, state := range s.apiKeyStates {
		if state.dailyTokens > 0 {
			s.logger.Info().
				Int("key_index", keyIndex).
				Int("tokens_reset", state.dailyTokens).
				Msg("[RateLimiter] Resetting daily token counter")
		}
		state.dailyTokens = 0
		state.isBlocked = false
		state.blockedUntil = time.Time{}
	}
}

// markKeyAsBlocked помечает ключ как заблокированный на указанное время
func (s *LLMMatcherService) markKeyAsBlocked(keyIndex int, duration time.Duration) {
	s.apiKeyMutex.Lock()
	defer s.apiKeyMutex.Unlock()

	if state, exists := s.apiKeyStates[keyIndex]; exists {
		state.isBlocked = true
		state.blockedUntil = time.Now().Add(duration)

		s.logger.Warn().
			Int("key_index", keyIndex).
			Time("blocked_until", state.blockedUntil).
			Dur("duration", duration).
			Msg("[RateLimiter] 🔒 Key blocked due to rate limit")
	}
}

// isKeyBlocked проверяет, заблокирован ли ключ
func (s *LLMMatcherService) isKeyBlocked(keyIndex int) bool {
	s.apiKeyMutex.Lock()
	defer s.apiKeyMutex.Unlock()

	if state, exists := s.apiKeyStates[keyIndex]; exists {
		if state.isBlocked {
			if time.Now().Before(state.blockedUntil) {
				return true // Ещё заблокирован
			}
			// Время блокировки прошло - разблокируем
			state.isBlocked = false
			s.logger.Info().
				Int("key_index", keyIndex).
				Msg("[RateLimiter] 🔓 Key auto-unblocked (time expired)")
		}
	}
	return false
}

// calculateLeagueHash вычисляет MD5 hash отсортированных league IDs
func (s *LLMMatcherService) calculateLeagueHash(leagues []entity.League) string {
	if len(leagues) == 0 {
		return "empty"
	}

	// Сортируем IDs для стабильного хэша
	ids := make([]int64, len(leagues))
	for i, l := range leagues {
		ids[i] = l.ID
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	// Создаем строку из IDs и хэшируем
	var builder strings.Builder
	for _, id := range ids {
		builder.WriteString(fmt.Sprintf("%d,", id))
	}

	hash := fmt.Sprintf("%x", md5.Sum([]byte(builder.String())))
	return hash
}

// calculateTeamBatchHash вычисляет MD5 hash всех team IDs в наборе несопоставленных команд.
// Если появилась/исчезла хоть одна команда — хэш изменится → LLM будет вызван заново.
func (s *LLMMatcherService) calculateTeamBatchHash(teams []entity.UnMatchedTeamsPairResponse) string {
	if len(teams) == 0 {
		return "empty"
	}

	var allIDs []int64
	for _, pair := range teams {
		allIDs = append(allIDs, pair.LeagueIDFirst, pair.LeagueIDSecond)
		for _, t := range pair.TeamsFirst {
			allIDs = append(allIDs, t.TeamID)
		}
		for _, t := range pair.TeamsSecond {
			allIDs = append(allIDs, t.TeamID)
		}
	}

	sort.Slice(allIDs, func(i, j int) bool { return allIDs[i] < allIDs[j] })

	var builder strings.Builder
	for _, id := range allIDs {
		builder.WriteString(strconv.FormatInt(id, 10))
		builder.WriteByte(',')
	}

	return fmt.Sprintf("%x", md5.Sum([]byte(builder.String())))
}

// shouldProcessLeagues проверяет кэш и решает нужно ли обрабатывать лиги
func (s *LLMMatcherService) shouldProcessLeagues(cacheKey, currentHash string, leagueCount int) bool {
	s.leagueCache.mu.Lock()
	defer s.leagueCache.mu.Unlock()

	now := time.Now()
	cacheTTL := 60 * time.Minute // Периодически обновляем даже если не изменилось

	state, exists := s.leagueCache.states[cacheKey]

	if !exists {
		// Первый раз видим эту комбинацию - обработать
		s.leagueCache.states[cacheKey] = &leagueState{
			hash:          currentHash,
			lastProcessed: now,
			lastChanged:   now,
			leagueCount:   leagueCount,
		}
		return true
	}

	// Если hash изменился - обработать
	if state.hash != currentHash {
		state.hash = currentHash
		state.lastProcessed = now
		state.lastChanged = now
		state.leagueCount = leagueCount
		return true
	}

	// Hash не изменился - проверяем TTL
	if now.Sub(state.lastProcessed) > cacheTTL {
		// Прошло больше часа - обработать снова (периодическое обновление)
		state.lastProcessed = now
		return true
	}

	// Hash не изменился И TTL не истек - SKIP
	return false
}

// generateLeagueSetHash creates a unique hash from league IDs to detect if we already processed this set
func (s *LLMMatcherService) generateLeagueSetHash(sport string, bookmakerPair [2]string, leagues1, leagues2 []entity.League) string {
	// Extract and sort league IDs from both bookmakers
	ids1 := make([]int64, len(leagues1))
	for i, l := range leagues1 {
		ids1[i] = l.ID
	}
	ids2 := make([]int64, len(leagues2))
	for i, l := range leagues2 {
		ids2[i] = l.ID
	}

	sort.Slice(ids1, func(i, j int) bool { return ids1[i] < ids1[j] })
	sort.Slice(ids2, func(i, j int) bool { return ids2[i] < ids2[j] })

	// Create hash string: sport|bm1|bm2|ids1|ids2
	var sb strings.Builder
	sb.WriteString(sport)
	sb.WriteString("|")
	sb.WriteString(bookmakerPair[0])
	sb.WriteString("|")
	sb.WriteString(bookmakerPair[1])
	sb.WriteString("|")
	for i, id := range ids1 {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(strconv.FormatInt(id, 10))
	}
	sb.WriteString("|")
	for i, id := range ids2 {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(strconv.FormatInt(id, 10))
	}

	// Generate SHA256 hash
	hash := sha256.Sum256([]byte(sb.String()))
	return fmt.Sprintf("%x", hash[:16]) // Use first 16 bytes for shorter key
}

// callLLMWithRetry calls LLM provider and automatically rotates API keys on errors
// For each key: tries up to 3 times, then rotates to next key on ANY error
func (s *LLMMatcherService) callLLMWithRetry(ctx context.Context, requestType string, systemPrompt, requestText string) (string, error) {
	if configurationErr := s.getLatchedConfigurationError(); configurationErr != nil {
		s.logger.Error().
			Str("request_type", requestType).
			Err(configurationErr).
			Msg("[LLMMatcherService] LLM configuration error is latched; provider call suppressed until restart")
		return "", configurationErr
	}

	maxKeys := len(s.cfg.ApiKeys) // Try all available keys
	retriesPerKey := 3
	var lastErr error
	currentKeyIndex := s.currentApiKeyIndex

	for keyAttempt := 0; keyAttempt < maxKeys; keyAttempt++ {
		// Check if key is blocked - skip to next
		if s.isKeyBlocked(currentKeyIndex) {
			s.logger.Debug().
				Int("key_index", currentKeyIndex).
				Msg("[LLMMatcherService] Skipping blocked key")
			currentKeyIndex = (currentKeyIndex + 1) % len(s.cfg.ApiKeys)
			continue
		}

		// Try current key up to retriesPerKey times
		for retry := 0; retry < retriesPerKey; retry++ {
			s.logger.Info().
				Int("key_index", currentKeyIndex).
				Int("retry", retry).
				Str("request_type", requestType).
				Msg("[LLMMatcherService] Making API call to primary provider")

			var response *providers.LLMResponse
			var err error

			// Call appropriate method based on request type
			if requestType == "leagues" {
				response, err = s.provider.GenerateLeagueMatches(ctx, systemPrompt, requestText)
			} else {
				response, err = s.provider.GenerateTeamMatches(ctx, systemPrompt, requestText)
			}

			s.logger.Info().
				Int("key_index", currentKeyIndex).
				Bool("success", err == nil).
				Msg("[LLMMatcherService] API call completed")

			// Success - update token counter and return
			if err == nil && response != nil {
				s.recordSuccess()
				s.updateKeyStateAfterRequest(currentKeyIndex, response.TotalTokens)
				s.currentApiKeyIndex = currentKeyIndex

				s.logger.Debug().
					Int("key_index", currentKeyIndex).
					Int("tokens_used", response.TotalTokens).
					Msg("[LLMMatcherService] Request successful, tokens tracked")

				return response.Content, nil
			}

			if err == nil {
				// Response is nil but no error - shouldn't happen, treat as error
				err = fmt.Errorf("empty response from provider")
			}

			lastErr = err
			errStr := err.Error()

			// A missing/retired model is a provider-wide configuration defect,
			// not a credential defect. Fail closed immediately: do not retry,
			// rotate keys, or switch to a provider with different semantics.
			if errors.Is(err, providers.ErrModelConfiguration) {
				configurationErr := fmt.Errorf("non-retryable LLM model configuration failure: %w", err)
				s.logger.Error().
					Int("key_index", currentKeyIndex).
					Str("request_type", requestType).
					Err(configurationErr).
					Msg("[LLMMatcherService] Refusing retry and key rotation for model configuration error")
				s.recordConfigurationError(configurationErr)
				return "", configurationErr
			}

			// Immediate rotation for known fatal errors (leaked keys, permission denied)
			if strings.Contains(errStr, "leaked") || strings.Contains(errStr, "PERMISSION_DENIED") {
				s.logger.Warn().
					Int("key_index", currentKeyIndex).
					Str("error", errStr).
					Msg("[LLMMatcherService] Key reported as leaked/denied, rotating immediately")
				// Block this key for 24 hours
				s.markKeyAsBlocked(currentKeyIndex, 24*time.Hour)
				break // Exit retry loop, will rotate below
			}

			// Check if error is rate limit (429) - rotate immediately
			is429 := strings.Contains(errStr, "429") ||
				strings.Contains(errStr, "Too Many Requests") ||
				strings.Contains(errStr, "rate limit") ||
				strings.Contains(errStr, "quota") ||
				strings.Contains(errStr, "RESOURCE_EXHAUSTED")

			if is429 {
				s.logger.Warn().
					Int("key_index", currentKeyIndex).
					Int("retry", retry+1).
					Str("error", errStr).
					Msg("[LLMMatcherService] Rate limit error, blocking key and rotating")
				// Block key for 1 minute to let rate limit reset
				s.markKeyAsBlocked(currentKeyIndex, 1*time.Minute)
				break // Exit retry loop, will rotate below
			}

			// For other errors, retry with same key (up to retriesPerKey times)
			if retry < retriesPerKey-1 {
				s.logger.Warn().
					Int("key_index", currentKeyIndex).
					Int("retry", retry+1).
					Int("max_retries", retriesPerKey).
					Str("error", errStr).
					Msg("[LLMMatcherService] Retrying with same key...")
				time.Sleep(time.Duration(retry+1) * time.Second) // Exponential backoff
				continue
			}

			// Max retries reached for this key
			s.logger.Warn().
				Int("key_index", currentKeyIndex).
				Str("error", errStr).
				Msg("[LLMMatcherService] Max retries reached, rotating to next key")
		}

		// Rotate to next key
		if keyAttempt < maxKeys-1 {
			currentKeyIndex = (currentKeyIndex + 1) % len(s.cfg.ApiKeys)
			newKey := s.cfg.ApiKeys[currentKeyIndex]
			if updateErr := s.provider.UpdateApiKey(newKey); updateErr != nil {
				s.logger.Error().Err(updateErr).Msg("[LLMMatcherService] Failed to update provider API key")
				s.recordError(lastErr)
				return "", lastErr
			}

			// Short delay before using new key
			rotationDelay := time.Duration(1+keyAttempt) * time.Second
			s.logger.Info().
				Int("attempt", keyAttempt+1).
				Int("max_keys", maxKeys).
				Int("new_key_index", currentKeyIndex).
				Dur("delay", rotationDelay).
				Msg("[LLMMatcherService] Retrying with new API key after delay...")
			time.Sleep(rotationDelay)
		}
	}

	// Update current key index
	s.currentApiKeyIndex = currentKeyIndex

	// All rotation keys exhausted - try Gemini 2.5 fallback with its own key rotation
	if s.fallbackProvider != nil {
		s.logger.Warn().Msg("[LLMMatcherService] All primary provider keys exhausted, switching to Gemini 2.5 fallback...")

		var response *providers.LLMResponse
		var err error

		// Use GenerateWithRotation if available (GeminiProvider supports key rotation)
		if geminiProvider, ok := s.fallbackProvider.(*providers.GeminiProvider); ok {
			response, err = geminiProvider.GenerateWithRotation(ctx, systemPrompt, requestText)
		} else {
			// Fallback to simple call for other providers
			if requestType == "leagues" {
				response, err = s.fallbackProvider.GenerateLeagueMatches(ctx, systemPrompt, requestText)
			} else {
				response, err = s.fallbackProvider.GenerateTeamMatches(ctx, systemPrompt, requestText)
			}
		}

		if err == nil && response != nil {
			s.logger.Info().
				Int("tokens_used", response.TotalTokens).
				Msg("[LLMMatcherService] Gemini 2.5 fallback succeeded")
			s.recordSuccess()
			return response.Content, nil
		}

		s.logger.Error().Err(err).Msg("[LLMMatcherService] Gemini 2.5 fallback also failed")

		// Try Vertex AI as final fallback (Google Cloud $300 credits)
		if s.vertexFallbackProvider != nil {
			s.logger.Warn().Msg("[LLMMatcherService] Gemini fallback exhausted, switching to Vertex AI (Google Cloud)...")

			if requestType == "leagues" {
				response, err = s.vertexFallbackProvider.GenerateLeagueMatches(ctx, systemPrompt, requestText)
			} else {
				response, err = s.vertexFallbackProvider.GenerateTeamMatches(ctx, systemPrompt, requestText)
			}

			if err == nil && response != nil {
				s.logger.Info().
					Int("tokens_used", response.TotalTokens).
					Msg("[LLMMatcherService] Vertex AI fallback succeeded")
				s.recordSuccess()
				return response.Content, nil
			}

			s.logger.Error().Err(err).Msg("[LLMMatcherService] Vertex AI fallback also failed")
			fallbackErr := fmt.Errorf("all fallbacks exhausted (primary + Gemini + VertexAI): %w", err)
			s.recordError(fallbackErr)
			return "", fallbackErr
		}

		fallbackErr := fmt.Errorf("all API keys exhausted and Gemini fallback failed: %w", err)
		s.recordError(fallbackErr)
		return "", fallbackErr
	}

	// No Gemini fallback - try Vertex AI directly
	if s.vertexFallbackProvider != nil {
		s.logger.Warn().Msg("[LLMMatcherService] All rotation keys exhausted, switching to Vertex AI (Google Cloud)...")

		var response *providers.LLMResponse
		var err error
		if requestType == "leagues" {
			response, err = s.vertexFallbackProvider.GenerateLeagueMatches(ctx, systemPrompt, requestText)
		} else {
			response, err = s.vertexFallbackProvider.GenerateTeamMatches(ctx, systemPrompt, requestText)
		}

		if err == nil && response != nil {
			s.logger.Info().
				Int("tokens_used", response.TotalTokens).
				Msg("[LLMMatcherService] Vertex AI fallback succeeded")
			s.recordSuccess()
			return response.Content, nil
		}

		s.logger.Error().Err(err).Msg("[LLMMatcherService] Vertex AI fallback failed")
		fallbackErr := fmt.Errorf("all API keys exhausted and Vertex AI fallback failed: %w", err)
		s.recordError(fallbackErr)
		return "", fallbackErr
	}

	noFallbackErr := fmt.Errorf("all API keys exhausted - rate limit on all %d keys (no fallback configured)", maxKeys)
	s.recordError(noFallbackErr)
	return "", noFallbackErr
}

func ptrFloat32(f float32) *float32 {
	return &f
}

// cleanMarkdownJSON removes markdown code block formatting from JSON response
func cleanMarkdownJSON(text string) string {
	text = strings.TrimSpace(text)

	// Поиск JSON блока: находим первую [ или { и берём всё от неё
	startIdx := -1
	for i, ch := range text {
		if ch == '[' || ch == '{' {
			startIdx = i
			break
		}
	}

	if startIdx == -1 {
		// Не найден JSON - пробуем старый способ
		if strings.HasPrefix(text, "```json") {
			text = strings.TrimPrefix(text, "```json")
			text = strings.TrimSpace(text)
		} else if strings.HasPrefix(text, "```") {
			text = strings.TrimPrefix(text, "```")
			text = strings.TrimSpace(text)
		}

		if strings.HasSuffix(text, "```") {
			text = strings.TrimSuffix(text, "```")
			text = strings.TrimSpace(text)
		}

		return text
	}

	// Нашли начало JSON - берём всё от неё
	text = text[startIdx:]

	// Убираем закрывающие ``` если есть
	if strings.HasSuffix(text, "```") {
		text = strings.TrimSuffix(text, "```")
		text = strings.TrimSpace(text)
	}

	return text
}

func (s *LLMMatcherService) sendTeamsBatchToLLM(ctx context.Context, leaguePairs []entity.LeaguePairWithTeams, bookmakerPair [2]string) ([]entity.ResponsePairTeamBatch, error) {
	request := entity.RequestTeamsBatch{
		LeaguePairs: leaguePairs,
	}

	reqBytes, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	requestText := string(reqBytes)

	// Calculate total teams for logging
	totalTeams1 := 0
	totalTeams2 := 0
	for _, lp := range leaguePairs {
		totalTeams1 += len(lp.BK1Teams)
		totalTeams2 += len(lp.BK2Teams)
	}

	// Log request
	s.llmLogger.Info().
		Str("type", "teams_batch").
		Str("provider", s.provider.GetProviderName()).
		Str("bookmaker_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Int("league_pairs_count", len(leaguePairs)).
		Int("total_teams1", totalTeams1).
		Int("total_teams2", totalTeams2).
		Str("request", requestText).
		Msg("Sending batch request to LLM")

	// Call LLM provider with automatic API key rotation on 429 errors
	responseText, err := s.callLLMWithRetry(ctx, "teams", TeamMatchingSystemPrompt, requestText)
	if err != nil {
		s.llmLogger.Error().Err(err).Msg("LLM API error for teams batch")
		return nil, err
	}

	// Log response
	s.llmLogger.Info().
		Str("type", "teams_batch").
		Str("provider", s.provider.GetProviderName()).
		Str("bookmaker_pair", fmt.Sprintf("%s vs %s", bookmakerPair[0], bookmakerPair[1])).
		Str("response", responseText).
		Msg("Received response from LLM")

	// Clean markdown formatting if present
	responseText = cleanMarkdownJSON(responseText)

	// Parse response
	var pairedTeams []entity.ResponsePairTeamBatch
	if err = json.Unmarshal([]byte(responseText), &pairedTeams); err != nil {
		s.llmLogger.Error().Err(err).Str("response", responseText).Msg("Failed to parse LLM batch response")
		return nil, err
	}

	s.llmLogger.Info().
		Str("type", "teams_batch").
		Str("provider", s.provider.GetProviderName()).
		Int("pairs_count", len(pairedTeams)).
		Msg("Successfully matched teams in batch")

	return pairedTeams, nil
}

// GetRecentDecisions returns recent matching decisions from the logger
func (s *LLMMatcherService) GetRecentDecisions(limit int) ([]MatchingDecision, error) {
	if s.decisionLogger == nil {
		return []MatchingDecision{}, nil
	}
	return s.decisionLogger.GetRecentDecisions(limit)
}

// GetPendingLeaguePairs returns pending league pairs for manual review
func (s *LLMMatcherService) GetPendingLeaguePairs(status string) ([]entity.PendingLeaguePair, error) {
	if s.pendingPairManager == nil {
		return []entity.PendingLeaguePair{}, nil
	}
	return s.pendingPairManager.GetPendingLeaguePairs(status)
}

// GetPendingTeamPairs returns pending team pairs for manual review
func (s *LLMMatcherService) GetPendingTeamPairs(status string) ([]entity.PendingTeamPair, error) {
	if s.pendingPairManager == nil {
		return []entity.PendingTeamPair{}, nil
	}
	return s.pendingPairManager.GetPendingTeamPairs(status)
}

// ApproveLeaguePair approves and creates the league pair
func (s *LLMMatcherService) ApproveLeaguePair(ctx context.Context, id, reviewedBy string) error {
	if s.pendingPairManager == nil {
		return fmt.Errorf("pending pair manager not initialized")
	}

	// Получаем пару
	pair, err := s.pendingPairManager.GetLeaguePairByID(id)
	if err != nil {
		return err
	}

	// Создаем пару в БД
	_, err = s.handMatchService.CreateLeaguesPair(ctx, pair.BK1LeagueID, pair.BK2LeagueID)
	if err != nil {
		return fmt.Errorf("failed to create league pair: %w", err)
	}

	// Обновляем статус
	return s.pendingPairManager.UpdateLeaguePairStatus(id, "approved", reviewedBy, "")
}

// RejectLeaguePair rejects the league pair
func (s *LLMMatcherService) RejectLeaguePair(id, reviewedBy, rejectReason string) error {
	if s.pendingPairManager == nil {
		return fmt.Errorf("pending pair manager not initialized")
	}

	return s.pendingPairManager.UpdateLeaguePairStatus(id, "rejected", reviewedBy, rejectReason)
}

// ApproveTeamPair approves and creates the team pair
func (s *LLMMatcherService) ApproveTeamPair(ctx context.Context, id, reviewedBy string) error {
	if s.pendingPairManager == nil {
		return fmt.Errorf("pending pair manager not initialized")
	}

	// Получаем пару
	pair, err := s.pendingPairManager.GetTeamPairByID(id)
	if err != nil {
		return err
	}

	// Создаем пару в БД
	_, err = s.handMatchService.CreateTeamsPair(ctx, pair.BK1TeamID, pair.BK2TeamID)
	if err != nil {
		return fmt.Errorf("failed to create team pair: %w", err)
	}

	// Обновляем статус
	return s.pendingPairManager.UpdateTeamPairStatus(id, "approved", reviewedBy, "")
}

// RejectTeamPair rejects the team pair
func (s *LLMMatcherService) RejectTeamPair(id, reviewedBy, rejectReason string) error {
	if s.pendingPairManager == nil {
		return fmt.Errorf("pending pair manager not initialized")
	}

	return s.pendingPairManager.UpdateTeamPairStatus(id, "rejected", reviewedBy, rejectReason)
}

// GetPendingPairManager returns the pending pair manager for use by other services
func (s *LLMMatcherService) GetPendingPairManager() *PendingPairManager {
	return s.pendingPairManager
}

// recordSuccess записывает успешный LLM запрос
func (s *LLMMatcherService) recordSuccess() {
	s.healthMutex.Lock()
	defer s.healthMutex.Unlock()

	// A provider-wide model defect is immutable for this process. This also
	// prevents an already in-flight request from clearing the latch after the
	// first model_not_found response.
	if s.configurationError {
		return
	}

	s.lastSuccessTime = time.Now()
	s.consecutiveErrors = 0
	s.allKeysExhausted = false
	s.lastError = ""
}

func (s *LLMMatcherService) getLatchedConfigurationError() error {
	s.healthMutex.RLock()
	defer s.healthMutex.RUnlock()

	if !s.configurationError {
		return nil
	}
	return fmt.Errorf("%w: latched until process restart: %s", providers.ErrModelConfiguration, s.lastError)
}

func (s *LLMMatcherService) recordConfigurationError(err error) {
	s.healthMutex.Lock()
	defer s.healthMutex.Unlock()

	s.lastErrorTime = time.Now()
	s.consecutiveErrors++
	s.lastError = err.Error()
	s.configurationError = true
}

// recordError записывает ошибку LLM запроса
func (s *LLMMatcherService) recordError(err error) {
	s.healthMutex.Lock()
	defer s.healthMutex.Unlock()

	s.lastErrorTime = time.Now()
	s.consecutiveErrors++
	s.lastError = err.Error()

	// Проверяем, исчерпаны ли все ключи
	if strings.Contains(err.Error(), "all API keys exhausted") ||
		strings.Contains(err.Error(), "all Gemini API keys exhausted") {
		s.allKeysExhausted = true
	}
}

// GetHealthStatus возвращает текущий статус здоровья LLM сервиса
func (s *LLMMatcherService) GetHealthStatus() LLMHealthStatus {
	s.healthMutex.RLock()
	defer s.healthMutex.RUnlock()

	s.apiKeyMutex.RLock()
	defer s.apiKeyMutex.RUnlock()

	// Подсчитываем исчерпанные ключи (достигли дневного лимита)
	const dailyTokenLimit = 900000
	exhaustedKeys := 0
	for _, state := range s.apiKeyStates {
		if state.dailyTokens >= dailyTokenLimit {
			exhaustedKeys++
		}
	}

	totalKeys := len(s.cfg.ApiKeys)
	availableKeys := totalKeys - exhaustedKeys

	// Определяем статус
	status := LLMHealthStatus{
		Provider:           s.provider.GetProviderName(),
		TotalKeys:          totalKeys,
		ExhaustedKeys:      exhaustedKeys,
		AvailableKeys:      availableKeys,
		LastSuccessTime:    s.lastSuccessTime,
		LastErrorTime:      s.lastErrorTime,
		LastError:          s.lastError,
		ConsecutiveErrors:  s.consecutiveErrors,
		FallbackAvailable:  s.fallbackProvider != nil,
		FallbackUsed:       false, // TODO: track this
		AllKeysExhausted:   s.allKeysExhausted,
		ConfigurationError: s.configurationError,
	}

	// Логика определения OK статуса:
	// - OK если есть доступные ключи ИЛИ fallback доступен
	// - НЕ OK если все ключи исчерпаны И нет fallback ИЛИ >5 последовательных ошибок
	if s.configurationError {
		status.OK = false
		status.Message = fmt.Sprintf("LLM configuration error: %s", s.lastError)
	} else if s.allKeysExhausted && !status.FallbackAvailable {
		status.OK = false
		status.Message = fmt.Sprintf("All %d API keys exhausted, no fallback available", totalKeys)
	} else if s.consecutiveErrors >= 5 {
		status.OK = false
		status.Message = fmt.Sprintf("%d consecutive errors: %s", s.consecutiveErrors, s.lastError)
	} else if availableKeys == 0 && !status.FallbackAvailable {
		status.OK = false
		status.Message = fmt.Sprintf("All %d keys reached daily limit, no fallback", totalKeys)
	} else if availableKeys == 0 && status.FallbackAvailable {
		status.OK = true
		status.Message = fmt.Sprintf("Primary keys exhausted, using Gemini fallback")
	} else if exhaustedKeys > 0 {
		status.OK = true
		status.Message = fmt.Sprintf("%d/%d keys available", availableKeys, totalKeys)
	} else {
		status.OK = true
		status.Message = "All keys available"
	}

	return status
}
