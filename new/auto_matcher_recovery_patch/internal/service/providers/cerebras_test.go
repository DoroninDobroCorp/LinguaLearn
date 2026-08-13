package providers

import (
	"errors"
	"testing"

	"github.com/rs/zerolog"
	openai "github.com/sashabaranov/go-openai"
	"github.com/stretchr/testify/require"
)

func TestIsCerebrasModelConfigurationError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "root Cerebras payload",
			err: &openai.RequestError{
				HTTPStatusCode: 404,
				Body:           []byte(`{"message":"Model does not exist","type":"not_found_error","param":"model","code":"model_not_found"}`),
			},
			want: true,
		},
		{
			name: "OpenAI-compatible nested payload",
			err: &openai.RequestError{
				HTTPStatusCode: 404,
				Body:           []byte(`{"error":{"message":"Model does not exist","param":"model","code":"model_not_found"}}`),
			},
			want: true,
		},
		{
			name: "typed API error",
			err:  &openai.APIError{Code: "model_not_found", HTTPStatusCode: 404},
			want: true,
		},
		{
			name: "unrelated not found",
			err: &openai.RequestError{
				HTTPStatusCode: 404,
				Body:           []byte(`{"code":"resource_not_found"}`),
			},
			want: false,
		},
		{name: "generic error", err: errors.New("temporary network error"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, isCerebrasModelConfigurationError(tt.err))
		})
	}
}

func TestCerebrasRequestUsesMaxCompletionTokens(t *testing.T) {
	logger := zerolog.Nop()
	provider := &CerebrasProvider{
		cfg: CerebrasConfig{
			Model:               "gpt-oss-120b",
			MaxCompletionTokens: 40000,
			Temperature:         0,
			TopP:                0.95,
		},
		logger: &logger,
	}

	req := provider.chatCompletionRequest("system", "request")
	require.Equal(t, "gpt-oss-120b", req.Model)
	require.Zero(t, req.MaxTokens)
	require.Equal(t, 40000, req.MaxCompletionTokens)
	require.Len(t, req.Messages, 2)
}
