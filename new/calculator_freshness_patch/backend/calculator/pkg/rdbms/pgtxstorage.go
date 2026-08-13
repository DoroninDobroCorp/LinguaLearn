package rdbms

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StorageFactory is used to create a new Storage instance.
type StorageFactory[Storage any] func(Executor) Storage

// PGTxStorage is TxStorage implementation template around pgxpool.Pool
// each package uses its own version with generic type
// replaced with concrete package's Storage.
type PGTxStorage[Storage any] struct {
	db       *pgxpool.Pool
	store    Storage
	sFactory StorageFactory[Storage]
}

// NewPgTxStorage returns an instance of PGTxStorage.
func NewPgTxStorage[Storage any](database *pgxpool.Pool, factory StorageFactory[Storage]) *PGTxStorage[Storage] {
	return &PGTxStorage[Storage]{
		db:       database,
		store:    factory(database),
		sFactory: factory,
	}
}

// Storage returns underlying Storage object.
func (txr *PGTxStorage[Storage]) Storage() Storage {
	return txr.store
}

var isoLevelMap = map[TXIsoLevel]pgx.TxIsoLevel{
	TXIsoLevelReadCommitted:  pgx.ReadCommitted,
	TXIsoLevelRepeatableRead: pgx.RepeatableRead,
	TXIsoLevelSerializable:   pgx.Serializable,
	TXIsoLevelDefault:        pgx.ReadCommitted,
}

// Begin starts a database transaction.
func (txr *PGTxStorage[Storage]) Begin(ctx context.Context, isoLevel TXIsoLevel) (Tx[Storage], error) {
	sqlIsolationLvl, ok := isoLevelMap[isoLevel]
	if !ok {
		return nil, fmt.Errorf("unknown tx isolation level: %s", isoLevel)
	}

	txOptions := pgx.TxOptions{IsoLevel: sqlIsolationLvl}
	tx, err := txr.db.BeginTx(ctx, txOptions)
	if err != nil {
		return nil, err
	}

	txObject := &PGTransaction[Storage]{
		tx:    tx,
		store: txr.sFactory(tx),
	}

	return txObject, nil
}

type PGTransaction[Storage any] struct {
	tx    pgx.Tx
	store Storage
}

func (pgtx *PGTransaction[Storage]) Commit(ctx context.Context) error {
	return pgtx.tx.Commit(ctx)
}

func (pgtx *PGTransaction[Storage]) Rollback(ctx context.Context) error {
	return pgtx.tx.Rollback(ctx)
}

func (pgtx *PGTransaction[Storage]) Storage() Storage {
	return pgtx.store
}
