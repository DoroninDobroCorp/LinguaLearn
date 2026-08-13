package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestLogBetAcceptRejectsRetiredTestFlag(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	h := &Handler{}
	router.POST("/log-bet-accept", h.LogBetAccept)

	req := httptest.NewRequest(http.MethodPost, "/log-bet-accept", strings.NewReader(validAcceptBetPayload(true)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusGone {
		t.Fatalf("expected %d, got %d: %s", http.StatusGone, w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), retiredTestBetFlowError) {
		t.Fatalf("expected response to contain %q, got %s", retiredTestBetFlowError, w.Body.String())
	}
}

func TestLogTestBetAcceptRejectsRetiredEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	h := &Handler{}
	router.POST("/log-test-bet-accept", h.LogTestBetAccept)

	req := httptest.NewRequest(http.MethodPost, "/log-test-bet-accept", strings.NewReader(validAcceptBetPayload(true)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusGone {
		t.Fatalf("expected %d, got %d: %s", http.StatusGone, w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), retiredTestBetFlowError) {
		t.Fatalf("expected response to contain %q, got %s", retiredTestBetFlowError, w.Body.String())
	}
}

func validAcceptBetPayload(isTest bool) string {
	return fmt.Sprintf(`{
		"pair": {
			"first": {
				"bookmaker": "Pinnacle",
				"leagueName": "Test League",
				"homeScore": 0,
				"awayScore": 0,
				"homeName": "Home",
				"awayName": "Away",
				"matchId": "match-1",
				"createdAt": "2026-04-28T00:00:00Z"
			},
			"second": {
				"bookmaker": "Sansabet",
				"leagueName": "Test League",
				"homeScore": 0,
				"awayScore": 0,
				"homeName": "Home",
				"awayName": "Away",
				"matchId": "match-2",
				"createdAt": "2026-04-28T00:00:00Z"
			},
			"outcome": {
				"outcome": "T> 2.5",
				"roi": 3.5,
				"margin": 1.02,
				"score1": {"value": 2.0},
				"score2": {"value": 1.9},
				"marketType": 0
			},
			"isLive": true,
			"sportName": "Soccer",
			"createdAt": "2026-04-28T00:00:00Z"
		},
		"bet": {
			"calcBet": {
				"originalAmount": 10,
				"adjustedAmount": 10,
				"percentage": 100
			},
			"usersCount": 1
		},
		"sum": 10,
		"coef": 2.0,
		"time": "10:30",
		"userId": 1,
		"strategy": "autobetting",
		"isTest": %t
	}`, isTest)
}