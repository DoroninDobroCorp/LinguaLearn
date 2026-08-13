package handler

import (
	"context"
	"net/http"
	"time"

	"livebets/pkg/monitoring/health"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthHandler struct {
	checker      *health.Checker
	postgresPool *pgxpool.Pool
}

func NewHealthHandler(postgresPool *pgxpool.Pool) *HealthHandler {
	return &HealthHandler{
		checker:      health.NewChecker(),
		postgresPool: postgresPool,
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
	
	// Check PostgreSQL
	components["postgres"] = h.checkPostgres(ctx)
	
	response := h.checker.BuildResponse(components)
	
	statusCode := http.StatusOK
	if response.Status == health.StatusError {
		statusCode = http.StatusServiceUnavailable
	} else if response.Status == health.StatusDegraded {
		statusCode = http.StatusOK // Still serve traffic
	}
	
	c.JSON(statusCode, response)
}

// checkPostgres checks PostgreSQL connection
func (h *HealthHandler) checkPostgres(ctx context.Context) health.ComponentHealth {
	start := time.Now()
	
	if h.postgresPool == nil {
		return health.ComponentHealth{
			Status:  health.StatusError,
			Message: "postgres pool is nil",
		}
	}
	
	err := h.postgresPool.Ping(ctx)
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

// Health - детальная информация (для админов/debugging)
func (h *HealthHandler) Health(c *gin.Context) {
	h.Readiness(c)
}
