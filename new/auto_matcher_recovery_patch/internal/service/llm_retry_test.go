package service

import (
	"context"
	"fmt"
	"testing"

	"livebets/auto_matcher/cmd/config"
	"livebets/auto_matcher/internal/service/providers"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
)

type modelConfigurationFailureProvider struct {
	calls      int
	keyUpdates int
}

func (p *modelConfigurationFailureProvider) GenerateLeagueMatches(context.Context, string, string) (*providers.LLMResponse, error) {
	p.calls++
	return nil, fmt.Errorf("%w: model_not_found", providers.ErrModelConfiguration)
}

func (p *modelConfigurationFailureProvider) GenerateTeamMatches(context.Context, string, string) (*providers.LLMResponse, error) {
	p.calls++
	return nil, fmt.Errorf("%w: model_not_found", providers.ErrModelConfiguration)
}

func (p *modelConfigurationFailureProvider) GetProviderName() string { return "test" }

func (p *modelConfigurationFailureProvider) UpdateApiKey(string) error {
	p.keyUpdates++
	return nil
}

func TestCallLLMWithRetryDoesNotRotateOnModelNotFound(t *testing.T) {
	provider := &modelConfigurationFailureProvider{}
	logger := zerolog.Nop()
	service := &LLMMatcherService{
		cfg:                config.LLMMatcherConfig{ApiKeys: []string{"key-one", "key-two", "key-three"}},
		logger:             &logger,
		provider:           provider,
		currentApiKeyIndex: 0,
		apiKeyStates: map[int]*apiKeyState{
			0: {},
			1: {},
			2: {},
		},
	}

	_, err := service.callLLMWithRetry(context.Background(), "teams", "system", "request")
	require.ErrorContains(t, err, "non-retryable LLM model configuration failure")

	service.recordSuccess() // Simulate a request that was already in flight.
	_, secondErr := service.callLLMWithRetry(context.Background(), "leagues", "system", "request")
	require.ErrorContains(t, secondErr, "latched until process restart")
	require.ErrorIs(t, secondErr, providers.ErrModelConfiguration)
	require.Equal(t, 1, provider.calls)
	require.Zero(t, provider.keyUpdates)
	require.Zero(t, service.currentApiKeyIndex)
	require.Equal(t, 1, service.consecutiveErrors)
	health := service.GetHealthStatus()
	require.False(t, health.OK)
	require.True(t, health.ConfigurationError)
	require.Contains(t, health.Message, "LLM configuration error")
}
