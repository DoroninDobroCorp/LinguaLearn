package handler

import (
	"strings"
	"testing"
	"time"

	"livebets/calculator/internal/entity"
)

func TestCheckPriceFreshnessPrematchBoundary(t *testing.T) {
	t.Setenv(prematchMaxPriceAgeSecondsEnvKey, "90")
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name      string
		age       time.Duration
		wantStale bool
	}{
		{name: "89_seconds_is_fresh", age: 89 * time.Second},
		{name: "90_seconds_is_fresh", age: 90 * time.Second},
		{name: "91_seconds_is_stale", age: 91 * time.Second, wantStale: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reason := checkPriceFreshnessAt(pairAtAge(now, tt.age, false), now)
			if tt.wantStale && reason == "" {
				t.Fatal("expected stale prematch pair, got fresh")
			}
			if !tt.wantStale && reason != "" {
				t.Fatalf("expected fresh prematch pair, got %q", reason)
			}
		})
	}
}

func TestCheckPriceFreshnessCannotBeDisabledByRetiredFlag(t *testing.T) {
	t.Setenv("CALCULATOR_DISABLE_PRICE_FRESHNESS", "1")
	t.Setenv(prematchMaxPriceAgeSecondsEnvKey, "90")
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)

	if reason := checkPriceFreshnessAt(pairAtAge(now, 91*time.Second, false), now); reason == "" {
		t.Fatal("retired disable flag must not bypass freshness rejection")
	}
}

func TestMaxPriceAgePrematchUsesSafeDefault(t *testing.T) {
	for _, value := range []string{"", "0", "-1", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv(prematchMaxPriceAgeSecondsEnvKey, value)
			if got := maxPriceAge(false); got != defaultPrematchMaxPriceAge {
				t.Fatalf("maxPriceAge(false) = %v, want %v", got, defaultPrematchMaxPriceAge)
			}
		})
	}
}

func TestMaxPriceAgePrematchIsConfigurableWithoutWeakeningLive(t *testing.T) {
	t.Setenv(prematchMaxPriceAgeSecondsEnvKey, "45")

	if got := maxPriceAge(false); got != 45*time.Second {
		t.Fatalf("maxPriceAge(false) = %v, want 45s", got)
	}
	if got := maxPriceAge(true); got != liveMaxPriceAge {
		t.Fatalf("maxPriceAge(true) = %v, want %v", got, liveMaxPriceAge)
	}
}

func TestCheckPriceFreshnessLiveSemanticsUnchanged(t *testing.T) {
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)

	if reason := checkPriceFreshnessAt(pairAtAge(now, 4*time.Second, true), now); reason != "" {
		t.Fatalf("expected four-second live pair to be fresh, got %q", reason)
	}
	if reason := checkPriceFreshnessAt(pairAtAge(now, 6*time.Second, true), now); !strings.Contains(reason, "first side too old") {
		t.Fatalf("expected six-second live pair to fail the five-second match limit, got %q", reason)
	}

	pair := pairAtAge(now, time.Second, true)
	pair.Outcome.OutcomeAge = 16
	if reason := checkPriceFreshnessAt(pair, now); !strings.Contains(reason, "outcome too old") {
		t.Fatalf("expected live outcome older than 15 seconds to be stale, got %q", reason)
	}
}

func pairAtAge(now time.Time, age time.Duration, isLive bool) entity.PairOneOutcome {
	createdAt := now.Add(-age)
	return entity.PairOneOutcome{
		First: entity.Match{
			Bookmaker: "Pinnacle",
			CreatedAt: createdAt,
		},
		Second: entity.Match{
			Bookmaker: "Donor",
			CreatedAt: createdAt,
		},
		Outcome: entity.Outcome{Outcome: "Win1"},
		IsLive:  isLive,
	}
}
