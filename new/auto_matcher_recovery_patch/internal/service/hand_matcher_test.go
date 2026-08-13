package service

import (
	"livebets/auto_matcher/internal/entity"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestBuildUnmatchedTeamsPairs tests the grouping logic for unmatched teams
func TestBuildUnmatchedTeamsPairs(t *testing.T) {
	teams := []entity.UnMatchedTeamsByLeaguesPG{
		{
			TeamID:        1,
			TeamName:      "Manchester United",
			LeagueID:      10,
			LeagueName:    "Premier League",
			BookmakerName: "pinnacle",
			LeagueMatchID: 1,
		},
		{
			TeamID:        2,
			TeamName:      "Chelsea",
			LeagueID:      10,
			LeagueName:    "Premier League",
			BookmakerName: "pinnacle",
			LeagueMatchID: 1,
		},
		{
			TeamID:        101,
			TeamName:      "Манчестер Юнайтед",
			LeagueID:      20,
			LeagueName:    "Английская Премьер Лига",
			BookmakerName: "fonbet",
			LeagueMatchID: 1,
		},
		{
			TeamID:        102,
			TeamName:      "Челси",
			LeagueID:      20,
			LeagueName:    "Английская Премьер Лига",
			BookmakerName: "fonbet",
			LeagueMatchID: 1,
		},
	}

	pairs := buildUnmatchedTeamsPairs(teams, "pinnacle", "soccer")

	assert.Equal(t, 1, len(pairs), "Should have 1 pair")

	for _, pair := range pairs {
		assert.Equal(t, "pinnacle", pair.BookmakerNameFirst)
		assert.Equal(t, "fonbet", pair.BookmakerNameSecond)
		assert.Equal(t, 2, len(pair.TeamsFirst), "Should have 2 teams from pinnacle")
		assert.Equal(t, 2, len(pair.TeamsSecond), "Should have 2 teams from fonbet")
		assert.Equal(t, "soccer", pair.SportName)
	}
}

// TestConvertUnmatchedPairsToResponse tests map to slice conversion
func TestConvertUnmatchedPairsToResponse(t *testing.T) {
	pairs := map[string]entity.UnMatchedTeamsPair{
		"key1": {
			LeagueIDFirst:       10,
			LeagueIDSecond:      20,
			BookmakerNameFirst:  "pinnacle",
			BookmakerNameSecond: "fonbet",
			LeagueNameFirst:     "Premier League",
			LeagueNameSecond:    "Английская Премьер Лига",
			TeamsFirst: map[int64]entity.UnMatchedTeam{
				1: {TeamID: 1, TeamName: "Team A"},
				2: {TeamID: 2, TeamName: "Team B"},
			},
			TeamsSecond: map[int64]entity.UnMatchedTeam{
				101: {TeamID: 101, TeamName: "Команда A"},
			},
			SportName: "soccer",
		},
	}

	result := convertUnmatchedPairsToResponse(pairs)

	assert.Equal(t, 1, len(result), "Should have 1 result")
	assert.Equal(t, 2, len(result[0].TeamsFirst), "Should have 2 teams from first bookmaker")
	assert.Equal(t, 1, len(result[0].TeamsSecond), "Should have 1 team from second bookmaker")
}

// TestBuildMatchedTeamsPairs tests the grouping logic for matched teams
func TestBuildMatchedTeamsPairs(t *testing.T) {
	teams := []entity.MatchedTeamsByLeaguesPG{
		{
			TeamID:        1,
			TeamName:      "Manchester United",
			LeagueID:      10,
			LeagueName:    "Premier League",
			BookmakerName: "pinnacle",
			LeagueMatchID: 100,
			TeamMatch:     "team_match_1",
		},
		{
			TeamID:        101,
			TeamName:      "Манчестер Юнайтед",
			LeagueID:      20,
			LeagueName:    "Английская Премьер Лига",
			BookmakerName: "fonbet",
			LeagueMatchID: 100,
			TeamMatch:     "team_match_1",
		},
		{
			TeamID:        2,
			TeamName:      "Chelsea",
			LeagueID:      10,
			LeagueName:    "Premier League",
			BookmakerName: "pinnacle",
			LeagueMatchID: 100,
			TeamMatch:     "team_match_2",
		},
		{
			TeamID:        102,
			TeamName:      "Челси",
			LeagueID:      20,
			LeagueName:    "Английская Премьер Лига",
			BookmakerName: "fonbet",
			LeagueMatchID: 100,
			TeamMatch:     "team_match_2",
		},
	}

	pairs := buildMatchedTeamsPairs(teams, "pinnacle", "soccer")

	assert.Equal(t, 1, len(pairs), "Should have 1 league pair")

	for _, pair := range pairs {
		assert.Equal(t, "pinnacle", pair.BookmakerNameFirst)
		assert.Equal(t, "fonbet", pair.BookmakerNameSecond)
		assert.Equal(t, 2, len(pair.TeamsPair), "Should have 2 team pairs")
		assert.Equal(t, "soccer", pair.SportName)
	}
}

// TestBuildUnmatchedTeamsPairs_EmptyInput tests empty input
func TestBuildUnmatchedTeamsPairs_EmptyInput(t *testing.T) {
	teams := []entity.UnMatchedTeamsByLeaguesPG{}
	pairs := buildUnmatchedTeamsPairs(teams, "pinnacle", "soccer")
	assert.Equal(t, 0, len(pairs), "Should have no pairs for empty input")
}

// TestBuildUnmatchedTeamsPairs_SingleBookmaker tests single bookmaker
func TestBuildUnmatchedTeamsPairs_SingleBookmaker(t *testing.T) {
	teams := []entity.UnMatchedTeamsByLeaguesPG{
		{
			TeamID:        1,
			TeamName:      "Team A",
			LeagueID:      10,
			LeagueName:    "League A",
			BookmakerName: "pinnacle",
			LeagueMatchID: 1,
		},
		{
			TeamID:        2,
			TeamName:      "Team B",
			LeagueID:      10,
			LeagueName:    "League A",
			BookmakerName: "pinnacle",
			LeagueMatchID: 1,
		},
	}

	pairs := buildUnmatchedTeamsPairs(teams, "pinnacle", "soccer")
	assert.Equal(t, 0, len(pairs), "Should have no pairs when all teams from same bookmaker")
}

// TestBuildUnmatchedTeamsPairs_DifferentLeagueMatchID tests different league match IDs
func TestBuildUnmatchedTeamsPairs_DifferentLeagueMatchID(t *testing.T) {
	teams := []entity.UnMatchedTeamsByLeaguesPG{
		{
			TeamID:        1,
			TeamName:      "Team A",
			LeagueID:      10,
			LeagueName:    "League A",
			BookmakerName: "pinnacle",
			LeagueMatchID: 1,
		},
		{
			TeamID:        101,
			TeamName:      "Team A",
			LeagueID:      20,
			LeagueName:    "League A",
			BookmakerName: "fonbet",
			LeagueMatchID: 2,
		},
	}

	pairs := buildUnmatchedTeamsPairs(teams, "pinnacle", "soccer")
	assert.Equal(t, 0, len(pairs), "Should have no pairs when league match IDs differ")
}
