package redis

import "testing"

func TestParserKey(t *testing.T) {
	tests := []struct {
		name      string
		isLive    bool
		bookmaker string
		expected  string
	}{
		{"live parser", true, "Pinnacle", "parser/live/Pinnacle"},
		{"prematch parser", false, "Lobbet", "parser/prematch/Lobbet"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParserKey(tt.isLive, tt.bookmaker)
			if got != tt.expected {
				t.Errorf("ParserKey() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestPairsKey_Sorted(t *testing.T) {
	// Keys should be the same regardless of order
	key1 := PairsKey(true, "Lobbet", "Pinnacle")
	key2 := PairsKey(true, "Pinnacle", "Lobbet")

	if key1 != key2 {
		t.Errorf("keys not sorted consistently: %s != %s", key1, key2)
	}

	expected := "pairs/live/Lobbet/Pinnacle"
	if key1 != expected {
		t.Errorf("expected %s, got %s", expected, key1)
	}
}

func TestParserPattern(t *testing.T) {
	tests := []struct {
		name       string
		isLive     bool
		includeAll bool
		expected   string
	}{
		{"all parsers", false, true, "parser/*"},
		{"live only", true, false, "parser/live/*"},
		{"prematch only", false, false, "parser/prematch/*"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParserPattern(tt.isLive, tt.includeAll)
			if got != tt.expected {
				t.Errorf("ParserPattern() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestPairsPattern(t *testing.T) {
	tests := []struct {
		name       string
		isLive     bool
		includeAll bool
		expected   string
	}{
		{"all pairs", false, true, "pairs/*"},
		{"live only", true, false, "pairs/live/*"},
		{"prematch only", false, false, "pairs/prematch/*"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PairsPattern(tt.isLive, tt.includeAll)
			if got != tt.expected {
				t.Errorf("PairsPattern() = %v, want %v", got, tt.expected)
			}
		})
	}
}

// Test legacy functions still work
func TestLegacyFunctions(t *testing.T) {
	key := GetRKeyParser(true, "Pinnacle")
	expected := "parser/live/Pinnacle"
	if key != expected {
		t.Errorf("GetRKeyParser() = %v, want %v", key, expected)
	}

	key2 := GetRKeyPairs(false, "Lobbet", "Pinnacle")
	expected2 := "pairs/prematch/Lobbet/Pinnacle"
	if key2 != expected2 {
		t.Errorf("GetRKeyPairs() = %v, want %v", key2, expected2)
	}
}
