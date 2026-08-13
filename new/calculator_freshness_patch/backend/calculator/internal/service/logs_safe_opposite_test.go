package service

import (
	"livebets/calculator/internal/repository"
	"testing"
)

func TestCalculateSafeOppositeCreditSumsCompatibleBets(t *testing.T) {
	existing := []repository.ExistingBet{
		{Outcome: "T> 1.5", Percent: 20, SportName: "Soccer"},
		{Outcome: "T> 2.5", Percent: 30, SportName: "Soccer"},
		{Outcome: "BTTS Yes", Percent: 15, SportName: "Soccer"},
	}

	credit := calculateSafeOppositeCredit(existing, "T< 3.5", "Soccer")
	if credit == nil {
		t.Fatalf("expected safe opposite credit, got nil")
	}

	if credit.CreditPercent != 50 {
		t.Fatalf("credit percent = %v, want 50", credit.CreditPercent)
	}

	if credit.PrimaryOutcome != "T> 2.5" {
		t.Fatalf("primary outcome = %q, want %q", credit.PrimaryOutcome, "T> 2.5")
	}

	if credit.CompatibilityFamily != "total" {
		t.Fatalf("family = %q, want %q", credit.CompatibilityFamily, "total")
	}
}

func TestCalculateSafeOppositeCreditReturnsNilWhenNoCompatibleBet(t *testing.T) {
	existing := []repository.ExistingBet{
		{Outcome: "BTTS Yes", Percent: 20, SportName: "Soccer"},
		{Outcome: "H1 -1.5", Percent: 30, SportName: "Soccer"},
	}

	credit := calculateSafeOppositeCredit(existing, "T< 3.5", "Soccer")
	if credit != nil {
		t.Fatalf("expected nil credit, got %+v", credit)
	}
}

func TestCalculateSafeOppositeRemainingPercent(t *testing.T) {
	tests := []struct {
		name    string
		gross   float64
		credit  float64
		want    float64
	}{
		{
			name:   "50 gross plus 50 opposite credit gives full Kelly",
			gross:  50,
			credit: 50,
			want:   100,
		},
		{
			name:   "110 gross plus 30 opposite credit leaves 20 percent room",
			gross:  110,
			credit: 30,
			want:   20,
		},
		{
			name:   "130 gross plus 20 credit still leaves no room",
			gross:  130,
			credit: 20,
			want:   0,
		},
		{
			name:   "small gross plus large credit is capped at full Kelly",
			gross:  10,
			credit: 50,
			want:   100,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := calculateSafeOppositeRemainingPercent(tc.gross, tc.credit)
			if got != tc.want {
				t.Fatalf("remaining percent = %v, want %v", got, tc.want)
			}
		})
	}
}
