package health

import (
	"runtime"
	"sync"
	"time"
)

type Status string

const (
	StatusOK       Status = "ok"
	StatusDegraded Status = "degraded"
	StatusError    Status = "error"
)

type ComponentHealth struct {
	Status  Status `json:"status"`
	Message string `json:"message,omitempty"`
	Latency string `json:"latency,omitempty"`
}

type HealthMetrics struct {
	GoroutinesCount int    `json:"goroutines_count"`
	MemoryUsageMB   uint64 `json:"memory_usage_mb"`
}

type HealthResponse struct {
	Status     Status                     `json:"status"`
	Uptime     string                     `json:"uptime"`
	Timestamp  time.Time                  `json:"timestamp"`
	Components map[string]ComponentHealth `json:"components"`
	Metrics    HealthMetrics              `json:"metrics"`
}

type Checker struct {
	startTime time.Time
	mu        sync.RWMutex
}

func NewChecker() *Checker {
	return &Checker{
		startTime: time.Now(),
	}
}

// CheckPostgres removed - use specific implementation in services that need it
// (to avoid adding pgxpool dependency to all services)

func (c *Checker) GetMetrics() HealthMetrics {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	
	return HealthMetrics{
		GoroutinesCount: runtime.NumGoroutine(),
		MemoryUsageMB:   m.Alloc / 1024 / 1024,
	}
}

func (c *Checker) BuildResponse(components map[string]ComponentHealth) HealthResponse {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	overallStatus := StatusOK
	for _, comp := range components {
		if comp.Status == StatusError {
			overallStatus = StatusError
			break
		}
		if comp.Status == StatusDegraded && overallStatus == StatusOK {
			overallStatus = StatusDegraded
		}
	}
	
	return HealthResponse{
		Status:     overallStatus,
		Uptime:     time.Since(c.startTime).String(),
		Timestamp:  time.Now(),
		Components: components,
		Metrics:    c.GetMetrics(),
	}
}

// Liveness probe - быстрая проверка что процесс жив
func (c *Checker) Liveness() HealthResponse {
	return HealthResponse{
		Status:    StatusOK,
		Uptime:    time.Since(c.startTime).String(),
		Timestamp: time.Now(),
		Metrics:   c.GetMetrics(),
	}
}
