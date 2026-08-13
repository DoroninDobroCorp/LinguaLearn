package retry

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"net"
	"net/http"
	"time"
)

// Config holds retry configuration
type Config struct {
	MaxAttempts     int
	InitialDelay    time.Duration
	MaxDelay        time.Duration
	Multiplier      float64
	RetryableErrors []error
}

// DefaultConfig returns default retry configuration
func DefaultConfig() Config {
	return Config{
		MaxAttempts:  3,
		InitialDelay: 100 * time.Millisecond,
		MaxDelay:     5 * time.Second,
		Multiplier:   2.0,
	}
}

// IsRetryableError checks if error should trigger retry
func IsRetryableError(err error) bool {
	if err == nil {
		return false
	}

	// Network errors
	var netErr net.Error
	if errors.As(err, &netErr) {
		if netErr.Timeout() || netErr.Temporary() {
			return true
		}
	}

	// Context errors (don't retry)
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}

	return false
}

// IsRetryableHTTPStatus checks if HTTP status code should trigger retry
func IsRetryableHTTPStatus(statusCode int) bool {
	return statusCode == http.StatusTooManyRequests ||
		statusCode == http.StatusServiceUnavailable ||
		statusCode == http.StatusBadGateway ||
		statusCode == http.StatusGatewayTimeout ||
		statusCode >= 500
}

// Do executes function with retry logic
func Do(ctx context.Context, cfg Config, fn func() error) error {
	var lastErr error

	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		lastErr = fn()
		if lastErr == nil {
			return nil // Success
		}

		// Check if error is retryable (custom list or built-in check)
		retryable := false
		for _, re := range cfg.RetryableErrors {
			if errors.Is(lastErr, re) {
				retryable = true
				break
			}
		}
		if !retryable && !IsRetryableError(lastErr) {
			return lastErr // Don't retry
		}

		// Don't sleep on last attempt
		if attempt == cfg.MaxAttempts {
			break
		}

		// Calculate delay with exponential backoff
		delay := calculateDelay(attempt, cfg.InitialDelay, cfg.MaxDelay, cfg.Multiplier)

		// Check context before sleeping
		select {
		case <-ctx.Done():
			return fmt.Errorf("retry cancelled: %w", ctx.Err())
		case <-time.After(delay):
			// Continue to next attempt
		}
	}

	return fmt.Errorf("max retries (%d) exceeded: %w", cfg.MaxAttempts, lastErr)
}

// DoWithResult executes function with retry logic and returns result
func DoWithResult[T any](ctx context.Context, cfg Config, fn func() (T, error)) (T, error) {
	var lastErr error
	var result T

	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		result, lastErr = fn()
		if lastErr == nil {
			return result, nil // Success
		}

		// Check if error is retryable (custom list or built-in check)
		retryable := false
		for _, re := range cfg.RetryableErrors {
			if errors.Is(lastErr, re) {
				retryable = true
				break
			}
		}
		if !retryable && !IsRetryableError(lastErr) {
			return result, lastErr // Don't retry
		}

		// Don't sleep on last attempt
		if attempt == cfg.MaxAttempts {
			break
		}

		// Calculate delay with exponential backoff
		delay := calculateDelay(attempt, cfg.InitialDelay, cfg.MaxDelay, cfg.Multiplier)

		// Check context before sleeping
		select {
		case <-ctx.Done():
			return result, fmt.Errorf("retry cancelled: %w", ctx.Err())
		case <-time.After(delay):
			// Continue to next attempt
		}
	}

	return result, fmt.Errorf("max retries (%d) exceeded: %w", cfg.MaxAttempts, lastErr)
}

func calculateDelay(attempt int, initialDelay, maxDelay time.Duration, multiplier float64) time.Duration {
	delay := time.Duration(float64(initialDelay) * math.Pow(multiplier, float64(attempt-1)))
	if delay > maxDelay {
		delay = maxDelay
	}
	// Add jitter: ±25% to reduce thundering herd
	jitter := time.Duration(float64(delay) * (0.75 + rand.Float64()*0.5))
	return jitter
}
