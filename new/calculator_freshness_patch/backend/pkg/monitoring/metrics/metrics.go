package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

type Metrics struct {
	// Counters
	RequestsTotal       *prometheus.CounterVec
	ErrorsTotal         *prometheus.CounterVec
	MessagesReceived    *prometheus.CounterVec
	MessagesProcessed   *prometheus.CounterVec
	
	// Gauges
	ActiveConnections   prometheus.Gauge
	CacheSize           *prometheus.GaugeVec
	ActiveGoroutines    prometheus.Gauge
	MemoryUsageBytes    prometheus.Gauge
	
	// Histograms
	RequestDuration     *prometheus.HistogramVec
	ProcessingDuration  *prometheus.HistogramVec
	
	// Summary for percentiles
	LatencySummary      *prometheus.SummaryVec
}

func NewMetrics(namespace, subsystem string) *Metrics {
	return &Metrics{
		RequestsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "requests_total",
				Help:      "Total number of requests",
			},
			[]string{"method", "endpoint", "status"},
		),
		
		ErrorsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "errors_total",
				Help:      "Total number of errors",
			},
			[]string{"type", "component"},
		),
		
		MessagesReceived: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "messages_received_total",
				Help:      "Total messages received",
			},
			[]string{"source", "sport"},
		),
		
		MessagesProcessed: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "messages_processed_total",
				Help:      "Total messages processed",
			},
			[]string{"source", "result"},
		),
		
		ActiveConnections: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "active_connections",
				Help:      "Number of active connections",
			},
		),
		
		CacheSize: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "cache_size",
				Help:      "Current size of caches",
			},
			[]string{"cache_type"},
		),
		
		ActiveGoroutines: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "active_goroutines",
				Help:      "Number of active goroutines",
			},
		),
		
		MemoryUsageBytes: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "memory_usage_bytes",
				Help:      "Current memory usage in bytes",
			},
		),
		
		RequestDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "request_duration_seconds",
				Help:      "Request duration in seconds",
				Buckets:   []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
			},
			[]string{"method", "endpoint"},
		),
		
		ProcessingDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "processing_duration_seconds",
				Help:      "Processing duration in seconds",
				Buckets:   []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1},
			},
			[]string{"operation"},
		),
		
		LatencySummary: promauto.NewSummaryVec(
			prometheus.SummaryOpts{
				Namespace: namespace,
				Subsystem: subsystem,
				Name:      "latency_seconds",
				Help:      "Latency percentiles",
				Objectives: map[float64]float64{
					0.5:  0.05,  // p50 with 5% error
					0.9:  0.01,  // p90 with 1% error
					0.95: 0.005, // p95 with 0.5% error
					0.99: 0.001, // p99 with 0.1% error
				},
			},
			[]string{"operation"},
		),
	}
}
