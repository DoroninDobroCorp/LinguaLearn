package pgsql

import (
	"context"
	"database/sql"
	"embed"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/rs/zerolog"
	migrate "github.com/rubenv/sql-migrate"
)

type Migrator struct {
	Context          context.Context
	Logger           *zerolog.Logger
	TableName        string
	SchemaName       string
	MigrationsFS     embed.FS
	ConnectionString string
	RootFS           string
	Driver           string
}

// Run executes embedded SQL scripts.
// For the time being only "up" migrations are supported.
func (m *Migrator) Run() error {
	m.Logger.Debug().Msgf("Started migration")
	conn, err := sql.Open("pgx", m.ConnectionString)
	if err != nil {
		return err
	}

	defer conn.Close()
	tx, err := conn.Begin()
	if err != nil {
		return fmt.Errorf("can't begin db transaction: %w", err)
	}

	migrationSource := &migrate.EmbedFileSystemMigrationSource{
		FileSystem: m.MigrationsFS,
		Root:       m.RootFS,
	}

	defer tx.Rollback()
	// Ensure we got single migrator running at a time
	// Other concurrent sessions should wait
	_, err = tx.ExecContext(m.Context, `SELECT pg_advisory_xact_lock(1)`)
	if err != nil {
		return fmt.Errorf("can't acquire advisory lock: %w", err)
	}

	migrate.SetTable(m.TableName)
	migrate.SetSchema(m.SchemaName)
	_, err = migrate.Exec(conn, m.Driver, migrationSource, migrate.Up)
	if err != nil {
		return fmt.Errorf("can't apply database migrations: %w", err)
	}

	err = tx.Commit()
	if err != nil {
		return fmt.Errorf("can't commit db transaction: %w", err)
	}

	return nil
}
