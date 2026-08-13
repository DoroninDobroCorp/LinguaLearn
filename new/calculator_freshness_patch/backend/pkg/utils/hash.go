package utils

import (
	"crypto/sha1"
	"encoding/hex"
	"log"
)

// Генерация ключа матча
func GenerateMatchKey(home, away string) string {
	const emptyHash = "da39a3ee5e6b4b0d3255bfef95601890afd80709"

	h1 := sha1.Sum([]byte(home))
	h2 := sha1.Sum([]byte(away))

	hexH1 := hex.EncodeToString(h1[:])
	hexH2 := hex.EncodeToString(h2[:])

	if hexH1 == emptyHash || hexH2 == emptyHash {
		log.Printf("[WARNING] One of the teams has an empty hash: home hash = %s, away hash = %s", hexH1, hexH2)
	}

	return hexH1 + hexH2
}