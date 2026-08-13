package utils

import (
	"crypto/md5"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"log"
	"sort"
	"sync"
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

func GenerateKeyForCandidate(val1, val2 int64) string {
	return fmt.Sprintf("%d-%d", val1, val2)
}

// OPTIMIZED: Cache for frequently used keys (hot path optimization)
var matchKeyCache sync.Map

// GenerateFullMatchKey creates a unique key for match pair
// OPTIMIZED: Uses string builder pool, efficient hashing, and caching
// TEST: Verify key collision rate is 0 (critical for correctness!)
func GenerateFullMatchKey(book1, book2, matchID1, matchID2, sport, outcome string) string {
	// Try cache first
	cacheKey := book1 + "|" + book2 + "|" + matchID1 + "|" + matchID2 + "|" + sport + "|" + outcome
	if cached, ok := matchKeyCache.Load(cacheKey); ok {
		return cached.(string)
	}
	
	// OPTIMIZED: Preallocate slice with exact capacity
	str := make([]string, 6)
	str[0] = book1
	str[1] = book2
	str[2] = matchID1
	str[3] = matchID2
	str[4] = sport
	str[5] = outcome

	sort.Strings(str)

	// OPTIMIZED: Use string builder from pool instead of fmt.Sprintf
	sb := GetStringBuilder()
	defer PutStringBuilder(sb)
	
	// Pre-calculate capacity
	totalLen := len(str[0]) + len(str[1]) + len(str[2]) + len(str[3]) + len(str[4]) + len(str[5])
	sb.Grow(totalLen)
	
	for _, s := range str {
		sb.WriteString(s)
	}
	
	hash := md5.Sum([]byte(sb.String()))
	result := hex.EncodeToString(hash[:])
	
	// Store in cache
	matchKeyCache.Store(cacheKey, result)
	
	return result
}

// ClearMatchKeyCache clears the key cache
func ClearMatchKeyCache() {
	matchKeyCache.Range(func(key, value interface{}) bool {
		matchKeyCache.Delete(key)
		return true
	})
}
