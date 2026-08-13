package handler

import (
	"context"
	"net/http"
	"time"

	"livebets/auto_matcher/internal/service"
	"livebets/pkg/monitoring/health"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LLMHealthChecker интерфейс для проверки здоровья LLM сервиса
type LLMHealthChecker interface {
	GetHealthStatus() service.LLMHealthStatus
}

type HealthHandler struct {
	checker         *health.Checker
	postgresPool    *pgxpool.Pool
	llmHealthChecker LLMHealthChecker
}

// checkPostgres проверяет состояние PostgreSQL
func (h *HealthHandler) checkPostgres(ctx context.Context) health.ComponentHealth {
	start := time.Now()
	
	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	
	err := h.postgresPool.Ping(pingCtx)
	latency := time.Since(start)
	
	if err != nil {
		return health.ComponentHealth{
			Status:  health.StatusError,
			Message: err.Error(),
			Latency: latency.String(),
		}
	}
	
	return health.ComponentHealth{
		Status:  health.StatusOK,
		Latency: latency.String(),
	}
}

func NewHealthHandler(postgresPool *pgxpool.Pool, llmHealthChecker LLMHealthChecker) *HealthHandler {
	return &HealthHandler{
		checker:          health.NewChecker(),
		postgresPool:     postgresPool,
		llmHealthChecker: llmHealthChecker,
	}
}

// Liveness probe - для Kubernetes (быстрая проверка что процесс жив)
func (h *HealthHandler) Liveness(c *gin.Context) {
	response := h.checker.Liveness()
	c.JSON(http.StatusOK, response)
}

// Readiness probe - для Kubernetes (проверка всех зависимостей)
func (h *HealthHandler) Readiness(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	
	components := make(map[string]health.ComponentHealth)
	
	// Проверка PostgreSQL
	if h.postgresPool != nil {
		components["postgres"] = h.checkPostgres(ctx)
	}
	
	// Проверка LLM сервиса
	if h.llmHealthChecker != nil {
		llmStatus := h.llmHealthChecker.GetHealthStatus()
		llmHealth := health.ComponentHealth{
			Status:  health.StatusOK,
			Message: llmStatus.Message,
		}
		if !llmStatus.OK {
			llmHealth.Status = health.StatusError
			llmHealth.Message = llmStatus.Message
		} else if llmStatus.ExhaustedKeys > 0 {
			llmHealth.Status = health.StatusDegraded
		}
		components["llm"] = llmHealth
	}
	
	response := h.checker.BuildResponse(components)
	
	statusCode := http.StatusOK
	if response.Status == health.StatusError {
		statusCode = http.StatusServiceUnavailable
	} else if response.Status == health.StatusDegraded {
		statusCode = http.StatusOK // Still serve traffic
	}
	
	c.JSON(statusCode, response)
}

// Health - детальная информация (для админов/debugging)
func (h *HealthHandler) Health(c *gin.Context) {
	h.Readiness(c)
}
