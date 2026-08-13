package config

import (
	"strings"
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/require"
)

func TestPendingReviewEnabledEnvBinding(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)
	t.Setenv("LLM_MATCHER_PENDING_REVIEW_ENABLED", "true")

	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	BindEnvs(AppConfig{})

	var cfg AppConfig
	require.NoError(t, viper.Unmarshal(&cfg))
	require.True(t, cfg.LLMMatcherConfig.PendingReviewEnabled)
}
