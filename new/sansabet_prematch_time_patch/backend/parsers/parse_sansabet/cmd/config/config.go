package config

import (
	"livebets/parse_sansabet/utils"
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

type AppConfig struct {
	SansabetConfig `mapstructure:"sansa"`
	SenderConfig   `mapstructure:"sender"`
	Port           string `mapstructure:"port"`
}

type SansabetConfig struct {
	SansabetAPIConfig `mapstructure:"api"`
}

type SansabetAPIConfig struct {
	Url                    string `mapstructure:"url"`
	Timeout                int    `mapstructure:"timeout"`
	MatchesUrl             string `mapstructure:"matches_url"`
	ODDSUrl                string `mapstructure:"odds_url"`
	IntervalMatch          int    `mapstructure:"interval_match"`
	IntervalODDS           int    `mapstructure:"interval_odds"`
	ParseLive              bool   `mapstructure:"parse_live"`
	PrematchIntervalMatch  int    `mapstructure:"prematch_interval_match"`
	PrematchIntervalODDS   int    `mapstructure:"prematch_interval_odds"`
}

type SenderConfig struct {
	Url string `mapstructure:"url"`
}

func ProvideAppMPConfig() (AppConfig, error) {
	var err error
	once.Do(func() {
		viper.AutomaticEnv()
		viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

		viper.AddConfigPath("configs")
		viper.SetConfigName("common")
		viper.SetConfigType("yml")
		err = viper.ReadInConfig()
		if err != nil {
			return
		}

		// Explicit bindings for critical config values
		viper.BindEnv("sansa.api.parse_live", "SANSA_API_PARSE_LIVE")
		viper.BindEnv("sansa.api.prematch_interval_match", "SANSA_API_PREMATCH_INTERVAL_MATCH")
		viper.BindEnv("sansa.api.prematch_interval_odds", "SANSA_API_PREMATCH_INTERVAL_ODDS")

		BindEnvs(cachedConfig)

		hooks := viper.DecodeHook(mapstructure.ComposeDecodeHookFunc(utils.DefaultDecodeHooks()...))
		err = viper.Unmarshal(&cachedConfig, hooks)
		if err != nil {
			return
		}
	})

	return cachedConfig, err
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
