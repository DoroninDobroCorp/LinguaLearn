package main

import (
	"context"
	"livebets/auto_matcher/cmd/config"
	"livebets/auto_matcher/internal/api"
	"livebets/auto_matcher/internal/entity"
	"livebets/auto_matcher/internal/handler"
	"livebets/auto_matcher/internal/repository"
	"livebets/auto_matcher/internal/service"
	"livebets/auto_matcher/pkg/cache"
	"livebets/auto_matcher/pkg/rdbms"
	"livebets/auto_matcher/pkg/server"
	"livebets/pkg/domain"
	"livebets/pkg/monitoring/metrics"
	"livebets/pkg/pgsql"

	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/rs/zerolog"
)

func main() {
	ctx, cancelFunc := context.WithCancel(context.Background())

	// Init config
	logger := zerolog.New(os.Stderr).With().Timestamp().Logger()
	logger.Info().Msg(">> Starting Auto_Matcher")
	appConfig, err := config.ProvideAppMPConfig()
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to load app configuration")
	}

	// Connect to postgres
	postgres, err := pgsql.New(appConfig.PostgresConfig.ConnectionString())
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to postgres")
	}
	logger.Info().Msg("Connected to Postgres")
	defer postgres.Close()

	wg := &sync.WaitGroup{}

	// Initialize Prometheus metrics
	m := metrics.NewMetrics("livebets", "auto_matcher")
	stopMetrics := make(chan struct{})
	go m.StartResourceMonitoring(10*time.Second, stopMetrics)

	leagueCandidatesCache := cache.NewMemoryCache[string, entity.LeagueCandidatePair]()
	teamCandidatesCache := cache.NewMemoryCache[string, entity.TeamCandidatePair]()

	analizerAPI := api.NewAnalizerAPI(appConfig.AnalyzerAPI)
	analizerPrematchAPI := api.NewAnalizerPrematchAPI(appConfig.AnalyzerPrematchAPI)

	matchTxStorage := rdbms.NewPgTxStorage(postgres.Pool, repository.NewHandMatchPGStorage)
	handMatchService := service.NewHandMatcherService(matchTxStorage, leagueCandidatesCache, teamCandidatesCache, &logger)
	onlineMatchService := service.NewOnlineMatcherService(matchTxStorage, analizerAPI, analizerPrematchAPI, &logger)

	// Stable configuration - bookmaker pairs rarely change
	bookmakerPairs := map[int64][2]string{
		0:  {string(domain.Pinnacle), string(domain.Fonbet)},
		1:  {string(domain.Pinnacle), string(domain.Ladbrokes)},
		2:  {string(domain.Pinnacle), string(domain.Lobbet)},
		3:  {string(domain.Pinnacle), string(domain.Maxbet)},
		4:  {string(domain.Pinnacle), string(domain.Sansabet)},
		5:  {string(domain.Pinnacle), string(domain.Sbbet)},
		6:  {string(domain.Pinnacle), string(domain.StarCasino)},
		7:  {string(domain.Pinnacle), string(domain.Unibet)},
		8:  {string(domain.Pinnacle), string(domain.Serge)},
		9:  {string(domain.Pinnacle), string(domain.Volcano)},
		10: {string(domain.Pinnacle), string(domain.Zlatnik)},
		11: {string(domain.Pinnacle), string(domain.Hatbet)},
		12: {string(domain.Pinnacle), string(domain.Soccerbet)},
	}

	llmMatcherService, err := service.NewLLMMatcherService(matchTxStorage, onlineMatchService, handMatchService, appConfig.LLMMatcherConfig, &logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to create LLM matcher service")
	}
	wg.Add(1)
	go llmMatcherService.Run(ctx, bookmakerPairs, wg)

	// Create health handler (with LLM health checker)
	healthHandler := handler.NewHealthHandler(postgres.Pool, llmMatcherService)

	// Handler
	handlers := handler.NewHandler(handMatchService, onlineMatchService, llmMatcherService, healthHandler, m)

	// Get server port from config, default to 7001
	serverPort := appConfig.ServerPort
	if serverPort == "" {
		serverPort = "7001"
	}

	srv := new(server.Server)
	go func() {
		logger.Info().Msgf("starting server on port = %s", serverPort)
		if err := srv.Run(serverPort, handlers.InitRoutes()); err != nil {
			logger.Error().Err(err).Msg("error occured while running http server")
		}
	}()

	logger.Info().Msg("🚀 Auto_Matcher started successfully")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	logger.Info().Msg("Shutdown signal received, gracefully stopping...")

	// Create shutdown context with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Cancel main context to stop workers
	cancelFunc()

	// Wait for workers with timeout
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		logger.Info().Msg("All workers stopped gracefully")
	case <-shutdownCtx.Done():
		logger.Warn().Msg("Shutdown timeout exceeded, forcing exit")
	}

	// Stop metrics monitoring
	close(stopMetrics)

	// Shutdown HTTP server
	if err = srv.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("error occured on server shutting down")
	}

	logger.Info().Msg(">> Auto_Matcher stopped")
}
