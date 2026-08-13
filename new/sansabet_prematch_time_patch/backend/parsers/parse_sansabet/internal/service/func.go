package service

import (
	"livebets/parse_sansabet/internal/entity"
	"math"
	"regexp"
	"strconv"
	"strings"
)

const (
	// Period indices
	PeriodMatch = 0

	// Football periods
	PeriodTime1 = 1
	PeriodTime2 = 2

	// Tennis periods
	PeriodSet1 = 1
	PeriodSet2 = 2
	PeriodSet3 = 3
	PeriodSet4 = 4
	PeriodSet5 = 5

	// Basketball periods
	PeriodQuarter1              = 1
	PeriodQuarter2              = 2
	PeriodQuarter3              = 3
	PeriodQuarter4              = 4
	PeriodHalf1                 = 5
	PeriodHalf2                 = 6
	PeriodBasketballRegulation  = 7 // Regulation (w/o OT) markets: 1x2, totals, handicap

	// Hockey periods
	PeriodHockeyP1         = 1
	PeriodHockeyP2         = 2
	PeriodHockeyP3         = 3
	PeriodHockeyRegulation = 4

	// Volleyball periods (sets)
	PeriodVolleySet1 = 1
	PeriodVolleySet2 = 2
	PeriodVolleySet3 = 3
	PeriodVolleySet4 = 4
	PeriodVolleySet5 = 5

	// American Football periods
	PeriodAFQuarter1 = 1
	PeriodAFQuarter2 = 2
	PeriodAFQuarter3 = 3
	PeriodAFQuarter4 = 4
	PeriodAFHalf1    = 5
	PeriodAFHalf2    = 6

	// Baseball periods
	PeriodBaseballF5 = 5

	// Outcome types
	OutcomeWin1    = "Win1"
	OutcomeWinNone = "WinNone"
	OutcomeWin2    = "Win2"
	OutcomeMore    = "WinMore"
	OutcomeLess    = "WinLess"
)

type OddMapping struct {
	periodIndex int
	oddType     string
	team        string
}

type yesNoMapping struct {
	periodIndex int
	isYes       bool
}

type doubleChanceMapping struct {
	periodIndex int
	dcType      string // "1X", "X2", "12"
}

type drawNoBetMapping struct {
	periodIndex int
	isHome      bool
}

type threeWayHandicapMapping struct {
	periodIndex int
	hcpType     string // "home", "draw", "away"
}

type relativeHandicapMapping struct {
	periodIndex int
	lineFunc    func(homeScore, awayScore, hcpLine float64) float64
	isWin1      bool
}

type absoluteHandicapMapping struct {
	periodIndex int
	isWin1      bool
}

var (
	win1x2MappingsBySport = map[entity.SportName]map[int64]OddMapping{
		entity.SportSoccer: {
			1:  {PeriodMatch, OutcomeWin1, ""},
			2:  {PeriodMatch, OutcomeWinNone, ""},
			10: {PeriodMatch, OutcomeWin2, ""},
			93: {PeriodTime1, OutcomeWin1, ""},
			94: {PeriodTime1, OutcomeWinNone, ""},
			95: {PeriodTime1, OutcomeWin2, ""},
			96: {PeriodTime2, OutcomeWin1, ""},
			97: {PeriodTime2, OutcomeWinNone, ""},
			98: {PeriodTime2, OutcomeWin2, ""},
		},
		entity.SportTennis: {
			1:   {PeriodMatch, OutcomeWin1, ""},
			10:  {PeriodMatch, OutcomeWin2, ""},
			691: {PeriodSet1, OutcomeWin1, ""},
			692: {PeriodSet1, OutcomeWin2, ""},
			693: {PeriodSet2, OutcomeWin1, ""},
			694: {PeriodSet2, OutcomeWin2, ""},
			695: {PeriodSet3, OutcomeWin1, ""},
			696: {PeriodSet3, OutcomeWin2, ""},
			697: {PeriodSet4, OutcomeWin1, ""},
			698: {PeriodSet4, OutcomeWin2, ""},
			699: {PeriodSet5, OutcomeWin1, ""},
			700: {PeriodSet5, OutcomeWin2, ""},
		},
		entity.SportVolleyball: {
			1:   {PeriodMatch, OutcomeWin1, ""},
			10:  {PeriodMatch, OutcomeWin2, ""},
			691: {PeriodVolleySet1, OutcomeWin1, ""},
			692: {PeriodVolleySet1, OutcomeWin2, ""},
			693: {PeriodVolleySet2, OutcomeWin1, ""},
			694: {PeriodVolleySet2, OutcomeWin2, ""},
			695: {PeriodVolleySet3, OutcomeWin1, ""},
			696: {PeriodVolleySet3, OutcomeWin2, ""},
			697: {PeriodVolleySet4, OutcomeWin1, ""},
			698: {PeriodVolleySet4, OutcomeWin2, ""},
			699: {PeriodVolleySet5, OutcomeWin1, ""},
			700: {PeriodVolleySet5, OutcomeWin2, ""},
		},
		entity.SportBasketball: {
			927: {PeriodMatch, OutcomeWin1, ""}, // Winner with OT
			928: {PeriodMatch, OutcomeWin2, ""},
			1:   {PeriodBasketballRegulation, OutcomeWin1, ""},     // Regulation 1x2 (3-way, with draw)
			2:   {PeriodBasketballRegulation, OutcomeWinNone, ""},
			10:  {PeriodBasketballRegulation, OutcomeWin2, ""},
			93:  {PeriodHalf1, OutcomeWin1, ""},     // 1H 3-way (Prvo Poluvreme)
			94:  {PeriodHalf1, OutcomeWinNone, ""},
			95:  {PeriodHalf1, OutcomeWin2, ""},
			// 521/522 (1H 2-way) → HC 0.0 (handled in service.go)
			96:  {PeriodHalf2, OutcomeWin1, ""},     // 2H 3-way (Drugo Poluvreme)
			97:  {PeriodHalf2, OutcomeWinNone, ""},
			98:  {PeriodHalf2, OutcomeWin2, ""},
			// 686/687 (2H 2-way) → HC 0.0 (handled in service.go)
			704: {PeriodQuarter1, OutcomeWin1, ""},     // Q1 3-way
			705: {PeriodQuarter1, OutcomeWinNone, ""},
			706: {PeriodQuarter1, OutcomeWin2, ""},
			// 919/920 (Q1 2-way) → HC 0.0 (handled in service.go)
			707: {PeriodQuarter2, OutcomeWin1, ""},     // Q2 3-way
			708: {PeriodQuarter2, OutcomeWinNone, ""},
			709: {PeriodQuarter2, OutcomeWin2, ""},
			// 921/922 (Q2 2-way) → HC 0.0 (handled in service.go)
			710: {PeriodQuarter3, OutcomeWin1, ""},     // Q3 3-way
			711: {PeriodQuarter3, OutcomeWinNone, ""},
			712: {PeriodQuarter3, OutcomeWin2, ""},
			// 923/924 (Q3 2-way) → HC 0.0 (handled in service.go)
			713: {PeriodQuarter4, OutcomeWin1, ""},     // Q4 3-way
			714: {PeriodQuarter4, OutcomeWinNone, ""},
			715: {PeriodQuarter4, OutcomeWin2, ""},
			// 925/926 (Q4 2-way) → HC 0.0 (handled in service.go)
		},
		entity.SportHandball: {
			1:  {PeriodMatch, OutcomeWin1, ""},
			2:  {PeriodMatch, OutcomeWinNone, ""},
			10: {PeriodMatch, OutcomeWin2, ""},
			93: {PeriodTime1, OutcomeWin1, ""},
			94: {PeriodTime1, OutcomeWinNone, ""},
			95: {PeriodTime1, OutcomeWin2, ""},
			96: {PeriodTime2, OutcomeWin1, ""},
			97: {PeriodTime2, OutcomeWinNone, ""},
			98: {PeriodTime2, OutcomeWin2, ""},
		},
		entity.SportHockey: {
			// 927/928 (Winner incl. OT, 2-way) → mapped as H 0 in absoluteHandicapMappings
			1:   {PeriodHockeyRegulation, OutcomeWin1, ""}, // Regulation 1X2
			2:   {PeriodHockeyRegulation, OutcomeWinNone, ""},
			10:  {PeriodHockeyRegulation, OutcomeWin2, ""},
			93:   {PeriodHockeyP1, OutcomeWin1, ""},  // 1st Period 1X2 (3-way)
			94:   {PeriodHockeyP1, OutcomeWinNone, ""},
			95:   {PeriodHockeyP1, OutcomeWin2, ""},
			1086: {PeriodHockeyP2, OutcomeWin1, ""},  // 2nd Period 1X2 (3-way)
			1087: {PeriodHockeyP2, OutcomeWinNone, ""},
			1088: {PeriodHockeyP2, OutcomeWin2, ""},
			1089: {PeriodHockeyP3, OutcomeWin1, ""},  // 3rd Period 1X2 (3-way)
			1090: {PeriodHockeyP3, OutcomeWinNone, ""},
			1091: {PeriodHockeyP3, OutcomeWin2, ""},
			// 521/522 (1st Period Winner 2-way) moved to drawNoBetMappingsBySport:
			// 2-way winner = push on draw = DNB semantics → analyzer maps to H1 0 / H2 0
		},
	}

	gamesMappings = map[int64]OddMapping{
		// Tennis games in sets
		667: {PeriodSet1, OutcomeWin1, ""},
		668: {PeriodSet1, OutcomeWin2, ""},
		669: {PeriodSet2, OutcomeWin1, ""},
		670: {PeriodSet2, OutcomeWin2, ""},
		671: {PeriodSet3, OutcomeWin1, ""},
		672: {PeriodSet3, OutcomeWin2, ""},
		673: {PeriodSet4, OutcomeWin1, ""},
		674: {PeriodSet4, OutcomeWin2, ""},
		675: {PeriodSet5, OutcomeWin1, ""},
		676: {PeriodSet5, OutcomeWin2, ""},
	}

	gamesMappingsBySport = map[entity.SportName]map[int64]OddMapping{
		entity.SportTennis: gamesMappings,
	}

	totalsMappingsBySport = map[entity.SportName]map[int64]OddMapping{
		entity.SportSoccer: {
			105: {PeriodMatch, OutcomeMore, ""},
			103: {PeriodMatch, OutcomeLess, ""},
			167: {PeriodTime1, OutcomeMore, ""},
			165: {PeriodTime1, OutcomeLess, ""},
			755: {PeriodTime2, OutcomeMore, ""},
			754: {PeriodTime2, OutcomeLess, ""},
		},
		entity.SportHockey: {
			105: {PeriodHockeyRegulation, OutcomeMore, ""},
			103: {PeriodHockeyRegulation, OutcomeLess, ""},
			172: {PeriodHockeyRegulation, OutcomeMore, ""},
			175: {PeriodHockeyRegulation, OutcomeLess, ""},
			176: {PeriodHockeyRegulation, OutcomeMore, ""},
			177: {PeriodHockeyRegulation, OutcomeLess, ""},
			167:  {PeriodHockeyP1, OutcomeMore, ""},
			165:  {PeriodHockeyP1, OutcomeLess, ""},
			1112: {PeriodHockeyP2, OutcomeMore, ""},  // 2nd Period Totals
			1113: {PeriodHockeyP2, OutcomeLess, ""},
			1110: {PeriodHockeyP2, OutcomeMore, ""},  // 2nd Period Totals (alt line)
			1111: {PeriodHockeyP2, OutcomeLess, ""},
		},
		entity.SportBasketball: {
			930: {PeriodMatch, OutcomeMore, ""}, // Match Total with OT
			929: {PeriodMatch, OutcomeLess, ""}, // Match Total with OT
			105: {PeriodBasketballRegulation, OutcomeMore, ""}, // Match Total regulation (w/o OT)
			103: {PeriodBasketballRegulation, OutcomeLess, ""},
			167: {PeriodHalf1, OutcomeMore, ""}, // 1H Total
			165: {PeriodHalf1, OutcomeLess, ""},
			755: {PeriodHalf2, OutcomeMore, ""}, // 2H Total
			754: {PeriodHalf2, OutcomeLess, ""},
			727: {PeriodQuarter1, OutcomeMore, ""}, // Q1 Total Over
			726: {PeriodQuarter1, OutcomeLess, ""},
			729: {PeriodQuarter2, OutcomeMore, ""}, // Q2 Total Over
			728: {PeriodQuarter2, OutcomeLess, ""},
			731: {PeriodQuarter3, OutcomeMore, ""}, // Q3 Total Over
			730: {PeriodQuarter3, OutcomeLess, ""},
			733: {PeriodQuarter4, OutcomeMore, ""}, // Q4 Total Over
			732: {PeriodQuarter4, OutcomeLess, ""},
		},
		entity.SportTennis: {
			666: {PeriodMatch, OutcomeMore, ""},
			665: {PeriodMatch, OutcomeLess, ""},
			658: {PeriodSet1, OutcomeMore, ""},
			657: {PeriodSet1, OutcomeLess, ""},
			660: {PeriodSet2, OutcomeMore, ""},
			659: {PeriodSet2, OutcomeLess, ""},
			662: {PeriodSet3, OutcomeMore, ""},
			661: {PeriodSet3, OutcomeLess, ""},
			664: {PeriodSet4, OutcomeMore, ""},
			663: {PeriodSet4, OutcomeLess, ""},
		},
		entity.SportVolleyball: {
			105:  {PeriodMatch, OutcomeMore, ""},
			103:  {PeriodMatch, OutcomeLess, ""},
			1070: {PeriodVolleySet1, OutcomeMore, ""},
			1069: {PeriodVolleySet1, OutcomeLess, ""},
			1072: {PeriodVolleySet2, OutcomeMore, ""}, // Set 2 Total Over
			1071: {PeriodVolleySet2, OutcomeLess, ""}, // Set 2 Total Under
			1074: {PeriodVolleySet3, OutcomeMore, ""}, // Set 3 Total Over
			1073: {PeriodVolleySet3, OutcomeLess, ""}, // Set 3 Total Under
			1076: {PeriodVolleySet4, OutcomeMore, ""}, // Set 4 Total Over
			1075: {PeriodVolleySet4, OutcomeLess, ""}, // Set 4 Total Under
			1078: {PeriodVolleySet5, OutcomeMore, ""}, // Set 5 Total Over
			1077: {PeriodVolleySet5, OutcomeLess, ""}, // Set 5 Total Under
		},
		entity.SportHandball: {
			105: {PeriodMatch, OutcomeMore, ""},
			103: {PeriodMatch, OutcomeLess, ""},
			167: {PeriodTime1, OutcomeMore, ""},
			165: {PeriodTime1, OutcomeLess, ""},
			755: {PeriodTime2, OutcomeMore, ""}, // 2H Total
			754: {PeriodTime2, OutcomeLess, ""},
		},
	}

	teamTotalsMappingsBySport = map[entity.SportName]map[int64]OddMapping{
		entity.SportSoccer: {
			168: {PeriodMatch, OutcomeMore, "first"},
			169: {PeriodMatch, OutcomeLess, "first"},
			170: {PeriodMatch, OutcomeMore, "second"},
			171: {PeriodMatch, OutcomeLess, "second"},
			747: {PeriodTime1, OutcomeMore, "first"},
			746: {PeriodTime1, OutcomeLess, "first"},
			749: {PeriodTime1, OutcomeMore, "second"},
			748: {PeriodTime1, OutcomeLess, "second"},
			751: {PeriodTime2, OutcomeMore, "first"},  // 2H IT1
			750: {PeriodTime2, OutcomeLess, "first"},
			753: {PeriodTime2, OutcomeMore, "second"}, // 2H IT2
			752: {PeriodTime2, OutcomeLess, "second"},
		},
		entity.SportHockey: {
			168: {PeriodHockeyRegulation, OutcomeMore, "first"},
			169: {PeriodHockeyRegulation, OutcomeLess, "first"},
			170: {PeriodHockeyRegulation, OutcomeMore, "second"},
			171: {PeriodHockeyRegulation, OutcomeLess, "second"},
			746: {PeriodHockeyP1, OutcomeLess, "first"},  // T1 Total 1st period
			747: {PeriodHockeyP1, OutcomeMore, "first"},
			748: {PeriodHockeyP1, OutcomeLess, "second"}, // T2 Total 1st period
			749: {PeriodHockeyP1, OutcomeMore, "second"},
		},
		entity.SportBasketball: {
			1079: {PeriodMatch, OutcomeLess, "first"},  // IT1 Under with OT
			1080: {PeriodMatch, OutcomeMore, "first"},  // IT1 Over with OT
			1081: {PeriodMatch, OutcomeLess, "second"},  // IT2 Under with OT
			1082: {PeriodMatch, OutcomeMore, "second"},  // IT2 Over with OT
			747:  {PeriodHalf1, OutcomeMore, "first"}, // 1H team totals
			746:  {PeriodHalf1, OutcomeLess, "first"},
			749:  {PeriodHalf1, OutcomeMore, "second"},
			748:  {PeriodHalf1, OutcomeLess, "second"},
			751:  {PeriodHalf2, OutcomeMore, "first"}, // 2H team totals
			750:  {PeriodHalf2, OutcomeLess, "first"},
			753:  {PeriodHalf2, OutcomeMore, "second"},
			752:  {PeriodHalf2, OutcomeLess, "second"},
		},
		entity.SportHandball: {
			168: {PeriodMatch, OutcomeMore, "first"},
			169: {PeriodMatch, OutcomeLess, "first"},
			170: {PeriodMatch, OutcomeMore, "second"},
			171: {PeriodMatch, OutcomeLess, "second"},
			747: {PeriodTime1, OutcomeMore, "first"},  // 1H IT1
			746: {PeriodTime1, OutcomeLess, "first"},
			749: {PeriodTime1, OutcomeMore, "second"}, // 1H IT2
			748: {PeriodTime1, OutcomeLess, "second"},
			751: {PeriodTime2, OutcomeMore, "first"},  // 2H IT1
			750: {PeriodTime2, OutcomeLess, "first"},
			753: {PeriodTime2, OutcomeMore, "second"}, // 2H IT2
			752: {PeriodTime2, OutcomeLess, "second"},
		},
		entity.SportTennis: {
			168: {PeriodMatch, OutcomeMore, "first"},  // IT1 games over
			169: {PeriodMatch, OutcomeLess, "first"},   // IT1 games under
			170: {PeriodMatch, OutcomeMore, "second"},  // IT2 games over
			171: {PeriodMatch, OutcomeLess, "second"},   // IT2 games under
		},
		entity.SportVolleyball: {
			168: {PeriodMatch, OutcomeMore, "first"},  // IT1 points over
			169: {PeriodMatch, OutcomeLess, "first"},   // IT1 points under
			170: {PeriodMatch, OutcomeMore, "second"},  // IT2 points over
			171: {PeriodMatch, OutcomeLess, "second"},   // IT2 points under
		},
	}

	bttsMappingsBySport = map[entity.SportName]map[int64]yesNoMapping{
		entity.SportSoccer: {
			112: {PeriodMatch, true},
			113: {PeriodMatch, false},
			141: {PeriodTime1, true},
			142: {PeriodTime1, false},
			183: {PeriodTime2, true},
			184: {PeriodTime2, false},
		},
		entity.SportHandball: {
			112: {PeriodMatch, true},
			113: {PeriodMatch, false},
			141: {PeriodTime1, true},
			142: {PeriodTime1, false},
			183: {PeriodTime2, true},
			184: {PeriodTime2, false},
		},
		entity.SportHockey: {
			112: {PeriodHockeyRegulation, true},
			113: {PeriodHockeyRegulation, false},
			141: {PeriodHockeyP1, true},
			142: {PeriodHockeyP1, false},
		},
	}

	oddEvenMappingsBySport = map[entity.SportName]map[int64]yesNoMapping{
		entity.SportSoccer: {
			115: {PeriodMatch, true},
			116: {PeriodMatch, false},
		},
		entity.SportHandball: {
			115: {PeriodMatch, true},
			116: {PeriodMatch, false},
		},
		entity.SportHockey: {
			115: {PeriodHockeyRegulation, true},
			116: {PeriodHockeyRegulation, false},
		},
		entity.SportBasketball: {
			115: {PeriodBasketballRegulation, true},
			116: {PeriodBasketballRegulation, false},
		},
	}

	doubleChanceMappingsBySport = map[entity.SportName]map[int64]doubleChanceMapping{
		entity.SportSoccer: {
			83:  {PeriodMatch, "1X"},
			84:  {PeriodMatch, "12"},
			85:  {PeriodMatch, "X2"},
			307: {PeriodTime1, "1X"},
			308: {PeriodTime1, "X2"},
			309: {PeriodTime1, "12"},
			310: {PeriodTime2, "1X"},
			311: {PeriodTime2, "X2"},
			312: {PeriodTime2, "12"},
		},
		entity.SportHandball: {
			83:  {PeriodMatch, "1X"},
			84:  {PeriodMatch, "12"},
			85:  {PeriodMatch, "X2"},
			307: {PeriodTime1, "1X"},
			308: {PeriodTime1, "X2"},
			309: {PeriodTime1, "12"},
			310: {PeriodTime2, "1X"},
			311: {PeriodTime2, "X2"},
			312: {PeriodTime2, "12"},
		},
		entity.SportHockey: {
			83:   {PeriodHockeyRegulation, "1X"}, // DC regulation (3-way market)
			84:   {PeriodHockeyRegulation, "12"},
			85:   {PeriodHockeyRegulation, "X2"},
			1114: {PeriodHockeyP1, "1X"},          // DC 1st period
			1115: {PeriodHockeyP1, "12"},
			1116: {PeriodHockeyP1, "X2"},
			1117: {PeriodHockeyP2, "1X"},          // DC 2nd period
			1118: {PeriodHockeyP2, "12"},
			1119: {PeriodHockeyP2, "X2"},
			1120: {PeriodHockeyP3, "1X"},          // DC 3rd period
			1121: {PeriodHockeyP3, "12"},
			1122: {PeriodHockeyP3, "X2"},
		},
		entity.SportBasketball: {
			83: {PeriodBasketballRegulation, "1X"}, // DC regulation (draw possible)
			84: {PeriodBasketballRegulation, "12"},
			85: {PeriodBasketballRegulation, "X2"},
		},
	}

	drawNoBetMappingsBySport = map[entity.SportName]map[int64]drawNoBetMapping{
		entity.SportSoccer: {
			106: {PeriodMatch, true},
			107: {PeriodMatch, false},
		},
		entity.SportHandball: {
			106: {PeriodMatch, true},
			107: {PeriodMatch, false},
		},
		entity.SportHockey: {
			106: {PeriodHockeyRegulation, true},  // "Winner" = regulation DNB (draw = refund)
			107: {PeriodHockeyRegulation, false},
			521: {PeriodHockeyP1, true},  // 1st Period Winner (2-way = push on draw = DNB)
			522: {PeriodHockeyP1, false},
		},
	}

	threeWayHandicapMappingsBySport = map[entity.SportName]map[int64]threeWayHandicapMapping{
		entity.SportSoccer: {
			// 688/689/690 EXCLUDED: Sansabet bet_num 688 uses a different convention
			// from Pinnacle's Three Way Handicap — prices don't match even at 0-0.
			// Including them produces false 100%+ ROI signals.
			1314: {PeriodMatch, "home"},
			1315: {PeriodMatch, "draw"},
			1316: {PeriodMatch, "away"},
			// Sansabet "Ostatak" (rest-of-match) is 3-way, not Asian handicap.
			734: {PeriodMatch, "home"},
			735: {PeriodMatch, "draw"},
			736: {PeriodMatch, "away"},
			737: {PeriodTime1, "home"},
			738: {PeriodTime1, "draw"},
			739: {PeriodTime1, "away"},
		},
		entity.SportHandball: {
			1314: {PeriodMatch, "home"},
			1315: {PeriodMatch, "draw"},
			1316: {PeriodMatch, "away"},
		},
	}

	relativeHandicapMappingsBySport = map[entity.SportName]map[int64]relativeHandicapMapping{
		entity.SportSoccer: {},
	}

	setsHandicapMappingsBySport = map[entity.SportName]map[int64]absoluteHandicapMapping{
		entity.SportVolleyball: {
			121: {PeriodMatch, true},  // Sets HC Win1
			123: {PeriodMatch, false}, // Sets HC Win2
		},
	}

	absoluteHandicapMappingsBySport = map[entity.SportName]map[int64]absoluteHandicapMapping{
		entity.SportBasketball: {
			1123: {PeriodMatch, true}, // Match handicap (OT)
			1124: {PeriodMatch, false},
			121:  {PeriodBasketballRegulation, true}, // Match handicap regulation (w/o OT)
			123:  {PeriodBasketballRegulation, false},
			162:  {PeriodHalf1, true}, // 1H handicap
			164:  {PeriodHalf1, false},
			756:  {PeriodQuarter1, true}, // Q1 handicap
			757:  {PeriodQuarter1, false},
			758:  {PeriodQuarter2, true}, // Q2 handicap
			759:  {PeriodQuarter2, false},
			760:  {PeriodQuarter3, true}, // Q3 handicap
			761:  {PeriodQuarter3, false},
			762:  {PeriodQuarter4, true}, // Q4 handicap
			763:  {PeriodQuarter4, false},
		},
		entity.SportHockey: {
			927:  {PeriodMatch, true},              // Winner incl. OT (2-way) → H 0 for hockey
			928:  {PeriodMatch, false},
			121:  {PeriodHockeyRegulation, true},
			123:  {PeriodHockeyRegulation, false},
			1102: {PeriodHockeyP2, true},  // 2nd Period HC Home
			1103: {PeriodHockeyP2, false}, // 2nd Period HC Away
			1104: {PeriodHockeyP3, true},  // 3rd Period HC Home
			1105: {PeriodHockeyP3, false}, // 3rd Period HC Away
			1106: {PeriodHockeyP3, true},  // 3rd Period HC Home (alt line)
			1107: {PeriodHockeyP3, false}, // 3rd Period HC Away (alt line)
		},
		entity.SportVolleyball: {
			1275: {PeriodMatch, true},
			1276: {PeriodMatch, false},
			1092: {PeriodVolleySet1, true},  // Set 1 Points HC
			1093: {PeriodVolleySet1, false},
			1094: {PeriodVolleySet2, true},  // Set 2 Points HC
			1095: {PeriodVolleySet2, false},
			1096: {PeriodVolleySet3, true},  // Set 3 Points HC
			1097: {PeriodVolleySet3, false},
			1098: {PeriodVolleySet4, true},  // Set 4 Points HC
			1099: {PeriodVolleySet4, false},
			1100: {PeriodVolleySet5, true},  // Set 5 Points HC
			1101: {PeriodVolleySet5, false},
		},
		entity.SportTennis: {
			1193: {PeriodMatch, true},
			1194: {PeriodMatch, false},
		},
	}
)

func getWin1x2Mapping(tipID int64, sport entity.SportName) (OddMapping, bool) {
	if sportMap, ok := win1x2MappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return OddMapping{}, false
}

func getGamesMapping(tipID int64, sport entity.SportName) (OddMapping, bool) {
	if sportMap, ok := gamesMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return OddMapping{}, false
}

func getTotalsMapping(tipID int64, sport entity.SportName) (OddMapping, bool) {
	if sportMap, ok := totalsMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return OddMapping{}, false
}

func getTeamTotalsMapping(tipID int64, sport entity.SportName) (OddMapping, bool) {
	if sportMap, ok := teamTotalsMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return OddMapping{}, false
}

func getBTTSMapping(tipID int64, sport entity.SportName) (yesNoMapping, bool) {
	if sportMap, ok := bttsMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return yesNoMapping{}, false
}

func getOddEvenMapping(tipID int64, sport entity.SportName) (yesNoMapping, bool) {
	if sportMap, ok := oddEvenMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return yesNoMapping{}, false
}

func getDoubleChanceMapping(tipID int64, sport entity.SportName) (doubleChanceMapping, bool) {
	if sportMap, ok := doubleChanceMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return doubleChanceMapping{}, false
}

func getDrawNoBetMapping(tipID int64, sport entity.SportName) (drawNoBetMapping, bool) {
	if sportMap, ok := drawNoBetMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return drawNoBetMapping{}, false
}

func getThreeWayHandicapMapping(tipID int64, sport entity.SportName) (threeWayHandicapMapping, bool) {
	if sportMap, ok := threeWayHandicapMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return threeWayHandicapMapping{}, false
}

func isRestOfMatchThreeWayTipID(tipID int64, sport entity.SportName) bool {
	if sport != entity.SportSoccer {
		return false
	}
	switch tipID {
	case 734, 735, 736, 737, 738, 739:
		return true
	default:
		return false
	}
}

func isHandicapTipID(tipID int64, sport entity.SportName) bool {
	if sportMap, ok := relativeHandicapMappingsBySport[sport]; ok {
		if _, ok := sportMap[tipID]; ok {
			return true
		}
	}
	if sportMap, ok := absoluteHandicapMappingsBySport[sport]; ok {
		if _, ok := sportMap[tipID]; ok {
			return true
		}
	}
	return false
}

func getSetsHandicapMapping(tipID int64, sport entity.SportName) (absoluteHandicapMapping, bool) {
	if sportMap, ok := setsHandicapMappingsBySport[sport]; ok {
		if mapping, ok := sportMap[tipID]; ok {
			return mapping, true
		}
	}
	return absoluteHandicapMapping{}, false
}

func processSetsHandicap(oddN int64, line string, oddValue float64, periods *[]entity.ResponsePeriod, sport entity.SportName) bool {
	mapping, ok := getSetsHandicapMapping(oddN, sport)
	if !ok {
		return false
	}

	hcpLine, _ := strconv.ParseFloat(line, 64)
	var lineStr string
	if mapping.isWin1 {
		lineStr = formatLine(hcpLine)
	} else {
		lineStr = formatLine(-hcpLine)
	}

	if (*periods)[mapping.periodIndex].SetsHandicap == nil {
		(*periods)[mapping.periodIndex].SetsHandicap = make(map[string]*entity.WinHandicap)
	}
	ensureMapEntry((*periods)[mapping.periodIndex].SetsHandicap, lineStr)

	oddVal := entity.OddValue{
		Value: oddValue,
		Raw:   betCtx(oddN, line, "sets_handicap", func() string { if mapping.isWin1 { return "Win1" }; return "Win2" }(), mapping.periodIndex),
	}
	if mapping.isWin1 {
		(*periods)[mapping.periodIndex].SetsHandicap[lineStr].Win1 = oddVal
	} else {
		(*periods)[mapping.periodIndex].SetsHandicap[lineStr].Win2 = oddVal
	}
	return true
}

func ensureMapEntry[T any](m map[string]*T, key string) {
	if _, ok := m[key]; !ok {
		m[key] = new(T)
	}
}
// betCtx creates OddRaw with full betting context for autobetting.
// Go parser is the single source of truth for Sansabet market mapping.
func betCtx(betNum int64, line, marketType, outcomeType string, periodIdx int) entity.OddRaw {
return entity.OddRaw{
BetNum:      betNum,
Line:        line,
MarketType:  marketType,
OutcomeType: outcomeType,
PeriodIndex: periodIdx,
}
}



func setWin1x2Value(win1x2 *entity.Win1x2Struct, oddType string, value float64, oddN int64, periodIdx int) {
	switch oddType {
	case OutcomeWin1:
		win1x2.Win1 = entity.OddValue{Value: value, Raw: betCtx(oddN, "", "1x2", "Win1", periodIdx)}
	case OutcomeWinNone:
		win1x2.WinNone = entity.OddValue{Value: value, Raw: betCtx(oddN, "", "1x2", "WinNone", periodIdx)}
	case OutcomeWin2:
		win1x2.Win2 = entity.OddValue{Value: value, Raw: betCtx(oddN, "", "1x2", "Win2", periodIdx)}
	}
}

func setTotalValue(total *entity.WinLessMore, oddType string, value float64, oddN int64, periodIdx int) {
	switch oddType {
	case OutcomeMore:
		total.WinMore = entity.OddValue{Value: value, Raw: betCtx(oddN, "", "total", "WinMore", periodIdx)}
	case OutcomeLess:
		total.WinLess = entity.OddValue{Value: value, Raw: betCtx(oddN, "", "total", "WinLess", periodIdx)}
	}
}

func formatLine(value float64) string {
	line := strconv.FormatFloat(value, 'f', 2, 64)
	line = strings.TrimRight(line, "0")
	line = strings.TrimRight(line, ".")
	if line == "" || line == "-0" {
		return "0"
	}
	return line
}

func processHandicap(oddN int64, line string, oddValue float64, periods *[]entity.ResponsePeriod, homeScore, awayScore float64, sportName entity.SportName) {
	hcpLine, _ := strconv.ParseFloat(line, 64)
	if sportName == entity.SportSoccer {
		hcpLine = decodeSansabetHandicapLine(hcpLine)
	}
	if sportMap, ok := relativeHandicapMappingsBySport[sportName]; ok {
		if mapping, ok := sportMap[oddN]; ok {
			// Special case: Sansabet match tipIDs 734/736 (line 0) behave like 2-way winner with draw losing,
			// not true handicap (DNB). Map to Win1x2 if missing and skip Handicap to avoid duplicates.
			if sportName == entity.SportSoccer && mapping.periodIndex == PeriodMatch && hcpLine == 0 && (oddN == 734 || oddN == 736) {
				if mapping.isWin1 {
					if (*periods)[mapping.periodIndex].Win1x2.Win1.Value == 0 {
						(*periods)[mapping.periodIndex].Win1x2.Win1 = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, line, "1x2", "Win1", mapping.periodIndex)}
					}
				} else {
					if (*periods)[mapping.periodIndex].Win1x2.Win2.Value == 0 {
						(*periods)[mapping.periodIndex].Win1x2.Win2 = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, line, "1x2", "Win2", mapping.periodIndex)}
					}
				}
				return
			}

			// Special case: Sansabet P1 tipIDs 737/739 (line 0) behave like 2-way 1H winner,
			// not true handicap. Map to Win1x2 if missing and skip Handicap to avoid duplicates.
			if sportName == entity.SportSoccer && mapping.periodIndex == PeriodTime1 && hcpLine == 0 && (oddN == 737 || oddN == 739) {
				if mapping.isWin1 {
					if (*periods)[mapping.periodIndex].Win1x2.Win1.Value == 0 {
						(*periods)[mapping.periodIndex].Win1x2.Win1 = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, line, "1x2", "Win1", mapping.periodIndex)}
					}
				} else {
					if (*periods)[mapping.periodIndex].Win1x2.Win2.Value == 0 {
						(*periods)[mapping.periodIndex].Win1x2.Win2 = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, line, "1x2", "Win2", mapping.periodIndex)}
					}
				}
				return
			}

			lineVal := mapping.lineFunc(homeScore, awayScore, hcpLine)
			lineStr := formatLine(lineVal)
			ensureMapEntry((*periods)[mapping.periodIndex].Handicap, lineStr)

			oddVal := entity.OddValue{
				Value: oddValue,
				Raw:   betCtx(oddN, line, "handicap", func() string { if mapping.isWin1 { return "Win1" }; return "Win2" }(), mapping.periodIndex),
			}
			if mapping.isWin1 {
				(*periods)[mapping.periodIndex].Handicap[lineStr].Win1 = oddVal
			} else {
				(*periods)[mapping.periodIndex].Handicap[lineStr].Win2 = oddVal
			}
			return
		}
	}

	if sportMap, ok := absoluteHandicapMappingsBySport[sportName]; ok {
		if mapping, ok := sportMap[oddN]; ok {
			var lineStr string
			if mapping.isWin1 {
				lineStr = formatLine(hcpLine)
			} else {
				lineStr = formatLine(-hcpLine)
			}
			ensureMapEntry((*periods)[mapping.periodIndex].Handicap, lineStr)

			oddVal := entity.OddValue{
				Value: oddValue,
				Raw:   betCtx(oddN, line, "handicap", func() string { if mapping.isWin1 { return "Win1" }; return "Win2" }(), mapping.periodIndex),
			}
			if mapping.isWin1 {
				(*periods)[mapping.periodIndex].Handicap[lineStr].Win1 = oddVal
			} else {
				(*periods)[mapping.periodIndex].Handicap[lineStr].Win2 = oddVal
			}
		}
	}
}

func decodeSansabetHandicapLine(raw float64) float64 {
	if raw >= 0 {
		whole := math.Floor(raw)
		frac := raw - whole
		if math.Abs(frac-0.1) < 0.0001 {
			return whole + 0.5
		}
		if math.Abs(frac-0.2) < 0.0001 {
			return whole + 1.0
		}
	} else {
		whole := math.Ceil(raw)
		frac := whole - raw // positive fractional part
		if math.Abs(frac-0.1) < 0.0001 {
			return whole - 0.5
		}
		if math.Abs(frac-0.2) < 0.0001 {
			return whole - 1.0
		}
	}
	return raw
}

// processDoubleChance handles Double Chance markets (V2: stores as-is, no conversion)
// Analyzer handles equivalences (DC 1X = H1 +0.5, DC X2 = H2 +0.5)
func processDoubleChance(oddN int64, oddValue float64, periods *[]entity.ResponsePeriod, sport entity.SportName) bool {
	mapping, ok := getDoubleChanceMapping(oddN, sport)
	if !ok {
		return false
	}

	if (*periods)[mapping.periodIndex].DoubleChance == nil {
		(*periods)[mapping.periodIndex].DoubleChance = &entity.DoubleChanceStruct{}
	}

	dc := (*periods)[mapping.periodIndex].DoubleChance
	switch mapping.dcType {
	case "1X":
		dc.W1X = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, "", "dc", "W1X", 0)}
	case "X2":
		dc.WX2 = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, "", "dc", "WX2", 0)}
	case "12":
		dc.W12 = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, "", "dc", "W12", 0)}
	}

	return true
}

// processDrawNoBet stores Draw No Bet (DNB) odds for soccer
func processDrawNoBet(oddN int64, oddValue float64, periods *[]entity.ResponsePeriod, sport entity.SportName) bool {
	mapping, ok := getDrawNoBetMapping(oddN, sport)
	if !ok {
		return false
	}

	if (*periods)[mapping.periodIndex].DrawNoBet == nil {
		(*periods)[mapping.periodIndex].DrawNoBet = &entity.DrawNoBetStruct{}
	}

	dnb := (*periods)[mapping.periodIndex].DrawNoBet
	if mapping.isHome {
		dnb.Home = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, "", "dnb", "Home", 0)}
	} else {
		dnb.Away = entity.OddValue{Value: oddValue, Raw: betCtx(oddN, "", "dnb", "Away", 0)}
	}

	return true
}

// playerPropLeaguePatterns matches league names for player prop leagues
var playerPropLeaguePatterns = regexp.MustCompile(`(?i)Players?\s+(Points|Assists|Rebounds|Steals|Blocks|Turnovers|Three|3-Point|Double|Triple|Fantasy|Combos|Rush|Pass|Receiv|Touch|Yards)`)

// isPlayerPropLeague detects player prop leagues by name pattern.
// Returns the market type (e.g. "Points", "Assists") or empty string if not a player prop.
func isPlayerPropLeague(leagueName string) string {
	m := playerPropLeaguePatterns.FindStringSubmatch(leagueName)
	if len(m) >= 2 {
		return m[1]
	}
	return ""
}

// normalizePlayerName converts "Surname Firstname" → "firstname surname" for cross-parser matching.
func normalizePlayerName(name string) string {
	name = strings.TrimSpace(name)
	parts := strings.Fields(strings.ToLower(name))
	if len(parts) < 2 {
		return strings.ToLower(name)
	}
	// Sansabet: "Durant Kevin" → "kevin durant"
	// Reverse: last word first, then the rest
	last := parts[len(parts)-1]
	first := strings.Join(parts[:len(parts)-1], " ")
	return last + " " + first
}

// winnerTotalComboMappings maps TipID → combo key string matching PS3838 format.
// Used for live path WinnerTotalCombo markets (Soccer, Handball).
var winnerTotalComboMappings = map[int64]string{
	131: "Home & Over 2.5", 153: "Home & Over 3.5", 414: "Home & Over 4.5",
	197: "Home & Under 2.5", 411: "Home & Under 3.5", 931: "Home & Under 4.5",
	132: "Away & Over 2.5", 154: "Away & Over 3.5", 420: "Away & Over 4.5",
	198: "Away & Under 2.5", 417: "Away & Under 3.5", 939: "Away & Under 4.5",
	423: "Draw & Under 2.5", 424: "Draw & Over 1.5", 425: "Draw & Over 3.5",
}

// winnerTotalComboSports defines which sports support WinnerTotalCombo in live path.
var winnerTotalComboSports = map[entity.SportName]bool{
	entity.SportSoccer:   true,
	entity.SportHandball: true,
}

func getWinnerTotalComboKey(tipID int64, sport entity.SportName) (string, bool) {
	if !winnerTotalComboSports[sport] {
		return "", false
	}
	if key, ok := winnerTotalComboMappings[tipID]; ok {
		return key, true
	}
	return "", false
}
