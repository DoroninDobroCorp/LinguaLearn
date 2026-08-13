package metrics

import (
	"runtime"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func (m *Metrics) HTTPMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.FullPath()
		if path == "" {
			path = "unknown"
		}
		method := c.Request.Method
		
		// Process request
		c.Next()
		
		// Record metrics
		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())
		
		m.RequestsTotal.WithLabelValues(method, path, status).Inc()
		m.RequestDuration.WithLabelValues(method, path).Observe(duration)
		m.LatencySummary.WithLabelValues(path).Observe(duration)
	}
}

func (m *Metrics) UpdateResourceMetrics() {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	
	m.ActiveGoroutines.Set(float64(runtime.NumGoroutine()))
	m.MemoryUsageBytes.Set(float64(memStats.Alloc))
}

func (m *Metrics) StartResourceMonitoring(interval time.Duration, stopCh <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			m.UpdateResourceMetrics()
		case <-stopCh:
			return
		}
	}
}
