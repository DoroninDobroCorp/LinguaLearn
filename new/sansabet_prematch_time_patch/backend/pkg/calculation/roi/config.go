package roi

import "livebets/pkg/domain"

// MarketType represents the type of betting market
type MarketType int

const (
	MarketTypeMain      MarketType = 0  // 1X2, Moneyline
	MarketTypePositive  MarketType = 1  // Totals Over, Handicap +
	MarketTypeNegative  MarketType = -1 // Totals Under, Handicap -
)

// BookmakerConfig holds ROI calculation parameters for a bookmaker
type BookmakerConfig struct {
	Name              domain.Parser
	DefaultCommission float64 // Default commission (0.03 = 3%)
	AdjustmentFactor  float64 // Adjustment factor (0.67 = 67% of net ROI)
	SportOverrides    map[domain.SportName]SportConfig
	MarketOverrides   map[MarketType]MarketConfig
}

// SportConfig holds sport-specific overrides
type SportConfig struct {
	Commission       float64
	AdjustmentFactor float64
}

// MarketConfig holds market-type-specific overrides
type MarketConfig struct {
	Commission       float64
	AdjustmentFactor float64
}

// DefaultConfigs returns default ROI configs for all bookmakers
func DefaultConfigs() map[domain.Parser]BookmakerConfig {
	return map[domain.Parser]BookmakerConfig{
		domain.Lobbet: {
			Name:              domain.Lobbet,
			DefaultCommission: 0.03,
			AdjustmentFactor:  0.67,
			SportOverrides: map[domain.SportName]SportConfig{
				domain.Tennis: {
					Commission:       0.03,
					AdjustmentFactor: 0.67,
				},
			},
			MarketOverrides: map[MarketType]MarketConfig{
				MarketTypeNegative: {
					Commission:       0.015,
					AdjustmentFactor: 0.75,
				},
			},
		},
		domain.Ladbrokes: {
			Name:              domain.Ladbrokes,
			DefaultCommission: 0.02,
			AdjustmentFactor:  0.75,
			SportOverrides: map[domain.SportName]SportConfig{
				domain.Tennis: {
					Commission:       0.02,
					AdjustmentFactor: 0.75,
				},
			},
			MarketOverrides: map[MarketType]MarketConfig{
				MarketTypeNegative: {
					Commission:       0.0,
					AdjustmentFactor: 0.85,
				},
			},
		},
		// Default config for other bookmakers
		"DEFAULT": {
			Name:              "DEFAULT",
			DefaultCommission: 0.03,
			AdjustmentFactor:  0.67,
		},
	}
}
