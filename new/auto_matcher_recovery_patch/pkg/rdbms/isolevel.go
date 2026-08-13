package rdbms

type TXIsoLevel int8

const (
	// TXIsoLevelDefault doesn't specify any transaction isolation level, instead the connection
	// based setting will be used.
	TXIsoLevelDefault TXIsoLevel = iota

	// TXIsoLevelReadCommitted means "A statement can only see rows committed before it began".
	TXIsoLevelReadCommitted

	// TXIsoLevelRepeatableRead means "All statements of the current transaction can only see rows committed before the
	// first query or data-modification statement was executed in this transaction".
	TXIsoLevelRepeatableRead

	// TXIsoLevelSerializable means "All statements of the current transaction can only see rows committed
	// before the first query or data-modification statement was executed in this transaction.
	// If a pattern of reads and writes among concurrent serializable transactions would create a
	// situation which could not have occurred for any serial (one-at-a-time) execution of those
	// transactions, one of them will be rolled back with a serialization_failure error".
	TXIsoLevelSerializable
)

func (l TXIsoLevel) String() string {
	switch l {
	case TXIsoLevelReadCommitted:
		return "READ COMMITTED"
	case TXIsoLevelRepeatableRead:
		return "REPEATABLE READ"
	case TXIsoLevelSerializable:
		return "SERIALIZABLE"
	default:
		return ""
	}
}
