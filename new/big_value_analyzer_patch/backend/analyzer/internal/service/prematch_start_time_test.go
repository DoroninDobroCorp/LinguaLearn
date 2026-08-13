package service

import (
	"io"
	"livebets/analazer/cmd/config"
	"livebets/analazer/internal/entity"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func TestPrematchStartTimesCompatible(t *testing.T) {
	base := time.Date(2026, 8, 10, 16, 0, 0, 0, time.UTC)
	dateOnlySameDay := time.Date(2026, 8, 10, 23, 59, 59, int(time.Second-time.Nanosecond), time.UTC)
	dateOnlyNextDay := time.Date(2026, 8, 11, 23, 59, 59, int(time.Second-time.Nanosecond), time.UTC)
	tests := []struct {
		name   string
		live   bool
		first  time.Time
		second time.Time
		want   bool
	}{
		{name: "equal", first: base, second: base, want: true},
		{name: "inside tolerance", first: base, second: base.Add(29*time.Minute + 59*time.Second), want: true},
		{name: "exact tolerance", first: base, second: base.Add(30 * time.Minute), want: true},
		{name: "outside tolerance", first: base, second: base.Add(30*time.Minute + time.Second), want: false},
		{name: "reverse large delta", first: base.Add(135 * time.Minute), second: base, want: false},
		{name: "live is unaffected", live: true, first: base, second: base.Add(3 * time.Hour), want: true},
		{name: "missing first remains compatible", second: base, want: true},
		{name: "missing second remains compatible", first: base, want: true},
		{name: "date-only donor on same day", first: base, second: dateOnlySameDay, want: true},
		{name: "date-only donor on different day", first: base, second: dateOnlyNextDay, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := prematchStartTimesCompatible(test.live, test.first, test.second); got != test.want {
				t.Fatalf("prematchStartTimesCompatible() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestBuildPublicPairRejectsPrematchStartTimeMismatch(t *testing.T) {
	logger := zerolog.New(io.Discard)
	now := time.Now()
	svc := &PairsMatchingService{
		logger: &logger,
		cfg: config.PairsMatching{
			PairTimeout:        60,
			MaxPriceAgeSeconds: 90,
		},
	}
	pair := entity.ResponsePair{
		First: entity.ResponseMatch{
			Bookmaker: "Pinnacle",
			MatchID:   "1633294708",
			HomeName:  "botev plovdiv",
			AwayName:  "spartak varna",
			CreatedAt: now.Add(-5 * time.Second),
			MatchDate: time.Date(2026, 8, 10, 16, 0, 0, 0, time.UTC),
		},
		Second: entity.ResponseMatch{
			Bookmaker: "Volcano",
			MatchID:   "6EAB",
			HomeName:  "Botev Plovdiv",
			AwayName:  "Spartak Varna",
			CreatedAt: now.Add(-2 * time.Second),
			MatchDate: time.Date(2026, 8, 10, 18, 15, 0, 0, time.UTC),
		},
		Outcome:   []entity.Outcome{{Outcome: "1"}},
		IsLive:    false,
		CreatedAt: now,
	}

	if _, ok := svc.buildPublicPair("bad-start-pair", pair, now, svc.cfg, false, "test"); ok {
		t.Fatal("expected prematch pair with 135 minute start delta to be rejected")
	}
}
