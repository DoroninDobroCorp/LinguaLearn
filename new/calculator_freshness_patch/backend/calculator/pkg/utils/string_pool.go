package utils

import (
	"strings"
	"sync"
)

// StringBuilderPool provides reusable strings.Builder instances
// to reduce allocations in hot paths (CSV building, key generation, etc.)
var StringBuilderPool = sync.Pool{
	New: func() interface{} {
		return &strings.Builder{}
	},
}

// GetStringBuilder gets a builder from pool
func GetStringBuilder() *strings.Builder {
	return StringBuilderPool.Get().(*strings.Builder)
}

// PutStringBuilder returns builder to pool after Reset
func PutStringBuilder(sb *strings.Builder) {
	sb.Reset()
	StringBuilderPool.Put(sb)
}
