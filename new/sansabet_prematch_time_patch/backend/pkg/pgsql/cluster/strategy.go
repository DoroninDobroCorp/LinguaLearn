package cluster

import "golang.org/x/exp/constraints"

type ShardingStrategy[ShardKey constraints.Integer] interface {
	Match(key ShardKey) bool
}

type rangedSharding[ShardKey constraints.Integer] struct {
	low  ShardKey
	high ShardKey
}

func NewRangedSharding[ShardKey constraints.Integer](low, high ShardKey) ShardingStrategy[ShardKey] {
	return &rangedSharding[ShardKey]{low, high}
}

func (s *rangedSharding[ShardKey]) Match(key ShardKey) bool {
	return key >= s.low && key <= s.high
}
