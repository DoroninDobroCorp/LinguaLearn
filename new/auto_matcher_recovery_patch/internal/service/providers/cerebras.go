package providers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/rs/zerolog"
	openai "github.com/sashabaranov/go-openai"
)

// CerebrasConfig настройки для Cerebras провайдера
type CerebrasConfig struct {
	Model               string
	MaxCompletionTokens int
	Temperature         float64
	TopP                float64
}

// CerebrasProvider реализация LLM провайдера для Cerebras Cloud
type CerebrasProvider struct {
	client    *openai.Client
	cfg       CerebrasConfig
	logger    *zerolog.Logger
	apiKey    string
	clientMux sync.RWMutex
}

type cerebrasErrorPayload struct {
	Code  any    `json:"code"`
	Param string `json:"param"`
	Error *struct {
		Code  any    `json:"code"`
		Param string `json:"param"`
	} `json:"error"`
}

func errorCodeString(code any) string {
	switch value := code.(type) {
	case string:
		return value
	case fmt.Stringer:
		return value.String()
	default:
		return fmt.Sprint(value)
	}
}

func isCerebrasModelConfigurationError(err error) bool {
	if err == nil {
		return false
	}

	var apiErr *openai.APIError
	if errors.As(err, &apiErr) && errorCodeString(apiErr.Code) == "model_not_found" {
		return true
	}

	var requestErr *openai.RequestError
	if !errors.As(err, &requestErr) {
		return false
	}

	var payload cerebrasErrorPayload
	if json.Unmarshal(requestErr.Body, &payload) != nil {
		return false
	}
	if errorCodeString(payload.Code) == "model_not_found" {
		return true
	}
	return payload.Error != nil && errorCodeString(payload.Error.Code) == "model_not_found"
}

func (p *CerebrasProvider) chatCompletionRequest(systemPrompt, requestText string) openai.ChatCompletionRequest {
	return openai.ChatCompletionRequest{
		Model: p.cfg.Model,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: systemPrompt,
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: requestText,
			},
		},
		MaxCompletionTokens: p.cfg.MaxCompletionTokens,
		Temperature:         float32(p.cfg.Temperature),
		TopP:                float32(p.cfg.TopP),
	}
}

func NewCerebrasProvider(ctx context.Context, apiKey string, cfg CerebrasConfig, logger *zerolog.Logger) (*CerebrasProvider, error) {
	clientConfig := openai.DefaultConfig(apiKey)
	clientConfig.BaseURL = "https://api.cerebras.ai/v1"

	client := openai.NewClientWithConfig(clientConfig)

	return &CerebrasProvider{
		client: client,
		cfg:    cfg,
		logger: logger,
		apiKey: apiKey,
	}, nil
}

func (p *CerebrasProvider) GetProviderName() string {
	return "Cerebras"
}

func (p *CerebrasProvider) GenerateLeagueMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	req := p.chatCompletionRequest(systemPrompt, requestText)

	resp, err := p.client.CreateChatCompletion(ctx, req)
	if err != nil {
		p.logger.Error().
			Err(err).
			Str("error_details", fmt.Sprintf("%v", err)).
			Str("model", p.cfg.Model).
			Int("max_tokens", p.cfg.MaxCompletionTokens).
			Msg("Cerebras API error with details")
		if isCerebrasModelConfigurationError(err) {
			return nil, fmt.Errorf("%w: %v", ErrModelConfiguration, err)
		}
		return nil, err
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("empty response from Cerebras")
	}

	p.logger.Info().
		Int("prompt_tokens", resp.Usage.PromptTokens).
		Int("completion_tokens", resp.Usage.CompletionTokens).
		Int("total_tokens", resp.Usage.TotalTokens).
		Str("model", resp.Model).
		Msg("Cerebras API request completed")

	return &LLMResponse{
		Content:          resp.Choices[0].Message.Content,
		PromptTokens:     resp.Usage.PromptTokens,
		CompletionTokens: resp.Usage.CompletionTokens,
		TotalTokens:      resp.Usage.TotalTokens,
	}, nil
}

func (p *CerebrasProvider) GenerateTeamMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	return p.GenerateLeagueMatches(ctx, systemPrompt, requestText)
}

func (p *CerebrasProvider) UpdateApiKey(apiKey string) error {
	p.clientMux.Lock()
	defer p.clientMux.Unlock()

	if p.apiKey == apiKey {
		return nil
	}

	clientConfig := openai.DefaultConfig(apiKey)
	clientConfig.BaseURL = "https://api.cerebras.ai/v1"

	client := openai.NewClientWithConfig(clientConfig)

	p.client = client
	p.apiKey = apiKey
	p.logger.Info().Msg("Updated Cerebras API key")

	return nil
}
