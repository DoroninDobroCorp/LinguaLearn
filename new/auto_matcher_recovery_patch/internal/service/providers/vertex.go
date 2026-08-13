package providers

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/rs/zerolog"
	"google.golang.org/genai"
)

// VertexAIConfig настройки для Vertex AI провайдера
type VertexAIConfig struct {
	ProjectID          string
	Location           string
	Model              string
	ServiceAccountFile string
	MaxTokens          int
}

// VertexAIProvider реализация LLM провайдера для Google Cloud Vertex AI
type VertexAIProvider struct {
	client    *genai.Client
	cfg       VertexAIConfig
	logger    *zerolog.Logger
	projectID string
	location  string
	model     string
}

func NewVertexAIProvider(ctx context.Context, cfg VertexAIConfig, logger *zerolog.Logger) (*VertexAIProvider, error) {
	if cfg.ProjectID == "" {
		return nil, fmt.Errorf("vertex_fallback.project_id is required")
	}
	if cfg.Location == "" {
		cfg.Location = "us-central1"
	}
	if cfg.Model == "" {
		cfg.Model = "gemini-2.5-flash"
	}

	if cfg.ServiceAccountFile != "" {
		os.Setenv("GOOGLE_APPLICATION_CREDENTIALS", cfg.ServiceAccountFile)
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		Project:  cfg.ProjectID,
		Location: cfg.Location,
		Backend:  genai.BackendVertexAI,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Vertex AI client: %w", err)
	}

	logger.Info().
		Str("project_id", cfg.ProjectID).
		Str("location", cfg.Location).
		Str("model", cfg.Model).
		Msg("[VertexAIProvider] Initialized with Google Cloud credentials")

	return &VertexAIProvider{
		client:    client,
		cfg:       cfg,
		logger:    logger,
		projectID: cfg.ProjectID,
		location:  cfg.Location,
		model:     cfg.Model,
	}, nil
}

func (p *VertexAIProvider) GetProviderName() string {
	return "VertexAI"
}

func (p *VertexAIProvider) GenerateLeagueMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	return p.generate(ctx, systemPrompt, requestText)
}

func (p *VertexAIProvider) GenerateTeamMatches(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	return p.generate(ctx, systemPrompt, requestText)
}

func (p *VertexAIProvider) generate(ctx context.Context, systemPrompt, requestText string) (*LLMResponse, error) {
	parts := []*genai.Part{{Text: requestText}}

	p.logger.Debug().
		Str("model", p.model).
		Str("project", p.projectID).
		Int("request_len", len(requestText)).
		Msg("[VertexAIProvider] Sending request")

	resp, err := p.client.Models.GenerateContent(ctx, p.model, []*genai.Content{
		{Role: "user", Parts: parts},
	}, &genai.GenerateContentConfig{
		MaxOutputTokens:   int32(p.cfg.MaxTokens),
		Temperature:       ptrFloat32(0.0),
		SystemInstruction: &genai.Content{Parts: []*genai.Part{{Text: systemPrompt}}},
	})
	if err != nil {
		p.logger.Error().Err(err).
			Str("model", p.model).
			Str("project", p.projectID).
			Msg("[VertexAIProvider] API error")
		return nil, err
	}

	// Extract token usage
	var promptTokens, completionTokens, totalTokens int
	if resp.UsageMetadata != nil {
		promptTokens = int(resp.UsageMetadata.PromptTokenCount)
		completionTokens = int(resp.UsageMetadata.CandidatesTokenCount)
		totalTokens = int(resp.UsageMetadata.TotalTokenCount)
	}

	if resp.PromptFeedback != nil && resp.PromptFeedback.BlockReason != "" {
		return nil, fmt.Errorf("Vertex AI blocked prompt: %s", resp.PromptFeedback.BlockReason)
	}

	if len(resp.Candidates) > 0 {
		candidate := resp.Candidates[0]
		if candidate.Content != nil && len(candidate.Content.Parts) > 0 {
			text := candidate.Content.Parts[0].Text
			p.logger.Info().
				Int("response_len", len(text)).
				Int("total_tokens", totalTokens).
				Msg("[VertexAIProvider] Request completed successfully")
			return &LLMResponse{
				Content:          strings.TrimSpace(text),
				PromptTokens:     promptTokens,
				CompletionTokens: completionTokens,
				TotalTokens:      totalTokens,
			}, nil
		}
	}

	return nil, fmt.Errorf("empty response from Vertex AI")
}

func (p *VertexAIProvider) UpdateApiKey(apiKey string) error {
	// Vertex AI uses service account, not API key
	return nil
}
