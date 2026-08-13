package entity

type AcceptBet struct {
	Pair     PairOneOutcome         `json:"pair" validate:"required"`
	Bet      CalculatedBetWithUsers `json:"bet" validate:"required"`
	Sum      float64                `json:"sum" validate:"required,positive"`
	Coef     float64                `json:"coef" validate:"required,coef_min"`
	Time     string                 `json:"time" validate:"required"`
	UserId   int                    `json:"userId" validate:"required,gt=0"`
	Strategy string                 `json:"strategy"` // fast/slow/fast_high/slow_high/frontend/manual (optional, defaults to 'frontend')
	IsTest   bool                   `json:"isTest"` // legacy field; retired test-bet flow is rejected by the API
}
