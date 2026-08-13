package service

import (
	"io"
	"livebets/analazer/cmd/config"
	"livebets/analazer/internal/entity"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func TestBuildPublicPairFiltersStaleOutcome(t *testing.T) {
	logger := zerolog.New(io.Discard)
	now := time.Now()
	svc := &PairsMatchingService{
		logger: &logger,
		cfg: config.PairsMatching{
			PairTimeout:        5,
			MaxPriceAgeSeconds: 15,
		},
	}

	pair := entity.ResponsePair{
		First: entity.ResponseMatch{
			Bookmaker: "Pinnacle",
			MatchID:   "111",
			HomeName:  "Sporting CP",
			AwayName:  "Galitos Barreiro",
			CreatedAt: now.Add(-2 * time.Second),
		},
		Second: entity.ResponseMatch{
			Bookmaker: "Sansabet",
			MatchID:   "222",
			CreatedAt: now.Add(-1 * time.Second),
		},
		Outcome: []entity.Outcome{
			{Outcome: "P3 H2 0"},
		},
		IsLive:    true,
		SportName: "Basketball",
		CreatedAt: now,
	}

	svc.outcomeLastSeen.Store("Pinnacle|111|P3 H2 0", now.Add(-20*time.Second))

	if _, ok := svc.buildPublicPair("pair-key", pair, now, svc.cfg, false, "test"); ok {
		t.Fatalf("expected stale live outcome to be filtered from public snapshot")
	}
}

func TestBuildPublicPairKeepsPrematchPairWithoutOutcomeTracking(t *testing.T) {
	logger := zerolog.New(io.Discard)
	now := time.Now()
	svc := &PairsMatchingService{
		logger: &logger,
		cfg: config.PairsMatching{
			PairTimeout:        5,
			MaxPriceAgeSeconds: 120,
		},
	}

	pair := entity.ResponsePair{
		First: entity.ResponseMatch{
			Bookmaker: "Pinnacle",
			MatchID:   "555",
			HomeName:  "Michael Geerts",
			AwayName:  "Constantin Bittoun Kouzmine",
			CreatedAt: now.Add(-20 * time.Second),
		},
		Second: entity.ResponseMatch{
			Bookmaker: "Sansabet",
			MatchID:   "666",
			CreatedAt: now.Add(-15 * time.Second),
		},
		Outcome: []entity.Outcome{
			{Outcome: "P1"},
		},
		IsLive:    false,
		SportName: "Tennis",
		CreatedAt: now,
	}

	publicPair, ok := svc.buildPublicPair("pair-key", pair, now, svc.cfg, false, "test")
	if ok == false {
		t.Fatalf("expected prematch pair without per-outcome tracking to stay in public snapshot")
	}
	if len(publicPair.Outcome) != 1 {
		t.Fatalf("expected exactly one outcome, got %d", len(publicPair.Outcome))
	}
	if publicPair.Outcome[0].OutcomeAge < 19 || publicPair.Outcome[0].OutcomeAge > 21 {
		t.Fatalf("expected prematch fallback outcome age to track first bookmaker age, got %.3f", publicPair.Outcome[0].OutcomeAge)
	}
}

func TestBuildPublicPairKeepsFreshOutcomeAndCopiesAge(t *testing.T) {
	logger := zerolog.New(io.Discard)
	now := time.Now()
	svc := &PairsMatchingService{
		logger: &logger,
		cfg: config.PairsMatching{
			PairTimeout:        5,
			MaxPriceAgeSeconds: 15,
		},
	}

	pair := entity.ResponsePair{
		First: entity.ResponseMatch{
			Bookmaker: "Pinnacle",
			MatchID:   "333",
			HomeName:  "Sporting CP",
			AwayName:  "Galitos Barreiro",
			CreatedAt: now.Add(-3 * time.Second),
		},
		Second: entity.ResponseMatch{
			Bookmaker: "Sansabet",
			MatchID:   "444",
			CreatedAt: now.Add(-1 * time.Second),
		},
		Outcome: []entity.Outcome{
			{Outcome: "P3 H2 0"},
		},
		IsLive:    true,
		SportName: "Basketball",
		CreatedAt: now,
	}

	seenAt := now.Add(-4 * time.Second)
	svc.outcomeLastSeen.Store("Pinnacle|333|P3 H2 0", seenAt)

	publicPair, ok := svc.buildPublicPair("pair-key", pair, now, svc.cfg, false, "test")
	if !ok {
		t.Fatalf("expected fresh live outcome to stay in public snapshot")
	}
	if len(publicPair.Outcome) != 1 {
		t.Fatalf("expected exactly one outcome, got %d", len(publicPair.Outcome))
	}
	if publicPair.Outcome[0].OutcomeAge <= 0 || publicPair.Outcome[0].OutcomeAge >= 15 {
		t.Fatalf("expected copied outcome age to be within live threshold, got %.3f", publicPair.Outcome[0].OutcomeAge)
	}
	if publicPair.DataAge < 2.9 || publicPair.DataAge > 3.1 {
		t.Fatalf("expected data age to track max bookmaker age, got %.3f", publicPair.DataAge)
	}
}
