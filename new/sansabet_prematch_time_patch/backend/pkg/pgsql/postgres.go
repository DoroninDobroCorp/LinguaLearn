package pgsql

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

const (
	defaultMaxPoolSize       = 20
	defaultMinPoolSize       = 5
	defaultConnAttempts      = 3
	defaultConnTimeout       = 60 * time.Second
	defaultMaxConnLifetime   = 1 * time.Hour
	defaultMaxConnIdleTime   = 30 * time.Minute
	defaultHealthCheckPeriod = 1 * time.Minute
)

type Postgres struct {
	*pgxpool.Pool
	maxPoolSize      int
	minPoolSize      int
	connAttempts     int
	connTimeout      time.Duration
	maxConnLifetime  time.Duration
	maxConnIdleTime  time.Duration
	healthCheckPeriod time.Duration
	shardLabel       string
	serviceName      string
}

func New(connString string, opts ...Option) (*Postgres, error) {
	pg := &Postgres{
		maxPoolSize:       defaultMaxPoolSize,
		minPoolSize:       defaultMinPoolSize,
		connAttempts:      defaultConnAttempts,
		connTimeout:       defaultConnTimeout,
		maxConnLifetime:   defaultMaxConnLifetime,
		maxConnIdleTime:   defaultMaxConnIdleTime,
		healthCheckPeriod: defaultHealthCheckPeriod,
	}

	for _, opt := range opts {
		opt(pg)
	}

	poolConfig, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("postgres - NewPostgres - pgxpool.ParseConfig: %w", err)
	}

	poolConfig.MaxConns = int32(pg.maxPoolSize)
	poolConfig.MinConns = int32(pg.minPoolSize)
	poolConfig.MaxConnLifetime = pg.maxConnLifetime
	poolConfig.MaxConnIdleTime = pg.maxConnIdleTime
	poolConfig.HealthCheckPeriod = pg.healthCheckPeriod
	for pg.connAttempts > 0 {
		pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
		if err == nil {
			// Verify the pool can actually connect
			if pingErr := pool.Ping(context.Background()); pingErr == nil {
				pg.Pool = pool
				break
			} else {
				pool.Close()
				err = pingErr
			}
		}

		log.Printf("Postgres is trying to connect, attempts left: %d", pg.connAttempts)
		time.Sleep(pg.connTimeout)
		pg.connAttempts--
	}

	if err != nil {
		return nil, fmt.Errorf("postgres - NewPostgres - connAttempts == 0: %w", err)
	}

	return pg, nil
}

func (p *Postgres) RegisterCollector() error {
	fn := func() PgxStat { return p.Pool.Stat() }
	labels := map[string]string{"shard": p.shardLabel, "service": p.serviceName}
	collector := NewCollector(fn, labels)
	return prometheus.Register(collector)
}

func (p *Postgres) Close() {
	if p.Pool != nil {
		p.Pool.Close()
	}
}

func (p *Postgres) PoolPing() error {
	return p.Pool.Ping(context.Background())
}
