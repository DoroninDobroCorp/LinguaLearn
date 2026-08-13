package config

import (
	"fmt"
	"livebets/auto_matcher/pkg/utils"
	"net/url"
	"os"
	"reflect"
	"strings"
	"sync"

	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
)

var (
	once         sync.Once
	cachedConfig AppConfig
)

// GetMode returns current mode: "live" or "prematch"
func GetMode() string {
	mode := os.Getenv("MODE")
	if mode == "" {
		mode = "live"
	}
	return strings.ToLower(mode)
}

type AppConfig struct {
	ServerPort          string `mapstructure:"server_port"`
	PostgresConfig      `mapstructure:"postgres"`
	AnalyzerAPI         `mapstructure:"analyzer_api"`
	AnalyzerPrematchAPI AnalyzerAPI `mapstructure:"analyzer_pre_api"`
	AutoMatcherConfig   `mapstructure:"auto_matcher"`
	LLMMatcherConfig    `mapstructure:"llm_matcher"`
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
	URL          string `mapstructure:"url"`
	Timeout      int    `mapstructure:"timeout"`
	MatchDataURL string `mapstructure:"match_data_url"`
}

type AutoMatcherConfig struct {
	IntervalMatchingLeagues int `mapstructure:"interval_matching_leagues"`
	IntervalMatchingTeams   int `mapstructure:"interval_matching_teams"`
}

type LLMMatcherConfig struct {
	Provider             string         `mapstructure:"provider"` // "gemini" or "cerebras"
	ApiKey               string         `mapstructure:"api_key"`
	ApiKeys              []string       `mapstructure:"api_keys"` // Array of API keys for rotation
	CheckInterval        int            `mapstructure:"check_interval"`
	PendingReviewEnabled bool           `mapstructure:"pending_review_enabled"`
	Gemini               GeminiConfig   `mapstructure:"gemini"`
	Cerebras             CerebrasConfig `mapstructure:"cerebras"`
	// Fallback to Google Gemini when all rotation keys are exhausted
	GeminiFallback GeminiFallbackConfig `mapstructure:"gemini_fallback"`
	// Final fallback to Vertex AI (Google Cloud $300 credits)
	VertexFallback VertexFallbackConfig `mapstructure:"vertex_fallback"`
}

type GeminiFallbackConfig struct {
	Enabled bool     `mapstructure:"enabled"`
	ApiKey  string   `mapstructure:"api_key"`  // Single API key (legacy, use api_keys instead)
	ApiKeys []string `mapstructure:"api_keys"` // Array of API keys for rotation
	// ⚠️ CRITICAL: Only Gemini 2.5+ models allowed!
	// DO NOT use gemini-2.0, gemini-1.5 or lower - they produce incorrect matching results!
	Model string `mapstructure:"model"` // Must be "gemini-2.5-pro" or "gemini-2.5-flash"
}

type VertexFallbackConfig struct {
	Enabled            bool   `mapstructure:"enabled"`
	ProjectID          string `mapstructure:"project_id"`
	Location           string `mapstructure:"location"`             // e.g. "us-central1"
	Model              string `mapstructure:"model"`                // e.g. "gemini-2.5-flash"
	ServiceAccountFile string `mapstructure:"service_account_file"` // Path to JSON key file
}

type GeminiConfig struct {
	Model       string  `mapstructure:"model"`
	MaxTokens   int     `mapstructure:"max_tokens"`
	Temperature float64 `mapstructure:"temperature"`
}

type CerebrasConfig struct {
	Model               string  `mapstructure:"model"`
	MaxCompletionTokens int     `mapstructure:"max_completion_tokens"`
	Temperature         float64 `mapstructure:"temperature"`
	TopP                float64 `mapstructure:"top_p"`
}

func (cfg PostgresConfig) ConnectionString() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", cfg.Username, url.QueryEscape(cfg.Password), cfg.Host, cfg.Port, cfg.DBName, cfg.SSLMode)
}

func ProvideAppMPConfig() (AppConfig, error) {
	var err error
	once.Do(func() {
		viper.AutomaticEnv()
		viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

		// Load main config (common.yml)
		viper.AddConfigPath("/configs") // Docker path
		viper.AddConfigPath("configs")  // Local dev path
		viper.SetConfigName("common")
		viper.SetConfigType("yml")

		err = viper.ReadInConfig()
		if err != nil {
			return
		}

		// Apply mode-specific settings
		applyModeSettings()

		// Load secrets (API keys, Vertex credentials)
		loadSecrets()

		BindEnvs(cachedConfig)

		hooks := viper.DecodeHook(mapstructure.ComposeDecodeHookFunc(utils.DefaultDecodeHooks()...))
		err = viper.Unmarshal(&cachedConfig, hooks)
		if err != nil {
			return
		}
	})

	return cachedConfig, err
}

// applyModeSettings applies mode-specific config overrides
func applyModeSettings() {
	mode := GetMode()

	if mode == "prematch" {
		// Prematch-specific settings
		if os.Getenv("ANALYZER_URL") == "" {
			viper.Set("analyzer_api.url", "http://analyzer_prematch:7006/")
		}
		if os.Getenv("ANALYZER_TIMEOUT") == "" {
			viper.Set("analyzer_api.timeout", 35)
		}
		if os.Getenv("INTERVAL_LEAGUES") == "" {
			viper.Set("auto_matcher.interval_matching_leagues", 300)
		}
		if os.Getenv("INTERVAL_TEAMS") == "" {
			viper.Set("auto_matcher.interval_matching_teams", 300)
		}
	}

	// Allow ENV overrides for any mode
	if url := os.Getenv("ANALYZER_URL"); url != "" {
		viper.Set("analyzer_api.url", url)
	}
	if timeout := os.Getenv("ANALYZER_TIMEOUT"); timeout != "" {
		viper.Set("analyzer_api.timeout", timeout)
	}
}

// loadSecrets loads API keys from secrets.yml
func loadSecrets() {
	secretsViper := viper.New()
	secretsViper.AddConfigPath("/configs") // Docker path
	secretsViper.AddConfigPath("configs")  // Local dev path
	secretsViper.SetConfigName("secrets")
	secretsViper.SetConfigType("yml")

	if err := secretsViper.ReadInConfig(); err != nil {
		fmt.Printf("Warning: secrets.yml not found: %v\n", err)
		return
	}

	provider := strings.ToLower(viper.GetString("llm_matcher.provider"))

	// Load primary provider API keys.
	switch provider {
	case "gemini", "":
		if keys := secretsViper.GetStringSlice("gemini_keys"); len(keys) > 0 {
			viper.Set("llm_matcher.api_keys", keys)
		} else if keys := secretsViper.GetStringSlice("gemini_fallback_keys"); len(keys) > 0 {
			viper.Set("llm_matcher.api_keys", keys)
		}
	default:
		if keys := secretsViper.GetStringSlice("cerebras_keys"); len(keys) > 0 {
			viper.Set("llm_matcher.api_keys", keys)
		}
	}

	// Load Gemini fallback API keys.
	if keys := secretsViper.GetStringSlice("gemini_fallback_keys"); len(keys) > 0 {
		viper.Set("llm_matcher.gemini_fallback.api_keys", keys)
	}

	// Load Vertex AI credentials
	if projectID := secretsViper.GetString("vertex_project_id"); projectID != "" {
		viper.Set("llm_matcher.vertex_fallback.project_id", projectID)
	}
	if saFile := secretsViper.GetString("vertex_service_account_file"); saFile != "" {
		viper.Set("llm_matcher.vertex_fallback.service_account_file", saFile)
	}
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
