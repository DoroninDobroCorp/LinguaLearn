package providers

import (
	"context"
	"errors"

	"github.com/rs/zerolog"
)

// ErrModelConfiguration marks a provider-wide model selection error. Retrying
// this error with another credential cannot fix it and must not trigger key
// rotation or a fallback that could write mappings with different semantics.
var ErrModelConfiguration = errors.New("llm model configuration error")

// LLMResponse содержит результат запроса к LLM с информацией о токенах
type LLMResponse struct {
	Content          string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
}

// LLMProvider - интерфейс для абстракции LLM провайдеров
type LLMProvider interface {
	GenerateLeagueMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error)
	GenerateTeamMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error)
	GetProviderName() string
	UpdateApiKey(apiKey string) error
}

// ProviderConfig содержит общие настройки для провайдеров
type ProviderConfig struct {
	ApiKey  string
	ApiKeys []string
	Logger  *zerolog.Logger
}

func ptrFloat32(f float32) *float32 {
	return &f
}
