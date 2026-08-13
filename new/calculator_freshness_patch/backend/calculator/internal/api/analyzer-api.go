package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"livebets/calculator/cmd/config"
	"livebets/calculator/internal/entity"
	"net/http"
	"time"
	"log"

	"github.com/avast/retry-go/v4"
	"github.com/sony/gobreaker"
)

type AnalizerAPI struct {
	cfg            config.AnalyzerAPI
	client         *http.Client
	circuitBreaker *gobreaker.CircuitBreaker
}

func NewAnalizerAPI(cfg config.AnalyzerAPI) *AnalizerAPI {
	// OPTIMIZED: HTTP transport with connection pooling
	// For 20 bookmakers: expect ~20 concurrent requests
	// TEST: Monitor connection reuse rate in Prometheus
	transport := &http.Transport{
		MaxIdleConns:        100,              // Total idle connections across all hosts
		MaxIdleConnsPerHost: 20,               // Idle connections per analyzer instance
		MaxConnsPerHost:     50,               // Max total connections per analyzer instance
		IdleConnTimeout:     90 * time.Second, // Keep-alive duration
		DisableCompression:  true,             // Prices are small, compression overhead not worth it
		DisableKeepAlives:   false,            // CRITICAL: Enable keep-alives for connection reuse
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   time.Second * time.Duration(cfg.Timeout),
	}

	// Initialize circuit breaker
	cbSettings := gobreaker.Settings{
		Name:        "AnalyzerAPI",
		MaxRequests: cfg.CircuitBreakerConfig.MaxRequests,
		Interval:    time.Duration(cfg.CircuitBreakerConfig.IntervalSeconds) * time.Second,
		Timeout:     time.Duration(cfg.CircuitBreakerConfig.TimeoutSeconds) * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			shouldTrip := counts.Requests >= 3 && failureRatio >= cfg.CircuitBreakerConfig.FailureRatio
			if shouldTrip {
				log.Printf("[CircuitBreaker] Tripping: %d failures / %d requests = %.2f (threshold: %.2f)",
					counts.TotalFailures, counts.Requests, failureRatio, cfg.CircuitBreakerConfig.FailureRatio)
			}
			return shouldTrip
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			log.Printf("[CircuitBreaker] State changed from %s to %s", from.String(), to.String())
		},
	}

	cb := gobreaker.NewCircuitBreaker(cbSettings)

	return &AnalizerAPI{
		cfg:            cfg,
		client:         client,
		circuitBreaker: cb,
	}
}

func (a *AnalizerAPI) GeTPricesByTimeout(reqData entity.RequestPriceRecordsByTime) (*entity.ResponsePriceRecords, error) {
	var result *entity.ResponsePriceRecords

	// Wrap in circuit breaker
	cbResult, err := a.circuitBreaker.Execute(func() (interface{}, error) {
		// Retry logic with exponential backoff
		return nil, retry.Do(
			func() error {
			data, err := json.Marshal(reqData)
			if err != nil {
				return retry.Unrecoverable(err) // Don't retry on marshal error
			}

			// FIX 2.4: Use POST instead of GET — GET with body violates HTTP spec
			req, err := http.NewRequest(
				http.MethodPost,
				a.cfg.URL+a.cfg.PricesURL,
				bytes.NewBuffer(data),
			)
			if err != nil {
				return retry.Unrecoverable(err) // Don't retry on request creation error
			}

			req.Header.Set("Accept", "application/json")
			req.Header.Set("Content-Type", "application/json")

			// Диагностическое логирование запроса
			log.Printf("[AnalyzerAPI.GeTPricesByTimeout] URL=%s payload=%s", req.URL.String(), string(data))

			resp, err := a.client.Do(req)
			if err != nil {
				log.Printf("[AnalyzerAPI.GeTPricesByTimeout] request failed (will retry): %v", err)
				return err // Retry on network errors
			}
			defer resp.Body.Close()

			log.Printf("[AnalyzerAPI.GeTPricesByTimeout] status=%d", resp.StatusCode)
			if resp.StatusCode != http.StatusOK {
				// try to read small body for diagnostics
				var buf bytes.Buffer
				_, _ = buf.ReadFrom(resp.Body)
				errMsg := fmt.Sprintf("analyzer returned status %d: %s", resp.StatusCode, buf.String())
				
				// Retry on 5xx errors, don't retry on 4xx
				if resp.StatusCode >= 500 {
					log.Printf("[AnalyzerAPI.GeTPricesByTimeout] server error (will retry): %s", errMsg)
					return fmt.Errorf("%s", errMsg)
				}
				return retry.Unrecoverable(fmt.Errorf("%s", errMsg))
			}

			var res entity.ResponsePriceRecords
			if err = json.NewDecoder(resp.Body).Decode(&res); err != nil {
				log.Printf("[AnalyzerAPI.GeTPricesByTimeout] decode error (will retry): %v", err)
				return err // Retry on decode errors
			}

				result = &res
				log.Printf("[AnalyzerAPI.GeTPricesByTimeout] decoded OK: records=%d iSave=%d", len(result.Records), result.ISave)
				return nil
			},
			retry.Attempts(uint(a.cfg.RetryConfig.Attempts)),
			retry.Delay(time.Duration(a.cfg.RetryConfig.DelayMS)*time.Millisecond),
			retry.MaxDelay(time.Duration(a.cfg.RetryConfig.MaxDelayMS)*time.Millisecond),
			retry.DelayType(retry.BackOffDelay),
			retry.OnRetry(func(n uint, err error) {
				log.Printf("[AnalyzerAPI.GeTPricesByTimeout] retry attempt %d/%d: %v", n+1, a.cfg.RetryConfig.Attempts, err)
			}),
		)
	})

	if err != nil {
		// Check if circuit breaker is open
		if err == gobreaker.ErrOpenState {
			log.Printf("[AnalyzerAPI.GeTPricesByTimeout] circuit breaker is OPEN, failing fast")
			return nil, fmt.Errorf("circuit breaker open: service unavailable")
		}
		return nil, fmt.Errorf("request failed: %w", err)
	}

	// cbResult is always nil in our case (we set result in the closure)
	_ = cbResult

	if result == nil {
		return nil, fmt.Errorf("unexpected: result is nil after successful execution")
	}

	return result, nil
}
