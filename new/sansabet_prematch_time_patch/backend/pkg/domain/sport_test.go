package domain

import "testing"

func TestSportName_IsValid(t *testing.T) {
	tests := []struct {
		name string
		s    SportName
		want bool
	}{
		{"Valid Soccer", Soccer, true},
		{"Valid Tennis", Tennis, true},
		{"Invalid", SportName("InvalidSport"), false},
		{"Empty", SportName(""), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.s.IsValid(); got != tt.want {
				t.Errorf("SportName.IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSportName_String(t *testing.T) {
	if got := Soccer.String(); got != "Soccer" {
		t.Errorf("SportName.String() = %v, want Soccer", got)
	}
}

func TestAllSports(t *testing.T) {
	sports := AllSports()
	if len(sports) != 10 {
		t.Errorf("AllSports() returned %d sports, want 10", len(sports))
	}

	// Check all are valid
	for _, s := range sports {
		if !s.IsValid() {
			t.Errorf("Sport %s from AllSports() is not valid", s)
		}
	}
}
