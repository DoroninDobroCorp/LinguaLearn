package handler

import (
	"livebets/calculator/cmd/config"
	"livebets/calculator/internal/service"
	"livebets/pkg/monitoring/metrics"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Handler struct {
	logsService   *service.LogsService
	healthHandler *HealthHandler
	metrics       *metrics.Metrics
	corsConfig    config.CORS
}

func NewHandler(
	logsService *service.LogsService,
	healthHandler *HealthHandler,
	m *metrics.Metrics,
	corsConfig config.CORS,
) *Handler {
	return &Handler{
		logsService:   logsService,
		healthHandler: healthHandler,
		metrics:       m,
		corsConfig:    corsConfig,
	}
}

func (h *Handler) InitRoutes() *gin.Engine {
	router := gin.New()

	// Log every request
	router.Use(gin.Logger())

	// FIX 2.1: Recover from panics — prevents process crash on unhandled panics
	router.Use(gin.Recovery())

	// Prometheus metrics middleware
	if h.metrics != nil {
		router.Use(h.metrics.HTTPMiddleware())
	}

	// Configure CORS from config
	router.Use(cors.New(cors.Config{
		AllowOrigins:     h.corsConfig.AllowedOrigins,
		AllowMethods:     h.corsConfig.AllowedMethods,
		AllowHeaders:     h.corsConfig.AllowedHeaders,
		AllowCredentials: true,
		MaxAge:           time.Duration(h.corsConfig.MaxAgeSeconds) * time.Second,
	}))

	// Health endpoints
	router.GET("/health", h.healthHandler.Health)
	router.GET("/health/liveness", h.healthHandler.Liveness)
	router.GET("/health/readiness", h.healthHandler.Readiness)

	// Metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Business endpoints
	router.POST("/log-bet-accept", h.LogBetAccept)
	router.POST("/log-test-bet-accept", h.LogTestBetAccept)
	router.POST("/calc-bet", h.GetCalcBet)
	router.POST("/rollback-calc-bet", h.RollbackCalcBet)
	router.POST("/check-strategy-limit", h.CheckStrategyLimit)
	router.POST("/check-betting-limits", h.CheckBettingLimits) // Global + bookmaker + strategy limits

	return router
}
