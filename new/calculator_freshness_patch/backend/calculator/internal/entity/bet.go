package entity

import (
	"time"
)

type CalculatedBet struct {
	OriginalAmount float64 `json:"originalAmount"`
	AdjustedAmount float64 `json:"adjustedAmount"`
	Percentage     float64 `json:"percentage"`
}

type CalculatedBetWithUsers struct {
	CalcBet    CalculatedBet `json:"calcBet"`
	UsersCount int           `json:"usersCount"`
}

// TotalPercent tracks money already committed to a match.
// Prevents over-betting on same match (risk management).
//
// IsLive determines TTL:
// - Live matches: 4 hours (match finishes quickly)
// - Prematch: 72 hours (bet days before match starts)
//
// When match transitions prematch→live, CreatedAt resets to extend protection.
type TotalPercent struct {
	TotalPercent float64   `json:"totalPercent"`
	CreatedAt    time.Time `json:"createdAt"`
	IsLive       bool      `json:"isLive"`  // Match type: true=live, false=prematch
}

type TotalPercentByKey struct {
	KeyMatch     string  `json:"keyMatch"`
	TotalPercent float64 `json:"totalPercent"`
}

type BetFile struct {
	MatchName string  `json:"match_name"`
	BetType   string  `json:"bet_type"`
	Amount    float64 `json:"amount"`
	Odds      float64 `json:"odds"`
}

type MissedBet struct {
	KeyMatch string         `json:"key_match"`
	Pair     PairOneOutcome `json:"pair"`
}

// LimitCheckResult contains comprehensive betting limit check results
// Used by CheckBettingLimits to return all limit states at once
type LimitCheckResult struct {
	Allowed             bool    `json:"allowed"`
	Reason              string  `json:"reason,omitempty"`
	GlobalPercentUsed   float64 `json:"globalPercentUsed"`
	RemainingPercent    float64 `json:"remainingPercent"`
	RemainingAmount     float64 `json:"remainingAmount"`
	KellyAmount         float64 `json:"kellyAmount"`
	BookmakerBetsCount  int     `json:"bookmakerBetsCount"`
	BookmakerMaxBets    int     `json:"bookmakerMaxBets"`
	KeyMatch            string  `json:"keyMatch"`
	Bookmaker           string  `json:"bookmaker"`
	Strategy            string  `json:"strategy"`
	// Safe opposite fields
	Mode                     string  `json:"mode,omitempty"`                     // "normal_limit", "safe_opposite_allowed", "safe_opposite_denied"
	SafeOppositeCreditPercent float64 `json:"safeOppositeCreditPercent,omitempty"` // Added back to available limit when candidate hedges existing bets
	WorstCasePercentUsed     float64 `json:"worstCasePercentUsed,omitempty"`     // Worst-case downside % (< gross when safe opposites exist)
	RemainingWorstCasePercent float64 `json:"remainingWorstCasePercent,omitempty"` // 100 - worstCasePercentUsed
	SafeOppositeOf           string  `json:"safeOppositeOf,omitempty"`           // Outcome string of the existing bet this is safe-opposite to
	CompatibilityFamily      string  `json:"compatibilityFamily,omitempty"`      // Canonical family of candidate
}
