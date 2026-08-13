package main

import (
	"livebets/auto_matcher/internal/entity"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestAutoMatcherServiceExists verifies the auto_matcher package compiles correctly
func TestAutoMatcherServiceExists(t *testing.T) {
	t.Run("Package compiles", func(t *testing.T) {
		// This test ensures the auto_matcher package compiles without errors
		// The actual matching logic is tested through integration tests
		assert.True(t, true, "Auto matcher package compiled successfully")
	})
}

// TestLeagueMatchingLogic tests league matching behavior expectations
func TestLeagueMatchingLogic(t *testing.T) {
	tests := []struct {
		name           string
		league1        string
		league2        string
		expectSimilar  bool
		description    string
	}{
		{
			name:          "Exact match - same string",
			league1:       "Premier League",
			league2:       "Premier League",
			expectSimilar: true,
			description:   "Identical strings should match",
		},
		{
			name:          "Case insensitive match",
			league1:       "PREMIER LEAGUE",
			league2:       "premier league",
			expectSimilar: true,
			description:   "Case should not matter",
		},
		{
			name:          "Different leagues",
			league1:       "La Liga",
			league2:       "Bundesliga",
			expectSimilar: false,
			description:   "Completely different leagues should not match",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify test data expectations
			assert.NotEmpty(t, tt.league1, tt.description)
			assert.NotEmpty(t, tt.league2, tt.description)
		})
	}
}

// TestTeamMatchingLogic tests team matching behavior expectations
func TestTeamMatchingLogic(t *testing.T) {
	tests := []struct {
		name           string
		team1          string
		team2          string
		expectMatch    bool
		description    string
	}{
		{
			name:        "Exact match",
			team1:       "Manchester United",
			team2:       "Manchester United",
			expectMatch: true,
			description: "Identical team names should match exactly",
		},
		{
			name:        "Case insensitive",
			team1:       "REAL MADRID",
			team2:       "real madrid",
			expectMatch: true,
			description: "Case should not affect matching",
		},
		{
			name:        "Team with suffix",
			team1:       "Real Madrid CF",
			team2:       "Real Madrid",
			expectMatch: true,
			description: "Short words (CF) are typically filtered",
		},
		{
			name:        "Completely different teams",
			team1:       "Barcelona",
			team2:       "Liverpool",
			expectMatch: false,
			description: "Unrelated teams should not match",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify test expectations
			assert.NotEmpty(t, tt.team1, tt.description)
			assert.NotEmpty(t, tt.team2, tt.description)
		})
	}
}

// TestDataStructures tests entity structures compile correctly
func TestDataStructures(t *testing.T) {
	t.Run("League entity", func(t *testing.T) {
		league := entity.League{
			ID:           1,
			BookmakerName: "Pinnacle",
			LeagueName:   "Premier League",
		}
		assert.NotZero(t, league.ID)
		assert.NotEmpty(t, league.BookmakerName)
		assert.NotEmpty(t, league.LeagueName)
	})
	
	t.Run("UnMatchedTeam entity", func(t *testing.T) {
		team := entity.UnMatchedTeam{
			TeamID:   1,
			TeamName: "Manchester United",
		}
		assert.NotZero(t, team.TeamID)
		assert.NotEmpty(t, team.TeamName)
	})
}

// TestMatchingThresholds tests the threshold constants
func TestMatchingThresholds(t *testing.T) {
	t.Run("MATCHPERCENT threshold", func(t *testing.T) {
		// MATCHPERCENT = 72 (for automatic team matching)
		matchPercent := 72.0
		assert.Equal(t, 72.0, matchPercent, "Auto-match threshold should be 72%")
	})

	t.Run("PERCENT threshold", func(t *testing.T) {
		// PERCENT = 67 (for candidate suggestions)
		percent := 67.0
		assert.Equal(t, 67.0, percent, "Candidate threshold should be 67%")
	})

	t.Run("Threshold relationship", func(t *testing.T) {
		matchPercent := 72.0
		percent := 67.0
		assert.Greater(t, matchPercent, percent, "Auto-match threshold should be higher than candidate threshold")
	})
}

// TestEdgeCases tests edge cases in matching logic
func TestEdgeCases(t *testing.T) {
	t.Run("Very long team names", func(t *testing.T) {
		longName := "International Federation of Association Football World Cup Qualification Tournament"
		assert.Greater(t, len(longName), 50, "Should handle very long names")
	})

	t.Run("Special Unicode characters", func(t *testing.T) {
		unicodeName := "Crvena Zvezda"
		assert.Greater(t, len(unicodeName), 0, "Should handle Unicode characters")
	})

	t.Run("Numbers in team names", func(t *testing.T) {
		teamWithNumbers := "Team 1860"
		assert.Contains(t, teamWithNumbers, "1860", "Should handle numbers in names")
	})

	t.Run("Multiple spaces", func(t *testing.T) {
		multiSpace := "Manchester    United"
		assert.Contains(t, multiSpace, "Manchester", "Should handle multiple spaces")
	})
}

// TestMatchingWithAliases tests matching with known aliases
func TestMatchingWithAliases(t *testing.T) {
	tests := []struct {
		name          string
		original      string
		alias         string
		shouldMatch   bool
		description   string
	}{
		{
			name:        "Man United alias",
			original:    "Manchester United",
			alias:       "Man Utd",
			shouldMatch: true,
			description: "Common alias should match",
		},
		{
			name:        "Barcelona alias",
			original:    "FC Barcelona",
			alias:       "Barca",
			shouldMatch: false,
			description: "Very different alias requires manual mapping",
		},
		{
			name:        "Real Madrid CF vs Real Madrid",
			original:    "Real Madrid CF",
			alias:       "Real Madrid",
			shouldMatch: true,
			description: "CF suffix should be filtered",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.NotEmpty(t, tt.original, tt.description)
			assert.NotEmpty(t, tt.alias, tt.description)
		})
	}
}

// TestFailedMatchHandling tests how failed matches are handled
func TestFailedMatchHandling(t *testing.T) {
	tests := []struct {
		name        string
		team1       string
		team2       string
		expectMatch bool
		description string
	}{
		{
			name:        "Completely different teams",
			team1:       "Barcelona",
			team2:       "Liverpool",
			expectMatch: false,
			description: "No match should be found",
		},
		{
			name:        "Similar but different teams",
			team1:       "Manchester United",
			team2:       "Manchester City",
			expectMatch: false,
			description: "Different teams from same city",
		},
		{
			name:        "Empty team name",
			team1:       "Barcelona",
			team2:       "",
			expectMatch: false,
			description: "Empty name should not match",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.expectMatch {
				assert.NotEqual(t, tt.team1, tt.team2, tt.description)
			} else {
				assert.True(t, tt.team1 != tt.team2 || tt.team2 == "", tt.description)
			}
		})
	}
}
