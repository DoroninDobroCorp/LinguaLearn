package service

import (
	"fmt"
	"livebets/analazer/internal/entity"
	"livebets/pkg/domain"
	roicalc "livebets/pkg/calculation/roi"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// invertHandicapLine инвертирует знак гандикапной линии: "-1.5" → "1.5", "2.0" → "-2.0".
// Нужно для нахождения комплементарного исхода: H1 X ↔ H2 (-X).
// Парсер PS3838 кладёт Win1 и Win2 от ОДНОЙ спред-записи в РАЗНЫЕ ключи
// (Win1→home_line=-hdp, Win2→away_line=hdp), поэтому H1 X и H2 X — из РАЗНЫХ
// записей. Настоящая комплементарная пара: H1 X ↔ H2 (-X) (одна запись).
func invertHandicapLine(line string) string {
	v, err := strconv.ParseFloat(line, 64)
	if err != nil || v == 0 {
		return line // 0 → 0 (H1 0 ↔ H2 0 — монейлайн), ошибка → как есть
	}
	return formatLine(-v)
}

// ============================================================
// РАСЧЕТ MARGIN (МАРЖА БУКМЕКЕРА)
// ============================================================
const maxPinnacleReferenceMargin = 1.20

// 
// ЗАЧЕМ: Чтобы убрать маржу Pinnacle из коэффициентов и получить
// "истинный" коэффициент для честного сравнения с донором.
//
// ЧТО ТАКОЕ MARGIN:
// Margin = 1/k1 + 1/k2 + 1/k3 + ... (сумма обратных коэффициентов)
//
// ПРИМЕР:
// Pinnacle дает: Win1=2.17, Draw=3.91, Win2=3.25
// margin = 1/2.17 + 1/3.91 + 1/3.25
//        = 0.461 + 0.256 + 0.308
//        = 1.025 (102.5%)
// Маржа Pinnacle = 2.5% (типично для 1X2)
//
// ПОЧЕМУ УМНОЖАЕМ НА MARGIN:
// TrueKoef = PinnacleOdd × Margin
//          = 2.17 × 1.025 = 2.22
// Мы "убираем" маржу, получая честный коэффициент для сравнения
//
// ЕСЛИ НЕТ ПРОТИВОПОЛОЖНЫХ ИСХОДОВ:
// Возвращаем def = 1.08 (умеренная маржа по умолчанию ~8%)
// 
// ВАЖНО: Реальная margin Pinnacle ЗАВИСИТ ОТ ТИПА РЫНКА:
// - Тоталы/Форы (2 исхода): 1.015-1.025 (~1.5-2.5%)
// - 1X2 (3 исхода): 1.020-1.030 (~2-3%)
// - Точный счет: 1.08-1.15 (~8-15%)
// Поэтому def=1.08 - это умеренное значение для fallback
// ============================================================
// getParallelOutcomeNames returns the names of parallel outcomes needed for margin
// calculation, WITHOUT the outcome itself. Uses the same naming logic as calculateMARGIN.
// Returns nil if no parallel names can be determined (unknown market structure).
func getParallelOutcomeNames(outcomeName string) []string {
	splitedName := strings.Fields(outcomeName)
	if len(splitedName) == 0 {
		return nil
	}

	var names []string
	switch len(splitedName) {
	case 1:
		switch outcomeName {
		case "1":
			names = []string{"2"}
		case "2":
			names = []string{"1"}
		case "X":
			// X is part of 1X2, but handled specially in calculateMARGIN
			return nil
		}
	case 2:
		switch splitedName[0] {
		case "T>":
			names = []string{fmt.Sprintf("T< %s", splitedName[1])}
		case "T<":
			names = []string{fmt.Sprintf("T> %s", splitedName[1])}
		case "H1":
			inverted := fmt.Sprintf("H2 %s", invertHandicapLine(splitedName[1]))
			names = []string{inverted}
		case "H2":
			inverted := fmt.Sprintf("H1 %s", invertHandicapLine(splitedName[1]))
			names = []string{inverted}
		case "ML":
			if splitedName[1] == "1" {
				names = []string{"ML 2"}
			} else {
				names = []string{"ML 1"}
			}
		}
	case 3:
		if splitedName[0] == "3WH" {
			switch splitedName[2] {
			case "1":
				names = []string{fmt.Sprintf("3WH %s X", splitedName[1]), fmt.Sprintf("3WH %s 2", splitedName[1])}
			case "X":
				names = []string{fmt.Sprintf("3WH %s 1", splitedName[1]), fmt.Sprintf("3WH %s 2", splitedName[1])}
			case "2":
				names = []string{fmt.Sprintf("3WH %s 1", splitedName[1]), fmt.Sprintf("3WH %s X", splitedName[1])}
			}
		} else {
			// Period/Sets prefixed outcomes: "P1 T> 2.5", "Sets H2 2.5", etc.
			prefix := splitedName[0]
			line := splitedName[2]
			switch splitedName[1] {
			case "T>":
				names = []string{fmt.Sprintf("%s T< %s", prefix, line)}
			case "T<":
				names = []string{fmt.Sprintf("%s T> %s", prefix, line)}
			case "H1":
				names = []string{fmt.Sprintf("%s H2 %s", prefix, invertHandicapLine(line))}
			case "H2":
				names = []string{fmt.Sprintf("%s H1 %s", prefix, invertHandicapLine(line))}
			case "IT1>":
				names = []string{fmt.Sprintf("%s IT1< %s", prefix, line)}
			case "IT1<":
				names = []string{fmt.Sprintf("%s IT1> %s", prefix, line)}
			case "IT2>":
				names = []string{fmt.Sprintf("%s IT2< %s", prefix, line)}
			case "IT2<":
				names = []string{fmt.Sprintf("%s IT2> %s", prefix, line)}
			case "CH1":
				names = []string{fmt.Sprintf("%s CH2 %s", prefix, invertHandicapLine(line))}
			case "CH2":
				names = []string{fmt.Sprintf("%s CH1 %s", prefix, invertHandicapLine(line))}
			case "CT>":
				names = []string{fmt.Sprintf("%s CT< %s", prefix, line)}
			case "CT<":
				names = []string{fmt.Sprintf("%s CT> %s", prefix, line)}
			case "CIT1>":
				names = []string{fmt.Sprintf("%s CIT1< %s", prefix, line)}
			case "CIT1<":
				names = []string{fmt.Sprintf("%s CIT1> %s", prefix, line)}
			case "CIT2>":
				names = []string{fmt.Sprintf("%s CIT2< %s", prefix, line)}
			case "CIT2<":
				names = []string{fmt.Sprintf("%s CIT2> %s", prefix, line)}
			case "BkH1":
				names = []string{fmt.Sprintf("%s BkH2 %s", prefix, invertHandicapLine(line))}
			case "BkH2":
				names = []string{fmt.Sprintf("%s BkH1 %s", prefix, invertHandicapLine(line))}
			case "BkT>":
				names = []string{fmt.Sprintf("%s BkT< %s", prefix, line)}
			case "BkT<":
				names = []string{fmt.Sprintf("%s BkT> %s", prefix, line)}
			case "BkIT1>":
				names = []string{fmt.Sprintf("%s BkIT1< %s", prefix, line)}
			case "BkIT1<":
				names = []string{fmt.Sprintf("%s BkIT1> %s", prefix, line)}
			case "BkIT2>":
				names = []string{fmt.Sprintf("%s BkIT2< %s", prefix, line)}
			case "BkIT2<":
				names = []string{fmt.Sprintf("%s BkIT2> %s", prefix, line)}
			case "ML":
				if line == "1" {
					names = []string{fmt.Sprintf("%s ML 2", prefix)}
				} else if line == "2" {
					names = []string{fmt.Sprintf("%s ML 1", prefix)}
				}
			case "BTTS":
				if line == "Yes" {
					names = []string{fmt.Sprintf("%s BTTS No", prefix)}
				} else if line == "No" {
					names = []string{fmt.Sprintf("%s BTTS Yes", prefix)}
				}
			case "OE":
				if line == "Odd" {
					names = []string{fmt.Sprintf("%s OE Even", prefix)}
				} else if line == "Even" {
					names = []string{fmt.Sprintf("%s OE Odd", prefix)}
				}
			case "1G":
				names = []string{fmt.Sprintf("%s 2G %s", prefix, line)}
			case "2G":
				names = []string{fmt.Sprintf("%s 1G %s", prefix, line)}
			}
		}
	case 4:
		if splitedName[1] == "3WH" {
			prefix := splitedName[0]
			line := splitedName[2]
			switch splitedName[3] {
			case "1":
				names = []string{fmt.Sprintf("%s 3WH %s X", prefix, line), fmt.Sprintf("%s 3WH %s 2", prefix, line)}
			case "X":
				names = []string{fmt.Sprintf("%s 3WH %s 1", prefix, line), fmt.Sprintf("%s 3WH %s 2", prefix, line)}
			case "2":
				names = []string{fmt.Sprintf("%s 3WH %s 1", prefix, line), fmt.Sprintf("%s 3WH %s X", prefix, line)}
			}
		}
	}
	return names
}

func isAsyncOddEvenOutcomeName(outcomeName string) bool {
	parts := strings.Fields(outcomeName)
	if len(parts) == 2 {
		return parts[0] == "OE" || parts[0] == "HOE" || parts[0] == "AOE"
	}
	if len(parts) == 3 {
		return parts[1] == "OE" || parts[1] == "HOE" || parts[1] == "AOE"
	}
	return false
}

func calculateMARGIN(outcomeName string, outcomes map[string]entity.OddsWithMarket) float64 {
	def := 1.10 // Маржа по умолчанию (~10%) для props/specials

	// Проверяем Mixed флаг у текущего исхода (Pinnacle коэф)
	// Если Mixed=true, значит цена была перезаписана из другого источника
	// и нельзя использовать пару Over/Under для расчёта маржи
	if outcome, ok := outcomes[outcomeName]; ok && outcome.Odds[1].Mixed {
		return def
	}

	// Линия 0.5 для тоталов (T, IT1, IT2) - фиксированная маржа 10%
	// Эта линия конвертируется из множества рынков (TeamTotal, HomeTeamToScore, 
	// FirstTeamToScore, ExactGoals и т.д.) и данные часто из разных источников
	// Форматы: "IT1> 0.5", "P1 IT1> 0.5", "T> 0.5", "P1 T> 0.5"
	if strings.HasSuffix(outcomeName, " 0.5") {
		if strings.Contains(outcomeName, "T>") || strings.Contains(outcomeName, "T<") ||
			strings.Contains(outcomeName, "IT1>") || strings.Contains(outcomeName, "IT1<") ||
			strings.Contains(outcomeName, "IT2>") || strings.Contains(outcomeName, "IT2<") {
			return def
		}
	}

	// Correct Score — маржа 15% (рынок не замкнут, нет "Other Score")
	if strings.Contains(outcomeName, "CS ") {
		return 1.15
	}

	// MULTIWAY markets - фиксированная маржа 1.10 (нельзя посчитать из двух исходов)
	// Это рынки с 3+ исходами где мы не можем найти все противоположные
	// NOTE: HWN, AWN, FTS removed from multiwayKeywords — they have dedicated case handlers
	// in the switch below that compute proper 2-way/3-way margins. Keeping them here
	// would bypass those handlers and return incorrect hardcoded 1.10 margin.
	multiwayKeywords := []string{
		"PP ",                                  // Player Props (нет противоположного в данных)
		"HT/FT ",                               // Half-Time/Full-Time (multiway)
		"WM ",                                  // Winning Margin (multiway)
		"TGR ",                                 // Total Goals Range (multiway)
		"ETG ",                                 // Exact Total Goals (multiway)
		"HEG ",                                 // Home Exact Goals (multiway)
		"AEG ",                                 // Away Exact Goals (multiway)
		"MOV ",                                 // Method Of Victory (multiway)
		"WTC ",                                 // Winner/Total Combo (multiway)
		"BWC ",                                 // BTTS/Winner Combo (multiway)
		"BTC ",                                 // BTTS/Total Combo (multiway)
		"OET ",                                 // Odd/Even Total Combo (multiway)
	}
	for _, keyword := range multiwayKeywords {
		if strings.Contains(outcomeName, keyword) {
			return 1.10
		}
	}

	// Odd/Even specials come from MORE_BET and can refresh one side at a time.
	// Using transient opposite prices here produces impossible underrounds.
	if isAsyncOddEvenOutcomeName(outcomeName) {
		return def
	}

	// Standalone special markets (DNB, DC, 3WH) — margin from specials is unreliable.
	// These markets update asynchronously from standard odds; two sides can reflect
	// different score states, producing margin < 1.0 (impossible at any real bookmaker).
	specialPrefixes := []string{"DNB ", "DC ", "3WH "}
	for _, sp := range specialPrefixes {
		if strings.HasPrefix(outcomeName, sp) {
			return def
		}
	}

	// Находим ВСЕ противоположные исходы для расчета полной маржи рынка
	// Например: для Win1 нужны также Draw и Win2 (все исходы 1X2)
	parallelOdds := []float64{}
	paralelNames := []string{outcomeName}

	splitedName := strings.Split(outcomeName, " ")

	switch len(splitedName) {
	case 1: // Простые исходы типа "1", "X", "2"
		// Для 1X2 нужны все три исхода для расчета маржи рынка
		names := []string{
			"1", "X", "2",
		}
		for _, name := range names {
			if name != paralelNames[0] {
				paralelNames = append(paralelNames, name)
			}
		}
	case 2: // Исходы с параметром типа "T> 2.5", "H1 -4.5", "BTTS Yes", "OE Odd", etc.
		switch splitedName[0] {
		// === TOTALS (двухисходные: Over/Under) ===
		case "T>":
			paralelNames = append(paralelNames, fmt.Sprintf("T< %s", splitedName[1]))
		case "T<":
			paralelNames = append(paralelNames, fmt.Sprintf("T> %s", splitedName[1]))
		case "IT1>":
			paralelNames = append(paralelNames, fmt.Sprintf("IT1< %s", splitedName[1]))
		case "IT1<":
			paralelNames = append(paralelNames, fmt.Sprintf("IT1> %s", splitedName[1]))
		case "IT2>":
			paralelNames = append(paralelNames, fmt.Sprintf("IT2< %s", splitedName[1]))
		case "IT2<":
			paralelNames = append(paralelNames, fmt.Sprintf("IT2> %s", splitedName[1]))
		// === MONEYLINE (двухисходный: ML 1 ↔ ML 2, Tennis/TableTennis) ===
		case "ML":
			if splitedName[1] == "1" {
				paralelNames = append(paralelNames, "ML 2")
			} else if splitedName[1] == "2" {
				paralelNames = append(paralelNames, "ML 1")
			}
		// === HANDICAPS (двухисходные: H1/H2) ===
		// PS3838 кладёт Win1 в home_line=-hdp, Win2 в away_line=hdp (РАЗНЫЕ ключи).
		// При двух записях (hdp=+X и hdp=-X) оба Win1 и Win2 попадают в один ключ,
		// но из РАЗНЫХ спред-записей. Комплемент: H1 X ↔ H2 (-X) (одна запись).
		// Для монейлайн-эквивалентов (H1/H2 -0.5 из Win1x2) инвертированный ключ
		// может отсутствовать → fallback к H1 X ↔ H2 X ТОЛЬКО для -0.5/0
		// (2-way moneyline/DNB). Для остальных линий H1 -N и H2 -N — это РАЗНЫЕ
		// рынки (оба могут проиграть), fallback к sameName даёт margin < 1.0.
		case "H1":
			inverted := invertHandicapLine(splitedName[1])
			invertedName := fmt.Sprintf("H2 %s", inverted)
			sameName := fmt.Sprintf("H2 %s", splitedName[1])
			if splitedName[1] == "-0.5" || splitedName[1] == "0" || splitedName[1] == "0.5" {
				// H1 -0.5 = moneyline equivalent (Win1). Complement is H2 -0.5 (Win2).
				// H2 +0.5 may exist as a DIFFERENT market (real game spread with wrong price).
				// ALWAYS prefer sameName for -0.5/0 to avoid cross-market contamination.
				paralelNames = append(paralelNames, sameName)
				// 3-way (soccer): H1(-0.5) + X + H2(-0.5) = complete 1X2 market
				if splitedName[1] == "-0.5" {
					if _, ok := outcomes["X"]; ok {
						paralelNames = append(paralelNames, "X")
					} else {
						// X/Draw missing: Win1x2 (3-way) prices in 2-way = margin < 1.0
						return def
					}
				}
				if splitedName[1] == "0.5" {
					// H ±0.5: complement has Win1x2 StdOdd override, margin unreliable
					return def
				}
			} else if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
			// else: no complement found -> paralelNames stays len 1 -> returns def
		case "H2":
			inverted := invertHandicapLine(splitedName[1])
			invertedName := fmt.Sprintf("H1 %s", inverted)
			sameName := fmt.Sprintf("H1 %s", splitedName[1])
			if splitedName[1] == "-0.5" || splitedName[1] == "0" || splitedName[1] == "0.5" {
				// H2 -0.5 = moneyline equivalent (Win2). Complement is H1 -0.5 (Win1).
				// H1 +0.5 may exist as a DIFFERENT market (real game spread with wrong price).
				// ALWAYS prefer sameName for -0.5/0 to avoid cross-market contamination.
				paralelNames = append(paralelNames, sameName)
				// 3-way (soccer): H1(-0.5) + X + H2(-0.5) = complete 1X2 market
				if splitedName[1] == "-0.5" {
					if _, ok := outcomes["X"]; ok {
						paralelNames = append(paralelNames, "X")
					} else {
						// X/Draw missing: Win1x2 (3-way) prices in 2-way = margin < 1.0
						return def
					}
				}
				if splitedName[1] == "0.5" {
					// H ±0.5: complement has Win1x2 StdOdd override, margin unreliable
					return def
				}
			} else if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		// === CORNERS TOTALS (двухисходные: Over/Under) ===
		case "CT>":
			paralelNames = append(paralelNames, fmt.Sprintf("CT< %s", splitedName[1]))
		case "CT<":
			paralelNames = append(paralelNames, fmt.Sprintf("CT> %s", splitedName[1]))
		case "CIT1>":
			paralelNames = append(paralelNames, fmt.Sprintf("CIT1< %s", splitedName[1]))
		case "CIT1<":
			paralelNames = append(paralelNames, fmt.Sprintf("CIT1> %s", splitedName[1]))
		case "CIT2>":
			paralelNames = append(paralelNames, fmt.Sprintf("CIT2< %s", splitedName[1]))
		case "CIT2<":
			paralelNames = append(paralelNames, fmt.Sprintf("CIT2> %s", splitedName[1]))
		// === CORNERS HANDICAPS (двухисходные: CH1/CH2) ===
		case "CH1":
			invertedName := fmt.Sprintf("CH2 %s", invertHandicapLine(splitedName[1]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		case "CH2":
			invertedName := fmt.Sprintf("CH1 %s", invertHandicapLine(splitedName[1]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		// === BOOKINGS TOTALS (двухисходные: Over/Under) ===
		case "BkT>":
			paralelNames = append(paralelNames, fmt.Sprintf("BkT< %s", splitedName[1]))
		case "BkT<":
			paralelNames = append(paralelNames, fmt.Sprintf("BkT> %s", splitedName[1]))
		case "BkIT1>":
			paralelNames = append(paralelNames, fmt.Sprintf("BkIT1< %s", splitedName[1]))
		case "BkIT1<":
			paralelNames = append(paralelNames, fmt.Sprintf("BkIT1> %s", splitedName[1]))
		case "BkIT2>":
			paralelNames = append(paralelNames, fmt.Sprintf("BkIT2< %s", splitedName[1]))
		case "BkIT2<":
			paralelNames = append(paralelNames, fmt.Sprintf("BkIT2> %s", splitedName[1]))
		// === BOOKINGS HANDICAPS (двухисходные: BkH1/BkH2) ===
		case "BkH1":
			invertedName := fmt.Sprintf("BkH2 %s", invertHandicapLine(splitedName[1]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		case "BkH2":
			invertedName := fmt.Sprintf("BkH1 %s", invertHandicapLine(splitedName[1]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		// === BTTS (двухисходный: Yes/No) ===
		case "BTTS":
			if splitedName[1] == "Yes" {
				paralelNames = append(paralelNames, "BTTS No")
			} else if splitedName[1] == "No" {
				paralelNames = append(paralelNames, "BTTS Yes")
			}
		// === ODD/EVEN (двухисходный: Odd/Even) ===
		case "OE":
			if splitedName[1] == "Odd" {
				paralelNames = append(paralelNames, "OE Even")
			} else if splitedName[1] == "Even" {
				paralelNames = append(paralelNames, "OE Odd")
			}
		// === HOME ODD/EVEN (двухисходный: Odd/Even) ===
		case "HOE":
			if splitedName[1] == "Odd" {
				paralelNames = append(paralelNames, "HOE Even")
			} else if splitedName[1] == "Even" {
				paralelNames = append(paralelNames, "HOE Odd")
			}
		// === AWAY ODD/EVEN (двухисходный: Odd/Even) ===
		case "AOE":
			if splitedName[1] == "Odd" {
				paralelNames = append(paralelNames, "AOE Even")
			} else if splitedName[1] == "Even" {
				paralelNames = append(paralelNames, "AOE Odd")
			}
		// === DOUBLE CHANCE (трехисходный: 1X, X2, 12) ===
		case "DC":
			switch splitedName[1] {
			case "1X":
				paralelNames = append(paralelNames, "DC X2", "DC 12")
			case "X2":
				paralelNames = append(paralelNames, "DC 1X", "DC 12")
			case "12":
				paralelNames = append(paralelNames, "DC 1X", "DC X2")
			}
		// === TO QUALIFY (двухисходный: Home/Away) ===
		case "TQ":
			if splitedName[1] == "Home" {
				paralelNames = append(paralelNames, "TQ Away")
			} else if splitedName[1] == "Away" {
				paralelNames = append(paralelNames, "TQ Home")
			}
		// === HOME TEAM TO SCORE (двухисходный: Yes/No) ===
		case "HTS":
			if splitedName[1] == "Yes" {
				paralelNames = append(paralelNames, "HTS No")
			} else if splitedName[1] == "No" {
				paralelNames = append(paralelNames, "HTS Yes")
			}
		// === AWAY TEAM TO SCORE (двухисходный: Yes/No) ===
		case "ATS":
			if splitedName[1] == "Yes" {
				paralelNames = append(paralelNames, "ATS No")
			} else if splitedName[1] == "No" {
				paralelNames = append(paralelNames, "ATS Yes")
			}
		// === HOME WIN TO NIL (двухисходный: Yes/No) ===
		case "HWN":
			if splitedName[1] == "Yes" {
				paralelNames = append(paralelNames, "HWN No")
			} else if splitedName[1] == "No" {
				paralelNames = append(paralelNames, "HWN Yes")
			}
		// === AWAY WIN TO NIL (двухисходный: Yes/No) ===
		case "AWN":
			if splitedName[1] == "Yes" {
				paralelNames = append(paralelNames, "AWN No")
			} else if splitedName[1] == "No" {
				paralelNames = append(paralelNames, "AWN Yes")
			}
		// === EITHER TEAM TO SCORE (двухисходный: Yes/No) ===
		case "ETS":
			if splitedName[1] == "Yes" {
				paralelNames = append(paralelNames, "ETS No")
			} else if splitedName[1] == "No" {
				paralelNames = append(paralelNames, "ETS Yes")
			}
		// === DRAW NO BET (двухисходный: 1/2) ===
		case "DNB":
			if splitedName[1] == "1" {
				paralelNames = append(paralelNames, "DNB 2")
			} else if splitedName[1] == "2" {
				paralelNames = append(paralelNames, "DNB 1")
			}
		// === FIRST TEAM TO SCORE (трехисходный: Home/Away/Neither) ===
		case "FTS":
			switch splitedName[1] {
			case "Home":
				paralelNames = append(paralelNames, "FTS Away", "FTS Neither")
			case "Away":
				paralelNames = append(paralelNames, "FTS Home", "FTS Neither")
			case "Neither":
				paralelNames = append(paralelNames, "FTS Home", "FTS Away")
			}
		// === PERIOD 1X2 (трехисходный: P4 1, P4 X, P4 2) - для Hockey Regulation Time ===
		default:
			// Check if splitedName[0] is a period prefix (P1, P2, P3, P4, etc.)
			if len(splitedName[0]) >= 2 && splitedName[0][0] == 'P' {
				prefix := splitedName[0]
				switch splitedName[1] {
				case "1":
					paralelNames = append(paralelNames, fmt.Sprintf("%s X", prefix), fmt.Sprintf("%s 2", prefix))
				case "X":
					paralelNames = append(paralelNames, fmt.Sprintf("%s 1", prefix), fmt.Sprintf("%s 2", prefix))
				case "2":
					paralelNames = append(paralelNames, fmt.Sprintf("%s 1", prefix), fmt.Sprintf("%s X", prefix))
				}
			}
		}
	case 3: // "P1 T> 2.5", "Sets T> 2.5", "P1 BTTS Yes", "3WH -1 1", etc.
		if splitedName[0] == "3WH" {
			// Three-Way Handicap: 3WH {line} 1/X/2
			switch splitedName[2] {
			case "1":
				paralelNames = append(paralelNames, fmt.Sprintf("3WH %s X", splitedName[1]), fmt.Sprintf("3WH %s 2", splitedName[1]))
			case "X":
				paralelNames = append(paralelNames, fmt.Sprintf("3WH %s 1", splitedName[1]), fmt.Sprintf("3WH %s 2", splitedName[1]))
			case "2":
				paralelNames = append(paralelNames, fmt.Sprintf("3WH %s 1", splitedName[1]), fmt.Sprintf("3WH %s X", splitedName[1]))
			}
		} else {
			switch splitedName[1] {


		// === PERIOD/SETS TOTALS ===
		case "T>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s T< %s", splitedName[0], splitedName[2]))
		case "T<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s T> %s", splitedName[0], splitedName[2]))
		case "IT1>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s IT1< %s", splitedName[0], splitedName[2]))
		case "IT1<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s IT1> %s", splitedName[0], splitedName[2]))
		case "IT2>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s IT2< %s", splitedName[0], splitedName[2]))
		case "IT2<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s IT2> %s", splitedName[0], splitedName[2]))
		// === PERIOD/SETS HANDICAPS ===
		case "H1":
			invertedName := fmt.Sprintf("%s H2 %s", splitedName[0], invertHandicapLine(splitedName[2]))
			sameName := fmt.Sprintf("%s H2 %s", splitedName[0], splitedName[2])
			if splitedName[2] == "-0.5" || splitedName[2] == "0" || splitedName[2] == "0.5" {
				// Moneyline equivalent: prefer sameName to avoid cross-market contamination
				paralelNames = append(paralelNames, sameName)
				if splitedName[2] == "-0.5" {
					xKey := fmt.Sprintf("%s X", splitedName[0])
					if _, ok := outcomes[xKey]; ok {
						paralelNames = append(paralelNames, xKey)
					} else {
						// X/Draw missing: Win1x2 (3-way) prices in 2-way = margin < 1.0
						return def
					}
				}
				if splitedName[2] == "0.5" {
					// H ±0.5: complement has Win1x2 StdOdd override, margin unreliable
					return def
				}
			} else if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		case "H2":
			invertedName := fmt.Sprintf("%s H1 %s", splitedName[0], invertHandicapLine(splitedName[2]))
			sameName := fmt.Sprintf("%s H1 %s", splitedName[0], splitedName[2])
			if splitedName[2] == "-0.5" || splitedName[2] == "0" || splitedName[2] == "0.5" {
				// Moneyline equivalent: prefer sameName to avoid cross-market contamination
				paralelNames = append(paralelNames, sameName)
				if splitedName[2] == "-0.5" {
					xKey := fmt.Sprintf("%s X", splitedName[0])
					if _, ok := outcomes[xKey]; ok {
						paralelNames = append(paralelNames, xKey)
					} else {
						// X/Draw missing: Win1x2 (3-way) prices in 2-way = margin < 1.0
						return def
					}
				}
				if splitedName[2] == "0.5" {
					// H ±0.5: complement has Win1x2 StdOdd override, margin unreliable
					return def
				}
			} else if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		// === PERIOD GAMES (двухисходный: 1G/2G) ===
		case "1G":
			paralelNames = append(paralelNames, fmt.Sprintf("%s 2G %s", splitedName[0], splitedName[2]))
		case "2G":
			paralelNames = append(paralelNames, fmt.Sprintf("%s 1G %s", splitedName[0], splitedName[2]))
		// === PERIOD CORNERS TOTALS ===
		case "CT>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s CT< %s", splitedName[0], splitedName[2]))
		case "CT<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s CT> %s", splitedName[0], splitedName[2]))
		case "CIT1>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s CIT1< %s", splitedName[0], splitedName[2]))
		case "CIT1<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s CIT1> %s", splitedName[0], splitedName[2]))
		case "CIT2>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s CIT2< %s", splitedName[0], splitedName[2]))
		case "CIT2<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s CIT2> %s", splitedName[0], splitedName[2]))
		// === PERIOD CORNERS HANDICAPS ===
		case "CH1":
			invertedName := fmt.Sprintf("%s CH2 %s", splitedName[0], invertHandicapLine(splitedName[2]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		case "CH2":
			invertedName := fmt.Sprintf("%s CH1 %s", splitedName[0], invertHandicapLine(splitedName[2]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		// === PERIOD BOOKINGS TOTALS ===
		case "BkT>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s BkT< %s", splitedName[0], splitedName[2]))
		case "BkT<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s BkT> %s", splitedName[0], splitedName[2]))
		case "BkIT1>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s BkIT1< %s", splitedName[0], splitedName[2]))
		case "BkIT1<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s BkIT1> %s", splitedName[0], splitedName[2]))
		case "BkIT2>":
			paralelNames = append(paralelNames, fmt.Sprintf("%s BkIT2< %s", splitedName[0], splitedName[2]))
		case "BkIT2<":
			paralelNames = append(paralelNames, fmt.Sprintf("%s BkIT2> %s", splitedName[0], splitedName[2]))
		// === PERIOD BOOKINGS HANDICAPS ===
		case "BkH1":
			invertedName := fmt.Sprintf("%s BkH2 %s", splitedName[0], invertHandicapLine(splitedName[2]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		case "BkH2":
			invertedName := fmt.Sprintf("%s BkH1 %s", splitedName[0], invertHandicapLine(splitedName[2]))
			if _, ok := outcomes[invertedName]; ok {
				paralelNames = append(paralelNames, invertedName)
			}
		// === PERIOD BTTS (двухисходный: Yes/No) ===
		case "BTTS":
			if splitedName[2] == "Yes" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s BTTS No", splitedName[0]))
			} else if splitedName[2] == "No" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s BTTS Yes", splitedName[0]))
			}
		// === PERIOD ODD/EVEN (двухисходный: Odd/Even) ===
		case "OE":
			if splitedName[2] == "Odd" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s OE Even", splitedName[0]))
			} else if splitedName[2] == "Even" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s OE Odd", splitedName[0]))
			}
		// === PERIOD HOME ODD/EVEN (двухисходный: Odd/Even) ===
		case "HOE":
			if splitedName[2] == "Odd" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s HOE Even", splitedName[0]))
			} else if splitedName[2] == "Even" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s HOE Odd", splitedName[0]))
			}
		// === PERIOD AWAY ODD/EVEN (двухисходный: Odd/Even) ===
		case "AOE":
			if splitedName[2] == "Odd" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s AOE Even", splitedName[0]))
			} else if splitedName[2] == "Even" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s AOE Odd", splitedName[0]))
			}
		// === PERIOD DOUBLE CHANCE (трехисходный: 1X, X2, 12) ===
		case "DC":
			switch splitedName[2] {
			case "1X":
				paralelNames = append(paralelNames, fmt.Sprintf("%s DC X2", splitedName[0]), fmt.Sprintf("%s DC 12", splitedName[0]))
			case "X2":
				paralelNames = append(paralelNames, fmt.Sprintf("%s DC 1X", splitedName[0]), fmt.Sprintf("%s DC 12", splitedName[0]))
			case "12":
				paralelNames = append(paralelNames, fmt.Sprintf("%s DC 1X", splitedName[0]), fmt.Sprintf("%s DC X2", splitedName[0]))
			}
		// === PERIOD TO QUALIFY (двухисходный: Home/Away) ===
		case "TQ":
			if splitedName[2] == "Home" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s TQ Away", splitedName[0]))
			} else if splitedName[2] == "Away" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s TQ Home", splitedName[0]))
			}
		// === PERIOD FIRST TEAM TO SCORE (трехисходный: Home/Away/Neither) ===
		case "FTS":
			switch splitedName[2] {
			case "Home":
				paralelNames = append(paralelNames, fmt.Sprintf("%s FTS Away", splitedName[0]), fmt.Sprintf("%s FTS Neither", splitedName[0]))
			case "Away":
				paralelNames = append(paralelNames, fmt.Sprintf("%s FTS Home", splitedName[0]), fmt.Sprintf("%s FTS Neither", splitedName[0]))
			case "Neither":
				paralelNames = append(paralelNames, fmt.Sprintf("%s FTS Home", splitedName[0]), fmt.Sprintf("%s FTS Away", splitedName[0]))
			}
		// === PERIOD HOME TEAM TO SCORE (двухисходный: Yes/No) ===
		case "HTS":
			if splitedName[2] == "Yes" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s HTS No", splitedName[0]))
			} else if splitedName[2] == "No" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s HTS Yes", splitedName[0]))
			}
		// === PERIOD AWAY TEAM TO SCORE (двухисходный: Yes/No) ===
		case "ATS":
			if splitedName[2] == "Yes" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s ATS No", splitedName[0]))
			} else if splitedName[2] == "No" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s ATS Yes", splitedName[0]))
			}
		// === PERIOD HOME WIN TO NIL (двухисходный: Yes/No) ===
		case "HWN":
			if splitedName[2] == "Yes" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s HWN No", splitedName[0]))
			} else if splitedName[2] == "No" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s HWN Yes", splitedName[0]))
			}
		// === PERIOD AWAY WIN TO NIL (двухисходный: Yes/No) ===
		case "AWN":
			if splitedName[2] == "Yes" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s AWN No", splitedName[0]))
			} else if splitedName[2] == "No" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s AWN Yes", splitedName[0]))
			}
		// === PERIOD EITHER TEAM TO SCORE (двухисходный: Yes/No) ===
		case "ETS":
			if splitedName[2] == "Yes" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s ETS No", splitedName[0]))
			} else if splitedName[2] == "No" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s ETS Yes", splitedName[0]))
			}
		// === PERIOD DRAW NO BET (двухисходный: 1/2) ===
		case "DNB":
			if splitedName[2] == "1" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s DNB 2", splitedName[0]))
			} else if splitedName[2] == "2" {
				paralelNames = append(paralelNames, fmt.Sprintf("%s DNB 1", splitedName[0]))
			}
		}
		}
	case 4: // "P1 3WH -1 1", "Sets 3WH +0 X" — period-prefixed Three-Way Handicap
		if splitedName[1] == "3WH" {
			prefix := splitedName[0] // P1, P2, Sets, etc.
			line := splitedName[2]   // -1, +0, +1, etc.
			switch splitedName[3] {
			case "1":
				paralelNames = append(paralelNames, fmt.Sprintf("%s 3WH %s X", prefix, line), fmt.Sprintf("%s 3WH %s 2", prefix, line))
			case "X":
				paralelNames = append(paralelNames, fmt.Sprintf("%s 3WH %s 1", prefix, line), fmt.Sprintf("%s 3WH %s 2", prefix, line))
			case "2":
				paralelNames = append(paralelNames, fmt.Sprintf("%s 3WH %s 1", prefix, line), fmt.Sprintf("%s 3WH %s X", prefix, line))
			}
		}
	}

	// ЗАЩИТА: если противоположный исход не был добавлен в switch-case,
	// paralelNames содержит только текущий исход → возвращаем def
	// Это предотвращает расчет маржи из одного коэффициента (что даёт sum < 1.0)
	if len(paralelNames) == 1 {
		log.Printf("[MARGIN_NO_OPPOSITE] outcome=%s - не найден case в switch, возвращаем def=%.2f", 
			outcomeName, def)
		return def
	}

	// Собираем коэффициенты от Pinnacle для ВСЕХ найденных исходов
	for _, paparalelName := range paralelNames {
		odds, ok := outcomes[paparalelName]
		if ok {
			parallelOdds = append(parallelOdds, odds.Odds[1].Value) // PINNACLE = индекс 1
		} else {
			// Если не нашли хотя бы один исход → не можем посчитать полную маржу
			return def // возвращаем маржу по умолчанию
		}
	}

	// РАСЧЕТ MARGIN = сумма обратных коэффициентов
	// Пример: 1/2.17 + 1/3.91 + 1/3.25 = 1.025
	sum := 0.0
	for _, odd := range parallelOdds {
		if odd != 0 {
			sum += 1.0 / odd
		} else {
			// Если коэффициент = 0 → некорректные данные
			return def
		}
	}

	// DEBUG: log ALL outcomes with suspicious margin (< 1.0)
	if sum < 1.0 {
		var namesStr, oddsStr string
		for i, n := range paralelNames {
			if i > 0 {
				namesStr += ", "
				oddsStr += ", "
			}
			namesStr += n
			oddsStr += fmt.Sprintf("%.3f", parallelOdds[i])
		}
		log.Printf("[MARGIN_DEBUG] outcome=%s margin=%.4f names=[%s] odds=[%s]", outcomeName, sum, namesStr, oddsStr)
	}

	// No clamp here — return actual margin value.
	// Caller (calculateAndFilterCommonOutcomes) handles margin < 1.0:
	// clamps to safe value + sends Telegram alert.
	if sum < 1.0 {
		log.Printf("[MARGIN_SAFETY] outcome=%s margin=%.4f < 1.0",
			outcomeName, sum)
	}

	return sum
}

// ============================================================
// calculateLowOddsROI calculates ROI for low odds (Pinnacle < 1.3)
// Simplified formula: ROI = (DonorOdd / (PinnacleOdd × Margin) - 1) × 100 - 1
func calculateLowOddsROI(donorOdd, pinnacleOdd, margin float64) float64 {
	trueKoef := pinnacleOdd * margin
	// Intentional -1pp penalty for low-odds bets (conservative bias by design — Vovka approved)
	return (donorOdd/trueKoef - 1) * 100 - 1
}

// calculateMARGINv2 calculates margin correctly for cross-market outcomes.
// When outcome maps to a different canonical key (e.g. "1" → "H1 -0.5"),
// it builds a canonical-keyed map and calculates margin for the standard line
// (e.g. H1 -0.5 / H2 0.5) instead of the original market (1X2: 1/X/2).
// This avoids mixing prices from different market structures.
func calculateMARGINv2(outcomeName string, outcomes map[string]OddsWithMarketV2, pinnacleAllOdds map[string]PinnacleOddEntry, donor, sport string) float64 {
	val, ok := outcomes[outcomeName]
	if !ok {
		return 1.10
	}

	// Build Pinnacle-only map from ALL Pinnacle canonical StdOdds (not just common with donor).
	// This ensures margin is always calculated from FULL Pinnacle data.
	// Example: Basketball period 3-way (H1 -0.5 / X / H2 -0.5) — even if donor
	// does not offer X, Pinnacle's X price is still used for correct 3-way margin.
	pinnacleMap := make(map[string]entity.OddsWithMarket, len(pinnacleAllOdds))
	for key, entry := range pinnacleAllOdds {
		pinnacleMap[key] = entity.OddsWithMarket{
			Odds: [2]entity.Odd{{}, {Value: entry.Value}},
		}
	}
	// Synthesized outcomes (CanonicalKey != outcomeName) use def margin.
	// Their prices come from StdOdd overrides (e.g. Win1x2 -> H -0.5) which mix
	// 3-way and 2-way vig, making margin calculation unreliable.
	if val.CanonicalKey != "" && val.CanonicalKey != outcomeName {
		return 1.10
	}

	// Check if the outcome itself is native (not a source remap from a different market).
	// Non-native source keys (e.g. "3WH +1 1" remapped from "H1 +0.5") carry prices
	// from a different market structure, making margin calculation invalid.
	if entry, ok := pinnacleAllOdds[outcomeName]; ok && !entry.IsNative {
		return 1.10
	}

	// Check that ALL parallel outcomes needed for margin are native.
	// If any parallel outcome is a cross-market remap, the margin formula
	// (sum of 1/odds) would mix prices from different market structures
	// with different built-in margins, producing invalid results.
	parallelKeys := getParallelOutcomeNames(outcomeName)
	for _, pk := range parallelKeys {
		if entry, ok := pinnacleAllOdds[pk]; !ok || !entry.IsNative {
			return 1.10
		}
	}

	margin := calculateMARGIN(outcomeName, pinnacleMap)

	// SAFETY NET: if margin < 1.0 even for native outcomes -> data issue, use def + alert
	if margin < 1.0 {
		log.Printf("[MARGIN<1_NATIVE] outcome=%s margin=%.4f - auto-corrected to 1.10 sport=%s bk=%s",
			outcomeName, margin, sport, donor)
		go alertMarginBelow1(outcomeName, margin, val, donor, sport)
		return 1.10
	}

	return margin
}

// РАСЧЕТ ROI И ФИЛЬТРАЦИЯ ПАР (основной поток)
// isLive: true for live, false for prematch (adjustmentFactor=1.0)
func (p *PairsMatchingService) calculateAndFilterCommonOutcomes(commonOutcomes map[string]OddsWithMarketV2, pinnacleAllOdds map[string]PinnacleOddEntry, secondBookmakerName, sportName string, isLive bool) []entity.Outcome {
	allOutcomes := make([]entity.Outcome, 0, len(commonOutcomes))

	for outcome, values := range commonOutcomes {
		margin := calculateMARGINv2(outcome, commonOutcomes, pinnacleAllOdds, secondBookmakerName, sportName)
		if margin < 1.0 {
			actualMargin := margin
			// Debug: log parallel outcomes' StdOdds to diagnose root cause
			log.Printf("[MARGIN<1_DEBUG] outcome=%s margin=%.4f canonKey=%s bestOdd=%.3f stdOdd=%.3f bestSrc=%s",
				outcome, margin, values.CanonicalKey, values.Odds[1].Value, values.PinnacleStdOdds, values.PinnacleBestSource)
			for k, v := range commonOutcomes {
				if k == "1" || k == "2" || k == "X" || k == outcome {
					log.Printf("[MARGIN<1_DEBUG]   parallel=%s canonKey=%s stdOdds=%.3f bestOdd=%.3f bestSrc=%s",
						k, v.CanonicalKey, v.PinnacleStdOdds, v.Odds[1].Value, v.PinnacleBestSource)
				}
			}
			margin = 1.10 // safety: prevent invalid negative-margin ROI
			go alertMarginBelow1(outcome, actualMargin, values, secondBookmakerName, sportName)
		}
		// A closed native market above 120% implied probability is a
		// structural-data signal (for example, outcomes mixed across periods).
		// Fail closed instead of turning it into an enormous false value.
		if margin > maxPinnacleReferenceMargin {
			log.Printf("[MARGIN>MAX_NATIVE] outcome=%s margin=%.4f > %.2f - skipped sport=%s bk=%s",
				outcome, margin, maxPinnacleReferenceMargin, sportName, secondBookmakerName)
			continue
		}
		roi := roicalc.CalculateROI(values.Odds[0].Value, values.Odds[1].Value, margin, values.MarketType, domain.Parser(secondBookmakerName), domain.SportName(sportName), isLive)
		o := entity.Outcome{
			Outcome:    outcome,
			ROI:        roi,
			Margin:     margin,
			Score1:     values.Odds[1], //PINNACLE
			Score2:     values.Odds[0],
			MarketType: values.MarketType,
		}
		if values.PinnacleBestSource != "" && values.PinnacleBestSource != outcome {
			o.PinnacleBestSource = values.PinnacleBestSource
		}
		if len(values.PinnacleSources) > 1 || (len(values.PinnacleSources) == 1 && values.PinnacleSources[0] != outcome) {
			o.PinnacleSources = values.PinnacleSources
		}
		if values.PinnacleStdOdds > 0 && values.PinnacleBestSource != outcome {
			o.PinnacleStdOdds = values.PinnacleStdOdds
		}
		allOutcomes = append(allOutcomes, o)
	}

	sort.Slice(allOutcomes, func(i, j int) bool {
		return allOutcomes[i].ROI > allOutcomes[j].ROI
	})

	return allOutcomes
}

// ============================================================
// TELEGRAM ALERT: margin < 1.0
// ============================================================
var (
	marginAlertMu       sync.Mutex
	marginAlertLastSent time.Time
	marginAlertToken    string
	marginAlertChatID   string
	marginAlertInitOnce sync.Once
)

func initMarginAlert() {
	marginAlertToken = os.Getenv("TG_ALERT_TOKEN")
	marginAlertChatID = os.Getenv("TG_ALERT_CHAT_ID")
}

func alertMarginBelow1(outcome string, margin float64, values OddsWithMarketV2, donor, sport string) {
	marginAlertInitOnce.Do(initMarginAlert)
	if marginAlertToken == "" || marginAlertChatID == "" {
		log.Printf("[MARGIN<1] outcome=%s margin=%.4f pin=%.3f donor=%.3f stdOdds=%.3f bestSrc=%s sport=%s donor_bk=%s (TG not configured)",
			outcome, margin, values.Odds[1].Value, values.Odds[0].Value, values.PinnacleStdOdds, values.PinnacleBestSource, sport, donor)
		return
	}

	marginAlertMu.Lock()
	if time.Since(marginAlertLastSent) < 60*time.Second {
		marginAlertMu.Unlock()
		return
	}
	marginAlertLastSent = time.Now()
	marginAlertMu.Unlock()

	text := fmt.Sprintf("🔴 MARGIN < 1.0\n\nOutcome: %s\nMargin: %.4f\nPinnacle: %.3f (std: %.3f)\nDonor: %.3f (%s)\nBestSource: %s\nSources: %v\nSport: %s",
		outcome, margin, values.Odds[1].Value, values.PinnacleStdOdds,
		values.Odds[0].Value, donor, values.PinnacleBestSource, values.PinnacleSources, sport)

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", marginAlertToken)
	resp, err := http.PostForm(apiURL, url.Values{
		"chat_id": {marginAlertChatID},
		"text":    {text},
	})
	if err != nil {
		log.Printf("[MARGIN<1] TG send error: %v", err)
		return
	}
	resp.Body.Close()
}

func alertSynthesizedMarginBelow1(outcome, canonicalKey string, margin float64, values OddsWithMarketV2, donor, sport string) {
	marginAlertInitOnce.Do(initMarginAlert)
	if marginAlertToken == "" || marginAlertChatID == "" {
		log.Printf("[MARGIN<1_SYNTH] outcome=%s canonKey=%s margin=%.4f pin=%.3f donor=%.3f sport=%s bk=%s (TG not configured)",
			outcome, canonicalKey, margin, values.Odds[1].Value, values.Odds[0].Value, sport, donor)
		return
	}

	marginAlertMu.Lock()
	if time.Since(marginAlertLastSent) < 60*time.Second {
		marginAlertMu.Unlock()
		return
	}
	marginAlertLastSent = time.Now()
	marginAlertMu.Unlock()

	text := fmt.Sprintf("🟠 MARGIN < 1.0 (SYNTHESIZED)\n\nOutcome: %s\nCanonical Key: %s\nCalculated Margin: %.4f\nAuto-corrected to: 1.10\nPinnacle: %.3f (std: %.3f)\nDonor: %.3f (%s)\nBestSource: %s\nSources: %v\nSport: %s",
		outcome, canonicalKey, margin, values.Odds[1].Value, values.PinnacleStdOdds,
		values.Odds[0].Value, donor, values.PinnacleBestSource, values.PinnacleSources, sport)

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", marginAlertToken)
	resp, err := http.PostForm(apiURL, url.Values{
		"chat_id": {marginAlertChatID},
		"text":    {text},
	})
	if err != nil {
		log.Printf("[MARGIN<1_SYNTH] TG send error: %v", err)
		return
	}
	resp.Body.Close()
}

// РАСЧЕТ ROI И ФИЛЬТРАЦИЯ ПАР (для low odds - Pinnacle < 1.3)
// Использует упрощенную формулу: ROI = (DonorOdd / (PinnacleOdd × Margin) - 1) × 100 - 1
func (p *PairsMatchingService) calculateAndFilterLowOddsOutcomes(commonOutcomes map[string]entity.OddsWithMarket, pinnacleAllOdds map[string]PinnacleOddEntry, secondBookmakerName, sportName string) []entity.Outcome {
	allOutcomes := make([]entity.Outcome, 0, len(commonOutcomes))

	// Use ALL Pinnacle StdOdds for margin (same as main path).
	// Fallback to commonOutcomes if pinnacleAllOdds not available (V2 disabled).
	marginMap := commonOutcomes
	if len(pinnacleAllOdds) > 0 {
		pinnacleMap := make(map[string]entity.OddsWithMarket, len(pinnacleAllOdds))
		for key, entry := range pinnacleAllOdds {
			pinnacleMap[key] = entity.OddsWithMarket{
				Odds: [2]entity.Odd{{}, {Value: entry.Value}},
			}
		}
		marginMap = pinnacleMap
	}

	for outcome, values := range commonOutcomes {
		margin := calculateMARGIN(outcome, marginMap)
		if margin < 1.0 {
			log.Printf("[MARGIN<1_LOW] outcome=%s margin=%.4f pin=%.3f donor=%.3f sport=%s bk=%s — clamping to 1.10",
				outcome, margin, values.Odds[1].Value, values.Odds[0].Value, sportName, secondBookmakerName)
			v2 := OddsWithMarketV2{
				MarketType: values.MarketType,
				Odds:       values.Odds,
			}
			go alertMarginBelow1(outcome, margin, v2, secondBookmakerName, sportName)
			margin = 1.10
		}
		if margin > maxPinnacleReferenceMargin {
			log.Printf("[MARGIN>MAX_LOW] outcome=%s margin=%.4f > %.2f - skipped sport=%s bk=%s",
				outcome, margin, maxPinnacleReferenceMargin, sportName, secondBookmakerName)
			continue
		}
		roi := calculateLowOddsROI(values.Odds[0].Value, values.Odds[1].Value, margin)
		allOutcomes = append(allOutcomes, entity.Outcome{
			Outcome:    outcome,
			ROI:        roi,
			Margin:     margin,
			Score1:     values.Odds[1], //PINNACLE
			Score2:     values.Odds[0],
			MarketType: values.MarketType,
		})
	}

	sort.Slice(allOutcomes, func(i, j int) bool {
		return allOutcomes[i].ROI > allOutcomes[j].ROI
	})

	return allOutcomes
}
