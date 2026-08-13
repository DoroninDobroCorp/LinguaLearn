package roi

import (
	"math"

	"livebets/pkg/domain"
)

// Calculator calculates ROI for betting opportunities
type Calculator struct {
	configs map[domain.Parser]BookmakerConfig
}

// NewCalculator creates ROI calculator with default configs
func NewCalculator() *Calculator {
	return &Calculator{
		configs: DefaultConfigs(),
	}
}

// NewCustomCalculator creates calculator with custom configs
func NewCustomCalculator(configs map[domain.Parser]BookmakerConfig) *Calculator {
	return &Calculator{configs: configs}
}

// ============================================================
// РАСЧЕТ ROI (ДОХОДНОСТЬ СТАВКИ)
// ============================================================
//
// ФОРМУЛА:
// ROI = (DonorOdd / TrueKoef - 1 - commission) × 100 × adjustmentFactor
//
// где TrueKoef = PinnacleOdd × Margin × ExtraPercent
//
// ТРИ СИСТЕМЫ КОРРЕКТИРОВКИ (все зависят от диапазона Pinnacle кэфа):
//
// 1. ExtraPercent — корректировка TrueKoef за неопределённость
//    Низкие кэфы (< 1.80): 1.0 (нейтрально, Pinnacle точен)
//    Средние (1.80-2.29): 1.01-1.02 (лёгкий штраф)
//    Высокие (2.29+): 1.03-1.05+ (серьёзный штраф)
//
// 2. Commission — штраф за ненадёжность донора
//    < 1.65: 0 (Pinnacle точен, донор тоже)
//    1.65-1.80: 0.02 (переходная зона)
//    ≥ 1.80: 0.03 (стандартный штраф)
//
// 3. AdjustmentFactor — консервативный множитель
//    < 1.40: 0.90 (тяжёлые фавориты, Pinnacle очень точен)
//    1.40-1.65: 0.75 (фавориты)
//    ≥ 1.65: 0.67 (стандартный)
//
// Одинаково для live и prematch.
//
// ============================================================
func (c *Calculator) Calculate(
	donorOdd, pinnacleOdd float64,
	margin float64,
	marketType MarketType,
	bookmaker domain.Parser,
	sport domain.SportName,
	isLive bool,
) float64 {
	// Skip if any input is zero or negative
	if donorOdd <= 0 || pinnacleOdd <= 0 || margin <= 0 {
		return 0
	}

	// Commission и AdjustmentFactor определяются диапазоном Pinnacle кэфа
	commission, adjustmentFactor := getOddsRangeParams(pinnacleOdd)

	extraPercent := getExtraPercent(pinnacleOdd)

	trueKoef := pinnacleOdd * margin * extraPercent
	if trueKoef == 0 {
		return 0
	}

	return (donorOdd/trueKoef - 1 - commission) * 100 * adjustmentFactor
}

// ============================================================
// РАСЧЕТ GROUP ROI (ГРУППОВАЯ СТРАТЕГИЯ)
// ============================================================
//
// Отличается от обычного ROI:
// - НЕТ вычитания commission
// - НЕТ умножения на adjustmentFactor
// - НЕТ вычитания 1
//
// ФОРМУЛА:
// ROI = MaxOdd / (BaseOdd × Margin × ExtraPercent)
//
// где:
// - donorOdd = MaxOdd (максимум в группе, выброс)
// - pinnacleOdd = BaseOdd (Avg или Med группы)
// - Margin = маржа Pinnacle
//
// ПРИМЕР:
// Max = 2.60 (Lobbet выброс)
// Avg = 2.35 (среднее группы)
// Margin = 1.025
// ExtraPercent = 1.03
//
// ROI = 2.60 / (2.35 × 1.025 × 1.03)
//     = 2.60 / 2.483
//     = 1.047 (104.7%)
//
// Это "сырое" расхождение для мониторинга, не итоговый выигрыш
// ============================================================
// CalculateGroup computes ROI for GROUP bookmaker (special case)
func (c *Calculator) CalculateGroup(donorOdd, pinnacleOdd, margin float64) float64 {
	if donorOdd <= 0 || pinnacleOdd <= 0 || margin <= 0 {
		return 0
	}
	extraPercent := getExtraPercent(pinnacleOdd)
	
	// TrueKoef - базовый коэффициент для сравнения (Avg или Med группы)
	trueKoef := pinnacleOdd * margin * extraPercent
	if trueKoef == 0 {
		return 0
	}
	
	// Для GROUP возвращаем "сырое" отношение без вычитаний
	return donorOdd / trueKoef
}

// getOddsRangeParams returns commission and adjustmentFactor based on Pinnacle odds range.
// Lower odds = Pinnacle more accurate = softer penalties.
// Same for live and prematch.
func getOddsRangeParams(pinnacleOdd float64) (commission, adjustmentFactor float64) {
	switch {
	case pinnacleOdd < 1.40:
		return 0, 0.90
	case pinnacleOdd < 1.65:
		return 0, 0.75
	case pinnacleOdd < 1.80:
		return 0.02, 0.67
	default:
		return 0.03, 0.67
	}
}

// getExtraPercent returns extra percentage for TrueKoef based on Pinnacle odds range.
// < 1.80: neutral (1.0), 1.80+: progressive penalty for uncertainty.
func getExtraPercent(pinnacleOdd float64) float64 {
	switch {
	case pinnacleOdd >= 4.0:
		return 1.05 * math.Exp(0.05*(pinnacleOdd-4.0))
	case pinnacleOdd >= 3.2:
		return 1.05
	case pinnacleOdd >= 2.75:
		return 1.04
	case pinnacleOdd >= 2.29:
		return 1.03
	case pinnacleOdd >= 2.10:
		return 1.02
	case pinnacleOdd >= 1.80:
		return 1.01
	default:
		return 1.0
	}
}

// Legacy function for backward compatibility
// CalculateROI calculates ROI using legacy function signature
// isLive: true for live matches, false for prematch (adjustmentFactor=1.0)
func CalculateROI(donorOdd, pinnacleOdd float64, margin float64, marketType int, bookmaker domain.Parser, sport domain.SportName, isLive bool) float64 {
	calc := NewCalculator()

	// Handle special case for GROUP
	if bookmaker == "GROUP" {
		return calc.CalculateGroup(donorOdd, pinnacleOdd, margin)
	}

	return calc.Calculate(donorOdd, pinnacleOdd, margin, MarketType(marketType), bookmaker, sport, isLive)
}
