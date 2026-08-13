package domain

import "testing"

func TestParser_IsValid(t *testing.T) {
	tests := []struct {
		name string
		p    Parser
		want bool
	}{
		{"Valid Pinnacle", Pinnacle, true},
		{"Valid Lobbet", Lobbet, true},
		{"Invalid", Parser("InvalidParser"), false},
		{"Empty", Parser(""), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.p.IsValid(); got != tt.want {
				t.Errorf("Parser.IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParser_String(t *testing.T) {
	if got := Pinnacle.String(); got != "Pinnacle" {
		t.Errorf("Parser.String() = %v, want Pinnacle", got)
	}
}

func TestAllParsers(t *testing.T) {
	parsers := AllParsers()
	if len(parsers) != 19 {
		t.Errorf("AllParsers() returned %d parsers, want 19", len(parsers))
	}

	// Check all are valid
	for _, p := range parsers {
		if !p.IsValid() {
			t.Errorf("Parser %s from AllParsers() is not valid", p)
		}
	}
}
