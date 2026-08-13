package service

import (
	"fmt"
	"testing"
	"time"
)

func TestIsWithin24HoursHasPastAndFutureBounds(t *testing.T) {
	now := time.Date(2026, time.August, 10, 2, 10, 0, 0, time.UTC)
	cutoff := now.Add(24 * time.Hour)
	tests := []struct {
		name string
		dp   string
		want bool
	}{
		{name: "previous date-only listing", dp: "09.08.2026", want: false},
		{name: "current date-only listing", dp: "10.08.2026", want: true},
		{name: "inside future window", dp: "10.08.2026 03:00", want: true},
		{name: "at lower grace boundary", dp: "2026-08-10T02:05:00Z", want: true},
		{name: "before lower grace boundary", dp: "2026-08-10T02:04:59Z", want: false},
		{name: "at upper boundary", dp: "2026-08-11T02:10:00Z", want: true},
		{name: "after upper boundary", dp: "2026-08-11T02:10:01Z", want: false},
		{name: "missing date preserves existing behaviour", dp: "", want: true},
		{name: "unknown date preserves existing behaviour", dp: "not-a-date", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isWithin24Hours(tt.dp, cutoff); got != tt.want {
				t.Fatalf("isWithin24Hours(%q, %s) = %t, want %t", tt.dp, cutoff, got, tt.want)
			}
		})
	}
}

func TestIsWithin24HoursSupportsObservedAndDocumentedFormats(t *testing.T) {
	now := time.Date(2026, time.August, 10, 2, 10, 0, 0, time.UTC)
	cutoff := now.Add(24 * time.Hour)
	inside := now.Add(time.Hour)
	epochMillis := inside.UnixMilli()
	tests := []string{
		"10.08.2026",
		"10.08.2026 03:10",
		inside.Format(time.RFC3339),
		fmt.Sprintf("/Date(%d)/", epochMillis),
		fmt.Sprintf("/Date(%d+0200)/", epochMillis),
		fmt.Sprintf("/Date(%d-0500)/", epochMillis),
	}

	for _, dp := range tests {
		if !isWithin24Hours(dp, cutoff) {
			t.Errorf("isWithin24Hours(%q, %s) = false, want true", dp, cutoff)
		}
	}
}

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

func TestParseMatchDateDotNetOffsetDoesNotShiftEpoch(t *testing.T) {
	want := time.Date(2026, time.August, 10, 3, 10, 0, int(123*time.Millisecond), time.UTC)
	for _, suffix := range []string{"", "+0200", "-0500"} {
		dp := fmt.Sprintf("/Date(%d%s)/", want.UnixMilli(), suffix)
		if got := parseMatchDate(dp); !got.Equal(want) {
			t.Errorf("parseMatchDate(%q) = %s, want %s", dp, got, want)
		}
	}
}

func TestParseMatchDateMalformedDotNetValueDoesNotPanic(t *testing.T) {
	for _, dp := range []string{"/Date(", "/Date()/", "/Date(not-a-number)/", "/Date(123"} {
		if got := parseMatchDate(dp); !got.IsZero() {
			t.Errorf("parseMatchDate(%q) = %s, want zero time", dp, got)
		}
	}
}

func TestParseMatchDateRejectsInvalidValue(t *testing.T) {
	if got := parseMatchDate("not-a-date"); !got.IsZero() {
		t.Fatalf("parseMatchDate(invalid) = %s, want zero time", got)
	}
}
