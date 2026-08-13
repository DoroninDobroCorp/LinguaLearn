package domain

// Parser represents a bookmaker/data source
type Parser string

const (
	Pinnacle    Parser = "Pinnacle"
	Lobbet      Parser = "Lobbet"
	Ladbrokes   Parser = "Ladbrokes"
	Betcenter   Parser = "Betcenter"
	Sansabet    Parser = "Sansabet"
	StarCasino  Parser = "StarCasino"
	Unibet      Parser = "Unibet"
	Hatbet      Parser = "Hatbet"
	Zlatnik     Parser = "Zlatnik"
	Soccerbet   Parser = "Soccerbet"
	Fonbet      Parser = "Fonbet"
	Sbbet       Parser = "Sbbet"
	Maxbet      Parser = "Maxbet"
	PinnacleOur Parser = "Pinnacle_Our"
	Serge       Parser = "Serge"
	Pinnacle888 Parser = "Pinnacle888"
	Volcano     Parser = "Volcano"
	VBet        Parser = "VBet"
	Betfair     Parser = "Betfair"

	// Legacy aliases for backwards compatibility
	PINNACLE     = Pinnacle
	LOBBET       = Lobbet
	LADBROKES    = Ladbrokes
	BETCENTER    = Betcenter
	SANSABET     = Sansabet
	STARCASINO   = StarCasino
	UNIBET       = Unibet
	HATBET       = Hatbet
	ZLATNIK      = Zlatnik
	SOCCERBET    = Soccerbet
	FONBET       = Fonbet
	SBBET        = Sbbet
	MAXBET       = Maxbet
	PINNACLE_OUR = PinnacleOur
	SERGE        = Serge
	PINNACLE888  = Pinnacle888
	VOLCANO      = Volcano
	VBET         = VBet
	BETFAIR      = Betfair
)

// String returns string representation of Parser
func (p Parser) String() string {
	return string(p)
}

// IsValid checks if parser value is valid
func (p Parser) IsValid() bool {
	switch p {
	case Pinnacle, Lobbet, Ladbrokes, Betcenter, Sansabet,
		StarCasino, Unibet, Hatbet, Zlatnik, Soccerbet, Fonbet, Sbbet, Maxbet,
		PinnacleOur, Serge, Pinnacle888, Volcano, VBet, Betfair:
		return true
	}
	return false
}

// AllParsers returns list of all valid parsers
func AllParsers() []Parser {
	return []Parser{
		Pinnacle, Lobbet, Ladbrokes, Betcenter, Sansabet,
		StarCasino, Unibet, Hatbet, Zlatnik, Soccerbet, Fonbet, Sbbet, Maxbet,
		PinnacleOur, Serge, Pinnacle888, Volcano, VBet, Betfair,
	}
}
