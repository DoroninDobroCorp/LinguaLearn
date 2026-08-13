package entity

import "time"

type UserIDCache struct {
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
}
