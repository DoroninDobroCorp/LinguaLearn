package pgsql

import "time"

// Option -.
type Option func(*Postgres)

// MaxPoolSize -.
func MaxPoolSize(size int) Option {
	return func(c *Postgres) {
		c.maxPoolSize = size
	}
}

// ConnAttempts -.
func ConnAttempts(attempts int) Option {
	return func(c *Postgres) {
		c.connAttempts = attempts
	}
}

// ConnTimeout -.
func ConnTimeout(timeout time.Duration) Option {
	return func(c *Postgres) {
		c.connTimeout = timeout
	}
}

func WithShardLabel(label string) Option {
	return func(c *Postgres) {
		c.shardLabel = label
	}
}

func WithServiceName(serviceName string) Option {
	return func(c *Postgres) {
		c.serviceName = serviceName
	}
}
