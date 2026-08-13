package config

import (
	"fmt"
	"livebets/calculator/pkg/utils"
	"net/url"
	"reflect"
	"strings"
	"sync"

	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
)

var (
	once         sync.Once
	cachedConfig AppConfig
	cachedErr    error // FIX 3.5: Persist config error across calls
)

type AppConfig struct {
	PostgresConfig      `mapstructure:"postgres"`
	AnalyzerAPI         `mapstructure:"analyzer_api"`
	AnalyzerPrematchAPI AnalyzerAPI `mapstructure:"analyzer_pre_api"`
	LogsService         `mapstructure:"logs_service"`
	TestingMode         `mapstructure:"testing_mode"`
	ProductionMode      `mapstructure:"production_mode"`
	Timeouts            `mapstructure:"timeouts"`
	KellyCriterion      `mapstructure:"kelly_criterion"`
	CORS                `mapstructure:"cors"`
}

type PostgresConfig struct {
	Host     string `mapstructure:"host"`
	Port     string `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"db"`
	SSLMode  string `mapstructure:"sslmode"`
}

type AnalyzerAPI struct {
	URL                  string               `mapstructure:"url"`
	Timeout              int                  `mapstructure:"timeout"`
	PricesURL            string               `mapstructure:"prices_url"`
	RetryConfig          RetryConfig          `mapstructure:"retry"`
	CircuitBreakerConfig CircuitBreakerConfig `mapstructure:"circuit_breaker"`
}

type RetryConfig struct {
	Attempts  int `mapstructure:"attempts"`
	DelayMS   int `mapstructure:"delay_ms"`
	MaxDelayMS int `mapstructure:"max_delay_ms"`
}

type CircuitBreakerConfig struct {
	MaxRequests     uint32  `mapstructure:"max_requests"`
	IntervalSeconds int     `mapstructure:"interval_seconds"`
	TimeoutSeconds  int     `mapstructure:"timeout_seconds"`
	FailureRatio    float64 `mapstructure:"failure_ratio"`
}

type LogsService struct {
	UsersCacheInterval       int  `mapstructure:"users_cache_interval"`
	UsersCacheTimeout        int  `mapstructure:"users_cache_timeout"`
	PercentCacheInterval     int  `mapstructure:"percent_cache_interval"`
	PercentCacheTTLLive      int  `mapstructure:"percent_cache_ttl_live"`
	PercentCacheTTLPrematch  int  `mapstructure:"percent_cache_ttl_prematch"`
	PercentCacheTimeout      int  `mapstructure:"percent_cache_timeout"` // Deprecated
	EnableSafeOppositeBets   bool `mapstructure:"enable_safe_opposite_bets"`
}

type TestingMode struct {
	Enabled              bool    `mapstructure:"enabled"`
	Edge                 float64 `mapstructure:"edge"`
	CSVWaitLiveSeconds   int     `mapstructure:"csv_wait_live_seconds"`
	CSVWaitPrematchSeconds int   `mapstructure:"csv_wait_prematch_seconds"`
}

type ProductionMode struct {
	Edge                         float64 `mapstructure:"edge"`
	CSVWaitLiveSeconds           int     `mapstructure:"csv_wait_live_seconds"`
	CSVWaitPrematchSeconds       int     `mapstructure:"csv_wait_prematch_seconds"`
	CSVWaitPrematchFailSeconds   int     `mapstructure:"csv_wait_prematch_fail_seconds"`
}

type Timeouts struct {
	APICallSeconds  int `mapstructure:"api_call_seconds"`
	DBQuerySeconds  int `mapstructure:"db_query_seconds"`
	CSVWriteSeconds int `mapstructure:"csv_write_seconds"`
}

type KellyCriterion struct {
	DefaultRisk      float64 `mapstructure:"default_risk"`
	DefaultBank      float64 `mapstructure:"default_bank"`
	MaxBetPercent    float64 `mapstructure:"max_bet_percent"`
	MinBetAmount     float64 `mapstructure:"min_bet_amount"`
}

type CORS struct {
	AllowedOrigins []string `mapstructure:"allowed_origins"`
	AllowedMethods []string `mapstructure:"allowed_methods"`
	AllowedHeaders []string `mapstructure:"allowed_headers"`
	MaxAgeSeconds  int      `mapstructure:"max_age_seconds"`
}

func (cfg PostgresConfig) ConnectionString() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", cfg.Username, url.QueryEscape(cfg.Password), cfg.Host, cfg.Port, cfg.DBName, cfg.SSLMode)
}

func ProvideAppMPConfig() (AppConfig, error) {
	once.Do(func() {
		viper.AutomaticEnv()
		viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

		viper.AddConfigPath("configs")
		viper.SetConfigName("common")
		viper.SetConfigType("yml")
		cachedErr = viper.ReadInConfig()
		if cachedErr != nil {
			return
		}

		BindEnvs(cachedConfig)

		hooks := viper.DecodeHook(mapstructure.ComposeDecodeHookFunc(utils.DefaultDecodeHooks()...))
		cachedErr = viper.Unmarshal(&cachedConfig, hooks)
		if cachedErr != nil {
			return
		}
	})

	return cachedConfig, cachedErr
}

func BindEnvs(iface interface{}, parts ...string) {
	ifv := reflect.ValueOf(iface)
	ift := reflect.TypeOf(iface)
	for i := 0; i < ift.NumField(); i++ {
		v := ifv.Field(i)
		t := ift.Field(i)
		tv, ok := t.Tag.Lookup("mapstructure")
		if !ok {
			continue
		}
		switch v.Kind() {
		case reflect.Struct:
			BindEnvs(v.Interface(), append(parts, tv)...)
		default:
			viper.BindEnv(strings.Join(append(parts, tv), "."))
		}
	}
}
