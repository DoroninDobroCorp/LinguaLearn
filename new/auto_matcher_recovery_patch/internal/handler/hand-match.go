package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GetAllLeaguesByBookmaker(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	leagues, err := h.handMatchService.GetAllLeaguesByBookmaker(c, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(leagues) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": leagues,
	})
}

func (h *Handler) GetUnMatchedLeagues(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	leagues, err := h.handMatchService.GetUnMachedLeagues(c, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(leagues) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": leagues,
	})
}

func (h *Handler) GetMatchedLeagues(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	pairs, err := h.handMatchService.GetMatchedLeagues(c, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(pairs) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": pairs,
	})
}

func (h *Handler) GetUnMatchedTeamsByLeagues(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	pairs, err := h.handMatchService.GetUnMatchedTeamsByLeagues(c, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(pairs) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": pairs,
	})
}

func (h *Handler) GetMatchedTeamsByLeagues(c *gin.Context) {
	sportName := c.Query("sportName")
	if sportName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstBookmakerName := c.Query("firstBookmakerName")
	if firstBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondBookmakerName := c.Query("secondBookmakerName")
	if secondBookmakerName == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if firstBookmakerName == secondBookmakerName {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	pairs, err := h.handMatchService.GetMatchedTeamsByLeagues(c, sportName, firstBookmakerName, secondBookmakerName)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(pairs) == 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"data": pairs,
	})
}

func (h *Handler) CreateNewTeamPair(c *gin.Context) {
	strFirstTeamID := c.Query("firstTeamID")
	if strFirstTeamID == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstTeamID, err := strconv.ParseInt(strFirstTeamID, 10, 64)
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	strSecondTeamID := c.Query("secondTeamID")
	if strSecondTeamID == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondTeamID, err := strconv.ParseInt(strSecondTeamID, 10, 64)
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	if firstTeamID == secondTeamID {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	success, err := h.handMatchService.CreateTeamsPair(c, firstTeamID, secondTeamID)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if !success {
		c.AbortWithStatus(http.StatusConflict)
		return
	}

	c.Status(http.StatusOK)
}

func (h *Handler) CreateNewLeaguePair(c *gin.Context) {
	strFirstLeagueID := c.Query("firstLeagueID")
	if strFirstLeagueID == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	firstLeagueID, err := strconv.ParseInt(strFirstLeagueID, 10, 64)
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	strSecondLeagueID := c.Query("secondLeagueID")
	if strSecondLeagueID == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	secondLeagueID, err := strconv.ParseInt(strSecondLeagueID, 10, 64)
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	if firstLeagueID == secondLeagueID {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	success, err := h.handMatchService.CreateLeaguesPair(c, firstLeagueID, secondLeagueID)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if !success {
		c.AbortWithStatus(http.StatusConflict)
		return
	}

	c.Status(http.StatusOK)
}

// GetMappingStatusBatch возвращает статус маппинга для нескольких матчей
func (h *Handler) GetMappingStatusBatch(c *gin.Context) {
	var requests []struct {
		Bookmaker string `json:"bookmaker"`
		Sport     string `json:"sport"`
		League    string `json:"league"`
		HomeTeam  string `json:"homeTeam"`
		AwayTeam  string `json:"awayTeam"`
		MatchKey  string `json:"matchKey"`
	}

	if err := c.ShouldBindJSON(&requests); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results := make(map[string]interface{})
	for _, req := range requests {
		status, err := h.handMatchService.GetMappingStatus(c, req.Bookmaker, req.Sport, req.League, req.HomeTeam, req.AwayTeam)
		if err != nil {
			results[req.MatchKey] = map[string]interface{}{"error": err.Error()}
		} else {
			results[req.MatchKey] = status
		}
	}

	c.JSON(http.StatusOK, results)
}

// GetMappingStatus возвращает статус маппинга лиги и команд с Pinnacle
func (h *Handler) GetMappingStatus(c *gin.Context) {
	bookmaker := c.Query("bookmaker")
	if bookmaker == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bookmaker is required"})
		return
	}
	sport := c.Query("sport")
	if sport == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sport is required"})
		return
	}
	league := c.Query("league")
	if league == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "league is required"})
		return
	}
	homeTeam := c.Query("homeTeam")
	if homeTeam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "homeTeam is required"})
		return
	}
	awayTeam := c.Query("awayTeam")
	if awayTeam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "awayTeam is required"})
		return
	}

	status, err := h.handMatchService.GetMappingStatus(c, bookmaker, sport, league, homeTeam, awayTeam)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}
