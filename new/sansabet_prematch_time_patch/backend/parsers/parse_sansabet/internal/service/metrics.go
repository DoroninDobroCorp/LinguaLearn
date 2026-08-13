package service

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	activeMatchesGauge = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "sansabet_active_matches",
			Help: "Number of active matches by sport",
		},
		[]string{"sport"},
	)

	matchesProcessedCounter = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "sansabet_matches_processed_total",
			Help: "Total number of matches processed",
		},
		[]string{"sport"},
	)

	oddsProcessedCounter = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "sansabet_odds_processed_total",
			Help: "Total number of odds processed",
		},
		[]string{"sport"},
	)

	apiErrorsCounter = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "sansabet_api_errors_total",
			Help: "Total number of API errors",
		},
		[]string{"type"},
	)

	invalidScoreCounter = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "sansabet_invalid_score_total",
			Help: "Total number of invalid score formats",
		},
		[]string{"sport"},
	)

	// Prematch metrics
	prematchMatchesCounter = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "sansabet_prematch_matches_sent_total",
			Help: "Total number of prematch matches sent to analyzer",
		},
	)

	prematchErrorsCounter = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "sansabet_prematch_errors_total",
			Help: "Total number of prematch API errors",
		},
	)
)
