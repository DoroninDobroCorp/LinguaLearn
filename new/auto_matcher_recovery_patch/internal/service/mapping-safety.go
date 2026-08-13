package service

import (
	"math"
	"strings"
	"time"

	"livebets/auto_matcher/internal/entity"
)

func validLLMConfidence(confidence, minimum float64) bool {
	return !math.IsNaN(confidence) && !math.IsInf(confidence, 0) && confidence >= minimum && confidence <= 1
}

const (
	maximumAutomaticMappingStartDelta = 30 * time.Minute
	prematchStartGrace                = 5 * time.Minute
	minimumLLMCandidateConfidence     = 0.70
	minimumAutomaticLeagueConfidence  = 0.95
)

func exactMappingName(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(value)), " ")
}

func exactMappingNamesEqual(first, second string) bool {
	first = exactMappingName(first)
	second = exactMappingName(second)
	return first != "" && first == second
}

func mappingMatchInContext(match entity.MatchData, bookmaker, sport, league string, now time.Time, prematch bool) bool {
	if match.MatchID == "" || match.Bookmaker != bookmaker || match.SportName != sport || match.LeagueName != league {
		return false
	}
	if match.MatchDate.IsZero() {
		return false
	}
	return !prematch || !match.MatchDate.Before(now.Add(-prematchStartGrace))
}

func mappingStartTimesCompatible(first, second time.Time) bool {
	if first.IsZero() || second.IsZero() {
		return false
	}
	delta := first.Sub(second)
	if delta < 0 {
		delta = -delta
	}
	return delta <= maximumAutomaticMappingStartDelta
}

type fixtureTeamSide uint8

const (
	fixtureTeamUnknown fixtureTeamSide = iota
	fixtureTeamHome
	fixtureTeamAway
)

func findExactTeamSide(match entity.MatchData, teamName string) (fixtureTeamSide, string, bool) {
	home := exactMappingNamesEqual(match.HomeName, teamName)
	away := exactMappingNamesEqual(match.AwayName, teamName)
	if home == away {
		return fixtureTeamUnknown, "", false
	}
	if home {
		return fixtureTeamHome, match.AwayName, true
	}
	return fixtureTeamAway, match.HomeName, true
}

// strictExactTeamFixtureEvidence permits an automatic team mapping only when
// there is exactly one current fixture pair proving it. The candidate and its
// opponent must both match exactly (case/whitespace aside), on the same side,
// under the exact sport/bookmaker/league context and within the start window.
func strictExactTeamFixtureEvidence(
	matches []entity.MatchData,
	sport string,
	bookmakers [2]string,
	leagues [2]string,
	teamNames [2]string,
	now time.Time,
	prematch bool,
) bool {
	if !exactMappingNamesEqual(teamNames[0], teamNames[1]) {
		return false
	}

	evidence := make(map[string]struct{})
	for _, first := range matches {
		if !mappingMatchInContext(first, bookmakers[0], sport, leagues[0], now, prematch) {
			continue
		}
		firstSide, firstOpponent, ok := findExactTeamSide(first, teamNames[0])
		if !ok {
			continue
		}

		for _, second := range matches {
			if !mappingMatchInContext(second, bookmakers[1], sport, leagues[1], now, prematch) {
				continue
			}
			secondSide, secondOpponent, ok := findExactTeamSide(second, teamNames[1])
			if !ok || firstSide != secondSide {
				continue
			}
			if !exactMappingNamesEqual(firstOpponent, secondOpponent) {
				continue
			}
			if !mappingStartTimesCompatible(first.MatchDate, second.MatchDate) {
				continue
			}
			evidence[first.MatchID+"\x00"+second.MatchID] = struct{}{}
		}
	}

	// More than one supporting fixture is ambiguous (e.g. duplicate/wrong
	// schedule rows), so only one unique edge is accepted automatically.
	return len(evidence) == 1
}

// strictExactLeagueFixtureEvidence allows an automatic league mapping only
// for equal normalized league names and a non-ambiguous one-to-one set of
// fixtures whose home/away teams and scheduled starts agree exactly.
func strictExactLeagueFixtureEvidence(
	matches []entity.MatchData,
	sport string,
	bookmakers [2]string,
	leagues [2]string,
	now time.Time,
	prematch bool,
) bool {
	if !exactMappingNamesEqual(leagues[0], leagues[1]) {
		return false
	}

	edges := make(map[string]struct{})
	firstDegree := make(map[string]int)
	secondDegree := make(map[string]int)
	for _, first := range matches {
		if !mappingMatchInContext(first, bookmakers[0], sport, leagues[0], now, prematch) {
			continue
		}
		if !exactMappingNamesEqual(first.HomeName, first.HomeName) || !exactMappingNamesEqual(first.AwayName, first.AwayName) {
			continue
		}

		for _, second := range matches {
			if !mappingMatchInContext(second, bookmakers[1], sport, leagues[1], now, prematch) {
				continue
			}
			if !exactMappingNamesEqual(first.HomeName, second.HomeName) || !exactMappingNamesEqual(first.AwayName, second.AwayName) {
				continue
			}
			if !mappingStartTimesCompatible(first.MatchDate, second.MatchDate) {
				continue
			}

			edgeKey := first.MatchID + "\x00" + second.MatchID
			if _, exists := edges[edgeKey]; exists {
				continue
			}
			edges[edgeKey] = struct{}{}
			firstDegree[first.MatchID]++
			secondDegree[second.MatchID]++
		}
	}

	if len(edges) == 0 {
		return false
	}
	for _, degree := range firstDegree {
		if degree != 1 {
			return false
		}
	}
	for _, degree := range secondDegree {
		if degree != 1 {
			return false
		}
	}
	return true
}
