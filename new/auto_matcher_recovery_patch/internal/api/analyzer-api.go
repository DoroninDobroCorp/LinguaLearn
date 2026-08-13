package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"livebets/auto_matcher/cmd/config"
	"livebets/auto_matcher/internal/entity"
	"net/http"
	"time"
)

type AnalizerAPI struct {
	cfg    config.AnalyzerAPI
	client *http.Client
}

func NewAnalizerAPI(cfg config.AnalyzerAPI) *AnalizerAPI {
	transport := &http.Transport{}

	client := &http.Client{
		Transport: transport,
	}

	return &AnalizerAPI{
		cfg:    cfg,
		client: client,
	}
}

// AnalizerPrematchAPI is an alias for backward compatibility
type AnalizerPrematchAPI = AnalizerAPI

// NewAnalizerPrematchAPI creates analyzer API (alias for NewAnalizerAPI)
func NewAnalizerPrematchAPI(cfg config.AnalyzerAPI) *AnalizerPrematchAPI {
	return NewAnalizerAPI(cfg)
}

func (a *AnalizerAPI) GetOnlineMatchData(traceID string) ([]entity.MatchData, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(a.cfg.Timeout)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		a.cfg.URL+a.cfg.MatchDataURL,
		nil,
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if traceID != "" {
		req.Header.Set("X-Trace-ID", traceID)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("analyzer API returned status %d: %s", resp.StatusCode, string(body))
	}

	var result []entity.MatchData
	if err = json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result, nil
}
