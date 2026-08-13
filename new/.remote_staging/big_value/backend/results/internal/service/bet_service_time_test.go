package service

import (
	"livebets/results/internal/entity"
	"testing"
	"time"
)

func TestOriginalBetCreatedAtPrefersImmutablePayloadTimestamp(t *testing.T) {
	payloadTime := time.Date(2026, time.March, 16, 10, 31, 29, 629000000, time.UTC)
	mutatedDatabaseTime := time.Date(2026, time.August, 8, 10, 31, 29, 633921000, time.UTC)
	bet := &entity.LogBetAccept{
		CreatedAt: mutatedDatabaseTime,
		Data: map[string]interface{}{
			"pair": map[string]interface{}{
				"createdAt": payloadTime.Format(time.RFC3339Nano),
			},
		},
	}

	if got := originalBetCreatedAt(bet); !got.Equal(payloadTime) {
		t.Fatalf("expected payload timestamp %s, got %s", payloadTime, got)
	}
}

func TestOriginalBetCreatedAtFallsBackToDatabaseTimestamp(t *testing.T) {
	databaseTime := time.Date(2026, time.August, 8, 10, 31, 29, 0, time.UTC)
	bet := &entity.LogBetAccept{CreatedAt: databaseTime, Data: map[string]interface{}{}}

	if got := originalBetCreatedAt(bet); !got.Equal(databaseTime) {
		t.Fatalf("expected database fallback %s, got %s", databaseTime, got)
	}
}
