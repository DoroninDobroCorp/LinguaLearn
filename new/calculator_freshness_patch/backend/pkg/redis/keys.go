package redis

import (
	"fmt"
	"sort"
)

const (
	Delimiter = "/"
	Live      = "live"
	Prematch  = "prematch"
	Pairs     = "pairs"
	Parser    = "parser"
)

// ParserKey returns key for parser data: parser/{live|prematch}/{bookmaker}
func ParserKey(isLive bool, bookmaker string) string {
	mode := Prematch
	if isLive {
		mode = Live
	}
	return fmt.Sprintf("%s%s%s%s%s", Parser, Delimiter, mode, Delimiter, bookmaker)
}

// PairsKey returns key for pairs: pairs/{live|prematch}/{bm1}/{bm2} (sorted)
func PairsKey(isLive bool, bookmaker1, bookmaker2 string) string {
	mode := Prematch
	if isLive {
		mode = Live
	}

	names := []string{bookmaker1, bookmaker2}
	sort.Strings(names) // Ensure consistent ordering

	return fmt.Sprintf("%s%s%s%s%s%s%s", Pairs, Delimiter, mode, Delimiter, names[0], Delimiter, names[1])
}

// ParserPattern returns pattern for matching parser keys
func ParserPattern(isLive bool, includeAll bool) string {
	if includeAll {
		return fmt.Sprintf("%s%s*", Parser, Delimiter)
	}

	mode := Prematch
	if isLive {
		mode = Live
	}
	return fmt.Sprintf("%s%s%s%s*", Parser, Delimiter, mode, Delimiter)
}

// PairsPattern returns pattern for matching pairs keys
func PairsPattern(isLive bool, includeAll bool) string {
	if includeAll {
		return fmt.Sprintf("%s%s*", Pairs, Delimiter)
	}

	mode := Prematch
	if isLive {
		mode = Live
	}
	return fmt.Sprintf("%s%s%s%s*", Pairs, Delimiter, mode, Delimiter)
}

// Legacy function aliases (for backward compatibility during migration)
func GetRKeyParser(isLive bool, bookmaker string) string {
	return ParserKey(isLive, bookmaker)
}

func GetRKeyPairs(isLive bool, bookmaker1, bookmaker2 string) string {
	return PairsKey(isLive, bookmaker1, bookmaker2)
}

func GetRAllKeysParser(isAll, isLive bool) string {
	return ParserPattern(isLive, isAll)
}

func GetRAllKeysPairs(isAll, isLive bool) string {
	return PairsPattern(isLive, isAll)
}
