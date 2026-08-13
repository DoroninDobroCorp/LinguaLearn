package roi

import (
	"livebets/pkg/domain"
	"math"
	"testing"
)

func TestCalculator_Calculate_Lobbet(t *testing.T) {
	calc := NewCalculator()

	tests := []struct {
		name        string
		donorOdd    float64
		pinnacleOdd float64
		margin      float64
		marketType  MarketType
		sport       domain.SportName
		expectedROI float64
	}{
		{
			name:        "Lobbet Soccer Main Market",
			donorOdd:    2.5,
			pinnacleOdd: 2.0,
			margin:      1.0,
			marketType:  MarketTypeMain,
			sport:       domain.Soccer,
			// ExtraPercent=1.01, commission=0.03, adjustmentFactor=0.67.
			expectedROI: 13.91,
		},
		{
			name:        "Lobbet Tennis Main Market",
			donorOdd:    3.0,
			pinnacleOdd: 2.5,
			margin:      1.0,
			marketType:  MarketTypeMain,
			sport:       domain.Tennis,
			// ExtraPercent=1.03, commission=0.03, adjustmentFactor=0.67.
			expectedROI: 9.05,
		},
		{
			name:        "Lobbet Negative Market",
			donorOdd:    1.9,
			pinnacleOdd: 1.8,
			margin:      1.0,
			marketType:  MarketTypeNegative,
			sport:       domain.Soccer,
			// ExtraPercent=1.01, commission=0.03, adjustmentFactor=0.67.
			expectedROI: 1.01,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			roi := calc.Calculate(
				tt.donorOdd, tt.pinnacleOdd, tt.margin,
				tt.marketType, domain.Lobbet, tt.sport, true, // isLive=true
			)

			if math.Abs(roi-tt.expectedROI) > 0.01 {
				t.Errorf("Calculate() = %.4f, want %.4f", roi, tt.expectedROI)
			}
		})
	}
}

func TestCalculator_Calculate_Ladbrokes(t *testing.T) {
	calc := NewCalculator()

	tests := []struct {
		name        string
		donorOdd    float64
		pinnacleOdd float64
		marketType  MarketType
		sport       domain.SportName
		expectedROI float64
	}{
		{
			name:        "Ladbrokes Soccer Main Market",
			donorOdd:    2.5,
			pinnacleOdd: 2.0,
			marketType:  MarketTypeMain,
			sport:       domain.Soccer,
			// ExtraPercent=1.01, commission=0.03, adjustmentFactor=0.67.
			expectedROI: 13.91,
		},
		{
			name:        "Ladbrokes Negative Market",
			donorOdd:    1.9,
			pinnacleOdd: 1.8,
			marketType:  MarketTypeNegative,
			sport:       domain.Soccer,
			// ExtraPercent=1.01, commission=0.03, adjustmentFactor=0.67.
			expectedROI: 1.01,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			roi := calc.Calculate(
				tt.donorOdd, tt.pinnacleOdd, 1.0,
				tt.marketType, domain.Ladbrokes, tt.sport, true, // isLive=true
			)

			if math.Abs(roi-tt.expectedROI) > 0.01 {
				t.Errorf("Calculate() = %.4f, want %.4f", roi, tt.expectedROI)
			}
		})
	}
}

func TestCalculator_CalculateGroup(t *testing.T) {
	calc := NewCalculator()

	roi := calc.CalculateGroup(2.5, 2.0, 1.0)
	expected := 2.5 / (2.0 * 1.01)

	if math.Abs(roi-expected) > 0.01 {
		t.Errorf("CalculateGroup() = %.4f, want %.4f", roi, expected)
	}
}

func TestCalculator_DefaultBookmaker(t *testing.T) {
	calc := NewCalculator()

	// The correction is based on the Pinnacle odds range, not bookmaker config.
	roi := calc.Calculate(
		2.5, 2.0, 1.0,
		MarketTypeMain,
		domain.Parser("UnknownBookmaker"),
		domain.Soccer,
		true, // isLive=true
	)

	expected := 13.91

	if math.Abs(roi-expected) > 0.01 {
		t.Errorf("Calculate() with unknown bookmaker = %.4f, want %.4f", roi, expected)
	}
}

func TestCalculator_ExtraPercent(t *testing.T) {
	tests := []struct {
		pinnacleOdd float64
		expected    float64
	}{
		{1.2, 1.0},
		{1.4, 1.0},
		{1.6, 1.0},
		{1.8, 1.01},
		{2.0, 1.01},
		{2.2, 1.02},
		{2.5, 1.03},                        // 2.29-2.75 → 1.03
		{3.0, 1.04},                        // 2.75-3.2 → 1.04
		{3.5, 1.05},                        // 3.2-4.0 → 1.05
		{4.0, 1.05},                        // == 4.0 → 1.05 * e^(0.05*0) = 1.05
		{5.0, 1.05 * math.Exp(0.05*1.0)},   // 1.1039
		{7.0, 1.05 * math.Exp(0.05*3.0)},   // 1.2190
		{10.0, 1.05 * math.Exp(0.05*6.0)},  // 1.4174
		{20.0, 1.05 * math.Exp(0.05*16.0)}, // 2.3368
	}

	for _, tt := range tests {
		got := getExtraPercent(tt.pinnacleOdd)
		if math.Abs(got-tt.expected) > 0.0001 {
			t.Errorf("getExtraPercent(%.2f) = %.4f, want %.4f", tt.pinnacleOdd, got, tt.expected)
		}
	}
}

// Test legacy function
func TestCalculateROI_Legacy(t *testing.T) {
	// Legacy entry point uses the same current three-tier correction.
	roi := CalculateROI(2.5, 2.0, 1.0, 0, domain.Lobbet, domain.Soccer, true)
	expected := 13.91

	if math.Abs(roi-expected) > 0.01 {
		t.Errorf("CalculateROI() legacy live = %.4f, want %.4f", roi, expected)
	}

	// Test GROUP special case (не затронут — отдельная формула)
	roiGroup := CalculateROI(2.5, 2.0, 1.0, 0, "GROUP", domain.Soccer, true)
	expectedGroup := 2.5 / (2.0 * 1.01)

	if math.Abs(roiGroup-expectedGroup) > 0.01 {
		t.Errorf("CalculateROI() GROUP = %.4f, want %.4f", roiGroup, expectedGroup)
	}
}

// Test prematch mode: live and prematch intentionally use the same correction.
func TestCalculateROI_Prematch(t *testing.T) {
	calc := NewCalculator()

	roi := calc.Calculate(2.5, 2.0, 1.0, MarketTypeMain, domain.Lobbet, domain.Soccer, false)
	expected := 13.91

	if math.Abs(roi-expected) > 0.01 {
		t.Errorf("Calculate() prematch = %.4f, want %.4f", roi, expected)
	}

	// Live is identical.
	roiLive := calc.Calculate(2.5, 2.0, 1.0, MarketTypeMain, domain.Lobbet, domain.Soccer, true)
	expectedLive := 13.91

	if math.Abs(roiLive-expectedLive) > 0.01 {
		t.Errorf("Calculate() live = %.4f, want %.4f", roiLive, expectedLive)
	}
}

func TestCalculator_CustomConfig(t *testing.T) {
	// Test with custom configuration
	customConfigs := map[domain.Parser]BookmakerConfig{
		"TestBookmaker": {
			Name:              "TestBookmaker",
			DefaultCommission: 0.05,
			AdjustmentFactor:  0.8,
		},
	}

	calc := NewCustomCalculator(customConfigs)

	// Current calculation intentionally ignores per-bookmaker overrides and uses
	// the Pinnacle odds-range correction.
	roi := calc.Calculate(
		2.5, 2.0, 1.0,
		MarketTypeMain,
		"TestBookmaker",
		domain.Soccer,
		true, // isLive=true
	)

	expected := 13.91

	if math.Abs(roi-expected) > 0.01 {
		t.Errorf("Calculate() with custom config = %.4f, want %.4f", roi, expected)
	}
}
