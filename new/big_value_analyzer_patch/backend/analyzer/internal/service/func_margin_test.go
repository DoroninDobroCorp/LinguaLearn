package service

import (
	"math"
	"testing"

	"livebets/analazer/internal/entity"
)

func TestCalculateMargin(t *testing.T) {
	t.Run("correct score uses dedicated 1.15 margin", func(t *testing.T) {
		margin := calculateMARGIN("CS 1:0", map[string]entity.OddsWithMarket{})

		if math.Abs(margin-1.15) > 1e-9 {
			t.Fatalf("calculateMARGIN(CS) = %.2f, want 1.15", margin)
		}
	})

	t.Run("DNB DC and 3WH use def margin 1.10", func(t *testing.T) {
		emptyOutcomes := map[string]entity.OddsWithMarket{}
		testCases := []struct {
			name        string
			outcomeName string
		}{
			{name: "DNB", outcomeName: "DNB 1"},
			{name: "DC", outcomeName: "DC 1X"},
			{name: "3WH", outcomeName: "3WH -1 1"},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				margin := calculateMARGIN(tc.outcomeName, emptyOutcomes)

				if math.Abs(margin-1.10) > 1e-9 {
					t.Fatalf("calculateMARGIN(%q) = %.2f, want default 1.10", tc.outcomeName, margin)
				}
			})
		}
	})

	t.Run("odd even specials use def margin 1.10", func(t *testing.T) {
		emptyOutcomes := map[string]entity.OddsWithMarket{}
		testCases := []struct {
			name        string
			outcomeName string
		}{
			{name: "OE", outcomeName: "OE Odd"},
			{name: "HOE", outcomeName: "HOE Even"},
			{name: "period OE", outcomeName: "P1 OE Odd"},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				margin := calculateMARGIN(tc.outcomeName, emptyOutcomes)

				if math.Abs(margin-1.10) > 1e-9 {
					t.Fatalf("calculateMARGIN(%q) = %.2f, want default 1.10", tc.outcomeName, margin)
				}
			})
		}
	})

	t.Run("paired totals use reciprocal sum", func(t *testing.T) {
		outcomes := map[string]entity.OddsWithMarket{
			"T> 2.5": makeOddsWithPinnacle(1.90),
			"T< 2.5": makeOddsWithPinnacle(1.90),
		}

		margin := calculateMARGIN("T> 2.5", outcomes)

		if margin <= 1.01 || margin >= 1.10 {
			t.Fatalf("calculateMARGIN(%q) = %.6f, want value between 1.01 and 1.10", "T> 2.5", margin)
		}
	})

	t.Run("correct score does not regress to 1.10", func(t *testing.T) {
		margin := calculateMARGIN("CS 1:0", map[string]entity.OddsWithMarket{})

		if math.Abs(margin-1.10) < 1e-9 {
			t.Fatalf("calculateMARGIN(CS) regressed to 1.10, want dedicated 1.15 margin")
		}
	})
}

func TestCalculateAndFilterCommonOutcomesRejectsImplausibleNativeMargin(t *testing.T) {
	service := &PairsMatchingService{}

	t.Run("cross-period contaminated 1X2 is rejected", func(t *testing.T) {
		common := map[string]OddsWithMarketV2{
			"1": makeV2Odds(1.22, 1.173),
			"X": makeV2Odds(9.50, 1.746),
			"2": makeV2Odds(6.00, 5.14),
		}
		pinnacle := nativePinnacleOdds(map[string]float64{
			"1": 1.173,
			"X": 1.746,
			"2": 5.14,
		})

		outcomes := service.calculateAndFilterCommonOutcomes(
			common, pinnacle, "Volcano", "Baseball", true,
		)

		if len(outcomes) != 0 {
			t.Fatalf("contaminated market produced %d outcomes, want 0", len(outcomes))
		}
	})

	t.Run("normal closed 1X2 remains available", func(t *testing.T) {
		common := map[string]OddsWithMarketV2{
			"1": makeV2Odds(1.30, 1.342),
			"X": makeV2Odds(5.60, 4.89),
			"2": makeV2Odds(8.00, 9.74),
		}
		pinnacle := nativePinnacleOdds(map[string]float64{
			"1": 1.342,
			"X": 4.89,
			"2": 9.74,
		})

		outcomes := service.calculateAndFilterCommonOutcomes(
			common, pinnacle, "Volcano", "Soccer", false,
		)

		if len(outcomes) != 3 {
			t.Fatalf("normal market produced %d outcomes, want 3", len(outcomes))
		}
		for _, outcome := range outcomes {
			if outcome.Margin >= maxPinnacleReferenceMargin {
				t.Fatalf("normal outcome %s has unexpected margin %.4f", outcome.Outcome, outcome.Margin)
			}
		}
	})
}

func makeV2Odds(donor, pinnacle float64) OddsWithMarketV2 {
	return OddsWithMarketV2{
		Odds: [2]entity.Odd{
			{Value: donor},
			{Value: pinnacle},
		},
	}
}

func nativePinnacleOdds(values map[string]float64) map[string]PinnacleOddEntry {
	out := make(map[string]PinnacleOddEntry, len(values))
	for key, value := range values {
		out[key] = PinnacleOddEntry{Value: value, IsNative: true}
	}
	return out
}

func makeOddsWithPinnacle(pinnacleOdds float64) entity.OddsWithMarket {
	return entity.OddsWithMarket{
		Odds: [2]entity.Odd{{}, {Value: pinnacleOdds}},
	}
}
