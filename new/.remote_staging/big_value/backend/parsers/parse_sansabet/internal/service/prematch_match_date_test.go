package service

import (
	"testing"
	"time"
)

func TestParseMatchDateDateOnlyUsesEndOfDay(t *testing.T) {
	got := parseMatchDate("08.08.2026")
	want := time.Date(2026, time.August, 8, 23, 59, 59, int(time.Second-time.Nanosecond), time.UTC)
	if !got.Equal(want) {
		t.Fatalf("parseMatchDate(date-only) = %s, want %s", got, want)
	}
}

func TestParseMatchDatePreservesDateAndTime(t *testing.T) {
	got := parseMatchDate("08.08.2026 21:45")
	want := time.Date(2026, time.August, 8, 21, 45, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("parseMatchDate(date+time) = %s, want %s", got, want)
	}
}

func TestParseMatchDateRejectsInvalidValue(t *testing.T) {
	if got := parseMatchDate("not-a-date"); !got.IsZero() {
		t.Fatalf("parseMatchDate(invalid) = %s, want zero time", got)
	}
}
