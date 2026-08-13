package entity

type Sport string

const FootballID Sport = "F"
const TennisID Sport = "T"
const BasketballID Sport = "B"
const HandballID Sport = "H"
const VolleyballID Sport = "V"
const TableTennisID Sport = "TT"
const HockeyID Sport = "IH"
const AmericanFootballID Sport = "AF"
const BaseballID Sport = "BB"

// SportName для отправки в analyzer (должен совпадать с Pinnacle)
type SportName string

const (
	SportSoccer            SportName = "Soccer"
	SportTennis            SportName = "Tennis"
	SportBasketball        SportName = "Basketball"
	SportVolleyball        SportName = "Volleyball"
	SportHandball          SportName = "Handball"
	SportTableTennis       SportName = "Tabletennis"
	SportHockey            SportName = "Hockey"
	SportAmericanFootball  SportName = "AmericanFootball"
	SportBaseball          SportName = "Baseball"
	SportEsports           SportName = "Esports"
)
