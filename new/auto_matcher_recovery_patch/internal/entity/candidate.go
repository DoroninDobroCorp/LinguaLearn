package entity

type LeagueCandidate struct {
	BookmakerName string
	LeagueName    string
	LeagueID      int64
}

type LeagueCandidatePair struct {
	First      LeagueCandidate
	Second     LeagueCandidate
	SportName  string
	Similarity float64
}

type TeamCandidate struct {
	BookmakerName string
	LeagueName    string
	LeagueID      int64
	TeamName      string
	TeamID        int64
}

type TeamCandidatePair struct {
	First      TeamCandidate
	Second     TeamCandidate
	SportName  string
	Similarity float64
}
