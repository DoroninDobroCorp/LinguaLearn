package service

import (
	"livebets/auto_matcher/internal/entity"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestExtractMatchData tests extraction of leagues and teams from match data
func TestExtractMatchData(t *testing.T) {
	matchData := []entity.MatchData{
		{
			Bookmaker:  "pinnacle",
			SportName:  "soccer",
			LeagueName: "Premier League",
			HomeName:   "Manchester United",
			AwayName:   "Chelsea",
		},
		{
			Bookmaker:  "fonbet",
			SportName:  "soccer",
			LeagueName: "Английская Премьер Лига",
			HomeName:   "Манчестер Юнайтед",
			AwayName:   "Челси",
		},
		{
			Bookmaker:  "unibet",
			SportName:  "soccer",
			LeagueName: "La Liga",
			HomeName:   "Real Madrid",
			AwayName:   "Barcelona",
		},
		{
			Bookmaker:  "pinnacle",
			SportName:  "basketball",
			LeagueName: "NBA",
			HomeName:   "Lakers",
			AwayName:   "Bulls",
		},
	}

	t.Run("Extract for pinnacle and fonbet soccer", func(t *testing.T) {
		leagues, teams := extractMatchData(matchData, "pinnacle", "fonbet", "soccer")

		assert.Equal(t, 2, len(leagues), "Should extract 2 leagues")
		assert.Contains(t, leagues, "Premier League")
		assert.Contains(t, leagues, "Английская Премьер Лига")

		assert.Equal(t, 4, len(teams), "Should extract 4 teams")
		assert.Contains(t, teams, "Manchester United")
		assert.Contains(t, teams, "Chelsea")
		assert.Contains(t, teams, "Манчестер Юнайтед")
		assert.Contains(t, teams, "Челси")
	})

	t.Run("Extract for non-existent bookmaker", func(t *testing.T) {
		leagues, teams := extractMatchData(matchData, "bet365", "fonbet", "soccer")

		// When one bookmaker has no live data, returns empty to prevent stale matching
		assert.Equal(t, 0, len(leagues), "Should return empty when one bookmaker missing")
		assert.Equal(t, 0, len(teams), "Should return empty when one bookmaker missing")
	})

	t.Run("Extract for different sport", func(t *testing.T) {
		leagues, teams := extractMatchData(matchData, "pinnacle", "fonbet", "basketball")

		// fonbet has no basketball data, so returns empty
		assert.Equal(t, 0, len(leagues), "Should return empty when second bookmaker has no data for sport")
		assert.Equal(t, 0, len(teams), "Should return empty when second bookmaker has no data for sport")
	})
}

// TestExtractMatchData_EmptyInput tests empty input
func TestExtractMatchData_EmptyInput(t *testing.T) {
	matchData := []entity.MatchData{}
	leagues, teams := extractMatchData(matchData, "pinnacle", "fonbet", "soccer")

	assert.Equal(t, 0, len(leagues), "Should have no leagues")
	assert.Equal(t, 0, len(teams), "Should have no teams")
}

// TestConvertTeamsPairsToResponse tests conversion of team pairs map to response slice
func TestConvertTeamsPairsToResponse(t *testing.T) {
	pairs := map[string]entity.UnMatchedTeamsPair{
		"key1": {
			LeagueIDFirst:       10,
			LeagueIDSecond:      20,
			BookmakerNameFirst:  "pinnacle",
			BookmakerNameSecond: "fonbet",
			LeagueNameFirst:     "Premier League",
			LeagueNameSecond:    "Английская Премьер Лига",
			TeamsFirst: map[int64]entity.UnMatchedTeam{
				1: {TeamID: 1, TeamName: "Manchester United"},
				2: {TeamID: 2, TeamName: "Chelsea"},
			},
			TeamsSecond: map[int64]entity.UnMatchedTeam{
				101: {TeamID: 101, TeamName: "Манчестер Юнайтед"},
				102: {TeamID: 102, TeamName: "Челси"},
			},
			SportName: "soccer",
		},
		"key2": {
			LeagueIDFirst:       30,
			LeagueIDSecond:      40,
			BookmakerNameFirst:  "pinnacle",
			BookmakerNameSecond: "fonbet",
			LeagueNameFirst:     "La Liga",
			LeagueNameSecond:    "Ла Лига",
			TeamsFirst: map[int64]entity.UnMatchedTeam{
				3: {TeamID: 3, TeamName: "Real Madrid"},
			},
			TeamsSecond: map[int64]entity.UnMatchedTeam{
				103: {TeamID: 103, TeamName: "Реал Мадрид"},
			},
			SportName: "soccer",
		},
	}

	result := convertTeamsPairsToResponse(pairs)

	assert.Equal(t, 2, len(result), "Should have 2 responses")

	// Check that all pairs are converted
	foundKey1 := false
	foundKey2 := false
	for _, res := range result {
		if res.LeagueIDFirst == 10 {
			foundKey1 = true
			assert.Equal(t, 2, len(res.TeamsFirst))
			assert.Equal(t, 2, len(res.TeamsSecond))
		}
		if res.LeagueIDFirst == 30 {
			foundKey2 = true
			assert.Equal(t, 1, len(res.TeamsFirst))
			assert.Equal(t, 1, len(res.TeamsSecond))
		}
	}
	assert.True(t, foundKey1, "Should find first pair")
	assert.True(t, foundKey2, "Should find second pair")
}

// TestConvertTeamsPairsToResponse_EmptyInput tests empty input
func TestConvertTeamsPairsToResponse_EmptyInput(t *testing.T) {
	pairs := map[string]entity.UnMatchedTeamsPair{}
	result := convertTeamsPairsToResponse(pairs)

	assert.Equal(t, 0, len(result), "Should have no results for empty input")
}

// TestGroupTeamsPairs tests grouping of teams into pairs
func TestGroupTeamsPairs(t *testing.T) {
	unMatchedTeams := []entity.UnMatchedTeamsByLeaguesPG{
		{
			TeamID:        1,
			TeamName:      "Team A",
			LeagueID:      10,
			LeagueName:    "League 1",
			BookmakerName: "pinnacle",
			LeagueMatchID: int64(1),
		},
		{
			TeamID:        2,
			TeamName:      "Team B",
			LeagueID:      10,
			LeagueName:    "League 1",
			BookmakerName: "pinnacle",
			LeagueMatchID: int64(1),
		},
		{
			TeamID:        101,
			TeamName:      "Команда A",
			LeagueID:      20,
			LeagueName:    "Лига 1",
			BookmakerName: "fonbet",
			LeagueMatchID: int64(1),
		},
		{
			TeamID:        102,
			TeamName:      "Команда B",
			LeagueID:      20,
			LeagueName:    "Лига 1",
			BookmakerName: "fonbet",
			LeagueMatchID: int64(1),
		},
	}

	pairs := groupTeamsPairs(unMatchedTeams, "pinnacle", "soccer")

	assert.Equal(t, 1, len(pairs), "Should create 1 pair")

	for _, pair := range pairs {
		assert.Equal(t, "pinnacle", pair.BookmakerNameFirst)
		assert.Equal(t, "fonbet", pair.BookmakerNameSecond)
		assert.Equal(t, 2, len(pair.TeamsFirst))
		assert.Equal(t, 2, len(pair.TeamsSecond))
		assert.Equal(t, "soccer", pair.SportName)
	}
}

// TestGroupTeamsPairs_MultipleLeagues tests multiple league pairs
func TestGroupTeamsPairs_MultipleLeagues(t *testing.T) {
	unMatchedTeams := []entity.UnMatchedTeamsByLeaguesPG{
		// League pair 1
		{TeamID: 1, TeamName: "Team A1", LeagueID: 10, LeagueName: "League 1", BookmakerName: "pinnacle", LeagueMatchID: 1},
		{TeamID: 101, TeamName: "Команда A1", LeagueID: 20, LeagueName: "Лига 1", BookmakerName: "fonbet", LeagueMatchID: 1},
		// League pair 2
		{TeamID: 2, TeamName: "Team A2", LeagueID: 30, LeagueName: "League 2", BookmakerName: "pinnacle", LeagueMatchID: 2},
		{TeamID: 102, TeamName: "Команда A2", LeagueID: 40, LeagueName: "Лига 2", BookmakerName: "fonbet", LeagueMatchID: 2},
	}

	pairs := groupTeamsPairs(unMatchedTeams, "pinnacle", "soccer")

	assert.Equal(t, 2, len(pairs), "Should create 2 pairs for different leagues")
}
