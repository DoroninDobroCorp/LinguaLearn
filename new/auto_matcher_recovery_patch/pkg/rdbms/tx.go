package rdbms

import "context"

type TxStorage[Storage any] interface {
	Storage() Storage
	Begin(ctx context.Context, isoLevel TXIsoLevel) (Tx[Storage], error)
}

type Tx[Storage any] interface {
	Storage() Storage
	Commit(context.Context) error
	Rollback(context.Context) error
}
