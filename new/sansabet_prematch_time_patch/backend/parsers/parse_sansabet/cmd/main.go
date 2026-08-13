package main

import (
	"time"
	"encoding/json"
	"context"
	"livebets/parse_sansabet/cmd/config"
	"livebets/parse_sansabet/internal/api"
	"livebets/parse_sansabet/internal/entity"
	"livebets/parse_sansabet/internal/sender"
	"livebets/parse_sansabet/internal/service"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"livebets/pkg/monitoring/health"
	"livebets/pkg/monitoring/metrics"
)

var healthChecker *health.Checker
var metricsCollector *metrics.Metrics

func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	response := healthChecker.Liveness()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func main() {
	ctx, cancelFunc := context.WithCancel(context.Background())

	// Init config
	logger := zerolog.New(os.Stderr).With().Timestamp().Logger()
	logger.Info().Msg(">> Starting Parse_Sansabet")


	// Initialize health checker and metrics
	healthChecker = health.NewChecker()
	metricsCollector = metrics.NewMetrics("livebets", "parse_sansabet")
	stopMetrics := make(chan struct{})
	go metricsCollector.StartResourceMonitoring(10*time.Second, stopMetrics)
	appConfig, err := config.ProvideAppMPConfig()
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to load app configuration")
	}
	// Create channels and services FIRST
	sendChan := make(chan entity.ResponseGame, 500)
	api := api.NewSansabetAPI(appConfig.SansabetConfig)
	sender := sender.NewSenderWithBroadcast(appConfig.SenderConfig, sendChan)

	// Setup HTTP endpoints with WebSocket support
	logger.Info().Str("port", appConfig.Port).Msg("Starting HTTP server")
	mux := http.NewServeMux()
	mux.HandleFunc("/health", HealthCheckHandler)
	mux.HandleFunc("/health/liveness", HealthCheckHandler)
	mux.HandleFunc("/health/readiness", HealthCheckHandler)
	mux.Handle("/metrics", promhttp.Handler())
	
	// Register WebSocket endpoint for client connections
	mux.HandleFunc("/ws", sender.HandleClientConn)
	logger.Info().Msg("WebSocket broadcast endpoint /ws registered")
	
	server := &http.Server{
		Addr:    ":" + appConfig.Port,
		Handler: mux,
	}
	go func() {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("failed to start server")
		}
	}()
	logger.Info().Msg("HTTP server started")

	wg := &sync.WaitGroup{}

	wg.Add(1)
	go sender.SendingToAnalyzer(ctx, wg)

	if appConfig.SansabetConfig.ParseLive {
		// LIVE MODE: Use apilive.sansabet.com API (existing logic)
		logger.Info().Msg("🔴 LIVE MODE: Using apilive.sansabet.com API")
		
		// 6 sports: Soccer, Tennis, Basketball, Hockey, Volleyball, Handball
		activeSports := []entity.Sport{
			entity.FootballID,    // F - Soccer
			entity.TennisID,     // T - Tennis
			entity.BasketballID, // B - Basketball
			entity.HockeyID,     // IH - Ice Hockey
			entity.VolleyballID, // V - Volleyball
			entity.HandballID,   // H - Handball
		}

		for _, sport := range activeSports {
			sportService := service.NewGeneralService(api, sendChan, &logger)
			wg.Add(1)
			go sportService.Run(ctx, appConfig.SansabetConfig, sport, wg)
			logger.Info().Str("sport", string(sport)).Msg("Started LIVE parser for sport")
		}
	} else {
		// PREMATCH MODE: Use ASP.NET API (sansabet.com/Oblozuvanje.aspx)
		logger.Info().Msg("📋 PREMATCH MODE: Using ASP.NET API (F+B+T+IH+H+V+ES)")
		
		prematchInterval := time.Duration(appConfig.SansabetConfig.PrematchIntervalODDS) * time.Second
		if prematchInterval < 20*time.Second {
			prematchInterval = 30 * time.Second // Minimum 30s for prematch
		}
		
		prematchService := service.NewPrematchService(api, sendChan, &logger)
		wg.Add(1)
		go prematchService.Run(ctx, prematchInterval, wg)
		logger.Info().Dur("interval", prematchInterval).Msg("Started PREMATCH parser (7 sports combined)")
	}

	logger.Info().Bool("parse_live", appConfig.SansabetConfig.ParseLive).Msg("🚀 Started successfully")

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

	// NOTE: Do NOT close(sendChan) — workers may still be draining.
	// The GC will collect it when all references are gone.

	// Shutdown HTTP server
	if err = server.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("failed to stop server")
	}

	logger.Info().Msg(">> stopped Parse_Sansabet")
}
