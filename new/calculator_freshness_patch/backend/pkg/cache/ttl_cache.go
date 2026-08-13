package cache

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	cacheHitsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "cache_hits_total",
			Help: "Total number of cache hits",
		},
		[]string{"cache_type"},
	)

	cacheMissesTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "cache_misses_total",
			Help: "Total number of cache misses",
		},
		[]string{"cache_type"},
	)

	cacheEvictionsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "cache_evictions_total",
			Help: "Total number of cache evictions",
		},
		[]string{"cache_type", "reason"},
	)

	cacheSizeGauge = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "cache_size",
			Help: "Current cache size",
		},
		[]string{"cache_type"},
	)
)

type cacheEntry[V any] struct {
	value      V
	expiry     time.Time
	lastAccess time.Time
}

// TTLCache is a thread-safe cache with TTL and LRU eviction
type TTLCache[K comparable, V any] struct {
	mu        sync.RWMutex
	data      map[K]*cacheEntry[V]
	ttl       time.Duration
	maxSize   int
	cacheType string
	hits      uint64
	misses    uint64
}

// NewTTLCache creates a new TTL cache with LRU eviction
func NewTTLCache[K comparable, V any](maxSize int, ttl time.Duration, cacheType string) *TTLCache[K, V] {
	return &TTLCache[K, V]{
		data:      make(map[K]*cacheEntry[V]),
		ttl:       ttl,
		maxSize:   maxSize,
		cacheType: cacheType,
	}
}

// Write adds or updates a value in the cache
func (c *TTLCache[K, V]) Write(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	
	// If at max size and key doesn't exist, evict LRU
	if _, exists := c.data[key]; !exists && len(c.data) >= c.maxSize {
		c.evictLRU()
	}

	c.data[key] = &cacheEntry[V]{
		value:      value,
		expiry:     now.Add(c.ttl),
		lastAccess: now,
	}

	cacheSizeGauge.WithLabelValues(c.cacheType).Set(float64(len(c.data)))
}

// Read retrieves a value from the cache
func (c *TTLCache[K, V]) Read(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, exists := c.data[key]
	if !exists {
		c.misses++
		cacheMissesTotal.WithLabelValues(c.cacheType).Inc()
		var zero V
		return zero, false
	}

	// Check if expired
	if time.Now().After(entry.expiry) {
		delete(c.data, key)
		cacheEvictionsTotal.WithLabelValues(c.cacheType, "ttl").Inc()
		cacheSizeGauge.WithLabelValues(c.cacheType).Set(float64(len(c.data)))
		c.misses++
		cacheMissesTotal.WithLabelValues(c.cacheType).Inc()
		var zero V
		return zero, false
	}

	// Update access time for LRU
	entry.lastAccess = time.Now()
	c.hits++
	cacheHitsTotal.WithLabelValues(c.cacheType).Inc()
	return entry.value, true
}

// Delete removes a key from the cache
func (c *TTLCache[K, V]) Delete(key K) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.data, key)
	cacheSizeGauge.WithLabelValues(c.cacheType).Set(float64(len(c.data)))
}

// ReadAll returns all non-expired values
func (c *TTLCache[K, V]) ReadAll() map[K]V {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make(map[K]V)
	now := time.Now()

	for k, entry := range c.data {
		if now.Before(entry.expiry) {
			result[k] = entry.value
		}
	}

	return result
}

// Len returns the current size of the cache
func (c *TTLCache[K, V]) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.data)
}

// evictLRU removes the least recently used entry (caller must hold lock)
func (c *TTLCache[K, V]) evictLRU() {
	var oldestKey K
	var oldestTime time.Time
	first := true

	for k, entry := range c.data {
		if first || entry.lastAccess.Before(oldestTime) {
			oldestKey = k
			oldestTime = entry.lastAccess
			first = false
		}
	}

	if !first {
		delete(c.data, oldestKey)
		cacheEvictionsTotal.WithLabelValues(c.cacheType, "lru").Inc()
	}
}

// CleanExpired removes all expired entries
func (c *TTLCache[K, V]) CleanExpired() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	removed := 0

	for k, entry := range c.data {
		if now.After(entry.expiry) {
			delete(c.data, k)
			removed++
			cacheEvictionsTotal.WithLabelValues(c.cacheType, "ttl").Inc()
		}
	}

	if removed > 0 {
		cacheSizeGauge.WithLabelValues(c.cacheType).Set(float64(len(c.data)))
	}

	return removed
}

// Stats returns cache statistics
type CacheStats struct {
	Size    int
	Hits    uint64
	Misses  uint64
	HitRate float64
}

func (c *TTLCache[K, V]) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	total := c.hits + c.misses
	hitRate := 0.0
	if total > 0 {
		hitRate = float64(c.hits) / float64(total)
	}

	return CacheStats{
		Size:    len(c.data),
		Hits:    c.hits,
		Misses:  c.misses,
		HitRate: hitRate,
	}
}
