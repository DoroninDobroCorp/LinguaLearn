package entity

import "time"

type Price struct {
	Bookmaker string    `json:"bookmaker"`
	Score     float64   `json:"score"`
	CreatedAt time.Time `json:"createdAt"`
}

type PriceRecord struct {
	Key       string    `json:"key"`
	First     Price     `json:"first"`
	Second    Price     `json:"second"`
	Outcome   string    `json:"outcome"`
	ROI       float64   `json:"roi"`
	Margin    float64   `json:"margin"`
	CreatedAt time.Time `json:"createdAt"`
}
type ResponsePriceRecords struct {
	ISave   int           `json:"isave"`
	Records []PriceRecord `json:"records"`
}

type RequestPriceRecordsByTime struct {
	Bookmaker1 string `json:"bookmaker1"`
	Bookmaker2 string `json:"bookmaker2"`
	MatchID1   string `json:"matchID1"`
	MatchID2   string `json:"matchID2"`
	SportName  string `json:"sportName"`
	Outcome    string `json:"outcome"`

	Minutes  int   `json:"minutes"`
	Seconds  int   `json:"seconds"`
	LongTime int64 `json:"longTime"`
}
