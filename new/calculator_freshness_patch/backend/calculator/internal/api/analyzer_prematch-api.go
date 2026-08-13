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

type AnalizerPrematchAPI struct {
	cfg            config.AnalyzerAPI
	client         *http.Client
	circuitBreaker *gobreaker.CircuitBreaker
}

func NewAnalizerPrematchAPI(cfg config.AnalyzerAPI) *AnalizerPrematchAPI {
	// OPTIMIZED: HTTP transport with connection pooling
	// Prematch has less traffic than live, but still needs pooling
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		MaxConnsPerHost:     50,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  true,
		DisableKeepAlives:   false,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   time.Second * time.Duration(cfg.Timeout),
	}

	// FIX 2.5: Add circuit breaker (same as live API) for uniform degradation
	cbSettings := gobreaker.Settings{
		Name:        "AnalyzerPrematchAPI",
		MaxRequests: cfg.CircuitBreakerConfig.MaxRequests,
		Interval:    time.Duration(cfg.CircuitBreakerConfig.IntervalSeconds) * time.Second,
		Timeout:     time.Duration(cfg.CircuitBreakerConfig.TimeoutSeconds) * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			shouldTrip := counts.Requests >= 3 && failureRatio >= cfg.CircuitBreakerConfig.FailureRatio
			if shouldTrip {
				log.Printf("[CircuitBreaker-Prematch] Tripping: %d failures / %d requests = %.2f",
					counts.TotalFailures, counts.Requests, failureRatio)
			}
			return shouldTrip
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			log.Printf("[CircuitBreaker-Prematch] State changed from %s to %s", from.String(), to.String())
		},
	}

	cb := gobreaker.NewCircuitBreaker(cbSettings)

	return &AnalizerPrematchAPI{
		cfg:            cfg,
		client:         client,
		circuitBreaker: cb,
	}
}

// FIX 2.5: Add retry + circuit breaker (same pattern as live API)
func (a *AnalizerPrematchAPI) GeTPricesByTimeout(reqData entity.RequestPriceRecordsByTime) (*entity.ResponsePriceRecords, error) {
	var result *entity.ResponsePriceRecords

	cbResult, err := a.circuitBreaker.Execute(func() (interface{}, error) {
		return nil, retry.Do(
			func() error {
				data, err := json.Marshal(reqData)
				if err != nil {
					return retry.Unrecoverable(err)
				}

				req, err := http.NewRequest(
					http.MethodPost,
					a.cfg.URL+a.cfg.PricesURL,
					bytes.NewBuffer(data),
				)
				if err != nil {
					return retry.Unrecoverable(err)
				}

				req.Header.Set("Accept", "application/json")
				req.Header.Set("Content-Type", "application/json")

				log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] URL=%s payload=%s", req.URL.String(), string(data))

				resp, err := a.client.Do(req)
				if err != nil {
					log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] request failed (will retry): %v", err)
					return err
				}
				defer resp.Body.Close()

				log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] status=%d", resp.StatusCode)
				if resp.StatusCode != http.StatusOK {
					var buf bytes.Buffer
					_, _ = buf.ReadFrom(resp.Body)
					errMsg := fmt.Sprintf("analyzer prematch returned status %d: %s", resp.StatusCode, buf.String())

					if resp.StatusCode >= 500 {
						log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] server error (will retry): %s", errMsg)
						return fmt.Errorf("%s", errMsg)
					}
					return retry.Unrecoverable(fmt.Errorf("%s", errMsg))
				}

				var res entity.ResponsePriceRecords
				if err = json.NewDecoder(resp.Body).Decode(&res); err != nil {
					log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] decode error (will retry): %v", err)
					return err
				}

				result = &res
				log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] decoded OK: records=%d iSave=%d", len(result.Records), result.ISave)
				return nil
			},
			retry.Attempts(uint(a.cfg.RetryConfig.Attempts)),
			retry.Delay(time.Duration(a.cfg.RetryConfig.DelayMS)*time.Millisecond),
			retry.MaxDelay(time.Duration(a.cfg.RetryConfig.MaxDelayMS)*time.Millisecond),
			retry.DelayType(retry.BackOffDelay),
			retry.OnRetry(func(n uint, err error) {
				log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] retry attempt %d/%d: %v", n+1, a.cfg.RetryConfig.Attempts, err)
			}),
		)
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			log.Printf("[AnalyzerPrematchAPI.GeTPricesByTimeout] circuit breaker is OPEN, failing fast")
			return nil, fmt.Errorf("circuit breaker open: prematch service unavailable")
		}
		return nil, fmt.Errorf("request failed: %w", err)
	}

	_ = cbResult

	if result == nil {
		return nil, fmt.Errorf("unexpected: result is nil after successful execution")
	}

	return result, nil
}
