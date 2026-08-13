package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"livebets/parse_sansabet/cmd/config"
	"livebets/parse_sansabet/internal/entity"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

var (
// slidAll removed - always request all live matches with SLID=0
)

type SansabetAPI struct {
	cfg     config.SansabetConfig
	client  *http.Client
	limiter *rate.Limiter
}

func NewSansabetAPI(cfg config.SansabetConfig) *SansabetAPI {
	return &SansabetAPI{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        200,
				MaxIdleConnsPerHost: 50,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		limiter: rate.NewLimiter(rate.Limit(40), 50),
	}
}

func (api *SansabetAPI) GetAllMatches(ctx context.Context) (*[]entity.RequestedEvent, error) {
	start := time.Now()

	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		http.MethodGet,
		api.cfg.Url+api.cfg.MatchesUrl,
		nil,
	)
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)

	query := req.URL.Query()
	query.Add("SLID", "0") // Always 0 to get all live matches
	req.URL.RawQuery = query.Encode()

	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Origin", "https://sansabet.com")
	req.Header.Set("Referer", "https://sansabet.com/")
	req.Header.Set("Sec-Ch-Ua", "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"")
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", "\"Linux\"")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-site")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var bodyReader io.Reader = resp.Body
	if strings.Contains(resp.Header.Get("Content-Encoding"), "gzip") {
		encodedBody, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}
		defer encodedBody.Close()
		bodyReader = encodedBody
	}

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(bodyReader)
	if err != nil {
		return nil, err
	}

	var events []entity.RequestedEvent
	if err := json.NewDecoder(&bodyBuffer).Decode(&events); err != nil {
		return nil, err
	}

	// slidAll update removed - always request with SLID=0

	elapsed := time.Since(start)
	if elapsed > 5*time.Second {
		log.Printf("[WARN] Slow GetAllMatches request: %s", elapsed)
	}

	return &events, nil
}

func (api *SansabetAPI) parseOdds(ctx context.Context, matchId int64) (*entity.EventOdds, error) {
	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		http.MethodGet,
		api.cfg.Url+api.cfg.ODDSUrl,
		nil,
	)
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)

	query := req.URL.Query()
	query.Add("SLID", fmt.Sprintf("%d", 0))
	query.Add("ParIDs", fmt.Sprintf("%d", matchId))
	req.URL.RawQuery = query.Encode()

	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Origin", "https://sansabet.com")
	req.Header.Set("Referer", "https://sansabet.com/")
	req.Header.Set("Sec-Ch-Ua", "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"")
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", "\"Linux\"")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-site")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("parseOdds: unexpected status %d for match %d", resp.StatusCode, matchId)
	}

	var bodyReader io.Reader = resp.Body
	if strings.Contains(resp.Header.Get("Content-Encoding"), "gzip") {
		encodedBody, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}
		defer encodedBody.Close()
		bodyReader = encodedBody
	}

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(bodyReader)
	if err != nil {
		return nil, err
	}

	var result []entity.EventOdds
	if err := json.NewDecoder(&bodyBuffer).Decode(&result); err != nil {
		return nil, err
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("empty odds response for match %d", matchId)
	}

	return &result[0], nil
}

// parseOddsBatch fetches odds for multiple matches in a single API call
// Оптимизация #1: Batch запросы для уменьшения количества HTTP запросов с 50 до 5
func (api *SansabetAPI) parseOddsBatch(ctx context.Context, matchIds []int64) ([]entity.EventOdds, error) {
	if len(matchIds) == 0 {
		return []entity.EventOdds{}, nil
	}

	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		http.MethodGet,
		api.cfg.Url+api.cfg.ODDSUrl,
		nil,
	)
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)

	// Build ParIDs parameter: "123,456,789,1011"
	var parIDs string
	for i, id := range matchIds {
		if i > 0 {
			parIDs += ","
		}
		parIDs += fmt.Sprintf("%d", id)
	}

	query := req.URL.Query()
	query.Add("SLID", fmt.Sprintf("%d", 0))
	query.Add("ParIDs", parIDs)
	req.URL.RawQuery = query.Encode()

	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Origin", "https://sansabet.com")
	req.Header.Set("Referer", "https://sansabet.com/")
	req.Header.Set("Sec-Ch-Ua", "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"")
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", "\"Linux\"")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-site")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("parseOddsBatch: unexpected status %d", resp.StatusCode)
	}

	var bodyReader io.Reader = resp.Body
	if strings.Contains(resp.Header.Get("Content-Encoding"), "gzip") {
		encodedBody, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}
		defer encodedBody.Close()
		bodyReader = encodedBody
	}

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(bodyReader)
	if err != nil {
		return nil, err
	}

	var result []entity.EventOdds
	if err := json.NewDecoder(&bodyBuffer).Decode(&result); err != nil {
		return nil, err
	}

	return result, nil
}

// GetFullMatchODDS fetches all prematch matches with odds using GetFullMatch endpoint
// This is the ONLY endpoint that returns M (markets/odds) for prematch matches
func (api *SansabetAPI) GetFullMatchODDS(ctx context.Context) (*[]entity.EventOdds, error) {
	start := time.Now()

	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		http.MethodGet,
		api.cfg.Url+"api/LiveOdds/GetFullMatch",
		nil,
	)
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)

	query := req.URL.Query()
	query.Add("SLID", "0")
	req.URL.RawQuery = query.Encode()

	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Origin", "https://sansabet.com")
	req.Header.Set("Referer", "https://sansabet.com/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GetFullMatchODDS: unexpected status %d", resp.StatusCode)
	}

	var bodyReader io.Reader = resp.Body
	if strings.Contains(resp.Header.Get("Content-Encoding"), "gzip") {
		encodedBody, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}
		defer encodedBody.Close()
		bodyReader = encodedBody
	}

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(bodyReader)
	if err != nil {
		return nil, err
	}

	var result []entity.EventOdds
	if err := json.NewDecoder(&bodyBuffer).Decode(&result); err != nil {
		return nil, err
	}

	elapsed := time.Since(start)
	log.Printf("[INFO] GetFullMatchODDS: got %d matches with odds, took %s", len(result), elapsed)

	return &result, nil
}

func (api *SansabetAPI) GetAllMatchesODDS(ctx context.Context, matchIds []int64) (*[]entity.EventOdds, error) {
	start := time.Now()

	if len(matchIds) == 0 {
		return &[]entity.EventOdds{}, nil
	}

	// Оптимизация #1 + #2 + #3: Batch запросы (по 12 ID) + увеличенный concurrency (25)
	// Было: 50 матчей = 50 запросов ÷ 10 concurrent = ~8 секунд
	// Было (v2): 50 матчей = 5 batch запросов × 20 concurrent = ~2 секунды
	// Стало (v3): 50 матчей = 5 batch запросов × 25 concurrent = ~1.6 секунды (15-20% faster)
	const batchSize = 12
	const maxConcurrent = 25

	// Split matchIds into batches
	var batches [][]int64
	for i := 0; i < len(matchIds); i += batchSize {
		end := i + batchSize
		if end > len(matchIds) {
			end = len(matchIds)
		}
		batches = append(batches, matchIds[i:end])
	}

	semaphore := make(chan struct{}, maxConcurrent)
	var result []entity.EventOdds
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, batch := range batches {
		wg.Add(1)
		go func(batchIds []int64) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			batchResults, err := api.parseOddsBatch(ctx, batchIds)
			if err != nil {
				log.Printf("[WARN] Failed to fetch batch odds: %v", err)
				return
			}

			mu.Lock()
			result = append(result, batchResults...)
			mu.Unlock()
		}(batch)
	}

	wg.Wait()

	elapsed := time.Since(start)
	log.Printf("[INFO] GetAllMatchesODDS: %d matches in %d batches, took %s (batch_size=%d, concurrency=%d)",
		len(matchIds), len(batches), elapsed, batchSize, maxConcurrent)

	if elapsed > 5*time.Second {
		log.Printf("[WARN] Slow GetAllMatchesODDS request: %s", elapsed)
	}

	return &result, nil
}

// ==================== ASP.NET Prematch API Methods ====================
// These endpoints return prematch odds (unlike apilive.sansabet.com which only has live odds)

const (
	prematchBaseURL      = "https://sansabet.com"
	getSportsWithLeagues = prematchBaseURL + "/Oblozuvanje.aspx/GetSportoviSoLigi"
	getLeagueMatchesURL  = prematchBaseURL + "/Oblozuvanje.aspx/GetLiga"
	getFullOddsURL       = prematchBaseURL + "/Oblozuvanje.aspx/GetTipoviV2"
)

// GetPrematchSports fetches all sports with their leagues from ASP.NET API
func (api *SansabetAPI) GetPrematchSports(ctx context.Context) ([]entity.PrematchSport, error) {
	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	payload := map[string]string{"filter": "0", "activeStyle": "img/white"}
	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, getSportsWithLeagues, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")
	req.Header.Set("Referer", "https://sansabet.com/OblozuvanjeService.aspx")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(resp.Body)
	if err != nil {
		return nil, err
	}

	var sports []entity.PrematchSport
	if err := json.NewDecoder(&bodyBuffer).Decode(&sports); err != nil {
		return nil, err
	}

	return sports, nil
}

// GetPrematchLeagueMatches fetches all matches for a league with basic odds
func (api *SansabetAPI) GetPrematchLeagueMatches(ctx context.Context, leagueID int) ([]entity.PrematchLeagueData, error) {
	return api.GetPrematchLeagueMatchesBatch(ctx, []int{leagueID})
}

// GetPrematchLeagueMatchesBatch fetches matches for multiple leagues in a single API call
func (api *SansabetAPI) GetPrematchLeagueMatchesBatch(ctx context.Context, leagueIDs []int) ([]entity.PrematchLeagueData, error) {
	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	payload := map[string]interface{}{"LigaID": leagueIDs, "filter": "0", "parId": 0}
	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, getLeagueMatchesURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")
	req.Header.Set("Referer", "https://sansabet.com/OblozuvanjeService.aspx")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(resp.Body)
	if err != nil {
		return nil, err
	}

	var leagues []entity.PrematchLeagueData
	if err := json.NewDecoder(&bodyBuffer).Decode(&leagues); err != nil {
		return nil, err
	}

	return leagues, nil
}

// GetPrematchFullOdds fetches full odds for a specific match (optional, for more markets)
func (api *SansabetAPI) GetPrematchFullOdds(ctx context.Context, pairID int64) ([]entity.PrematchTipovi, error) {
	if err := api.limiter.Wait(ctx); err != nil {
		return nil, err
	}

	payload := map[string]int64{"PairId": pairID}
	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, getFullOddsURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")
	req.Header.Set("Referer", "https://sansabet.com/OblozuvanjeService.aspx")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var bodyBuffer bytes.Buffer
	_, err = bodyBuffer.ReadFrom(resp.Body)
	if err != nil {
		return nil, err
	}

	var tipovi []entity.PrematchTipovi
	if err := json.NewDecoder(&bodyBuffer).Decode(&tipovi); err != nil {
		return nil, err
	}

	return tipovi, nil
}
