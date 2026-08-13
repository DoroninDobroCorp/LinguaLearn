package service

import (
	"testing"
	"time"

	"livebets/auto_matcher/internal/entity"

	"github.com/stretchr/testify/require"
)

func mappingFixture(id, bookmaker, sport, league, home, away string, start time.Time) entity.MatchData {
	return entity.MatchData{
		MatchID:    id,
		Bookmaker:  bookmaker,
		SportName:  sport,
		LeagueName: league,
		HomeName:   home,
		AwayName:   away,
		MatchDate:  start,
	}
}

func TestStrictExactTeamFixtureEvidence(t *testing.T) {
	now := time.Date(2026, 8, 10, 10, 0, 0, 0, time.UTC)
	firstStart := now.Add(2 * time.Hour)
	secondStart := firstStart.Add(29 * time.Minute)
	base := []entity.MatchData{
		mappingFixture("p-1", "Pinnacle", "Soccer", "premier league", "Alpha FC", "Beta FC", firstStart),
		mappingFixture("v-1", "Volcano", "Soccer", "premier league", " alpha   fc ", "BETA FC", secondStart),
	}

	tests := []struct {
		name    string
		matches []entity.MatchData
		sport   string
		leagues [2]string
		teams   [2]string
		want    bool
	}{
		{name: "unique exact fixture", matches: base, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "alpha fc"}, want: true},
		{name: "different sport", matches: base, sport: "Basketball", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "alpha fc"}},
		{name: "different league context", matches: base, sport: "Soccer", leagues: [2]string{"premier league", "championship"}, teams: [2]string{"Alpha FC", "alpha fc"}},
		{name: "alias is not exact", matches: base, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha Football Club"}},
		{name: "wrong opponent", matches: []entity.MatchData{base[0], mappingFixture("v-1", "Volcano", "Soccer", "premier league", "Alpha FC", "Gamma FC", secondStart)}, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha FC"}},
		{name: "home away swapped", matches: []entity.MatchData{base[0], mappingFixture("v-1", "Volcano", "Soccer", "premier league", "Beta FC", "Alpha FC", secondStart)}, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha FC"}},
		{name: "start delta too large", matches: []entity.MatchData{base[0], mappingFixture("v-1", "Volcano", "Soccer", "premier league", "Alpha FC", "Beta FC", firstStart.Add(31*time.Minute))}, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha FC"}},
		{name: "missing scheduled start", matches: []entity.MatchData{base[0], mappingFixture("v-1", "Volcano", "Soccer", "premier league", "Alpha FC", "Beta FC", time.Time{})}, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha FC"}},
		{name: "past prematch", matches: []entity.MatchData{mappingFixture("p-1", "Pinnacle", "Soccer", "premier league", "Alpha FC", "Beta FC", now.Add(-10*time.Minute)), mappingFixture("v-1", "Volcano", "Soccer", "premier league", "Alpha FC", "Beta FC", now.Add(-9*time.Minute))}, sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha FC"}},
		{name: "ambiguous duplicate fixture", matches: append(append([]entity.MatchData{}, base...), mappingFixture("v-2", "Volcano", "Soccer", "premier league", "Alpha FC", "Beta FC", secondStart)), sport: "Soccer", leagues: [2]string{"premier league", "premier league"}, teams: [2]string{"Alpha FC", "Alpha FC"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := strictExactTeamFixtureEvidence(tt.matches, tt.sport, [2]string{"Pinnacle", "Volcano"}, tt.leagues, tt.teams, now, true)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestStrictExactLeagueFixtureEvidence(t *testing.T) {
	now := time.Date(2026, 8, 10, 10, 0, 0, 0, time.UTC)
	start := now.Add(time.Hour)
	matches := []entity.MatchData{
		mappingFixture("p-1", "Pinnacle", "Soccer", "premier league", "Alpha", "Beta", start),
		mappingFixture("v-1", "Volcano", "Soccer", "Premier League", "alpha", "beta", start.Add(10*time.Minute)),
	}

	require.True(t, strictExactLeagueFixtureEvidence(matches, "Soccer", [2]string{"Pinnacle", "Volcano"}, [2]string{"premier league", "Premier League"}, now, true))
	require.False(t, strictExactLeagueFixtureEvidence(matches, "Soccer", [2]string{"Pinnacle", "Volcano"}, [2]string{"premier league", "England Premier League"}, now, true))

	ambiguous := append(append([]entity.MatchData{}, matches...), mappingFixture("v-2", "Volcano", "Soccer", "Premier League", "Alpha", "Beta", start.Add(12*time.Minute)))
	require.False(t, strictExactLeagueFixtureEvidence(ambiguous, "Soccer", [2]string{"Pinnacle", "Volcano"}, [2]string{"premier league", "Premier League"}, now, true))
}
