package cluster

import (
	"fmt"
	"livebets/pkg/pgsql"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/exp/constraints"
)

type Node[ShardKey constraints.Integer] interface {
	fmt.Stringer
	DB() *pgxpool.Pool
	Match(key ShardKey) bool
}

type pgxNode[ShardKey constraints.Integer] struct {
	db      *pgsql.Postgres
	name    string
	matcher ShardingStrategy[ShardKey]
}

func NewNode[ShardKey constraints.Integer](db *pgsql.Postgres, name string, matcher ShardingStrategy[ShardKey]) Node[ShardKey] {
	n := &pgxNode[ShardKey]{
		db:      db,
		name:    name,
		matcher: matcher,
	}

	return n
}

func (n *pgxNode[ShardKey]) DB() *pgxpool.Pool {
	return n.db.Pool
}

func (n *pgxNode[ShardKey]) Match(key ShardKey) bool {
	return n.matcher.Match(key)
}

// String implements Stringer.
func (n *pgxNode[ShardKey]) String() string {
	return n.name
}
