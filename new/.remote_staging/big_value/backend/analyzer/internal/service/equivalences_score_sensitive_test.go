package service

import (
	"testing"

	"livebets/analazer/internal/entity"
)

func TestCanUseScoreSensitiveEquivalence(t *testing.T) {
	tests := []struct {
		name               string
		period, home, away int
		sport              string
		want               bool
	}{
		{name: "soccer scoreless", period: 0, sport: "Soccer", want: true},
		{name: "soccer level full match", period: 0, home: 1, away: 1, sport: "Soccer", want: true},
		{name: "soccer non-level full match", period: 0, home: 5, away: 1, sport: "Soccer", want: false},
		{name: "soccer level first period", period: 1, home: 1, away: 1, sport: "Soccer", want: true},
		{name: "soccer later period", period: 2, home: 1, away: 1, sport: "Soccer", want: false},
		{name: "non-soccer", period: 0, home: 5, away: 1, sport: "Basketball", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canUseScoreSensitiveEquivalence(tt.period, tt.home, tt.away, tt.sport); got != tt.want {
				t.Fatalf("canUseScoreSensitiveEquivalence() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSoccerNonLevelScoreKeepsDoubleChanceSeparateFromHandicap(t *testing.T) {
	period := entity.PeriodData{
		DoubleChance: &entity.DoubleChanceStruct{
			WX2: entity.Odd{Value: 102},
		},
	}

	pinnacleAtFiveOne := canonicalizePinnacleMarkets(period, 0, 5, 1, "Soccer")
	if _, ok := pinnacleAtFiveOne["DC X2"]; !ok {
		t.Fatal("Pinnacle DC X2 must keep its native key at soccer score 5:1")
	}
	if _, ok := pinnacleAtFiveOne["H2 0.5"]; ok {
		t.Fatal("Pinnacle DC X2 must not become H2 0.5 at soccer score 5:1")
	}

	donorAtFiveOne := extractAllDonorMarkets(period, 0, 5, 1, "Soccer")
	if got := donorCanonicalKey(t, donorAtFiveOne, "DC X2"); got != "DC X2" {
		t.Fatalf("donor DC X2 canonical key at 5:1 = %q, want native DC X2", got)
	}

	pinnacleAtZeroZero := canonicalizePinnacleMarkets(period, 0, 0, 0, "Soccer")
	if _, ok := pinnacleAtZeroZero["H2 0.5"]; !ok {
		t.Fatal("Pinnacle DC X2 should become H2 0.5 in safe scoreless context")
	}
	donorAtZeroZero := extractAllDonorMarkets(period, 0, 0, 0, "Soccer")
	if got := donorCanonicalKey(t, donorAtZeroZero, "DC X2"); got != "H2 0.5" {
		t.Fatalf("donor DC X2 canonical key at 0:0 = %q, want H2 0.5", got)
	}
}

func donorCanonicalKey(t *testing.T, markets []DonorMarketWithCanonical, original string) string {
	t.Helper()
	for _, market := range markets {
		if market.OriginalKey == original {
			return market.CanonicalKey
		}
	}
	t.Fatalf("donor market %q not found", original)
	return ""
}
