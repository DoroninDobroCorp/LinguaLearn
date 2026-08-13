package providers

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"google.golang.org/genai"
)

// GeminiConfig настройки для Gemini провайдера
type GeminiConfig struct {
	Model       string
	MaxTokens   int
	Temperature float64
}

// GeminiProvider реализация LLM провайдера для Google Gemini
type GeminiProvider struct {
	client          *genai.Client
	cfg             GeminiConfig
	logger          *zerolog.Logger
	apiKey          string
	apiKeys         []string
	currentKeyIndex int
	clientMux       sync.RWMutex
}

func NewGeminiProvider(ctx context.Context, apiKeys []string, cfg GeminiConfig, logger *zerolog.Logger) (*GeminiProvider, error) {
	if len(apiKeys) == 0 {
		return nil, fmt.Errorf("no API keys provided for Gemini")
	}

	apiKey := apiKeys[0]
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	logger.Info().Int("total_keys", len(apiKeys)).Msg("[GeminiProvider] Initialized with API key rotation")

	return &GeminiProvider{
		client:          client,
		cfg:             cfg,
		logger:          logger,
		apiKey:          apiKey,
		apiKeys:         apiKeys,
		currentKeyIndex: 0,
	}, nil
}

func (p *GeminiProvider) GetProviderName() string {
	return "Gemini"
}

func (p *GeminiProvider) GenerateLeagueMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	parts := []*genai.Part{{Text: requestText}}

	p.logger.Debug().
		Str("model", p.cfg.Model).
		Int("max_tokens", p.cfg.MaxTokens).
		Int("request_len", len(requestText)).
		Int("system_prompt_len", len(systemPrompt)).
		Msg("[GeminiProvider] Sending request")

	resp, err := p.client.Models.GenerateContent(ctx, p.cfg.Model, []*genai.Content{
		{Role: "user", Parts: parts},
	}, &genai.GenerateContentConfig{
		MaxOutputTokens:   int32(p.cfg.MaxTokens),
		Temperature:       ptrFloat32(float32(p.cfg.Temperature)),
		SystemInstruction: &genai.Content{Parts: []*genai.Part{{Text: systemPrompt}}},
	})
	if err != nil {
		p.logger.Error().Err(err).Str("model", p.cfg.Model).Msg("[GeminiProvider] API error")
		return nil, err
	}

	candidatesCount := 0
	if resp.Candidates != nil {
		candidatesCount = len(resp.Candidates)
	}

	// Extract token usage from UsageMetadata
	var promptTokens, completionTokens, totalTokens int
	if resp.UsageMetadata != nil {
		promptTokens = int(resp.UsageMetadata.PromptTokenCount)
		completionTokens = int(resp.UsageMetadata.CandidatesTokenCount)
		totalTokens = int(resp.UsageMetadata.TotalTokenCount)
	}

	p.logger.Debug().
		Int("candidates_count", candidatesCount).
		Int("prompt_tokens", promptTokens).
		Int("completion_tokens", completionTokens).
		Int("total_tokens", totalTokens).
		Msg("[GeminiProvider] Response received")

	if resp.PromptFeedback != nil && resp.PromptFeedback.BlockReason != "" {
		p.logger.Warn().
			Str("block_reason", string(resp.PromptFeedback.BlockReason)).
			Msg("[GeminiProvider] Prompt was blocked!")
		return nil, fmt.Errorf("Gemini blocked prompt: %s", resp.PromptFeedback.BlockReason)
	}

	if len(resp.Candidates) > 0 {
		candidate := resp.Candidates[0]

		if candidate.FinishReason != "" && candidate.FinishReason != "STOP" {
			p.logger.Warn().
				Str("finish_reason", string(candidate.FinishReason)).
				Msg("[GeminiProvider] Unusual finish reason")
		}

		if candidate.Content != nil && len(candidate.Content.Parts) > 0 {
			text := candidate.Content.Parts[0].Text
			p.logger.Debug().
				Int("response_len", len(text)).
				Str("finish_reason", string(candidate.FinishReason)).
				Msg("[GeminiProvider] Got response")
			return &LLMResponse{
				Content:          text,
				PromptTokens:     promptTokens,
				CompletionTokens: completionTokens,
				TotalTokens:      totalTokens,
			}, nil
		}
	}

	p.logger.Error().
		Interface("full_response", resp).
		Msg("[GeminiProvider] Empty response - debugging info")

	return nil, fmt.Errorf("empty response from Gemini (candidates: %d)", candidatesCount)
}

func (p *GeminiProvider) GenerateTeamMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	return p.GenerateLeagueMatches(ctx, systemPrompt, requestText)
}

func (p *GeminiProvider) UpdateApiKey(apiKey string) error {
	p.clientMux.Lock()
	defer p.clientMux.Unlock()

	if p.apiKey == apiKey {
		return nil
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return fmt.Errorf("failed to create Gemini client with new API key: %w", err)
	}

	p.client = client
	p.apiKey = apiKey
	p.logger.Info().Msg("Updated Gemini API key")

	return nil
}

// RotateApiKey switches to the next API key in the rotation
func (p *GeminiProvider) RotateApiKey() (string, bool) {
	p.clientMux.Lock()
	defer p.clientMux.Unlock()

	if len(p.apiKeys) <= 1 {
		return p.apiKey, false
	}

	oldIndex := p.currentKeyIndex
	p.currentKeyIndex = (p.currentKeyIndex + 1) % len(p.apiKeys)
	newKey := p.apiKeys[p.currentKeyIndex]

	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  newKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		p.logger.Error().Err(err).Msg("[GeminiProvider] Failed to rotate API key")
		return p.apiKey, false
	}

	p.client = client
	p.apiKey = newKey
	p.logger.Warn().
		Int("old_key_index", oldIndex).
		Int("new_key_index", p.currentKeyIndex).
		Int("total_keys", len(p.apiKeys)).
		Msg("[GeminiProvider] Rotating to next API key due to rate limit")

	return newKey, true
}

// GenerateWithRotation tries all keys before giving up
func (p *GeminiProvider) GenerateWithRotation(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	maxKeys := len(p.apiKeys)
	retriesPerKey := 3
	var lastErr error

	for keyAttempt := 0; keyAttempt < maxKeys; keyAttempt++ {
		for retry := 0; retry < retriesPerKey; retry++ {
			result, err := p.GenerateLeagueMatches(ctx, systemPrompt, requestText)
			if err == nil {
				return result, nil
			}

			lastErr = err
			errStr := err.Error()

			if strings.Contains(errStr, "leaked") || strings.Contains(errStr, "PERMISSION_DENIED") {
				p.logger.Warn().
					Int("key_index", p.currentKeyIndex).
					Str("error", errStr).
					Msg("[GeminiProvider] Key reported as leaked/denied, rotating immediately")
				break
			}

			if strings.Contains(errStr, "429") || strings.Contains(errStr, "quota") || strings.Contains(errStr, "RESOURCE_EXHAUSTED") {
				p.logger.Warn().
					Int("key_index", p.currentKeyIndex).
					Int("retry", retry+1).
					Msg("[GeminiProvider] Rate limit hit, rotating to next key")
				break
			}

			if retry < retriesPerKey-1 {
				p.logger.Warn().
					Int("key_index", p.currentKeyIndex).
					Int("retry", retry+1).
					Int("max_retries", retriesPerKey).
					Str("error", errStr).
					Msg("[GeminiProvider] Retrying with same key...")
				time.Sleep(time.Duration(retry+1) * time.Second)
				continue
			}

			p.logger.Warn().
				Int("key_index", p.currentKeyIndex).
				Str("error", errStr).
				Msg("[GeminiProvider] Max retries reached, rotating to next key")
		}

		if keyAttempt < maxKeys-1 {
			if _, rotated := p.RotateApiKey(); !rotated {
				return nil, fmt.Errorf("all Gemini API keys exhausted: %w", lastErr)
			}
		}
	}

	return nil, fmt.Errorf("all %d Gemini API keys exhausted after %d retries each: %w", maxKeys, retriesPerKey, lastErr)
}
