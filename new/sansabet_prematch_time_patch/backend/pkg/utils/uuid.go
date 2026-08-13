package utils

import "github.com/google/uuid"

// GenerateUUID generates a new random UUID string
func GenerateUUID() string {
	return uuid.New().String()
}
