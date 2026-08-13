package entity

import (
	"encoding/json"
	"testing"
	"time"
)

func TestMatchDataPublishesScheduledStartTime(t *testing.T) {
	want := time.Date(2026, 8, 10, 16, 0, 0, 0, time.UTC)
	payload, err := json.Marshal(MatchData{MatchID: "fixture-1", MatchDate: want})
	if err != nil {
		t.Fatalf("marshal MatchData: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal MatchData JSON: %v", err)
	}
	if got := decoded["matchDate"]; got != want.Format(time.RFC3339) {
		t.Fatalf("matchDate = %v, want %s", got, want.Format(time.RFC3339))
	}
}
