package entity

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMatchDataDecodesScheduledStartTime(t *testing.T) {
	const payload = `{
		"leagueName":"premier league",
		"homeName":"Home",
		"awayName":"Away",
		"matchId":"fixture-1",
		"bookmaker":"Pinnacle",
		"sportName":"Soccer",
		"matchDate":"2026-08-10T16:00:00Z",
		"createdAt":"2026-08-10T02:00:00Z"
	}`

	var match MatchData
	require.NoError(t, json.Unmarshal([]byte(payload), &match))
	require.Equal(t, time.Date(2026, 8, 10, 16, 0, 0, 0, time.UTC), match.MatchDate)
	require.NotEqual(t, match.CreatedAt, match.MatchDate)
}
