package domain

// SportName represents a sport type
type SportName string

const (
	Soccer           SportName = "Soccer"
	Tennis           SportName = "Tennis"
	Basketball       SportName = "Basketball"
	Volleyball       SportName = "Volleyball"
	Handball         SportName = "Handball"
	Hockey           SportName = "Hockey"
	TableTennis      SportName = "TableTennis"
	AmericanFootball SportName = "AmericanFootball"
	Baseball         SportName = "Baseball"
	Esports          SportName = "Esports"

	// Legacy aliases for backwards compatibility
	SOCCER           = Soccer
	TENNIS           = Tennis
	BASKETBALL       = Basketball
	VOLLEYBALL       = Volleyball
	HANDBALL         = Handball
	HOCKEY           = Hockey
	TABLETENNIS      = TableTennis
	AMERICANFOOTBALL = AmericanFootball
	BASEBALL         = Baseball
	ESPORTS          = Esports
)

// String returns string representation of SportName
func (s SportName) String() string {
	return string(s)
}

// IsValid checks if sport name is valid
func (s SportName) IsValid() bool {
	switch s {
	case Soccer, Tennis, Basketball, Volleyball, Handball, Hockey, TableTennis, AmericanFootball, Baseball, Esports:
		return true
	}
	return false
}

// AllSports returns list of all valid sports
func AllSports() []SportName {
	return []SportName{
		Soccer, Tennis, Basketball, Volleyball, Handball, Hockey, TableTennis, AmericanFootball, Baseball, Esports,
	}
}
