package rdbms

import (
	"livebets/pkg/pgsql/cluster"

	"golang.org/x/exp/constraints"
)

type StoragePoolFactory[Storage any] func(Executor) Storage

type PGTxPoolStorage[ShardKey constraints.Integer, Storage any] struct {
	pool map[cluster.Node[ShardKey]]TxStorage[Storage]
}

func NewPGTxPoolStorage[ShardKey constraints.Integer, Storage any](
	cl cluster.Cluster[ShardKey],
	storageFactory StoragePoolFactory[Storage],
) *PGTxPoolStorage[ShardKey, Storage] {
	storage := &PGTxPoolStorage[ShardKey, Storage]{}
	pool := make(map[cluster.Node[ShardKey]]TxStorage[Storage])
	for _, node := range cl.Nodes() {
		pool[node] = NewPgTxStorage(node.DB(), StorageFactory[Storage](storageFactory))
	}
	storage.pool = pool
	return storage
}

func (s *PGTxPoolStorage[ShardKey, Storage]) GetStorage(shardKey ShardKey) TxStorage[Storage] {
	for node := range s.pool {
		if node.Match(shardKey) {
			return s.pool[node]
		}
	}

	return nil
}

func (s *PGTxPoolStorage[ShardKey, Storage]) GetAllStorage() []TxStorage[Storage] {
	storages := make([]TxStorage[Storage], 0, len(s.pool))
	for _, storage := range s.pool {
		storages = append(storages, storage)
	}
	return storages
}
